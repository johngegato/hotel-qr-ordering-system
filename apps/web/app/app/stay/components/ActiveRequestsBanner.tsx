'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

export interface ActiveRequestItem {
  id: string
  request_type: 'CALL_REQUEST' | 'SPA_BOOKING' | 'FOOD_ORDER' | 'TASK' | string
  status: 'PENDING' | 'PENDING_ON_CALL' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED' | 'PREPARING' | 'RESOLVED' | string
  payload: Record<string, unknown>
  created_at: string
}

interface ActiveRequestsBannerProps {
  roomId: string
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  CALL_REQUEST: { label: 'Front Desk Call', icon: '📞' },
  SPA_BOOKING:  { label: 'Spa Appointment', icon: '💆' },
  FOOD_ORDER:   { label: 'Dining Order',    icon: '🍽️' },
  TASK:         { label: 'Room Service',    icon: '🧹' },
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:          { label: 'Pending Response', bg: 'rgba(250, 204, 21, 0.12)', color: '#facc15', border: 'rgba(250, 204, 21, 0.3)' },
  PENDING_ON_CALL:  { label: 'On-Call Therapist Notified', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
  CLAIMED:          { label: 'Staff Assigned',  bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
  PREPARING:        { label: 'Kitchen Preparing', bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' },
  CONFIRMED:        { label: 'Confirmed / On The Way', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' },
}

export default function ActiveRequestsBanner({ roomId }: ActiveRequestsBannerProps) {
  const [activeRequests, setActiveRequests] = useState<ActiveRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchActiveRequests = useCallback(async () => {
    if (!roomId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('requests')
      .select('*')
      .eq('room_id', roomId)
      .not('status', 'in', '("RESOLVED","DECLINED","CANCELLED")')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setActiveRequests(data as ActiveRequestItem[])
    }
    setLoading(false)
  }, [roomId])

  useEffect(() => {
    fetchActiveRequests()

    if (!roomId) return

    // Supabase Realtime channel
    const channel = supabase
      .channel(`active_requests_drawer_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchActiveRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, fetchActiveRequests])

  if (loading || activeRequests.length === 0) return null

  // Display max 5 items by default
  const displayedRequests = activeRequests.slice(0, 5)

  const formatElapsedMins = (isoString: string) => {
    const elapsed = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
    if (elapsed < 1) return 'Just now'
    if (elapsed === 1) return '1 min ago'
    return `${elapsed} mins ago`
  }

  const getRequestSummary = (req: ActiveRequestItem) => {
    const p = req.payload || {}
    if (req.request_type === 'CALL_REQUEST') {
      return (p.note as string) || 'Requested Front Desk callback'
    }
    if (req.request_type === 'SPA_BOOKING') {
      return `${p.service_name || 'Spa Service'} @ ${p.slot_time || 'Scheduled Time'}`
    }
    if (req.request_type === 'FOOD_ORDER') {
      const items = (p.items as Array<{ name: string; quantity: number }>) || []
      if (items.length > 0) {
        return items.map(i => `${i.quantity}x ${i.name}`).join(', ')
      }
      return 'In-room dining order'
    }
    if (req.request_type === 'TASK') {
      return (p.task_name as string) || 'Room service request'
    }
    return 'Active Service Request'
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-sm mx-auto transition-all duration-300">
      <div
        className="rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300"
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(16px)',
          borderColor: 'rgba(251, 191, 36, 0.3)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Toggle Header Bar */}
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          className="w-full px-5 py-3.5 flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
            </span>
            <span className="text-xs font-extrabold tracking-wide text-white uppercase">
              Active Requests ({activeRequests.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              {isExpanded ? 'Minimize ▼' : 'Expand ▲'}
            </span>
          </div>
        </button>

        {/* Collapsible Content */}
        {isExpanded && (
          <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto border-t border-white/10">
            {displayedRequests.map(req => {
              const cat = CATEGORY_CONFIG[req.request_type] || { label: 'Service Request', icon: '🛎️' }
              const status = STATUS_CONFIG[req.status] || {
                label: req.status,
                bg: 'rgba(255,255,255,0.06)',
                color: '#cbd5e1',
                border: 'rgba(255,255,255,0.12)',
              }

              return (
                <div
                  key={req.id}
                  className="rounded-2xl p-3.5 border transition-all duration-200"
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderColor: status.border,
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-xs font-bold text-white">{cat.label}</span>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{
                        background: status.bg,
                        color: status.color,
                        borderColor: status.border,
                      }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 font-medium line-clamp-1 mb-2">
                    {getRequestSummary(req)}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold border-t border-white/5 pt-1.5">
                    <span>Submitted {formatElapsedMins(req.created_at)}</span>
                    <span className="text-slate-400">ID: #{req.id.slice(0, 6)}</span>
                  </div>
                </div>
              )
            })}
            {activeRequests.length > 5 && (
              <p className="text-[10px] text-slate-500 text-center pt-1 font-medium">
                + {activeRequests.length - 5} more active request(s)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
