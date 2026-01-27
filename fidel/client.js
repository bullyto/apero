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
  if(/^c_[a-zA-Z0-9_-]{10,}$/.test(cid)) return true;
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) return true;
  return false;
}

/* ---------- UI ---------- */
function setEnvPill(){
  const pill = document.getElementById("envPill");
  pill.innerHTML = "Mode : <b>" + (API_BASE ? "Serveur" : "Démo") + "</b>";
}
setEnvPill();

function setCardVisible(v){
  document.getElementById("formBlock").style.display = v ? "none" : "block";
  document.getElementById("cardBlock").style.display = v ? "block" : "none";
}

function setMeta(cid){
  document.getElementById("meta").textContent = cid ? "ID: " + cid : "—";
  document.getElementById("cidText").textContent = cid || "—";
  if(cid) qrRender(cid);
}

function setApiState(ok, msg){
  const dot = document.getElementById("dot");
  dot.className = "dot " + (ok ? "ok" : "warn");
  document.getElementById("apiState").textContent = msg;
}

function setStateText(points, completedAt){
  const st = document.getElementById("stateText");
  if(points >= GOAL){
    if(completedAt){
      const end = new Date(new Date(completedAt).getTime() + RESET_HOURS*3600*1000);
      const ms = end - Date.now();
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
    const slot = Number(el.dataset.slot);
    el.classList.toggle("filled", slot <= safe);
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
    box.innerHTML = q.createSvgTag(4, "#111");
  }catch(_){
    box.innerHTML = "QR indisponible";
  }
}
}}

/* ---------- API ---------- */
async function api(path, opts={}){
  const res = await fetch(API_BASE + path, {
    headers: {"content-type":"application/json"},
    ...opts
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || "API error");
  return data;
}

/* ---------- LOAD CARD ---------- */
async function loadCard(){
  const cid = localStorage.getItem(LS_KEY);
  if(!cid){
    setCardVisible(false);
    document.getElementById("points").textContent = "0";
    document.getElementById("goal").textContent = GOAL;
    renderVisualStamps(0);
    setStateText(0, null);
    return;
  }

  setCardVisible(true);
  setMeta(cid);

  try{
    const res = await api(`/loyalty/me?client_id=${encodeURIComponent(cid)}`);
    const card = res.card; // 🔥 CORRECTION ICI

    const points = Number(card.points || 0);
    const goal = Number(card.goal || GOAL);

    document.getElementById("points").textContent = points;
    document.getElementById("goal").textContent = goal;

    renderVisualStamps(points);
    setStateText(points, card.completed_at || null);
    setApiState(true, "Synchronisé");
  }catch(e){
    setApiState(false, "Hors ligne");
  }
}

/* ---------- CREATE ---------- */
async function createCard(){
  const name = normalizeName(document.getElementById("name").value);
  const phone = normalizePhone(document.getElementById("phone").value);
  if(!name || phone.length < 10) return alert("Infos invalides");

  const r = await api("/loyalty/register", {
    method:"POST",
    body: JSON.stringify({name, phone})
  });

  localStorage.setItem(LS_KEY, r.client_id);
  await loadCard();
}

/* ---------- EVENTS ---------- */
document.getElementById("btnCreate").onclick = createCard;
document.getElementById("btnRefresh").onclick = loadCard;
document.getElementById("btnCopy").onclick = ()=>{
  const cid = localStorage.getItem(LS_KEY);
  navigator.clipboard.writeText(cid);
};

loadCard();
