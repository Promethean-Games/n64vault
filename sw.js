const CACHE_NAME = 'n64vault-standalone-v3-mp';
const STATIC_ASSETS = [
  './manifest.json'
];

const NEVER_CACHE = [
  'index_standalone.html',
  'index.html'
];

const EMULATOR_CDN = 'https://cdn.emulatorjs.org/stable/data/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  // Never cache WebSocket upgrades
  if (url.pathname.startsWith('/ws/')) {
    return;
  }
  
  // Never cache HTML files - always fetch fresh for updates
  const filename = url.pathname.split('/').pop();
  if (NEVER_CACHE.some(f => filename === f || url.pathname.endsWith('.html'))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  if (url.href.startsWith(EMULATOR_CDN)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }
  
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !url.pathname.endsWith('.html')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
