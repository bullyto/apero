import { clamp } from "../utils.js";

const TILE = 16; // official Animatopia tiles for 1248x832 -> 78x52

function rleDecode(rle, total){
  const out = new Uint8Array(total);
  let k = 0;
  for(const [val,count] of rle){
    out.fill(val, k, k+count);
    k += count;
  }
  return out;
}

export function createEngine(canvas){
  const ctx = canvas.getContext("2d");

  const state = {
    w: 1248, h: 832,
    x: 120, y: 640, // player center
    vx: 0, vy: 0,
    onGround: false,

    roomLogic: "platformer",
    mountSpeed: 1.0,

    // map
    mapId: null,
    mapImage: null,
    grid: new Uint8Array((1248/16)*(832/16)),
    gw: 78, gh: 52,
    tileSize: 16,

    info: "Engine v0.2 (maps + zones)"
  };

  function resize(){
    canvas.width = state.w;
    canvas.height = state.h;
  }
  resize();

  function setRoomLogic(logic){
    state.roomLogic = logic || "platformer";
  }

  function setMountSpeed(mult){
    state.mountSpeed = clamp(mult || 1.0, 0, 3.0);
  }

  function setSpawn(spawn){
    if(!spawn) return;
    state.x = clamp(spawn.x ?? 120, 18, state.w-18);
    state.y = clamp(spawn.y ?? 640, 18, state.h-18);
    state.vx = 0; state.vy = 0; state.onGround = false;
  }

  async function setMap(mapDef){
    state.mapId = mapDef?.id || null;

    // load image
    state.mapImage = null;
    const imgSrc = mapDef?.image;
    if(imgSrc){
      const img = new Image();
      img.src = imgSrc;
      await new Promise(res=>{ img.onload=()=>res(); img.onerror=()=>res(); });
      state.mapImage = img;
    }

    // load collision grid
    state.tileSize = mapDef?.tileSize || TILE;
    state.gw = Math.floor(state.w / state.tileSize);
    state.gh = Math.floor(state.h / state.tileSize);

    try{
      const res = await fetch(mapDef.grid, {cache:"no-store"});
      const coll = await res.json();
      if(coll?.encoding === "rle" && Array.isArray(coll.rle)){
        state.grid = rleDecode(coll.rle, state.gw*state.gh);
      } else if(Array.isArray(coll?.data)){
        state.grid = Uint8Array.from(coll.data);
      } else {
        state.grid = new Uint8Array(state.gw*state.gh);
      }
    } catch(e){
      state.grid = new Uint8Array(state.gw*state.gh);
    }
  }

  function tileAt(px, py){
    const ts = state.tileSize;
    const cx = Math.floor(px / ts);
    const cy = Math.floor(py / ts);
    if(cx<0||cy<0||cx>=state.gw||cy>=state.gh) return 0;
    return state.grid[cy*state.gw + cx] || 0;
  }

  function isSolidAt(px, py){
    return tileAt(px, py) === 1;
  }

  function isWaterAt(px, py){
    return tileAt(px, py) === 2;
  }

  function step(keys){
    const speed = 4.2 * state.mountSpeed;
    const swimSpeed = 3.2 * state.mountSpeed;

    // read surface
    const underFeet = tileAt(state.x, state.y + 18);
    const inWater = isWaterAt(state.x, state.y) || isWaterAt(state.x, state.y+10);

    // movement intent
    let ax = 0, ay = 0;
    if(keys.left) ax -= 1;
    if(keys.right) ax += 1;
    if(keys.up) ay -= 1;
    if(keys.down) ay += 1;

    if(inWater || state.roomLogic === "water"){
      // swim: no classic jump, allow 4 directions
      state.vx = ax * swimSpeed;
      state.vy = ay * swimSpeed;

      // mild drift if no input
      if(ax === 0) state.vx *= 0.6;
      if(ay === 0) state.vy *= 0.6;

      // keep in bounds + avoid solid blocks
      const nx = state.x + state.vx;
      const ny = state.y + state.vy;

      // horizontal collision
      const signX = Math.sign(state.vx);
      if(signX !== 0){
        const probeX = nx + signX*18;
        if(isSolidAt(probeX, state.y) || isSolidAt(probeX, state.y-12) || isSolidAt(probeX, state.y+12)){
          state.vx = 0;
        }
      }
      // vertical collision
      const signY = Math.sign(state.vy);
      if(signY !== 0){
        const probeY = ny + signY*18;
        if(isSolidAt(state.x, probeY) || isSolidAt(state.x-12, probeY) || isSolidAt(state.x+12, probeY)){
          state.vy = 0;
        }
      }

      state.x = clamp(state.x + state.vx, 18, state.w-18);
      state.y = clamp(state.y + state.vy, 18, state.h-18);
      state.onGround = false;
      return;
    }

    // platformer physics
    // horizontal
    if(ax !== 0) state.vx = ax * speed;
    else state.vx *= 0.75;

    // jump
    if(keys.jump && state.onGround){
      state.vy = -14.2;
      state.onGround = false;
    }

    // gravity
    state.vy += 0.95;

    // apply with collisions (simple)
    // X move
    let nx = state.x + state.vx;
    const signX = Math.sign(state.vx);
    if(signX !== 0){
      const probeX = nx + signX*18;
      if(isSolidAt(probeX, state.y) || isSolidAt(probeX, state.y-12) || isSolidAt(probeX, state.y+12)){
        // snap to edge of tile
        const ts = state.tileSize;
        const tileX = Math.floor(probeX / ts);
        if(signX > 0) nx = tileX*ts - 18 - 0.01;
        else nx = (tileX+1)*ts + 18 + 0.01;
        state.vx = 0;
      }
    }
    state.x = clamp(nx, 18, state.w-18);

    // Y move
    let ny = state.y + state.vy;
    const signY = Math.sign(state.vy);
    if(signY !== 0){
      const probeY = ny + signY*18;
      if(isSolidAt(state.x, probeY) || isSolidAt(state.x-12, probeY) || isSolidAt(state.x+12, probeY)){
        const ts = state.tileSize;
        const tileY = Math.floor(probeY / ts);
        if(signY > 0){
          // landing on top
          ny = tileY*ts - 18 - 0.01;
          state.onGround = true;
        } else {
          // head hit
          ny = (tileY+1)*ts + 18 + 0.01;
        }
        state.vy = 0;
      } else {
        state.onGround = false;
      }
    }

    state.y = clamp(ny, 18, state.h-18);

    // if standing on SOLID by feet, keep onGround
    if(tileAt(state.x, state.y+18) === 1) state.onGround = true;
  }

  function draw(){
    ctx.clearRect(0,0,state.w,state.h);

    // background map image
    if(state.mapImage?.complete && state.mapImage.naturalWidth){
      ctx.drawImage(state.mapImage, 0, 0, state.w, state.h);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0,0,state.w,state.h);
    }

    // player (placeholder circle)
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.beginPath();
    ctx.arc(state.x, state.y, 14, 0, Math.PI*2);
    ctx.fill();

    // HUD (top-left)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(10,10,340,58);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText(`Map: ${state.mapId || "—"} • Logic: ${state.roomLogic}`, 18, 32);
    ctx.fillText(`Tile: ${tileAt(state.x, state.y)} • onGround: ${state.onGround ? "yes":"no"}`, 18, 52);
  }

  return {
    state,
    resize,
    step,
    draw,
    setRoomLogic,
    setMountSpeed,
    setMap,
    setSpawn,
    tileAt
  };
}
