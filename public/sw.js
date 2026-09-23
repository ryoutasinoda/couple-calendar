const CACHE_NAME = 'couple-calendar-shell-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/app-icon.svg']

const isApiRequest = (requestUrl) => {
  try {
    const url = new URL(requestUrl.url)
    return url.origin === self.location.origin && url.pathname.startsWith('/api')
  } catch {
    return false
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (isApiRequest(event.request)) {
    event.respondWith(fetch(event.request))
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseCopy))
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => cachedResponse || fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy))
          return response
        })),
  )
})

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : { title: 'Couple Calendar', body: '新しい通知があります。' }
  const notificationOptions = {
    body: payload.body || '新しい通知があります。',
    icon: '/app-icon.svg',
    badge: '/app-icon.svg',
    tag: payload.tag || 'couple-calendar',
    data: payload.data || {},
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Couple Calendar', notificationOptions))
})
