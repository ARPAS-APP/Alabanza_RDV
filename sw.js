// Service worker: permite instalar la app, abrirla sin conexión y recibir notificaciones.
// - Archivos de la app: red primero (siempre la última versión), copia en caché como respaldo.
// - Imágenes y partituras de Supabase Storage: caché primero (no cambian), red si no están.
// - Datos de Supabase (REST): no se tocan; la app guarda su propia copia (IndexedDB).
// IMPORTANTE: este archivo va en la RAÍZ del repo (junto a index.html) para que funcionen las notificaciones.
const CACHE = 'alabanza-v53';
const ARCHIVOS = 'alabanza-archivos';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/acordes.js', 'js/cifrado.js', 'js/config.js', 'js/discipulado.js', 'js/novedades.js', 'js/cuentas.js', 'js/guia.js', 'js/biblia.js', 'js/audio-cifrado.js', 'js/audio-ref.js', 'js/estirar-worker.js',
  'programa.html', 'js/programa.js', 'manifest.webmanifest', 'manifest-arpas.webmanifest', 'icons/logo.png', 'icons/icon-192.png', 'icons/arpas-mark.svg', 'icons/arpas-mark-reverse.svg', 'icons/arpas-logo.svg', 'icons/arpas-logo-reverse.svg', 'icons/arpas-icon-192.png',
];

self.addEventListener('install', e => {
  // Si falta algún archivo no se cancela la instalación
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== ARCHIVOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.includes('/storage/v1/object/public/')) {
    e.respondWith(
      caches.match(req.url).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(ARCHIVOS).then(c => c.put(req.url, copia)); }
        return res;
      }))
    );
    return;
  }

  const propio = url.origin === location.origin;
  // Biblia: no cambia nunca, así que caché primero (queda disponible sin internet)
  if (propio && url.pathname.includes('/biblia/')) {
    e.respondWith(
      caches.open(ARCHIVOS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })))
    );
    return;
  }
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!propio && !cdn) return;
  // Archivos propios: siempre preguntar al servidor si hay versión nueva (sin usar la caché del navegador,
  // que en GitHub Pages guarda los archivos hasta 10 minutos y hacía que los cambios tardaran en verse).
  const pedir = !propio ? fetch(req)
    : req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    pedir
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});

// ---------- notificaciones push ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Arpas', {
    body: d.body || '',
    icon: 'icons/arpas-icon-192.png',
    badge: 'icons/favicon-32.png',
    tag: d.tag,
    renotify: !!d.tag,
    vibrate: [80, 40, 80],
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const abierta = lista.find(c => c.url.startsWith(self.registration.scope));
    if (abierta) return abierta.focus().then(c => (c.navigate ? c.navigate(destino) : c));
    return clients.openWindow(destino);
  }));
});
