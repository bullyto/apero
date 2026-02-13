import { $, $all, loadJSON } from "./utils.js";
import { getProfile } from "./storage.js";
import { createEngine } from "./game/engine.js";
import { createInput } from "./game/input.js";
import { setRoom } from "./rooms.js";
import { renderChat, sendChat } from "./chat.js";
import { ensureStarterInventory, getActiveLoadout, setActiveLoadout } from "./inventory.js";
import { isMuted, isJailed } from "./moderation.js";

let engine, keys, mapsData, mountsData, itemsData, petsData;
let currentMapId = null;
let profile = null;

async function setMap(mapId, spawnName="default"){
  currentMapId = mapId;
  const map = mapsData.find(m => m.id === mapId);

  $("#roomName").textContent = map ? map.name : mapId;
  $("#roomLogic").textContent = map ? map.logic : "platformer";

  setRoom(mapId); // chat isolated

  // Engine
  engine.setRoomLogic(map?.logic || "platformer");

  // IMPORTANT: engine expects URLs relative to game.html
  // game.html is at root, so paths in maps.json are already OK.
  await engine.setMap(map);

  // spawn
  const sp = map?.spawns?.[spawnName] || map?.spawns?.default || {x:120,y:640};
  engine.setSpawn(sp);

  renderChat($("#chatLog"), mapId);
}

function getMountRules(mountId){
  return mountsData.find(m=>m.id===mountId)?.rules || {speed_ground:1.0};
}

function applyLoadoutToEngine(loadout){
  const rules = getMountRules(loadout.mountId);
  // pick a base speed multiplier
  const mult = rules.speed_ground ?? 1.0;
  engine.setMountSpeed(mult);
  $("#mountState").textContent = `Monture: ${loadout.mountId}`;
  $("#petState").textContent = `Familier: ${loadout.petId}`;
}

function renderHotbar(loadout){
  const bar = $("#invBar");
  bar.innerHTML = "";
  // 3 slots max in this starter
  const slots = (loadout.itemIds || []).slice(0,3);
  while(slots.length < 3) slots.push(null);

  slots.forEach((id, idx) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.title = id ? id : "Vide";
    slot.innerHTML = `<span>${id ? "🧰" : "—"}</span>`;
    slot.onclick = () => {
      // toggle active visual
      $all(".slot").forEach(s=>s.classList.remove("active"));
      slot.classList.add("active");
      $("#itemState").textContent = id ? `Objet actif: ${id}` : "Objet actif: —";
    };
    bar.appendChild(slot);
  });
}

async function init(){
  profile = getProfile();
  if(!profile){
    window.location.href = "./index.html";
    return;
  }
  ensureStarterInventory();

  mapsData = await loadJSON("./data/maps.json");
  mountsData = await loadJSON("./data/mounts.json");
  itemsData = await loadJSON("./data/items.json");
  petsData = await loadJSON("./data/pets.json");

  $("#who").textContent = `Joueur: ${profile.pseudo}`;
  // Canvas engine

  const canvas = $("#gameCanvas");
  engine = createEngine(canvas);
  keys = createInput();

  // Loadout
  let loadout = getActiveLoadout();
  // Ensure arrays
  loadout.itemIds = loadout.itemIds || [];
  if(loadout.itemIds.length === 0) loadout.itemIds = ["item_skate"];
  setActiveLoadout(loadout);

  applyLoadoutToEngine(loadout);
  // Map initiale (auto)
  await setMap(mapsData[0]?.id || "map_01", "default");

  renderHotbar(loadout);// Chat
  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if(isJailed()){
      alert("Tu es en prison (stub).");
      return;
    }
    if(isMuted()){
      alert("Tu es mute (stub).");
      return;
    }
    const ok = sendChat(currentMapId, profile.pseudo, $("#chatText").value);
    if(ok){
      $("#chatText").value = "";
      renderChat($("#chatLog"), currentMapId);
    }
  });

  // Nav buttons
  $("#btnHome").onclick = () => window.location.href = "./index.html";
  $("#btnShop").onclick = () => window.location.href = "./shop.html";

  // Simple mount/pet selectors (starter)
  const mountSel = $("#mountSelect");
  mountSel.innerHTML = mountsData.map(m=>`<option value="${m.id}">${m.name}</option>`).join("");
  mountSel.value = loadout.mountId;
  mountSel.onchange = () => {
    loadout.mountId = mountSel.value;
    setActiveLoadout(loadout);
    applyLoadoutToEngine(loadout);
  };

  const petSel = $("#petSelect");
  petSel.innerHTML = petsData.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  petSel.value = loadout.petId;
  petSel.onchange = () => {
    loadout.petId = petSel.value;
    setActiveLoadout(loadout);
    applyLoadoutToEngine(loadout);
  };

  // loop

  // Transitions map (bords d'écran)
  let isSwitching = false;
  let lastSwitchTs = 0;

  async function switchBy(dir){
    const now = Date.now();
    if(isSwitching) return;
    if(now - lastSwitchTs < 350) return; // anti-double trigger

    const map = mapsData.find(m => m.id === currentMapId);
    const conn = map?.connections?.[dir];
    if(!conn?.to) return;

    isSwitching = true;
    lastSwitchTs = now;

    // petite marge: repositionner à l'intérieur avant switch
    if(dir === "left") engine.state.x = 22;
    if(dir === "right") engine.state.x = engine.state.w - 22;
    if(dir === "up") engine.state.y = 22;
    if(dir === "down") engine.state.y = engine.state.h - 22;

    await setMap(conn.to, conn.spawn || "default");
    isSwitching = false;
  }
  function loop(){
    engine.step(keys);

    // Check borders (sortie cadre)
    const s = engine.state;
    if(s.x <= 18) switchBy("left");
    else if(s.x >= s.w - 18) switchBy("right");
    else if(s.y <= 18) switchBy("up");
    else if(s.y >= s.h - 18) switchBy("down");

    engine.draw();
    requestAnimationFrame(loop);
  }
  loop();
}

init().catch(err => {
  console.error(err);
  alert("Erreur jeu. Voir console.");
});
