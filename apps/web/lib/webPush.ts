import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BDZiJJ2o83qDdtVUQaVEEekgX3KVABFYZZzCRM76dtNgyEp3Sxe4TT9cBmcNcDTQ9RUIcQUjD0tu9pCoWkH4Xkg'
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Sd_eLFno7SUy-ViectiaP-0GAowqSXv8H9CoQcR9w5k'
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@kekehyuhotel.com'

// Configure web-push with VAPID details
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

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
 * Dispatch a high-priority Web Push notification to all active staff PWA devices for a hotel
 */
export async function sendWebPushToHotelStaff(
  hotelId: string,
  payload: WebPushPayload
): Promise<{ sent: number; failed: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsjnlawhdgfilcfejbji.supabase.co'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Fetch active push subscriptions for the hotel
  const { data: subscriptions, error } = await supabase
    .from('staff_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const notificationString = JSON.stringify({
    title: payload.title || '🚨 New Guest Request',
    body: payload.body || 'A guest request requires staff attention.',
    icon: payload.icon || '/assets/icon.png',
    badge: payload.badge || '/favicon.png',
    tag: payload.tag || `hotel-req-${Date.now()}`,
    url: payload.url || '/',
    requestId: payload.requestId,
    roomNumber: payload.roomNumber,
    requestType: payload.requestType,
    timestamp: Date.now(),
  })

  let sent = 0
  let failed = 0
  const expiredIds: string[] = []

  // 2. Dispatch in parallel to all staff endpoints
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
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
        // If status is 404 (Not Found) or 410 (Gone), subscription has expired or was revoked
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredIds.push(sub.id)
        } else {
          console.warn('[WebPush] Error sending push to endpoint:', err?.message || err)
        }
      }
    })
  )

  // 3. Mark expired/unregistered endpoints as inactive
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

  return { sent, failed }
}
