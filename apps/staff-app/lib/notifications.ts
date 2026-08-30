import { Platform } from 'react-native'

export const URGENT_CHANNEL_ID = 'urgent_guest_requests'

// Safe helper to get Notifications module only on native platforms
function getNotificationsModule() {
  if (Platform.OS === 'web') return null
  try {
    return require('expo-notifications')
  } catch {
    return null
  }
}

// Safe helper to get Audio module
function getAudioModule() {
  try {
    return require('expo-av').Audio
  } catch {
    return null
  }
}

// Configure global notification presentation when app is in the foreground (Native only)
if (Platform.OS !== 'web') {
  const Notifications = getNotificationsModule()
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      })
    } catch {
      // ignore handler setup error on web or unsupported environments
    }
  }
}

/**
 * Configure Android Notification Channel with ALARM audio stream & MAX priority
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return

  const Notifications = getNotificationsModule()
  if (!Notifications || typeof Notifications.setNotificationChannelAsync !== 'function') return

  try {
    await Notifications.setNotificationChannelAsync(URGENT_CHANNEL_ID, {
      name: '🚨 Urgent Guest Requests',
      description: 'High-priority alerts for incoming room service, calls, and bookings',
      importance: Notifications.AndroidImportance?.MAX ?? 5,
      vibrationPattern: [0, 500, 200, 500, 200, 500, 200, 800],
      lightColor: '#EF4444',
      enableLights: true,
      enableVibrate: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage?.ALARM ?? 4, // Uses Alarm stream to bypass mute/DND
        contentType: Notifications.AndroidAudioContentType?.SONIFICATION ?? 4,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
      bypassDnd: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
    })
  } catch (err) {
    console.warn('[Notifications] setupNotificationChannels failed:', err)
  }
}

/**
 * Request notification permissions and register for push notifications
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') {
          return `web_pwa_${Date.now()}`
        }
      } catch (err) {
        console.warn('[Notifications] Web notification permission request error:', err)
      }
    }
    return null
  }

  const Notifications = getNotificationsModule()
  if (!Notifications || typeof Notifications.getPermissionsAsync !== 'function') return null

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        android: {},
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      })
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission not granted for push notifications')
      return null
    }

    // Configure Audio Mode for background & silent bypass on mobile
    const Audio = getAudioModule()
    if (Audio && typeof Audio.setAudioModeAsync === 'function') {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldRouteThroughEarpiece: false,
        })
      } catch {
        // Ignore audio mode configuration failure on unsupported devices
      }
    }

    if (typeof Notifications.getExpoPushTokenAsync === 'function') {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'c443e903-bcbf-4c9a-9167-bdc0f3195d1f',
        })
        return tokenData?.data || null
      } catch (tokenErr) {
        console.warn('[Notifications] getExpoPushTokenAsync warning:', tokenErr)
        return `native_${Platform.OS}_${Date.now()}`
      }
    }
    return null
  } catch (err) {
    console.warn('[Notifications] Failed to obtain push token:', err)
    return null
  }
}

/**
 * Trigger an aggressive high-priority heads-up alert notification (Native Android/iOS & Web PWA)
 */
export async function triggerAggressiveAlert(params: {
  title: string
  body: string
  requestId: string
  roomNumber: string
  requestType: string
  payloadData?: Record<string, unknown>
}): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notifTitle = `🚨 ${params.title} — ${params.roomNumber}`
        const notifOptions: NotificationOptions = {
          body: params.body,
          icon: '/assets/icon.png',
          badge: '/favicon.png',
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
        console.warn('[Notifications] Web triggerAggressiveAlert error:', err)
      }
    }
    return
  }

  const Notifications = getNotificationsModule()
  if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') return

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚨 ${params.title} — ${params.roomNumber}`,
        body: params.body,
        priority: Notifications.AndroidNotificationPriority?.MAX ?? 2,
        vibrate: [0, 500, 200, 500, 200, 500, 200, 800],
        data: {
          requestId: params.requestId,
          roomNumber: params.roomNumber,
          requestType: params.requestType,
          ...params.payloadData,
        },
        categoryIdentifier: 'URGENT_REQUEST',
      },
      trigger: {
        channelId: URGENT_CHANNEL_ID,
      } as any,
    })
  } catch (err) {
    console.warn('[Notifications] triggerAggressiveAlert failed:', err)
  }
}

/**
 * Safe subscription for notification tap responses
 */
export function addNotificationResponseListener(callback: (data: any) => void): { remove: () => void } {
  if (Platform.OS === 'web') return { remove: () => {} }

  const Notifications = getNotificationsModule()
  if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
    return { remove: () => {} }
  }

  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data
      callback(data)
    })
    return {
      remove: () => {
        try {
          if (sub && typeof sub.remove === 'function') {
            sub.remove()
          } else if (typeof Notifications.removeNotificationSubscription === 'function') {
            Notifications.removeNotificationSubscription(sub)
          }
        } catch {
          // ignore cleanup error
        }
      },
    }
  } catch {
    return { remove: () => {} }
  }
}

