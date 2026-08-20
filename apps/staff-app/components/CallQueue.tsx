import React, { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'

interface RequestItem {
  id: string
  room_id: string
  hotel_id: string
  request_type: string
  status: string
  created_at: string
  payload?: {
    room_number?: string
    note?: string
  } | null
}

export default function CallQueue({ activeStaffId }: { activeStaffId?: string }) {
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

  // Initial fetch of pending requests
  const fetchPendingRequests = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('request_type', 'CALL_REQUEST')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })

      if (error) throw error
      setRequests((data as RequestItem[]) || [])
    } catch (err) {
      console.error('Error fetching call queue:', err)
    } finally {
      setLoading(false)
    }
  }

  // Subscribe to real-time changes via WebSockets
  useEffect(() => {
    fetchPendingRequests()

    const channel = supabase
      .channel('public:requests_queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as RequestItem
            if (newReq.request_type === 'CALL_REQUEST' && newReq.status === 'PENDING') {
              setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)])
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedReq = payload.new as RequestItem
            if (updatedReq.status !== 'PENDING') {
              setRequests((prev) => prev.filter((r) => r.id !== updatedReq.id))
            } else {
              setRequests((prev) =>
                prev.map((r) => (r.id === updatedReq.id ? updatedReq : r))
              )
            }
          } else if (payload.eventType === 'DELETE') {
            const oldReq = payload.old as { id: string }
            setRequests((prev) => prev.filter((r) => r.id !== oldReq.id))
          }
        }
      )
      .subscribe()

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

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomBadge}>
                    <Text style={styles.roomText}>Room {roomNumber}</Text>
                  </View>
                  <Text style={styles.elapsedText}>⏱️ {formatElapsed(item.created_at)}</Text>
                </View>

                <Text style={styles.noteText}>
                  {item.payload?.note || 'Guest requested a call from the front desk'}
                </Text>

                <TouchableOpacity
                  style={[styles.claimButton, isClaiming && styles.claimButtonDisabled]}
                  onPress={() => handleClaim(item.id)}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <Text style={styles.claimButtonText}>✓ Claim & Call Guest</Text>
                  )}
                </TouchableOpacity>
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
  claimButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 15,
  },
})
