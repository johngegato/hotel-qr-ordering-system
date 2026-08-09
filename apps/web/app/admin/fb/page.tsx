'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, DietaryTag } from '@hotel-qr/supabase/types'

const DIETARY_OPTIONS: DietaryTag[] = ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'HALAL', 'NUT_FREE', 'DAIRY_FREE']

const DEFAULT_CATEGORIES = ['Breakfast', 'Starters', 'Mains', 'Desserts', 'Drinks', 'Other']

const TAG_COLORS: Record<string, string> = {
  VEGETARIAN: '#22c55e',
  VEGAN:       '#16a34a',
  GLUTEN_FREE: '#eab308',
  HALAL:       '#3b82f6',
  NUT_FREE:    '#f97316',
  DAIRY_FREE:  '#a855f7',
}

export default function AdminFBPage() {
  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const [items, setItems]             = useState<CatalogItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [saving, setSaving]           = useState(false)
  const [toastMsg, setToastMsg]       = useState<string | null>(null)

  // Custom categories list
  const [categories, setCategories]   = useState<string[]>(DEFAULT_CATEGORIES)
  const [newCatInput, setNewCatInput] = useState('')
  const [showCatManager, setShowCatManager] = useState(false)

  const [form, setForm] = useState({
    name: '', description: '', price: '', category: 'Mains',
    duration_mins: '', dietary_tags: [] as DietaryTag[], sort_order: '0',
  })

  const toast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const fetchItems = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('catalog_items')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('department', 'F_AND_B')
      .order('category')
      .order('sort_order')

    const catalog = (data ?? []) as CatalogItem[]
    setItems(catalog)

    // Extract unique categories dynamically
    const dynamicCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...catalog.map(i => i.category || 'Other')]))
    setCategories(dynamicCats)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Subscribe to realtime changes
  useEffect(() => {
    const ch = supabase
      .channel('admin-fnb-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items' }, fetchItems)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, fetchItems])

  const toggleAvailability = async (item: CatalogItem) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('catalog_items').update({ is_available: !item.is_available }).eq('id', item.id)
    toast(item.is_available ? `"${item.name}" marked 86'd` : `"${item.name}" back on menu`)
  }

  const handleStartEdit = (item: CatalogItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      category: item.category || 'Mains',
      duration_mins: item.duration_mins ? String(item.duration_mins) : '',
      dietary_tags: (item.dietary_tags || []) as DietaryTag[],
      sort_order: String(item.sort_order || 0),
    })
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingItem(null)
    setForm({ name: '', description: '', price: '', category: 'Mains', duration_mins: '', dietary_tags: [], sort_order: '0' })
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      hotel_id:      HOTEL_ID,
      department:    'F_AND_B',
      category:      form.category,
      name:          form.name,
      description:   form.description || null,
      price:         parseFloat(form.price),
      duration_mins: form.duration_mins ? parseInt(form.duration_mins) : null,
      dietary_tags:  form.dietary_tags,
      sort_order:    parseInt(form.sort_order) || 0,
      is_available:  true,
      requires_on_call: false,
      image_url:     null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (supabase as any).from('catalog_items')
    const { error } = editingItem
      ? await q.update(payload).eq('id', editingItem.id)
      : await q.insert(payload)

    setSaving(false)
    if (!error) {
      handleCancelForm()
      fetchItems()
      toast(editingItem ? 'Menu item updated' : 'Menu item added')
    }
  }

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('catalog_items').delete().eq('id', id)
    fetchItems()
    toast(`"${name}" deleted`)
  }

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatInput.trim()) return
    const cat = newCatInput.trim()
    if (!categories.includes(cat)) {
      setCategories(prev => [...prev, cat])
      setForm(f => ({ ...f, category: cat }))
    }
    setNewCatInput('')
    setShowCatManager(false)
  }

  const toggleDietaryTag = (tag: DietaryTag) => {
    setForm(f => ({
      ...f,
      dietary_tags: f.dietary_tags.includes(tag)
        ? f.dietary_tags.filter(t => t !== tag)
        : [...f.dietary_tags, tag],
    }))
  }

  // Group items by category
  const grouped = items.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category ?? 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a0f 100%)', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', padding: '12px 20px', borderRadius: 12, backdropFilter: 'blur(12px)', fontWeight: 600 }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Admin Hub</a>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>F&B Control</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
              🍽️ F&amp;B Kitchen &amp; Bar Menu Control
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', margin: '4px 0 0', fontSize: 14 }}>
              Add, edit, or delete menu items &amp; categories — toggle 86 status instantly.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowCatManager(s => !s)}
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              📁 + Add Category
            </button>
            <button
              id="btn-add-menu-item"
              onClick={() => {
                if (showForm) handleCancelForm()
                else setShowForm(true)
              }}
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              {showForm ? '✕ Cancel' : '+ Add Menu Item'}
            </button>
          </div>
        </div>

        {/* Category Manager Modal / Form */}
        {showCatManager && (
          <form onSubmit={handleAddCategory} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, marginBottom: 24, backdropFilter: 'blur(12px)', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>New Category Name</label>
              <input value={newCatInput} onChange={e => setNewCatInput(e.target.value)} placeholder="e.g. Wine & Cocktails" style={inputStyle} required />
            </div>
            <button type="submit" style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              Add Category
            </button>
          </form>
        )}

        {/* Add / Edit Form */}
        {showForm && (
          <form onSubmit={handleSaveItem} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 32, backdropFilter: 'blur(12px)' }}>
            <h2 style={{ color: '#fff', margin: '0 0 20px', fontWeight: 700, fontSize: 18 }}>
              {editingItem ? `✏️ Edit Item: ${editingItem.name}` : '➕ New Menu Item'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Item Name *</label>
                <input id="input-item-name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Truffle Risotto" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category *</label>
                <select id="select-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Price (₱) *</label>
                <input id="input-price" required type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="e.g. 450.00" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sort Order</label>
                <input id="input-sort-order" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea id="input-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Short description of the dish..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Dietary Tags</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {DIETARY_OPTIONS.map(tag => (
                  <button type="button" key={tag} id={`tag-${tag}`} onClick={() => toggleDietaryTag(tag)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${form.dietary_tags.includes(tag) ? TAG_COLORS[tag] : 'rgba(255,255,255,0.2)'}`, background: form.dietary_tags.includes(tag) ? `${TAG_COLORS[tag]}22` : 'transparent', color: form.dietary_tags.includes(tag) ? TAG_COLORS[tag] : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                    {tag.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button id="btn-save-item" type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : editingItem ? 'Update Item' : 'Save Item'}
              </button>
              {editingItem && (
                <button type="button" onClick={handleCancelForm} style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 24px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {/* Menu Catalog */}
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 48 }}>Loading menu…</div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 32 }}>
              <h2 style={{ color: '#f97316', fontWeight: 700, fontSize: 16, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {cat}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {catItems.map(item => (
                  <div key={item.id} id={`menu-item-${item.id}`} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${item.is_available ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, opacity: item.is_available ? 1 : 0.6, transition: 'all 0.3s' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{item.name}</span>
                        {!item.is_available && <span style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>86&apos;d</span>}
                      </div>
                      {item.description && <p style={{ color: 'rgba(255,255,255,0.45)', margin: '0 0 6px', fontSize: 13 }}>{item.description}</p>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(item.dietary_tags ?? []).map(tag => (
                          <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${TAG_COLORS[tag as DietaryTag]}22`, color: TAG_COLORS[tag as DietaryTag], fontWeight: 600 }}>
                            {tag.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ color: '#f97316', fontWeight: 800, fontSize: 18, minWidth: 80, textAlign: 'right' }}>₱{item.price.toLocaleString()}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => handleStartEdit(item)}
                        style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                      <button
                        id={`toggle-${item.id}`}
                        onClick={() => toggleAvailability(item)}
                        title={item.is_available ? 'Mark 86\'d / Out of Stock' : 'Mark Available'}
                        style={{ width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: item.is_available ? '#22c55e' : '#ef4444', position: 'relative', transition: 'background 0.3s', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: 3, left: item.is_available ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {!loading && items.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 64, fontSize: 16 }}>
            No menu items yet. Click &ldquo;+ Add Menu Item&rdquo; to start building your menu.
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box',
}
