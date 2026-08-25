import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { Audio } from 'expo-av'

export const URGENT_CHANNEL_ID = 'urgent_guest_requests'

// Configure global notification presentation when app is in the foreground (Native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  })
}

/**
 * Configure Android Notification Channel with ALARM audio stream & MAX priority
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return

  try {
    await Notifications.setNotificationChannelAsync(URGENT_CHANNEL_ID, {
      name: '🚨 Urgent Guest Requests',
      description: 'High-priority alerts for incoming room service, calls, and bookings',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500, 200, 800],
      lightColor: '#EF4444',
      enableLights: true,
      enableVibrate: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM, // Uses Alarm stream to bypass mute/DND
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
      bypassDnd: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
  } catch (err) {
    console.warn('[Notifications] setupNotificationChannels failed:', err)
  }
}

/**
 * Request notification permissions and register for push notifications
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null

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
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldRouteThroughEarpiece: false,
      })
    } catch {
      // Ignore audio mode configuration failure on unsupported devices
    }

    const tokenData = await Notifications.getExpoPushTokenAsync()
    return tokenData.data
  } catch (err) {
    console.warn('[Notifications] Failed to obtain push token:', err)
    return null
  }
}

/**
 * Trigger an aggressive high-priority heads-up alert notification (Native Android/iOS)
 */
export async function triggerAggressiveAlert(params: {
  title: string
  body: string
  requestId: string
  roomNumber: string
  requestType: string
  payloadData?: Record<string, unknown>
}): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚨 ${params.title} — ${params.roomNumber}`,
        body: params.body,
        priority: Notifications.AndroidNotificationPriority.MAX,
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
