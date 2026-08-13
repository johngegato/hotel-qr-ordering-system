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

      if (error) throw error

      if (data) {
        setRequestId((data as { id: string }).id)
        setStatus('PENDING')
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
        <div className="glass-strong rounded-3xl p-6 max-w-sm w-full relative overflow-hidden animate-fade-up">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors"
          >
            ✕
          </button>

          {/* Modal Header */}
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl pulse-gold"
              style={{
                background: `linear-gradient(135deg, ${theme.badgeBg} 0%, rgba(0,0,0,0.4) 100%)`,
                border: `1px solid ${theme.badgeBorder}`,
              }}
            >
              📞
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Front Desk Assistance</h2>
            <p className="text-slate-400 text-xs">Room {roomNumber}</p>
          </div>

          {/* State 1: IDLE */}
          {status === 'IDLE' && (
            <div className="space-y-3">
              <a
                href={`tel:${hotelPhone}`}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: theme.gradient,
                  color: '#0f172a',
                }}
              >
                <span>📱</span> Direct Phone Call ({hotelPhone})
              </a>

              <button
                onClick={handleRequestCall}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-200 transition-all duration-200 hover:bg-white/10 disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <span>🛎️</span> {isSubmitting ? 'Requesting...' : 'Request Front Desk Callback'}
              </button>
            </div>
          )}

          {/* State 2: PENDING */}
          {status === 'PENDING' && (
            <div className="text-center py-4 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                Notifying Front Desk...
              </div>

              <div className="text-4xl font-mono font-bold text-white tracking-wider">
                {formatCountdown(countdown)}
              </div>

              <p className="text-slate-300 text-xs leading-relaxed">
                We have alerted the front desk staff. A team member will call your room shortly.
              </p>
            </div>
          )}

          {/* State 3: CLAIMED */}
          {status === 'CLAIMED' && (
            <div className="text-center py-4 space-y-4 animate-fade-in">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl bg-green-500/20 border border-green-500/40 text-green-400">
                ✓
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/20">
                Staff Responded
              </div>

              <h3 className="text-base font-bold text-white">Staff Member is Calling!</h3>

              <p className="text-slate-300 text-xs leading-relaxed">
                A front desk staff member has claimed your request and is dialing your room now.
              </p>

              <button
                onClick={onClose}
                className="mt-2 w-full py-2.5 rounded-xl font-semibold text-xs text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Close Window
              </button>
            </div>
          )}

          {/* State 4: FAILED */}
          {status === 'FAILED' && (
            <div className="text-center py-4 space-y-4">
              <p className="text-red-400 text-xs font-medium">
                Could not send notification. Please try calling directly.
              </p>
              <a
                href={`tel:${hotelPhone}`}
                className="block w-full py-3 rounded-xl font-semibold text-xs text-slate-900 bg-amber-400 hover:bg-amber-500 transition-colors"
              >
                Call Front Desk Directly
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
