/*
  Apéro de Nuit 66 - service-worker.js
  Version : aperodenuit-v4.3-push-adn66

  Fonctions conservées :
  - cache PWA tolérant
  - network-first pour HTML
  - cache-first pour assets
  - exclusion des requêtes Cloudflare Workers

  Ajout :
  - réception Web Push ADN66
  - récupération de la dernière notification via le Worker adn66-push
  - affichage title/body/icon/image/badge/vibration
  - clic notification/boutons => ouverture du site Apéro de Nuit 66
*/

const CACHE_NAME = "aperodenuit-v4.3-push-adn66";

const ADN_PUSH_WORKER_URL = "https://adn66-push.apero-nuit-du-66.workers.dev";
const ADN_PUSH_LATEST_URL = `${ADN_PUSH_WORKER_URL}/push/latest?target=apero`;

const DEFAULT_SITE_URL = "https://aperos.net/";
const DEFAULT_ICON_URL = "https://bullyto.github.io/outil/apps/PUSH/icons/icon-adn66-192.png";
const DEFAULT_BADGE_URL = "https://bullyto.github.io/outil/apps/PUSH/icons/badge-adn66-96.png";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Pré-cache tolérant
async function precacheSafe(cache) {
  await Promise.allSettled(
    CORE_ASSETS.map((url) => cache.add(url))
  );
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
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* ================================
     ✅ AUTORISER CLOUDflare WORKERS
     ================================ */
  if (url.hostname.endsWith("workers.dev")) {
    // ⛔ NE PAS intercepter → laisser passer le réseau
    return;
  }

  // HTML → network-first
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req) || caches.match("./index.html"))
    );
    return;
  }

  // Autres assets → cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});

/* ================================
   🔔 WEB PUSH ADN66
   ================================ */

self.addEventListener("push", (event) => {
  event.waitUntil(showAdn66PushNotification());
});

async function showAdn66PushNotification() {
  const payload = await getLatestNotificationPayload();

  const title = cleanText(payload.title) || "Apéro de Nuit 66";
  const body = cleanText(payload.body) || "Service ouvert ce soir, livraison de 19h à 6h.";

  const siteUrl = cleanSiteUrl(payload.site_url || payload.url) || DEFAULT_SITE_URL;
  const iconUrl = cleanHttpsUrl(payload.icon_url) || DEFAULT_ICON_URL;
  const badgeUrl = cleanHttpsUrl(payload.badge_url) || DEFAULT_BADGE_URL;
  const imageUrl = cleanLargeImageUrl(payload.image_url || payload.image || payload.imageUrl || "");

  const options = {
    body,
    icon: iconUrl,
    badge: badgeUrl,
    data: {
      url: siteUrl,
      site_url: siteUrl
    },
    tag: cleanTag(payload.tag) || "adn66-alerte",
    renotify: toBoolean(payload.renotify, true),
    requireInteraction: toBoolean(payload.require_interaction, true),
    silent: toBoolean(payload.silent, false),
    vibrate: cleanVibrate(payload.vibrate),
    // Sur Android/Chrome, on a constaté que deux actions avec URLs différentes pouvaient se mélanger.
    // Ici, les deux boutons éventuels renvoient donc volontairement vers le site.
    actions: [
      { action: "open_site", title: "Voir le site" },
      { action: "open_site_2", title: "Ouvrir" }
    ]
  };

  if (imageUrl) {
    options.image = imageUrl;
  }

  return self.registration.showNotification(title, options);
}

async function getLatestNotificationPayload() {
  try {
    const response = await fetch(ADN_PUSH_LATEST_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      return getFallbackNotificationPayload();
    }

    const data = await response.json();

    if (data && data.notification) {
      return {
        ...getFallbackNotificationPayload(),
        ...data.notification
      };
    }
  } catch (error) {
    // Fallback silencieux.
  }

  return getFallbackNotificationPayload();
}

function getFallbackNotificationPayload() {
  return {
    title: "Apéro de Nuit 66",
    body: "Service ouvert ce soir, livraison de 19h à 6h.",
    url: DEFAULT_SITE_URL,
    site_url: DEFAULT_SITE_URL,
    icon_url: DEFAULT_ICON_URL,
    badge_url: DEFAULT_BADGE_URL,
    image_url: "",
    tag: "adn66-alerte",
    renotify: true,
    require_interaction: true,
    silent: false,
    vibrate: [500, 150, 500, 150, 800]
  };
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = cleanSiteUrl(data.site_url || data.url) || DEFAULT_SITE_URL;

  // Tous les clics de notification Apéro de Nuit ouvrent le site.
  event.waitUntil(openOrFocusSite(targetUrl));
});

async function openOrFocusSite(url) {
  const finalUrl = cleanSiteUrl(url) || DEFAULT_SITE_URL;

  const clientList = await clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  for (const client of clientList) {
    try {
      const clientUrl = new URL(client.url);

      if (clientUrl.hostname === "aperos.net" || clientUrl.hostname === "www.aperos.net") {
        if ("navigate" in client) {
          await client.navigate(finalUrl);
        }
        if ("focus" in client) {
          return client.focus();
        }
      }
    } catch {
      // ignore
    }
  }

  if (clients.openWindow) {
    return clients.openWindow(finalUrl);
  }

  return undefined;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 80);
}

function cleanHttpsUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw, self.location.href);

    if (url.protocol !== "https:") {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function cleanSiteUrl(value) {
  const url = cleanHttpsUrl(value);

  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);

    // Sécurité : ce service worker Apéro ne doit jamais ouvrir Google Play.
    if (parsed.hostname.includes("play.google.com")) {
      return DEFAULT_SITE_URL;
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function cleanLargeImageUrl(value) {
  const imageUrl = cleanHttpsUrl(value);

  if (!imageUrl) {
    return "";
  }

  const normalized = imageUrl.toLowerCase();

  // Ne pas afficher une icône ou un badge comme grande image.
  if (
    normalized.includes("/apps/push/icons/icon-") ||
    normalized.includes("/apps/push/icons/badge-") ||
    normalized.includes("apple-touch-icon") ||
    normalized.includes("favicon")
  ) {
    return "";
  }

  return imageUrl;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "oui"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "non"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(fallback);
}

function cleanVibrate(value) {
  const fallback = [500, 150, 500, 150, 800];

  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v >= 0 && v <= 2000)
    .slice(0, 10);

  return cleaned.length ? cleaned : fallback;
}
