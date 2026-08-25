import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { supabase } from '../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
]

// ─── Catalog service type (matches catalog_items schema) ─────────────────────
interface CatalogService {
  id: string
  name: string
  price: number
  duration_mins: number
  icon: string
}

const DEFAULT_CATALOG_SERVICES: CatalogService[] = [
  { id: 'deep_tissue', name: 'Deep Tissue Massage', icon: '💆', duration_mins: 60, price: 120 },
  { id: 'aromatherapy', name: 'Aromatherapy Wellness Massage', icon: '🌿', duration_mins: 60, price: 100 },
  { id: 'hot_stone', name: 'Hot Stone Signature Therapy', icon: '🪨', duration_mins: 90, price: 160 },
]

const FALLBACK_THERAPISTS = [
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

function buildSlotWindow(slotTime: string, durationMins: number) {
  const [timePart] = slotTime.split(' ')
  const [hoursText, minutesText] = timePart.split(':')
  let hours = Number(hoursText || '0')
  const minutes = Number(minutesText || '0')

  const start = new Date()
  start.setHours(hours, minutes, 0, 0)
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1)

  const end = new Date(start.getTime() + (durationMins || 60) * 60 * 1000)
  return { start, end }
}

function getBookingBaseDate(booking: EditableBooking): Date {
  const scheduledAt = booking.payload?.scheduled_at
  if (scheduledAt) {
    const parsed = new Date(scheduledAt)
    if (!isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

const timeWindowsOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditableBooking {
  /** The spa request ID (from `requests` table) */
  id: string
  roomNumber: string
  guestPhone: string
  serviceName: string
  startTime: string
  therapistId: string | null
  therapistName: string
  isOnCall: boolean
  status: string
  payload?: Record<string, any>
}

interface Therapist {
  id: string
  hotel_id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
  created_at: string
}

interface EditSpaBookingModalProps {
  isOpen: boolean
  booking: EditableBooking | null
  onClose: () => void
  onSaved: () => void
  /** If true, saving will set request status to CONFIRMED. When false, only payload is updated (used for pre-approval edits). */
  confirmOnSave?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditSpaBookingModal({
  isOpen,
  booking,
  onClose,
  onSaved,
  confirmOnSave = true,
}: EditSpaBookingModalProps) {
  const [saving, setSaving] = useState(false)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [loadingTherapists, setLoadingTherapists] = useState(true)
  const [conflictMap, setConflictMap] = useState<Record<string, boolean>>({})
  const [slotAvailabilityMap, setSlotAvailabilityMap] = useState<Record<string, Record<string, boolean>>>({})
  const [checkingConflicts, setCheckingConflicts] = useState(false)

  // Catalog services (fetched from admin config)
  const [services, setServices] = useState<CatalogService[]>(DEFAULT_CATALOG_SERVICES)
  const [loadingServices, setLoadingServices] = useState(false)

  // Editable fields
  const [selectedTime, setSelectedTime] = useState<string>('14:00')
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null)
  const [selectedService, setSelectedService] = useState<string>('Deep Tissue Massage')
  // Track the original therapist so we don't false-conflict against their own lock
  const [originalTherapistId, setOriginalTherapistId] = useState<string | null>(null)

  const normalizeTimeTo24Hour = (timeValue: string | null | undefined): string => {
    if (!timeValue) return '14:00'
    const trimmed = timeValue.trim()
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed

    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (!match) return trimmed

    let hours = Number(match[1])
    const minutes = match[2]
    const meridiem = match[3]?.toUpperCase()

    if (meridiem === 'PM' && hours < 12) hours += 12
    if (meridiem === 'AM' && hours === 12) hours = 0

    return `${String(hours).padStart(2, '0')}:${minutes}`
  }

  // Initialise fields when booking changes
  useEffect(() => {
    if (booking) {
      setSelectedTime(normalizeTimeTo24Hour(booking.startTime || '14:00'))
      setSelectedTherapistId(booking.therapistId)
      setSelectedService(booking.serviceName || 'Deep Tissue Massage')
      setOriginalTherapistId(booking.therapistId)  // remember original for conflict exclusion
      setConflictMap({})
    }
  }, [booking])

  // Load catalog services from admin config + therapists from Supabase
  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      // 1. Fetch admin-configured spa catalog services
      setLoadingServices(true)
      try {
        const { data: svcData } = await (supabase as any)
          .from('catalog_items')
          .select('*')
          .eq('department', 'SPA')
          .eq('is_available', true)
          .order('created_at', { ascending: true })

        if (svcData && svcData.length > 0) {
          const mapped: CatalogService[] = svcData.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            duration_mins: Number(item.duration_mins || item.duration || 60),
            icon: item.name.toLowerCase().includes('stone') ? '🪨'
              : item.name.toLowerCase().includes('reflex') ? '🦶'
              : item.name.toLowerCase().includes('tissue') ? '💪'
              : '💆',
          }))
          setServices(mapped)
        }
      } catch {
        // keep DEFAULT_CATALOG_SERVICES
      } finally {
        setLoadingServices(false)
      }

      // 2. Fetch therapists
      setLoadingTherapists(true)
      try {
        const { data } = await supabase
          .from('therapists')
          .select('*')
          .eq('hotel_id', HOTEL_ID)
          .eq('is_active', true)
          .order('is_on_call', { ascending: true })
        setTherapists(data && data.length > 0 ? data : FALLBACK_THERAPISTS)
      } catch {
        setTherapists(FALLBACK_THERAPISTS)
      } finally {
        setLoadingTherapists(false)
      }
    }
    load()
  }, [isOpen])

  // Re-check conflicts when time or therapist selection changes
  useEffect(() => {
    if (!isOpen || !booking) return
    const check = async () => {
      setCheckingConflicts(true)
      try {
        const selectedServiceObj = services.find((s) => s.name === selectedService)
        const durationMins = selectedServiceObj?.duration_mins ?? 60

        const { data: lockData } = await supabase
          .from('spa_slot_locks')
          .select('id, therapist_id, start_time, end_time, status, expires_at')
          .in('status', ['HELD', 'BOOKED'])

        const newMap: Record<string, boolean> = {}
        const availabilityMap: Record<string, Record<string, boolean>> = {}

        for (const t of therapists) {
          const perSlot: Record<string, boolean> = {}
          for (const slot of TIME_SLOTS) {
            const candidate = buildSlotWindow(slot, durationMins)
                        const baseDate = getBookingBaseDate(booking)
                        candidate.start.setFullYear(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
                        candidate.end.setTime(candidate.start.getTime() + durationMins * 60 * 1000)
            const isCurrentBooking = originalTherapistId && t.id === originalTherapistId && slot === selectedTime
            perSlot[slot] = isCurrentBooking
              ? false
              : (lockData || []).some((lock: any) => {
                  if (lock.therapist_id !== t.id) return false
                  if (lock.expires_at && new Date(lock.expires_at) <= new Date()) return false
                  const originalDuration = Number(booking.payload?.duration_mins || durationMins)
                  const originalStart = getBookingBaseDate(booking)
                  const [originalHour, originalMinute] = normalizeTimeTo24Hour(booking.startTime)
                    .split(':').map((value) => parseInt(value, 10))
                  originalStart.setHours(originalHour || 0, originalMinute || 0, 0, 0)
                  const originalEnd = new Date(originalStart.getTime() + originalDuration * 60 * 1000)
                  if (lock.therapist_id === originalTherapistId &&
                    timeWindowsOverlap(originalStart, originalEnd, new Date(lock.start_time), new Date(lock.end_time))) return false
                  const lockStart = new Date(lock.start_time)
                  const lockEnd = new Date(lock.end_time)
                  return timeWindowsOverlap(candidate.start, candidate.end, lockStart, lockEnd)
                })
          }
          availabilityMap[t.id] = perSlot
          newMap[t.id] = perSlot[selectedTime] ?? false
        }

        setSlotAvailabilityMap(availabilityMap)
        setConflictMap(newMap)
      } catch {
        // ignore conflict check errors, don't block save
      } finally {
        setCheckingConflicts(false)
      }
    }
    check()
  }, [selectedTime, selectedService, isOpen, booking, therapists, originalTherapistId])

  const handleSave = async () => {
    if (!booking) return
    if (!selectedTherapistId) {
      Alert.alert('Select Therapist', 'Please select a therapist before saving.')
      return
    }
    if (conflictMap[selectedTherapistId]) {
      Alert.alert(
        'Scheduling Conflict',
        'This therapist already has a booking at the selected time. Choose a different slot or therapist.'
      )
      return
    }

    setSaving(true)
    try {
      const therapist = therapists.find((t) => t.id === selectedTherapistId)
      const therapistName = therapist?.full_name ?? booking.therapistName
      const isOnCall = therapist?.is_on_call ?? false

      // Look up admin-configured price & duration for the selected service
      const catalogItem = services.find((s) => s.name === selectedService)
      const servicePrice = catalogItem?.price ?? 0
      const serviceDuration = catalogItem?.duration_mins ?? 60

      // Update requests row only. Optionally confirm the booking depending on
      // whether this save is a pre-approval edit or the actual approve action.
      const normalizedSelectedTime = normalizeTimeTo24Hour(selectedTime)
      const [timeH, timeM] = normalizedSelectedTime.split(':').map((v) => parseInt(v, 10))
      const lockStart = getBookingBaseDate(booking)
      lockStart.setHours(timeH || 0, timeM || 0, 0, 0)
      const matchedService = services.find((svc: CatalogService) => svc.name === selectedService)
      const durationMins = matchedService?.duration_mins ?? 60
      const lockEnd = new Date(lockStart.getTime() + durationMins * 60 * 1000)
      const expiresAt = new Date(lockEnd.getTime() + 10 * 60 * 1000)
      const updatePayload: any = {
          payload: {
            ...(booking.payload || {}),
          service_name: selectedService,
          slot_time: normalizedSelectedTime,
          scheduled_at: lockStart.toISOString(),
          room_number: booking.roomNumber,
          assigned_therapist: therapistName,
          therapist_id: selectedTherapistId,
          is_on_call: isOnCall,
          guest_phone: booking.guestPhone,
          price: servicePrice,
          duration_mins: serviceDuration,
        },
      }
      if (confirmOnSave) updatePayload.status = 'CONFIRMED'

      // Normalize room number: store raw numeric/short value (e.g. '101') rather
      // than a formatted label like 'Room 101' to keep payload consistent.
      const rawRoomValue = (booking.roomNumber || '').toString()
      const normalizedRoom = rawRoomValue.startsWith('Room')
        ? rawRoomValue.replace(/^Room\s*/i, '').trim()
        : rawRoomValue
      updatePayload.payload = { ...updatePayload.payload, room_number: normalizedRoom }

      // ─── Manage spa_slot_locks ──────────────────────────────────────────────
      const therapistIds = Array.from(new Set([selectedTherapistId, originalTherapistId].filter(Boolean))) as string[]
      const { data: activeLocks, error: lockReadErr } = await supabase
        .from('spa_slot_locks')
        .select('id, therapist_id, start_time, end_time, request_id')
        .in('therapist_id', therapistIds)
        .in('status', ['HELD', 'BOOKED'])

      if (lockReadErr) throw lockReadErr

      const exactRequestLocks = (activeLocks || []).filter((lock: any) => lock.request_id === booking.id)
      const [originalHour, originalMinute] = normalizeTimeTo24Hour(booking.startTime)
        .split(':').map((value) => parseInt(value, 10))
      const originalStart = getBookingBaseDate(booking)
      originalStart.setHours(originalHour || 0, originalMinute || 0, 0, 0)
      const originalDuration = Number(booking.payload?.duration_mins || serviceDuration)
      const originalEnd = new Date(originalStart.getTime() + originalDuration * 60 * 1000)
      const originalScheduledAt = booking.payload?.scheduled_at ? new Date(booking.payload.scheduled_at) : null
      const staleLockCandidates = (activeLocks || []).filter((lock: any) => {
        if (!lock || !lock.therapist_id) return false

        const lockStart = new Date(lock.start_time)
        const lockEnd = new Date(lock.end_time)
        const sameRequestLink = lock.request_id === booking.id
        const sameExactWindow = lockStart.getTime() === originalStart.getTime() && lockEnd.getTime() === originalEnd.getTime()
        const sameScheduledWindow = originalScheduledAt
          ? lockStart.getTime() === originalScheduledAt.getTime() && lockEnd.getTime() === new Date(originalScheduledAt.getTime() + originalDuration * 60 * 1000).getTime()
          : false
        const sameOriginalTherapist = lock.therapist_id === originalTherapistId
        const overlapsOriginalWindow = sameOriginalTherapist && timeWindowsOverlap(originalStart, originalEnd, lockStart, lockEnd)

        return sameRequestLink || sameExactWindow || sameScheduledWindow || overlapsOriginalWindow
      })
      const legacyWindowMatch = staleLockCandidates[0] || null
      const overlapOldLock = (activeLocks || []).find((lock: any) =>
        lock.therapist_id === originalTherapistId &&
        timeWindowsOverlap(originalStart, originalEnd, new Date(lock.start_time), new Date(lock.end_time))
      )
      const oldLock = exactRequestLocks[0] || legacyWindowMatch || overlapOldLock

      // Keep the current booking's existing lock when its therapist and time
      // are unchanged. Never delete all overlapping locks: that can remove a
      // different guest's reservation and enable a double booking.
      const currentLock = oldLock && selectedTherapistId === originalTherapistId &&
        normalizeTimeTo24Hour(booking.startTime) === normalizedSelectedTime
        ? oldLock
        : undefined

      const competingLocks = (activeLocks || []).filter((lock: any) =>
        lock.id !== oldLock?.id &&
        lock.therapist_id === selectedTherapistId &&
        timeWindowsOverlap(lockStart, lockEnd, new Date(lock.start_time), new Date(lock.end_time))
      )
      if (competingLocks.length > 0) {
        throw new Error('This therapist already has an active booking for that time slot.')
      }

      const { data: newLock, error: lockErr } = currentLock ? { data: null as any, error: null } : await (supabase as any)
        .from('spa_slot_locks')
        .insert([
          {
            hotel_id: HOTEL_ID,
            therapist_id: selectedTherapistId,
            session_id: null,
            start_time: lockStart.toISOString(),
            end_time: lockEnd.toISOString(),
            status: 'BOOKED',
            expires_at: expiresAt.toISOString(),
          },
        ])
        .select('id')
        .single()

      if (lockErr) {
        console.error('[EditSpaBookingModal] Failed to create slot lock:', lockErr)
        throw lockErr
      }

      if (oldLock && !currentLock) {
        const lockIdsToRemove = Array.from(new Set([
          oldLock.id,
          ...staleLockCandidates.map((lock: any) => lock.id),
          ...((activeLocks || []).filter((lock: any) => lock.request_id === booking.id && lock.id !== oldLock.id).map((lock: any) => lock.id)),
          ...((activeLocks || []).filter((lock: any) => {
            if (!lock || !lock.therapist_id) return false
            if (lock.request_id === booking.id) return true
            if (lock.therapist_id !== originalTherapistId) return false

            const lockStart = new Date(lock.start_time)
            const lockEnd = new Date(lock.end_time)

            const sameExactWindow = lockStart.getTime() === originalStart.getTime() && lockEnd.getTime() === originalEnd.getTime()
            const sameScheduledWindow = originalScheduledAt
              ? lockStart.getTime() === originalScheduledAt.getTime() && lockEnd.getTime() === new Date(originalScheduledAt.getTime() + originalDuration * 60 * 1000).getTime()
              : false

            return sameExactWindow || sameScheduledWindow || timeWindowsOverlap(originalStart, originalEnd, lockStart, lockEnd)
          }).map((lock: any) => lock.id)),
        ]))
        if (lockIdsToRemove.length > 0) {
          await (supabase as any)
            .from('spa_slot_locks')
            .delete()
            .in('id', lockIdsToRemove)
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const { error: reqErr } = await supabase
        .from('requests')
        .update(updatePayload)
        .eq('id', booking.id)

      if (reqErr) {
        if (!currentLock) {
          await (supabase as any).from('spa_slot_locks').delete()
            .eq('therapist_id', selectedTherapistId)
            .eq('start_time', lockStart.toISOString())
            .eq('end_time', lockEnd.toISOString())
        }
        console.error('[EditSpaBookingModal] Failed to update booking:', reqErr)
        throw reqErr
      }

      if (newLock?.id) {
        const { error: linkErr } = await (supabase as any)
          .from('spa_slot_locks')
          .update({ request_id: booking.id })
          .eq('id', newLock.id)

        if (linkErr) {
          console.warn('[EditSpaBookingModal] Failed to link new lock to request:', linkErr)
        }
      }

      // Explicit audit log for edit action
      const changesList: string[] = []
      if (booking.startTime !== selectedTime) changesList.push(`Time changed from ${booking.startTime} to ${selectedTime}`)
      if (booking.therapistId !== selectedTherapistId) changesList.push(`Therapist changed to ${therapistName}`)
      if (booking.serviceName !== selectedService) changesList.push(`Service changed to ${selectedService}`)

      try {
        await (supabase as any)
          .from('audit_logs')
          .insert([{
            hotel_id: HOTEL_ID,
            request_id: booking.id,
            action: 'BOOKING_EDITED',
            details: {
              source: 'staff_edit_modal',
              service_name: selectedService,
              slot_time: selectedTime,
              scheduled_at: lockStart.toISOString(),
              therapist_name: therapistName,
              therapist_id: selectedTherapistId,
              room_number: booking.roomNumber,
              price: services.find((s) => s.name === selectedService)?.price ?? 0,
              previous: {
                service_name: booking.serviceName,
                slot_time: booking.startTime,
                therapist_name: booking.therapistName,
                therapist_id: booking.therapistId,
              },
              summary: changesList.length > 0 ? changesList.join(', ') : 'Details updated',
            },
          }])
      } catch (auditErr) {
        console.warn('[EditSpaBookingModal] Non-fatal audit log insertion error:', auditErr)
      }

      onSaved()
      onClose()
    } catch (err) {
      let msg = 'An unexpected error occurred. Please try again.'
      try {
        if (err && typeof err === 'object') {
          // @ts-ignore
          msg = err.message || err.msg || msg
        } else if (typeof err === 'string') {
          msg = err
        }
      } catch (e) {}
      Alert.alert('Save Failed', msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!booking) return
    Alert.alert(
      'Cancel & Delete Booking',
      `Are you sure you want to cancel the booking for ${booking.roomNumber} (${booking.serviceName})?`,
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Yes, Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            try {
              const { error: reqErr } = await (supabase as any)
                .from('requests')
                .update({ status: 'CANCELLED' })
                .eq('id', booking.id)

              if (reqErr) throw reqErr

              // Audit log
              await (supabase as any)
                .from('audit_logs')
                .insert([{
                  hotel_id: HOTEL_ID,
                  request_id: booking.id,
                  action: 'BOOKING_CANCELLED',
                  details: {
                    source: 'staff_app',
                    room_number: booking.roomNumber,
                    service: booking.serviceName,
                    slot_time: booking.startTime,
                  },
                }])

              onSaved()
              onClose()
            } catch (err) {
              let msg = 'Could not cancel booking.'
              try {
                if (err && typeof err === 'object') {
                  // @ts-ignore
                  msg = err.message || err.msg || msg
                } else if (typeof err === 'string') {
                  msg = err
                }
              } catch (e) {}
              Alert.alert('Cancellation Failed', msg)
            } finally {
              setSaving(false)
            }
          },
        },
      ]
    )
  }

  if (!booking) return null

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>✏️ Edit Spa Booking</Text>
              <Text style={styles.headerSubtitle}>
                {booking.roomNumber} · {booking.serviceName}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── Guest Contact ── */}
          <View style={styles.contactBanner}>
            <Text style={styles.contactLabel}>📞 Guest Contact</Text>
            <Text style={styles.contactPhone}>{booking.guestPhone || 'Not provided'}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Granular Time Picker ── */}
            <Text style={styles.sectionLabel}>⏰ Scheduled Time (Granular Minute Control)</Text>

            <View style={styles.timePreviewCard}>
              <Text style={styles.timePreviewLabel}>Selected Appointment Time</Text>
              <Text style={styles.timePreviewExact}>{normalizeTimeTo24Hour(selectedTime)}</Text>
            </View>

            {/* Quick Minute Stepper Controls */}
            <Text style={styles.subSectionLabel}>Fine-Tune Minutes:</Text>
            <View style={styles.stepperRow}>
              {[
                { label: '-15m', delta: -15 },
                { label: '-5m', delta: -5 },
                { label: '-1m', delta: -1 },
                { label: '+1m', delta: 1 },
                { label: '+5m', delta: 5 },
                { label: '+15m', delta: 15 },
              ].map((btn) => (
                <TouchableOpacity
                  key={btn.label}
                  style={styles.stepperBtn}
                  onPress={() => {
                    const [hStr, mStr] = selectedTime.split(':')
                    let h = parseInt(hStr || '14', 10)
                    let m = parseInt(mStr || '00', 10)
                    if (isNaN(h)) h = 14
                    if (isNaN(m)) m = 0
                    let totalMin = h * 60 + m + btn.delta
                    if (totalMin < 0) totalMin = 0
                    if (totalMin > 23 * 60 + 59) totalMin = 23 * 60 + 59
                    const newH = Math.floor(totalMin / 60)
                    const newM = totalMin % 60
                    setSelectedTime(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`)
                  }}
                >
                  <Text style={styles.stepperBtnText}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Minute Preset Chips & Custom Minute Input */}
            <Text style={styles.subSectionLabel}>Minutes (e.g. :25):</Text>
            <View style={styles.minuteContainer}>
              <View style={styles.customMinBox}>
                <Text style={styles.customMinLabel}>Set Min:</Text>
                <TextInput
                  style={styles.customMinInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={selectedTime.split(':')[1] || '00'}
                  onChangeText={(val) => {
                    const parsed = parseInt(val, 10)
                    const cleanMin = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed))
                    const [hStr] = selectedTime.split(':')
                    const h = hStr || '14'
                    setSelectedTime(`${h.padStart(2, '0')}:${String(cleanMin).padStart(2, '0')}`)
                  }}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.minChipScroll}>
                {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => {
                  const currentMin = selectedTime.split(':')[1] || '00'
                  const isActive = currentMin === m
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.minChip, isActive && styles.minChipActive]}
                      onPress={() => {
                        const [hStr] = selectedTime.split(':')
                        const h = hStr || '14'
                        setSelectedTime(`${h.padStart(2, '0')}:${m}`)
                      }}
                    >
                      <Text style={[styles.minChipText, isActive && styles.minChipTextActive]}>:{m}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>

            {/* Hour Block Presets */}
            <Text style={styles.subSectionLabel}>Hour Block:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {TIME_SLOTS.map((t) => {
                const hourPart = t.split(':')[0]
                const selectedHour = selectedTime.split(':')[0]
                const isActive = selectedHour === hourPart
                const isBlocked = !!slotAvailabilityMap[selectedTherapistId || '']?.[t]
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChip, isActive && styles.timeChipActive, isBlocked && styles.timeChipDisabled]}
                    onPress={() => {
                      if (isBlocked) return
                      const currentMin = selectedTime.split(':')[1] || '00'
                      setSelectedTime(`${hourPart}:${currentMin}`)
                    }}
                    disabled={isBlocked}
                  >
                    <Text style={[styles.timeChipText, isActive && styles.timeChipTextActive, isBlocked && styles.timeChipTextDisabled]}>
                      {hourPart}:00
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* ── Service Picker ── */}
            <Text style={styles.sectionLabel}>🌺 Spa Service</Text>
            {loadingServices ? (
              <ActivityIndicator size="small" color="#a78bfa" style={{ marginVertical: 12 }} />
            ) : (
              services.map((svc) => (
                <TouchableOpacity
                  key={svc.id}
                  style={[styles.serviceRow, selectedService === svc.name && styles.serviceRowActive]}
                  onPress={() => setSelectedService(svc.name)}
                >
                  <Text style={styles.serviceIcon}>{svc.icon}</Text>
                  <View style={styles.serviceInfo}>
                    <Text style={[styles.serviceName, selectedService === svc.name && styles.serviceNameActive]}>
                      {svc.name}
                    </Text>
                    <Text style={styles.serviceMeta}>{svc.duration_mins} min · ₱{svc.price.toLocaleString()}</Text>
                  </View>
                  {selectedService === svc.name && (
                    <Text style={styles.checkMark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))
            )}

            {/* ── Therapist Picker ── */}
            <Text style={styles.sectionLabel}>👤 Assign Therapist</Text>
            {checkingConflicts && (
              <View style={styles.checkingRow}>
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text style={styles.checkingText}>Checking availability…</Text>
              </View>
            )}
            {loadingTherapists ? (
              <ActivityIndicator size="small" color="#a78bfa" style={{ marginVertical: 12 }} />
            ) : (
              therapists.map((t) => {
                const hasConflict = conflictMap[t.id]
                const isSelected = selectedTherapistId === t.id
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.therapistRow,
                      isSelected && styles.therapistRowSelected,
                      hasConflict && styles.therapistRowConflict,
                    ]}
                    onPress={() => !hasConflict && setSelectedTherapistId(t.id)}
                    disabled={hasConflict}
                  >
                    <View style={styles.therapistInfo}>
                      <Text style={[styles.therapistName, hasConflict && styles.therapistNameConflict]}>
                        {t.full_name}
                      </Text>
                      <Text
                        style={[
                          styles.therapistBadge,
                          t.is_on_call ? styles.onCallBadge : styles.inHouseBadge,
                        ]}
                      >
                        {t.is_on_call ? '⚡ On-Call Specialist' : '🏠 In-House Staff'}
                      </Text>
                      {hasConflict && (
                        <View style={styles.bookedBadge}>
                          <Text style={styles.bookedBadgeText}>🔒 Booked</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && !hasConflict && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Selected</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* ── Action Buttons ── */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={saving}
            >
              <Text style={styles.deleteBtnText}>🗑️ Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.saveBtnText}>💾 Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(167, 139, 250, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  contactLabel: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
  },
  contactPhone: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  subSectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  timePreviewCard: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  timePreviewLabel: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timePreviewExact: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 2,
  },
  timePreview12: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  stepperBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepperBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  minuteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  customMinBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: '#a78bfa',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  customMinLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginRight: 4,
  },
  customMinInput: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
    padding: 0,
  },
  minChipScroll: {
    flex: 1,
  },
  minChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 6,
  },
  minChipActive: {
    backgroundColor: '#fbbf24',
    borderColor: '#fbbf24',
  },
  minChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  minChipTextActive: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
  chipScroll: {
    marginBottom: 18,
  },
  timeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: 8,
  },
  timeChipActive: {
    backgroundColor: '#a78bfa',
    borderColor: '#a78bfa',
  },
  timeChipDisabled: {
    opacity: 0.35,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  timeChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
  timeChipTextDisabled: {
    color: '#475569',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  serviceRowActive: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
  },
  serviceIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  serviceNameActive: {
    color: '#ffffff',
  },
  serviceMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  checkMark: {
    color: '#a78bfa',
    fontSize: 18,
    fontWeight: 'bold',
  },
  checkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  checkingText: {
    color: '#64748b',
    fontSize: 12,
  },
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  therapistRowSelected: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  therapistRowConflict: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    opacity: 0.7,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  therapistNameConflict: {
    color: '#64748b',
  },
  therapistBadge: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  onCallBadge: {
    color: '#fbbf24',
  },
  inHouseBadge: {
    color: '#4ade80',
  },
  conflictLabel: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 3,
  },
  bookedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  bookedBadgeText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: 'bold',
  },
  selectedBadge: {
    backgroundColor: '#4ade80',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    position: 'relative',
    zIndex: 10,
    elevation: 10,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#a78bfa',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: 'bold',
  },
})
