/* service-worker.js — v3.5 (SAFE)
   Fix:
   - Precache robuste: n’échoue pas si un fichier manque (sinon SW ne s’update jamais)
   - NE JAMAIS cacher status-popup.js / status.json / images status (toujours frais)
   - HTML en network-first, reste en cache-first
*/
const CACHE_NAME = "aperodenuit-v3.7";

// ⚠️ Pré-cache minimal + tolérant aux fichiers absents
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  // (optionnel) si présents
  "./style.css",
  "./assets/img/logo.png",
  "./assets/img/partage.png",

  // icônes possibles (selon tes noms de fichiers)
  "./icon-192.png",
  "./icon-512.png",
  "./icône-192.png",
  "./icône-512.png",
  "./icône-touch-apple.png",
  "./assets/apple-touch-icon.png",

  // assets possibles
  "./assets/img/logo-header.png",
  "./assets/img/bottle1.png",
  "./assets/img/bottle2.png",
  "./assets/img/bottle3.png",
  "./assets/img/bottle4.png",
  "./assets/img/bottle5.png",
  "./assets/img/bottle6.png",
  "./assets/img/bottle7.png",
];

// Ajout tolérant: si 1 fichier manque, on n’annule pas tout le SW
async function precacheSafe(cache){
  const results = await Promise.allSettled(
    CORE_ASSETS.map((url) => cache.add(url))
  );
  // (silencieux) — si tu veux debug: console.log(results)
  return results;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await precacheSafe(cache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ✅ Toujours frais (anti-bug caches/PWA)
  // 1) status-popup.js (ton JS qui pilote les blocages)
  if (url.origin === self.location.origin && url.pathname.endsWith("/status-popup.js")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // 2) status.json + toutes ressources du dossier status (cross-origin)
  if (url.href.includes("bullyto.github.io/status/")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // ✅ Évite de cacher le cross-origin (opaque) autrement
  if (url.origin !== self.location.origin) {
    return;
  }

  const accept = req.headers.get("accept") || "";

  // Network-first pour HTML
  if (accept.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first pour le reste
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
