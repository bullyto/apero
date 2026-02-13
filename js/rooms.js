import { uid, nowTs } from "./utils.js";

const rooms = new Map(); // roomId -> {messages: []}
let currentRoomId = null;

export function getCurrentRoomId(){ return currentRoomId; }

export function setRoom(roomId){
  currentRoomId = roomId;
  if(!rooms.has(roomId)){
    rooms.set(roomId, { messages: [] });
  }
  return rooms.get(roomId);
}

export function getRoom(roomId){
  if(!rooms.has(roomId)) rooms.set(roomId, { messages: [] });
  return rooms.get(roomId);
}

export function pushMessage(roomId, msg){
  const room = getRoom(roomId);
  room.messages.push({
    id: uid(),
    ts: nowTs(),
    ...msg
  });
  // max 30 messages (FIFO)
  while(room.messages.length > 30) room.messages.shift();
  return room.messages;
}

export function listMessages(roomId){
  return getRoom(roomId).messages.slice();
}

export function clearRoom(roomId){
  rooms.set(roomId, { messages: [] });
}
