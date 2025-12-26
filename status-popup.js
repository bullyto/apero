// status-popup.js
// Injecte un pop-up global piloté par https://bullyto.github.io/status/status.json
// Affiche si active === true. Les clients peuvent fermer (croix), mais ça revient au prochain chargement tant que c'est actif.

(() => {
  const STATUS_URL = "https://bullyto.github.io/status/status.json";
  const SESSION_KEY = "status_popup_dismissed";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) n.appendChild(c);
    return n;
  }

  function injectStyles() {
    if (document.getElementById("statusPopupStyles")) return;
    const css = `
      .spxOverlay{
        position:fixed; inset:0;
        display:none;
        align-items:center; justify-content:center;
        padding:18px;
        z-index: 999999;
        background: rgba(0,0,0,.62);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .spxOverlay.show{display:flex;}
      .spxCard{
        width:min(560px, 94vw);
        border-radius:22px;
        background: #0b1c2d;
        color:#fff;
        border:1px solid rgba(255,255,255,.14);
        box-shadow:0 30px 80px rgba(0,0,0,.55);
        overflow:hidden;
      }
      .spxTop{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding:14px 14px 10px;
        border-bottom:1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.03);
      }
      .spxTitle{
        margin:0;
        font-size:18px;
        font-weight:950;
        line-height:1.15;
      }
      .spxClose{
        appearance:none;
        border:1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.06);
        color:#fff;
        width:38px;height:38px;
        border-radius:14px;
        cursor:pointer;
        font-weight:950;
        display:grid;place-items:center;
      }
      .spxBody{padding:14px;}
      .spxImg{
        width:100%;
        height:auto;
        border-radius:16px;
        display:block;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
      }
      .spxMsg{
        margin:12px 0 0;
        color: rgba(255,255,255,.86);
        font-size:14px;
        line-height:1.4;
      }
      .spxFooter{
        padding:12px 14px 14px;
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:flex-end;
      }
      .spxBtn{
        border:none;
        border-radius:14px;
        padding:12px 14px;
        font-weight:950;
        cursor:pointer;
        background:#5db7ee;
        color:#fff;
        min-width:110px;
      }
      .spxMeta{
        margin:0;
        font-size:12px;
        color: rgba(255,255,255,.62);
      }
    `;
    const style = document.createElement("style");
    style.id = "statusPopupStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function fetchStatus() {
    // cache-bust + no-store pour éviter le SW
    const url = `${STATUS_URL}?t=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("status fetch failed: " + r.status);
    return await r.json();
  }

  function getCfg(data) {
    const mode = data?.mode || "none";
    const cfg = (data?.modes && data.modes[mode]) ? data.modes[mode] : {};
    return { mode, cfg };
  }

  function showPopup({ title, message, image, lastUpdate }) {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    injectStyles();

    const overlay = el("div", { class: "spxOverlay", id: "statusPopupOverlay" });
    const card = el("div", { class: "spxCard", role: "dialog", "aria-modal": "true" });

    const top = el("div", { class: "spxTop" });
    const titleEl = el("div", { html: `<div class="spxTitle">${escapeHtml(title || "Information")}</div>` });
    const closeBtn = el("button", { class: "spxClose", type: "button", "aria-label": "Fermer" });
    closeBtn.textContent = "✕";

    top.appendChild(titleEl);
    top.appendChild(closeBtn);

    const body = el("div", { class: "spxBody" });
    const imgEl = el("img", { class: "spxImg", alt: "", src: image || "" });
    if (!image) imgEl.style.display = "none";

    const msgEl = el("div", { class: "spxMsg", html: (message ? escapeHtml(message).replace(/\n/g, "<br>") : "") });

    body.appendChild(imgEl);
    body.appendChild(msgEl);

    const footer = el("div", { class: "spxFooter" });
    const meta = el("p", { class: "spxMeta" });
    meta.textContent = lastUpdate ? `Dernière mise à jour : ${lastUpdate}` : "";

    const okBtn = el("button", { class: "spxBtn", type: "button" });
    okBtn.textContent = "OK";

    footer.appendChild(meta);
    footer.appendChild(okBtn);

    card.appendChild(top);
    card.appendChild(body);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() {
      overlay.classList.remove("show");
      sessionStorage.setItem(SESSION_KEY, "1");
      setTimeout(() => overlay.remove(), 150);
    }

    closeBtn.addEventListener("click", close);
    okBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    overlay.classList.add("show");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function init() {
    try {
      const data = await fetchStatus();
      if (!data || data.active !== true) return;

      const { cfg } = getCfg(data);
      const title = cfg.title || "Information";
      const message = cfg.message || "";
      const image = cfg.image ? `https://bullyto.github.io/status/${cfg.image.replace(/^\.?\//,"")}` : "";
      showPopup({ title, message, image, lastUpdate: data.last_update || "" });
    } catch (e) {
      // silencieux (ne casse pas le site)
      // console.debug("[status-popup] ignored", e);
    }
  }

  // Après le chargement pour ne rien perturber
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();
