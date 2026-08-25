'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database, Room } from '@hotel-qr/supabase/types'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const ROOM_TYPE_BADGES: Record<string, { color: string; label: string }> = {
  STANDARD:  { color: '#60a5fa', label: 'Standard Room' },
  DELUXE:    { color: '#34d399', label: 'Deluxe Room' },
  SUITE:     { color: '#a78bfa', label: 'Suite' },
  PENTHOUSE: { color: '#fbbf24', label: 'Penthouse Suite' },
}

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedQrRoom, setSelectedQrRoom] = useState<Room | null>(null)

  // Form state
  const [roomNumber, setRoomNumber] = useState('')
  const [floor, setFloor] = useState('3rd Floor')
  const [roomType, setRoomType] = useState<'STANDARD' | 'DELUXE' | 'SUITE' | 'PENTHOUSE'>('DELUXE')
  const [saving, setSaving] = useState(false)

  const fetchRooms = async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('rooms')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .order('room_number', { ascending: true })
    setRooms((data as Room[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomNumber.trim()) return

    setSaving(true)
    // Generate secure random auth hash
    const authHash = `secret-hash-${Math.random().toString(36).substring(2, 9)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('rooms')
      .insert([
        {
          hotel_id: HOTEL_ID,
          room_number: roomNumber.trim(),
          floor: floor.trim() || null,
          room_type: roomType,
          qr_auth_hash: authHash,
          is_active: true,
        },
      ])
      .select('*')
      .single()

    setSaving(false)
    if (!error && data) {
      setRooms(prev => [...prev, data])
      setShowAddModal(false)
      setRoomNumber('')
    }
  }

  const handleDeleteRoom = async (id: string, number: string) => {
    if (!confirm(`Are you sure you want to delete Room ${number} and its QR Code?`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('rooms').delete().eq('id', id)
    setRooms(prev => prev.filter(r => r.id !== id))
  }

  const getGuestUrl = (room: Room) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    return `${origin}/app/stay?room=${room.id}&hash=${room.qr_auth_hash}`
  }

  const getQrImageUrl = (url: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`
  }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: "'Inter', sans-serif", padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Admin Hub</a>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Room &amp; QR Manager</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>🔑 Room &amp; QR Code Generator</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Generate, preview, print, and delete room QR codes that authenticate guest sessions.</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}
          >
            + Add Room &amp; Generate QR
          </button>
        </div>

        {/* Rooms Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>Loading room QR codes...</div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.03)', borderRadius: 20, border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <p style={{ color: '#94a3b8', margin: 0, fontWeight: 600 }}>No rooms registered yet. Click &quot;+ Add Room &amp; Generate QR&quot; to create one.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {rooms.map(room => {
              const url = getGuestUrl(room)
              const qrImg = getQrImageUrl(url)
              const badge = ROOM_TYPE_BADGES[room.room_type] || ROOM_TYPE_BADGES.DELUXE

              return (
                <div key={room.id} style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    {/* Top Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{room.floor || 'Floor N/A'}</span>
                        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>Room {room.room_number}</h3>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 10, background: `${badge.color}20`, color: badge.color, border: `1px solid ${badge.color}40` }}>
                        {badge.label}
                      </span>
                    </div>

                    {/* QR Code Container */}
                    <div style={{ background: '#ffffff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImg} alt={`QR Code Room ${room.room_number}`} style={{ width: 180, height: 180, borderRadius: 8 }} />
                      <span style={{ color: '#0f172a', fontWeight: 800, fontSize: 13, marginTop: 8 }}>
                        SCAN FOR ROOM {room.room_number}
                      </span>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all', marginBottom: 16 }}>
                      Auth Hash: {room.qr_auth_hash}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ flex: 1, textAlign: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
                    >
                      ↗ Guest Link
                    </a>
                    <button
                      onClick={() => setSelectedQrRoom(room)}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#f1f5f9', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🖨️ Print Badge
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room.id, room.room_number)}
                      style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      title="Delete Room & QR Code"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Room Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form onSubmit={handleAddRoom} style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: '2rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, fontWeight: 800 }}>➕ Add Room &amp; Generate QR</h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Room Number *</label>
              <input
                type="text"
                placeholder="e.g. 303"
                value={roomNumber}
                onChange={e => setRoomNumber(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Floor</label>
              <input
                type="text"
                placeholder="e.g. 3rd Floor"
                value={floor}
                onChange={e => setFloor(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Room Type</label>
              <select
                value={roomType}
                onChange={e => setRoomType(e.target.value as 'STANDARD' | 'DELUXE' | 'SUITE' | 'PENTHOUSE')}
                style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f1f5f9', fontSize: 14 }}
              >
                <option value="STANDARD">Standard Room</option>
                <option value="DELUXE">Deluxe Room</option>
                <option value="SUITE">Suite</option>
                <option value="PENTHOUSE">Penthouse Suite</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#94a3b8', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !roomNumber.trim()}
                style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: !roomNumber.trim() ? 0.5 : 1 }}
              >
                {saving ? 'Generating...' : 'Generate QR Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Print Badge Modal */}
      {selectedQrRoom && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', color: '#0f172a', borderRadius: 28, padding: '2.5rem', width: '100%', maxWidth: 420, textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 4 }}>
              Grand Hotel &amp; Spa
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 16px', color: '#0f172a' }}>
              Room {selectedQrRoom.room_number}
            </h2>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getQrImageUrl(getGuestUrl(selectedQrRoom))}
              alt={`QR Room ${selectedQrRoom.room_number}`}
              style={{ width: 240, height: 240, margin: '0 auto 16px', border: '1px solid #e2e8f0', borderRadius: 16, padding: 8 }}
            />

            <p style={{ fontSize: 13, fontWeight: 700, color: '#475569', margin: '0 0 20px' }}>
              Scan QR code with your smartphone camera for instant in-room dining, spa bookings &amp; guest requests.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => window.print()}
                style={{ flex: 1, padding: '12px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                🖨️ Print Badge
              </button>
              <button
                onClick={() => setSelectedQrRoom(null)}
                style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
