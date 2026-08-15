import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_ROOM_ID = '00000000-0000-0000-0000-000000000101'

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
]

export interface SpaServiceItem {
  id: string
  name: string
  price: number
  duration_mins: number
  requires_on_call?: boolean
  icon?: string
}

const DEFAULT_SERVICES: SpaServiceItem[] = [
  { id: 'spa-01', name: 'Swedish Relaxation Massage', price: 1500, duration_mins: 60, icon: '💆' },
  { id: 'spa-02', name: 'Deep Tissue Muscle Relief', price: 1800, duration_mins: 60, icon: '💪' },
  { id: 'spa-03', name: 'Hot Stone Volcanic Therapy', price: 2200, duration_mins: 90, icon: '🪨' },
  { id: 'spa-04', name: 'Foot & Leg Reflexology', price: 1200, duration_mins: 45, icon: '🦶' },
]

const FALLBACK_THERAPISTS = [
  { id: '20000000-0000-0000-0000-000000000001', full_name: 'Elena Rostova (In-House)', is_on_call: false },
  { id: '20000000-0000-0000-0000-000000000002', full_name: 'Marcus Vance (On-Call)',   is_on_call: true  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Therapist {
  id: string
  full_name: string
  is_on_call: boolean
}

export interface QuickAddSlot {
  slotTime: string
  therapistId: string
  therapistName: string
  isOnCall: boolean
}

interface ManualSpaBookingModalProps {
  isOpen: boolean
  quickAddSlot?: QuickAddSlot | null
  onClose: () => void
  onCreated: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManualSpaBookingModal({
  isOpen,
  quickAddSlot,
  onClose,
  onCreated,
}: ManualSpaBookingModalProps) {
  const [services, setServices] = useState<SpaServiceItem[]>(DEFAULT_SERVICES)
  const [therapists, setTherapists] = useState<Therapist[]>(FALLBACK_THERAPISTS)
  const [roomNumber, setRoomNumber] = useState('')
  const [roomResults, setRoomResults] = useState<any[]>([])
  const [isSearchingRooms, setIsSearchingRooms] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [guestPhone, setGuestPhone] = useState('')
  const [selectedService, setSelectedService] = useState<SpaServiceItem>(DEFAULT_SERVICES[0])
  const [selectedTherapistId, setSelectedTherapistId] = useState(FALLBACK_THERAPISTS[0].id)
  const [selectedTime, setSelectedTime] = useState('14:00')
  const [intakeNote, setIntakeNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Fetch live services (from Admin catalog_items) & live therapists
  useEffect(() => {
    const loadData = async () => {
      // 1. Fetch Admin configured catalog services
      const { data: svcData } = await (supabase as any)
        .from('catalog_items')
        .select('*')
        .eq('department', 'SPA')
        .eq('is_available', true)
        .order('created_at', { ascending: true })

      if (svcData && svcData.length > 0) {
        const mapped: SpaServiceItem[] = svcData.map((item: any) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          duration_mins: Number(item.duration_mins || item.duration || 60),
          requires_on_call: Boolean(item.requires_on_call),
          icon: item.name.toLowerCase().includes('stone') ? '🪨' : item.name.toLowerCase().includes('reflex') ? '🦶' : item.name.toLowerCase().includes('tissue') ? '💪' : '💆',
        }))
        setServices(mapped)
        setSelectedService(mapped[0])
      }

      // 2. Fetch Therapists
      const { data: thData } = await (supabase as any)
        .from('therapists')
        .select('id, full_name, is_on_call')
        .eq('hotel_id', HOTEL_ID)
        .eq('is_active', true)
        .order('is_on_call', { ascending: true })
      if (thData && thData.length > 0) setTherapists(thData)
    }
    loadData()
  }, [])

  // Pre-fill from quick-add slot, or reset on open
  useEffect(() => {
    if (!isOpen) return
    if (quickAddSlot) {
      setSelectedTime(quickAddSlot.slotTime)
      setSelectedTherapistId(quickAddSlot.therapistId)
    } else {
      setRoomNumber('')
      setGuestPhone('')
      if (services.length > 0) setSelectedService(services[0])
      setSelectedTherapistId(FALLBACK_THERAPISTS[0].id)
      setSelectedTime('14:00')
      setIntakeNote('')
    }
  }, [isOpen, quickAddSlot, services])

  const selectedTherapist = therapists.find((t) => t.id === selectedTherapistId) ?? therapists[0]

  const handleCreate = async () => {
    if (!roomNumber.trim()) {
      Alert.alert('Room Required', 'Please enter a room number for this booking.')
      return
    }

    setIsSaving(true)
    try {
      // Ensure a fallback seed room exists only if staff didn't pick an existing room
      if (!selectedRoomId) {
        try {
          const { data: roomData, error: roomErr } = await (supabase as any)
            .from('rooms')
            .select('id')
            .eq('id', DEFAULT_ROOM_ID)
            .single()

          if (roomErr || !roomData) {
            const seedRoom = {
              id: DEFAULT_ROOM_ID,
              hotel_id: HOTEL_ID,
              room_number: `seed-${roomNumber.trim() || '302'}`,
              qr_auth_hash: `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              is_seed: true,
              is_active: false,
              created_by: 'system-seed',
            }
            const { error: insRoomErr } = await (supabase as any)
              .from('rooms')
              .insert([seedRoom])

            if (insRoomErr) {
              console.warn('Failed to ensure DEFAULT_ROOM_ID exists:', insRoomErr)
            } else {
              try {
                await (supabase as any)
                  .from('audit_logs')
                  .insert([{
                    hotel_id: HOTEL_ID,
                    action: 'SEED_ROOM_CREATED',
                    details: { room_id: DEFAULT_ROOM_ID, source: 'system-seed' },
                  }])
              } catch (e) {
                // non-fatal
              }
            }
          }
        } catch (roomCheckErr) {
          console.warn('Room existence check failed (continuing):', roomCheckErr)
        }
      }

      const payload = {
        service_id: selectedService.id,
        service_name: selectedService.name,
        slot_time: selectedTime,
        display_time: selectedTime,
        price: selectedService.price,
        duration_mins: selectedService.duration_mins,
        intake_note: intakeNote.trim() || 'Walk-in — no special intake notes',
        guest_phone: guestPhone.trim() || undefined,
        room_number: roomNumber.trim(),
        is_on_call: selectedTherapist?.is_on_call ?? false,
        assigned_therapist: selectedTherapist?.full_name ?? 'Unknown Therapist',
        therapist_id: selectedTherapistId,
        manual_booking: true,
      }

      // Insert request
      const { data: reqData, error: reqErr } = await (supabase as any)
        .from('requests')
        .insert([{
          hotel_id: HOTEL_ID,
          room_id: selectedRoomId ?? DEFAULT_ROOM_ID,
          request_type: 'SPA_BOOKING',
          status: 'CONFIRMED',
          payload,
        }])
        .select('id')
        .single()

      if (reqErr) {
        console.error('requests.insert error:', reqErr)
        throw reqErr
      }

      // Audit log
      try {
        await (supabase as any)
          .from('audit_logs')
          .insert([{
            hotel_id: HOTEL_ID,
            request_id: reqData?.id ?? null,
            action: 'MANUAL_BOOKING_CREATED',
            details: {
              source: 'staff_manual',
              service: selectedService.name,
              therapist: selectedTherapist?.full_name,
              slot_time: selectedTime,
              room_number: roomNumber.trim(),
              guest_phone: guestPhone.trim() || null,
            },
          }])
      } catch (e) {
        // non-fatal
      }

      // Create slot lock
      try {
        if (reqData?.id) {
          const [hhStr, mmStr] = selectedTime.split(':')
          const hh = Number(hhStr || '14')
          const mm = Number(mmStr || '0')
          const startDt = new Date()
          startDt.setHours(hh, mm, 0, 0)
          const endDt = new Date(startDt.getTime() + (selectedService.duration_mins || 60) * 60 * 1000)

          await (supabase as any)
            .from('spa_slot_locks')
            .insert([{
              hotel_id: HOTEL_ID,
              therapist_id: selectedTherapistId,
              session_id: reqData.id,
              start_time: startDt.toISOString(),
              end_time: endDt.toISOString(),
              status: 'BOOKED',
              expires_at: null,
            }])
        }
      } catch (e) {
        console.warn('Failed to create spa_slot_lock for manual booking:', e)
      }

      // Reset form
      setRoomNumber('')
      setGuestPhone('')
      setIntakeNote('')
      if (services.length > 0) setSelectedService(services[0])
      setSelectedTime('14:00')
      setSelectedTherapistId(FALLBACK_THERAPISTS[0].id)

      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create manual booking (detailed):', err)
      let msg = 'Unknown error'
      let details = ''
      try {
        if (err && typeof err === 'object') {
          // @ts-ignore
          msg = err.message || err.msg || JSON.stringify(err)
          // @ts-ignore
          details = err.details || err.hint || ''
        } else if (typeof err === 'string') {
          msg = err
        }
      } catch (e) {
        // ignore
      }
      Alert.alert('Error', `Failed to create booking: ${msg}${details ? '\n' + details : ''}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Room search (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    const q = roomNumber.trim()
    if (!q) {
      setRoomResults([])
      setIsSearchingRooms(false)
      return
    }

    setIsSearchingRooms(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await (supabase as any)
          .from('rooms')
          .select('id, room_number')
          .eq('hotel_id', HOTEL_ID)
          .ilike('room_number', `${q}%`)
          .limit(10)

        setRoomResults(data || [])
      } catch (e) {
        console.warn('Room search failed:', e)
        setRoomResults([])
      } finally {
        setIsSearchingRooms(false)
      }
    }, 300)

    return () => clearTimeout(t)
  }, [roomNumber])

  const handleSelectRoomSuggestion = (room: any) => {
    setSelectedRoomId(room.id)
    setRoomNumber(String(room.room_number))
    setRoomResults([])
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {quickAddSlot ? '⚡ Quick-Add Booking' : '➕ Manual Walk-in Booking'}
              </Text>
              {quickAddSlot && (
                <Text style={styles.subtitle}>
                  Pre-filled: {quickAddSlot.slotTime} — {quickAddSlot.therapistName}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

            {/* Room Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Room Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 302, Suite 4A"
                placeholderTextColor="#475569"
                value={roomNumber}
                  onChangeText={(v) => { setRoomNumber(v); setSelectedRoomId(null); }}
                autoCapitalize="characters"
              />
              {/* Room suggestions */}
              {roomResults.length > 0 && (
                <View style={styles.suggestionList}>
                  {roomResults.map(r => (
                    <TouchableOpacity key={r.id} onPress={() => handleSelectRoomSuggestion(r)} style={styles.suggestionItem}>
                      <Text style={styles.suggestionText}>Room {r.room_number}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Guest Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Guest Phone (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="+63 917 000 0000"
                placeholderTextColor="#475569"
                value={guestPhone}
                onChangeText={setGuestPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Service Picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Service</Text>
              <View style={styles.pickerGrid}>
                {services.map((svc) => (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.pickerChip, selectedService.id === svc.id && styles.pickerChipActive]}
                    onPress={() => setSelectedService(svc)}
                  >
                    <Text style={styles.pickerChipIcon}>{svc.icon || '💆'}</Text>
                    <Text style={[styles.pickerChipText, selectedService.id === svc.id && styles.pickerChipTextActive]}>
                      {svc.name}
                    </Text>
                    <Text style={styles.pickerChipMeta}>{svc.duration_mins}min · ₱{svc.price.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Therapist Picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Assign Therapist</Text>
              <View style={styles.therapistRow}>
                {therapists.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.therapistChip, selectedTherapistId === t.id && styles.therapistChipActive]}
                    onPress={() => setSelectedTherapistId(t.id)}
                  >
                    <Text style={styles.therapistChipIcon}>{t.is_on_call ? '⚡' : '🏠'}</Text>
                    <Text style={[styles.therapistChipText, selectedTherapistId === t.id && styles.therapistChipTextActive]}>
                      {t.full_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Time Slot Picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Appointment Time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.timeRow}>
                  {TIME_SLOTS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timeChip, selectedTime === t && styles.timeChipActive]}
                      onPress={() => setSelectedTime(t)}
                    >
                      <Text style={[styles.timeChipText, selectedTime === t && styles.timeChipTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Intake Note */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Intake / Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Allergies, preferences, or special notes…"
                placeholderTextColor="#475569"
                value={intakeNote}
                onChangeText={setIntakeNote}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Booking Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>📋 Booking Summary</Text>
              <Text style={styles.summaryLine}>Room: <Text style={styles.summaryValue}>{roomNumber || '—'}</Text></Text>
              <Text style={styles.summaryLine}>Service: <Text style={styles.summaryValue}>{selectedService.icon || '💆'} {selectedService.name}</Text></Text>
              <Text style={styles.summaryLine}>Therapist: <Text style={styles.summaryValue}>{selectedTherapist?.full_name ?? '—'}</Text></Text>
              <Text style={styles.summaryLine}>Time: <Text style={styles.summaryValue}>⏰ {selectedTime}</Text></Text>
              <Text style={styles.summaryLine}>Duration: <Text style={styles.summaryValue}>{selectedService.duration_mins} min</Text></Text>
              <Text style={styles.summaryLine}>Price: <Text style={[styles.summaryValue, { color: '#fbbf24' }]}>₱{selectedService.price.toLocaleString()}</Text></Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSaving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, isSaving && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={isSaving}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#0f172a" />
                : <Text style={styles.confirmBtnText}>✓ Confirm Booking</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#a78bfa',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  body: {
    padding: 20,
    gap: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  pickerGrid: {
    gap: 8,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  pickerChipActive: {
    backgroundColor: 'rgba(167,139,250,0.2)',
    borderColor: 'rgba(167,139,250,0.6)',
  },
  pickerChipIcon: {
    fontSize: 18,
  },
  pickerChipText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  pickerChipTextActive: {
    color: '#ffffff',
  },
  pickerChipMeta: {
    color: '#475569',
    fontSize: 11,
  },
  therapistRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  therapistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  therapistChipActive: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderColor: 'rgba(74,222,128,0.5)',
  },
  therapistChipIcon: {
    fontSize: 14,
  },
  therapistChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  therapistChipTextActive: {
    color: '#4ade80',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
  },
  timeChipActive: {
    backgroundColor: 'rgba(251,191,36,0.2)',
    borderColor: 'rgba(251,191,36,0.6)',
  },
  timeChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  timeChipTextActive: {
    color: '#fbbf24',
  },
  summaryBox: {
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  summaryTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryLine: {
    color: '#94a3b8',
    fontSize: 12,
  },
  summaryValue: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#a78bfa',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  suggestionList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
    maxHeight: 160,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
  },
  suggestionText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
})
