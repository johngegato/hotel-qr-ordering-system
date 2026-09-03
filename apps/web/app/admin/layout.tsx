'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { AdminAuthProvider, useAdminAuth } from './components/AdminAuthContext'
import AdminLoginForm from './components/AdminLoginForm'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'
const supabase = createSupabaseBrowserClient()

const NAV_LINKS = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/users', label: 'Staff Accounts', icon: '👥' },
  { href: '/admin/fb', label: 'F&B Menu', icon: '🍽️' },
  { href: '/admin/spa', label: 'Spa & Therapists', icon: '💆' },
  { href: '/admin/requests', label: 'Tasks & SLA', icon: '🧹' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/rooms', label: 'Rooms & QR', icon: '🚪' },
  { href: '/admin/function-rooms', label: 'Function Rooms', icon: '🏛️' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
  { href: '/admin/audit', label: 'Audit Trail', icon: '📜' },
]

function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { adminUser, loading, logout } = useAdminAuth()
  const pathname = usePathname()
  const [hotelName, setHotelName] = useState('Hotel')

  useEffect(() => {
    if (!adminUser) return

    const loadHotelName = async () => {
      try {
        const { data } = await (supabase as any)
          .from('hotels')
          .select('name')
          .eq('id', HOTEL_ID)
          .maybeSingle()

        const nextHotelName = data?.name?.trim() || 'Hotel'
        setHotelName(nextHotelName)
      } catch (error) {
        console.warn('Failed to load admin hotel name:', error)
      }
    }

    loadHotelName()

    const channel = (supabase as any)
      .channel('admin-hotel-branding-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hotels', filter: `id=eq.${HOTEL_ID}` },
        (payload: { new?: { name?: string | null } }) => {
          const nextName = payload.new?.name?.trim()
          if (nextName) {
            setHotelName(nextName)
          }
        },
      )
      .subscribe()

    return () => { void (supabase as any).removeChannel(channel) }
  }, [adminUser])

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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-between gap-3">
              <Link href="/admin" className="flex items-center gap-2.5 group min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-lg shadow-inner group-hover:scale-105 transition-transform shrink-0">
                  🏨
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-white leading-tight flex items-center gap-1.5 truncate">
                    <span className="truncate">{hotelName}</span>
                    <span className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                      Admin
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">Operations Console</div>
                </div>
              </Link>

              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 md:hidden rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition-all cursor-pointer"
                title="Sign out of Admin Console"
              >
                <span>🚪</span>
                <span>Out</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 md:justify-end md:min-w-[220px]">
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs min-w-0">
                <span className="text-sm shrink-0">🧑‍💼</span>
                <div className="text-left min-w-0">
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
                className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer"
                title="Sign out of Admin Console"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 pb-3 pt-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 border border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-white/5 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>
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
