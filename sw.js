const CACHE_NAME = 'spendly-v20.0';


const ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './manifest.json',
  './js/config.js',
  './js/i18n.js',
  './js/dashboard.js',
  './js/auth.js'
];

// Force immediate activation of new Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Delete old cache automatically
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network first, fallback to cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
