import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
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
  Platform,
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
import PendingRequestsReminderModal, { type PendingRequestItem } from './components/PendingRequestsReminderModal'
import {
  setupNotificationChannels,
  registerForPushNotifications,
  triggerAlarmNotification,
  addNotificationResponseListener,
  addNotificationReceivedListener,
} from './lib/notifications'
import {
  createNotifeeChannels,
  startStaffMonitoringService,
  stopStaffMonitoringService,
  checkAndPromptBatteryOptimization,
  runBackgroundWatchdogCheck,
} from './lib/foregroundService'

import {
  saveStaffSession,
  getSavedStaffSession,
  clearStaffSession,
} from './lib/authStorage'
import { useAutoSync } from './lib/useAutoSync'

// ─── Global Error Boundary ───────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[App Global ErrorBoundary Captured]:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={errorStyles.safe}>
          <StatusBar barStyle="light-content" backgroundColor="#020617" />
          <View style={errorStyles.container}>
            <Text style={errorStyles.headerIcon}>⚠️</Text>
            <Text style={errorStyles.title}>Runtime Error Captured</Text>
            <Text style={errorStyles.subtitle}>
              An unexpected error occurred. The details below can help diagnose the issue:
            </Text>
            <ScrollView style={errorStyles.scroll} contentContainerStyle={errorStyles.scrollContent}>
              <Text style={errorStyles.errorText}>{this.state.error?.toString()}</Text>
              {this.state.error?.stack ? (
                <Text style={errorStyles.stackText}>{this.state.error.stack}</Text>
              ) : null}
            </ScrollView>
            <TouchableOpacity
              style={errorStyles.button}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={errorStyles.buttonText}>Try Reloading App State</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )
    }

    return this.props.children
  }
}

const errorStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f87171',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: {
    width: '100%',
    maxHeight: 300,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  scrollContent: {
    padding: 14,
  },
  errorText: {
    color: '#fbbf24',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 10,
  },
  stackText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 14,
  },
})

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

// ─── App Root Component Wrapped with ErrorBoundary ───────────

export default function App() {
  return (
    <ErrorBoundary>
      <MainAppContent />
    </ErrorBoundary>
  )
}

// ─── Main App Content ────────────────────────────────────────

function MainAppContent() {
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
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [incomingAlert, setIncomingAlert] = useState<IncomingRequest | null>(null)
  const [unhandledPendingList, setUnhandledPendingList] = useState<PendingRequestItem[] | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const fadeAnim = React.useRef(new Animated.Value(0)).current
  const slideAnim = React.useRef(new Animated.Value(30)).current
  const lastDismissedReminderAtRef = React.useRef<number>(0)

  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  // ─── Auto-Login / Restore Saved Session on App Startup ──────
  useEffect(() => {
    let isMounted = true

    async function restoreSession() {
      try {
        const savedUser = await getSavedStaffSession()
        if (savedUser && isMounted) {
          setActiveStaffUser(savedUser)

          // Background validation to ensure account is still active in database
          try {
            const { data } = await supabase
              .from('staff_users')
              .select('id, full_name, role, is_active')
              .eq('id', savedUser.id)
              .maybeSingle()

            if (isMounted) {
              if (data && data.is_active === false) {
                // Account was deactivated by administrator
                await clearStaffSession()
                setActiveStaffUser(null)
              } else if (data) {
                // Update local session with any fresh profile data
                const updatedUser: StaffUser = {
                  id: savedUser.id,
                  name: data.full_name || savedUser.name,
                  email: savedUser.email,
                  role: data.role || savedUser.role,
                }
                setActiveStaffUser(updatedUser)
                await saveStaffSession(updatedUser)
              }
            }
          } catch {
            // Network error or offline: keep user logged in with cached session
          }
        }
      } catch (err) {
        console.warn('[App] Session restoration error:', err)
      } finally {
        if (isMounted) {
          setIsRestoringSession(false)
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  // ─── 5-Minute Recurring Check for Unhandled Requests ────────
  const checkUnhandledRequests = useCallback(async (isScheduledOrInitial = false) => {
    try {
      const now = Date.now()
      const timeSinceDismissed = now - lastDismissedReminderAtRef.current
      // If user acknowledged within the last 5 minutes (300,000 ms), do NOT re-show popup unless 5-min timer explicitly fired
      if (!isScheduledOrInitial && timeSinceDismissed < 5 * 60 * 1000) {
        return
      }

      const { data, error } = await supabase
        .from('requests')
        .select('id, request_type, status, payload, created_at, room_id, rooms(room_number)')
        .eq('hotel_id', HOTEL_ID)
        .in('request_type', ['CALL_REQUEST', 'SPA_BOOKING', 'TASK', 'FOOD_ORDER'])
        .in('status', ['PENDING', 'PENDING_ON_CALL'])
        .order('created_at', { ascending: true })

      if (error) {
        console.warn('[PendingReminder] Failed to query unhandled requests:', error)
        return
      }

      if (data && data.length > 0) {
        if (isScheduledOrInitial || timeSinceDismissed >= 5 * 60 * 1000) {
          setUnhandledPendingList(data as PendingRequestItem[])
          // Trigger aggressive alarm notification if on mobile/tablet
          if (Platform.OS !== 'web') {
            triggerAlarmNotification({
              title: `${data.length} Unhandled Requests Pending`,
              body: `Reminder: ${data.length} pending guest requests require staff attention!`,
              requestId: data[0].id,
              roomNumber: 'Multiple Rooms',
              requestType: 'PENDING_REMINDER',
            })
          }
        }
      } else {
        setUnhandledPendingList(null)
      }
    } catch (err) {
      console.warn('[PendingReminder] Check error:', err)
    }
  }, [HOTEL_ID])

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
        throw new Error('Invalid credentials. Please check your email and password.')
      }

      if (data.password !== password) {
        throw new Error('Invalid credentials. Please check your email and password.')
      }

      const userObj: StaffUser = {
        id: data.id,
        name: data.full_name,
        email: data.email,
        role: data.role,
      }
      setActiveStaffUser(userObj)
      await saveStaffSession(userObj)
      setLoginError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to log in.'
      setLoginError(message)
      setActiveStaffUser(null)
    } finally {
      setIsLoggingIn(false)
    }
  }, [loginEmail, loginPassword])

  const handleLogout = async () => {
    try {
      await clearStaffSession()
    } catch (err) {
      console.warn('[App] Logout clear session error:', err)
    }
    stopStaffMonitoringService().catch(() => {})
    setActiveStaffUser(null)
    setLoginPassword('')
    setLoginError('')
  }

  const [refreshKey, setRefreshKey] = useState(0)

  // ─── Notification Channels & Foreground Service Setup ────────
  // MUST run on mount (before any request arrives), not gated behind login.
  // Creates both the ALARM-stream and MONITOR channels.
  useEffect(() => {
    if (Platform.OS === 'web') return

    setupNotificationChannels()
      .catch((err) => console.warn('[App] setupNotificationChannels:', err))

    createNotifeeChannels()
      .catch((err) => console.warn('[App] createNotifeeChannels:', err))

    registerForPushNotifications()
      .then((token) => {
        if (!token && Platform.OS === 'android') {
          Alert.alert(
            '🔔 Enable Notifications',
            'Notifications are required to receive incoming guest requests. Please go to Settings → App → Notifications and enable them.',
            [{ text: 'OK' }]
          )
        }
      })
      .catch((err) => console.warn('[App] registerForPushNotifications:', err))

    const subResponse = addNotificationResponseListener(async (data) => {
      if (data?.requestId) {
        setRefreshKey((k) => k + 1)
        try {
          const { data: req } = await supabase
            .from('requests')
            .select('*, rooms(room_number)')
            .eq('id', data.requestId)
            .maybeSingle()
          if (req) {
            const nextReq = await hydrateIncomingAlert(req)
            if (nextReq) {
              setIncomingAlert(nextReq)
            }
          }
        } catch {
          // ignore
        }
      }
    })

    const subReceived = addNotificationReceivedListener(async (notif) => {
      const data = notif?.request?.content?.data
      if (data?.requestId) {
        setRefreshKey((k) => k + 1)
        try {
          const { data: req } = await supabase
            .from('requests')
            .select('*, rooms(room_number)')
            .eq('id', data.requestId)
            .maybeSingle()
          if (req) {
            const nextReq = await hydrateIncomingAlert(req)
            if (nextReq) {
              setIncomingAlert(nextReq)
            }
          }
        } catch {
          // ignore
        }
      }
    })

    return () => {
      subResponse.remove()
      subReceived.remove()
    }
  }, []) // ← empty deps: runs ONCE at mount, before login

  // ─── Start Foreground Service & Update push token on login ────
  useEffect(() => {
    if (Platform.OS === 'web') return

    if (activeStaffUser) {
      // Prompt staff to disable battery optimization for reliable 24/7 background execution
      checkAndPromptBatteryOptimization().catch((err) => {
        console.warn('[App] Battery optimization check caught:', err)
      })

      // Start 24/7 background monitoring service to keep WebSocket alive when screen is off
      startStaffMonitoringService(HOTEL_ID).catch((err) => {
        console.warn('[App] startStaffMonitoringService error:', err)
      })

      registerForPushNotifications()
        .then((token) => {
          if (token) {
            Promise.resolve(
              supabase
                .from('staff_users')
                .update({ push_token: token } as any)
                .eq('id', activeStaffUser.id)
            ).catch(() => {})
          }
        })
        .catch((err) => {
          console.warn('[App] Push token DB update caught:', err)
        })
    } else {
      stopStaffMonitoringService().catch(() => {})
    }
  }, [activeStaffUser?.id])

  // ─── 5-Minute Recurring Interval for Unhandled Pending Requests ──
  useEffect(() => {
    if (!activeStaffUser) return

    // Run check immediately on login / mount
    checkUnhandledRequests(true)

    // Setup 5-minute recurring timer (300,000 ms)
    const timer = setInterval(() => {
      checkUnhandledRequests(true)
    }, 5 * 60 * 1000)

    return () => clearInterval(timer)
  }, [activeStaffUser, checkUnhandledRequests])

  // ─── Automated Polling & Focus Synchronization for Top-Level Stats & Queues ──
  useAutoSync(
    useCallback(() => {
      if (activeStaffUser) {
        fetchStats()
        setRefreshKey((k) => k + 1)
        checkUnhandledRequests(false)
      }
    }, [activeStaffUser, checkUnhandledRequests]),
    { intervalMs: 6000, enabled: !!activeStaffUser }
  )

  const [isManualSyncing, setIsManualSyncing] = useState(false)
  const handleManualSync = useCallback(async () => {
    setIsManualSyncing(true)
    try {
      await fetchStats()
      setRefreshKey((k) => k + 1)
    } finally {
      setTimeout(() => setIsManualSyncing(false), 400)
    }
  }, [])

  useEffect(() => {
    fetchData()

    // Subscribe to ALL requests changes to keep stats and queues live
    const channel = supabase
      .channel('app-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
        fetchStats()
        setRefreshKey(k => k + 1)
        // If an update or deletion resolved pending items, silently update active reminder list without re-opening
        if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          setUnhandledPendingList((prev) => {
            if (!prev) return null
            const updated = prev.filter(
              (item) => item.id !== (payload.new as any)?.id && item.id !== (payload.old as any)?.id
            )
            return updated.length > 0 ? updated : null
          })
        }
        // Fire aggressive alert on every new PENDING or PENDING_ON_CALL request
        const isNewPending = (payload.new as any)?.status === 'PENDING' || (payload.new as any)?.status === 'PENDING_ON_CALL'
        if (payload.eventType === 'INSERT' && isNewPending) {
          hydrateIncomingAlert(payload.new as any)
            .then((nextRequest) => {
              if (nextRequest) {
                setIncomingAlert(nextRequest as IncomingRequest)
                // Fire aggressive Full-Screen Intent alarm (Notifee: wakes screen, loops alarm)
                const rType = nextRequest.request_type || 'REQUEST'
                const rNum = (nextRequest.payload as any)?.room_number || 'Room'
                triggerAlarmNotification({
                  title: `Incoming ${rType.replace('_', ' ')}`,
                  body: `${rNum} submitted a new request requiring immediate staff attention!`,
                  requestId: nextRequest.id,
                  roomNumber: rNum,
                  requestType: rType,
                  payloadData: nextRequest.payload as any,
                })
              }
            })
            .catch(() => {
              setIncomingAlert(payload.new as IncomingRequest)
            })
        }
      })
      .subscribe((subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          fetchStats()
          setRefreshKey(k => k + 1)
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (isRestoringSession) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={styles.loginLogoRing}>
            <Text style={styles.loginLogoIcon}>🏨</Text>
          </View>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
            Restoring session…
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!activeStaffUser) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.loginContainer}>
          {/* Logo / Brand area */}
          <View style={styles.loginBrand}>
            <View style={styles.loginLogoRing}>
              <Text style={styles.loginLogoIcon}>🏨</Text>
            </View>
            <Text style={styles.loginBrandName}>Staff Portal</Text>
            <Text style={styles.loginBrandSub}>Authorized access only</Text>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Sign In</Text>

            <Text style={styles.inputLabel}>Email address</Text>
            <TextInput
              style={styles.input}
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="Enter your email"
              placeholderTextColor="#334155"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="Enter your password"
              placeholderTextColor="#334155"
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              <Text style={styles.loginButtonText}>
                {isLoggingIn ? 'Signing in…' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            {!!loginError && <Text style={styles.loginError}>⚠ {loginError}</Text>}
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
        onDismiss={() => {
          setIncomingAlert(null)
          setRefreshKey(k => k + 1)
        }}
      />

      {/* 🔔 5-Minute Recurring Reminder for Unhandled Pending Requests */}
      <PendingRequestsReminderModal
        pendingRequests={unhandledPendingList}
        onDismiss={() => {
          lastDismissedReminderAtRef.current = Date.now()
          setUnhandledPendingList(null)
          setRefreshKey(k => k + 1)
        }}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={handleManualSync}
                style={[styles.syncButton, isManualSyncing && styles.syncButtonActive]}
                activeOpacity={0.8}
                disabled={isManualSyncing}
              >
                <Text style={styles.syncButtonText}>
                  {isManualSyncing ? '⟳ Syncing…' : '⚡ Sync'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} activeOpacity={0.9}>
                <Text style={styles.logoutButtonText}>↩ Logout</Text>
              </TouchableOpacity>
            </View>
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
            <DedicatedCallModule activeStaffId={activeStaffUser?.id || undefined} refreshTrigger={refreshKey} />
            <CallQueue activeStaffId={activeStaffUser?.id} refreshTrigger={refreshKey} />

            {/* 2. Spa Timetable & Appointments Queue */}
            <SpaTimetable activeStaffUser={activeStaffUser} activeStaffId={activeStaffUser?.id} />
            <SpaQueue activeStaffId={activeStaffUser?.id} activeStaffUser={activeStaffUser} refreshTrigger={refreshKey} />

            {/* 3. Room Task Queue */}
            <TaskQueue activeStaffId={activeStaffUser?.id} refreshTrigger={refreshKey} />

            {/* 4. Food Orders Queue */}
            <FoodQueue activeStaffId={activeStaffUser?.id} activeStaffUser={activeStaffUser} refreshTrigger={refreshKey} />

            {/* 5. All Request History Logs */}
            <RequestHistory refreshTrigger={refreshKey} />

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
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 20,
  },
  loginBrand: {
    alignItems: 'center',
    gap: 10,
  },
  loginLogoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.goldMuted,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  loginLogoIcon: {
    fontSize: 38,
  },
  loginBrandName: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  loginBrandSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    gap: 0,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 7,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#070e1c',
    color: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
  },
  loginButton: {
    marginTop: 22,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.gold,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: '#0c1117',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  loginError: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
    backgroundColor: 'rgba(248,113,113,0.08)',
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
  syncButton: {
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonActive: {
    backgroundColor: 'rgba(251,191,36,0.28)',
    borderColor: COLORS.gold,
  },
  syncButtonText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
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

  // ─── PWA Banners ──────────────────────────────────────────
  pwaInstallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#38bdf8',
    gap: 10,
  },
  pwaInstallIcon: {
    fontSize: 22,
  },
  pwaInstallTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
  },
  pwaInstallSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  pwaInstallBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  pwaInstallBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },

  pwaNotifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
    gap: 10,
  },
  pwaNotifTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  pwaNotifBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  pwaNotifBtnText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
})
