/*!
 * age-gate.js — Apéro de Nuit 66®
 * Reproduit le même Age Gate que celui de index.html (overlay + logique) :
 * - localStorage avec fallback cookie SameSite=Lax
 * - majeur mémorisé 20 jours
 * - mineur bloqué 48h (auto-retour à la question après expiration)
 * - expose window.requireMajorThen(fn)
 *
 * Intégration :
 *  - Ajoute simplement : <script src="./age-gate.js"></script> avant </body>
 *  - Ne nécessite aucune autre modification HTML/CSS (injection automatique si absent).
 */
(function(){
  "use strict";

  // =========================
  // 🔞 CONFIG (identique à index)
  // =========================
  const AGE = {
    KEY_MAJOR_UNTIL: "adn_major_until",
    KEY_LAST: "adn_last_choice",
    KEY_MINOR_UNTIL: "adn_minor_until",
    MAJOR_MS: 20 * 24 * 60 * 60 * 1000, // 20 jours
    MINOR_MS: 48 * 60 * 60 * 1000       // 48h
  };

  // =========================
  // 🔧 Helpers storage/cookies (identiques à index)
  // =========================
  function ageNow(){ return Date.now(); }

  function storageAvailable(){
    try{
      const k="__adn_ls_test__";
      localStorage.setItem(k,"1");
      localStorage.removeItem(k);
      return true;
    }catch(e){
      return false;
    }
  }
  const CAN_LS = storageAvailable();

  function cookieSet(name, value, maxAgeSeconds){
    const v = encodeURIComponent(String(value));
    const max = Number.isFinite(maxAgeSeconds) ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : "";
    document.cookie = `${name}=${v}${max}; Path=/; SameSite=Lax`;
  }
  function cookieGet(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function cookieDel(name){
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  function storeSetInt(key, n, maxAgeSeconds){
    if (CAN_LS){
      try { localStorage.setItem(key, String(n)); return; } catch(e){}
    }
    cookieSet(key, String(n), maxAgeSeconds);
  }
  function storeGetInt(key){
    let v = null;
    if (CAN_LS){
      try { v = localStorage.getItem(key); } catch(e){ v = null; }
    }
    if (v === null) v = cookieGet(key);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }
  function storeSetStr(key, s, maxAgeSeconds){
    if (CAN_LS){
      try { localStorage.setItem(key, String(s)); return; } catch(e){}
    }
    cookieSet(key, String(s), maxAgeSeconds);
  }
  function storeDel(key){
    if (CAN_LS){
      try { localStorage.removeItem(key); } catch(e){}
    }
    cookieDel(key);
  }

  function ageIsMajorValid(){ return storeGetInt(AGE.KEY_MAJOR_UNTIL) > ageNow(); }
  function ageIsMinorBlocked(){ return storeGetInt(AGE.KEY_MINOR_UNTIL) > ageNow(); }

  // =========================
  // 🎨 UI Injection (si la page n'a pas déjà le HTML/CSS)
  // =========================
  const STYLE_ID = "adn-agegate-style";
  const Q_ID = "ageQuestion";
  const B_ID = "ageBlocked";

  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;

    const css = `
/* =========================
   🔞 AGE GATE — ADN66
   ========================= */
.ageOverlay{
  position:fixed; inset:0;
  display:none;
  align-items:center; justify-content:center;
  padding:18px;
  z-index:5000;
  background: rgba(0,0,0,.62);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.ageOverlay.show{display:flex;}

.ageCard{
  width:min(560px, 94vw);
  border-radius:22px;
  background: linear-gradient(180deg, rgba(20,35,56,.94), rgba(10,20,33,.94));
  border:1px solid rgba(255,255,255,.12);
  box-shadow:0 30px 80px rgba(0,0,0,.55);
  overflow:hidden;
  color:#fff;
}
.ageTop{
  padding:16px 18px 12px;
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  border-bottom:1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.02);
}
.ageBrand{
  display:flex; align-items:center; gap:14px; min-width:0;
}
.ageBadge{
  width:34px;height:34px;border-radius:12px;
  display:grid;place-items:center;
  background: rgba(93,183,238,.18);
  border:1px solid rgba(93,183,238,.30);
  font-weight:950;color:#5db7ee;
  flex:0 0 auto;
}
.ageBrand b{
  letter-spacing:.12em;
  text-transform:uppercase;
  font-size:14px;
  color:rgba(255,255,255,.88);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.ageBody{padding:18px;}
.ageTitle{margin:6px 0 10px;font-size:28px;line-height:1.1;font-weight:950}
.ageLead{margin:0 0 14px;color:rgba(255,255,255,.74);line-height:1.45;font-size:15px}
.ageNotice{
  margin:14px 0 18px;
  padding:12px 12px;
  border-radius: 14px;
  border:1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.88);
  font-size:14px;
  line-height:1.35;
}
.ageBtns{display:grid; gap:14px; margin-top:10px;}
.ageBtn{
  border:1px solid rgba(255,255,255,.14);
  background: rgba(19,36,59,.90);
  color:#fff;
  padding:14px 14px;
  border-radius: 14px;
  cursor:pointer;
  font-weight:950;
  font-size:15px;
}
.ageBtnPrimary{
  background: linear-gradient(180deg, rgba(40,199,111,1), rgba(24,160,86,1));
  border-color: rgba(40,199,111,.55);
  box-shadow: 0 14px 40px rgba(40,199,111,.22);
}
.ageBtnSecondary{
  background: rgba(255,255,255,.05);
  border-color: rgba(255,255,255,.12);
  color: rgba(255,255,255,.92);
}
.ageFine{
  margin:12px 0 0;
  color: rgba(255,255,255,.60);
  font-size:12.5px;
  line-height:1.35;
  text-align:center;
}
.ageFine a{color:#5db7ee; text-decoration:none; font-weight:900;}
.ageFine a:hover{text-decoration:underline;}
`;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureOverlays(){
    // Si la page a déjà les overlays (comme index.html), on ne recrée rien.
    if (!document.getElementById(Q_ID)) {
      const q = document.createElement("div");
      q.className = "ageOverlay";
      q.id = Q_ID;
      q.setAttribute("role","dialog");
      q.setAttribute("aria-modal","true");
      q.innerHTML = `
        <div class="ageCard">
          <div class="ageTop">
            <div class="ageBrand">
              <div class="ageBadge">AD</div>
              <b>APÉRO DE NUIT®</b>
            </div>
          </div>
          <div class="ageBody">
            <div class="ageTitle">Bienvenue ✨</div>
            <p class="ageLead">
              Ce site présente des boissons alcoolisées. Pour continuer, confirme que tu as l’âge légal.
            </p>
            <div class="ageNotice">
              <b>La vente d’alcool est interdite aux mineurs.</b><br>
              L’abus d’alcool est dangereux pour la santé, à consommer avec modération.
            </div>
            <div class="ageBtns">
              <button class="ageBtn ageBtnPrimary" id="ageYes">✅ Je suis majeur</button>
              <button class="ageBtn ageBtnSecondary" id="ageNo">ℹ️ Je ne suis pas majeur</button>
            </div>
            <div class="ageFine">🔒 Choix mémorisé sur cet appareil.</div>
          </div>
        </div>
      `;
      document.body.appendChild(q);
    }

    if (!document.getElementById(B_ID)) {
      const b = document.createElement("div");
      b.className = "ageOverlay";
      b.id = B_ID;
      b.setAttribute("role","dialog");
      b.setAttribute("aria-modal","true");
      b.innerHTML = `
        <div class="ageCard">
          <div class="ageTop">
            <div class="ageBrand">
              <div class="ageBadge">18+</div>
              <b>ACCÈS RÉSERVÉ</b>
            </div>
          </div>
          <div class="ageBody">
            <div class="ageTitle">Accès réservé 🔞</div>
            <p class="ageLead">
              Ce contenu est strictement réservé aux personnes majeures.<br>
              La vente d’alcool est interdite aux mineurs.
            </p>
            <div class="ageNotice">
              Pour accéder au contenu, une vérification d’âge est obligatoire.
            </div>
            <div class="ageFine">
              Si tu penses être bloqué par erreur, contacte Apéro de Nuit® (06.52.33.64.61)
              ou <a href="mailto:contact@aperos.net">contact@aperos.net</a>.
            </div>
            <div class="ageFine" style="margin-top:10px;">
              L’abus d’alcool est dangereux pour la santé.
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(b);
    }
  }

  function qs(id){ return document.getElementById(id); }

  // =========================
  // 🔞 Behavior (identique à index)
  // =========================
  let agePendingAction = null;
  let ageInterval = null;

  function lockScroll(){
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  function unlockScrollIfNoneVisible(){
    const q = qs(Q_ID);
    const b = qs(B_ID);
    const qOn = q && q.classList.contains("show");
    const bOn = b && b.classList.contains("show");
    if(!qOn && !bOn){
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }

  function ageShow(el){
    if(!el) return;
    el.classList.add("show");
    lockScroll();
  }
  function ageHide(el){
    if(!el) return;
    el.classList.remove("show");
    unlockScrollIfNoneVisible();
  }
  function ageShowQuestion(){
    ageHide(qs(B_ID));
    ageShow(qs(Q_ID));
  }
  function ageShowBlocked(){
    const q = qs(Q_ID);
    const b = qs(B_ID);
    ageHide(q);
    ageShow(b);

    if(ageInterval) clearInterval(ageInterval);

    const tick = () => {
      const until = storeGetInt(AGE.KEY_MINOR_UNTIL);
      if (until <= ageNow()){
        clearInterval(ageInterval);
        ageInterval = null;
        storeDel(AGE.KEY_MINOR_UNTIL);
        ageShowQuestion();
      }
    };

    tick();
    ageInterval = setInterval(tick, 1000);
  }

  function ageSetMajor(){
    storeSetStr(AGE.KEY_LAST, "major", 60*60*24*30);
    storeSetInt(AGE.KEY_MAJOR_UNTIL, ageNow() + AGE.MAJOR_MS, Math.floor(AGE.MAJOR_MS/1000));
    storeDel(AGE.KEY_MINOR_UNTIL);
  }
  function ageSetMinorBlock(){
    storeSetStr(AGE.KEY_LAST, "minor", 60*60*24*3);
    storeSetInt(AGE.KEY_MINOR_UNTIL, ageNow() + AGE.MINOR_MS, Math.floor(AGE.MINOR_MS/1000));
  }

  function preventCloseByBackdrop(){
    const q = qs(Q_ID);
    const b = qs(B_ID);
    [q,b].forEach(o=>{
      if(!o) return;
      o.addEventListener("click", (e)=>{ if(e.target === o){ /* rien */ } });
    });
    document.addEventListener("keydown", (e)=>{
      const qOn = q && q.classList.contains("show");
      const bOn = b && b.classList.contains("show");
      if((qOn || bOn) && e.key === "Escape"){
        e.preventDefault();
      }
    });
  }

  // Exposé global (compat avec ton code existant)
  function requireMajorThen(actionFn){
    if(ageIsMinorBlocked()){
      agePendingAction = null;
      ageShowBlocked();
      return;
    }
    if(ageIsMajorValid()){
      actionFn();
      return;
    }
    agePendingAction = actionFn;
    ageShowQuestion();
  }

  function wireButtons(){
    const yes = document.getElementById("ageYes");
    const no  = document.getElementById("ageNo");

    if(yes && !yes.__adnBound){
      yes.__adnBound = true;
      yes.addEventListener("click", ()=>{
        ageSetMajor();
        ageHide(qs(Q_ID));
        if(typeof agePendingAction === "function"){
          const fn = agePendingAction;
          agePendingAction = null;
          fn();
        }
      });
    }

    if(no && !no.__adnBound){
      no.__adnBound = true;
      no.addEventListener("click", ()=>{
        ageSetMinorBlock();
        ageShowBlocked();
      });
    }
  }

  function init(){
    // Si la page contient déjà son propre requireMajorThen (index.html),
    // on ne le remplace pas. On s'assure juste que l'état existe.
    if (typeof window.requireMajorThen !== "function") {
      window.requireMajorThen = requireMajorThen;
    }

    // Expose aussi quelques helpers (non obligatoires)
    if (typeof window.ageIsMajorValid !== "function") window.ageIsMajorValid = ageIsMajorValid;
    if (typeof window.ageIsMinorBlocked !== "function") window.ageIsMinorBlocked = ageIsMinorBlocked;

    ensureStyle();
    ensureOverlays();
    preventCloseByBackdrop();
    wireButtons();

    // Même comportement que ton index : demande dès l'ouverture si non validé
    if(ageIsMinorBlocked()){
      ageShowBlocked();
    } else if(!ageIsMajorValid()){
      ageShowQuestion();
    }
  }

  // Démarrage
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
