const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const scoreEl=document.getElementById('score'),timeEl=document.getElementById('time'),speedEl=document.getElementById('speed'),bestEl=document.getElementById('best');
const startOverlay=document.getElementById('startOverlay'),gameOverOverlay=document.getElementById('gameOverOverlay'),exitButton=document.getElementById('exitButton');
const W=canvas.width,H=canvas.height,TILE=28,CHUNK=1000,GAME_DURATION=120,keys={};
const ANIMAL_PHASES=[
  {until:30,interval:10,cap:2},
  {until:60,interval:6,cap:4},
  {until:90,interval:3.25,cap:7},
  {until:Infinity,interval:1.35,cap:14}
];
let running=false,last=0,score=0,best=0,timeLeft=GAME_DURATION,elapsed=0,speedPoints=0,obstacles=[],generatedChunks=new Set(),animals=[],mown=new Set(),particles=[],spawnClock=0,raf=0;
const tractor={x:0,y:0,r:16,dx:1,dy:0,base:165,mult:1,crashTimer:0,crashCooldown:0};
function seededRandom(seed){let t=seed+0x6D2B79F5;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296}}
function chunkSeed(cx,cy){return ((cx*73856093)^(cy*19349663)^873421)>>>0}
function generateChunk(cx,cy){
  const key=cx+','+cy;
  if(generatedChunks.has(key))return;
  generatedChunks.add(key);
  const rnd=seededRandom(chunkSeed(cx,cy));
  const count=7+Math.floor(rnd()*6);
  for(let i=0;i<count;i++){
    const x=cx*CHUNK+60+rnd()*(CHUNK-120);
    const y=cy*CHUNK+60+rnd()*(CHUNK-120);
    if(Math.hypot(x,y)<280)continue;
    const type=rnd()<.58?'tree':'rock';
    obstacles.push({x,y,r:type==='tree'?27:21,type});
  }
}
function ensureWorldAround(x,y){
  const cx=Math.floor(x/CHUNK),cy=Math.floor(y/CHUNK);
  for(let yy=cy-2;yy<=cy+2;yy++)for(let xx=cx-2;xx<=cx+2;xx++)generateChunk(xx,yy);
}
function generateWorld(){obstacles=[];generatedChunks.clear();ensureWorldAround(0,0)}
function spawnAnimal(type){let a=Math.random()*Math.PI*2,d=430+Math.random()*260,s=type==='cow'?37:54;animals.push({x:tractor.x+Math.cos(a)*d,y:tractor.y+Math.sin(a)*d,r:type==='cow'?20:16,type,vx:Math.cos(a+Math.PI)*s,vy:Math.sin(a+Math.PI)*s,t:.8+Math.random()*2.2})}
function reset(){score=0;speedPoints=0;timeLeft=GAME_DURATION;elapsed=0;mown.clear();animals=[];particles=[];spawnClock=0;tractor.x=0;tractor.y=0;tractor.dx=1;tractor.dy=0;tractor.mult=1;tractor.crashTimer=0;tractor.crashCooldown=0;spawnAnimal('cow');updateHud()}
function start(){reset();running=true;startOverlay.classList.add('hidden');gameOverOverlay.classList.add('hidden');exitButton.classList.remove('hidden');last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}
function end(type){running=false;cancelAnimationFrame(raf);exitButton.classList.add('hidden');best=Math.max(best,score);document.getElementById('gameOverTitle').textContent=type==='timer'?'Time!':type==='cow'?'You hit a cow':type==='sheep'?'You hit a sheep':'Run ended';document.getElementById('finalText').textContent=`You scored ${Math.floor(score).toLocaleString()} points.`;document.getElementById('finalTime').textContent=`Time survived: ${formatTime(elapsed)}`;document.getElementById('finalSpeed').textContent=`Top speed: ${tractor.mult.toFixed(2)}x`;bestEl.textContent=Math.floor(best).toLocaleString();gameOverOverlay.classList.remove('hidden')}
function formatTime(seconds){const safe=Math.max(0,Math.ceil(seconds));return Math.floor(safe/60)+':'+String(safe%60).padStart(2,'0')}
function updateHud(){scoreEl.textContent=Math.floor(score).toLocaleString();timeEl.textContent=formatTime(timeLeft);speedEl.textContent=(tractor.crashTimer>0?'0.00':tractor.mult.toFixed(2))+'x';bestEl.textContent=Math.floor(best).toLocaleString()}
function coll(a,b,p=0){return Math.hypot(a.x-b.x,a.y-b.y)<a.r+b.r+p}
function resolveDir(){let x=0,y=0;if(keys.ArrowUp||keys.w)y--;if(keys.ArrowDown||keys.s)y++;if(keys.ArrowLeft||keys.a)x--;if(keys.ArrowRight||keys.d)x++;if(x||y){let l=Math.hypot(x,y);tractor.dx=x/l;tractor.dy=y/l}}
function nearbyObstacles(x,y,r=70){ensureWorldAround(x,y);return obstacles.filter(o=>Math.abs(o.x-x)<r&&Math.abs(o.y-y)<r)}
function move(dt){
  resolveDir();
  tractor.crashCooldown=Math.max(0,tractor.crashCooldown-dt);
  if(tractor.crashTimer>0){tractor.crashTimer=Math.max(0,tractor.crashTimer-dt);return}
  const s=tractor.base*tractor.mult,dx=tractor.dx*s*dt,dy=tractor.dy*s*dt;
  const nx=tractor.x+dx,ny=tractor.y+dy;
  const cx={x:nx,y:tractor.y,r:tractor.r},cy={x:tractor.x,y:ny,r:tractor.r};
  const hitX=nearbyObstacles(cx.x,cx.y).some(o=>coll(cx,o,1));
  const hitY=nearbyObstacles(cy.x,cy.y).some(o=>coll(cy,o,1));
  if(!hitX)tractor.x=nx;
  if(!hitY)tractor.y=ny;
  if((hitX||hitY)&&tractor.crashCooldown<=0){
    tractor.crashTimer=.45;
    tractor.crashCooldown=.9;
    speedPoints=0;
    tractor.mult=1;
    tractor.x-=tractor.dx*12;
    tractor.y-=tractor.dy*12;
  }
  ensureWorldAround(tractor.x,tractor.y);
}
function mow(){
  let gx=Math.floor(tractor.x/TILE),gy=Math.floor(tractor.y/TILE);
  for(let y=gy-1;y<=gy+1;y++)for(let x=gx-1;x<=gx+1;x++){
    let key=x+','+y,cx=(x+.5)*TILE,cy=(y+.5)*TILE;
    if(!mown.has(key)&&Math.hypot(cx-tractor.x,cy-tractor.y)<tractor.r+TILE*.7){
      mown.add(key);
      score+=1;
      speedPoints+=1;
      if(Math.random()<.18)particles.push({x:cx,y:cy,life:.35,vx:(Math.random()-.5)*35,vy:-15-Math.random()*25});
    }
  }
  tractor.mult=1+Math.min(4,speedPoints/220);
}
function updateAnimals(dt){animals.forEach(a=>{a.t-=dt;if(a.t<=0){let ang=Math.random()*Math.PI*2,s=a.type==='cow'?37:54;a.vx=Math.cos(ang)*s;a.vy=Math.sin(ang)*s;a.t=.7+Math.random()*2.5}a.x+=a.vx*dt;a.y+=a.vy*dt;if(Math.hypot(a.x-tractor.x,a.y-tractor.y)>1100){let ang=Math.random()*Math.PI*2,d=650;a.x=tractor.x+Math.cos(ang)*d;a.y=tractor.y+Math.sin(ang)*d}});for(const a of animals)if(coll(tractor,a,1)){end(a.type);return}}
function updateSpawns(dt){const phase=ANIMAL_PHASES.find(item=>elapsed<item.until);spawnClock+=dt;if(spawnClock<phase.interval)return;spawnClock=0;if(animals.length<phase.cap)spawnAnimal(Math.random()<.58?'cow':'sheep')}
function updateParticles(dt){particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt});particles=particles.filter(p=>p.life>0)}
function worldToScreen(x,y){return{x:x-tractor.x+W/2,y:y-tractor.y+H/2}}
function drawGround(){ctx.fillStyle='#61a950';ctx.fillRect(0,0,W,H);let startX=Math.floor((tractor.x-W/2)/TILE)-1,endX=Math.ceil((tractor.x+W/2)/TILE)+1,startY=Math.floor((tractor.y-H/2)/TILE)-1,endY=Math.ceil((tractor.y+H/2)/TILE)+1;for(let gy=startY;gy<=endY;gy++)for(let gx=startX;gx<=endX;gx++){let p=worldToScreen(gx*TILE,gy*TILE),cut=mown.has(gx+','+gy);ctx.fillStyle=cut?((gx+gy)%2?'#b9cb75':'#adc268'):((gx+gy)%2?'#5ca34d':'#63ad51');ctx.fillRect(p.x,p.y,TILE+1,TILE+1);if(!cut){ctx.strokeStyle='rgba(31,94,36,.28)';ctx.lineWidth=1.4;let sw=((gx*13+gy*7)%5)-2;ctx.beginPath();ctx.moveTo(p.x+7,p.y+20);ctx.lineTo(p.x+8+sw,p.y+7);ctx.moveTo(p.x+17,p.y+20);ctx.lineTo(p.x+16-sw,p.y+8);ctx.stroke()}}}
function drawObstacle(o){let p=worldToScreen(o.x,o.y);if(p.x<-50||p.x>W+50||p.y<-50||p.y>H+50)return;ctx.save();ctx.translate(p.x,p.y);if(o.type==='rock'){ctx.fillStyle='#66706b';ctx.beginPath();ctx.moveTo(-18,10);ctx.lineTo(-12,-12);ctx.lineTo(2,-19);ctx.lineTo(18,-8);ctx.lineTo(16,13);ctx.closePath();ctx.fill()}else{ctx.fillStyle='#6c4c2e';ctx.fillRect(-5,6,10,22);ctx.fillStyle='#2f6c39';ctx.beginPath();ctx.arc(0,-6,25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3b8146';ctx.beginPath();ctx.arc(-10,-13,15,0,Math.PI*2);ctx.arc(12,-10,14,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawAnimal(a){let p=worldToScreen(a.x,a.y);if(p.x<-60||p.x>W+60||p.y<-60||p.y>H+60)return;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(a.vy,a.vx));if(a.type==='cow'){ctx.fillStyle='#f2eadb';ctx.fillRect(-18,-12,34,24);ctx.fillStyle='#2b2d2b';ctx.fillRect(-12,-8,8,8);ctx.fillRect(4,2,9,7);ctx.fillStyle='#d9b889';ctx.beginPath();ctx.arc(18,-2,10,0,Math.PI*2);ctx.fill()}else{ctx.fillStyle='#f3f0df';ctx.beginPath();ctx.arc(-5,0,14,0,Math.PI*2);ctx.arc(5,0,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#303630';ctx.beginPath();ctx.arc(16,0,8,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawTractor(){ctx.save();ctx.translate(W/2,H/2);ctx.rotate(Math.atan2(tractor.dy,tractor.dx)+Math.PI/2);ctx.globalAlpha=tractor.crashTimer>0&&Math.floor(tractor.crashTimer*12)%2===0?.45:1;ctx.fillStyle='#181b19';ctx.fillRect(-20,-23,9,20);ctx.fillRect(11,-23,9,20);ctx.fillRect(-20,7,9,20);ctx.fillRect(11,7,9,20);ctx.fillStyle='#d93f36';ctx.fillRect(-12,-25,24,48);ctx.fillStyle='#b92e28';ctx.fillRect(-9,10,18,18);ctx.fillStyle='#9fd6e8';ctx.fillRect(-8,-18,16,17);ctx.strokeStyle='#d9f1f7';ctx.lineWidth=2;ctx.strokeRect(-8,-18,16,17);ctx.fillStyle='#f0c44d';ctx.fillRect(-8,-29,6,6);ctx.fillRect(2,-29,6,6);ctx.fillStyle='#6d843f';ctx.fillRect(-17,23,34,8);ctx.fillStyle='#50642d';ctx.fillRect(-22,28,44,5);ctx.restore()}
function drawParticles(){ctx.fillStyle='rgba(226,240,142,.85)';particles.forEach(p=>{let s=worldToScreen(p.x,p.y);ctx.globalAlpha=Math.max(0,p.life/.35);ctx.fillRect(s.x,s.y,3,8)});ctx.globalAlpha=1}
function draw(){ensureWorldAround(tractor.x,tractor.y);drawGround();obstacles.forEach(drawObstacle);animals.forEach(drawAnimal);drawParticles();drawTractor()}
function loop(t){if(!running)return;let dt=Math.min(.033,(t-last)/1000);last=t;elapsed+=dt;timeLeft-=dt;if(timeLeft<=0){timeLeft=0;updateHud();draw();end('timer');return}move(dt);mow();updateAnimals(dt);updateSpawns(dt);updateParticles(dt);updateHud();draw();if(running)raf=requestAnimationFrame(loop)}
function setDir(dir,on){keys[{up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[dir]]=on}
addEventListener('keydown',e=>{let k=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){e.preventDefault();keys[k]=true}});addEventListener('keyup',e=>{let k=e.key.length===1?e.key.toLowerCase():e.key;keys[k]=false});
document.querySelectorAll('[data-dir]').forEach(b=>{let d=b.dataset.dir;['pointerdown','touchstart'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();setDir(d,true)},{passive:false}));['pointerup','pointercancel','pointerleave','touchend'].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();setDir(d,false)},{passive:false}))});
document.getElementById('startButton').addEventListener('click',start);document.getElementById('restartButton').addEventListener('click',start);exitButton.addEventListener('click',()=>end('exit'));generateWorld();reset();draw();
