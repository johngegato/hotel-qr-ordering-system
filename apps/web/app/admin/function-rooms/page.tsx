'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { FunctionRoom, FunctionRoomEquipment } from '@hotel-qr/supabase/types'

const supabase: any = createSupabaseBrowserClient()
const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

export default function FunctionRoomsAdminPage() {
  const [rooms, setRooms] = useState<FunctionRoom[]>([])
  const [equipment, setEquipment] = useState<FunctionRoomEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [roomName, setRoomName] = useState('')
  const [capacity, setCapacity] = useState('80')
  const [savingRoom, setSavingRoom] = useState(false)
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentPrice, setEquipmentPrice] = useState('500')
  const [savingEquipment, setSavingEquipment] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [roomsRes, eqRes] = await Promise.all([
        supabase.from('function_rooms').select('*').eq('hotel_id', HOTEL_ID).order('name', { ascending: true }),
        supabase.from('function_room_equipments').select('*').eq('hotel_id', HOTEL_ID).order('name', { ascending: true }),
      ])

      setRooms((roomsRes.data as FunctionRoom[]) || [])
      setEquipment((eqRes.data as FunctionRoomEquipment[]) || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRoomSave = async () => {
    if (!roomName.trim()) return

    setSavingRoom(true)
    try {
      await supabase.from('function_rooms').insert({
        hotel_id: HOTEL_ID,
        name: roomName.trim(),
        capacity: Number(capacity) || 0,
        is_active: true,
      })
      setRoomName('')
      setCapacity('80')
      await fetchData()
    } finally {
      setSavingRoom(false)
    }
  }

  const handleEquipmentSave = async () => {
    if (!equipmentName.trim()) return

    setSavingEquipment(true)
    try {
      await supabase.from('function_room_equipments').insert({
        hotel_id: HOTEL_ID,
        name: equipmentName.trim(),
        rental_price: Number(equipmentPrice) || 0,
        is_active: true,
      })
      setEquipmentName('')
      setEquipmentPrice('500')
      await fetchData()
    } finally {
      setSavingEquipment(false)
    }
  }

  const toggleRoomStatus = async (room: FunctionRoom) => {
    await supabase.from('function_rooms').update({ is_active: !room.is_active }).eq('id', room.id)
    await fetchData()
  }

  const toggleEquipmentStatus = async (item: FunctionRoomEquipment) => {
    await supabase.from('function_room_equipments').update({ is_active: !item.is_active }).eq('id', item.id)
    await fetchData()
  }

  const deleteRoom = async (id: string) => {
    if (!confirm('Delete this function room?')) return
    await supabase.from('function_rooms').delete().eq('id', id)
    await fetchData()
  }

  const deleteEquipment = async (id: string) => {
    if (!confirm('Delete this rental item?')) return
    await supabase.from('function_room_equipments').delete().eq('id', id)
    await fetchData()
  }

  const summary = useMemo(() => ({
    rooms: rooms.length,
    equipmentCount: equipment.length,
    activeRooms: rooms.filter((room) => room.is_active).length,
  }), [equipment, rooms])

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>🏛️ Function Room Management</div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Event Venue & Rental Setup</h1>
          </div>
          <a href="/admin" style={{ color: '#cbd5e1', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 16px', borderRadius: 12 }}>
            ← Back to Admin
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard label="Rooms" value={summary.rooms} color="#fbbf24" />
          <StatCard label="Active Rooms" value={summary.activeRooms} color="#34d399" />
          <StatCard label="Equipment" value={summary.equipmentCount} color="#60a5fa" />
        </div>

        {loading ? <div style={{ color: '#94a3b8', padding: '2rem 0' }}>Loading venue records...</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '2rem' }}>
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem' }}>
              <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 800 }}>Function Rooms</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 16 }}>
                <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room name (e.g. Grand Ballroom)" style={inputStyle} />
                <input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" type="number" style={inputStyle} />
              </div>
              <button onClick={handleRoomSave} disabled={savingRoom} style={{ ...primaryButton, opacity: savingRoom ? 0.7 : 1 }}>
                {savingRoom ? 'Saving...' : 'Add Function Room'}
              </button>

              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rooms.map((room) => (
                  <div key={room.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{room.name}</div>
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>Capacity: {room.capacity}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => toggleRoomStatus(room)} style={{ ...smallButton, background: room.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)', color: room.is_active ? '#4ade80' : '#cbd5e1' }}>
                          {room.is_active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => deleteRoom(room.id)} style={{ ...smallButton, background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '1.5rem' }}>
              <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 800 }}>Rental Equipment</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 16 }}>
                <input value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} placeholder="Equipment name" style={inputStyle} />
                <input value={equipmentPrice} onChange={(e) => setEquipmentPrice(e.target.value)} placeholder="Price" type="number" style={inputStyle} />
              </div>
              <button onClick={handleEquipmentSave} disabled={savingEquipment} style={{ ...primaryButton, opacity: savingEquipment ? 0.7 : 1 }}>
                {savingEquipment ? 'Saving...' : 'Add Equipment'}
              </button>

              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {equipment.map((item) => (
                  <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{item.name}</div>
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>Rental: ₱{Number(item.rental_price || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => toggleEquipmentStatus(item)} style={{ ...smallButton, background: item.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)', color: item.is_active ? '#4ade80' : '#cbd5e1' }}>
                          {item.is_active ? 'Available' : 'Off'}
                        </button>
                        <button onClick={() => deleteEquipment(item.id)} style={{ ...smallButton, background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1rem 1.2rem' }}>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontWeight: 800, fontSize: 28 }}>{value}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(2,6,23,0.85)',
  color: '#f8fafc',
  padding: '12px 14px',
  boxSizing: 'border-box',
  fontSize: 14,
}

const primaryButton: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0f172a',
  border: 'none',
  borderRadius: 12,
  padding: '12px 16px',
  fontWeight: 800,
  cursor: 'pointer',
}

const smallButton: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '6px 10px',
  fontWeight: 700,
  cursor: 'pointer',
}
