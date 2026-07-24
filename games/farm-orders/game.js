const CONFIG=window.FARM_ORDERS_CONFIG,canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const ui={score:$('score'),roundTime:$('roundTime'),completed:$('completed'),streak:$('streak'),driverStatus:$('driverStatus'),orderNumber:$('orderNumber'),orderTime:$('orderTime'),deadlineBar:$('deadlineBar'),requested:$('requestedList'),packed:$('packedList'),remaining:$('remainingList'),carryCount:$('carryCount'),carryList:$('carryList'),feedback:$('feedback'),start:$('startOverlay'),results:$('resultsOverlay')};
const STATIONS={
  eggs:{x:110,y:135,label:'EGG CRATES'},milk:{x:690,y:135,label:'MILK FRIDGE'},
  carrots:{x:110,y:465,label:'VEG BASKETS'},corn:{x:690,y:465,label:'CORN SACKS'}
};
const BENCH={x:310,y:225,width:180,height:150},keys={},pointers=new Map();
let state,raf=0,last=0,feedbackTimer=0;
const productKeys=Object.keys(CONFIG.products);

function blankInventory(){return Object.fromEntries(productKeys.map(key=>[key,0]))}
function total(inv){return productKeys.reduce((sum,key)=>sum+(inv[key]||0),0)}
function loadBest(){try{return Math.max(0,parseInt(localStorage.getItem(CONFIG.bestScoreKey),10)||0)}catch{return 0}}
function saveBest(){state.best=Math.max(state.best,state.score);try{localStorage.setItem(CONFIG.bestScoreKey,String(state.best))}catch{}}
function formatTime(value){const safe=Math.max(0,Math.ceil(value));return `${Math.floor(safe/60)}:${String(safe%60).padStart(2,'0')}`}
function phase(){return CONFIG.phases.find(item=>state.elapsed<item.until)}
function sound(type){document.dispatchEvent(new CustomEvent('farmorders:sound',{detail:{type}}))}
function feedback(message,bad=false){ui.feedback.textContent=message;ui.feedback.classList.toggle('bad',bad);ui.feedback.classList.remove('hidden');feedbackTimer=CONFIG.feedbackSeconds}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function nearBench(){return distance(state.player,{x:BENCH.x+BENCH.width/2,y:BENCH.y+BENCH.height/2})<105}
function nearestStation(){return productKeys.map(key=>({key,distance:distance(state.player,STATIONS[key])})).sort((a,b)=>a.distance-b.distance)[0]}
function clearInput(){Object.keys(keys).forEach(key=>keys[key]=false);pointers.clear();document.querySelectorAll('[data-direction]').forEach(button=>button.classList.remove('active'))}

function freshState(){return{running:false,elapsed:0,timeLeft:CONFIG.roundSeconds,score:0,best:loadBest(),completed:0,missed:0,failedSubmissions:0,streak:0,bestStreak:0,player:{x:400,y:500,facingX:0,facingY:-1,step:0},carry:blankInventory(),box:blankInventory(),order:null,orderTime:0,orderDeadline:0,orderNumber:0,lastSignature:'',vehicle:{mode:'arriving',elapsed:0},warningPlayed:false,particles:[]}}
function resetRound(){cancelAnimationFrame(raf);const best=state?state.best:loadBest();state=freshState();state.best=best;feedbackTimer=0;clearInput();ui.feedback.classList.add('hidden');updateHud();draw()}
function startRound(){resetRound();state.running=true;ui.start.classList.add('hidden');ui.results.classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}

function orderSignature(order){return productKeys.map(key=>order[key]||0).join('-')}
function makeOrder(){
  const settings=phase();let order,signature;
  for(let attempt=0;attempt<10;attempt++){
    const maxTypes=Math.min(settings.maxTypes,productKeys.length);
    const typeCount=1+Math.floor(Math.random()*maxTypes);
    const minimum=Math.max(settings.minUnits,typeCount);
    const units=minimum+Math.floor(Math.random()*(settings.maxUnits-minimum+1));
    const chosen=[...productKeys].sort(()=>Math.random()-.5).slice(0,typeCount);
    order=blankInventory();chosen.forEach(key=>order[key]=1);
    for(let remaining=units-typeCount;remaining>0;remaining--)order[chosen[Math.floor(Math.random()*chosen.length)]]++;
    signature=orderSignature(order);if(signature!==state.lastSignature)break;
  }
  state.lastSignature=signature;state.order=order;state.orderDeadline=settings.deadline;state.orderTime=settings.deadline;state.orderNumber++;state.box=blankInventory();state.carry=blankInventory();state.vehicle.mode='waiting';state.warningPlayed=false;sound('newOrder');sound('vehicleHorn');feedback(`Order ${state.orderNumber} is ready`);
}
function beginTransition(reason){state.order=null;state.orderTime=0;state.box=blankInventory();state.carry=blankInventory();state.vehicle={mode:reason,elapsed:0};sound('vehicleLeaving')}
function updateTransition(dt){state.vehicle.elapsed+=dt;if(state.vehicle.elapsed>=CONFIG.vehicleTransitionSeconds)makeOrder()}

function movePlayer(dt){
  const held=new Set(pointers.values());let x=0,y=0;
  if(keys.ArrowUp||keys.w||held.has('up'))y--;if(keys.ArrowDown||keys.s||held.has('down'))y++;
  if(keys.ArrowLeft||keys.a||held.has('left'))x--;if(keys.ArrowRight||keys.d||held.has('right'))x++;
  const length=Math.hypot(x,y);if(!length)return;x/=length;y/=length;state.player.facingX=x;state.player.facingY=y;state.player.step+=dt*10;
  const r=CONFIG.player.radius;state.player.x=Math.max(r,Math.min(800-r,state.player.x+x*CONFIG.player.speed*dt));state.player.y=Math.max(r,Math.min(600-r,state.player.y+y*CONFIG.player.speed*dt));
}
function interact(){
  if(!state.running||!state.order)return;
  if(nearBench()){
    if(!total(state.carry)){feedback('Your hands are empty',true);return}
    productKeys.forEach(key=>{state.box[key]+=state.carry[key];state.carry[key]=0});feedback('Products added to the box');sound('pack');updateHud();return;
  }
  const station=nearestStation();if(station.distance>CONFIG.interactionDistance){feedback('Move closer to a station or the packing bench',true);return}
  if(total(state.carry)>=CONFIG.carryingCapacity){feedback('Your hands are full — pack the box first',true);return}
  state.carry[station.key]++;feedback(`Collected ${CONFIG.products[station.key].icon} ${CONFIG.products[station.key].name}`);sound('collect');updateHud();
}
function compareOrder(){
  const extras=[],missing=[];
  productKeys.forEach(key=>{const difference=state.box[key]-state.order[key];if(difference>0)extras.push(`${CONFIG.products[key].name} +${difference}`);if(difference<0)missing.push(`${CONFIG.products[key].name} ×${-difference}`)});
  return{extras,missing,exact:!extras.length&&!missing.length};
}
function submitOrder(){
  if(!state.running||!state.order)return;if(!nearBench()){feedback('Go to the packing bench to submit',true);return}
  const result=compareOrder();
  if(result.extras.length){state.score=Math.max(0,state.score-CONFIG.scoring.incorrectPenalty);state.failedSubmissions++;state.streak=0;feedback(`Incorrect: ${result.extras.join(', ')}`,true);sound('incorrect');updateHud();return}
  if(result.missing.length){state.score=Math.max(0,state.score-CONFIG.scoring.incompletePenalty);state.failedSubmissions++;state.streak=0;feedback(`Missing: ${result.missing.join(', ')}`,true);sound('incorrect');updateHud();return}
  const units=total(state.order),speed=Math.round(CONFIG.scoring.maxSpeedBonus*(state.orderTime/state.orderDeadline)),streakBonus=Math.min(CONFIG.scoring.maxStreakBonus,state.streak*CONFIG.scoring.streakStep);
  const points=CONFIG.scoring.correctOrder+units*CONFIG.scoring.perUnit+speed+streakBonus;state.score+=points;state.completed++;state.streak++;state.bestStreak=Math.max(state.bestStreak,state.streak);burst();feedback(`Exact order! +${points}`);sound('correct');beginTransition('success');updateHud();
}
function resetBox(){if(!state.running||!state.order)return;if(!nearBench()){feedback('Go to the packing bench to empty the box',true);return}if(!total(state.box)){feedback('The box is already empty',true);return}state.box=blankInventory();feedback('Box emptied');updateHud()}
function missOrder(){state.score=Math.max(0,state.score-CONFIG.scoring.missedPenalty);state.missed++;state.streak=0;feedback('The driver left without the order',true);sound('missed');beginTransition('missed')}

function burst(){for(let i=0;i<20;i++)state.particles.push({x:400,y:290,vx:(Math.random()-.5)*150,vy:-40-Math.random()*100,life:.8,color:['#b4ed73','#ffd35c','#fff'][i%3]})}
function updateParticles(dt){state.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=120*dt});state.particles=state.particles.filter(p=>p.life>0)}
function update(dt){
  state.elapsed+=dt;state.timeLeft=Math.max(0,CONFIG.roundSeconds-state.elapsed);if(state.timeLeft<=0){finish();return}
  movePlayer(dt);updateParticles(dt);
  if(state.order){state.orderTime-=dt;if(state.orderTime<=0){missOrder();return}if(state.orderTime<=CONFIG.warningSeconds&&!state.warningPlayed){state.warningPlayed=true;sound('orderWarning');feedback('Driver leaving soon!',true)}}
  else updateTransition(dt);
  if(feedbackTimer>0){feedbackTimer-=dt;if(feedbackTimer<=0)ui.feedback.classList.add('hidden')}
}
function accuracy(){const attempts=state.completed+state.failedSubmissions+state.missed;return attempts?Math.round(state.completed/attempts*100):0}
function finish(){state.running=false;state.elapsed=CONFIG.roundSeconds;state.timeLeft=0;cancelAnimationFrame(raf);clearInput();saveBest();updateHud();$('finalScore').textContent=state.score.toLocaleString();$('finalBest').textContent=state.best.toLocaleString();$('finalCompleted').textContent=state.completed;$('finalMissed').textContent=state.missed;$('finalAccuracy').textContent=`${accuracy()}%`;$('finalStreak').textContent=state.bestStreak;ui.results.classList.remove('hidden');sound('roundEnd')}

function itemHtml(inv,remaining=false){const entries=productKeys.filter(key=>inv[key]>0);return entries.length?entries.map(key=>`<span class="item">${CONFIG.products[key].icon} ${remaining?Math.max(0,inv[key]):inv[key]}</span>`).join(''):'<span class="item">—</span>'}
function updateHud(){
  ui.score.textContent=state.score.toLocaleString();ui.roundTime.textContent=formatTime(state.timeLeft);ui.completed.textContent=state.completed;ui.streak.textContent=`${state.streak}×`;ui.orderNumber.textContent=state.order?`Order ${state.orderNumber}`:'Order —';
  ui.driverStatus.textContent=state.order?'Driver waiting':state.vehicle.mode==='missed'?'Driver left unhappy':state.vehicle.mode==='success'?'Order loaded!':'Driver arriving';
  ui.orderTime.textContent=state.order?`${Math.max(0,state.orderTime).toFixed(1)}s`:'—';ui.deadlineBar.style.width=state.order?`${Math.max(0,state.orderTime/state.orderDeadline*100)}%`:'0%';ui.deadlineBar.style.background=state.orderTime<=CONFIG.warningSeconds?'var(--danger)':'var(--accent)';
  ui.requested.innerHTML=state.order?itemHtml(state.order):itemHtml({});ui.packed.innerHTML=itemHtml(state.box);
  const remaining=blankInventory();if(state.order)productKeys.forEach(key=>remaining[key]=Math.max(0,state.order[key]-state.box[key]));ui.remaining.innerHTML=itemHtml(remaining,true);
  ui.carryCount.textContent=`${total(state.carry)}/${CONFIG.carryingCapacity}`;ui.carryList.textContent=productKeys.filter(key=>state.carry[key]).map(key=>`${CONFIG.products[key].icon} ${CONFIG.products[key].name} ×${state.carry[key]}`).join(' · ')||'Nothing';
}

function drawShed(){ctx.fillStyle='#b8814b';ctx.fillRect(0,0,800,600);for(let y=0;y<600;y+=42){ctx.strokeStyle='rgba(83,48,25,.18)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke()}ctx.fillStyle='#705035';ctx.fillRect(0,0,800,72);ctx.fillStyle='#d6bd86';ctx.fillRect(325,0,150,72);ctx.fillStyle='#fff1c9';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText('LOADING BAY',400,32)}
function drawStation(key){const s=STATIONS[key],p=CONFIG.products[key];ctx.fillStyle='#4b3324';ctx.fillRect(s.x-58,s.y-42,116,84);ctx.fillStyle=p.color;ctx.fillRect(s.x-52,s.y-36,104,60);ctx.font='34px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.icon,s.x,s.y-6);ctx.fillStyle='#241b16';ctx.fillRect(s.x-55,s.y+24,110,23);ctx.fillStyle='#fff';ctx.font='bold 12px system-ui';ctx.fillText(s.label,s.x,s.y+36)}
function drawBench(){ctx.fillStyle='#553823';ctx.fillRect(BENCH.x-8,BENCH.y+12,BENCH.width+16,BENCH.height-6);ctx.fillStyle='#c99053';ctx.fillRect(BENCH.x,BENCH.y,BENCH.width,BENCH.height-28);ctx.fillStyle='#967047';ctx.fillRect(350,250,100,82);ctx.strokeStyle='#4f3826';ctx.lineWidth=5;ctx.strokeRect(350,250,100,82);ctx.font='31px system-ui';ctx.textAlign='center';ctx.fillText('📦',400,290);ctx.fillStyle='#2b211a';ctx.font='bold 14px system-ui';ctx.fillText('PACKING BENCH',400,350)}
function truckOffset(){if(state.order)return 0;const p=Math.min(1,state.vehicle.elapsed/CONFIG.vehicleTransitionSeconds);return state.vehicle.mode==='arriving'?(1-p)*390:(p<.5?p*780:(1-p)*780)}
function drawTruck(){const x=400+truckOffset();ctx.save();ctx.translate(x,48);ctx.fillStyle=state.vehicle.mode==='missed'?'#a7473f':'#d95a45';ctx.fillRect(-63,-23,94,46);ctx.fillStyle='#e8d7ae';ctx.fillRect(31,-15,43,38);ctx.fillStyle='#a9d9e8';ctx.fillRect(39,-10,26,18);ctx.fillStyle='#252723';for(const px of [-42,52]){ctx.beginPath();ctx.arc(px,25,12,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawPlayer(){const p=state.player,a=Math.atan2(p.facingY,p.facingX);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(0,7,22,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#376c79';ctx.beginPath();ctx.ellipse(0,0,18,14,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#efbd7d';ctx.beginPath();ctx.arc(12,0,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#edc34c';ctx.beginPath();ctx.ellipse(10,0,13,19,0,0,Math.PI*2);ctx.fill();ctx.restore()}
function draw(){drawShed();productKeys.forEach(drawStation);drawBench();drawTruck();drawPlayer();state.particles.forEach(p=>{ctx.globalAlpha=p.life/.8;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,6,6)});ctx.globalAlpha=1}
function loop(timestamp){if(!state.running)return;const dt=Math.min(.04,(timestamp-last)/1000);last=timestamp;update(dt);updateHud();draw();if(state.running)raf=requestAnimationFrame(loop)}

function keyName(event){return event.key.length===1?event.key.toLowerCase():event.key}
addEventListener('keydown',event=>{const key=keyName(event);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' ','Enter','q','r'].includes(key))event.preventDefault();if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key))keys[key]=true;if(event.repeat)return;if(key===' '||key==='Enter')interact();if(key==='q')submitOrder();if(key==='r')resetBox()});
addEventListener('keyup',event=>keys[keyName(event)]=false);addEventListener('blur',clearInput);
document.querySelectorAll('[data-direction]').forEach(button=>{const release=e=>{pointers.delete(e.pointerId);button.classList.remove('active')};button.addEventListener('pointerdown',e=>{e.preventDefault();pointers.set(e.pointerId,button.dataset.direction);button.classList.add('active');button.setPointerCapture(e.pointerId)});button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release)});
$('useButton').addEventListener('click',interact);$('submitButton').addEventListener('click',submitOrder);$('resetButton').addEventListener('click',resetBox);$('startButton').addEventListener('click',startRound);$('restartButton').addEventListener('click',startRound);
state=freshState();resetRound();
