import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import { supabase } from './supabase'

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

  // ─── Request Notification Permission ─────────────────────────────────────────
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)

      if (permission === 'granted' && activeStaffId && 'serviceWorker' in navigator) {
        // Save push notification capability in DB
        const registration = await navigator.serviceWorker.ready
        if ('pushManager' in registration) {
          try {
            // Check if subscription exists
            let subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
              // Can subscribe with VAPID key if configured
              console.log('[PWA] PushManager ready for subscription.')
            }
          } catch (e) {
            console.debug('[PWA] PushManager registration note:', e)
          }
        }

        // Record notification permission granted in staff_users metadata
        try {
          await (supabase as any)
            .from('staff_users')
            .update({ push_token: `web_pwa_${Date.now()}` })
            .eq('id', activeStaffId)
        } catch {
          // ignore non-fatal
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
