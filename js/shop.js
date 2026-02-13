import { loadJSON } from "./utils.js";
import { getWallet, setWallet, getInventory, setInventory } from "./storage.js";

export async function loadCatalog(){
  const [items, mounts, pets] = await Promise.all([
    loadJSON("./data/items.json"),
    loadJSON("./data/mounts.json"),
    loadJSON("./data/pets.json"),
  ]);
  return { items, mounts, pets };
}

export function wallet(){
  return getWallet();
}

export function addCredits(amount){
  const w = getWallet();
  w.credits = Math.max(0, (w.credits||0) + amount);
  setWallet(w);
  return w;
}

export function buy(kind, id, price){
  const w = getWallet();
  if((w.credits||0) < price) return { ok:false, reason:"Crédits insuffisants" };

  const inv = getInventory();
  const key = kind === "items" ? "items" : kind === "mounts" ? "mounts" : "pets";
  inv[key] = inv[key] || [];
  if(inv[key].includes(id)) return { ok:false, reason:"Déjà acheté" };

  w.credits -= price;
  inv[key].push(id);

  setWallet(w);
  setInventory(inv);
  return { ok:true };
}
