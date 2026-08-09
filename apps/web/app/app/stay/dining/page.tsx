'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, CartItem, DietaryTag } from '@hotel-qr/supabase/types'

const CART_KEY = 'hotel_qr_cart'

const TAG_COLORS: Record<string, string> = {
  VEGETARIAN: '#22c55e',
  VEGAN:       '#16a34a',
  GLUTEN_FREE: '#eab308',
  HALAL:       '#3b82f6',
  NUT_FREE:    '#f97316',
  DAIRY_FREE:  '#a855f7',
}

const TAG_ICONS: Record<string, string> = {
  VEGETARIAN: '🌿',
  VEGAN:       '🌱',
  GLUTEN_FREE: '🌾',
  HALAL:       '☪️',
  NUT_FREE:    '🥜',
  DAIRY_FREE:  '🥛',
}

// ── Cart helpers ──────────────────────────────────────────────

function loadCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')
  } catch { return [] }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart))
}

export default function GuestDiningPage() {
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const roomId        = searchParams.get('room') ?? ''
  const hash          = searchParams.get('hash') ?? ''

  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const [items, setItems]           = useState<CatalogItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [cart, setCart]             = useState<CartItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [addedId, setAddedId]       = useState<string | null>(null)

  const catBarRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Load menu items
  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('catalog_items')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('department', 'F_AND_B')
      .eq('is_available', true)
      .order('category')
      .order('sort_order')
    setItems((data ?? []) as CatalogItem[])
    setLoading(false)
  }, [supabase, HOTEL_ID])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Load cart from localStorage
  useEffect(() => {
    setCart(loadCart())
  }, [])

  // Subscribe to 86 toggles
  useEffect(() => {
    const ch = supabase
      .channel('guest-dining-catalog')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'catalog_items' }, fetchItems)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, fetchItems])

  // Grouped by category
  const grouped = items.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category ?? 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})
  const categories = Object.keys(grouped)

  // Set first active category
  useEffect(() => {
    if (categories.length && !activeCategory) setActiveCategory(categories[0])
  }, [categories, activeCategory])

  // Scroll spy — update active category on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.getAttribute('data-category') ?? '')
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' }
    )
    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [items])

  const scrollToCategory = (cat: string) => {
    sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Cart operations
  const addToCart = (item: CatalogItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      const updated = existing
        ? prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
        : [...prev, { item, quantity: 1 }]
      saveCart(updated)
      return updated
    })
    setAddedId(item.id)
    setTimeout(() => setAddedId(null), 800)
  }

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const updated = prev
        .map(c => c.item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c)
        .filter(c => c.quantity > 0)
      saveCart(updated)
      return updated
    })
  }

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.quantity, 0)

  const getQty = (itemId: string) => cart.find(c => c.item.id === itemId)?.quantity ?? 0

  const goToCheckout = () => {
    router.push(`/app/stay/dining/checkout?room=${roomId}&hash=${hash}`)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>Loading menu…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a0f 0%, #0f0e1a 100%)', fontFamily: 'system-ui, sans-serif', paddingBottom: cartCount > 0 ? 100 : 24 }}>

      {/* Header */}
      <div style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '20px 20px 0', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => router.push(`/app/stay?room=${roomId}&hash=${hash}`)} style={{ background: 'none', border: 'none', color: 'rgba(255,149,0,0.8)', fontSize: 14, cursor: 'pointer', padding: '0 0 12px', fontWeight: 600 }}>
          ← Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.5px' }}>🍽️ Dining</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', margin: '0 0 16px', fontSize: 13 }}>Room Service &amp; Dine-In Pre-Order</p>

        {/* Sticky Category Bar */}
        <div
          ref={catBarRef}
          id="category-bar"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {categories.map(cat => (
            <button
              key={cat}
              id={`cat-btn-${cat}`}
              onClick={() => scrollToCategory(cat)}
              style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 20, border: `1px solid ${activeCategory === cat ? '#f97316' : 'rgba(255,255,255,0.15)'}`, background: activeCategory === cat ? 'rgba(249,115,22,0.15)' : 'transparent', color: activeCategory === cat ? '#f97316' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: activeCategory === cat ? 700 : 500, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Sections */}
      <div style={{ padding: '0 20px' }}>
        {categories.map(cat => (
          <div
            key={cat}
            data-category={cat}
            ref={el => { sectionRefs.current[cat] = el }}
            style={{ paddingTop: 28 }}>
            <h2 style={{ color: '#f97316', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>
              {cat}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {grouped[cat].map(item => {
                const qty    = getQty(item.id)
                const justAdded = addedId === item.id
                return (
                  <div
                    key={item.id}
                    id={`item-${item.id}`}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, display: 'flex', gap: 14, transition: 'transform 0.15s', transform: justAdded ? 'scale(0.99)' : 'scale(1)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: 16, marginBottom: 4 }}>{item.name}</div>
                      {item.description && <p style={{ color: 'rgba(255,255,255,0.45)', margin: '0 0 8px', fontSize: 13, lineHeight: 1.45 }}>{item.description}</p>}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                        {(item.dietary_tags ?? []).map(tag => (
                          <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${TAG_COLORS[tag as DietaryTag]}22`, color: TAG_COLORS[tag as DietaryTag], fontWeight: 600 }}>
                            {TAG_ICONS[tag as DietaryTag]} {tag.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontWeight: 800, color: '#f97316', fontSize: 18 }}>₱{item.price.toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 48 }}>
                      {qty === 0 ? (
                        <button
                          id={`add-${item.id}`}
                          onClick={() => addToCart(item)}
                          style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #f97316', background: justAdded ? '#f97316' : 'rgba(249,115,22,0.12)', color: '#f97316', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontWeight: 300 }}>
                          +
                        </button>
                      ) : (
                        <>
                          <button id={`dec-${item.id}`} onClick={() => removeFromCart(item.id)} style={qtyBtnStyle}>−</button>
                          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, minWidth: 24, textAlign: 'center' }}>{qty}</span>
                          <button id={`inc-${item.id}`} onClick={() => addToCart(item)} style={qtyBtnStyle}>+</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Cart Bar */}
      {cartCount > 0 && (
        <div
          id="floating-cart-bar"
          style={{ position: 'fixed', bottom: 20, left: 16, right: 16, zIndex: 200 }}>
          <button
            id="btn-go-to-checkout"
            onClick={goToCheckout}
            style={{ width: '100%', background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: '0 8px 32px rgba(249,115,22,0.4)' }}>
            <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '3px 10px', color: '#fff', fontWeight: 800, fontSize: 14 }}>
              {cartCount} item{cartCount !== 1 ? 's' : ''}
            </div>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>View Cart &amp; Checkout →</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>₱{cartTotal.toLocaleString()}</span>
          </button>
        </div>
      )}
    </div>
  )
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(249,115,22,0.5)', background: 'rgba(249,115,22,0.1)', color: '#f97316', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300,
}
