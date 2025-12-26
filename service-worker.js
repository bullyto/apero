/* service-worker.js
   Minimal cache pour rendre la PWA installable + offline basique.
   (Ne change rien à ton UI, juste support PWA.)
*/
const CACHE_NAME = "aperodenuit-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/logo-header.png",
  "./assets/bottle1.png",
  "./assets/bottle2.png",
  "./assets/bottle3.png",
  "./assets/bottle4.png",
  "./assets/bottle5.png",
  "./assets/bottle6.png",
  "./assets/bottle7.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ Ne jamais mettre en cache le status global (doit rester à jour)
  if (req.method === "GET" && url.href.includes("bullyto.github.io/status/status.json")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // ✅ Évite de cacher le cross-origin (opaque) pour ne pas bloquer les mises à jour
  if (url.origin !== self.location.origin) {
    return; // laisser le réseau gérer
  }

  // Network-first pour HTML (toujours à jour), cache-first pour le reste
  const accept = req.headers.get("accept") || "";
  if (req.method !== "GET") return;

  if (accept.includes("text/html")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      return res;
    }))
  );
});
