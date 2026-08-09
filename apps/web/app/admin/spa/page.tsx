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

export default function AdminSpaPage() {
  const [services, setServices] = useState<SpaService[]>([])
  const [therapists, setTherapists] = useState<TherapistItem[]>([])
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

      if (svcData) setServices(svcData)
      if (thData) setTherapists(thData)
    } catch (err) {
      console.error('Error fetching admin spa data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
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
      </div>
    </main>
  )
}
