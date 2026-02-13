export function $(sel, root=document){ return root.querySelector(sel); }
export function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function nowTs(){ return Date.now(); }

export function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

export function hashToHue(str){
  // Deterministic hue from string
  let h = 2166136261;
  for (let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

export function playerColor(pseudo){
  const hue = hashToHue(pseudo.trim().toLowerCase() || "player");
  return `hsl(${hue} 85% 65%)`;
}

export async function loadJSON(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(`Erreur chargement ${path}`);
  return await res.json();
}

export function safeText(s){
  return (s ?? "").toString().replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
}

export function uid(){
  return crypto.randomUUID ? crypto.randomUUID() : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}


export function downloadJSON(obj, filename='data.json'){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2500);
}
