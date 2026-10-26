// Strictly Spending WebAPK / PWA Service Worker
const CACHE_NAME = 'strictly-spending-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first passthrough with offline fallback support so Chrome Android WebAPK minting succeeds
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
