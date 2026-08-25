'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database, RequestItem, AuditLog } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface AdminStats {
  activeSessions: number
  totalRevenue: number
  avgTtaMins: number
  slaCompliance: number
  pendingRequests: number
}

const MODULES = [
  {
    title: '⚙️ Hotel Settings & Branding',
    route: '/admin/settings',
    description: 'Configure property name, direct phone call number, logo graphic & guest web app color scheme.',
    color: '#fbbf24',
    badge: 'Branding & Theme',
  },
  {
    title: '📊 Executive Analytics',
    route: '/admin/analytics',
    description: 'Live KPI cards, revenue breakdown (F&B vs. Spa), request volume metrics & CSV reporting.',
    color: '#34d399',
    badge: 'Real-Time ROI',
  },
  {
    title: '💆 Spa & Therapists',
    route: '/admin/spa',
    description: 'Service catalog control, instant 86/out of service toggles & on-call therapist shift roster.',
    color: '#a78bfa',
    badge: 'Catalog & Shift Manager',
  },
  {
    title: '🍽️ F&B Kitchen & Bar',
    route: '/admin/fb',
    description: 'Live dish & drink stock toggles, dietary tags (vegan, GF, halal) & numerical menu sorting.',
    color: '#f59e0b',
    badge: 'Menu Control',
  },
  {
    title: '🧹 Task & SLA Builder',
    route: '/admin/requests',
    description: '1-tap request builder, priority routing (Low to Urgent) & departmental SLA target windows.',
    color: '#60a5fa',
    badge: 'SLA Configuration',
  },
  {
    title: '📜 Immutable Audit Logs',
    route: '/admin/audit',
    description: 'Unalterable timestamped audit trail, ticket timeline modal for dispute settlement & CSV exports.',
    color: '#f43f5e',
    badge: 'Dispute Resolution',
  },
  {
    title: '🔑 Room & QR Manager',
    route: '/admin/rooms',
    description: 'Generate, preview, print, and delete room QR codes that authenticate guest sessions.',
    color: '#38bdf8',
    badge: 'QR Generator',
  },
]

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats>({
    activeSessions: 1,
    totalRevenue: 0,
    avgTtaMins: 4,
    slaCompliance: 98,
    pendingRequests: 0,
  })
  const [recentAudits, setRecentAudits] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboardData = async () => {
    setLoading(true)

    // Fetch rooms / sessions count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: sessionCount } = await (supabase as any)
      .from('guest_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVE')

    // Fetch requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reqs } = await (supabase as any)
      .from('requests')
      .select('*')
      .eq('hotel_id', HOTEL_ID)

    const list = (reqs as RequestItem[]) || []
    let rev = 0
    let pending = 0

    list.forEach(r => {
      if (['PENDING', 'PENDING_ON_CALL', 'PREPARING'].includes(r.status)) pending++
      const p = r.payload as Record<string, unknown> | null
      if (p) {
        if (typeof p.total_price === 'number') rev += p.total_price
        else if (typeof p.price === 'number') rev += p.price
      }
    })

    setStats({
      activeSessions: sessionCount || 1,
      totalRevenue: rev,
      avgTtaMins: 3,
      slaCompliance: 98,
      pendingRequests: pending,
    })

    // Fetch recent audit logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: audits } = await (supabase as any)
      .from('audit_logs')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .order('created_at', { ascending: false })
      .limit(6)

    setRecentAudits((audits as AuditLog[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchDashboardData()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, fetchDashboardData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 10px', borderRadius: 12, border: '1px solid rgba(251,191,36,0.3)' }}>
                🏨 Grand Hotel & Spa
              </span>
              <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} /> System Active
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Admin Web Portal</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Central management hub for operations, catalog controls, SLA metrics & audit trails.</p>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="/admin/settings"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fbbf24', textDecoration: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              ⚙️ Hotel Settings
            </a>
            <a
              href="/admin/analytics"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              📊 Executive ROI Dashboard
            </a>
          </div>
        </div>

        {/* Live KPI Cards Overview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            { label: 'Active Guest Sessions', value: stats.activeSessions, icon: '🔑', color: '#38bdf8', sub: 'Verified Room QRs' },
            { label: 'Total Revenue', value: `₱${stats.totalRevenue.toLocaleString()}`, icon: '💰', color: '#34d399', sub: 'F&B + Spa Bookings' },
            { label: 'Active Requests', value: stats.pendingRequests, icon: '⚡', color: '#fbbf24', sub: 'Awaiting Staff Action' },
            { label: 'Avg Ack Time (TTA)', value: `${stats.avgTtaMins} min`, icon: '⏱', color: '#a78bfa', sub: 'Response Speed' },
            { label: 'SLA Compliance', value: `${stats.slaCompliance}%`, icon: '🎯', color: '#f43f5e', sub: 'On-Time Resolution' },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.15rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{kpi.label}</span>
                <span style={{ fontSize: 18 }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: kpi.color, marginBottom: 2 }}>{loading ? '...' : kpi.value}</div>
              <div style={{ fontSize: 11, color: '#475569' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Core Admin Modules Grid */}
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: '1.25rem', color: '#f1f5f9' }}>Core Portal Modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
          {MODULES.map(mod => (
            <a
              key={mod.title}
              href={mod.route}
              style={{
                textDecoration: 'none',
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 22,
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, border-color 0.2s',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>{mod.title}</h3>
                  <span style={{ fontSize: 11, fontWeight: 700, color: mod.color, background: `${mod.color}15`, border: `1px solid ${mod.color}30`, padding: '3px 10px', borderRadius: 12 }}>
                    {mod.badge}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{mod.description}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: mod.color }}>Open Module →</span>
                <span style={{ color: '#475569', fontSize: 12 }}>{mod.route}</span>
              </div>
            </a>
          ))}
        </div>

        {/* Live Activity & Audit Stream */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>⚡ Real-Time Audit Activity Feed</h3>
            <a href="/admin/audit" style={{ color: '#818cf8', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>View Full Audit Trail →</a>
          </div>

          {recentAudits.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No recent audit events logged.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentAudits.map(log => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '10px 14px', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: log.action === 'ESCALATED_L1' ? '#f87171' : log.action === 'REQUEST_CREATED' ? '#60a5fa' : '#fbbf24' }}>
                      {log.action}
                    </span>
                    <span style={{ color: '#cbd5e1' }}>
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                    </span>
                  </div>
                  <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
