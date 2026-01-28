function extractClientIdFromAny(raw){
  // Nettoyage agressif (espaces, retours, caractères invisibles)
  let s = String(raw || "");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width
  s = s.trim();
  if(!s) return "";

  // 0) Si on voit "id=" quelque part, on extrait direct (le plus robuste)
  //    Ex: https://.../client.html?restore=1&id=UUID
  try{
    const mId = s.match(/[?&#]id=([^&#\s]+)/i) || s.match(/\bid=([^&#\s]+)/i);
    if(mId && mId[1]){
      const v = decodeURIComponent(mId[1]);
      if(v) return String(v).trim();
    }
  }catch(_){}

  // 1) URL -> ?id=...
  try{
    if(/^https?:\/\//i.test(s)){
      const u = new URL(s);
      const id = (u.searchParams && u.searchParams.get("id")) ? u.searchParams.get("id") : "";
      if(id) return String(id).trim();
    }
  }catch(_){}

  // 2) JSON -> {cid:"..."} ou {id:"..."}
  try{
    if(s[0] === "{"){
      const o = JSON.parse(s);
      const id = (o && (o.id || o.cid || o.client_id || o.clientId)) ? (o.id || o.cid || o.client_id || o.clientId) : "";
      if(id) return String(id).trim();
    }
  }catch(_){}

  // 3) Fallback : extraire un UUID dans le texte (même si c'est une URL complète)
  const mm = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if(mm && mm[0]) return mm[0];

  // 4) Sinon, renvoie le texte brut
  return s;
}


// PATH: /fidel/admin.js
// CONFIG : URL Worker Cloudflare (ex: https://xxxx.workers.dev). Laisse vide = mode démo local.
const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";

function makeQrSvg(text, size){
  // Supports both legacy `qrcode()` API and the bundled `QRCodeGenerator`.
  size = Number(size || 220);
  const margin = 2;
  const cellSize = 4; // will scale via viewBox if needed

  // --- Preferred: QRCodeGenerator (bundled in qr.min.js)
  try{
    if (typeof window !== "undefined" && typeof window.QRCodeGenerator === "function"){
      // typeNumber=0 => auto
      const q = new window.QRCodeGenerator(0);
      q.addData(String(text));
      q.make();
      // createSvgTag(cellSize, fillColor?) returns <svg ...>
      let svg = q.createSvgTag(cellSize, "#111");
      // Normalize width/height to requested `size`
      svg = svg
        .replace(/width=\"\d+\"/i, 'width="' + size + '"')
        .replace(/height=\"\d+\"/i, 'height="' + size + '"')
        .replace(/<svg/i, '<svg style="display:block;margin:0 auto;"');
      return svg;
    }
  }catch(e){ /* fall through */ }

  // --- Fallback: qrcode(typeNumber, errorCorrectionLevel)
  try{
    if (typeof window !== "undefined" && typeof window.qrcode === "function"){
      const qr = window.qrcode(0, "M");
      qr.addData(String(text));
      qr.make();
      // createSvgTag(cellSize, margin)
      const svg = qr.createSvgTag(Math.max(1, Math.floor(size / (qr.getModuleCount() + margin*2))), margin);
      return svg;
    }
  }catch(e){ /* fall through */ }

  throw new Error("QR library not available");
}

function isValidClientId(id) {
  if (!id) return false;
  const s = String(id).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)) return true;
  return s.length >= 8;
}

function extractClientIdFromAny(text) {
  if (!text) return "";
  const t = String(text).trim();
  if (isValidClientId(t)) return t;
  const m = t.match(/(?:adn66:loyalty:|cid:)([0-9a-zA-Z-]{8,})/i);
  if (m) return m[1];
  try {
    const u = new URL(t);
    const id = u.searchParams.get("id") || u.searchParams.get("client_id");
    if (id && isValidClientId(id)) return id;
  } catch {}
  return "";
}

const ADMIN_LS = "adn66_loyalty_admin_key";

function normalizePhone(raw){ return (raw||"").replace(/[^0-9+]/g,"").trim(); }
function setEnvPill(){ document.getElementById("envPill").innerHTML = "Mode : <b>" + (API_BASE ? "Serveur" : "Démo") + "</b>"; }
setEnvPill();

function setApiState(ok, msg){
  const dot = document.getElementById("dot");
  dot.classList.remove("ok","warn","bad");
  dot.classList.add(ok ? "ok" : "warn");
  document.getElementById("apiState").textContent = msg || (ok ? "OK" : "Erreur");
}

async function api(path, opts={}){
  const url = API_BASE + path;
  const res = await fetch(url, { headers: {"content-type":"application/json"}, ...opts });
  const ct = res.headers.get("content-type")||"";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if(!res.ok) throw new Error((data && data.error) ? data.error : ("HTTP "+res.status));
  return data;
}

function qrRender(payload){
  const host = document.getElementById("qrSvg");
  if(!host) return;

  // payload = string (URL) ou objet -> JSON
  const text = (typeof payload === "string") ? payload : JSON.stringify(payload);

  host.innerHTML = "";

  // Wrapper = vraie bordure blanche (quiet zone visuelle)
  const wrap = document.createElement("div");
  wrap.style.background = "#fff";
  wrap.style.padding = "18px";
  wrap.style.borderRadius = "18px";
  wrap.style.display = "inline-block";
  wrap.style.boxShadow = "0 12px 30px rgba(0,0,0,.25)";
  host.appendChild(wrap);

  try{
    if(typeof window.QRCode !== "function"){
      wrap.textContent = "QR indisponible";
      return;
    }
    // qrcodejs génère canvas/img dans wrap
    new QRCode(wrap, {
      text: String(text || ""),
      width: 260,
      height: 260,
      correctLevel: QRCode.CorrectLevel.M
    });
  }catch(e){
    wrap.textContent = "QR indisponible";
  }
}

const video = document.getElementById("video");
const scanHint = document.getElementById("scanHint");
let stream = null;
let scanning = false;

async function startScan(){
  if(scanning) return;
  scanning = true;
  scanHint.textContent = "Ouverture caméra…";

  // Toujours viser la caméra arrière
  const constraints = { video: { facingMode: { ideal: "environment" } }, audio: false };

  // Helper: extraire un clientId depuis n'importe quel contenu (URL, JSON, texte)
  const pickCid = (raw) => {
    const cid = extractClientIdFromAny(raw);
    return cid || "";
  };

  try{
    // 1) Option rapide si supporté : BarcodeDetector (Chrome récent)
    if("BarcodeDetector" in window){
      const detector = new BarcodeDetector({formats:["qr_code"]});
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();
      scanHint.textContent = "Scan en cours…";
      while(scanning){
        const barcodes = await detector.detect(video);
        if(barcodes && barcodes.length){
          const val = barcodes[0].rawValue || "";
          const cid = pickCid(val);
          if(cid){
            document.getElementById("clientId").value = cid;
            scanHint.textContent = "QR détecté ✅";
            await stopScan();
            return;
          }
        }
        await new Promise(r=>setTimeout(r,200));
      }
      return;
    }

    // 2) Fallback robuste : ZXing (@zxing/browser) via script UMD
    if(!(window.ZXing && window.ZXing.BrowserQRCodeReader)){
      scanHint.textContent = "Scan non supporté (ZXing manquant).";
      scanning = false;
      return;
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();

    scanHint.textContent = "Scan en cours…";

    const codeReader = new window.ZXing.BrowserQRCodeReader();
    // decodeFromVideoElementContinuously appelle un callback à chaque lecture
    await codeReader.decodeFromVideoElementContinuously(video, (result, err) => {
      if(!scanning) return;
      if(result && result.getText){
        const txt = result.getText();
        const cid = pickCid(txt);
        if(cid){
          document.getElementById("clientId").value = cid;
          scanHint.textContent = "QR détecté ✅";
          stopScan();
        }
      }
    });

  }catch(e){
    scanHint.textContent = "Erreur caméra: " + (e && e.message ? e.message : String(e));
    scanning = false;
    try{ await stopScan(); }catch(_){}
  }
}

async function stopScan(){
  scanning = false;
  try{ video.pause(); }catch(_){}
  if(stream){
    try{ stream.getTracks().forEach(t=>t.stop()); }catch(_){}
    stream = null;
  }
  video.srcObject = null;
  scanHint.textContent = "Arrêt.";
}

function maskPhone(phone){
  phone = (phone||"").replace(/\\s+/g,"");
  if(phone.length < 6) return phone;
  return phone.slice(0,2) + " ** ** " + phone.slice(-2);
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

function demoSearchByPhone(phone){
  const results = [];
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if(k && k.startsWith("adn66_demo_profile_c_")){
      const cid = k.replace("adn66_demo_profile_","");
      const p = JSON.parse(localStorage.getItem(k) || "null");
      if(p && normalizePhone(p.phone) === phone){
        const s = JSON.parse(localStorage.getItem("adn66_demo_state_"+cid) || "{}");
        results.push({client_id: cid, name: p.name, phone: p.phone, points: s.points||0, completed_at: s.completed_at||null});
      }
    }
  }
  return results;
}

function renderResults(items){
  const host = document.getElementById("results");
  if(!items || !items.length){ host.innerHTML = "<div class='hint'>Aucun résultat.</div>"; return; }
  let html = "<table><thead><tr><th>Prénom</th><th>Téléphone</th><th>Points</th><th>Action</th></tr></thead><tbody>";
  for(const it of items){
    html += "<tr>";
    html += "<td><b>"+escapeHtml(it.name||"—")+"</b></td>";
    html += "<td class='mono'>"+escapeHtml(maskPhone(it.phone||""))+"</td>";
    html += "<td>"+Number(it.points||0)+"</td>";
    html += "<td><button class='secondary' data-cid='"+escapeHtml(it.client_id)+"'>Afficher QR</button></td>";
    html += "</tr>";
  }
  html += "</tbody></table>";
  host.innerHTML = html;
  host.querySelectorAll("button[data-cid]").forEach(btn=>{
    btn.addEventListener("click", ()=>showRecoveryQr(btn.getAttribute("data-cid")));
  });
}

function showRecoveryQr(cid){
  // QR de récupération :
  // ✅ Le QR DOIT contenir uniquement l'ID (UUID/ULID/etc.)
  // (l'URL reste affichée à l'écran pour copie si besoin)
  const id = String(cid || "").trim();

  // page client (affichage seulement)
  const restoreUrl = (location.origin || "") + "/fidel/client.html?restore=1&id=" + encodeURIComponent(id);

  document.getElementById("qrSub").textContent =
    "ID (QR) : " + id + "  —  URL (copie) : " + restoreUrl;

  // QR = ID uniquement
  qrRender(id);
  document.getElementById("qrFull").classList.add("open");
}

async function stamp(){
  const key = (document.getElementById("adminKey").value||"").trim();
  const cid = (document.getElementById("clientId").value||"").trim();
  if(!key) return alert("Clé admin manquante");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cid)) return alert("ID client invalide");

  localStorage.setItem(ADMIN_LS, key);
  document.getElementById("who").textContent = "PIN: " + key;

  if(!API_BASE){
    const stKey = "adn66_demo_state_"+cid;
    const state = JSON.parse(localStorage.getItem(stKey) || '{"points":0,"completed_at":null}');
    if(state.points >= 8 && state.completed_at){
      alert("Carte déjà complétée. Attendre le reset auto.");
      return;
    }
    state.points = (state.points||0) + 1;
    if(state.points >= 8){
      state.points = 8;
      state.completed_at = new Date().toISOString();
      alert("8/8 ✅ Récompense à donner maintenant. Reset auto dans 24h (démo).");
    }else{
      alert("Point ajouté ✅ ("+state.points+"/8)");
    }
    localStorage.setItem(stKey, JSON.stringify(state));
    setApiState(true, "Démo locale");
    return;
  }

  try{
    const r = await api("/loyalty/stamp", {method:"POST", body: JSON.stringify({admin_key:key, client_id:cid})});
    setApiState(true, "Validé ✅");
    alert("OK ✅ Points: " + (r.points ?? "?"));
  }catch(e){
    setApiState(false, "Erreur");
    alert("Erreur: " + e.message);
  }
}

async function search(){
  const key = (document.getElementById("adminKey").value||"").trim();
  const phone = normalizePhone(document.getElementById("searchPhone").value);
  if(!key) return alert("Clé admin manquante");
  if(!phone || phone.length < 10) return alert("Téléphone invalide");
  localStorage.setItem(ADMIN_LS, key);

  if(!API_BASE){
    const items = demoSearchByPhone(phone);
    renderResults(items);
    setApiState(true, "Démo locale");
    return;
  }

  try{
    const items = await api("/admin/loyalty/search?phone="+encodeURIComponent(phone)+"&admin_key="+encodeURIComponent(key), {method:"GET"});
    renderResults(items.found && items.client ? [items.client] : (items.results || []));
    setApiState(true, "OK");
  }catch(e){
    setApiState(false, "Erreur");
    alert("Erreur recherche: " + e.message);
  }
}

function clearResults(){
  document.getElementById("results").innerHTML = "";
  document.getElementById("searchPhone").value = "";
}

document.getElementById("btnScan").addEventListener("click", startScan);
document.getElementById("btnStop").addEventListener("click", stopScan);
document.getElementById("btnStamp").addEventListener("click", stamp);
document.getElementById("btnSearch").addEventListener("click", search);
document.getElementById("btnClear").addEventListener("click", clearResults);
document.getElementById("btnCloseQr").addEventListener("click", ()=>document.getElementById("qrFull").classList.remove("open"));
document.getElementById("btnCopy").addEventListener("click", ()=>{
  const cid = (document.getElementById("clientId").value||"").trim();
  if(!cid) return;
  navigator.clipboard?.writeText(cid).then(()=>alert("ID copié")).catch(()=>alert(cid));
});

const saved = localStorage.getItem(ADMIN_LS);
if(saved){
  document.getElementById("adminKey").value = saved;
  document.getElementById("who").textContent = "PIN: " + saved;
}
setApiState(true, API_BASE ? "Serveur" : "Démo locale");
