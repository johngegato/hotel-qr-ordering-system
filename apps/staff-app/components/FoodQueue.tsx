import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Linking, Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useAutoSync } from '../lib/useAutoSync'
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
  subtotal?: number
  service_charge_pct?: number
  service_charge_amount?: number
  room_number?: string
  guest_phone?: string
  booked_by?: string
  rejection_reason?: string
  modified_by_staff?: boolean
  last_modified_by?: string
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
  description?: string
  image_url?: string | null
}

const FALLBACK_MENU: CatalogMenuItem[] = [
  { id: 'fb-01', name: 'Grilled Wagyu Burger', price: 450, is_available: true, category: 'Mains', description: 'A5 wagyu beef patty, truffle aioli, aged cheddar, brioche bun, hand-cut fries' },
  { id: 'fb-02', name: 'Spicy Pork Spare Ribs', price: 325, is_available: true, category: 'Mains', description: 'Tender braised ribs with spicy sweet glaze and garlic rice' },
  { id: 'fb-03', name: 'Crispy Pork Kare-Kare', price: 455, is_available: true, category: 'Mains', description: 'Crispy pork belly in rich peanut sauce with steamed vegetables' },
  { id: 'fb-04', name: 'Specialty Coffee', price: 120, is_available: true, category: 'Drinks', description: 'Single-origin espresso, steamed fresh milk, hot or iced' },
  { id: 'fb-05', name: 'Fresh Pressed Orange Juice', price: 150, is_available: true, category: 'Drinks', description: '100% freshly squeezed Valencia oranges' },
  { id: 'fb-06', name: 'Warm Chocolate Fondant', price: 220, is_available: true, category: 'Desserts', description: 'Molten dark chocolate lava cake with vanilla bean gelato' },
]

const DELIVERY_LABELS: Record<string, string> = {
  HAND_TO_ME:   '🤝 Hand to Me',
  LEAVE_AT_DOOR: '🚪 Leave at Door',
}
const ARRIVAL_LABELS: Record<string, string> = {
  IN_15_MINS: 'In 15 mins',
  IN_30_MINS: 'In 30 mins',
  IN_60_MINS: 'In 60 mins',
  CUSTOM:     'Custom time',
}

const REJECTION_REASONS = [
  'Item unavailable - Guest requested cancellation',
  'Kitchen closed / Chef unavailable',
  'Out of stock items',
  'Guest unreachable',
  'Invalid request',
  'Other / Custom reason',
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

export default function FoodQueue({ activeStaffId, activeStaffUser, refreshTrigger }: { activeStaffId?: string; activeStaffUser?: any; refreshTrigger?: number }) {
  const [orders, setOrders] = useState<FoodRequest[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogMenuItem[]>([])
  const [roomsList, setRoomsList] = useState<{ id: string; room_number: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  // Edit Order Modal States
  const [editingOrder, setEditingOrder] = useState<FoodRequest | null>(null)
  const [editItems, setEditItems] = useState<FoodOrderItem[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [menuSearchQuery, setMenuSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All')
  const [addedItemToast, setAddedItemToast] = useState<string | null>(null)

  // Manual Food Order Modal States
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false)
  const [manualRoomId, setManualRoomId] = useState('')
  const [manualRoomNumber, setManualRoomNumber] = useState('')
  const [manualGuestName, setManualGuestName] = useState('')
  const [manualGuestPhone, setManualGuestPhone] = useState('')
  const [manualOrderType, setManualOrderType] = useState<'ROOM_SERVICE' | 'DINE_IN'>('ROOM_SERVICE')
  const [manualDeliveryPref, setManualDeliveryPref] = useState<'HAND_TO_ME' | 'LEAVE_AT_DOOR'>('HAND_TO_ME')
  const [manualNotes, setManualNotes] = useState('')
  const [manualInitialStatus, setManualInitialStatus] = useState<'PREPARING' | 'PENDING'>('PREPARING')
  const [manualSelectedItems, setManualSelectedItems] = useState<Record<string, number>>({})
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [manualCategoryFilter, setManualCategoryFilter] = useState('All')
  const [submittingManualOrder, setSubmittingManualOrder] = useState(false)

  // Reject Modal States
  const [cancellingOrder, setCancellingOrder] = useState<FoodRequest | null>(null)
  const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0])
  const [customReason, setCustomReason] = useState('')

  // Hotel Service Charge Settings
  const [hotelServiceChargeEnabled, setHotelServiceChargeEnabled] = useState(true)
  const [hotelServiceChargePct, setHotelServiceChargePct] = useState(10)

  // ── Stable fetchData via useCallback + mutable ref ────────────────────────
  // The ref lets the realtime subscription always call the *latest* fetchData
  // without capturing a stale closure from the initial mount.
  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch pending food orders with join fallback
      const { data: orderData, error: orderErr } = await supabase
        .from('requests')
        .select('*, rooms(room_number)')
        .eq('request_type', 'FOOD_ORDER')
        .in('status', ['PENDING', 'PREPARING'])
        .order('created_at', { ascending: true })

      let orderList: FoodRequest[]
      if (orderErr) {
        console.warn('[FoodQueue] rooms join failed, retrying without join:', orderErr.message)
        const { data: fallback } = await supabase
          .from('requests')
          .select('*')
          .eq('request_type', 'FOOD_ORDER')
          .in('status', ['PENDING', 'PREPARING'])
          .order('created_at', { ascending: true })
        orderList = (fallback ?? []) as unknown as FoodRequest[]
      } else {
        orderList = (orderData ?? []) as unknown as FoodRequest[]
      }

      // 2. Fetch ONLY F&B department items from catalog_items
      const { data: dbCatalog, error: dbCatalogErr } = await (supabase as any)
        .from('catalog_items')
        .select('id, name, price, is_available, category, description, image_url')
        .eq('department', 'F_AND_B')
        .order('sort_order', { ascending: true })

      if (dbCatalogErr) {
        console.error('[FoodQueue] catalog_items error:', dbCatalogErr)
      }

      const itemsList: CatalogMenuItem[] = (dbCatalog && dbCatalog.length > 0)
        ? dbCatalog.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            is_available: item.is_available ?? true,
            category: item.category || 'Mains',
            description: item.description || '',
            image_url: item.image_url,
          }))
        : FALLBACK_MENU

      // 3. Fetch active rooms for manual order picker
      const { data: dbRooms } = await supabase
        .from('rooms')
        .select('id, room_number')
        .eq('hotel_id', HOTEL_ID)
        .eq('is_active', true)
        .order('room_number', { ascending: true })

      if (dbRooms && dbRooms.length > 0) {
        setRoomsList(dbRooms as { id: string; room_number: string }[])
      }

      setOrders(orderList)
      setCatalogItems(itemsList)

      // 4. Fetch Hotel Service Charge Setting
      const { data: hotelData } = await (supabase as any)
        .from('hotels')
        .select('service_charge_enabled, service_charge_pct')
        .eq('id', HOTEL_ID)
        .maybeSingle()

      if (hotelData) {
        setHotelServiceChargeEnabled(hotelData.service_charge_enabled ?? true)
        setHotelServiceChargePct(Number(hotelData.service_charge_pct ?? 10))
      }
    } catch (err) {
      console.error('[FoodQueue] fetchData error:', err)
    } finally {
      setLoading(false)
    }
  }, []) // no deps — uses only stable supabase client and setState

  // Mutable ref always points to the latest fetchData — safe to call from
  // the realtime subscription closure without stale-closure issues
  const fetchDataRef = useRef(fetchData)
  useEffect(() => { fetchDataRef.current = fetchData }, [fetchData])

  // ─── Automated Polling & Focus Synchronization ─────────────
  useAutoSync(() => fetchDataRef.current(), { intervalMs: 6000 })

  // Initial load + realtime subscription (runs once on mount)
  useEffect(() => {
    fetchDataRef.current()

    const ch: RealtimeChannel = supabase
      .channel('staff-food-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        // Always call via ref so we get the latest fetchData, never a stale closure
        fetchDataRef.current()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items' }, () => {
        fetchDataRef.current()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotels' }, () => {
        fetchDataRef.current()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Re-fetch once the channel is confirmed active in case an order
          // arrived between component mount and subscription confirmation
          fetchDataRef.current()
        }
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Whenever parent bumps refreshTrigger (e.g. incoming alert acknowledged),
  // do an immediate re-fetch. Skip the very first render (refreshTrigger===undefined)
  // so we don't double-fetch on mount.
  const isFirstRefreshTrigger = useRef(true)
  useEffect(() => {
    if (isFirstRefreshTrigger.current) {
      isFirstRefreshTrigger.current = false
      return
    }
    fetchDataRef.current()
  }, [refreshTrigger])

  // Dynamically extract categories from current F&B menu items
  const menuCategories = useMemo(() => {
    const cats = new Set<string>()
    catalogItems.forEach(item => {
      if (item.category && item.category.trim()) {
        cats.add(item.category.trim())
      }
    })
    return ['All', ...Array.from(cats)]
  }, [catalogItems])

  // Helper to check item availability against live catalog
  const checkItemAvailability = (itemName: string): boolean => {
    const match = catalogItems.find(c => c.name.toLowerCase() === itemName.toLowerCase())
    return match ? match.is_available : true
  }

  // Update order status with instant optimistic UI update + Supabase sync
  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    const previousOrders = [...orders]

    // 1. Instant optimistic update
    setOrders(prev => {
      if (['RESOLVED', 'DECLINED', 'CANCELLED'].includes(status)) {
        return prev.filter(o => o.id !== id)
      }
      return prev.map(o => o.id === id ? { ...o, status } : o)
    })

    try {
      // 2. Persist to Supabase requests table
      const { error } = await supabase.from('requests').update({
        status,
        claimed_by: activeStaffId || null,
        claimed_at: new Date().toISOString(),
      }).eq('id', id)

      if (error) {
        console.error(`Error updating order ${id} status to ${status}:`, error)
        setOrders(previousOrders)
      } else {
        // 3. Insert audit log
        try {
          const targetOrder = previousOrders.find(o => o.id === id)
          await (supabase.from('audit_logs') as any).insert([
            {
              hotel_id: HOTEL_ID,
              request_id: id,
              action: status === 'PREPARING' ? 'START_PREPARING_FOOD' : status === 'RESOLVED' ? 'FOOD_ORDER_READY' : 'UPDATE_FOOD_STATUS',
              details: {
                actor_role: 'STAFF',
                actor_name: activeStaffUser?.full_name || 'Kitchen Staff',
                request_id: id,
                new_status: status,
                room_number: targetOrder?.rooms?.room_number || targetOrder?.payload?.room_number || 'Unknown',
                timestamp: new Date().toISOString(),
              },
            },
          ])
        } catch (auditErr) {
          console.warn('[FoodQueue] Non-fatal audit log error:', auditErr)
        }
      }
    } catch (err) {
      console.error(`Error updating order ${id} status:`, err)
      setOrders(previousOrders)
    } finally {
      setUpdating(null)
      fetchData()
    }
  }

  // Open Edit Order Modal
  const openEditModal = (order: FoodRequest) => {
    setEditingOrder(order)
    setEditItems(order.payload.items ? JSON.parse(JSON.stringify(order.payload.items)) : [])
    setEditNotes(order.payload.special_instructions || '')
    setMenuSearchQuery('')
    setSelectedCategoryFilter('All')
    setAddedItemToast(null)
  }

  // Edit item quantity (+ / -)
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

  // Add selected menu item from the restaurant menu to the order
  const addItemToOrder = (menuItem: CatalogMenuItem) => {
    const existingIndex = editItems.findIndex(i => i.name.toLowerCase() === menuItem.name.toLowerCase())
    if (existingIndex >= 0) {
      const updated = [...editItems]
      updated[existingIndex].quantity += 1
      setEditItems(updated)
    } else {
      setEditItems([
        ...editItems,
        {
          id: menuItem.id,
          name: menuItem.name,
          quantity: 1,
          unit_price: menuItem.price,
          is_available: menuItem.is_available,
        },
      ])
    }

    setAddedItemToast(`Added 1× ${menuItem.name}`)
    setTimeout(() => setAddedItemToast(null), 2500)
  }

  // Helper to determine service charge config for current order
  const getOrderServiceChargeConfig = () => {
    if (editingOrder?.payload?.service_charge_pct !== undefined) {
      const pct = Number(editingOrder.payload.service_charge_pct)
      return { isEnabled: pct > 0, pct }
    }
    return {
      isEnabled: hotelServiceChargeEnabled,
      pct: hotelServiceChargePct,
    }
  }

  // Calculate items subtotal for edited order
  const calculateEditSubtotal = (): number => {
    return editItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
  }

  // Calculate service charge amount for edited order
  const calculateEditServiceCharge = (subtotal: number): number => {
    const { isEnabled, pct } = getOrderServiceChargeConfig()
    if (!isEnabled || pct <= 0) return 0
    return Math.round(subtotal * (pct / 100) * 100) / 100
  }

  // Calculate dynamic grand total price for edited order (subtotal + service charge)
  const calculateEditTotal = (): number => {
    const subtotal = calculateEditSubtotal()
    const sc = calculateEditServiceCharge(subtotal)
    return subtotal + sc
  }

  // Save modified order & Log to Audit Trail
  const saveModifiedOrder = async () => {
    if (!editingOrder) return
    const orderId = editingOrder.id
    setUpdating(orderId)

    const subtotal = calculateEditSubtotal()
    const { isEnabled, pct } = getOrderServiceChargeConfig()
    const scAmt = calculateEditServiceCharge(subtotal)
    const newTotal = subtotal + scAmt

    const updatedPayload: FoodOrderPayload = {
      ...editingOrder.payload,
      items: editItems,
      subtotal: subtotal,
      service_charge_pct: isEnabled ? pct : 0,
      service_charge_amount: scAmt,
      total_price: newTotal,
      special_instructions: editNotes.trim(),
      last_modified_by: activeStaffUser?.full_name || 'Front Desk Staff',
      modified_by_staff: true,
    }

    const previousOrders = [...orders]

    // 1. Instant optimistic state update
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      payload: updatedPayload,
      status: 'PREPARING',
    } : o))
    setEditingOrder(null)

    try {
      // 2. Update requests table
      const { error: reqErr } = await supabase
        .from('requests')
        .update({
          payload: updatedPayload,
          status: 'PREPARING',
          claimed_by: activeStaffId || null,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (reqErr) {
        console.error('Error saving modified order:', reqErr)
        setOrders(previousOrders)
        Alert.alert('Error', 'Failed to update order. Please try again.')
      } else {
        // 3. Insert record into audit_logs table
        try {
          await (supabase.from('audit_logs') as any).insert([
            {
              hotel_id: HOTEL_ID,
              request_id: orderId,
              action: 'MODIFY_DINING_ORDER',
              details: {
                actor_role: 'STAFF',
                actor_name: activeStaffUser?.full_name || 'Kitchen Staff',
                request_id: orderId,
                room_number: editingOrder.rooms?.room_number ?? 'Unknown',
                original_total: editingOrder.payload.total_price,
                new_subtotal: subtotal,
                service_charge_pct: isEnabled ? pct : 0,
                service_charge_amount: scAmt,
                new_total: newTotal,
                modified_items: editItems.map(i => `${i.quantity}x ${i.name} (₱${(i.unit_price * i.quantity).toLocaleString()})`),
                special_instructions: editNotes.trim(),
                summary: `Order updated to ₱${newTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${scAmt > 0 ? ` (incl. ₱${scAmt.toFixed(2)} service charge)` : ''}`,
                timestamp: new Date().toISOString(),
              },
            },
          ])
        } catch (auditErr) {
          console.warn('[FoodQueue] Non-fatal audit log error:', auditErr)
        }
      }
    } catch (err) {
      console.error('Error saving modified order:', err)
      setOrders(previousOrders)
      Alert.alert('Error', 'Failed to update order. Please try again.')
    } finally {
      setUpdating(null)
      fetchData()
    }
  }

  // Confirm Order Rejection / Cancellation
  const confirmRejection = async () => {
    if (!cancellingOrder) return
    const orderId = cancellingOrder.id
    setUpdating(orderId)
    const reason = selectedReason === 'Other / Custom reason' ? customReason.trim() : selectedReason

    const updatedPayload = {
      ...cancellingOrder.payload,
      rejection_reason: reason || 'Order rejected by kitchen staff',
    }

    const previousOrders = [...orders]

    // 1. Instant optimistic removal
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setCancellingOrder(null)

    try {
      // 2. Update requests table
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'DECLINED',
          payload: updatedPayload,
          claimed_by: activeStaffId || null,
        })
        .eq('id', orderId)

      if (error) {
        console.error('Error rejecting order:', error)
        setOrders(previousOrders)
      } else {
        // 3. Insert audit log
        try {
          await (supabase.from('audit_logs') as any).insert([
            {
              hotel_id: HOTEL_ID,
              request_id: orderId,
              action: 'REJECT_DINING_ORDER',
              details: {
                actor_role: 'STAFF',
                actor_name: activeStaffUser?.full_name || 'Kitchen Staff',
                request_id: orderId,
                room_number: cancellingOrder.rooms?.room_number ?? 'Unknown',
                rejection_reason: reason,
                timestamp: new Date().toISOString(),
              },
            },
          ])
        } catch (auditErr) {
          console.warn('[FoodQueue] Non-fatal audit log error:', auditErr)
        }
      }
    } catch (err) {
      console.error('Error rejecting order:', err)
      setOrders(previousOrders)
    } finally {
      setUpdating(null)
      fetchData()
    }
  }

  // Handle phone dialing to guest
  const callGuest = (phone?: string, roomNumber?: string) => {
    if (!phone) {
      Alert.alert('No Phone Number', 'No phone number is registered for this guest.')
      return
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Guest', `Dialing Room ${roomNumber ?? '—'} at ${phone}`)
    })
  }

  // Filter full catalog items by search query and category for Edit Modal
  const filteredFullMenu = catalogItems.filter(item => {
    const q = menuSearchQuery.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))

    const matchesCategory =
      selectedCategoryFilter === 'All' ||
      (item.category && item.category.toLowerCase() === selectedCategoryFilter.toLowerCase())

    return matchesSearch && matchesCategory
  })

  // Available categories across active catalog items
  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    catalogItems.forEach(i => { if (i.category) set.add(i.category) })
    return ['All', ...Array.from(set)]
  }, [catalogItems])

  // Filter catalog items for Manual Order Creation Modal
  const filteredManualMenu = catalogItems.filter(item => {
    const q = manualSearchQuery.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))

    const matchesCategory =
      manualCategoryFilter === 'All' ||
      (item.category && item.category.toLowerCase() === manualCategoryFilter.toLowerCase())

    return matchesSearch && matchesCategory
  })

  // Live Manual Order Price Calculations
  const manualChosenItemsList: FoodOrderItem[] = useMemo(() => {
    return Object.entries(manualSelectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const cat = catalogItems.find(c => c.id === itemId)
        return {
          id: itemId,
          name: cat?.name || 'Menu Item',
          quantity: qty,
          unit_price: cat?.price || 0,
          is_available: true,
        }
      })
  }, [manualSelectedItems, catalogItems])

  const manualSubtotal = useMemo(() => {
    return manualChosenItemsList.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
  }, [manualChosenItemsList])

  const manualScPct = hotelServiceChargeEnabled ? hotelServiceChargePct : 0
  const manualScAmount = hotelServiceChargeEnabled ? (manualSubtotal * manualScPct) / 100 : 0
  const manualGrandTotal = manualSubtotal + manualScAmount

  // Create Manual / Telephone Order
  const handleCreateManualOrder = async () => {
    const roomNo = manualRoomNumber.trim()
    if (!roomNo) {
      Alert.alert('Room Required', 'Please select or enter a valid room number.')
      return
    }

    if (manualChosenItemsList.length === 0) {
      Alert.alert('Items Required', 'Please select at least one menu item.')
      return
    }

    setSubmittingManualOrder(true)

    try {
      let resolvedRoomId = manualRoomId
      if (!resolvedRoomId) {
        const matchingRoom = roomsList.find(r => r.room_number.toLowerCase() === roomNo.toLowerCase())
        if (matchingRoom) {
          resolvedRoomId = matchingRoom.id
        } else {
          // Fallback room query or default
          const { data: rData } = await supabase.from('rooms').select('id').eq('room_number', roomNo).maybeSingle()
          resolvedRoomId = rData?.id || (roomsList[0]?.id || '10000000-0000-0000-0000-000000000101')
        }
      }

      const orderPayload: FoodOrderPayload = {
        order_type: manualOrderType,
        items: manualChosenItemsList,
        special_instructions: manualNotes.trim(),
        delivery_preference: manualDeliveryPref,
        total_price: manualGrandTotal,
        subtotal: manualSubtotal,
        service_charge_pct: manualScPct,
        service_charge_amount: manualScAmount,
        room_number: roomNo,
        guest_phone: manualGuestPhone.trim() || undefined,
        booked_by: manualGuestName.trim() || 'Manual Phone Order',
        modified_by_staff: true,
        last_modified_by: activeStaffUser?.full_name || 'Kitchen Staff',
      }

      const { data: newOrder, error: insertErr } = await supabase
        .from('requests')
        .insert([{
          hotel_id: HOTEL_ID,
          room_id: resolvedRoomId,
          request_type: 'FOOD_ORDER',
          status: manualInitialStatus,
          payload: orderPayload,
          claimed_by: activeStaffId || null,
          claimed_at: manualInitialStatus === 'PREPARING' ? new Date().toISOString() : null,
        }])
        .select('*, rooms(room_number)')
        .single()

      if (insertErr) {
        throw insertErr
      }

      // Insert audit log record
      try {
        await (supabase.from('audit_logs') as any).insert([{
          hotel_id: HOTEL_ID,
          request_id: newOrder?.id || null,
          action: 'CREATE_MANUAL_FOOD_ORDER',
          actor_id: activeStaffId || null,
          details: {
            actor_name: activeStaffUser?.full_name || 'Kitchen Staff',
            actor_role: activeStaffUser?.role || 'KITCHEN',
            room_number: roomNo,
            guest_name: manualGuestName.trim(),
            guest_phone: manualGuestPhone.trim(),
            items: manualChosenItemsList.map(i => `${i.quantity}x ${i.name}`),
            subtotal: manualSubtotal,
            service_charge_pct: manualScPct,
            service_charge_amount: manualScAmount,
            total_price: manualGrandTotal,
            status: manualInitialStatus,
            timestamp: new Date().toISOString(),
          }
        }])
      } catch (auditErr) {
        console.warn('[FoodQueue] Non-fatal audit log error:', auditErr)
      }

      if (newOrder) {
        setOrders(prev => [newOrder as unknown as FoodRequest, ...prev])
      }

      // Reset modal state
      setIsManualOrderOpen(false)
      setManualRoomId('')
      setManualRoomNumber('')
      setManualGuestName('')
      setManualGuestPhone('')
      setManualNotes('')
      setManualSelectedItems({})
      setManualSearchQuery('')
      setManualCategoryFilter('All')
      Alert.alert('Order Created', `Order for Room ${roomNo} has been successfully submitted!`)
    } catch (err: any) {
      console.error('[FoodQueue] Error creating manual order:', err)
      Alert.alert('Error', err?.message || 'Failed to create manual order.')
    } finally {
      setSubmittingManualOrder(false)
      fetchData()
    }
  }

  if (loading) return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>Loading food orders…</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Heading Row with Manual Order Action Button */}
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Food Orders ({orders.length})</Text>
        <TouchableOpacity
          style={styles.createOrderHeaderBtn}
          onPress={() => setIsManualOrderOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.createOrderHeaderBtnText}>+ Phone / Manual Order</Text>
        </TouchableOpacity>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🍽️</Text>
          <Text style={styles.emptyText}>No pending food orders</Text>
          <TouchableOpacity
            style={[styles.createOrderHeaderBtn, { marginTop: 12 }]}
            onPress={() => setIsManualOrderOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.createOrderHeaderBtnText}>+ Place Telephone / Room Order</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {orders.map(order => {
            const payload = order.payload
            const isDineIn = payload.order_type === 'DINE_IN'
            const isPreparing = order.status === 'PREPARING'

            // Extract guest phone number if available
            const guestPhone = payload.guest_phone || (payload.special_instructions?.match(/\d{7,15}/)?.[0])

            // Check if any item in this order is currently marked unavailable
            const hasUnavailableItem = payload.items?.some(i => !checkItemAvailability(i.name))

            return (
              <View
                key={order.id}
                style={[
                  styles.card,
                  isDineIn && styles.cardDineIn,
                  isPreparing && styles.cardPreparing,
                  hasUnavailableItem && styles.cardWarning,
                ]}>
                {/* Unavailable Item Alert Banner */}
                {hasUnavailableItem && (
                  <View style={styles.warningBanner}>
                    <Text style={styles.warningBannerText}>
                      ⚠️ Contains out-of-stock item(s). Click &quot;Edit&quot; to substitute or call guest.
                    </Text>
                  </View>
                )}

                {/* Dine In Target Arrival Timer */}
                {isDineIn && payload.target_arrival_time && (
                  <View style={styles.dineInBadge}>
                    <Text style={styles.dineInBadgeText}>
                      🍽️ DINE IN · Arrival: {ARRIVAL_LABELS[payload.target_arrival_time] ?? payload.target_arrival_time}
                    </Text>
                    <ArrivalTimer target={payload.target_arrival_time} />
                  </View>
                )}

                {/* Header: Room & Status */}
                <View style={styles.headerRow}>
                  <View>
                    <Text style={styles.roomNumber}>
                      Room {order.rooms?.room_number || order.payload?.room_number || '—'}
                    </Text>
                    <View style={[styles.statusBadge, isPreparing ? styles.statusPreparing : styles.statusPending]}>
                      <Text style={styles.statusText}>{order.status}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <ElapsedTimer createdAt={order.created_at} />
                    <Text style={styles.totalText}>
                      ₱{Number(payload.total_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    {!!payload.service_charge_amount && (
                      <Text style={{ fontSize: 11, color: '#fbbf24', fontWeight: '600', marginTop: 1 }}>
                        incl. {payload.service_charge_pct || 10}% SC
                      </Text>
                    )}
                  </View>
                </View>

                {/* Universal Guest Direct Call Button */}
                {guestPhone ? (
                  <TouchableOpacity
                    style={styles.callGuestBtn}
                    onPress={() => callGuest(guestPhone, order.rooms?.room_number || order.payload?.room_number)}>
                    <Text style={styles.callGuestBtnText}>📞 Call Guest ({guestPhone})</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.callGuestBtn, styles.callGuestBtnDisabled]} disabled>
                    <Text style={styles.callGuestBtnDisabledText}>📞 No Phone Provided</Text>
                  </TouchableOpacity>
                )}

              {/* Items List with Live Availability Badges */}
              <View style={styles.itemsList}>
                {payload.items?.map((item, idx) => {
                  const isAvail = checkItemAvailability(item.name)
                  return (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{item.quantity}×</Text>
                      <Text style={[styles.itemName, !isAvail && styles.itemNameUnavailable]}>
                        {item.name}
                      </Text>
                      {!isAvail && (
                        <Text style={[styles.availabilityBadge, styles.badgeUnavail]}>Out of Stock</Text>
                      )}
                      <Text style={styles.itemPrice}>₱{(item.unit_price * item.quantity).toLocaleString()}</Text>
                    </View>
                  )
                })}

                {/* Service Charge Row in Card Items List */}
                {!!payload.service_charge_amount && (
                  <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(251,191,36,0.9)', fontSize: 12, fontWeight: '600' }}>
                      💳 Service Charge ({payload.service_charge_pct || 10}%)
                    </Text>
                    <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>
                      +₱{Number(payload.service_charge_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Delivery Preference */}
              {payload.delivery_preference && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Delivery:</Text>
                  <Text style={styles.infoValue}>
                    {DELIVERY_LABELS[payload.delivery_preference] ?? payload.delivery_preference}
                  </Text>
                </View>
              )}

              {/* Special Instructions / Notes */}
              {!!payload.special_instructions && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>Guest Instructions:</Text>
                  <Text style={styles.notesText}>{payload.special_instructions}</Text>
                </View>
              )}

              {/* Action Buttons Row */}
              <View style={styles.actionsRow}>
                {/* Edit Order Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnEdit]}
                  onPress={() => openEditModal(order)}>
                  <Text style={styles.actionBtnText}>✏️ Edit</Text>
                </TouchableOpacity>

                {/* Decline / Reject Button */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnReject]}
                  onPress={() => {
                    setCancellingOrder(order)
                    setSelectedReason(REJECTION_REASONS[0])
                    setCustomReason('')
                  }}>
                  <Text style={styles.actionBtnText}>✕ Decline</Text>
                </TouchableOpacity>

                {/* Primary Action Button */}
                {!isPreparing ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnPrepare, updating === order.id && styles.btnDisabled]}
                    disabled={updating === order.id}
                    onPress={() => updateStatus(order.id, 'PREPARING')}>
                    <Text style={styles.actionBtnText}>
                      {updating === order.id ? 'Starting…' : '👨‍🍳 Prepare'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnReady, updating === order.id && styles.btnDisabled]}
                    disabled={updating === order.id}
                    onPress={() => updateStatus(order.id, 'RESOLVED')}>
                    <Text style={styles.actionBtnText}>
                      {updating === order.id ? 'Completing…' : '✓ Order Ready'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )
        })}
      </ScrollView>
      )}

      {/* ─── MODAL 0: MANUAL / PHONE FOOD ORDER CREATION MODAL ────────────────── */}
      <Modal visible={isManualOrderOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.modalTitle}>📞 Create Manual Food Order</Text>
                  <View style={[styles.roomPill, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                    <Text style={[styles.roomPillText, { color: '#4ade80' }]}>Phone / Walk-in</Text>
                  </View>
                </View>
                <Text style={styles.modalSubtitle}>
                  Enter guest details, select menu items, and send directly to the kitchen
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsManualOrderOpen(false)}
                style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              {/* SECTION 1: ROOM & GUEST DETAILS */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeading}>🏨 Guest &amp; Room Assignment</Text>

                {/* Room Number Input & Quick Room Chips */}
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.fieldLabel}>Room Number *</Text>
                  <TextInput
                    value={manualRoomNumber}
                    onChangeText={(val) => {
                      setManualRoomNumber(val)
                      const match = roomsList.find(r => r.room_number.toLowerCase() === val.trim().toLowerCase())
                      setManualRoomId(match?.id || '')
                    }}
                    placeholder="e.g. 101, 204, 305..."
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.inputField}
                  />

                  {/* Quick Room Selector Chips */}
                  {roomsList.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      {roomsList.slice(0, 10).map((r) => {
                        const isSelected = manualRoomNumber === r.room_number
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[styles.quickRoomChip, isSelected && styles.quickRoomChipSelected]}
                            onPress={() => {
                              setManualRoomNumber(r.room_number)
                              setManualRoomId(r.id)
                            }}
                          >
                            <Text style={[styles.quickRoomChipText, isSelected && styles.quickRoomChipTextSelected]}>
                              Room {r.room_number}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  )}
                </View>

                {/* Guest Name & Guest Phone (2 Columns) */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Guest Name</Text>
                    <TextInput
                      value={manualGuestName}
                      onChangeText={setManualGuestName}
                      placeholder="e.g. John Doe"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.inputField}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Guest Phone (for quick call)</Text>
                    <TextInput
                      value={manualGuestPhone}
                      onChangeText={setManualGuestPhone}
                      placeholder="e.g. +1 555-0199"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="phone-pad"
                      style={styles.inputField}
                    />
                  </View>
                </View>

                {/* Order Type & Initial Status */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Order Type</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, manualOrderType === 'ROOM_SERVICE' && styles.toggleBtnActive]}
                        onPress={() => setManualOrderType('ROOM_SERVICE')}
                      >
                        <Text style={[styles.toggleBtnText, manualOrderType === 'ROOM_SERVICE' && styles.toggleBtnTextActive]}>
                          🚪 Room Service
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleBtn, manualOrderType === 'DINE_IN' && styles.toggleBtnActive]}
                        onPress={() => setManualOrderType('DINE_IN')}
                      >
                        <Text style={[styles.toggleBtnText, manualOrderType === 'DINE_IN' && styles.toggleBtnTextActive]}>
                          🍽️ Dine In
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Initial Kitchen Status</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, manualInitialStatus === 'PREPARING' && styles.toggleBtnActive]}
                        onPress={() => setManualInitialStatus('PREPARING')}
                      >
                        <Text style={[styles.toggleBtnText, manualInitialStatus === 'PREPARING' && styles.toggleBtnTextActive]}>
                          👨‍🍳 Preparing
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleBtn, manualInitialStatus === 'PENDING' && styles.toggleBtnActive]}
                        onPress={() => setManualInitialStatus('PENDING')}
                      >
                        <Text style={[styles.toggleBtnText, manualInitialStatus === 'PENDING' && styles.toggleBtnTextActive]}>
                          🟡 Pending
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* SECTION 2: CHOSEN ITEMS */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>🛒 Order Items ({manualChosenItemsList.length} unique)</Text>
                  <Text style={styles.sectionSubtotal}>
                    Items: ₱{manualSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {manualChosenItemsList.length === 0 ? (
                  <View style={styles.emptyOrderBox}>
                    <Text style={styles.emptyOrderItemsText}>
                      No items selected yet. Tap &quot;+ Add&quot; on dishes below.
                    </Text>
                  </View>
                ) : (
                  manualChosenItemsList.map((item) => (
                    <View key={item.id} style={styles.editRow}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.editItemName}>{item.name}</Text>
                        <Text style={styles.editItemSubtotal}>
                          ₱{item.unit_price.toLocaleString()} × {item.quantity} = <Text style={{ color: '#4ade80', fontWeight: '700' }}>₱{(item.unit_price * item.quantity).toLocaleString()}</Text>
                        </Text>
                      </View>

                      <View style={styles.qtyContainer}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => {
                            if (!item.id) return
                            setManualSelectedItems(prev => {
                              const curr = prev[item.id!] || 0
                              if (curr <= 1) {
                                const next = { ...prev }
                                delete next[item.id!]
                                return next
                              }
                              return { ...prev, [item.id!]: curr - 1 }
                            })
                          }}
                        >
                          <Text style={styles.qtyBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => {
                            if (!item.id) return
                            setManualSelectedItems(prev => ({ ...prev, [item.id!]: (prev[item.id!] || 0) + 1 }))
                          }}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => {
                          if (!item.id) return
                          setManualSelectedItems(prev => {
                            const next = { ...prev }
                            delete next[item.id!]
                            return next
                          })
                        }}
                      >
                        <Text style={styles.removeBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {/* SECTION 3: RESTAURANT MENU CATALOG BROWSER */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>🍽️ Restaurant Menu ({filteredManualMenu.length} items)</Text>
                </View>

                {/* Search Bar */}
                <TextInput
                  value={manualSearchQuery}
                  onChangeText={setManualSearchQuery}
                  placeholder="🔍 Search dishes, drinks, desserts..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={styles.searchBarInput}
                />

                {/* Category Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                  {availableCategories.map(cat => {
                    const isSelected = manualCategoryFilter === cat
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                        onPress={() => setManualCategoryFilter(cat)}
                      >
                        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>

                {/* Scrollable Menu Items */}
                <View style={styles.menuScrollWrapper}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 10 }}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredManualMenu.length === 0 ? (
                      <Text style={styles.emptySearchText}>No food items found matching &quot;{manualSearchQuery}&quot;</Text>
                    ) : (
                      filteredManualMenu.map(menuItem => {
                        const countInCart = manualSelectedItems[menuItem.id] || 0
                        return (
                          <View key={menuItem.id} style={styles.menuCard}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Text style={styles.menuCardTitle}>{menuItem.name}</Text>
                                <Text style={styles.menuCardCategoryTag}>{menuItem.category || 'Food'}</Text>
                              </View>
                              {!!menuItem.description && (
                                <Text style={styles.menuCardDesc} numberOfLines={2}>{menuItem.description}</Text>
                              )}
                              <Text style={styles.menuCardPrice}>₱{menuItem.price.toLocaleString()}</Text>
                            </View>

                            <TouchableOpacity
                              style={[styles.addToOrderBtn, countInCart > 0 && styles.addToOrderBtnActive]}
                              onPress={() => {
                                setManualSelectedItems(prev => ({
                                  ...prev,
                                  [menuItem.id]: (prev[menuItem.id] || 0) + 1,
                                }))
                              }}
                            >
                              <Text style={[styles.addToOrderBtnText, countInCart > 0 && styles.addToOrderBtnTextActive]}>
                                {countInCart > 0 ? `+ Add (${countInCart})` : '+ Add'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* SECTION 4: SPECIAL INSTRUCTIONS */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeading}>📝 Special Instructions / Cooking Notes</Text>
                <TextInput
                  value={manualNotes}
                  onChangeText={setManualNotes}
                  placeholder="e.g. Extra napkins, no onions, dressing on the side..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.textInput}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* Total Price & Footer Action Buttons */}
            <View style={styles.modalFooter}>
              <View style={{ gap: 4, marginBottom: 6 }}>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalRowLabel, { fontSize: 13, color: 'rgba(255,255,255,0.6)' }]}>Items Subtotal:</Text>
                  <Text style={[styles.totalRowValue, { fontSize: 14, color: '#fff' }]}>
                    ₱{manualSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {hotelServiceChargeEnabled && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalRowLabel, { fontSize: 13, color: '#fbbf24' }]}>
                      Service Charge ({hotelServiceChargePct}%):
                    </Text>
                    <Text style={[styles.totalRowValue, { fontSize: 14, color: '#fbbf24' }]}>
                      +₱{manualScAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}

                <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 2 }]}>
                  <Text style={styles.totalRowLabel}>Grand Total:</Text>
                  <Text style={styles.totalRowValue}>
                    ₱{manualGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setIsManualOrderOpen(false)}
                >
                  <Text style={styles.actionBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { backgroundColor: '#10b981' },
                    (submittingManualOrder || manualChosenItemsList.length === 0 || !manualRoomNumber.trim()) && styles.btnDisabled,
                  ]}
                  disabled={submittingManualOrder || manualChosenItemsList.length === 0 || !manualRoomNumber.trim()}
                  onPress={handleCreateManualOrder}
                >
                  <Text style={styles.actionBtnText}>
                    {submittingManualOrder ? 'Creating Order…' : '✓ Place Order'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 1: EDIT DINING ORDER MODAL ─────────────────────────────────────── */}
      <Modal visible={!!editingOrder} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardLarge}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.modalTitle}>✏️ Edit Dining Order</Text>
                  <View style={styles.roomPill}>
                    <Text style={styles.roomPillText}>Room {editingOrder?.rooms?.room_number ?? '—'}</Text>
                  </View>
                </View>
                <Text style={styles.modalSubtitle}>
                  Modify quantities, replace out-of-stock items, or add new dishes
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingOrder(null)}
                style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Added Toast Notification */}
            {!!addedItemToast && (
              <View style={styles.toastBanner}>
                <Text style={styles.toastText}>✅ {addedItemToast}</Text>
              </View>
            )}

            <ScrollView
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* SECTION 1: CURRENT ORDER ITEMS */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>🛒 Current Order ({editItems.length} items)</Text>
                  <Text style={styles.sectionSubtotal}>
                    Items: ₱{calculateEditSubtotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {editItems.length === 0 ? (
                  <View style={styles.emptyOrderBox}>
                    <Text style={styles.emptyOrderItemsText}>
                      Cart is empty. Select dishes from the restaurant menu below.
                    </Text>
                  </View>
                ) : (
                  editItems.map((item, idx) => (
                    <View key={idx} style={styles.editRow}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.editItemName}>{item.name}</Text>
                        <Text style={styles.editItemSubtotal}>
                          ₱{item.unit_price.toLocaleString()} × {item.quantity} = <Text style={{ color: '#4ade80', fontWeight: '700' }}>₱{(item.unit_price * item.quantity).toLocaleString()}</Text>
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
                  ))
                )}
              </View>

              {/* SECTION 2: F&B RESTAURANT MENU PICKER */}
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>🍽️ Restaurant Menu ({filteredFullMenu.length} items)</Text>
                </View>

                {/* Search Bar */}
                <TextInput
                  value={menuSearchQuery}
                  onChangeText={setMenuSearchQuery}
                  placeholder="🔍 Search dishes, drinks, desserts..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={styles.searchBarInput}
                />

                {/* Category Filter Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                  {menuCategories.map(cat => {
                    const isSelected = selectedCategoryFilter === cat
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                        onPress={() => setSelectedCategoryFilter(cat)}>
                        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>

                {/* Full Menu Item Scrollable Container */}
                <View style={styles.menuScrollWrapper}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 10 }}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {filteredFullMenu.length === 0 ? (
                      <Text style={styles.emptySearchText}>No food items found matching &quot;{menuSearchQuery}&quot;</Text>
                    ) : (
                      filteredFullMenu.map(menuItem => {
                        const countInCart = editItems.find(i => i.name.toLowerCase() === menuItem.name.toLowerCase())?.quantity || 0

                        return (
                          <View key={menuItem.id} style={styles.menuCard}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Text style={styles.menuCardTitle}>{menuItem.name}</Text>
                                <Text style={styles.menuCardCategoryTag}>{menuItem.category || 'Food'}</Text>
                              </View>

                              {!!menuItem.description && (
                                <Text style={styles.menuCardDesc} numberOfLines={2}>{menuItem.description}</Text>
                              )}

                              <Text style={styles.menuCardPrice}>₱{menuItem.price.toLocaleString()}</Text>
                            </View>

                            <TouchableOpacity
                              style={[styles.addToOrderBtn, countInCart > 0 && styles.addToOrderBtnActive]}
                              onPress={() => addItemToOrder(menuItem)}>
                              <Text style={[styles.addToOrderBtnText, countInCart > 0 && styles.addToOrderBtnTextActive]}>
                                {countInCart > 0 ? `+ Add (${countInCart})` : '+ Add'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )
                      })
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* SECTION 3: SPECIAL NOTES / GUEST PREFERENCES */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeading}>📝 Special Notes / Guest Preferences</Text>
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Record guest preferences, dietary notes, or agreed substitutions…"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.textInput}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* Total Price & Footer Action Buttons */}
            <View style={styles.modalFooter}>
              {/* Breakdown */}
              <View style={{ gap: 4, marginBottom: 4 }}>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalRowLabel, { fontSize: 13, color: 'rgba(255,255,255,0.6)' }]}>Items Subtotal:</Text>
                  <Text style={[styles.totalRowValue, { fontSize: 14, color: '#fff' }]}>
                    ₱{calculateEditSubtotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {getOrderServiceChargeConfig().isEnabled && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalRowLabel, { fontSize: 13, color: '#fbbf24' }]}>
                      Service Charge ({getOrderServiceChargeConfig().pct}%):
                    </Text>
                    <Text style={[styles.totalRowValue, { fontSize: 14, color: '#fbbf24' }]}>
                      +₱{calculateEditServiceCharge(calculateEditSubtotal()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}

                <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 2 }]}>
                  <Text style={styles.totalRowLabel}>New Order Total:</Text>
                  <Text style={styles.totalRowValue}>
                    ₱{calculateEditTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setEditingOrder(null)}>
                  <Text style={styles.actionBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#22c55e', flex: 2 }]}
                  disabled={updating === editingOrder?.id}
                  onPress={saveModifiedOrder}>
                  <Text style={styles.actionBtnText}>
                    {updating === editingOrder?.id ? 'Saving…' : '✓ Accept & Save Modified Order'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 2: REJECTION / CANCELLATION REASON MODAL ───────────────────────── */}
      <Modal visible={!!cancellingOrder} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Decline Order</Text>
            <Text style={styles.modalSubtitle}>
              Room {cancellingOrder?.rooms?.room_number ?? '—'} · Select cancellation reason:
            </Text>

            <View style={{ marginVertical: 14 }}>
              {REJECTION_REASONS.map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonOption,
                    selectedReason === reason && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setSelectedReason(reason)}>
                  <Text style={[
                    styles.reasonText,
                    selectedReason === reason && styles.reasonTextSelected,
                  ]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}

              {selectedReason === 'Other / Custom reason' && (
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Specify cancellation reason…"
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
  headingRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heading:          { color: '#f97316', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  createOrderHeaderBtn: { backgroundColor: 'rgba(249,115,22,0.18)', borderWidth: 1, borderColor: '#f97316', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  createOrderHeaderBtnText: { color: '#f97316', fontWeight: '800', fontSize: 12 },
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
  callGuestBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
  callGuestBtnDisabledText: { color: 'rgba(255,255,255,0.3)', fontWeight: '600', fontSize: 12 },
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

  // Form Field Styles
  fieldLabel:       { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  inputField:       { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 13 },
  quickRoomChip:    { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  quickRoomChipSelected: { backgroundColor: 'rgba(249,115,22,0.25)', borderColor: '#f97316' },
  quickRoomChipText:{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  quickRoomChipTextSelected: { color: '#f97316', fontWeight: '800' },
  toggleBtn:        { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  toggleBtnActive:  { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: '#f97316' },
  toggleBtnText:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  toggleBtnTextActive: { color: '#f97316', fontWeight: '800' },

  // Modal Styles
  modalBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  modalCard:        { width: '100%', maxWidth: 480, backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: 20 },
  modalCardLarge:   { width: '96%', maxWidth: 660, height: '90%', maxHeight: '90%', backgroundColor: '#0f172a', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 24, flexDirection: 'column' },
  modalHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  modalTitle:       { color: '#fff', fontSize: 18, fontWeight: '800' },
  roomPill:         { backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roomPillText:     { color: '#f97316', fontSize: 11, fontWeight: '800' },
  modalSubtitle:    { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3 },
  closeBtn:         { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:     { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  toastBanner:      { backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)', borderRadius: 10, padding: 8, marginBottom: 10, alignItems: 'center' },
  toastText:        { color: '#4ade80', fontWeight: '800', fontSize: 13 },

  sectionContainer: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 12, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionHeading:   { color: '#f97316', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSubtotal:  { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' },
  emptyOrderBox:    { paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10 },
  emptyOrderItemsText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontStyle: 'italic' },

  editRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  editItemName:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  editItemSubtotal: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  qtyContainer:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8 },
  qtyBtn:           { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  qtyText:          { color: '#fff', fontSize: 14, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  removeBtn:        { padding: 6 },
  removeBtnText:    { fontSize: 15 },

  searchBarInput:   { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 13, marginBottom: 4 },
  categoryChip:     { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  categoryChipSelected: { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: '#f97316' },
  categoryChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  categoryChipTextSelected: { color: '#f97316', fontWeight: '800' },

  menuScrollWrapper:{ height: 280, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  emptySearchText:  { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginVertical: 24 },
  menuCard:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 9, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  menuCardTitle:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  menuCardCategoryTag: { color: '#f97316', backgroundColor: 'rgba(249,115,22,0.15)', fontSize: 9, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
  menuCardDesc:     { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginVertical: 2 },
  menuCardPrice:    { color: '#4ade80', fontWeight: '800', fontSize: 12, marginTop: 1 },
  addToOrderBtn:    { backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addToOrderBtnActive: { backgroundColor: 'rgba(34,197,94,0.2)', borderColor: '#22c55e' },
  addToOrderBtnText:{ color: '#f97316', fontWeight: '800', fontSize: 11 },
  addToOrderBtnTextActive: { color: '#4ade80' },

  textInput:        { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, textAlignVertical: 'top' },
  modalFooter:      { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 4 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalRowLabel:    { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13 },
  totalRowValue:    { color: '#f97316', fontWeight: '800', fontSize: 19 },

  reasonOption:     { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 6 },
  reasonOptionSelected: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  reasonText:       { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  reasonTextSelected: { color: '#f87171', fontWeight: '800' },
})
