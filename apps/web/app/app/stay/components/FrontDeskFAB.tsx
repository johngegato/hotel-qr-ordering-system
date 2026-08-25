'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database } from '@hotel-qr/supabase/types'
import CallFrontDeskModal from './CallFrontDeskModal'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface FrontDeskFABProps {
  hotelPhone?: string | null
  roomId?: string | null
  roomNumber?: string | null
  hotelId?: string | null
}

export default function FrontDeskFAB({
  hotelPhone: initialPhone,
  roomId,
  roomNumber,
  hotelId = HOTEL_ID,
}: FrontDeskFABProps) {
  const [phone, setPhone] = useState<string>(initialPhone || '+1-800-555-0100')
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone)
      return
    }

    const fetchHotelPhone = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('hotels')
          .select('phone')
          .eq('id', HOTEL_ID)
          .single()

        if (data?.phone) {
          setPhone(data.phone)
        }
      } catch (err) {
        console.error('Failed to fetch hotel phone for FAB:', err)
      }
    }

    fetchHotelPhone()
  }, [initialPhone])

  const handleClick = (e: React.MouseEvent) => {
    // If room details are available, open callback modal for rich request experience;
    // user can also directly dial tel: from the modal or directly dial phone if clicked.
    if (roomId && roomNumber) {
      e.preventDefault()
      setIsModalOpen(true)
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        {/* Floating Call Button - Touch Optimized & Enlarged */}
        <a
          href={`tel:${phone}`}
          onClick={handleClick}
          aria-label={`Call Front Desk at ${phone}`}
          className="group relative flex items-center justify-center gap-3 px-6 py-4.5 min-h-[64px] min-w-[64px] rounded-full text-slate-950 font-extrabold text-base shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-amber-300/60"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #d97706 100%)',
            boxShadow: '0 10px 30px -4px rgba(245, 158, 11, 0.55), 0 0 20px rgba(251, 191, 36, 0.4)',
          }}
        >
          {/* Subtle pulse ring around button */}
          <span className="absolute -inset-1 rounded-full bg-amber-400/40 animate-ping opacity-60 pointer-events-none" />

          <span className="text-3xl leading-none transform group-hover:scale-110 transition-transform">📞</span>
          <span className="hidden sm:inline font-extrabold tracking-wider uppercase text-sm text-slate-950">
            Call Front Desk
          </span>
          <span className="text-xs font-mono font-bold opacity-90 hidden md:inline text-slate-900 bg-amber-200/50 px-2 py-0.5 rounded-md">
            {phone}
          </span>
        </a>
      </div>

      {/* Optional rich Call Modal if room details are provided */}
      {roomId && roomNumber && (
        <CallFrontDeskModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          roomId={roomId}
          hotelId={hotelId || HOTEL_ID}
          hotelPhone={phone}
          roomNumber={roomNumber}
        />
      )}
    </>
  )
}
