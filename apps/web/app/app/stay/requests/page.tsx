'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Database } from '@hotel-qr/supabase/types'
import type { CatalogItem, TaskPayload, TaskPriority, TargetDepartment } from '@hotel-qr/supabase/types'

import PhoneCaptureModal, { getStoredGuestPhone } from '../components/PhoneCaptureModal'
import FrontDeskFAB from '../components/FrontDeskFAB'

const supabase = createSupabaseBrowserClient()

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

type TaskItem = CatalogItem & { priority: TaskPriority; target_sla_mins: number; target_department: TargetDepartment }

const DEPT_CONFIG: Record<TargetDepartment | 'CUSTOM', { label: string; icon: string; color: string; bg: string }> = {
  HOUSEKEEPING: { label: 'Housekeeping', icon: '🧹', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  MAINTENANCE:  { label: 'Maintenance',  icon: '🔧', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  FRONT_DESK:   { label: 'Front Desk',   icon: '🎩', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  CUSTOM:       { label: 'Other',        icon: '✍️', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
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
    } else {
      setStep('modal')
    }
  }, [roomId, isCustom, customText, selectedItem, quantity, notes])

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

  const depts = Object.keys(grouped) as TargetDepartment[]

  const hash = searchParams.get('hash') ?? ''

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 px-5 py-10 pb-28">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div className="relative z-10 max-w-lg mx-auto space-y-8">
        {/* Header - Center Aligned */}
        <div className="text-center flex flex-col items-center space-y-2">
          <a
            href={`/app/stay?room=${roomId}&hash=${hash}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold hover:text-white hover:bg-white/10 transition-all mb-1"
          >
            ← Back to Concierge
          </a>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Room Services</h1>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Select a service request below and our team will attend to your room immediately.
          </p>
        </div>

        {/* Grid - Center Aligned items with enlarged touch targets */}
        {step === 'grid' && (
          <div className="space-y-8">
            {loading ? (
              <div className="text-center py-20 text-slate-500 font-medium animate-pulse">
                Loading service options...
              </div>
            ) : (
              <>
                {depts.map(dept => {
                  const cfg = DEPT_CONFIG[dept]
                  return (
                    <div key={dept} className="space-y-4">
                      {/* Department Divider Header */}
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                          <span className="text-base">{cfg.icon}</span>
                          <span
                            className="text-xs font-extrabold tracking-widest uppercase"
                            style={{ color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                      </div>

                      {/* Touch-optimized Card Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        {grouped[dept].map(item => (
                          <button
                            key={item.id}
                            onClick={() => openModal(item)}
                            className="group text-center p-5 rounded-3xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] min-h-[140px] flex flex-col items-center justify-center shadow-lg hover:shadow-2xl relative overflow-hidden"
                            style={{
                              background: `linear-gradient(145deg, ${cfg.bg}, rgba(15, 23, 42, 0.7))`,
                              borderColor: `${cfg.color}35`,
                            }}
                          >
                            <div className="text-4xl mb-3 transform group-hover:scale-110 transition-transform">
                              🛎️
                            </div>
                            <div className="font-bold text-sm text-slate-100 leading-snug text-center px-1">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-2 px-2.5 py-0.5 rounded-full bg-black/30 border border-white/5 font-medium">
                              ⏱ {item.target_sla_mins} min SLA
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Custom Request Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                      <span className="text-base">✍️</span>
                      <span className="text-xs font-extrabold tracking-widest uppercase text-slate-400">
                        Custom Request
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  <button
                    onClick={openCustom}
                    className="w-full p-6 rounded-3xl border border-white/15 text-center flex flex-col items-center justify-center transition-all duration-300 hover:border-indigo-500/50 hover:bg-indigo-500/10 active:scale-[0.98] min-h-[130px] shadow-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                  >
                    <div className="text-4xl mb-2">✍️</div>
                    <div className="font-bold text-base text-slate-100">Other Request</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Need something else? Tap to describe your custom request
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Modal Sheet - Perfectly Centered Horizontally and Vertically */}
        {step === 'modal' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-md rounded-3xl border border-white/15 p-6 space-y-6 text-center animate-fade-up" style={{ background: '#0f172a' }}>
              {isCustom ? (
                <div className="space-y-3">
                  <div className="text-4xl">✍️</div>
                  <h2 className="text-xl font-bold text-white">Other Request</h2>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
                      What can we bring to your room? *
                    </label>
                    <textarea
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                      placeholder="e.g. Extra pillows, extra towels, iron..."
                      rows={3}
                      className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-100 text-base resize-none focus:outline-none focus:border-indigo-500 text-center placeholder:text-slate-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-4xl">🛎️</div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-white">{selectedItem?.name}</h2>
                    {selectedItem?.description && (
                      <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">{selectedItem.description}</p>
                    )}
                  </div>

                  {/* Quantity adjustment with 56px touch target buttons */}
                  <div className="pt-2">
                    <label className="text-xs font-semibold text-slate-400 block mb-3 uppercase tracking-wider">Quantity</label>
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                        className="w-14 h-14 rounded-2xl bg-white/10 text-2xl font-bold flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-slate-200 border border-white/10"
                      >
                        −
                      </button>
                      <span className="text-3xl font-extrabold w-10 text-center text-white">{quantity}</span>
                      <button
                        onClick={() => setQuantity(q => Math.min(10, q + 1))}
                        aria-label="Increase quantity"
                        className="w-14 h-14 rounded-2xl bg-white/10 text-2xl font-bold flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-slate-200 border border-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="text-center">
                <label className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
                  Special Notes <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any special instructions for staff..."
                  rows={2}
                  className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-100 text-sm resize-none focus:outline-none focus:border-indigo-500 text-center placeholder:text-slate-500"
                />
              </div>

              {/* Enlarge Modal Touch Target Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('grid')}
                  className="flex-1 py-4 px-5 rounded-2xl bg-white/10 border border-white/10 text-slate-300 font-bold text-base hover:bg-white/15 transition-all min-h-[54px] active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isCustom && !customText.trim()}
                  className="flex-[2] py-4 px-5 rounded-2xl font-extrabold text-base text-white transition-all shadow-xl min-h-[54px] active:scale-95 flex items-center justify-center gap-2"
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

        {/* Submitting - Center Aligned */}
        {step === 'submitting' && (
          <div className="text-center py-24 space-y-4">
            <div className="text-6xl animate-bounce">⏳</div>
            <p className="text-slate-300 text-lg font-bold">Sending your request...</p>
            <p className="text-slate-500 text-xs">Connecting with hotel staff</p>
          </div>
        )}

        {/* Status Tracker - Center Aligned */}
        {step === 'tracking' && activeRequest && (
          <div className="rounded-3xl border border-white/15 p-8 space-y-8 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-center space-y-2">
              <div className="text-5xl mb-2">
                {activeRequest.status === 'RESOLVED' ? '✅' : activeRequest.status === 'CLAIMED' ? '🏃' : '📨'}
              </div>
              <h2 className="text-2xl font-extrabold text-white">{activeRequest.taskName}</h2>
              <p className="text-xs text-indigo-400 font-semibold tracking-wide uppercase">Request Status</p>
            </div>

            {/* Progress bar steps */}
            <div className="space-y-4 max-w-xs mx-auto text-left">
              {[
                { key: 'PENDING', label: 'Request Received', desc: 'We\'ve received your request', icon: '📨' },
                { key: 'CLAIMED', label: 'Staff Assigned', desc: 'A staff member is on their way', icon: '🏃' },
                { key: 'RESOLVED', label: 'Task Completed', desc: 'Your request has been fulfilled', icon: '✅' },
              ].map((s, i) => {
                const statusOrder = ['PENDING', 'CLAIMED', 'RESOLVED']
                const currentIdx = statusOrder.indexOf(activeRequest.status)
                const stepIdx = statusOrder.indexOf(s.key)
                const isDone = stepIdx <= currentIdx
                const isActive = stepIdx === currentIdx

                return (
                  <div key={s.key} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${isDone ? 'bg-indigo-500 text-white shadow-lg' : 'bg-white/10 text-slate-500'}`}>
                        {isDone ? s.icon : <span className="text-xs font-bold">{i + 1}</span>}
                      </div>
                      {i < 2 && <div className={`w-0.5 h-10 mt-1 transition-all duration-500 ${stepIdx < currentIdx ? 'bg-indigo-500' : 'bg-white/10'}`} />}
                    </div>
                    <div className="pt-2">
                      <div className={`font-bold text-sm ${isActive ? 'text-indigo-300' : isDone ? 'text-slate-200' : 'text-slate-600'}`}>{s.label}</div>
                      {(isActive || isDone) && <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            {activeRequest.status === 'RESOLVED' ? (
              <button
                onClick={() => { setStep('grid'); setActiveRequest(null) }}
                className="w-full py-4 rounded-2xl font-extrabold text-base text-white shadow-xl min-h-[54px]"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                Make Another Request
              </button>
            ) : (
              <p className="text-center text-xs text-slate-500">
                This screen updates automatically. You can safely close or minimize this tab.
              </p>
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
