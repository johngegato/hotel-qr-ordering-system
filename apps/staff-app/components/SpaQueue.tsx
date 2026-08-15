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

export default function SpaQueue() {
  const [requests, setRequests] = useState<SpaRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [editBooking, setEditBooking] = useState<any | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Fetch pending spa requests
  const fetchSpaQueue = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('requests')
        .select('*')
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
        .update({ status: newStatus, claimed_at: new Date().toISOString() })
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
          renderItem={({ item }) => {
            const isProcessing = processingId === item.id
            const isOnCall = item.status === 'PENDING_ON_CALL' || item.payload?.is_on_call
            const serviceName = item.payload?.service_name ?? 'Spa Treatment'
            const slotTime = item.payload?.slot_time ?? 'Scheduled Time'
            const price = item.payload?.price ?? 120
            const intake = item.payload?.intake_note ?? 'None'

            return (
              <View style={[styles.card, isOnCall && styles.cardOnCall]}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomBadge}>
                    <Text style={styles.roomText}>{item.payload?.room_number || item.rooms?.room_number || 'Room 302'}</Text>
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
                  {/* Modify / Edit before approval */}
                  <TouchableOpacity
                    style={[styles.modifyBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => {
                      // Build editable booking object expected by EditSpaBookingModal
                      const editable = {
                        id: item.id,
                        roomNumber: item.payload?.room_number || item.rooms?.room_number || 'Room 302',
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
                    <Text style={styles.modifyBtnText}>✏️ Modify</Text>
                  </TouchableOpacity>

                  {/* Dial / Call guest */}
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
                    style={[styles.confirmBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => handleUpdateStatus(item.id, 'CONFIRMED')}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#0f172a" />
                    ) : (
                      <Text style={styles.confirmBtnText}>✓ Approve & Confirm</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.declineBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => handleUpdateStatus(item.id, 'DECLINED')}
                    disabled={isProcessing}
                  >
                    <Text style={styles.declineBtnText}>✕ Decline</Text>
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
          onSaved={async () => { await fetchSpaQueue(); setIsEditOpen(false); setEditBooking(null) }}
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
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
    borderColor: 'rgba(167, 139, 250, 0.25)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  cardOnCall: {
    borderColor: 'rgba(251, 191, 36, 0.5)',
    backgroundColor: 'rgba(45, 35, 20, 0.8)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roomBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roomText: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: 'bold',
  },
  onCallBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    marginBottom: 4,
  },
  slotTimeText: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  intakeBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
    color: '#cbd5e1',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#4ade80',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
})
