// 通常は更新不要。キャッシュを全部作り直したいときだけ上げる (v1 → v2 ...)
const VERSION = 'v1';
const CACHE = 'word-odyssey-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './script.js',
  './style.css',
  './data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('word-odyssey-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: 見たものをキャッシュ (オフラインでもフォントが出る)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          const net = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // 自サイトのファイル: キャッシュを即返し、裏で最新を取得して次回起動に反映
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req, { ignoreSearch: true }).then(hit => {
          const net = fetch(req)
            .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
  }
});
