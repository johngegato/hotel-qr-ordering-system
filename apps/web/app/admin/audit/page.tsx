'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database, AuditLog } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const ACTION_BADGES: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  REQUEST_CREATED: { label: 'Created',     bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', icon: '📝' },
  STATUS_CHANGED:  { label: 'Status Update', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', icon: '🔄' },
  SLA_BREACHED:    { label: 'SLA Breach',  bg: 'rgba(248,113,113,0.15)', color: '#f87171', icon: '⏱' },
  ESCALATED_L1:    { label: 'Escalated L1', bg: 'rgba(239,68,68,0.25)',  color: '#ef4444', icon: '⚠️' },
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  // Timeline modal state
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [ticketTimeline, setTicketTimeline] = useState<AuditLog[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('audit_logs')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs((data as AuditLog[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel('admin-audit-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload: { new: AuditLog }) => {
        setLogs(prev => [payload.new, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const openTimelineModal = async (log: AuditLog) => {
    setSelectedLog(log)
    if (!log.request_id) {
      setTicketTimeline([log])
      return
    }
    setLoadingTimeline(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('audit_logs')
      .select('*')
      .eq('request_id', log.request_id)
      .order('created_at', { ascending: true })
    setTicketTimeline((data as AuditLog[]) || [log])
    setLoadingTimeline(false)
  }

  const actions = ['ALL', 'REQUEST_CREATED', 'STATUS_CHANGED', 'SLA_BREACHED', 'ESCALATED_L1']

  const filteredLogs = logs.filter(log => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      const jsonStr = JSON.stringify(log.details).toLowerCase()
      const reqId = (log.request_id || '').toLowerCase()
      return jsonStr.includes(s) || reqId.includes(s)
    }
    return true
  })

  const exportCSV = () => {
    if (logs.length === 0) return
    const headers = ['ID', 'Timestamp', 'Action', 'Request ID', 'Details']
    const rows = logs.map(l => [
      l.id,
      l.created_at,
      l.action,
      l.request_id || 'N/A',
      `"${JSON.stringify(l.details).replace(/"/g, '""')}"`,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>← Admin Hub</a>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#94a3b8', fontSize: 14 }}>Audit Trail</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>📜 Immutable Audit Logs</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Complete timestamped event trail for request lifecycles and SLA compliance.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={exportCSV}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
            >
              📥 Export CSV
            </button>
            <button
              onClick={fetchLogs}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 12, padding: '10px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              🔄 Refresh Trail
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Action Tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {actions.map(a => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid',
                  borderColor: actionFilter === a ? '#6366f1' : 'rgba(255,255,255,0.1)',
                  background: actionFilter === a ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: actionFilter === a ? '#818cf8' : '#64748b',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                {a === 'ALL' ? '📋 All Events' : (ACTION_BADGES[a]?.label ?? a)}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <input
            type="text"
            placeholder="Search payload, room, or ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f1f5f9', fontSize: 13 }}
          />
        </div>

        {/* Log Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>Loading audit trail...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📜</div>
            <p style={{ color: '#475569', margin: 0 }}>No audit logs match your search.</p>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Request ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Details</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Timeline</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => {
                  const badge = ACTION_BADGES[log.action] ?? { label: log.action, bg: 'rgba(255,255,255,0.1)', color: '#94a3b8', icon: '📌' }
                  const time = new Date(log.created_at).toLocaleString()
                  const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>{time}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 11 }}>
                          <span>{badge.icon}</span> {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
                        {log.request_id ? `${log.request_id.slice(0, 8)}...` : 'N/A'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#cbd5e1', maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {detailsStr}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => openTimelineModal(log)}
                          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket Timeline Modal */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: '2rem', width: '100%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🔍 Ticket Event Timeline</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, fontFamily: 'monospace' }}>
                  Request: {selectedLog.request_id ?? 'Global Audit Log'}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {loadingTimeline ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading timeline...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {ticketTimeline.map((item, idx) => {
                  const badge = ACTION_BADGES[item.action] ?? { label: item.action, bg: 'rgba(255,255,255,0.1)', color: '#94a3b8', icon: '📌' }
                  return (
                    <div key={item.id} style={{ display: 'flex', gap: 14 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: badge.bg, border: `1px solid ${badge.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                          {badge.icon}
                        </div>
                        {idx < ticketTimeline.length - 1 && <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />}
                      </div>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: badge.color }}>{badge.label}</span>
                          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{new Date(item.created_at).toLocaleTimeString()}</span>
                        </div>
                        <pre style={{ margin: 0, fontSize: 11, color: '#cbd5e1', background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(item.details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
