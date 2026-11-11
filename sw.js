/* Offline support. Bump VERSION whenever you upload changed files. */
const VERSION = 'launchpad-v2';
const SHELL = [
  './', 'index.html', 'masked.html', 'ascend.html', 'pwa.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + '-ext').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Show the saved copy instantly, then refresh it in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const ext = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/.test(url.host);
  if (!same && !ext) return;
  const bucket = same ? VERSION : VERSION + '-ext';
  e.respondWith(caches.open(bucket).then(cache =>
    cache.match(req, { ignoreSearch: same }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
      return hit || net;
    })
  ));
});
