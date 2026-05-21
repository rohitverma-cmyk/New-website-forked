/* Locofast Mobile PWA — service worker (v1) */
const CACHE_NAME = 'locofast-mobile-v1';
const APP_SHELL = [
  '/m',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('locofast-mobile-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for /api, cache-first for static assets, network-first with cache fallback for navigations
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API calls — network only (do not cache JSON)
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests for /m/* — network-first, cache fallback
  if (req.mode === 'navigate' && url.pathname.startsWith('/m')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/m', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/m').then((m) => m || caches.match(req)))
    );
    return;
  }

  // Static assets — cache-first
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'font' || req.destination === 'image') {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached)
      )
    );
  }
});

// FCM placeholder — Firebase Messaging will register its own SW (firebase-messaging-sw.js).
// Push handler kept here for future Web Push fallback.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Locofast', body: 'New update', url: '/m' };
  try { payload = { ...payload, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      data: { url: payload.url || '/m' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/m';
  event.waitUntil(clients.openWindow(target));
});
