/* Хранит приложение и фотографии на устройстве, чтобы всё открывалось без сети */
const CACHE = 'ironplan-v2';
const CORE = ["./", "index.html", "anim.js", "data.js", "data2.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];
const IMGS = ["img/abductor.jpg", "img/adductor.jpg", "img/arnold.jpg", "img/bbrow.jpg", "img/bench.jpg", "img/benchdip.jpg", "img/bike.jpg", "img/bridge.jpg", "img/cablecrunch.jpg", "img/cablerow.jpg", "img/calf.jpg", "img/cgbench.jpg", "img/chestpress.jpg", "img/chinup.jpg", "img/climber.jpg", "img/conc.jpg", "img/crossover.jpg", "img/crunch.jpg", "img/curl.jpg", "img/dbbench.jpg", "img/dbpress.jpg", "img/dbrow.jpg", "img/deadlift.jpg", "img/dips.jpg", "img/ellipse.jpg", "img/facepull.jpg", "img/fly.jpg", "img/goblet.jpg", "img/hack.jpg", "img/hammer.jpg", "img/hipthrust.jpg", "img/hyper.jpg", "img/inclcurl.jpg", "img/incline.jpg", "img/jumprope.jpg", "img/kickback.jpg", "img/kneeraise.jpg", "img/lateral.jpg", "img/latpull.jpg", "img/legcurl.jpg", "img/legext.jpg", "img/legpress.jpg", "img/legraise.jpg", "img/lunge.jpg", "img/machpress.jpg", "img/ohext.jpg", "img/ohp.jpg", "img/pecdeck.jpg", "img/plank.jpg", "img/preacher.jpg", "img/pullup.jpg", "img/pushdown.jpg", "img/pushup.jpg", "img/rdl.jpg", "img/rearfly.jpg", "img/revfly.jpg", "img/rope.jpg", "img/rower.jpg", "img/seatcalf.jpg", "img/seatcurl.jpg", "img/shrug.jpg", "img/sideplank.jpg", "img/skull.jpg", "img/smith.jpg", "img/split.jpg", "img/squat.jpg", "img/stairs.jpg", "img/statbike.jpg", "img/strpull.jpg", "img/tbar.jpg", "img/treadrun.jpg", "img/treadwalk.jpg", "img/twist.jpg"];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(async c => {
  await c.addAll(CORE);
  await Promise.all(IMGS.map(u => c.add(u).catch(() => {})));   // фото по одному: сбой одного не срывает установку
}).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: url.origin === location.origin });
    const img = url.pathname.includes('/img/');
    if (hit && (font || img)) return hit;                               // неизменяемое: только из памяти
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; });
    if (hit) { net.catch(() => {}); return hit; }                       // сразу из памяти, обновление в фоне
    try { return await net; }
    catch (err) { if (r.mode === 'navigate') return (await c.match('index.html')) || Response.error(); return Response.error(); }
  }));
});
