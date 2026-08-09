import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
} from 'react-native'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface FoodOrderItem {
  id: string; name: string; quantity: number; unit_price: number
}

interface FoodOrderPayload {
  order_type: 'ROOM_SERVICE' | 'DINE_IN'
  items: FoodOrderItem[]
  special_instructions: string
  delivery_preference?: 'HAND_TO_ME' | 'LEAVE_AT_DOOR'
  target_arrival_time?: 'IN_15_MINS' | 'IN_30_MINS' | 'IN_60_MINS' | 'CUSTOM'
  total_price: number
}

interface FoodRequest {
  id: string
  room_id: string
  status: string
  payload: FoodOrderPayload
  created_at: string
  rooms?: { room_number: string } | null
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
  const [orders, setOrders]     = useState<FoodRequest[]>([])
  const [loading, setLoading]   = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('requests')
      .select('*, rooms(room_number)')
      .eq('request_type', 'FOOD_ORDER')
      .in('status', ['PENDING', 'PREPARING'])
      .order('created_at', { ascending: true })
    setOrders((data ?? []) as unknown as FoodRequest[])
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    let ch: RealtimeChannel
    ch = supabase
      .channel('staff-food-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    await supabase.from('requests').update({ status, claimed_at: new Date().toISOString() }).eq('id', id)
    setUpdating(null)
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Food Orders ({orders.length})</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {orders.map(order => {
          const payload  = order.payload
          const isDineIn = payload.order_type === 'DINE_IN'
          const isPreparing = order.status === 'PREPARING'
          return (
            <View key={order.id} style={[styles.card, isDineIn && styles.cardDineIn, isPreparing && styles.cardPreparing]}>

              {/* Dine-In Badge */}
              {isDineIn && (
                <View style={styles.dineInBadge}>
                  <Text style={styles.dineInBadgeText}>🍽️ DINE-IN PRE-ORDER</Text>
                  {payload.target_arrival_time && (
                    <ArrivalTimer target={payload.target_arrival_time} />
                  )}
                </View>
              )}

              {/* Room & Status Row */}
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.roomNumber}>Room {order.rooms?.room_number ?? '—'}</Text>
                  <View style={[styles.statusBadge, isPreparing ? styles.statusPreparing : styles.statusPending]}>
                    <Text style={styles.statusText}>{isPreparing ? '👨‍🍳 PREPARING' : '⏳ PENDING'}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ElapsedTimer createdAt={order.created_at} />
                  <Text style={styles.totalText}>₱{payload.total_price?.toLocaleString() ?? '—'}</Text>
                </View>
              </View>

              {/* Items List */}
              <View style={styles.itemsList}>
                {payload.items?.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemQty}>{item.quantity}×</Text>
                    <Text style={styles.itemName}>{item.name}</Text>
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
                  <Text style={styles.notesLabel}>📝 Notes</Text>
                  <Text style={styles.notesText}>{payload.special_instructions}</Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionsRow}>
                {!isPreparing && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnPrepare, updating === order.id && styles.btnDisabled]}
                    onPress={() => updateStatus(order.id, 'PREPARING')}
                    disabled={updating === order.id}>
                    <Text style={styles.actionBtnText}>{updating === order.id ? '…' : '👨‍🍳 Start Preparing'}</Text>
                  </TouchableOpacity>
                )}
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
  itemsList:        { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 12 },
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  itemQty:          { color: '#f97316', fontWeight: '700', fontSize: 14, marginRight: 8, minWidth: 24 },
  itemName:         { color: '#fff', fontSize: 14, flex: 1 },
  itemPrice:        { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  infoRow:          { flexDirection: 'row', gap: 8, marginBottom: 6 },
  infoLabel:        { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  infoValue:        { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  notesBox:         { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, marginBottom: 14 },
  notesLabel:       { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  notesText:        { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  actionsRow:       { flexDirection: 'row', gap: 10 },
  actionBtn:        { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrepare:       { backgroundColor: 'rgba(249,115,22,0.85)' },
  btnReady:         { backgroundColor: 'rgba(34,197,94,0.85)' },
  btnDisabled:      { opacity: 0.5 },
  actionBtnText:    { color: '#fff', fontWeight: '800', fontSize: 14 },
})
