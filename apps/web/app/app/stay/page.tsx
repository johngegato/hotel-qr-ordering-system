import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Metadata } from 'next'
import WelcomeCardClient from './components/WelcomeCardClient'

export const metadata: Metadata = {
  title: 'Welcome to Your Room',
  description: 'Your personal in-room concierge is ready.',
}

// ─── Types ───────────────────────────────────────────────────

interface StayPageProps {
  searchParams: Promise<{ room?: string; hash?: string }>
}

// ─── Error Card ────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      <div className="bg-orb bg-orb-2" style={{ opacity: 0.1 }} />

      <div className="glass-strong rounded-3xl p-8 max-w-sm w-full text-center animate-fade-up">
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl"
          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
        >
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Invalid QR Code</h1>
        <p className="text-slate-400 text-sm leading-relaxed">{message}</p>
        <p className="text-slate-500 text-xs mt-6">
          Please scan the QR code in your room again, or contact the front desk for assistance.
        </p>
        <a
          href="tel:+18005550100"
          className="mt-6 block w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
          }}
        >
          📞 Call Front Desk
        </a>
      </div>
    </main>
  )
}

// ─── Page (Server Component) ───────────────────────────────────

export default async function StayPage({ searchParams }: StayPageProps) {
  const params = await searchParams
  const roomId = params.room
  const hash = params.hash

  // Validate URL params exist
  if (!roomId || !hash) {
    return (
      <ErrorCard message="This QR code appears to be incomplete. Please scan the code in your room again." />
    )
  }

  // Query Supabase to verify room and hash
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('rooms')
    .select('id, room_number, floor, room_type, is_active, hotel_id, hotels(name, phone)')
    .eq('id', roomId)
    .eq('qr_auth_hash', hash)
    .eq('is_active', true)
    .single()

  const room = data as unknown as {
    id: string;
    room_number: string;
    floor: string | null;
    room_type: string;
    is_active: boolean;
    hotel_id: string;
    hotels: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
  } | null

  if (error || !room) {
    return (
      <ErrorCard message="This QR code is not recognised or has expired. Please contact the front desk." />
    )
  }

  const hotelData = room.hotels && !Array.isArray(room.hotels) ? room.hotels : null
  const hotelName = hotelData?.name ?? 'Grand Hotel'
  const hotelPhone = hotelData?.phone ?? '+18005550100'

  return (
    <WelcomeCardClient
      roomId={room.id}
      hotelId={room.hotel_id}
      hotelName={hotelName}
      hotelPhone={hotelPhone}
      roomNumber={room.room_number}
      floor={room.floor}
      roomType={room.room_type}
    />
  )
}

