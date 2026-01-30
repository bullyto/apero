// PATH: maps/client.js
// /maps/client.js
import { CONFIG } from "./config.js";

/* ===========================
   CLIENT — SUIVI LIVRAISON
   =========================== */

const els = {
  name: document.getElementById("name"),
  phone: document.getElementById("phone"),
  btnRequest: document.getElementById("btnRequest"),
  btnReset: document.getElementById("btnReset"),
  stateText: document.getElementById("stateText"),
  countdown: document.getElementById("countdown"),
  geoText: document.getElementById("geoText"),
};

const LS = {
  prefix: CONFIG.LS_PREFIX || "adn66_track_",
  name: "adn66_name",
  phone: "adn66_phone",
  requestId: "adn66_requestId",
  clientId: "adn66_clientId",
  lastRequestMs: "adn66_lastRequestMs",
};

const STATE = {
  clientPos: null,
  requestId: "",
  clientId: "",
  status: "idle",
};

/* ===========================
   HELPERS
   =========================== */

function toast(msg) {
  alert(msg);
}

function disableRequest(v) {
  if (els.btnRequest) els.btnRequest.disabled = !!v;
}

function showReset(v) {
  if (els.btnReset) els.btnReset.style.display = v ? "inline-block" : "none";
}

function normalizePhoneFR(raw) {
  if (!raw) return "";
  let s = raw.replace(/[^\d]/g, "");
  if (s.length !== 10 || !s.startsWith("0")) return "";
  return "+33" + s.slice(1);
}

/* ===========================
   POPUP OVERLAY — DEMANDE ENVOYÉE
   =========================== */
function showRequestSentPopup() {
  const overlay = document.getElementById("adnOverlay");
  const title = document.getElementById("adnOverlayTitle");
  const text = document.getElementById("adnOverlayText");
  const btn1 = document.getElementById("adnOverlayPrimary");
  const btn2 = document.getElementById("adnOverlaySecondary");

  title.textContent = "🔐 Information — Suivi de livraison";

  text.innerHTML = `
    <b>Votre demande de suivi de livraison a bien été transmise.</b><br><br>
    Dans le cadre de ce service, le livreur peut avoir accès à :<br><br>
    • votre <b>position GPS</b>,<br>
    • votre <b>nom</b>,<br>
    • votre <b>numéro de téléphone</b>.<br><br>
    Le livreur reste libre d’accepter ou de refuser le partage de sa position.<br><br>
    Les données sont utilisées uniquement pour la gestion de la livraison en cours
    et sont <b>définitivement supprimées du serveur sous 24 heures</b>.
  `;

  btn1.textContent = "OK";
  btn1.onclick = () => {
    overlay.style.display = "none";
  };

  btn2.style.display = "none";
  overlay.style.display = "";
}

/* ===========================
   ACTION — DEMANDE SUIVI
   =========================== */
async function handleRequestClick() {
  const name = els.name.value.trim();
  if (!name) {
    toast("Entre ton prénom.");
    return;
  }

  const phone = normalizePhoneFR(els.phone.value);
  if (!phone) {
    toast("Entre un numéro valide (ex: 06 12 34 56 78).");
    return;
  }

  try {
    disableRequest(true);
    showReset(false);

    const resp = await fetch(`${CONFIG.API_BASE}/client/request?key=${CONFIG.CLIENT_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: name,
        phone,
        lat: STATE.clientPos?.lat,
        lng: STATE.clientPos?.lng,
        ts: Date.now(),
      }),
    });

    const data = await resp.json();
    if (!data || !data.requestId || !data.clientId) {
      throw new Error("Erreur serveur");
    }

    STATE.requestId = data.requestId;
    STATE.clientId = data.clientId;
    STATE.status = "pending";

    localStorage.setItem(LS.requestId, STATE.requestId);
    localStorage.setItem(LS.clientId, STATE.clientId);
    localStorage.setItem(LS.name, name);
    localStorage.setItem(LS.phone, phone);
    localStorage.setItem(LS.lastRequestMs, Date.now());

    // ✅ ICI : POPUP DEMANDE ENVOYÉE (celle que tu voulais)
    showRequestSentPopup();

  } catch (e) {
    console.error(e);
    disableRequest(false);
    showReset(true);
    toast("❌ Impossible d’envoyer la demande.");
  }
}

/* ===========================
   INIT
   =========================== */
document.addEventListener("DOMContentLoaded", () => {
  if (els.btnRequest) els.btnRequest.addEventListener("click", handleRequestClick);
});
