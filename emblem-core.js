/* =====================================================================
   b'steuern Emblem-Core
   Identisch in Signatur-Generator und Emblem-Export verwenden.
   Aendert sich hier etwas, aendern sich die Dateinamen der PNGs.
   ===================================================================== */

var PALETTE = [
  { key:'IND',   label:'Indigo',      A:'#3D2BD5',          M:'rgb(143,132,231)', T:'#ECEAFB', L:'#F6F5FD' },
  { key:'IND50', label:'Indigo 50%',  A:'rgb(158,149,234)', M:'rgb(199,194,244)', T:'#ECEAFB', L:'#F6F5FD' },
  { key:'LEM',   label:'Lemon',       A:'#F6DF35',          M:'rgb(250,236,138)', T:'#FBF1AE', L:'#FEFCEE' },
  { key:'TRQ',   label:'Tuerkis',     A:'#00A1AA',          M:'rgb(107,200,206)', T:'#DDF1F2', L:'#F2FAFA' },
  { key:'CRM',   label:'Crimson',     A:'#FF0670',          M:'rgb(255,111,172)', T:'#FFE0EC', L:'#FFF4F8' }
];

function prng(seed){
  var a = seed|0;
  return function(){
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildPattern(rand){
  var cells = [], i, j;
  for(i=0;i<3;i++) for(j=0;j<3;j++){
    var p = rand();
    cells.push({ r:i, c:j, f: p<0.66?'A' : p<0.90?'M' : p<0.97?'T' : 'L', cor:null });
  }
  var n = function(f){ return cells.filter(function(x){ return x.f===f; }).length; };
  if(n('A')<5 || n('A')>7 || n('M')<1 || n('M')>3 || n('T')+n('L')>2) return null;

  var cand = cells.filter(function(x){ return x.f==='A' || x.f==='M'; });
  var want = 2 + Math.floor(rand()*3);
  var arcs = 0, circles = 0, guard = 0;
  while((arcs+circles<want || circles<1) && guard++<160){
    var x = cand[Math.floor(rand()*cand.length)];
    if(!x || x.cor) continue;
    var TL = x.r===0&&x.c===0, TR = x.r===0&&x.c===2,
        BL = x.r===2&&x.c===0, BR = x.r===2&&x.c===2;
    var opts = ['c',1,2,3,4];
    if(BL) opts = opts.filter(function(o){ return o!==4; });
    if(BR) opts = opts.filter(function(o){ return o!==3; });
    if(TL) opts = opts.filter(function(o){ return o!==3; });
    if(TR) opts = opts.filter(function(o){ return o!==4; });
    var pick = opts[Math.floor(rand()*opts.length)];
    x.cor = pick;
    if(pick==='c') circles++; else arcs++;
  }
  return circles>0 ? cells : null;
}

function allPatterns(){
  var rand = prng(4471203), out = [], seen = {}, guard = 0;
  while(out.length<35 && guard++<20000){
    var c = buildPattern(rand);
    if(!c) continue;
    var k = c.map(function(x){ return x.f + (x.cor||''); }).join('');
    if(seen[k]) continue;
    seen[k] = 1;
    out.push(c);
  }
  return out;
}

var PATTERNS = allPatterns();

/* Dateiname einer Emblem-Kachel. Muss in beiden Werkzeugen gleich sein. */
function emblemFile(patternIndex, colorIndex){
  var idx = ('0' + patternIndex).slice(-2);
  return 'emblem-' + idx + '-' + PALETTE[colorIndex].key.toLowerCase() + '-2x.png';
}

/* Zeichnet eine Kachel auf eine Canvas.
   scale 2 ergibt 220 x 268 px, Anzeigegroesse 110 x 134 px. */
function drawPolaroid(ctx, cells, pal, logoImg, scale){
  var S = 30*scale, pad = 10*scale, gap = 6*scale;
  var logoW = 90*scale, logoH = 22*scale;
  var w = 110*scale, h = 134*scale;

  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0,0,w,h);

  /* Ueberlappung gegen Blitzer.
     Zwei aneinandergrenzende Formen erzeugen an der Naht eine helle
     Linie, weil die Kantenglättung beider Formen dort nur teilweise
     deckt. Das passiert immer, wenn ein Bogen an ein Quadrat stoesst,
     und zusaetzlich bei gebrochenen Zellgroessen. Jede Zelle wird
     deshalb um B Pixel groesser gezeichnet als ihr Raster. Da von
     links oben nach rechts unten gezeichnet wird, deckt die jeweils
     spaeter gezeichnete Nachbarzelle den Ueberstand wieder zu. */
  var B = Math.max(1.5, S*0.022);

  for(var i=0;i<3;i++) for(var j=0;j<3;j++){
    var x = cells[i*3+j], px = pad + j*S, py = pad + i*S;
    ctx.fillStyle = pal[x.f];
    ctx.beginPath();
    if(x.cor==='c'){
      ctx.arc(px+S/2, py+S/2, S/2+B, 0, Math.PI*2);
    } else if(x.cor){
      var sz = S + 2*B, r = [0,0,0,0];
      if(x.cor===1) r[0]=sz;
      if(x.cor===2) r[1]=sz;
      if(x.cor===3) r[2]=sz;
      if(x.cor===4) r[3]=sz;
      if(ctx.roundRect) ctx.roundRect(px-B,py-B,sz,sz,r); else ctx.rect(px-B,py-B,sz,sz);
    } else {
      ctx.rect(px-B,py-B,S+2*B,S+2*B);
    }
    ctx.fill();
  }
  /* Wortmarke seitenverhaeltnistreu in das Feld 90 x 22 einpassen
     und darin vertikal zentrieren. Das SVG ist 118 x 22, ein festes
     Zeichnen auf 90 x 22 wuerde es stauchen. */
  if(logoImg){
    var nw = logoImg.naturalWidth  || logoImg.width  || logoW;
    var nh = logoImg.naturalHeight || logoImg.height || logoH;
    var fit = Math.min(logoW/nw, logoH/nh);
    var dw = nw*fit, dh = nh*fit;
    var bx = pad, by = pad + 3*S + gap;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logoImg, bx, by + (logoH-dh)/2, dw, dh);
  }
}
