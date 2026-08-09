'use client'

import { useState } from 'react'
import CallFrontDeskModal from './CallFrontDeskModal'
import ActiveRequestsBanner from './ActiveRequestsBanner'

interface WelcomeCardClientProps {
  roomId: string
  hotelId: string
  hash?: string
  hotelName: string
  roomNumber: string
  floor: string | null
  roomType: string
  hotelPhone?: string | null
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
}: WelcomeCardClientProps) {
  const [isCallModalOpen, setIsCallModalOpen] = useState(false)

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
        {/* Active Requests Realtime Banner */}
        <ActiveRequestsBanner roomId={roomId} />

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
            {quickServices.map((item) => {
              if (item.action === 'callModal') {
                return (
                  <button
                    key={item.label}
                    onClick={() => setIsCallModalOpen(true)}
                    className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 hover:bg-amber-500/10 hover:border-amber-500/30 hover:-translate-y-0.5 text-left"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-slate-300 text-xs font-medium">{item.label}</span>
                  </button>
                )
              }

              return (
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
    </main>
  )
}
