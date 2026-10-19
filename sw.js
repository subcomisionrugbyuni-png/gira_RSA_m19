// Subir VERSION cada vez que se cambien index.html, app.js o styles.css
const VERSION = 'v17';
const FOTOS = `fotos-${VERSION}`;
const SHELL = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/logo.png', '/icons/icon-192.png',
  '/destinos.js', '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2', '/fonts/barlow-condensed-800.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FOTOS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/administrador') || url.pathname === '/api/admin' || url.pathname === '/api/data') return;

  // Fotos (las del panel y las de destinos): una vez descargadas quedan guardadas
  if (url.pathname === '/api/photo' || url.pathname.startsWith('/img/')) {
    e.respondWith(caches.open(FOTOS).then(async (c) => {
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
