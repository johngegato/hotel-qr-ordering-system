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
  rawPayload?: any
  rawRequest?: any
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

function buildSlotWindow(slotTime: string, durationMins: number, day: 'today' | 'tomorrow' = 'today') {
  const dayDate = new Date()
  if (day === 'tomorrow') dayDate.setDate(dayDate.getDate() + 1)

  const [hoursText, minutesText] = slotTime.split(':')
  const hours = Number(hoursText || '0')
  const minutes = Number(minutesText || '0')

  const start = new Date(dayDate)
  start.setHours(hours, minutes, 0, 0)

  const end = new Date(start.getTime() + (durationMins || 60) * 60 * 1000)
  return { start, end }
}

const isHistoryStatus = (status?: string) => ['CANCELLED', 'DECLINED', 'RESOLVED', 'COMPLETED'].includes(String(status || ''))

const shouldMoveBookingToHistory = (request: any, selectedDay: 'today' | 'tomorrow') => {
  const status = String(request?.status || '')
  if (isHistoryStatus(status)) return true
  if (status !== 'CONFIRMED') return false

  const payload = request?.payload || {}
  const slotTime = payload.slot_time || payload.display_time || '14:00'
  const durationMins = Number(payload.duration_mins || payload.duration || 60)
  const window = buildSlotWindow(slotTime, durationMins, selectedDay)
  return new Date() > window.end
}

const timeWindowsOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime()

const releaseSpaLockForWindow = async (therapistId: string | null, slotTime: string, durationMins: number) => {
  if (!therapistId || !slotTime) return
  const { start, end } = buildSlotWindow(slotTime, durationMins, 'today')
  const now = new Date()
  const safeEnd = new Date(Math.max(end.getTime(), now.getTime()))

  await (supabase as any)
    .from('spa_slot_locks')
    .update({ status: 'EXPIRED', expires_at: now.toISOString() })
    .eq('therapist_id', therapistId)
    .in('status', ['BOOKED', 'HELD'])
    .lt('start_time', safeEnd.toISOString())
    .gt('end_time', start.toISOString())
}

function isSlotBlockedForTherapist(
  slotTime: string,
  therapistId: string | null,
  durationMins: number,
  day: 'today' | 'tomorrow',
  bookings: BookingSlot[],
) {
  if (!therapistId || !slotTime) return false

  const { start, end } = buildSlotWindow(slotTime, durationMins, day)
  return bookings.some((b) => {
    if (!b.therapistId || b.therapistId !== therapistId) return false

    const [startH, startM] = (b.startTime || '00:00').split(':').map(Number)
    const [endH, endM] = (b.endTime || '00:00').split(':').map(Number)

    const bookingStart = new Date(start)
    bookingStart.setHours(startH, startM, 0, 0)

    const bookingEnd = new Date(start)
    bookingEnd.setHours(endH, endM, 0, 0)

    return timeWindowsOverlap(start, end, bookingStart, bookingEnd)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpaTimetable({ onRefreshQueue }: SpaTimetableProps) {
  const [loading, setLoading] = useState(true)
  const [therapists, setTherapists] = useState<Therapist[]>(FALLBACK_THERAPISTS)
  const [bookings, setBookings] = useState<BookingSlot[]>([])
  const [debugOpenMap, setDebugOpenMap] = useState<Record<string, boolean>>({})
  const [historyBookings, setHistoryBookings] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')
  const [selectedHistoryBooking, setSelectedHistoryBooking] = useState<any | null>(null)

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

      // 3. History — include expired confirmations and terminal statuses. This keeps
      //    past appointments visible in Booking History instead of leaving them in the active queue.
      const { data: doneData } = await (supabase as any)
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .eq('request_type', 'SPA_BOOKING')
        .in('status', ['CONFIRMED', 'CANCELLED', 'DECLINED', 'RESOLVED', 'COMPLETED'])
        .order('created_at', { ascending: false })
        .limit(30)

      const filteredHistory = (doneData || []).filter((request: any) => shouldMoveBookingToHistory(request, selectedDay))
      setHistoryBookings(filteredHistory)

      // 4. Expire stale locks for booking windows that have already passed or were cancelled.
      const { data: staleLocks } = await (supabase as any)
        .from('spa_slot_locks')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .in('status', ['BOOKED', 'HELD'])
        .lt('end_time', new Date().toISOString())

      if (staleLocks && staleLocks.length > 0) {
        await (supabase as any)
          .from('spa_slot_locks')
          .update({ status: 'EXPIRED', expires_at: new Date().toISOString() })
          .in('id', staleLocks.map((lock: any) => lock.id))
      }

      // 5. Slot locks
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
          // Supabase may return the joined `rooms` relation as either an object
          // or an array. Normalize to extract the room_number in either case.
          const roomsVal = (req.rooms && typeof req.rooms === 'object')
            ? (Array.isArray(req.rooms) ? req.rooms[0]?.room_number : req.rooms.room_number)
            : undefined
          // Prefer the joined rooms relation (same as RequestHistory) — fall back to payload fields.
          const payloadRoom = roomsVal ?? payload.room_number ?? payload.room ?? payload.room_no ?? payload.roomNumber ?? ''
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
            rawPayload: payload,
            rawRequest: req,
          })
        })
      }

      if (locksData) {
        locksData.forEach((lock: SpaSlotLock) => {
          const lockStart = new Date(lock.start_time)
          const lockEnd = new Date(lock.end_time)

          const alreadyCovered = slotBookings.some(
            b => b.id === lock.id || (lock.session_id && b.id === lock.session_id)
          )

          const hasRequestOverlap = slotBookings.some((b) => {
            if (b.source !== 'request') return false

            const [startH, startM] = (b.startTime || '00:00').split(':').map(Number)
            const [endH, endM] = (b.endTime || '00:00').split(':').map(Number)

            const bookingStart = new Date(lockStart)
            bookingStart.setHours(startH, startM, 0, 0)

            const bookingEnd = new Date(lockStart)
            bookingEnd.setHours(endH, endM, 0, 0)

            return timeWindowsOverlap(lockStart, lockEnd, bookingStart, bookingEnd)
          })

          // Guest bookings can create a slot lock without a therapist id. If a real
          // request already occupies the same window, do not render a duplicate
          // "Spa Desk" card for the lock.
          if (hasRequestOverlap || !lock.therapist_id) return

          if (!alreadyCovered) {
            const startHour = lockStart.getHours()
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
    const isBlocked = isSlotBlockedForTherapist(slotTime, therapist.id, 60, selectedDay, bookings)
    if (isBlocked) {
      return
    }

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

        await releaseSpaLockForWindow(booking.therapistId, booking.startTime, Number((booking as any).rawRequest?.payload?.duration_mins || 60))
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

  const handleHistoryCompletion = async (item: any) => {
    if (!item?.id) return
    try {
      const payload = item.payload || {}
      const slotTime = payload.slot_time || payload.display_time || '14:00'
      const durationMins = Number(payload.duration_mins || payload.duration || 60)
      const therapistId = payload.therapist_id || null

      await (supabase as any)
        .from('requests')
        .update({ status: 'RESOLVED', claimed_at: new Date().toISOString() })
        .eq('id', item.id)

      if (therapistId) {
        await releaseSpaLockForWindow(therapistId, slotTime, durationMins)
      }

      await (supabase as any)
        .from('audit_logs')
        .insert([{
          hotel_id: HOTEL_ID,
          request_id: item.id,
          action: 'BOOKING_COMPLETED_EARLY',
          details: {
            room_number: payload.room_number || item.rooms?.room_number || 'N/A',
            service: payload.service_name || 'Spa Treatment',
            therapist_id: therapistId,
            slot_time: slotTime,
            duration_mins: durationMins,
          },
        }])

      setSelectedHistoryBooking(null)
      await fetchTimetableData()
      if (onRefreshQueue) onRefreshQueue()
    } catch (err) {
      console.error('Failed to finish spa booking:', err)
    }
  }

  const openEditModal = (b: BookingSlot) => {
    // Compute a reliable roomNumber for the edit modal: prefer the booking's
    // roomNumber, but if it's a placeholder ('Room —') derive from the
    // original request's joined rooms relation or payload to match RequestHistory.
    let modalRoom = b.roomNumber
    if (!modalRoom || modalRoom === 'Room —') {
      const req = (b as any).rawRequest
      const roomsVal = (req?.rooms && typeof req.rooms === 'object')
        ? (Array.isArray(req.rooms) ? req.rooms[0]?.room_number : req.rooms.room_number)
        : undefined
      const payloadRoom = roomsVal ?? req?.payload?.room_number ?? req?.payload?.room ?? ''
      modalRoom = payloadRoom ? (String(payloadRoom).startsWith('Room') ? String(payloadRoom) : `Room ${payloadRoom}`) : 'Room —'
    }

    setSelectedBooking({
      id: b.id,
      roomNumber: modalRoom,
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
    const isLock = b.source === 'lock'
    const cardStyle = isLock ? styles.bookingLocked
      : isOnCall ? styles.bookingOnCall
      : isConfirmed ? styles.bookingConfirmed
      : styles.bookingPending

    if (confirmDeleteId === b.id && !isLock) {
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
      <Pressable
        key={b.id}
        style={[styles.bookingCard, cardStyle]}
        onPress={() => !isLock && openEditModal(b)}
        disabled={isLock}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.bookingRoom} numberOfLines={1}>{b.roomNumber}</Text>
          {!isLock && (
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setConfirmDeleteId(b.id)}
            >
              <Text style={styles.cardDeleteIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.bookingService} numberOfLines={1}>{b.serviceName}</Text>
        <Text style={styles.bookingTimeTag}>⏰ {b.startTime} → {b.endTime}</Text>
        {!!b.guestPhone && !isLock && (
          <Text style={styles.bookingPhone} numberOfLines={1}>📞 {b.guestPhone}</Text>
        )}
        <View style={[
          styles.statusPill,
          isLock ? styles.pillLocked
            : isOnCall ? styles.pillOnCall
            : isConfirmed ? styles.pillConfirmed
            : styles.pillPending,
        ]}>
          <Text style={styles.statusPillText}>
            {isLock ? '🔒 Reserved' : isOnCall ? '⚡ On-Call' : isConfirmed ? '✓ Confirmed' : '⏳ Pending'}
          </Text>
        </View>
        {/* Dev-only: show raw payload JSON for debugging */}
        {typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production' && (
          <View style={{ marginTop: 8 }}>
            <Pressable onPress={() => setDebugOpenMap(prev => ({ ...prev, [b.id]: !prev[b.id] }))}>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>🔧 Payload</Text>
            </Pressable>
            {debugOpenMap[b.id] && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: 8, marginTop: 6, borderRadius: 8 }}>
                <Text style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }}>{JSON.stringify(b.rawPayload || {}, null, 2)}</Text>
              </View>
            )}
          </View>
        )}
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
                      const matchingBookings = bookings.filter(
                        b => slotHour(b.startTime) === hour && b.therapistId === t.id
                      )
                      const slotBlocked = isSlotBlockedForTherapist(slot, t.id, 60, selectedDay, bookings)

                      return (
                        <View key={`${t.id}-${slot}`} style={styles.slotCell}>
                          {matchingBookings.length > 0 ? (
                            <View style={styles.bookingStack}>
                              {matchingBookings.map((booking) => (
                                <View key={booking.id} style={styles.bookingStackItem}>
                                  {renderBookingCard(booking)}
                                </View>
                              ))}
                            </View>
                          ) : isExpanded ? (
                            <TouchableOpacity
                              style={[styles.emptySlot, slotBlocked && styles.emptySlotBlocked]}
                              onPress={() => !slotBlocked && handleQuickAdd(slot, t)}
                              activeOpacity={0.7}
                              disabled={slotBlocked}
                            >
                              <Text style={[styles.emptySlotText, slotBlocked && styles.emptySlotTextBlocked]}>
                                {slotBlocked ? 'Busy' : '+ Add'}
                              </Text>
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
                const cancelled = item.status === 'CANCELLED' || item.status === 'DECLINED'
                const finished = item.status === 'RESOLVED' || item.status === 'COMPLETED'
                const roomLabel = p.room_number || item.rooms?.room_number || 'Room —'

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyCard}
                    activeOpacity={0.8}
                    onPress={() => setSelectedHistoryBooking(item)}
                  >
                    <View style={styles.historyTopRow}>
                      <Text style={styles.historyRoom}>
                        {roomLabel} · {p.service_name || 'Spa Service'}
                      </Text>
                      <Text style={[styles.historyBadge, cancelled ? styles.badgeCancelled : finished ? styles.badgeCompleted : styles.badgeCompleted]}>
                        {cancelled ? '✕ Cancelled' : finished ? '✓ Completed' : '✓ Past'}
                      </Text>
                    </View>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyMeta}>⏰ {p.slot_time || '—'}</Text>
                      <Text style={styles.historyMeta}>👤 {p.assigned_therapist || 'Therapist'}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </View>
        )}
      </View>

      {selectedHistoryBooking && (
        <View style={styles.historyDetailOverlay}>
          <View style={styles.historyDetailCard}>
            <View style={styles.historyDetailHeader}>
              <Text style={styles.historyDetailTitle}>Booking Details</Text>
              <TouchableOpacity onPress={() => setSelectedHistoryBooking(null)}>
                <Text style={styles.historyDetailClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.historyDetailScroll} showsVerticalScrollIndicator={false}>
              {(() => {
                const p = selectedHistoryBooking.payload || {}
                const roomLabel = p.room_number || selectedHistoryBooking.rooms?.room_number || 'Room —'
                const staffName = p.assigned_therapist || 'Unassigned'
                const statusLabel = selectedHistoryBooking.status === 'CANCELLED' || selectedHistoryBooking.status === 'DECLINED'
                  ? 'Cancelled'
                  : selectedHistoryBooking.status === 'RESOLVED' || selectedHistoryBooking.status === 'COMPLETED'
                    ? 'Completed'
                    : 'Past booking'

                return (
                  <View style={styles.historyDetailBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}>{statusLabel}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Room</Text>
                      <Text style={styles.detailValue}>{roomLabel}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Service</Text>
                      <Text style={styles.detailValue}>{p.service_name || 'Spa Treatment'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Therapist</Text>
                      <Text style={styles.detailValue}>{staffName}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Scheduled</Text>
                      <Text style={styles.detailValue}>{p.slot_time || '—'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Duration</Text>
                      <Text style={styles.detailValue}>{Number(p.duration_mins || 60)} min</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Price</Text>
                      <Text style={styles.detailValue}>₱{Number(p.price || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Guest Phone</Text>
                      <Text style={styles.detailValue}>{p.guest_phone || 'Not provided'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Created</Text>
                      <Text style={styles.detailValue}>{new Date(selectedHistoryBooking.created_at).toLocaleString()}</Text>
                    </View>
                    <View style={styles.detailNoteBox}>
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{p.intake_note || 'No intake notes recorded.'}</Text>
                    </View>
                  </View>
                )
              })()}
            </ScrollView>

            <View style={styles.historyDetailActions}>
              <TouchableOpacity
                style={styles.historyActionSecondary}
                onPress={() => setSelectedHistoryBooking(null)}
              >
                <Text style={styles.historyActionSecondaryText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.historyActionPrimary}
                onPress={() => handleHistoryCompletion(selectedHistoryBooking)}
              >
                <Text style={styles.historyActionPrimaryText}>Mark Finished</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
    backgroundColor: 'rgba(10, 15, 30, 0.97)',
    borderColor: 'rgba(167, 139, 250, 0.26)',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 6,
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
    shadowColor: '#a78bfa',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  walkInBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
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
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    padding: 3,
    alignSelf: 'flex-start',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.08)',
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
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderRadius: 10,
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
    backgroundColor: 'rgba(30,41,59,0.88)',
    borderColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    marginHorizontal: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
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
    justifyContent: 'center',
  },
  bookingStack: {
    gap: 6,
    width: '100%',
  },
  bookingStackItem: {
    width: '100%',
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
  emptySlotBlocked: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.2)',
  },
  emptySlotTextBlocked: {
    color: '#64748b',
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
    borderRadius: 12,
    padding: 9,
    gap: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
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
  bookingLocked: {
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.25)',
    borderWidth: 1,
    opacity: 0.94,
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
  pillLocked: { backgroundColor: 'rgba(148,163,184,0.18)' },
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
    backgroundColor: 'rgba(167,139,250,0.07)',
    borderColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(167, 139, 250, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyRoom: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    paddingRight: 8,
  },
  historyBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyDetailOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    padding: 16,
  },
  historyDetailCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '82%',
    backgroundColor: '#0f172a',
    borderColor: 'rgba(167,139,250,0.35)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  historyDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  historyDetailTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyDetailClose: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyDetailScroll: {
    maxHeight: 420,
  },
  historyDetailBody: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: '#e2e8f0',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  detailNoteBox: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderColor: 'rgba(148,163,184,0.18)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  historyDetailActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 18,
  },
  historyActionSecondary: {
    flex: 1,
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderColor: 'rgba(148,163,184,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  historyActionSecondaryText: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  historyActionPrimary: {
    flex: 1,
    backgroundColor: '#4ade80',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  historyActionPrimaryText: {
    color: '#0f172a',
    fontWeight: '700',
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
