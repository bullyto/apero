// ADN66 BUILD 20260627-client-reload-cache-fix-v1
// PATH: maps/client.js
// /maps/client.js
import { CONFIG } from "./config.js";

// ------------------------------------------------------------
// Client web (Suivi)
// ------------------------------------------------------------
// Règles:
//  - Le client DOIT partager sa position pour voir le livreur.
//  - Le client ne voit jamais les autres clients.
//  - Pendant l'attente de décision, le bouton est bloqué.
//  - Si accepté: accès temporaire (défaut 30 minutes) + révocable.
//  - ✅ IMPORTANT: sur certains Android/Chrome/WebView, la demande GPS ne s'affiche
//    PAS au chargement. Il faut un "user gesture" (clic). On gère ça.

const els = {
  name: document.getElementById("name"),
  phone: document.getElementById("phone"),
  btnRequest: document.getElementById("btnRequest"),
  btnReset: document.getElementById("btnReset"),
  badge: document.getElementById("statusBadge"),
  stateText: document.getElementById("stateText"),
  countdown: document.getElementById("countdown"),
  geoText: document.getElementById("geoText"),
  inlineStatus: document.getElementById("clientInlineStatus"),
  inlineStatusIcon: document.getElementById("clientInlineStatusIcon"),
  inlineStatusTitle: document.getElementById("clientInlineStatusTitle"),
  inlineStatusSub: document.getElementById("clientInlineStatusSub"),
  map: document.getElementById("map"),
  popup: document.querySelector(".clientPopup"),
  driverInfo: document.getElementById("driverInfo"),
  driverInfoName: document.getElementById("driverInfoName"),
  driverInfoMeta: document.getElementById("driverInfoMeta"),
  btnRecenter: document.getElementById("btnRecenter"),
};

const LS = {
  prefix: CONFIG.LS_PREFIX || "adn66_track_",
  name: (CONFIG.LS_PREFIX || "adn66_track_") + "name",
  phone: (CONFIG.LS_PREFIX || "adn66_track_") + "phone",
  requestId: (CONFIG.LS_PREFIX || "adn66_track_") + "requestId",
  clientId: (CONFIG.LS_PREFIX || "adn66_track_") + "clientId",
  lastRequestMs: (CONFIG.LS_PREFIX || "adn66_track_") + "lastRequestMs",

  // ✅ ADN66 FIX 20260627 : restauration après fermeture/réouverture de la page client
  clientMapFixedPos: (CONFIG.LS_PREFIX || "adn66_track_") + "clientMapFixedPos",
  lastRoute: (CONFIG.LS_PREFIX || "adn66_track_") + "lastRoute",
  lastDriverPos: (CONFIG.LS_PREFIX || "adn66_track_") + "lastDriverPos",
};

const STATE = {
  map: null,
  markerClient: null,
  markerDriver: null,
  routeLine: null,
  routeLatLngs: [],
  routeCumulativeM: [],
  routeMeta: null,
  routeOffSinceMs: 0,
  routeNeedsRecalc: false,
  routeRecalcInFlight: false,
  routeLastRequestMs: 0,
  routeOffThresholdM: 80,
  routeOffRecalcDelayMs: 15000,
  currentDriverName: "",
  clientPos: null, // position GPS réelle envoyée au serveur {lat,lng,acc,ts}
  clientMapFixedPos: null, // position de départ affichée côté client {lat,lng,acc,ts}
  acceptedAutoRecenterTimer: null,
  acceptedAutoRecenterArmed: false,
  acceptedAutoRecenterDone: false,
  watchId: null,

  // ✅ La carte se recentre une seule fois. Après un geste client, on ne force plus la vue.
  mapUserMoved: false,
  firstAutoCenterDone: false,

  // session
  requestId: "",
  clientId: "",
  status: "idle", // idle|pending|accepted|refused|expired|error

  // timers
  tPollStatus: null,
  tPollDriver: null,
  tSendClientPos: null,
  tClientPresence: null,
  tRouteLocalMeta: null,
  tCountdown: null,
  accessRemainingMs: null,
  acceptedPopupHideTimer: null,

  // ✅ fit throttle
  lastFitMs: 0,

  // ✅ driver smoothing engine (Waze-like)
  driver: {
    // buffer of server points: {lat,lng,tsServerMs, rxMs}
    buf: [],
    maxBuf: 12,

    // adaptive delay (ms)
    delayMs: 2000,
    delayMin: 2000,
    delayMax: 2600,

    // last server rx intervals (ms)
    rxIntervals: [],
    rxIntervalsMax: 8,
    lastRxMs: 0,

    // display state (lat/lng displayed now)
    disp: null, // {lat,lng}
    lastDispMs: 0,

    // prediction state
    vel: null, // {vLat,vLng} per ms (approx)
    lastVelFrom: null, // {lat,lng,tsMs}

    // animation loop
    raf: 0,

    // guard
    hasFirstFix: false,

    // max speed clamp (deg/ms converted later), we clamp in meters approx
    maxSpeedMps: 45, // 162 km/h (safe clamp)

    // ✅ NEW: cadence + glide (anti "pause" entre points)
    // On veut une glissade ~2.9s si le poll est 3s.
    pollMs: 3000, // valeur actuelle (CONFIG.POLL_DRIVER_MS)
    glideTargetMs: 2900, // demandé: 2.9s
    glideMarginMs: 80, // petite marge de sécurité
    lastPollApplyMs: 0,
  },

  // ✅ anti double-prompt / anti double watch
  geoRequestedOnce: false,
  geoInFlight: false,
};

// ----------------------------
// UI helpers
// ----------------------------
function setBadge(text) {
  if (els.badge) els.badge.textContent = text;
}

function setState(text) {
  if (els.stateText) els.stateText.textContent = text;
}

function setCountdown(text) {
  if (els.countdown) els.countdown.textContent = text;
  updatePopupVisibility();
}

function setGeo(text) {
  if (els.geoText) els.geoText.textContent = text;
}


function setInlineStatus(mode, icon, title, sub) {
  if (!els.inlineStatus) return;

  els.inlineStatus.classList.remove("waiting", "ok", "bad");
  if (mode === "waiting" || mode === "ok" || mode === "bad") {
    els.inlineStatus.classList.add(mode);
  }

  if (els.inlineStatusIcon) els.inlineStatusIcon.textContent = icon || "ℹ️";
  if (els.inlineStatusTitle) els.inlineStatusTitle.textContent = title || "";
  if (els.inlineStatusSub) els.inlineStatusSub.textContent = sub || "";
}

function setDriverInfo({ visible = false, name = "", meta = "" } = {}) {
  if (!els.driverInfo) return;
  els.driverInfo.style.display = visible ? "flex" : "none";
  if (els.driverInfoName) els.driverInfoName.textContent = name || "Livreur attribué";
  if (els.driverInfoMeta) els.driverInfoMeta.textContent = meta || "Position en attente…";
}

// ----------------------------
// ADN66 contrôles anti-abus client
// ----------------------------
const ADN_BAD_NAME_WORDS = [
  "test", "toto", "tata", "titi", "admin", "root", "null", "undefined",
  "fake", "faux", "spam", "aaaa", "azerty", "qwerty",
  "pute", "fdp", "connard", "con", "bite", "couille", "merde"
];

const ADN_ANTI_ABUSE_KEY = "adn66_track_abuse_v1";

function cleanHumanName(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[’`]/g, "'");
}

function isSuspiciousNamePart(part) {
  const p = String(part || "").toLowerCase();

  // Filtre anti-troll volontairement léger pour éviter de bloquer de vrais noms.
  if (p.length < 2) return true;
  if (p.length > 28) return true;

  // Refuse aaa, bbbb, etc.
  if (/([a-zà-ÿ])\1\1/i.test(p)) return true;

  // Refuse les mots troll évidents.
  if (ADN_BAD_NAME_WORDS.includes(p)) return true;

  return false;
}

function validateFullName(raw) {
  const name = cleanHumanName(raw);

  if (!name) {
    return { ok: false, value: "", title: "Nom ou prénom requis", message: "Veuillez indiquer votre nom ou prénom." };
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(name)) {
    return { ok: false, value: name, title: "Nom invalide", message: "Le nom ou prénom doit contenir uniquement des lettres." };
  }

  const parts = name.split(" ").filter(Boolean);

  // On accepte un seul mot : nom OU prénom.
  // On garde seulement les filtres anti-troll évidents.
  if (parts.some(isSuspiciousNamePart)) {
    return {
      ok: false,
      value: name,
      title: "Information invalide",
      message: "Le nom ou prénom indiqué semble invalide. Merci d’indiquer une vraie information."
    };
  }

  return { ok: true, value: name, title: "", message: "" };
}

function isBadPhonePattern(e164) {
  const local = "0" + String(e164 || "").replace("+33", "");
  const digits = local.replace(/\D/g, "");

  const fakeNumbers = new Set([
    "0600000000", "0611111111", "0622222222", "0633333333", "0644444444",
    "0655555555", "0666666666", "0677777777", "0688888888", "0699999999",
    "0700000000", "0711111111", "0722222222", "0733333333", "0744444444",
    "0755555555", "0766666666", "0777777777", "0788888888", "0799999999",
    "0601020304", "0612345678", "0712345678"
  ]);

  if (!/^0[67]\d{8}$/.test(digits)) return true;
  if (fakeNumbers.has(digits)) return true;
  if (/(\d)\1{5,}/.test(digits)) return true;
  if (digits.includes("123456") || digits.includes("654321")) return true;

  return false;
}

function validatePhoneMobile(raw) {
  const phone = normalizePhoneFR(raw);

  if (!phone) {
    return { ok: false, value: "", title: "Téléphone requis", message: "Veuillez indiquer un numéro de téléphone mobile valide." };
  }

  // Accepte uniquement les mobiles français convertis en +336 / +337.
  if (!/^(\+336|\+337)\d{8}$/.test(phone)) {
    return { ok: false, value: phone, title: "Téléphone invalide", message: "Le suivi accepte uniquement les numéros mobiles français en 06 ou 07." };
  }

  // Filtre léger : on bloque seulement les faux évidents.
  const local = "0" + phone.replace("+33", "");
  const fakeNumbers = new Set([
    "0600000000", "0611111111", "0622222222", "0633333333", "0644444444",
    "0655555555", "0666666666", "0677777777", "0688888888", "0699999999",
    "0700000000", "0711111111", "0722222222", "0733333333", "0744444444",
    "0755555555", "0766666666", "0777777777", "0788888888", "0799999999",
    "0612345678", "0712345678"
  ]);

  if (fakeNumbers.has(local)) {
    return { ok: false, value: phone, title: "Téléphone invalide", message: "Ce numéro semble faux ou invalide. Merci d’indiquer un vrai numéro mobile." };
  }

  return { ok: true, value: phone, title: "", message: "" };
}

function getAbuseState() {
  try {
    return JSON.parse(localStorage.getItem(ADN_ANTI_ABUSE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveAbuseState(state) {
  try {
    localStorage.setItem(ADN_ANTI_ABUSE_KEY, JSON.stringify(state || {}));
  } catch {}
}

function getAbuseBlockedSeconds() {
  const state = getAbuseState();
  const until = Number(state.blockUntil || 0);
  const now = Date.now();
  if (until > now) return Math.ceil((until - now) / 1000);
  return 0;
}

function registerBadAttempt() {
  const now = Date.now();
  const state = getAbuseState();
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  const recent = attempts.filter((ts) => now - Number(ts) < 10 * 60 * 1000);

  recent.push(now);
  state.attempts = recent;

  if (recent.length >= 5) {
    state.blockUntil = now + 2 * 60 * 1000;
  }

  saveAbuseState(state);

  return {
    count: recent.length,
    blockedSeconds: getAbuseBlockedSeconds(),
  };
}

function clearBadAttempts() {
  const state = getAbuseState();
  state.attempts = [];
  state.blockUntil = 0;
  saveAbuseState(state);
}

function showValidationPopup(title, message) {
  const abuse = registerBadAttempt();

  let warning = "";
  if (abuse.blockedSeconds > 0) {
    warning = `<br><br><b>Accès temporairement bloqué.</b><br>Trop de tentatives incorrectes. Merci de patienter ${abuse.blockedSeconds}s avant de réessayer.`;
  } else if (abuse.count >= 3) {
    warning = `<br><br><b>Attention :</b> plusieurs erreurs ont été détectées. En cas de nouvelle récidive, l’accès au suivi sera temporairement bloqué.`;
  } else {
    warning = `<br><br><b>Attention :</b> en cas d’abus ou de récidive, l’accès au suivi peut être temporairement bloqué.`;
  }

  adnOverlayShow({
    title,
    html: `${message}${warning}`,
    primaryLabel: "OK",
  });
}

function setPopupVisible(visible) {
  if (!els.popup) return;

  // ADN66 FIX:
  // Le panneau .clientPopup est visible par défaut dans le CSS.
  // Retirer seulement la classe "isVisible" ne suffit donc pas toujours
  // à le fermer après acceptation du suivi.
  // On force l'affichage/masquage directement pour garantir le comportement :
  // - visible au départ / refus / expiration
  // - masqué 3 secondes après "Suivi accepté"
  if (visible) {
    els.popup.classList.add("isVisible");
    els.popup.hidden = false;
    els.popup.removeAttribute("aria-hidden");
    els.popup.style.display = "";
    els.popup.style.pointerEvents = "";
    els.popup.style.opacity = "";
  } else {
    els.popup.classList.remove("isVisible");
    els.popup.hidden = true;
    els.popup.setAttribute("aria-hidden", "true");
    els.popup.style.display = "none";
    els.popup.style.pointerEvents = "none";
    els.popup.style.opacity = "0";
  }
}

function updatePopupVisibility() {
  const isAccepted = STATE.status === "accepted";
  const remaining = STATE.accessRemainingMs;
  const hasActiveAccess = isAccepted && (remaining == null || remaining > 0);
  setPopupVisible(!hasActiveAccess);
}

function toast(msg) {
  alert(msg);
}


// ------------------------------------------------------------
// ADN66 FIX UI : suppression de l'ancienne popup d'information
// ------------------------------------------------------------
// On garde uniquement la grande popup ADN66 (#adnOverlay) affichée
// après l'envoi de la demande, celle qui précise que le livreur reste
// libre d'accepter ou de refuser le partage de sa position.
// L'ancien encadré "Information importante — Suivi de livraison" était
// affiché avant l'envoi et faisait doublon.
function removeDuplicatePreRequestInfoPopup() {
  try {
    const allNodes = Array.from(document.querySelectorAll("body *"));

    const titleNode = allNodes.find((node) => {
      const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
      return txt.includes("Information importante") && txt.includes("Suivi de livraison");
    });

    if (!titleNode) return;

    let card = titleNode;
    for (let i = 0; i < 8 && card && card.parentElement && card.parentElement !== document.body; i++) {
      const txt = String(card.textContent || "").replace(/\s+/g, " ").trim();

      const looksLikeOldInfoCard =
        txt.includes("Information importante") &&
        txt.includes("Suivi de livraison") &&
        txt.includes("strictement limité") &&
        !txt.includes("Suivi en direct");

      if (looksLikeOldInfoCard) {
        break;
      }

      card = card.parentElement;
    }

    if (!card || card === document.body) return;

    const cardText = String(card.textContent || "").replace(/\s+/g, " ").trim();
    const safeToRemove =
      cardText.includes("Information importante") &&
      cardText.includes("Suivi de livraison") &&
      cardText.includes("strictement limité") &&
      !cardText.includes("Suivi en direct");

    if (safeToRemove) {
      card.remove();
    }
  } catch (e) {
    console.log("[adn66_remove_duplicate_info_popup]", e?.message || e);
  }
}

/* ===== ADN66 OVERLAY POPUP (reuse existing #adnOverlay) =====
   Utilisé UNIQUEMENT pour remplacer 3 alertes:
   - prénom manquant
   - téléphone manquant
   - demande envoyée (après envoi au livreur)
*/
function adnOverlayShow({ title = "Information", html = "", primaryLabel = "OK" } = {}) {
  const overlay = document.getElementById("adnOverlay");
  const t = document.getElementById("adnOverlayTitle");
  const txt = document.getElementById("adnOverlayText");
  const btn1 = document.getElementById("adnOverlayPrimary");
  const btn2 = document.getElementById("adnOverlaySecondary");
  if (!overlay || !t || !txt || !btn1) {
    // fallback (ne casse rien)
    alert((title ? title + "\n\n" : "") + String(html).replace(/<[^>]*>/g, ""));
    return;
  }

  t.textContent = title;
  txt.innerHTML = html;

  btn1.textContent = primaryLabel || "OK";
  btn1.onclick = () => {
    overlay.style.display = "none";
  };

  if (btn2) {
    btn2.style.display = "none";
    btn2.onclick = null;
  }

  overlay.style.display = "";
}

function adnOverlayNameMissing() {
  showValidationPopup(
    "Nom ou prénom requis",
    "Veuillez indiquer votre <b>nom ou prénom</b>.<br><br>Ces informations permettent au livreur de vous identifier rapidement lors de la livraison."
  );
}

function adnOverlayPhoneMissing() {
  showValidationPopup(
    "Téléphone requis",
    "Veuillez indiquer un <b>numéro mobile français valide</b>.<br><br>Il est utilisé uniquement si le livreur doit vous contacter pendant la livraison."
  );
}

function adnOverlayRequestSent() {
  adnOverlayShow({
    title: "🔐 Information — Suivi de livraison",
    html:
      "<b>Votre demande de suivi de livraison a bien été transmise.</b><br><br>" +
      "Dans le cadre de ce service, le livreur peut avoir accès à :<br><br>" +
      "• votre <b>position GPS</b>,<br>" +
      "• votre <b>nom</b>,<br>" +
      "• votre <b>numéro de téléphone</b>.<br><br>" +
      "Le livreur reste libre d’accepter ou de refuser le partage de sa position.<br><br>" +
      "Les données sont utilisées uniquement pour la gestion de la livraison en cours et sont définitivement supprimées du serveur sous 24 heures.",
    primaryLabel: "OK",
  });
}

function fmtRemaining(ms) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function stopTimer(id) {
  if (id) clearInterval(id);
}

function stopTimeout(id) {
  if (id) clearTimeout(id);
}

function disableRequest(disabled) {
  if (els.btnRequest) els.btnRequest.disabled = !!disabled;
}

function showReset(show) {
  if (els.btnReset) els.btnReset.style.display = show ? "inline-block" : "none";
}

// ----------------------------
// LocalStorage helpers
// ----------------------------
function lsGet(k, def = "") {
  try {
    const v = localStorage.getItem(k);
    return v == null ? def : v;
  } catch {
    return def;
  }
}

function lsSet(k, v) {
  try {
    localStorage.setItem(k, String(v));
  } catch {}
}

function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch {}
}

function lsGetJson(k, def = null) {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return def;
    return JSON.parse(raw);
  } catch {
    return def;
  }
}

function lsSetJson(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

function clearTrackingCache() {
  lsDel(LS.clientMapFixedPos);
  lsDel(LS.lastRoute);
  lsDel(LS.lastDriverPos);
}

function sameTrackingSession(cache = {}) {
  const rid = String(cache.requestId || "");
  const cid = String(cache.clientId || "");

  // Compatibilité : les anciennes sauvegardes sans session sont acceptées seulement
  // si une session locale existe. Les nouvelles sauvegardes sont liées requestId/clientId.
  if (!rid && !cid) return !!(STATE.requestId && STATE.clientId);

  return rid === String(STATE.requestId || "") && cid === String(STATE.clientId || "");
}

// ----------------------------
// PHONE helpers (FR)
// ----------------------------
function normalizePhoneFR(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  // keep digits and leading +
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    if (!s.startsWith("+33")) return "";
    let rest = s.slice(3).replace(/\D/g, "");
    if (rest.startsWith("0")) rest = rest.slice(1);
    if (rest.length !== 9) return "";
    return "+33" + rest;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length !== 10) return "";
  // Convert to E.164 (+33) by removing leading 0
  return "+33" + digits.slice(1);
}

function getPhoneE164() {
  const raw = (els.phone?.value || lsGet(LS.phone, "") || "").trim();
  return normalizePhoneFR(raw);
}

function persistPhoneIfValid() {
  const p = getPhoneE164();
  if (p) lsSet(LS.phone, p);
  return p;
}

// ----------------------------
// API helpers
// ----------------------------
function buildUrl(path, params = {}) {
  const u = new URL(CONFIG.API_BASE + path);
  u.searchParams.set("key", CONFIG.CLIENT_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function apiFetchJson(path, { method = "GET", params = {}, body = null } = {}) {
  const url = buildUrl(path, params);
  const init = {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  };
  if (body != null) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }

  if (!resp.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  if (data && data.ok === false) {
    throw new Error(data.error || data.message || "api_error");
  }
  return data;
}

// ----------------------------
// CLIENT PRESENCE HEARTBEAT
// ----------------------------
// Envoie au Worker, toutes les 5 secondes, si le client regarde réellement la page.
// visible = page affichée à l'écran ; focused = fenêtre active.
// Si le client ferme la page ou verrouille le téléphone, les signaux s'arrêtent naturellement.
function getClientPresencePayload() {
  return {
    requestId: STATE.requestId,
    clientId: STATE.clientId,
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
    ts: Date.now(),
  };
}

async function sendClientPresence({ useBeacon = false } = {}) {
  if (!STATE.requestId || !STATE.clientId) return false;

  const payload = getClientPresencePayload();

  try {
    if (useBeacon && navigator.sendBeacon) {
      const url = buildUrl("/client/presence");
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      return navigator.sendBeacon(url, blob);
    }

    await apiFetchJson("/client/presence", {
      method: "POST",
      body: payload,
    });
    return true;
  } catch (e) {
    console.log("[client_presence]", e?.message || e);
    return false;
  }
}

function startClientPresenceHeartbeat() {
  if (STATE.tClientPresence) return;

  sendClientPresence();
  STATE.tClientPresence = setInterval(sendClientPresence, 5000);
}

function stopClientPresenceHeartbeat({ sendFinal = false } = {}) {
  if (STATE.tClientPresence) {
    clearInterval(STATE.tClientPresence);
    STATE.tClientPresence = null;
  }

  if (sendFinal && STATE.requestId && STATE.clientId) {
    sendClientPresence({ useBeacon: true });
  }
}

function bindClientPresenceEvents() {
  document.addEventListener("visibilitychange", () => {
    if (!STATE.requestId || !STATE.clientId) return;
    sendClientPresence();
  });

  window.addEventListener("focus", () => {
    if (!STATE.requestId || !STATE.clientId) return;
    sendClientPresence();
  });

  window.addEventListener("blur", () => {
    if (!STATE.requestId || !STATE.clientId) return;
    sendClientPresence();
  });

  window.addEventListener("pagehide", () => {
    stopClientPresenceHeartbeat({ sendFinal: true });
  });

  window.addEventListener("beforeunload", () => {
    stopClientPresenceHeartbeat({ sendFinal: true });
  });
}

// ----------------------------
// MAP (Leaflet)
// ----------------------------
const ICON_CLIENT = L.icon({
  iconUrl: "./icons/marker-client.svg",
  iconSize: [44, 44],
  iconAnchor: [22, 44],
});
const ICON_DRIVER = L.icon({
  iconUrl: "./icons/marker-driver.svg",
  iconSize: [48, 48],
  iconAnchor: [24, 48],
});

function initMap() {
  const map = L.map("map", { zoomControl: true });
  map.setView([42.6887, 2.8948], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  const markerClient = L.marker([42.6887, 2.8948], { icon: ICON_CLIENT }).addTo(map);
  markerClient.bindPopup("Vous");

  const markerDriver = L.marker([42.6887, 2.8948], { icon: ICON_DRIVER }).addTo(map);
  markerDriver.bindPopup("Livreur");

  map.on("dragstart zoomstart", () => {
    STATE.mapUserMoved = true;
  });
  const mapEl = map.getContainer?.();
  if (mapEl) {
    mapEl.addEventListener("touchstart", () => { STATE.mapUserMoved = true; }, { passive: true });
    mapEl.addEventListener("pointerdown", () => { STATE.mapUserMoved = true; }, { passive: true });
  }

  STATE.map = map;
  STATE.markerClient = markerClient;
  STATE.markerDriver = markerDriver;
}

function decodeGooglePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < String(encoded || "").length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function buildRouteCumulativeMeters(latlngs) {
  const cumulative = [0];
  let total = 0;

  for (let i = 1; i < latlngs.length; i++) {
    total += approxMeters(latlngs[i - 1][0], latlngs[i - 1][1], latlngs[i][0], latlngs[i][1]);
    cumulative.push(total);
  }

  return cumulative;
}

function getFixedClientDestination() {
  if (STATE.clientMapFixedPos && Number.isFinite(Number(STATE.clientMapFixedPos.lat)) && Number.isFinite(Number(STATE.clientMapFixedPos.lng))) {
    return {
      lat: Number(STATE.clientMapFixedPos.lat),
      lng: Number(STATE.clientMapFixedPos.lng),
    };
  }

  if (STATE.markerClient) {
    const p = STATE.markerClient.getLatLng();
    if (p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))) {
      return { lat: Number(p.lat), lng: Number(p.lng) };
    }
  }

  return null;
}

function routeEndsNearFixedClient(latlngs) {
  const fixed = getFixedClientDestination();
  if (!fixed || !Array.isArray(latlngs) || !latlngs.length) return true;

  const last = latlngs[latlngs.length - 1];
  const d = approxMeters(Number(last[0]), Number(last[1]), fixed.lat, fixed.lng);

  // Sécurité : côté client, on refuse un tracé qui finit loin de la position de départ fixe.
  // Cela évite qu'un tracé renvoyé par le Worker vers la position live du client remplace
  // le tracé affiché vers le point posé au lancement de la session.
  return d <= 150;
}

function updateRouteLine(route) {
  if (!STATE.map || !route?.encodedPolyline) return false;
  const latlngs = decodeGooglePolyline(route.encodedPolyline);
  if (!latlngs.length) return false;

  // ✅ ADN66 FIX 20260627 v2 : on ne bloque plus le tracé si son arrivée
  // n'est pas exactement sur la position client fixe affichée.
  // Le marqueur client reste fixe visuellement, mais le tracé renvoyé par le Worker
  // est accepté pour éviter le blocage "Trajet en cours de calcul…".

  if (!STATE.routeLine) {
    STATE.routeLine = L.polyline(latlngs, {
      color: "#5db7ee",
      weight: 5,
      opacity: 0.88,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(STATE.map);
  } else {
    STATE.routeLine.setLatLngs(latlngs);
  }

  STATE.routeLatLngs = latlngs;
  STATE.routeCumulativeM = buildRouteCumulativeMeters(latlngs);
  STATE.routeMeta = {
    durationText: route.durationText || "",
    distanceText: route.distanceText || "",
    durationSeconds: Number(route.durationSeconds ?? route.duration_sec ?? route.duration ?? 0) || 0,
    distanceMeters: Number(route.distanceMeters ?? route.distance_m ?? route.distance ?? 0) || 0,
    updatedAtMs: Date.now(),
  };
  STATE.routeOffSinceMs = 0;
  STATE.routeNeedsRecalc = false;
  STATE.routeLastRequestMs = Date.now();

  updateLocalRouteMeta();

  // ✅ ADN66 FIX 20260627 : garde le dernier tracé pour éviter
  // "Trajet en cours de calcul…" après fermeture/réouverture de la page.
  if (STATE.requestId && STATE.clientId) {
    lsSetJson(LS.lastRoute, {
      requestId: STATE.requestId,
      clientId: STATE.clientId,
      route,
      savedAt: Date.now(),
    });
  }

  return true;
}

function clearRouteLine() {
  if (STATE.routeLine && STATE.map) {
    STATE.map.removeLayer(STATE.routeLine);
  }
  STATE.routeLine = null;
  STATE.routeLatLngs = [];
  STATE.routeCumulativeM = [];
  STATE.routeMeta = null;
  STATE.routeOffSinceMs = 0;
  STATE.routeNeedsRecalc = false;
  STATE.routeRecalcInFlight = false;
}

function toXYMeters(lat, lng, refLat) {
  const R = 6371000;
  const rad = Math.PI / 180;
  return {
    x: Number(lng) * rad * R * Math.cos(Number(refLat) * rad),
    y: Number(lat) * rad * R,
  };
}

function nearestOnSegmentMeters(point, a, b) {
  const refLat = point.lat;
  const p = toXYMeters(point.lat, point.lng, refLat);
  const p1 = toXYMeters(a[0], a[1], refLat);
  const p2 = toXYMeters(b[0], b[1], refLat);

  const vx = p2.x - p1.x;
  const vy = p2.y - p1.y;
  const wx = p.x - p1.x;
  const wy = p.y - p1.y;
  const len2 = vx * vx + vy * vy;

  let t = len2 <= 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = clamp(t, 0, 1);

  const projX = p1.x + t * vx;
  const projY = p1.y + t * vy;
  const dx = p.x - projX;
  const dy = p.y - projY;

  return {
    distanceM: Math.sqrt(dx * dx + dy * dy),
    t,
  };
}

function getRouteProgressForDriver() {
  if (!STATE.markerDriver || !STATE.routeLatLngs || STATE.routeLatLngs.length < 2) return null;

  const driver = STATE.markerDriver.getLatLng();
  if (!driver) return null;

  let best = null;
  const totalM = STATE.routeCumulativeM[STATE.routeCumulativeM.length - 1] || 0;

  for (let i = 0; i < STATE.routeLatLngs.length - 1; i++) {
    const a = STATE.routeLatLngs[i];
    const b = STATE.routeLatLngs[i + 1];
    const segM = Math.max(0, (STATE.routeCumulativeM[i + 1] || 0) - (STATE.routeCumulativeM[i] || 0));
    const near = nearestOnSegmentMeters({ lat: driver.lat, lng: driver.lng }, a, b);
    const alongM = (STATE.routeCumulativeM[i] || 0) + segM * near.t;

    if (!best || near.distanceM < best.offDistanceM) {
      best = {
        offDistanceM: near.distanceM,
        alongM,
        remainingM: Math.max(0, totalM - alongM),
      };
    }
  }

  return best;
}

function formatDistanceMeters(m) {
  const n = Math.max(0, Number(m || 0));
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")} km`;
  return `${Math.round(n / 10) * 10} m`;
}

function formatDurationSeconds(sec) {
  const s = Math.max(0, Math.round(Number(sec || 0)));
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function estimateRemainingSeconds(remainingM) {
  const meta = STATE.routeMeta || {};
  const totalDistance = Number(meta.distanceMeters || 0);
  const totalDuration = Number(meta.durationSeconds || 0);

  if (totalDistance > 0 && totalDuration > 0) {
    return (Math.max(0, remainingM) / totalDistance) * totalDuration;
  }

  // Fallback prudent : environ 25 km/h en ville.
  return Math.max(60, Math.max(0, remainingM) / 6.95);
}

function updateLocalRouteMeta() {
  if (STATE.status !== "accepted") return;
  if (!STATE.routeLine || !STATE.routeLatLngs.length) return;

  const progress = getRouteProgressForDriver();
  if (!progress) return;

  const now = Date.now();
  const isOffRoute = progress.offDistanceM > STATE.routeOffThresholdM;

  if (isOffRoute) {
    if (!STATE.routeOffSinceMs) STATE.routeOffSinceMs = now;

    if (now - STATE.routeOffSinceMs >= STATE.routeOffRecalcDelayMs) {
      STATE.routeNeedsRecalc = true;
    }

    // Option A validée : tant que les 15 secondes hors tracé ne sont pas passées,
    // on garde le dernier tracé/délai/distance affiché.
    return;
  }

  STATE.routeOffSinceMs = 0;
  STATE.routeNeedsRecalc = false;

  const distanceText = formatDistanceMeters(progress.remainingM);
  const durationText = formatDurationSeconds(estimateRemainingSeconds(progress.remainingM));
  const name = STATE.currentDriverName || "Votre livreur";

  setDriverInfo({
    visible: true,
    name: `Votre livreur : ${name}`,
    meta: `Trajet estimé : ${durationText} • ${distanceText}`,
  });
}

function shouldRequestRouteNow() {
  if (STATE.routeRecalcInFlight) return false;
  if (STATE.status !== "accepted") return false;

  const now = Date.now();

  // Premier tracé : on demande immédiatement.
  if (!STATE.routeLine) return true;

  // Sécurité anti-spam API : jamais plus d'une demande toutes les 6 secondes.
  if (now - STATE.routeLastRequestMs < 6000) return false;

  // ✅ ADN66 FIX 20260627 v2 : recalcul régulier.
  // Avant, le tracé restait trop fixe et pouvait bloquer l'affichage côté client.
  if (now - STATE.routeLastRequestMs >= 15000) return true;

  // Recalcul aussi si le livreur est détecté hors tracé.
  if (STATE.routeNeedsRecalc) return true;

  return false;
}

function buildTrackingParams({ withRoute = false } = {}) {
  const params = {
    clientId: STATE.clientId,
    requestId: STATE.requestId,
  };

  if (withRoute) {
    params.route = "1";

    const fixed = getFixedClientDestination();
    if (fixed) {
      // Ces paramètres sont volontairement redondants pour rester compatibles
      // avec un Worker qui accepterait l'un ou l'autre nom côté route.
      params.targetLat = fixed.lat;
      params.targetLng = fixed.lng;
      params.destLat = fixed.lat;
      params.destLng = fixed.lng;
      params.clientStartLat = fixed.lat;
      params.clientStartLng = fixed.lng;
      params.routeMode = "client_start_fixed";
    }
  }

  return params;
}

function setClientMapFixedPosition(lat, lng, acc = null, ts = Date.now()) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;

  // Côté carte client GitHub : on garde la position de départ fixe.
  // La vraie position GPS continue d'être envoyée au serveur séparément pour le livreur/admin.
  if (!STATE.clientMapFixedPos) {
    STATE.clientMapFixedPos = { lat: Number(lat), lng: Number(lng), acc, ts };

    // ✅ ADN66 FIX 20260627 : sauvegarde pour restaurer la destination
    // après fermeture/réouverture de la page client.
    lsSetJson(LS.clientMapFixedPos, {
      requestId: STATE.requestId || "",
      clientId: STATE.clientId || "",
      ...STATE.clientMapFixedPos,
      savedAt: Date.now(),
    });

    if (STATE.markerClient) STATE.markerClient.setLatLng([Number(lat), Number(lng)]);

    // Aucun recentrage automatique ici : le seul recentrage automatique autorisé
    // se fait 3,4 secondes après acceptation du livreur.
  }
}

function updateClientMarker(lat, lng) {
  // Compatibilité avec les anciens appels : ne fixe que la première position visible.
  setClientMapFixedPosition(lat, lng);
}

function setDriverMarkerImmediate(lat, lng) {
  if (!STATE.markerDriver) return;
  STATE.markerDriver.setLatLng([lat, lng]);
}

function setRecenterButtonVisible(visible) {
  if (!els.btnRecenter) return;
  els.btnRecenter.classList.toggle("isVisible", !!visible);
}

function fitBothPositions({ force = false, manual = false } = {}) {
  if (!STATE.map || !STATE.markerClient || !STATE.markerDriver) return false;

  if (!force && STATE.mapUserMoved && !manual) return false;

  const now = Date.now();
  if (!force && now - STATE.lastFitMs < 1200) return false;
  STATE.lastFitMs = now;

  const a = STATE.markerClient.getLatLng();
  const b = STATE.markerDriver.getLatLng();
  if (!a || !b) return false;

  const bounds = L.latLngBounds([a, b]);
  STATE.map.fitBounds(bounds.pad(0.28), { padding: [46, 120], maxZoom: 15 });
  return true;
}

function fitIfBothThrottled(force = false) {
  // Ancienne fonction conservée pour compatibilité, mais l'automatique est volontairement limité.
  return fitBothPositions({ force, manual: false });
}

function attemptAcceptedAutoRecenter() {
  if (!STATE.acceptedAutoRecenterArmed || STATE.acceptedAutoRecenterDone) return;
  if (!STATE.driver?.hasFirstFix) return;

  const ok = fitBothPositions({ force: true, manual: false });
  if (ok) {
    STATE.acceptedAutoRecenterDone = true;
    STATE.acceptedAutoRecenterArmed = false;
  }
}

function scheduleAcceptedAutoRecenter() {
  if (STATE.acceptedAutoRecenterTimer) clearTimeout(STATE.acceptedAutoRecenterTimer);

  STATE.acceptedAutoRecenterDone = false;
  STATE.acceptedAutoRecenterArmed = false;

  // Un seul recentrage automatique : 3,4 secondes après acceptation du livreur.
  STATE.acceptedAutoRecenterTimer = setTimeout(() => {
    STATE.acceptedAutoRecenterTimer = null;
    STATE.acceptedAutoRecenterArmed = true;
    attemptAcceptedAutoRecenter();
  }, 3400);
}

function handleRecenterClick() {
  STATE.mapUserMoved = true;
  fitBothPositions({ force: true, manual: true });
}

// ----------------------------
// ✅ DRIVER SMOOTHING ENGINE (Waze-like)
// ----------------------------
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) {
  // smoothstep
  return t * t * (3 - 2 * t);
}

// approx meters between two lat/lng (fast enough)
function approxMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function driverApplyPollGlideDefaults() {
  const d = STATE.driver;

  // poll interval from config (fallback 3000)
  const poll = Number(CONFIG.POLL_DRIVER_MS || 3000);
  if (Number.isFinite(poll) && poll > 500) d.pollMs = poll;

  // requested: glide around 2.9s when poll=3s, and always close to poll
  // We'll keep a small margin so we never "overshoot".
  const desired = 2900;
  d.glideTargetMs = clamp(desired, 800, Math.max(800, d.pollMs - d.glideMarginMs));

  d.lastPollApplyMs = Date.now();
}

function driverAddPoint(lat, lng, tsServerMs) {
  const d = STATE.driver;
  const rxMs = Date.now();

  // compute rx interval
  if (d.lastRxMs) {
    const dt = rxMs - d.lastRxMs;
    if (dt > 0 && dt < 30000) {
      d.rxIntervals.push(dt);
      if (d.rxIntervals.length > d.rxIntervalsMax) d.rxIntervals.shift();
    }
  }
  d.lastRxMs = rxMs;

  // adaptive delay: based on avg rx interval
  if (d.rxIntervals.length >= 3) {
    const avg = d.rxIntervals.reduce((s, v) => s + v, 0) / d.rxIntervals.length;
    // base = 0.7 * avg, clamped to [2.0s, 2.6s]
    const target = clamp(Math.round(avg * 0.7), d.delayMin, d.delayMax);
    // smooth change (avoid jitter)
    d.delayMs = Math.round(d.delayMs * 0.8 + target * 0.2);
  }

  // de-dup / sanity
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  // ✅ ADN66 FIX 20260627 : garde la dernière vraie position livreur
  // pour ne pas réafficher le véhicule au point initial après réouverture.
  if (STATE.requestId && STATE.clientId) {
    lsSetJson(LS.lastDriverPos, {
      requestId: STATE.requestId,
      clientId: STATE.clientId,
      lat,
      lng,
      tsServerMs: tsServerMs || Date.now(),
      savedAt: Date.now(),
    });
  }

  const last = d.buf.length ? d.buf[d.buf.length - 1] : null;
  if (last) {
    const dist = approxMeters(last.lat, last.lng, lat, lng);
    // ignore absurd jumps unless time is huge
    const dt = Math.max(1, tsServerMs - last.tsServerMs);
    const speed = dist / (dt / 1000); // m/s
    if (speed > d.maxSpeedMps * 2) {
      // too crazy -> ignore this sample
      return;
    }
    // update velocity estimate (per ms)
    const vLat = (lat - last.lat) / dt;
    const vLng = (lng - last.lng) / dt;
    d.vel = { vLat, vLng };
    d.lastVelFrom = { lat, lng, tsMs: tsServerMs };
  }

  d.buf.push({ lat, lng, tsServerMs, rxMs });
  if (d.buf.length > d.maxBuf) d.buf.shift();

  // if first fix, set immediately and fit once
  if (!d.hasFirstFix) {
    d.hasFirstFix = true;
    d.disp = { lat, lng };
    d.lastDispMs = Date.now();
    setDriverMarkerImmediate(lat, lng);
    attemptAcceptedAutoRecenter();
  }
}

function driverPruneBuffer(nowServerMs) {
  const d = STATE.driver;
  // Keep points around the render time window
  const keepAfter = nowServerMs - 20000; // keep last 20s
  while (d.buf.length && d.buf[0].tsServerMs < keepAfter) d.buf.shift();
}

function driverSampleAtTime(renderServerMs) {
  const d = STATE.driver;
  const buf = d.buf;

  if (buf.length === 0) return null;
  if (buf.length === 1) return { lat: buf[0].lat, lng: buf[0].lng, mode: "single" };

  // find segment [i, i+1] that contains render time
  let i = -1;
  for (let k = 0; k < buf.length - 1; k++) {
    if (buf[k].tsServerMs <= renderServerMs && renderServerMs <= buf[k + 1].tsServerMs) {
      i = k;
      break;
    }
  }

  if (i >= 0) {
    const a = buf[i];
    const b = buf[i + 1];
    const dt = b.tsServerMs - a.tsServerMs;
    const t = dt <= 0 ? 1 : (renderServerMs - a.tsServerMs) / dt;
    const tt = ease(clamp(t, 0, 1));
    return {
      lat: lerp(a.lat, b.lat, tt),
      lng: lerp(a.lng, b.lng, tt),
      mode: "interp",
    };
  }

  // render time is AFTER last point => predict softly
  const last = buf[buf.length - 1];
  const age = renderServerMs - last.tsServerMs;

  // If very old, just stick to last
  if (age > 12000) {
    return { lat: last.lat, lng: last.lng, mode: "stale" };
  }

  // prediction using last velocity
  if (d.vel) {
    const predLat = last.lat + d.vel.vLat * age;
    const predLng = last.lng + d.vel.vLng * age;

    // speed clamp
    const dist = approxMeters(last.lat, last.lng, predLat, predLng);
    const speed = dist / Math.max(0.001, age / 1000);
    if (speed > d.maxSpeedMps) {
      // clamp: reduce prediction
      const ratio = d.maxSpeedMps / speed;
      return {
        lat: last.lat + (predLat - last.lat) * ratio,
        lng: last.lng + (predLng - last.lng) * ratio,
        mode: "pred_clamped",
      };
    }

    return { lat: predLat, lng: predLng, mode: "pred" };
  }

  return { lat: last.lat, lng: last.lng, mode: "last" };
}

function driverStartLoop() {
  const d = STATE.driver;
  if (d.raf) return;

  const tick = () => {
    d.raf = requestAnimationFrame(tick);

    if (!STATE.markerDriver) return;
    if (!d.hasFirstFix) return;
    if (d.buf.length === 0) return;

    // estimate server time using last point (rxMs - tsServerMs offset)
    const last = d.buf[d.buf.length - 1];
    const offset = last.rxMs - last.tsServerMs; // approx network+clock offset
    const nowServerMs = Date.now() - offset;

    driverPruneBuffer(nowServerMs);

    // render at (now - delay)
    const renderServerMs = nowServerMs - d.delayMs;

    const sample = driverSampleAtTime(renderServerMs);
    if (!sample) return;

    const current = STATE.markerDriver.getLatLng();
    const targetLat = sample.lat;
    const targetLng = sample.lng;

    const now = Date.now();
    const dtMs = d.lastDispMs ? now - d.lastDispMs : 16;
    d.lastDispMs = now;

    // ✅ follow factor tuned to "glideTargetMs" (2.9s)
    const tau = Math.max(180, d.glideTargetMs / 3);
    const alphaRaw = dtMs / tau;
    const follow = clamp(alphaRaw, 0.03, 0.18); // clamp for stability

    const newLat = lerp(current.lat, targetLat, follow);
    const newLng = lerp(current.lng, targetLng, follow);

    setDriverMarkerImmediate(newLat, newLng);

    // Pas de recentrage automatique en boucle côté client.
    attemptAcceptedAutoRecenter();
  };

  d.raf = requestAnimationFrame(tick);
}

function driverStopLoop() {
  const d = STATE.driver;
  if (d.raf) cancelAnimationFrame(d.raf);
  d.raf = 0;
  d.buf = [];
  d.rxIntervals = [];
  d.lastRxMs = 0;
  d.delayMs = d.delayMin;
  d.disp = null;
  d.hasFirstFix = false;
  d.vel = null;
  d.lastVelFrom = null;
}

// ----------------------------
// GEOLOCATION
// ----------------------------
function ensureGeolocationAvailable() {
  return !!(navigator && navigator.geolocation);
}

function isSecureOk() {
  // geolocation requires https (or localhost)
  return !!(window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1");
}

function stopGeolocationWatch() {
  try {
    if (STATE.watchId != null && navigator?.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(STATE.watchId);
    }
  } catch {}
  STATE.watchId = null;
}

function ensureGeolocationWatch() {
  if (!ensureGeolocationAvailable()) return;
  if (STATE.watchId != null) return;

  try {
    STATE.watchId = navigator.geolocation.watchPosition(onGeoOk, onGeoErr, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  } catch {}
}

function onGeoOk(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const acc = pos.coords.accuracy;
  const ts = pos.timestamp || Date.now();

  STATE.clientPos = { lat, lng, acc, ts };
  setClientMapFixedPosition(lat, lng, acc, ts);

  setGeo(`✅ Position partagée (±${Math.round(acc)}m)`);

  if (STATE.status === "idle" || STATE.status === "refused" || STATE.status === "expired" || STATE.status === "error") {
    disableRequest(false);
  }
}

function onGeoErr(err) {
  console.log("[geo] error", err);
  const code = err?.code;

  if (!isSecureOk()) {
    setGeo("⛔ HTTPS requis pour la géolocalisation");
    disableRequest(true);
    return;
  }

  // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
  if (code === 1) {
    setGeo("⛔ Autorisation GPS refusée (active-la puis réessaie)");
  } else if (code === 2) {
    setGeo("⛔ GPS indisponible (réessaie)");
  } else if (code === 3) {
    setGeo("⛔ Timeout GPS (réessaie)");
  } else {
    setGeo("⛔ Position refusée : impossible d'afficher le livreur");
  }

  // On ne bloque pas à vie : le clic sur "Activer le suivi" relancera la demande GPS.
  disableRequest(false);
}

async function requestGeolocationOnceInteractive() {
  if (!ensureGeolocationAvailable()) {
    setGeo("⛔ Géolocalisation indisponible sur ce navigateur");
    return false;
  }
  if (!isSecureOk()) {
    setGeo("⛔ HTTPS requis pour la géolocalisation");
    return false;
  }
  if (STATE.geoInFlight) return !!STATE.clientPos;

  STATE.geoInFlight = true;
  setGeo("📍 Demande d'accès à votre position…");

  const ok = await new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onGeoOk(pos);
          resolve(true);
        },
        (err) => {
          onGeoErr(err);
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    } catch (e) {
      console.log("[geo] getCurrentPosition exception", e);
      setGeo("⛔ Impossible d'accéder au GPS");
      resolve(false);
    }
  });

  STATE.geoInFlight = false;

  if (ok) {
    ensureGeolocationWatch();
  } else {
    stopGeolocationWatch();
  }

  return ok;
}

function startGeolocationPassiveBoot() {
  // Boot "soft": on tente une fois (sans bloquer),
  // mais le vrai prompt est garanti via clic (handleRequestClick).
  if (!ensureGeolocationAvailable()) {
    setGeo("⛔ Géolocalisation indisponible sur ce navigateur");
    disableRequest(true);
    return;
  }
  if (!isSecureOk()) {
    setGeo("⛔ HTTPS requis pour la géolocalisation");
    disableRequest(true);
    return;
  }

  // tentative unique "silencieuse"
  if (STATE.geoRequestedOnce) return;
  STATE.geoRequestedOnce = true;

  // on ne bloque pas le bouton ici : si le prompt est bloqué par le navigateur,
  // l'utilisateur cliquera sur "Activer le suivi" => prompt.
  requestGeolocationOnceInteractive().catch(() => {});
}

// ----------------------------
// SESSION / STATE MACHINE
// ----------------------------
function loadSession() {
  const requestId = lsGet(LS.requestId, "");
  const clientId = lsGet(LS.clientId, "");
  const name = lsGet(LS.name, "");
  const phone = lsGet(LS.phone, "");

  if (els.name && name) els.name.value = name;
  if (els.phone && phone) els.phone.value = phone;

  if (requestId && clientId) {
    STATE.requestId = requestId;
    STATE.clientId = clientId;
    STATE.status = "pending";
    return true;
  }
  return false;
}

function saveSession({ requestId, clientId, name }) {
  lsSet(LS.requestId, requestId);
  lsSet(LS.clientId, clientId);
  lsSet(LS.name, name);

  // Si la position fixe a été posée avant la création de session,
  // on la rattache maintenant au requestId/clientId.
  if (STATE.clientMapFixedPos) {
    lsSetJson(LS.clientMapFixedPos, {
      requestId,
      clientId,
      ...STATE.clientMapFixedPos,
      savedAt: Date.now(),
    });
  }
}

function clearSession() {
  lsDel(LS.requestId);
  lsDel(LS.clientId);
  STATE.requestId = "";
  STATE.clientId = "";
}

function canRequestNow() {
  const last = Number(lsGet(LS.lastRequestMs, "0")) || 0;
  const cooldown = CONFIG.REQUEST_COOLDOWN_MS || 30000;
  const delta = Date.now() - last;
  return delta >= cooldown;
}

function setRequestedNow() {
  lsSet(LS.lastRequestMs, String(Date.now()));
}

function stopAllLoops() {
  stopTimer(STATE.tCountdown);
  stopTimer(STATE.tPollDriver);
  stopTimer(STATE.tSendClientPos);
  stopTimer(STATE.tRouteLocalMeta);
  stopClientPresenceHeartbeat({ sendFinal: true });
  stopTimeout(STATE.tPollStatus);
  stopTimeout(STATE.acceptedAutoRecenterTimer);
  STATE.tCountdown = null;
  STATE.tPollDriver = null;
  STATE.tSendClientPos = null;
  STATE.tRouteLocalMeta = null;
  STATE.tClientPresence = null;
  STATE.tPollStatus = null;
  STATE.acceptedAutoRecenterTimer = null;
  STATE.acceptedAutoRecenterArmed = false;
  STATE.acceptedAutoRecenterDone = false;
  driverStopLoop();
}

function resetFlow({ keepName = true } = {}) {
  if (STATE.acceptedPopupHideTimer) {
    clearTimeout(STATE.acceptedPopupHideTimer);
    STATE.acceptedPopupHideTimer = null;
  }
  stopAllLoops();
  clearSession();
  clearTrackingCache();
  STATE.status = "idle";
  STATE.accessRemainingMs = null;
  STATE.clientMapFixedPos = null;
  clearRouteLine();
  STATE.firstAutoCenterDone = false;
  STATE.mapUserMoved = false;
  setRecenterButtonVisible(false);
  if (STATE.clientPos) {
    setClientMapFixedPosition(STATE.clientPos.lat, STATE.clientPos.lng, STATE.clientPos.acc, STATE.clientPos.ts);
  }

  setBadge("Prêt : demande de suivi");
  setState("—");
  setCountdown("—");

  disableRequest(!STATE.clientPos);
  showReset(false);

  if (!keepName && els.name) {
    els.name.value = "";
    lsDel(LS.name);
  }
}

// ----------------------------
// ADN66 FIX 20260627 : restauration cache suivi client
// ----------------------------
function restoreClientTrackingCache() {
  if (!STATE.requestId || !STATE.clientId) return;

  const maxAgeMs = 30 * 60 * 1000;
  const nowMs = Date.now();

  const fixed = lsGetJson(LS.clientMapFixedPos, null);
  if (
    fixed &&
    sameTrackingSession(fixed) &&
    nowMs - Number(fixed.savedAt || fixed.ts || 0) < maxAgeMs &&
    Number.isFinite(Number(fixed.lat)) &&
    Number.isFinite(Number(fixed.lng))
  ) {
    STATE.clientMapFixedPos = {
      lat: Number(fixed.lat),
      lng: Number(fixed.lng),
      acc: fixed.acc ?? null,
      ts: fixed.ts || nowMs,
    };

    if (STATE.markerClient) {
      STATE.markerClient.setLatLng([STATE.clientMapFixedPos.lat, STATE.clientMapFixedPos.lng]);
    }
  }

  const lastDriver = lsGetJson(LS.lastDriverPos, null);
  if (
    lastDriver &&
    sameTrackingSession(lastDriver) &&
    nowMs - Number(lastDriver.savedAt || 0) < maxAgeMs &&
    Number.isFinite(Number(lastDriver.lat)) &&
    Number.isFinite(Number(lastDriver.lng))
  ) {
    const lat = Number(lastDriver.lat);
    const lng = Number(lastDriver.lng);

    setDriverMarkerImmediate(lat, lng);
    STATE.driver.hasFirstFix = true;
    STATE.driver.disp = { lat, lng };
    STATE.driver.lastDispMs = nowMs;

    // On remet aussi un point dans le buffer pour que le lissage reparte proprement.
    STATE.driver.buf = [{
      lat,
      lng,
      tsServerMs: Number(lastDriver.tsServerMs || nowMs),
      rxMs: nowMs,
    }];
  }

  const cachedRoute = lsGetJson(LS.lastRoute, null);
  if (
    cachedRoute &&
    sameTrackingSession(cachedRoute) &&
    cachedRoute.route &&
    nowMs - Number(cachedRoute.savedAt || 0) < maxAgeMs
  ) {
    updateRouteLine(cachedRoute.route);
  }

  if (STATE.markerClient && STATE.markerDriver && STATE.driver.hasFirstFix) {
    setRecenterButtonVisible(true);
  }
}

// ----------------------------
// API Calls
// ----------------------------
async function sendClientPositionUpdate() {
  if (!STATE.clientId || !STATE.clientPos) return;

  const name = (els.name?.value || lsGet(LS.name, "") || "").trim().slice(0, 40);
  const phone = persistPhoneIfValid();

  try {
    await apiFetchJson("/client/position/update", {
      method: "POST",
      body: {
        clientId: STATE.clientId,
        requestId: STATE.requestId,
        name,
        phone,
        lat: STATE.clientPos.lat,
        lng: STATE.clientPos.lng,
        ts: STATE.clientPos.ts || Date.now(),
      },
    });
  } catch (e) {
    console.log("[client_pos_update]", e?.message || e);
  }
}

async function pollDriverPosition() {
  if (!STATE.clientId && !STATE.requestId) return;

  const withRoute = shouldRequestRouteNow();
  if (withRoute) STATE.routeRecalcInFlight = true;

  try {
    // Nouveau Worker: renvoie uniquement le livreur attribué.
    // Le tracé complet est demandé intelligemment :
    // - premier tracé
    // - recalcul régulier toutes les ~15 secondes
    // - ou livreur hors tracé.
    let data = null;
    try {
      data = await apiFetchJson("/client/tracking", {
        method: "GET",
        params: buildTrackingParams({ withRoute }),
      });
    } catch (trackingErr) {
      // Compatibilité ancien Worker si /client/tracking n'est pas encore publié.
      const params = buildTrackingParams({ withRoute });
      delete params.requestId;
      data = await apiFetchJson("/client/driver-position", {
        method: "GET",
        params,
      });
    }

    if (data?.client && Number.isFinite(Number(data.client.lat)) && Number.isFinite(Number(data.client.lng))) {
      // Côté client GitHub, cela ne fixe que la première position visible.
      // Les mises à jour suivantes restent envoyées au serveur, mais ne déplacent pas
      // la destination affichée de la carte client.
      setClientMapFixedPosition(Number(data.client.lat), Number(data.client.lng));
    }

    if (data && data.driver && Number.isFinite(Number(data.driver.lat)) && Number.isFinite(Number(data.driver.lng))) {
      const lat = Number(data.driver.lat);
      const lng = Number(data.driver.lng);
      const driverName = String(data.driver.driverName || data.request?.assignedDriverName || "Votre livreur");
      STATE.currentDriverName = driverName;

      // Use server timestamp if present, else now
      const tsServerMs = data.driver.ts && Number.isFinite(Number(data.driver.ts)) ? Number(data.driver.ts) : Date.now();

      driverAddPoint(lat, lng, tsServerMs);
      driverStartLoop();

      let routeUpdated = false;
      if (data.route?.encodedPolyline) {
        routeUpdated = updateRouteLine(data.route);
      }

      if (withRoute) {
        STATE.routeRecalcInFlight = false;
        // Si le Worker n'a pas renvoyé de tracé exploitable, on retentera plus tard
        // sans harceler l'API à chaque poll.
        STATE.routeLastRequestMs = Date.now();
      }

      if (!STATE.routeLine) {
        const metaParts = [];
        if (data.route?.durationText && routeUpdated) metaParts.push(data.route.durationText);
        if (data.route?.distanceText && routeUpdated) metaParts.push(data.route.distanceText);
        setDriverInfo({
          visible: true,
          name: `Votre livreur : ${driverName}`,
          meta: metaParts.length ? `Trajet estimé : ${metaParts.join(" • ")}` : "Trajet en cours de calcul…",
        });
      } else {
        updateLocalRouteMeta();
      }
    } else {
      if (withRoute) STATE.routeRecalcInFlight = false;
      setDriverInfo({ visible: true, name: "Livreur attribué", meta: "Position du livreur en attente…" });
    }

    if (typeof data.remainingMs === "number") {
      STATE.accessRemainingMs = data.remainingMs;
    }
  } catch (e) {
    if (withRoute) STATE.routeRecalcInFlight = false;
    console.log("[driver_tracking]", e?.message || e);
    // Ne pas terminer l'accès sur une erreur de position.
  }
}

async function pollStatus() {
  if (!STATE.requestId) return;

  try {
    const data = await apiFetchJson("/client/status", {
      method: "GET",
      params: { requestId: STATE.requestId },
    });

    const req = data?.request || null;
    const access = data?.access || null;

    const status = String(req?.status || "").toLowerCase();
    STATE.status = status || "pending";

    if (status === "pending") {
      startClientPresenceHeartbeat();
      setBadge("Demande envoyée • en attente");
      setState("En attente de décision");
      setInlineStatus("waiting", "⏳", "En attente d’acceptation du livreur", "Cela peut prendre plusieurs minutes. Vous pouvez quitter cette page et revenir à tout moment : cela n’annule pas le suivi.");
      setCountdown("—");

      STATE.tPollStatus = setTimeout(pollStatus, CONFIG.POLL_STATUS_MS || 3000);
      return;
    }

    if (status === "refused") {
      stopClientPresenceHeartbeat({ sendFinal: true });
      setBadge("Refusé");
      setState("Refusé par le livreur");
      setInlineStatus("bad", "❌", "Demande refusée par le livreur", "Le livreur n’a pas accepté le partage de sa position. Vous pouvez relancer une demande si nécessaire.");
      setCountdown("—");
      setDriverInfo({ visible: false });
      clearRouteLine();

      disableRequest(false);
      showReset(true);
      return;
    }

    if (status === "expired") {
      stopClientPresenceHeartbeat({ sendFinal: true });
      setBadge("Expiré");
      setState("Demande expirée");
      setInlineStatus("waiting", "⏱️", "Demande expirée", "La demande n’a pas été acceptée à temps. Vous pouvez relancer une demande si nécessaire.");
      setCountdown("—");
      setDriverInfo({ visible: false });
      clearRouteLine();

      disableRequest(false);
      showReset(true);
      return;
    }

    if (status === "accepted") {
      startClientPresenceHeartbeat();
      setBadge("Autorisé ✅");
      setState("Suivi actif");
      const assignedName = String(req?.assignedDriverName || req?.decided_by_driver_name || "").trim();
      setInlineStatus(
        "ok",
        "✅",
        assignedName ? `Suivi accepté par ${assignedName}` : "Suivi accepté",
        assignedName ? `Votre livreur ${assignedName} est affiché sur la carte.` : "Le suivi est actif. La carte va s’afficher automatiquement."
      );
      if (assignedName) {
        setDriverInfo({ visible: true, name: `Votre livreur : ${assignedName}`, meta: "Position en cours de récupération…" });
      }

      // On garde la popup 3 secondes, sans afficher le compteur immédiatement.
      // Ensuite la popup disparaît et le compteur démarre normalement.
      setCountdown("—");

      if (typeof access?.remainingMs === "number") {
        STATE.accessRemainingMs = access.remainingMs;
      }

      stopTimeout(STATE.tPollStatus);
      STATE.tPollStatus = null;

      if (STATE.acceptedPopupHideTimer) {
        clearTimeout(STATE.acceptedPopupHideTimer);
        STATE.acceptedPopupHideTimer = null;
      }

      scheduleAcceptedAutoRecenter();
      setRecenterButtonVisible(true);

      STATE.acceptedPopupHideTimer = setTimeout(() => {
        STATE.acceptedPopupHideTimer = null;
        setPopupVisible(false);
        startAcceptedLoops();
      }, 3000);

      return;
    }

    setBadge("Statut inconnu");
    setState(status || "—");
    STATE.tPollStatus = setTimeout(pollStatus, CONFIG.POLL_STATUS_MS || 3000);
  } catch (e) {
    console.log("[status]", e?.message || e);
    setBadge("Erreur statut");
    setState("Erreur réseau");
    STATE.tPollStatus = setTimeout(pollStatus, CONFIG.POLL_STATUS_MS || 3000);
  }
}

function startAcceptedLoops() {
  // ✅ apply cadence/glide once when accepted loops start
  driverApplyPollGlideDefaults();

  // Présence client : signal toutes les 5 secondes côté Worker.
  startClientPresenceHeartbeat();

  stopTimer(STATE.tSendClientPos);
  STATE.tSendClientPos = setInterval(sendClientPositionUpdate, CONFIG.SEND_CLIENT_POS_MS || 8000);
  sendClientPositionUpdate();

  stopTimer(STATE.tPollDriver);
  STATE.tPollDriver = setInterval(pollDriverPosition, CONFIG.POLL_DRIVER_MS || 3000);
  pollDriverPosition();

  // Distance/délai côté client : mise à jour locale toutes les 1 seconde
  // sur le tracé déjà affiché, sans recalcul API.
  stopTimer(STATE.tRouteLocalMeta);
  STATE.tRouteLocalMeta = setInterval(updateLocalRouteMeta, 1000);

  // start smoothing loop now (even before first driver point)
  driverStartLoop();

  stopTimer(STATE.tCountdown);
  STATE.tCountdown = setInterval(() => {
    if (STATE.accessRemainingMs == null) {
      setCountdown("—");
      return;
    }
    STATE.accessRemainingMs = Math.max(0, STATE.accessRemainingMs - 1000);
    setCountdown(fmtRemaining(STATE.accessRemainingMs));
    if (STATE.accessRemainingMs <= 0) {
      STATE.status = "expired";

      setBadge("Accès terminé");
      setState("Accès terminé");
      setInlineStatus("waiting", "⏱️", "Suivi terminé", "La session de suivi est terminée. La page va revenir au départ.");
      setCountdown("0:00");

      stopTimer(STATE.tSendClientPos);
      STATE.tSendClientPos = null;
      stopClientPresenceHeartbeat({ sendFinal: true });
      stopTimer(STATE.tRouteLocalMeta);
      STATE.tRouteLocalMeta = null;
      stopTimer(STATE.tPollDriver);
      STATE.tPollDriver = null;
      stopTimer(STATE.tCountdown);
      STATE.tCountdown = null;

      driverStopLoop();
      clearRouteLine();
      setDriverInfo({ visible: false });

      // Après expiration, on revient proprement au départ.
      setTimeout(() => {
        resetFlow({ keepName: true });
      }, 1800);
    }
  }, 1000);
}

// ----------------------------
// Actions
// ----------------------------
async function handleRequestClick() {
  const blockedSeconds = getAbuseBlockedSeconds();
  if (blockedSeconds > 0) {
    adnOverlayShow({
      title: "Accès temporairement bloqué",
      html: `Trop de tentatives incorrectes ont été détectées.<br><br>Merci de patienter <b>${blockedSeconds}s</b> avant de réessayer.`,
      primaryLabel: "OK",
    });
    return;
  }

  const nameCheck = validateFullName(els.name?.value || "");
  if (!nameCheck.ok) {
    showValidationPopup(nameCheck.title, nameCheck.message);
    return;
  }

  if (els.name) els.name.value = nameCheck.value;

  const phoneCheck = validatePhoneMobile(els.phone?.value || lsGet(LS.phone, "") || "");
  if (!phoneCheck.ok) {
    showValidationPopup(phoneCheck.title, phoneCheck.message);
    return;
  }

  if (els.phone) els.phone.value = phoneCheck.value;

  const name = nameCheck.value.slice(0, 40);
  const phone = phoneCheck.value;

  clearBadAttempts();

  lsSet(LS.name, name);
  lsSet(LS.phone, phone);

  // ✅ IMPORTANT: assure la demande GPS AU CLIC (user-gesture)
  if (!STATE.clientPos) {
    const ok = await requestGeolocationOnceInteractive();
    if (!ok || !STATE.clientPos) {
      adnOverlayShow({
        title: "Position obligatoire",
        html: "Vous devez accepter le partage de votre position pour voir le livreur.<br><br>Sans position GPS, le suivi ne peut pas fonctionner.",
        primaryLabel: "OK",
      });
      return;
    }
  }

  if (!canRequestNow()) {
    const last = Number(lsGet(LS.lastRequestMs, "0")) || 0;
    const cooldown = CONFIG.REQUEST_COOLDOWN_MS || 30000;
    const remain = Math.ceil((cooldown - (Date.now() - last)) / 1000);
    adnOverlayShow({
      title: "Demande déjà envoyée",
      html: `Merci de patienter <b>${remain}s</b> avant de refaire une demande.`,
      primaryLabel: "OK",
    });
    return;
  }

  try {
    disableRequest(true);
    showReset(false);
    setBadge("Envoi de la demande…");
    setState("Envoi en cours");
    setInlineStatus("waiting", "📨", "Envoi de votre demande", "Votre demande est en cours d’envoi au livreur.");
    setCountdown("—");

    const data = await apiFetchJson("/client/request", {
      method: "POST",
      body: {
        clientName: name,
        phone,
        lat: STATE.clientPos.lat,
        lng: STATE.clientPos.lng,
        ts: STATE.clientPos.ts || Date.now(),
      },
    });

    STATE.requestId = String(data.requestId || "");
    STATE.clientId = String(data.clientId || "");
    STATE.status = "pending";

    if (!STATE.requestId || !STATE.clientId) {
      throw new Error("missing_request_or_client_id");
    }

    saveSession({ requestId: STATE.requestId, clientId: STATE.clientId, name });
    setRequestedNow();
    startClientPresenceHeartbeat();

    setBadge("Demande envoyée • en attente");
    setState("En attente de décision");
    setInlineStatus(
      "waiting",
      "⏳",
      "Demande envoyée au livreur",
      "Le livreur peut mettre plusieurs minutes à accepter. Vous pouvez quitter cette page et revenir : cela n’annule pas votre demande."
    );

    disableRequest(true);
    showReset(false);

    stopTimeout(STATE.tPollStatus);
    STATE.tPollStatus = setTimeout(pollStatus, 400);

    adnOverlayRequestSent();
  } catch (e) {
    console.error(e);
    setBadge("Erreur");
    setState("Impossible d'envoyer la demande");
    setInlineStatus("bad", "⚠️", "Erreur d’envoi", "La demande n’a pas pu être envoyée. Vérifiez votre connexion puis réessayez.");
    disableRequest(false);
    showReset(true);
    adnOverlayShow({
      title: "Erreur",
      html: `La demande n’a pas pu être envoyée.<br><br><b>Détail :</b> ${e?.message || e}`,
      primaryLabel: "OK",
    });
  }
}

function handleResetClick() {
  resetFlow({ keepName: true });
}

// ----------------------------
// Boot
// ----------------------------
function boot() {
  initMap();
  bindClientPresenceEvents();

  removeDuplicatePreRequestInfoPopup();
  setTimeout(removeDuplicatePreRequestInfoPopup, 250);

  setBadge("Prêt : demande de suivi");
  setState("—");
  setInlineStatus("", "ℹ️", "Prêt à demander le suivi", "Entrez votre nom ou prénom et votre téléphone pour activer le suivi.");
  setCountdown("—");
  setGeo("—");

  if (els.btnRequest) els.btnRequest.addEventListener("click", handleRequestClick);
  if (els.btnReset) els.btnReset.addEventListener("click", handleResetClick);
  if (els.btnRecenter) els.btnRecenter.addEventListener("click", handleRecenterClick);

  // ✅ apply cadence/glide at boot too (safe)
  driverApplyPollGlideDefaults();

  // ✅ tentative passive au boot (sans bloquer)
  startGeolocationPassiveBoot();

  const hasSession = loadSession();
  if (hasSession) {
    restoreClientTrackingCache();
    startClientPresenceHeartbeat();
    setBadge("Reprise du suivi…");
    setState("Reprise");
    disableRequest(true);
    showReset(false);

    stopTimeout(STATE.tPollStatus);
    STATE.tPollStatus = setTimeout(pollStatus, 600);
  } else {
    disableRequest(!STATE.clientPos);
    showReset(false);
  }
}

document.addEventListener("DOMContentLoaded", boot);
