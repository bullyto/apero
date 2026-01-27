// PATH: /fidel/client.js
// ADN66 • Carte de fidélité — Client
// Version: 2026-01-28 restore-fix

const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";
const GOAL = 8;
const RESET_HOURS = 24;
const LS_KEY = "adn66_loyalty_client_id";

/* ---------- Utils ---------- */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalizePhone(raw){ return (raw||"").replace(/[^0-9+]/g,"").trim(); }
function normalizeName(raw){ return (raw||"").trim().slice(0,40); }

function isValidClientId(cid){
  if(!cid) return false;
  const s = String(cid).trim();
  // UUID
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // ULID
  if(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) return true;
  // Prefixed id
  if(/^c_[a-zA-Z0-9_-]{10,}$/.test(s)) return true;
  return false;
}

/* ---------- UI ---------- */
function setEnvPill(){
  const pill = document.getElementById("envPill");
  if(!pill) return;
  pill.innerHTML = "Mode : <b>" + (API_BASE ? "Serveur" : "Démo") + "</b>";
}

function setCardVisible(v){
  const form = document.getElementById("formBlock");
  const card = document.getElementById("cardBlock");
  if(form) form.style.display = v ? "none" : "block";
  if(card) card.style.display = v ? "block" : "none";
}

function setMeta(cid){
  const meta = document.getElementById("meta");
  const cidText = document.getElementById("cidText");
  if(meta) meta.textContent = cid ? ("ID: " + cid) : "—";
  if(cidText) cidText.textContent = cid || "—";
  if(cid) qrRender(cid);
}

function setApiState(ok, msg){
  const dot = document.getElementById("dot");
  const txt = document.getElementById("apiState");
  if(dot) dot.className = "dot " + (ok ? "ok" : "warn");
  if(txt) txt.textContent = msg || (ok ? "Synchronisé" : "Hors ligne");
}

function setStateText(points, completedAt){
  const st = document.getElementById("stateText");
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
  const box = document.getElementById("qrSvg");
  if(!box) return;
  try{
    if(typeof window.QRCodeGenerator !== "function") throw new Error("QRCodeGenerator missing");
    const q = new window.QRCodeGenerator(0);
    q.addData(String(text));
    q.make();
    // qr.min.js: createSvgTag(cellSize, fillColor)
    box.innerHTML = q.createSvgTag(4, "#111");
  }catch(_){
    box.innerHTML = "QR indisponible";
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

/* ---------- Load card ---------- */
async function loadCard(){
  const cid = localStorage.getItem(LS_KEY);

  if(!cid){
    setCardVisible(false);
    const pts = document.getElementById("points");
    const goal = document.getElementById("goal");
    if(pts) pts.textContent = "0";
    if(goal) goal.textContent = String(GOAL);
    renderVisualStamps(0);
    setStateText(0, null);
    setApiState(true, "Synchronisé");
    setMeta(null);
    return;
  }

  setCardVisible(true);
  setMeta(cid);

  try{
    const res = await api("/loyalty/me?client_id=" + encodeURIComponent(cid) + "&t=" + Date.now(), {method:"GET"});
    const card = res.card || res;

    const points = Number(card.points || 0);
    const goal = Number(card.goal || GOAL);

    const pts = document.getElementById("points");
    const g = document.getElementById("goal");
    if(pts) pts.textContent = String(points);
    if(g) g.textContent = String(goal);

    renderVisualStamps(points);
    setStateText(points, card.completed_at || null);
    setApiState(true, "Synchronisé");
  }catch(_){
    setApiState(false, "Hors ligne");
  }
}

/* ---------- Create ---------- */
async function createCard(){
  const nameEl = document.getElementById("name");
  const phoneEl = document.getElementById("phone");
  const name = normalizeName(nameEl ? nameEl.value : "");
  const phone = normalizePhone(phoneEl ? phoneEl.value : "");

  if(!name) return alert("Entre ton prénom.");
  if(!phone || phone.length < 10) return alert("Numéro invalide.");

  try{
    const r = await api("/loyalty/register", {
      method:"POST",
      body: JSON.stringify({name, phone})
    });
    if(!r || !r.client_id) throw new Error("Réponse invalide");
    localStorage.setItem(LS_KEY, r.client_id);
    await loadCard();
  }catch(e){
    alert("Erreur création carte : " + e.message);
  }
}

async function copyId(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid) return;
  try{
    await navigator.clipboard.writeText(cid);
  }catch(_){}
}

/* ---------- Restore (Modal + Scan + Manual) ---------- */
let restoreStream = null;
let restoreScanning = false;

function openRestore(){
  const modal = document.getElementById("restoreModal");
  if(!modal) return;
  modal.classList.add("open");
  const hint = document.getElementById("scanHint");
  if(hint) hint.textContent = "";
}

async function stopRestoreScan(){
  restoreScanning = false;
  const video = document.getElementById("video");
  try{ if(video) video.pause(); }catch(_){}
  if(restoreStream){
    try{ restoreStream.getTracks().forEach(t=>t.stop()); }catch(_){}
    restoreStream = null;
  }
  if(video) video.srcObject = null;
}

async function closeRestore(){
  const modal = document.getElementById("restoreModal");
  if(modal) modal.classList.remove("open");
  await stopRestoreScan();
}

async function restoreFromId(raw){
  const cid = String(raw||"").trim();
  if(!isValidClientId(cid)) return alert("ID invalide.");
  localStorage.setItem(LS_KEY, cid);
  await closeRestore();
  await loadCard();
  alert("Carte restaurée ✅");
}

async function startRestoreScan(){
  const hint = document.getElementById("scanHint");
  const video = document.getElementById("video");
  if(!hint || !video) return;

  if(restoreScanning) return;
  restoreScanning = true;

  try{
    if(!("BarcodeDetector" in window)){
      hint.textContent = "Scanner non supporté ici. Colle l’ID.";
      restoreScanning = false;
      return;
    }

    hint.textContent = "Ouverture caméra…";
    const detector = new BarcodeDetector({formats:["qr_code"]});

    restoreStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    video.srcObject = restoreStream;
    await video.play();
    hint.textContent = "Scan en cours…";

    while(restoreScanning){
      const codes = await detector.detect(video);
      if(codes && codes.length){
        const val = String(codes[0].rawValue || "").trim();
        if(isValidClientId(val)){
          await restoreFromId(val);
          return;
        }
      }
      await sleep(250);
    }
  }catch(e){
    hint.textContent = "Erreur caméra : " + e.message;
    await stopRestoreScan();
  }finally{
    restoreScanning = false;
  }
}

/* ---------- Bind events ---------- */
function bind(){
  setEnvPill();

  const btnCreate = document.getElementById("btnCreate");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnCopy = document.getElementById("btnCopy");
  const btnRestore = document.getElementById("btnRestore");

  const btnClose = document.getElementById("btnClose");
  const btnStartScan = document.getElementById("btnStartScan");
  const btnUseManual = document.getElementById("btnUseManual");

  if(btnCreate) btnCreate.onclick = createCard;
  if(btnRefresh) btnRefresh.onclick = loadCard;
  if(btnCopy) btnCopy.onclick = copyId;

  if(btnRestore) btnRestore.onclick = openRestore;
  if(btnClose) btnClose.onclick = closeRestore;
  if(btnStartScan) btnStartScan.onclick = startRestoreScan;

  if(btnUseManual) btnUseManual.onclick = async ()=>{
    const input = document.getElementById("manualCid");
    await restoreFromId(input ? input.value : "");
  };

  // Close modal if click on backdrop
  const modal = document.getElementById("restoreModal");
  if(modal){
    modal.addEventListener("click", (e)=>{
      if(e.target === modal) closeRestore();
    });
  }

  loadCard();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bind);
}else{
  bind();
}
