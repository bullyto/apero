// PATH: /fidel/admin.js
// CONFIG : URL Worker Cloudflare
const API_BASE = "https://carte-de-fideliter.apero-nuit-du-66.workers.dev";

/**
 * Génération QR – MÊME LIB & MÊME MÉTHODE que côté client
 * Lib: qr.min.js (Kazuhiko Arase)
 */
function renderQr(text){
  const box = document.getElementById("qrSvg");
  if(!box) return;
  box.innerHTML = "";

  try{
    if(typeof window.qrcode === "function"){
      const qr = window.qrcode(0, "M"); // auto size, correction M
      qr.addData(String(text));
      qr.make();
      // cellSize=6, margin=4 → grosse bordure blanche
      box.innerHTML = qr.createSvgTag(6, 4);
      return;
    }

    if(typeof window.QRCodeGenerator === "function"){
      const q = window.QRCodeGenerator(0, "M");
      q.addData(String(text));
      q.make();
      box.innerHTML = q.createSvgTag(6, 4);
      return;
    }

    throw new Error("Lib QR non détectée");
  }catch(e){
    box.textContent = "QR indisponible";
  }
}

// === reste du fichier inchangé (logique admin) ===
