/* MoSalah service worker — app shell + runtime cache for Qur’an */
const VERSION = 'mosalah-v1.0.3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/themes.css',
  './css/responsive.css',
  './js/utils.js',
  './js/storage.js',
  './js/i18n.js',
  './js/prayer-times.js',
  './js/notifications.js',
  './js/qibla.js',
  './js/quran.js',
  './js/tasbih.js',
  './js/tracker.js',
  './js/zakat.js',
  './js/calendar.js',
  './js/search.js',
  './js/hadith.js',
  './js/dua.js',
  './js/namaz.js',
  './js/ramadan.js',
  './js/app.js',
  './js/data/surahs.js',
  './js/data/cities.js',
  './js/data/hadith-data.js',
  './js/data/dua-data.js',
  './js/data/dua-extra.js',
  './js/data/namaz-data.js',
  './assets/icons/favicon.svg',
  './assets/icons/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })).catch(function () {
        return cache.addAll(['./index.html', './css/style.css', './js/app.js']);
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isApi = /alquran\.cloud|islamic\.network|nominatim\.openstreetmap/.test(url.hostname);

  if (isApi) {
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(VERSION + '-api').then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || new Response(JSON.stringify({ code: 0, status: 'offline' }), { headers: { 'Content-Type': 'application/json' } });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      const net = fetch(req).then(function (res) {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'offline' });
      });
      return cached || net;
    })
  );
});
