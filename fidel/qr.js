// PATH: /fidel/qr.js
// ADN66 • QR ultra fiable (Canvas) — SAFE ENGINE
// Basé sur "QR Code generator library" (Project Nayuki) - implémentation robuste.
// Version: 2026-01-28 safe-qrcodegen
// Usage: window.ADN66QR.renderToCanvas(canvas, text, {scale, margin})

(function(){
  "use strict";

  /*
   * QR Code generator library (JavaScript)
   * Copyright (c) Project Nayuki.
   * https://www.nayuki.io/page/qr-code-generator-library
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy of
   * this software and associated documentation files (the "Software"), to deal in
   * the Software without restriction, including without limitation the rights to
   * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
   * the Software, and to permit persons to whom the Software is furnished to do so,
   * subject to the following conditions:
   * - The above copyright notice and this permission notice shall be included in
   *   all copies or substantial portions of the Software.
   * - The Software is provided "as is", without warranty of any kind.
   */

  // ---- qrcodegen (compact) ----
  const qrcodegen = {};
  qrcodegen.QrCode = class QrCode {

    static Ecc = class Ecc {
      constructor(ord, fb) { this.ordinal = ord; this.formatBits = fb; }
      static LOW      = new qrcodegen.QrCode.Ecc(0, 1);
      static MEDIUM   = new qrcodegen.QrCode.Ecc(1, 0);
      static QUARTILE = new qrcodegen.QrCode.Ecc(2, 3);
      static HIGH     = new qrcodegen.QrCode.Ecc(3, 2);
    };

    static encodeText(text, ecl) {
      const segs = qrcodegen.QrSegment.makeSegments(text);
      return qrcodegen.QrCode.encodeSegments(segs, ecl);
    }

    static encodeSegments(segs, ecl, minVersion=1, maxVersion=40, mask=-1, boostEcl=true) {
      if(!(1 <= minVersion && minVersion <= maxVersion && maxVersion <= 40) || mask < -1 || mask > 7)
        throw new RangeError("Paramètres invalides");

      let version, dataUsedBits;
      for(version = minVersion; ; version++){
        const dataCapBits = qrcodegen.QrCode.getNumDataCodewords(version, ecl) * 8;
        dataUsedBits = qrcodegen.QrSegment.getTotalBits(segs, version);
        if(dataUsedBits != null && dataUsedBits <= dataCapBits) break;
        if(version >= maxVersion) throw new RangeError("Texte trop long pour QR");
      }

      for(const newEcl of [qrcodegen.QrCode.Ecc.MEDIUM, qrcodegen.QrCode.Ecc.QUARTILE, qrcodegen.QrCode.Ecc.HIGH]){
        if(!boostEcl) break;
        if(newEcl.ordinal <= ecl.ordinal) continue;
        if(dataUsedBits <= qrcodegen.QrCode.getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
      }

      const bb = [];
      for(const seg of segs){
        qrcodegen.QrCode.appendBits(seg.mode.modeBits, 4, bb);
        qrcodegen.QrCode.appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
        for(const b of seg.getData()) bb.push(b);
      }
      const dataCapBits = qrcodegen.QrCode.getNumDataCodewords(version, ecl) * 8;
      qrcodegen.QrCode.appendBits(0, Math.min(4, dataCapBits - bb.length), bb);
      qrcodegen.QrCode.appendBits(0, (8 - bb.length % 8) % 8, bb);

      for(let padByte=0xEC; bb.length < dataCapBits; padByte ^= 0xEC ^ 0x11){
        qrcodegen.QrCode.appendBits(padByte, 8, bb);
      }

      const dataCodewords = [];
      for(let i=0; i<bb.length; i+=8){
        let val = 0;
        for(let j=0;j<8;j++) val = (val<<1) | (bb[i+j] ? 1 : 0);
        dataCodewords.push(val);
      }

      const qr = new qrcodegen.QrCode(version, ecl, dataCodewords, mask);
      qr.drawFunctionPatterns();
      const allCodewords = qr.addEccAndInterleave(dataCodewords);
      qr.drawCodewords(allCodewords);
      qr.applyMask(qr.mask);
      qr.drawFormatBits(qr.mask);
      qr.isFunction = null;
      return qr;
    }

    constructor(ver, ecl, dataCodewords, mask) {
      this.version = ver;
      this.errorCorrectionLevel = ecl;
      this.size = ver * 4 + 17;
      this.mask = mask;
      this.modules = Array.from({length:this.size}, () => Array(this.size).fill(false));
      this.isFunction = Array.from({length:this.size}, () => Array(this.size).fill(false));

      if(mask === -1){
        let minPenalty = 1e9;
        let bestMask = 0;
        for(let i=0;i<8;i++){
          this.drawFunctionPatterns();
          const all = this.addEccAndInterleave(dataCodewords);
          this.drawCodewords(all);
          this.applyMask(i);
          this.drawFormatBits(i);
          const p = this.getPenaltyScore();
          if(p < minPenalty){ minPenalty = p; bestMask = i; }
          this.applyMask(i);
        }
        this.mask = bestMask;
      }
    }

    getModule(x, y){ return this.modules[y][x]; }

    drawFunctionPatterns() {
      for(let i=0;i<this.size;i++){
        this.setFunctionModule(6, i, i%2===0);
        this.setFunctionModule(i, 6, i%2===0);
      }
      this.drawFinderPattern(3,3);
      this.drawFinderPattern(this.size-4,3);
      this.drawFinderPattern(3,this.size-4);

      const alignPatPos = qrcodegen.QrCode.getAlignmentPatternPositions(this.version);
      const numAlign = alignPatPos.length;
      for(let i=0;i<numAlign;i++){
        for(let j=0;j<numAlign;j++){
          if((i===0 && j===0) || (i===0 && j===numAlign-1) || (i===numAlign-1 && j===0)) continue;
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }

      this.drawFormatBits(0);
      this.drawVersion();
      this.setFunctionModule(8, this.size-8, true);
    }

    drawFormatBits(mask) {
      const data = (this.errorCorrectionLevel.formatBits << 3) | mask;
      let rem = data;
      for(let i=0;i<10;i++) rem = (rem<<1) ^ (((rem>>>9)&1) * 0x537);
      const bits = ((data<<10) | (rem & 0x3FF)) ^ 0x5412;

      for(let i=0;i<=5;i++) this.setFunctionModule(8, i, ((bits>>>i)&1) !== 0);
      this.setFunctionModule(8, 7, ((bits>>>6)&1) !== 0);
      this.setFunctionModule(8, 8, ((bits>>>7)&1) !== 0);
      this.setFunctionModule(7, 8, ((bits>>>8)&1) !== 0);
      for(let i=9;i<15;i++) this.setFunctionModule(14-i, 8, ((bits>>>i)&1) !== 0);

      for(let i=0;i<8;i++) this.setFunctionModule(this.size-1-i, 8, ((bits>>>i)&1) !== 0);
      for(let i=8;i<15;i++) this.setFunctionModule(8, this.size-15+i, ((bits>>>i)&1) !== 0);

      this.setFunctionModule(8, 6, true);
    }

    drawVersion() {
      if(this.version < 7) return;
      let rem = this.version;
      for(let i=0;i<12;i++) rem = (rem<<1) ^ (((rem>>>11)&1) * 0x1F25);
      const bits = (this.version<<12) | (rem & 0xFFF);

      for(let i=0;i<18;i++){
        const bit = ((bits>>>i)&1) !== 0;
        const a = this.size-11 + (i%3);
        const b = Math.floor(i/3);
        this.setFunctionModule(a, b, bit);
        this.setFunctionModule(b, a, bit);
      }
    }

    drawFinderPattern(x, y) {
      for(let dy=-4;dy<=4;dy++){
        for(let dx=-4;dx<=4;dx++){
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx, yy = y + dy;
          if(0<=xx && xx<this.size && 0<=yy && yy<this.size)
            this.setFunctionModule(xx, yy, dist!==2 && dist!==4);
        }
      }
    }

    drawAlignmentPattern(x, y) {
      for(let dy=-2;dy<=2;dy++){
        for(let dx=-2;dx<=2;dx++)
          this.setFunctionModule(x+dx, y+dy, Math.max(Math.abs(dx),Math.abs(dy)) !== 1);
      }
    }

    setFunctionModule(x,y,isDark){
      this.modules[y][x] = isDark;
      this.isFunction[y][x] = true;
    }

    addEccAndInterleave(data) {
      const ver = this.version, ecl = this.errorCorrectionLevel;
      const numBlocks = qrcodegen.QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
      const blockEccLen = qrcodegen.QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
      const rawCodewords = qrcodegen.QrCode.getNumRawDataModules(ver) / 8 | 0;
      const numShortBlocks = numBlocks - rawCodewords % numBlocks;
      const shortBlockLen = (rawCodewords / numBlocks | 0);

      const blocks = [];
      const rsDiv = qrcodegen.QrCode.reedSolomonComputeDivisor(blockEccLen);
      let k = 0;
      for(let i=0;i<numBlocks;i++){
        const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
        const dat = data.slice(k, k + datLen);
        k += datLen;
        const ecc = qrcodegen.QrCode.reedSolomonComputeRemainder(dat, rsDiv);
        if(i < numShortBlocks) dat.push(0);
        blocks.push(dat.concat(ecc));
      }

      const result = [];
      for(let i=0;i<blocks[0].length;i++){
        for(let j=0;j<blocks.length;j++){
          if(i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
            result.push(blocks[j][i]);
        }
      }
      return result;
    }

    drawCodewords(data) {
      let i = 0;
      for(let right=this.size-1; right>=1; right-=2){
        if(right === 6) right--;
        for(let vert=0; vert<this.size; vert++){
          for(let j=0;j<2;j++){
            const x = right - j;
            const y = ((right + 1) & 2) === 0 ? this.size-1-vert : vert;
            if(!this.isFunction[y][x]){
              this.modules[y][x] = ((data[i>>>3] >>> (7 - (i & 7))) & 1) !== 0;
              i++;
            }
          }
        }
      }
    }

    applyMask(mask) {
      for(let y=0;y<this.size;y++){
        for(let x=0;x<this.size;x++){
          if(this.isFunction[y][x]) continue;
          let invert = false;
          switch(mask){
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x/3) + Math.floor(y/2)) % 2 === 0; break;
            case 5: invert = (x*y % 2 + x*y % 3) === 0; break;
            case 6: invert = ((x*y % 2 + x*y % 3) % 2) === 0; break;
            case 7: invert = ((x + y) % 2 + x*y % 3) % 2 === 0; break;
          }
          this.modules[y][x] = this.modules[y][x] ^ invert;
        }
      }
    }

    getPenaltyScore() {
      let result = 0;
      const size = this.size;
      for(let y=0;y<size;y++){
        let runColor = false;
        let runLen = 0;
        const row = this.modules[y];
        for(let x=0;x<size;x++){
          const color = row[x];
          if(x===0 || color !== runColor){
            if(runLen >= 5) result += 3 + (runLen - 5);
            runColor = color; runLen = 1;
          }else runLen++;
        }
        if(runLen >= 5) result += 3 + (runLen - 5);
      }
      for(let x=0;x<size;x++){
        let runColor = false;
        let runLen = 0;
        for(let y=0;y<size;y++){
          const color = this.modules[y][x];
          if(y===0 || color !== runColor){
            if(runLen >= 5) result += 3 + (runLen - 5);
            runColor = color; runLen = 1;
          }else runLen++;
        }
        if(runLen >= 5) result += 3 + (runLen - 5);
      }

      for(let y=0;y<size-1;y++){
        for(let x=0;x<size-1;x++){
          const c = this.modules[y][x];
          if(c === this.modules[y][x+1] && c === this.modules[y+1][x] && c === this.modules[y+1][x+1]) result += 3;
        }
      }

      const patterns = [
        [true,false,true,true,true,false,true,false,false,false,false],
        [false,false,false,false,true,false,true,true,true,false,true],
      ];
      for(let y=0;y<size;y++){
        for(let x=0;x<=size-11;x++){
          for(const pat of patterns){
            let ok = true;
            for(let k=0;k<11;k++){ if(this.modules[y][x+k] !== pat[k]){ ok=false; break; } }
            if(ok) result += 40;
          }
        }
      }
      for(let x=0;x<size;x++){
        for(let y=0;y<=size-11;y++){
          for(const pat of patterns){
            let ok = true;
            for(let k=0;k<11;k++){ if(this.modules[y+k][x] !== pat[k]){ ok=false; break; } }
            if(ok) result += 40;
          }
        }
      }

      let dark = 0;
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(this.modules[y][x]) dark++;
      const total = size*size;
      const k = Math.abs(dark*20 - total*10) / total;
      result += (Math.floor(k) * 10);
      return result;
    }

    static appendBits(val, len, bb){
      for(let i=len-1;i>=0;i--) bb.push(((val>>>i)&1) !== 0);
    }

    static getNumRawDataModules(ver) {
      let result = (16*ver + 128)*ver + 64;
      if(ver >= 2){
        const numAlign = Math.floor(ver/7) + 2;
        result -= (25*numAlign - 10)*numAlign - 55;
        if(ver >= 7) result -= 36;
      }
      return result;
    }

    static getNumDataCodewords(ver, ecl){
      return (qrcodegen.QrCode.getNumRawDataModules(ver) / 8 | 0)
        - qrcodegen.QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver]
        * qrcodegen.QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    }

    static getAlignmentPatternPositions(ver) {
      if(ver === 1) return [];
      const numAlign = Math.floor(ver/7) + 2;
      const step = (ver === 32) ? 26 : Math.ceil((ver*4 + 17 - 13) / (numAlign*2 - 2)) * 2;
      const result = [6];
      for(let pos=ver*4+17-7; result.length < numAlign; pos -= step) result.splice(1,0,pos);
      return result;
    }

    static reedSolomonComputeDivisor(degree){
      const result = [];
      for(let i=0;i<degree-1;i++) result.push(0);
      result.push(1);
      let root = 1;
      for(let i=0;i<degree;i++){
        for(let j=0;j<result.length;j++){
          result[j] = qrcodegen.QrCode.reedSolomonMultiply(result[j], root);
          if(j+1 < result.length) result[j] ^= result[j+1];
        }
        root = qrcodegen.QrCode.reedSolomonMultiply(root, 0x02);
      }
      return result;
    }

    static reedSolomonComputeRemainder(data, divisor){
      const result = divisor.map(_=>0);
      for(const b of data){
        const factor = b ^ result.shift();
        result.push(0);
        for(let i=0;i<result.length;i++)
          result[i] ^= qrcodegen.QrCode.reedSolomonMultiply(divisor[i], factor);
      }
      return result;
    }

    static reedSolomonMultiply(x, y){
      if(x === 0 || y === 0) return 0;
      let z = 0;
      for(let i=7;i>=0;i--){
        z = (z << 1) ^ (((z >>> 7) & 1) * 0x11D);
        if(((y >>> i) & 1) !== 0) z ^= x;
      }
      return z;
    }

    static ECC_CODEWORDS_PER_BLOCK = [
      [-1, 7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
      [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
      [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
      [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    ];

    static NUM_ERROR_CORRECTION_BLOCKS = [
      [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
      [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
      [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
      [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
    ];
  };

  qrcodegen.QrSegment = class QrSegment {
    static Mode = class Mode {
      constructor(modeBits, ...ccBits) { this.modeBits = modeBits; this.charCountBits = ccBits; }
      numCharCountBits(ver) { return this.charCountBits[(ver + 7) / 17 | 0]; }
      static BYTE = new qrcodegen.QrSegment.Mode(0x4, 8, 16, 16);
    };

    constructor(mode, numChars, data){
      this.mode = mode;
      this.numChars = numChars;
      this.bitData = data;
    }
    getData(){ return this.bitData; }

    static makeSegments(text){
      return [qrcodegen.QrSegment.makeBytes(new TextEncoder().encode(String(text)))];
    }
    static makeBytes(data){
      const bb = [];
      for(const b of data){
        for(let i=7;i>=0;i--) bb.push(((b>>>i)&1)!==0);
      }
      return new qrcodegen.QrSegment(qrcodegen.QrSegment.Mode.BYTE, data.length, bb);
    }
    static getTotalBits(segs, ver){
      let result = 0;
      for(const seg of segs){
        const ccbits = seg.mode.numCharCountBits(ver);
        if(seg.numChars >= (1<<ccbits)) return null;
        result += 4 + ccbits + seg.bitData.length;
      }
      return result;
    }
  };

  function renderToCanvas(canvas, text, opts){
    if(!canvas) throw new Error("Canvas introuvable");
    const cfg = Object.assign({scale:7, margin:4, dark:"#111", light:"#fff", ecc:"M"}, opts||{});
    const ecc = (String(cfg.ecc||"M").toUpperCase() === "H") ? qrcodegen.QrCode.Ecc.HIGH
              : (String(cfg.ecc||"M").toUpperCase() === "Q") ? qrcodegen.QrCode.Ecc.QUARTILE
              : (String(cfg.ecc||"M").toUpperCase() === "L") ? qrcodegen.QrCode.Ecc.LOW
              : qrcodegen.QrCode.Ecc.MEDIUM;

    const qr = qrcodegen.QrCode.encodeText(String(text||""), ecc);

    const scale = Math.max(3, cfg.scale|0);
    const margin = Math.max(4, cfg.margin|0);
    const sizePx = (qr.size + margin*2) * scale;

    canvas.width = sizePx;
    canvas.height = sizePx;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cfg.light;
    ctx.fillRect(0,0,sizePx,sizePx);
    ctx.fillStyle = cfg.dark;

    for(let y=0;y<qr.size;y++){
      for(let x=0;x<qr.size;x++){
        if(qr.getModule(x,y)){
          ctx.fillRect((x+margin)*scale, (y+margin)*scale, scale, scale);
        }
      }
    }
  }

  window.ADN66QR = {
    renderToCanvas,
    version: "2026-01-28 safe-qrcodegen"
  };
})();