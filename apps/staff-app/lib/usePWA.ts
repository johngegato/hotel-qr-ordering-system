import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// The VAPID public key — must match what is on the server
// In Expo web builds, env vars are prefixed with EXPO_PUBLIC_
const VAPID_PUBLIC_KEY =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) ||
  'BDZiJJ2o83qDdtVUQaVEEekgX3KVABFYZZzCRM76dtNgyEp3Sxe4TT9cBmcNcDTQ9RUIcQUjD0tu9pCoWkH4Xkg'

// The Next.js web server URL (staff-app posts subscriptions to apps/web API)
const WEB_SERVER_URL =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_WEB_SERVER_URL || process.env.NEXT_PUBLIC_WEB_SERVER_URL)) ||
  'http://localhost:3000'

const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PWAState {
  canInstall: boolean
  isInstalled: boolean
  isStandalone: boolean
  notificationPermission: NotificationPermission | 'unsupported'
  promptInstall: () => Promise<boolean>
  requestNotificationPermission: () => Promise<boolean>
}

/** Convert a base64 VAPID public key to a Uint8Array for the PushManager API */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i)
  }
  return view
}

/** Save the push subscription to the hotel web server (apps/web API) */
async function savePushSubscription(subscription: PushSubscription, staffUserId?: string | null): Promise<void> {
  try {
    const body = JSON.stringify({
      subscription: subscription.toJSON(),
      staffUserId: staffUserId || null,
      hotelId: HOTEL_ID,
    })

    const res = await fetch(`${WEB_SERVER_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!res.ok) {
      const err = await res.text()
      console.warn('[PWA] Failed to save push subscription to server:', err)
    } else {
      console.log('[PWA] Push subscription saved successfully.')
    }
  } catch (err) {
    console.warn('[PWA] Error saving push subscription:', err)
  }
}

export function usePWA(activeStaffId?: string | null): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')

  // ─── Detect Standalone Mode (PWA installed) ──────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return

    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      setIsStandalone(isStandaloneMode)
      if (isStandaloneMode) {
        setIsInstalled(true)
        setCanInstall(false)
      }
    }

    checkStandalone()

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches)
      if (e.matches) setIsInstalled(true)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [])

  // ─── Register Service Worker ─────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // Ensure manifest and meta tags exist in <head>
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link')
        link.rel = 'manifest'
        link.href = '/manifest.json'
        document.head.appendChild(link)
      }
      if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
        const meta = document.createElement('meta')
        meta.name = 'mobile-web-app-capable'
        meta.content = 'yes'
        document.head.appendChild(meta)
      }
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        const meta = document.createElement('meta')
        meta.name = 'apple-mobile-web-app-capable'
        meta.content = 'yes'
        document.head.appendChild(meta)
      }
    } catch {
      // ignore
    }

    // Register sw.js
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker registered with scope:', registration.scope)

        // Check for SW updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version available.')
              }
            })
          }
        })
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err)
      })

    // Listen for beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setCanInstall(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      setDeferredPrompt(null)
      console.log('[PWA] App successfully installed on device.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check Notification support
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // ─── Prompt Install ──────────────────────────────────────────────────────────
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
        setCanInstall(false)
        setDeferredPrompt(null)
        return true
      }
      return false
    } catch (err) {
      console.warn('[PWA] Install prompt failed:', err)
      return false
    }
  }, [deferredPrompt])

  // ─── Request Notification Permission + Subscribe to Web Push ─────────────────
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)

      if (permission === 'granted' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready

        if ('pushManager' in registration) {
          try {
            // Check if a subscription already exists
            let subscription = await registration.pushManager.getSubscription()

            if (!subscription) {
              // Create a new Web Push subscription using the VAPID public key
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
              })
              console.log('[PWA] Created new Web Push subscription.')
            } else {
              console.log('[PWA] Existing Web Push subscription found.')
            }

            // Save the subscription endpoint + keys to the hotel server
            if (subscription) {
              await savePushSubscription(subscription, activeStaffId)
            }
          } catch (e) {
            console.warn('[PWA] PushManager subscription error:', e)
          }
        }

        // Also record notification permission granted in staff_users metadata
        if (activeStaffId) {
          try {
            await (supabase as any)
              .from('staff_users')
              .update({ push_token: `web_pwa_${Date.now()}` })
              .eq('id', activeStaffId)
          } catch {
            // ignore non-fatal
          }
        }
      }

      return permission === 'granted'
    } catch (err) {
      console.warn('[PWA] Notification permission request error:', err)
      return false
    }
  }, [activeStaffId])

  return {
    canInstall,
    isInstalled,
    isStandalone,
    notificationPermission,
    promptInstall,
    requestNotificationPermission,
  }
}
