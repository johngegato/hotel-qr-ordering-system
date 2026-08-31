'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { StaffRole, StaffUser } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface RoleMeta {
  label: string
  color: string
  bg: string
  border: string
  icon: string
  description: string
}

const ROLE_CONFIGS: Record<StaffRole, RoleMeta> = {
  FRONT_DESK: {
    label: 'Front Desk',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.3)',
    icon: '🛎️',
    description: 'Manages check-ins, guest inquiries, room calls & concierge',
  },
  KITCHEN: {
    label: 'Kitchen & Bar',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.3)',
    icon: '🍽️',
    description: 'Receives and prepares food & drink room service orders',
  },
  HOUSEKEEPING: {
    label: 'Housekeeping',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.12)',
    border: 'rgba(96, 165, 250, 0.3)',
    icon: '🧹',
    description: 'Executes room tasks, cleaning, amenities & maintenance',
  },
  SPA: {
    label: 'Spa & Wellness',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.12)',
    border: 'rgba(192, 132, 252, 0.3)',
    icon: '💆',
    description: 'Oversees spa appointments, therapist rosters & timetables',
  },
  MANAGER: {
    label: 'Manager / Admin',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.3)',
    icon: '👔',
    description: 'Full administrative access across all operational modules',
  },
}

const ALL_ROLES: StaffRole[] = ['FRONT_DESK', 'KITCHEN', 'HOUSEKEEPING', 'SPA', 'MANAGER']

interface FormState {
  full_name: string
  email: string
  password: string
  role: StaffRole
  is_active: boolean
}

const INITIAL_FORM: FormState = {
  full_name: '',
  email: '',
  password: '',
  role: 'FRONT_DESK',
  is_active: true,
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<StaffRole | 'ALL'>('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  // Modals state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [targetUser, setTargetUser] = useState<StaffUser | null>(null)
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<StaffUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Test Push state
  const [testPushTarget, setTestPushTarget] = useState<StaffUser | 'ALL' | null>(null)
  const [isTestingPush, setIsTestingPush] = useState(false)
  const [testPushResult, setTestPushResult] = useState<{
    targetName: string
    timestamp: string
    sent: number
    failed: number
    expoDevicesReached: number
    webSubscribersReached: number
    expoReceipts?: any[]
    errors?: string[]
    error?: string
  } | null>(null)

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  const handleSendTestPush = async (target: StaffUser | 'ALL') => {
    setIsTestingPush(true)
    setTestPushTarget(target)
    setTestPushResult(null)
    const isAll = target === 'ALL'
    const targetName = isAll ? 'All Active Staff Devices' : `${target.full_name} (${target.email})`

    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId: HOTEL_ID,
          title: '⚡ FCM High-Priority Push Test',
          body: `High-priority push delivered to ${targetName} at ${new Date().toLocaleTimeString()}! If your phone woke up / alarmed, FCM is working 24/7.`,
          staffUserId: isAll ? undefined : target.id,
          isTestPush: true,
        }),
      })

      const data = await res.json()
      setTestPushResult({
        targetName,
        timestamp: new Date().toLocaleTimeString(),
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        expoDevicesReached: data.expoDevicesReached ?? 0,
        webSubscribersReached: data.webSubscribersReached ?? 0,
        expoReceipts: data.expoReceipts || [],
        errors: data.errors || [],
        error: data.error,
      })

      if (data.sent > 0) {
        showToast(`⚡ High-Priority push dispatched to ${data.sent} device(s)!`, 'success')
      } else if (data.expoDevicesReached === 0 && data.webSubscribersReached === 0) {
        showToast(`⚠️ No push tokens registered on target device yet.`, 'error')
      } else {
        showToast(`Push dispatch finished with ${data.failed} error(s).`, 'error')
      }
    } catch (err: any) {
      setTestPushResult({
        targetName,
        timestamp: new Date().toLocaleTimeString(),
        sent: 0,
        failed: 1,
        expoDevicesReached: 0,
        webSubscribersReached: 0,
        error: err?.message || 'Network error triggering test push',
      })
      showToast('Failed to trigger test push.', 'error')
    } finally {
      setIsTestingPush(false)
    }
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('staff_users')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers((data as StaffUser[]) || [])
    } catch (err) {
      console.error('Error fetching staff users:', err)
      showToast('Failed to fetch staff accounts. Please check connection.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()

    // Setup realtime subscription
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel('admin-staff-users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_users' },
        () => {
          fetchUsers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchUsers])

  // Filtered accounts
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)

      const matchesRole = selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter
      const matchesStatus =
        selectedStatusFilter === 'ALL' ||
        (selectedStatusFilter === 'ACTIVE' && u.is_active) ||
        (selectedStatusFilter === 'INACTIVE' && !u.is_active)

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchQuery, selectedRoleFilter, selectedStatusFilter])

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.is_active).length
    const inactive = total - active
    const managers = users.filter((u) => u.role === 'MANAGER').length
    return { total, active, inactive, managers }
  }, [users])

  // Modal open handlers
  const openCreateModal = () => {
    setFormData(INITIAL_FORM)
    setFormError(null)
    setShowPassword(false)
    setTargetUser(null)
    setModalMode('create')
  }

  const openEditModal = (user: StaffUser) => {
    setFormData({
      full_name: user.full_name,
      email: user.email,
      password: '',
      role: user.role,
      is_active: user.is_active,
    })
    setFormError(null)
    setShowPassword(false)
    setTargetUser(user)
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setTargetUser(null)
    setFormError(null)
    setIsSubmitting(false)
  }

  // Validation
  const validateForm = (): string | null => {
    if (!formData.full_name.trim()) return 'Full name is required.'
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      return 'Please provide a valid email address.'
    }
    if (modalMode === 'create' && !formData.password.trim()) {
      return 'Password is required for new accounts.'
    }
    if (formData.password && formData.password.length < 6) {
      return 'Password must be at least 6 characters long.'
    }
    return null
  }

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errorMsg = validateForm()
    if (errorMsg) {
      setFormError(errorMsg)
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('staff_users').insert([
        {
          hotel_id: HOTEL_ID,
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password.trim(),
          role: formData.role,
          is_active: formData.is_active,
        },
      ])

      if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
          throw new Error('A staff account with this email already exists.')
        }
        throw error
      }

      showToast(`Staff account for "${formData.full_name.trim()}" created successfully!`)
      closeModal()
      fetchUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create staff account.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUser) return

    const errorMsg = validateForm()
    if (errorMsg) {
      setFormError(errorMsg)
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const payload: Record<string, unknown> = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        is_active: formData.is_active,
      }

      if (formData.password.trim()) {
        payload.password = formData.password.trim()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('staff_users')
        .update(payload)
        .eq('id', targetUser.id)

      if (error) {
        if (error.message?.includes('unique') || error.code === '23505') {
          throw new Error('This email address is already in use by another user.')
        }
        throw error
      }

      showToast(`Updated account for "${formData.full_name.trim()}"!`)
      closeModal()
      fetchUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update account.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Toggle Active Status
  const handleToggleStatus = async (user: StaffUser) => {
    const nextStatus = !user.is_active
    const actionName = nextStatus ? 'activated' : 'deactivated'
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('staff_users')
        .update({ is_active: nextStatus })
        .eq('id', user.id)

      if (error) throw error
      showToast(`Account for ${user.full_name} has been ${actionName}.`)
      fetchUsers()
    } catch (err) {
      console.error('Failed to toggle status:', err)
      showToast('Failed to change user status.', 'error')
    }
  }

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!userToDelete) return
    setIsDeleting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('staff_users')
        .delete()
        .eq('id', userToDelete.id)

      if (error) throw error
      showToast(`Staff account for ${userToDelete.full_name} deleted.`)
      setUserToDelete(null)
      fetchUsers()
    } catch (err) {
      console.error('Failed to delete staff user:', err)
      showToast('Failed to delete user account.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    if (users.length === 0) return
    const headers = ['ID', 'Full Name', 'Email', 'Role', 'Status', 'Joined Date']
    const rows = users.map((u) => [
      u.id,
      `"${u.full_name.replace(/"/g, '""')}"`,
      u.email,
      u.role,
      u.is_active ? 'ACTIVE' : 'INACTIVE',
      new Date(u.created_at).toISOString(),
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `staff_users_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#f1f5f9',
        fontFamily: "'Inter', sans-serif",
        padding: '2rem',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span>{toastMessage.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Top Breadcrumb & Actions Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <a
                href="/admin"
                style={{
                  color: '#94a3b8',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← Back to Admin Portal
              </a>
              <span style={{ color: '#475569' }}>/</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#818cf8',
                  background: 'rgba(129, 140, 248, 0.12)',
                  padding: '2px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(129, 140, 248, 0.3)',
                }}
              >
                👥 User Account Control
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Staff & User Account Control
            </h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
              Manage staff permissions, departmental roles, passwords, and access status across all property operations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportCSV}
              disabled={users.length === 0}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                borderRadius: 12,
                padding: '10px 16px',
                fontWeight: 700,
                fontSize: 13,
                cursor: users.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              📥 Export CSV
            </button>

            <button
              onClick={() => handleSendTestPush('ALL')}
              disabled={isTestingPush}
              title="Broadcast a high-priority FCM test push to all active Android staff devices"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#a5b4fc',
                borderRadius: 12,
                padding: '10px 18px',
                fontWeight: 800,
                fontSize: 13,
                cursor: isTestingPush ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
              }}
            >
              <span>⚡</span> {isTestingPush && testPushTarget === 'ALL' ? 'Testing Push...' : 'Test FCM Push (All)'}
            </button>

            <button
              onClick={openCreateModal}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                color: '#fff',
                borderRadius: 12,
                padding: '11px 20px',
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>+</span> Add Staff Member
            </button>
          </div>
        </div>

        {/* Live Overview KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          {[
            {
              label: 'Total Staff Accounts',
              value: metrics.total,
              icon: '👥',
              color: '#818cf8',
              sub: 'Registered accounts',
            },
            {
              label: 'Active Operators',
              value: metrics.active,
              icon: '🟢',
              color: '#4ade80',
              sub: 'Able to login & claim tasks',
            },
            {
              label: 'Deactivated / Inactive',
              value: metrics.inactive,
              icon: '⏸️',
              color: '#64748b',
              sub: 'Access currently suspended',
            },
            {
              label: 'Managers & Supervisors',
              value: metrics.managers,
              icon: '👔',
              color: '#34d399',
              sub: 'Full administrative rights',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18,
                padding: '1.25rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{kpi.label}</span>
                <span style={{ fontSize: 18 }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: kpi.color, marginBottom: 2 }}>
                {loading ? '...' : kpi.value}
              </div>
              <div style={{ fontSize: 11, color: '#475569' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter Controls Bar */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 18,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                fontSize: 14,
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                padding: '9px 12px 9px 36px',
                color: '#f1f5f9',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Role Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Role:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedRoleFilter('ALL')}
                style={{
                  background: selectedRoleFilter === 'ALL' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selectedRoleFilter === 'ALL' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
                  color: selectedRoleFilter === 'ALL' ? '#818cf8' : '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: selectedRoleFilter === 'ALL' ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                All Roles
              </button>
              {ALL_ROLES.map((r) => {
                const isSelected = selectedRoleFilter === r
                const cfg = ROLE_CONFIGS[r]
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRoleFilter(isSelected ? 'ALL' : r)}
                    style={{
                      background: isSelected ? cfg.bg : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isSelected ? cfg.border : 'rgba(255,255,255,0.08)'}`,
                      color: isSelected ? cfg.color : '#94a3b8',
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{cfg.icon}</span> {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Status:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Staff Users Table */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 22,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#818cf8' }}>
              <div
                style={{
                  display: 'inline-block',
                  width: 36,
                  height: 36,
                  border: '3px solid rgba(129, 140, 248, 0.2)',
                  borderTopColor: '#818cf8',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 14, color: '#94a3b8' }}>Loading staff accounts from Supabase...</div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
                No staff accounts found
              </h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 4, maxWidth: 400, margin: '6px auto 16px' }}>
                {searchQuery || selectedRoleFilter !== 'ALL' || selectedStatusFilter !== 'ALL'
                  ? 'No results match your current search and filter settings. Try clearing some filters.'
                  : 'Get started by creating your first staff operator account using the button above.'}
              </p>
              {searchQuery || selectedRoleFilter !== 'ALL' || selectedStatusFilter !== 'ALL' ? (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedRoleFilter('ALL')
                    setSelectedStatusFilter('ALL')
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#94a3b8',
                    padding: '8px 16px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
              ) : null}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(0,0,0,0.2)',
                      color: '#94a3b8',
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '16px 20px' }}>Staff Member</th>
                    <th style={{ padding: '16px 20px' }}>Role / Department</th>
                    <th style={{ padding: '16px 20px' }}>Login Email</th>
                    <th style={{ padding: '16px 20px' }}>Device Push (FCM)</th>
                    <th style={{ padding: '16px 20px' }}>Account Status</th>
                    <th style={{ padding: '16px 20px' }}>Created</th>
                    <th style={{ padding: '16px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const roleCfg = ROLE_CONFIGS[user.role] || ROLE_CONFIGS.FRONT_DESK
                    const initials = user.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                    const joinedFormatted = new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })

                    const hasPushToken = Boolean(user.push_token && !user.push_token.startsWith('web_pwa_') && !user.push_token.startsWith('expo_local_'))

                    return (
                      <tr
                        key={user.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          transition: 'background 0.15s',
                          opacity: user.is_active ? 1 : 0.65,
                        }}
                      >
                        {/* Name & Avatar */}
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 12,
                                background: roleCfg.bg,
                                border: `1px solid ${roleCfg.border}`,
                                color: roleCfg.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: 13,
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15 }}>
                                {user.full_name}
                              </div>
                              <div style={{ color: '#64748b', fontSize: 12, marginTop: 1 }}>
                                {roleCfg.description}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Pill */}
                        <td style={{ padding: '16px 20px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 14,
                              background: roleCfg.bg,
                              border: `1px solid ${roleCfg.border}`,
                              color: roleCfg.color,
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <span>{roleCfg.icon}</span>
                            <span>{roleCfg.label}</span>
                          </span>
                        </td>

                        {/* Email */}
                        <td style={{ padding: '16px 20px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: 13 }}>
                          {user.email}
                        </td>

                        {/* Device Push (FCM) Status */}
                        <td style={{ padding: '16px 20px' }}>
                          {hasPushToken ? (
                            <div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 9px',
                                  borderRadius: 12,
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  color: '#60a5fa',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                <span>📱</span>
                                <span>FCM Active</span>
                              </span>
                              <div
                                style={{
                                  color: '#64748b',
                                  fontSize: 10,
                                  fontFamily: 'monospace',
                                  marginTop: 3,
                                  maxWidth: 160,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={user.push_token || undefined}
                              >
                                {user.push_token?.slice(0, 22)}...
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 9px',
                                  borderRadius: 12,
                                  background: 'rgba(100, 116, 139, 0.1)',
                                  border: '1px solid rgba(100, 116, 139, 0.2)',
                                  color: '#64748b',
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                <span>⚠️</span>
                                <span>No FCM Token</span>
                              </span>
                              <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>
                                Login on Android app
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '16px 20px' }}>
                          {user.is_active ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 9px',
                                borderRadius: 12,
                                background: 'rgba(74, 222, 128, 0.12)',
                                border: '1px solid rgba(74, 222, 128, 0.3)',
                                color: '#4ade80',
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                              Active
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 9px',
                                borderRadius: 12,
                                background: 'rgba(100, 116, 139, 0.12)',
                                border: '1px solid rgba(100, 116, 139, 0.3)',
                                color: '#94a3b8',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748b' }} />
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td style={{ padding: '16px 20px', color: '#64748b', fontSize: 13 }}>
                          {joinedFormatted}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button
                              onClick={() => handleSendTestPush(user)}
                              disabled={isTestingPush}
                              title="Send a real High-Priority FCM push alarm to this user's phone"
                              style={{
                                background: 'rgba(99, 102, 241, 0.12)',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                color: '#818cf8',
                                borderRadius: 8,
                                padding: '6px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: isTestingPush ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>⚡</span> {isTestingPush && testPushTarget === user ? '...' : 'Test Push'}
                            </button>

                            <button
                              onClick={() => openEditModal(user)}
                              title="Edit user details and role"
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                color: '#cbd5e1',
                                borderRadius: 8,
                                padding: '6px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                            >
                              ✏️ Edit
                            </button>

                            <button
                              onClick={() => handleToggleStatus(user)}
                              title={user.is_active ? 'Deactivate account login' : 'Activate account login'}
                              style={{
                                background: user.is_active ? 'rgba(251, 191, 36, 0.08)' : 'rgba(74, 222, 128, 0.08)',
                                border: `1px solid ${user.is_active ? 'rgba(251, 191, 36, 0.25)' : 'rgba(74, 222, 128, 0.25)'}`,
                                color: user.is_active ? '#fbbf24' : '#4ade80',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                            >
                              {user.is_active ? '⏸ Deactivate' : '▶ Activate'}
                            </button>

                            <button
                              onClick={() => setUserToDelete(user)}
                              title="Permanently delete user"
                              style={{
                                background: 'rgba(248, 113, 113, 0.08)',
                                border: '1px solid rgba(248, 113, 113, 0.25)',
                                color: '#f87171',
                                borderRadius: 8,
                                padding: '6px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalMode !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 24,
              width: '100%',
              maxWidth: 520,
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#f8fafc' }}>
                  {modalMode === 'create' ? '+ Add New Staff User' : `✏️ Edit Staff Account`}
                </h2>
                <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: 12 }}>
                  {modalMode === 'create'
                    ? 'Configure identity, role assignments, and login credentials'
                    : targetUser?.full_name}
                </p>
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={modalMode === 'create' ? handleCreateSubmit : handleEditSubmit} style={{ padding: '24px' }}>
              {/* Full Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                  Full Name <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g. Maria Santos"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f8fafc',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Email Address */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                  Email Address <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="frontdesk@hotel.local"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f8fafc',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
                    {modalMode === 'create' ? 'Password *' : 'Reset Password (optional)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: 12, cursor: 'pointer' }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={modalMode === 'create' ? 'Minimum 6 characters' : 'Leave empty to keep current password'}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f8fafc',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Role Selection */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 8 }}>
                  Staff Role & Department <span style={{ color: '#f87171' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  {ALL_ROLES.map((r) => {
                    const cfg = ROLE_CONFIGS[r]
                    const isSelected = formData.role === r
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setFormData({ ...formData, role: r })}
                        style={{
                          background: isSelected ? cfg.bg : 'rgba(255,255,255,0.03)',
                          border: `1.5px solid ${isSelected ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 12,
                          padding: '10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? cfg.color : '#f1f5f9' }}>
                            {cfg.label}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Active Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Account Active</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                    {formData.is_active ? 'Staff can sign in to the tablet interface' : 'Login access is currently blocked'}
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: formData.is_active ? '#4ade80' : '#475569',
                      borderRadius: 24,
                      transition: '0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        height: 18,
                        width: 18,
                        left: formData.is_active ? 22 : 3,
                        bottom: 3,
                        background: 'white',
                        borderRadius: '50%',
                        transition: '0.2s',
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Error Message */}
              {formError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  ⚠️ {formError}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#cbd5e1',
                    padding: '10px 18px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none',
                    color: '#fff',
                    padding: '10px 22px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                    boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                  }}
                >
                  {isSubmitting
                    ? 'Saving...'
                    : modalMode === 'create'
                    ? '+ Create Account'
                    : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 440,
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                ⚠️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                  Delete Staff Account
                </h3>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 13 }}>
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.5, margin: '16px 0 20px' }}>
              Are you sure you want to permanently remove <strong>{userToDelete.full_name}</strong> (
              <code style={{ color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 6px', borderRadius: 6 }}>
                {userToDelete.email}
              </code>
              )? They will no longer be able to log in to the staff app.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#cbd5e1',
                  padding: '9px 16px',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeleting}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                }}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEST PUSH RESULT MODAL */}
      {testPushResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 520,
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: testPushResult.sent > 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: testPushResult.sent > 0 ? '#4ade80' : '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                  }}
                >
                  {testPushResult.sent > 0 ? '⚡' : '⚠️'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                    FCM Push Dispatch Result
                  </h3>
                  <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 12 }}>
                    Dispatched at {testPushResult.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTestPushResult(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '14px',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                Target: <strong style={{ color: '#f8fafc' }}>{testPushResult.targetName}</strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10 }}>
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Android FCM Reached</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#818cf8', marginTop: 2 }}>
                    {testPushResult.expoDevicesReached} device(s)
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Delivery Receipts (OK)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: testPushResult.sent > 0 ? '#4ade80' : '#f87171', marginTop: 2 }}>
                    {testPushResult.sent} confirmed
                  </div>
                </div>
              </div>

              {testPushResult.expoReceipts && testPushResult.expoReceipts.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>
                    Expo / FCM Receipt Tickets:
                  </div>
                  <div style={{ maxHeight: 100, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '8px' }}>
                    {testPushResult.expoReceipts.map((rcpt: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: rcpt.status === 'ok' ? '#4ade80' : '#f87171', marginBottom: 2 }}>
                        ✓ {rcpt.token ? rcpt.token.slice(0, 16) + '...' : ''} → status: {rcpt.status} {rcpt.id ? `(id: ${rcpt.id})` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {testPushResult.errors && testPushResult.errors.length > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>Errors:</div>
                  {testPushResult.errors.map((e: string, idx: number) => (
                    <div key={idx} style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                      • {e}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '12px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#a5b4fc', lineHeight: 1.4 }}>
                💡 <strong>Verification Tip:</strong> If the target Android device is asleep or locked, this High-Priority FCM push will trigger the alarm sound, wake lock, and full-screen intent immediately!
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setTestPushResult(null)}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
