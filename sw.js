/* Хранит приложение на устройстве, чтобы оно открывалось без сети */
const CACHE = 'ironplan-v1';
const FILES = ['./', 'index.html', 'anim.js', 'data.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: url.origin === location.origin });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; });
    if (hit) { if (!font) net.catch(() => {}); return hit; }           // сразу из памяти, обновление в фоне
    try { return await net; }
    catch (err) { if (r.mode === 'navigate') return (await c.match('index.html')) || Response.error(); return Response.error(); }
  }));
});
