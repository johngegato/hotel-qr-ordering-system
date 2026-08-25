'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface SpaService {
  id: string
  name: string
  description: string | null
  price: number
  duration_mins: number | null
  requires_on_call: boolean
  is_available: boolean
  image_url: string | null
}

interface TherapistItem {
  id: string
  full_name: string
  is_on_call: boolean
  is_active: boolean
}

interface SpaTimeSlotItem {
  id: string
  slot_time: string
  is_available: boolean
  is_on_call: boolean
  sort_order: number
}

const DEFAULT_STANDARD_SLOTS = [
  '10:00 AM', '11:30 AM', '01:00 PM', '02:30 PM', '04:00 PM', '05:30 PM', '07:00 PM',
]

const DEFAULT_NIGHT_SHIFT_SLOTS = [
  '02:00 PM', '03:30 PM', '05:00 PM', '06:30 PM', '08:00 PM', '09:30 PM', '11:00 PM', '12:30 AM', '02:00 AM',
]

export default function AdminSpaPage() {
  const [services, setServices] = useState<SpaService[]>([])
  const [therapists, setTherapists] = useState<TherapistItem[]>([])
  const [timeSlots, setTimeSlots] = useState<SpaTimeSlotItem[]>([])
  const [loading, setLoading] = useState(true)

  // New/Edit Service Form state
  const [editingService, setEditingService] = useState<SpaService | null>(null)
  const [serviceName, setServiceName] = useState('')
  const [servicePrice, setServicePrice] = useState('1200')
  const [serviceDuration, setServiceDuration] = useState('60')
  const [serviceDesc, setServiceDesc] = useState('')
  const [serviceImage, setServiceImage] = useState('')
  const [serviceOnCall, setServiceOnCall] = useState(false)
  const [isSavingService, setIsSavingService] = useState(false)

  // New Therapist Form state
  const [newTherapistName, setNewTherapistName] = useState('')
  const [newTherapistOnCall, setNewTherapistOnCall] = useState(false)
  const [isAddingTherapist, setIsAddingTherapist] = useState(false)

  // Time Slot Management State
  const [newSlotTime, setNewSlotTime] = useState('')
  const [newSlotOnCall, setNewSlotOnCall] = useState(false)
  const [isAddingSlot, setIsAddingSlot] = useState(false)
  const [editingSlot, setEditingSlot] = useState<SpaTimeSlotItem | null>(null)
  const [editSlotTime, setEditSlotTime] = useState('')
  const [editSlotOnCall, setEditSlotOnCall] = useState(false)
  const [isSavingSlot, setIsSavingSlot] = useState(false)
  const [slotFeedback, setSlotFeedback] = useState<string | null>(null)

  const defaultHotelId = '00000000-0000-0000-0000-000000000001'

  const fetchData = async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: svcData } = await (supabase.from('catalog_items') as any)
        .select('*')
        .eq('department', 'SPA')
        .order('created_at', { ascending: true })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: thData } = await (supabase.from('therapists') as any)
        .select('*')
        .order('created_at', { ascending: true })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: slotData, error: slotErr } = await (supabase.from('spa_time_slots') as any)
        .select('*')
        .eq('hotel_id', defaultHotelId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (svcData) setServices(svcData)
      if (thData) setTherapists(thData)
      if (!slotErr && slotData) {
        setTimeSlots(slotData)
      }
    } catch (err) {
      console.error('Error fetching admin spa data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Realtime subscription for spa_time_slots
    const channel = supabase
      .channel('admin-spa-slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spa_time_slots' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Toggle 86 / Out of Service for a Spa Treatment
  const toggleAvailability = async (id: string, currentVal: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('catalog_items') as any)
        .update({ is_available: !currentVal })
        .eq('id', id)

      if (error) throw error

      setServices((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_available: !currentVal } : item
        )
      )
    } catch (err) {
      console.error('Failed to toggle availability:', err)
    }
  }

  // Toggle Therapist On-Call status
  const toggleOnCall = async (id: string, currentVal: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('therapists') as any)
        .update({ is_on_call: !currentVal })
        .eq('id', id)

      if (error) throw error

      setTherapists((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_on_call: !currentVal } : item
        )
      )
    } catch (err) {
      console.error('Failed to toggle therapist on-call:', err)
    }
  }

  // Prepare edit form
  const handleStartEdit = (service: SpaService) => {
    setEditingService(service)
    setServiceName(service.name)
    setServicePrice(String(service.price))
    setServiceDuration(String(service.duration_mins || 60))
    setServiceDesc(service.description || '')
    setServiceImage(service.image_url || '')
    setServiceOnCall(service.requires_on_call)
  }

  const handleCancelEdit = () => {
    setEditingService(null)
    setServiceName('')
    setServicePrice('1200')
    setServiceDuration('60')
    setServiceDesc('')
    setServiceImage('')
    setServiceOnCall(false)
  }

  // Save (Add or Edit) Spa Service
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serviceName.trim()) return

    setIsSavingService(true)
    try {
      const payload = {
        hotel_id: defaultHotelId,
        department: 'SPA',
        name: serviceName.trim(),
        description: serviceDesc.trim() || null,
        price: parseFloat(servicePrice) || 1200,
        duration_mins: parseInt(serviceDuration) || 60,
        requires_on_call: serviceOnCall,
        is_available: true,
        image_url: serviceImage.trim() || 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=500&q=80',
      }

      if (editingService) {
        // Update existing service
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('catalog_items') as any)
          .update(payload)
          .eq('id', editingService.id)

        if (error) throw error
        setServices((prev) => prev.map((s) => (s.id === editingService.id ? { ...s, ...payload } : s)))
      } else {
        // Insert new service
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from('catalog_items') as any)
          .insert([payload])
          .select('*')
          .single()

        if (error) throw error
        if (data) setServices((prev) => [...prev, data])
      }

      handleCancelEdit()
    } catch (err) {
      console.error('Failed to save spa service:', err)
    } finally {
      setIsSavingService(false)
    }
  }

  // Delete Spa Service
  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this spa treatment?')) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('catalog_items') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
      setServices((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      console.error('Failed to delete spa service:', err)
    }
  }

  // Add new Therapist
  const handleAddTherapist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTherapistName.trim()) return

    setIsAddingTherapist(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('therapists') as any)
        .insert([
          {
            hotel_id: defaultHotelId,
            full_name: newTherapistName.trim(),
            is_on_call: newTherapistOnCall,
            is_active: true,
          },
        ])
        .select('*')
        .single()

      if (error) throw error

      if (data) {
        setTherapists((prev) => [...prev, data])
        setNewTherapistName('')
      }
    } catch (err) {
      console.error('Failed to add therapist:', err)
    } finally {
      setIsAddingTherapist(false)
    }
  }

  // Delete Therapist
  const handleDeleteTherapist = async (id: string) => {
    if (!confirm('Are you sure you want to delete this therapist?')) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('therapists') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
      setTherapists((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('Failed to delete therapist:', err)
    }
  }

  // ─── Time Slot Management Handlers ─────────────────────────

  // Toggle Time Slot Availability (Active / Disabled)
  const toggleSlotAvailability = async (id: string, currentVal: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('spa_time_slots') as any)
        .update({ is_available: !currentVal })
        .eq('id', id)

      if (error) throw error
      setTimeSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_available: !currentVal } : s))
      )
    } catch (err) {
      console.error('Failed to toggle time slot availability:', err)
    }
  }

  // Toggle Time Slot On-Call Requirement
  const toggleSlotOnCall = async (id: string, currentVal: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('spa_time_slots') as any)
        .update({ is_on_call: !currentVal })
        .eq('id', id)

      if (error) throw error
      setTimeSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_on_call: !currentVal } : s))
      )
    } catch (err) {
      console.error('Failed to toggle time slot on-call:', err)
    }
  }

  // Delete Time Slot
  const handleDeleteSlot = async (id: string) => {
    if (!confirm('Are you sure you want to delete this time slot?')) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('spa_time_slots') as any)
        .delete()
        .eq('id', id)

      if (error) throw error
      setTimeSlots((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      console.error('Failed to delete time slot:', err)
    }
  }

  // Start Editing Time Slot
  const handleStartEditSlot = (slot: SpaTimeSlotItem) => {
    setEditingSlot(slot)
    setEditSlotTime(slot.slot_time)
    setEditSlotOnCall(slot.is_on_call)
  }

  const handleCancelEditSlot = () => {
    setEditingSlot(null)
    setEditSlotTime('')
    setEditSlotOnCall(false)
  }

  // Save (Add or Update) Time Slot
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSlotTime.trim()) return

    setIsAddingSlot(true)
    try {
      const formattedTime = newSlotTime.trim()
      const sortOrder = timeSlots.length + 1

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('spa_time_slots') as any)
        .insert([
          {
            hotel_id: defaultHotelId,
            slot_time: formattedTime,
            is_available: true,
            is_on_call: newSlotOnCall,
            sort_order: sortOrder,
          },
        ])
        .select('*')
        .single()

      if (error) throw error
      if (data) {
        setTimeSlots((prev) => [...prev, data])
        setNewSlotTime('')
        setNewSlotOnCall(false)
        setSlotFeedback(`✓ Added time slot: ${formattedTime}`)
        setTimeout(() => setSlotFeedback(null), 3000)
      }
    } catch (err) {
      console.error('Failed to add time slot:', err)
      alert('Could not add time slot. Please check format.')
    } finally {
      setIsAddingSlot(false)
    }
  }

  // Save Edit Time Slot
  const handleSaveEditSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlot || !editSlotTime.trim()) return

    setIsSavingSlot(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('spa_time_slots') as any)
        .update({
          slot_time: editSlotTime.trim(),
          is_on_call: editSlotOnCall,
        })
        .eq('id', editingSlot.id)

      if (error) throw error
      setTimeSlots((prev) =>
        prev.map((s) =>
          s.id === editingSlot.id
            ? { ...s, slot_time: editSlotTime.trim(), is_on_call: editSlotOnCall }
            : s
        )
      )
      handleCancelEditSlot()
    } catch (err) {
      console.error('Failed to update time slot:', err)
    } finally {
      setIsSavingSlot(false)
    }
  }

  // Seed / Reset with Presets (e.g. Standard 10 AM - 7 PM or Night Shift 2 PM - 2 AM)
  const handleSeedPreset = async (presetSlots: string[]) => {
    if (timeSlots.length > 0 && !confirm(`This will add ${presetSlots.length} schedule slots. Existing slots will be retained. Continue?`)) {
      return
    }

    try {
      const inserts = presetSlots.map((time, idx) => ({
        hotel_id: defaultHotelId,
        slot_time: time,
        is_available: true,
        is_on_call: time.includes('AM') && !time.startsWith('10') && !time.startsWith('11'),
        sort_order: timeSlots.length + idx + 1,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('spa_time_slots') as any)
        .insert(inserts)
        .select('*')

      if (error) throw error
      if (data) {
        setTimeSlots((prev) => [...prev, ...data])
        setSlotFeedback(`✓ Successfully applied schedule preset (${presetSlots.length} slots)`)
        setTimeout(() => setSlotFeedback(null), 3500)
      }
    } catch (err) {
      console.error('Failed to seed preset time slots:', err)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a href="/admin" className="text-slate-500 hover:text-slate-300 text-sm font-semibold">← Admin Hub</a>
              <span className="text-slate-700">/</span>
              <span className="text-3xl">💆</span>
              <h1 className="text-3xl font-bold tracking-tight text-white">Spa & Wellness Management</h1>
            </div>
            <p className="text-slate-400 text-sm">
              Add, edit, or delete spa treatments, manage 86 availability, and manage therapist shift rosters.
            </p>
          </div>
          <a
            href="/app/stay/spa?room=00000000-0000-0000-0000-000000000101&hash=secret-hash-302"
            target="_blank"
            className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all flex items-center gap-2 self-start"
          >
            ↗ Preview Guest Booking Page
          </a>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-500 text-sm">Loading spa catalog...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Spa Treatments (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>✨</span> Spa Treatments & Services ({services.length})
              </h2>

              <div className="space-y-4">
                {services.map((item) => (
                  <div
                    key={item.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      item.is_available
                        ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        : 'bg-red-950/20 border-red-900/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">{item.name}</h3>
                          {item.requires_on_call && (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              On-Call Only
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs line-clamp-2">{item.description}</p>
                        <div className="flex items-center gap-4 text-xs font-semibold text-slate-300 pt-2">
                          <span className="text-amber-400 font-bold">₱{item.price.toLocaleString()}</span>
                          <span>⏱️ {item.duration_mins} mins</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => toggleAvailability(item.id, item.is_available)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                            item.is_available
                              ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                          }`}
                        >
                          {item.is_available ? 'Available' : '⛔ 86 / Out'}
                        </button>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteService(item.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add / Edit Treatment Form */}
              <form onSubmit={handleSaveService} className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300">
                    {editingService ? `✏️ Edit Spa Treatment: ${editingService.name}` : '➕ Add New Spa Treatment'}
                  </h3>
                  {editingService && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Treatment Name"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Price (₱)"
                      value={servicePrice}
                      onChange={(e) => setServicePrice(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Duration (mins)"
                      value={serviceDuration}
                      onChange={(e) => setServiceDuration(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Short Description"
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serviceOnCall}
                      onChange={(e) => setServiceOnCall(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-amber-500"
                    />
                    Requires On-Call Specialist
                  </label>
                  <button
                    type="submit"
                    disabled={isSavingService}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    {isSavingService ? 'Saving...' : editingService ? 'Update Service' : 'Add Service'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Therapists (1 col) */}
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🧘</span> Therapist Staff ({therapists.length})
              </h2>

              <div className="space-y-3">
                {therapists.map((th) => (
                  <div
                    key={th.id}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-semibold text-sm text-white">{th.full_name}</h4>
                      <span className={`text-[10px] font-semibold ${th.is_on_call ? 'text-amber-400' : 'text-slate-400'}`}>
                        {th.is_on_call ? 'On-Call Specialist' : 'In-House Staff'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleOnCall(th.id, th.is_on_call)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          th.is_on_call
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {th.is_on_call ? 'On-Call' : 'In-House'}
                      </button>

                      <button
                        onClick={() => handleDeleteTherapist(th.id)}
                        className="p-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20"
                        title="Delete Therapist"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Therapist Form */}
              <form onSubmit={handleAddTherapist} className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-300">➕ Add Therapist</h3>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newTherapistName}
                  onChange={(e) => setNewTherapistName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  required
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTherapistOnCall}
                      onChange={(e) => setNewTherapistOnCall(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-amber-500"
                    />
                    Mark as On-Call
                  </label>
                  <button
                    type="submit"
                    disabled={isAddingTherapist}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    {isAddingTherapist ? 'Saving...' : 'Add Therapist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── 🕒 Spa Time Slots & Shift Scheduling Section ─── */}
        {!loading && (
          <div className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 space-y-8 shadow-2xl">
            {/* Section Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-2xl">🕒</span>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Spa Appointment Time Slots & Shift Scheduling
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    {timeSlots.filter((s) => s.is_available).length} Active Slots
                  </span>
                </div>
                <p className="text-slate-400 text-xs max-w-2xl leading-relaxed">
                  Customize the booking time slots available to guests in <code className="text-purple-300">/app/stay/spa</code> and synchronized with the staff master timetable. Supports flexible day, evening, and late-night therapist shifts (e.g. 2:00 PM to 2:00 AM).
                </p>
              </div>

              {/* Preset Shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleSeedPreset(DEFAULT_STANDARD_SLOTS)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                  title="Add standard 10:00 AM - 07:00 PM slots"
                >
                  <span>☀️</span> Standard Day (10 AM - 7 PM)
                </button>
                <button
                  onClick={() => handleSeedPreset(DEFAULT_NIGHT_SHIFT_SLOTS)}
                  className="px-3.5 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                  title="Add 2:00 PM to 2:00 AM flexible late shift slots"
                >
                  <span>🌙</span> Late Shift (2 PM - 2 AM)
                </button>
              </div>
            </div>

            {/* Notification / Feedback Banner */}
            {slotFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in flex items-center gap-2">
                <span>✓</span> {slotFeedback}
              </div>
            )}

            {/* Time Slots Grid */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <span>📋</span> Configured Time Slots ({timeSlots.length})
              </h3>

              {timeSlots.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-3">
                  <p className="text-slate-400 text-xs">No custom time slots configured yet. Default fallback slots are currently used.</p>
                  <button
                    onClick={() => handleSeedPreset(DEFAULT_NIGHT_SHIFT_SLOTS)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30"
                  >
                    🚀 Seed 2:00 PM – 02:00 AM Shift Slots
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {timeSlots.map((slot) => {
                    const isNightOrLate = slot.slot_time.includes('PM') && (parseInt(slot.slot_time) >= 8 || slot.slot_time.startsWith('11') || slot.slot_time.startsWith('12')) || (slot.slot_time.includes('AM') && !slot.slot_time.startsWith('10') && !slot.slot_time.startsWith('11'))

                    return (
                      <div
                        key={slot.id}
                        className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between gap-3 ${
                          slot.is_available
                            ? isNightOrLate
                              ? 'bg-purple-950/20 border-purple-900/40 hover:border-purple-700'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                            : 'bg-red-950/15 border-red-900/30 opacity-60'
                        }`}
                      >
                        {/* Slot Time & Badges */}
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-mono font-black text-lg text-white tracking-tight">
                              {slot.slot_time}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                                slot.is_available
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}
                            >
                              {slot.is_available ? 'Active' : 'Disabled'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {slot.is_on_call ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                                <span>⚠️</span> On-Call
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                                In-House Staff
                              </span>
                            )}
                            {isNightOrLate && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/25">
                                🌙 Night Shift
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleSlotAvailability(slot.id, slot.is_available)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                slot.is_available
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                              }`}
                              title={slot.is_available ? 'Disable this slot' : 'Enable this slot'}
                            >
                              {slot.is_available ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => toggleSlotOnCall(slot.id, slot.is_on_call)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                slot.is_on_call
                                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                              }`}
                              title="Toggle On-Call vs Regular"
                            >
                              {slot.is_on_call ? 'On-Call' : 'Regular'}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStartEditSlot(slot)}
                              className="p-1 px-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold hover:bg-indigo-500/20"
                              title="Edit slot time"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="p-1 px-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20"
                              title="Delete slot"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ─── Add / Edit Time Slot Form ─── */}
            <div className="p-6 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>{editingSlot ? '✏️ Edit Time Slot' : '➕ Add Custom Time Slot'}</span>
                  {editingSlot && (
                    <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                      {editingSlot.slot_time}
                    </span>
                  )}
                </h3>
                {editingSlot && (
                  <button
                    type="button"
                    onClick={handleCancelEditSlot}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {/* Quick preset chips */}
              {!editingSlot && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 block">Quick Time Suggestions:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['02:00 PM', '03:30 PM', '05:00 PM', '06:30 PM', '08:00 PM', '09:30 PM', '11:00 PM', '12:30 AM', '01:30 AM', '02:00 AM'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewSlotTime(preset)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 hover:border-purple-500 hover:text-purple-300 transition-all"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form
                onSubmit={editingSlot ? handleSaveEditSlot : handleSaveSlot}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center"
              >
                <input
                  type="text"
                  placeholder="e.g. 02:00 PM, 11:30 PM, 01:30 AM"
                  value={editingSlot ? editSlotTime : newSlotTime}
                  onChange={(e) => (editingSlot ? setEditSlotTime(e.target.value) : setNewSlotTime(e.target.value))}
                  className="px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 sm:col-span-1"
                  required
                />

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={editingSlot ? editSlotOnCall : newSlotOnCall}
                    onChange={(e) => (editingSlot ? setEditSlotOnCall(e.target.checked) : setNewSlotOnCall(e.target.checked))}
                    className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-0"
                  />
                  Requires On-Call Staff
                </label>

                <div className="flex gap-2 sm:col-span-1">
                  <button
                    type="submit"
                    disabled={editingSlot ? isSavingSlot : isAddingSlot}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50"
                  >
                    {editingSlot ? (isSavingSlot ? 'Saving...' : 'Update Time Slot') : isAddingSlot ? 'Adding...' : 'Add Time Slot'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
