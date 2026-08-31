import React, { useState } from 'react'
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native'
import type { StaffUser } from './UserManagement'
import { getLastPushTokenError } from '../lib/notifications'

export interface PushLogItem {
  id: string
  timestamp: string
  title: string
  body: string
  isTest: boolean
}

interface PushDiagnosticsModalProps {
  visible: boolean
  onClose: () => void
  activeStaffUser: StaffUser | null
  pushToken: string | null
  pushLogs: PushLogItem[]
  onTriggerTestAlarm: () => void
  onCheckBattery: () => void
}

export default function PushDiagnosticsModal({
  visible,
  onClose,
  activeStaffUser,
  pushToken,
  pushLogs,
  onTriggerTestAlarm,
  onCheckBattery,
}: PushDiagnosticsModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyToken = () => {
    if (!pushToken) return
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(pushToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } else {
      Alert.alert('📋 Push Token Copied', pushToken, [{ text: 'OK' }])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const isRealFcmToken = Boolean(
    pushToken &&
      !pushToken.startsWith('web_pwa_') &&
      !pushToken.startsWith('expo_local_') &&
      pushToken.length > 15
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconRing}>
                <Text style={styles.headerIcon}>📡</Text>
              </View>
              <View>
                <Text style={styles.title}>Push & FCM Diagnostics</Text>
                <Text style={styles.subtitle}>
                  {activeStaffUser?.name ?? 'Staff Device'} · 24/7 Monitoring
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Status Overview Badge */}
            <View
              style={[
                styles.statusBanner,
                isRealFcmToken
                  ? styles.statusBannerActive
                  : styles.statusBannerPending,
              ]}
            >
              <Text style={styles.statusBannerIcon}>
                {isRealFcmToken ? '✅' : '⚠️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusBannerTitle}>
                  {isRealFcmToken
                    ? 'High-Priority FCM Ready'
                    : 'FCM Push Token Pending'}
                </Text>
                <Text style={styles.statusBannerDesc}>
                  {isRealFcmToken
                    ? 'This Android device is registered to receive 24/7 high-priority wakeup alarms.'
                    : 'Awaiting token registration from Google Play Services / Expo.'}
                </Text>
              </View>
            </View>

            {/* FCM Push Token Box */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Device FCM Push Token</Text>
                {pushToken && (
                  <TouchableOpacity
                    onPress={handleCopyToken}
                    style={styles.copyBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.copyBtnText}>
                      {copied ? '✓ Copied' : '📋 Copy'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.tokenBox}>
                <Text style={styles.tokenText} selectable numberOfLines={3}>
                  {pushToken || 'No push token generated yet. Ensure device has internet and permissions enabled.'}
                </Text>
              </View>

              {!isRealFcmToken && (
                <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#f87171', marginBottom: 2 }}>
                    Token Status:
                  </Text>
                  <Text style={{ fontSize: 11, color: '#fca5a5', lineHeight: 15 }}>
                    {getLastPushTokenError()
                      ? `Error: ${getLastPushTokenError()}`
                      : 'Running in local fallback mode. Remote push from Vercel across the internet requires an EAS build with a linked Expo projectId.'}
                  </Text>
                </View>
              )}
            </View>

            {/* Background & Service Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Background Execution Architecture</Text>
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🟢</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureName}>Foreground Service</Text>
                    <Text style={styles.featureDetail}>
                      FOREGROUND_SERVICE_REMOTE_MESSAGING & DATA_SYNC active in app shade.
                    </Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🚨</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureName}>ALARM Audio Stream</Text>
                    <Text style={styles.featureDetail}>
                      Bypasses Android Silent Mode and Do Not Disturb (DND).
                    </Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🔋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureName}>Battery Optimization</Text>
                    <Text style={styles.featureDetail}>
                      Must be unrestricted on Samsung / Xiaomi / Pixel devices.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onCheckBattery}
                    style={styles.actionPill}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionPillText}>Settings ⚙️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Received Push Logs */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Received Push Notifications ({pushLogs.length})
              </Text>
              {pushLogs.length === 0 ? (
                <View style={styles.emptyLogBox}>
                  <Text style={styles.emptyLogIcon}>📭</Text>
                  <Text style={styles.emptyLogText}>
                    No push alerts received since app launch.
                  </Text>
                  <Text style={styles.emptyLogSub}>
                    Trigger a test from Admin Portal (/admin/users) or click below to test local alarm.
                  </Text>
                </View>
              ) : (
                <View style={styles.logList}>
                  {pushLogs.map((log) => (
                    <View key={log.id} style={styles.logItem}>
                      <View style={styles.logTopRow}>
                        <View style={styles.logBadgeRow}>
                          <Text style={styles.logTypeBadge}>
                            {log.isTest ? '⚡ TEST PUSH' : '🚨 GUEST REQUEST'}
                          </Text>
                        </View>
                        <Text style={styles.logTime}>{log.timestamp}</Text>
                      </View>
                      <Text style={styles.logTitle}>{log.title}</Text>
                      <Text style={styles.logBody}>{log.body}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={onTriggerTestAlarm}
                style={styles.testAlarmBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.testAlarmBtnText}>
                  🔔 Trigger Local Test Alarm
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconRing: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '700',
  },
  scroll: {
    padding: 20,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
  },
  statusBannerActive: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },
  statusBannerPending: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  statusBannerIcon: {
    fontSize: 24,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusBannerDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  copyBtnText: {
    fontSize: 11,
    color: '#818cf8',
    fontWeight: '700',
  },
  tokenBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tokenText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#a5b4fc',
    lineHeight: 16,
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  featureIcon: {
    fontSize: 16,
  },
  featureName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  featureDetail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionPillText: {
    fontSize: 11,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  emptyLogBox: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  emptyLogIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyLogText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  emptyLogSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  logList: {
    gap: 8,
  },
  logItem: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#818cf8',
  },
  logTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logBadgeRow: {
    flexDirection: 'row',
  },
  logTypeBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818cf8',
  },
  logTime: {
    fontSize: 10,
    color: '#64748b',
  },
  logTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  logBody: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 2,
  },
  actionRow: {
    marginTop: 4,
    marginBottom: 20,
  },
  testAlarmBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testAlarmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#a5b4fc',
  },
})
