import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useAutoSync } from '../lib/useAutoSync'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RequestItem {
  id: string
  room_id: string
  hotel_id: string
  request_type: string
  status: string
  created_at: string
  agora_channel?: string | null
  payload?: {
    room_number?: string
    note?: string
    guest_phone?: string
    channel?: string
  } | null
}

export default function CallQueue({
  activeStaffId,
  refreshTrigger,
  onAnswerLiveCall,
}: {
  activeStaffId?: string
  refreshTrigger?: number
  onAnswerLiveCall?: (channel: string, requestId: string) => void
}) {
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [now, setNow] = useState<number>(Date.now())

  // Timer tick for live elapsed time counters
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch pending requests with stable callback
  const fetchPendingRequests = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true)
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .in('request_type', ['CALL_REQUEST', 'LIVE_CALL'])
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })

      if (error) throw error
      setRequests((data as RequestItem[]) || [])
    } catch (err) {
      console.error('Error fetching call queue:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [])

  // Mutable ref to always call the latest fetchPendingRequests
  const fetchRef = useRef(fetchPendingRequests)
  useEffect(() => {
    fetchRef.current = fetchPendingRequests
  }, [fetchPendingRequests])

  // ─── Automated Polling & Focus Synchronization ─────────────
  useAutoSync(() => fetchRef.current(true), { intervalMs: 6000 })

  // ─── Triggered from Parent App Event Bus ───────────────────
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    fetchRef.current(true)
  }, [refreshTrigger])

  // Subscribe to real-time changes via WebSockets
  useEffect(() => {
    fetchRef.current()

    const channel: RealtimeChannel = supabase
      .channel('public:requests_queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
        },
        () => {
          fetchRef.current(true)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchRef.current(true)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleClaim = async (id: string) => {
    setClaimingId(id)
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'CLAIMED',
          claimed_by: activeStaffId || null,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error('Error claiming request:', err)
    } finally {
      setClaimingId(null)
    }
  }

  const formatElapsed = (createdAtStr: string) => {
    const created = new Date(createdAtStr).getTime()
    const diffSecs = Math.max(0, Math.floor((now - created) / 1000))
    const mins = Math.floor(diffSecs / 60)
    const secs = diffSecs % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fbbf24" />
        <Text style={styles.loadingText}>Loading call queue...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>📞 Call Requests</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{requests.length} Pending</Text>
        </View>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>Queue Cleared</Text>
          <Text style={styles.emptySub}>No pending room call requests right now.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const roomNumber = item.payload?.room_number ?? '302'
            const isClaiming = claimingId === item.id
            const guestPhone = item.payload?.guest_phone

            const handleCallGuest = () => {
              if (!guestPhone) {
                Alert.alert('No Phone Number', 'This request does not have a guest phone number on file.')
                return
              }
              Linking.openURL(`tel:${guestPhone}`).catch(() =>
                Alert.alert('Cannot Open Dialer', 'Unable to open the phone dialer on this device.')
              )
            }

            const isLiveCall = item.request_type === 'LIVE_CALL'
            const agoraChannel = item.agora_channel || item.payload?.channel || `room-${item.room_id}`

            return (
              <View style={[styles.card, isLiveCall && styles.liveCallCard]}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.roomBadge}>
                      <Text style={styles.roomText}>Room {roomNumber}</Text>
                    </View>
                    {isLiveCall && (
                      <View style={styles.liveBadge}>
                        <Text style={styles.liveBadgeText}>🔴 LIVE CALL</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.elapsedText}>⏱️ {formatElapsed(item.created_at)}</Text>
                </View>

                <Text style={styles.noteText}>
                  {item.payload?.note || (isLiveCall ? 'Guest is calling via live voice…' : 'Guest requested a call from the front desk')}
                </Text>

                {!!guestPhone && (
                  <Text style={styles.phoneNumberText}>📱 {guestPhone}</Text>
                )}

                <View style={styles.actionRow}>
                  {isLiveCall ? (
                    <TouchableOpacity
                      style={styles.answerLiveCallButton}
                      onPress={() => onAnswerLiveCall?.(agoraChannel, item.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.answerLiveCallButtonText}>📞 Answer Live Call</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.callGuestButton, !guestPhone && styles.callGuestButtonDisabled]}
                      onPress={handleCallGuest}
                      disabled={!guestPhone}
                    >
                      <Text style={styles.callGuestButtonText}>📞 Call Guest</Text>
                    </TouchableOpacity>
                  )}

                  {/* Claim button */}
                  <TouchableOpacity
                    style={[styles.claimButton, isClaiming && styles.claimButtonDisabled]}
                    onPress={() => handleClaim(item.id)}
                    disabled={isClaiming}
                  >
                    {isClaiming ? (
                      <ActivityIndicator color="#0f172a" />
                    ) : (
                      <Text style={styles.claimButtonText}>✓ Claim</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  countBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  countBadgeText: {
    color: '#fbbf24',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 13,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roomText: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: 'bold',
  },
  elapsedText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  noteText: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 16,
  },
  phoneNumberText: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  callGuestButton: {
    flex: 1,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: '#34d399',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  callGuestButtonDisabled: {
    opacity: 0.35,
  },
  callGuestButtonText: {
    color: '#34d399',
    fontWeight: 'bold',
    fontSize: 14,
  },
  claimButton: {
    flex: 1,
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  claimButtonDisabled: {
    opacity: 0.5,
  },
  claimButtonText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  liveCallCard: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  liveBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  liveBadgeText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  answerLiveCallButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  answerLiveCallButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
})
