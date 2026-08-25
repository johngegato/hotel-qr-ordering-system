import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
  ScrollView,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Audio } from 'expo-av'

// ─── Type Definitions ──────────────────────────────────────────────────────────
export interface PendingRequestItem {
  id: string
  request_type: 'CALL_REQUEST' | 'SPA_BOOKING' | 'FOOD_ORDER' | 'TASK' | string
  status: string
  payload: Record<string, unknown>
  created_at: string
  room_id?: string | null
  rooms?: { room_number: string } | Array<{ room_number: string }> | null
}

interface PendingRequestsReminderModalProps {
  pendingRequests: PendingRequestItem[] | null
  onDismiss: () => void
  onAcknowledgeAll?: () => void
}

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  CALL_REQUEST: { label: 'Call Request', icon: '📞', color: '#fbbf24' },
  SPA_BOOKING: { label: 'Spa Booking', icon: '💆', color: '#a78bfa' },
  FOOD_ORDER: { label: 'Dining Order', icon: '🍽️', color: '#34d399' },
  TASK: { label: 'Room Task', icon: '🧹', color: '#60a5fa' },
}

const VIBE_PATTERN = [0, 300, 100, 300, 100, 400]

export default function PendingRequestsReminderModal({
  pendingRequests,
  onDismiss,
}: PendingRequestsReminderModalProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const flashAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(40)).current
  const soundRef = useRef<Audio.Sound | null>(null)
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({})

  const isVisible = Boolean(pendingRequests && pendingRequests.length > 0)

  // Calculate elapsed time helper
  const calculateElapsed = (createdIso: string) => {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(createdIso).getTime()) / 1000))
    const mins = Math.floor(diff / 60)
    const secs = diff % 60
    if (mins === 0) return `${secs}s ago`
    return `${mins}m ${secs}s ago`
  }

  // Live timer tick for waiting durations
  useEffect(() => {
    if (!isVisible || !pendingRequests) return

    const updateTimes = () => {
      const times: Record<string, string> = {}
      pendingRequests.forEach((req) => {
        times[req.id] = calculateElapsed(req.created_at)
      })
      setElapsedTimes(times)
    }

    updateTimes()
    const timer = setInterval(updateTimes, 1000)
    return () => clearInterval(timer)
  }, [isVisible, pendingRequests])

  // Sound, vibration, and entrance animation
  useEffect(() => {
    if (!isVisible) {
      soundRef.current?.stopAsync().catch(() => {})
      soundRef.current?.unloadAsync().catch(() => {})
      soundRef.current = null
      return
    }

    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start()

    // Pulsing card
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.98, duration: 400, useNativeDriver: true }),
      ])
    )
    pulseLoop.start()

    // Flash background
    const flashLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    )
    flashLoop.start()

    // Vibration
    Vibration.vibrate(VIBE_PATTERN, false)
    if (Platform.OS !== 'web' && Haptics && typeof Haptics.notificationAsync === 'function') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      } catch {
        // ignore
      }
    }

    // Play reminder sound
    ;(async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
          { shouldPlay: true, isLooping: false, volume: 0.85 }
        )
        soundRef.current = sound
      } catch {
        // Fallback gracefully
      }
    })()

    return () => {
      pulseLoop.stop()
      flashLoop.stop()
      Vibration.cancel()
      soundRef.current?.stopAsync().catch(() => {})
      soundRef.current?.unloadAsync().catch(() => {})
      soundRef.current = null
    }
  }, [isVisible])

  if (!isVisible || !pendingRequests) return null

  const totalCount = pendingRequests.length
  const callsCount = pendingRequests.filter((r) => r.request_type === 'CALL_REQUEST').length
  const spaCount = pendingRequests.filter((r) => r.request_type === 'SPA_BOOKING').length
  const foodCount = pendingRequests.filter((r) => r.request_type === 'FOOD_ORDER').length
  const taskCount = pendingRequests.filter((r) => r.request_type === 'TASK').length

  const bgFlash = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(239, 68, 68, 0.05)', 'rgba(239, 68, 68, 0.22)'],
  })

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.backdrop, { backgroundColor: bgFlash }]}>
        <Animated.View
          style={[
            styles.card,
            { transform: [{ translateY: slideAnim }, { scale: pulseAnim }] },
          ]}
        >
          {/* Top glowing amber bar */}
          <View style={styles.topAccentBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.bellIconCircle}>
              <Text style={styles.bellIcon}>🔔</Text>
            </View>
            <View style={styles.headerTextCol}>
              <View style={styles.badgeRow}>
                <Text style={styles.alertCategory}>5-MINUTE RECURRING REMINDER</Text>
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>ACTION REQUIRED</Text>
                </View>
              </View>
              <Text style={styles.alertTitle}>
                {totalCount} Unhandled {totalCount === 1 ? 'Request' : 'Requests'}
              </Text>
              <Text style={styles.alertSubtitle}>
                These requests are still in pending state and need staff attention.
              </Text>
            </View>
          </View>

          {/* Department Breakdown Chips */}
          <View style={styles.chipsContainer}>
            {callsCount > 0 && (
              <View style={[styles.chip, { backgroundColor: 'rgba(251, 191, 36, 0.15)', borderColor: '#fbbf24' }]}>
                <Text style={styles.chipText}>📞 {callsCount} Call{callsCount > 1 ? 's' : ''}</Text>
              </View>
            )}
            {spaCount > 0 && (
              <View style={[styles.chip, { backgroundColor: 'rgba(167, 139, 250, 0.15)', borderColor: '#a78bfa' }]}>
                <Text style={styles.chipText}>💆 {spaCount} Spa</Text>
              </View>
            )}
            {foodCount > 0 && (
              <View style={[styles.chip, { backgroundColor: 'rgba(52, 211, 153, 0.15)', borderColor: '#34d399' }]}>
                <Text style={styles.chipText}>🍽️ {foodCount} Dining</Text>
              </View>
            )}
            {taskCount > 0 && (
              <View style={[styles.chip, { backgroundColor: 'rgba(96, 165, 250, 0.15)', borderColor: '#60a5fa' }]}>
                <Text style={styles.chipText}>🧹 {taskCount} Room Task{taskCount > 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {/* Request List */}
          <ScrollView style={styles.requestList} contentContainerStyle={styles.requestListContent}>
            {pendingRequests.map((req) => {
              const cfg = TYPE_CONFIG[req.request_type] ?? {
                label: req.request_type,
                icon: '🛎️',
                color: '#f97316',
              }

              // Extract room number
              const roomsVal = req.rooms && typeof req.rooms === 'object'
                ? (Array.isArray(req.rooms) ? req.rooms[0]?.room_number : req.rooms.room_number)
                : undefined
              const payloadRoom =
                (req.payload?.room_number as string) ??
                (req.payload?.room as string) ??
                (req.payload?.room_no as string) ??
                ''
              const rawRoom = (roomsVal && roomsVal !== '—') ? String(roomsVal) : payloadRoom
              const displayRoom = rawRoom ? (rawRoom.startsWith('Room') ? rawRoom : `Room ${rawRoom}`) : 'Room —'

              // Extract service / item note preview
              let detailSummary = ''
              if (req.request_type === 'SPA_BOOKING' && req.payload?.service_name) {
                detailSummary = `${req.payload.service_name} @ ${req.payload.slot_time ?? 'TBD'}`
              } else if (req.request_type === 'FOOD_ORDER' && Array.isArray(req.payload?.items)) {
                detailSummary = (req.payload.items as Array<{ name: string; quantity: number }>)
                  .map((i) => `${i.quantity}× ${i.name}`)
                  .join(', ')
              } else if (req.payload?.task_name) {
                detailSummary = String(req.payload.task_name)
              } else if (req.payload?.note) {
                detailSummary = String(req.payload.note)
              }

              return (
                <View key={req.id} style={[styles.itemCard, { borderLeftColor: cfg.color }]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTypeBadge}>
                      <Text style={styles.itemIcon}>{cfg.icon}</Text>
                      <Text style={[styles.itemTypeLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <View style={styles.roomTag}>
                      <Text style={styles.roomTagText}>{displayRoom}</Text>
                    </View>
                  </View>

                  {!!detailSummary && (
                    <Text style={styles.itemDetail} numberOfLines={2}>
                      {detailSummary}
                    </Text>
                  )}

                  <View style={styles.itemFooter}>
                    <Text style={styles.itemStatus}>⏳ Status: {req.status}</Text>
                    <Text style={styles.itemElapsed}>
                      ⏱️ {elapsedTimes[req.id] || 'just now'}
                    </Text>
                  </View>
                </View>
              )
            })}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.ackButton}
              activeOpacity={0.85}
              onPress={onDismiss}
            >
              <Text style={styles.ackButtonText}>✓ ACKNOWLEDGE & REVIEW QUEUES</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 25,
  },
  topAccentBar: {
    height: 6,
    width: '100%',
    backgroundColor: '#ef4444',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 14,
    gap: 14,
  },
  bellIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },
  headerTextCol: {
    flex: 1,
    gap: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  alertCategory: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  livePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#ef4444',
  },
  livePillText: {
    color: '#fca5a5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  alertSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  requestList: {
    maxHeight: 280,
    paddingHorizontal: 20,
  },
  requestListContent: {
    gap: 10,
    paddingBottom: 10,
  },
  itemCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftWidth: 4,
    padding: 12,
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemIcon: {
    fontSize: 15,
  },
  itemTypeLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  roomTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roomTagText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  itemDetail: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 16,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 6,
  },
  itemStatus: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  itemElapsed: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  ackButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  ackButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
})
