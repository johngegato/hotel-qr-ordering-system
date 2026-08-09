import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome to Your Room',
  description: 'Your personal in-room concierge is ready.',
}

// ─── Types ───────────────────────────────────────────────────

interface StayPageProps {
  searchParams: Promise<{ room?: string; hash?: string }>
}

// ─── Loading Skeleton ─────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="glass-strong rounded-3xl p-8">
          <div className="shimmer h-16 w-16 rounded-2xl mb-6 mx-auto" />
          <div className="shimmer h-6 rounded-lg mb-3 w-3/4 mx-auto" />
          <div className="shimmer h-4 rounded-lg mb-2 w-1/2 mx-auto" />
          <div className="shimmer h-4 rounded-lg w-2/3 mx-auto mt-8" />
        </div>
      </div>
    </div>
  )
}

// ─── Error Card ────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      <div className="bg-orb bg-orb-2" style={{ opacity: 0.1 }} />

      <div className="glass-strong rounded-3xl p-8 max-w-sm w-full text-center animate-fade-up">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl"
          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
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

// ─── Welcome Card ──────────────────────────────────────────────

function WelcomeCard({ roomNumber, hotelName, floor, roomType }: {
  roomNumber: string
  hotelName: string
  floor: string | null
  roomType: string
}) {
  const roomTypeLabels: Record<string, string> = {
    STANDARD: 'Standard Room',
    DELUXE: 'Deluxe Room',
    SUITE: 'Suite',
    PENTHOUSE: 'Penthouse Suite',
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6">
      {/* Animated background orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm mx-auto">
        {/* Main welcome card */}
        <div className="glass-strong rounded-3xl p-8 text-center animate-fade-up">
          {/* Hotel icon */}
          <div className="animate-fade-up animate-fade-up-delay-1 mb-6 flex justify-center">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl pulse-gold"
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(217,119,6,0.15) 100%)',
                border: '1px solid rgba(251,191,36,0.3)',
              }}
            >
              🏨
            </div>
          </div>

          {/* Welcome text */}
          <p className="animate-fade-up animate-fade-up-delay-1 text-slate-400 text-sm font-medium uppercase tracking-widest mb-2">
            {hotelName}
          </p>

          <h1 className="animate-fade-up animate-fade-up-delay-2 text-5xl font-bold mb-1">
            <span className="text-gold-gradient">Room</span>
            <br />
            <span className="text-white">{roomNumber}</span>
          </h1>

          <p className="animate-fade-up animate-fade-up-delay-2 text-slate-400 text-sm mt-2 mb-8">
            {roomTypeLabels[roomType] ?? roomType}
            {floor && ` · Floor ${floor}`}
          </p>

          {/* Status badge */}
          <div className="animate-fade-up animate-fade-up-delay-3 flex items-center justify-center gap-2 mb-8">
            <div
              className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2"
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: '#4ade80',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              Session Active
            </div>
          </div>

          {/* Divider */}
          <div
            className="animate-fade-up animate-fade-up-delay-3 mb-6"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          />

          {/* Welcome message */}
          <p className="animate-fade-up animate-fade-up-delay-4 text-slate-300 text-sm leading-relaxed mb-6">
            Welcome! Your personal concierge is ready. Explore dining, spa, and room services below.
          </p>

          {/* Service quick-access buttons */}
          <div className="animate-fade-up animate-fade-up-delay-4 grid grid-cols-2 gap-3">
            {[
              { icon: '🍽️', label: 'Dining', href: '#', soon: false },
              { icon: '💆', label: 'Spa', href: '#', soon: false },
              { icon: '🛎️', label: 'Requests', href: '#', soon: false },
              { icon: '📞', label: 'Front Desk', href: '#', soon: false },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 hover:bg-amber-500/10 hover:border-amber-500/30 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-slate-300 text-xs font-medium">{item.label}</span>
                {item.soon && (
                  <span
                    className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(251,191,36,0.1)',
                      color: '#fbbf24',
                      fontSize: '9px',
                    }}
                  >
                    SOON
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="animate-fade-up animate-fade-up-delay-4 text-center text-slate-600 text-xs mt-6">
          Need help? Dial <strong className="text-slate-500">0</strong> for front desk
        </p>
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
    .select('id, room_number, floor, room_type, is_active, hotel_id, hotels(name)')
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
    hotels: { name: string } | { name: string }[] | null;
  } | null

  if (error || !room) {
    return (
      <ErrorCard message="This QR code is not recognised or has expired. Please contact the front desk." />
    )
  }

  const hotelName =
    room.hotels && !Array.isArray(room.hotels)
      ? (room.hotels as { name: string }).name
      : 'Grand Hotel'

  return (
    <WelcomeCard
      roomNumber={room.room_number}
      hotelName={hotelName}
      floor={room.floor}
      roomType={room.room_type}
    />
  )
}
