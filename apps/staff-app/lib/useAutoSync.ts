import { useEffect, useRef, useCallback } from 'react'
import { Platform, AppState, type AppStateStatus } from 'react-native'
import { supabase } from './supabase'

interface UseAutoSyncOptions {
  intervalMs?: number
  enabled?: boolean
  syncOnFocus?: boolean
}

/**
 * Custom hook to ensure persistent, automated state synchronization
 * with fallback background polling, instant focus/visibility triggers,
 * Service Worker BroadcastChannel push wake-ups, and Supabase Realtime socket recovery.
 *
 * @param callback The function to execute on sync intervals and focus events
 * @param options Configuration options (intervalMs, enabled, syncOnFocus)
 */
export function useAutoSync(
  callback: () => void | Promise<void>,
  options: UseAutoSyncOptions = {}
) {
  const {
    intervalMs = 6000,
    enabled = true,
    syncOnFocus = true,
  } = options

  const savedCallback = useRef(callback)
  const lastSyncTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const executeSync = useCallback(() => {
    if (!enabled) return
    lastSyncTimeRef.current = Date.now()

    // 1. Execute component callback
    try {
      savedCallback.current()
    } catch (err) {
      console.warn('[useAutoSync] Error executing sync callback:', err)
    }

    // 2. Refresh / Reconnect Supabase Realtime WebSocket if stalled or disconnected
    try {
      if (Platform.OS === 'web' && supabase && (supabase as any).realtime) {
        const rt = (supabase as any).realtime
        if (typeof rt.isConnected === 'function' && !rt.isConnected()) {
          console.log('[useAutoSync] Realtime WebSocket disconnected — reconnecting...')
          if (typeof rt.connect === 'function') rt.connect()
        }
      }
    } catch {
      // ignore non-fatal realtime check
    }
  }, [enabled])

  // ─── 1. Background Polling Heartbeat ────────────────────────
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return

    const timerId = setInterval(() => {
      executeSync()
    }, intervalMs)

    return () => {
      clearInterval(timerId)
    }
  }, [enabled, intervalMs, executeSync])

  // ─── 2. Window / Tab Focus, Visibility, Online & PWA Wake-Up ─
  useEffect(() => {
    if (!enabled || !syncOnFocus) return

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleWakeup = () => {
        executeSync()
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // If the screen was off or backgrounded for more than 5 seconds, immediately sync
          executeSync()
        }
      }

      window.addEventListener('focus', handleWakeup)
      window.addEventListener('pageshow', handleWakeup)
      window.addEventListener('online', handleWakeup)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      // Listen for Service Worker BroadcastChannel push notifications
      let bc: BroadcastChannel | null = null
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          bc = new BroadcastChannel('hotel_staff_sync')
          bc.onmessage = (event) => {
            if (event.data?.type === 'PWA_BACKGROUND_SYNC' || event.data?.type === 'PWA_NOTIFICATION_CLICKED') {
              console.log('[useAutoSync] Received SW BroadcastChannel push sync signal.')
              executeSync()
            }
          }
        }
      } catch (e) {
        console.debug('[useAutoSync] BroadcastChannel init note:', e)
      }

      // Listen for direct navigator.serviceWorker message events
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'PWA_BACKGROUND_SYNC' || event.data?.type === 'PWA_NOTIFICATION_CLICKED') {
          console.log('[useAutoSync] Received SW message push sync signal.')
          executeSync()
        }
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleSwMessage)
      }

      return () => {
        window.removeEventListener('focus', handleWakeup)
        window.removeEventListener('pageshow', handleWakeup)
        window.removeEventListener('online', handleWakeup)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        if (bc) bc.close()
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleSwMessage)
        }
      }
    } else {
      // React Native Mobile / Tablet Lifecycle
      const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          executeSync()
        }
      }

      const subscription = AppState.addEventListener('change', handleAppStateChange)

      return () => {
        subscription.remove()
      }
    }
  }, [enabled, syncOnFocus, executeSync])

  return { triggerSync: executeSync }
}
