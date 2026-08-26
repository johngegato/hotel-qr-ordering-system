import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { supabase } from '../lib/supabase'
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
}

interface TaskRequest {
  id: string
  room_id: string
  hotel_id: string
  request_type?: string
  status: TaskStatus | string
  created_at: string
  payload?: TaskPayload | null
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW:    '#4ade80',
  MEDIUM: '#fbbf24',
  HIGH:   '#f97316',
  URGENT: '#f87171',
}

const DEPT_CONFIG: Record<TargetDepartment, { label: string; icon: string; color: string }> = {
  HOUSEKEEPING: { label: 'Housekeeping', icon: '🧹', color: '#60a5fa' },
  MAINTENANCE:  { label: 'Maintenance',  icon: '🔧', color: '#f97316' },
  FRONT_DESK:   { label: 'Front Desk',   icon: '🎩', color: '#a78bfa' },
}

// ─── SLA Countdown Timer ──────────────────────────────────────
function SlaTimer({ createdAt, slaMinutes }: { createdAt: string; slaMinutes: number }) {
  const [secsLeft, setSecsLeft] = useState(() => {
    const deadline = new Date(createdAt).getTime() + slaMinutes * 60 * 1000
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000))
  })
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const timer = setInterval(() => {
      setSecsLeft(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (secsLeft === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start()
    }
  }, [secsLeft, pulseAnim])

  const breached = secsLeft === 0
  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60
  const label = breached ? 'SLA BREACHED' : `${mins}:${String(secs).padStart(2, '0')} left`

  return (
    <Animated.View style={[styles.slaTimer, breached && styles.slaBreached, { transform: [{ scale: pulseAnim }] }]}>
      <Text style={[styles.slaTimerText, breached && styles.slaBreachedText]}>
        {breached ? '⚠️ ' : '⏱ '}{label}
      </Text>
    </Animated.View>
  )
}

// ─── Main Component ────────────────────────────────────────────
export default function TaskQueue({ activeStaffId }: { activeStaffId?: string }) {
  const [tasks, setTasks] = useState<TaskRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [deptFilter, setDeptFilter] = useState<TargetDepartment | 'ALL'>('ALL')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('request_type', 'TASK')
      .in('status', ['PENDING', 'CLAIMED', 'ESCALATED_L1'])
      .order('created_at', { ascending: true })
    if (!error) setTasks((data as TaskRequest[]) || [])
    setLoading(false)
  }, [])

  // Mutable ref to always call the latest fetchTasks
  const fetchRef = useRef(fetchTasks)
  useEffect(() => {
    fetchRef.current = fetchTasks
  }, [fetchTasks])

  useEffect(() => {
    fetchRef.current()
    const channel: RealtimeChannel = supabase
      .channel('task-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as TaskRequest
          if (r.request_type === 'TASK' && ['PENDING', 'CLAIMED', 'ESCALATED_L1'].includes(r.status)) {
            setTasks(prev => [r, ...prev.filter(t => t.id !== r.id)])
          }
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as TaskRequest
          if (!['PENDING', 'CLAIMED', 'ESCALATED_L1'].includes(r.status)) {
            setTasks(prev => prev.filter(t => t.id !== r.id))
          } else {
            setTasks(prev => prev.map(t => t.id === r.id ? r : t))
          }
        }
      })
      .subscribe((status) => {
        // CRITICAL: Refetch when subscription confirms to catch any missed events
        if (status === 'SUBSCRIBED') {
          fetchRef.current()
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleClaim = async (task: TaskRequest) => {
    setProcessingId(task.id)
    const snapshot = tasks.find(t => t.id === task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'CLAIMED' } : t))
    const { error } = await supabase
      .from('requests')
      .update({ status: 'CLAIMED', claimed_by: activeStaffId || null, claimed_at: new Date().toISOString() })
      .eq('id', task.id)
    if (error && snapshot) setTasks(prev => prev.map(t => t.id === task.id ? snapshot : t))
    setProcessingId(null)
  }

  const handleResolve = async (task: TaskRequest) => {
    setProcessingId(task.id)
    const snapshot = tasks.find(t => t.id === task.id)
    setTasks(prev => prev.filter(t => t.id !== task.id))
    const { error } = await supabase
      .from('requests')
      .update({ status: 'RESOLVED', claimed_by: activeStaffId || null, claimed_at: new Date().toISOString() })
      .eq('id', task.id)
    if (error && snapshot) setTasks(prev => [snapshot, ...prev])
    setProcessingId(null)
  }

  const filtered = deptFilter === 'ALL'
    ? tasks
    : tasks.filter(t => t.payload?.target_department === deptFilter)

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.loadingText}>Loading task queue...</Text>
      </View>
    )
  }

  const deptTabs: (TargetDepartment | 'ALL')[] = ['ALL', 'HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK']

  return (
    // ─── container: NO flex:1 inside ScrollView — causes height collapse on RN Web
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>🛎️ Room Tasks</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{tasks.length} Active</Text>
        </View>
      </View>

      {/* Department Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        {deptTabs.map(d => {
          const cfg = d !== 'ALL' ? DEPT_CONFIG[d as TargetDepartment] : null
          const isActive = deptFilter === d
          return (
            <TouchableOpacity
              key={d}
              onPress={() => setDeptFilter(d)}
              style={[
                styles.filterTab,
                isActive && {
                  borderColor: cfg?.color ?? '#818cf8',
                  backgroundColor: `${cfg?.color ?? '#818cf8'}18`,
                },
              ]}
            >
              <Text style={[styles.filterTabText, isActive && { color: cfg?.color ?? '#818cf8' }]}>
                {d === 'ALL' ? '📋 All' : `${cfg!.icon} ${cfg!.label}`}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Task Cards — rendered as plain Views, NOT FlatList inside ScrollView (anti-pattern on RN Web) */}
      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>No Active Tasks</Text>
          <Text style={styles.emptySub}>All room requests have been handled.</Text>
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
                    <Text style={styles.escalatedBannerText}>⚠️ OVERDUE — ESCALATED TO MANAGER</Text>
                  </View>
                )}

                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.roomBadge}>
                    <Text style={styles.roomText}>Room 302</Text>
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

                {!!payload?.custom_notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Guest Notes:</Text>
                    <Text style={styles.notesText}>{payload.custom_notes}</Text>
                  </View>
                )}

                {/* SLA Timer */}
                <SlaTimer createdAt={item.created_at} slaMinutes={slaMinutes} />

                {/* Actions — full-width row, no overflow clipping */}
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
  // ── No flex:1 on container — prevents height collapse inside ScrollView on RN Web ──
  container: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  loadingContainer: { padding: 32, alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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

  // ── Horizontal scroll for filter tabs — prevents wrapping issues ──
  filterScroll: { marginBottom: 14 },
  filterScrollContent: { gap: 8, paddingRight: 8 },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterTabText: { color: '#64748b', fontSize: 12, fontWeight: '700' },

  emptyCard: {
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
  emptySub: { color: '#64748b', fontSize: 13 },

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
