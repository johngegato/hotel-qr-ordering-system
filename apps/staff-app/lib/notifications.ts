/**
 * notifications.ts
 *
 * Aggressive call-style notification system using Notifee.
 * Behaves like an incoming Messenger video call:
 *  - Wakes the device screen (WakeLock)
 *  - Plays a looping alarm sound that bypasses Silent + DND
 *  - Shows a Full-Screen Intent UI even when app is killed / screen locked
 *  - Stops everything immediately when staff acknowledges
 *
 * Library: @notifee/react-native (no Firebase required)
 */

import { Platform } from 'react-native'

// ─── Channel & Notification IDs ────────────────────────────────────────────────
export const ALARM_CHANNEL_ID    = 'hotel_staff_alarm'
export const ALARM_NOTIFICATION_ID = 'incoming_request_alarm'
/** Legacy channel kept for compatibility with old expo-notifications paths */
export const URGENT_CHANNEL_ID   = 'urgent_guest_requests'

// ─── Safe dynamic import helpers ───────────────────────────────────────────────

function getNotifee() {
  if (Platform.OS === 'web') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@notifee/react-native').default
  } catch {
    return null
  }
}

function getNotifeeAndroid() {
  if (Platform.OS === 'web') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@notifee/react-native')
    return mod
  } catch {
    return null
  }
}

// ─── Channel Setup ─────────────────────────────────────────────────────────────

/**
 * Create the ALARM-priority Notifee channel on Android.
 * Must be called once at app startup (idempotent — safe to re-call).
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'web') return

  const notifee = getNotifee()
  if (!notifee) return

  try {
    const { AndroidImportance, AndroidAudioUsage, AndroidAudioContentType } = getNotifeeAndroid() ?? {}

    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: ALARM_CHANNEL_ID,
        name: '🚨 Hotel Staff Alarm',
        description: 'Critical alarm for incoming guest requests — wakes screen, loops alarm sound',
        // IMPORTANCE_HIGH = heads-up (peek) notification + sound
        importance: AndroidImportance?.HIGH ?? 4,
        // Custom alarm sound bundled in android/app/src/main/res/raw/alarm.mp3
        sound: 'alarm',
        // Audio attributes: USAGE_ALARM bypasses Silent mode AND DND
        audioAttributes: {
          usage: AndroidAudioUsage?.ALARM ?? 4,
          contentType: AndroidAudioContentType?.SONIFICATION ?? 4,
        },
        vibration: true,
        vibrationPattern: [0, 400, 100, 400, 100, 400, 100, 600],
        lights: true,
        lightColor: '#EF4444',
        bypassDnd: true,
      })
    }
  } catch (err) {
    console.warn('[Notifications] setupNotificationChannels failed:', err)
  }
}

// ─── Permissions ───────────────────────────────────────────────────────────────

/**
 * Request notification + exact-alarm permissions and handle Android 14
 * USE_FULL_SCREEN_INTENT runtime permission.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Web fallback — use browser Notification API
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') return `web_pwa_${Date.now()}`
      } catch (err) {
        console.warn('[Notifications] Web notification permission request error:', err)
      }
    }
    return null
  }

  const notifee = getNotifee()
  if (!notifee) return null

  try {
    const settings = await notifee.requestPermission({
      criticalAlert: false,
      alert: true,
      badge: true,
      sound: true,
    })

    // AuthorizationStatus: 1 = AUTHORIZED, 2 = PROVISIONAL
    if (settings.authorizationStatus < 1) {
      console.warn('[Notifications] Notification permission denied')
      return null
    }

    // Android 14+: Request USE_FULL_SCREEN_INTENT if not already granted
    if (Platform.OS === 'android') {
      try {
        const hasFullScreen = await notifee.getNotificationSettings?.()
        // openFullScreenIntentSettings available in Notifee v9+
        if (
          hasFullScreen &&
          hasFullScreen.android?.fullScreenIntentEnabled === false &&
          typeof notifee.openFullScreenIntentSettings === 'function'
        ) {
          // Open settings non-blocking — don't await to avoid blocking app startup
          notifee.openFullScreenIntentSettings().catch(() => {})
        }
      } catch {
        // Ignore — not critical on older Android versions
      }
    }

    return `notifee_native_${Platform.OS}_${Date.now()}`
  } catch (err) {
    console.warn('[Notifications] registerForPushNotifications failed:', err)
    return null
  }
}

// ─── Alarm Trigger ─────────────────────────────────────────────────────────────

/**
 * Fire an aggressive alarm notification.
 * On Android: Full-Screen Intent + WakeLock + looping alarm sound.
 * On Web: browser Notification API fallback.
 */
export async function triggerAlarmNotification(params: {
  title: string
  body: string
  requestId: string
  roomNumber: string
  requestType: string
  payloadData?: Record<string, unknown>
}): Promise<void> {

  // ── Web fallback ──
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notifTitle = `🚨 ${params.title} — ${params.roomNumber}`
        const notifOptions: NotificationOptions = {
          body: params.body,
          icon: '/assets/icon.png',
          tag: `request-${params.requestId}`,
          data: {
            requestId: params.requestId,
            roomNumber: params.roomNumber,
            requestType: params.requestType,
            ...params.payloadData,
          },
          requireInteraction: true,
        }
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready
          await reg.showNotification(notifTitle, notifOptions)
        } else {
          new Notification(notifTitle, notifOptions)
        }
      } catch (err) {
        console.warn('[Notifications] Web triggerAlarmNotification error:', err)
      }
    }
    return
  }

  // ── Native (Android / iOS) via Notifee ──
  const notifee = getNotifee()
  if (!notifee) return

  try {
    const {
      AndroidImportance,
      AndroidCategory,
      AndroidVisibility,
    } = getNotifeeAndroid() ?? {}

    await notifee.displayNotification({
      id: ALARM_NOTIFICATION_ID,
      title: `<b>🚨 ${params.title}</b>`,
      subtitle: params.roomNumber,
      body: params.body,
      data: {
        requestId: params.requestId,
        roomNumber: params.roomNumber,
        requestType: params.requestType,
        ...(params.payloadData as Record<string, string> ?? {}),
      },
      android: {
        channelId: ALARM_CHANNEL_ID,

        // ── Full-Screen Intent (wakes screen even when locked / killed) ──
        fullScreenAction: {
          id: 'default',
          // Launches the app's MainActivity as the Full-Screen Intent
          launchActivity: 'default',
        },

        // ── WakeLock: keeps screen on for 60 seconds ──
        wakeLockTimeout: 60_000,

        // ── Alarm-class audio ──
        sound: 'alarm',
        loopSound: true,

        // ── Importance + appearance ──
        importance: AndroidImportance?.HIGH ?? 4,
        category: AndroidCategory?.CALL ?? 'call',
        visibility: AndroidVisibility?.PUBLIC ?? 1,

        // ── Persistent heads-up ──
        ongoing: false,
        autoCancel: false,
        showTimestamp: true,
        timestamp: Date.now(),

        // Aggressive vibration
        vibrationPattern: [0, 400, 100, 400, 100, 400, 100, 600],

        // Red light on supported devices
        lights: ['#EF4444', 500, 500] as any,

        // Large icon
        largeIcon: require('../assets/icon.png'),

        // ── Action Buttons ──
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
  } catch (err) {
    console.warn('[Notifications] triggerAlarmNotification failed:', err)
  }
}

/** @deprecated Use triggerAlarmNotification instead */
export const triggerAggressiveAlert = triggerAlarmNotification

// ─── Alarm Cancellation ────────────────────────────────────────────────────────

/**
 * Cancel a specific notification by ID (defaults to the alarm notification).
 */
export async function cancelAlarmNotification(id = ALARM_NOTIFICATION_ID): Promise<void> {
  if (Platform.OS === 'web') return
  const notifee = getNotifee()
  if (!notifee) return
  try {
    await notifee.cancelNotification(id)
  } catch (err) {
    console.warn('[Notifications] cancelAlarmNotification failed:', err)
  }
}

/**
 * Cancel ALL displayed notifications and stop looping alarm sound.
 * Call this when staff acknowledges a request.
 */
export async function cancelAllAlarms(): Promise<void> {
  if (Platform.OS === 'web') return
  const notifee = getNotifee()
  if (!notifee) return
  try {
    await notifee.cancelAllNotifications()
  } catch (err) {
    console.warn('[Notifications] cancelAllAlarms failed:', err)
  }
}

// ─── Event Listeners ───────────────────────────────────────────────────────────

/**
 * Register handler for foreground Notifee events (pressed actions, dismissed).
 * Returns an unsubscribe function.
 */
export function addNotificationResponseListener(
  callback: (data: any) => void
): { remove: () => void } {
  if (Platform.OS === 'web') return { remove: () => {} }

  const notifee = getNotifee()
  if (!notifee || typeof notifee.onForegroundEvent !== 'function') {
    return { remove: () => {} }
  }

  try {
    const { EventType } = getNotifeeAndroid() ?? {}

    const unsubscribe = notifee.onForegroundEvent(({ type, detail }: any) => {
      // EventType.PRESS = 1, EventType.ACTION_PRESS = 2
      const isPress = type === (EventType?.PRESS ?? 1) || type === (EventType?.ACTION_PRESS ?? 2)
      if (isPress && detail?.notification?.data) {
        callback(detail.notification.data)
      }
    })

    return { remove: typeof unsubscribe === 'function' ? unsubscribe : () => {} }
  } catch {
    return { remove: () => {} }
  }
}

/**
 * Register the Notifee BACKGROUND event handler.
 * Must be called at the module level in index.ts (before registerRootComponent).
 * Handles: notification taps when app is killed/backgrounded, action button presses.
 */
export function registerBackgroundNotificationHandler(): void {
  if (Platform.OS === 'web') return

  const notifee = getNotifee()
  if (!notifee || typeof notifee.onBackgroundEvent !== 'function') return

  try {
    const { EventType } = getNotifeeAndroid() ?? {}

    notifee.onBackgroundEvent(async ({ type, detail }: any) => {
      const isAck =
        type === (EventType?.ACTION_PRESS ?? 2) &&
        detail?.pressAction?.id === 'acknowledge'

      if (isAck) {
        // Cancel the alarm notification when staff acknowledges from background
        await cancelAllAlarms()
      }
    })
  } catch (err) {
    console.warn('[Notifications] registerBackgroundNotificationHandler failed:', err)
  }
}
