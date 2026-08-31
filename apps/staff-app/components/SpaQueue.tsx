import React, { useEffect, useState, useCallback, useRef } from 'react'
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
import { StaffUser } from './UserManagement'
import { supabase } from '../lib/supabase'
import { useAutoSync } from '../lib/useAutoSync'
import type { RealtimeChannel } from '@supabase/supabase-js'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

export interface SpaRequestItem {
  id: string
  room_id: string
  hotel_id: string
  request_type: string
  status: string
  created_at: string
  claimed_by?: string | null
  rooms?: { room_number: string } | null
  payload?: {
    room_number?: string
    service_name?: string
    slot_time?: string
    duration_mins?: number
    price?: number
    special_requests?: string
    is_on_call?: boolean
    guest_phone?: string
    therapist_id?: string
    assigned_therapist?: string
    scheduled_at?: string
    intake_note?: string
  } | null
}

const isValidUuid = (val?: string | null): string | null => {
  if (!val || typeof val !== 'string') return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim()) ? val.trim() : null
}

export default function SpaQueue({
  activeStaffId,
  activeStaffUser,
  refreshTrigger,
}: {
  activeStaffId?: string
  activeStaffUser?: StaffUser | null
  refreshTrigger?: number
}) {
  const [requests, setRequests] = useState<SpaRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [editBooking, setEditBooking] = useState<any | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Fetch pending spa requests with stable callback
  const fetchSpaQueue = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true)
      // 1. Try fetching with rooms join
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('requests') as any)
        .select('*, rooms(room_number)')
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['PENDING', 'PENDING_ON_CALL'])
        .order('created_at', { ascending: true })

      if (error) {
        // Fallback without join
        const { data: fallbackData } = await (supabase.from('requests') as any)
          .select('*')
          .eq('request_type', 'SPA_BOOKING')
          .in('status', ['PENDING', 'PENDING_ON_CALL'])
          .order('created_at', { ascending: true })
        if (fallbackData) setRequests(fallbackData as SpaRequestItem[])
      } else if (data) {
        setRequests((data as SpaRequestItem[]) || [])
      }
    } catch (err) {
      console.error('Error fetching spa queue:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [])

  // Mutable ref to always call the latest fetchSpaQueue
  const fetchRef = useRef(fetchSpaQueue)
  useEffect(() => {
    fetchRef.current = fetchSpaQueue
  }, [fetchSpaQueue])

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

  // Subscribe to real-time WebSockets
  useEffect(() => {
    fetchRef.current()

    const channel: RealtimeChannel = supabase
      .channel('public:spa_queue_realtime')
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
        // CRITICAL: Refetch when subscription confirms to catch any missed events
        if (status === 'SUBSCRIBED') {
          fetchRef.current(true)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleUpdateStatus = async (id: string, newStatus: 'CONFIRMED' | 'DECLINED') => {
    setProcessingId(id)
    const snapshot = requests.find((r) => r.id === id)
    // Optimistic removal for instant UI feedback
    setRequests((prev) => prev.filter((r) => r.id !== id))

    try {
      const safeStaffId = isValidUuid(activeStaffId || activeStaffUser?.id)
      const { error } = await supabase
        .from('requests')
        .update({
          status: newStatus,
          claimed_by: safeStaffId,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) {
        console.error(`Failed to update spa request ${id} to ${newStatus}:`, error.message)
        if (snapshot) setRequests((prev) => [snapshot, ...prev])
      } else {
        // Record status update in audit logs
        try {
          const p = snapshot?.payload || {}
          const staffName = activeStaffUser?.name || 'Front Desk Staff'
          const staffRole = activeStaffUser?.role || 'FRONT_DESK'

          await (supabase as any)
            .from('audit_logs')
            .insert([{
              hotel_id: HOTEL_ID,
              request_id: id,
              action: newStatus === 'CONFIRMED' ? 'BOOKING_APPROVED' : 'BOOKING_DECLINED',
              actor_id: safeStaffId,
              details: {
                source: 'staff_queue',
                actor_name: staffName,
                actor_role: staffRole,
                approved_by: newStatus === 'CONFIRMED' ? staffName : undefined,
                cancelled_by: newStatus === 'DECLINED' ? staffName : undefined,
                new_status: newStatus,
                old_status: snapshot?.status || 'PENDING',
                service_name: p.service_name || 'Spa Service',
                room_number: p.room_number || snapshot?.rooms?.room_number || 'Room —',
                slot_time: p.slot_time || '—',
                claimed_by: safeStaffId,
              },
            }])
        } catch (auditErr) {
          console.warn('[SpaQueue] Non-fatal audit log insertion error:', auditErr)
        }
      }
    } catch (err) {
      console.error(`Error setting spa status to ${newStatus}:`, err)
      if (snapshot) setRequests((prev) => [snapshot, ...prev])
    } finally {
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

  if (loading && requests.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#a78bfa" />
          <Text style={styles.loadingText}>Loading spa appointment requests...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>💆 Spa Appointment Queue</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{requests.length} Pending</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchSpaQueue()}>
          <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>No Pending Spa Requests</Text>
          <Text style={styles.emptySub}>
            All appointment requests have been processed. New bookings from the guest app will appear here in real time.
          </Text>
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
            const duration = item.payload?.duration_mins ?? 60
            const intake = item.payload?.intake_note ?? 'None'
            const phone = item.payload?.guest_phone || ''

            const roomsVal = (item.rooms && typeof item.rooms === 'object')
              ? (Array.isArray(item.rooms) ? item.rooms[0]?.room_number : item.rooms.room_number)
              : undefined
            const rawRoom = roomsVal ?? item.payload?.room_number ?? ''
            const roomDisplay = rawRoom
              ? (String(rawRoom).startsWith('Room') ? String(rawRoom) : `Room ${rawRoom}`)
              : 'Room —'

            return (
              <View style={[styles.card, isOnCall && styles.cardOnCall]}>
                {/* Header Row */}
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
                <View style={styles.cardBody}>
                  <Text style={styles.serviceTitle}>{serviceName}</Text>
                  <View style={styles.metaPillsRow}>
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>⏰ {slotTime}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>⏳ {duration} mins</Text>
                    </View>
                    <View style={[styles.metaPill, styles.pricePill]}>
                      <Text style={[styles.metaPillText, styles.pricePillText]}>₱{Number(price).toLocaleString()}</Text>
                    </View>
                  </View>

                  {/* Intake notes */}
                  {intake && intake !== 'None' && intake !== 'No special intake preferences' && (
                    <View style={styles.intakeBox}>
                      <Text style={styles.intakeLabel}>📝 Intake Notes:</Text>
                      <Text style={styles.intakeText}>{intake}</Text>
                    </View>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  {/* Primary: must review/edit before accepting */}
                  <TouchableOpacity
                    style={[styles.acceptBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => {
                      const editable = {
                        id: item.id,
                        roomNumber: roomDisplay,
                        guestPhone: phone,
                        serviceName: serviceName,
                        startTime: item.payload?.slot_time || '14:00',
                        therapistId: item.payload?.therapist_id || null,
                        therapistName: item.payload?.assigned_therapist || '',
                        isOnCall: Boolean(isOnCall),
                        status: item.status,
                        payload: item.payload,
                      }
                      setEditBooking(editable)
                      setIsEditOpen(true)
                    }}
                    disabled={isProcessing}
                  >
                    <Text style={styles.acceptBtnText}>✏️ Review & Accept</Text>
                  </TouchableOpacity>

                  {phone ? (
                    <TouchableOpacity
                      style={[styles.callBtn, isProcessing && styles.btnDisabled]}
                      onPress={() => Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Call', `Dialing ${phone}`))}
                      disabled={isProcessing}
                    >
                      <Text style={styles.callBtnText}>📞 Call</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.callBtn, styles.callBtnDisabled]} disabled>
                      <Text style={styles.callBtnDisabledText}>📞 No Phone</Text>
                    </TouchableOpacity>
                  )}

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
          activeStaffUser={activeStaffUser}
          activeStaffId={activeStaffId}
          activeStaffName={activeStaffUser?.name}
          onClose={() => { setIsEditOpen(false); setEditBooking(null) }}
          onSaved={async () => {
            await fetchSpaQueue()
            setIsEditOpen(false)
            setEditBooking(null)
          }}
          confirmOnSave={true}
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
    borderColor: 'rgba(167, 139, 250, 0.2)',
    marginTop: 20,
    width: '100%',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 13,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
  },
  countBadgeText: {
    color: '#a78bfa',
    fontWeight: '700',
    fontSize: 12,
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  listContent: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(167, 139, 250, 0.15)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(167, 139, 250, 0.25)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    width: '100%',
  },
  cardOnCall: {
    borderColor: 'rgba(251, 191, 36, 0.45)',
    backgroundColor: 'rgba(48, 36, 18, 0.4)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  roomBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roomText: {
    color: '#d8ccff',
    fontSize: 14,
    fontWeight: '800',
  },
  onCallBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  onCallBadgeText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  standardBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderColor: 'rgba(74, 222, 128, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  standardBadgeText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    marginBottom: 12,
  },
  serviceTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metaPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaPillText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  pricePill: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
  },
  pricePillText: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  intakeBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
  },
  intakeLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  intakeText: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 10,
  },
  acceptBtn: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#22c55e',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 12,
  },
  modifyBtn: {
    flex: 1,
    minWidth: 80,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyBtnText: {
    color: '#d8ccff',
    fontWeight: '700',
    fontSize: 12,
  },
  callBtn: {
    flex: 1,
    minWidth: 70,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(96, 165, 250, 0.3)',
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: {
    color: '#93c5fd',
    fontWeight: '700',
    fontSize: 12,
  },
  callBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  callBtnDisabledText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '600',
    fontSize: 11,
  },
  declineBtn: {
    flex: 1,
    minWidth: 80,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
