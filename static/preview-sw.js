// only used for clients.claim() on hard refresh
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'claim') {
    self.clients.claim();
  }
});
