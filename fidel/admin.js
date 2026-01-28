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

function qrRender(obj){
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  try{
    const q = window.QRCodeGenerator(0, 'M');
    q.addData(text);
    q.make();
    document.getElementById("qrSvg").innerHTML = q.createSvgTag(7, 2);
  }catch(e){
    document.getElementById("qrSvg").textContent = "QR indisponible";
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
  try{
    if(!("BarcodeDetector" in window)){
      scanHint.textContent = "BarcodeDetector non supporté. Tape l’ID manuellement.";
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
        catch(_){
          const v = (val||"").trim();
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
          cid = isUuid ? v : null;
        }
        if(cid){
          document.getElementById("clientId").value = cid;
          scanHint.textContent = "QR détecté ✅";
          return;
        }
      }
      await new Promise(r=>setTimeout(r,250));
    }
  }catch(e){
    scanHint.textContent = "Erreur caméra: " + e.message;
  }
}

async function stopScan(){
  scanning = false;
  try{ video.pause(); }catch(_){}
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
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

function showRecoveryQr(clientId){
  // QR de récupération = URL http(s) cliquable + scannable
  // Le client scanne → ouvre la page client qui restaure automatiquement.
  const id = String(clientId || "").trim();
  if(!id){
    toast("ID manquant", "warn");
    return;
  }

  // URL de restauration (client)
  // ⚠️ adapte si tu changes la route : /fidel/client.html
  const base = (location.origin || "") + "/fidel/client.html";
  const restoreUrl = base + "?restore=1&id=" + encodeURIComponent(id);

  // UI popup existante
  openModal(`
    <div class="modalHead">
      <div class="modalTitle">QR de récupération</div>
      <button class="btn btnGhost" id="btnCloseModal">Fermer</button>
    </div>
    <div class="modalBody">
      <div class="muted">Le client doit scanner ce QR pour restaurer sa carte.</div>
      <div class="qrBox" style="margin-top:12px; display:flex; justify-content:center;">
        <img id="recoveryQrImg" alt="QR récupération" style="width:260px;height:260px;border-radius:18px;background:#fff;padding:14px;box-shadow:0 12px 30px rgba(0,0,0,.25);" />
      </div>
      <div class="muted" style="margin-top:10px;word-break:break-all;">
        <strong>URL :</strong> <span id="recoveryUrlText"></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="btn" id="btnCopyRecoveryUrl">Copier URL</button>
        <a class="btn btnGhost" id="btnOpenRecoveryUrl" target="_blank" rel="noopener">Ouvrir</a>
      </div>
      <div class="muted" style="margin-top:10px;">
        ID : ${escapeHtml(id)}
      </div>
    </div>
  `);

  const closeBtn = document.getElementById("btnCloseModal");
  if(closeBtn) closeBtn.addEventListener("click", closeModal);

  const urlText = document.getElementById("recoveryUrlText");
  if(urlText) urlText.textContent = restoreUrl;

  const openA = document.getElementById("btnOpenRecoveryUrl");
  if(openA) openA.href = restoreUrl;

  const img = document.getElementById("recoveryQrImg");
  if(img){
    // Service QR externe fiable (pas de librairie JS, pas de qr.min.js)
    // margin large -> bordure blanche
    const qrApi = "https://api.qrserver.com/v1/create-qr-code/";
    img.src = qrApi + "?size=260x260&margin=18&data=" + encodeURIComponent(restoreUrl);
  }

  const copyBtn = document.getElementById("btnCopyRecoveryUrl");
  if(copyBtn){
    copyBtn.addEventListener("click", async () => {
      try{
        await navigator.clipboard.writeText(restoreUrl);
        toast("URL copiée", "ok");
      }catch(e){
        toast("Copie impossible", "warn");
      }
    });
  }
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
