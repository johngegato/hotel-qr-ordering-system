import React, { useState, useEffect, useCallback } from 'react'
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface BookingSlot {
  id: string
  therapistId: string | null
  therapistName: string
  serviceName: string
  roomNumber: string
  guestPhone: string
  startTime: string   // "HH:MM" 24h
  endTime: string     // "HH:MM" 24h
  status: string
  isOnCall: boolean
  source: 'request' | 'lock'
}

interface SpaTimetableProps {
  onRefreshQueue?: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
]

const FALLBACK_THERAPISTS: Therapist[] = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    hotel_id: HOTEL_ID,
    full_name: 'Elena Rostova',
    is_on_call: false,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    hotel_id: HOTEL_ID,
    full_name: 'Marcus Vance',
    is_on_call: true,
    is_active: true,
    created_at: new Date().toISOString(),
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function convertTo24Hour(timeStr: string): string {
  if (!timeStr) return '14:00'
  const trimmed = timeStr.trim()

  // If the value looks like an ISO datetime (contains 'T'), parse it and extract hours/minutes
  if (trimmed.includes('T')) {
    try {
      const d = new Date(trimmed)
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
      }
    } catch (e) {
      // fall through to other parsing strategies
    }
  }

  // Match common formats like '14:00' or '2:00 PM'
  const regex = /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i
  const match = trimmed.match(regex)
  if (!match) return trimmed

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, hoursStr, minutesStr, modifier] = match
  let hours = parseInt(hoursStr, 10)
  const minutes = minutesStr

  if (modifier) {
    const mod = modifier.toUpperCase()
    if (mod === 'PM' && hours < 12) hours += 12
    else if (mod === 'AM' && hours === 12) hours = 0
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`
}


function getDateRange(day: 'today' | 'tomorrow'): { from: string; to: string } {
  const base = new Date()
  if (day === 'tomorrow') base.setDate(base.getDate() + 1)
  base.setHours(0, 0, 0, 0)
  const from = base.toISOString()
  const to = new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString()
  return { from, to }
}

function slotHour(time: string): number {
  return parseInt(time.split(':')[0], 10)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpaTimetable({ onRefreshQueue }: SpaTimetableProps) {
  const [loading, setLoading] = useState(true)
  const [therapists, setTherapists] = useState<Therapist[]>(FALLBACK_THERAPISTS)
  const [bookings, setBookings] = useState<BookingSlot[]>([])
  const [historyBookings, setHistoryBookings] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')

  // UI state
  const [isExpanded, setIsExpanded] = useState(false) // false = minimized (booked only)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<EditableBooking | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [quickAddSlot, setQuickAddSlot] = useState<QuickAddSlot | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTimetableData = useCallback(async () => {
    try {
      setLoading(true)
      const { from, to } = getDateRange(selectedDay)

      // 1. Therapists
      const { data: therapistData } = await supabase
        .from('therapists')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .eq('is_active', true)
        .order('is_on_call', { ascending: true })

      const loadedTherapists: Therapist[] = (therapistData && therapistData.length > 0)
        ? therapistData
        : FALLBACK_THERAPISTS
      setTherapists(loadedTherapists)

      // 2. Active spa bookings for selected day (by created_at date range)
      //    Also include CONFIRMED with no date filter as fallback — guest bookings
      //    may have been created on a different day but have a slot_time today
      const { data: requestData } = await supabase
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['CONFIRMED', 'PENDING', 'PENDING_ON_CALL'])

      // 3. History — last 10 completed/cancelled
      const { data: doneData } = await (supabase as any)
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['COMPLETED', 'CANCELLED', 'RESOLVED'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (doneData) setHistoryBookings(doneData)

      // 4. Slot locks
      const { data: locksData } = await supabase
        .from('spa_slot_locks')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .in('status', ['BOOKED', 'HELD'])
        .gte('start_time', from)
        .lt('start_time', to)

      // ── Build BookingSlot list ──
      const slotBookings: BookingSlot[] = []

      if (requestData) {
        requestData.forEach((req: any) => {
          const payload = req.payload || {}
          const rawSlot = payload.slot_time || payload.display_time || '14:00'
          const startTime = convertTo24Hour(String(rawSlot))

          // Prefer filtering by the scheduled slot datetime (derived from slot_time)
          // instead of the request `created_at`. This ensures bookings created
          // on a different day but scheduled for the selected day appear correctly
          // in the timetable. Fall back to created_at heuristics only when slot
          // time cannot be parsed.
          const dayFrom = new Date(from)
          const dayTo = new Date(to)
          let withinDay = false
          try {
            const [hhStr, mmStr] = startTime.split(':')
            const hh = Number(hhStr || '14')
            const mm = Number(mmStr || '0')
            const slotDate = new Date(dayFrom)
            slotDate.setHours(hh, mm, 0, 0)
            withinDay = slotDate >= dayFrom && slotDate < dayTo
          } catch (e) {
            // if parsing fails, fall back to created_at based heuristic
            const createdAt = new Date(req.created_at)
            const isOlderThanYesterday = createdAt < new Date(dayFrom.getTime() - 24 * 60 * 60 * 1000)
            withinDay = !isOlderThanYesterday
          }

          // Always include PENDING_ON_CALL entries as they may not have reliable slot datetimes
          if (!withinDay && req.status !== 'PENDING_ON_CALL') return

          const serviceName = payload.service_name || 'Spa Treatment'
          // Derive room number from multiple possible payload keys or the rooms relation
          const payloadRoom = payload.room_number ?? payload.room ?? payload.room_no ?? payload.roomNumber ?? req.rooms?.room_number ?? ''
          let roomNumber = payloadRoom ? String(payloadRoom) : ''
          if (!roomNumber || roomNumber === 'null') {
            // Debug: log requests missing room info so we can inspect the payload in the browser console
            try { console.debug('[SpaTimetable] missing room for request', { id: req.id, payload }) } catch (e) {}
          }
          if (!roomNumber) roomNumber = 'Room —'
          else if (!roomNumber.startsWith('Room')) roomNumber = `Room ${roomNumber}`
          const guestPhone = payload.guest_phone || payload.phone || ''
          const isOnCall = req.status === 'PENDING_ON_CALL' || payload.is_on_call === true

          // Resolve therapist: use therapist_id from payload if available,
          // else assign based on on-call flag
          const therapistId = payload.therapist_id
            || (isOnCall ? '20000000-0000-0000-0000-000000000002' : '20000000-0000-0000-0000-000000000001')

          const therapistName = payload.assigned_therapist
            || loadedTherapists.find(t => t.id === therapistId)?.full_name
            || (isOnCall ? 'Marcus Vance' : 'Elena Rostova')

          const dur = Number(payload.duration_mins || 60)
          const [hh, mm] = startTime.split(':').map(Number)
          const endMin = hh * 60 + (mm || 0) + dur
          const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`

          slotBookings.push({
            id: req.id,
            therapistId,
            therapistName,
            serviceName,
            roomNumber,
            guestPhone,
            startTime,
            endTime,
            status: req.status,
            isOnCall,
            source: 'request',
          })
        })
      }

      if (locksData) {
        locksData.forEach((lock: SpaSlotLock) => {
          const alreadyCovered = slotBookings.some(
            b => b.id === lock.id || (lock.session_id && b.id === lock.session_id)
          )
          if (!alreadyCovered) {
            const startHour = new Date(lock.start_time).getHours()
            const therapist = loadedTherapists.find(t => t.id === lock.therapist_id)
            slotBookings.push({
              id: lock.id,
              therapistId: lock.therapist_id,
              therapistName: therapist?.full_name || 'Unknown Therapist',
              serviceName: 'Slot Reserved',
              roomNumber: 'Spa Desk',
              guestPhone: '',
              startTime: `${String(startHour).padStart(2, '0')}:00`,
              endTime: `${String(startHour + 1).padStart(2, '0')}:00`,
              status: lock.status,
              isOnCall: false,
              source: 'lock',
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
  }, [selectedDay])

  useEffect(() => {
    fetchTimetableData()

    const channel = supabase.channel('spa-timetable-realtime')
    // Listen to INSERT/UPDATE/DELETE on requests and spa_slot_locks so timetable refreshes reliably
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, () => fetchTimetableData())
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, () => fetchTimetableData())
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'requests' }, () => fetchTimetableData())

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spa_slot_locks' }, () => fetchTimetableData())
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spa_slot_locks' }, () => fetchTimetableData())
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'spa_slot_locks' }, () => fetchTimetableData())

    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchTimetableData])

  // Fallback: listen to client-side revalidation events (dispatched by SpaQueue)
  useEffect(() => {
    try {
      const handler = () => fetchTimetableData()
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('spa:revalidate', handler as EventListener)
        return () => { window.removeEventListener('spa:revalidate', handler as EventListener) }
      }
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTimetableData])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleQuickAdd = (slotTime: string, therapist: Therapist) => {
    setQuickAddSlot({
      slotTime,
      therapistId: therapist.id,
      therapistName: therapist.full_name,
      isOnCall: therapist.is_on_call,
    })
    setIsManualOpen(true)
  }

  const execDeleteBooking = async (booking: BookingSlot) => {
    setDeleting(true)
    try {
      if (booking.source === 'request') {
        await (supabase as any)
          .from('requests')
          .update({ status: 'CANCELLED' })
          .eq('id', booking.id)
      } else {
        await (supabase as any)
          .from('spa_slot_locks')
          .update({ status: 'CANCELLED' })
          .eq('id', booking.id)
      }

      await (supabase as any)
        .from('audit_logs')
        .insert([{
          hotel_id: HOTEL_ID,
          request_id: booking.source === 'request' ? booking.id : null,
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

  const openEditModal = (b: BookingSlot) => {
    setSelectedBooking({
      id: b.id,
      roomNumber: b.roomNumber,
      guestPhone: b.guestPhone,
      serviceName: b.serviceName,
      startTime: b.startTime,
      therapistId: b.therapistId,
      therapistName: b.therapistName,
      isOnCall: b.isOnCall,
      status: b.status,
    })
    setIsEditOpen(true)
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  // Slots that have at least one booking (for minimized view)
  const bookedSlots = TIME_SLOTS.filter(slot =>
    bookings.some(b => slotHour(b.startTime) === slotHour(slot))
  )

  const displaySlots = isExpanded ? TIME_SLOTS : bookedSlots

  const totalBooked = bookings.length

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderBookingCard = (b: BookingSlot) => {
    const isConfirmed = b.status === 'CONFIRMED'
    const isOnCall = b.isOnCall || b.status === 'PENDING_ON_CALL'
    const cardStyle = isOnCall ? styles.bookingOnCall
      : isConfirmed ? styles.bookingConfirmed
      : styles.bookingPending

    if (confirmDeleteId === b.id) {
      return (
        <View key={b.id} style={[styles.bookingCard, cardStyle]}>
          <View style={styles.confirmOverlay}>
            <Text style={styles.confirmText}>Cancel this booking?</Text>
            <View style={styles.confirmBtns}>
              <Pressable style={styles.confirmNo} onPress={() => setConfirmDeleteId(null)}>
                <Text style={styles.confirmNoText}>Keep</Text>
              </Pressable>
              <Pressable
                style={styles.confirmYes}
                onPress={() => execDeleteBooking(b)}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmYesText}>Yes, Cancel</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      )
    }

    return (
      <Pressable key={b.id} style={[styles.bookingCard, cardStyle]} onPress={() => openEditModal(b)}>
        <View style={styles.cardTopRow}>
          <Text style={styles.bookingRoom} numberOfLines={1}>{b.roomNumber}</Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => setConfirmDeleteId(b.id)}
          >
            <Text style={styles.cardDeleteIcon}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.bookingService} numberOfLines={1}>{b.serviceName}</Text>
        <Text style={styles.bookingTimeTag}>⏰ {b.startTime} → {b.endTime}</Text>
        {!!b.guestPhone && (
          <Text style={styles.bookingPhone} numberOfLines={1}>📞 {b.guestPhone}</Text>
        )}
        <View style={[styles.statusPill, isOnCall ? styles.pillOnCall : isConfirmed ? styles.pillConfirmed : styles.pillPending]}>
          <Text style={styles.statusPillText}>
            {isOnCall ? '⚡ On-Call' : isConfirmed ? '✓ Confirmed' : '⏳ Pending'}
          </Text>
        </View>
      </Pressable>
    )
  }

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>🗓️ Spa Master Timetable</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalBooked} Booked</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Walk-in button */}
          <TouchableOpacity
            style={styles.walkInBtn}
            onPress={() => { setQuickAddSlot(null); setIsManualOpen(true) }}
          >
            <Text style={styles.walkInBtnText}>+ Walk-in</Text>
          </TouchableOpacity>

          {/* Expand / Minimize toggle */}
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setIsExpanded(prev => !prev)}
          >
            <Text style={styles.toggleBtnText}>
              {isExpanded ? '⊟ Minimize' : '⊞ Expand'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Day Selector ── */}
      <View style={styles.daySelector}>
        {(['today', 'tomorrow'] as const).map(day => (
          <TouchableOpacity
            key={day}
            style={[styles.dayTab, selectedDay === day && styles.dayTabActive]}
            onPress={() => setSelectedDay(day)}
          >
            <Text style={[styles.dayTabText, selectedDay === day && styles.dayTabTextActive]}>
              {day === 'today' ? 'Today' : 'Tomorrow'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── View Mode Label ── */}
      <View style={styles.viewModeBanner}>
        {isExpanded ? (
          <Text style={styles.viewModeText}>
            📋 Full timetable — {TIME_SLOTS.length} slots · tap empty slot to quick-add
          </Text>
        ) : (
          <Text style={styles.viewModeText}>
            {totalBooked === 0
              ? '✨ No bookings yet — tap ⊞ Expand to see all slots'
              : `Showing ${totalBooked} booked slot${totalBooked !== 1 ? 's' : ''} — tap ⊞ Expand for full view`}
          </Text>
        )}
      </View>

      {/* ── Loading ── */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#a78bfa" />
          <Text style={styles.loadingText}>Updating timetable...</Text>
        </View>
      ) : (

        /* ── Timetable Grid ── */
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 400 }}>

            {/* Column headers */}
            <View style={styles.tableHeaderRow}>
              <View style={styles.timeColHeader}>
                <Text style={styles.headerColText}>Time</Text>
              </View>
              {therapists.map(t => (
                <View
                  key={t.id}
                  style={[styles.therapistColHeader, t.is_on_call && styles.onCallColHeader]}
                >
                  <Text style={styles.therapistName}>{t.full_name}</Text>
                  <Text style={[styles.therapistBadge, t.is_on_call ? styles.onCallColor : styles.inHouseColor]}>
                    {t.is_on_call ? '⚡ On-Call' : '🏠 In-House'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Slot rows */}
            {displaySlots.length === 0 ? (
              <View style={styles.emptyGrid}>
                <Text style={styles.emptyGridIcon}>💆</Text>
                <Text style={styles.emptyGridTitle}>No bookings today</Text>
                <Text style={styles.emptyGridSub}>
                  Tap "+ Walk-in" to add a booking, or "⊞ Expand" to see all time slots.
                </Text>
              </View>
            ) : (
              displaySlots.map(slot => {
                const hour = slotHour(slot)
                const isBooked = bookings.some(b => slotHour(b.startTime) === hour)

                return (
                  <View key={slot} style={[styles.tableRow, isBooked && styles.tableRowBooked]}>
                    {/* Time label */}
                    <View style={styles.timeCell}>
                      <Text style={[styles.timeText, isBooked && styles.timeTextBooked]}>{slot}</Text>
                    </View>

                    {/* One cell per therapist */}
                    {therapists.map(t => {
                      const booking = bookings.find(
                        b => slotHour(b.startTime) === hour && b.therapistId === t.id
                      )

                      return (
                        <View key={`${t.id}-${slot}`} style={styles.slotCell}>
                          {booking ? (
                            renderBookingCard(booking)
                          ) : isExpanded ? (
                            <TouchableOpacity
                              style={styles.emptySlot}
                              onPress={() => handleQuickAdd(slot, t)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.emptySlotText}>+ Add</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.minimizedDotContainer}>
                              <Text style={styles.timeDot}>●</Text>
                            </View>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Legend ── */}
      <View style={styles.legendRow}>
        {[
          { color: '#4ade80', label: 'Confirmed' },
          { color: '#fbbf24', label: 'On-Call' },
          { color: '#a78bfa', label: 'Pending' },
        ].map(l => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>

      {/* ── History Toggle ── */}
      <View style={styles.historySection}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() => setShowHistory(prev => !prev)}
        >
          <Text style={styles.historyTitle}>
            📜 Booking History ({historyBookings.length})
          </Text>
          <Text style={styles.historyArrow}>{showHistory ? '▲ Hide' : '▼ View'}</Text>
        </TouchableOpacity>

        {showHistory && (
          <View style={styles.historyList}>
            {historyBookings.length === 0 ? (
              <Text style={styles.emptyHistoryText}>No completed or cancelled bookings yet.</Text>
            ) : (
              historyBookings.map((item: any) => {
                const p = item.payload || {}
                const cancelled = item.status === 'CANCELLED'
                return (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyTopRow}>
                      <Text style={styles.historyRoom}>
                        {p.room_number || 'Room'} · {p.service_name || 'Spa Service'}
                      </Text>
                      <Text style={[styles.historyBadge, cancelled ? styles.badgeCancelled : styles.badgeCompleted]}>
                        {cancelled ? '✕ Cancelled' : '✓ Completed'}
                      </Text>
                    </View>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyMeta}>⏰ {p.slot_time || '—'}</Text>
                      <Text style={styles.historyMeta}>👤 {p.assigned_therapist || 'Therapist'}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}
      </View>

      {/* ── Modals ── */}
      <ManualSpaBookingModal
        isOpen={isManualOpen}
        quickAddSlot={quickAddSlot}
        onClose={() => { setIsManualOpen(false); setQuickAddSlot(null) }}
        onCreated={() => {
          fetchTimetableData()
          if (onRefreshQueue) onRefreshQueue()
        }}
      />

      <EditSpaBookingModal
        isOpen={isEditOpen}
        booking={selectedBooking}
        onClose={() => { setIsEditOpen(false); setSelectedBooking(null) }}
        onSaved={() => {
          fetchTimetableData()
          if (onRefreshQueue) onRefreshQueue()
        }}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  countBadge: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderColor: 'rgba(167,139,250,0.35)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countBadgeText: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walkInBtn: {
    backgroundColor: '#a78bfa',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  walkInBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  toggleBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },

  // Day selector
  daySelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 3,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 9,
  },
  dayTabActive: {
    backgroundColor: '#a78bfa',
  },
  dayTabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  dayTabTextActive: {
    color: '#0f172a',
    fontWeight: 'bold',
  },

  // View mode banner
  viewModeBanner: {
    backgroundColor: 'rgba(167,139,250,0.07)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  viewModeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 13,
  },

  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  timeColHeader: {
    width: 64,
    alignItems: 'center',
    paddingVertical: 8,
  },
  headerColText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  therapistColHeader: {
    flex: 1,
    minWidth: 180,
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderColor: 'rgba(74,222,128,0.2)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  onCallColHeader: {
    borderColor: 'rgba(251,191,36,0.3)',
    backgroundColor: 'rgba(45,35,20,0.7)',
  },
  therapistName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  therapistBadge: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  inHouseColor: { color: '#4ade80' },
  onCallColor: { color: '#fbbf24' },

  // Slot rows
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: 3,
  },
  tableRowBooked: {
    // subtle highlight for rows that have bookings
  },
  timeCell: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  timeText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  timeTextBooked: {
    color: '#fbbf24',
    fontWeight: 'bold',
  },
  timeDot: {
    color: '#fbbf24',
    fontSize: 6,
  },
  minimizedDotContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCell: {
    flex: 1,
    minWidth: 180,
    minHeight: 80,
    marginHorizontal: 3,
  },

  // Empty slot (expanded mode)
  emptySlot: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  emptySlotText: {
    color: '#334155',
    fontSize: 11,
  },

  // Empty grid state (no bookings, minimized)
  emptyGrid: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyGridIcon: {
    fontSize: 36,
  },
  emptyGridTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptyGridSub: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },

  // Booking card
  bookingCard: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    gap: 3,
    overflow: 'hidden',
  },
  bookingConfirmed: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.35)',
    borderWidth: 1,
  },
  bookingOnCall: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderColor: 'rgba(251,191,36,0.45)',
    borderWidth: 1,
  },
  bookingPending: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderColor: 'rgba(167,139,250,0.35)',
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookingRoom: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    flex: 1,
  },
  cardDeleteIcon: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
    paddingLeft: 4,
  },
  bookingService: {
    color: '#cbd5e1',
    fontSize: 10,
  },
  bookingTimeTag: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '600',
  },
  bookingPhone: {
    color: '#93c5fd',
    fontSize: 9,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 2,
  },
  pillConfirmed: { backgroundColor: 'rgba(74,222,128,0.2)' },
  pillOnCall: { backgroundColor: 'rgba(251,191,36,0.2)' },
  pillPending: { backgroundColor: 'rgba(167,139,250,0.2)' },
  statusPillText: {
    color: '#e2e8f0',
    fontSize: 8,
    fontWeight: '700',
  },

  // Inline delete confirm
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.97)',
    borderRadius: 10,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
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

  // Legend
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    color: '#64748b',
    fontSize: 10,
  },

  // History
  historySection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
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
  historyBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeCompleted: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    color: '#4ade80',
  },
  badgeCancelled: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    color: '#f87171',
  },
  historyMetaRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 10,
  },
})
