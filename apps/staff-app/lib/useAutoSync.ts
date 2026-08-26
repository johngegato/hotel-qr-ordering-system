import { useEffect, useRef, useCallback } from 'react'
import { Platform, AppState, type AppStateStatus } from 'react-native'

interface UseAutoSyncOptions {
  intervalMs?: number
  enabled?: boolean
  syncOnFocus?: boolean
}

/**
 * Custom hook to ensure persistent, automated state synchronization
 * with fallback background polling and instant focus/visibility change triggers.
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

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const executeSync = useCallback(() => {
    if (!enabled) return
    try {
      savedCallback.current()
    } catch (err) {
      console.warn('[useAutoSync] Error executing sync callback:', err)
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

  // ─── 2. Window / Tab Focus & Visibility Handlers ────────────
  useEffect(() => {
    if (!enabled || !syncOnFocus) return

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleFocus = () => {
        executeSync()
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          executeSync()
        }
      }

      window.addEventListener('focus', handleFocus)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
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
