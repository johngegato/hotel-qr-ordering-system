// Hotel QR Staff App - Progressive Web App Service Worker
const CACHE_NAME = 'hotel-staff-cache-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/assets/icon.png',
]

// ─── Lifecycle: Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err)
      })
    })
  )
  self.skipWaiting()
})

// ─── Lifecycle: Activate ───────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// ─── Fetch Handling: Network First with Cache Fallback ─────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for http/https schemes
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (!url.protocol.startsWith('http')) return

  // Do not cache Supabase API calls or WebSocket upgrades
  if (url.hostname.includes('supabase.co')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache valid responses
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone).catch(() => {})
          })
        }
        return response
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/')
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        })
      })
  )
})

// ─── Web Push Handling (Background Real-Time Notifications & Client Wake-Up) ──
self.addEventListener('push', (event) => {
  let data = {
    title: '🚨 New Guest Request',
    body: 'An incoming request requires staff attention.',
    tag: 'hotel-urgent-request',
    url: '/',
  }

  if (event.data) {
    try {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/assets/icon.png',
    badge: data.badge || '/favicon.png',
    tag: data.tag || 'hotel-urgent-request',
    data: { url: data.url || '/', ...data },
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    requireInteraction: true, // Keep notification visible until acted upon
    actions: [
      { action: 'open', title: '👀 View Request' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  // Wake up and broadcast to all open PWA windows/tabs
  const broadcastWakeup = async () => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('hotel_staff_sync')
        bc.postMessage({ type: 'PWA_BACKGROUND_SYNC', data, timestamp: Date.now() })
        bc.close()
      }
    } catch (err) {
      console.debug('[SW] BroadcastChannel warning:', err)
    }

    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        client.postMessage({ type: 'PWA_BACKGROUND_SYNC', data, timestamp: Date.now() })
      }
    } catch (err) {
      console.debug('[SW] clients.postMessage warning:', err)
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      broadcastWakeup(),
    ])
  )
})

// ─── Notification Click Handling ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/'

  const handleNotificationClick = async () => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('hotel_staff_sync')
        bc.postMessage({ type: 'PWA_NOTIFICATION_CLICKED', data: event.notification.data, timestamp: Date.now() })
        bc.close()
      }
    } catch (e) {}

    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // If a tab/PWA window is already open, focus it and trigger refresh
    for (const client of clientList) {
      if (client.url && 'focus' in client) {
        client.postMessage({ type: 'PWA_NOTIFICATION_CLICKED', data: event.notification.data, timestamp: Date.now() })
        return client.focus()
      }
    }
    // Otherwise open a new window
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl)
    }
  }

  event.waitUntil(handleNotificationClick())
})

// ─── Message Handling ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
