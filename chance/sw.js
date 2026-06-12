const CACHE_NAME = 'adn66-roue-v3-install-fidelite-1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './assets/img/logo-apero-de-nuit-66.png',
  './assets/img/background-night.png',
  './assets/img/wheel.png',
  './assets/img/wheel-base.png',
  './assets/img/wheel-center.png',
  './assets/img/wheel-pointer.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/rewards/livraison-offerte-1-semaine.png',
  './assets/rewards/1-tampon-fidelite.png',
  './assets/rewards/retourner-la-roue.png',
  './assets/rewards/bon-reduction-10.png',
  './assets/rewards/2-softs-offerts.png',
  './assets/rewards/code-promo-adn66-10.png',
  './assets/rewards/cadeau-surprise.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
