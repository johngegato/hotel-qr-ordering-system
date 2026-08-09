import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
} from 'react-native'

// ─── In-memory store (persists for app session, no native deps needed) ──────
const memStore: Record<string, string> = {}
const MemStorage = {
  getItem: (key: string) => Promise.resolve(memStore[key] ?? null),
  setItem: (key: string, value: string) => { memStore[key] = value; return Promise.resolve() },
}

export interface StaffUser {
  id: string
  name: string
  role: 'FRONT_DESK' | 'KITCHEN' | 'HOUSEKEEPING' | 'SPA' | 'MANAGER'
}

const ACTIVE_STAFF_KEY = 'active_staff_user_session'
const STORED_USERS_KEY = 'stored_staff_users'

const INITIAL_USERS: StaffUser[] = [
  { id: 'staff-01', name: 'Maria Santos', role: 'FRONT_DESK' },
  { id: 'staff-02', name: 'Chef Carlos', role: 'KITCHEN' },
  { id: 'staff-03', name: 'Elena Cruz', role: 'HOUSEKEEPING' },
  { id: 'staff-04', name: 'Therapist Ana', role: 'SPA' },
  { id: 'staff-05', name: 'Manager John', role: 'MANAGER' },
]

export function getActiveStaffUserSync(): StaffUser {
  return INITIAL_USERS[0]
}

interface UserManagementProps {
  activeUser: StaffUser | null
  onSelectUser: (user: StaffUser) => void
}

export default function UserManagement({ activeUser, onSelectUser }: UserManagementProps) {
  const [users, setUsers] = useState<StaffUser[]>(INITIAL_USERS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'FRONT_DESK' | 'KITCHEN' | 'HOUSEKEEPING' | 'SPA' | 'MANAGER'>('FRONT_DESK')

  useEffect(() => {
    async function loadUsers() {
      try {
        const stored = await MemStorage.getItem(STORED_USERS_KEY)
        if (stored) {
          setUsers(JSON.parse(stored))
        }
        const active = await MemStorage.getItem(ACTIVE_STAFF_KEY)
        if (active) {
          onSelectUser(JSON.parse(active))
        } else {
          onSelectUser(INITIAL_USERS[0])
        }
      } catch {
        onSelectUser(INITIAL_USERS[0])
      }
    }
    loadUsers()
  }, [])

  const handleSelect = async (user: StaffUser) => {
    onSelectUser(user)
    try {
      await AsyncStorage.setItem(ACTIVE_STAFF_KEY, JSON.stringify(user))
    } catch (e) {
      console.warn('AsyncStorage error:', e)
    }
  }

  const handleAddUser = async () => {
    if (!newName.trim()) return
    const newUser: StaffUser = {
      id: `staff-${Date.now().toString().slice(-4)}`,
      name: newName.trim(),
      role: newRole,
    }
    const updated = [...users, newUser]
    setUsers(updated)
    handleSelect(newUser)
    setShowAddModal(false)
    setNewName('')
    try {
      await AsyncStorage.setItem(STORED_USERS_KEY, JSON.stringify(updated))
    } catch (e) {
      console.warn('AsyncStorage save error:', e)
    }
  }

  const roleColors: Record<string, string> = {
    FRONT_DESK: '#fbbf24',
    KITCHEN: '#fb923c',
    HOUSEKEEPING: '#60a5fa',
    SPA: '#c084fc',
    MANAGER: '#34d399',
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Active Staff User Logged In</Text>
          <View style={styles.activeUserBar}>
            <View style={[styles.avatarDot, { backgroundColor: roleColors[activeUser?.role || 'FRONT_DESK'] }]} />
            <Text style={styles.activeUserName}>{activeUser?.name || 'Maria Santos'}</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${roleColors[activeUser?.role || 'FRONT_DESK']}20` }]}>
              <Text style={[styles.roleText, { color: roleColors[activeUser?.role || 'FRONT_DESK'] }]}>
                {activeUser?.role || 'FRONT_DESK'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add Staff User</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Switch User Pills */}
      <FlatList
        horizontal
        data={users}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingTop: 10 }}
        renderItem={({ item }) => {
          const isSelected = activeUser?.id === item.id
          const color = roleColors[item.role] || '#94a3b8'
          return (
            <TouchableOpacity
              style={[
                styles.userPill,
                isSelected && { borderColor: color, backgroundColor: `${color}15` },
              ]}
              onPress={() => handleSelect(item)}
            >
              <Text style={[styles.pillText, isSelected && { color: '#fff', fontWeight: '700' }]}>
                {item.name} ({item.role})
              </Text>
            </TouchableOpacity>
          )
        }}
      />

      {/* Add User Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>👤 Create Staff User Account</Text>

            <Text style={styles.inputLabel}>Staff Full Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. David Miller"
              placeholderTextColor="#64748b"
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={styles.inputLabel}>Department / Role</Text>
            <View style={styles.rolesRow}>
              {(['FRONT_DESK', 'KITCHEN', 'HOUSEKEEPING', 'SPA', 'MANAGER'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleChoice,
                    newRole === r && { backgroundColor: roleColors[r], borderColor: roleColors[r] },
                  ]}
                  onPress={() => setNewRole(r)}
                >
                  <Text style={[styles.roleChoiceText, newRole === r && { color: '#000', fontWeight: '800' }]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddUser}>
                <Text style={styles.saveText}>Save Staff User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  activeUserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  avatarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  activeUserName: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 16,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
  },
  addBtn: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderColor: 'rgba(99,102,241,0.4)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#818cf8',
    fontWeight: '700',
    fontSize: 12,
  },
  userPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 14,
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  roleChoice: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roleChoiceText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cancelText: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#6366f1',
  },
  saveText: {
    color: '#fff',
    fontWeight: '800',
  },
})
