'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import PhoneCaptureModal, { getStoredGuestPhone } from './PhoneCaptureModal'
import { useGuestTheme } from './GuestThemeProvider'

interface CallFrontDeskModalProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  hotelId: string
  hotelPhone?: string | null
  roomNumber: string
}

export default function CallFrontDeskModal({
  isOpen,
  onClose,
  roomId,
  hotelId,
  hotelPhone = '+18005550100',
  roomNumber,
}: CallFrontDeskModalProps) {
  const theme = useGuestTheme()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'CLAIMED' | 'FAILED'>('IDLE')
  const [countdown, setCountdown] = useState(180) // 3 minutes
  const [showPhoneModal, setShowPhoneModal] = useState(false)

  // Countdown timer effect for PENDING state
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (status === 'PENDING' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [status, countdown])

  // Supabase Realtime Subscription for loop closure
  useEffect(() => {
    if (!requestId) return

    const channel = supabase
      .channel(`request_${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'requests',
          filter: `id=eq.${requestId}`,
        },
        (payload: { new: { status: string } }) => {
          if (payload.new && payload.new.status === 'CLAIMED') {
            setStatus('CLAIMED')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [requestId])

  if (!isOpen) return null

  const executeRequestCall = async (phoneOverride?: string) => {
    setIsSubmitting(true)
    const phone = phoneOverride || getStoredGuestPhone()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('requests') as any)
        .insert([
          {
            hotel_id: hotelId,
            room_id: roomId,
            request_type: 'CALL_REQUEST',
            status: 'PENDING',
            payload: { room_number: roomNumber, note: 'Guest requested a callback', guest_phone: phone },
          },
        ])
        .select('id')
        .single()

      if (data) {
        const reqId = (data as { id: string }).id
        setRequestId(reqId)
        setStatus('PENDING')

        // ── Fire Web Push to all active staff PWA devices ──
        try {
          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hotelId: hotelId || '00000000-0000-0000-0000-000000000001',
              title: `📞 Front Desk Call Request — Room ${roomNumber || '—'}`,
              body: phone ? `Guest requested an urgent callback [Phone: ${phone}]` : 'Guest requested a front desk callback.',
              requestId: reqId,
              roomNumber: roomNumber,
              requestType: 'CALL_REQUEST',
              url: '/',
            }),
          }).catch(() => {})
        } catch {
          // Push dispatch is non-blocking
        }
      }
    } catch (err) {
      console.error('Failed to submit call request:', err)
      setStatus('FAILED')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestCall = () => {
    const phone = getStoredGuestPhone()
    if (!phone) {
      setShowPhoneModal(true)
    } else {
      executeRequestCall(phone)
    }
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
        <div className="glass-strong rounded-3xl p-8 max-w-sm w-full relative overflow-hidden animate-fade-up">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white text-base w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors font-bold"
          >
            ✕
          </button>

          {/* Modal Header */}
          <div className="text-center mb-8">
            <div
              className="w-24 h-24 rounded-3xl mx-auto mb-5 flex items-center justify-center text-5xl pulse-gold shadow-2xl"
              style={{
                background: `linear-gradient(135deg, ${theme.badgeBg} 0%, rgba(0,0,0,0.4) 100%)`,
                border: `1px solid ${theme.badgeBorder}`,
              }}
            >
              📞
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-1">Front Desk</h2>
            <p className="text-slate-400 text-sm font-medium">Room {roomNumber} · We&apos;re here to help</p>
          </div>

          {/* State 1: IDLE */}
          {status === 'IDLE' && (
            <div className="space-y-4">
              {/* Primary CTA — Direct dial */}
              <a
                href={`tel:${hotelPhone}`}
                className="w-full flex flex-col items-center justify-center gap-1 py-5 px-5 rounded-2xl font-extrabold text-base transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xl min-h-[72px]"
                style={{
                  background: theme.gradient,
                  color: '#0f172a',
                  boxShadow: `0 8px 24px -4px ${theme.glowRgba}`,
                }}
              >
                <span className="text-2xl">📱</span>
                <span>Call Front Desk Directly</span>
                <span className="text-[11px] opacity-70 font-medium">{hotelPhone}</span>
              </a>

              {/* Secondary CTA — Staff callback request */}
              <button
                onClick={handleRequestCall}
                disabled={isSubmitting}
                className="w-full flex flex-col items-center justify-center gap-1 py-5 px-5 rounded-2xl font-bold text-base text-slate-100 transition-all duration-200 hover:bg-white/10 active:scale-95 disabled:opacity-50 min-h-[72px]"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                <span className="text-2xl">🛎️</span>
                <span>{isSubmitting ? 'Sending request…' : 'Request Staff Callback'}</span>
                <span className="text-[11px] opacity-60 font-medium">We&apos;ll call your room</span>
              </button>
            </div>
          )}

          {/* State 2: PENDING */}
          {status === 'PENDING' && (
            <div className="text-center py-6 space-y-5">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-bold text-amber-400 bg-amber-400/10 border border-amber-400/25">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>
                Notifying Front Desk…
              </div>

              <div className="text-5xl font-mono font-extrabold text-white tracking-widest">
                {formatCountdown(countdown)}
              </div>

              <p className="text-slate-300 text-sm leading-relaxed max-w-xs mx-auto">
                Our front desk team has been alerted. A staff member will call your room shortly.
              </p>
            </div>
          )}

          {/* State 3: CLAIMED */}
          {status === 'CLAIMED' && (
            <div className="text-center py-6 space-y-5 animate-fade-in">
              <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl bg-green-500/20 border-2 border-green-500/50 text-green-400 shadow-xl">
                ✓
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold text-green-400 bg-green-400/10 border border-green-400/25">
                ✅ Staff Responded
              </div>

              <h3 className="text-xl font-extrabold text-white">Staff Member is Calling!</h3>

              <p className="text-slate-300 text-sm leading-relaxed max-w-xs mx-auto">
                A front desk team member has been assigned and is calling your room now.
              </p>

              <button
                onClick={onClose}
                className="mt-2 w-full py-4 rounded-2xl font-bold text-base text-slate-200 bg-white/8 hover:bg-white/15 transition-all active:scale-95 min-h-[56px]"
              >
                Close
              </button>
            </div>
          )}

          {/* State 4: FAILED */}
          {status === 'FAILED' && (
            <div className="text-center py-6 space-y-4">
              <div className="text-4xl">⚠️</div>
              <p className="text-red-400 text-sm font-semibold">
                Could not send notification. Please call us directly.
              </p>
              <a
                href={`tel:${hotelPhone}`}
                className="flex flex-col items-center gap-1 w-full py-5 rounded-2xl font-extrabold text-base text-slate-900 bg-amber-400 hover:bg-amber-500 transition-all active:scale-95 shadow-xl min-h-[72px]"
              >
                <span className="text-2xl">📱</span>
                <span>Call Front Desk Directly</span>
              </a>
            </div>
          )}
        </div>
      </div>

      <PhoneCaptureModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={(phone) => {
          setShowPhoneModal(false)
          executeRequestCall(phone)
        }}
        roomId={roomId}
        hotelId={hotelId}
      />
    </>
  )
}
