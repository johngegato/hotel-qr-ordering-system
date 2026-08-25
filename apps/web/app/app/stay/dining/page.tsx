'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, CartItem, DietaryTag, MenuCategory } from '@hotel-qr/supabase/types'
import FrontDeskFAB from '../components/FrontDeskFAB'

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

const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  Breakfast: '🍳',
  Starters:  '🥗',
  Mains:     '🥩',
  Desserts:  '🍰',
  Drinks:    '🍹',
  Beverages: '🥤',
  Other:     '🍽️',
}

// ── Cart helpers ──────────────────────────────────────────────
function loadCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart))
}

function GuestDiningContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const roomId       = searchParams.get('room') ?? ''
  const hash         = searchParams.get('hash') ?? ''

  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const [items, setItems]                       = useState<CatalogItem[]>([])
  const [categories, setCategories]             = useState<MenuCategory[]>([])
  const [loading, setLoading]                   = useState(true)
  const [cart, setCart]                         = useState<CartItem[]>([])
  const [activeCategory, setActiveCategory]     = useState<string>('')
  const [addedId, setAddedId]                   = useState<string | null>(null)
  const [searchQuery, setSearchQuery]           = useState('')
  const [selectedTag, setSelectedTag]           = useState<DietaryTag | 'ALL'>('ALL')
  const [selectedDetailItem, setSelectedDetailItem] = useState<CatalogItem | null>(null)
  const [roomNumber, setRoomNumber]             = useState<string>('')

  // ── Service Charge (read from hotel settings) ─────────────────
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(true)
  const [serviceChargePct, setServiceChargePct]         = useState(10)

  const catBarRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Fetch Room Info
  useEffect(() => {
    if (!roomId) return
    ;(supabase.from('rooms') as any)
      .select('room_number')
      .eq('id', roomId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.room_number) setRoomNumber(String(data.room_number))
      })
  }, [roomId])

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

  // Fetch Categories & Items
  const fetchMenuData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)

    // 1. Fetch Categories
    let loadedCats: MenuCategory[] = []
    try {
      const { data: catData } = await (supabase as any)
        .from('menu_categories')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (catData && catData.length > 0) {
        loadedCats = catData as MenuCategory[]
      }
    } catch (e) {
      console.warn('[GuestDining] menu_categories table fetch fallback:', e)
    }

    // 2. Fetch Menu Items (exclusively from catalog_items where department = 'F_AND_B')
    let catalog: CatalogItem[] = []
    const { data: catItemsData } = await (supabase as any)
      .from('catalog_items')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('department', 'F_AND_B')
      .eq('is_available', true)
      .order('category')
      .order('sort_order')

    if (catItemsData && catItemsData.length > 0) {
      catalog = catItemsData as CatalogItem[]
    }

    setItems(catalog)

    // If no explicit categories in table, derive from items
    if (loadedCats.length === 0) {
      const uniqueCatNames = Array.from(new Set(catalog.map(i => i.category || 'Mains')))
      loadedCats = uniqueCatNames.map((name, idx) => ({
        id: `derived-cat-${idx}`,
        hotel_id: HOTEL_ID,
        name,
        icon: DEFAULT_CATEGORY_ICONS[name] || '🍽️',
        sort_order: idx + 1,
        is_active: true,
        created_at: new Date().toISOString(),
      }))
    }
    setCategories(loadedCats)

    if (loadedCats.length > 0) {
      setActiveCategory(prev => prev || loadedCats[0].name)
    }

    setLoading(false)
  }, [HOTEL_ID])

  useEffect(() => {
    fetchMenuData(true)
  }, [fetchMenuData])

  // Load cart from localStorage
  useEffect(() => {
    setCart(loadCart())
  }, [])

  // Realtime subscription for 86'd status updates
  useEffect(() => {
    const ch = supabase
      .channel('guest-dining-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items', filter: `department=eq.F_AND_B` }, () => fetchMenuData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, () => fetchMenuData(false))
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [fetchMenuData])

  // Scroll spy to update active category
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cat = entry.target.getAttribute('data-category')
            if (cat) {
              setActiveCategory(cat)
              // Auto-scroll the horizontal category pill into view
              const btn = document.getElementById(`cat-btn-${cat}`)
              if (btn && catBarRef.current) {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
              }
            }
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items, categories])

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat)
    const el = sectionRefs.current[cat]
    if (el) {
      const topOffset = 130
      const elementPosition = el.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - topOffset
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })
    }
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
    setTimeout(() => setAddedId(null), 600)
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

  // Filtered items based on search & dietary tags
  const filteredItems = items.filter(item => {
    const matchesSearch = searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesTag = selectedTag === 'ALL' || (item.dietary_tags || []).includes(selectedTag)
    return matchesSearch && matchesTag
  })

  // Group items by category (respecting category sort order)
  const groupedCategories = categories
    .map(cat => {
      const catItems = filteredItems.filter(i => (i.category || 'Mains').toLowerCase() === cat.name.toLowerCase())
      return { ...cat, items: catItems }
    })
    .filter(catGroup => catGroup.items.length > 0)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#090a10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 14 }}>
        <div style={{ fontSize: 44, animation: 'pulse 1.5s infinite' }}>🍳</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: 600 }}>Preparing Fresh Dining Menu…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #090a10 0%, #0d0f18 50%, #090a10 100%)', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#fff', paddingBottom: cartCount > 0 ? 110 : 36 }}>

      {/* ── Sticky Top Header & Category Navigation ───────────────────── */}
      <div style={{ background: 'rgba(9, 10, 16, 0.94)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 840, margin: '0 auto', padding: '16px 20px 0' }}>

          {/* Navigation & Room Info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={() => router.push(`/app/stay?room=${roomId}&hash=${hash}`)}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, cursor: 'pointer', padding: '8px 16px', borderRadius: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
            >
              ← Back to Concierge
            </button>

            {roomNumber ? (
              <div style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c', fontSize: 12, padding: '5px 14px', borderRadius: 20, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🚪 Room {roomNumber}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🍽️</span> In-Room Dining &amp; Bar
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', fontSize: 13 }}>
                Chef-crafted dishes delivered fresh to your room.
              </p>
            </div>
          </div>

          {/* Service Charge Notice */}
          {serviceChargeEnabled && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.22)',
              borderRadius: 12,
              padding: '8px 14px',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 14 }}>💳</span>
              <p style={{ color: 'rgba(251,191,36,0.9)', fontSize: 12, fontWeight: 600, margin: 0 }}>
                All dining items are subject to a <strong>{serviceChargePct}% service charge</strong>, applied at checkout.
              </p>
            </div>
          )}

          {/* Search Bar */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="text"
              placeholder="🔍 Search dishes, ingredients, drinks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                padding: '10px 14px 10px 38px',
                color: '#fff',
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Dietary Filter Chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSelectedTag('ALL')}
              style={{
                flexShrink: 0,
                padding: '5px 12px',
                borderRadius: 16,
                border: `1px solid ${selectedTag === 'ALL' ? '#f97316' : 'rgba(255,255,255,0.1)'}`,
                background: selectedTag === 'ALL' ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.03)',
                color: selectedTag === 'ALL' ? '#fed7aa' : 'rgba(255,255,255,0.5)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              All Items
            </button>
            {(['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'HALAL', 'NUT_FREE', 'DAIRY_FREE'] as DietaryTag[]).map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(prev => prev === tag ? 'ALL' : tag)}
                style={{
                  flexShrink: 0,
                  padding: '5px 12px',
                  borderRadius: 16,
                  border: `1px solid ${selectedTag === tag ? TAG_COLORS[tag] : 'rgba(255,255,255,0.1)'}`,
                  background: selectedTag === tag ? `${TAG_COLORS[tag]}25` : 'rgba(255,255,255,0.03)',
                  color: selectedTag === tag ? TAG_COLORS[tag] : 'rgba(255,255,255,0.5)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
              >
                {TAG_ICONS[tag]} {tag.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Sticky Category Bar */}
          <div
            ref={catBarRef}
            id="category-bar"
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 12,
              scrollbarWidth: 'none',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: 8,
            }}
          >
            {categories.map(cat => {
              const count = items.filter(i => (i.category || '').toLowerCase() === cat.name.toLowerCase()).length
              if (count === 0 && searchQuery === '') return null
              const isSelected = activeCategory.toLowerCase() === cat.name.toLowerCase()
              return (
                <button
                  key={cat.id || cat.name}
                  id={`cat-btn-${cat.name}`}
                  onClick={() => scrollToCategory(cat.name)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: `1px solid ${isSelected ? '#f97316' : 'rgba(255,255,255,0.12)'}`,
                    background: isSelected ? 'linear-gradient(135deg, rgba(249,115,22,0.3), rgba(234,88,12,0.2))' : 'rgba(255,255,255,0.03)',
                    color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: isSelected ? '0 4px 12px rgba(249,115,22,0.25)' : 'none',
                  }}
                >
                  <span>{cat.icon || DEFAULT_CATEGORY_ICONS[cat.name] || '🍽️'}</span>
                  <span>{cat.name}</span>
                </button>
              )
            })}
          </div>

        </div>
      </div>

      {/* ── Menu Items Section ────────────────────────────────────────── */}
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 20px' }}>

        {groupedCategories.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 20, padding: 48, textAlign: 'center', marginTop: 32 }}>
            <div style={{ fontSize: 38, marginBottom: 12 }}>🔍</div>
            <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 6px' }}>No dishes matching your criteria</h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', margin: 0, fontSize: 14 }}>
              Try searching for something else or clearing dietary filter chips.
            </p>
          </div>
        ) : (
          groupedCategories.map(catGroup => (
            <div
              key={catGroup.name}
              data-category={catGroup.name}
              ref={el => { sectionRefs.current[catGroup.name] = el }}
              style={{ paddingTop: 28 }}
            >
              {/* Category Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{catGroup.icon || DEFAULT_CATEGORY_ICONS[catGroup.name] || '🍽️'}</span>
                <h2 style={{ color: '#fb923c', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  {catGroup.name}
                </h2>
                <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>({catGroup.items.length})</span>
              </div>

              {/* Dishes Grid / List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {catGroup.items.map(item => {
                  const qty = getQty(item.id)
                  const justAdded = addedId === item.id

                  return (
                    <div
                      key={item.id}
                      id={`item-${item.id}`}
                      style={{
                        background: 'rgba(255, 255, 255, 0.035)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 18,
                        padding: 16,
                        display: 'flex',
                        gap: 16,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: justAdded ? 'scale(0.985)' : 'scale(1)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                      }}
                    >
                      {/* Dish Photo Thumbnail */}
                      <div
                        onClick={() => setSelectedDetailItem(item)}
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: 14,
                          overflow: 'hidden',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 36, opacity: 0.7 }}>
                            {catGroup.icon || '🍽️'}
                          </span>
                        )}
                        <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 4px', fontSize: 10, color: '#fff' }}>
                          🔍
                        </div>
                      </div>

                      {/* Dish Content */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div
                            onClick={() => setSelectedDetailItem(item)}
                            style={{ fontWeight: 800, color: '#ffffff', fontSize: 16, marginBottom: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <span>{item.name}</span>
                          </div>

                          {item.description && (
                            <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 8px', fontSize: 13, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {item.description}
                            </p>
                          )}

                          {/* Dietary Badges */}
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                            {(item.dietary_tags ?? []).map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 10,
                                  padding: '2px 7px',
                                  borderRadius: 8,
                                  background: `${TAG_COLORS[tag as DietaryTag]}22`,
                                  color: TAG_COLORS[tag as DietaryTag],
                                  fontWeight: 700,
                                }}
                              >
                                {TAG_ICONS[tag as DietaryTag]} {tag.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Price & Cart Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          <div style={{ fontWeight: 900, color: '#f97316', fontSize: 19 }}>
                            ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>

                          {qty === 0 ? (
                            <button
                              id={`add-${item.id}`}
                              onClick={() => addToCart(item)}
                              style={{
                                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 12,
                                padding: '8px 18px',
                                fontWeight: 800,
                                fontSize: 13,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span>+ Add</span>
                            </button>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '4px 6px', border: '1px solid rgba(249,115,22,0.3)' }}>
                              <button
                                id={`dec-${item.id}`}
                                onClick={() => removeFromCart(item.id)}
                                style={stepperBtnStyle}
                              >
                                −
                              </button>
                              <span style={{ fontWeight: 800, color: '#fff', fontSize: 14, minWidth: 20, textAlign: 'center' }}>
                                {qty}
                              </span>
                              <button
                                id={`inc-${item.id}`}
                                onClick={() => addToCart(item)}
                                style={{ ...stepperBtnStyle, background: '#f97316', color: '#fff' }}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

      </div>

      {/* ── Dish Photo & Details Zoom Modal ───────────────────────────── */}
      {selectedDetailItem && (
        <div style={modalOverlayStyle} onClick={() => setSelectedDetailItem(null)}>
          <div
            style={{ ...modalCardStyle, maxWidth: 500 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Dish Photo in Modal */}
            <div style={{ width: '100%', height: 240, borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', marginBottom: 18, position: 'relative' }}>
              {selectedDetailItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedDetailItem.image_url}
                  alt={selectedDetailItem.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>
                  🍽️
                </div>
              )}
              <button
                onClick={() => setSelectedDetailItem(null)}
                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <span style={{ color: '#f97316', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {selectedDetailItem.category || 'Mains'}
                </span>
                <h3 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '2px 0 0' }}>
                  {selectedDetailItem.name}
                </h3>
              </div>
              <div style={{ color: '#f97316', fontSize: 22, fontWeight: 900 }}>
                ₱{Number(selectedDetailItem.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {selectedDetailItem.description && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' }}>
                {selectedDetailItem.description}
              </p>
            )}

            {/* Dietary Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
              {(selectedDetailItem.dietary_tags ?? []).map(tag => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 10,
                    background: `${TAG_COLORS[tag as DietaryTag]}22`,
                    color: TAG_COLORS[tag as DietaryTag],
                    fontWeight: 700,
                  }}
                >
                  {TAG_ICONS[tag as DietaryTag]} {tag.replace('_', ' ')}
                </span>
              ))}
            </div>

            {/* Modal Bottom Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                In cart: <strong style={{ color: '#fff' }}>{getQty(selectedDetailItem.id)}</strong>
              </div>

              <button
                onClick={() => {
                  addToCart(selectedDetailItem)
                  setSelectedDetailItem(null)
                }}
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 28px',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
                }}
              >
                + Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Bottom Checkout Bar ───────────────────────────────── */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: 0, right: 0, zIndex: 99, display: 'flex', justifyContent: 'center', padding: '0 20px', pointerEvents: 'none' }}>
          <div
            onClick={goToCheckout}
            style={{
              width: '100%',
              maxWidth: 600,
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              borderRadius: 20,
              padding: '14px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 12px 36px rgba(234, 88, 12, 0.45), 0 0 0 1px rgba(255,255,255,0.2) inset',
              cursor: 'pointer',
              pointerEvents: 'auto',
              animation: 'bounceIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 12, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16 }}>
                {cartCount}
              </div>
              <div>
                <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 16 }}>View Food Order</div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {cartCount} item{cartCount > 1 ? 's' : ''} in cart
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 18 }}>
                  ₱{cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <span style={{ fontSize: 18, color: '#fff' }}>→</span>
              </div>
              {serviceChargeEnabled && (
                <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.75)', fontWeight: 600 }}>
                  +{serviceChargePct}% service charge at checkout
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Front Desk FAB */}
      <FrontDeskFAB roomId={roomId} roomNumber={roomId} />

    </div>
  )
}

export default function GuestDiningPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: '#090a10', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>Loading Dining…</div>
        </div>
      }
    >
      <GuestDiningContent />
    </Suspense>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────
const stepperBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(14px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 20,
}

const modalCardStyle: React.CSSProperties = {
  background: 'rgba(17, 20, 32, 0.98)',
  border: '1px solid rgba(249, 115, 22, 0.35)',
  borderRadius: 22,
  padding: 24,
  width: '100%',
  boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
}
