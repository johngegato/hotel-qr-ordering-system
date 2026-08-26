'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { CatalogItem, TaskPayload, TaskPriority, TargetDepartment } from '@hotel-qr/supabase/types'

import PhoneCaptureModal, { getStoredGuestPhone } from '../components/PhoneCaptureModal'
import FrontDeskFAB from '../components/FrontDeskFAB'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

type TaskItem = CatalogItem & { priority: TaskPriority; target_sla_mins: number; target_department: TargetDepartment }

const DEPT_CONFIG: Record<TargetDepartment | 'CUSTOM', { label: string; icon: string; color: string; bg: string; border: string }> = {
  FRONT_DESK:   { label: 'Front Desk',   icon: '🎩', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.3)' },
  HOUSEKEEPING: { label: 'Housekeeping', icon: '🧹', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.3)' },
  MAINTENANCE:  { label: 'Maintenance',  icon: '🔧', color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.3)' },
  CUSTOM:       { label: 'Other',        icon: '✍️', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.3)' },
}

function getTaskEmoji(name: string, dept: TargetDepartment): string {
  const lower = name.toLowerCase()
  if (lower.includes('key') || lower.includes('card')) return '🔑'
  if (lower.includes('checkout') || lower.includes('late')) return '⏰'
  if (lower.includes('luggage') || lower.includes('bag') || lower.includes('bellhop')) return '🧳'
  if (lower.includes('towel')) return '🧖'
  if (lower.includes('pillow') || lower.includes('blanket') || lower.includes('bedding')) return '🛏️'
  if (lower.includes('toiletry') || lower.includes('soap') || lower.includes('shampoo') || lower.includes('dental')) return '🧴'
  if (lower.includes('clean') || lower.includes('housekeeping')) return '✨'
  if (lower.includes('laundry') || lower.includes('iron') || lower.includes('wash')) return '🧺'
  if (lower.includes('ac') || lower.includes('air') || lower.includes('cold') || lower.includes('heat') || lower.includes('thermostat')) return '❄️'
  if (lower.includes('tv') || lower.includes('remote') || lower.includes('channel') || lower.includes('screen')) return '📺'
  if (lower.includes('plumb') || lower.includes('toilet') || lower.includes('water') || lower.includes('leak') || lower.includes('sink') || lower.includes('shower')) return '🚿'
  if (lower.includes('light') || lower.includes('bulb') || lower.includes('lamp') || lower.includes('power') || lower.includes('outlet')) return '💡'
  if (lower.includes('water') || lower.includes('drink')) return '💧'
  if (lower.includes('slippers') || lower.includes('robe')) return '👘'

  if (dept === 'FRONT_DESK') return '🛎️'
  if (dept === 'HOUSEKEEPING') return '🧹'
  if (dept === 'MAINTENANCE') return '🔧'
  return '🛎️'
}

type Step = 'grid' | 'modal' | 'submitting' | 'tracking'

interface ActiveRequest {
  id: string
  taskName: string
  status: 'PENDING' | 'CLAIMED' | 'RESOLVED'
}

function GuestRequestsContent() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room')
  const hash = searchParams.get('hash') ?? ''

  const [items, setItems] = useState<TaskItem[]>([])
  const [roomNumber, setRoomNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('grid')
  const [selectedItem, setSelectedItem] = useState<TaskItem | null>(null)
  const [isCustom, setIsCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [activeDeptFilter, setActiveDeptFilter] = useState<'ALL' | TargetDepartment | 'CUSTOM'>('ALL')

  useEffect(() => {
    const fetch = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('catalog_items')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .eq('department', 'ROOM_REQUEST')
        .eq('is_available', true)
        .order('target_department', { ascending: true })
        .order('sort_order', { ascending: true })
      setItems((data as TaskItem[]) || [])
      setLoading(false)
    }
    fetch()
  }, [])

  useEffect(() => {
    if (!roomId) return
    const fetchRoom = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('rooms')
        .select('room_number')
        .eq('id', roomId)
        .single()
      if (data?.room_number) {
        setRoomNumber(data.room_number)
      }
    }
    fetchRoom()
  }, [roomId])

  // Real-time tracker subscription
  useEffect(() => {
    if (!activeRequest) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`task_${activeRequest.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${activeRequest.id}` },
        (payload: { new: { status: string } }) => {
          const s = payload.new?.status
          if (s === 'CLAIMED' || s === 'RESOLVED') {
            setActiveRequest(prev => prev ? { ...prev, status: s as 'CLAIMED' | 'RESOLVED' } : null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeRequest])

  const openModal = (item: TaskItem) => {
    setSelectedItem(item)
    setIsCustom(false)
    setQuantity(1)
    setNotes('')
    setStep('modal')
  }

  const openCustom = () => {
    setSelectedItem(null)
    setIsCustom(true)
    setCustomText('')
    setQuantity(1)
    setNotes('')
    setStep('modal')
  }

  const executeSubmit = useCallback(async (phoneOverride?: string) => {
    if (!roomId) return
    if (isCustom && !customText.trim()) return
    setStep('submitting')

    const taskName = isCustom ? customText.trim() : selectedItem!.name
    const priority: TaskPriority = isCustom ? 'MEDIUM' : (selectedItem!.priority || 'MEDIUM')
    const targetDept: TargetDepartment = isCustom ? 'FRONT_DESK' : selectedItem!.target_department

    const phone = phoneOverride || getStoredGuestPhone()

    const payload: TaskPayload = {
      task_name: taskName,
      quantity,
      custom_notes: notes.trim() + (phone ? ` [Guest Phone: ${phone}]` : ''),
      priority,
      target_department: targetDept,
      catalog_item_id: isCustom ? undefined : selectedItem?.id,
      is_custom: isCustom,
      room_number: roomNumber || undefined,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('requests')
      .insert([{
        hotel_id: HOTEL_ID,
        room_id: roomId,
        request_type: 'TASK',
        status: 'PENDING',
        payload,
      }])
      .select('id')
      .single()

    if (!error && data?.id) {
      setActiveRequest({ id: data.id, taskName, status: 'PENDING' })
      setStep('tracking')

      // ── Fire Web Push to all active staff PWA devices ──
      try {
        const deptLabel = DEPT_CONFIG[targetDept as keyof typeof DEPT_CONFIG]?.label || targetDept
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelId: HOTEL_ID,
            title: `🛎️ Guest Request — ${deptLabel}${roomNumber ? ` (Room ${roomNumber})` : ''}`,
            body: `${quantity > 1 ? `${quantity}× ` : ''}${taskName}${notes.trim() ? ` — ${notes.trim()}` : ''}`,
            requestId: data.id,
            roomNumber,
            requestType: 'TASK',
            url: '/',
          }),
        })
      } catch {
        // Push dispatch is non-blocking — never fail the guest request on push error
      }
    } else {
      setStep('modal')
    }
  }, [roomId, isCustom, customText, selectedItem, quantity, notes, roomNumber])


  const handleSubmit = useCallback(() => {
    const phone = getStoredGuestPhone()
    if (!phone) {
      setShowPhoneModal(true)
    } else {
      executeSubmit(phone)
    }
  }, [executeSubmit])

  // Group items by department
  const grouped = items.reduce<Record<string, TaskItem[]>>((acc, item) => {
    const d = item.target_department
    if (!acc[d]) acc[d] = []
    acc[d].push(item)
    return acc
  }, {})

  const allDepts = Object.keys(grouped) as TargetDepartment[]
  const displayedDepts = activeDeptFilter === 'ALL'
    ? allDepts
    : activeDeptFilter === 'CUSTOM'
    ? []
    : allDepts.filter(d => d === activeDeptFilter)

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 px-4 sm:px-6 py-6 pb-28">
      <div className="bg-orb bg-orb-1" style={{ opacity: 0.18 }} />
      <div className="bg-orb bg-orb-2" style={{ opacity: 0.15 }} />

      <div className="relative z-10 max-w-lg mx-auto space-y-6">

        {/* Top Prominent Back Button & Room Status Header */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <a
            href={`/app/stay?room=${roomId}&hash=${hash}`}
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 text-white font-bold text-sm shadow-lg transition-all"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <span className="text-base font-extrabold">←</span>
            <span>Back to Concierge</span>
          </a>

          {roomNumber && (
            <div className="px-4 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 font-extrabold text-xs tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
              <span>🚪</span> Room {roomNumber}
            </div>
          )}
        </div>

        {/* Hero Section */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-2xl shadow-inner mb-1">
            🛎️
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Room Services</h1>
          <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
            Need anything delivered or fixed? Choose a service below and our hotel team will attend to you promptly.
          </p>
        </div>

        {/* Department Filter Pills (Mobile Horizontal Scroll) */}
        {step === 'grid' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none justify-start sm:justify-center">
            <button
              onClick={() => setActiveDeptFilter('ALL')}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                activeDeptFilter === 'ALL'
                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30 scale-105'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              🌟 All Services
            </button>
            {allDepts.map(dept => {
              const cfg = DEPT_CONFIG[dept]
              const isActive = activeDeptFilter === dept
              return (
                <button
                  key={dept}
                  onClick={() => setActiveDeptFilter(dept)}
                  className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isActive
                      ? 'border-transparent text-white shadow-md scale-105'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                  style={{
                    backgroundColor: isActive ? cfg.color : undefined,
                    boxShadow: isActive ? `0 4px 14px ${cfg.color}50` : undefined,
                  }}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              )
            })}
            <button
              onClick={() => setActiveDeptFilter('CUSTOM')}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                activeDeptFilter === 'CUSTOM'
                  ? 'bg-slate-700 border-slate-500 text-white shadow-md scale-105'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>✍️</span>
              <span>Custom</span>
            </button>
          </div>
        )}

        {/* Grid View */}
        {step === 'grid' && (
          <div className="space-y-7">
            {loading ? (
              <div className="text-center py-20 text-slate-400 font-medium space-y-3">
                <div className="text-4xl animate-bounce">🛎️</div>
                <p>Loading hotel room services...</p>
              </div>
            ) : (
              <>
                {displayedDepts.map(dept => {
                  const cfg = DEPT_CONFIG[dept]
                  const deptItems = grouped[dept] || []
                  if (deptItems.length === 0) return null

                  return (
                    <div key={dept} className="space-y-3.5">
                      {/* Department Divider Header */}
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                        <div
                          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border shadow-sm"
                          style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                        >
                          <span className="text-base">{cfg.icon}</span>
                          <span
                            className="text-xs font-extrabold tracking-wider uppercase"
                            style={{ color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                      </div>

                      {/* Touch-Optimized 2-Column Grid */}
                      <div className="grid grid-cols-2 gap-3.5">
                        {deptItems.map((item, idx) => {
                          const emoji = getTaskEmoji(item.name, dept)
                          // If odd number of items, make the last one span 2 columns if desired, or keep neat 2-col
                          const isLastOdd = deptItems.length % 2 !== 0 && idx === deptItems.length - 1

                          return (
                            <button
                              key={item.id}
                              onClick={() => openModal(item)}
                              className={`group text-center p-4 sm:p-5 rounded-3xl border transition-all duration-200 active:scale-[0.96] flex flex-col items-center justify-between shadow-lg relative overflow-hidden ${
                                isLastOdd ? 'col-span-2 sm:col-span-1 min-h-[135px]' : 'min-h-[140px]'
                              }`}
                              style={{
                                background: `linear-gradient(150deg, ${cfg.bg}, rgba(15, 23, 42, 0.9))`,
                                borderColor: cfg.border,
                              }}
                            >
                              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl mb-2 bg-white/5 border border-white/10 group-active:scale-90 transition-transform">
                                {emoji}
                              </div>
                              <div className="font-bold text-sm text-slate-100 leading-snug text-center px-1 mb-1">
                                {item.name}
                              </div>
                              <div className="text-[11px] text-slate-300 mt-1 px-2.5 py-0.5 rounded-full bg-black/40 border border-white/10 font-semibold flex items-center gap-1">
                                <span>⏱</span> {item.target_sla_mins} min SLA
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Custom Request Section */}
                {(activeDeptFilter === 'ALL' || activeDeptFilter === 'CUSTOM') && (
                  <div className="space-y-3.5 pt-1">
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <span className="text-base">✍️</span>
                        <span className="text-xs font-extrabold tracking-wider uppercase text-slate-300">
                          Custom Request
                        </span>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    </div>

                    <button
                      onClick={openCustom}
                      className="w-full p-5 sm:p-6 rounded-3xl border border-white/15 text-center flex flex-col items-center justify-center transition-all duration-200 hover:border-indigo-500/50 hover:bg-indigo-500/10 active:scale-[0.97] min-h-[130px] shadow-xl"
                      style={{ background: 'linear-gradient(150deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.9))' }}
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl mb-2 bg-white/5 border border-white/10">
                        ✍️
                      </div>
                      <div className="font-extrabold text-base text-white">Other / Custom Request</div>
                      <div className="text-xs text-slate-400 mt-1 max-w-xs">
                        Need something specific? Tap here to describe your request to our team.
                      </div>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Modal Sheet - Mobile-Optimized Bottom Sheet / Centered Modal */}
        {step === 'modal' && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
          >
            <div
              className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/20 p-6 space-y-5 text-center animate-fade-up shadow-2xl"
              style={{ background: '#0f172a' }}
            >
              {/* Modal Handle Bar for Mobile */}
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 mb-2 sm:hidden" />

              {isCustom ? (
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl mx-auto">
                    ✍️
                  </div>
                  <h2 className="text-xl font-extrabold text-white">Custom Request</h2>
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-2 uppercase tracking-wider">
                      What can we bring or do for your room? *
                    </label>
                    <textarea
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                      placeholder="e.g. Extra pillows, iron & board, bottle of water..."
                      rows={3}
                      className="w-full p-4 rounded-2xl bg-white/5 border border-white/15 text-slate-100 text-base resize-none focus:outline-none focus:border-indigo-500 text-center placeholder:text-slate-500 font-medium"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center text-4xl mx-auto shadow-inner">
                    {getTaskEmoji(selectedItem?.name || '', selectedItem?.target_department || 'FRONT_DESK')}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white">{selectedItem?.name}</h2>
                    {selectedItem?.description && (
                      <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                        {selectedItem.description}
                      </p>
                    )}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/10 text-xs text-slate-300 font-semibold mt-2">
                      <span>⏱</span> Estimated delivery: {selectedItem?.target_sla_mins} mins
                    </div>
                  </div>

                  {/* Quantity adjustment with 56px touch target buttons */}
                  <div className="pt-2">
                    <label className="text-xs font-bold text-slate-400 block mb-3 uppercase tracking-wider">
                      Select Quantity
                    </label>
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                        className="w-14 h-14 rounded-2xl bg-white/10 text-2xl font-bold flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all text-white border border-white/15 shadow-md"
                      >
                        −
                      </button>
                      <span className="text-3xl font-black w-12 text-center text-white">{quantity}</span>
                      <button
                        onClick={() => setQuantity(q => Math.min(10, q + 1))}
                        aria-label="Increase quantity"
                        className="w-14 h-14 rounded-2xl bg-white/10 text-2xl font-bold flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all text-white border border-white/15 shadow-md"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="text-center">
                <label className="text-xs font-bold text-slate-400 block mb-2 uppercase tracking-wider">
                  Special Instructions <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Please leave by the door, urgent request..."
                  rows={2}
                  className="w-full p-3.5 rounded-2xl bg-white/5 border border-white/15 text-slate-100 text-sm resize-none focus:outline-none focus:border-indigo-500 text-center placeholder:text-slate-500"
                />
              </div>

              {/* Large Touch Target Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('grid')}
                  className="flex-1 py-4 px-5 rounded-2xl bg-white/10 border border-white/15 text-slate-300 font-bold text-base hover:bg-white/15 transition-all min-h-[56px] active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isCustom && !customText.trim()}
                  className="flex-[2] py-4 px-5 rounded-2xl font-black text-base text-white transition-all shadow-xl min-h-[56px] active:scale-95 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    opacity: (isCustom && !customText.trim()) ? 0.5 : 1,
                  }}
                >
                  <span>🚀</span> Send Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submitting State */}
        {step === 'submitting' && (
          <div className="text-center py-24 space-y-4">
            <div className="text-6xl animate-bounce">⏳</div>
            <p className="text-white text-xl font-extrabold">Sending your request...</p>
            <p className="text-slate-400 text-sm">Connecting directly with hotel staff</p>
          </div>
        )}

        {/* Live Status Tracker */}
        {step === 'tracking' && activeRequest && (
          <div className="rounded-3xl border border-white/15 p-6 sm:p-8 space-y-7 text-center shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-center space-y-2">
              <div className="text-5xl mb-1">
                {activeRequest.status === 'RESOLVED' ? '✅' : activeRequest.status === 'CLAIMED' ? '🏃' : '📨'}
              </div>
              <h2 className="text-2xl font-black text-white">{activeRequest.taskName}</h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider">
                ● Live Request Status
              </div>
            </div>

            {/* Progress bar steps */}
            <div className="space-y-4 max-w-xs mx-auto text-left pt-2">
              {[
                { key: 'PENDING', label: 'Request Received', desc: 'Hotel staff notified', icon: '📨' },
                { key: 'CLAIMED', label: 'Staff Assigned', desc: 'Team member attended to task', icon: '🏃' },
                { key: 'RESOLVED', label: 'Completed', desc: 'Your request has been fulfilled', icon: '✅' },
              ].map((s, i) => {
                const statusOrder = ['PENDING', 'CLAIMED', 'RESOLVED']
                const currentIdx = statusOrder.indexOf(activeRequest.status)
                const stepIdx = statusOrder.indexOf(s.key)
                const isDone = stepIdx <= currentIdx
                const isActive = stepIdx === currentIdx

                return (
                  <div key={s.key} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold transition-all duration-500 shadow-md ${
                          isDone ? 'bg-indigo-600 text-white shadow-indigo-600/40' : 'bg-white/10 text-slate-500 border border-white/10'
                        }`}
                      >
                        {isDone ? s.icon : <span>{i + 1}</span>}
                      </div>
                      {i < 2 && (
                        <div
                          className={`w-0.5 h-10 mt-1 transition-all duration-500 ${
                            stepIdx < currentIdx ? 'bg-indigo-500' : 'bg-white/10'
                          }`}
                        />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <div className={`font-bold text-sm ${isActive ? 'text-indigo-300 font-extrabold' : isDone ? 'text-slate-200' : 'text-slate-600'}`}>
                        {s.label}
                      </div>
                      {(isActive || isDone) && <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            {activeRequest.status === 'RESOLVED' ? (
              <button
                onClick={() => { setStep('grid'); setActiveRequest(null) }}
                className="w-full py-4 rounded-2xl font-black text-base text-white shadow-xl min-h-[56px] active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                Make Another Request
              </button>
            ) : (
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-400">
                💡 This screen updates automatically. You can safely close or switch tabs.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Floating Action Button for Front Desk Call */}
      <FrontDeskFAB roomId={roomId} roomNumber={roomNumber} hotelId={HOTEL_ID} />

      <PhoneCaptureModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={(phone) => {
          setShowPhoneModal(false)
          executeSubmit(phone)
        }}
        roomId={roomId || ''}
        hotelId={HOTEL_ID}
      />
    </main>
  )
}

export default function GuestRequestsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading Requests…</div>}>
      <GuestRequestsContent />
    </Suspense>
  )
}
