export function createInput(){
  const keys = { left:false, right:false, jump:false };
  function onKey(e, down){
    if(["ArrowLeft","a","q"].includes(e.key)) keys.left = down;
    if(["ArrowRight","d"].includes(e.key)) keys.right = down;
    if(["ArrowUp","w","z"," "].includes(e.key)) keys.jump = down;
  }
  window.addEventListener("keydown", e => onKey(e, true));
  window.addEventListener("keyup", e => onKey(e, false));
  return keys;
}
