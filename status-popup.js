/* =========================================================
   Status Popup (Apéro de Nuit 66) — v3.3 (SAFE)
   Fix:
   - Safety timer: impossible de rester bloqué si fetch/JSON/caches font n'importe quoi
   - WARNING: auto-déblocage fiable (même en PWA) + nettoyage timer
   ========================================================= */
(function(){
  const STATUS_URL = "https://bullyto.github.io/status/status.json";
  const FETCH_TIMEOUT_MS = 4500; // évite les attentes infinies sur réseau lent
  const SAFETY_HIDE_MS = 6500;   // 🔥 anti-popup bloqué (PWA/caches/réseau)

  function withinSchedule(schedule, now = new Date()){
    // enabled=false => bloqué tout le temps (donc "dans la plage" = true)
    if(!schedule || schedule.enabled === false) return true;

    const days = Array.isArray(schedule.days) ? schedule.days : [];
    const day = now.getDay();
    if(days.length && !days.includes(day)) return false;

    const [sh, sm] = String(schedule.start||"00:00").split(":").map(n=>parseInt(n,10));
    const [eh, em] = String(schedule.end||"00:00").split(":").map(n=>parseInt(n,10));
    if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em)) return true;

    const startMin = sh*60+sm;
    const endMin = eh*60+em;
    const nowMin = now.getHours()*60+now.getMinutes();

    if(startMin === endMin) return true;
    if(startMin < endMin){
      return nowMin >= startMin && nowMin < endMin;
    } else {
      return (nowMin >= startMin) || (nowMin < endMin);
    }
  }

  function setOrderEnabled(enabled){
    const btn = document.getElementById("goBtn");
    if(!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "" : "0.55";
    btn.style.cursor = enabled ? "" : "not-allowed";
  }

  function injectOverlay(){
    if(document.getElementById("adStatusOverlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      .adStatusOverlay{position:fixed; inset:0; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.62); z-index:999999; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);}
      .adStatusOverlay.show{display:flex;}
      .adStatusCard{width:min(560px,94vw); border-radius:26px; overflow:hidden; background: linear-gradient(180deg, rgba(20,35,56,.96), rgba(10,20,33,.96)); border:1px solid rgba(255,255,255,.12); box-shadow:0 30px 80px rgba(0,0,0,.55); color:#fff; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
      .adStatusTop{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 14px 12px; background: rgba(255,255,255,.02); border-bottom:1px solid rgba(255,255,255,.08);}
      .adStatusBrand{display:flex; align-items:center; gap:10px; min-width:0;}
      .adStatusDot{width:34px; height:34px; border-radius:14px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); font-weight:950;}
      .adStatusHead{min-width:0;}
      .adStatusHead b{display:block; letter-spacing:.14em; text-transform:uppercase; font-size:14px; color:rgba(255,255,255,.92); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .adStatusHead span{display:block; font-size:13px; color:rgba(255,255,255,.70); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .adStatusClose{width:44px; height:44px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.25); color:#fff; font-size:20px; line-height:1; cursor:pointer;}
      .adStatusClose[disabled]{opacity:.5; cursor:not-allowed;}
      .adStatusImg{width:100%; display:block; max-height:38vh; object-fit:cover;}
      .adStatusBody{padding:16px 16px 14px;}
      .adStatusTitle{margin:0; font-size:30px; line-height:1.05; font-weight:950;}
      .adStatusMsg{margin:10px 0 0; color:rgba(255,255,255,.78); font-size:15px; line-height:1.45;}
      .adStatusSecondary{margin-top:12px; display:none; color:rgba(255,255,255,.92); font-weight:950; text-align:center;}
      .adStatusBtn{margin-top:16px; width:100%; border:none; border-radius:16px; padding:14px; font-size:18px; font-weight:950; cursor:pointer; background:#c81515; color:#fff;}
      .adStatusBtn[disabled]{opacity:.65; cursor:not-allowed;}
      .adStatusLegal{margin-top:14px; text-align:center; font-size:12.5px; color:rgba(255,255,255,.55);}
      .adStatusSpinner{display:inline-block; width:14px; height:14px; border-radius:999px; border:2px solid rgba(255,255,255,.25); border-top-color:rgba(255,255,255,.85); animation: adspin 1s linear infinite; vertical-align:-2px; margin-right:8px;}
      @keyframes adspin { to { transform: rotate(360deg);} }
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = "adStatusOverlay";
    wrap.className = "adStatusOverlay";
    wrap.innerHTML = `
      <div class="adStatusCard" role="dialog" aria-modal="true">
        <div class="adStatusTop">
          <div class="adStatusBrand">
            <div class="adStatusDot" id="adStatusIcon">!</div>
            <div class="adStatusHead">
              <b id="adStatusBarTitle">INFORMATION SERVICE</b>
              <span id="adStatusBarSub"><span class="adStatusSpinner"></span>Chargement du statut…</span>
            </div>
          </div>
          <button class="adStatusClose" id="adStatusClose" aria-label="Fermer">×</button>
        </div>
        <img class="adStatusImg" id="adStatusImg" alt="">
        <div class="adStatusBody">
          <div class="adStatusTitle" id="adStatusTitle">—</div>
          <div class="adStatusMsg" id="adStatusMsg">—</div>
          <div class="adStatusSecondary" id="adStatusSecondary"></div>
          <button class="adStatusBtn" id="adStatusOk">OK, j'ai compris</button>
          <div class="adStatusLegal">L'abus d'alcool est dangereux pour la santé, à consommer avec modération.</div>
        </div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(wrap);
  }

  function showOverlay(){
    const o = document.getElementById("adStatusOverlay");
    if(!o) return;
    o.classList.add("show");
    document.documentElement.style.overflow = "hidden";
    document.body && (document.body.style.overflow = "hidden");
  }
  function hideOverlay(){
    const o = document.getElementById("adStatusOverlay");
    if(!o) return;
    o.classList.remove("show");
    document.documentElement.style.overflow = "";
    document.body && (document.body.style.overflow = "");
  }

  function run(){
    injectOverlay();

    const overlay = document.getElementById("adStatusOverlay");
    const imgEl = document.getElementById("adStatusImg");
    const titleEl = document.getElementById("adStatusTitle");
    const msgEl = document.getElementById("adStatusMsg");
    const okBtn = document.getElementById("adStatusOk");
    const xBtn = document.getElementById("adStatusClose");
    const barSub = document.getElementById("adStatusBarSub");
    const secondary = document.getElementById("adStatusSecondary");

    if(!overlay || !imgEl || !titleEl || !msgEl || !okBtn) return;

    // Affiche tout de suite
    showOverlay();

    // 🔥 Safety: si le réseau/caches font n'importe quoi => on ne reste jamais bloqué
    const safetyTimer = setTimeout(() => {
      try { hideOverlay(); } catch(e) {}
      try { setOrderEnabled(true); } catch(e) {}
      try {
        if(window.__ad_warn_timer){ clearInterval(window.__ad_warn_timer); }
        window.__ad_warn_timer = null;
      } catch(e) {}
    }, SAFETY_HIDE_MS);

    let canClose = true;
    let mode = "none";
    let warningClickMsg = "Ce n'est actuellement pas possible de commander.";

    function setCloseEnabled(on, m){
      canClose = !!on;
      mode = m || mode;

      if(xBtn) xBtn.disabled = !canClose;

      if(okBtn){
        if(mode === "info"){
          okBtn.disabled = !canClose;
        } else if(mode === "warning"){
          okBtn.disabled = false; // cliquable mais ne ferme pas
        } else {
          okBtn.disabled = false;
        }
      }
    }

    function setSecondary(text, show){
      if(!secondary) return;
      secondary.textContent = text || "";
      secondary.style.display = show ? "block" : "none";
    }

    function closeIfAllowed(){
      if(!canClose) return;
      hideOverlay();
    }

    overlay.addEventListener("click", (e) => {
      if(e.target === overlay){
        if(!canClose && mode === "warning"){
          setSecondary(warningClickMsg, true);
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      const shown = overlay.classList.contains("show");
      if(!shown) return;
      if(e.key === "Escape"){
        if(!canClose){
          e.preventDefault();
          e.stopPropagation();
        } else {
          closeIfAllowed();
        }
      }
    }, true);

    okBtn.addEventListener("click", () => {
      if(mode === "warning"){
        setSecondary(warningClickMsg, true);
        return;
      }
      closeIfAllowed();
    });
    if(xBtn) xBtn.addEventListener("click", closeIfAllowed);

    // Pré-état : on bloque la fermeture tant qu'on ne sait pas (évite “flash”)
    setCloseEnabled(false, "info");
    okBtn.textContent = "OK, j'ai compris";
    setSecondary("", false);
    setOrderEnabled(true);

    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), FETCH_TIMEOUT_MS);

    fetch(STATUS_URL, { cache:"no-store", signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        clearTimeout(timer);
        clearTimeout(safetyTimer);

        // Nettoyage timer warning (au cas où)
        try {
          if(window.__ad_warn_timer){ clearInterval(window.__ad_warn_timer); }
          window.__ad_warn_timer = null;
        } catch(e){}

        if(!data || !data.active){
          hideOverlay();
          setOrderEnabled(true);
          setCloseEnabled(true, "none");
          return;
        }

        mode = data.mode || "none";
        const cfg = data.modes?.[mode];
        if(!cfg){
          hideOverlay();
          setOrderEnabled(true);
          setCloseEnabled(true, "none");
          return;
        }

        // UI
        const base = STATUS_URL.replace(/\/status\.json$/,'/');
        const src = (cfg.image || "");
        const imgUrl = /^https?:\/\//i.test(src) ? src : (base + (src || "images/panne.png"));

        imgEl.src = imgUrl;
        titleEl.textContent = cfg.title || "Information";
        msgEl.textContent = cfg.message || "";
        if(barSub) barSub.textContent = "Mise à jour officielle";

        // INFO
        if(mode === "info"){
          const delay = Number.isFinite(cfg.ok_delay_seconds) ? cfg.ok_delay_seconds : 5;

          setOrderEnabled(true);
          setSecondary("", false);

          let left = delay;
          setCloseEnabled(false, "info");
          okBtn.textContent = `OK, j'ai compris (dans ${left}s)`;

          const t = setInterval(() => {
            left -= 1;
            if(left <= 0){
              clearInterval(t);
              okBtn.textContent = "OK, j'ai compris";
              setCloseEnabled(true, "info");
            } else {
              okBtn.textContent = `OK, j'ai compris (dans ${left}s)`;
            }
          }, 1000);

          return;
        }

        // WARNING
        if(mode === "warning"){
          warningClickMsg = cfg.warning_click_message || warningClickMsg;
          const schedule = cfg.block_schedule || { enabled:false };

          function applyNow(){
            const blockedNow = withinSchedule(schedule, new Date());

            // WARNING ne bloque QUE pendant la plage horaire
            if(!blockedNow){
              hideOverlay();
              setOrderEnabled(true);
              setCloseEnabled(true, "none");
              setSecondary("", false);
              try {
                if(window.__ad_warn_timer){ clearInterval(window.__ad_warn_timer); }
                window.__ad_warn_timer = null;
              } catch(e){}
              return false;
            }

            // Dans la plage => warning bloquant + commande bloquée
            setOrderEnabled(false);
            setSecondary("", false);
            setCloseEnabled(false, "warning");
            okBtn.textContent = "OK, j'ai compris";
            showOverlay();
            return true;
          }

          // applique tout de suite
          const stillBlocked = applyNow();
          if(!stillBlocked) return;

          // auto-déblocage fiable même en PWA (vérifie toutes les 15s)
          try { if(window.__ad_warn_timer) clearInterval(window.__ad_warn_timer); } catch(e){}
          window.__ad_warn_timer = setInterval(applyNow, 15000);

          return;
        }

        // default
        hideOverlay();
        setOrderEnabled(true);
        setCloseEnabled(true, "none");
      })
      .catch(() => {
        clearTimeout(timer);
        clearTimeout(safetyTimer);

        // réseau lent/HS => on n'affiche pas de popup (pour pas bloquer)
        hideOverlay();
        setOrderEnabled(true);
        setCloseEnabled(true, "none");
        try {
          if(window.__ad_warn_timer){ clearInterval(window.__ad_warn_timer); }
          window.__ad_warn_timer = null;
        } catch(e){}
      });
  }

  // Lancer au plus tôt possible
  if(document.readyState === "loading"){
    document.addEventListener("readystatechange", () => {
      if(document.readyState === "interactive") run();
    }, { once:true });
  } else {
    run();
  }
})();
