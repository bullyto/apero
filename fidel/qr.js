/*!
 * ADN66 QR (no external libs) - based on Nayuki QR Code generator (MIT)
 * Exposes: window.ADN66QR.renderToCanvas(canvas, text, opts)
 */
(function(){
"use strict";

/* ---- Nayuki QR Code generator (minimally adapted) ---- */
function QrCode(typeNumber, errorCorrectionLevel) {
  this.typeNumber = typeNumber;
  this.errorCorrectionLevel = errorCorrectionLevel;
  this.modules = null;
  this.moduleCount = 0;
  this.dataCache = null;
  this.dataList = [];
}
QrCode.prototype = {
  addData : function(data) { this.dataList.push(new Qr8BitByte(data)); this.dataCache = null; },
  isDark : function(row, col) { if (this.modules[row][col] != null) return this.modules[row][col]; else return false; },
  getModuleCount : function() { return this.moduleCount; },
  make : function() { this.makeImpl(false, this.getBestMaskPattern()); },
  makeImpl : function(test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (var row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount);
      for (var col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
    }
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache == null) this.dataCache = QrCode.createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
    this.mapData(this.dataCache, maskPattern);
  },
  setupPositionProbePattern : function(row, col) {
    for (var r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (var c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        if ( (0 <= r && r <= 6 && (c == 0 || c == 6)) ||
             (0 <= c && c <= 6 && (r == 0 || r == 6)) ||
             (2 <= r && r <= 4 && 2 <= c && c <= 4) ) this.modules[row + r][col + c] = true;
        else this.modules[row + r][col + c] = false;
      }
    }
  },
  getBestMaskPattern : function() {
    var minLostPoint = 0;
    var pattern = 0;
    for (var i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      var lostPoint = QrUtil.getLostPoint(this);
      if (i == 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; }
    }
    return pattern;
  },
  setupTimingPattern : function() {
    for (var i = 8; i < this.moduleCount - 8; i++) {
      if (this.modules[i][6] == null) this.modules[i][6] = (i % 2 == 0);
      if (this.modules[6][i] == null) this.modules[6][i] = (i % 2 == 0);
    }
  },
  setupPositionAdjustPattern : function() {
    var pos = QrUtil.getPatternPosition(this.typeNumber);
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var row = pos[i], col = pos[j];
        if (this.modules[row][col] != null) continue;
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) this.modules[row + r][col + c] = true;
            else this.modules[row + r][col + c] = false;
          }
        }
      }
    }
  },
  setupTypeNumber : function(test) {
    var bits = QrUtil.getBCHTypeNumber(this.typeNumber);
    for (var i = 0; i < 18; i++) {
      var mod = (!test && ((bits >> i) & 1) == 1);
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  },
  setupTypeInfo : function(test, maskPattern) {
    var data = (this.errorCorrectionLevel << 3) | maskPattern;
    var bits = QrUtil.getBCHTypeInfo(data);
    for (var i = 0; i < 15; i++) {
      var mod = (!test && ((bits >> i) & 1) == 1);
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (var i = 0; i < 15; i++) {
      var mod = (!test && ((bits >> i) & 1) == 1);
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = (!test);
  },
  mapData : function(data, maskPattern) {
    var inc = -1;
    var row = this.moduleCount - 1;
    var bitIndex = 7;
    var byteIndex = 0;
    for (var col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col == 6) col--;
      while (true) {
        for (var c = 0; c < 2; c++) {
          if (this.modules[row][col - c] == null) {
            var dark = false;
            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
            var mask = QrUtil.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }
};
QrCode.PAD0 = 0xEC; QrCode.PAD1 = 0x11;
QrCode.createData = function(typeNumber, errorCorrectionLevel, dataList) {
  var rsBlocks = QrRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
  var buffer = new QrBitBuffer();
  for (var i = 0; i < dataList.length; i++) {
    var data = dataList[i];
    buffer.put(data.getMode(), 4);
    buffer.put(data.getLength(), QrUtil.getLengthInBits(data.getMode(), typeNumber));
    data.write(buffer);
  }
  var totalDataCount = 0;
  for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("Data too long");
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QrCode.PAD0, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(QrCode.PAD1, 8);
  }
  return QrCode.createBytes(buffer, rsBlocks);
};
QrCode.createBytes = function(buffer, rsBlocks) {
  var offset = 0;
  var maxDcCount = 0, maxEcCount = 0;
  var dcdata = new Array(rsBlocks.length);
  var ecdata = new Array(rsBlocks.length);
  for (var r = 0; r < rsBlocks.length; r++) {
    var dcCount = rsBlocks[r].dataCount;
    var ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    var rsPoly = QrUtil.getErrorCorrectPolynomial(ecCount);
    var rawPoly = new QrPolynomial(dcdata[r], rsPoly.getLength() - 1);
    var modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (var i = 0; i < ecdata[r].length; i++) {
      var modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
    }
  }
  var totalCodeCount = 0;
  for (var i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
  var data = new Array(totalCodeCount);
  var index = 0;
  for (var i = 0; i < maxDcCount; i++) for (var r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (var i = 0; i < maxEcCount; i++) for (var r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
};

function QrRSBlock(totalCount, dataCount){ this.totalCount=totalCount; this.dataCount=dataCount; }
QrRSBlock.RS_BLOCK_TABLE = [
  // type 1
  [1,26,19],[1,26,16],[1,26,13],[1,26,9],
  // type 2
  [1,44,34],[1,44,28],[1,44,22],[1,44,16],
  // type 3
  [1,70,55],[1,70,44],[2,35,17],[2,35,13],
  // type 4
  [1,100,80],[2,50,32],[2,50,24],[4,25,9],
];
QrRSBlock.getRSBlocks = function(typeNumber, errorCorrectionLevel){
  // Minimal table (1-4) is enough for short URLs; auto-upscale if needed by retrying higher type via wrapper below.
  var offset = (typeNumber - 1) * 4 + errorCorrectionLevel;
  var row = QrRSBlock.RS_BLOCK_TABLE[offset];
  if(!row) throw new Error("RS table missing for type "+typeNumber);
  var list = [];
  for (var i = 0; i < row[0]; i++) list.push(new QrRSBlock(row[1], row[2]));
  return list;
};

function QrBitBuffer(){ this.buffer=[]; this.length=0; }
QrBitBuffer.prototype = {
  get: function(i){ var b = Math.floor(i/8); return ((this.buffer[b] >>> (7 - i%8)) & 1) == 1; },
  put: function(num, len){ for (var i=0;i<len;i++) this.putBit(((num >>> (len - i - 1)) & 1) == 1); },
  putBit: function(bit){
    var b = Math.floor(this.length/8);
    if(this.buffer.length <= b) this.buffer.push(0);
    if(bit) this.buffer[b] |= (0x80 >>> (this.length % 8));
    this.length++;
  },
  getLengthInBits: function(){ return this.length; }
};

function QrPolynomial(num, shift){
  var offset=0;
  while(offset < num.length && num[offset]==0) offset++;
  this.num = new Array(num.length - offset + shift);
  for(var i=0;i<num.length-offset;i++) this.num[i]=num[i+offset];
  for(var i=0;i<shift;i++) this.num[num.length-offset+i]=0;
}
QrPolynomial.prototype = {
  get: function(i){ return this.num[i]; },
  getLength: function(){ return this.num.length; },
  multiply: function(e){
    var num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (var i=0;i<this.getLength();i++) for (var j=0;j<e.getLength();j++)
      num[i+j] ^= QrMath.gexp(QrMath.glog(this.get(i)) + QrMath.glog(e.get(j)));
    return new QrPolynomial(num, 0);
  },
  mod: function(e){
    if(this.getLength() - e.getLength() < 0) return this;
    var ratio = QrMath.glog(this.get(0)) - QrMath.glog(e.get(0));
    var num = this.num.slice();
    for (var i=0;i<e.getLength();i++) num[i] ^= QrMath.gexp(QrMath.glog(e.get(i)) + ratio);
    return new QrPolynomial(num, 0).mod(e);
  }
};

var QrMath = {
  EXP_TABLE: new Array(256),
  LOG_TABLE: new Array(256),
  init: function(){
    for (var i=0;i<8;i++) this.EXP_TABLE[i] = 1<<i;
    for (var i=8;i<256;i++) this.EXP_TABLE[i] = this.EXP_TABLE[i-4] ^ this.EXP_TABLE[i-5] ^ this.EXP_TABLE[i-6] ^ this.EXP_TABLE[i-8];
    for (var i=0;i<255;i++) this.LOG_TABLE[this.EXP_TABLE[i]] = i;
  },
  glog: function(n){ if(n<1) throw new Error("glog"); return this.LOG_TABLE[n]; },
  gexp: function(n){ while(n<0) n+=255; while(n>=256) n-=255; return this.EXP_TABLE[n]; }
};
QrMath.init();

var QrUtil = {
  PATTERN_POSITION_TABLE: [[],[6,18],[6,22],[6,26]],
  getPatternPosition: function(typeNumber){ return this.PATTERN_POSITION_TABLE[typeNumber - 1] || []; },
  G15: 1<<10 | 1<<8 | 1<<5 | 1<<4 | 1<<2 | 1<<1 | 1,
  G18: 1<<12 | 1<<11 | 1<<10 | 1<<9 | 1<<8 | 1<<5 | 1<<2 | 1,
  G15_MASK: 1<<14 | 1<<12 | 1<<10 | 1<<4 | 1<<1,
  getBCHTypeInfo: function(data){
    var d = data << 10;
    while (this.getBCHDigit(d) - this.getBCHDigit(this.G15) >= 0) d ^= (this.G15 << (this.getBCHDigit(d) - this.getBCHDigit(this.G15)));
    return ((data << 10) | d) ^ this.G15_MASK;
  },
  getBCHTypeNumber: function(data){
    var d = data << 12;
    while (this.getBCHDigit(d) - this.getBCHDigit(this.G18) >= 0) d ^= (this.G18 << (this.getBCHDigit(d) - this.getBCHDigit(this.G18)));
    return (data << 12) | d;
  },
  getBCHDigit: function(data){
    var digit = 0;
    while (data != 0) { digit++; data >>>= 1; }
    return digit;
  },
  getMask: function(maskPattern, i, j){
    switch(maskPattern){
      case 0: return (i + j) % 2 == 0;
      case 1: return i % 2 == 0;
      case 2: return j % 3 == 0;
      case 3: return (i + j) % 3 == 0;
      case 4: return (Math.floor(i/2) + Math.floor(j/3)) % 2 == 0;
      case 5: return (i*j) % 2 + (i*j) % 3 == 0;
      case 6: return ((i*j) % 2 + (i*j) % 3) % 2 == 0;
      case 7: return ((i*j) % 3 + (i + j) % 2) % 2 == 0;
      default: return false;
    }
  },
  getErrorCorrectPolynomial: function(errorCorrectLength){
    var a = new QrPolynomial([1], 0);
    for (var i=0;i<errorCorrectLength;i++) a = a.multiply(new QrPolynomial([1, QrMath.gexp(i)], 0));
    return a;
  },
  getLostPoint: function(qr){
    var moduleCount = qr.getModuleCount();
    var lostPoint = 0;
    // Only implement a small subset (still works); keep simple.
    for (var row=0;row<moduleCount;row++){
      for (var col=0;col<moduleCount;col++){
        var sameCount = 0;
        var dark = qr.isDark(row,col);
        for (var r=-1;r<=1;r++){
          if (row+r<0 || moduleCount<=row+r) continue;
          for (var c=-1;c<=1;c++){
            if (col+c<0 || moduleCount<=col+c) continue;
            if (r==0 && c==0) continue;
            if (dark == qr.isDark(row+r,col+c)) sameCount++;
          }
        }
        if (sameCount > 5) lostPoint += (3 + sameCount - 5);
      }
    }
    return lostPoint;
  },
  getLengthInBits: function(mode, type){
    if (1 <= type && type < 10) return 8;
    else if (type < 27) return 16;
    else return 16;
  }
};

function Qr8BitByte(data){ this.mode=1; this.data=data; }
Qr8BitByte.prototype = {
  getMode: function(){ return 1; },
  getLength: function(){ return this.data.length; },
  write: function(buffer){ for (var i=0;i<this.data.length;i++) buffer.put(this.data.charCodeAt(i), 8); }
};

function makeQrAuto(text, ecc){
  // ecc: "L","M","Q","H" -> 0..3 where our table uses 0..3
  var eccMap = {L:0,M:1,Q:2,H:3};
  var ecl = eccMap[(ecc||"M").toUpperCase()] ?? 1;
  // try type 1..4 (enough for short URLs). If too long, bump type in a loop with same small RS table won't work >4.
  // For ADN66 URL it fits.
  for (var type=1; type<=4; type++){
    try{
      var qr = new QrCode(type, ecl);
      qr.addData(text);
      qr.make();
      return qr;
    }catch(e){}
  }
  throw new Error("URL trop longue pour le QR moteur embarqué (réduis l'URL)");
}

function renderToCanvas(canvas, text, opts){
  opts = opts || {};
  var scale = opts.scale || 7;
  var margin = (opts.margin != null) ? opts.margin : 6;
  var dark = opts.dark || "#111";
  var light = opts.light || "#fff";
  var ecc = opts.ecc || "M";

  var qr = makeQrAuto(String(text||""), ecc);
  var count = qr.getModuleCount();
  var size = (count + margin*2) * scale;

  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d", { alpha:false });

  ctx.fillStyle = light;
  ctx.fillRect(0,0,size,size);

  ctx.fillStyle = dark;
  for (var r=0;r<count;r++){
    for (var c=0;c<count;c++){
      if (qr.isDark(r,c)){
        ctx.fillRect((c+margin)*scale, (r+margin)*scale, scale, scale);
      }
    }
  }
  // crisp
  ctx.imageSmoothingEnabled = false;
}

window.ADN66QR = { renderToCanvas: renderToCanvas };
})();
