import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Linking,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useAutoSync } from '../lib/useAutoSync'
import type { RealtimeChannel } from '@supabase/supabase-js'

type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type TargetDepartment = 'HOUSEKEEPING' | 'MAINTENANCE' | 'FRONT_DESK'
type TaskStatus = 'PENDING' | 'CLAIMED' | 'RESOLVED'

interface TaskPayload {
  task_name: string
  quantity: number
  custom_notes: string
  priority: TaskPriority
  target_department: TargetDepartment
  is_custom?: boolean
  room_number?: string
  guest_phone?: string
  phone?: string
}

interface TaskRequest {
  id: string
  room_id: string
  hotel_id: string
  request_type?: string
  status: TaskStatus | string
  created_at: string
  payload?: TaskPayload | null
  rooms?: { room_number: string } | null
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW:    '#4ade80',
  MEDIUM: '#fbbf24',
  HIGH:   '#f97316',
  URGENT: '#f87171',
}

const DEPT_CONFIG: Record<TargetDepartment, { label: string; icon: string; color: string }> = {
  HOUSEKEEPING: { label: 'Housekeeping', icon: '🧹', color: '#38bdf8' },
  MAINTENANCE:  { label: 'Maintenance',  icon: '🔧', color: '#f97316' },
  FRONT_DESK:   { label: 'Front Desk',   icon: '🛎️', color: '#a78bfa' },
}

// ── Overdue threshold: 15 min ────────────────────────────────────────────────
const OVERDUE_MINUTES = 15

// ── SlaTimer Sub-component ───────────────────────────────────────────────────
function SlaTimer({ createdAt, slaMinutes }: { createdAt: string; slaMinutes: number }) {
  const [elapsedMin, setElapsedMin] = useState(0)

  useEffect(() => {
    const calc = () => {
      const ms = Date.now() - new Date(createdAt).getTime()
      setElapsedMin(Math.floor(ms / 60000))
    }
    calc()
    const t = setInterval(calc, 15000)
    return () => clearInterval(t)
  }, [createdAt])

  const remaining = slaMinutes - elapsedMin
  const isOverdue = remaining < 0

  return (
    <View style={[styles.slaBadge, isOverdue ? styles.slaOverdue : remaining <= 5 ? styles.slaWarning : styles.slaNormal]}>
      <Text style={[styles.slaText, isOverdue ? styles.slaTextOverdue : remaining <= 5 ? styles.slaTextWarning : styles.slaTextNormal]}>
        {isOverdue
          ? `⏱️ ${Math.abs(remaining)}m overdue`
          : `⏱️ ${remaining}m remaining (SLA ${slaMinutes}m)`}
      </Text>
    </View>
  )
}

// ── Main TaskQueue Component ─────────────────────────────────────────────────
export default function TaskQueue({ activeStaffId, activeStaffUser, refreshTrigger }: { activeStaffId?: string; activeStaffUser?: any; refreshTrigger?: number }) {
  const [tasks, setTasks] = useState<TaskRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [filterDept, setFilterDept] = useState<'ALL' | TargetDepartment>('ALL')

  const callGuest = (phone?: string, roomNumber?: string) => {
    if (!phone) {
      Alert.alert('No Phone Number', 'No phone number is registered for this guest request.')
      return
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Guest', `Dialing Room ${roomNumber ?? '—'} at ${phone}`)
    })
  }

  // ── Stable fetchTasks via useCallback ─────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('request_type', 'TASK')
        .in('status', ['PENDING', 'CLAIMED', 'ESCALATED_L1'])
        .order('created_at', { ascending: true })

      if (error) {
        console.warn('[TaskQueue] Join failed, falling back to simple query:', error.message)
        const { data: fallback, error: fallbackErr } = await supabase
          .from('requests')
          .select('*')
          .eq('request_type', 'TASK')
          .in('status', ['PENDING', 'CLAIMED', 'ESCALATED_L1'])
          .order('created_at', { ascending: true })

        if (fallbackErr) {
          console.error('[TaskQueue] Fallback fetch failed:', fallbackErr)
          return
        }
        setTasks((fallback ?? []) as unknown as TaskRequest[])
      } else {
        setTasks((data ?? []) as unknown as TaskRequest[])
      }
    } catch (err) {
      console.error('[TaskQueue] fetchTasks error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Ref allows realtime callback to always invoke the latest fetchTasks without stale closures
  const fetchTasksRef = useRef(fetchTasks)
  useEffect(() => { fetchTasksRef.current = fetchTasks }, [fetchTasks])

  // Automated background synchronization
  useAutoSync(() => fetchTasksRef.current(), { intervalMs: 6000 })

  // Trigger sync on refreshTrigger
  useEffect(() => {
    if (refreshTrigger) {
      fetchTasksRef.current()
    }
  }, [refreshTrigger])

  // Realtime subscription
  useEffect(() => {
    fetchTasksRef.current()

    const ch: RealtimeChannel = supabase
      .channel('staff-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        fetchTasksRef.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Claim Task ─────────────────────────────────────────────────────────────
  const handleClaim = async (task: TaskRequest) => {
    setProcessingId(task.id)
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'CLAIMED',
          claimed_by: activeStaffId || null,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', task.id)

      if (error) throw error

      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'CLAIMED' } : t
      ))

      try {
        await (supabase.from('audit_logs') as any).insert([{
          hotel_id: task.hotel_id,
          request_id: task.id,
          action: 'CLAIM_TASK',
          actor_id: activeStaffId || null,
          details: {
            actor_name: activeStaffUser?.full_name || 'Staff Member',
            task_name: task.payload?.task_name,
            timestamp: new Date().toISOString(),
          }
        }])
      } catch (auditErr) {
        console.warn('[TaskQueue] Non-fatal audit log error:', auditErr)
      }
    } catch (err) {
      console.error('[TaskQueue] handleClaim error:', err)
    } finally {
      setProcessingId(null)
    }
  }

  // ── Resolve Task ───────────────────────────────────────────────────────────
  const handleResolve = async (task: TaskRequest) => {
    setProcessingId(task.id)
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'RESOLVED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)

      if (error) throw error

      setTasks(prev => prev.filter(t => t.id !== task.id))

      try {
        await (supabase.from('audit_logs') as any).insert([{
          hotel_id: task.hotel_id,
          request_id: task.id,
          action: 'RESOLVE_TASK',
          actor_id: activeStaffId || null,
          details: {
            actor_name: activeStaffUser?.full_name || 'Staff Member',
            task_name: task.payload?.task_name,
            timestamp: new Date().toISOString(),
          }
        }])
      } catch (auditErr) {
        console.warn('[TaskQueue] Non-fatal audit log error:', auditErr)
      }
    } catch (err) {
      console.error('[TaskQueue] handleResolve error:', err)
    } finally {
      setProcessingId(null)
    }
  }

  const filtered = tasks.filter(t => {
    if (filterDept === 'ALL') return true
    return t.payload?.target_department === filterDept
  })

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Loading task queue…</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header & Filter Row */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>🛠️ Task Queue</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filtered.length}</Text>
          </View>
        </View>

        {/* Department Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {(['ALL', 'HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK'] as const).map((dept) => {
            const isSelected = filterDept === dept
            const label = dept === 'ALL' ? 'All Tasks' : DEPT_CONFIG[dept].label
            const icon = dept === 'ALL' ? '📋' : DEPT_CONFIG[dept].icon
            return (
              <TouchableOpacity
                key={dept}
                style={[styles.filterTab, isSelected && styles.filterTabActive]}
                onPress={() => setFilterDept(dept)}
              >
                <Text style={[styles.filterTabText, isSelected && styles.filterTabTextActive]}>
                  {icon} {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Task Cards List */}
      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySub}>No pending or active tasks at this moment.</Text>
        </View>
      ) : (
        <View style={styles.taskList}>
          {filtered.map((item) => {
            const payload = item.payload
            const priority: TaskPriority = payload?.priority ?? 'MEDIUM'
            const dept = payload?.target_department ? DEPT_CONFIG[payload.target_department] : null
            const isPending = item.status === 'PENDING'
            const isClaimed = item.status === 'CLAIMED'
            const isEscalated = item.status === 'ESCALATED_L1'
            const isProcessing = processingId === item.id
            const slaMinutes = 20

            // Extract guest phone number if provided
            const guestPhone = payload?.guest_phone || payload?.phone || payload?.custom_notes?.match(/\d{7,15}/)?.[0]

            return (
              <View
                key={item.id}
                style={[
                  styles.card,
                  isClaimed && styles.cardClaimed,
                  isEscalated && styles.cardEscalated,
                ]}
              >
                {isEscalated && (
                  <View style={styles.escalatedBanner}>
                    <Text style={styles.escalatedBannerText}>⚠️ OVERDUE — ESCALATED</Text>
                  </View>
                )}

                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.roomBadge}>
                    <Text style={styles.roomText}>
                      Room {item.rooms?.room_number || item.payload?.room_number || item.room_id || '—'}
                    </Text>
                  </View>
                  <View style={[
                    styles.priorityBadge,
                    {
                      backgroundColor: `${PRIORITY_COLORS[priority]}18`,
                      borderColor: `${PRIORITY_COLORS[priority]}40`,
                    },
                  ]}>
                    <Text style={[styles.priorityText, { color: PRIORITY_COLORS[priority] }]}>
                      {priority}
                    </Text>
                  </View>
                </View>

                {/* Task Info */}
                <Text style={styles.taskName}>{payload?.task_name ?? 'Room Request'}</Text>

                <View style={styles.metaRow}>
                  {dept && <Text style={[styles.deptLabel, { color: dept.color }]}>{dept.icon} {dept.label}</Text>}
                  {(payload?.quantity ?? 1) > 1 && <Text style={styles.qty}>× {payload!.quantity}</Text>}
                  {isClaimed && <Text style={styles.claimedBadge}>🏃 In Progress</Text>}
                </View>

                {/* Guest Direct Call Button */}
                {guestPhone ? (
                  <TouchableOpacity
                    style={styles.callGuestBtn}
                    onPress={() => callGuest(guestPhone, item.rooms?.room_number || item.payload?.room_number)}>
                    <Text style={styles.callGuestBtnText}>📞 Call Guest ({guestPhone})</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.callGuestBtn, styles.callGuestBtnDisabled]} disabled>
                    <Text style={styles.callGuestBtnDisabledText}>📞 No Phone Provided</Text>
                  </TouchableOpacity>
                )}

                {!!payload?.custom_notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Guest Notes:</Text>
                    <Text style={styles.notesText}>{payload.custom_notes}</Text>
                  </View>
                )}

                {/* SLA Timer */}
                <SlaTimer createdAt={item.created_at} slaMinutes={slaMinutes} />

                {/* Actions */}
                <View style={styles.actionRow}>
                  {(isPending || isEscalated) && (
                    <TouchableOpacity
                      style={[styles.claimBtn, isProcessing && styles.btnDisabled]}
                      onPress={() => handleClaim(item)}
                      disabled={isProcessing}
                    >
                      {isProcessing
                        ? <ActivityIndicator color="#0f172a" />
                        : <Text style={styles.claimBtnText}>✋ Claim Task</Text>
                      }
                    </TouchableOpacity>
                  )}
                  {isClaimed && (
                    <TouchableOpacity
                      style={[styles.resolveBtn, isProcessing && styles.btnDisabled]}
                      onPress={() => handleResolve(item)}
                      disabled={isProcessing}
                    >
                      {isProcessing
                        ? <ActivityIndicator color="#0f172a" />
                        : <Text style={styles.resolveBtnText}>✓ Mark Resolved</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  loadingWrap: { padding: 32, alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },

  header: { marginBottom: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  countBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  countText: { color: '#60a5fa', fontWeight: '600', fontSize: 13 },

  filterScroll: { marginBottom: 4 },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginRight: 6,
  },
  filterTabActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  filterTabText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#38bdf8' },

  emptyWrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  emptySubtitle: { color: '#64748b', fontSize: 13 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptySub: { color: '#64748b', fontSize: 13 },

  callGuestBtn: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  callGuestBtnText: { color: '#60a5fa', fontWeight: '700', fontSize: 12 },
  callGuestBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  callGuestBtnDisabledText: { color: 'rgba(255,255,255,0.3)', fontWeight: '600', fontSize: 12 },

  slaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  slaNormal: { backgroundColor: 'rgba(56,189,248,0.1)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)' },
  slaWarning: { backgroundColor: 'rgba(251,191,36,0.15)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)' },
  slaOverdue: { backgroundColor: 'rgba(248,113,113,0.15)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)' },
  slaText: { fontSize: 12, fontWeight: '700' },
  slaTextNormal: { color: '#38bdf8' },
  slaTextWarning: { color: '#fbbf24' },
  slaTextOverdue: { color: '#f87171' },


  // ── taskList replaces FlatList — no height constraints, no overflow clipping ──
  taskList: {
    width: '100%',
  },

  card: {
    backgroundColor: 'rgba(30,41,59,0.9)',
    borderColor: 'rgba(96,165,250,0.2)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,  // increased from 12 to prevent cards from touching
  },
  cardClaimed:   { borderColor: 'rgba(74,222,128,0.3)',  backgroundColor: 'rgba(20,50,35,0.8)' },
  cardEscalated: { borderColor: '#ef4444', backgroundColor: 'rgba(50,15,15,0.9)' },

  escalatedBanner: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderColor: 'rgba(239,68,68,0.5)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  escalatedBannerText: { color: '#ef4444', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  roomBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roomText: { color: '#60a5fa', fontSize: 15, fontWeight: 'bold' },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  priorityText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  taskName: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 6 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  deptLabel:    { fontSize: 12, fontWeight: '600' },
  qty:          { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  claimedBadge: { fontSize: 12, color: '#4ade80', fontWeight: '600' },

  notesBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  notesLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  notesText:  { color: '#cbd5e1', fontSize: 13 },

  slaTimer: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderColor: 'rgba(96,165,250,0.25)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 14,  // increased to give breathing room before action buttons
  },
  slaBreached:     { backgroundColor: 'rgba(248,113,113,0.15)', borderColor: 'rgba(248,113,113,0.5)' },
  slaTimerText:    { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  slaBreachedText: { color: '#f87171' },

  // ── actionRow: full width, proper min-height so buttons are always fully visible ──
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    minHeight: 48,
  },
  claimBtn: {
    flex: 1,
    backgroundColor: '#60a5fa',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 14 },

  resolveBtn: {
    flex: 1,
    backgroundColor: '#4ade80',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 14 },

  btnDisabled: { opacity: 0.6 },
})
