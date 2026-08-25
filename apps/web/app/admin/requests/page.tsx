'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database, TargetDepartment, TaskPriority, CatalogItem } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const DEPT_LABELS: Record<TargetDepartment, { label: string; icon: string; color: string }> = {
  HOUSEKEEPING: { label: 'Housekeeping', icon: '🧹', color: '#60a5fa' },
  MAINTENANCE:  { label: 'Maintenance',  icon: '🔧', color: '#f97316' },
  FRONT_DESK:   { label: 'Front Desk',   icon: '🎩', color: '#a78bfa' },
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW:    '#4ade80',
  MEDIUM: '#fbbf24',
  HIGH:   '#f97316',
  URGENT: '#f87171',
}

type TaskItem = CatalogItem & { priority: TaskPriority; target_sla_mins: number; target_department: TargetDepartment }

const emptyForm = {
  name: '',
  description: '',
  category: '',
  priority: 'MEDIUM' as TaskPriority,
  target_sla_mins: 20,
  target_department: 'HOUSEKEEPING' as TargetDepartment,
  is_available: true,
}

export default function AdminRequestsPage() {
  const [items, setItems] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<TaskItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [activeFilter, setActiveFilter] = useState<TargetDepartment | 'ALL'>('ALL')

  const fetchItems = async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('catalog_items')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('department', 'ROOM_REQUEST')
      .order('target_department', { ascending: true })
      .order('sort_order', { ascending: true })
    setItems((data as TaskItem[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel('admin-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items' }, fetchItems)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const openAdd = () => {
    setEditItem(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (item: TaskItem) => {
    setEditItem(item)
    setForm({
      name: item.name,
      description: item.description || '',
      category: item.category || '',
      priority: item.priority || 'MEDIUM',
      target_sla_mins: item.target_sla_mins || 20,
      target_department: item.target_department || 'HOUSEKEEPING',
      is_available: item.is_available,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      hotel_id: HOTEL_ID,
      department: 'ROOM_REQUEST',
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      priority: form.priority,
      target_sla_mins: form.target_sla_mins,
      target_department: form.target_department,
      is_available: form.is_available,
      price: 0,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (supabase as any).from('catalog_items')
    const { error } = editItem
      ? await q.update(payload).eq('id', editItem.id)
      : await q.insert([payload])
    if (!error) {
      setShowModal(false)
      fetchItems()
    }
    setSaving(false)
  }

  const toggleAvailable = async (item: TaskItem) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('catalog_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
    fetchItems()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this request item?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('catalog_items').delete().eq('id', id)
    fetchItems()
  }

  const filteredItems = activeFilter === 'ALL'
    ? items
    : items.filter(i => i.target_department === activeFilter)

  const depts: (TargetDepartment | 'ALL')[] = ['ALL', 'HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK']

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>← Admin</a>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#94a3b8', fontSize: 14 }}>Request Builder</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>🛎️ Room Request Builder</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Configure 1-tap guest requests, priorities, and SLA targets.</p>
          </div>
          <button
            onClick={openAdd}
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            + Add Request
          </button>
        </div>

        {/* Dept Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
          {depts.map(d => (
            <button
              key={d}
              onClick={() => setActiveFilter(d)}
              style={{
                padding: '6px 16px', borderRadius: 20, border: '1px solid',
                borderColor: activeFilter === d ? '#6366f1' : 'rgba(255,255,255,0.1)',
                background: activeFilter === d ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: activeFilter === d ? '#818cf8' : '#64748b',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              {d === 'ALL' ? '📋 All' : `${DEPT_LABELS[d as TargetDepartment].icon} ${DEPT_LABELS[d as TargetDepartment].label}`}
            </button>
          ))}
        </div>

        {/* Items list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛎️</div>
            <p style={{ color: '#475569', margin: 0 }}>No request items yet. Click &quot;+ Add Request&quot; to create one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredItems.map(item => {
              const dept = DEPT_LABELS[item.target_department]
              const priority = item.priority || 'MEDIUM'
              return (
                <div key={item.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Dept color bar */}
                  <div style={{ width: 4, height: 40, borderRadius: 2, background: dept.color, flexShrink: 0 }} />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${PRIORITY_COLORS[priority]}20`, color: PRIORITY_COLORS[priority] }}>{priority}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: '#64748b' }}>
                      <span>{dept.icon} {dept.label}</span>
                      <span>⏱ SLA: {item.target_sla_mins} min</span>
                      {item.description && <span>{item.description}</span>}
                    </div>
                  </div>

                  {/* Active toggle */}
                  <button
                    onClick={() => toggleAvailable(item)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, border: '1px solid',
                      borderColor: item.is_available ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)',
                      background: item.is_available ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                      color: item.is_available ? '#4ade80' : '#475569',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {item.is_available ? '● Active' : '○ Disabled'}
                  </button>

                  <button onClick={() => openEdit(item)} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => handleDelete(item.id)} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ margin: '0 0 1.5rem', fontWeight: 800 }}>{editItem ? '✏️ Edit Request' : '+ New Request Item'}</h2>

            {[
              { label: 'Request Name *', field: 'name', type: 'text', placeholder: 'e.g. Extra Towels' },
              { label: 'Description', field: 'description', type: 'text', placeholder: 'Short guest-facing description' },
              { label: 'Category', field: 'category', type: 'text', placeholder: 'e.g. Housekeeping' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field} style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>{label}</label>
                <input
                  type={type}
                  value={form[field as keyof typeof form] as string}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                  style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14 }}>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>SLA Target (mins)</label>
                <input type="number" min={1} max={180} value={form.target_sla_mins}
                  onChange={e => setForm(p => ({ ...p, target_sla_mins: parseInt(e.target.value) || 20 }))}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Department</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK'] as TargetDepartment[]).map(d => (
                  <button key={d} onClick={() => setForm(p => ({ ...p, target_department: d }))}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      borderColor: form.target_department === d ? DEPT_LABELS[d].color : 'rgba(255,255,255,0.1)',
                      background: form.target_department === d ? `${DEPT_LABELS[d].color}20` : 'transparent',
                      color: form.target_department === d ? DEPT_LABELS[d].color : '#64748b',
                    }}>
                    {DEPT_LABELS[d].icon} {DEPT_LABELS[d].label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#94a3b8', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.name || saving}
                style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: !form.name ? 0.5 : 1 }}>
                {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
