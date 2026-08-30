import React from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

export interface StaffUser {
  id: string
  name: string
  email?: string
  role: 'FRONT_DESK' | 'KITCHEN' | 'HOUSEKEEPING' | 'SPA' | 'MANAGER'
  push_token?: string | null
}

interface UserManagementProps {
  activeUser: StaffUser | null
  onSelectUser?: (user: StaffUser) => void
}

export default function UserManagement({ activeUser }: UserManagementProps) {
  if (!activeUser) return null

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
          <View style={styles.activeUserBar}>
            <View style={[styles.avatarDot, { backgroundColor: roleColors[activeUser.role] || '#fbbf24' }]} />
            <Text style={styles.activeUserName}>{activeUser.name}</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${roleColors[activeUser.role] || '#fbbf24'}20` }]}>
              <Text style={[styles.roleText, { color: roleColors[activeUser.role] || '#fbbf24' }]}>
                {activeUser.role}
              </Text>
            </View>
          </View>
          {activeUser.email && <Text style={styles.emailText}>{activeUser.email}</Text>}
        </View>
      </View>
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
  emailText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
})
