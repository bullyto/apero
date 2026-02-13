const KEY = "animatopia_v1";

function readAll(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch{ return {}; }
}
function writeAll(obj){
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function getProfile(){
  return readAll().profile || null;
}
export function setProfile(profile){
  const all = readAll();
  all.profile = profile;
  writeAll(all);
}
export function clearProfile(){
  const all = readAll();
  delete all.profile;
  writeAll(all);
}

export function getWallet(){
  return readAll().wallet || {credits: 0};
}
export function setWallet(wallet){
  const all = readAll();
  all.wallet = wallet;
  writeAll(all);
}

export function getInventory(){
  return readAll().inventory || { items: [], mounts: [], pets: [] };
}
export function setInventory(inv){
  const all = readAll();
  all.inventory = inv;
  writeAll(all);
}

export function getModeration(){
  return readAll().moderation || { mutedUntil: 0, jailedUntil: 0, isMod: false };
}
export function setModeration(mod){
  const all = readAll();
  all.moderation = mod;
  writeAll(all);
}
