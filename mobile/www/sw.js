/* Transfer OS service worker — offline-first cache for the static app shell */
const CACHE = 'transfer-os-v11';
const ASSETS = [
  './',
  './index.html',
  './compare.html',
  './validate.html',
  './manifest.json',
  './css/app.css',
  './js/i18n.js',
  './js/artic-gz-1.js',
  './js/artic-gz-2.js',
  './js/artic-gz-3.js',
  './js/artic-gz-4.js',
  './js/artic-boot.js',
  './js/ge-gz-1.js',
  './js/ge-boot.js',
  './js/ge.js',
  './js/admit-gz-1.js',
  './js/admit-boot.js',
  './js/admit.js',
  './js/tag-data.js',
  './js/tag-engine.js',
  './js/comparator.js',
  './js/validator.js',
  './js/app-tag.js',
  './js/app-compare.js',
  './js/app-validate.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
