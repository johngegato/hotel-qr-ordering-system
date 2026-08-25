import React, { useCallback, useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
} from 'react-native'
import { supabase } from './lib/supabase'
import CallQueue from './components/CallQueue'
import SpaQueue from './components/SpaQueue'
import SpaTimetable from './components/SpaTimetable'
import FoodQueue from './components/FoodQueue'
import TaskQueue from './components/TaskQueue'
import { StaffUser } from './components/UserManagement'
import DedicatedCallModule from './components/DedicatedCallModule'
import RequestHistory from './components/RequestHistory'
import IncomingRequestAlert, { type IncomingRequest } from './components/IncomingRequestAlert'

// ─── Types ───────────────────────────────────────────────────

type ConnectionStatus = 'connecting' | 'connected' | 'error'

interface HotelInfo {
  name: string
  count: number
}

// ─── Constants ───────────────────────────────────────────────

const { width } = Dimensions.get('window')

// ─── Colors ──────────────────────────────────────────────────

const COLORS = {
  bg: '#020617',
  surface: '#0f172a',
  surfaceLight: '#1e293b',
  border: 'rgba(255,255,255,0.08)',
  gold: '#fbbf24',
  goldDark: '#d97706',
  goldMuted: 'rgba(251,191,36,0.12)',
  green: '#4ade80',
  greenMuted: 'rgba(74,222,128,0.12)',
  red: '#f87171',
  redMuted: 'rgba(248,113,113,0.12)',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
}

// ─── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const pulseAnim = React.useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (status === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start()
    }
  }, [status, pulseAnim])

  const configs = {
    connecting: {
      label: 'Connecting...',
      color: COLORS.gold,
      bg: COLORS.goldMuted,
      borderColor: 'rgba(251,191,36,0.3)',
    },
    connected: {
      label: '✓ Connected to Supabase',
      color: COLORS.green,
      bg: COLORS.greenMuted,
      borderColor: 'rgba(74,222,128,0.3)',
    },
    error: {
      label: '✕ Connection Failed',
      color: COLORS.red,
      bg: COLORS.redMuted,
      borderColor: 'rgba(248,113,113,0.3)',
    },
  }

  const cfg = configs[status]

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: cfg.bg, borderColor: cfg.borderColor },
      ]}
    >
      {status === 'connecting' ? (
        <ActivityIndicator size="small" color={cfg.color} style={{ marginRight: 8 }} />
      ) : (
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: cfg.color, transform: [{ scale: pulseAnim }] },
          ]}
        />
      )}
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

// ─── Stat Card ────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

// ─── Main App ─────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [hotelInfo, setHotelInfo] = useState<HotelInfo | null>(null)
  const [roomCount, setRoomCount] = useState<number>(0)
  const [pendingCalls, setPendingCalls] = useState(0)
  const [pendingSpa, setPendingSpa] = useState(0)
  const [pendingFood, setPendingFood] = useState(0)
  const [pendingTasks, setPendingTasks] = useState(0)
  const [totalRequests, setTotalRequests] = useState(0)
  const [resolvedToday, setResolvedToday] = useState(0)
  const [activeStaffUser, setActiveStaffUser] = useState<StaffUser | null>(null)
  const [incomingAlert, setIncomingAlert] = useState<IncomingRequest | null>(null)
  const [loginEmail, setLoginEmail] = useState('frontdesk@demo.local')
  const [loginPassword, setLoginPassword] = useState('demo123456')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const fadeAnim = React.useRef(new Animated.Value(0)).current
  const slideAnim = React.useRef(new Animated.Value(30)).current

  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const fetchStats = async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [callsRes, spaRes, foodRes, taskRes, totalRes, resolvedRes] = await Promise.all([
      // Pending call requests
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID).eq('request_type', 'CALL_REQUEST').eq('status', 'PENDING'),
      // Pending spa bookings
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID).eq('request_type', 'SPA_BOOKING')
        .in('status', ['PENDING', 'PENDING_ON_CALL']),
      // Pending food orders
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID).eq('request_type', 'FOOD_ORDER')
        .in('status', ['PENDING', 'PREPARING']),
      // Pending room tasks
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID).eq('request_type', 'TASK')
        .in('status', ['PENDING', 'CLAIMED']),
      // Total active requests today
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID).gte('created_at', todayStart.toISOString()),
      // Resolved today
      supabase.from('requests').select('id', { count: 'exact', head: true })
        .eq('hotel_id', HOTEL_ID)
        .in('status', ['RESOLVED', 'CONFIRMED', 'DECLINED', 'CLAIMED', 'CANCELLED'])
        .gte('created_at', todayStart.toISOString()),
    ])

    setPendingCalls(callsRes.count ?? 0)
    setPendingSpa(spaRes.count ?? 0)
    setPendingFood(foodRes.count ?? 0)
    setPendingTasks(taskRes.count ?? 0)
    setTotalRequests(totalRes.count ?? 0)
    setResolvedToday(resolvedRes.count ?? 0)
  }

  const fetchData = async () => {
    setStatus('connecting')

    try {
      // Check hotels
      const { data: hotels, error: hotelError } = await supabase
        .from('hotels')
        .select('id, name')
        .limit(1)
        .single()

      if (hotelError) throw hotelError

      // Count rooms
      const { count: rooms } = await supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true })

      setHotelInfo({ name: hotels.name, count: 1 })
      setRoomCount(rooms ?? 0)
      setStatus('connected')

      // Fetch live stats
      await fetchStats()

      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start()
    } catch {
      setStatus('error')
    }
  }

  const hydrateIncomingAlert = async (request: any): Promise<IncomingRequest | null> => {
    if (!request) return null

    const payload = request.payload || {}
    const roomFromPayload =
      payload.room_number ??
      payload.room ??
      payload.room_no ??
      payload.roomNumber ??
      ''

    let roomNumber = typeof roomFromPayload === 'string' && roomFromPayload.trim() ? roomFromPayload.trim() : ''

    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

    if ((!roomNumber || isUuid(roomNumber)) && request.room_id) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('room_number')
        .eq('id', request.room_id)
        .maybeSingle()

      if (roomData?.room_number) {
        roomNumber = String(roomData.room_number)
      }
    }

    return {
      ...request,
      rooms: { room_number: roomNumber || '—' },
      payload: {
        ...payload,
        room_number: roomNumber || '—',
      },
    }
  }

  const handleLogin = useCallback(async () => {
    setIsLoggingIn(true)
    setLoginError('')

    try {
      const email = loginEmail.trim().toLowerCase()
      const password = loginPassword.trim()

      if (!email || !password) {
        throw new Error('Enter both email and password.')
      }

      const { data, error } = await supabase
        .from('staff_users')
        .select('id, full_name, email, role, password, is_active')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        if (error.code === '42501' || error.code === 'PGRST301') {
          throw new Error('Staff login lookup is blocked by Supabase RLS. The staff_users table must allow public credential checks.')
        }

        throw error
      }

      if (!data || data.is_active !== true) {
        throw new Error('Invalid staff credentials. Try frontdesk@demo.local / demo123456.')
      }

      if (data.password !== password) {
        throw new Error('Invalid staff credentials. Try frontdesk@demo.local / demo123456.')
      }

      setActiveStaffUser({
        id: data.id,
        name: data.full_name,
        email: data.email,
        role: data.role,
      })
      setLoginError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to log in.'
      setLoginError(message)
      setActiveStaffUser(null)
    } finally {
      setIsLoggingIn(false)
    }
  }, [loginEmail, loginPassword])

  const handleLogout = () => {
    setActiveStaffUser(null)
    setLoginError('')
  }

  useEffect(() => {
    fetchData()

    // Subscribe to ALL requests changes to keep stats live
    const channel = supabase
      .channel('app-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
        fetchStats()
        // Fire aggressive alert on every new PENDING request
        if (payload.eventType === 'INSERT' && (payload.new as any)?.status === 'PENDING') {
          hydrateIncomingAlert(payload.new as any)
            .then((nextRequest) => {
              if (nextRequest) setIncomingAlert(nextRequest as IncomingRequest)
            })
            .catch(() => {
              setIncomingAlert(payload.new as IncomingRequest)
            })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (!activeStaffUser && status !== 'error' && status === 'connected') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.loginContainer}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>🏨 Staff Login</Text>
            <Text style={styles.loginSubtitle}>Front desk access</Text>

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="frontdesk@demo.local"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="demo123456"
              placeholderTextColor="#64748b"
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              <Text style={styles.loginButtonText}>
                {isLoggingIn ? 'Signing in...' : 'Login'}
              </Text>
            </TouchableOpacity>

            {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}

            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Demo credentials</Text>
              <Text style={styles.demoText}>frontdesk@demo.local</Text>
              <Text style={styles.demoText}>demo123456</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ⚠️ Aggressive incoming request alert */}
      <IncomingRequestAlert
        request={incomingAlert}
        onDismiss={() => setIncomingAlert(null)}
      />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerIcon}>🏨</Text>
            <View style={styles.headerMeta}>
              <Text style={styles.headerTitle}>Front Desk</Text>
              <Text style={styles.headerSubtitle}>Tablet Interface</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} activeOpacity={0.9}>
              <Text style={styles.logoutButtonText}>↩ Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {status === 'connecting' && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.gold} />
            <Text style={styles.loadingText}>Connecting to Supabase...</Text>
          </View>
        )}

        {status === 'connected' && hotelInfo && (
          <Animated.View
            style={[
              styles.content,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Hotel Card */}
            <View style={styles.hotelCard}>
              <View style={styles.hotelCardHeader}>
                <Text style={styles.hotelCardLabel}>Active Property</Text>
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.hotelName}>{hotelInfo.name}</Text>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Stats */}
              <View style={styles.statsRow}>
                <StatCard icon="🚪" label="Rooms" value={String(roomCount)} />
                <View style={styles.statsDivider} />
                <StatCard icon="📋" label="Requests Today" value={String(totalRequests)} />
                <View style={styles.statsDivider} />
                <StatCard icon="✅" label="Resolved Today" value={String(resolvedToday)} />
              </View>
            </View>

            {/* Module Cards */}
            <Text style={styles.sectionTitle}>Modules</Text>
            <View style={styles.moduleGrid}>
              {[
                { icon: '📞', label: 'Call Queue',   badge: String(pendingCalls), color: COLORS.gold },
                { icon: '💆', label: 'Spa Bookings', badge: String(pendingSpa),   color: '#a78bfa' },
                { icon: '🍽️', label: 'Food Orders',  badge: String(pendingFood),  color: '#34d399' },
                { icon: '🛎️', label: 'Room Tasks',   badge: String(pendingTasks), color: '#60a5fa' },
              ].map((mod) => (
                <TouchableOpacity
                  key={mod.label}
                  style={styles.moduleCard}
                  activeOpacity={0.7}
                >
                  <View style={[styles.moduleIconBg, { backgroundColor: `${mod.color}15` }]}>
                    <Text style={styles.moduleIcon}>{mod.icon}</Text>
                  </View>
                  <Text style={styles.moduleLabel}>{mod.label}</Text>
                  <View style={[styles.moduleBadge, { backgroundColor: `${mod.color}20` }]}>
                    <Text style={[styles.moduleBadgeText, { color: mod.color }]}>
                      {mod.badge}
                    </Text>
                  </View>
                  <Text style={styles.moduleArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 1. Dedicated Call Requests Module & Real-time Call Queue */}
            <DedicatedCallModule activeStaffId={activeStaffUser?.id || undefined} />
            <CallQueue activeStaffId={activeStaffUser?.id} />

            {/* 2. Spa Timetable & Appointments Queue */}
            <SpaTimetable activeStaffUser={activeStaffUser} activeStaffId={activeStaffUser?.id} />
            <SpaQueue activeStaffId={activeStaffUser?.id} activeStaffUser={activeStaffUser} />

            {/* 3. Room Task Queue */}
            <TaskQueue activeStaffId={activeStaffUser?.id} />

            {/* 4. Food Orders Queue */}
            <FoodQueue activeStaffId={activeStaffUser?.id} />

            {/* 5. All Request History Logs */}
            <RequestHistory />


            {/* Phase indicator */}
            <View style={styles.phaseNote}>
              <Text style={styles.phaseNoteText}>
                🚀 Phase 4 Active — Room Requests & Task Routing Loop
              </Text>
            </View>
          </Animated.View>
        )}

        {status === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorMessage}>
              Could not connect to Supabase. Please check your{' '}
              <Text style={styles.errorHighlight}>.env</Text> credentials and try again.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
              <Text style={styles.retryText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
    flexGrow: 1,
  },

  // Login screen
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  loginCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#020617',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  loginTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  loginSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0b1220',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  loginButton: {
    marginTop: 18,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.gold,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  loginButtonDisabled: {
    opacity: 0.75,
  },
  loginButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
  },
  loginError: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.32)',
    backgroundColor: 'rgba(248,113,113,0.1)',
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  demoBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.26)',
  },
  demoTitle: {
    color: '#fcd34d',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  demoText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },

  // Header
  header: {
    marginBottom: 24,
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerMeta: {
    flex: 1,
  },
  headerIcon: {
    fontSize: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#7f1d1d',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  logoutButtonText: {
    color: '#fff1f2',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },

  // Content — no flex:1 inside ScrollView; let children define their own height
  content: {
    width: '100%',
  },

  // Hotel Card
  hotelCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  hotelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  hotelCardLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activePill: {
    backgroundColor: COLORS.greenMuted,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  activePillText: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hotelName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 16,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  statIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.gold,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    alignSelf: 'stretch',
  },

  // Modules
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  moduleGrid: {
    gap: 10,
  },
  moduleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  moduleIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moduleIcon: {
    fontSize: 22,
  },
  moduleLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  moduleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  moduleBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  moduleArrow: {
    fontSize: 16,
    color: COLORS.textMuted,
  },

  // Phase note
  phaseNote: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
  },
  phaseNoteText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '500',
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorHighlight: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: COLORS.goldMuted,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  retryText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '600',
  },
})
