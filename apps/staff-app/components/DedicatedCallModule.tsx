import React, { useEffect, useState, useCallback } from 'react'
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

export interface CallRequestItem {
  id: string
  status: string
  created_at: string
  claimed_by?: string | null
  payload: {
    room_number?: string
    note?: string
    guest_phone?: string
  }
  rooms?: { room_number: string } | null
}

interface DedicatedCallModuleProps {
  activeStaffId?: string
}

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const isValidUuid = (value?: string | null) => {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default function DedicatedCallModule({ activeStaffId }: DedicatedCallModuleProps) {
  const [calls, setCalls] = useState<CallRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [roomSort, setRoomSort] = useState<'asc' | 'desc'>('asc')
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')
  const [activeSort, setActiveSort] = useState<'ROOM' | 'DATE'>('DATE')
  const [updating, setUpdating] = useState<string | null>(null)

  const [isExpanded, setIsExpanded] = useState(false)

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('requests') as any)
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'CALL_REQUEST')
        .in('status', ['PENDING', 'CLAIMED'])  // ← exclude RESOLVED so they disappear after resolution

      if (!error && data) {
        setCalls(data as CallRequestItem[])
      }
    } catch (err) {
      console.error('Error fetching call requests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalls()

    const channel = supabase
      .channel('dedicated-call-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: 'request_type=eq.CALL_REQUEST' }, () => {
        fetchCalls()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCalls])

  const handleUpdateStatus = async (id: string, newStatus: 'CLAIMED' | 'RESOLVED') => {
    setUpdating(id)

    const snapshot = calls.find((c) => c.id === id)
    const safeClaimedBy = isValidUuid(activeStaffId) ? activeStaffId : null

    if (newStatus === 'RESOLVED') {
      setCalls((prev) => prev.filter((c) => c.id !== id))
    } else {
      setCalls(prev => prev.map(c => c.id === id ? { ...(c as any), status: 'CLAIMED', claimed_by: safeClaimedBy } : c))
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('requests') as any)
        .update({
          status: newStatus,
          claimed_by: safeClaimedBy,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      // Only refresh after a claim. For a resolve, the item is intentionally removed from the active queue,
      // and the realtime subscription / server update should keep the list in sync without reintroducing a stale item.
      if (newStatus === 'CLAIMED') {
        await fetchCalls()
      }
    } catch (err) {
      console.error('Error updating call request:', err)

      if (snapshot) {
        setCalls((prev) => {
          const exists = prev.some((c) => c.id === snapshot.id)
          return exists ? prev : [snapshot, ...prev]
        })
      }
    } finally {
      setUpdating(null)
    }
  }

  const sortedCalls = [...calls].sort((a, b) => {
    if (activeSort === 'ROOM') {
      const rA = parseInt(a.rooms?.room_number || a.payload?.room_number || '0', 10)
      const rB = parseInt(b.rooms?.room_number || b.payload?.room_number || '0', 10)
      return roomSort === 'asc' ? rA - rB : rB - rA
    } else {
      const tA = new Date(a.created_at).getTime()
      const tB = new Date(b.created_at).getTime()
      return dateSort === 'desc' ? tB - tA : tA - tB
    }
  })

  const displayedCalls = isExpanded ? sortedCalls : sortedCalls.slice(0, 4)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.heading}>📞 Dedicated Call Requests Module</Text>
          {sortedCalls.length > 4 && (
            <TouchableOpacity
              style={styles.expandToggleBtn}
              onPress={() => setIsExpanded(prev => !prev)}
            >
              <Text style={styles.expandToggleText}>
                {isExpanded ? '▲ Minimize (4)' : `▼ Expand (${sortedCalls.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sorting Controls */}
        <View style={styles.sortBar}>
          <TouchableOpacity
            style={[styles.sortBtn, activeSort === 'ROOM' && styles.sortBtnActive]}
            onPress={() => {
              if (activeSort === 'ROOM') {
                setRoomSort(prev => prev === 'asc' ? 'desc' : 'asc')
              } else {
                setActiveSort('ROOM')
              }
            }}
          >
            <Text style={[styles.sortText, activeSort === 'ROOM' && styles.sortTextActive]}>
              🚪 Room {activeSort === 'ROOM' ? (roomSort === 'asc' ? '↑ (Asc)' : '↓ (Desc)') : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortBtn, activeSort === 'DATE' && styles.sortBtnActive]}
            onPress={() => {
              if (activeSort === 'DATE') {
                setDateSort(prev => prev === 'desc' ? 'asc' : 'desc')
              } else {
                setActiveSort('DATE')
              }
            }}
          >
            <Text style={[styles.sortText, activeSort === 'DATE' && styles.sortTextActive]}>
              ⏱ Date {activeSort === 'DATE' ? (dateSort === 'desc' ? '↓ (Newest)' : '↑ (Oldest)') : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#fbbf24" style={{ marginVertical: 16 }} />
      ) : sortedCalls.length === 0 ? (
        <Text style={styles.emptyText}>No call requests found.</Text>
      ) : (
        <FlatList
          data={displayedCalls}
          keyExtractor={item => item.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 10 }}
          scrollEnabled={false}

          renderItem={({ item }) => {
            const roomNo = item.rooms?.room_number || item.payload?.room_number || 'N/A'
            const isClaimed = item.status === 'CLAIMED'
            const isResolved = item.status === 'RESOLVED'

            return (
              <View style={styles.callCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomTag}>
                    <Text style={styles.phoneIcon}>📞</Text>
                    <Text style={styles.roomNo}>Room {roomNo}</Text>
                  </View>
                  <View style={[styles.statusBadge, isClaimed ? styles.claimedBg : isResolved ? styles.resolvedBg : styles.pendingBg]}>
                    <Text style={[styles.statusBadgeText, isClaimed ? styles.claimedText : isResolved ? styles.resolvedText : styles.pendingText]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                {!!item.payload?.guest_phone && (
                  <TouchableOpacity
                    style={styles.callGuestRow}
                    onPress={() => {
                      Linking.openURL(`tel:${item.payload.guest_phone}`).catch(() =>
                        Alert.alert('Cannot Open Dialer', 'Unable to open the phone dialer on this device.')
                      )
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.callGuestRowText}>📞 {item.payload.guest_phone}</Text>
                    <Text style={styles.callGuestRowHint}>Tap to call</Text>
                  </TouchableOpacity>
                )}

                {!item.payload?.guest_phone && (
                  <Text style={styles.phoneText}>📱 No phone number provided</Text>
                )}

                <Text style={styles.timeText}>Requested: {new Date(item.created_at).toLocaleTimeString()}</Text>

                {/* Actions */}
                {!isResolved && (
                  <View style={styles.actionsRow}>
                    {/* Call Guest Button — always visible */}
                    <TouchableOpacity
                      style={[
                        styles.btn,
                        styles.btnCallGuest,
                        (!item.payload?.guest_phone || updating === item.id) && styles.btnDisabled,
                      ]}
                      onPress={() => {
                        if (!item.payload?.guest_phone) {
                          Alert.alert('No Phone Number', 'This request does not have a guest phone number on file.')
                          return
                        }
                        Linking.openURL(`tel:${item.payload.guest_phone}`).catch(() =>
                          Alert.alert('Cannot Open Dialer', 'Unable to open the phone dialer on this device.')
                        )
                      }}
                      disabled={!item.payload?.guest_phone || updating === item.id}
                    >
                      <Text style={styles.btnCallGuestText}>📞 Call</Text>
                    </TouchableOpacity>

                    {!isClaimed && (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnClaim, updating === item.id && styles.btnDisabled]}
                        onPress={() => handleUpdateStatus(item.id, 'CLAIMED')}
                        disabled={updating === item.id}
                      >
                        <Text style={styles.btnClaimText}>✓ Claim</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.btn, styles.btnResolve, updating === item.id && styles.btnDisabled]}
                      onPress={() => handleUpdateStatus(item.id, 'RESOLVED')}
                      disabled={updating === item.id}
                    >
                      <Text style={styles.btnResolveText}>✓ Resolve</Text>
                    </TouchableOpacity>
                  </View>
                )}
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
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    marginTop: 20,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  expandToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  expandToggleText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  sub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  sortBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sortBtnActive: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderColor: '#fbbf24',
  },
  sortText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#fbbf24',
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  callCard: {
    backgroundColor: 'rgba(251,191,36,0.05)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roomTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneIcon: {
    fontSize: 16,
  },
  roomNo: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBg: { backgroundColor: 'rgba(250,204,21,0.15)' },
  claimedBg: { backgroundColor: 'rgba(59,130,246,0.15)' },
  resolvedBg: { backgroundColor: 'rgba(34,197,94,0.15)' },
  pendingText: { color: '#facc15' },
  claimedText: { color: '#60a5fa' },
  resolvedText: { color: '#4ade80' },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  phoneText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  timeText: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnClaim: {
    backgroundColor: 'rgba(251,191,36,0.2)',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  btnClaimText: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: 12,
  },
  btnCallGuest: {
    backgroundColor: 'rgba(52,211,153,0.2)',
    borderWidth: 1,
    borderColor: '#34d399',
  },
  btnCallGuestText: {
    color: '#34d399',
    fontWeight: '800',
    fontSize: 12,
  },
  callGuestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  callGuestRowText: {
    color: '#34d399',
    fontWeight: '700',
    fontSize: 13,
  },
  callGuestRowHint: {
    color: '#34d399',
    fontSize: 10,
    opacity: 0.7,
  },
  btnResolve: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  btnResolveText: {
    color: '#4ade80',
    fontWeight: '800',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
