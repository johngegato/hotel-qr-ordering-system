'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface FnBDiningFABProps {
  initialPhone?: string | null
  hotelId?: string | null
}

export default function FnBDiningFAB({
  initialPhone,
  hotelId = HOTEL_ID,
}: FnBDiningFABProps) {
  const [fnbPhone, setFnbPhone] = useState<string>(initialPhone || '+1-800-555-0199')
  const [loading, setLoading] = useState(!initialPhone)

  useEffect(() => {
    if (initialPhone) {
      setFnbPhone(initialPhone)
      setLoading(false)
      return
    }

    const fetchFnbPhone = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('hotels')
          .select('fnb_phone_number, phone')
          .eq('id', hotelId || HOTEL_ID)
          .maybeSingle()

        if (data?.fnb_phone_number) {
          setFnbPhone(data.fnb_phone_number)
        } else if (data?.phone) {
          setFnbPhone(data.phone)
        }
      } catch (err) {
        console.error('[FnBDiningFAB] Failed to fetch F&B phone:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFnbPhone()
  }, [initialPhone, hotelId])

  return (
    <div className="fixed bottom-24 right-4 sm:right-6 z-30 flex items-center">
      {/* Floating F&B Call Button */}
      <a
        href={`tel:${fnbPhone}`}
        aria-label={`Call F&B Room Service at ${fnbPhone}`}
        className="group relative flex items-center justify-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 min-h-[50px] rounded-full text-slate-950 font-extrabold text-sm sm:text-base shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-emerald-300/70"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #059669 100%)',
          boxShadow: '0 10px 25px -4px rgba(16, 185, 129, 0.55), 0 0 15px rgba(52, 211, 153, 0.35)',
        }}
      >
        {/* Pulse ring animation */}
        <span className="absolute -inset-1 rounded-full bg-emerald-400/40 animate-ping opacity-60 pointer-events-none" />

        <span className="text-xl sm:text-2xl leading-none transform group-hover:scale-110 transition-transform">
          📞
        </span>
        <span className="font-extrabold tracking-wide uppercase text-xs sm:text-sm text-slate-950">
          Call Kitchen
        </span>
        {fnbPhone && (
          <span className="text-[11px] font-mono font-bold opacity-90 hidden md:inline text-slate-900 bg-emerald-200/60 px-2 py-0.5 rounded-md">
            {fnbPhone}
          </span>
        )}
      </a>
    </div>
  )
}
