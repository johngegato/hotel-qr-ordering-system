'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminAuthProvider, useAdminAuth } from './components/AdminAuthContext'
import AdminLoginForm from './components/AdminLoginForm'

const NAV_LINKS = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/users', label: 'Staff Accounts', icon: '👥' },
  { href: '/admin/fb', label: 'F&B Menu', icon: '🍽️' },
  { href: '/admin/spa', label: 'Spa & Therapists', icon: '💆' },
  { href: '/admin/requests', label: 'Tasks & SLA', icon: '🧹' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/rooms', label: 'Rooms & QR', icon: '🚪' },
  { href: '/admin/function-rooms', label: 'Function Rooms', icon: '🏛️' },
  { href: '/admin/equipments', label: 'Equipment', icon: '🎤' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
  { href: '/admin/audit', label: 'Audit Trail', icon: '📜' },
]

function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { adminUser, loading, logout } = useAdminAuth()
  const pathname = usePathname()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 text-slate-400">
        <div className="text-4xl animate-spin">⏳</div>
        <p className="text-sm font-semibold tracking-wide uppercase text-indigo-400">
          Verifying Admin Access...
        </p>
      </div>
    )
  }

  if (!adminUser) {
    return <AdminLoginForm />
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Global Admin Utility Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-white/10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">

            {/* Left: Brand / Console Name */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link href="/admin" className="flex items-center gap-2.5 group">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
                  🏨
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white leading-tight flex items-center gap-1.5">
                    <span>Grand Hotel</span>
                    <span className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Admin
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">Operations Console</div>
                </div>
              </Link>
            </div>

            {/* Middle: Desktop Navigation Bar */}
            <nav className="hidden xl:flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Right: User Profile Badge & Sign Out Button */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-sm">🧑‍💼</span>
                <div className="text-left">
                  <div className="font-bold text-white leading-tight truncate max-w-[130px]">
                    {adminUser.full_name}
                  </div>
                  <div className="text-[10px] text-indigo-400 font-black tracking-wider uppercase">
                    {adminUser.role}
                  </div>
                </div>
              </div>

              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer"
                title="Sign out of Admin Console"
              >
                <span>🚪</span>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>

          {/* Sub-header Navigation for Tablets / Mobile Screens */}
          <div className="xl:hidden flex items-center gap-1.5 overflow-x-auto py-2.5 border-t border-white/5 scrollbar-none">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 border border-indigo-400 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white/5 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <div className="flex-1">{children}</div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </AdminAuthProvider>
  )
}
