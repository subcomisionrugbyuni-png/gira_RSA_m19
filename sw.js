// Subir VERSION cada vez que se cambien index.html, app.js o styles.css
const VERSION = 'v3';
const SHELL = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/logo.png', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'fotos').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/administrador') || url.pathname === '/api/admin' || url.pathname === '/api/data') return;

  // Fotos: una vez descargadas quedan guardadas
  if (url.pathname === '/api/photo') {
    e.respondWith(caches.open('fotos').then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // App: primero la red, si no hay señal lo guardado
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/'))));
});
