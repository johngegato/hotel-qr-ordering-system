import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Linking, Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface FoodOrderItem {
  id?: string
  name: string
  quantity: number
  unit_price: number
  is_available?: boolean
}

interface FoodOrderPayload {
  order_type: 'ROOM_SERVICE' | 'DINE_IN'
  items: FoodOrderItem[]
  special_instructions: string
  delivery_preference?: 'HAND_TO_ME' | 'LEAVE_AT_DOOR'
  target_arrival_time?: 'IN_15_MINS' | 'IN_30_MINS' | 'IN_60_MINS' | 'CUSTOM'
  total_price: number
  guest_phone?: string
  rejection_reason?: string
  modified_by_staff?: boolean
}

interface FoodRequest {
  id: string
  room_id: string
  status: string
  payload: FoodOrderPayload
  created_at: string
  rooms?: { room_number: string } | null
}

interface CatalogMenuItem {
  id: string
  name: string
  price: number
  is_available: boolean
  category?: string
}

const DELIVERY_LABELS: Record<string, string> = {
  HAND_TO_ME:   '🤝 Hand to Me',
  LEAVE_AT_DOOR: '🚪 Leave at Door',
}
const ARRIVAL_LABELS: Record<string, string> = {
  IN_15_MINS: 'In 15 minutes',
  IN_30_MINS: 'In 30 minutes',
  IN_60_MINS: 'In 60 minutes',
  CUSTOM:     'Custom time',
}

const REJECTION_REASONS = [
  'Item unavailable - Guest requested cancellation',
  'Kitchen closed / Chef unavailable',
  'Out of stock items',
  'Guest unreachable',
  'Invalid request',
]

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(createdAt).getTime()
    const tick  = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <Text style={styles.elapsed}>{m}:{String(s).padStart(2, '0')}</Text>
}

function ArrivalTimer({ target }: { target: string }) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const minsMap: Record<string, number> = { IN_15_MINS: 15, IN_30_MINS: 30, IN_60_MINS: 60, CUSTOM: 30 }
    const total = (minsMap[target] ?? 30) * 60
    const id = setInterval(() => setLeft(prev => Math.max(0, prev - 1)), 1000)
    setLeft(total)
    return () => clearInterval(id)
  }, [target])
  const m = Math.floor(left / 60)
  const s = left % 60
  return <Text style={[styles.arrivalTimer, left < 120 && styles.arrivalTimerUrgent]}>{m}:{String(s).padStart(2, '0')}</Text>
}

export default function FoodQueue() {
  const [orders, setOrders] = useState<FoodRequest[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  // Edit Order Modal States
  const [editingOrder, setEditingOrder] = useState<FoodRequest | null>(null)
  const [editItems, setEditItems] = useState<FoodOrderItem[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [selectedAddItem, setSelectedAddItem] = useState<CatalogMenuItem | null>(null)

  // Reject Modal States
  const [cancellingOrder, setCancellingOrder] = useState<FoodRequest | null>(null)
  const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0])
  const [customReason, setCustomReason] = useState('')

  // Fetch orders and catalog item availability
  const fetchData = async () => {
    // 1. Fetch pending orders
    const { data: orderData } = await supabase
      .from('requests')
      .select('*, rooms(room_number)')
      .eq('request_type', 'FOOD_ORDER')
      .in('status', ['PENDING', 'PREPARING'])
      .order('created_at', { ascending: true })

    // 2. Fetch catalog items for availability mapping
    const { data: catalogData } = await supabase
      .from('catalog_items')
      .select('id, name, price, is_available, category')
      .eq('hotel_id', HOTEL_ID)

    setOrders((orderData ?? []) as unknown as FoodRequest[])
    setCatalogItems((catalogData ?? []) as CatalogMenuItem[])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    let ch: RealtimeChannel
    ch = supabase
      .channel('staff-food-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Helper to check item availability against live catalog_items
  const checkItemAvailability = (itemName: string): boolean => {
    const match = catalogItems.find(c => c.name.toLowerCase() === itemName.toLowerCase())
    return match ? match.is_available : true
  }

  // Update order status directly (e.g. Accept/Prepare, Order Ready)
  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    await supabase.from('requests').update({ status, claimed_at: new Date().toISOString() }).eq('id', id)
    setUpdating(null)
  }

  // Open Edit Order Modal
  const openEditModal = (order: FoodRequest) => {
    setEditingOrder(order)
    setEditItems(order.payload.items ? JSON.parse(JSON.stringify(order.payload.items)) : [])
    setEditNotes(order.payload.special_instructions || '')
    const availableList = catalogItems.filter(c => c.is_available)
    setSelectedAddItem(availableList.length > 0 ? availableList[0] : null)
  }

  // Edit item quantity
  const updateItemQty = (index: number, delta: number) => {
    const updated = [...editItems]
    const current = updated[index].quantity
    const next = current + delta
    if (next <= 0) {
      updated.splice(index, 1)
    } else {
      updated[index].quantity = next
    }
    setEditItems(updated)
  }

  // Remove item from edit list
  const removeItem = (index: number) => {
    const updated = [...editItems]
    updated.splice(index, 1)
    setEditItems(updated)
  }

  // Add a substitute or new menu item to edit list
  const addSubstituteItem = () => {
    if (!selectedAddItem) return
    const existingIndex = editItems.findIndex(i => i.name.toLowerCase() === selectedAddItem.name.toLowerCase())
    if (existingIndex >= 0) {
      const updated = [...editItems]
      updated[existingIndex].quantity += 1
      setEditItems(updated)
    } else {
      setEditItems([
        ...editItems,
        {
          id: selectedAddItem.id,
          name: selectedAddItem.name,
          quantity: 1,
          unit_price: selectedAddItem.price,
          is_available: true,
        },
      ])
    }
  }

  // Calculate dynamic total price for edited order
  const calculateEditTotal = (): number => {
    return editItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
  }

  // Save modified order & Log to Audit Trail
  const saveModifiedOrder = async () => {
    if (!editingOrder) return
    setUpdating(editingOrder.id)
    const newTotal = calculateEditTotal()

    const updatedPayload: FoodOrderPayload = {
      ...editingOrder.payload,
      items: editItems,
      total_price: newTotal,
      special_instructions: editNotes.trim(),
      modified_by_staff: true,
    }

    try {
      // 1. Update requests table
      const { error: reqErr } = await supabase
        .from('requests')
        .update({
          payload: updatedPayload,
          status: 'PREPARING',
          claimed_at: new Date().toISOString(),
        })
        .eq('id', editingOrder.id)

      if (reqErr) throw reqErr

      // 2. Insert record into audit_logs table
      await (supabase.from('audit_logs') as any).insert([
        {
          hotel_id: HOTEL_ID,
          actor_role: 'STAFF',
          action: 'MODIFY_DINING_ORDER',
          details: JSON.stringify({
            request_id: editingOrder.id,
            room_number: editingOrder.rooms?.room_number ?? 'Unknown',
            original_total: editingOrder.payload.total_price,
            new_total: newTotal,
            modified_items: editItems.map(i => `${i.quantity}x ${i.name} (₱${i.unit_price * i.quantity})`),
            special_instructions: editNotes.trim(),
            timestamp: new Date().toISOString(),
          }),
        },
      ])

      setEditingOrder(null)
      fetchData()
    } catch (err) {
      console.error('Error saving modified order:', err)
      Alert.alert('Error', 'Failed to update order. Please try again.')
    } finally {
      setUpdating(null)
    }
  }

  // Confirm Order Rejection / Cancellation
  const confirmRejection = async () => {
    if (!cancellingOrder) return
    setUpdating(cancellingOrder.id)
    const reason = selectedReason === 'Other / Custom reason' ? customReason.trim() : selectedReason

    const updatedPayload = {
      ...cancellingOrder.payload,
      rejection_reason: reason || 'Order rejected by staff',
    }

    try {
      // 1. Update request status to DECLINED
      await supabase
        .from('requests')
        .update({
          status: 'DECLINED',
          payload: updatedPayload,
        })
        .eq('id', cancellingOrder.id)

      // 2. Audit log entry for rejection
      await (supabase.from('audit_logs') as any).insert([
        {
          hotel_id: HOTEL_ID,
          actor_role: 'STAFF',
          action: 'REJECT_DINING_ORDER',
          details: JSON.stringify({
            request_id: cancellingOrder.id,
            room_number: cancellingOrder.rooms?.room_number ?? 'Unknown',
            rejection_reason: reason,
            timestamp: new Date().toISOString(),
          }),
        },
      ])

      setCancellingOrder(null)
      fetchData()
    } catch (err) {
      console.error('Error rejecting order:', err)
    } finally {
      setUpdating(null)
    }
  }

  // Handle phone dialing to guest
  const callGuest = (phone?: string, roomNumber?: string) => {
    const num = phone || '+18005550100'
    Linking.openURL(`tel:${num}`).catch(() => {
      Alert.alert('Call Guest', `Dialing Room ${roomNumber ?? '—'} at ${num}`)
    })
  }

  if (loading) return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>Loading food orders…</Text>
    </View>
  )

  if (orders.length === 0) return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>🍽️</Text>
      <Text style={styles.emptyText}>No pending food orders</Text>
    </View>
  )

  const availableCatalogOptions = catalogItems.filter(c => c.is_available)

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Food Orders ({orders.length})</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {orders.map(order => {
          const payload = order.payload
          const isDineIn = payload.order_type === 'DINE_IN'
          const isPreparing = order.status === 'PREPARING'

          // Extract guest phone number if available
          const guestPhone = payload.guest_phone || (payload.special_instructions?.match(/\d{7,15}/)?.[0])

          // Check if any item in this order is currently marked unavailable
          const itemsWithAvailability = (payload.items || []).map(item => ({
            ...item,
            available: checkItemAvailability(item.name),
          }))
          const hasUnavailableItems = itemsWithAvailability.some(i => !i.available)

          return (
            <View key={order.id} style={[
              styles.card,
              isDineIn && styles.cardDineIn,
              isPreparing && styles.cardPreparing,
              hasUnavailableItems && styles.cardWarning,
            ]}>

              {/* Dine-In Badge */}
              {isDineIn && (
                <View style={styles.dineInBadge}>
                  <Text style={styles.dineInBadgeText}>🍽️ DINE-IN PRE-ORDER</Text>
                  {payload.target_arrival_time && (
                    <ArrivalTimer target={payload.target_arrival_time} />
                  )}
                </View>
              )}

              {/* Unavailable Items Warning Banner */}
              {hasUnavailableItems && (
                <View style={styles.warningBanner}>
                  <Text style={styles.warningBannerText}>
                    ⚠️ CONTAINS UNAVAILABLE ITEM(S) — Call guest to discuss preferences
                  </Text>
                </View>
              )}

              {/* Room & Status Row */}
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.roomNumber}>Room {order.rooms?.room_number ?? '—'}</Text>
                  <View style={[styles.statusBadge, isPreparing ? styles.statusPreparing : styles.statusPending]}>
                    <Text style={styles.statusText}>
                      {isPreparing ? '👨‍🍳 PREPARING' : '⏳ PENDING'}
                      {payload.modified_by_staff ? ' · EDITED' : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ElapsedTimer createdAt={order.created_at} />
                  <Text style={styles.totalText}>₱{payload.total_price?.toLocaleString() ?? '—'}</Text>
                </View>
              </View>

              {/* Guest Call Button */}
              {!!guestPhone && (
                <TouchableOpacity
                  style={styles.callGuestBtn}
                  onPress={() => callGuest(guestPhone, order.rooms?.room_number)}>
                  <Text style={styles.callGuestBtnText}>📞 Call Guest ({guestPhone})</Text>
                </TouchableOpacity>
              )}

              {/* Items List with Availability Badges */}
              <View style={styles.itemsList}>
                {itemsWithAvailability.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemQty}>{item.quantity}×</Text>
                    <Text style={[styles.itemName, !item.available && styles.itemNameUnavailable]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.availabilityBadge, item.available ? styles.badgeAvail : styles.badgeUnavail]}>
                      {item.available ? '✅ Available' : '⚠️ UNAVAILABLE'}
                    </Text>
                    <Text style={styles.itemPrice}>₱{(item.unit_price * item.quantity).toLocaleString()}</Text>
                  </View>
                ))}
              </View>

              {/* Delivery / Arrival info */}
              {!isDineIn && payload.delivery_preference && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Delivery:</Text>
                  <Text style={styles.infoValue}>{DELIVERY_LABELS[payload.delivery_preference] ?? payload.delivery_preference}</Text>
                </View>
              )}
              {isDineIn && payload.target_arrival_time && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Arrival:</Text>
                  <Text style={styles.infoValue}>{ARRIVAL_LABELS[payload.target_arrival_time] ?? payload.target_arrival_time}</Text>
                </View>
              )}

              {/* Special Instructions */}
              {!!payload.special_instructions && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>📝 Special Notes / Instructions</Text>
                  <Text style={styles.notesText}>{payload.special_instructions}</Text>
                </View>
              )}

              {/* Actions Row */}
              <View style={styles.actionsRow}>
                {/* Edit Order Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnEdit]}
                  onPress={() => openEditModal(order)}>
                  <Text style={styles.actionBtnText}>✏️ Edit Order</Text>
                </TouchableOpacity>

                {/* Reject Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnReject]}
                  onPress={() => setCancellingOrder(order)}>
                  <Text style={styles.actionBtnText}>❌ Reject</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.actionsRow, { marginTop: 8 }]}>
                {/* Accept / Start Preparing Button */}
                {!isPreparing && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnPrepare, updating === order.id && styles.btnDisabled]}
                    onPress={() => updateStatus(order.id, 'PREPARING')}
                    disabled={updating === order.id}>
                    <Text style={styles.actionBtnText}>{updating === order.id ? '…' : '👨‍🍳 Accept & Prepare'}</Text>
                  </TouchableOpacity>
                )}

                {/* Order Ready / Complete Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnReady, updating === order.id && styles.btnDisabled]}
                  onPress={() => updateStatus(order.id, 'RESOLVED')}
                  disabled={updating === order.id}>
                  <Text style={styles.actionBtnText}>{isDineIn ? '🍽️ Table Ready' : '🛎️ Order Ready'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* ─── EDIT ORDER MODAL ────────────────────────────────────── */}
      <Modal visible={!!editingOrder} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✏️ Edit Dining Order</Text>
            <Text style={styles.modalSubtitle}>
              Room {editingOrder?.rooms?.room_number ?? '—'} · Modify items, quantities or substitute items
            </Text>

            <ScrollView style={{ maxHeight: 300, marginVertical: 12 }}>
              {/* Item Rows to Edit */}
              {editItems.map((item, idx) => (
                <View key={idx} style={styles.editRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editItemName}>{item.name}</Text>
                    <Text style={styles.editItemSubtotal}>
                      ₱{item.unit_price} × {item.quantity} = ₱{item.unit_price * item.quantity}
                    </Text>
                  </View>

                  <View style={styles.qtyContainer}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateItemQty(idx, -1)}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateItemQty(idx, 1)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeItem(idx)}>
                    <Text style={styles.removeBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add Substitute Item Picker */}
              <View style={styles.addSubstituteBox}>
                <Text style={styles.sectionHeading}>➕ Add Alternative Menu Item</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                  {availableCatalogOptions.map(opt => {
                    const isSelected = selectedAddItem?.id === opt.id
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.catalogChip, isSelected && styles.catalogChipSelected]}
                        onPress={() => setSelectedAddItem(opt)}>
                        <Text style={[styles.catalogChipText, isSelected && styles.catalogChipTextSelected]}>
                          {opt.name} (₱{opt.price})
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={addSubstituteItem}>
                  <Text style={styles.addBtnText}>+ Add Selected Item to Order</Text>
                </TouchableOpacity>
              </View>

              {/* Edit Notes */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.sectionHeading}>📝 Update Guest Notes / Preferences</Text>
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Record guest preferences or substitution details…"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.textInput}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* Total Price & Footer Buttons */}
            <View style={styles.modalFooter}>
              <View style={styles.totalRow}>
                <Text style={styles.totalRowLabel}>New Order Total:</Text>
                <Text style={styles.totalRowValue}>₱{calculateEditTotal().toLocaleString()}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setEditingOrder(null)}>
                  <Text style={styles.actionBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
                  onPress={saveModifiedOrder}>
                  <Text style={styles.actionBtnText}>Accept & Save Modified Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── REJECT / CANCEL MODAL ────────────────────────────────── */}
      <Modal visible={!!cancellingOrder} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>❌ Reject / Cancel Order</Text>
            <Text style={styles.modalSubtitle}>
              Room {cancellingOrder?.rooms?.room_number ?? '—'} · Select a reason for order cancellation
            </Text>

            <View style={{ marginVertical: 14 }}>
              {REJECTION_REASONS.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.reasonOption, selectedReason === r && styles.reasonOptionSelected]}
                  onPress={() => setSelectedReason(r)}>
                  <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextSelected]}>
                    {selectedReason === r ? '◉ ' : '◯ '}{r}
                  </Text>
                </TouchableOpacity>
              ))}

              {selectedReason === 'Other / Custom reason' && (
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Type specific reason for cancellation…"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.textInput, { marginTop: 8 }]}
                />
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => setCancellingOrder(null)}>
                <Text style={styles.actionBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                onPress={confirmRejection}>
                <Text style={styles.actionBtnText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container:        { marginTop: 20 },
  heading:          { color: '#f97316', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  emptyWrap:        { alignItems: 'center', paddingVertical: 32 },
  emptyIcon:        { fontSize: 36, marginBottom: 8 },
  emptyText:        { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  card:             { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardDineIn:       { borderColor: 'rgba(249,115,22,0.35)' },
  cardPreparing:    { borderColor: 'rgba(34,197,94,0.3)' },
  cardWarning:      { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' },
  warningBanner:    { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', padding: 8, borderRadius: 8, marginBottom: 12 },
  warningBannerText:{ color: '#f87171', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  dineInBadge:      { backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: 8, padding: 8, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dineInBadgeText:  { color: '#f97316', fontWeight: '800', fontSize: 12 },
  arrivalTimer:     { color: '#f97316', fontWeight: '800', fontSize: 18 },
  arrivalTimerUrgent: { color: '#ef4444' },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  roomNumber:       { color: '#fff', fontWeight: '800', fontSize: 22, marginBottom: 4 },
  statusBadge:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusPending:    { backgroundColor: 'rgba(250,204,21,0.15)' },
  statusPreparing:  { backgroundColor: 'rgba(34,197,94,0.15)' },
  statusText:       { color: '#fff', fontWeight: '700', fontSize: 11 },
  elapsed:          { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  totalText:        { color: '#f97316', fontWeight: '800', fontSize: 18, marginTop: 4 },
  callGuestBtn:     { backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12, alignItems: 'center' },
  callGuestBtnText: { color: '#60a5fa', fontWeight: '700', fontSize: 13 },
  itemsList:        { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 12 },
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  itemQty:          { color: '#f97316', fontWeight: '700', fontSize: 14, marginRight: 8, minWidth: 24 },
  itemName:         { color: '#fff', fontSize: 14, flex: 1 },
  itemNameUnavailable: { color: '#f87171', textDecorationLine: 'line-through' },
  availabilityBadge: { fontSize: 11, fontWeight: '700', marginHorizontal: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeAvail:       { backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  badgeUnavail:     { backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171' },
  itemPrice:        { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  infoRow:          { flexDirection: 'row', gap: 8, marginBottom: 6 },
  infoLabel:        { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  infoValue:        { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  notesBox:         { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, marginBottom: 14 },
  notesLabel:       { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  notesText:        { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  actionsRow:       { flexDirection: 'row', gap: 10 },
  actionBtn:        { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnEdit:          { backgroundColor: 'rgba(168,85,247,0.85)' },
  btnReject:        { backgroundColor: 'rgba(239,68,68,0.85)' },
  btnPrepare:       { backgroundColor: 'rgba(249,115,22,0.85)' },
  btnReady:         { backgroundColor: 'rgba(34,197,94,0.85)' },
  btnDisabled:      { opacity: 0.5 },
  actionBtnText:    { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Modal Styles
  modalBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard:        { width: '100%', maxWidth: 460, backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: 20 },
  modalTitle:       { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  modalSubtitle:    { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 12 },
  sectionHeading:   { color: '#f97316', fontSize: 12, fontWeight: '800', uppercase: 'true' as any, marginBottom: 6 },
  editRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 8 },
  editItemName:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  editItemSubtotal: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  qtyContainer:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8 },
  qtyBtn:           { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText:       { color: '#fff', fontSize: 18, fontWeight: '700' },
  qtyText:          { color: '#fff', fontSize: 15, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  removeBtn:        { padding: 6 },
  removeBtnText:    { fontSize: 16 },
  addSubstituteBox: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginTop: 8 },
  catalogChip:      { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  catalogChipSelected: { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: '#f97316' },
  catalogChipText:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  catalogChipTextSelected: { color: '#f97316', fontWeight: '800' },
  addBtn:           { backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  addBtnText:       { color: '#f97316', fontWeight: '800', fontSize: 12 },
  textInput:        { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, textAlignVertical: 'top' },
  modalFooter:      { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12, marginTop: 12 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalRowLabel:    { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  totalRowValue:    { color: '#f97316', fontWeight: '800', fontSize: 20 },
  reasonOption:     { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 6 },
  reasonOptionSelected: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  reasonText:       { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  reasonTextSelected: { color: '#f87171', fontWeight: '800' },
})
