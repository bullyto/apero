// PATH: /fidel/client.js
// ADN66 • Carte de fidélité — Client
// Version: 2026-02-03 play-store-nudge + roue-popup

const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";
const GOAL = 8;
const RESET_HOURS = 24;
const LS_KEY = "adn66_loyalty_client_id";
const LS_APP_INSTALL_NUDGE_SESSION = "adn66_install_app_nudge_seen_session_v1";
let adn66DeferredInstallPrompt = null;
let adn66InstallNudgeTimer = null;

window.addEventListener("beforeinstallprompt", (event)=>{
  try{
    event.preventDefault();
    adn66DeferredInstallPrompt = event;
  }catch(_){}
});

window.addEventListener("appinstalled", ()=>{
  try{ sessionStorage.setItem(LS_APP_INSTALL_NUDGE_SESSION, "1"); }catch(_){}
  const nudge = document.getElementById("adn66AppInstallNudge");
  if(nudge) nudge.remove();
});




// ===== ADN66 — CTA Social (Facebook / Avis Google) =====
// ⚠️ Remplace les 2 liens ci-dessous par les tiens (liens directs)
const FACEBOOK_PAGE_URL = "https://www.facebook.com/share/16o4JJ8gnL/";
const GOOGLE_REVIEW_URL = "https://www.google.com/maps/place/APERO+DE+NUIT+66+%7C+1er+service+de+Livraison+d'alcools+de+nuit+%C3%A0+Perpignan/@42.8637473,2.9156249,10z/data=!4m7!3m6!1s0x0:0xfdd578ec415e75e4!8m2!3d42.8637473!4d2.9156249!9m1!1b1";

// Affichage: 1er tampon => Facebook ; 3e tampon => Avis Google
const CTA_FB_AT = 1;
const CTA_GOOGLE_AT = 3;

// Anti-spam (on n'affiche + pulse qu'une seule fois)
const LS_CTA_FB_DONE = "adn66_cta_fb_done_v1";
const LS_CTA_GOOGLE_DONE = "adn66_cta_google_done_v1";

// Anti-abus (client-side) — erreurs téléphone (progressif)
const LS_PHONE_ERR = "adn66_loyalty_phone_err_count_v1";
const LS_PHONE_BLOCK_UNTIL = "adn66_loyalty_phone_block_until_v1";
const PHONE_BLOCK_DAYS = 6;
const PHONE_WARN_DELAY_SEC = 15;

// IMPORTANT: le QR + copie = URL (pas d'ID affiché)
const PUBLIC_RESTORE_URL_BASE = "https://www.aperos.net/fidel/client.html?restore=1&id=";
const OFFICIAL_APP_PLAY_STORE_URL = "https://play.google.com/store/search?q=ap%C3%A9ro%20de%20nuit%2066&c=apps";
const OFFICIAL_APP_SEARCH_TEXT = "Apéro de Nuit 66";

/* ---------- Restore: extraction (même logique que Admin) ---------- */
function extractClientIdFromAny(raw){
  let s = String(raw || "");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width
  s = s.trim();
  if(!s) return "";

  try{
    const mId = s.match(/[?&#]id=([^&#\s]+)/i) || s.match(/\bid=([^&#\s]+)/i);
    if(mId && mId[1]){
      const v = decodeURIComponent(mId[1]);
      if(v) return String(v).trim();
    }
  }catch(_){}

  try{
    if(/^https?:\/\//i.test(s)){
      const u = new URL(s);
      const id = (u.searchParams && u.searchParams.get("id")) ? u.searchParams.get("id") : "";
      if(id) return String(id).trim();
    }
  }catch(_){}

  try{
    if(s[0] === "{"){
      const o = JSON.parse(s);
      const id = (o && (o.id || o.cid || o.client_id || o.clientId)) ? (o.id || o.cid || o.client_id || o.clientId) : "";
      if(id) return String(id).trim();
    }
  }catch(_){}

  const mm = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if(mm && mm[0]) return mm[0];

  return s;
}

/* ---------- Utils ---------- */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalizePhone(raw){ return (raw||"").replace(/[^0-9+]/g,"").trim(); }
function normalizeName(raw){ return (raw||"").trim().slice(0,40); }

function getInputValueByIds(ids){
  for(const id of (ids||[])){
    const el = document.getElementById(id);
    if(el && typeof el.value !== "undefined") return String(el.value || "");
  }
  return "";
}

function isValidClientId(cid){
  if(!cid) return false;
  const s = String(cid).trim();
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true; // UUID
  if(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) return true; // ULID
  if(/^c_[a-zA-Z0-9_-]{10,}$/.test(s)) return true; // Prefixed
  return false;
}

function getRestoreUrl(cid){
  const safeCid = String(cid || "").trim();
  if(!safeCid) return "";
  return PUBLIC_RESTORE_URL_BASE + encodeURIComponent(safeCid);
}

/* ---------- UI ---------- */
function $(id){ return document.getElementById(id); }

function ensureInfoPopupStyles(){
  if(document.getElementById("adn66InfoPopupStyles")) return;

  const css = `
  .adn66-info-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:99999;padding:18px;}
  .adn66-info-card{width:min(520px,100%);background:#0b1420;color:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;}
  .adn66-info-head{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 10px;border-bottom:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg, rgba(84,180,255,.10), rgba(0,0,0,0));}
  .adn66-info-title{font-weight:800;letter-spacing:.2px;font-size:16px;}
  .adn66-info-x{appearance:none;border:0;background:rgba(255,255,255,.10);color:rgba(255,255,255,.92);width:34px;height:34px;border-radius:12px;cursor:pointer;font-size:18px;line-height:34px;text-align:center;}
  .adn66-info-body{padding:14px 16px 16px;font-size:14px;line-height:1.45;color:rgba(255,255,255,.86);}
  .adn66-info-body a{color:#54b4ff;text-decoration:none;font-weight:700;}
  .adn66-info-body a:hover{text-decoration:underline;}
  .adn66-info-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:0 16px 16px;}
  .adn66-info-ok{appearance:none;border:0;background:#54b4ff;color:#06121e;font-weight:900;padding:12px 16px;border-radius:14px;cursor:pointer;min-width:120px;}
  .adn66-info-ok:disabled{opacity:.45;cursor:not-allowed;}
  .adn66-info-sub{margin-top:10px;color:rgba(255,255,255,.68);font-size:12.5px;line-height:1.35;}
  `;

  const style = document.createElement("style");
  style.id = "adn66InfoPopupStyles";
  style.textContent = css;
  document.head.appendChild(style);
}

function showInfoPopup(title, html){
  ensureInfoPopupStyles();
  const prev = document.getElementById("adn66InfoPopup");
  if(prev) prev.remove();

  const overlay = document.createElement("div");
  overlay.id = "adn66InfoPopup";
  overlay.className = "adn66-info-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");

  const card = document.createElement("div");
  card.className = "adn66-info-card";

  const head = document.createElement("div");
  head.className = "adn66-info-head";

  const h = document.createElement("div");
  h.className = "adn66-info-title";
  h.textContent = String(title || "Information");

  const x = document.createElement("button");
  x.className = "adn66-info-x";
  x.type = "button";
  x.setAttribute("aria-label","Fermer");
  x.textContent = "×";

  const body = document.createElement("div");
  body.className = "adn66-info-body";
  body.innerHTML = String(html || "");

  head.appendChild(h);
  head.appendChild(x);
  card.appendChild(head);
  card.appendChild(body);
  overlay.appendChild(card);

  const close = ()=> overlay.remove();

  x.addEventListener("click", close);
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });

  const esc = (e)=>{ if(e.key === "Escape"){ document.removeEventListener("keydown", esc); close(); } };
  document.addEventListener("keydown", esc);

  document.body.appendChild(overlay);
  try{ x.focus({preventScroll:true}); }catch(_){}
}


function formatDuration(ms){
  ms = Math.max(0, Number(ms||0));
  const s = Math.floor(ms/1000);
  const days = Math.floor(s/86400);
  const hours = Math.floor((s%86400)/3600);
  const mins = Math.floor((s%3600)/60);
  const secs = s%60;
  if(days > 0) return `${days}j ${hours}h ${mins}min ${secs}s`;
  if(hours > 0) return `${hours}h ${mins}min ${secs}s`;
  if(mins > 0) return `${mins}min ${secs}s`;
  return `${secs}s`;
}

function showInfoPopupAction(opts){
  ensureInfoPopupStyles();
  const prev = document.getElementById("adn66InfoPopup");
  if(prev) prev.remove();

  const title = (opts && opts.title) ? opts.title : "Information";
  const html = (opts && opts.html) ? opts.html : "";
  const okTextBase = (opts && opts.okText) ? opts.okText : "OK";
  const okDelay = Number(opts && opts.okDelaySeconds ? opts.okDelaySeconds : 0);
  const lockClose = !!(opts && opts.lockClose);
  const onOk = (opts && typeof opts.onOk === "function") ? opts.onOk : null;
  const onClose = (opts && typeof opts.onClose === "function") ? opts.onClose : null;

  const overlay = document.createElement("div");
  overlay.id = "adn66InfoPopup";
  overlay.className = "adn66-info-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");

  const card = document.createElement("div");
  card.className = "adn66-info-card";

  const head = document.createElement("div");
  head.className = "adn66-info-head";

  const h = document.createElement("div");
  h.className = "adn66-info-title";
  h.textContent = String(title || "Information");

  const x = document.createElement("button");
  x.className = "adn66-info-x";
  x.type = "button";
  x.setAttribute("aria-label","Fermer");
  x.textContent = "×";

  const body = document.createElement("div");
  body.className = "adn66-info-body";
  body.innerHTML = String(html || "");

  const foot = document.createElement("div");
  foot.className = "adn66-info-foot";

  const ok = document.createElement("button");
  ok.className = "adn66-info-ok";
  ok.type = "button";
  ok.textContent = okTextBase;

  foot.appendChild(ok);

  head.appendChild(h);
  head.appendChild(x);
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(foot);
  overlay.appendChild(card);

  let timer = null;
  let remain = okDelay;

  const close = ()=>{
    if(timer) clearInterval(timer);
    overlay.remove();
    if(onClose) try{ onClose(); }catch(_){}
  };

  const setLocked = (locked)=>{
    ok.disabled = !!locked;
    x.disabled = !!locked;
    if(locked){
      x.style.opacity = ".45";
      x.style.cursor = "not-allowed";
    }else{
      x.style.opacity = "";
      x.style.cursor = "";
    }
  };

  if(lockClose && okDelay > 0) setLocked(true);

  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay){
      if(lockClose && okDelay > 0) return;
      close();
    }
  });
  x.addEventListener("click", ()=>{
    if(lockClose && okDelay > 0) return;
    close();
  });

  const esc = (e)=>{
    if(e.key === "Escape"){
      if(lockClose && okDelay > 0) return;
      document.removeEventListener("keydown", esc);
      close();
    }
  };
  document.addEventListener("keydown", esc);

  ok.addEventListener("click", ()=>{
    if(ok.disabled) return;
    if(onOk) try{ onOk(); }catch(_){}
    close();
  });

  if(okDelay > 0){
    ok.disabled = true;
    ok.textContent = `${okTextBase} (${remain})`;
    timer = setInterval(()=>{
      remain -= 1;
      if(remain <= 0){
        if(timer) clearInterval(timer);
        ok.disabled = false;
        ok.textContent = okTextBase;
        if(lockClose) setLocked(false);
      }else{
        ok.textContent = `${okTextBase} (${remain})`;
      }
    }, 1000);
  }

  document.body.appendChild(overlay);
  try{ ok.focus({preventScroll:true}); }catch(_){}
}

function getPhoneErrCount(){
  const n = Number(localStorage.getItem(LS_PHONE_ERR) || "0");
  return Number.isFinite(n) ? n : 0;
}
function setPhoneErrCount(n){
  localStorage.setItem(LS_PHONE_ERR, String(Math.max(0, Math.floor(Number(n)||0))));
}
function getPhoneBlockUntil(){
  const t = Number(localStorage.getItem(LS_PHONE_BLOCK_UNTIL) || "0");
  return Number.isFinite(t) ? t : 0;
}
function setPhoneBlockUntil(ts){
  localStorage.setItem(LS_PHONE_BLOCK_UNTIL, String(Math.max(0, Math.floor(Number(ts)||0))));
}
function clearPhoneAbuseState(){
  setPhoneErrCount(0);
  setPhoneBlockUntil(0);
}



function setScreen(hasCard){
  const startBlock = $("startBlock");
  const cardBlock = $("cardBlock");
  if(startBlock) startBlock.style.display = hasCard ? "none" : "block";
  if(cardBlock) cardBlock.style.display = hasCard ? "block" : "none";
  if(hasCard) hidePendingWheelHomeBanner();
}


function setSyncText(ok){
  const t = $("syncText");
  if(t) t.textContent = ok ? "Synchronisé" : "Hors ligne";
}

function setStateText(points, completedAt){
  const st = $("stateText");
  if(!st) return;

  if(points >= GOAL){
    if(completedAt){
      const end = new Date(new Date(completedAt).getTime() + RESET_HOURS*3600*1000);
      const ms = end.getTime() - Date.now();
      if(ms > 0){
        const h = Math.floor(ms/3600000);
        const m = Math.floor((ms%3600000)/60000);
        st.textContent = `🎉 Carte complétée (reset dans ${h}h ${m}min)`;
      }else{
        st.textContent = "Reset imminent…";
      }
    }else{
      st.textContent = "🎉 Carte complétée";
    }
  }else{
    st.textContent = "En cours";
  }
}

function renderVisualStamps(points){
  // Correction robuste ADN66 : l'affichage doit suivre STRICTEMENT card.points reçu par /loyalty/me.
  // Avant : certains téléphones ne montraient qu'un seul tampon visuellement.
  // Maintenant : on force les 8 emplacements, la classe, l'opacité et le z-index.
  const safe = Math.max(0, Math.min(GOAL, Math.floor(Number(points || 0))));
  const visual = document.getElementById("visual") || document.querySelector(".visual");

  // Si le HTML ancien n'a pas les 8 emplacements, on les recrée proprement.
  if(visual){
    const existing = visual.querySelectorAll(".stamp[data-slot]");
    if(existing.length < GOAL){
      const positions = [
        {c:"s1", r:"-12deg"}, {c:"s2", r:"7deg"}, {c:"s3", r:"-3deg"}, {c:"s4", r:"11deg"},
        {c:"s5", r:"-9deg"}, {c:"s6", r:"5deg"}, {c:"s7", r:"-14deg"}, {c:"s8", r:"8deg"}
      ];
      for(let i=existing.length; i<GOAL; i++){
        const el = document.createElement("div");
        el.className = "stamp " + positions[i].c;
        el.dataset.slot = String(i+1);
        el.style.setProperty("--rot", positions[i].r);
        visual.appendChild(el);
      }
    }
  }

  const stamps = document.querySelectorAll(".stamp[data-slot]");
  stamps.forEach(el=>{
    const slot = Number(el.dataset.slot || "0");
    const filled = slot > 0 && slot <= safe;
    el.classList.toggle("filled", filled);
    // Force visuelle, même si une ancienne CSS/cache mobile garde une mauvaise valeur.
    el.style.opacity = filled ? "1" : "0";
    el.style.visibility = filled ? "visible" : "hidden";
    el.style.display = "block";
    el.style.zIndex = "7";
    el.style.pointerEvents = "none";
  });

  // Petit garde-fou : on garde les compteurs texte synchronisés avec les points API.
  const pts = document.getElementById("points");
  const goal = document.getElementById("goal");
  if(pts) pts.textContent = String(safe);
  if(goal) goal.textContent = String(GOAL);
}


/* ---------- CTA Social (Facebook / Avis Google) ---------- */
function setCtaVisible(show){
  const top = $("ctaTop");
  const card = $("ctaCard");
  if(!top || !card) return;
  if(show){
    top.classList.add("show");
  }else{
    top.classList.remove("show");
    card.innerHTML = "";
  }
}

function openExternal(url){
  const u = String(url || "").trim();
  if(!u) return;
  try{
    window.open(u, "_blank", "noopener,noreferrer");
  }catch(_){
    // fallback
    try{ location.href = u; }catch(__){}
  }
}

function stopPulseLater(btn, ms){
  const t = Math.max(500, Number(ms||0));
  if(!btn) return;
  setTimeout(()=>{ try{ btn.classList.remove("ctaPulse"); }catch(_){} }, t);
}


function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function renderCta(points){
  const p = Math.max(0, Math.floor(Number(points)||0));
  const top = $("ctaTop");
  const card = $("ctaCard");
  if(!top || !card) return;

  // Rules: 1er tampon => FB ; 3e tampon => Google
  const showFb = (p === CTA_FB_AT) && localStorage.getItem(LS_CTA_FB_DONE) !== "1";
  const showGg = (p === CTA_GOOGLE_AT) && localStorage.getItem(LS_CTA_GOOGLE_DONE) !== "1";

  // If no CTA to show, display a supportive message by stamp so it NEVER blocks next steps.
  const messageByStamp = (stamp)=>{
    switch(stamp){
      case 2:
        return {
          title: "Deux utilisations enregistrées 👀",
          sub: "On comprend que vous souhaitiez tester le service plusieurs fois avant de vous faire un avis. Prenez le temps, on s’occupe du reste."
        };
      case 4:
        return {
          title: "Vous êtes à mi-parcours 🎯",
          sub: "Votre fidélité commence à payer. Plus que quelques tampons avant votre avantage 🎁"
        };
      case 5:
        return {
          title: "Service local & responsable 🛵",
          sub: "Apéro de Nuit 66 est un service indépendant. Votre fidélité permet de maintenir un service fiable, même la nuit."
        };
      case 6:
        return {
          title: "Merci pour votre fidélité 💙",
          sub: "Ce sont des clients réguliers comme vous qui font vivre le service. Merci de faire partie de l’aventure."
        };
      case 7:
        return {
          title: "Plus qu’un tampon ⏳",
          sub: "Votre récompense est presque débloquée 🎉 Encore un effort !"
        };
      case 8:
        return {
          title: "Félicitations 🎉",
          sub: "Votre carte est complétée. Merci pour votre confiance envers un service local indépendant 🙏"
        };
      default:
        return null;
    }
  };

  // Always show the container when there is something (CTA or message) to display.
  const msg = (!showFb && !showGg) ? messageByStamp(p) : null;

  if(!showFb && !showGg && !msg){
    setCtaVisible(false);
    // Ne pas effacer ici le bandeau livraison gratuite : il est indépendant des CTA.
    return;
  }

  setCtaVisible(true);

  if(showFb){
    card.innerHTML = `
      <div class="ctaRow">
        <div class="ctaText">
          <p class="ctaTitle">Rejoignez Apéro de Nuit 66 sur Facebook</p>
          <p class="ctaSub">Horaires, infos, nouveautés — en direct.</p>
        </div>
        <div class="ctaBtns">
          <button type="button" class="ctaBtn ctaPulse" id="adnCtaFbBtn" aria-label="Suivre Apéro de Nuit 66 sur Facebook">
            <span class="ctaIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path fill="currentColor" d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.2-1.5 1.5-1.5h1.7V5c-.3 0-1.4-.1-2.7-.1-2.6 0-4.4 1.6-4.4 4.6V11H7v3h2.7v8h3.8z"/>
              </svg>
            </span>
            <span class="ctaLabel">Facebook</span>
          </button>
        </div>
      </div>
    `;
    const btn = document.getElementById("adnCtaFbBtn");
    if(btn){
      stopPulseLater(btn, 7000);
      btn.addEventListener("click", ()=>{
        try{ localStorage.setItem(LS_CTA_FB_DONE, "1"); }catch(_){}
        openExternal(FACEBOOK_PAGE_URL);
        // hide after click
        setTimeout(()=>setCtaVisible(false), 50);
      }, {once:true});
    }
    return;
  }

  if(showGg){
    card.innerHTML = `
      <div class="ctaRow">
        <div class="ctaText">
          <p class="ctaTitle">Votre avis nous aide énormément 🙏</p>
          <p class="ctaSub">Si vous êtes satisfait, laissez un avis Google (moins d’une minute).</p>
        </div>
        <div class="ctaBtns">
          <button type="button" class="ctaBtn ctaPulse" id="adnCtaGgBtn" aria-label="Laisser un avis Google">
            <span class="ctaIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path fill="currentColor" d="M12 10.2v3.6h5.1c-.2 1.1-1.3 3.2-5.1 3.2-3.1 0-5.6-2.6-5.6-5.7S8.9 5.8 12 5.8c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.4 14.6 2.4 12 2.4 7 2.4 3 6.5 3 11.5S7 20.6 12 20.6c5.8 0 9.6-4.1 9.6-9.9 0-.7-.1-1.2-.2-1.7H12z"/>
              </svg>
            </span>
            <span class="ctaLabel">Google</span>
          </button>
        </div>
      </div>
    `;
    const btn = document.getElementById("adnCtaGgBtn");
    if(btn){
      stopPulseLater(btn, 7000);
      btn.addEventListener("click", ()=>{
        try{ localStorage.setItem(LS_CTA_GOOGLE_DONE, "1"); }catch(_){}
        openExternal(GOOGLE_REVIEW_URL);
        setTimeout(()=>setCtaVisible(false), 50);
      }, {once:true});
    }
    return;
  }

  // No CTA: show message card
  if(msg){
    card.innerHTML = `
      <div class="ctaRow">
        <div class="ctaText">
          <p class="ctaTitle">${escapeHtml(msg.title)}</p>
          <p class="ctaSub">${escapeHtml(msg.sub)}</p>
        </div>
      </div>
    `;
    return;
  }
}

/* ---------- QR ---------- */
function qrRender(text){
  const box = $("qrSvg");
  if(!box) return;

  const payload = String(text || "").trim();
  box.innerHTML = "";

  if(!payload){
    box.textContent = "QR indisponible";
    box.style.color = "#111";
    return;
  }

  if(typeof window.QRCode !== "function"){
    box.textContent = "QR indisponible";
    box.style.color = "#111";
    return;
  }

  try{
    new window.QRCode(box, {
      text: payload,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }catch(_){
    box.textContent = "QR indisponible";
    box.style.color = "#111";
  }
}

/* ---------- API ---------- */
async function api(path, opts={}){
  const method = String((opts && opts.method) ? opts.method : "GET").toUpperCase();
  const headers = Object.assign({}, (opts && opts.headers) ? opts.headers : {});
  const init = Object.assign({}, opts);

  // Avoid forcing headers on GET (preflight + blocked in some environments)
  if(method !== "GET" && method !== "HEAD"){
    // Send as text/plain to avoid CORS preflight; Worker accepts JSON string.
    if(!headers["content-type"] && !headers["Content-Type"]){
      headers["content-type"] = "text/plain;charset=UTF-8";
    }
    init.headers = headers;
  }else{
    // Keep only explicit headers set by caller
    if(Object.keys(headers).length) init.headers = headers;
  }

  // Always avoid cached API responses
  init.cache = "no-store";
  init.credentials = "omit";
  init.redirect = "follow";

  const res = await fetch(API_BASE + path, init);

  let data = {};
  try{ data = await res.json(); }catch(_){ data = {}; }

  if(!res.ok){
    const code = (data && (data.error || data.code || data.message)) ? (data.error || data.code || data.message) : ("HTTP " + res.status);
    const err = new Error(String(code));
    // attach for callers if needed
    err.http_status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ---------- Modal (Créer/Restaurer) ---------- */
let restoreStream = null;
let restoreScanning = false;

function showModal(mode){
  const modal = $("actionModal");
  if(!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  setModalMode(mode || "create");
}

function closeModal(){
  const modal = $("actionModal");
  if(modal){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
  }
  stopRestoreScan();
}

function setModalMode(mode){
  const createView = $("createView");
  const restoreView = $("restoreView");
  const tabCreate = $("tabCreate");
  const tabRestore = $("tabRestore");
  const title = $("modalTitle");

  const isCreate = mode === "create";

  if(createView) createView.style.display = isCreate ? "block" : "none";
  if(restoreView) restoreView.style.display = isCreate ? "none" : "block";

  if(tabCreate) tabCreate.classList.toggle("active", isCreate);
  if(tabRestore) tabRestore.classList.toggle("active", !isCreate);

  if(title) title.textContent = isCreate ? "Créer ma carte" : "Restaurer ma carte";

  // reset hint
  const hint = $("scanHint");
  if(hint) hint.textContent = "";

  renderPendingWheelCreateBanner();
}

/* ---------- Modal QR ---------- */
function openQrModal(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid) return;
  const modal = $("qrModal");
  if(!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  qrRender(getRestoreUrl(cid));
}
function closeQrModal(){
  const modal = $("qrModal");
  if(!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
}




/* ---------- Rappel installation application après création / affichage carte ---------- */
function isRunningAsInstalledPwa(){
  try{
    return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }catch(_){ return false; }
}

function ensureAppInstallNudgeStyles(){
  if(document.getElementById("adn66AppInstallNudgeStyles")) return;
  const style = document.createElement("style");
  style.id = "adn66AppInstallNudgeStyles";
  style.textContent = `
  .adn66-install-nudge-overlay{position:fixed;inset:0;z-index:125000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,11,18,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
  .adn66-install-nudge-card{width:min(500px,100%);background:#ffffff;color:#0b1c2d;border-radius:22px;border:1px solid rgba(11,28,45,.12);box-shadow:0 22px 70px rgba(0,0,0,.35);overflow:hidden;text-align:left;}
  .adn66-install-nudge-head{padding:15px 16px;background:linear-gradient(180deg,rgba(93,183,238,.24),rgba(93,183,238,.06));border-bottom:1px solid rgba(11,28,45,.10);display:flex;align-items:center;gap:12px;}
  .adn66-install-nudge-icon{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;background:#5db7ee;color:#fff;font-size:22px;box-shadow:0 8px 18px rgba(93,183,238,.28);flex:0 0 auto;}
  .adn66-install-nudge-title{font-size:16px;font-weight:950;line-height:1.15;color:#0b1c2d;}
  .adn66-install-nudge-sub{font-size:12.5px;font-weight:850;color:rgba(11,28,45,.68);line-height:1.25;margin-top:3px;}
  .adn66-install-nudge-body{padding:14px 16px 4px;}
  .adn66-install-nudge-main{font-size:15px;font-weight:900;line-height:1.35;margin:0;color:#0b1c2d;}
  .adn66-install-nudge-help{margin:8px 0 0;color:rgba(11,28,45,.72);font-size:13px;font-weight:800;line-height:1.35;}
  .adn66-install-nudge-foot{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:13px 16px 16px;flex-wrap:wrap;}
  .adn66-install-nudge-install{appearance:none;border:0;background:#5db7ee;color:#fff;font-weight:950;border-radius:14px;padding:11px 15px;min-width:160px;cursor:pointer;box-shadow:0 10px 18px rgba(93,183,238,.30);}
  .adn66-install-nudge-later{appearance:none;border:1px solid rgba(11,28,45,.15);background:#fff;color:#0b1c2d;font-weight:900;border-radius:14px;padding:11px 14px;min-width:110px;cursor:pointer;box-shadow:none;}
  .adn66-install-nudge-install:active,.adn66-install-nudge-later:active{transform:translateY(1px);}
  @media(max-width:420px){.adn66-install-nudge-foot{display:grid;grid-template-columns:1fr;}.adn66-install-nudge-install,.adn66-install-nudge-later{width:100%;}}
  `;
  document.head.appendChild(style);
}

function shouldShowAppInstallNudge(){
  if(isRunningAsInstalledPwa()) return false;
  if(!localStorage.getItem(LS_KEY)) return false;
  try{ if(sessionStorage.getItem(LS_APP_INSTALL_NUDGE_SESSION) === "1") return false; }catch(_){}
  return true;
}

function showAppInstallNudge(){
  if(!shouldShowAppInstallNudge()) return;
  if(document.getElementById("adn66AppInstallNudge")) return;

  // Si la popup de gain roue est encore affichée, on attend pour ne pas empiler deux messages.
  if(document.getElementById("adn66WheelRewardPopup")){
    scheduleAppInstallNudge(1600);
    return;
  }

  ensureAppInstallNudgeStyles();
  const overlay = document.createElement("div");
  overlay.id = "adn66AppInstallNudge";
  overlay.className = "adn66-install-nudge-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "adn66-install-nudge-card";
  card.innerHTML = `
    <div class="adn66-install-nudge-head">
      <div class="adn66-install-nudge-icon" aria-hidden="true">📲</div>
      <div>
        <div class="adn66-install-nudge-title">Application officielle</div>
        <div class="adn66-install-nudge-sub">Apéro de Nuit 66 sur Google Play</div>
      </div>
    </div>
    <div class="adn66-install-nudge-body">
      <p class="adn66-install-nudge-main">Pour installer l’application officielle, ouvrez Google Play Store et recherchez : <strong>Apéro de Nuit 66</strong>.</p>
      <p class="adn66-install-nudge-help" id="adn66InstallNudgeHelp">Le bouton ci-dessous ouvre Google Play. Si la recherche ne s’ouvre pas directement, tapez simplement “Apéro de Nuit 66” dans le Play Store.</p>
    </div>
    <div class="adn66-install-nudge-foot">
      <button type="button" class="adn66-install-nudge-later">Plus tard</button>
      <button type="button" class="adn66-install-nudge-install">Ouvrir Google Play</button>
    </div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = ()=>{
    try{ sessionStorage.setItem(LS_APP_INSTALL_NUDGE_SESSION, "1"); }catch(_){}
    overlay.remove();
  };
  const later = card.querySelector(".adn66-install-nudge-later");
  const install = card.querySelector(".adn66-install-nudge-install");
  const help = card.querySelector("#adn66InstallNudgeHelp");

  if(later) later.addEventListener("click", close);
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });

  if(install){
    install.addEventListener("click", ()=>{
      try{ sessionStorage.setItem(LS_APP_INSTALL_NUDGE_SESSION, "1"); }catch(_){}
      if(help) help.textContent = `Ouverture de Google Play. Recherchez “${OFFICIAL_APP_SEARCH_TEXT}” si besoin.`;
      try{
        window.location.href = OFFICIAL_APP_PLAY_STORE_URL;
      }catch(_){
        try{ window.open(OFFICIAL_APP_PLAY_STORE_URL, "_blank", "noopener,noreferrer"); }catch(__){}
      }
    });
  }
}

function scheduleAppInstallNudge(delayMs){
  if(adn66InstallNudgeTimer) clearTimeout(adn66InstallNudgeTimer);
  adn66InstallNudgeTimer = setTimeout(()=>showAppInstallNudge(), Math.max(300, Number(delayMs || 900)));
}

/* ---------- Livraison gratuite active (GAME_35) ---------- */
let adn66FreeDeliveryTimer = null;

function ensureFreeDeliveryStyles(){
  if(document.getElementById("adn66FreeDeliveryStyles")) return;
  const style = document.createElement("style");
  style.id = "adn66FreeDeliveryStyles";
  style.textContent = `
  .adn66-free-delivery-banner{
    width:100%;
    margin:0 0 10px 0;
    padding:10px 11px;
    border-radius:14px;
    background:linear-gradient(135deg, rgba(93,183,238,.22), rgba(22,163,74,.14));
    border:1px solid rgba(93,183,238,.55);
    box-shadow:0 8px 20px rgba(0,0,0,.12);
    color:#0b1c2d;
    text-align:left;
  }
  .adn66-free-delivery-title{display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:950;font-size:13px;line-height:1.15;}
  .adn66-free-delivery-chip{white-space:nowrap;border-radius:999px;padding:5px 8px;background:#5db7ee;color:#fff;font-size:10.5px;font-weight:950;}
  .adn66-free-delivery-msg{margin-top:5px;color:rgba(11,28,45,.78);font-weight:850;font-size:12px;line-height:1.22;}
  .adn66-free-delivery-count{margin-top:7px;font-weight:950;font-size:12.5px;color:#0b1c2d;}
  `;
  document.head.appendChild(style);
}

function formatCountdownLong(ms){
  ms = Math.max(0, Number(ms||0));
  const total = Math.floor(ms/1000);
  const d = Math.floor(total/86400);
  const h = Math.floor((total%86400)/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  if(d > 0) return `${d}j ${h}h ${m}min ${s}s`;
  if(h > 0) return `${h}h ${m}min ${s}s`;
  if(m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function renderFreeDeliveryBenefit(freeDelivery){
  ensureFreeDeliveryStyles();
  if(adn66FreeDeliveryTimer){ clearInterval(adn66FreeDeliveryTimer); adn66FreeDeliveryTimer = null; }

  const cardBlock = $("cardBlock");
  if(!cardBlock) return;

  let banner = document.getElementById("adn66FreeDeliveryBanner");
  const active = !!(freeDelivery && freeDelivery.active && freeDelivery.expires_at);

  if(!active){
    if(banner) banner.remove();
    return;
  }

  if(!banner){
    banner = document.createElement("div");
    banner.id = "adn66FreeDeliveryBanner";
    banner.className = "adn66-free-delivery-banner";
    cardBlock.insertBefore(banner, cardBlock.firstChild);
  }

  const expiresAt = String(freeDelivery.expires_at || "");
  const update = ()=>{
    const expMs = Date.parse(expiresAt);
    const left = Number.isFinite(expMs) ? Math.max(0, expMs - Date.now()) : 0;
    if(left <= 0){
      if(adn66FreeDeliveryTimer){ clearInterval(adn66FreeDeliveryTimer); adn66FreeDeliveryTimer = null; }
      banner.remove();
      return;
    }
    banner.innerHTML = `
      <div class="adn66-free-delivery-title">
        <span>🚚 Livraison gratuite active</span>
        <span class="adn66-free-delivery-chip">7 jours</span>
      </div>
      <div class="adn66-free-delivery-msg">Profitez de la livraison gratuite à chaque commande pendant 1 semaine.</div>
      <div class="adn66-free-delivery-count">⏳ Temps restant : <span>${formatCountdownLong(left)}</span></div>
    `;
  };
  update();
  adn66FreeDeliveryTimer = setInterval(update, 1000);
}



async function loadFreeDeliveryFallback(clientId){
  // Sécurité : si une ancienne réponse /loyalty/me ne contient pas encore free_delivery,
  // on tente la route dédiée /loyalty/benefits sans casser l'affichage des tampons.
  if(!clientId) return null;
  try{
    const b = await api("/loyalty/benefits?client_id=" + encodeURIComponent(clientId) + "&t=" + Date.now(), {method:"GET"});
    return b.free_delivery || b.benefit || b.active_benefit || null;
  }catch(_){
    return null;
  }
}


function hasBenefitFlagFromUrl(){
  try{
    const u = new URL(location.href);
    return String(u.searchParams.get("benefit") || "") === "GAME_35";
  }catch(_){ return false; }
}
function clearBenefitFlagFromUrl(){
  try{
    const u = new URL(location.href);
    if(u.searchParams.has("benefit")){
      u.searchParams.delete("benefit");
      u.searchParams.delete("t");
      history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
    }
  }catch(_){}
}

/* ---------- Load card ---------- */
async function loadCard(){
  const cid = localStorage.getItem(LS_KEY);

  if(!cid){
    setScreen(false);
    const pts = $("points");
    const goal = $("goal");
    if(pts) pts.textContent = "0";
    if(goal) goal.textContent = String(GOAL);
    renderVisualStamps(0);
    setStateText(0, null);
    setCtaVisible(false);
    renderWheelClaimBanner(null);
    renderPendingWheelHomeBanner();
    return;
  }

  setScreen(true);

  try{
    const res = await api("/loyalty/me?client_id=" + encodeURIComponent(cid) + "&t=" + Date.now(), {method:"GET"});
    const card = res.card || res;

    const points = Number(card.points || 0);
    const freeDelivery = card.free_delivery || res.free_delivery || await loadFreeDeliveryFallback(cid);
    renderFreeDeliveryBenefit(freeDelivery || null);
    const wheelClaim = await loadWheelClaim(cid);
    renderWheelClaimBanner(wheelClaim);
    const goal = Number(card.goal || GOAL);

    const pts = $("points");
    const g = $("goal");
    if(pts) pts.textContent = String(points);
    if(g) g.textContent = String(goal);

    renderVisualStamps(points);
    // CTA Social (Facebook / Avis Google)
    renderCta(points);
    setStateText(points, card.completed_at || null);
    setSyncText(true);
    scheduleAppInstallNudge(1200);
  }catch(e){
    setSyncText(false);
    setCtaVisible(false);
    renderFreeDeliveryBenefit(null);
    renderWheelClaimBanner(null);
  }
}


/* ---------- Récompense jeu en attente (GAME_25) ---------- */
const LS_PENDING_GAME_REWARD = "adn66_pending_game_reward_v1";
const LS_PENDING_GAME_PLAYER_ID = "adn66_pending_game_player_id_v1";
const LS_PENDING_GAME_PUBLIC_NAME = "adn66_pending_game_public_name_v1";

function getGameRewardFromUrl(){
  try{
    const u = new URL(location.href);
    const reward = u.searchParams.get("game_reward") || "";
    return String(reward || "").trim();
  }catch(_){ return ""; }
}

function getGamePlayerFromUrl(){
  try{
    const u = new URL(location.href);
    return {
      player_id: String(u.searchParams.get("player_id") || "").trim(),
      public_name: String(u.searchParams.get("public_name") || "").trim()
    };
  }catch(_){
    return { player_id: "", public_name: "" };
  }
}

function savePendingGameRewardFromUrl(){
  const reward = getGameRewardFromUrl();
  if(!reward) return;

  // Sécurité simple : on n'accepte que les paliers prévus.
  if(!["GAME_25", "GAME_35"].includes(reward)) return;

  localStorage.setItem(LS_PENDING_GAME_REWARD, reward);

  const player = getGamePlayerFromUrl();
  if(player.player_id) localStorage.setItem(LS_PENDING_GAME_PLAYER_ID, player.player_id);
  if(player.public_name) localStorage.setItem(LS_PENDING_GAME_PUBLIC_NAME, player.public_name);

  // Nettoyage de l'URL pour éviter de relancer plusieurs fois le traitement.
  try{
    const u = new URL(location.href);
    u.searchParams.delete("game_reward");
    u.searchParams.delete("player_id");
    u.searchParams.delete("public_name");
    history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
  }catch(_){}
}

async function applyPendingGameReward(clientId){
  const reward = localStorage.getItem(LS_PENDING_GAME_REWARD);
  if(!reward || !clientId) return;

  try{
    const playerId = String(localStorage.getItem(LS_PENDING_GAME_PLAYER_ID) || "").trim();
    const publicName = String(localStorage.getItem(LS_PENDING_GAME_PUBLIC_NAME) || "").trim();

    const r = await api("/game/reward/request", {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        milestone: reward,
        player_id: playerId || undefined,
        public_name: publicName || undefined
      })
    });

    if(r && r.token){
      await consumeRewardToken(r.token);
      localStorage.removeItem(LS_PENDING_GAME_REWARD);
      localStorage.removeItem(LS_PENDING_GAME_PLAYER_ID);
      localStorage.removeItem(LS_PENDING_GAME_PUBLIC_NAME);
      return;
    }

    const code = String((r && (r.code || r.status || r.error_code || r.message || r.error)) || "").trim();
    if(code === "already_claimed"){
      localStorage.removeItem(LS_PENDING_GAME_REWARD);
      localStorage.removeItem(LS_PENDING_GAME_PLAYER_ID);
      localStorage.removeItem(LS_PENDING_GAME_PUBLIC_NAME);
      showInfoPopup("Récompense", "Votre récompense a déjà été utilisée.");
      return;
    }

    localStorage.removeItem(LS_PENDING_GAME_REWARD);
    localStorage.removeItem(LS_PENDING_GAME_PLAYER_ID);
    localStorage.removeItem(LS_PENDING_GAME_PUBLIC_NAME);
  }catch(e){
    // On garde la récompense en attente si erreur réseau.
    showInfoPopup(
      "Récompense en attente",
      "Votre carte est créée. Le tampon du jeu sera ajouté dès que possible. Rafraîchissez la page dans quelques instants si besoin."
    );
  }
}


/* ---------- Récompense roue en attente (WHEEL_*) ---------- */
const LS_PENDING_WHEEL_TOKEN = "adn66_pending_wheel_token_v1";
const LS_PENDING_WHEEL_REWARD = "adn66_pending_wheel_reward_v1";
const LS_PENDING_WHEEL_LABEL = "adn66_pending_wheel_label_v1";

function getWheelRewardFromUrl(){
  try{
    const u = new URL(location.href);
    return {
      token: String(u.searchParams.get("wheel_token") || "").trim(),
      reward: String(u.searchParams.get("wheel_reward") || "").trim(),
      label: String(u.searchParams.get("wheel_label") || "").trim()
    };
  }catch(_){ return { token:"", reward:"", label:"" }; }
}

function savePendingWheelRewardFromUrl(){
  const w = getWheelRewardFromUrl();
  if(!w.token) return;
  localStorage.setItem(LS_PENDING_WHEEL_TOKEN, w.token);
  if(w.reward) localStorage.setItem(LS_PENDING_WHEEL_REWARD, w.reward);
  if(w.label) localStorage.setItem(LS_PENDING_WHEEL_LABEL, w.label);

  try{
    const u = new URL(location.href);
    u.searchParams.delete("wheel_token");
    u.searchParams.delete("wheel_reward");
    u.searchParams.delete("wheel_label");
    history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
  }catch(_){}
}


function hasPendingWheelReward(){
  return !!String(localStorage.getItem(LS_PENDING_WHEEL_TOKEN) || "").trim();
}

function getPendingWheelLabel(){
  const label = String(localStorage.getItem(LS_PENDING_WHEEL_LABEL) || "").trim();
  if(label) return label;
  const reward = String(localStorage.getItem(LS_PENDING_WHEEL_REWARD) || "").trim();
  if(reward === "WHEEL_DELIVERY_7D") return "Livraison offerte";
  if(reward === "WHEEL_STAMP") return "1 tampon fidélité";
  return "votre gain";
}

function ensureWheelPendingCreateBanner(){
  const createView = $("createView");
  if(!createView) return null;

  let banner = document.getElementById("adn66WheelPendingCreateBanner");
  if(!banner){
    banner = document.createElement("div");
    banner.id = "adn66WheelPendingCreateBanner";
    banner.className = "adn66-wheel-pending-create-banner";
    createView.insertBefore(banner, createView.firstChild);
  }
  return banner;
}

function renderPendingWheelCreateBanner(){
  const banner = ensureWheelPendingCreateBanner();
  if(!banner) return;

  if(!hasPendingWheelReward()){
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }

  const label = getPendingWheelLabel();
  banner.style.display = "block";
  banner.innerHTML = `
    <div class="adn66-wheel-pending-title">🎡 Gain roue en attente</div>
    <div class="adn66-wheel-pending-text">
      Indiquez simplement votre prénom et votre numéro de téléphone pour enregistrer <b>${escapeHtml(label)}</b> sur votre carte fidélité.
    </div>
  `;
}

function renderPendingWheelHomeBanner(){
  const banner = $("adn66WheelPendingHomeBanner");
  if(!banner) return;

  if(!hasPendingWheelReward() || localStorage.getItem(LS_KEY)){
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }

  banner.style.display = "block";
  banner.innerHTML = `🎡 Gain en attente — cliquez sur <b>Activer la carte</b> pour l’enregistrer.`;
}

function hidePendingWheelHomeBanner(){
  const banner = $("adn66WheelPendingHomeBanner");
  if(!banner) return;
  banner.style.display = "none";
}


function ensureWheelRewardPopupStyles(){
  if(document.getElementById("adn66WheelRewardPopupStyles")) return;
  const style = document.createElement("style");
  style.id = "adn66WheelRewardPopupStyles";
  style.textContent = `
  .adn66-wheel-result-overlay{position:fixed;inset:0;z-index:130000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,11,18,.68);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);}
  .adn66-wheel-result-card{width:min(520px,100%);background:#ffffff;color:#0b1c2d;border-radius:22px;border:1px solid rgba(11,28,45,.12);box-shadow:0 22px 70px rgba(0,0,0,.35);overflow:hidden;text-align:left;}
  .adn66-wheel-result-head{padding:15px 16px;background:linear-gradient(180deg,rgba(93,183,238,.24),rgba(93,183,238,.07));border-bottom:1px solid rgba(11,28,45,.10);display:flex;align-items:center;justify-content:space-between;gap:12px;}
  .adn66-wheel-result-title{font-size:16px;font-weight:950;line-height:1.15;color:#0b1c2d;}
  .adn66-wheel-result-icon{width:42px;height:42px;border-radius:16px;display:grid;place-items:center;background:#5db7ee;color:#fff;font-size:22px;box-shadow:0 8px 18px rgba(93,183,238,.28);flex:0 0 auto;}
  .adn66-wheel-result-body{padding:15px 16px 4px;color:#0b1c2d;}
  .adn66-wheel-result-main{font-size:15px;font-weight:900;line-height:1.35;margin:0;}
  .adn66-wheel-result-sub{margin:8px 0 0;color:rgba(11,28,45,.72);font-size:13px;font-weight:800;line-height:1.35;}
  .adn66-wheel-result-extra{margin-top:12px;padding:10px 11px;border-radius:14px;background:rgba(93,183,238,.10);border:1px solid rgba(93,183,238,.25);font-size:12.5px;font-weight:850;color:#0b1c2d;line-height:1.35;}
  .adn66-wheel-result-foot{display:flex;gap:10px;justify-content:flex-end;padding:13px 16px 16px;}
  .adn66-wheel-result-ok{appearance:none;border:0;background:#5db7ee;color:#fff;font-weight:950;border-radius:14px;padding:11px 16px;min-width:140px;cursor:pointer;box-shadow:0 10px 18px rgba(93,183,238,.30);}
  .adn66-wheel-result-ok:active{transform:translateY(1px);}
  `;
  document.head.appendChild(style);
}

function showWheelRewardPopup(type, data){
  ensureWheelRewardPopupStyles();

  const prev = document.getElementById("adn66WheelRewardPopup");
  if(prev) prev.remove();

  const overlay = document.createElement("div");
  overlay.id = "adn66WheelRewardPopup";
  overlay.id = "adn66WheelRewardPopup";
  overlay.className = "adn66-wheel-result-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "adn66-wheel-result-card";

  let icon = "🎡";
  let title = "Gain enregistré";
  let main = "Votre gain a bien été enregistré sur votre carte fidélité.";
  let sub = "Vous pouvez maintenant présenter votre carte lors de votre prochaine commande.";
  let extra = "";

  if(type === "delivery"){
    icon = "🚚";
    title = data && data.extended ? "Livraison offerte prolongée" : "Livraison offerte activée";
    main = data && data.extended
      ? "7 jours ont été ajoutés à votre livraison offerte."
      : "Votre livraison offerte est bien enregistrée sur votre carte fidélité.";
    sub = "Cet avantage est séparé de Hib’air Drink et reste lié à votre carte.";
    if(data && data.expires_at){
      extra = `Valable jusqu’au : <b>${escapeHtml(new Date(data.expires_at).toLocaleString("fr-FR"))}</b>`;
    }
  }else if(type === "stamp"){
    icon = "✅";
    title = "Tampon ajouté";
    main = "Votre tampon a bien été ajouté à votre carte fidélité.";
    sub = "Votre récompense roue est maintenant enregistrée.";
    if(data && data.points !== undefined && data.goal !== undefined){
      extra = `Nouveau total : <b>${escapeHtml(data.points)}/${escapeHtml(data.goal)}</b>`;
    }
  }else if(type === "already"){
    icon = "🔒";
    title = "Gain déjà enregistré";
    main = "Une récompense roue est déjà associée à cette carte fidélité.";
    sub = "Pour éviter les abus, un seul vrai gain roue est possible par carte.";
  }else if(type === "pending"){
    icon = "⏳";
    title = "Gain roue en attente";
    main = "Votre carte est prête, mais le gain de la roue n’a pas encore pu être validé.";
    sub = "Rafraîchissez la page dans quelques instants si besoin.";
  }

  card.innerHTML = `
    <div class="adn66-wheel-result-head">
      <div class="adn66-wheel-result-title">${escapeHtml(title)}</div>
      <div class="adn66-wheel-result-icon" aria-hidden="true">${icon}</div>
    </div>
    <div class="adn66-wheel-result-body">
      <p class="adn66-wheel-result-main">${main}</p>
      <p class="adn66-wheel-result-sub">${sub}</p>
      ${extra ? `<div class="adn66-wheel-result-extra">${extra}</div>` : ""}
    </div>
    <div class="adn66-wheel-result-foot">
      <button type="button" class="adn66-wheel-result-ok">Voir ma carte</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = ()=> overlay.remove();
  const ok = card.querySelector(".adn66-wheel-result-ok");
  if(ok) ok.addEventListener("click", close);
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });
}


async function applyPendingWheelReward(clientId){
  const token = String(localStorage.getItem(LS_PENDING_WHEEL_TOKEN) || "").trim();
  if(!token || !clientId) return;

  try{
    const res = await api("/wheel/claim", {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, token })
    });

    localStorage.removeItem(LS_PENDING_WHEEL_TOKEN);
    localStorage.removeItem(LS_PENDING_WHEEL_REWARD);
    localStorage.removeItem(LS_PENDING_WHEEL_LABEL);
    renderPendingWheelCreateBanner();

    if(res && res.reward_id === "WHEEL_DELIVERY_7D"){
      const benefit = res.result || res.benefit || {};
      showWheelRewardPopup("delivery", benefit);
    }else if(res && res.reward_id === "WHEEL_STAMP"){
      const state = res.result || {};
      showWheelRewardPopup("stamp", state);
    }else{
      showWheelRewardPopup("default", {});
    }

    await loadCard();
  }catch(e){
    const code = String(e && e.message ? e.message : "");
    if(code === "already_wheel_claimed"){
      localStorage.removeItem(LS_PENDING_WHEEL_TOKEN);
      localStorage.removeItem(LS_PENDING_WHEEL_REWARD);
      localStorage.removeItem(LS_PENDING_WHEEL_LABEL);
      showWheelRewardPopup("already", {});
      await loadCard();
      return;
    }
    showWheelRewardPopup("pending", {});
  }
}

async function loadWheelClaim(clientId){
  if(!clientId) return null;
  try{
    const res = await api("/wheel/me?client_id=" + encodeURIComponent(clientId) + "&t=" + Date.now(), {method:"GET"});
    return res && res.claim ? res.claim : null;
  }catch(_){ return null; }
}

function ensureWheelClaimStyles(){
  if(document.getElementById("adn66WheelClaimStyles")) return;
  const style = document.createElement("style");
  style.id = "adn66WheelClaimStyles";
  style.textContent = `
  .adn66-wheel-claim-banner{width:100%;margin:0 0 10px 0;padding:10px 11px;border-radius:14px;background:linear-gradient(135deg, rgba(255,212,90,.22), rgba(93,183,238,.14));border:1px solid rgba(255,212,90,.55);box-shadow:0 8px 20px rgba(0,0,0,.10);color:#0b1c2d;text-align:left;}
  .adn66-wheel-claim-title{font-weight:950;font-size:13px;line-height:1.15;}
  .adn66-wheel-claim-msg{margin-top:5px;color:rgba(11,28,45,.78);font-weight:850;font-size:12px;line-height:1.22;}
  `;
  document.head.appendChild(style);
}

function renderWheelClaimBanner(claim){
  ensureWheelClaimStyles();
  const cardBlock = $("cardBlock");
  if(!cardBlock) return;
  let banner = document.getElementById("adn66WheelClaimBanner");
  if(!claim){ if(banner) banner.remove(); return; }
  if(!banner){
    banner = document.createElement("div");
    banner.id = "adn66WheelClaimBanner";
    banner.className = "adn66-wheel-claim-banner";
    cardBlock.insertBefore(banner, cardBlock.firstChild);
  }
  const label = claim.reward_label || claim.reward_id || "Récompense roue";
  const msg = claim.reward_id === "WHEEL_STAMP"
    ? "Un tampon fidélité a été ajouté à votre carte."
    : (claim.reward_id === "WHEEL_DELIVERY_7D" ? "Livraison offerte gagnée via la roue." : "Récompense enregistrée.");
  banner.innerHTML = `<div class="adn66-wheel-claim-title">🎡 Roue de la chance — ${escapeHtml(label)}</div><div class="adn66-wheel-claim-msg">${escapeHtml(msg)}</div>`;
}

/* ---------- Create ---------- */
async function createCard(){
  // Block check (6 days) with live countdown
  const blockUntil = getPhoneBlockUntil();
  if(blockUntil && Date.now() < blockUntil){
    showInfoPopupAction({
      title: "Accès temporairement bloqué",
      html: `Pour des raisons de sécurité, l’accès à ce service a été <b>bloqué temporairement</b>.<br><br>
            ⏳ Temps restant : <b id="adn66BlockRemain">${formatDuration(blockUntil - Date.now())}</b><div class="adn66-info-sub">
            Si vous pensez qu’il s’agit d’une erreur, contactez-nous :<br>
            <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br>
            en précisant ce que vous essayez de faire et le message affiché.
            </div>`,
      okText: "OK"
    });

    const tick = setInterval(()=>{
      const el = document.getElementById("adn66BlockRemain");
      if(!el){ clearInterval(tick); return; }
      const left = Math.max(0, blockUntil - Date.now());
      el.textContent = formatDuration(left);
      if(left <= 0){ clearInterval(tick); clearPhoneAbuseState(); }
    }, 1000);

    return;
  }

  const name = normalizeName(getInputValueByIds(["name","prenom","firstName","firstname","prenomClient","clientName"]));
  const phone = normalizePhone(getInputValueByIds(["phone","tel","telephone","mobile","numero","clientPhone"]));

  if(!name){
    showInfoPopup(
      "Prénom requis",
      `Merci d’indiquer un prénom valide pour activer votre carte.<br><br>
       Si vous rencontrez un problème, contactez-nous à :<br>
       <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br><br>
       en précisant ce que vous essayez de faire et le message affiché.`
    );
    return;
  }

  // Front check (light) — server remains authority
  if(!phone || phone.length < 10){
    const n = getPhoneErrCount() + 1;
    setPhoneErrCount(n);

    if(n === 1){
      showInfoPopup(
        "Numéro invalide",
        `Merci d’entrer un numéro de téléphone <b>valide</b> (mobile 06/07, 10 chiffres).<br>
         Exemple : <b>06 12 34 56 78</b>`
      );
      return;
    }

    if(n === 2){
      showInfoPopupAction({
        title: "Attention",
        html: `Le numéro saisi semble incorrect.<br>
              Vérifiez bien votre saisie (mobile <b>06/07</b>, 10 chiffres).<div class="adn66-info-sub">
              Vous pourrez confirmer dans <b>${PHONE_WARN_DELAY_SEC} secondes</b>.</div>`,
        okText: "OK",
        okDelaySeconds: PHONE_WARN_DELAY_SEC,
        lockClose: true
      });
      return;
    }

    const until = Date.now() + PHONE_BLOCK_DAYS * 24 * 60 * 60 * 1000;
    setPhoneBlockUntil(until);

    showInfoPopupAction({
      title: "Accès temporairement bloqué",
      html: `Pour des raisons de sécurité, l’accès à ce service a été <b>bloqué temporairement</b>.<br><br>
            ⏳ Temps restant : <b id="adn66BlockRemain">${formatDuration(until - Date.now())}</b><div class="adn66-info-sub">
            Si vous pensez qu’il s’agit d’une erreur, contactez-nous :<br>
            <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br>
            en précisant ce que vous essayez de faire et le message affiché.
            </div>`,
      okText: "OK"
    });

    const tick = setInterval(()=>{
      const el = document.getElementById("adn66BlockRemain");
      if(!el){ clearInterval(tick); return; }
      const left = Math.max(0, until - Date.now());
      el.textContent = formatDuration(left);
      if(left <= 0){ clearInterval(tick); clearPhoneAbuseState(); }
    }, 1000);

    return;
  }

  try{
    const r = await api("/loyalty/register", {
      method:"POST",
      body: JSON.stringify({name, phone})
    });

    if(r && (r.exists || r.existed || r.already_exists || r.alreadyExists)){
      showInfoPopup(
        "Carte déjà existante",
        `Une carte de fidélité est déjà associée à ce numéro.<br><br>
         Pour la récupérer en toute sécurité, contactez notre équipe :<br>
         <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br><br>
         👉 La récupération se fait uniquement avec vérification, afin de protéger vos avantages.`
      );
      return;
    }

    if(!r || !r.client_id) throw new Error("Réponse invalide");
    localStorage.setItem(LS_KEY, r.client_id);

    // success => reset counters
    clearPhoneAbuseState();

    closeModal();
    await loadCard();
    await applyPendingGameReward(r.client_id);
    await applyPendingWheelReward(r.client_id);
    await loadCard();
    scheduleAppInstallNudge(1800);
  }catch(e){
    const code = String((e && e.message) ? e.message : "").trim();

    if(code === "name_required"){
      showInfoPopup(
        "Prénom requis",
        `Merci d’indiquer un prénom valide pour activer votre carte.<br><br>
         Si vous rencontrez un problème, contactez-nous à :<br>
         <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br><br>
         en précisant ce que vous essayez de faire et le message affiché.`
      );
      return;
    }

    if(code === "already_exists" || code === "exists"){ 
      showInfoPopup(
        "Carte déjà existante",
        `Une carte de fidélité est déjà associée à ce numéro.<br><br>
         Pour la récupérer en toute sécurité, contactez notre équipe :<br>
         <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br><br>
         👉 La récupération se fait uniquement avec vérification, afin de protéger vos avantages.`
      );
      return;
    }

    if(code === "phone_required" || code === "phone_invalid"){
      const n = getPhoneErrCount() + 1;
      setPhoneErrCount(n);

      if(n === 1){
        showInfoPopup(
          "Numéro invalide",
          `Merci d’entrer un numéro de téléphone <b>valide</b> (mobile 06/07, 10 chiffres).<br>
           Exemple : <b>06 12 34 56 78</b>`
        );
        return;
      }

      if(n === 2){
        showInfoPopupAction({
          title: "Attention",
          html: `Le numéro saisi semble incorrect.<br>
                Vérifiez bien votre saisie (mobile <b>06/07</b>, 10 chiffres).<div class="adn66-info-sub">
                Vous pourrez confirmer dans <b>${PHONE_WARN_DELAY_SEC} secondes</b>.</div>`,
          okText: "OK",
          okDelaySeconds: PHONE_WARN_DELAY_SEC,
          lockClose: true
        });
        return;
      }

      const until = Date.now() + PHONE_BLOCK_DAYS * 24 * 60 * 60 * 1000;
      setPhoneBlockUntil(until);

      showInfoPopupAction({
        title: "Accès temporairement bloqué",
        html: `Pour des raisons de sécurité, l’accès à ce service a été <b>bloqué temporairement</b>.<br><br>
              ⏳ Temps restant : <b id="adn66BlockRemain">${formatDuration(until - Date.now())}</b><div class="adn66-info-sub">
              Si vous pensez qu’il s’agit d’une erreur, contactez-nous :<br>
              <a href="mailto:Contact@aperos.net">📧 Contact@aperos.net</a><br>
              en précisant ce que vous essayez de faire et le message affiché.
              </div>`,
        okText: "OK"
      });

      const tick = setInterval(()=>{
        const el = document.getElementById("adn66BlockRemain");
        if(!el){ clearInterval(tick); return; }
        const left = Math.max(0, until - Date.now());
        el.textContent = formatDuration(left);
        if(left <= 0){ clearInterval(tick); clearPhoneAbuseState(); }
      }, 1000);

      return;
    }

    showInfoPopup(
      "Erreur",
      `Impossible de créer la carte pour le moment.<br><br>
       Si le problème persiste, contactez-nous : <a href="mailto:Contact@aperos.net">Contact@aperos.net</a>`
    );
  }
}

/* ---------- Copy link (QR payload) ---------- */
async function copyLink(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid) return;
  const link = getRestoreUrl(cid);
  try{
    await navigator.clipboard.writeText(link);
  }catch(_){}
}


/* ---------- Pré-permission Caméra (UX) ---------- */
function openCamPermModal(){
  const m = document.getElementById("camPermModal");
  if(!m) return false;
  m.classList.add("open");
  m.setAttribute("aria-hidden","false");
  return true;
}
function closeCamPermModal(){
  const m = document.getElementById("camPermModal");
  if(!m) return;
  m.classList.remove("open");
  m.setAttribute("aria-hidden","true");
}

/* ---------- Restore (Scan + Manual) ---------- */
async function stopRestoreScan(){
  restoreScanning = false;
  const video = $("video");
  try{ if(video) video.pause(); }catch(_){}
  if(restoreStream){
    try{ restoreStream.getTracks().forEach(t=>t.stop()); }catch(_){}
    restoreStream = null;
  }
  if(video) video.srcObject = null;
}

async function restoreFromAny(raw){
  const cid = extractClientIdFromAny(raw);
  if(!isValidClientId(cid)) return showInfoPopup("QR invalide", "QR code invalide. Merci de réessayer.");

  // Restauration stricte : on écrase TOUJOURS l'ancien client_id local.
  localStorage.setItem(LS_KEY, cid);
  closeModal();
  await loadCard();

  // Si une récompense jeu était en attente, elle doit s'appliquer sur CETTE carte restaurée.
  await applyPendingGameReward(cid);
  await applyPendingWheelReward(cid);
  await loadCard();

  showInfoPopup(
    "Carte restaurée ✅",
    `Cette carte est maintenant utilisée sur ce téléphone.<br><br><b>ID :</b><br><span style="font-family:monospace;font-size:12px">${escapeHtml(shortClientId(cid))}</span>`
  );
}

async function startRestoreScan(){
  const hint = $("scanHint");
  const video = $("video");
  if(!hint || !video) return;

  if(restoreScanning) return;
  restoreScanning = true;

  const constraints = { video: { facingMode: { ideal: "environment" } }, audio: false };

  const pickCid = (raw) => extractClientIdFromAny(raw) || "";

  try{
    hint.textContent = "Ouverture caméra…";

    if("BarcodeDetector" in window){
      const detector = new BarcodeDetector({formats:["qr_code"]});
      restoreStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = restoreStream;
      await video.play();

      hint.textContent = "Scan en cours…";

      while(restoreScanning){
        const codes = await detector.detect(video);
        if(codes && codes.length){
          const raw = String(codes[0].rawValue || "").trim();
          const cid = pickCid(raw);
          if(cid && isValidClientId(cid)){
            await restoreFromAny(cid);
            return;
          }
        }
        await sleep(200);
      }
      return;
    }

    if(!(window.ZXing && window.ZXing.BrowserQRCodeReader)){
      hint.textContent = "Chargement scanner…";
      await new Promise((resolve, reject)=>{
        const s = document.createElement("script");
        s.src = "https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js";
        s.async = true;
        s.onload = resolve;
        s.onerror = ()=>reject(new Error("ZXing introuvable"));
        document.head.appendChild(s);
      });
    }

    if(!(window.ZXing && window.ZXing.BrowserQRCodeReader)){
      hint.textContent = "Scanner non supporté ici. Colle l’URL / l’ID.";
      restoreScanning = false;
      return;
    }

    restoreStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = restoreStream;
    await video.play();
    hint.textContent = "Scan en cours…";

    const codeReader = new window.ZXing.BrowserQRCodeReader();
    await codeReader.decodeFromVideoElementContinuously(video, async (result) => {
      if(!restoreScanning) return;
      if(result && result.getText){
        const raw = result.getText();
        const cid = pickCid(raw);
        if(cid && isValidClientId(cid)){
          await restoreFromAny(cid);
          return;
        }
      }
    });
  }catch(e){
    hint.textContent = "Erreur caméra : " + (e && e.message ? e.message : String(e));
    await stopRestoreScan();
  }
}

/* ---------- Auto-restore via URL ?id=... ---------- */

function getRewardTokenFromUrl(){
  try{
    const u = new URL(location.href);
    const t = u.searchParams.get("reward_token") || "";
    return String(t || "").trim();
  }catch(_){ return ""; }
}
let adn66JustRestoredClientId = "";
function tryAutoRestoreFromUrl(){
  try{
    const u = new URL(location.href);
    const id = u.searchParams.get("id") || u.searchParams.get("client_id") || "";
    if(id){
      const cid = extractClientIdFromAny(id);
      if(isValidClientId(cid)){
        // Restauration stricte : l'URL admin/QR écrase TOUJOURS l'ancien client_id local.
        localStorage.setItem(LS_KEY, cid);
        adn66JustRestoredClientId = cid;
        u.searchParams.delete("restore");
        u.searchParams.delete("id");
        u.searchParams.delete("client_id");
        history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
      }
    }
  }catch(_){}
}

/* ---------- Bind events ---------- */
function bind(){
  savePendingWheelRewardFromUrl();
  renderPendingWheelCreateBanner();
  renderPendingWheelHomeBanner();
  tryAutoRestoreFromUrl();
  savePendingGameRewardFromUrl();

  const rewardToken = getRewardTokenFromUrl();
  if(rewardToken){
    consumeRewardToken(rewardToken);
    try{
      const u = new URL(location.href);
      u.searchParams.delete("reward_token");
      history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
    }catch(_){}
  }

  const btnOpenCreate = $("btnOpenCreate");
  const btnOpenRestore = $("btnOpenRestore");
  const tabCreate = $("tabCreate");
  const tabRestore = $("tabRestore");

  const btnCreate = $("btnCreate");
  if(btnCreate) btnCreate.type = "button";
  const btnClose1 = $("btnCloseModal1");
  const btnClose2 = $("btnCloseModal2");

  const btnStartScan = $("btnStartScan");
  const btnUseManual = $("btnUseManual");
  const manual = $("manualCid");

  const btnRefresh = $("btnRefresh");
  const btnShowQr = $("btnShowQr");

  const qrClose = $("qrClose");
  const btnCopyLink = $("btnCopyLink");

  if(btnOpenCreate) btnOpenCreate.onclick = ()=>{ hidePendingWheelHomeBanner(); showModal("create"); };
  if(btnOpenRestore) btnOpenRestore.onclick = ()=>showModal("restore");

  if(tabCreate) tabCreate.onclick = ()=>setModalMode("create");
  if(tabRestore) tabRestore.onclick = ()=>setModalMode("restore");

  if(btnCreate) btnCreate.onclick = createCard;
  if(btnClose1) btnClose1.onclick = closeModal;
  if(btnClose2) btnClose2.onclick = closeModal;

  if(btnStartScan) btnStartScan.onclick = ()=>{ if(openCamPermModal()) return;

  const camPermModal = document.getElementById("camPermModal");
  const camPermClose = document.getElementById("camPermClose");
  const camPermCancel = document.getElementById("camPermBtnCancel");
  const camPermGo = document.getElementById("camPermBtnGo");

  if(camPermClose) camPermClose.onclick = closeCamPermModal;
  if(camPermCancel) camPermCancel.onclick = closeCamPermModal;

  if(camPermModal){
    camPermModal.addEventListener("click", (e)=>{
      if(e.target === camPermModal) closeCamPermModal();
    });
  }

  if(camPermGo){
    camPermGo.onclick = async ()=>{
      closeCamPermModal();
      await startRestoreScan();
    };
  }
 startRestoreScan(); };

  if(manual){
    const clean = ()=>{ manual.value = extractClientIdFromAny(manual.value); };
    manual.addEventListener("input", clean, true);
    manual.addEventListener("change", clean, true);
    manual.addEventListener("blur", clean, true);
    manual.addEventListener("paste", ()=>setTimeout(clean, 0), true);
  }
  if(btnUseManual) btnUseManual.onclick = async ()=>{
    const input = $("manualCid");
    await restoreFromAny(input ? input.value : "");
  };

  if(btnRefresh) btnRefresh.onclick = loadCard;
  if(btnShowQr) btnShowQr.onclick = openQrModal;

  if(btnCopyLink) btnCopyLink.onclick = copyLink;
  if(qrClose) qrClose.onclick = closeQrModal;

  // close modals on backdrop click
  const actionModal = $("actionModal");
  if(actionModal){
    actionModal.addEventListener("click", (e)=>{
      if(e.target === actionModal) closeModal();
    });
  }
  const qrModal = $("qrModal");
  if(qrModal){
    qrModal.addEventListener("click", (e)=>{
      if(e.target === qrModal) closeQrModal();
    });
  }

  loadCard().then(async ()=>{
    const adn66CurrentClientId = localStorage.getItem(LS_KEY);
    if(adn66CurrentClientId){
      await applyPendingWheelReward(adn66CurrentClientId);
    }
    if(adn66JustRestoredClientId){
      await applyPendingGameReward(adn66JustRestoredClientId);
      await applyPendingWheelReward(adn66JustRestoredClientId);
      await loadCard();
      scheduleAppInstallNudge(1800);
      showInfoPopup(
        "Carte restaurée ✅",
        `Cette carte est maintenant utilisée sur ce téléphone.<br><br><b>ID :</b><br><span style="font-family:monospace;font-size:12px">${escapeHtml(shortClientId(adn66JustRestoredClientId))}</span>`
      );
    }
  });
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bind);
}else{
  bind();
}



async function consumeRewardToken(token){
  if(!token) return;
  try{
    const res = await api("/loyalty/reward/consume", {
      method: "POST",
      body: JSON.stringify({ token })
    });

    if(res && res.milestone === "GAME_35"){
      showInfoPopup(
        "Livraison offerte activée 🚚",
        "Profitez de la livraison gratuite à chaque commande pendant 1 semaine. Le compte à rebours apparaît en haut de votre carte."
      );
    }else{
      showInfoPopup(
        "Récompense validée 🎉",
        "Un tampon a été ajouté à votre carte de fidélité."
      );
    }

    await loadCard();
  }catch(e){
    await loadCard();
    showInfoPopup(
      "Récompense",
      "Cette récompense a déjà été utilisée, n’est plus valide, ou elle a été appliquée sur une autre carte. Vérifiez la ligne DEBUG : elle doit afficher le même ID que l’admin."
    );
  }
}



/* ==========================================================
   ADN66 — PATCH Hib'air Drink multi-gains visibles
   Objectif : conserver la roue stable + afficher les gains Hib'air
   en attente sur l'accueil et dans la popup Activer la carte.
   ========================================================== */
(function(){
  const GAME_QUEUE_KEY = "adn66_pending_game_rewards_queue_v2";

  function _adn66SafeJsonParse(raw, fallback){
    try{ const v = JSON.parse(raw); return v == null ? fallback : v; }catch(_){ return fallback; }
  }

  function _adn66ReadGameQueue(){
    let q = _adn66SafeJsonParse(localStorage.getItem(GAME_QUEUE_KEY) || "[]", []);
    if(!Array.isArray(q)) q = [];

    // Migration ancienne version : un seul gain stocké dans adn66_pending_game_reward_v1
    try{
      const oldReward = String(localStorage.getItem(LS_PENDING_GAME_REWARD) || "").trim();
      if(["GAME_25","GAME_35"].includes(oldReward)){
        const oldPlayer = String(localStorage.getItem(LS_PENDING_GAME_PLAYER_ID) || "").trim();
        const oldName = String(localStorage.getItem(LS_PENDING_GAME_PUBLIC_NAME) || "").trim();
        q.push({ reward: oldReward, player_id: oldPlayer, public_name: oldName, created_at: new Date().toISOString(), source: "legacy" });
        localStorage.removeItem(LS_PENDING_GAME_REWARD);
        localStorage.removeItem(LS_PENDING_GAME_PLAYER_ID);
        localStorage.removeItem(LS_PENDING_GAME_PUBLIC_NAME);
        localStorage.setItem(GAME_QUEUE_KEY, JSON.stringify(q));
      }
    }catch(_){}

    return q.filter(x => x && ["GAME_25","GAME_35"].includes(String(x.reward || "")));
  }

  function _adn66WriteGameQueue(q){
    q = Array.isArray(q) ? q.filter(x => x && ["GAME_25","GAME_35"].includes(String(x.reward || ""))) : [];
    if(q.length) localStorage.setItem(GAME_QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(GAME_QUEUE_KEY);
  }

  function _adn66GetGameRewardFromCurrentUrl(){
    try{
      const u = new URL(location.href);
      const reward = String(u.searchParams.get("game_reward") || "").trim();
      if(!["GAME_25","GAME_35"].includes(reward)) return null;
      return {
        reward,
        player_id: String(u.searchParams.get("player_id") || "").trim(),
        public_name: String(u.searchParams.get("public_name") || "").trim(),
        created_at: new Date().toISOString(),
        source: "url"
      };
    }catch(_){ return null; }
  }

  function _adn66PendingGameSummary(){
    const q = _adn66ReadGameQueue();
    let stamps = 0;
    let deliveries = 0;
    for(const item of q){
      if(item.reward === "GAME_25") stamps++;
      if(item.reward === "GAME_35") deliveries++;
    }
    const total = stamps + deliveries;
    return { q, stamps, deliveries, total };
  }

  function _adn66PendingLines(summary){
    const lines = [];
    if(summary.stamps > 0) lines.push(`• ${summary.stamps} tampon${summary.stamps > 1 ? "s" : ""} fidélité`);
    if(summary.deliveries > 0) lines.push(`• ${summary.deliveries} livraison${summary.deliveries > 1 ? "s" : ""} offerte${summary.deliveries > 1 ? "s" : ""}`);
    return lines;
  }

  function _adn66HasPendingWheel(){
    try{ return typeof hasPendingWheelReward === "function" && hasPendingWheelReward(); }catch(_){ return false; }
  }

  function _adn66TotalPendingCount(){
    const s = _adn66PendingGameSummary();
    return s.total + (_adn66HasPendingWheel() ? 1 : 0);
  }

  // Remplace l'ancienne fonction : au lieu d'écraser GAME_25/GAME_35,
  // on ajoute le gain Hib'air Drink dans une vraie file d'attente.
  window.savePendingGameRewardFromUrl = function savePendingGameRewardFromUrl(){
    const item = _adn66GetGameRewardFromCurrentUrl();
    if(!item) return;

    const q = _adn66ReadGameQueue();
    q.push(item);
    _adn66WriteGameQueue(q);

    try{
      const u = new URL(location.href);
      u.searchParams.delete("game_reward");
      u.searchParams.delete("player_id");
      u.searchParams.delete("public_name");
      history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
    }catch(_){}
  };

  // Rend le bandeau d'accueil visible pour la roue ET Hib'air Drink.
  window.renderPendingWheelHomeBanner = function renderPendingWheelHomeBanner(){
    const banner = document.getElementById("adn66WheelPendingHomeBanner");
    if(!banner) return;

    // Important : si le lien contient game_reward, on le prend en compte avant affichage.
    try{ window.savePendingGameRewardFromUrl(); }catch(_){}

    if(localStorage.getItem(LS_KEY)){
      banner.style.display = "none";
      banner.innerHTML = "";
      return;
    }

    const s = _adn66PendingGameSummary();
    const hasWheel = _adn66HasPendingWheel();
    const total = s.total + (hasWheel ? 1 : 0);

    if(total <= 0){
      banner.style.display = "none";
      banner.innerHTML = "";
      return;
    }

    banner.style.display = "block";
    if(s.total > 0 && hasWheel){
      banner.innerHTML = `🎁 ${total} gains en attente — cliquez sur <b>Activer la carte</b> pour les enregistrer.`;
    }else if(s.total > 0){
      banner.innerHTML = `🎁 ${s.total} gain${s.total > 1 ? "s" : ""} Hib’air Drink en attente — cliquez sur <b>Activer la carte</b>.`;
    }else{
      banner.innerHTML = `🎡 Gain roue en attente — cliquez sur <b>Activer la carte</b> pour l’enregistrer.`;
    }
  };

  // Rend le bandeau dans la popup Activer la carte visible et détaillé.
  window.renderPendingWheelCreateBanner = function renderPendingWheelCreateBanner(){
    const banner = (typeof ensureWheelPendingCreateBanner === "function") ? ensureWheelPendingCreateBanner() : null;
    if(!banner) return;

    try{ window.savePendingGameRewardFromUrl(); }catch(_){}

    const s = _adn66PendingGameSummary();
    const hasWheel = _adn66HasPendingWheel();
    const total = s.total + (hasWheel ? 1 : 0);

    if(total <= 0){
      banner.style.display = "none";
      banner.innerHTML = "";
      return;
    }

    const details = [];
    if(hasWheel){
      let wheelLabel = "gain roue";
      try{ wheelLabel = getPendingWheelLabel(); }catch(_){}
      details.push(`• ${escapeHtml(wheelLabel)}`);
    }
    _adn66PendingLines(s).forEach(line => details.push(escapeHtml(line)));

    const title = s.total > 0 && hasWheel
      ? `🎁 ${total} gains en attente`
      : (s.total > 0 ? `🎁 ${s.total} gain${s.total > 1 ? "s" : ""} Hib’air Drink en attente` : "🎡 Gain roue en attente");

    banner.style.display = "block";
    banner.innerHTML = `
      <div class="adn66-wheel-pending-title">${title}</div>
      <div class="adn66-wheel-pending-text">
        Indiquez simplement votre prénom et votre numéro de téléphone pour enregistrer sur votre carte fidélité :<br>
        <b>${details.join("<br>")}</b>
      </div>
    `;
  };

  function _adn66EnsureHibairPopupStyles(){
    if(document.getElementById("adn66HibairRewardPopupStyles")) return;
    const style = document.createElement("style");
    style.id = "adn66HibairRewardPopupStyles";
    style.textContent = `
      .adn66-hibair-popup-overlay{position:fixed;inset:0;z-index:130000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,11,18,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
      .adn66-hibair-popup-card{width:min(520px,100%);background:#fff;color:#0b1c2d;border-radius:22px;border:1px solid rgba(11,28,45,.12);box-shadow:0 22px 70px rgba(0,0,0,.35);overflow:hidden;text-align:left;}
      .adn66-hibair-popup-head{padding:15px 16px;background:linear-gradient(180deg,rgba(93,183,238,.24),rgba(93,183,238,.06));border-bottom:1px solid rgba(11,28,45,.10);font-size:17px;font-weight:950;color:#0b1c2d;}
      .adn66-hibair-popup-body{padding:15px 16px;color:#0b1c2d;font-size:14px;font-weight:850;line-height:1.45;}
      .adn66-hibair-popup-body ul{margin:10px 0 0;padding-left:20px;}
      .adn66-hibair-popup-foot{padding:0 16px 16px;display:flex;justify-content:flex-end;}
      .adn66-hibair-popup-ok{appearance:none;border:0;background:#5db7ee;color:#fff;font-weight:950;border-radius:14px;padding:11px 15px;min-width:150px;cursor:pointer;box-shadow:0 10px 18px rgba(93,183,238,.30);}
      @media(max-width:420px){.adn66-hibair-popup-ok{width:100%;}}
    `;
    document.head.appendChild(style);
  }

  function _adn66ShowHibairPopup(title, html){
    _adn66EnsureHibairPopupStyles();
    const prev = document.getElementById("adn66HibairRewardPopup");
    if(prev) prev.remove();
    const overlay = document.createElement("div");
    overlay.id = "adn66HibairRewardPopup";
    overlay.className = "adn66-hibair-popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="adn66-hibair-popup-card">
        <div class="adn66-hibair-popup-head">${title}</div>
        <div class="adn66-hibair-popup-body">${html}</div>
        <div class="adn66-hibair-popup-foot"><button type="button" class="adn66-hibair-popup-ok">Voir ma carte</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = ()=> overlay.remove();
    overlay.querySelector(".adn66-hibair-popup-ok")?.addEventListener("click", close);
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(); });
  }

  // Remplace l'application d'une récompense unique par une consommation séquentielle.
  window.applyPendingGameReward = async function applyPendingGameReward(clientId){
    if(!clientId) return;

    // On prend en compte l'URL courante juste avant d'appliquer.
    try{ window.savePendingGameRewardFromUrl(); }catch(_){}

    const q = _adn66ReadGameQueue();
    if(!q.length) return;

    let stamps = 0;
    let deliveries = 0;
    let already = 0;
    let failed = 0;
    const remaining = [];

    for(const item of q){
      try{
        const r = await api("/game/reward/request", {
          method: "POST",
          body: JSON.stringify({
            client_id: clientId,
            milestone: item.reward,
            player_id: item.player_id || undefined,
            public_name: item.public_name || undefined
          })
        });

        if(r && r.token){
          await consumeRewardToken(r.token, { silent: true });
          if(item.reward === "GAME_25") stamps++;
          if(item.reward === "GAME_35") deliveries++;
          continue;
        }

        const code = String((r && (r.code || r.status || r.error_code || r.message || r.error)) || "").trim();
        if(code === "already_claimed") already++;
        else failed++;
      }catch(e){
        const code = String((e && e.message) || "").trim();
        if(code === "already_claimed") already++;
        else{
          failed++;
          remaining.push(item);
        }
      }
    }

    _adn66WriteGameQueue(remaining);
    await loadCard();

    const lines = [];
    if(stamps > 0) lines.push(`<li>${stamps} tampon${stamps > 1 ? "s" : ""} ajouté${stamps > 1 ? "s" : ""}</li>`);
    if(deliveries > 0) lines.push(`<li>${deliveries} livraison${deliveries > 1 ? "s" : ""} offerte${deliveries > 1 ? "s" : ""} activée${deliveries > 1 ? "s" : ""}</li>`);
    if(already > 0) lines.push(`<li>${already} récompense${already > 1 ? "s" : ""} déjà utilisée${already > 1 ? "s" : ""}</li>`);
    if(failed > 0 && remaining.length > 0) lines.push(`<li>${failed} récompense${failed > 1 ? "s" : ""} gardée${failed > 1 ? "s" : ""} en attente</li>`);

    if(lines.length){
      _adn66ShowHibairPopup(
        "🎁 Récompenses Hib’air Drink",
        `Vos récompenses ont été traitées sur votre carte fidélité :<ul>${lines.join("")}</ul>`
      );
    }
  };

  // Remplace la popup moche des tokens directs Hib'air Drink.
  window.consumeRewardToken = async function consumeRewardToken(token, opts){
    if(!token) return null;
    const silent = !!(opts && opts.silent);
    try{
      const res = await api("/loyalty/reward/consume", {
        method: "POST",
        body: JSON.stringify({ token })
      });

      if(!silent){
        if(res && res.milestone === "GAME_35"){
          _adn66ShowHibairPopup("🚚 Livraison offerte activée", "Votre livraison offerte est bien enregistrée sur votre carte fidélité.");
        }else{
          _adn66ShowHibairPopup("🎁 Tampon ajouté", "Votre tampon Hib’air Drink a bien été ajouté à votre carte fidélité.");
        }
      }

      await loadCard();
      return res;
    }catch(e){
      await loadCard();
      if(!silent){
        _adn66ShowHibairPopup("🎁 Récompense", "Cette récompense a déjà été utilisée, n’est plus valide, ou elle a été appliquée sur une autre carte.");
      }
      throw e;
    }
  };

  // Après chargement, force un rendu des bandeaux au cas où l'ancien bind a déjà tourné.
  setTimeout(()=>{
    try{ window.savePendingGameRewardFromUrl(); }catch(_){}
    try{ window.renderPendingWheelHomeBanner(); }catch(_){}
    try{ window.renderPendingWheelCreateBanner(); }catch(_){}
  }, 120);
})();
