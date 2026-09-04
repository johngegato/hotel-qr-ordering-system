'use client'

import Link from 'next/link'
import { GuestSettingsProvider } from './app/stay/components/GuestSettingsProvider'
import { useGuestTheme } from './app/stay/components/GuestThemeProvider'

export default function HomePage() {
  return (
    <GuestSettingsProvider>
      <DemoContent />
    </GuestSettingsProvider>
  )
}

function DemoContent() {
  const theme = useGuestTheme()

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated background orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      {/* Grid pattern overlay */}
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

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Logo / Icon */}
        <div className="animate-fade-up animate-fade-up-delay-1 mb-8 flex justify-center">
          <div className="relative">
            <div
              className="w-24 h-24 rounded-3xl glass-strong flex items-center justify-center text-5xl"
              style={{
                border: `2px solid ${theme.primaryHex}`,
                boxShadow: `0 0 25px ${theme.glowRgba}`,
              }}
            >
              🏨
            </div>
          </div>
        </div>

        {/* Heading */}
        <h1
          className="animate-fade-up animate-fade-up-delay-2 text-5xl font-bold mb-4 leading-tight"
          style={{
            background: `linear-gradient(135deg, ${theme.primaryHex} 0%, ${theme.secondaryHex} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Kekehyu Hotel
        </h1>

        <p className="animate-fade-up animate-fade-up-delay-3 text-slate-400 text-lg mb-10 leading-relaxed">
          Scan the QR code in your room to access your personal in-room concierge experience.
        </p>

        {/* Demo Card */}
        <div className="animate-fade-up animate-fade-up-delay-4 glass rounded-2xl p-6 text-left">
          <p className="text-slate-400 text-sm mb-3 font-medium uppercase tracking-wider">
            🧪 Demo Access
          </p>
          <p className="text-slate-300 text-sm mb-4">
            Try the guest experience for Room 302:
          </p>
          <Link
            href="/app/stay?room=00000000-0000-0000-0000-000000000101&hash=secret-hash-302"
            className="block w-full text-center py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${theme.primaryHex} 0%, ${theme.secondaryHex} 100%)`,
              color: 'var(--gw-bg)',
            }}
          >
            Enter Room 302 →
          </Link>
        </div>
      </div>
    </main>
  )
}
