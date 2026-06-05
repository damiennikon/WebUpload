// A simple pass-through service worker to satisfy PWA installation requirements
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // We don't need offline caching for this app, so we just let requests pass through normally.
});