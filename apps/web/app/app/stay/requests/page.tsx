'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@hotel-qr/supabase/types'
import type { CatalogItem, TaskPayload, TaskPriority, TargetDepartment } from '@hotel-qr/supabase/types'

import PhoneCaptureModal, { getStoredGuestPhone } from '../components/PhoneCaptureModal'

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    // Realtime subscription handles all status updates — no polling needed.

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeRequest?.id])

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
    <main className="relative min-h-screen bg-slate-950 text-slate-100 px-5 py-10">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div className="relative z-10 max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <a href={`/app/stay?room=${roomId}&hash=${hash}`} className="text-slate-500 text-sm hover:text-slate-300 transition-colors">← Back</a>
            <h1 className="text-2xl font-bold mt-1">Room Requests</h1>
            <p className="text-slate-400 text-sm">We&apos;ll send staff right away.</p>
          </div>
        </div>

        {/* Grid */}
        {step === 'grid' && (
          <>
            {loading ? (
              <div className="text-center py-16 text-slate-500">Loading requests...</div>
            ) : (
              <>
                {depts.map(dept => {
                  const cfg = DEPT_CONFIG[dept]
                  return (
                    <div key={dept}>
                      <div className="flex items-center gap-2 mb-3">
                        <span>{cfg.icon}</span>
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: cfg.color }}>{cfg.label}</span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {grouped[dept].map(item => (
                          <button
                            key={item.id}
                            onClick={() => openModal(item)}
                            className="text-left p-4 rounded-2xl border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: cfg.bg, borderColor: `${cfg.color}30` }}
                          >
                            <div className="text-2xl mb-2">🛎️</div>
                            <div className="font-bold text-sm text-slate-100 leading-tight">{item.name}</div>
                            <div className="text-xs text-slate-400 mt-1">⏱ {item.target_sla_mins} min SLA</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Custom Request */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span>✍️</span>
                    <span className="text-xs font-bold tracking-widest uppercase text-slate-500">Other</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <button
                    onClick={openCustom}
                    className="w-full p-4 rounded-2xl border border-white/10 text-left transition-all hover:border-white/20 hover:bg-white/5"
                  >
                    <div className="text-2xl mb-2">✍️</div>
                    <div className="font-bold text-sm text-slate-100">Other Request</div>
                    <div className="text-xs text-slate-400 mt-1">Describe what you need</div>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Modal Sheet */}
        {step === 'modal' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-md rounded-3xl border border-white/10 p-6 space-y-5" style={{ background: '#0f172a' }}>
              {isCustom ? (
                <>
                  <h2 className="text-xl font-bold">✍️ Other Request</h2>
                  <div>
                    <label className="text-sm font-semibold text-slate-400 block mb-2">What do you need? *</label>
                    <textarea
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                      placeholder="Describe your request..."
                      rows={3}
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm resize-none focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 className="text-xl font-bold">{selectedItem?.name}</h2>
                    {selectedItem?.description && <p className="text-sm text-slate-400 mt-1">{selectedItem.description}</p>}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="text-sm font-semibold text-slate-400 block mb-3">Quantity</label>
                    <div className="flex items-center gap-4">
                      <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-full bg-white/10 text-xl font-bold flex items-center justify-center hover:bg-white/20 transition-colors">−</button>
                      <span className="text-2xl font-bold w-8 text-center">{quantity}</span>
                      <button onClick={() => setQuantity(q => Math.min(10, q + 1))}
                        className="w-10 h-10 rounded-full bg-white/10 text-xl font-bold flex items-center justify-center hover:bg-white/20 transition-colors">+</button>
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="text-sm font-semibold text-slate-400 block mb-2">Additional Notes <span className="text-slate-600">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any special instructions..."
                  rows={2}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-sm resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('grid')} className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-bold text-sm hover:bg-white/10 transition-colors">Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={isCustom && !customText.trim()}
                  className="flex-[2] py-3 rounded-2xl font-bold text-sm text-white transition-colors"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: (isCustom && !customText.trim()) ? 0.5 : 1 }}
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submitting */}
        {step === 'submitting' && (
          <div className="text-center py-20 space-y-4">
            <div className="text-5xl animate-spin">⏳</div>
            <p className="text-slate-400 font-medium">Sending your request...</p>
          </div>
        )}

        {/* Status Tracker */}
        {step === 'tracking' && activeRequest && (
          <div className="rounded-3xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-center space-y-2">
              <div className="text-4xl">
                {activeRequest.status === 'RESOLVED' ? '✅' : activeRequest.status === 'CLAIMED' ? '🏃' : '📨'}
              </div>
              <h2 className="text-xl font-bold">{activeRequest.taskName}</h2>
            </div>

            {/* Progress bar */}
            <div className="space-y-3">
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
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${isDone ? 'bg-indigo-500' : 'bg-white/10'}`}>
                        {isDone ? s.icon : <span className="text-slate-600 text-sm">{i + 1}</span>}
                      </div>
                      {i < 2 && <div className={`w-0.5 h-8 mt-1 transition-all duration-500 ${stepIdx < currentIdx ? 'bg-indigo-500' : 'bg-white/10'}`} />}
                    </div>
                    <div className="pt-1.5">
                      <div className={`font-bold text-sm ${isActive ? 'text-indigo-300' : isDone ? 'text-slate-200' : 'text-slate-600'}`}>{s.label}</div>
                      {(isActive || isDone) && <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            {activeRequest.status === 'RESOLVED' ? (
              <button onClick={() => { setStep('grid'); setActiveRequest(null) }}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                Make Another Request
              </button>
            ) : (
              <p className="text-center text-xs text-slate-500">This page updates automatically — you can minimise it.</p>
            )}
          </div>
        )}
      </div>

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
