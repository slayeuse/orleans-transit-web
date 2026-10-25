// Service worker minimal : l'application s'ouvre même hors connexion
// (les horaires temps réel nécessitent évidemment le réseau).
const CACHE = 'ot-shell-v1';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/main.js', './js/views.js', './js/ui.js', './js/util.js', './js/config.js',
  './js/sncf.js', './js/tao.js', './js/gtfsrt.js', './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord pour nos fichiers (toujours la dernière version), cache en secours.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && (SHELL.some((p) => url.pathname.endsWith(p.slice(1))) || url.pathname.includes('/data/'))) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request)),
  );
});
