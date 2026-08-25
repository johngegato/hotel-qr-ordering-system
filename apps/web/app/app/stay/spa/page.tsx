'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import PhoneCaptureModal, { getStoredGuestPhone } from '../components/PhoneCaptureModal'
import FrontDeskFAB from '../components/FrontDeskFAB'
import { useSearchParams } from 'next/navigation'

interface SpaService {
  id: string
  name: string
  description: string | null
  price: number
  duration_mins: number
  requires_on_call: boolean
  is_available: boolean
  image_url: string | null
}

interface SlotLock {
  id: string
  start_time: string
  end_time: string
  status: string
  expires_at: string
  therapist_id?: string | null
}

interface Therapist {
  id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
}

const FALLBACK_SERVICES: SpaService[] = [
  { id: 'spa-01', name: 'Signature Swedish Massage', description: 'Full body relaxing massage with organic aromatherapy oils.', price: 2500, duration_mins: 60, requires_on_call: false, is_available: true, image_url: null },
  { id: 'spa-02', name: 'Deep Tissue Muscle Relief', description: 'Targeted deep pressure therapy for muscle tension.', price: 3200, duration_mins: 90, requires_on_call: false, is_available: true, image_url: null },
  { id: 'spa-03', name: 'Hot Stone Wellness Therapy', description: 'Warm volcanic stones to soothe stress & restore balance.', price: 3800, duration_mins: 90, requires_on_call: true, is_available: true, image_url: null },
  { id: 'spa-04', name: 'Foot & Leg Reflexology', description: 'Revitalizing foot massage restoring natural energy flow.', price: 1800, duration_mins: 45, requires_on_call: false, is_available: true, image_url: null },
]

const TIME_SLOTS = [
  '10:00 AM',
  '11:30 AM',
  '01:00 PM',
  '02:30 PM',
  '04:00 PM',
  '05:30 PM',
  '07:00 PM',
]

function GuestSpaContent() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room') || '00000000-0000-0000-0000-000000000101'
  const hashParam = searchParams.get('hash') || 'secret-hash-302'
  const defaultHotelId = '00000000-0000-0000-0000-000000000001'

  // Booking Flow Steps: 1 = Service, 2 = Slot, 3 = Hold & Intake, 4 = Confirmed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedDay, setSelectedDay] = useState<'TODAY' | 'TOMORROW'>('TODAY')
  const [services, setServices] = useState<SpaService[]>(FALLBACK_SERVICES)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [selectedService, setSelectedService] = useState<SpaService | null>(null)
  const [lockedSlots, setLockedSlots] = useState<SlotLock[]>([])
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null)
  const [selectedScheduledAt, setSelectedScheduledAt] = useState<string | null>(null)
  const [isOnCallSlot, setIsOnCallSlot] = useState<boolean>(false)
  const [holdLockId, setHoldLockId] = useState<string | null>(null)
  const [holdCountdown, setHoldCountdown] = useState<number>(600) // 10 mins
  const [intakeNote, setIntakeNote] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [bookingStatus, setBookingStatus] = useState<'PENDING' | 'PENDING_ON_CALL' | 'CONFIRMED' | 'DECLINED'>('PENDING')
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [roomNumber, setRoomNumber] = useState<string>('')

  const releaseHeldLock = async (lockId: string | null) => {
    if (!lockId) return
    await (supabase.from('spa_slot_locks') as any)
      .update({ status: 'EXPIRED', expires_at: new Date().toISOString() })
      .eq('id', lockId)
      .eq('status', 'HELD')
  }

  // Fetch catalog, therapists & live locks
  const loadSpaData = useCallback(async () => {
    try {
      // 1. Services
      const { data: svcData } = await (supabase.from('catalog_items') as any)
        .select('*')
        .eq('department', 'SPA')
        .eq('is_available', true)
        .order('sort_order', { ascending: true })

      if (svcData && svcData.length > 0) setServices(svcData)

      // 2. Therapists
      const { data: therData } = await (supabase.from('therapists') as any)
        .select('id, full_name, is_on_call, is_active')
        .eq('hotel_id', defaultHotelId)
        .eq('is_active', true)

      if (therData && therData.length > 0) setTherapists(therData)

      // 3. Room lookup
      if (roomId) {
        const { data: rm } = await (supabase.from('rooms') as any)
          .select('room_number')
          .eq('id', roomId)
          .maybeSingle()
        if (rm?.room_number) setRoomNumber(rm.room_number)
      }

      // 4. Slot locks (active locks only)
      const nowIso = new Date().toISOString()
      const { data: lockData } = await (supabase.from('spa_slot_locks') as any)
        .select('id, start_time, end_time, status, expires_at, therapist_id')
        .in('status', ['HELD', 'BOOKED'])
        .gt('end_time', nowIso)

      if (lockData) setLockedSlots(lockData)
    } catch (err) {
      console.error('Error loading spa data:', err)
    } finally {
      setLoading(false)
    }
  }, [roomId, defaultHotelId])

  useEffect(() => {
    loadSpaData()

    // Realtime channel for lock updates
    const channel = supabase
      .channel('guest_spa_locks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spa_slot_locks' }, () => {
        loadSpaData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadSpaData])

  // 10-Minute Hold Countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (step === 3 && holdCountdown > 0) {
      timer = setInterval(() => {
        setHoldCountdown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [step, holdCountdown])

  useEffect(() => {
    if (step !== 3 || holdCountdown > 0 || !holdLockId) return
    releaseHeldLock(holdLockId).catch((err) => console.error('Failed to expire spa hold:', err))
    setHoldLockId(null)
    setStep(2)
  }, [step, holdCountdown, holdLockId])

  useEffect(() => () => {
    if (holdLockId && step === 3) {
      releaseHeldLock(holdLockId).catch((err) => console.error('Failed to release spa hold:', err))
    }
  }, [holdLockId, step])

  const convertDisplayTimeTo24Hour = (slotTime: string): string => {
    if (!slotTime) return '14:00'
    if (/^\d{1,2}:\d{2}$/.test(slotTime.trim())) return slotTime.trim()

    const [time, meridiem] = slotTime.trim().split(' ')
    const [hourText, minuteText] = time.split(':')
    let hour = Number(hourText)
    const minute = Number(minuteText || '00')

    if (meridiem && meridiem.toUpperCase() === 'PM' && hour < 12) hour += 12
    if (meridiem && meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  // Calculate precise window based on selected day (Today vs Tomorrow)
  const getSlotWindow = (slotTime: string, durationMinutes: number = 60, dayTarget: 'TODAY' | 'TOMORROW' = selectedDay) => {
    const normalizedTime = convertDisplayTimeTo24Hour(slotTime)
    const [hourText, minuteText] = normalizedTime.split(':')
    const hour = Number(hourText || '0')
    const minute = Number(minuteText || '0')

    const start = new Date()
    if (dayTarget === 'TOMORROW') {
      start.setDate(start.getDate() + 1)
    }
    start.setHours(hour, minute, 0, 0)

    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
    return { start, end }
  }

  // Check slot status: 'PAST' | 'LOCKED' | 'ON_CALL' | 'AVAILABLE'
  const getSlotStatus = (slotTime: string, durationMinutes: number): {
    status: 'PAST' | 'LOCKED' | 'ON_CALL' | 'AVAILABLE'
    label: string
    isSelectable: boolean
  } => {
    const slotWindow = getSlotWindow(slotTime, durationMinutes)
    const now = new Date()

    // 1. If today and the time has already passed
    if (selectedDay === 'TODAY' && slotWindow.start.getTime() < now.getTime()) {
      return { status: 'PAST', label: 'Time Passed', isSelectable: false }
    }

    // 2. Count active overlapping locks
    const totalActiveTherapists = Math.max(1, therapists.filter(t => t.is_active).length || 2)
    const activeOverlappingLocks = lockedSlots.filter((lock) => {
      if (!['HELD', 'BOOKED'].includes(lock.status)) return false
      if (lock.expires_at && new Date(lock.expires_at) <= now) return false

      const lockStart = new Date(lock.start_time)
      const lockEnd = new Date(lock.end_time)

      if (Number.isNaN(lockStart.getTime()) || Number.isNaN(lockEnd.getTime())) return false

      // Overlap condition
      return lockStart < slotWindow.end && lockEnd > slotWindow.start
    })

    // If all therapists are booked, the slot is locked
    if (activeOverlappingLocks.length >= totalActiveTherapists) {
      return { status: 'LOCKED', label: 'Fully Booked', isSelectable: false }
    }

    // 3. On-call check
    const isLateEvening = slotTime === '05:30 PM' || slotTime === '07:00 PM'
    if (selectedService?.requires_on_call || isLateEvening) {
      return { status: 'ON_CALL', label: 'On-Call Request', isSelectable: true }
    }

    return { status: 'AVAILABLE', label: 'Available', isSelectable: true }
  }

  // Handle slot selection and hold lock
  const createHoldLock = async (slotTime: string) => {
    const durationMinutes = selectedService?.duration_mins || 60
    const { start, end } = getSlotWindow(slotTime, durationMinutes)

    const { data, error } = await (supabase.from('spa_slot_locks') as any)
      .insert([
        {
          hotel_id: defaultHotelId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'HELD',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ])
      .select('id')
      .single()

    if (error || !data?.id) throw error || new Error('This slot is no longer available.')
    return data.id
  }

  const handleSelectSlot = async (slotTime: string) => {
    const normalizedSlotTime = convertDisplayTimeTo24Hour(slotTime)
    setSelectedSlotTime(normalizedSlotTime)
    const isLateEvening = slotTime === '05:30 PM' || slotTime === '07:00 PM'
    const requiresOnCall = Boolean(selectedService?.requires_on_call || isLateEvening)
    setIsOnCallSlot(requiresOnCall)

    try {
      const durationMinutes = selectedService?.duration_mins || 60
      const { start } = getSlotWindow(slotTime, durationMinutes)
      setSelectedScheduledAt(start.toISOString())

      const lockId = await createHoldLock(slotTime)
      setHoldLockId(lockId)
    } catch (err) {
      console.error('Failed to create slot lock:', err)
      setHoldLockId(null)
      setStep(2)
      return
    }

    setHoldCountdown(600)
    setStep(3)
  }

  // Handle final booking submission
  const executeConfirmBooking = async (phoneOverride?: string) => {
    if (!selectedService || !selectedSlotTime) return

    setIsSubmitting(true)
    const initialStatus = isOnCallSlot ? 'PENDING_ON_CALL' : 'PENDING'
    setBookingStatus(initialStatus)
    let createdRequestId: string | null = null

    try {
      const roomNumberDisplay = roomNumber || 'Room —'
      const scheduledAt = selectedScheduledAt
        || getSlotWindow(selectedSlotTime, selectedService.duration_mins).start.toISOString()

      // 1. Insert booking request into requests table
      const { data: reqData, error: reqErr } = await (supabase as any)
        .from('requests')
        .insert([{
          hotel_id: defaultHotelId,
          room_id: roomId,
          request_type: 'SPA_BOOKING',
          status: initialStatus,
          payload: {
            service_id: selectedService.id,
            service_name: selectedService.name,
            slot_time: selectedSlotTime,
            scheduled_at: scheduledAt,
            room_number: roomNumberDisplay,
            price: selectedService.price,
            duration_mins: selectedService.duration_mins,
            intake_note: intakeNote.trim() || 'No special intake preferences',
            guest_phone: phoneOverride || getStoredGuestPhone() || undefined,
            is_on_call: isOnCallSlot,
            booked_by: roomNumberDisplay ? `Guest (${roomNumberDisplay})` : 'Guest',
          },
        }])
        .select('id')
        .single()

      if (reqErr) throw reqErr

      if (reqData?.id) {
        const requestId = reqData.id
        createdRequestId = requestId
        setActiveRequestId(requestId)

        // Realtime subscription for instant approval updates
        supabase
          .channel(`spa_booking_${requestId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
            (payload: { new: { status: string } }) => {
              const s = payload.new?.status
              if (s === 'CONFIRMED') setBookingStatus('CONFIRMED')
              else if (s === 'DECLINED') setBookingStatus('DECLINED')
            }
          )
          .subscribe()

        // Log in audit trail
        try {
          const guestActorName = roomNumberDisplay ? `Guest (${roomNumberDisplay})` : 'Guest'
          await (supabase as any)
            .from('audit_logs')
            .insert([{
              hotel_id: defaultHotelId,
              request_id: requestId,
              action: 'GUEST_BOOKING_CREATED',
              details: {
                source: 'guest_web',
                actor_name: guestActorName,
                actor_role: 'GUEST',
                booked_by: guestActorName,
                service_name: selectedService.name,
                slot_time: selectedSlotTime,
                scheduled_at: scheduledAt,
                room_number: roomNumberDisplay,
                price: selectedService.price,
                duration_mins: selectedService.duration_mins,
                guest_phone: phoneOverride || getStoredGuestPhone() || null,
                is_on_call: isOnCallSlot,
              },
            }])
        } catch (auditErr) {
          console.warn('[GuestSpa] Non-fatal audit log insertion error:', auditErr)
        }
      }

      // 2. Link lock to request
      if (holdLockId && createdRequestId) {
        const durationMinutes = selectedService.duration_mins || 60
        const { start, end } = getSlotWindow(selectedSlotTime, durationMinutes)

        await (supabase as any)
          .from('spa_slot_locks')
          .update({
            status: 'BOOKED',
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            expires_at: new Date(end.getTime() + 10 * 60 * 1000).toISOString(),
            request_id: createdRequestId,
          })
          .eq('id', holdLockId)
      }

      setStep(4)
    } catch (err) {
      console.error('Error submitting spa booking:', err)
      await releaseHeldLock(holdLockId)
      setHoldLockId(null)
      if (createdRequestId) {
        await (supabase as any).from('requests').update({ status: 'CANCELLED' }).eq('id', createdRequestId)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmBooking = () => {
    const phone = getStoredGuestPhone()
    if (!phone) {
      setShowPhoneModal(true)
    } else {
      executeConfirmBooking(phone)
    }
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const todayFormatted = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowFormatted = tomorrowDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 px-4 sm:px-6 py-6 pb-28 flex justify-center">
      {/* Background Orbs */}
      <div className="bg-orb bg-orb-1" style={{ opacity: 0.18 }} />
      <div className="bg-orb bg-orb-2" style={{ opacity: 0.15 }} />

      <div className="relative z-10 w-full max-w-lg space-y-6">

        {/* Top Prominent Back Button & Room Status Header */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <a
            href={`/app/stay?room=${roomId}&hash=${hashParam}`}
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 text-white font-bold text-sm shadow-lg transition-all"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <span className="text-base font-extrabold">←</span>
            <span>Back to Concierge</span>
          </a>

          {roomNumber && (
            <div className="px-4 py-2 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-200 font-extrabold text-xs tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
              <span>🚪</span> Room {roomNumber}
            </div>
          )}
        </div>

        {/* Step 1: Select Service */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-up">
            <div className="text-center space-y-2 pt-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-2xl shadow-inner mx-auto mb-1">
                💆
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">Spa & Wellness</h1>
              <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                Curated holistic therapies and relaxing treatments delivered in-room or at our spa sanctuary.
              </p>
            </div>

            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm animate-pulse space-y-3">
                <div className="text-4xl animate-bounce">💆</div>
                <p>Loading luxury spa treatments...</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {services.map((service) => (
                  <div
                    key={service.id}
                    onClick={() => {
                      setSelectedService(service)
                      setStep(2)
                    }}
                    className="group rounded-3xl p-5 cursor-pointer transition-all duration-200 active:scale-[0.98] border border-white/15 shadow-xl hover:border-purple-500/50"
                    style={{ background: 'linear-gradient(150deg, rgba(168, 85, 247, 0.08), rgba(15, 23, 42, 0.9))' }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="font-extrabold text-white text-base group-hover:text-purple-300 transition-colors">
                          {service.name}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{service.description}</p>
                      </div>
                      <span className="text-base font-black text-purple-300 bg-purple-500/15 px-3 py-1 rounded-xl border border-purple-500/30 flex-shrink-0">
                        ₱{Number(service.price).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-slate-400">
                      <span className="font-semibold">⏱️ {service.duration_mins} Minutes</span>
                      <span className="text-purple-300 font-extrabold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Select Appointment Time →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Time Slot Picker with Day Tabs */}
        {step === 2 && selectedService && (
          <div className="space-y-6 animate-fade-up">
            {/* Selected service summary pill */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/15">
              <div>
                <h2 className="text-base font-black text-white">{selectedService.name}</h2>
                <p className="text-slate-400 text-xs font-semibold">
                  ₱{Number(selectedService.price).toLocaleString()} · {selectedService.duration_mins} mins
                </p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-purple-300 hover:text-white font-bold px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 active:scale-95"
              >
                Change Service
              </button>
            </div>

            <div className="rounded-3xl border border-white/15 p-6 space-y-5 shadow-2xl" style={{ background: '#0f172a' }}>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-white">Choose Appointment Date & Time</h3>
                <p className="text-xs text-slate-400">Select your preferred slot for therapist assignment</p>
              </div>

              {/* Day Selection Tabs (Today vs Tomorrow) */}
              <div className="grid grid-cols-2 gap-2.5 p-1 rounded-2xl bg-black/40 border border-white/10">
                <button
                  onClick={() => setSelectedDay('TODAY')}
                  className={`py-3 px-3 rounded-xl text-xs font-extrabold transition-all flex flex-col items-center gap-0.5 ${
                    selectedDay === 'TODAY'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 scale-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">📅 Today</span>
                  <span className="text-[10px] font-semibold opacity-80">{todayFormatted}</span>
                </button>
                <button
                  onClick={() => setSelectedDay('TOMORROW')}
                  className={`py-3 px-3 rounded-xl text-xs font-extrabold transition-all flex flex-col items-center gap-0.5 ${
                    selectedDay === 'TOMORROW'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 scale-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">📅 Tomorrow</span>
                  <span className="text-[10px] font-semibold opacity-80">{tomorrowFormatted}</span>
                </button>
              </div>

              {/* Slot Grid */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {TIME_SLOTS.map((slot) => {
                  const { status, label, isSelectable } = getSlotStatus(slot, selectedService.duration_mins)

                  return (
                    <button
                      key={slot}
                      onClick={() => isSelectable && handleSelectSlot(slot)}
                      disabled={!isSelectable}
                      className={`p-4 rounded-2xl border text-left transition-all relative ${
                        !isSelectable
                          ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                          : status === 'ON_CALL'
                          ? 'bg-amber-500/10 border-amber-500/35 text-amber-300 hover:bg-amber-500/20 active:scale-95'
                          : 'bg-white/5 border-white/15 text-white hover:bg-white/10 hover:border-purple-500/50 active:scale-95 shadow-md'
                      }`}
                    >
                      <div className="font-mono font-black text-sm mb-1">{slot}</div>
                      <div className="text-[11px] font-bold">
                        {status === 'PAST' ? (
                          <span className="text-slate-600">Passed</span>
                        ) : status === 'LOCKED' ? (
                          <span className="text-rose-400">Booked</span>
                        ) : status === 'ON_CALL' ? (
                          <span className="text-amber-400 font-extrabold">⚠️ On-Call Request</span>
                        ) : (
                          <span className="text-emerald-400 font-extrabold">✓ Available</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="text-[11px] text-slate-400 text-center pt-2 leading-relaxed">
                💡 <span className="text-slate-300 font-semibold">Instant Hold:</span> Choosing a time holds your slot for 10 minutes while you complete intake notes.
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 10-Minute Hold & Intake Form */}
        {step === 3 && selectedService && selectedSlotTime && (
          <div className="space-y-5 animate-fade-up">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-300 block uppercase tracking-wider">Slot Held For You</span>
                <span className="text-xs text-slate-300 font-medium">Complete details before hold expires</span>
              </div>
              <span className="font-mono text-lg font-black text-amber-400 bg-amber-500/20 px-3 py-1 rounded-xl border border-amber-500/40">
                ⏱ {formatCountdown(holdCountdown)}
              </span>
            </div>

            <div className="rounded-3xl border border-white/15 p-6 space-y-5 shadow-2xl" style={{ background: '#0f172a' }}>
              <h2 className="text-lg font-black text-white">Booking Summary</h2>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Treatment</span>
                  <span className="font-bold text-white">{selectedService.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Scheduled Date</span>
                  <span className="font-bold text-white">
                    {selectedDay === 'TODAY' ? `Today (${todayFormatted})` : `Tomorrow (${tomorrowFormatted})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Time Slot</span>
                  <span className="font-mono font-bold text-purple-300">{selectedSlotTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration</span>
                  <span className="font-bold text-white">{selectedService.duration_mins} Minutes</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/10 text-sm">
                  <span className="font-bold text-slate-300">Total Price</span>
                  <span className="font-black text-purple-300">₱{Number(selectedService.price).toLocaleString()}</span>
                </div>
              </div>

              {isOnCallSlot && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed font-medium">
                  ⚠️ <strong className="text-white">On-Call Notice:</strong> This appointment requires front desk staff confirmation with the on-call therapist.
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2 uppercase tracking-wider">
                  Guest Intake & Focus Areas <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  value={intakeNote}
                  onChange={(e) => setIntakeNote(e.target.value)}
                  placeholder="e.g. Focus on lower back tension, prefer light pressure, allergies..."
                  rows={3}
                  className="w-full p-4 rounded-2xl bg-white/5 border border-white/15 text-slate-100 placeholder:text-slate-500 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    releaseHeldLock(holdLockId)
                    setHoldLockId(null)
                    setStep(2)
                  }}
                  className="flex-1 py-4 px-4 rounded-2xl bg-white/10 border border-white/15 text-slate-300 font-bold text-sm hover:bg-white/15 active:scale-95"
                >
                  Change Slot
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={isSubmitting}
                  className="flex-[2] py-4 px-6 rounded-2xl font-black text-sm text-white shadow-xl shadow-purple-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Reserving...</span>
                    </>
                  ) : (
                    <>
                      <span>💆</span>
                      <span>Confirm Booking</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Live Status View */}
        {step === 4 && (
          <div className="rounded-3xl border border-white/15 p-8 space-y-6 text-center shadow-2xl animate-fade-up" style={{ background: '#0f172a' }}>
            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-3xl mx-auto shadow-inner">
              {bookingStatus === 'CONFIRMED' ? '✅' : bookingStatus === 'DECLINED' ? '✕' : '⏳'}
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">
                {bookingStatus === 'CONFIRMED'
                  ? 'Appointment Confirmed!'
                  : bookingStatus === 'DECLINED'
                  ? 'Booking Declined'
                  : 'Booking Request Received'}
              </h2>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                {bookingStatus === 'CONFIRMED'
                  ? 'Your therapist has been scheduled. Please be in your room at the appointment time.'
                  : bookingStatus === 'DECLINED'
                  ? 'We could not accommodate this time slot. Please choose an alternative appointment.'
                  : 'Front desk staff has received your booking request and is assigning your therapist.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Treatment</span>
                <span className="font-bold text-white">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scheduled Time</span>
                <span className="font-mono font-bold text-purple-300">{selectedSlotTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total</span>
                <span className="font-bold text-white">₱{Number(selectedService?.price).toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setStep(1)
                setSelectedService(null)
                setSelectedSlotTime(null)
                setHoldLockId(null)
              }}
              className="w-full py-4 rounded-2xl font-black text-sm text-white shadow-xl shadow-purple-600/30"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
            >
              Book Another Treatment
            </button>
          </div>
        )}
      </div>

      <FrontDeskFAB roomId={roomId} roomNumber={roomNumber} hotelId={defaultHotelId} />

      <PhoneCaptureModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={(phone) => {
          setShowPhoneModal(false)
          executeConfirmBooking(phone)
        }}
        roomId={roomId || ''}
        hotelId={defaultHotelId}
      />
    </main>
  )
}

export default function GuestSpaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Loading Spa Treatments...</div>}>
      <GuestSpaContent />
    </Suspense>
  )
}
