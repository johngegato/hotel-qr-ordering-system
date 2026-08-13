'use client'

import { useState } from 'react'
import CallFrontDeskModal from './CallFrontDeskModal'
import ActiveRequestsBanner from './ActiveRequestsBanner'
import FrontDeskFAB from './FrontDeskFAB'
import { useGuestTheme } from './GuestThemeProvider'

interface WelcomeCardClientProps {
  roomId: string
  hotelId: string
  hash?: string
  hotelName: string
  roomNumber: string
  floor: string | null
  roomType: string
  hotelPhone?: string | null
  hotelLogo?: string | null
  colorScheme?: string | null
}

export default function WelcomeCardClient({
  roomId,
  hotelId,
  hash = 'secret-hash-302',
  hotelName,
  roomNumber,
  floor,
  roomType,
  hotelPhone = '+18005550100',
  hotelLogo,
}: WelcomeCardClientProps) {
  const [isCallModalOpen, setIsCallModalOpen] = useState(false)
  const theme = useGuestTheme()

  const roomTypeLabels: Record<string, string> = {
    STANDARD: 'Standard Room',
    DELUXE: 'Deluxe Room',
    SUITE: 'Suite',
    PENTHOUSE: 'Penthouse Suite',
  }

  const quickServices = [
    { icon: '🍽️', label: 'Dining',     action: 'link',      href: `/app/stay/dining?room=${roomId}&hash=${hash}` },
    { icon: '💆', label: 'Spa',        action: 'link',      href: `/app/stay/spa?room=${roomId}&hash=${hash}` },
    { icon: '🛎️', label: 'Requests',  action: 'link',      href: `/app/stay/requests?room=${roomId}&hash=${hash}` },
    { icon: '📞', label: 'Front Desk', action: 'callModal', href: '#' },
  ]

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6">
      {/* Animated background orbs using dynamic theme orb gradients */}
      <div className="bg-orb bg-orb-1" style={{ background: theme.orbGradient, opacity: 0.2 }} />
      <div className="bg-orb bg-orb-2" style={{ background: theme.orbGradient, opacity: 0.15 }} />
      <div className="bg-orb bg-orb-3" style={{ background: theme.orbGradient, opacity: 0.12 }} />

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

      <div className="relative z-10 w-full max-w-md mx-auto py-8">
        {/* Active Requests Realtime Banner */}
        <ActiveRequestsBanner roomId={roomId} />

        {/* Main welcome card - Centered */}
        <div className="glass-strong rounded-3xl p-8 sm:p-10 text-center animate-fade-up shadow-2xl border border-white/15">
          {/* Hotel logo or icon */}
          <div className="animate-fade-up animate-fade-up-delay-1 mb-6 flex justify-center">
            {hotelLogo ? (
              <img
                src={hotelLogo}
                alt={hotelName}
                className="w-24 h-24 rounded-3xl object-cover shadow-2xl"
                style={{
                  border: `2px solid ${theme.primaryHex}`,
                  boxShadow: `0 0 25px ${theme.glowRgba}`,
                }}
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl pulse-gold shadow-2xl"
                style={{
                  background: `linear-gradient(135deg, ${theme.badgeBg} 0%, rgba(0,0,0,0.4) 100%)`,
                  border: `1px solid ${theme.badgeBorder}`,
                }}
              >
                🏨
              </div>
            )}
          </div>

          {/* Welcome text */}
          <p className="animate-fade-up animate-fade-up-delay-1 text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-widest mb-2">
            {hotelName}
          </p>

          <h1 className="animate-fade-up animate-fade-up-delay-2 text-5xl sm:text-6xl font-extrabold mb-1 tracking-tight">
            <span
              style={{
                background: theme.gradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Room
            </span>
            <br />
            <span className="text-white">{roomNumber}</span>
          </h1>

          <p className="animate-fade-up animate-fade-up-delay-2 text-slate-300 text-base font-semibold mt-2 mb-8">
            {roomTypeLabels[roomType] ?? roomType}
            {floor && ` · Floor ${floor}`}
          </p>

          {/* Status badge */}
          <div className="animate-fade-up animate-fade-up-delay-3 flex items-center justify-center gap-2 mb-8">
            <div
              className="px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2.5 shadow-lg"
              style={{
                background: theme.badgeBg,
                border: `1px solid ${theme.badgeBorder}`,
                color: theme.primaryHex,
              }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: theme.primaryHex }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: theme.primaryHex }} />
              </span>
              Session Active
            </div>
          </div>

          {/* Divider */}
          <div
            className="animate-fade-up animate-fade-up-delay-3 mb-8"
            style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
          />

          {/* Welcome message */}
          <p className="animate-fade-up animate-fade-up-delay-4 text-slate-200 text-base leading-relaxed mb-8 font-medium">
            Welcome! Your personal concierge is ready. Select a service below or call the front desk anytime.
          </p>

          {/* Service quick-access buttons - Touch Optimized & Enlarged */}
          <div className="animate-fade-up animate-fade-up-delay-4 grid grid-cols-2 gap-4">
            {quickServices.map((item) => {
              if (item.action === 'callModal') {
                return (
                  <button
                    key={item.label}
                    onClick={() => setIsCallModalOpen(true)}
                    className="group relative flex flex-col items-center justify-center gap-2 p-5 rounded-3xl transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] min-h-[120px] text-center shadow-lg border border-white/10 hover:border-amber-400/40 hover:bg-white/10"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <span className="text-4xl transform group-hover:scale-110 transition-transform">{item.icon}</span>
                    <span className="text-slate-100 text-sm font-extrabold">{item.label}</span>
                  </button>
                )
              }

              return (
                <a
                  key={item.label}
                  href={item.href}
                  className="group relative flex flex-col items-center justify-center gap-2 p-5 rounded-3xl transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] min-h-[120px] text-center shadow-lg border border-white/10 hover:border-indigo-400/40 hover:bg-white/10"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-4xl transform group-hover:scale-110 transition-transform">{item.icon}</span>
                  <span className="text-slate-100 text-sm font-extrabold">{item.label}</span>
                </a>
              )
            })}
          </div>
        </div>

        {/* Footer note */}
        <p className="animate-fade-up animate-fade-up-delay-4 text-center text-slate-600 text-xs mt-6">
          Need help? Dial <strong className="text-slate-500">0</strong> for front desk
        </p>
      </div>

      {/* Call Front Desk Modal */}
      <CallFrontDeskModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        roomId={roomId}
        hotelId={hotelId}
        hotelPhone={hotelPhone}
        roomNumber={roomNumber}
      />
      {/* Global Floating Action Button */}
      <FrontDeskFAB
        hotelPhone={hotelPhone}
        roomId={roomId}
        roomNumber={roomNumber}
        hotelId={hotelId}
      />
    </main>
  )
}
