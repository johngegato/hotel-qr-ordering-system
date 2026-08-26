import { useState, useEffect, useCallback, useRef } from 'react'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// The VAPID public key — matching the server
const VAPID_PUBLIC_KEY =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) ||
  'BDZiJJ2o83qDdtVUQaVEEekgX3KVABFYZZzCRM76dtNgyEp3Sxe4TT9cBmcNcDTQ9RUIcQUjD0tu9pCoWkH4Xkg'

const WEB_SERVER_URL =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_WEB_SERVER_URL || process.env.NEXT_PUBLIC_WEB_SERVER_URL)) ||
  ''

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

/** Convert a base64 VAPID public key to a Uint8Array for PushManager API */
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

/** Save the push subscription directly to Supabase and fallback to web server API */
async function savePushSubscription(subscription: PushSubscription, staffUserId?: string | null): Promise<boolean> {
  try {
    const json = subscription.toJSON()
    const endpoint = json.endpoint || subscription.endpoint
    const p256dh = json.keys?.p256dh || ''
    const auth = json.keys?.auth || ''

    if (!endpoint || !p256dh || !auth) {
      console.warn('[PWA] PushSubscription missing required keys:', json)
      return false
    }

    console.log('[PWA] Saving push subscription to Supabase...', { endpoint: endpoint.slice(0, 40) + '...' })

    // 1. Direct Supabase insertion (RLS policy allows insert/upsert)
    const { error } = await (supabase as any)
      .from('staff_push_subscriptions')
      .upsert(
        {
          hotel_id: HOTEL_ID,
          staff_user_id: staffUserId || null,
          endpoint,
          p256dh,
          auth,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'PWA',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error('[PWA] Direct Supabase push save error:', error)
    } else {
      console.log('[PWA] Push subscription saved directly to Supabase successfully! ✅')
    }

    // 2. Secondary API route backup if WEB_SERVER_URL is configured
    if (WEB_SERVER_URL && !WEB_SERVER_URL.includes('localhost')) {
      try {
        await fetch(`${WEB_SERVER_URL}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: json,
            staffUserId: staffUserId || null,
            hotelId: HOTEL_ID,
          }),
        })
      } catch (apiErr) {
        console.debug('[PWA] API route push sync note:', apiErr)
      }
    }

    return !error
  } catch (err) {
    console.error('[PWA] Unexpected error saving push subscription:', err)
    return false
  }
}

/** Core subscription handler that registers with ServiceWorker PushManager */
async function registerWebPushSubscription(staffUserId?: string | null): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return false
  }

  if (Notification.permission !== 'granted') {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready

    if (!('pushManager' in registration)) {
      console.warn('[PWA] PushManager is not supported in this browser.')
      return false
    }

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      console.log('[PWA] Registering new Web Push subscription with VAPID key...')
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      console.log('[PWA] New Web Push subscription created.')
    } else {
      console.log('[PWA] Existing Web Push subscription found, verifying with database...')
    }

    if (subscription) {
      return await savePushSubscription(subscription, staffUserId)
    }

    return false
  } catch (err: any) {
    console.error('[PWA] Failed to subscribe to Web Push:', err)
    return false
  }
}

export function usePWA(activeStaffId?: string | null): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const syncAttemptedRef = useRef(false)

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

  // ─── Register Service Worker & Auto-Sync Subscription on Load ───────────────
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
      .then(async (registration) => {
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

        // If permission was already granted previously, auto-sync subscription now
        if ('Notification' in window && Notification.permission === 'granted' && !syncAttemptedRef.current) {
          syncAttemptedRef.current = true
          await registerWebPushSubscription(activeStaffId)
        }
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
  }, [activeStaffId])

  // ─── Auto-sync when staff user logs in ───────────────────────────────────────
  useEffect(() => {
    if (activeStaffId && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      registerWebPushSubscription(activeStaffId)
    }
  }, [activeStaffId])

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

      if (permission === 'granted') {
        const success = await registerWebPushSubscription(activeStaffId)
        if (success) {
          console.log('[PWA] Notification permission & push subscription complete!')
        }

        // Also record notification permission in staff_users metadata
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
