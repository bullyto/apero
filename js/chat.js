import { safeText, formatTime, playerColor } from "./utils.js";
import { pushMessage, listMessages } from "./rooms.js";

export function renderChat(container, roomId){
  const msgs = listMessages(roomId);
  container.innerHTML = msgs.map(m => {
    const color = m.color || playerColor(m.pseudo || "player");
    return `<p class="msg">
      <span class="who" style="color:${color}">${safeText(m.pseudo)}</span>
      <span class="meta">${formatTime(m.ts)}</span>
      <span class="txt">: ${safeText(m.text)}</span>
    </p>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

export function sendChat(roomId, pseudo, text){
  const t = (text || "").trim();
  if(!t) return false;
  pushMessage(roomId, {
    pseudo,
    text: t,
    color: playerColor(pseudo)
  });
  return true;
}
