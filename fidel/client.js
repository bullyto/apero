// PATH: /fidel/client.js

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
  if(/^c_[a-zA-Z0-9_-]{10,}$/.test(s)) return true;
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) return true; // ULID
  return false;
}

/* ---------- UI helpers ---------- */
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
        st.textContent = "🎉 Carte complétée (reset dans " + h + "h " + m + "min)";
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

/* ---------- QR (FIX) ---------- */
function qrRender(text){
  const box = document.getElementById("qrSvg");
  if(!box) return;
  try{
    if(typeof QRCodeGenerator !== "function") throw new Error("QRCodeGenerator missing");
    const q = new QRCodeGenerator(0);
    q.addData(String(text));
    q.make();
    // qr.min.js: createSvgTag(cellSize, fillColor)
    const svg = q.createSvgTag(4, "#111");
    box.innerHTML = svg;
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

/* ---------- LOAD CARD ---------- */
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
    setMeta(null);
    return;
  }

  setCardVisible(true);
  setMeta(cid);

  try{
    const res = await api("/loyalty/me?client_id=" + encodeURIComponent(cid) + "&t=" + Date.now(), {method:"GET"});
    const card = res.card || res; // tolérance
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

/* ---------- CREATE ---------- */
async function createCard(){
  const nameEl = document.getElementById("name");
  const phoneEl = document.getElementById("phone");
  const name = normalizeName(nameEl ? nameEl.value : "");
  const phone = normalizePhone(phoneEl ? phoneEl.value : "");
  if(!name) return alert("Entre ton prénom.");
  if(!phone || phone.length < 10) return alert("Entre un numéro valide.");

  try{
    const r = await api("/loyalty/register", {method:"POST", body: JSON.stringify({name, phone})});
    if(r && r.client_id){
      localStorage.setItem(LS_KEY, r.client_id);
      await loadCard();
    }else{
      alert("Erreur: réponse invalide.");
    }
  }catch(e){
    alert("Erreur création carte: " + e.message);
  }
}

function copyId(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid) return;
  navigator.clipboard?.writeText(cid).then(()=>alert("ID copié")).catch(()=>alert(cid));
}

/* ---------- RESTORE modal ---------- */
const modal = document.getElementById("restoreModal");
const video = document.getElementById("video");
const scanHint = document.getElementById("scanHint");
let stream = null;
let scanning = false;

function openRestore(){
  if(!modal) return;
  modal.classList.add("open");
  if(scanHint) scanHint.textContent = "";
}

async function stopScan(){
  scanning = false;
  try{ if(video) video.pause(); }catch(_){}
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
  if(video) video.srcObject = null;
}

async function closeRestore(){
  if(!modal) return;
  modal.classList.remove("open");
  await stopScan();
}

async function startScan(){
  if(!scanHint) return;
  if(scanning) return;
  scanning = true;
  scanHint.textContent = "Ouverture caméra…";

  try{
    if(!("BarcodeDetector" in window)){
      scanHint.textContent = "Scanner non supporté ici. Colle l’ID manuellement.";
      scanning = false;
      return;
    }
    const detector = new BarcodeDetector({formats:["qr_code"]});
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    if(!video) throw new Error("video missing");
    video.srcObject = stream;
    await video.play();
    scanHint.textContent = "Scan en cours…";

    while(scanning){
      const barcodes = await detector.detect(video);
      if(barcodes && barcodes.length){
        const val = String(barcodes[0].rawValue || "").trim();
        const cid = isValidClientId(val) ? val : "";
        if(cid){
          localStorage.setItem(LS_KEY, cid);
          await closeRestore();
          await loadCard();
          alert("Carte restaurée ✅");
          return;
        }
      }
      await sleep(250);
    }
  }catch(e){
    scanHint.textContent = "Erreur caméra: " + e.message;
    await stopScan();
  }finally{
    scanning = false;
  }
}

/* ---------- Bind events safely ---------- */
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
  if(btnStartScan) btnStartScan.onclick = startScan;

  if(btnUseManual) btnUseManual.onclick = async ()=>{
    const input = document.getElementById("manualCid");
    const cid = String(input ? input.value : "").trim();
    if(!isValidClientId(cid)) return alert("ID invalide.");
    localStorage.setItem(LS_KEY, cid);
    await closeRestore();
    await loadCard();
    alert("Carte restaurée ✅");
  };

  loadCard();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", bind);
}else{
  bind();
}
