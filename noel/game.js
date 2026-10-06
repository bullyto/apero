(()=>{
'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const W=420,H=700,MAX_ICE=300,MAX_FX=360,MAX_DAMAGE_LABELS=20,STEP=1/60,LEVEL_COUNT=10,MAX_RANK=5;
const PROGRESS_SAVING=Boolean(window.RUSH_CONFIG?.saveProgress);
const TEST_START_COINS=Math.max(0,Math.floor(Number(window.RUSH_CONFIG?.testCoins)||0));
const CRIT_CHANCE=.10,LEVEL_10_CRIT_CHANCE=.12,LEVEL_10_DAMAGE=1.05,LATE_LEVEL_LIFE=1.05,SURVIVAL_LIFE=1.05,LEVEL_10_LIFE=1.08,CRIT_MULTIPLIER=1.5,SPECIAL_DAMAGE=1.08*.75*.85,SPECIAL_CADENCE=1.12,SPECIAL_DURATION=8;
const DAMAGE_FAN=[[-118,-84],[118,-84],[-86,-121],[86,-121],[-48,-153],[48,-153]];
const colors={ice:'#e6f7ff',cyan:'#5db7ee',mint:'#ccecff',gold:'#f6cf8a',green:'#81e99a',red:'#f18190'};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t,rnd=(a,b)=>a+Math.random()*(b-a),fmt=n=>Math.floor(n).toLocaleString('fr-FR');
let fxSeed=382874;function fxRnd(a,b){fxSeed=(Math.imul(fxSeed,1664525)+1013904223)>>>0;return a+(b-a)*fxSeed/4294967296}
const BOTTLE_COINS=[0,0,0,0,0,15,20,25,30,0];
const CANNON_CUT=[0,.1,.6,.8,2,2.1],TANK_BONUS=[0,0,3,6,9,17];
const FLOW=[7.5,9.5,12,15,1250/60,1540/60],FALL=[320,390,475,570,690,820],VELOCITY=[420,480,550,635,730,840],TANK=[110,240,480,850,1400,2800],CADENCE=[.34,.26,.20,.15,.105,.070].map((interval,rank)=>rank===0?interval:1/(1/interval-(rank===1?.3:.6)-CANNON_CUT[rank])),PACK=[18,22,28,34,42,52];
const PRICES={flow:[55,140,310,620,1100],tank:[45,110,245,490,850],gun:[65,165,370,740,1300]};
const NAMES=['Premiers flocons','Rue des lumières','Le premier magnum','Nuit givrée','La grande avenue','Sous la neige','Boulevard polaire','La nuit s’accélère','Le col des magnums','Vent du nord'];
// Fixed stages reward upgrades rather than cancelling their benefit by scaling enemies to the wallet.
const LEVELS=[
 {waves:[3,3],hp:150,speed:12.8,interval:3.3,expect:[0,0,0]},
 {waves:[3,4],hp:240,speed:15,interval:2.8,expect:[1,1,1]},
 {waves:[3,4,1],hp:330,speed:16.5,interval:2.6,boss:1800,expect:[1,1,2]},
 {waves:[4,4,3],hp:440,speed:18,interval:2.45,expect:[2,2,2]},
 {waves:[4,4,4],hp:570,speed:19.5,interval:2.2,expect:[2,2,3]},
 {waves:[4,4,2],hp:710,speed:21,interval:2.1,boss:3800,expect:[3,3,3]},
 {waves:[4,5,4],hp:850,speed:23,interval:2.0,expect:[3,3,4]},
 {waves:[6,5,4],hp:1000,speed:25,interval:1.9,expect:[4,3,4]},
 {waves:[5,5,2],hp:1170,speed:26,interval:1.85,boss:6800,expect:[4,4,5]},
 {waves:[6,5,5],hp:1380,speed:28,interval:1.8,expect:[4,4,5]},
];
let storageOK=true;
function load(key,fallback){let value;try{value=localStorage.getItem('adn66-rush-'+key)}catch{storageOK=false;return fallback}try{return value===null?fallback:JSON.parse(value)}catch{return fallback}}
function save(key,value){try{localStorage.setItem('adn66-rush-'+key,JSON.stringify(value));return true}catch{storageOK=false;return false}}
function whole(value,max=1e9){return Number.isSafeInteger(value)&&value>=0?Math.min(max,value):0}
function cleanProfile(raw){raw=raw&&typeof raw==='object'?raw:{};const u=raw.upgrades&&typeof raw.upgrades==='object'?raw.upgrades:{};return{version:1,coins:whole(raw.coins),upgrades:{flow:whole(u.flow,5),tank:whole(u.tank,5),gun:whole(u.gun,5)},cleared:whole(raw.cleared,LEVEL_COUNT),best:whole(raw.best),bestBottles:whole(raw.bestBottles),totalBottles:whole(raw.totalBottles),attempts:whole(raw.attempts),selected:clamp(whole(raw.selected,LEVEL_COUNT)||1,1,Math.min(LEVEL_COUNT,whole(raw.cleared,LEVEL_COUNT)+1))}}
let profile=cleanProfile(PROGRESS_SAVING?load('campaign-v1',{coins:TEST_START_COINS}):{coins:TEST_START_COINS}),soundOn=load('sound',true)===true,fullFX=load('effects',!matchMedia('(prefers-reduced-motion: reduce)').matches)===true;
let s=null,mode='menu',held=false,activePointer=null,aim=236,keys={},lastTime=0,accum=0,sceneTime=0,hudTimer=0,audio=null,shopReturn='menu',menuToast='',sharing=false;
function persist(){return !PROGRESS_SAVING||save('campaign-v1',profile)}
function config(){const u=profile.upgrades;return{flowRank:u.flow,tankRank:u.tank,gunRank:u.gun,flow:FLOW[u.flow],gravity:FALL[u.flow],velocity:VELOCITY[u.flow],suction:2.1+u.flow*.42,pipeSpeed:700+u.flow*115,capacity:TANK[u.tank],interval:CADENCE[u.gun],pack:PACK[u.gun]}}
const pipePoints=[{x:210,y:656},{x:31,y:656},{x:19,y:641},{x:19,y:114},{x:100,y:114}],pipeSegments=[];
let pipeLength=0;for(let i=1;i<pipePoints.length;i++){const a=pipePoints[i-1],b=pipePoints[i],d=Math.hypot(b.x-a.x,b.y-a.y);pipeSegments.push({a,b,d,start:pipeLength});pipeLength+=d}
function pipeAt(distance){const d=clamp(distance,0,pipeLength);for(const p of pipeSegments)if(d<=p.start+p.d){const t=(d-p.start)/p.d;return{x:lerp(p.a.x,p.b.x,t),y:lerp(p.a.y,p.b.y,t)}}return pipePoints.at(-1)}
function gatesAt(t,boosted){const cycle=10.5,phase=Math.floor(t/cycle),swap=phase%2===1,soon=t%cycle>cycle-1.25;return[
 {id:0,x:125+Math.sin(t*.43)*13,y:286,w:110,m:swap?3:2,c:swap?colors.green:colors.cyan,soon},
 {id:1,x:314+Math.sin(t*.67+1)*14,y:286,w:83,m:swap?2:3,c:swap?colors.cyan:colors.green,soon},
 {id:2,x:222+Math.sin(t*.63)*100,y:388,w:91,m:3,c:colors.cyan,soon:false},
 {id:3,x:122+Math.sin(t*.5)*20,y:487,w:102,m:swap?(boosted?10:5):2,c:swap?colors.green:colors.cyan,soon},
 {id:4,x:311+Math.sin(t*.6+2)*24,y:487,w:79,m:swap?2:(boosted?10:5),c:swap?colors.cyan:colors.green,soon}
]}
function heaterAt(t){const level=s?.level||1;return{x:225+Math.sin(t*(.88+level*.045)+.5)*105,y:437,w:52+level*2.3}}
const pegs=[{x:113,y:337},{x:217,y:327},{x:324,y:337}];
const icon=(id,cls='')=>'<svg class="'+cls+'" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-'+id+'"/></svg>';
const hero='<img class="hero-art" src="assets/game/owl.webp" alt="Hibou Apéro de Nuit 66">';
function resetInput(){held=false;activePointer=null;keys={}}
function haptic(ms){if(fullFX)try{navigator.vibrate?.(ms)}catch{}}
function showPanel(markup,kind){const panel=$('panel');panel.innerHTML=markup;panel.className='panel '+kind+'-panel';panel.scrollTop=0;$('overlay').hidden=false;requestAnimationFrame(()=>{if(!$('overlay').hidden)panel.querySelector('[data-focus],.primary')?.focus({preventScroll:true})})}
function wallet(){return'<div class="wallet">'+icon('coin')+'<strong>'+fmt(profile.coins)+'</strong></div>'}
function saveNotice(){return !PROGRESS_SAVING||storageOK?'':'<p class="save-notice">La sauvegarde est indisponible dans ce navigateur.</p>'}



function upgradeStat(key,rank){if(key==='flow')return fmt(FLOW[rank]*60)+'/min';if(key==='tank')return fmt(TANK[rank]);return (1/CADENCE[rank]).toLocaleString('fr-FR',{maximumFractionDigits:1})+'/s'}


function hideOverlay(){$('overlay').hidden=true;$('pauseBtn').focus({preventScroll:true})}

function resumeGame(){if(mode!=='pause')return;ensureAudio();resetInput();mode='play';accum=0;hideOverlay();updateHUD()}
function rememberScore(){if(!s)return;s.newRecord=s.score>profile.best;if(s.newRecord){profile.best=s.score;profile.bestBottles=s.smashed}persist()}
function bestUpgrade(){const expected=LEVELS[s.level-1].expect,u=profile.upgrades,keys=['flow','tank','gun'];const deficits=keys.map((k,i)=>({k,n:expected[i]-u[k]})).sort((a,b)=>b.n-a.n||(b.k==='gun'?1:0)-(a.k==='gun'?1:0));if(deficits[0].n>0)return deficits[0].k;if(s.overflow>Math.max(25,s.harvested*.12)&&u.tank<5)return 'tank';return u.gun<5?'gun':u.flow<5?'flow':u.tank<5?'tank':null}
function showEnd(){const victory=s.victory,key=bestUpgrade(),allMax=Object.values(profile.upgrades).every(n=>n===5);const mainAction=victory?'full':allMax?'retry':'end-shop';const mainLabel=victory?'Rejouer le parcours':allMax?'Retenter ce niveau':'Atelier'+(key?' · '+({flow:'débit',tank:'réservoir',gun:'canon'}[key]):'');showPanel('<p class="eyebrow">'+(victory?'PARCOURS TERMINÉ':s.newRecord?'NOUVEAU RECORD':'NIVEAU '+String(s.level).padStart(2,'0')+' / '+LEVEL_COUNT)+'</p>'+hero+'<h1 id="modalTitle">'+(victory?'Noël sauvé !':s.reason==='boss'?'Magnum échappé !':'Partie terminée !')+'</h1>'+(!victory&&s.reason==='collision'?'<p class="tagline">Une bouteille a touché le véhicule.</p>':'')+'<div class="result-score">'+fmt(s.score)+'</div><div class="result-info"><span>'+icon('bottle')+'<b>'+s.smashed+'</b></span><span>'+icon('coin')+'<b>+'+fmt(s.earned)+'</b></span><span>×<b>'+s.maxCombo+'</b></span></div><button class="primary" data-action="'+mainAction+'" data-focus>'+icon(victory||allMax?'replay':'wrench')+mainLabel+'</button><div class="result-buttons"><button class="secondary" data-action="retry">'+icon('replay')+'Rejouer</button><button class="secondary" data-action="menu">'+icon('home')+'Parcours</button></div><button class="share-button" data-action="share">'+icon('share')+'Partager mon score</button><a class="order-link" href="https://aperos.net/" target="_blank" rel="noopener">Commander '+icon('arrow')+'</a><a class="brand-link" href="https://play.google.com/store/apps/details?id=fr.aperos.nuit66" target="_blank" rel="noopener">L’application Apéro de Nuit 66 ↗</a>'+saveNotice(),'end');updateHUD()}
function finishGame(victory=false,reason='collision'){if(mode!=='play')return;cancelPendingAmmo();s.victory=victory;s.reason=reason;mode='end';resetInput();rememberScore();if(victory){profile.cleared=LEVEL_COUNT;profile.selected=LEVEL_COUNT;persist();haptic([35,70,35]);beep('wave')}showEnd();announce(victory?'Les dix niveaux sont terminés.':'Partie terminée. Les pièces gagnées sont conservées.')}
function clearLevel(){if(mode!=='play')return;cancelPendingAmmo();const bonus=credit(20+s.level*9+(LEVELS[s.level-1].boss?35:0));s.levelBonus=bonus;profile.cleared=Math.max(profile.cleared,s.level);profile.selected=Math.min(LEVEL_COUNT,s.level+1);persist();rememberScore();if(s.level===LEVEL_COUNT){finishGame(true);return}mode='clear';resetInput();showClear();beep('wave');announce('Niveau '+s.level+' terminé. Niveau '+(s.level+1)+' débloqué.')}
function showClear(){mode='clear';showPanel('<p class="eyebrow">NIVEAU '+String(s.level).padStart(2,'0')+' TERMINÉ</p><div class="clear-medal">'+icon('check')+'</div><h1 id="modalTitle">Bien joué !</h1><div class="clear-reward">'+icon('coin')+'+'+fmt(s.levelBonus)+'</div><p class="tagline">'+NAMES[s.level]+'</p><button class="primary" data-action="next" data-focus>Niveau '+String(s.level+1).padStart(2,'0')+icon('arrow')+'</button><button class="secondary" data-action="clear-shop">'+icon('wrench')+'Atelier · '+fmt(profile.coins)+'</button><button class="text-button" data-action="menu">Menu</button>'+saveNotice(),'clear');updateHUD()}
function createState(level){return{level,config:config(),t:0,stageT:0,score:0,smashed:0,earned:0,missed:0,wave:0,waveSpawned:0,waveCount:0,waveGap:0,spawnTimer:2.8,stageSpawned:0,stageResolved:0,stock:0,source:0,created:0,lost:0,harvested:0,harvestBonus:0,tankBonusCarry:50,overflow:0,allocated:0,bonusAmmo:0,fired:0,used:0,wasted:0,damageDealt:0,impactCount:0,criticalHits:0,critSeed:(Math.random()*4294967296)>>>0,charge:0,boost:0,boosts:0,boostStarted:0,combo:0,comboTimer:0,maxCombo:1,ice:[],transfers:[],shots:[],targets:[],fx:[],labels:[],rewardPoints:0,rewardCoins:0,rewardLife:0,damageLabels:[],damageSerial:0,rings:[],crashes:[],gatePulse:[0,0,0,0,0],gateSound:0,dropTimer:0,fireTimer:0,collectN:0,collectTimer:0,collectFlash:0,collectDisplay:0,stockPulse:0,overflowPulse:0,cannonKick:0,truckPulse:0,shake:0,bannerTime:0,id:0,slowMotion:0,storm:false,stormWarning:false,levelBonus:0,bossKilled:false}}
function preparationDelay(level){return level===10?.6:level>=5?.4:0}
function startGame(level=profile.selected){level=clamp(Number.isInteger(level)?level:1,1,Math.min(LEVEL_COUNT,profile.cleared+1));ensureAudio();resetInput();aim=236;profile.attempts++;profile.selected=level;persist();s=createState(level);s.waveCount=LEVELS[level-1].waves[0];s.spawnTimer=3.5+Math.min(3,level*.26)+preparationDelay(level);s.bannerTime=2;mode='play';accum=0;hideOverlay();updateHUD();announce('Niveau '+level+'. Glisse et maintiens pour préparer la réserve.')}
function nextLevel(){if(mode!=='clear'||s.level>=LEVEL_COUNT)return;ensureAudio();resetInput();s.level++;s.config=config();s.stageT=0;s.wave=0;s.waveSpawned=0;s.stageSpawned=0;s.stageResolved=0;s.waveCount=LEVELS[s.level-1].waves[0];s.waveGap=0;s.spawnTimer=1.8+preparationDelay(s.level);s.bossKilled=false;s.storm=false;s.stormWarning=false;s.combo=0;s.comboTimer=0;s.rewardLife=0;s.bannerTime=1.1;mode='play';accum=0;hideOverlay();updateHUD()}
function credit(coins,extra=0){coins=whole(coins);if(s.level>=5)coins=Math.round(coins*1.05);coins+=whole(extra);s.earned+=coins;profile.coins=Math.min(1e9,profile.coins+coins);persist();return coins}
function boost(){if(mode!=='play'||s.charge<100||s.boost>0)return;ensureAudio();s.charge=0;s.boost=SPECIAL_DURATION;s.boostStarted=s.t;s.boosts++;burst(220,530,44,colors.mint,180);ring(220,575,colors.mint,70);shake(4);beep('boost');haptic(25);announce('Tir spécial activé pendant huit secondes. Le portail vert passe à fois dix.');updateHUD()}
function updateHUD(){const v=s||{level:profile.selected,score:0,smashed:0,charge:0,boost:0,stageResolved:0,wave:0};$('levelValue').textContent=String(v.level).padStart(2,'0')+' / '+LEVEL_COUNT;$('scoreValue').textContent=fmt(v.score);$('coinsValue').textContent=fmt(profile.coins);$('bottlesValue').textContent=fmt(v.smashed);const total=LEVELS[v.level-1].waves.reduce((a,b)=>a+b,0);$('levelProgress').style.width=(v.stageResolved/total*100)+'%';$('waveValue').textContent=(v.wave+1)+' / '+LEVELS[v.level-1].waves.length;const progress=v.boost>0?v.boost/SPECIAL_DURATION:v.charge/100;$('boostProgress').style.strokeDashoffset=String(100*(1-clamp(progress,0,1)));const ready=mode==='play'&&v.charge>=100&&v.boost<=0;$('boostBtn').disabled=!ready;$('boostBtn').classList.toggle('ready',ready);$('boostBtn').classList.toggle('running',v.boost>0&&mode==='play');$('boostBtn').classList.toggle('quiet',!fullFX);$('boostBadge').textContent=v.boost>0?Math.ceil(v.boost)+'s':'×10';$('boostBtn').setAttribute('aria-label',ready?'Activer le tir spécial pendant huit secondes':v.boost>0?'Tir spécial actif, '+Math.ceil(v.boost)+' secondes restantes':'Tir spécial, '+Math.floor(v.charge)+' pour cent');$('pauseBtn').disabled=mode!=='play';updateRewardHUD(v)}
function syncSettings(){$('soundBtn').innerHTML=icon(soundOn?'sound':'muted');$('soundBtn').setAttribute('aria-label',soundOn?'Couper le son':'Activer le son');$('soundBtn').title=soundOn?'Couper le son':'Activer le son';$('soundBtn').setAttribute('aria-pressed',String(soundOn));$('soundBtn').classList.toggle('active',soundOn);$('fxBtn').setAttribute('aria-pressed',String(fullFX));$('fxBtn').setAttribute('aria-label',fullFX?'Réduire les effets':'Activer tous les effets');$('fxBtn').title=fullFX?'Réduire les effets':'Activer tous les effets';$('fxBtn').classList.toggle('active',fullFX)}
$('panel').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;const a=button.dataset.action;menuToast='';if(a==='select'){const n=Number(button.dataset.level);if(Number.isInteger(n)&&n<=Math.min(LEVEL_COUNT,profile.cleared+1)){profile.selected=n;persist();showMenu()}}else if(a==='start')startGame();else if(a==='full')startGame(1);else if(a==='resume')resumeGame();else if(a==='next')nextLevel();else if(a==='retry')startGame(s.level);else if(a==='menu'||a==='quit'){rememberScore();showMenu()}else if(a==='shop')showShop('menu');else if(a==='pause-shop')showShop('pause');else if(a==='clear-shop')showShop('clear');else if(a==='end-shop')showShop('end');else if(a==='shop-back'){if(shopReturn==='pause'){s.config=config();mode='play';pauseGame()}else if(shopReturn==='clear')showClear();else if(shopReturn==='end'){mode='end';showEnd()}else showMenu()}else if(a==='buy')buyUpgrade(button.dataset.upgrade);else if(a==='share')shareScore(button)});
$('pauseBtn').onclick=pauseGame;$('boostBtn').onclick=boost;$('boostBtn').addEventListener('pointerdown',e=>{if((e.pointerType==='mouse'&&e.button!==0)||$('boostBtn').disabled||mode!=='play')return;e.preventDefault();e.stopPropagation();boost()});$('soundBtn').onclick=()=>{soundOn=!soundOn;save('sound',soundOn);if(soundOn)ensureAudio();else if(audio)audio.suspend().catch(()=>{});syncSettings()};$('fxBtn').onclick=()=>{fullFX=!fullFX;save('effects',fullFX);syncSettings();resize();updateHUD()};
function position(e){const r=canvas.getBoundingClientRect();aim=clamp((e.clientX-r.left)*W/r.width,114,306)}
canvas.addEventListener('pointerdown',e=>{if(mode!=='play'||activePointer!==null)return;e.preventDefault();ensureAudio();position(e);held=true;activePointer=e.pointerId;try{canvas.setPointerCapture(e.pointerId)}catch{}});
canvas.addEventListener('pointermove',e=>{if(mode!=='play'||(activePointer!==null&&activePointer!==e.pointerId))return;position(e)});
function release(e){if(e.pointerId===activePointer){held=false;activePointer=null}}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='escape'||k==='p'){if(mode==='play')pauseGame();else if(mode==='pause')resumeGame();else if(mode==='shop'){if(upgradeBusy){e.preventDefault();return;}if(shopReturn==='pause'){s.config=config();mode='play';pauseGame()}else if(shopReturn==='clear')showClear();else if(shopReturn==='end'){mode='end';showEnd()}else showMenu()}e.preventDefault();return}if(mode==='play'&&(k==='b'||(k==='enter'&&e.target===document.body))){boost();e.preventDefault();return}if(mode==='play'&&['arrowleft','arrowright',' '].includes(k)){e.preventDefault();keys[k]=true;ensureAudio()}if(!$('overlay').hidden&&k==='tab'){const all=[...$('panel').querySelectorAll('button:not(:disabled),a[href]')];if(all.length&&e.shiftKey&&document.activeElement===all[0]){all.at(-1).focus();e.preventDefault()}else if(all.length&&!e.shiftKey&&document.activeElement===all.at(-1)){all[0].focus();e.preventDefault()}}});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);window.addEventListener('blur',()=>{if(mode==='play')pauseGame();resetInput()});document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame()});
function newIce(x,y,vx,vy,n=1,mask=0){return{x,y,vx,vy,n,mask,angle:rnd(-2,2),spin:rnd(-2,2),stage:'fall',suctionT:0}}
function specialRechargeFactor(level){return level>=6?1.5:level>=3?1.25:1.1}
function addCharge(n){if(s.boost>0)return;const before=s.charge,charge=s.charge+n/specialRechargeFactor(s.level);s.charge=charge>=100-1e-9?100:charge;if(before<100&&s.charge>=100){beep('ready');ring(220,635,colors.ice,20);updateHUD();announce('Tir spécial prêt au milieu à droite.')}}
function collect(p){const fraction=p.n*TANK_BONUS[s.config.tankRank]+s.tankBonusCarry,bonus=Math.floor(fraction/100),total=p.n+bonus;s.tankBonusCarry=fraction%100;s.harvestBonus+=bonus;const accepted=Math.min(total,Math.max(0,s.config.capacity-s.stock)),overflow=total-accepted;s.harvested+=total;s.stock+=accepted;s.overflow+=overflow;if(accepted){s.collectN+=accepted;s.stockPulse=1;addCharge(Math.min(p.n,accepted)*.085);burst(211,635,Math.min(6,accepted+1),colors.cyan,45);beep('collect')}if(overflow){s.overflowPulse=1;if(s.t-(s.lastOverflow||-10)>.65){s.lastOverflow=s.t;burst(220,633,8,colors.gold,70)}}}
function spawnBottle(){const l=LEVELS[s.level-1];s.waveSpawned++;s.stageSpawned++;const boss=!!l.boss&&s.wave===l.waves.length-1&&s.waveSpawned===s.waveCount;const index=s.stageSpawned+s.level;const type=boss?'boss':s.level>=2&&index%5===0?'gold':s.level>=2&&index%3===0?'frost':'normal';const factor=type==='frost'?1.38:type==='gold'?1.15:1;const baseNeed=boss?l.boss:Math.round(l.hp*(.94+(s.stageSpawned%3)*.1)*factor);const currentNeed=Math.round(baseNeed*(s.level>=8?LATE_LEVEL_LIFE:1)),need=Math.round(currentNeed*(s.level===10?LEVEL_10_LIFE:s.level>=7?SURVIVAL_LIFE:1));const scale=boss?1.27:type==='frost'?1.04:1;const x=Math.max(398,...s.targets.map(o=>o.x+o.width+20*scale+19));const o={id:++s.id,x,y:124,need,damage:0,incoming:0,boss,type,reinforced:type==='frost',kind:type==='gold'?2:type==='frost'?0:index%3,hit:0,age:0,scale,width:20*scale,speed:boss?(10+s.level*.32):l.speed*(type==='gold'?1.12:type==='frost'?.94:1),shell:type==='frost'||boss?Math.round(need*(boss?.30:.32)):0,shellBroken:false,rage:0};s.targets.push(o);if(boss){s.bannerTime=1.6;beep('wave');haptic(20);announce('Magnum en approche.')}}
function smashBottle(o){if(o.rewarded)return;o.rewarded=true;s.smashed++;s.stageResolved++;profile.totalBottles++;s.combo=s.comboTimer>0?Math.min(8,s.combo+1):1;s.comboTimer=5.1;s.maxCombo=Math.max(s.maxCombo,s.combo);const points=Math.round((100+o.need)*(o.boss?1.4:1)*s.combo);s.score+=points;const coins=credit(Math.round((8+Math.sqrt(o.need)*.55+s.level*1.8)*(o.boss?3.5:o.type==='gold'?1.65:o.type==='frost'?1.25:1)),BOTTLE_COINS[s.level-1]);if(o.type==='gold')addCharge(22);if(o.boss){s.bossKilled=true;addCharge(16)}s.truckPulse=1;rewardPopup(points,coins);burst(o.x,o.y,o.boss?55:30,o.kind===1?'#bdedd9':colors.ice,o.boss?250:190,'glass');burst(o.x,o.y,o.boss?23:12,o.kind===2?colors.gold:colors.cyan,145,'drop');burst(o.x,o.y,12,colors.gold,145);ring(o.x,o.y,colors.ice,20);ring(o.x,o.y,colors.cyan,32);s.crashes.push({x:o.x,y:o.y,life:.36});beep('smash');shake(o.boss?5:2);if(o.boss||o.type==='gold'||s.combo===8){s.slowMotion=Math.max(s.slowMotion,.16);haptic(o.boss?35:15)}}
function miss(o){if(mode!=='play')return;s.missed=1;s.stageResolved++;s.combo=0;s.comboTimer=0;burst(o.x,130,15,colors.red,65);beep('loss');shake(3);finishGame(false,o.boss?'boss':'collision')}
function powerTier(){return s.stock>=800?2:s.stock>=230?1:0}
function shotCapacity(){const factor=powerTier()===2?1.45:powerTier()===1?1.18:1;return Math.round(s.config.pack*factor*(s.boost>0?1.8:1))}
function rollCritical(){s.critSeed=(Math.imul(s.critSeed,1664525)+1013904223)>>>0;return s.critSeed/4294967296<(s.level===10?LEVEL_10_CRIT_CHANCE:CRIT_CHANCE)}
function fireInterval(){return s.config.interval*(s.boost>0?.55/SPECIAL_CADENCE:1)}
function launchTransfer(){
 if(s.transfers.length>=18)return false;
 const target=s.targets.filter(o=>!o.dead&&o.x<415&&o.need-o.damage-o.incoming>0).sort((a,b)=>a.x-b.x)[0];
 if(!target||s.stock<=0)return false;
 const boosted=s.boost>0,critical=rollCritical(),tier=powerTier(),ammoFactor=boosted?2:1;
 const multiplier=(boosted?SPECIAL_DAMAGE:1)*(s.level===10?LEVEL_10_DAMAGE:1)*(critical?CRIT_MULTIPLIER:1);
 const remaining=target.need-target.damage-target.incoming;
 const cost=Math.min(shotCapacity(),s.stock,Math.ceil(remaining/(ammoFactor*multiplier)));
 const n=cost*ammoFactor,damage=Math.round(n*multiplier);
 s.stock-=cost;s.allocated+=cost;s.bonusAmmo+=n-cost;target.incoming+=damage;
 s.transfers.push({distance:0,n,cost,damage,critical,target:target.id,boost:boosted,tier});
 return true
}
function cancelPendingAmmo(){for(const p of [...s.transfers,...s.shots]){s.wasted+=p.n;const o=s.targets.find(o=>o.id===p.target);if(o)o.incoming=Math.max(0,o.incoming-p.damage)}s.transfers=[];s.shots=[]}
function updateStorm(){const boss=s.targets.find(o=>o.boss&&!o.dead),age=boss?.age||0;const eligible=!!boss&&s.level>=9;const period=11.5,phase=(age-3)%period;s.storm=eligible&&age>=3&&phase>=1&&phase<3.8;s.stormWarning=eligible&&age>=3&&phase>=0&&phase<1}
function step(realDt){if(mode!=='play')return;let dt=realDt;if(s.slowMotion>0){s.slowMotion=Math.max(0,s.slowMotion-realDt);dt*=.4}s.t+=dt;s.stageT+=dt;s.boost=Math.max(0,s.boost-realDt);s.rewardLife=Math.max(0,s.rewardLife-dt);s.comboTimer=Math.max(0,s.comboTimer-dt);if(s.comboTimer===0)s.combo=0;for(const [key,rate]of[['bannerTime',1],['shake',15],['stockPulse',3],['overflowPulse',2],['cannonKick',12],['truckPulse',.75]])s[key]=Math.max(0,s[key]-dt*rate);s.gatePulse=s.gatePulse.map(v=>Math.max(0,v-dt*3));updateStorm();
 if(keys.arrowleft)aim=clamp(aim-260*dt,114,306);if(keys.arrowright)aim=clamp(aim+260*dt,114,306);s.dropTimer-=dt;if(held||keys[' ']){if(s.dropTimer<=0&&s.ice.length<MAX_ICE){s.ice.push(newIce(aim+rnd(-4,4),240,rnd(-13,13),45));s.source++;beep('drop');s.dropTimer=Math.max(s.dropTimer,-dt)+1/(s.config.flow*(s.boost>0?1.48:1))}}else s.dropTimer=0;
 const gates=gatesAt(s.t,s.boost>0),heater=heaterAt(s.t),next=[],children=[];
 for(const p of s.ice){if(p.stage==='suction'){p.suctionT+=dt*s.config.suction*(s.boost>0?1.25:1);const t=Math.min(1,p.suctionT),u=1-t;p.x=u*u*p.sx+2*u*t*(210+(p.sx-210)*.72)+t*t*210;p.y=u*u*p.sy+2*u*t*612+t*t*634;p.angle+=dt*8;if(t>=1){collect(p);continue}next.push(p);continue}
  const py=p.y;p.vy=Math.min(s.config.velocity,p.vy+s.config.gravity*dt);p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*.18;p.angle+=p.spin*dt;if(p.x<49||p.x>398){p.x=clamp(p.x,49,398);p.vx*=-.7}
  for(const peg of pegs){const dx=p.x-peg.x,dy=p.y-peg.y,d=Math.hypot(dx,dy);if(d<14&&d>0){const nx=dx/d,ny=dy/d;p.x=peg.x+nx*14;p.y=peg.y+ny*14;const vn=p.vx*nx+p.vy*ny;if(vn<0){p.vx-=1.5*vn*nx;p.vy-=1.5*vn*ny;p.vx+=nx*25}}}
  for(const g of gates)if(!(p.mask&(1<<g.id))&&py<g.y&&p.y>=g.y&&Math.abs(p.x-g.x)<g.w/2){const old=p.n;p.n*=g.m;s.created+=p.n-old;p.mask|=1<<g.id;s.gatePulse[g.id]=1;const desired=Math.min(g.m,5,p.n),available=Math.max(1,Math.min(desired,MAX_ICE-s.ice.length-children.length+1));if(available>1){const each=Math.floor(p.n/available);p.n-=each*(available-1);for(let j=1;j<available;j++)children.push(newIce(p.x+rnd(-4,4),g.y+2,p.vx+(j-(available-1)/2)*19+rnd(-12,12),Math.max(90,p.vy),each,p.mask))}p.vx+=rnd(-13,13);if(s.gateSound<=s.t){beep('gate');s.gateSound=s.t+.42;ring(p.x,g.y,g.c,7);burst(p.x,g.y,5,g.c,70)}}
  if(!(p.mask&32)&&py<heater.y&&p.y>=heater.y&&Math.abs(p.x-heater.x)<heater.w/2){p.mask|=32;const cut=Math.ceil(p.n/2);p.n-=cut;s.lost+=cut;burst(p.x,p.y,3,colors.red,45);if(p.n<=0)continue;p.vx+=(p.x<heater.x?-35:35)}if(p.y>=553){p.stage='suction';p.sx=p.x;p.sy=553;p.y=553;p.suctionT=0}next.push(p)
 }
 s.ice=next.concat(children);s.collectFlash=Math.max(0,s.collectFlash-dt*1.8);s.collectTimer-=dt;if(s.collectTimer<=0&&s.collectN>0){s.collectDisplay=s.collectN;s.collectFlash=1;s.collectN=0;s.collectTimer=.35}
 const l=LEVELS[s.level-1];if(s.waveGap>0){s.waveGap-=dt;if(s.waveGap<=0){s.wave++;s.waveCount=l.waves[s.wave];s.waveSpawned=0;s.spawnTimer=.45;s.bannerTime=1;beep('wave')}}else if(s.waveSpawned<s.waveCount){s.spawnTimer-=dt;if(s.spawnTimer<=0&&s.targets.length<5){spawnBottle();s.spawnTimer=l.interval}}
 for(const o of s.targets){o.age+=dt;o.x-=o.speed*dt;o.hit=Math.max(0,o.hit-dt*5);o.critFlash=Math.max(0,(o.critFlash||0)-dt);if(o.x<130){o.dead=true;miss(o);if(mode!=='play'){s.targets=s.targets.filter(o=>!o.dead);return}}}s.targets=s.targets.filter(o=>!o.dead);
 s.fireTimer-=dt;if(s.fireTimer<=0&&launchTransfer())s.fireTimer=Math.max(s.fireTimer,-dt)+fireInterval();
 const moving=[];for(const p of s.transfers){p.distance+=dt*s.config.pipeSpeed*(s.boost>0?1.4:1);if(p.distance>=pipeLength){s.shots.push({x:106,y:114,px:106,py:114,n:p.n,cost:p.cost,damage:p.damage,critical:p.critical,target:p.target,boost:p.boost,tier:p.tier,age:0});s.fired+=p.n;s.cannonKick=1;burst(107,114,2,colors.cyan,60);beep('shot')}else moving.push(p)}s.transfers=moving;
 const bullets=[];for(const p of s.shots){let o=s.targets.find(o=>o.id===p.target&&!o.dead);if(!o){o=s.targets.find(o=>!o.dead&&o.need-o.damage-o.incoming>0);if(o){p.target=o.id;o.incoming+=p.damage}}p.px=p.x;p.py=p.y;p.age+=dt;const tx=o?o.x:460,ty=o?o.y:105,dx=tx-p.x,dy=ty-p.y,dist=Math.hypot(dx,dy),speed=p.boost?820:590;if(o&&dist<speed*dt+15){o.incoming=Math.max(0,o.incoming-p.damage);const applied=Math.min(p.damage,o.need-o.damage);o.damage+=applied;s.used+=p.n;s.damageDealt+=applied;s.impactCount++;o.hit=1;if(p.critical){s.criticalHits++;o.critFlash=.12;if(fullFX)burst(o.x,o.y,4,colors.gold,90)}burst(p.x,p.y,3,colors.ice,65,'ice');if(o.shell&&!o.shellBroken&&o.damage>=o.shell){o.shellBroken=true;o.speed*=o.boss?1.08:.80;addCharge(o.boss?3:5);burst(o.x,o.y,18,colors.ice,120,'ice');ring(o.x,o.y,colors.ice,29);beep('gate')}if(o.boss&&o.damage/o.need>.65&&o.rage===0){o.rage=1;o.speed*=1.10;ring(o.x,o.y,colors.gold,30)}if(o.damage>=o.need){o.dead=true;smashBottle(o)}damagePopup(applied,sceneX(o.x),MUZZLE_Y,p.critical)}else{p.x+=dx/(dist||1)*speed*dt;p.y+=dy/(dist||1)*speed*dt;if(p.x>465||p.age>2){if(o)o.incoming=Math.max(0,o.incoming-p.damage);s.wasted+=p.n}else bullets.push(p)}}s.shots=bullets;s.targets=s.targets.filter(o=>!o.dead);
 for(const f of s.fx){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=f.kind==='glass'?190:f.kind==='drop'?130:30;f.rotation+=dt*4}s.fx=s.fx.filter(f=>f.life>0);for(const p of s.labels){p.life-=dt;p.y-=dt*22}s.labels=s.labels.filter(p=>p.life>0);for(const p of s.damageLabels){p.life-=dt;p.x=clamp(p.x+p.vx*dt,p.minX,p.maxX);p.y=Math.max(p.minY,p.y+p.vy*dt);p.vy+=220*dt}s.damageLabels=s.damageLabels.filter(p=>p.life>0);for(const p of s.rings){p.life-=dt;p.r+=dt*62}s.rings=s.rings.filter(p=>p.life>0);for(const p of s.crashes)p.life-=dt;s.crashes=s.crashes.filter(p=>p.life>0);
 if(s.waveSpawned>=s.waveCount&&!s.targets.length&&s.waveGap<=0){if(s.wave===l.waves.length-1){if(l.boss&&!s.bossKilled)finishGame(false,'boss');else clearLevel()}else s.waveGap=1.7}
}
function audit(){if(!s)return null;const falling=s.ice.reduce((v,p)=>v+p.n,0),inPipe=s.transfers.reduce((v,p)=>v+p.n,0),flying=s.shots.reduce((v,p)=>v+p.n,0);return{source:s.source,multiplied:s.created,falling,lost:s.lost,harvested:s.harvested,harvestBonus:s.harvestBonus,overflow:s.overflow,stock:s.stock,capacity:s.config.capacity,spent:s.allocated,bonusAmmo:s.bonusAmmo,inPipe,flying,used:s.used,wasted:s.wasted,damageDealt:s.damageDealt,sourceBalance:s.source+s.created+s.harvestBonus-s.lost-falling-s.harvested,ammoBalance:s.harvested+s.bonusAmmo-s.overflow-s.stock-inPipe-flying-s.used-s.wasted}}
window.iceRushSnapshot=()=>s?{mode,level:s.level,score:s.score,bottles:s.smashed,wave:s.wave+1,missed:s.missed,earned:s.earned,coins:profile.coins,charge:s.charge,boost:s.boost,storm:s.storm,particles:s.ice.length,effects:s.fx.length,damageNumbers:s.damageLabels.length,impacts:s.impactCount,criticalHits:s.criticalHits,audit:audit()}:{mode,coins:profile.coins,cleared:profile.cleared};
async function shareScore(button){if(sharing||!s)return;sharing=true;button.disabled=true;const old=button.innerHTML;button.textContent='Préparation…';try{const card=document.createElement('canvas');card.width=1080;card.height=1350;const c=card.getContext('2d'),g=c.createLinearGradient(0,0,1080,1350);g.addColorStop(0,'#183d58');g.addColorStop(.5,'#0b1c2d');g.addColorStop(1,'#071421');c.fillStyle=g;c.fillRect(0,0,1080,1350);for(let i=0;i<72;i++){c.globalAlpha=.15+(i%4)*.1;c.fillStyle=i%5===0?'#f6cf8a':'#d9f2ff';c.beginPath();c.arc((i*157+51)%1080,(i*271+31)%1350,i%6===0?4:2,0,Math.PI*2);c.fill()}c.globalAlpha=1;c.textAlign='center';c.fillStyle='#e8f7ff';c.font='800 38px system-ui,sans-serif';c.fillText('APÉRO DE NUIT 66®',540,110);c.fillStyle='#5db7ee';c.font='900 80px system-ui,sans-serif';c.fillText('GLAÇON RUSH',540,216);c.fillStyle='#f6cf8a';c.font='650 27px system-ui,sans-serif';c.fillText(s.victory?'PARCOURS DE NOËL TERMINÉ':'ÉDITION NOËL',540,266);c.fillStyle='#fff';c.font='900 148px system-ui,sans-serif';c.fillText(fmt(s.score),540,437);c.strokeStyle='#5db7ee';c.lineWidth=3;c.strokeRect(78,494,924,421);render(s.t);c.drawImage(canvas,0,0,canvas.width,Math.round(190*dpr),80,496,920,417);c.fillStyle='#d9f1ff';c.font='750 39px system-ui,sans-serif';c.fillText('NIVEAU '+String(s.level).padStart(2,'0')+' / '+LEVEL_COUNT,540,1004);c.fillStyle='#a7cee4';c.font='600 30px system-ui,sans-serif';c.fillText(s.smashed+' bouteilles cassées · Combo ×'+s.maxCombo,540,1060);c.fillStyle='#f6cf8a';c.fillText('+'+fmt(s.earned)+' pièces',540,1110);c.fillStyle='#fff';c.font='750 32px system-ui,sans-serif';c.fillText('À toi de battre ce score.',540,1192);c.fillStyle='#5db7ee';c.font='800 39px system-ui,sans-serif';c.fillText('aperos.net',540,1265);const blob=await new Promise((resolve,reject)=>card.toBlob(b=>b?resolve(b):reject(new Error('image')),'image/png'));const file=new File([blob],'Score_ADN66.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({files:[file],title:'Glaçon Rush · Apéro de Nuit 66',text:fmt(s.score)+' points · Niveau '+s.level+'/'+LEVEL_COUNT});else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);announce('Carte de score téléchargée.')}}catch(e){if(e.name!=='AbortError'){button.textContent='Partage indisponible';announce('Impossible de créer la carte de score dans ce navigateur.')}}finally{sharing=false;button.disabled=false;if(button.textContent!=='Partage indisponible')button.innerHTML=old}}

function round(x,y,w,h,r=8){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function box(x,y,w,h,color,r=8,stroke=null){ctx.fillStyle=color;round(x,y,w,h,Math.min(r,w/2,h/2));ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
function label(str,x,y,size=12,color='#e9faff',align='center',weight=750){ctx.font=weight+' '+size+'px system-ui,-apple-system,sans-serif';ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(str,x,y)}
function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
function strokeLine(points,color,width=1){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}

function effectScale(){return fullFX?1:.3}
function burst(x,y,count,color,speed=80,kind='spark'){if(!s)return;let n=Math.ceil(count*effectScale());if(kind==='glass'&&s.fx.length>MAX_FX-n)s.fx.splice(0,n);for(let i=0;i<n&&s.fx.length<MAX_FX;i++){let a=fxRnd(0,Math.PI*2),v=fxRnd(speed*.3,speed);s.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:kind==='glass'?fxRnd(.6,1.1):fxRnd(.3,.8),max:kind==='glass'?1.1:.8,color,size:fxRnd(1.3,3.6),kind,rotation:fxRnd(-3,3),upper:y<180,gunside:x<130})}}
function floating(text,x,y,color=colors.cyan,size=14){if(!s||s.labels.length>20)return;s.labels.push({text,x,y,color,size,life:1.1,max:1.1})}
function rewardPopup(points,coins){if(s.rewardLife<=0){s.rewardPoints=0;s.rewardCoins=0}s.rewardPoints+=points;s.rewardCoins+=coins;s.rewardLife=1.1;updateRewardHUD(s)}
function updateRewardHUD(v){const life=v.rewardLife||0,opacity=clamp(life/.25,0,1),offset=3+(1-life/1.1)*3;for(const [id,amount]of[['scoreGain',v.rewardPoints],['coinsGain',v.rewardCoins]]){const el=$(id);el.textContent=life>0?'+'+fmt(amount):'';el.style.opacity=String(opacity);el.style.transform='translate(-50%,'+offset+'px)'}}
function damageOverlap(x,y,width,height){
 let count=0;
 for(const p of s.damageLabels)if(p.life>.1&&Math.abs(x-p.x)<(width+p.width)/2+5&&y+4>p.y-p.height-4&&y-height-4<p.y+4)count++;
 for(const p of s.labels)if(p.life>.1&&Math.abs(x-p.x)<(width+p.text.length*p.size*.66)/2+5&&y+4>p.y-p.size-4&&y-height-4<p.y+4)count++;
 if(s.combo>1&&x+width/2>180&&x-width/2<263&&y+4>25&&y-height<63)count++;
 return count
}
function damageLabelLimit(){return MAX_DAMAGE_LABELS}
function damageDisplayBonus(){const c=s.config;return Math.floor((c.flowRank+c.tankRank+c.gunRank)/2)}
function damagePopup(amount,x,y,critical){
 if(!s||amount<=0)return;
 const lane=s.damageSerial++%DAMAGE_FAN.length,[fanX,fanY]=DAMAGE_FAN[lane],side=fanX<0?-1:1;
 const life=critical?.60:.48+(lane%3)*.04,text=fmt(amount+damageDisplayBonus()),size=(critical?18:14)*1.5;
 const width=Math.max(critical?60:0,text.length*size*.66+6),height=critical?42:24,minX=112+width/2,maxX=W-8-width/2,minY=height+8;
 const center=clamp(x,210,325),preferredX=clamp(center+side*(36+Math.floor(lane/2)*11),minX,maxX),preferredY=Math.max(minY,y-4-Math.floor(lane/2)*23);
 const limit=damageLabelLimit();
 if(s.damageLabels.length>=limit-3)for(let i=0;i<s.damageLabels.length-(limit-4);i++)s.damageLabels[i].life=Math.min(s.damageLabels[i].life,.12);
 const p=s.damageLabels.length>=limit?s.damageLabels.shift():{};
 x=preferredX;y=preferredY;let best=damageOverlap(x,y,width,height)*1e6;
 if(best>0)for(let row=0;row<5;row++)for(let column=0;column<5;column++){
  const cx=minX+column*(maxX-minX)/4,cy=Math.max(minY,48+row*44),score=damageOverlap(cx,cy,width,height)*1e6+(cx-preferredX)**2+(cy-preferredY)**2;
  if(score<best){best=score;x=cx;y=cy}
 }
 const direction=x<center?-1:1,vx=direction*Math.min(Math.abs(fanX),Math.max(0,direction<0?x-minX:maxX-x)/life);
 const vy=Math.max(fanY,(minY-y)/life-110*life);
 Object.assign(p,{amount,text,x,y,vx,vy,width,height,minX,maxX,minY,critical,size,color:critical?colors.gold:colors.ice,life,max:life,serial:s.damageSerial});
 s.damageLabels.push(p)
}
function ring(x,y,color=colors.cyan,r=9){if(s&&s.rings.length<35)s.rings.push({x,y,color,r,life:.45,upper:y<180})}
function shake(amount){if(s&&fullFX)s.shake=Math.max(s.shake,amount)}
function announce(text){$('announce').textContent=text}
// Short, reusable samples keep both cadences audible with few simultaneous voices.
let audioOutput=null,audioBank=null;
function pulseBuffer(kind,rank=0){const duration=kind==='shot'?.038:.024,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);let phase=0;for(let i=0;i<data.length;i++){const age=i/audio.sampleRate,t=i/data.length,f=kind==='shot'?lerp(430+rank*38,115,t):lerp(1840,1260,t);phase+=f/audio.sampleRate;const envelope=Math.min(1,age/.001)*Math.pow(1-t,kind==='shot'?1.6:2),wave=kind==='shot'?.78*Math.sin(phase*Math.PI*2)+.22*Math.sin(phase*Math.PI):.76*Math.sin(phase*Math.PI*2)+.24*Math.sin(phase*Math.PI*5.4);data[i]=wave*envelope}return buffer}
function breakageBuffer(){const buffer=audio.createBuffer(1,Math.round(audio.sampleRate*.085),audio.sampleRate),data=buffer.getChannelData(0);let seed=71267;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/2147483648-1)*(1-i/data.length)}return buffer}
function ensureAudio(){if(!soundOn)return;try{if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();audioOutput=audio.createDynamicsCompressor();audioOutput.threshold.value=-6;audioOutput.knee.value=3;audioOutput.ratio.value=12;audioOutput.attack.value=.002;audioOutput.release.value=.06;audioOutput.connect(audio.destination);audioBank={shot:Array.from({length:6},(_,rank)=>pulseBuffer('shot',rank)),drop:pulseBuffer('drop'),smash:breakageBuffer()}}if(audio.state==='suspended')audio.resume().catch(()=>{})}catch{audio=null;audioOutput=null;audioBank=null}}
const audioTimes={};
function sampleSound(buffer,volume,now,highpass=0){const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;gain.gain.value=volume;let filter=null;if(highpass){filter=audio.createBiquadFilter();filter.type='highpass';filter.frequency.value=highpass;source.connect(filter);filter.connect(gain)}else source.connect(gain);gain.connect(audioOutput);source.onended=()=>{source.disconnect();gain.disconnect();filter?.disconnect()};source.start(now)}
function beep(kind){if(!soundOn||!audio||!audioBank||audio.state!=='running')return;const now=audio.currentTime,gap=kind==='gate'?.15:kind==='collect'?.16:kind==='smash'?.035:kind==='wave'?.15:kind==='boost'?.3:kind==='loss'?.3:kind==='ready'?.05:0;if(gap&&now-(audioTimes[kind]??-10)<gap)return;audioTimes[kind]=now;try{
const note=(f,d=.12,v=.025,delay=0,type='sine',end=f)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,now+delay);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+delay+d);g.gain.setValueAtTime(.0001,now+delay);g.gain.linearRampToValueAtTime(v*.5,now+delay+.002);g.gain.exponentialRampToValueAtTime(.0001,now+delay+d);o.connect(g);g.connect(audioOutput);o.onended=()=>{o.disconnect();g.disconnect()};o.start(now+delay);o.stop(now+delay+d+.02)};
if(kind==='shot')sampleSound(audioBank.shot[s?.config.gunRank||0],.24,now);
if(kind==='drop')sampleSound(audioBank.drop,.028,now);
if(kind==='gate'){note(650,.10,.018);note(980,.09,.012,.025)}
if(kind==='collect')note(420,.06,.015,0,'sine',600);
if(kind==='smash'){sampleSound(audioBank.smash,.0175,now,2100);note(1800,.08,.023,0,'triangle',520);note(1150,.10,.019,.025,'triangle',260);note(760,.18,.017,.04,'sine',350);note(1047,.15,.015,.13)}
if(kind==='loss')note(190,.21,.035,0,'triangle',70);
if(kind==='ready'){note(880,.2,.025);note(1320,.22,.025,.12)}
if(kind==='boost'){note(180,.6,.045,0,'sawtooth',1000);note(520,.55,.02,.1,'sine',1300)}
if(kind==='wave'){note(392,.23,.022);note(523,.3,.022,.16)}
}catch{}}

function snowflake(x,y,r,color='#d9efff',angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,r*.13);for(let i=0;i<3;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.stroke()}ctx.restore()}
function snowCap(x,y,w){ctx.fillStyle='#eaf8ff';ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+w*.15,y-4,x+w*.3,y-1);ctx.quadraticCurveTo(x+w*.55,y-5,x+w*.8,y-1);ctx.quadraticCurveTo(x+w*.95,y-4,x+w,y);ctx.lineTo(x+w,y+3);ctx.lineTo(x,y+3);ctx.fill();ctx.fillStyle='#bfe4f5';for(let i=0;i<Math.floor(w/31);i++){let q=x+13+i*31;ctx.beginPath();ctx.moveTo(q,y+2);ctx.lineTo(q+2,y+7+(i%3));ctx.lineTo(q+4,y+2);ctx.fill()}}
function pine(x,y,h,t,lit=false){ctx.save();ctx.translate(x,y);box(-2,-h*.05,4,h*.12,'#514538',1);for(let i=0;i<3;i++){let top=-h+i*h*.21,half=h*(.16+i*.065);ctx.fillStyle=i%2?'#153c42':'#15364b';ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(half,top+h*.50);ctx.lineTo(-half,top+h*.50);ctx.fill();ctx.strokeStyle='#afdded80';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,top+2);ctx.lineTo(half*.42,top+h*.22);ctx.stroke()}if(lit){for(let i=0;i<7;i++){let yy=-h*.65+i*h*.087,xx=Math.sin(i*2)*h*.12;ctx.shadowColor=i%2?colors.gold:colors.cyan;ctx.shadowBlur=fullFX?5:0;circle(xx,yy,1.3,(i%2?colors.gold:'#b7e8ff'));ctx.shadowBlur=0}snowflake(0,-h-1,3,colors.gold,t*.15)}ctx.restore()}




function bottleShape(){ctx.beginPath();ctx.moveTo(-5,-57);ctx.lineTo(5,-57);ctx.lineTo(5,-39);ctx.bezierCurveTo(5,-31,19,-32,19,-21);ctx.lineTo(19,23);ctx.quadraticCurveTo(19,28,13,28);ctx.lineTo(-13,28);ctx.quadraticCurveTo(-19,28,-19,23);ctx.lineTo(-19,-21);ctx.bezierCurveTo(-19,-32,-5,-31,-5,-39);ctx.closePath()}
function shotSize(p){return (p.boost?12:8+(p.tier||0)*1.5)*(1+s.config.gunRank*.02)}
const HEALTH_COLORS=Array.from({length:101},(_,i)=>'hsl('+Math.round(i*1.2)+',78%,58%)');
function bottleHealthColor(remaining){return HEALTH_COLORS[Math.round(clamp(remaining,0,1)*100)]}
function drawBottleHealth(o){const remaining=1-clamp(o.damage/o.need,0,1),w=o.boss?50:40,x=o.x+o.hit*1.3-w/2,y=o.y+28*(o.scale||1)+4;box(x,y,w,6,'#071c2de8',2,'#91bace70');if(remaining>0)box(x+1,y+1,(w-2)*remaining,4,bottleHealthColor(remaining),1)}




function drawEffects(){if(!s)return;for(let p of s.crashes){ctx.globalAlpha=p.life/.36*.5;let g=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,62);g.addColorStop(0,'#f6fcff');g.addColorStop(.20,'#8fd6ff83');g.addColorStop(1,'#5db7ee00');ctx.fillStyle=g;ctx.fillRect(p.x-62,p.y-62,124,124)}ctx.globalAlpha=1;
for(let p of s.fx){ctx.globalAlpha=clamp(p.life/p.max,0,1);if(p.kind==='ice')iceSprite(p.x,p.y,p.size+2,p.rotation);else if(p.kind==='glass'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);ctx.fillStyle=p.color+'bb';ctx.strokeStyle='#f2fbff';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-p.size*1.2,-p.size);ctx.lineTo(p.size,-p.size*.2);ctx.lineTo(0,p.size*1.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}else if(p.kind==='drop'){circle(p.x,p.y,p.size*1.3,p.color);strokeLine([[p.x-p.vx*.02,p.y-p.vy*.02],[p.x,p.y]],p.color,1)}else circle(p.x,p.y,p.size,p.color)}ctx.globalAlpha=1;for(let p of s.rings){ctx.globalAlpha=p.life/.45*.65;ctx.strokeStyle=p.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=1;for(let p of s.labels){ctx.globalAlpha=clamp(p.life*2,0,1);label(p.text,p.x,p.y,p.size,p.color)}ctx.globalAlpha=1;drawDamageNumbers()}


function drawDamageNumbers(){
 if(!s.damageLabels.length)return;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';ctx.strokeStyle='#071827';ctx.lineWidth=4.5;
 for(const p of s.damageLabels){
  ctx.globalAlpha=clamp(p.life/.12,0,1);
  if(fullFX){strokeLine([[p.x-p.vx*.045,p.y-p.vy*.045+3],[p.x,p.y+3]],p.color,1.2);ctx.strokeStyle='#071827';ctx.lineWidth=4.5}
  ctx.font='900 '+p.size+'px system-ui,-apple-system,sans-serif';ctx.fillStyle=p.color;
  ctx.strokeText(p.text,p.x,p.y);ctx.fillText(p.text,p.x,p.y);
  if(p.critical){ctx.font='900 13.5px system-ui,-apple-system,sans-serif';ctx.strokeText('CRIT !',p.x,p.y-27);ctx.fillText('CRIT !',p.x,p.y-27)}
 }
 ctx.restore()
}





function drawStorm(t){if(!s?.storm&&!s?.stormWarning)return;ctx.save();const alpha=s.storm?.13:.04;ctx.fillStyle='rgba(176,227,255,'+alpha+')';round(43,252,361,297,16);ctx.fill();const count=fullFX?17:7;for(let i=0;i<count;i++){const y=258+(i*47)%279,x=45+(t*160+i*63)%335;ctx.globalAlpha=s.storm?.5:.2;strokeLine([[x,y],[x+26,y-3]],'#d4f5ff',1);if(i%3===0)snowflake(x,y,2.8,'#def6ff',t)}ctx.globalAlpha=1;circle(365,213,14,s.storm?'#397a9ebd':'#123b56bd');snowflake(365,213,s.storm?8:6,'#e1f6ff',t*.3);if(s.stormWarning){ctx.strokeStyle='#f6cf8a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(365,213,16+(Math.sin(t*10)+1)*2,0,Math.PI*2);ctx.stroke()}ctx.restore()}

let dpr=1;function resize(){dpr=Math.min(window.devicePixelRatio||1,fullFX?(Number(window.RUSH_CONFIG?.maxDpr)||2):1.5);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr)}window.addEventListener('resize',resize);resize();

function frame(now){const dt=lastTime?Math.min(.075,(now-lastTime)/1000):0;lastTime=now;if(mode==='play'){accum+=dt;while(accum>=STEP&&mode==='play'){step(STEP);accum-=STEP}}else{accum=0;if(mode==='menu'||mode==='shop')sceneTime+=dt}render(mode==='menu'||mode==='shop'?sceneTime:s?.t||0);hudTimer+=dt;if(hudTimer>.08){updateHUD();hudTimer=0}requestAnimationFrame(frame)}
// The gameplay model uses its original coordinates. This skin maps the road
// to the larger Berlingo without shortening the time available to hit bottles.
const MUZZLE_X=160,MUZZLE_Y=66,ROAD_Y=155;
const sceneX=x=>MUZZLE_X+(x-106)*.92;
const skinImages=new Map(),skinCaches=new Map();
let assetsReady=false,upgradeBusy=false,revealTimer=0;
const machineFamilies={flow:'dispenser',tank:'collector',gun:'canon'};
const machineTitles={flow:'Débit des glaçons',tank:'Réservoir',gun:'Canon'};
const nozzleAnchors=[.30,.34,.38,.39,.35,.36];
const collectorAnchors=[.554,.55,.56,.56,.55,.56];

function assetUrl(name){return window.RUSH_ASSETS?.[name]?.url||''}
function sprite(name,x,y,w,h){const image=skinImages.get(name);if(!image)return false;ctx.drawImage(image,x,y,w,h);return true}
function contained(name,x,y,w,h){const image=skinImages.get(name);if(!image)return false;const k=Math.min(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*k,ih=image.naturalHeight*k;return sprite(name,x+(w-iw)/2,y+(h-ih)/2,iw,ih)}
function currentRanks(){return s?.config||config()}
function skinColor(rank){return ['#d89637','#efc154','#ed6544','#f7a331','#46c9fa','#bd96ff'][rank]}

async function loadSkin(){
 const entries=Object.entries(window.RUSH_ASSETS||{});if(entries.length<34)throw new Error('Le dossier d’images est incomplet.');
 let done=0;const missing=[];
 const loadOne=async([name,meta])=>{if(skinImages.has(name)){done++;return}const image=new Image();image.decoding='async';const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(name))});image.src=meta.url;try{await loaded;try{await image.decode()}catch{}skinImages.set(name,image)}catch{missing.push(name)}done++;$('loadingProgress').style.width=(done/entries.length*100)+'%';$('loadingMessage').textContent=done+' / '+entries.length+' images';};
 for(let i=0;i<entries.length;i+=6)await Promise.all(entries.slice(i,i+6).map(loadOne));
 if(missing.length)throw new Error('Images manquantes : '+missing.join(', '));
 assetsReady=true;
}
async function bootGame(){
 $('assetLoader').hidden=false;$('loadingRetry').hidden=true;$('app').setAttribute('aria-busy','true');
 syncSettings();updateHUD();
 try{await loadSkin();$('assetLoader').hidden=true;$('app').setAttribute('aria-busy','false');showMenu();lastTime=0;requestAnimationFrame(frame)}
 catch(e){$('loadingMessage').textContent=e.message;$('loadingRetry').hidden=false;$('loadingRetry').onclick=bootGame}
}

function machinePreview(key,rank,extra=''){
 const family=machineFamilies[key],name=family+'-'+(rank+1),meta=window.RUSH_ASSETS[name];
 return '<div class="machine-preview '+extra+'" data-machine="'+key+'"><div class="preview-art" style="--asset-ratio:'+meta.width/meta.height+'"><img class="machine-body" src="'+assetUrl(name)+'" alt="'+machineTitles[key]+', modèle '+(rank+1)+'">'+(key==='tank'?'<img class="preview-wheel" style="top:'+(collectorAnchors[rank]*100)+'%" src="'+assetUrl('wheel-'+(rank+1))+'" alt="">':'')+'</div></div>';
}
function upgradeArt(key,rank){return machinePreview(key,rank)}
function equipmentStrip(){return '<div class="equipment-strip">'+['gun','flow','tank'].map(key=>'<span>'+machinePreview(key,profile.upgrades[key])+'<b>'+String(profile.upgrades[key]+1)+'/6</b></span>').join('')+'</div>'}
function showMenu(){
 mode='menu';resetInput();const selected=profile.selected,unlocked=Math.min(LEVEL_COUNT,profile.cleared+1);
 const map=LEVELS.map((l,i)=>{const n=i+1,cleared=n<=profile.cleared,locked=n>unlocked;return '<button class="level-tile '+(cleared?'cleared ':'')+(n===selected?'selected ':'')+(l.boss?'boss-tile':'')+'" data-action="select" data-level="'+n+'" '+(locked?'disabled':'')+' aria-label="Niveau '+n+', '+NAMES[i]+(locked?', verrouillé':cleared?', terminé':'')+'" aria-pressed="'+(n===selected)+'"><span>'+String(n).padStart(2,'0')+'</span>'+icon(locked?'lock':cleared?'check':l.boss?'bottle':'snow')+'</button>'}).join('');
 showPanel('<p class="eyebrow">APÉRO DE NUIT 66® · ÉDITION NOËL</p><div class="menu-hero"><img src="'+assetUrl('owl')+'" alt="Hibou Apéro de Nuit 66"><div><h1 id="modalTitle">GLAÇON <span>RUSH</span></h1><p>La tournée des glaçons</p></div></div><div class="menu-wallet">'+wallet()+'<button class="shop-shortcut" data-action="shop">'+icon('wrench')+'Atelier</button></div>'+equipmentStrip()+'<div class="level-map">'+map+'</div><p class="level-name">'+NAMES[selected-1]+'</p><div class="recommendation" aria-label="Améliorations conseillées">'+LEVELS[selected-1].expect.map((n,i)=>'<span>'+icon(['drop','tank','cannon'][i])+' '+n+'/5</span>').join('')+'</div><button class="primary" data-action="start" data-focus>Jouer · '+String(selected).padStart(2,'0')+icon('arrow')+'</button>'+(selected>1?'<button class="secondary full-course" data-action="full">Parcours complet '+icon('star')+'</button>':'')+'<p class="record">'+(profile.best?'Record '+fmt(profile.best):'Glisse · Multiplie · Casse')+'</p><p class="survival-rule">Une bouteille touche le véhicule : partie terminée.</p>'+saveNotice(),'menu');
 updateHUD();
}
function showShop(returnTo=shopReturn){
 shopReturn=returnTo;mode='shop';resetInput();
 const cards=['flow','tank','gun'].map(key=>{const rank=profile.upgrades[key],max=rank===5,cost=max?0:PRICES[key][rank],affordable=profile.coins>=cost;return '<article class="upgrade-card '+(max?'maxed-card':'')+'" data-family="'+key+'"><div class="upgrade-card-heading"><h2>'+machineTitles[key]+'</h2><span class="model-rank">'+(rank+1)+' / 6</span></div><div class="upgrade-stage"><div class="upgrade-model current-model">'+machinePreview(key,rank)+'<small>Actuel</small></div><button class="buy '+(max?'maxed':'')+'" data-action="buy" data-upgrade="'+key+'" '+(max||!affordable||upgradeBusy?'disabled':'')+' aria-label="'+(max?machineTitles[key]+', amélioration maximale':'Acheter '+({flow:'le débit',tank:'la capacité',gun:'la cadence'}[key])+' pour '+cost+' pièces')+'">'+(max?icon('check'):'<span>+</span>')+'</button><div class="upgrade-model next-model">'+machinePreview(key,Math.min(5,rank+1))+'<small>'+(max?'Maximum':'Nouveau')+'</small></div></div><div class="upgrade-detail"><p class="upgrade-stat">'+upgradeStat(key,rank)+(max?'':' <span>→</span> <b>'+upgradeStat(key,rank+1)+'</b>')+'</p><span class="upgrade-price">'+(max?'MAX':icon('coin')+fmt(cost))+'</span></div><div class="rank-dots" aria-label="'+rank+' améliorations sur cinq">'+Array.from({length:5},(_,i)=>'<i class="'+(i<rank?'lit':'')+'"></i>').join('')+'</div></article>'}).join('');
 showPanel('<div class="shop-heading"><button class="back-button" data-action="shop-back" aria-label="Retour">'+icon('back')+'</button><h1 id="modalTitle">Atelier</h1>'+wallet()+'</div><p class="tagline shop-tagline">Choisis la prochaine évolution.</p>'+cards+'<button class="primary" data-action="shop-back" data-focus>'+(shopReturn==='pause'?'Retour à la partie':shopReturn==='clear'?'Continuer':shopReturn==='end'?'Retour au résultat':'Retour au parcours')+icon('arrow')+'</button>'+saveNotice(),'shop');
 updateHUD();
}
function playUnlock(){
 ensureAudio();if(!soundOn||!audioOutput||audio?.state!=='running')return;
 const now=audio.currentTime;
 for(const [i,f]of [523.25,659.25,783.99,1046.5].entries()){
  const oscillator=audio.createOscillator(),gain=audio.createGain(),start=now+i*.075;
  oscillator.type='triangle';oscillator.frequency.setValueAtTime(f,start);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.027,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.22);
  oscillator.connect(gain);gain.connect(audioOutput);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};oscillator.start(start);oscillator.stop(start+.24);
 }
}
function buyUpgrade(key){
 if(mode!=='shop'||upgradeBusy||!Object.hasOwn(PRICES,key))return false;
 const rank=profile.upgrades[key];if(rank>=5||profile.coins<PRICES[key][rank])return false;
 upgradeBusy=true;const cost=PRICES[key][rank];profile.coins-=cost;profile.upgrades[key]++;if(s)s.config=config();persist();
 showShop(shopReturn);$('revealTitle').textContent=machineTitles[key]+' · modèle '+(rank+2);
 $('revealImages').innerHTML='<div class="reveal-old">'+machinePreview(key,rank)+'</div><span class="reveal-plus">+</span><div class="reveal-new">'+machinePreview(key,rank+1)+'</div>';
 $('revealStat').textContent=upgradeStat(key,rank)+' → '+upgradeStat(key,rank+1);
 const reveal=$('upgradeReveal');reveal.classList.remove('revealing','unlocked');reveal.hidden=false;$('overlay').setAttribute('inert','');
 $('revealContinue').disabled=false;$('revealContinue').textContent='Continuer';
 requestAnimationFrame(()=>{if(!reveal.hidden)reveal.classList.add('revealing')});
 revealTimer=setTimeout(()=>{if(reveal.hidden)return;reveal.classList.add('unlocked');$('revealContinue').textContent='Débloqué · continuer';$('revealContinue').focus({preventScroll:true})},850);
 playUnlock();haptic([12,30,12]);announce(machineTitles[key]+' amélioré. Modèle '+(rank+2)+' sur six.');return true;
}
function closeReveal(){
 clearTimeout(revealTimer);$('upgradeReveal').hidden=true;$('overlay').removeAttribute('inert');upgradeBusy=false;showShop(shopReturn);
}
$('revealContinue').onclick=closeReveal;
window.addEventListener('keydown',e=>{if($('upgradeReveal').hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeReveal()}else if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();$('revealContinue').focus()}},true);
function pauseGame(){
 if(mode!=='play')return;mode='pause';resetInput();
 showPanel('<p class="eyebrow">NIVEAU '+String(s.level).padStart(2,'0')+' / '+LEVEL_COUNT+'</p>'+hero+'<h1 id="modalTitle">Pause</h1><button class="primary" data-action="resume" data-focus>Reprendre</button><button class="secondary" data-action="pause-shop">'+icon('wrench')+'Atelier</button><button class="secondary" data-action="quit">Menu · gains conservés</button>','pause');updateHUD();
}

function backgroundPlate(){
 const key='background:'+dpr;if(skinCaches.has(key))return skinCaches.get(key);
 const plate=document.createElement('canvas');plate.width=Math.ceil(W*dpr);plate.height=Math.ceil(H*dpr);const c=plate.getContext('2d');c.scale(dpr,dpr);
 const image=skinImages.get('background');
 if(image){const cut=image.naturalHeight*.30;c.drawImage(image,0,0,image.naturalWidth,cut,0,0,W,177);c.drawImage(image,0,cut,image.naturalWidth,image.naturalHeight-cut,0,177,W,H-177)}
 else{c.fillStyle='#b3dafa';c.fillRect(0,0,W,H)}
 // Keep a continuous level road under the bottles and the van's wheels.
 c.fillStyle='#edf8ff';c.beginPath();c.moveTo(0,154);c.bezierCurveTo(105,152,250,157,420,153);c.lineTo(420,166);c.lineTo(0,166);c.fill();
 c.fillStyle='#83b5d5';c.fillRect(0,167,W,5);c.fillStyle='#527e9f';c.fillRect(0,172,W,3);
 c.fillStyle='rgba(140,196,237,.07)';c.fillRect(0,180,W,360);
 skinCaches.set(key,plate);return plate;
}
function drawBackdrop(){ctx.drawImage(backgroundPlate(),0,0,W,H)}
function drawPipe(){
 const points=[[210,652],[34,652],[18,638],[18,143],[61,143]];
 ctx.save();ctx.lineJoin='round';ctx.lineCap='round';strokeLine(points,'#233e55',16);strokeLine(points,'#7796a5',12);strokeLine(points,'#c2e9f4',8);strokeLine(points,'#195d8a',5);
 for(const y of [211,306,407,514,610]){box(9,y-6,18,12,'#7794a5',3,'#d3e7ed');circle(12,y,1.4,'#3f5f72');circle(24,y,1.4,'#3f5f72')}
 if(s)for(const p of s.transfers){const q=pipeAt(p.distance);iceSprite(q.x,q.y,8,p.distance*.015,.83)}ctx.restore();
}
function drawPipeGlow(){if(!s?.boost||!fullFX)return;ctx.save();ctx.globalAlpha=.50;for(let i=0;i<12;i++){const p=pipeAt(((s.t-s.boostStarted)*pipeLength-i*29+pipeLength*10)%pipeLength);circle(p.x,p.y,3.5,'#bff7ff')}ctx.restore()}
function drawTruck(){sprite('berlingo',8,90,156,65)}
function drawCannon(t){
 const rank=currentRanks().gunRank,kick=s?.cannonKick||0,name='canon-'+(rank+1),image=skinImages.get(name),height=28/(1-nozzleAnchors[rank]),width=image?height*image.naturalWidth/image.naturalHeight:62;
 ctx.save();ctx.translate(70,90);ctx.rotate(-kick*.025);sprite('owl',-30,-53,61,53);ctx.restore();
 box(97,90,48,4,'#7096af',1,'#bde4ef');
 sprite(name,MUZZLE_X-width-kick*1.6,MUZZLE_Y-nozzleAnchors[rank]*height,width,height);
 if(kick>.08){ctx.save();ctx.globalAlpha=kick*.8;circle(MUZZLE_X+1,MUZZLE_Y,fullFX?5:3,'#d7f9ff');if(fullFX){strokeLine([[MUZZLE_X+1,MUZZLE_Y],[MUZZLE_X+12,MUZZLE_Y-4]],'#f3ffff',2);strokeLine([[MUZZLE_X+1,MUZZLE_Y],[MUZZLE_X+11,MUZZLE_Y+3]],'#82e4ff',2)}ctx.restore()}
}
function drawBottles(t){
 if(!s)return;
 for(const o of s.targets){const x=sceneX(o.x);if(x>W+42)continue;
  const name=o.boss||o.type==='gold'?'bottle-gold':o.type==='frost'?'bottle-frost':'bottle-green',height=Math.min(134,123*(o.scale||1)),width=39*(o.scale||1),remaining=1-clamp(o.damage/o.need,0,1);
  ctx.save();ctx.translate(x+o.hit*.7,ROAD_Y-1);ctx.rotate(Math.sin(t*2+o.id)*.006+o.hit*.01);
  sprite(name,-width/2,-height,width,height);
  if(o.hit>0){ctx.globalAlpha=o.hit*.32;strokeLine([[-width*.26,-height*.60],[-width*.26,-height*.18]],o.critFlash>0?'#ffe689':'#fff',3);ctx.globalAlpha=1}
  if(o.shell&&!o.shellBroken){ctx.globalAlpha=.55*(1-clamp(o.damage/o.shell,0,1));snowflake(-width*.13,-height*.5,5,'#edfbff',.3);snowflake(width*.19,-height*.3,4,'#edfbff',-.2);ctx.globalAlpha=1}
  if(o.boss){box(-24,-height-13,48,11,'#4c244a',4,'#ffe19d');label('MAGNUM',0,-height-5,7.5,'#fff1cd','center',900)}
  ctx.restore();
  const bar=width+5;box(x-bar/2,ROAD_Y+2,bar,6,'#20394a',3,'#dcefff');if(remaining>0)box(x-bar/2+1,ROAD_Y+3,(bar-2)*remaining,4,bottleHealthColor(remaining),2);
 }
 for(const p of s.shots){const x=sceneX(p.x),px=sceneX(p.px);strokeLine([[Math.max(MUZZLE_X,px-5),MUZZLE_Y],[x,MUZZLE_Y]],p.boost?'#d2fbff':'#5ad3ff',p.boost?3:1.4);iceSprite(x,MUZZLE_Y,shotSize(p),t*5)}
}
function drawDispenser(t){
 const rank=currentRanks().flowRank,image=skinImages.get('dispenser-'+(rank+1));if(!image)return;
 const k=Math.min(224/image.naturalWidth,80/image.naturalHeight),width=image.naturalWidth*k,height=image.naturalHeight*k;
 ctx.save();ctx.translate(aim,240);ctx.rotate((held||keys[' '])&&mode==='play'?Math.sin(t*30)*.006:0);sprite('dispenser-'+(rank+1),-width/2,-height,width,height);ctx.restore();
 if(mode==='play'&&!held&&!keys[' ']&&s.source<4){box(aim-71,249,142,20,'#174769de',7);label('Glisse et maintiens',aim,263,10.5,'#f3fcff','center',800)}
}
function drawGates(t){
 for(const g of gatesAt(s?.t||t,s?.boost>0)){
  const green=g.m>=3&&g.id!==2;const pulse=s?.gatePulse[g.id]||0;
  ctx.save();ctx.translate(g.x,g.y);if(pulse>0&&fullFX)ctx.scale(1+pulse*.025,1+pulse*.025);
  sprite(green?'gate-green':'gate-blue',-g.w/2-5,-20,g.w+10,40);
  ctx.font='900 23px system-ui,-apple-system,sans-serif';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';ctx.strokeStyle=green?'#123e26':'#102b4e';ctx.lineWidth=3;ctx.strokeText('×'+g.m,0,8);ctx.fillStyle=green?'#dbffe7':'#effaff';ctx.fillText('×'+g.m,0,8);
  if(g.soon&&fullFX){ctx.globalAlpha=.5+Math.sin(t*10)*.2;circle(-g.w/2+5,-13,1.8,'#f5ffff')}
  ctx.restore();
 }
 for(const peg of pegs){circle(peg.x,peg.y,11,'#16334f');circle(peg.x,peg.y,9,'#bfd8e3');circle(peg.x,peg.y,6,'#176eb8');circle(peg.x-1.5,peg.y-1.6,3.5,'#67d8ff');circle(peg.x-2,peg.y-3,1.6,'#f2ffff')}
 const h=heaterAt(s?.t||t);sprite('hazard',h.x-24,h.y-24,48,48);ctx.font='900 12.5px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.strokeStyle='#64182d';ctx.lineWidth=2.5;ctx.strokeText('−50 %',h.x,h.y+4);ctx.fillStyle='#fff1f4';ctx.fillText('−50 %',h.x,h.y+4);
}
function iceSprite(x,y,size=9,angle=0,alpha=1){
 const image=skinImages.get('ice');if(!image)return;ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(image,-size*.6,-size*.6,size*1.2,size*1.2);ctx.restore();
}
function drawIce(){if(s)for(const p of s.ice)iceSprite(p.x,p.y,p.n>1?12:10,p.angle)}
function drawCollector(t){
 const rank=currentRanks().tankRank,name='collector-'+(rank+1),image=skinImages.get(name);if(!image)return;
 const width=374,height=width*image.naturalHeight/image.naturalWidth,x=23,y=550,ratio=(s?.stock||0)/(s?.config.capacity||TANK[profile.upgrades.tank]);
 sprite(name,x,y,width,height);
 if(ratio>0){ctx.save();ctx.beginPath();ctx.moveTo(42,577);ctx.lineTo(379,577);ctx.lineTo(230,628);ctx.lineTo(194,628);ctx.closePath();ctx.clip();
  const count=Math.min(22,Math.round(ratio*22));for(let i=0;i<count;i++)iceSprite(154+(i*27)%132,615-(i%3)*9,13,(i*.7)%2);ctx.restore();
  ctx.save();round(156,651,109,18,2);ctx.clip();for(let i=0;i<Math.min(12,Math.ceil(ratio*12));i++)iceSprite(163+(i*19)%98,665-(i%2)*6,11,i*.3);ctx.restore();
 }
 const centerY=y+height*collectorAnchors[rank];ctx.save();ctx.translate(210,centerY);ctx.rotate(-t*(s?.boost>0?4:1.25+currentRanks().flowRank*.15));sprite('wheel-'+(rank+1),-21,-21,42,42);ctx.restore();
 if(s?.overflowPulse>0){ctx.save();ctx.globalAlpha=s.overflowPulse;box(176,centerY-39,69,17,'#7f561e',6);label('PLEIN',210,centerY-27,10,'#ffe39a','center',900);ctx.restore()}
 if(s?.collectFlash>0){ctx.save();ctx.globalAlpha=s.collectFlash;label('+'+fmt(s.collectDisplay),318,centerY+4,12,'#143b5c','center',900);ctx.restore()}
}
function drawReserveReadout(){
 const capacity=s?.config.capacity||TANK[profile.upgrades.tank],stock=s?.stock||0;box(143,670,134,25,'#0c315a',9,'#9bdcff');label(fmt(stock)+' / '+fmt(capacity),210,687,16,stock>=capacity?'#ffe899':'#f4fdff','center',900);
}
function drawWave(){
 if(s?.combo>1){box(190,15,65,23,'#11365bd9',9);label('×'+s.combo,222,32,17,s.combo>=5?'#a5f3bd':'#f4ffff','center',900)}
 if(s?.bannerTime>0){ctx.save();ctx.globalAlpha=clamp(s.bannerTime,0,1);box(150,180,120,22,'#103452e6',9);label(s.targets.some(o=>o.boss)?'MAGNUM':'NIVEAU '+String(s.level).padStart(2,'0'),210,195,11,'#edfaff','center',900);ctx.restore()}
}
function drawSkinEffects(){
 if(!s)return;
 for(const p of s.crashes){ctx.save();ctx.globalAlpha=p.life/.36*.4;const x=sceneX(p.x),y=MUZZLE_Y;circle(x,y,20+(1-p.life/.36)*22,'#d9f9ff');ctx.restore()}
 for(const p of s.fx){const upper=p.upper??false,x=upper?sceneX(p.x):p.x,y=upper?p.y+(p.gunside?MUZZLE_Y-114:MUZZLE_Y-124):p.y;ctx.globalAlpha=clamp(p.life/p.max,0,1);
  if(p.kind==='ice')iceSprite(x,y,p.size+3,p.rotation);
  else if(p.kind==='glass'){ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation);ctx.fillStyle=p.color;ctx.strokeStyle='#e9f9ff';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(-p.size,-p.size);ctx.lineTo(p.size,-p.size*.1);ctx.lineTo(0,p.size*1.6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
  else circle(x,y,p.size,p.color);
 }
 ctx.globalAlpha=1;
 for(const p of s.rings){ctx.globalAlpha=p.life/.45*.55;ctx.strokeStyle=p.color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.upper?sceneX(p.x):p.x,p.upper?p.y+MUZZLE_Y-124:p.y,p.r,0,Math.PI*2);ctx.stroke()}
 ctx.globalAlpha=1;for(const p of s.labels){ctx.globalAlpha=clamp(p.life*2,0,1);label(p.text,p.x,p.y,p.size,p.color)}ctx.globalAlpha=1;drawDamageNumbers();
}
function render(t){
 if(!assetsReady)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.save();
 if(s?.shake>0&&fullFX&&mode==='play')ctx.translate(Math.sin(t*126.32+17)*s.shake*.5,Math.sin(t*93.92+3)*s.shake*.25);
 drawBackdrop(t);drawPipe(t);drawPipeGlow(t);drawTruck(t);drawCannon(t);drawBottles(t);drawDispenser(t);drawGates(t);drawCollector(t);drawIce();drawStorm(t);drawWave(t);drawSkinEffects();drawReserveReadout();ctx.restore();
}
window.iceRushAssets=()=>({ready:assetsReady,count:skinImages.size,models:{canon:currentRanks().gunRank+1,dispenser:currentRanks().flowRank+1,collector:currentRanks().tankRank+1}});

/* QA_HOOK */
bootGame();
})();