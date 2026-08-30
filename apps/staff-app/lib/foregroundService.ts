/**
 * foregroundService.ts
 *
 * Android Foreground Service powered by Notifee.
 *
 * Why this is needed:
 *   Android aggressively kills background processes when the screen turns off.
 *   A Foreground Service is the ONLY way to keep JavaScript running (and the
 *   Supabase WebSocket alive) while the phone is locked.
 *
 * How it works (like Messenger/WhatsApp incoming calls):
 *   1. Staff logs in → startStaffMonitoringService(hotelId) is called
 *   2. A persistent "🏨 Monitoring requests..." notification appears in the shade
 *      → Android treats this process as foreground, does NOT kill it
 *   3. Inside the service task, a fresh Supabase realtime channel subscribes
 *      to INSERT events on the requests table
 *   4. When a new PENDING request arrives:
 *      → notifee.displayNotification() with fullScreenAction fires
 *      → Android wakes the screen (WakeLock), bypasses keyguard
 *      → Full-Screen Intent UI appears on the lock screen
 *      → Alarm sound loops (USAGE_ALARM stream — bypasses Silent + DND)
 *   5. Staff taps ACKNOWLEDGE → cancelAllAlarms() → alarm stops
 *   6. Staff logs out → stopStaffMonitoringService() → service stops
 *
 * Registration:
 *   notifee.registerForegroundService() MUST be called at module level
 *   in index.ts BEFORE registerRootComponent(). This file just defines the
 *   logic; index.ts does the actual registration via initForegroundService().
 */

import { Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'

// ─── Constants ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bsjnlawhdgfilcfejbji.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzam5sYXdoZGdmaWxjZmVqYmppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI2OTEzOSwiZXhwIjoyMTAxODQ1MTM5fQ.JDtcNvuonuK_6sSL4evhWjoXdqUatQy4Oii4rBTMZF8'

export const MONITOR_CHANNEL_ID    = 'hotel_staff_monitor'
export const ALARM_CHANNEL_ID      = 'hotel_staff_alarm'
export const MONITOR_NOTIF_ID      = 'staff-monitoring-service'

// ─── Safe Notifee helper ───────────────────────────────────────────────────────
function getNotifee() {
  if (Platform.OS === 'web') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@notifee/react-native')
    const n = mod.default ?? mod
    if (!n || typeof n.displayNotification !== 'function') return null
    return n
  } catch {
    return null
  }
}

function getNotifeeEnums() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@notifee/react-native')
  } catch {
    return {}
  }
}

// ─── Channel Setup ─────────────────────────────────────────────────────────────

/**
 * Create both the MONITOR (low, persistent) and ALARM (high, full-screen) channels.
 */
export async function createNotifeeChannels(): Promise<void> {
  const notifee = getNotifee()
  if (!notifee || Platform.OS !== 'android') return

  const { AndroidImportance, AndroidAudioUsage, AndroidAudioContentType } = getNotifeeEnums()

  try {
    // LOW importance: the persistent "monitoring" status notification
    await notifee.createChannel({
      id: MONITOR_CHANNEL_ID,
      name: '🏨 Staff Monitoring',
      description: 'Persistent background monitoring notification',
      importance: AndroidImportance?.LOW ?? 2,
      vibration: false,
      sound: '',
    })

    // HIGH importance: the Full-Screen Intent alarm notification
    await notifee.createChannel({
      id: ALARM_CHANNEL_ID,
      name: '🚨 Hotel Staff Alarm',
      description: 'Full-screen alarm for incoming guest requests',
      importance: AndroidImportance?.HIGH ?? 4,
      sound: 'alarm',
      audioAttributes: {
        usage: AndroidAudioUsage?.ALARM ?? 4,           // bypasses Silent + DND
        contentType: AndroidAudioContentType?.SONIFICATION ?? 4,
      },
      vibration: true,
      vibrationPattern: [0, 400, 100, 400, 100, 400, 100, 600],
      lights: true,
      lightColor: '#EF4444',
      bypassDnd: true,
    })
    console.log('[ForegroundService] Notifee channels created ✅')
  } catch (err) {
    console.warn('[ForegroundService] createNotifeeChannels failed:', err)
  }
}

// ─── Foreground Service Task Registration ──────────────────────────────────────

let _taskRegistered = false

/**
 * Register the Notifee foreground service task handler.
 * MUST be called at module level in index.ts before registerRootComponent().
 *
 * The task function receives the notification that started the service,
 * sets up the Supabase realtime subscription, and returns a Promise that
 * NEVER resolves — keeping the service alive until stopStaffMonitoringService() is called.
 */
export function initForegroundService(): void {
  if (Platform.OS !== 'android') return
  if (_taskRegistered) return
  _taskRegistered = true

  const notifee = getNotifee()
  if (!notifee || typeof notifee.registerForegroundService !== 'function') {
    console.warn('[ForegroundService] Notifee not available — foreground service disabled')
    return
  }

  notifee.registerForegroundService((notification: any) => {
    // Return a Promise that NEVER resolves to keep the service alive.
    // Android will keep this JS context running as long as we don't resolve/reject.
    return new Promise<void>(async () => {
      console.log('[ForegroundService] 🟢 Service started, subscribing to Supabase realtime...')

      const hotelId = notification?.data?.hotelId ?? '00000000-0000-0000-0000-000000000001'

      // Create a dedicated Supabase client for the service context
      const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })

      const handledIds = new Set<string>()

      const channel = serviceSupabase
        .channel('foreground-service-requests')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'requests',
            filter: `hotel_id=eq.${hotelId}`,
          },
          async (payload: any) => {
            const req = payload.new
            if (!req?.id) return
            if (handledIds.has(req.id)) return
            const isAlert = req.status === 'PENDING' || req.status === 'PENDING_ON_CALL'
            if (!isAlert) return

            handledIds.add(req.id)
            console.log('[ForegroundService] 🚨 New request detected:', req.id, req.request_type)

            await _fireFullScreenAlarm(req)
          }
        )
        .subscribe((status: string) => {
          console.log('[ForegroundService] Supabase realtime status:', status)
        })

      // Clean up handler for when the service is stopped
      const { EventType } = getNotifeeEnums()
      notifee.onForegroundEvent?.(({ type }: any) => {
        // EventType.DISMISSED = 3  means the persistent notification was dismissed
        // (user can't dismiss ongoing, but handle it anyway)
        if (type === (EventType?.DISMISSED ?? 3)) {
          serviceSupabase.removeChannel(channel)
        }
      })
    })
  })

  console.log('[ForegroundService] registerForegroundService registered ✅')
}

// ─── Fire the Full-Screen Intent alarm ─────────────────────────────────────────

async function _fireFullScreenAlarm(req: any): Promise<void> {
  const notifee = getNotifee()
  if (!notifee) return

  const { AndroidImportance, AndroidCategory, AndroidVisibility } = getNotifeeEnums()

  const typeLabel = (req.request_type ?? 'REQUEST').replace(/_/g, ' ')

  try {
    await notifee.displayNotification({
      id: `alarm-${req.id}`,
      title: '<b>🚨 INCOMING GUEST REQUEST</b>',
      subtitle: typeLabel,
      body: `New ${typeLabel} requires immediate staff attention!`,
      data: {
        requestId: req.id,
        requestType: req.request_type ?? '',
        hotelId: req.hotel_id ?? '',
        fromForegroundService: 'true',
      },
      android: {
        channelId: ALARM_CHANNEL_ID,

        // ── THIS is what wakes the screen on a locked/sleeping device ──
        fullScreenAction: {
          id: 'default',
          launchActivity: 'default',        // opens MainActivity (your React Native app)
        },

        // Keep screen on for 60 seconds
        wakeLockTimeout: 60_000,

        // Looping alarm sound (res/raw/alarm.mp3, USAGE_ALARM stream)
        sound: 'alarm',
        loopSound: true,

        importance: AndroidImportance?.HIGH ?? 4,
        category: AndroidCategory?.CALL ?? 'call',
        visibility: AndroidVisibility?.PUBLIC ?? 1,  // visible on lockscreen

        // Vibration
        vibrationPattern: [0, 400, 100, 400, 100, 400, 100, 600],

        // Red light pulse
        lights: ['#EF4444', 500, 500] as any,

        // NOT ongoing so staff can swipe it away after acknowledging
        ongoing: false,
        autoCancel: false,

        // Action buttons on the notification
        actions: [
          {
            title: '✓ ACKNOWLEDGE',
            pressAction: {
              id: 'acknowledge',
              launchActivity: 'default',
            },
          },
        ],
      },
    })
    console.log('[ForegroundService] Full-Screen Intent fired for request:', req.id)
  } catch (err) {
    console.warn('[ForegroundService] _fireFullScreenAlarm failed:', err)
  }
}

// ─── Start / Stop the Service ───────────────────────────────────────────────────

/**
 * Start the staff monitoring foreground service.
 * Call this after successful login.
 * Shows a persistent "monitoring" notification → Android keeps the process alive.
 */
export async function startStaffMonitoringService(hotelId: string): Promise<void> {
  if (Platform.OS !== 'android') return

  const notifee = getNotifee()
  if (!notifee || typeof notifee.startForegroundService !== 'function') {
    console.warn('[ForegroundService] Notifee not available — cannot start foreground service')
    return
  }

  try {
    await notifee.startForegroundService({
      id: MONITOR_NOTIF_ID,
      title: '🏨 Hotel Staff — Active',
      body: 'Monitoring for incoming guest requests...',
      data: { hotelId },
      android: {
        channelId: MONITOR_CHANNEL_ID,
        ongoing: true,
        asForegroundService: true,
        color: '#0f172a',
        colorized: false,
        showTimestamp: false,
        smallIcon: 'ic_notification',
      },
    })
    console.log('[ForegroundService] Foreground service started ✅')
  } catch (err) {
    console.warn('[ForegroundService] startStaffMonitoringService failed:', err)
  }
}

/**
 * Stop the foreground service and its Supabase realtime subscription.
 * Call this on logout.
 */
export async function stopStaffMonitoringService(): Promise<void> {
  if (Platform.OS !== 'android') return

  const notifee = getNotifee()
  if (!notifee || typeof notifee.stopForegroundService !== 'function') return

  try {
    await notifee.stopForegroundService()
    console.log('[ForegroundService] Foreground service stopped ✅')
  } catch (err) {
    console.warn('[ForegroundService] stopStaffMonitoringService failed:', err)
  }
}
