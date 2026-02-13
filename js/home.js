import { loadJSON, $, $all, safeText } from "./utils.js";
import { getProfile, setProfile } from "./storage.js";
import { googleSignInStub } from "./auth.js";
import { ensureStarterInventory } from "./inventory.js";

let characters = null;
let selectedGender = "female";
let selectedCharId = null;

function renderCharacters(){
  const list = $("#charList");
  list.innerHTML = "";
  const arr = characters[selectedGender] || [];
  arr.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.dataset.id = c.id;
    btn.innerHTML = `🎭 ${safeText(c.name)} <span class="kpi">(${safeText(c.id)})</span>`;
    btn.onclick = () => {
      selectedCharId = c.id;
      $all("#charList .btn").forEach(b=>b.classList.remove("primary"));
      btn.classList.add("primary");
      $("#selectedChar").textContent = `${c.name} (${c.id})`;
    };
    list.appendChild(btn);
  });
  // preselect
  if(!selectedCharId && arr[0]){
    selectedCharId = arr[0].id;
    list.querySelector(".btn")?.classList.add("primary");
    $("#selectedChar").textContent = `${arr[0].name} (${arr[0].id})`;
  }
}

async function init(){
  characters = await loadJSON("./data/characters.json");
  renderCharacters();

  const profile = getProfile();
  if(profile){
    $("#pseudo").value = profile.pseudo || "";
    $("#email").value = profile.email || "";
    selectedGender = profile.gender || selectedGender;
    selectedCharId = profile.characterId || selectedCharId;
    $all('[name="gender"]').forEach(r => r.checked = (r.value === selectedGender));
    renderCharacters();
  }

  $all('[name="gender"]').forEach(r => {
    r.addEventListener("change", () => {
      selectedGender = r.value;
      selectedCharId = null;
      renderCharacters();
    });
  });

  $("#btnGoogle").addEventListener("click", () => {
    googleSignInStub();
    $("#googleState").textContent = "Connecté (stub)";
  });

  $("#btnSave").addEventListener("click", () => {
    const pseudo = ($("#pseudo").value || "").trim();
    if(!pseudo){
      alert("Pseudo obligatoire.");
      return;
    }
    const consent = $("#consent").checked;
    if(!consent){
      alert("Tu dois accepter les conditions minimales (consentement).");
      return;
    }
    const profile = {
      gender: selectedGender,
      characterId: selectedCharId,
      pseudo,
      email: ($("#email").value || "").trim(),
      info: {
        age: ($("#age").value || "").trim(),
        city: ($("#city").value || "").trim(),
      },
      createdAt: Date.now()
    };
    setProfile(profile);
    ensureStarterInventory();
    window.location.href = "./game.html";
  });

  $("#btnShop").addEventListener("click", () => {
    window.location.href = "./shop.html";
  });
}

init().catch(err => {
  console.error(err);
  alert("Erreur chargement accueil. Voir console.");
});
