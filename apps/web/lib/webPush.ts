import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BDZiJJ2o83qDdtVUQaVEEekgX3KVABFYZZzCRM76dtNgyEp3Sxe4TT9cBmcNcDTQ9RUIcQUjD0tu9pCoWkH4Xkg'
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Sd_eLFno7SUy-ViectiaP-0GAowqSXv8H9CoQcR9w5k'
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@kekehyuhotel.com'

// Configure web-push with VAPID details
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} catch (e) {
  console.warn('[WebPush] Failed to set VAPID details:', e)
}

export interface WebPushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  requestId?: string
  roomNumber?: string
  requestType?: string
  [key: string]: any
}

/**
 * Dispatch a high-priority push notification (both Web Push & Expo / FCM) to all active staff devices for a hotel.
 * Works across:
 *  - Android Staff APK (via Expo / FCM High Priority push with wake lock & alarm channel)
 *  - Browser PWA (via WebPush VAPID)
 */
export async function sendWebPushToHotelStaff(
  hotelId: string,
  payload: WebPushPayload
): Promise<{ sent: number; failed: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsjnlawhdgfilcfejbji.supabase.co'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const defaultHotelId = '00000000-0000-0000-0000-000000000001'
  const targetHotelId = hotelId || defaultHotelId

  let sent = 0
  let failed = 0

  const notificationTitle = payload.title || `🚨 New ${payload.requestType ? payload.requestType.replace(/_/g, ' ') : 'Guest Request'}`
  const notificationBody = payload.body || (payload.roomNumber ? `Room ${payload.roomNumber} submitted a new request.` : 'A guest request requires staff attention.')

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DISPATCH TO EXPO / FCM MOBILE DEVICES (Android Staff App)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    let staffQuery = supabase
      .from('staff_users')
      .select('id, push_token')
      .eq('is_active', true)
      .not('push_token', 'is', null)

    if (targetHotelId !== defaultHotelId) {
      staffQuery = staffQuery.or(`hotel_id.eq.${targetHotelId},hotel_id.eq.${defaultHotelId}`)
    }

    const { data: staffData, error: staffErr } = await staffQuery

    if (!staffErr && staffData && staffData.length > 0) {
      const expoTokens = staffData
        .map((s) => s.push_token)
        .filter((token): token is string => Boolean(token && !token.startsWith('web_pwa_') && !token.startsWith('expo_local_') && token.length > 10))

      if (expoTokens.length > 0) {
        console.log(`[Push] Dispatching Expo/FCM push to ${expoTokens.length} staff device(s)...`)

        const expoMessages = expoTokens.map((token) => ({
          to: token,
          sound: 'alarm',
          title: notificationTitle,
          body: notificationBody,
          data: {
            requestId: payload.requestId,
            roomNumber: payload.roomNumber,
            requestType: payload.requestType,
            url: payload.url || '/',
          },
          priority: 'high',
          channelId: 'hotel_staff_alarm',
          categoryId: 'URGENT_REQUEST',
          ttl: 86400,
          _displayInForeground: true,
        }))

        // Chunk messages to Expo Push API
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(expoMessages),
        })

        if (response.ok) {
          const resJson = await response.json()
          const receipts = resJson.data || []
          receipts.forEach((r: any) => {
            if (r.status === 'ok') sent++
            else failed++
          })
          console.log(`[Push] Expo/FCM push result: ${sent} sent, ${failed} failed`)
        } else {
          console.warn('[Push] Expo Push API responded with error:', response.status, await response.text())
          failed += expoTokens.length
        }
      }
    }
  } catch (expoErr) {
    console.error('[Push] Error dispatching Expo/FCM push:', expoErr)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DISPATCH TO WEB PWA SUBSCRIBERS (Browser WebPush)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    let subscriptionsQuery = supabase
      .from('staff_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('is_active', true)

    if (targetHotelId !== defaultHotelId) {
      subscriptionsQuery = subscriptionsQuery.or(`hotel_id.eq.${targetHotelId},hotel_id.eq.${defaultHotelId}`)
    }

    const { data: subscriptions, error } = await subscriptionsQuery

    if (!error && subscriptions && subscriptions.length > 0) {
      const notificationString = JSON.stringify({
        title: notificationTitle,
        body: notificationBody,
        icon: payload.icon || '/assets/icon.png',
        badge: payload.badge || '/favicon.png',
        tag: payload.tag || `hotel-req-${Date.now()}`,
        url: payload.url || '/',
        requestId: payload.requestId,
        roomNumber: payload.roomNumber,
        requestType: payload.requestType,
        timestamp: Date.now(),
      })

      const expiredIds: string[] = []

      await Promise.allSettled(
        subscriptions.map(async (sub) => {
          if (!sub.endpoint || !sub.p256dh || !sub.auth) return

          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          }

          try {
            await webpush.sendNotification(pushSubscription, notificationString, {
              urgency: 'high', // Wakes Android phone up from sleep / doze mode
              TTL: 60 * 60 * 24, // 24 hours
            })
            sent++
          } catch (err: any) {
            failed++
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              expiredIds.push(sub.id)
            } else {
              console.warn('[WebPush] Error sending push to endpoint:', err?.message || err)
            }
          }
        })
      )

      if (expiredIds.length > 0) {
        try {
          await supabase
            .from('staff_push_subscriptions')
            .update({ is_active: false })
            .in('id', expiredIds)
        } catch {
          // non-fatal cleanup
        }
      }
    }
  } catch (webErr) {
    console.error('[WebPush] Error sending WebPush:', webErr)
  }

  return { sent, failed }
}
