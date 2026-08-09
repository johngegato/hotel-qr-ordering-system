import React, { useEffect, useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'

export interface HistoricalRequest {
  id: string
  request_type: string
  status: string
  payload: Record<string, any>
  created_at: string
  claimed_by?: string | null
  rooms?: { room_number: string } | null
}

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

type RoomSortOrder = 'asc' | 'desc'
type DateSortOrder = 'desc' | 'asc'

export default function RequestHistory() {
  const [requests, setRequests] = useState<HistoricalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [roomSort, setRoomSort] = useState<RoomSortOrder>('asc')
  const [dateSort, setDateSort] = useState<DateSortOrder>('desc')
  const [activeSortType, setActiveSortType] = useState<'DATE' | 'ROOM'>('DATE')
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('requests') as any)
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)

      if (!error && data) {
        setRequests(data as HistoricalRequest[])
      }
    } catch (err) {
      console.error('Error fetching request history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()

    const channel = supabase
      .channel('history-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        fetchHistory()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchHistory])

  // Process and sort requests in memory
  const sortedRequests = [...requests].sort((a, b) => {
    if (activeSortType === 'ROOM') {
      const rA = parseInt(a.rooms?.room_number || '0', 10)
      const rB = parseInt(b.rooms?.room_number || '0', 10)
      return roomSort === 'asc' ? rA - rB : rB - rA
    } else {
      const tA = new Date(a.created_at).getTime()
      const tB = new Date(b.created_at).getTime()
      return dateSort === 'desc' ? tB - tA : tA - tB
    }
  })

  const displayedRequests = isExpanded ? sortedRequests : sortedRequests.slice(0, 4)

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CONFIRMED':
        return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', label: '✓ RESOLVED' }
      case 'DECLINED':
      case 'CANCELLED':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', label: '✕ DECLINED' }
      case 'CLAIMED':
      case 'PREPARING':
        return { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', label: '⏳ IN PROGRESS' }
      default:
        return { bg: 'rgba(250, 204, 21, 0.15)', color: '#facc15', label: '🟡 PENDING' }
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'CALL_REQUEST': return '📞'
      case 'SPA_BOOKING':  return '💆'
      case 'FOOD_ORDER':   return '🍽️'
      default:             return '🧹'
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.heading}>📜 Request History &amp; Logs</Text>
          {sortedRequests.length > 4 && (
            <TouchableOpacity
              style={styles.expandToggleBtn}
              onPress={() => setIsExpanded(prev => !prev)}
            >
              <Text style={styles.expandToggleText}>
                {isExpanded ? '▲ Minimize (4)' : `▼ Expand (${sortedRequests.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sorting Controls */}
        <View style={styles.sortBar}>
          <TouchableOpacity
            style={[styles.sortBtn, activeSortType === 'ROOM' && styles.sortBtnActive]}
            onPress={() => {
              if (activeSortType === 'ROOM') {
                setRoomSort(prev => prev === 'asc' ? 'desc' : 'asc')
              } else {
                setActiveSortType('ROOM')
              }
            }}
          >
            <Text style={[styles.sortText, activeSortType === 'ROOM' && styles.sortTextActive]}>
              🚪 Room {activeSortType === 'ROOM' ? (roomSort === 'asc' ? '↑ (Asc)' : '↓ (Desc)') : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortBtn, activeSortType === 'DATE' && styles.sortBtnActive]}
            onPress={() => {
              if (activeSortType === 'DATE') {
                setDateSort(prev => prev === 'desc' ? 'asc' : 'desc')
              } else {
                setActiveSortType('DATE')
              }
            }}
          >
            <Text style={[styles.sortText, activeSortType === 'DATE' && styles.sortTextActive]}>
              ⏱ Date {activeSortType === 'DATE' ? (dateSort === 'desc' ? '↓ (Newest)' : '↑ (Oldest)') : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#fbbf24" style={{ marginVertical: 20 }} />
      ) : sortedRequests.length === 0 ? (
        <Text style={styles.emptyText}>No historical logs available.</Text>
      ) : (
        <FlatList
          data={displayedRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
          nestedScrollEnabled

          renderItem={({ item }) => {
            const st = getStatusStyle(item.status)
            const icon = getTypeIcon(item.request_type)
            const roomNo = item.rooms?.room_number || (item.payload as any)?.room_number || 'N/A'
            const dateStr = new Date(item.created_at).toLocaleString()

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomTag}>
                    <Text style={styles.iconText}>{icon}</Text>
                    <Text style={styles.roomNo}>Room {roomNo}</Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                <Text style={styles.summaryText}>
                  {item.request_type === 'TASK' && ((item.payload as any)?.task_name || 'Room Request')}
                  {item.request_type === 'FOOD_ORDER' && `Food Order (₱${(item.payload as any)?.total_price || 0})`}
                  {item.request_type === 'SPA_BOOKING' && `Spa: ${(item.payload as any)?.service_name || 'Treatment'}`}
                  {item.request_type === 'CALL_REQUEST' && 'Callback Alert'}
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaTime}>Timestamp: {dateStr}</Text>
                  {item.claimed_by && <Text style={styles.metaStaff}>Staff ID: {item.claimed_by}</Text>}
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
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 20,
  },
  header: {
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    color: '#38bdf8',
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
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  expandToggleText: {
    color: '#38bdf8',
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
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  sortText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  iconText: {
    fontSize: 16,
  },
  roomNo: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  summaryText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 6,
  },
  metaTime: {
    color: '#64748b',
    fontSize: 10,
  },
  metaStaff: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '700',
  },
})
