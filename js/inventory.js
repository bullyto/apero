import { getInventory, setInventory } from "./storage.js";

export function ensureStarterInventory(){
  // Starter: a pied + 1 objet gratuit (skate) + 1 familier gratuit (hibou)
  const inv = getInventory();
  inv.items = inv.items || [];
  inv.mounts = inv.mounts || [];
  inv.pets = inv.pets || [];
  if(!inv.mounts.includes("mount_none")) inv.mounts.push("mount_none");
  if(!inv.items.includes("item_skate")) inv.items.push("item_skate");
  if(!inv.pets.includes("pet_owl")) inv.pets.push("pet_owl");
  setInventory(inv);
  return inv;
}

export function getActiveLoadout(){
  const inv = getInventory();
  return inv.active || { mountId:"mount_none", petId:"pet_owl", itemIds:["item_skate"] };
}

export function setActiveLoadout(loadout){
  const inv = getInventory();
  inv.active = loadout;
  setInventory(inv);
}
