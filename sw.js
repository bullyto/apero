const VERSION = "animatopia-starter-v1";
const CACHE = `animatopia-${VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./shop.html",
  "./game.html",
  "./css/styles.css",
  "./manifest.webmanifest",
  "./js/schema.js",
  "./js/utils.js",
  "./js/storage.js",
  "./js/auth.js",
  "./js/home.js",
  "./js/shop.js",
  "./js/shop_page.js",
  "./js/rooms.js",
  "./js/chat.js",
  "./js/inventory.js",
  "./js/moderation.js",
  "./js/game_page.js",
  "./js/game/engine.js",
  "./js/game/input.js",
  "./data/characters.json",
  "./data/items.json",
  "./data/mounts.json",
  "./data/pets.json",
  "./data/maps.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k.startsWith("animatopia-") && k !== CACHE ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e)=>{
  const req = e.request;
  e.respondWith((async ()=>{
    const cached = await caches.match(req);
    if(cached) return cached;
    try{
      const fresh = await fetch(req);
      const url = new URL(req.url);
      if(url.origin === location.origin){
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch(err){
      return cached || new Response("Offline", {status:503, headers:{"Content-Type":"text/plain"}});
    }
  })());
});
