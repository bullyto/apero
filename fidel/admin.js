// PATH: /fidel/admin.js
// CONFIG : URL Worker Cloudflare (ex: https://xxxx.workers.dev). Laisse vide = mode démo local.
const API_BASE = "";
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
    const q = new window.QRCodeGenerator(null);
    q.addData(text);
    q.make();
    document.getElementById("qrSvg").innerHTML = q.createSvgTag(7, "#000");
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
        catch(_){ cid = val.startsWith("c_") ? val : null; }
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

function showRecoveryQr(cid){
  document.getElementById("qrSub").textContent = "ID: " + cid + " — le client doit scanner ce QR pour restaurer.";
  qrRender({cid});
  document.getElementById("qrFull").classList.add("open");
}

async function stamp(){
  const key = (document.getElementById("adminKey").value||"").trim();
  const cid = (document.getElementById("clientId").value||"").trim();
  if(!key) return alert("Clé admin manquante");
  if(!cid.startsWith("c_")) return alert("ID client invalide");

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
    const items = await api("/admin/loyalty/search?phone="+encodeURIComponent(phone)+"&key="+encodeURIComponent(key), {method:"GET"});
    renderResults(items.results || []);
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
