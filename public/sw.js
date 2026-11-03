const CACHE = 'vault-offline-v11-1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request('/offline.html', { cache: 'reload' }))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vault-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only root navigation may fall back to a static, non-sensitive notice.
  // No API, document response, token, or note body is placed in a cache.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate'
      || url.origin !== self.location.origin || url.pathname !== '/') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
