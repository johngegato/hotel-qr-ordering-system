'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { CartItem, FulfillmentType, DeliveryPreference, ArrivalTime, FoodOrderPayload } from '@hotel-qr/supabase/types'
import PhoneCaptureModal, { getStoredGuestPhone } from '../../components/PhoneCaptureModal'

const CART_KEY = 'hotel_qr_cart'

function loadCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') } catch { return [] }
}
function clearCart() { localStorage.removeItem(CART_KEY) }

const ARRIVAL_OPTIONS: { value: ArrivalTime; label: string }[] = [
  { value: 'IN_15_MINS', label: 'In 15 minutes' },
  { value: 'IN_30_MINS', label: 'In 30 minutes' },
  { value: 'IN_60_MINS', label: 'In 60 minutes' },
]

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const roomId       = searchParams.get('room') ?? ''
  const hash         = searchParams.get('hash') ?? ''

  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const [cart, setCart]                 = useState<CartItem[]>([])
  const [orderType, setOrderType]       = useState<FulfillmentType>('ROOM_SERVICE')
  const [delivery, setDelivery]         = useState<DeliveryPreference>('HAND_TO_ME')
  const [arrival, setArrival]           = useState<ArrivalTime>('IN_30_MINS')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [requestId, setRequestId]       = useState<string | null>(null)
  const [orderStatus, setOrderStatus]   = useState<string | null>(null)
  const [showPhoneModal, setShowPhoneModal] = useState(false)

  // ── Service Charge ──────────────────────────────────────────
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(true)
  const [serviceChargePct, setServiceChargePct]         = useState(10)

  useEffect(() => { setCart(loadCart()) }, [])

  // Fetch hotel service charge settings
  useEffect(() => {
    ;(supabase as any)
      .from('hotels')
      .select('service_charge_enabled, service_charge_pct')
      .eq('id', HOTEL_ID)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setServiceChargeEnabled(data.service_charge_enabled ?? true)
          setServiceChargePct(Number(data.service_charge_pct ?? 10))
        }
      })
  }, [])

  // Real-time listener for order status updates
  const subscribeToOrder = useCallback((id: string) => {
    const ch = supabase
      .channel(`food-order-${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${id}` },
        (payload) => {
          const status = (payload.new as { status: string }).status
          setOrderStatus(status)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase])

  useEffect(() => {
    if (requestId) return subscribeToOrder(requestId)
  }, [requestId, subscribeToOrder])

  const addItem = (itemId: string) => {
    setCart(prev => {
      const updated = prev.map(c => c.item.id === itemId ? { ...c, quantity: c.quantity + 1 } : c)
      localStorage.setItem(CART_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const removeItem = (itemId: string) => {
    setCart(prev => {
      const updated = prev.map(c => c.item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c).filter(c => c.quantity > 0)
      localStorage.setItem(CART_KEY, JSON.stringify(updated))
      return updated
    })
  }

  // ── Totals ────────────────────────────────────────────────────
  const subtotal           = cart.reduce((s, c) => s + c.item.price * c.quantity, 0)
  const serviceChargeAmt   = serviceChargeEnabled ? Math.round(subtotal * (serviceChargePct / 100) * 100) / 100 : 0
  const grandTotal         = subtotal + serviceChargeAmt

  const executeSubmit = async (phoneOverride?: string) => {
    if (cart.length === 0) return
    setSubmitting(true)

    const phone = phoneOverride || getStoredGuestPhone()

    let roomNumber = ''
    if (roomId) {
      const { data: rm } = await (supabase.from('rooms') as any)
        .select('room_number')
        .eq('id', roomId)
        .maybeSingle()
      if (rm?.room_number) roomNumber = String(rm.room_number)
    }

    const payload: FoodOrderPayload & {
      room_number?: string
      guest_phone?: string
      booked_by?: string
      subtotal?: number
      service_charge_pct?: number
      service_charge_amount?: number
    } = {
      order_type: orderType,
      items: cart.map(c => ({ id: c.item.id, name: c.item.name, quantity: c.quantity, unit_price: c.item.price })),
      special_instructions: instructions + (phone ? ` [Guest Phone: ${phone}]` : ''),
      total_price: grandTotal,
      subtotal: subtotal,
      service_charge_pct: serviceChargeEnabled ? serviceChargePct : 0,
      service_charge_amount: serviceChargeAmt,
      room_number: roomNumber || undefined,
      guest_phone: phone || undefined,
      booked_by: roomNumber ? `Guest (Room ${roomNumber})` : 'Guest',
      ...(orderType === 'ROOM_SERVICE' && { delivery_preference: delivery }),
      ...(orderType === 'DINE_IN'      && { target_arrival_time: arrival }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('requests').insert({
      hotel_id:     HOTEL_ID,
      room_id:      roomId,
      request_type: 'FOOD_ORDER',
      status:       'PENDING',
      payload:      payload,
    }).select('id').single()

    setSubmitting(false)

    if (!error && data) {
      setRequestId(data.id)
      setOrderStatus('PENDING')
      clearCart()
      setCart([])

      // ── Fire Web Push to all active staff PWA devices ──
      try {
        const orderLabel = orderType === 'DINE_IN' ? 'Dine-In Order' : 'Room Service Order'
        const itemSummary = payload.items?.map((i: any) => `${i.quantity}× ${i.name}`).join(', ')
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelId: HOTEL_ID,
            title: `🍽️ New ${orderLabel}${roomNumber ? ` — Room ${roomNumber}` : ''}`,
            body: itemSummary || 'A new food order has been submitted.',
            requestId: data.id,
            roomNumber,
            requestType: 'FOOD_ORDER',
            url: '/',
          }),
        })
      } catch {
        // Push dispatch is non-blocking — never fail the order on push error
      }
    }
  }

  const handleSubmit = () => {
    const phone = getStoredGuestPhone()
    if (!phone) {
      setShowPhoneModal(true)
    } else {
      executeSubmit(phone)
    }
  }

  const statusConfig: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    PENDING:    { icon: '⏳', label: 'Order received — kitchen is reviewing',  color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
    PREPARING:  { icon: '👨‍🍳', label: 'Kitchen is preparing your order!',     color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
    RESOLVED:   {
      icon: orderType === 'DINE_IN' ? '🍽️' : '🛎️',
      label: orderType === 'DINE_IN' ? 'Table is ready — please head down!' : 'Order is on its way!',
      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',
    },
  }

  // Post-order status tracker view
  if (orderStatus) {
    const cfg = statusConfig[orderStatus] ?? { icon: '📋', label: orderStatus, color: '#fff', bg: 'rgba(255,255,255,0.05)' }
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a0f, #0f0e1a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 72, marginBottom: 24 }}>{cfg.icon}</div>
          <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}44`, borderRadius: 20, padding: 28, marginBottom: 24 }}>
            <p style={{ color: cfg.color, fontWeight: 800, fontSize: 20, margin: 0, lineHeight: 1.4 }}>{cfg.label}</p>
          </div>
          {orderStatus === 'RESOLVED' && (
            <button
              id="btn-order-done"
              onClick={() => router.push(`/app/stay?room=${roomId}&hash=${hash}`)}
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 32px', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              Back to Home
            </button>
          )}
          {orderStatus !== 'RESOLVED' && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>This page updates automatically — no need to refresh</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a0f, #0f0e1a)', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <button onClick={() => router.push(`/app/stay/dining?room=${roomId}&hash=${hash}`)} style={{ background: 'none', border: 'none', color: 'rgba(255,149,0,0.8)', fontSize: 14, cursor: 'pointer', padding: '8px 0 20px', fontWeight: 600 }}>
          ← Back to Menu
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.5px' }}>🛒 Your Order</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', margin: '0 0 24px', fontSize: 14 }}>Review and confirm your order</p>

        {/* Empty cart */}
        {cart.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.3)' }}>
            Your cart is empty.{' '}
            <span style={{ color: '#f97316', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => router.push(`/app/stay/dining?room=${roomId}&hash=${hash}`)}>
              Browse menu →
            </span>
          </div>
        )}

        {/* Cart Items */}
        {cart.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {cart.map(c => (
                <div key={c.item.id} id={`checkout-item-${c.item.id}`} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{c.item.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>₱{c.item.price.toLocaleString()} ea.</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button id={`dec-checkout-${c.item.id}`} onClick={() => removeItem(c.item.id)} style={smallBtnStyle}>−</button>
                    <span style={{ color: '#fff', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{c.quantity}</span>
                    <button id={`inc-checkout-${c.item.id}`} onClick={() => addItem(c.item.id)} style={smallBtnStyle}>+</button>
                  </div>
                  <div style={{ color: '#f97316', fontWeight: 800, fontSize: 16, minWidth: 52, textAlign: 'right' }}>
                    ₱{(c.item.price * c.quantity).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Price Breakdown */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '16px 18px',
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* Subtotal row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600 }}>Subtotal</span>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>₱{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* Service Charge row */}
              {serviceChargeEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600 }}>
                    Service Charge ({serviceChargePct}%)
                  </span>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14 }}>
                    +₱{serviceChargeAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Divider */}
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', margin: '2px 0' }} />

              {/* Grand Total row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Total</span>
                <span style={{ color: '#f97316', fontWeight: 900, fontSize: 20 }}>₱{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* Service charge footnote */}
              {serviceChargeEnabled && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 2,
                  background: 'rgba(251,191,36,0.07)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  borderRadius: 10,
                  padding: '7px 12px',
                }}>
                  <span style={{ fontSize: 13 }}>ℹ️</span>
                  <span style={{ color: 'rgba(251,191,36,0.85)', fontSize: 12, fontWeight: 600 }}>
                    A {serviceChargePct}% service charge is applied to all dining orders.
                  </span>
                </div>
              )}
            </div>

            {/* Fulfillment Toggle */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Fulfillment Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['ROOM_SERVICE', 'DINE_IN'] as FulfillmentType[]).map(type => (
                  <button
                    key={type}
                    id={`fulfillment-${type}`}
                    onClick={() => setOrderType(type)}
                    style={{ padding: '14px', borderRadius: 12, border: `2px solid ${orderType === type ? '#f97316' : 'rgba(255,255,255,0.1)'}`, background: orderType === type ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)', color: orderType === type ? '#f97316' : 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer', fontSize: 14, transition: 'all 0.2s' }}>
                    {type === 'ROOM_SERVICE' ? '🛎️ Room Service' : '🍽️ Dine-In Pre-Order'}
                  </button>
                ))}
              </div>
            </div>

            {/* Room Service Options */}
            {orderType === 'ROOM_SERVICE' && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <label style={labelStyle}>Delivery Preference</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([['HAND_TO_ME', '🤝 Hand to Me'], ['LEAVE_AT_DOOR', '🚪 Leave at Door']] as [DeliveryPreference, string][]).map(([val, lbl]) => (
                    <button key={val} id={`delivery-${val}`} onClick={() => setDelivery(val)}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${delivery === val ? '#f97316' : 'rgba(255,255,255,0.12)'}`, background: delivery === val ? 'rgba(249,115,22,0.1)' : 'transparent', color: delivery === val ? '#f97316' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dine-In Arrival Options */}
            {orderType === 'DINE_IN' && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <label style={labelStyle}>Estimated Arrival Time</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ARRIVAL_OPTIONS.map(opt => (
                    <button key={opt.value} id={`arrival-${opt.value}`} onClick={() => setArrival(opt.value)}
                      style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${arrival === opt.value ? '#f97316' : 'rgba(255,255,255,0.12)'}`, background: arrival === opt.value ? 'rgba(249,115,22,0.1)' : 'transparent', color: arrival === opt.value ? '#f97316' : 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: arrival === opt.value ? 700 : 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Special Instructions */}
            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>Special Instructions</label>
              <textarea
                id="input-special-instructions"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                rows={3}
                placeholder="Allergies, preferences, or special requests…"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {/* Submit */}
            <button
              id="btn-submit-order"
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0}
              style={{ width: '100%', background: submitting ? 'rgba(249,115,22,0.5)' : 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 16, padding: '18px', fontWeight: 800, fontSize: 18, cursor: submitting ? 'not-allowed' : 'pointer', letterSpacing: '-0.3px', boxShadow: '0 8px 32px rgba(249,115,22,0.35)', transition: 'all 0.3s' }}>
              {submitting ? '⏳ Placing order…' : `Place Order · ₱${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </button>
          </>
        )}

        <PhoneCaptureModal
          isOpen={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          onSuccess={(phone) => {
            setShowPhoneModal(false)
            executeSubmit(phone)
          }}
          roomId={roomId}
          hotelId={HOTEL_ID}
        />
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
}
const smallBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.08)', color: '#f97316', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading Checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  )
}
