// MS Vegetable Center Service Worker (v1.3.0 - Performance Optimized)
const CACHE_NAME = 'msveg-static-v1.3'
const FONT_CACHE_NAME = 'msveg-fonts-v1.3'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',
  '/logo-transparent.png',
  '/veg/hero_veggies_mobile.webp',
  '/veg/hero_veggies.webp',
]

// Install: pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {})
    })
  )
  self.skipWaiting()
})

// Activate: clean up old version caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== FONT_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 1. Never intercept or cache Supabase database queries, auth, or realtime APIs
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return
  }

  // 2. Cache Google Fonts (woff2 files from fonts.gstatic.com) - Cache First for instant rendering
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone())
            }
            return networkResponse
          })
        })
      })
    )
    return
  }

  // 3. Ignore other non-origin requests
  if (url.origin !== self.location.origin) return

  // 4. HTML Navigation: Network-First, fall back to cached index.html (SPA routing offline)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return networkResponse
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // 5. Immutable Content-Hashed Vite Assets (/assets/*) & Static Images:
  // Cache First - if present in cache, return INSTANTLY (0ms latency, zero network traffic)
  const isHashedAsset = url.pathname.startsWith('/assets/')
  const isImageOrMedia = url.pathname.startsWith('/veg/') || /\.(webp|png|jpg|jpeg|svg|ico)$/i.test(url.pathname)

  if (isHashedAsset || isImageOrMedia) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return networkResponse
        })
      })
    )
    return
  }

  // 6. Mutable root assets (manifest, favicon, etc.): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return networkResponse
        })
        .catch(() => cachedResponse)

      return cachedResponse || fetchPromise
    })
  )
})
