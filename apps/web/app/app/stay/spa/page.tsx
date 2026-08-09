'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PhoneCaptureModal, { getStoredGuestPhone } from '../components/PhoneCaptureModal'

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
  status: string
}

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
  status: string
}

const FALLBACK_SERVICES: SpaService[] = [
  { id: 'spa-01', name: 'Signature Swedish Massage', description: 'Full body relaxing massage with organic aromatherapy oils.', price: 2500, duration_mins: 60, requires_on_call: false, is_available: true, image_url: null },
  { id: 'spa-02', name: 'Deep Tissue Muscle Relief', description: 'Targeted deep pressure therapy for muscle tension.', price: 3200, duration_mins: 90, requires_on_call: false, is_available: true, image_url: null },
  { id: 'spa-03', name: 'Hot Stone Wellness Therapy', description: 'Warm volcanic stones to soothe stress & restore balance.', price: 3800, duration_mins: 90, requires_on_call: true, is_available: true, image_url: null },
  { id: 'spa-04', name: 'Foot & Leg Reflexology', description: 'Revitalizing foot massage restoring natural energy flow.', price: 1800, duration_mins: 45, requires_on_call: false, is_available: true, image_url: null },
]

export default function GuestSpaPage() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room') || '00000000-0000-0000-0000-000000000101'
  const hashParam = searchParams.get('hash') || 'secret-hash-302'
  const defaultHotelId = '00000000-0000-0000-0000-000000000001'

  // Booking Flow Steps: 1 = Service, 2 = Slot, 3 = Hold & Intake, 4 = Confirmed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [services, setServices] = useState<SpaService[]>(FALLBACK_SERVICES)
  const [selectedService, setSelectedService] = useState<SpaService | null>(null)
  const [lockedSlots, setLockedSlots] = useState<SlotLock[]>([])
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null)
  const [isOnCallSlot, setIsOnCallSlot] = useState<boolean>(false)
  const [holdLockId, setHoldLockId] = useState<string | null>(null)
  const [holdCountdown, setHoldCountdown] = useState<number>(600) // 10 mins
  const [intakeNote, setIntakeNote] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [bookingStatus, setBookingStatus] = useState<'PENDING' | 'PENDING_ON_CALL' | 'CONFIRMED' | 'DECLINED'>('PENDING')
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPhoneModal, setShowPhoneModal] = useState(false)

  // Fetch available services & slot locks
  useEffect(() => {
    async function loadCatalog() {
      setLoading(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: svcData } = await (supabase.from('catalog_items') as any)
          .select('*')
          .eq('department', 'SPA')
          .eq('is_available', true)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lockData } = await (supabase.from('spa_slot_locks') as any)
          .select('id, start_time, status')
          .in('status', ['HELD', 'BOOKED'])

        if (svcData && svcData.length > 0) setServices(svcData)
        if (lockData) setLockedSlots(lockData)
      } catch (err) {
        console.error('Error loading spa catalog:', err)
      } finally {
        setLoading(false)
      }
    }
    loadCatalog()
  }, [])

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

  // Note: Realtime subscription (set up in executeConfirmBooking) handles
  // status updates via WebSocket — no polling needed.

  // Generate available hourly slots for today
  const timeSlots = [
    '10:00 AM',
    '11:30 AM',
    '01:00 PM',
    '02:30 PM',
    '04:00 PM',
    '05:30 PM',
  ]

  // Handle slot selection and 10-minute hold lock
  const handleSelectSlot = async (slotTime: string) => {
    setSelectedSlotTime(slotTime)
    const requiresOnCall = selectedService?.requires_on_call || slotTime === '05:30 PM'
    setIsOnCallSlot(requiresOnCall)

    try {
      const startTime = new Date().toISOString()
      const endTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('spa_slot_locks') as any)
        .insert([
          {
            hotel_id: defaultHotelId,
            start_time: startTime,
            end_time: endTime,
            status: 'HELD',
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ])
        .select('id')
        .single()

      if (!error && data) {
        setHoldLockId(data.id)
      }
    } catch (err) {
      console.error('Failed to create slot lock:', err)
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

    try {
      // 1. Insert booking request into requests table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            price: selectedService.price,
            duration_mins: selectedService.duration_mins,
            intake_note: intakeNote.trim() || 'No special intake preferences',
            guest_phone: phoneOverride || getStoredGuestPhone() || undefined,
            is_on_call: isOnCallSlot,
          },
        }])
        .select('id')
        .single()

      if (reqErr) throw reqErr

      if (reqData?.id) {
        const requestId = reqData.id
        setActiveRequestId(requestId)

        // Subscribe IMMEDIATELY — before setStep(4) — to avoid race where
        // staff confirms before the useEffect-based subscription fires.
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
      }

      // 2. Update slot lock to BOOKED
      if (holdLockId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('spa_slot_locks')
          .update({ status: 'BOOKED' })
          .eq('id', holdLockId)
      }

      setStep(4)
    } catch (err) {
      console.error('Error submitting spa booking:', err)
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

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 px-6 py-12 flex justify-center">
      {/* Background Orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Header Nav */}
        <div className="flex items-center justify-between">
          <a
            href={`/app/stay?room=${roomId}&hash=${hashParam}`}
            className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
          >
            ← Back to Room
          </a>
          <span className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-widest">
            Spa & Wellness
          </span>
        </div>

        {/* Step 1: Select Service */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-up">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-white">Select Spa Treatment</h1>
              <p className="text-slate-400 text-xs">Curated wellness therapies delivered in-room or at our spa sanctuary.</p>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 text-xs">Loading available treatments...</div>
            ) : (
              <div className="space-y-4">
                {services.map((service) => (
                  <div
                    key={service.id}
                    onClick={() => {
                      setSelectedService(service)
                      setStep(2)
                    }}
                    className="group glass-strong rounded-3xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 border border-white/10 hover:border-amber-500/40"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition-colors">
                          {service.name}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{service.description}</p>
                      </div>
                      <span className="text-lg font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
                        ₱{service.price.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-slate-400">
                      <span>⏱️ {service.duration_mins} Minutes</span>
                      <span className="text-amber-400 font-semibold group-hover:translate-x-1 transition-transform">
                        Select Time →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Time Slot Picker */}
        {step === 2 && selectedService && (
          <div className="space-y-6 animate-fade-up">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedService.name}</h2>
                <p className="text-slate-400 text-xs">₱{selectedService.price} · {selectedService.duration_mins} mins</p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Change
              </button>
            </div>

            <div className="glass-strong rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Choose Appointment Time Today</h3>

              <div className="grid grid-cols-2 gap-3">
                {timeSlots.map((slot) => {
                  const isLocked = lockedSlots.some((l) => l.start_time.includes(slot))
                  const isOnCall = selectedService.requires_on_call || slot === '05:30 PM'

                  return (
                    <button
                      key={slot}
                      onClick={() => !isLocked && handleSelectSlot(slot)}
                      disabled={isLocked}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        isLocked
                          ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                          : isOnCall
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="font-mono font-bold text-sm mb-1">{slot}</div>
                      <div className="text-[10px] font-medium">
                        {isLocked ? (
                          'Unavailable'
                        ) : isOnCall ? (
                          <span className="text-amber-400 font-semibold">On-Call Request</span>
                        ) : (
                          <span className="text-green-400">Available</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 10-Minute Hold & Intake Notes */}
        {step === 3 && selectedService && selectedSlotTime && (
          <div className="space-y-6 animate-fade-up">
            {/* Hold Banner */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-amber-400">
              <div className="flex items-center gap-2">
                <span className="animate-pulse">🔒</span>
                <span className="text-xs font-semibold">Slot Held for 10 Minutes</span>
              </div>
              <span className="font-mono font-bold text-sm tracking-wider">
                {formatCountdown(holdCountdown)}
              </span>
            </div>

            <div className="glass-strong rounded-3xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-white">Confirm Booking & Intake</h2>

              <div className="space-y-2 text-xs bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex justify-between text-slate-300">
                  <span>Treatment:</span>
                  <strong className="text-white">{selectedService.name}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Scheduled Time:</span>
                  <strong className="text-amber-400">{selectedSlotTime}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Price:</span>
                  <strong className="text-white">₱{selectedService.price.toLocaleString()}</strong>
                </div>
                {isOnCallSlot && (
                  <div className="pt-2 text-amber-400 font-medium border-t border-white/5">
                    ⚠️ Requires On-Call Therapist dispatch confirmation by front desk staff.
                  </div>
                )}
              </div>

              {/* Intake Preferences */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Guest Intake & Focus Preferences
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Focus on neck/shoulders, light pressure, eucalyptus oil preference..."
                  value={intakeNote}
                  onChange={(e) => setIntakeNote(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={handleConfirmBooking}
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl font-bold text-sm transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  color: '#0f172a',
                }}
              >
                {isSubmitting ? 'Submitting Request...' : 'Confirm Spa Appointment'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Booking Status & Real-Time Loop Closure */}
        {step === 4 && (
          <div className="glass-strong rounded-3xl p-8 text-center space-y-6 animate-fade-up">
            {bookingStatus === 'CONFIRMED' ? (
              <>
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl bg-green-500/20 border border-green-500/40 text-green-400">
                  ✓
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-green-400 uppercase tracking-widest">
                    Appointment Confirmed
                  </span>
                  <h2 className="text-2xl font-bold text-white">Your Spa Session is Set!</h2>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Your therapist will arrive at your room for <strong>{selectedService?.name}</strong> at <strong>{selectedSlotTime}</strong>.
                  </p>
                </div>
              </>
            ) : bookingStatus === 'DECLINED' ? (
              <>
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl bg-red-500/20 border border-red-500/40 text-red-400">
                  ✕
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Slot Unavailable</h2>
                  <p className="text-slate-300 text-xs">
                    The requested on-call therapist is unavailable for this time. Please pick another slot.
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                >
                  Select Another Slot
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl pulse-gold bg-amber-500/10 border border-amber-500/30">
                  ⏳
                </div>
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                    </span>
                    {isOnCallSlot ? 'Dispatching On-Call Specialist...' : 'Awaiting Staff Confirmation'}
                  </span>
                  <h2 className="text-xl font-bold text-white">Booking Request Sent</h2>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    We are notifying the spa concierge team. This window will update in real time once confirmed.
                  </p>
                </div>
              </>
            )}

            <a
              href={`/app/stay?room=${roomId}&hash=${hashParam}`}
              className="block w-full py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-semibold text-xs hover:bg-white/10 transition-colors"
            >
              Return to Room Dashboard
            </a>
          </div>
        )}
      </div>

      <PhoneCaptureModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={(phone) => {
          setShowPhoneModal(false)
          executeConfirmBooking(phone)
        }}
        roomId={roomId}
        hotelId={defaultHotelId}
      />
    </main>
  )
}
