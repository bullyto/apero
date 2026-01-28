// PATH: /fidel/scan/scan.js
// ADN66 • Scan QR (extract cid from URL)

(function(){
  "use strict";

  function qs(name){
    try{ return new URLSearchParams(location.search).get(name) || ""; }
    catch(_){ return ""; }
  }

  const cid = (qs("cid") || "").trim();
  const cidEl = document.getElementById("cid");
  const copyBtn = document.getElementById("copyBtn");
  const openAdminBtn = document.getElementById("openAdminBtn");
  const state = document.getElementById("state");

  if(cidEl) cidEl.textContent = cid || "CID manquant";
  if(state) state.textContent = cid ? "QR reconnu" : "CID manquant";

  if(copyBtn){
    copyBtn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(cid || "");
        copyBtn.textContent = "Copié ✓";
        setTimeout(()=>copyBtn.textContent="Copier ID", 1200);
      }catch(_){
        // fallback
        const ta = document.createElement("textarea");
        ta.value = cid || "";
        ta.style.position="fixed"; ta.style.left="-9999px";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try{ document.execCommand("copy"); }catch(__){}
        ta.remove();
        copyBtn.textContent = "Copié ✓";
        setTimeout(()=>copyBtn.textContent="Copier ID", 1200);
      }
    });
  }

  // Admin target (best-effort). If you later create /fidel/admin/, this will work automatically.
  const adminUrl = "../admin/?cid=" + encodeURIComponent(cid || "");
  if(openAdminBtn) openAdminBtn.href = adminUrl;

})();