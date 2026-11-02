// Keeps W2G AutoFill working offline. Network first, so updates show up as soon as the device is online.
// Only the app's own files are cached; client files you open never leave the device.
const CACHE = 'w2gaf-20261102220144';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'app-icon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'js/parse.js', 'js/fill.js', 'js/store.js', 'js/templates.js', 'js/app.js',
  'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/pdf-lib.min.js', 'lib/xlsx.full.min.js', 'lib/tesseract.min.js', 'lib/worker.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
