import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Audio } from 'expo-av'
import { cancelAllAlarms } from '../lib/notifications'

// ─── Request Type Config ───────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  CALL_REQUEST: { label: 'Front Desk Call',     icon: '📞', color: '#fbbf24' },
  SPA_BOOKING:  { label: 'Spa Appointment',     icon: '💆', color: '#a78bfa' },
  FOOD_ORDER:   { label: 'Dining Order',         icon: '🍽️', color: '#34d399' },
  TASK:         { label: 'Housekeeping Request', icon: '🧹', color: '#60a5fa' },
}

export interface IncomingRequest {
  id: string
  request_type: string
  payload: Record<string, unknown>
  created_at: string
}

interface IncomingRequestAlertProps {
  request: IncomingRequest | null
  onDismiss: () => void
}

// Aggressive vibration: 4 long buzzes with short gaps
const VIBE_PATTERN = [0, 400, 100, 400, 100, 400, 100, 600]

export default function IncomingRequestAlert({ request, onDismiss }: IncomingRequestAlertProps) {
  const pulseAnim  = useRef(new Animated.Value(1)).current
  const flashAnim  = useRef(new Animated.Value(0)).current
  const slideAnim  = useRef(new Animated.Value(-60)).current
  const [countdown, setCountdown] = useState(60)
  const soundRef = useRef<Audio.Sound | null>(null)

  // ── Entrance animation + pulse + flash bg ─────────────────────────────────
  useEffect(() => {
    if (!request) return

    // Slide-in
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start()

    // Pulse scale
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 350, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 350, useNativeDriver: true }),
      ])
    )
    pulseLoop.start()

    // Background flash
    const flashLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    )
    flashLoop.start()

    // Aggressive haptics pattern
    Vibration.vibrate(VIBE_PATTERN, false)
    // Haptics is not available on web builds; guard the call to avoid runtime errors
    try {
      if (Platform.OS !== 'web' && Haptics && typeof Haptics.notificationAsync === 'function') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      }
    } catch {
      // ignore haptics failures on unsupported platforms
    }

    // Play built-in system alert sound (works without native build in Expo Go)
    ;(async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
        const { sound } = await Audio.Sound.createAsync(
          // Use Expo's built-in notification sound URL
          { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        )
        soundRef.current = sound
      } catch {
        // Fallback: just vibrate — no crash
      }
    })()

    // Auto-dismiss countdown
    const tick = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(tick); handleDismiss(); return 0 }
        return prev - 1
      })
    }, 1000)

    return () => {
      pulseLoop.stop()
      flashLoop.stop()
      clearInterval(tick)
      Vibration.cancel()
      soundRef.current?.stopAsync().catch(() => {})
      soundRef.current?.unloadAsync().catch(() => {})
      soundRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const handleDismiss = () => {
    Vibration.cancel()
    soundRef.current?.stopAsync().catch(() => {})
    soundRef.current?.unloadAsync().catch(() => {})
    soundRef.current = null
    setCountdown(60)
    // Cancel the Notifee Full-Screen Intent alarm notification + stop looping alarm sound
    cancelAllAlarms().catch(() => {})
    Animated.timing(slideAnim, { toValue: -60, duration: 200, useNativeDriver: true }).start(onDismiss)
  }

  if (!request) return null

  const cfg = TYPE_CONFIG[request.request_type] ?? { label: 'Service Request', icon: '🛎️', color: '#f97316' }
  const roomsVal = ((request as any).rooms && typeof (request as any).rooms === 'object')
    ? (Array.isArray((request as any).rooms) ? (request as any).rooms[0]?.room_number : (request as any).rooms.room_number)
    : undefined
  // Prefer rooms relation first (RequestHistory behavior), then payload
  const payloadRoom =
    (request.payload?.room_number as any) ??
    (request.payload?.room as any) ??
    (request.payload?.room_no as any) ??
    (request.payload?.roomNumber as any) ??
    ''

  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim())

  let rawRoom = ''
  if (roomsVal && roomsVal !== '—' && !isUuid(roomsVal)) {
    rawRoom = String(roomsVal).trim()
  } else if (payloadRoom && payloadRoom !== '—' && !isUuid(payloadRoom)) {
    rawRoom = String(payloadRoom).trim()
  }

  const roomNo = rawRoom
    ? (rawRoom.startsWith('Room') ? rawRoom : `Room ${rawRoom}`)
    : 'Room —'

  const bgFlash = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(220, 38, 38, 0.0)', 'rgba(220, 38, 38, 0.18)'],
  })

  return (
    <Modal
      visible={!!request}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/* Full-screen flashing backdrop */}
      <Animated.View style={[styles.backdrop, { backgroundColor: bgFlash }]} pointerEvents="box-none">

        {/* Alert Card */}
        <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }, { scale: pulseAnim }] }]}>

          {/* Top accent stripe */}
          <View style={[styles.stripe, { backgroundColor: cfg.color }]} />

          {/* Header */}
          <View style={styles.alertHeader}>
            <View style={[styles.alertIconCircle, { backgroundColor: cfg.color + '22', borderColor: cfg.color }]}>
              <Text style={styles.alertIcon}>{cfg.icon}</Text>
            </View>
            <View style={styles.alertTitleBlock}>
              <Text style={styles.incomingLabel}>⚠️  INCOMING REQUEST</Text>
              <Text style={[styles.alertType, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Room Number */}
          <View style={[styles.roomBanner, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '12' }]}>
            <Text style={styles.roomBannerLabel}>Room</Text>
            <Text style={[styles.roomBannerNum, { color: cfg.color }]}>{roomNo}</Text>
          </View>

          {/* Details */}
          {!!request.payload?.note && (
            <Text style={styles.noteText}>"{String(request.payload.note)}"</Text>
          )}
          {!!request.payload?.guest_phone && (
            <Text style={styles.phoneText}>📱 {String(request.payload.guest_phone)}</Text>
          )}
          {request.request_type === 'SPA_BOOKING' && !!request.payload?.service_name && (
            <Text style={styles.detailText}>{String(request.payload.service_name)} @ {String(request.payload.slot_time ?? 'TBD')}</Text>
          )}
          {request.request_type === 'FOOD_ORDER' && Array.isArray(request.payload?.items) && (
            <Text style={styles.detailText} numberOfLines={2}>
              {(request.payload.items as Array<{ name: string; quantity: number }>)
                .map(i => `${i.quantity}× ${i.name}`).join(', ')}
            </Text>
          )}

          <Text style={styles.timeText}>
            Received at {new Date(request.created_at).toLocaleTimeString()}
          </Text>

          {/* Countdown bar */}
          <View style={styles.countdownRow}>
            <View style={styles.countdownBarBg}>
              <Animated.View style={[styles.countdownBarFill, { width: `${(countdown / 60) * 100}%` as any, backgroundColor: cfg.color }]} />
            </View>
            <Text style={styles.countdownText}>Auto-dismiss in {countdown}s</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnAck, { borderColor: cfg.color, backgroundColor: cfg.color + '22' }]}
              onPress={handleDismiss}
            >
              <Text style={[styles.btnAckText, { color: cfg.color }]}>✓ ACKNOWLEDGED</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  stripe: {
    height: 6,
    width: '100%',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  alertIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertIcon: {
    fontSize: 28,
  },
  alertTitleBlock: {
    flex: 1,
    gap: 4,
  },
  incomingLabel: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  alertType: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  roomBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomBannerLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  roomBannerNum: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  noteText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontStyle: 'italic',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  phoneText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 16,
    marginBottom: 6,
  },
  detailText: {
    color: '#94a3b8',
    fontSize: 13,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  timeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  countdownRow: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 6,
  },
  countdownBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  countdownBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  countdownText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingTop: 0,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  btnAck: {},
  btnAckText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
})
