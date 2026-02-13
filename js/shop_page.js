import { $, safeText } from "./utils.js";
import { getProfile, getWallet } from "./storage.js";
import { loadCatalog, buy, addCredits } from "./shop.js";
import { ensureStarterInventory } from "./inventory.js";

function priceFor(id){
  // Simple pricing stub. Change later.
  if(id.startsWith("mount_")) return 120;
  if(id.startsWith("pet_")) return 60;
  if(id.startsWith("item_")) return 90;
  return 100;
}

function renderWallet(){
  const w = getWallet();
  $("#credits").textContent = `${w.credits || 0} crédits`;
}

function card(title, subtitle, actionsHtml){
  return `<div class="card">
    <h2>${safeText(title)}</h2>
    <p>${safeText(subtitle)}</p>
    ${actionsHtml || ""}
  </div>`;
}

async function init(){
  const profile = getProfile();
  if(!profile){
    window.location.href = "./index.html";
    return;
  }
  ensureStarterInventory();
  $("#who").textContent = `Connecté : ${profile.pseudo}`;
  renderWallet();

  $("#btnBack").onclick = () => window.location.href = "./index.html";
  $("#btnGame").onclick = () => window.location.href = "./game.html";

  $("#btnBuyCredits").onclick = () => {
    // Stub redirect
    const amount = Number($("#creditPack").value || 0);
    if(!amount) return;
    // Simule achat réussi
    addCredits(amount);
    renderWallet();
    alert("Achat simulé ✅ (à remplacer par un vrai paiement).");
  };

  const catalog = await loadCatalog();
  const root = $("#catalog");
  root.innerHTML = "";

  function renderSection(label, arr, kind){
    const sec = document.createElement("div");
    sec.className = "card";
    sec.innerHTML = `<h2>${safeText(label)}</h2><p class="muted">Achat via crédits (stub).</p><div class="hr"></div>`;
    arr.forEach(it => {
      const price = priceFor(it.id);
      const row = document.createElement("div");
      row.className = "row";
      row.style.justifyContent = "space-between";
      row.innerHTML = `
        <div>
          <div><strong>${safeText(it.name)}</strong> <span class="badge">${safeText(it.id)}</span></div>
          <div class="small">${kind==="pets" ? "Cosmétique" : "Utilité / locomotion"} • Prix: <span class="kpi">${price}</span></div>
        </div>
        <button class="btn primary" type="button">Acheter</button>
      `;
      row.querySelector("button").onclick = () => {
        const r = buy(kind, it.id, price);
        if(!r.ok) alert(r.reason);
        else {
          renderWallet();
          alert("Acheté ✅");
        }
      };
      sec.appendChild(row);
      sec.appendChild(document.createElement("div")).className="hr";
    });
    root.appendChild(sec);
  }

  renderSection("Objets", catalog.items, "items");
  renderSection("Montures", catalog.mounts.filter(m=>m.id!=="mount_none"), "mounts");
  renderSection("Familiers", catalog.pets, "pets");
}

init().catch(err => {
  console.error(err);
  alert("Erreur boutique. Voir console.");
});
