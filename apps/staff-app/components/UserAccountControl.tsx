import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'HOUSEKEEPING' | 'SPA' | 'MANAGER'
type ModalMode = 'create' | 'edit' | null

interface StaffAccount {
  id: string
  full_name: string
  email: string
  role: StaffRole
  is_active: boolean
  created_at: string
  hotel_id: string
}

interface FormState {
  full_name: string
  email: string
  password: string
  role: StaffRole
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  full_name: '',
  email: '',
  password: '',
  role: 'FRONT_DESK',
  is_active: true,
}

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

// ─── Role config ─────────────────────────────────────────────────────────────

const ROLES: { value: StaffRole; label: string; color: string; icon: string }[] = [
  { value: 'FRONT_DESK',   label: 'Front Desk',   color: '#fbbf24', icon: '🛎️' },
  { value: 'KITCHEN',      label: 'Kitchen',       color: '#fb923c', icon: '🍽️' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping',  color: '#60a5fa', icon: '🧹' },
  { value: 'SPA',          label: 'Spa',           color: '#c084fc', icon: '💆' },
  { value: 'MANAGER',      label: 'Manager',       color: '#34d399', icon: '👔' },
]

function roleConfig(role: StaffRole) {
  return ROLES.find((r) => r.value === role) ?? ROLES[0]
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: StaffRole }) {
  const cfg = roleConfig(role)
  return (
    <View style={[s.roleBadge, { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}40` }]}>
      <Text style={[s.roleBadgeText, { color: cfg.color }]}>
        {cfg.icon} {cfg.label}
      </Text>
    </View>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <View style={[s.statusPill, active ? s.statusActive : s.statusInactive]}>
      <View style={[s.statusDot, { backgroundColor: active ? '#4ade80' : '#64748b' }]} />
      <Text style={[s.statusPillText, { color: active ? '#4ade80' : '#64748b' }]}>
        {active ? 'Active' : 'Inactive'}
      </Text>
    </View>
  )
}

// ─── Confirm Dialog (web-safe wrapper) ───────────────────────────────────────

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (typeof window !== 'undefined' && window.confirm) {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm()
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ])
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  activeUserId?: string
}

export default function UserAccountControl({ activeUserId }: Props) {
  const [users, setUsers] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editTarget, setEditTarget] = useState<StaffAccount | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'ALL'>('ALL')
  const fadeAnim = useRef(new Animated.Value(0)).current

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('staff_users')
        .select('id, full_name, email, role, is_active, created_at, hotel_id')
        .eq('hotel_id', HOTEL_ID)
        .order('created_at', { ascending: false })
      if (err) throw err
      setUsers((data as StaffAccount[]) ?? [])
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff accounts.')
    } finally {
      setLoading(false)
    }
  }, [fadeAnim])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filtered = users.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditTarget(null)
    setModalMode('create')
  }

  function openEdit(user: StaffAccount) {
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, is_active: user.is_active })
    setFormError(null)
    setEditTarget(user)
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setEditTarget(null)
    setFormError(null)
  }

  function validate(): string | null {
    if (!form.full_name.trim()) return 'Full name is required.'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'A valid email address is required.'
    if (modalMode === 'create' && !form.password.trim()) return 'Password is required for new accounts.'
    if (form.password && form.password.length < 6) return 'Password must be at least 6 characters.'
    return null
  }

  async function handleCreate() {
    const ve = validate()
    if (ve) { setFormError(ve); return }
    setSaving(true); setFormError(null)
    try {
      const { error: err } = await supabase.from('staff_users').insert({
        hotel_id: HOTEL_ID,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password.trim(),
        role: form.role,
        is_active: form.is_active,
      })
      if (err) throw err
      closeModal()
      await fetchUsers()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create account.'
      setFormError(msg.includes('unique') ? 'An account with this email already exists.' : msg)
    } finally { setSaving(false) }
  }

  async function handleUpdate() {
    if (!editTarget) return
    const ve = validate()
    if (ve) { setFormError(ve); return }
    setSaving(true); setFormError(null)
    try {
      const patch: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        is_active: form.is_active,
      }
      if (form.password.trim()) patch.password = form.password.trim()
      const { error: err } = await supabase.from('staff_users').update(patch).eq('id', editTarget.id)
      if (err) throw err
      closeModal()
      await fetchUsers()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update account.'
      setFormError(msg.includes('unique') ? 'This email is already in use.' : msg)
    } finally { setSaving(false) }
  }

  function handleToggleActive(user: StaffAccount) {
    if (user.id === activeUserId && user.is_active) {
      confirmAction('Cannot Deactivate', 'You cannot deactivate your own account while logged in.', () => {})
      return
    }
    const action = user.is_active ? 'Deactivate' : 'Activate'
    confirmAction(
      `${action} Account`,
      `${action === 'Deactivate' ? 'Deactivating' : 'Activating'} "${user.full_name}" will ${action === 'Deactivate' ? 'prevent them from logging in.' : 'restore their access.'}`,
      async () => {
        try {
          await supabase.from('staff_users').update({ is_active: !user.is_active }).eq('id', user.id)
          await fetchUsers()
        } catch { /* silent */ }
      }
    )
  }

  function handleDelete(user: StaffAccount) {
    if (user.id === activeUserId) {
      confirmAction('Cannot Delete', 'You cannot delete your own account.', () => {})
      return
    }
    confirmAction(
      '⚠️ Delete Account',
      `This will permanently delete "${user.full_name}" (${user.email}). This action cannot be undone.`,
      async () => {
        try {
          await supabase.from('staff_users').delete().eq('id', user.id)
          await fetchUsers()
        } catch { /* silent */ }
      }
    )
  }

  function renderUserCard(user: StaffAccount) {
    const isSelf = user.id === activeUserId
    const cfg = roleConfig(user.role)
    const joinDate = new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return (
      <View key={user.id} style={[s.userCard, !user.is_active && s.userCardInactive]}>
        <View style={[s.cardAccent, { backgroundColor: cfg.color }]} />
        <View style={s.cardBody}>
          <View style={s.cardTopRow}>
            <View style={[s.avatar, { backgroundColor: `${cfg.color}22` }]}>
              <Text style={s.avatarText}>{cfg.icon}</Text>
            </View>
            <View style={s.cardInfo}>
              <View style={s.cardNameRow}>
                <Text style={s.cardName} numberOfLines={1}>{user.full_name}</Text>
                {isSelf && <View style={s.selfBadge}><Text style={s.selfBadgeText}>YOU</Text></View>}
              </View>
              <Text style={s.cardEmail} numberOfLines={1}>{user.email}</Text>
            </View>
            <StatusPill active={user.is_active} />
          </View>
          <View style={s.cardMetaRow}>
            <RoleBadge role={user.role} />
            <Text style={s.cardJoinDate}>Joined {joinDate}</Text>
          </View>
          <View style={s.cardActions}>
            <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(user)} activeOpacity={0.7}>
              <Text style={s.actionBtnText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, user.is_active ? s.actionBtnWarning : s.actionBtnSuccess]}
              onPress={() => handleToggleActive(user)} activeOpacity={0.7}
            >
              <Text style={[s.actionBtnText, user.is_active ? { color: '#fbbf24' } : { color: '#4ade80' }]}>
                {user.is_active ? '⏸ Deactivate' : '▶ Activate'}
              </Text>
            </TouchableOpacity>
            {!isSelf && (
              <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={() => handleDelete(user)} activeOpacity={0.7}>
                <Text style={[s.actionBtnText, { color: '#f87171' }]}>🗑 Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )
  }

  function renderForm() {
    return (
      <View style={s.formBody}>
        <Text style={s.inputLabel}>Full Name</Text>
        <TextInput
          style={s.textInput} value={form.full_name}
          onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))}
          placeholder="e.g. Maria Santos" placeholderTextColor="#475569"
        />
        <Text style={s.inputLabel}>Email Address</Text>
        <TextInput
          style={s.textInput} value={form.email}
          onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder="staff@hotel.local" placeholderTextColor="#475569"
          autoCapitalize="none" keyboardType="email-address"
        />
        <Text style={s.inputLabel}>
          {modalMode === 'edit' ? 'New Password (leave blank to keep current)' : 'Password'}
        </Text>
        <TextInput
          style={s.textInput} value={form.password}
          onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder={modalMode === 'edit' ? '••••••••' : 'Minimum 6 characters'}
          placeholderTextColor="#475569" secureTextEntry
        />
        <Text style={s.inputLabel}>Role</Text>
        <View style={s.roleGrid}>
          {ROLES.map((r) => {
            const selected = form.role === r.value
            return (
              <TouchableOpacity
                key={r.value}
                style={[s.roleChip, selected && { backgroundColor: `${r.color}22`, borderColor: `${r.color}60` }]}
                onPress={() => setForm((f) => ({ ...f, role: r.value }))} activeOpacity={0.7}
              >
                <Text style={s.roleChipIcon}>{r.icon}</Text>
                <Text style={[s.roleChipText, selected && { color: r.color, fontWeight: '700' }]}>{r.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <View style={s.toggleRow}>
          <View>
            <Text style={s.inputLabel}>Account Status</Text>
            <Text style={s.toggleSub}>{form.is_active ? 'Staff member can log in' : 'Login is disabled'}</Text>
          </View>
          <TouchableOpacity
            style={[s.toggleBtn, form.is_active && s.toggleBtnOn]}
            onPress={() => setForm((f) => ({ ...f, is_active: !f.is_active }))} activeOpacity={0.8}
          >
            <View style={[s.toggleThumb, form.is_active && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>
        {formError && (
          <View style={s.formErrorBox}>
            <Text style={s.formErrorText}>⚠️ {formError}</Text>
          </View>
        )}
        <View style={s.modalActions}>
          <TouchableOpacity style={s.cancelBtn} onPress={closeModal} activeOpacity={0.8}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={modalMode === 'create' ? handleCreate : handleUpdate}
            disabled={saving} activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveBtnText}>{modalMode === 'create' ? '+ Create Account' : '✓ Save Changes'}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>👥 User Account Control</Text>
          <Text style={s.headerSub}>Manage staff access, roles, and permissions</Text>
        </View>
        <TouchableOpacity style={s.createBtn} onPress={openCreate} activeOpacity={0.8}>
          <Text style={s.createBtnText}>+ Add Staff</Text>
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {([
          { label: 'Total Staff', value: stats.total, color: '#818cf8' },
          { label: 'Active',      value: stats.active,   color: '#4ade80' },
          { label: 'Inactive',    value: stats.inactive, color: '#64748b' },
        ] as { label: string; value: number; color: string }[]).map((stat) => (
          <View key={stat.label} style={s.statBox}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchBox}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput} value={searchQuery} onChangeText={setSearchQuery}
          placeholder="Search by name or email…" placeholderTextColor="#475569"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={s.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Role filter */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.roleFilterScroll} contentContainerStyle={s.roleFilterRow}
      >
        <TouchableOpacity
          style={[s.roleFilterPill, roleFilter === 'ALL' && s.roleFilterPillActive]}
          onPress={() => setRoleFilter('ALL')}
        >
          <Text style={[s.roleFilterPillText, roleFilter === 'ALL' && s.roleFilterPillTextActive]}>All</Text>
        </TouchableOpacity>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[s.roleFilterPill, roleFilter === r.value && { backgroundColor: `${r.color}22`, borderColor: `${r.color}60` }]}
            onPress={() => setRoleFilter(roleFilter === r.value ? 'ALL' : r.value)}
          >
            <Text style={[s.roleFilterPillText, roleFilter === r.value && { color: r.color, fontWeight: '700' }]}>
              {r.icon} {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Loading */}
      {loading && (
        <View style={s.centeredBox}>
          <ActivityIndicator size="large" color="#818cf8" />
          <Text style={s.loadingText}>Loading staff accounts…</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={s.errorBox}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchUsers}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {!loading && !error && (
        <Animated.View style={{ opacity: fadeAnim }}>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>👤</Text>
              <Text style={s.emptyText}>No staff accounts found</Text>
              <Text style={s.emptySubText}>
                {searchQuery || roleFilter !== 'ALL' ? 'Try adjusting your filters.' : 'Create your first staff account above.'}
              </Text>
            </View>
          ) : (
            filtered.map(renderUserCard)
          )}
        </Animated.View>
      )}

      {/* Create / Edit Modal */}
      <Modal visible={modalMode !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <View>
                  <Text style={s.modalTitle}>{modalMode === 'create' ? '+ New Staff Account' : '✏️ Edit Account'}</Text>
                  {editTarget && <Text style={s.modalSubtitle}>{editTarget.full_name}</Text>}
                </View>
                <TouchableOpacity style={s.modalCloseBtn} onPress={closeModal}>
                  <Text style={s.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              {renderForm()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { marginTop: 24, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  createBtn: { backgroundColor: '#6366f1', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  statsStrip: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 14, overflow: 'hidden' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.07)' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#64748b', fontSize: 11, fontWeight: '600', marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 14, paddingVertical: 0 },
  clearSearch: { color: '#64748b', fontSize: 13, paddingLeft: 8 },
  roleFilterScroll: { marginBottom: 14 },
  roleFilterRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  roleFilterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
  roleFilterPillActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.5)' },
  roleFilterPillText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  roleFilterPillTextActive: { color: '#818cf8', fontWeight: '700' },
  userCard: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10, overflow: 'hidden' },
  userCardInactive: { opacity: 0.65 },
  cardAccent: { width: 4, margin: 8 },
  cardBody: { flex: 1, padding: 12, paddingLeft: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18 },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { color: '#f1f5f9', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  cardEmail: { color: '#64748b', fontSize: 12, marginTop: 2 },
  selfBadge: { backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  selfBadgeText: { color: '#818cf8', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardJoinDate: { color: '#475569', fontSize: 11 },
  cardActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actionBtnWarning: { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  actionBtnSuccess: { backgroundColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)' },
  actionBtnDanger: { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' },
  actionBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusActive: { backgroundColor: 'rgba(74,222,128,0.1)' },
  statusInactive: { backgroundColor: 'rgba(100,116,139,0.12)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  centeredBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  errorBox: { alignItems: 'center', paddingVertical: 32, backgroundColor: 'rgba(248,113,113,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.15)', gap: 8 },
  errorIcon: { fontSize: 28 },
  errorText: { color: '#f87171', fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  retryBtn: { marginTop: 4, backgroundColor: 'rgba(248,113,113,0.12)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { color: '#f87171', fontWeight: '700', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 6 },
  emptyIcon: { fontSize: 32 },
  emptyText: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  emptySubText: { color: '#475569', fontSize: 13, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 32 },
  modalCard: { backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  modalTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '800' },
  modalSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  modalCloseBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 15 },
  modalCloseBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  formBody: { padding: 20 },
  inputLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  textInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#f1f5f9', fontSize: 14, marginBottom: 16 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 20 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
  roleChipIcon: { fontSize: 13 },
  roleChipText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingVertical: 4 },
  toggleSub: { color: '#475569', fontSize: 11, marginTop: 2 },
  toggleBtn: { width: 46, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', paddingHorizontal: 3 },
  toggleBtnOn: { backgroundColor: 'rgba(74,222,128,0.3)' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#475569' },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: '#4ade80' },
  formErrorBox: { backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)', borderRadius: 10, padding: 12, marginBottom: 16 },
  formErrorText: { color: '#f87171', fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cancelBtnText: { color: '#94a3b8', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, paddingVertical: 13, alignItems: 'center', borderRadius: 11, backgroundColor: '#6366f1' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})