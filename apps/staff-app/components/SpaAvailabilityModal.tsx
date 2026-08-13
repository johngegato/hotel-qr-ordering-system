import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'

export interface Therapist {
  id: string
  hotel_id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
  created_at: string
}

export interface SpaSlotLock {
  id: string
  hotel_id: string
  therapist_id: string | null
  session_id: string | null
  start_time: string
  end_time: string
  status: 'HELD' | 'BOOKED' | 'EXPIRED' | 'CANCELLED'
  expires_at: string
  created_at: string
}

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface SpaRequestForModal {
  id: string
  room_id: string
  payload?: {
    service_name?: string
    slot_time?: string
    price?: number
    duration_mins?: number
    intake_note?: string
    room_number?: string
    is_on_call?: boolean
  } | null
}

interface SpaAvailabilityModalProps {
  isOpen: boolean
  request: SpaRequestForModal | null
  onClose: () => void
  onConfirm: (requestId: string, therapistId: string, therapistName: string, isOnCall: boolean) => Promise<void>
}

export default function SpaAvailabilityModal({
  isOpen,
  request,
  onClose,
  onConfirm,
}: SpaAvailabilityModalProps) {
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({})
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null)

  const serviceName = request?.payload?.service_name ?? 'Spa Treatment'
  const slotTime = request?.payload?.slot_time ?? '14:00'
  const durationMins = request?.payload?.duration_mins ?? 60
  const rawRoom = request?.payload?.room_number ?? (request as any)?.rooms?.room_number ?? 'Room 302'
  const roomNumber = String(rawRoom).startsWith('Room') ? String(rawRoom) : `Room ${rawRoom}`

  // Check Availability & Conflict Detection
  useEffect(() => {
    if (!isOpen || !request) return

    const checkSlotConflicts = async () => {
      setChecking(true)
      try {
        // Fetch therapists
        const { data: therapistData } = await supabase
          .from('therapists')
          .select('*')
          .eq('hotel_id', HOTEL_ID)
          .eq('is_active', true)

        const list: Therapist[] = therapistData || [
          {
            id: '20000000-0000-0000-0000-000000000001',
            hotel_id: HOTEL_ID,
            full_name: 'Elena Rostova (In-House Senior)',
            is_on_call: false,
            is_active: true,
            created_at: new Date().toISOString(),
          },
          {
            id: '20000000-0000-0000-0000-000000000002',
            hotel_id: HOTEL_ID,
            full_name: 'Marcus Vance (On-Call Specialist)',
            is_on_call: true,
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ]
        setTherapists(list)

        // Query confirmed spa requests and slot locks for conflict checking
        const { data: confirmedReqs } = await supabase
          .from('requests')
          .select('*')
          .eq('hotel_id', HOTEL_ID)
          .eq('request_type', 'SPA_BOOKING')
          .eq('status', 'CONFIRMED')

        const conflictMap: Record<string, boolean> = {}

        // Evaluate conflicts per therapist
        list.forEach((t) => {
          if (confirmedReqs) {
            const hasConflict = confirmedReqs.some((req: any) => {
              const reqSlot = req.payload?.slot_time || ''
              const reqTherapist = req.payload?.assigned_therapist || ''
              return reqSlot.includes(slotTime.substring(0, 2)) && reqTherapist.includes(t.full_name.split(' ')[0])
            })
            conflictMap[t.id] = hasConflict
          } else {
            conflictMap[t.id] = false
          }
        })

        setConflicts(conflictMap)

        // Pre-select first non-conflicting in-house therapist, or fallback to on-call
        const availableInHouse = list.find((t) => !t.is_on_call && !conflictMap[t.id])
        if (availableInHouse) {
          setSelectedTherapistId(availableInHouse.id)
        } else {
          const onCall = list.find((t) => t.is_on_call)
          if (onCall) setSelectedTherapistId(onCall.id)
        }
      } catch (err) {
        console.error('Error checking spa availability:', err)
      } finally {
        setChecking(false)
      }
    }

    checkSlotConflicts()
  }, [isOpen, request])

  if (!isOpen || !request) return null

  const selectedTherapist = therapists.find((t) => t.id === selectedTherapistId)
  const isSelectedConflicted = selectedTherapistId ? conflicts[selectedTherapistId] : false
  const inHouseTherapist = therapists.find((t) => !t.is_on_call)
  const isInHouseBooked = inHouseTherapist ? conflicts[inHouseTherapist.id] : false
  const onCallTherapist = therapists.find((t) => t.is_on_call)

  const handleConfirmSubmit = async (therapistToUse?: Therapist) => {
    const target = therapistToUse || selectedTherapist
    if (!target) return

    setLoading(true)
    try {
      await onConfirm(request.id, target.id, target.full_name, target.is_on_call)
      onClose()
    } catch (err) {
      console.error('Error confirming booking from modal:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>🔍 Availability & Schedule Check</Text>
              <Text style={styles.modalSub}>{roomNumber} • {serviceName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Request Summary Box */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Requested Time Slot:</Text>
                <Text style={styles.summaryValueSlot}>🗓️ {slotTime}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration:</Text>
                <Text style={styles.summaryValue}>{durationMins} Mins</Text>
              </View>
              {request.payload?.intake_note ? (
                <View style={styles.intakeNoteBox}>
                  <Text style={styles.intakeNoteLabel}>Guest Notes:</Text>
                  <Text style={styles.intakeNoteText}>{request.payload.intake_note}</Text>
                </View>
              ) : null}
            </View>

            {/* Availability Assessment */}
            <Text style={styles.sectionLabel}>Therapist Roster & Slot Status</Text>

            {checking ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#a78bfa" />
                <Text style={styles.loadingBoxText}>Verifying schedule conflicts...</Text>
              </View>
            ) : (
              <View style={styles.therapistList}>
                {therapists.map((t) => {
                  const isConflicted = conflicts[t.id]
                  const isSelected = selectedTherapistId === t.id

                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.therapistCard,
                        isSelected && styles.therapistCardSelected,
                        isConflicted && styles.therapistCardConflicted,
                      ]}
                      onPress={() => setSelectedTherapistId(t.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.therapistRow}>
                        <View style={styles.therapistInfo}>
                          <Text style={styles.therapistName}>{t.full_name}</Text>
                          <Text style={[styles.therapistType, t.is_on_call ? styles.typeOnCall : styles.typeInHouse]}>
                            {t.is_on_call ? '⚡ On-Call Specialist' : '🏠 Standard In-House'}
                          </Text>
                        </View>

                        {/* Status Badge */}
                        {isConflicted ? (
                          <View style={styles.statusConflict}>
                            <Text style={styles.statusConflictText}>⛔ Slot Booked</Text>
                          </View>
                        ) : (
                          <View style={styles.statusAvailable}>
                            <Text style={styles.statusAvailableText}>✓ Available</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Overbooking Alert Banner */}
            {isInHouseBooked && (
              <View style={styles.overbookingBanner}>
                <Text style={styles.overbookingIcon}>⚠️</Text>
                <View style={styles.overbookingTextContainer}>
                  <Text style={styles.overbookingTitle}>In-House Therapist Fully Booked!</Text>
                  <Text style={styles.overbookingSub}>
                    Elena Rostova already has an appointment at {slotTime}. Double-booking is prevented. Assign to On-Call Specialist below.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.modalFooter}>
            {/* On-Call Fallback Button */}
            {onCallTherapist && (
              <TouchableOpacity
                style={[styles.onCallFallbackBtn, loading && styles.btnDisabled]}
                onPress={() => handleConfirmSubmit(onCallTherapist)}
                disabled={loading}
              >
                <Text style={styles.onCallFallbackText}>⚡ Assign to On-Call Specialist</Text>
              </TouchableOpacity>
            )}

            {/* Standard Confirm Button */}
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (isSelectedConflicted || loading || checking) && styles.btnDisabled,
              ]}
              onPress={() => handleConfirmSubmit()}
              disabled={isSelectedConflicted || loading || checking}
            >
              {loading ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {isSelectedConflicted ? '⛔ Selected Slot Unavailable' : '✓ Confirm Booking'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderWidth: 1,
    borderRadius: 24,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalBody: {
    paddingVertical: 16,
  },
  summaryCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  summaryValue: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  summaryValueSlot: {
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 14,
  },
  intakeNoteBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  intakeNoteLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  intakeNoteText: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  sectionLabel: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
  },
  loadingBoxText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  therapistList: {
    gap: 10,
    marginBottom: 16,
  },
  therapistCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  therapistCardSelected: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
  },
  therapistCardConflicted: {
    borderColor: 'rgba(248, 113, 113, 0.4)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  therapistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  therapistType: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  typeInHouse: {
    color: '#4ade80',
  },
  typeOnCall: {
    color: '#fbbf24',
  },
  statusAvailable: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusAvailableText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusConflict: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusConflictText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: 'bold',
  },
  overbookingBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    alignItems: 'center',
  },
  overbookingIcon: {
    fontSize: 20,
  },
  overbookingTextContainer: {
    flex: 1,
  },
  overbookingTitle: {
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 13,
  },
  overbookingSub: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  modalFooter: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  onCallFallbackBtn: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: '#fbbf24',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  onCallFallbackText: {
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 14,
  },
  confirmBtn: {
    backgroundColor: '#4ade80',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
