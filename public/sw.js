/*
 * Aisle AI service worker.
 *
 * Goals: make the app installable and resilient on flaky mobile connections
 * WITHOUT getting in the way of the live app or the Supabase backend.
 *
 * Strategy:
 *   - Navigations: network-first, falling back to the cached app shell when
 *     offline (so a launched-from-home-screen app still opens with no signal).
 *   - Same-origin static assets (JS/CSS/images/fonts): stale-while-revalidate.
 *   - Everything else (cross-origin: Supabase API, storage, auth; non-GET):
 *     passed straight through to the network, never cached.
 *
 * Bump CACHE_VERSION to force old caches to clear on the next visit.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `aisle-ai-${CACHE_VERSION}`;
const APP_SHELL = '/index.html';
const PRECACHE = ['/', APP_SHELL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Let Supabase (storage/auth/db) and all
  // non-GET requests go straight to the network, untouched.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first with offline fallback to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(APP_SHELL))),
    );
    return;
  }

  // Static assets: serve from cache fast, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
