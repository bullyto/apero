// PATH: /fidel/client.js
// CONFIG : URL Worker Cloudflare (ex: https://xxxx.workers.dev). Laisse vide = mode démo local.
const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";

function makeQrSvg(text, cellSize = 4, margin = 2) {
  if (!window.qrcode) throw new Error("qrcode lib missing");
  const qr = window.qrcode(0, "M");
  qr.addData(String(text));
  qr.make();
  return qr.createSvgTag(cellSize, margin);
}

function isValidClientId(id) {
  if (!id) return false;
  const s = String(id).trim();
  // UUID v4/v1 or generic UUID-like
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // ULID or other compact ids
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) return true;
  return s.length >= 8; // fallback minimal
}

function extractClientIdFromAny(text) {
  if (!text) return "";
  const t = String(text).trim();
  // accept raw UUID/ULID
  if (isValidClientId(t)) return t;
  // accept prefixes like "adn66:loyalty:<id>" or "cid:<id>"
  const m = t.match(/(?:adn66:loyalty:|cid:)([0-9a-zA-Z-]{8,})/i);
  if (m) return m[1];
  // accept URL with ?id=
  try {
    const u = new URL(t);
    const id = u.searchParams.get("id") || u.searchParams.get("client_id");
    if (id && isValidClientId(id)) return id;
  } catch {}
  return "";
}


// Règles fidélité
const GOAL = 8;

function isValidClientId(cid){
  if(!cid) return false;
  // Accept legacy format: c_ + 26 chars (base32/ulid-like)
  if(/^c_[a-zA-Z0-9_-]{10,}$/.test(cid)) return true;
  // Accept UUID (v4/v1 etc) 36 chars with hyphens
  if(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cid)) return true;
  return false;
}
const RESET_HOURS = 24;
const LS_KEY = "adn66_loyalty_client_id";

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function normalizePhone(raw){ return (raw||"").replace(/[^0-9+]/g,"").trim(); }
function normalizeName(raw){ return (raw||"").trim().slice(0,40); }

function makeDemoClientId(){
  const rnd = () => Math.floor(Math.random()*36).toString(36);
  let s="c_"; for(let i=0;i<22;i++) s+=rnd();
  return s;
}

function setEnvPill(){
  const pill = document.getElementById("envPill");
  pill.innerHTML = "Mode : <b>" + (API_BASE ? "Serveur" : "Démo") + "</b>";
}
setEnvPill();

function qrRender(obj){
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  try{
    const q = null;
    q.addData(text);
    q.make();
    document.getElementById("qrSvg").innerHTML = q.createSvgTag(4, 2);
  }catch(e){
    document.getElementById("qrSvg").innerHTML = "<div style='padding:10px;color:#000;font-family:monospace'>QR indisponible</div>";
  }
}

function setCardVisible(visible){
  document.getElementById("formBlock").style.display = visible ? "none" : "block";
  document.getElementById("cardBlock").style.display = visible ? "block" : "none";
}

function setMeta(cid){
  document.getElementById("meta").textContent = cid ? ("ID: " + cid) : "—";
  document.getElementById("cidText").textContent = cid || "—";
  if(cid) qrRender(cid);
}

function setApiState(ok, msg){
  const dot = document.getElementById("dot");
  const txt = document.getElementById("apiState");
  dot.classList.remove("ok","warn","bad");
  dot.classList.add(ok ? "ok" : "warn");
  txt.textContent = msg || (ok ? "Synchronisé" : "Hors ligne");
}

function setStateText(points, completedAtIso){
  const st = document.getElementById("stateText");
  if(points >= GOAL){
    if(completedAtIso){
      const end = new Date(new Date(completedAtIso).getTime() + RESET_HOURS*3600*1000);
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
    const slot = Number(el.getAttribute("data-slot") || "0");
    el.classList.toggle("filled", slot <= safe);
  });
}

async function api(path, opts={}){
  const url = API_BASE + path;
  const res = await fetch(url, { headers: {"content-type":"application/json"}, ...opts });
  const ct = res.headers.get("content-type")||"";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if(!res.ok) throw new Error((data && data.error) ? data.error : ("HTTP " + res.status));
  return data;
}

async function loadCard(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid){
    setCardVisible(false);
    setMeta(null);
    document.getElementById("points").textContent = "0";
    document.getElementById("goal").textContent = String(GOAL);
    renderVisualStamps(0);
    setStateText(0, null);
    return;
  }

  setMeta(cid);
  setCardVisible(true);

  if(!API_BASE){
    const demo = JSON.parse(localStorage.getItem("adn66_demo_state_"+cid) || '{"points":0,"completed_at":null}');
    const points = Number(demo.points||0);
    document.getElementById("points").textContent = String(points);
    document.getElementById("goal").textContent = String(GOAL);
    renderVisualStamps(points);
    setStateText(points, demo.completed_at);
    setApiState(true, "Démo locale");
    return;
  }

  try{
    const me = await api("/loyalty/me?client_id="+encodeURIComponent(cid)+"&t="+Date.now(), {method:"GET"});
    const points = Number(me.points||0);
    document.getElementById("points").textContent = String(points);
    document.getElementById("goal").textContent = String(me.goal || GOAL);
    renderVisualStamps(points);
    setStateText(points, me.completed_at || null);
    setApiState(true, "Synchronisé");
  }catch(e){
    setApiState(false, "Hors ligne");
  }
}

async function createCard(){
  const name = normalizeName(document.getElementById("name").value);
  const phone = normalizePhone(document.getElementById("phone").value);
  if(!name){ alert("Entre ton prénom."); return; }
  if(!phone || phone.length < 10){ alert("Entre un numéro valide."); return; }

  if(!API_BASE){
    const cid = makeDemoClientId();
    localStorage.setItem(LS_KEY, cid);
    localStorage.setItem("adn66_demo_profile_"+cid, JSON.stringify({name, phone}));
    localStorage.setItem("adn66_demo_state_"+cid, JSON.stringify({points:0, completed_at:null}));
    await loadCard();
    return;
  }

  try{
    const r = await api("/loyalty/register", {method:"POST", body: JSON.stringify({name, phone})});
    localStorage.setItem(LS_KEY, r.client_id);
    await loadCard();
  }catch(e){
    alert("Erreur création carte: " + e.message);
  }
}

function copyId(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid) return;
  navigator.clipboard?.writeText(cid).then(()=>alert("ID copié")).catch(()=>alert(cid));
}

/* RESTORE modal */
const modal = document.getElementById("restoreModal");
const video = document.getElementById("video");
const scanHint = document.getElementById("scanHint");
let stream = null;
let scanning = false;

async function openRestore(){ modal.classList.add("open"); scanHint.textContent = ""; }
async function closeRestore(){ modal.classList.remove("open"); await stopScan(); }

async function startScan(){
  if(scanning) return;
  scanning = true;
  scanHint.textContent = "Ouverture caméra…";
  try{
    if(!("BarcodeDetector" in window)){
      scanHint.textContent = "Scanner non supporté ici. Colle l’ID manuellement.";
      scanning = false; return;
    }
    const detector = new BarcodeDetector({formats:["qr_code"]});
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    video.srcObject = stream;
    await video.play();
    scanHint.textContent = "Scan en cours…";
    while(scanning){
      const barcodes = await detector.detect(video);
      if(barcodes && barcodes.length){
        const val = barcodes[0].rawValue || "";
        let cid = null;
        try{ const obj = JSON.parse(val); cid = obj.cid || obj.client_id || null; }
        catch(_){ cid = val.startsWith("c_") ? val : null; }
        if(cid){
          localStorage.setItem(LS_KEY, cid);
          scanning = false;
          await stopScan();
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
    scanning = false;
    await stopScan();
  }
}

async function stopScan(){
  scanning = false;
  try{ video.pause(); }catch(_){}
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
  video.srcObject = null;
}

document.getElementById("btnCreate").addEventListener("click", createCard);
document.getElementById("btnRefresh").addEventListener("click", loadCard);
document.getElementById("btnCopy").addEventListener("click", copyId);
document.getElementById("btnRestore").addEventListener("click", openRestore);
document.getElementById("btnClose").addEventListener("click", closeRestore);
document.getElementById("btnStartScan").addEventListener("click", startScan);
document.getElementById("btnUseManual").addEventListener("click", async ()=>{
  const cid = (document.getElementById("manualCid").value||"").trim();
  if(!cid.startsWith("c_")){ alert("ID invalide.");; return; }
  localStorage.setItem(LS_KEY, cid);
  await closeRestore();
  await loadCard();
});

loadCard();
