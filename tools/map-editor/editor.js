import { loadJSON, downloadJSON } from "../../js/utils.js";

const TILE_SIZE = 16;
const CANVAS_W = 1248;
const CANVAS_H = 832;
const GRID_W = CANVAS_W / TILE_SIZE; // 78
const GRID_H = CANVAS_H / TILE_SIZE; // 52

const LEGEND = { AIR:0, SOLID:1, WATER:2, CAVE_AIR:3 };
const NAMES = ["AIR","SOLID","WATER","CAVE_AIR"];

const cv = document.querySelector("#cv");
const ctx = cv.getContext("2d");

const mapSelect = document.querySelector("#mapSelect");
const toolSelect = document.querySelector("#toolSelect");
const brushSelect = document.querySelector("#brushSelect");
const gridToggle = document.querySelector("#gridToggle");
const overlayToggle = document.querySelector("#overlayToggle");
const saveBtn = document.querySelector("#saveBtn");
const loadBtn = document.querySelector("#loadBtn");

const cellInfo = document.querySelector("#cellInfo");
const typeInfo = document.querySelector("#typeInfo");
const fileInfo = document.querySelector("#fileInfo");

let maps = [];
let current = null;
let bg = new Image();
let painting = false;

let selectedVal = 0; // AIR
let grid = new Uint8Array(GRID_W * GRID_H);

function rleEncode(arr){
  const out = [];
  let prev = arr[0], count = 1;
  for(let i=1;i<arr.length;i++){
    const v = arr[i];
    if(v === prev) count++;
    else { out.push([prev, count]); prev = v; count = 1; }
  }
  out.push([prev, count]);
  return out;
}

function rleDecode(rle, total){
  const out = new Uint8Array(total);
  let k = 0;
  for(const [val,count] of rle){
    out.fill(val, k, k+count);
    k += count;
  }
  return out;
}

function setActiveSwatch(val){
  selectedVal = val;
  document.querySelectorAll(".swatch").forEach(b => b.classList.toggle("active", Number(b.dataset.val) === val));
}

function getCellFromMouse(e){
  const rect = cv.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (cv.width / rect.width);
  const my = (e.clientY - rect.top) * (cv.height / rect.height);
  const cx = Math.floor(mx / TILE_SIZE);
  const cy = Math.floor(my / TILE_SIZE);
  return { cx, cy, mx, my };
}

function paintAt(cx, cy){
  const brush = Number(brushSelect.value || "1");
  const half = Math.floor(brush/2);
  for(let dy=0; dy<brush; dy++){
    for(let dx=0; dx<brush; dx++){
      const x = cx + dx - half;
      const y = cy + dy - half;
      if(x<0||y<0||x>=GRID_W||y>=GRID_H) continue;

      const idx = y*GRID_W + x;
      if(toolSelect.value === "erase") grid[idx] = 0;
      else grid[idx] = selectedVal;
    }
  }
}

function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);

  // bg
  if(bg.complete && bg.naturalWidth){
    ctx.drawImage(bg, 0, 0, cv.width, cv.height);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0,0,cv.width,cv.height);
  }

  // overlay
  if(overlayToggle.checked){
    for(let y=0;y<GRID_H;y++){
      for(let x=0;x<GRID_W;x++){
        const v = grid[y*GRID_W+x];
        if(v === 0) continue;
        if(v === 1) ctx.fillStyle = "rgba(255,255,255,0.14)";      // SOLID
        else if(v === 2) ctx.fillStyle = "rgba(84,180,255,0.18)";   // WATER
        else if(v === 3) ctx.fillStyle = "rgba(80,255,170,0.16)";   // CAVE_AIR
        ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // grid
  if(gridToggle.checked){
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for(let x=0; x<=GRID_W; x++){
      ctx.beginPath();
      ctx.moveTo(x*TILE_SIZE + 0.5, 0);
      ctx.lineTo(x*TILE_SIZE + 0.5, cv.height);
      ctx.stroke();
    }
    for(let y=0; y<=GRID_H; y++){
      ctx.beginPath();
      ctx.moveTo(0, y*TILE_SIZE + 0.5);
      ctx.lineTo(cv.width, y*TILE_SIZE + 0.5);
      ctx.stroke();
    }
  }
}

async function loadMapDef(mapId){
  current = maps.find(m=>m.id===mapId);
  if(!current) return;

  fileInfo.textContent = current.grid;

  // bg image
  bg = new Image();
  bg.src = "../" + current.image; // map_editor.html is at root; tools/ is nested
  await new Promise(res => { bg.onload = ()=>res(); bg.onerror = ()=>res(); });

  // collision json
  try{
    const coll = await loadJSON("../" + current.grid);
    if(coll && coll.encoding === "rle" && Array.isArray(coll.rle)){
      grid = rleDecode(coll.rle, GRID_W*GRID_H);
    } else if(coll && Array.isArray(coll.data)){
      grid = Uint8Array.from(coll.data);
    } else {
      grid = new Uint8Array(GRID_W*GRID_H);
    }
  } catch(e){
    grid = new Uint8Array(GRID_W*GRID_H);
  }

  draw();
}

function updateHover(e){
  const {cx, cy} = getCellFromMouse(e);
  if(cx<0||cy<0||cx>=GRID_W||cy>=GRID_H){ cellInfo.textContent="—"; typeInfo.textContent="—"; return; }
  const idx = cy*GRID_W + cx;
  cellInfo.textContent = `${cx},${cy}`;
  typeInfo.textContent = `${NAMES[grid[idx]]} (${grid[idx]})`;
}

async function init(){
  maps = await loadJSON("../data/maps.json");
  mapSelect.innerHTML = maps.map(m=>`<option value="${m.id}">${m.id} — ${m.name}</option>`).join("");

  setActiveSwatch(1); // SOLID by default
  mapSelect.addEventListener("change", ()=>loadMapDef(mapSelect.value));

  document.querySelectorAll(".swatch").forEach(btn=>{
    btn.addEventListener("click", ()=>setActiveSwatch(Number(btn.dataset.val)));
  });

  cv.addEventListener("mousemove", (e)=>{
    updateHover(e);
    if(!painting) return;
    const {cx,cy} = getCellFromMouse(e);
    if(cx<0||cy<0||cx>=GRID_W||cy>=GRID_H) return;
    paintAt(cx,cy);
    draw();
  });

  cv.addEventListener("mousedown", (e)=>{
    painting = true;
    const {cx,cy} = getCellFromMouse(e);
    if(cx<0||cy<0||cx>=GRID_W||cy>=GRID_H) return;
    paintAt(cx,cy);
    draw();
  });

  window.addEventListener("mouseup", ()=>painting=false);

  saveBtn.addEventListener("click", ()=>{
    const payload = {
      tileSize: TILE_SIZE,
      width: GRID_W,
      height: GRID_H,
      encoding: "rle",
      rle: rleEncode(grid),
      legend: LEGEND,
      note: "0=AIR 1=SOLID 2=WATER 3=CAVE_AIR"
    };
    downloadJSON(payload, current ? `${current.id}.json` : "collision.json");
  });

  loadBtn.addEventListener("click", ()=>loadMapDef(mapSelect.value));

  // redraw toggles
  gridToggle.addEventListener("change", draw);
  overlayToggle.addEventListener("change", draw);

  await loadMapDef(maps[0]?.id || "map_01");
}

init();
