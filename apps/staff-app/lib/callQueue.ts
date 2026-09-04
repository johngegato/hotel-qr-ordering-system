/**
 * Call Queue & Concurrency Management for Live Voice Calls
 * 
 * Handles multiple simultaneous incoming LIVE_CALL requests:
 * - Queues calls when staff is busy on another call
 * - Presents calls sequentially (FIFO)
 * - Tracks staff availability state
 * - Provides waiting count for UI indicators
 */

export interface QueuedCall {
  requestId: string
  channel: string
  roomNumber: string
  timestamp: number
  priority: 'normal' | 'high'
}

type QueueChangeListener = (queue: QueuedCall[], activeCallId: string | null) => void

class CallQueue {
  private queue: QueuedCall[] = []
  private activeCallId: string | null = null
  private listeners: Set<QueueChangeListener> = new Set()
  private maxQueueSize = 10 // Prevent unbounded growth

  /** Subscribe to queue changes */
  subscribe(listener: QueueChangeListener): () => void {
    this.listeners.add(listener)
    // Immediately call with current state
    listener(this.getQueueSnapshot(), this.activeCallId)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    const snapshot = this.getQueueSnapshot()
    this.listeners.forEach(l => l(snapshot, this.activeCallId))
  }

  private getQueueSnapshot(): QueuedCall[] {
    return [...this.queue].sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Add incoming call to queue */
  enqueue(call: QueuedCall): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[CallQueue] Queue full, rejecting new call:', call.requestId)
      return false
    }
    
    // Check for duplicate
    if (this.queue.some(c => c.requestId === call.requestId) || this.activeCallId === call.requestId) {
      console.warn('[CallQueue] Duplicate call ignored:', call.requestId)
      return false
    }

    this.queue.push(call)
    this.notify()
    console.log('[CallQueue] Enqueued:', call.requestId, '| Queue length:', this.queue.length)
    return true
  }

  /** Remove and return next call in queue (FIFO) */
  dequeue(): QueuedCall | null {
    if (this.queue.length === 0) return null
    
    const next = this.queue.shift()!
    this.activeCallId = next.requestId
    this.notify()
    console.log('[CallQueue] Dequeued (now active):', next.requestId, '| Remaining:', this.queue.length)
    return next
  }

  /** Mark current call as ended, auto-advance to next */
  completeActiveCall(): QueuedCall | null {
    const completed = this.activeCallId
    this.activeCallId = null
    
    if (this.queue.length > 0) {
      return this.dequeue() // Auto-advance to next
    }
    
    this.notify()
    console.log('[CallQueue] Call completed:', completed, '| Queue empty')
    return null
  }

  /** Staff manually ends current call (same as complete but explicit) */
  endActiveCall(): void {
    this.completeActiveCall()
  }

  /** Remove a specific call from queue (e.g., guest cancelled, or staff declined) */
  removeFromQueue(requestId: string): boolean {
    const idx = this.queue.findIndex(c => c.requestId === requestId)
    if (idx === -1) return false
    
    this.queue.splice(idx, 1)
    this.notify()
    console.log('[CallQueue] Removed from queue:', requestId)
    return true
  }

  /** Check if staff is currently on a call */
  isStaffBusy(): boolean {
    return this.activeCallId !== null
  }

  /** Get current active call ID */
  getActiveCallId(): string | null {
    return this.activeCallId
  }

  /** Get waiting calls count (excludes active) */
  getWaitingCount(): number {
    return this.queue.length
  }

  /** Get full queue including active call (for UI) */
  getAllCalls(): { active: QueuedCall | null; waiting: QueuedCall[] } {
    const active = this.activeCallId 
      ? this.queue.find(c => c.requestId === this.activeCallId) || null
      : null
    const waiting = this.queue.filter(c => c.requestId !== this.activeCallId)
    return { active, waiting }
  }

  /** Clear entire queue (e.g., on logout) */
  clear(): void {
    this.queue = []
    this.activeCallId = null
    this.notify()
  }

  /** Update priority of a queued call */
  setPriority(requestId: string, priority: 'normal' | 'high'): boolean {
    const call = this.queue.find(c => c.requestId === requestId)
    if (!call) return false
    call.priority = priority
    // Re-sort: high priority first, then by timestamp
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
      return a.timestamp - b.timestamp
    })
    this.notify()
    return true
  }
}

// Singleton instance
export const callQueue = new CallQueue()

// React hook for easy consumption
export function useCallQueue() {
  // This will be implemented via context in App.tsx
  // Provided here for type reference
  return {
    enqueue: callQueue.enqueue.bind(callQueue),
    dequeue: callQueue.dequeue.bind(callQueue),
    completeActiveCall: callQueue.completeActiveCall.bind(callQueue),
    endActiveCall: callQueue.endActiveCall.bind(callQueue),
    removeFromQueue: callQueue.removeFromQueue.bind(callQueue),
    isStaffBusy: callQueue.isStaffBusy.bind(callQueue),
    getActiveCallId: callQueue.getActiveCallId.bind(callQueue),
    getWaitingCount: callQueue.getWaitingCount.bind(callQueue),
    getAllCalls: callQueue.getAllCalls.bind(callQueue),
    subscribe: callQueue.subscribe.bind(callQueue),
    clear: callQueue.clear.bind(callQueue),
    setPriority: callQueue.setPriority.bind(callQueue),
  }
}

export type CallQueueType = ReturnType<typeof useCallQueue>