import { nowTs } from "./utils.js";
import { getModeration, setModeration } from "./storage.js";

export function state(){
  return getModeration();
}

export function isMuted(){
  const m = getModeration();
  return (m.mutedUntil || 0) > nowTs();
}

export function isJailed(){
  const m = getModeration();
  return (m.jailedUntil || 0) > nowTs();
}

export function applyMute(minutes){
  const m = getModeration();
  m.mutedUntil = nowTs() + minutes * 60_000;
  setModeration(m);
  return m;
}

export function applyJail(minutes){
  const m = getModeration();
  m.jailedUntil = nowTs() + minutes * 60_000;
  setModeration(m);
  return m;
}

export function setIsMod(isMod){
  const m = getModeration();
  m.isMod = !!isMod;
  setModeration(m);
  return m;
}
