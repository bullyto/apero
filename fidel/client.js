// ---- EMBEDDED QR LIB FALLBACK ----
(function(){
  try{
    if(typeof window !== "undefined" && typeof window.QRCodeGenerator === "function") return;
  }catch(e){}
/*! qrcode-generator (MIT) - Kazuhiko Arase - trimmed build */
(function(g){function Q(a){this.typeNumber=a;this.errorCorrectLevel=1;this.modules=null;this.moduleCount=0;this.dataCache=null;this.dataList=[]}Q.prototype={addData:function(a){var b=new R(a);this.dataList.push(b);this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw Error(a+","+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){if(null==this.typeNumber){for(var a=1;40>=a;a++){for(var b=T.getRSBlocks(a,this.errorCorrectLevel),c=new S,d=0;d<b.length;d++)c.put(b[d].dataCount,8);for(d=0;d<this.dataList.length;d++){var e=this.dataList[d];c.put(e.mode,4);c.put(e.getLength(),U.getLengthInBits(e.mode,a));e.write(c)}d=c.getLengthInBits();e=0;for(var f=0;f<b.length;f++)e+=8*b[f].totalCount;if(d<=e)break}this.typeNumber=a}this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,b){this.moduleCount=4*this.typeNumber+17;this.modules=new Array(this.moduleCount);for(var c=0;c<this.moduleCount;c++){this.modules[c]=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++)this.modules[c][d]=null}this.setupPositionProbePattern(0,0);this.setupPositionProbePattern(this.moduleCount-7,0);this.setupPositionProbePattern(0,this.moduleCount-7);this.setupPositionAdjustPattern();this.setupTimingPattern();this.setupTypeInfo(a,b);1<this.typeNumber&&this.setupTypeNumber(a);null==this.dataCache&&(this.dataCache=Q.createData(this.typeNumber,this.errorCorrectLevel,this.dataList));this.mapData(this.dataCache,b)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(0>a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)0>b+d||this.moduleCount<=b+d||(0<=c&&6>=c&&(0==d||6==d)||0<=d&&6>=d&&(0==c||6==c)||2<=c&&4>=c&&2<=d&&4>=d?this.modules[a+c][b+d]=!0:this.modules[a+c][b+d]=!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=V.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(a=8;a<this.moduleCount-8;a++)null==this.modules[6][a]&&(this.modules[6][a]=0==a%2)},setupPositionAdjustPattern:function(){for(var a=T.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var f=-2;2>=f;f++)for(var h=-2;2>=h;h++)this.modules[d+f][e+h]=(-2==f||2==f||-2==h||2==h||0==f&&0==h)?!0:!1}},setupTypeNumber:function(a){for(var b=V.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(b>>c&1);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d;this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,c=V.getBCHTypeInfo(c),d=0;15>d;d++){var e=!a&&1==(c>>d&1);6>d?this.modules[d][8]=e:8>d?this.modules[d+1][8]=e:this.modules[this.moduleCount-15+d][8]=e}for(d=0;15>d;d++)e=!a&&1==(c>>d&1),8>d?this.modules[8][this.moduleCount-d-1]=e:9>d?this.modules[8][15-d-1+1]=e:this.modules[8][15-d-1]=e;this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,f=0,h=this.moduleCount-1;0<h;h-=2)for(6==h&&h--;0<=d;){for(var k=0;2>k;k++)if(null==this.modules[d][h-k]){var l=!1;f<a.length&&(l=1==(a[f]>>>e&1));var m=V.getMask(b,d,h-k);this.modules[d][h-k]=m?!l:l;e--;0>e&&(f++,e=7)}d+=c;0>d||this.moduleCount<=d&&(d-=c,c=-c,break)}},createSvgTag:function(a,b){a=a||2;b=b||"#000";var c=this.getModuleCount(),d=c*a,e=['<svg xmlns="http://www.w3.org/2000/svg" width="'+d+'" height="'+d+'" viewBox="0 0 '+d+" "+d+'">'];e.push('<rect width="100%" height="100%" fill="#fff"/>');for(var f=0;f<c;f++)for(var h=0;h<c;h++)this.isDark(f,h)&&e.push('<rect x="'+h*a+'" y="'+f*a+'" width="'+a+'" height="'+a+'" fill="'+b+'"/>');e.push("</svg>");return e.join("")}};Q.createData=function(a,b,c){for(var d=T.getRSBlocks(a,b),e=new S,f=0;f<c.length;f++){var h=c[f];e.put(h.mode,4);e.put(h.getLength(),U.getLengthInBits(h.mode,a));h.write(e)}for(f=0;f<d.length;f++)a=d[f].dataCount*8;f=e.getLengthInBits();for(h=0;h<d.length;h++)f<=d[h].totalCount*8&&(a=d[h].totalCount*8,0);if(f>a)throw Error("code length overflow. ("+f+">"+a+")");for(f=0;f+4<=a&&0==e.getBitLength()%8;)e.put(0,4);for(;0!=e.getBitLength()%8;)e.putBit(!1);for(;e.getBitLength()<a;)e.put(236,8),e.getBitLength()<a&&e.put(17,8);return W.createBytes(e,d)};function R(a){this.mode=4;this.data=a}R.prototype={getLength:function(){return this.data.length},write:function(a){for(var b=0;b<this.data.length;b++){var c=this.data.charCodeAt(b);128>c?a.put(c,8):2048>c?(a.put(192|c>>6,8),a.put(128|c&63,8)):(a.put(224|c>>12,8),a.put(128|c>>6&63,8),a.put(128|c&63,8))}}};function S(){this.buffer=[];this.length=0}S.prototype={get:function(a){return 1==(this.buffer[Math.floor(a/8)]>>>7-a%8&1)},put:function(a,b){for(var c=0;c<b;c++)this.putBit(1==(a>>>b-c-1&1))},getLengthInBits:function(){return this.length},getBitLength:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0);a&&(this.buffer[b]|=128>>>this.length%8);this.length++}};var U={getLengthInBits:function(a,b){return 1<=b&&9>=b?8:10<=b&&26>=b?16:16}};var T={getPatternPosition:function(a){if(1==a)return[];var b=a/7+2,c=Math.ceil((a*4+10)/(b*2-2))*2,d=[6],e=a*4+10;for(a=1;a<b-1;a++)d.push(e-c*(b-2-a));d.push(e);return d},getRSBlocks:function(a,b){var c=X[a][b],d=[];for(a=0;a<c.length;a+=3)for(var e=c[a],f=c[a+1],h=c[a+2],k=0;k<e;k++)d.push(new Y(f,h));return d}};function Y(a,b){this.totalCount=a;this.dataCount=b}var X={};X[1]={1:[1,26,19]};X[2]={1:[1,44,34]};X[3]={1:[1,70,55]};X[4]={1:[1,100,80]};X[5]={1:[1,134,108]};X[6]={1:[2,86,68]};X[7]={1:[2,98,78]};X[8]={1:[2,121,97]};X[9]={1:[2,146,116]};X[10]={1:[2,174,138]};X[11]={1:[4,101,81]};X[12]={1:[2,153,121]};X[13]={1:[4,133,107]};X[14]={1:[3,145,115]};X[15]={1:[5,109,87]};X[16]={1:[5,122,98]};X[17]={1:[1,135,107]};X[18]={1:[5,150,120]};X[19]={1:[3,141,113]};X[20]={1:[3,135,107]};X[21]={1:[4,144,116]};X[22]={1:[2,139,111]};X[23]={1:[4,151,121]};X[24]={1:[6,147,117]};X[25]={1:[8,132,106]};X[26]={1:[10,142,114]};X[27]={1:[8,152,122]};X[28]={1:[3,147,117]};X[29]={1:[7,146,116]};X[30]={1:[5,145,115]};X[31]={1:[13,145,115]};X[32]={1:[17,145,115]};X[33]={1:[17,145,115]};X[34]={1:[13,145,115]};X[35]={1:[12,151,121]};X[36]={1:[6,151,121]};X[37]={1:[17,152,122]};X[38]={1:[4,152,122]};X[39]={1:[20,147,117]};X[40]={1:[19,148,118]};var V={getBCHTypeInfo:function(a){for(var b=a<<10;V.getBCHDigit(b)-V.getBCHDigit(1335)>=0;)b^=1335<<V.getBCHDigit(b)-V.getBCHDigit(1335);return(a<<10|b)^21522},getBCHTypeNumber:function(a){for(var b=a<<12;V.getBCHDigit(b)-V.getBCHDigit(7973)>=0;)b^=7973<<V.getBCHDigit(b)-V.getBCHDigit(7973);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getMask:function(a,b,c){switch(a){case 0:return 0==(b+c)%2;case 1:return 0==b%2;case 2:return 0==c%3;case 3:return 0==(b+c)%3;case 4:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case 5:return 0==b*c%2+b*c%3;case 6:return 0==(b*c%2+b*c%3)%2;case 7:return 0==((b+c)%2+b*c%3)%2;default:throw Error("bad maskPattern:"+a)}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;d<b;d++)for(var e=0;e<b;e++){for(var f=0,h=a.isDark(d,e),k=-1;1>=k;k++)if(!(0>d+k||b<=d+k))for(var l=-1;1>=l;l++)0>e+l||b<=e+l||0==k&&0==l||h==a.isDark(d+k,e+l)&&f++;3<f&&(c+=3)}for(d=0;d<b-1;d++)for(e=0;e<b-1;e++){f=0;a.isDark(d,e)&&f++;a.isDark(d+1,e)&&f++;a.isDark(d,e+1)&&f++;a.isDark(d+1,e+1)&&f++;0==f||4==f&&(c+=3)}for(d=0;d<b;d++)for(e=0;e<b-6;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(e=0;e<b;e++)for(d=0;d<b-6;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);d=0;for(e=0;e<b;e++)for(f=0;f<b;f++)a.isDark(e,f)&&d++;a=d/b/b;return c+=10*(Math.abs(100*a-50)/5)},};(function(){g.QRCodeGenerator=Q})(window)})(window);

})();
// ---- END EMBEDDED QR LIB FALLBACK ----


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
    if(typeof window.QRCodeGenerator !== "function") throw new Error("QRCodeGenerator missing");
    const q = new window.QRCodeGenerator(0);
    q.addData(String(text));
    q.make();
    // Signature de qr.min.js: createSvgTag(cellSize, fillColor)
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
