// Service Worker: hält die App offline verfügbar (Cache-First für die App-Dateien).
const VERSION = 'cue-player-v0.6.1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'docs/BENUTZERHANDBUCH.md',
  'css/app.css',
  'js/app.js',
  'js/engine.js',
  'js/md.js',
  'js/midi.js',
  'js/model.js',
  'js/storage.js',
  'js/util.js',
  'site.json',
  'img/icon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Cache, sonst landen evtl. alte Dateien im Cache der neuen Version.
  const reqs = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('index.html'))),
  );
});
