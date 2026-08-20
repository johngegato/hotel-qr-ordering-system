import React, { useEffect, useState } from 'react'
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
import EditSpaBookingModal from './EditSpaBookingModal'
import { supabase } from '../lib/supabase'

interface SpaRequestItem {
  id: string
  room_id: string
  hotel_id: string
  request_type: string
  status: 'PENDING' | 'PENDING_ON_CALL' | 'CONFIRMED' | 'DECLINED' | string
  created_at: string
  rooms?: { room_number: string } | null
  payload?: {
    service_name?: string
    slot_time?: string
    price?: number
    duration_mins?: number
    intake_note?: string
    is_on_call?: boolean
    room_number?: string
  } | null
}

export default function SpaQueue({ activeStaffId }: { activeStaffId?: string }) {
  const [requests, setRequests] = useState<SpaRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [editBooking, setEditBooking] = useState<any | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editedMap, setEditedMap] = useState<Record<string, boolean>>({})

  // Fetch pending spa requests
  const fetchSpaQueue = async () => {
    try {
      setLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('requests') as any)
        .select('*, rooms(room_number)')
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['PENDING', 'PENDING_ON_CALL'])
        .order('created_at', { ascending: true })

      if (error) throw error
      setRequests((data as SpaRequestItem[]) || [])
    } catch (err) {
      console.error('Error fetching spa queue:', err)
    } finally {
      setLoading(false)
    }
  }

  // Subscribe to real-time WebSockets
  useEffect(() => {
    fetchSpaQueue()

    const channel = supabase
      .channel('public:spa_queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as SpaRequestItem
            if (
              newReq.request_type === 'SPA_BOOKING' &&
              ['PENDING', 'PENDING_ON_CALL'].includes(newReq.status)
            ) {
              setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)])
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedReq = payload.new as SpaRequestItem
            if (!['PENDING', 'PENDING_ON_CALL'].includes(updatedReq.status)) {
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

  const handleUpdateStatus = async (id: string, newStatus: 'CONFIRMED' | 'DECLINED') => {
    setProcessingId(id)
    // Optimistic removal — remove immediately so staff sees instant feedback
    const snapshot = requests.find((r) => r.id === id)
    setRequests((prev) => prev.filter((r) => r.id !== id))

    try {
      const { error } = await supabase
        .from('requests')
        .update({ status: newStatus, claimed_by: activeStaffId || null, claimed_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        // Restore the card on failure so staff can retry
        console.error(`Failed to update spa request ${id} to ${newStatus}:`, error.message)
        if (snapshot) setRequests((prev) => [snapshot, ...prev])
      }
    } catch (err) {
      console.error(`Error setting spa status to ${newStatus}:`, err)
      if (snapshot) setRequests((prev) => [snapshot, ...prev])
    } finally {
      // Notify any timetable listeners to refresh their data (fallback to realtime)
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('spa:revalidate'))
        }
      } catch (e) {
        // ignore
      }
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a78bfa" />
        <Text style={styles.loadingText}>Loading spa queue...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>💆 Spa Appointments</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{requests.length} Pending</Text>
        </View>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>No Pending Spa Requests</Text>
          <Text style={styles.emptySub}>All appointment requests have been processed.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isProcessing = processingId === item.id
            const isOnCall = item.status === 'PENDING_ON_CALL' || item.payload?.is_on_call
            const serviceName = item.payload?.service_name ?? 'Spa Treatment'
            const slotTime = item.payload?.slot_time ?? 'Scheduled Time'
            const price = item.payload?.price ?? 120
            const intake = item.payload?.intake_note ?? 'None'
            // Normalize rooms relation which may be object or array
            const roomsVal = (item.rooms && typeof item.rooms === 'object')
              ? (Array.isArray(item.rooms) ? item.rooms[0]?.room_number : item.rooms.room_number)
              : undefined
            // Prefer the joined rooms relation first (like RequestHistory), then payload
            const rawRoom = roomsVal ?? item.payload?.room_number ?? ''
            const roomDisplay = rawRoom
              ? (String(rawRoom).startsWith('Room') ? String(rawRoom) : `Room ${rawRoom}`)
              : 'Room —'

            return (
              <View style={[styles.card, isOnCall && styles.cardOnCall]}>
                <View style={styles.cardHeader}>
                    <View style={styles.roomBadge}>
                    <Text style={styles.roomText}>{roomDisplay}</Text>
                  </View>

                  {isOnCall ? (
                    <View style={styles.onCallBadge}>
                      <Text style={styles.onCallBadgeText}>⚠️ On-Call Approval Needed</Text>
                    </View>
                  ) : (
                    <View style={styles.standardBadge}>
                      <Text style={styles.standardBadgeText}>In-House Request</Text>
                    </View>
                  )}
                </View>

                {/* Treatment Details */}
                <Text style={styles.serviceTitle}>{serviceName}</Text>
                <Text style={styles.slotTimeText}>🗓️ {slotTime} (₱{price.toLocaleString()})</Text>

                <View style={styles.intakeBox}>
                  <Text style={styles.intakeLabel}>Guest Intake Notes:</Text>
                  <Text style={styles.intakeText}>{intake}</Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.modifyBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => {
                      const editable = {
                        id: item.id,
                        roomNumber: roomDisplay,
                        guestPhone: item.payload?.guest_phone || '',
                        serviceName: item.payload?.service_name || 'Spa Treatment',
                        startTime: item.payload?.slot_time || '14:00',
                        therapistId: item.payload?.therapist_id || null,
                        therapistName: item.payload?.assigned_therapist || '',
                        isOnCall: item.status === 'PENDING_ON_CALL' || item.payload?.is_on_call === true,
                        status: item.status,
                      }
                      setEditBooking(editable)
                      setIsEditOpen(true)
                    }}
                  >
                    <Text style={styles.modifyBtnText}>✏️ Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.callBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => {
                      const phone = item.payload?.guest_phone || ''
                      if (phone) Linking.openURL(`tel:${phone}`)
                      else Alert.alert('No Phone', 'Guest phone number not provided.')
                    }}
                  >
                    <Text style={styles.callBtnText}>📞 Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.declineBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => handleUpdateStatus(item.id, 'DECLINED')}
                    disabled={isProcessing}
                  >
                    <Text style={styles.declineBtnText}>✕ Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Edit modal for pre-approval edits */}
      {isEditOpen && editBooking && (
        <EditSpaBookingModal
          isOpen={isEditOpen}
          booking={editBooking}
          onClose={() => { setIsEditOpen(false); setEditBooking(null) }}
          onSaved={async () => {
            // mark this request as edited so staff can approve it
            if (editBooking?.id) setEditedMap(prev => ({ ...prev, [editBooking.id]: true }))
            await fetchSpaQueue()
            setIsEditOpen(false)
            setEditBooking(null)
          }}
          confirmOnSave={false}
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
    marginTop: 16,
  },
  listContent: {
    paddingBottom: 12,
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
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  countBadgeText: {
    color: '#a78bfa',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(167, 139, 250, 0.18)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 12,
    opacity: 0.9,
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
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  cardOnCall: {
    borderColor: 'rgba(251, 191, 36, 0.5)',
    backgroundColor: 'rgba(48, 36, 18, 0.9)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  roomBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexShrink: 1,
    maxWidth: '60%',
  },
  roomText: {
    color: '#d8ccff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  onCallBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 1,
  },
  onCallBadgeText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: 'bold',
  },
  standardBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 1,
  },
  standardBadgeText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '600',
  },
  serviceTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  slotTimeText: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  intakeBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  intakeLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  intakeText: {
    color: '#dfe7f5',
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 8,
  },
  modifyBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(167, 139, 250, 0.14)',
    borderColor: 'rgba(167, 139, 250, 0.28)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyBtnText: {
    color: '#d8ccff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  callBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(96, 165, 250, 0.3)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: {
    color: '#93c5fd',
    fontWeight: 'bold',
    fontSize: 12,
  },
  confirmBtn: {
    flex: 1.2,
    minWidth: 0,
    backgroundColor: '#4ade80',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 12,
  },
  declineBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
})
