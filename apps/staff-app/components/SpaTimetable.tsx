import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'
import EditSpaBookingModal, { type EditableBooking } from './EditSpaBookingModal'
import ManualSpaBookingModal, { type QuickAddSlot } from './ManualSpaBookingModal'

export interface Therapist {
  id: string
  hotel_id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
  created_at: string
}

export interface SpaSlotLock {
  id: string
  hotel_id: string
  therapist_id: string | null
  session_id: string | null
  start_time: string
  end_time: string
  status: 'HELD' | 'BOOKED' | 'EXPIRED' | 'CANCELLED'
  expires_at: string
  created_at: string
}

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface SpaTimetableProps {
  onRefreshQueue?: () => void
}

interface BookingSlot {
  id: string
  therapistId: string | null
  therapistName: string
  serviceName: string
  roomNumber: string
  guestPhone: string
  startTime: string
  endTime: string
  status: string
  isOnCall: boolean
}

export function convertTo24Hour(timeStr: string): string {
  if (!timeStr) return '14:00'
  const trimmed = timeStr.trim()
  const regex = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i
  const match = trimmed.match(regex)
  if (!match) return timeStr

  let [_, hoursStr, minutesStr, modifier] = match
  let hours = parseInt(hoursStr, 10)
  const minutes = minutesStr

  if (modifier) {
    const mod = modifier.toUpperCase()
    if (mod === 'PM' && hours < 12) {
      hours += 12
    } else if (mod === 'AM' && hours === 12) {
      hours = 0
    }
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`
}

export default function SpaTimetable({ onRefreshQueue }: SpaTimetableProps) {
  const [loading, setLoading] = useState(true)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [bookings, setBookings] = useState<BookingSlot[]>([])
  const [historyBookings, setHistoryBookings] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')
  const [selectedBooking, setSelectedBooking] = useState<EditableBooking | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [quickAddSlot, setQuickAddSlot] = useState<QuickAddSlot | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  // ID of booking pending inline delete confirmation (null = none)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const timeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ]

  const fetchTimetableData = async () => {
    try {
      setLoading(true)

      // 1. Fetch Therapists
      const { data: therapistData } = await supabase
        .from('therapists')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .eq('is_active', true)
        .order('is_on_call', { ascending: true })

      const loadedTherapists: Therapist[] = therapistData || [
        {
          id: '20000000-0000-0000-0000-000000000001',
          hotel_id: HOTEL_ID,
          full_name: 'Elena Rostova (In-House)',
          is_on_call: false,
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: '20000000-0000-0000-0000-000000000002',
          hotel_id: HOTEL_ID,
          full_name: 'Marcus Vance (On-Call)',
          is_on_call: true,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]
      setTherapists(loadedTherapists)

      // 2. Fetch Confirmed/Pending Spa Requests for active timetable
      const { data: requestData } = await supabase
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['CONFIRMED', 'PENDING', 'PENDING_ON_CALL'])

      // 3. Fetch Completed / Cancelled Spa Requests for History
      const { data: doneData } = await (supabase as any)
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['COMPLETED', 'CANCELLED', 'RESOLVED'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (doneData) setHistoryBookings(doneData)

      // 4. Fetch Slot Locks
      const { data: locksData } = await supabase
        .from('spa_slot_locks')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .in('status', ['BOOKED', 'HELD'])

      const slotBookings: BookingSlot[] = []

      // Process requests into slot bookings
      if (requestData) {
        requestData.forEach((req: any) => {
          const payload = (req.payload as any) || {}
          const rawSlotTimeStr = payload.slot_time || '14:00'
          const slotTimeStr = convertTo24Hour(rawSlotTimeStr)
          const serviceName = payload.service_name || 'Spa Treatment'
          const rawRoom = payload.room_number || (req.rooms?.room_number ? `Room ${req.rooms.room_number}` : 'Room 302')
          const roomNumber = String(rawRoom).startsWith('Room') ? String(rawRoom) : `Room ${rawRoom}`
          const guestPhone = payload.guest_phone || payload.phone || ''
          const isOnCall = req.status === 'PENDING_ON_CALL' || payload.is_on_call === true
          const assignedTherapist = payload.assigned_therapist || (isOnCall ? 'Marcus Vance (On-Call)' : 'Elena Rostova (In-House)')

          const resolvedTherapistId =
            payload.therapist_id ||
            (isOnCall
              ? '20000000-0000-0000-0000-000000000002'
              : '20000000-0000-0000-0000-000000000001')

          slotBookings.push({
            id: req.id,
            therapistId: resolvedTherapistId,
            therapistName: assignedTherapist,
            serviceName,
            roomNumber,
            guestPhone,
            startTime: slotTimeStr,
            endTime: (() => {
              const [hh, mm] = slotTimeStr.split(':').map(Number)
              const dur = (payload.duration_mins as number) ?? 60
              const totalMin = hh * 60 + (mm || 0) + dur
              return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
            })(),
            status: req.status,
            isOnCall,
          })
        })
      }

      if (locksData) {
        locksData.forEach((lock: SpaSlotLock) => {
          const alreadyCovered = slotBookings.some(
            (b) => b.id === lock.id || (lock.session_id && b.id === lock.session_id)
          )
          if (!alreadyCovered) {
            const startHour = new Date(lock.start_time).getHours()
            slotBookings.push({
              id: lock.id,
              therapistId: lock.therapist_id,
              therapistName: lock.therapist_id === '20000000-0000-0000-0000-000000000002' ? 'Marcus Vance (On-Call)' : 'Elena Rostova (In-House)',
              serviceName: 'Slot Reserved',
              roomNumber: 'Spa Desk',
              guestPhone: '',
              startTime: `${startHour.toString().padStart(2, '0')}:00`,
              endTime: `${startHour + 1}:00`,
              status: lock.status,
              isOnCall: false,
            })
          }
        })
      }

      setBookings(slotBookings)
    } catch (err) {
      console.error('Error fetching spa timetable:', err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Auto-Completion Check (Time-based) ────────────────────────────────────
  const checkAutoCompletion = async () => {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    for (const b of bookings) {
      if (b.status === 'CONFIRMED' || b.status === 'PENDING') {
        const [endH, endM] = b.endTime.split(':').map(Number)
        const bookingEndMinutes = endH * 60 + (endM || 0)

        // If current time has passed the booking end time, auto-complete it
        if (currentMinutes >= bookingEndMinutes) {
          try {
            await (supabase as any)
              .from('requests')
              .update({ status: 'COMPLETED' })
              .eq('id', b.id)

            await (supabase as any)
              .from('audit_logs')
              .insert([{
                hotel_id: HOTEL_ID,
                request_id: b.id,
                action: 'BOOKING_AUTO_COMPLETED',
                details: {
                  room_number: b.roomNumber,
                  service_name: b.serviceName,
                  end_time: b.endTime,
                  completed_at: now.toISOString(),
                },
              }])

            fetchTimetableData()
            if (onRefreshQueue) onRefreshQueue()
          } catch (err) {
            console.error('Auto-completion update failed:', err)
          }
        }
      }
    }
  }

  useEffect(() => {
    fetchTimetableData()

    const channel = supabase
      .channel('public:spa_timetable')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => fetchTimetableData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spa_slot_locks' }, () => fetchTimetableData())
      .subscribe()

    // Run auto-completion check every 60 seconds
    const timer = setInterval(() => {
      checkAutoCompletion()
    }, 60000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [selectedDay])

  // ─── Quick-Add & Delete Handlers ──────────────────────────────────────────

  const handleQuickAdd = (slotTime: string, therapist: Therapist) => {
    setQuickAddSlot({
      slotTime,
      therapistId: therapist.id,
      therapistName: therapist.full_name,
      isOnCall: therapist.is_on_call,
    })
    setIsManualOpen(true)
  }

  // Executes the actual DB cancel — called after inline confirmation
  const execDeleteBooking = async (booking: BookingSlot) => {
    setDeleting(true)
    try {
      await (supabase as any)
        .from('requests')
        .update({ status: 'CANCELLED' })
        .eq('id', booking.id)

      await (supabase as any)
        .from('audit_logs')
        .insert([{
          hotel_id: HOTEL_ID,
          request_id: booking.id,
          action: 'BOOKING_CANCELLED',
          details: {
            source: 'timetable_card_delete',
            room_number: booking.roomNumber,
            service: booking.serviceName,
            slot_time: booking.startTime,
          },
        }])

      fetchTimetableData()
      if (onRefreshQueue) onRefreshQueue()
    } catch (err) {
      console.error('Delete booking failed:', err)
    } finally {
      setConfirmDeleteId(null)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#a78bfa" />
        <Text style={styles.loadingText}>Updating Spa Timetable...</Text>
      </View>
    )
  }

  return (
    <View style={styles.timetableContainer}>
      {/* Timetable Header Controls */}
      <View style={styles.controlHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.timetableTitle}>🗓️ Spa Master Timetable</Text>
          <TouchableOpacity
            style={styles.walkInBtn}
            onPress={() => {
              setQuickAddSlot(null)
              setIsManualOpen(true)
            }}
          >
            <Text style={styles.walkInBtnText}>+ Walk-in</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.daySelector}>
          <TouchableOpacity
            style={[styles.dayTab, selectedDay === 'today' && styles.dayTabActive]}
            onPress={() => setSelectedDay('today')}
          >
            <Text style={[styles.dayTabText, selectedDay === 'today' && styles.dayTabTextActive]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dayTab, selectedDay === 'tomorrow' && styles.dayTabActive]}
            onPress={() => setSelectedDay('tomorrow')}
          >
            <Text style={[styles.dayTabText, selectedDay === 'tomorrow' && styles.dayTabTextActive]}>Tomorrow</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
          <Text style={styles.legendText}>Confirmed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
          <Text style={styles.legendText}>On-Call Booking</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#a78bfa' }]} />
          <Text style={styles.legendText}>Pending Check</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendText}>⚡ Tap empty slot to Quick-Add</Text>
        </View>
      </View>

      {/* Timetable Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.gridTable}>
          {/* Table Header: Therapists */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.timeColumnHeader}>
              <Text style={styles.headerColText}>Time</Text>
            </View>
            {therapists.map((t) => (
              <View key={t.id} style={[styles.therapistColHeader, t.is_on_call && styles.onCallTherapistHeader]}>
                <Text style={styles.therapistNameText}>{t.full_name}</Text>
                <Text style={[styles.therapistBadgeText, t.is_on_call ? styles.onCallBadgeColor : styles.inHouseBadgeColor]}>
                  {t.is_on_call ? '⚡ On-Call Specialist' : '🏠 In-House Staff'}
                </Text>
              </View>
            ))}
          </View>

          {/* Time Slot Rows */}
          {timeSlots.map((slot) => {
            return (
              <View key={slot} style={styles.tableRow}>
                {/* Time Cell */}
                <View style={styles.timeCell}>
                  <Text style={styles.timeText}>{slot}</Text>
                </View>

                {/* Therapist Slot Cells */}
                {therapists.map((t) => {
                  const slotHour = parseInt(slot.split(':')[0], 10)
                  const matchingBooking = bookings.find((b) => {
                    if (b.therapistId !== t.id) return false
                    const bookingHour = parseInt(b.startTime.split(':')[0], 10)
                    return bookingHour === slotHour
                  })

                  return (
                    <View key={`${t.id}-${slot}`} style={styles.slotCell}>
                      {matchingBooking ? (
                        <View
                          style={[
                            styles.bookingCard,
                            matchingBooking.isOnCall ? styles.bookingOnCall
                              : matchingBooking.status === 'CONFIRMED' ? styles.bookingConfirmed
                              : styles.bookingPending,
                          ]}
                        >
                          {/* ── Inline Delete Confirmation Overlay ── */}
                          {confirmDeleteId === matchingBooking.id ? (
                            <View style={styles.confirmOverlay}>
                              <Text style={styles.confirmText}>Cancel this booking?</Text>
                              <View style={styles.confirmBtns}>
                                <Pressable
                                  style={styles.confirmNo}
                                  onPress={() => setConfirmDeleteId(null)}
                                >
                                  <Text style={styles.confirmNoText}>Keep</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.confirmYes}
                                  onPress={() => execDeleteBooking(matchingBooking)}
                                  disabled={deleting}
                                >
                                  {deleting
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.confirmYesText}>Yes, Cancel</Text>
                                  }
                                </Pressable>
                              </View>
                            </View>
                          ) : (
                            <>
                              {/* Top row: room + time + delete trigger */}
                              <View style={styles.cardTopRow}>
                                <Pressable
                                  style={{ flex: 1 }}
                                  onPress={() => {
                                    setSelectedBooking({
                                      id: matchingBooking.id,
                                      roomNumber: matchingBooking.roomNumber,
                                      guestPhone: matchingBooking.guestPhone,
                                      serviceName: matchingBooking.serviceName,
                                      startTime: matchingBooking.startTime,
                                      therapistId: matchingBooking.therapistId,
                                      therapistName: matchingBooking.therapistName,
                                      isOnCall: matchingBooking.isOnCall,
                                      status: matchingBooking.status,
                                    })
                                    setIsEditOpen(true)
                                  }}
                                >
                                  <Text style={styles.bookingRoom}>{matchingBooking.roomNumber}</Text>
                                  <Text style={styles.bookingTimeTag}>⏰ {matchingBooking.startTime}</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.cardDeleteBtn}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  onPress={(e) => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(matchingBooking.id)
                                  }}
                                >
                                  <Text style={styles.cardDeleteIcon}>🗑️</Text>
                                </Pressable>
                              </View>
                              {/* Tappable body – opens Edit modal */}
                              <Pressable
                                onPress={() => {
                                  setSelectedBooking({
                                    id: matchingBooking.id,
                                    roomNumber: matchingBooking.roomNumber,
                                    guestPhone: matchingBooking.guestPhone,
                                    serviceName: matchingBooking.serviceName,
                                    startTime: matchingBooking.startTime,
                                    therapistId: matchingBooking.therapistId,
                                    therapistName: matchingBooking.therapistName,
                                    isOnCall: matchingBooking.isOnCall,
                                    status: matchingBooking.status,
                                  })
                                  setIsEditOpen(true)
                                }}
                              >
                                <Text style={styles.bookingService} numberOfLines={1}>
                                  {matchingBooking.serviceName}
                                </Text>
                                {matchingBooking.guestPhone ? (
                                  <Text style={styles.bookingPhone} numberOfLines={1}>
                                    📞 {matchingBooking.guestPhone}
                                  </Text>
                                ) : null}
                                <Text style={styles.bookingStatusText}>
                                  {matchingBooking.status === 'CONFIRMED'
                                    ? '✓ Confirmed'
                                    : matchingBooking.isOnCall
                                    ? '⚡ On-Call'
                                    : '⏳ Pending'}
                                </Text>
                              </Pressable>
                            </>
                          )}
                        </View>
                      ) : (
                        /* Quick-Add via Timetable: Tap empty cell to pre-fill slot & therapist */
                        <TouchableOpacity
                          style={styles.availableSlot}
                          onPress={() => handleQuickAdd(slot, t)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.availableText}>+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* History / Done Bookings Toggle Section */}
      <View style={styles.historySection}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() => setShowHistory(!showHistory)}
        >
          <Text style={styles.historyTitle}>
            📜 Booking History & Auto-Completed Logs ({historyBookings.length})
          </Text>
          <Text style={styles.historyArrow}>{showHistory ? '▲ Hide' : '▼ View'}</Text>
        </TouchableOpacity>

        {showHistory && (
          <View style={styles.historyList}>
            {historyBookings.length === 0 ? (
              <Text style={styles.emptyHistoryText}>No completed or cancelled bookings yet.</Text>
            ) : (
              historyBookings.map((item: any) => {
                const payload = item.payload || {}
                const isCancelled = item.status === 'CANCELLED'
                return (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyTopRow}>
                      <Text style={styles.historyRoom}>
                        {payload.room_number || 'Room'} · {payload.service_name || 'Spa Service'}
                      </Text>
                      <Text style={[styles.historyStatusBadge, isCancelled ? styles.statusCancelled : styles.statusCompleted]}>
                        {isCancelled ? '✕ Cancelled' : '✓ Completed'}
                      </Text>
                    </View>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyMeta}>⏰ {payload.slot_time || '14:00'}</Text>
                      <Text style={styles.historyMeta}>👤 {payload.assigned_therapist || 'Therapist'}</Text>
                      <Text style={styles.historyMeta}>
                        📅 {new Date(item.updated_at || item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}
      </View>

      {/* Manual Walk-in Booking Modal */}
      <ManualSpaBookingModal
        isOpen={isManualOpen}
        quickAddSlot={quickAddSlot}
        onClose={() => {
          setIsManualOpen(false)
          setQuickAddSlot(null)
        }}
        onCreated={() => {
          fetchTimetableData()
          if (onRefreshQueue) onRefreshQueue()
        }}
      />

      {/* Edit Booking Modal */}
      <EditSpaBookingModal
        isOpen={isEditOpen}
        booking={selectedBooking}
        onClose={() => {
          setIsEditOpen(false)
          setSelectedBooking(null)
        }}
        onSaved={() => {
          fetchTimetableData()
          if (onRefreshQueue) onRefreshQueue()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  timetableContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(167, 139, 250, 0.25)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 8,
    fontSize: 13,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timetableTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  daySelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 3,
  },
  dayTab: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayTabActive: {
    backgroundColor: '#a78bfa',
  },
  dayTabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  dayTabTextActive: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  gridTable: {
    minWidth: 540,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  timeColumnHeader: {
    width: 70,
    paddingVertical: 8,
    alignItems: 'center',
  },
  headerColText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 'bold',
  },
  therapistColHeader: {
    flex: 1,
    minWidth: 200,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  onCallTherapistHeader: {
    borderColor: 'rgba(251, 191, 36, 0.4)',
    backgroundColor: 'rgba(45, 35, 20, 0.6)',
  },
  therapistNameText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  therapistBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  inHouseBadgeColor: {
    color: '#4ade80',
  },
  onCallBadgeColor: {
    color: '#fbbf24',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  timeCell: {
    width: 70,
    alignItems: 'center',
  },
  timeText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 'bold',
  },
  slotCell: {
    flex: 1,
    minWidth: 200,
    minHeight: 82,
    marginHorizontal: 4,
  },
  availableSlot: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availableText: {
    color: '#475569',
    fontSize: 11,
  },
  bookingCard: {
    flex: 1,
    borderRadius: 10,
    padding: 6,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  bookingTimeTag: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: 'bold',
  },
  editIcon: {
    fontSize: 10,
    opacity: 0.6,
  },
  bookingPhone: {
    color: '#93c5fd',
    fontSize: 9,
    marginTop: 1,
  },
  bookingConfirmed: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: 'rgba(74, 222, 128, 0.4)',
    borderWidth: 1,
  },
  bookingOnCall: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.5)',
    borderWidth: 1,
  },
  bookingPending: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.4)',
    borderWidth: 1,
  },
  bookingRoom: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  bookingService: {
    color: '#cbd5e1',
    fontSize: 10,
  },
  bookingStatusText: {
    color: '#a78bfa',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  walkInBtn: {
    backgroundColor: '#a78bfa',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  walkInBtnText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardDeleteBtn: {
    padding: 2,
  },
  cardDeleteIcon: {
    fontSize: 10,
  },
  historySection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  historyArrow: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyList: {
    marginTop: 10,
    gap: 8,
  },
  emptyHistoryText: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic',
  },
  historyCard: {
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyRoom: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  historyStatusBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusCompleted: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    color: '#4ade80',
  },
  statusCancelled: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
  },
  historyMetaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 10,
  },
  // ── Inline delete confirmation overlay ──
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 10,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  confirmText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  confirmBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  confirmNo: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  confirmNoText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  confirmYes: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  confirmYesText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
})
