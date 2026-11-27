// Orbite service worker: the game keeps working offline once opened online.
// Bump CACHE when publishing a new version so old files are dropped.
const CACHE = 'orbite-2.6';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // version.json says which version is online: always ask the network, never cache it.
  if (new URL(req.url).pathname.endsWith('/version.json')) return;
  // The page itself: network first, so an update shows up as soon as you are online.
  if (req.mode === 'navigate') {
    // Only the app's own page (not /beta/ or any other sub-page) is handled and cached as the offline page.
    const scope = new URL(self.registration.scope).pathname, path = new URL(req.url).pathname;
    if (path !== scope && path !== scope + 'index.html') return;
    e.respondWith(fetch(req.url, {cache: 'no-cache'})   // check with the server, so an update is never served stale
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Everything else (icons, fonts): cache first, then network, keeping a copy.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
