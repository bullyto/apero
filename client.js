// PATH: /fidel/client.js
// ADN66 • Carte de fidélité — Client
// Version: 2026-01-28 minimal-ui + qr-popup + copy-link

const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";
const GOAL = 8;
const RESET_HOURS = 24;
const LS_KEY = "adn66_loyalty_client_id";

// Anti-abus (client-side) — erreurs téléphone (progressif)
const LS_PHONE_ERR = "adn66_loyalty_phone_err_count_v1";
const LS_PHONE_BLOCK_UNTIL = "adn66_loyalty_phone_block_until_v1";
const PHONE_BLOCK_DAYS = 6;
const PHONE_WARN_DELAY_SEC = 15;

// IMPORTANT: le QR + copie = URL (pas d'ID affiché)
const PUBLIC_RESTORE_URL_BASE = "https://www.aperos.net/fidel/client.html?restore=1&id=";

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
  const safe = Math.max(0, Math.min(GOAL, Number(points||0)));
  document.querySelectorAll(".stamp").forEach(el=>{
    const slot = Number(el.dataset.slot || "0");
    el.classList.toggle("filled", slot > 0 && slot <= safe);
  });
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
  const res = await fetch(API_BASE + path, {
    headers: {"content-type":"application/json"},
    ...opts
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.error || ("HTTP " + res.status));
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
    setSyncText(true);
    return;
  }

  setScreen(true);

  try{
    const res = await api("/loyalty/me?client_id=" + encodeURIComponent(cid) + "&t=" + Date.now(), {method:"GET"});
    const card = res.card || res;

    const points = Number(card.points || 0);
    const goal = Number(card.goal || GOAL);

    const pts = $("points");
    const g = $("goal");
    if(pts) pts.textContent = String(points);
    if(g) g.textContent = String(goal);

    renderVisualStamps(points);
    setStateText(points, card.completed_at || null);
    setSyncText(true);
  }catch(_){
    setSyncText(false);
  }
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

  const name = normalizeName(($("name") && $("name").value) ? $("name").value : "");
  const phone = normalizePhone(($("phone") && $("phone").value) ? $("phone").value : "");

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

    if(r && r.exists){
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
  localStorage.setItem(LS_KEY, cid);
  closeModal();
  await loadCard();
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
function tryAutoRestoreFromUrl(){
  try{
    const u = new URL(location.href);
    const id = u.searchParams.get("id") || "";
    if(id){
      const cid = extractClientIdFromAny(id);
      if(isValidClientId(cid)){
        localStorage.setItem(LS_KEY, cid);
        // Nettoyer l'URL (optionnel) : on retire les params
        u.searchParams.delete("restore");
        u.searchParams.delete("id");
        history.replaceState({}, "", u.pathname + (u.search ? u.search : "") + u.hash);
      }
    }
  }catch(_){}
}

/* ---------- Bind events ---------- */
function bind(){
  tryAutoRestoreFromUrl();

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

  if(btnOpenCreate) btnOpenCreate.onclick = ()=>showModal("create");
  if(btnOpenRestore) btnOpenRestore.onclick = ()=>showModal("restore");

  if(tabCreate) tabCreate.onclick = ()=>setModalMode("create");
  if(tabRestore) tabRestore.onclick = ()=>setModalMode("restore");

  if(btnCreate) btnCreate.onclick = createCard;
  if(btnClose1) btnClose1.onclick = closeModal;
  if(btnClose2) btnClose2.onclick = closeModal;

  if(btnStartScan) btnStartScan.onclick = startRestoreScan;

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

  loadCard();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bind);
}else{
  bind();
}
