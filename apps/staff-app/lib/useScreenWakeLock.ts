import { useEffect, useState, useCallback, useRef } from 'react'
import { Platform } from 'react-native'

interface ScreenWakeLockState {
  isSupported: boolean
  isActive: boolean
  requestWakeLock: () => Promise<boolean>
  releaseWakeLock: () => Promise<void>
}

/**
 * Hook to manage the Screen Wake Lock API on mobile browsers & PWAs.
 * Keeps the tablet/phone screen awake and CPU active during shifts,
 * and automatically re-acquires the lock when the app regains visibility.
 */
export function useScreenWakeLock(): ScreenWakeLockState {
  const [isSupported, setIsSupported] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      setIsSupported(true)
    }
  }, [])

  const requestWakeLock = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false
    }

    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        return true
      }

      wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      setIsActive(true)

      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false)
        wakeLockRef.current = null
      })

      return true
    } catch (err) {
      console.debug('[WakeLock] Request note:', err)
      setIsActive(false)
      return false
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current && typeof wakeLockRef.current.release === 'function') {
        await wakeLockRef.current.release()
      }
    } catch (err) {
      console.debug('[WakeLock] Release note:', err)
    } finally {
      wakeLockRef.current = null
      setIsActive(false)
    }
  }, [])

  // Auto-acquire wake lock on mount and re-acquire upon visibility change
  useEffect(() => {
    if (!isSupported) return

    requestWakeLock()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseWakeLock()
    }
  }, [isSupported, requestWakeLock, releaseWakeLock])

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock,
  }
}
