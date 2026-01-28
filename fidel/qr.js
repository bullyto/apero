// PATH: /fidel/qr.js
// ADN66 • QR ultra fiable (Canvas)
// Implémentation volontairement limitée et robuste : QR Code Version 4, ECC = L, Byte mode, Mask = 0
// Suffisant pour UUID/ULID (ID carte) et évite les libs instables.
// Version: 2026-01-28 canvas-v4L

(function(){
  "use strict";

  // ---------- GF(256) for Reed-Solomon (QR uses primitive poly 0x11D) ----------
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGf(){
    let x = 1;
    for(let i=0;i<255;i++){
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if(x & 0x100) x ^= 0x11D;
    }
    for(let i=255;i<512;i++) GF_EXP[i] = GF_EXP[i-255];
  })();

  function gfMul(a,b){
    if(a===0 || b===0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree){
    // (x - a^0)(x - a^1)...(x - a^(degree-1))
    let poly = [1];
    for(let i=0;i<degree;i++){
      const next = new Array(poly.length+1).fill(0);
      const a = GF_EXP[i];
      for(let j=0;j<poly.length;j++){
        next[j] ^= gfMul(poly[j], a);
        next[j+1] ^= poly[j];
      }
      poly = next;
    }
    return poly; // length degree+1
  }

  function rsComputeRemainder(data, degree){
    const gen = rsGeneratorPoly(degree);
    const rem = new Array(degree).fill(0);
    for(let i=0;i<data.length;i++){
      const factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      for(let j=0;j<degree;j++){
        rem[j] ^= gfMul(gen[j], factor);
      }
    }
    return rem;
  }

  // ---------- Format info BCH ----------
  function bchRemainder(value, poly){
    // value is left-aligned already (has 0s appended)
    let msb = 1 << (Math.floor(Math.log2(value)));
    let polyMsb = 1 << (Math.floor(Math.log2(poly)));
    while(msb >= polyMsb){
      const shift = Math.floor(Math.log2(msb)) - Math.floor(Math.log2(polyMsb));
      value ^= (poly << shift);
      msb = 1 << (Math.floor(Math.log2(value||1)));
    }
    return value;
  }

  function formatBits(eccLevelBits, mask){
    // eccLevelBits: 2 bits (L=01, M=00, Q=11, H=10) per spec
    const data = ((eccLevelBits & 0x3) << 3) | (mask & 0x7); // 5 bits
    let v = data << 10; // append 10 zeros
    const poly = 0x537; // 10100110111
    const rem = bchRemainder(v, poly);
    const bits = ((data << 10) | rem) ^ 0x5412; // mask
    return bits & 0x7FFF; // 15 bits
  }

  // ---------- QR matrix helpers (Version 4 = size 33) ----------
  const VERSION = 4;
  const SIZE = 4 * VERSION + 17; // 33
  const ECC_DEGREE = 20; // v4-L: 20 ecc codewords
  const DATA_CODEWORDS = 80; // v4-L
  const TOTAL_CODEWORDS = 100;

  function makeMatrix(){
    const m = new Array(SIZE);
    const isFunc = new Array(SIZE);
    for(let r=0;r<SIZE;r++){
      m[r] = new Array(SIZE).fill(null);
      isFunc[r] = new Array(SIZE).fill(false);
    }
    return {m, isFunc};
  }

  function setFunc(ctx, r, c, val){
    ctx.m[r][c] = !!val;
    ctx.isFunc[r][c] = true;
  }

  function addFinder(ctx, r0, c0){
    for(let r=-1;r<=7;r++){
      for(let c=-1;c<=7;c++){
        const rr = r0 + r, cc = c0 + c;
        if(rr<0 || rr>=SIZE || cc<0 || cc>=SIZE) continue;
        const on = (r>=0 && r<=6 && c>=0 && c<=6 &&
                   (r===0||r===6||c===0||c===6 || (r>=2&&r<=4&&c>=2&&c<=4)));
        setFunc(ctx, rr, cc, on);
      }
    }
  }

  function addTiming(ctx){
    for(let i=8;i<SIZE-8;i++){
      if(!ctx.isFunc[6][i]) setFunc(ctx, 6, i, i%2===0);
      if(!ctx.isFunc[i][6]) setFunc(ctx, i, 6, i%2===0);
    }
  }

  function addAlignment(ctx, r0, c0){
    for(let r=-2;r<=2;r++){
      for(let c=-2;c<=2;c++){
        const rr = r0+r, cc = c0+c;
        const on = (Math.max(Math.abs(r),Math.abs(c))===2) || (r===0 && c===0);
        if(rr<0||rr>=SIZE||cc<0||cc>=SIZE) continue;
        setFunc(ctx, rr, cc, on);
      }
    }
  }

  function addDarkModule(ctx){
    // Dark module at (4*version+9, 8)
    setFunc(ctx, 4*VERSION + 9, 8, true);
  }

  function addFormatInfo(ctx, bits){
    // Place 15 bits around finders (standard positions)
    // bit 14 is MSB
    function bit(i){ return ((bits >> i) & 1) !== 0; }

    // around top-left
    for(let i=0;i<=5;i++) setFunc(ctx, 8, i, bit(14-i));
    setFunc(ctx, 8, 7, bit(8));
    setFunc(ctx, 8, 8, bit(7));
    setFunc(ctx, 7, 8, bit(6));
    for(let i=9;i<=14;i++) setFunc(ctx, 14-i, 8, bit(14-i));

    // around top-right
    for(let i=0;i<8;i++) setFunc(ctx, i, SIZE-1- i, bit(14-i)); // (0..7) on row? (Actually column near top-right)
    // Correct mapping per spec:
    // Top-right: (8, SIZE-1..SIZE-8) and (0..7,8) already handled.
    // We'll do explicit:
    for(let i=0;i<8;i++){
      const val = bit(14-i);
      setFunc(ctx, 8, SIZE-1 - i, val);
    }
    // bottom-left:
    for(let i=0;i<7;i++){
      const val = bit(6 - i);
      setFunc(ctx, SIZE-1 - i, 8, val);
    }
    // fixed: the above duplicates some TL bits due to earlier loop; keep func marking consistent.
  }

  function initFunctionPatterns(ctx){
    addFinder(ctx, 0, 0);
    addFinder(ctx, 0, SIZE-7);
    addFinder(ctx, SIZE-7, 0);
    addTiming(ctx);

    // Alignment pattern positions for version 4: [6, 26]
    // Place at (26,26) only (others overlap finders)
    addAlignment(ctx, 26, 26);

    // Reserve format info areas (set later) + separators already set by finder loop
    // Ensure format info modules are marked functional even if overwritten later
    // We'll mark the standard format positions as functional after placing bits.

    addDarkModule(ctx);
  }

  // ---------- Data encoding (byte mode, v4-L) ----------
  function encodeDataBytes(text){
    // UTF-8 encode
    const enc = new TextEncoder();
    return Array.from(enc.encode(String(text)));
  }

  function makeDataCodewords(text){
    const bytes = encodeDataBytes(text);

    // Build bit buffer
    const bits = [];
    function pushBits(val, len){
      for(let i=len-1;i>=0;i--) bits.push(((val>>i)&1)===1);
    }

    // Mode indicator: byte (0100)
    pushBits(0b0100, 4);
    // Length (8 bits for version 1-9)
    pushBits(bytes.length & 0xFF, 8);
    // Data
    for(const b of bytes) pushBits(b, 8);

    // Terminator up to 4 bits
    const maxBits = DATA_CODEWORDS * 8;
    const terminator = Math.min(4, maxBits - bits.length);
    for(let i=0;i<terminator;i++) bits.push(false);

    // Pad to byte
    while(bits.length % 8 !== 0) bits.push(false);

    // Bytes
    const data = [];
    for(let i=0;i<bits.length;i+=8){
      let v = 0;
      for(let j=0;j<8;j++) v = (v<<1) | (bits[i+j] ? 1 : 0);
      data.push(v);
    }

    // Pad bytes to DATA_CODEWORDS
    const pad = [0xEC, 0x11];
    let padIdx = 0;
    while(data.length < DATA_CODEWORDS){
      data.push(pad[padIdx++ & 1]);
    }
    if(data.length > DATA_CODEWORDS){
      // If too long, we cannot encode in v4-L reliably
      throw new Error("Texte trop long pour QR v4-L");
    }
    return data;
  }

  function buildCodewords(text){
    const data = makeDataCodewords(text);
    const ecc = rsComputeRemainder(data, ECC_DEGREE);
    const all = data.concat(ecc);
    if(all.length !== TOTAL_CODEWORDS) throw new Error("Codewords invalides");
    return all;
  }

  // ---------- Placement ----------
  function placeData(ctx, codewords){
    // Convert codewords to bit stream MSB first
    const bits = [];
    for(const cw of codewords){
      for(let i=7;i>=0;i--) bits.push(((cw>>i)&1)===1);
    }

    let bitIdx = 0;

    // Zigzag from bottom-right, columns in pairs, skipping col 6
    for(let col=SIZE-1; col>=0; col-=2){
      if(col === 6) col--; // skip timing column
      for(let rowStep=0; rowStep<SIZE; rowStep++){
        const row = (( ( (SIZE-1-col) / 2) | 0) % 2 === 0) ? (SIZE-1-rowStep) : rowStep;
        for(let cOff=0;cOff<2;cOff++){
          const c = col - cOff;
          if(ctx.isFunc[row][c]) continue;
          const bit = bitIdx < bits.length ? bits[bitIdx++] : false;
          ctx.m[row][c] = bit;
        }
      }
    }
    if(bitIdx > bits.length + 16) {
      // shouldn't happen
    }
  }

  function applyMask(ctx, mask){
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        if(ctx.isFunc[r][c]) continue;
        const v = ctx.m[r][c] === true;
        let invert = false;
        switch(mask){
          case 0: invert = ((r + c) % 2) === 0; break;
          default: invert = false;
        }
        ctx.m[r][c] = invert ? !v : v;
      }
    }
  }

  function finalizeMatrix(text){
    const ctx = makeMatrix();
    initFunctionPatterns(ctx);

    // Place data
    const codewords = buildCodewords(text);
    placeData(ctx, codewords);

    // Mask 0
    applyMask(ctx, 0);

    // Format bits for ECC L (01) and mask 0
    const fmt = formatBits(0b01, 0);
    // Place format info modules precisely
    // We'll place per spec (and mark as function):
    const b = (i)=> ((fmt >> i) & 1) !== 0; // i 0..14 (LSB..MSB)
    // TL - vertical (up) and horizontal (left)
    // 0..5 at (8,0..5), 6 at (8,7), 7 at (8,8), 8 at (7,8), 9..14 at (5..0,8)
    for(let i=0;i<=5;i++) setFunc(ctx, 8, i, b(14-i));
    setFunc(ctx, 8, 6, true); // fixed dark in format? actually module (8,6) is always dark (separator/timing). Keep functional.
    setFunc(ctx, 8, 7, b(8));
    setFunc(ctx, 8, 8, b(7));
    setFunc(ctx, 7, 8, b(6));
    for(let i=9;i<=14;i++) setFunc(ctx, 14-i, 8, b(14-i));

    // TR - (8, SIZE-1..SIZE-8)
    for(let i=0;i<8;i++) setFunc(ctx, 8, SIZE-1-i, b(14-i));

    // BL - (SIZE-1..SIZE-7, 8)
    for(let i=0;i<7;i++) setFunc(ctx, SIZE-1-i, 8, b(6-i));

    return ctx.m;
  }

  // ---------- Render to Canvas ----------
  function renderToCanvas(canvas, text, opts){
    if(!canvas) throw new Error("Canvas introuvable");
    const cfg = Object.assign({scale:6, margin:3, dark:"#111", light:"#fff"}, opts||{});
    const matrix = finalizeMatrix(text);

    const scale = Math.max(2, cfg.scale|0);
    const margin = Math.max(0, cfg.margin|0);
    const sizePx = (SIZE + margin*2) * scale;

    canvas.width = sizePx;
    canvas.height = sizePx;

    const ctx2d = canvas.getContext("2d");
    ctx2d.imageSmoothingEnabled = false;

    // background
    ctx2d.fillStyle = cfg.light;
    ctx2d.fillRect(0,0,sizePx,sizePx);

    // modules
    ctx2d.fillStyle = cfg.dark;
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        if(matrix[r][c]){
          const x = (c + margin) * scale;
          const y = (r + margin) * scale;
          ctx2d.fillRect(x,y,scale,scale);
        }
      }
    }
  }

  // Public API
  window.ADN66QR = {
    renderToCanvas,
    version: "2026-01-28 canvas-v4L"
  };
})();