const CONFIG=window.ORDER_RUSH_CONFIG,canvas=document.getElementById('game'),ctx=canvas.getContext('2d'),$=id=>document.getElementById(id);
const ui={score:$('score'),roundTime:$('roundTime'),orderNumber:$('orderNumber'),orderTime:$('orderTime'),deadlineBar:$('deadlineBar'),requested:$('requestedList'),feedback:$('feedback'),start:$('startOverlay'),results:$('resultsOverlay')};
const keys={},mobileCameraQuery=window.matchMedia?.('(pointer: coarse) and (orientation: portrait)'),productKeys=Object.keys(CONFIG.products),BOXES=[{x:635,y:180,w:100,h:80},{x:635,y:345,w:100,h:80}],LOADING={x:320,y:0,w:160,h:105},DISCARD={x:280,y:350,w:135,h:140};
const CONVEYOR={y:125,centerX:65,verticalEnd:340,turnRadius:60,horizontalEnd:335};
const SPRITE_SOURCES={
  truck:'assets/delivery-truck.png',
  boxOpen:'assets/boxes/open.png',
  boxClosed:'assets/boxes/closed.png',
  boxDamaged:'assets/boxes/damaged.png',
  conveyor:'assets/conveyor-compost.png',
  eggs:'assets/food/eggs.png',
  milk:'assets/food/milk.png',
  carrots:'assets/food/carrots.png',
  corn:'assets/food/corn.png'
};
const FOOD_SIZES={eggs:[40,30],milk:[23,42],carrots:[36,40],corn:[38,40]};
const sprites=Object.fromEntries(Object.entries(SPRITE_SOURCES).map(([key,src])=>{const image=new Image();image.src=src;return[key,image]}));
let state,raf=0,last=0,nextFoodId=1,mobileDirection=null;
function blank(){return Object.fromEntries(productKeys.map(key=>[key,0]))}function total(inv){return productKeys.reduce((n,key)=>n+(inv[key]||0),0)}function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function spriteReady(key){const image=sprites[key];return Boolean(image?.complete&&image.naturalWidth>0)}
function drawSprite(key,x,y,width,height){if(!spriteReady(key))return false;ctx.drawImage(sprites[key],x-width/2,y-height/2,width,height);return true}
function productAsset(key){return SPRITE_SOURCES[key]}
function storedScore(key){const value=Number(localStorage.getItem(key));return Number.isFinite(value)&&value>=0?Math.floor(value):0}function loadBest(){try{return Math.max(storedScore(CONFIG.bestScoreKey),storedScore(CONFIG.legacyBestScoreKey))}catch{return 0}}function saveBest(){const candidate=Math.max(0,Math.floor(state.score));if(candidate<=state.best)return;state.best=candidate;try{localStorage.setItem(CONFIG.bestScoreKey,String(state.best))}catch{}}
function phase(){return CONFIG.phases.find(item=>state.elapsed<item.until)}function formatTime(v){const n=Math.max(0,Math.ceil(v));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}function sound(type){document.dispatchEvent(new CustomEvent('orderrush:sound',{detail:{type}}))}
function feedback(text){ui.feedback.textContent=text}
function newBox(){return{items:blank(),status:'open'}}function fresh(){return{running:false,elapsed:0,timeLeft:120,score:0,best:loadBest(),completed:0,missed:0,streak:0,bestStreak:0,player:{x:515,y:355,facingX:0,facingY:1,step:0},order:null,orderTime:0,orderDeadline:0,orderNumber:0,lastSignature:'',boxes:BOXES.map(newBox),foods:[],carryFood:null,carryBox:null,lastBox:-1,vehicle:{mode:'arriving',elapsed:0},warning:false,particles:[]}}
function clearInput(){Object.keys(keys).forEach(k=>keys[k]=false);mobileDirection=null;document.querySelector('[data-farm-dpad]')?.farmLeagueDPad?.reset()}
function resetRound(){cancelAnimationFrame(raf);const best=state?state.best:loadBest();state=fresh();state.best=best;nextFoodId=1;clearInput();ui.feedback.textContent='';updateHud();draw()}
function startRound(){resetRound();state.running=true;ui.start.classList.add('hidden');ui.results.classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop)}
function signature(order){return productKeys.map(k=>order[k]).join('-')}
function makeOrder(){const p=phase();let order,sig;for(let a=0;a<10;a++){const types=1+Math.floor(Math.random()*p.maxTypes),units=Math.max(p.minUnits,types)+Math.floor(Math.random()*(p.maxUnits-Math.max(p.minUnits,types)+1)),chosen=[...productKeys].sort(()=>Math.random()-.5).slice(0,types);order=blank();chosen.forEach(k=>order[k]=1);for(let n=units-types;n>0;n--)order[chosen[Math.floor(Math.random()*chosen.length)]]++;sig=signature(order);if(sig!==state.lastSignature)break}state.lastSignature=sig;state.order=order;state.orderDeadline=p.deadline;state.orderTime=p.deadline;state.orderNumber++;state.boxes=BOXES.map(newBox);state.carryFood=null;state.carryBox=null;state.foods=[];state.vehicle.mode='waiting';state.warning=false;maintainFood();feedback(`Order ${state.orderNumber} ready`);sound('newOrder')}
function beginTransition(mode){state.order=null;state.orderTime=0;state.boxes=BOXES.map(newBox);state.foods=[];state.carryFood=null;state.carryBox=null;state.vehicle={mode,elapsed:0};sound('vehicleLeaving')}
function updateTransition(dt){state.vehicle.elapsed+=dt;if(state.vehicle.elapsed>=CONFIG.vehicleTransitionSeconds)makeOrder()}
function chooseFood(){if(state.order&&Math.random()<CONFIG.orderFoodChance){const needed=productKeys.filter(k=>state.order[k]>0);return needed[Math.floor(Math.random()*needed.length)]}return productKeys[Math.floor(Math.random()*productKeys.length)]}
function conveyorLength(){
  const turnLength=Math.PI*CONVEYOR.turnRadius/2;
  return CONVEYOR.verticalEnd+turnLength+CONVEYOR.horizontalEnd-CONVEYOR.centerX-CONVEYOR.turnRadius;
}
function conveyorPoint(distance){
  if(distance<=CONVEYOR.verticalEnd)return{x:CONVEYOR.centerX,y:distance};
  const turnLength=Math.PI*CONVEYOR.turnRadius/2;
  const turnDistance=distance-CONVEYOR.verticalEnd;
  if(turnDistance<turnLength){
    const angle=turnDistance/CONVEYOR.turnRadius;
    return{
      x:CONVEYOR.centerX+CONVEYOR.turnRadius*(1-Math.cos(angle)),
      y:CONVEYOR.verticalEnd+CONVEYOR.turnRadius*Math.sin(angle)
    };
  }
  return{x:CONVEYOR.centerX+CONVEYOR.turnRadius+turnDistance-turnLength,y:CONVEYOR.verticalEnd+CONVEYOR.turnRadius};
}
function spawnFood(){
  const tail=state.foods.length?Math.min(...state.foods.map(food=>food.beltDistance)):CONVEYOR.y;
  const beltDistance=state.foods.length?Math.min(CONVEYOR.y,tail-CONFIG.conveyor.itemSpacing):CONVEYOR.y;
  const point=conveyorPoint(beltDistance);
  state.foods.push({id:nextFoodId++,key:chooseFood(),x:point.x,y:point.y,beltDistance});
}
function maintainFood(){while(state.foods.length<CONFIG.foodVisible)spawnFood()}
function updateConveyor(dt){
  state.foods.forEach(food=>{
    food.beltDistance+=CONFIG.conveyor.speed*dt;
    Object.assign(food,conveyorPoint(food.beltDistance));
  });
  state.foods=state.foods.filter(food=>food.beltDistance<conveyorLength());
  maintainFood();
}
function move(dt){let x=0,y=0;if(keys.ArrowUp||keys.w||mobileDirection==='up')y--;if(keys.ArrowDown||keys.s||mobileDirection==='down')y++;if(keys.ArrowLeft||keys.a||mobileDirection==='left')x--;if(keys.ArrowRight||keys.d||mobileDirection==='right')x++;const l=Math.hypot(x,y);if(!l)return;x/=l;y/=l;const p=state.player;p.facingX=x;p.facingY=y;p.step+=dt*10;const r=CONFIG.player.radius;p.x=Math.max(r,Math.min(800-r,p.x+x*CONFIG.player.speed*dt));p.y=Math.max(r,Math.min(600-r,p.y+y*CONFIG.player.speed*dt))}
function compareBox(box){let extra=false,exact=true;productKeys.forEach(k=>{if(box.items[k]>state.order[k])extra=true;if(box.items[k]!==state.order[k])exact=false});return{extra,exact}}
function boxAtPlayer(){return BOXES.findIndex(b=>state.player.x>=b.x-12&&state.player.x<=b.x+b.w+12&&state.player.y>=b.y-12&&state.player.y<=b.y+b.h+12)}
function handleAutomaticInteractions(){
  if(!state.order)return;
  if(state.carryBox!==null&&state.player.x>=LOADING.x&&state.player.x<=LOADING.x+LOADING.w&&state.player.y<=LOADING.y+LOADING.h){deliverBox();return}
  if(state.carryFood&&state.player.x>=DISCARD.x&&state.player.x<=DISCARD.x+DISCARD.w&&state.player.y>=DISCARD.y&&state.player.y<=DISCARD.y+DISCARD.h){feedback(`${CONFIG.products[state.carryFood.key].icon} sent to compost`);sound('discard');state.carryFood=null;return}
  const boxIndex=boxAtPlayer();
  if(boxIndex<0)state.lastBox=-1;
  if(state.carryFood&&boxIndex>=0&&boxIndex!==state.lastBox){const box=state.boxes[boxIndex];if(box.status==='open'){box.items[state.carryFood.key]++;const result=compareBox(box);box.status=result.extra?'bad':result.exact?'sealed':'open';feedback(result.extra?'That box has an extra item — use another box':`${CONFIG.products[state.carryFood.key].icon} packed`,result.extra);sound(result.extra?'incorrect':'pack');state.carryFood=null;state.lastBox=boxIndex}return}
  if(!state.carryFood&&state.carryBox===null&&boxIndex>=0&&boxIndex!==state.lastBox&&state.boxes[boxIndex].status==='sealed'){state.carryBox=boxIndex;feedback('Sealed box picked up — take it to the truck');sound('boxPickup');state.lastBox=boxIndex;return}
  if(!state.carryFood&&state.carryBox===null){const food=state.foods.find(f=>f.beltDistance>=CONVEYOR.y&&dist(f,state.player)<CONFIG.foodRadius+CONFIG.player.radius);if(food){state.carryFood=food;state.foods=state.foods.filter(f=>f.id!==food.id);feedback(`Collected ${CONFIG.products[food.key].icon} ${CONFIG.products[food.key].name}`);sound('collect');maintainFood()}}
}
function deliverBox(){const units=total(state.order),speed=Math.round(CONFIG.scoring.maxSpeedBonus*state.orderTime/state.orderDeadline),streakBonus=Math.min(CONFIG.scoring.maxStreakBonus,state.streak*CONFIG.scoring.streakStep),points=CONFIG.scoring.correctOrder+units*CONFIG.scoring.perUnit+speed+streakBonus;state.score+=points;state.completed++;state.streak++;state.bestStreak=Math.max(state.bestStreak,state.streak);burst();feedback(`Delivery complete! +${points}`);sound('correct');beginTransition('success')}
function miss(){state.score=Math.max(0,state.score-CONFIG.scoring.missedPenalty);state.missed++;state.streak=0;feedback('The truck left — all boxes cleared',true);sound('missed');beginTransition('missed')}
function burst(){for(let i=0;i<20;i++)state.particles.push({x:400,y:85,vx:(Math.random()-.5)*160,vy:40+Math.random()*100,life:.8,color:['#b4ed73','#ffd35c','#fff'][i%3]})}
function update(dt){state.elapsed+=dt;state.timeLeft=Math.max(0,120-state.elapsed);if(state.timeLeft<=0){finish();return}move(dt);state.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt});state.particles=state.particles.filter(p=>p.life>0);if(state.order){state.orderTime-=dt;if(state.orderTime<=0){miss();return}if(state.orderTime<=CONFIG.warningSeconds&&!state.warning){state.warning=true;feedback('Truck leaving soon!');sound('warning')}updateConveyor(dt);handleAutomaticInteractions()}else updateTransition(dt)}
function accuracy(){const n=state.completed+state.missed;return n?Math.round(state.completed/n*100):0}function finish(){state.running=false;state.elapsed=120;state.timeLeft=0;clearInput();saveBest();updateHud();$('finalScore').textContent=state.score.toLocaleString();$('finalBest').textContent=state.best.toLocaleString();$('finalCompleted').textContent=state.completed;$('finalMissed').textContent=state.missed;$('finalAccuracy').textContent=`${accuracy()}%`;$('finalStreak').textContent=state.bestStreak;ui.results.classList.remove('hidden');sound('roundEnd')}
function itemHtml(inv){const e=productKeys.filter(k=>inv[k]>0);return e.length?e.map(k=>`<span class="item"><img src="${productAsset(k)}" alt="">${CONFIG.products[k].name} ${inv[k]}</span>`).join(''):'<span class="item">—</span>'}
function updateHud(){ui.score.textContent=state.score.toLocaleString();ui.roundTime.textContent=formatTime(state.timeLeft);ui.orderNumber.textContent=state.order?`Order ${state.orderNumber}`:'Order —';ui.orderTime.textContent=state.order?`${Math.max(0,state.orderTime).toFixed(1)}s`:'—';ui.deadlineBar.style.width=state.order?`${Math.max(0,state.orderTime/state.orderDeadline*100)}%`:'0%';ui.requested.innerHTML=state.order?itemHtml(state.order):itemHtml({})}
function drawShed(){
  ctx.fillStyle='#b8814b';ctx.fillRect(0,0,800,600);
  for(let y=0;y<600;y+=42){ctx.strokeStyle='rgba(83,48,25,.18)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke()}
  ctx.fillStyle='#705035';ctx.fillRect(0,0,800,105);
  ctx.fillStyle='#d6bd86';ctx.fillRect(LOADING.x,0,LOADING.w,105);
}
function drawConveyor(){
  if(!drawSprite('conveyor',216.5,308,393,366)){
    ctx.fillStyle='#303638';
    ctx.fillRect(50,125,50,234);
    ctx.beginPath();ctx.roundRect(50,315,285,85,40);ctx.fill();
    ctx.fillStyle='#151b17';ctx.fillRect(DISCARD.x,DISCARD.y,DISCARD.w,DISCARD.h);
  }
}
function truckOffset(){if(state.order)return 0;const p=Math.min(1,state.vehicle.elapsed/CONFIG.vehicleTransitionSeconds);if(state.vehicle.mode==='arriving')return(p-1)*500;return p<.5?p*1000:(p-1)*1000}
function drawTruck(){
  const x=400+truckOffset();
  if(drawSprite('truck',x,54,154,79))return;
  ctx.save();ctx.translate(x,54);const unhappy=state.vehicle.mode==='missed'&&state.vehicle.elapsed<CONFIG.vehicleTransitionSeconds/2;ctx.fillStyle=unhappy?'#a7473f':'#d95a45';ctx.fillRect(-63,-23,94,46);ctx.fillStyle='#ead9ae';ctx.fillRect(31,-15,43,38);ctx.fillStyle='#a9d9e8';ctx.fillRect(39,-10,26,18);ctx.fillStyle='#252723';for(const wheelX of[-42,52]){ctx.beginPath();ctx.arc(wheelX,25,12,0,Math.PI*2);ctx.fill()}ctx.restore();
}
function boxPath(b,damaged=false){const left=b.x+25,right=b.x+b.w-25,top=b.y+43,bottom=b.y+b.h-20;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(right,top+(damaged?7:0));ctx.lineTo(right-(damaged?16:0),bottom);ctx.lineTo(left+(damaged?9:0),bottom-(damaged?8:0));ctx.closePath()}
function drawStatusBadge(b,status){if(status==='open')return;ctx.fillStyle=status==='sealed'?'#397339':'#a7362e';ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+17,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 27px system-ui';ctx.textAlign='center';ctx.fillText(status==='sealed'?'✓':'×',b.x+b.w/2,b.y+26)}
function drawOpenBox(b){const left=b.x+25,right=b.x+b.w-25,top=b.y+50,bottom=b.y+b.h-20;ctx.fillStyle='#664329';ctx.beginPath();ctx.ellipse(b.x+b.w/2,bottom+8,62,15,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8a5b31';boxPath(b);ctx.fill();ctx.strokeStyle='#54351f';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#3c281b';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(right,top);ctx.lineTo(right-16,top+25);ctx.lineTo(left+16,top+25);ctx.closePath();ctx.fill();ctx.fillStyle='#c18a4d';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left+30,top+23);ctx.lineTo(b.x+8,top+10);ctx.lineTo(b.x+23,top-20);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(right,top);ctx.lineTo(right-30,top+23);ctx.lineTo(b.x+b.w-8,top+10);ctx.lineTo(b.x+b.w-23,top-20);ctx.closePath();ctx.fill();ctx.strokeStyle='#6b4528';ctx.stroke()}
function drawClosedBox(b,bad=false){ctx.fillStyle=bad?'#925343':'#b47b42';boxPath(b,bad);ctx.fill();ctx.strokeStyle=bad?'#572d29':'#5a3b24';ctx.lineWidth=5;ctx.stroke();if(bad){ctx.beginPath();ctx.moveTo(b.x+55,b.y+68);ctx.lineTo(b.x+75,b.y+83);ctx.lineTo(b.x+64,b.y+103);ctx.lineTo(b.x+90,b.y+119);ctx.stroke()}else{ctx.fillStyle='#dfbd78';ctx.fillRect(b.x+b.w/2-9,b.y+44,18,b.h-65)}}
function drawBoxContents(b,box){
  const items=[];productKeys.filter(k=>box.items[k]).forEach(k=>{for(let n=0;n<box.items[k];n++)items.push(k)});
  if(!items.length)return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(b.x+b.w/2-27,b.y+b.h/2-17,54,34,6);
  ctx.clip();
  items.slice(0,4).forEach((key,index)=>{
    const offset=(index-(Math.min(items.length,4)-1)/2)*15;
    const [width,height]=FOOD_SIZES[key];
    drawSprite(key,b.x+b.w/2+offset,b.y+b.h/2+2,width*.42,height*.42);
  });
  ctx.restore();
}
function drawBoxes(){
  BOXES.forEach((b,index)=>{
    const box=state.boxes[index];if(state.carryBox===index)return;
    const key=box.status==='open'?'boxOpen':box.status==='sealed'?'boxClosed':'boxDamaged';
    const ready=drawSprite(key,b.x+b.w/2,b.y+b.h/2,key==='boxOpen'?82:74,key==='boxOpen'?72:61);
    if(!ready){drawStatusBadge(b,box.status);if(box.status==='open')drawOpenBox(b);else drawClosedBox(b,box.status==='bad')}
    if(box.status==='open')drawBoxContents(b,box);
  });
}
function drawFoods(){
  state.foods.forEach(food=>{
    if(food.beltDistance<CONVEYOR.y||food.x>420)return;
    const [width,height]=FOOD_SIZES[food.key];
    ctx.save();ctx.shadowColor='rgba(0,0,0,.62)';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(!drawSprite(food.key,food.x,food.y,width,height)){ctx.font='31px system-ui';ctx.textAlign='center';ctx.fillText(CONFIG.products[food.key].icon,food.x,food.y)}
    ctx.restore();
  });
}
function drawPlayer(){
  const p=state.player,a=Math.atan2(p.facingY,p.facingX),stride=Math.sin(p.step)*2;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);
  ctx.fillStyle='rgba(34,45,28,.24)';ctx.beginPath();ctx.ellipse(-2,6,22,14,0,0,Math.PI*2);ctx.fill();
  if(!window.FARM_LEAGUE_FARMER?.drawLocal(ctx,p.step,50)){
    ctx.fillStyle='#3a2c24';ctx.beginPath();ctx.ellipse(-12+stride,-8,8,5,-.25,0,Math.PI*2);ctx.ellipse(-12-stride,8,8,5,.25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#356a78';ctx.beginPath();ctx.ellipse(-1,0,18,14,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f0b978';ctx.beginPath();ctx.arc(10,0,12,0,Math.PI*2);ctx.arc(-1,-15,5,0,Math.PI*2);ctx.arc(-1,15,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#efc64e';ctx.beginPath();ctx.ellipse(8,0,14,21,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#dcae35';ctx.beginPath();ctx.ellipse(7,0,10,13,0,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  if(state.carryFood||state.carryBox!==null){
    ctx.fillStyle='rgba(13,32,19,.9)';ctx.beginPath();ctx.arc(p.x,p.y-39,22,0,Math.PI*2);ctx.fill();
    if(state.carryBox!==null){
      if(!drawSprite('boxClosed',p.x,p.y-39,34,28)){ctx.font='25px system-ui';ctx.textAlign='center';ctx.fillText('📦',p.x,p.y-32)}
    }else{
      const [width,height]=FOOD_SIZES[state.carryFood.key];
      if(!drawSprite(state.carryFood.key,p.x,p.y-39,width*.72,height*.72)){ctx.font='25px system-ui';ctx.textAlign='center';ctx.fillText(CONFIG.products[state.carryFood.key].icon,p.x,p.y-32)}
    }
  }
}
function updateMobileCamera(){
  if(!mobileCameraQuery?.matches){
    ['left','top','width','height','transform'].forEach(property=>canvas.style.removeProperty(property));
    return;
  }
  const stage=canvas.parentElement;
  if(!stage?.clientHeight||!stage.clientWidth)return;
  const scale=Math.max(stage.clientWidth/canvas.width,stage.clientHeight/canvas.height);
  const renderedWidth=canvas.width*scale,renderedHeight=canvas.height*scale;
  const minimumLeft=Math.min(0,stage.clientWidth-renderedWidth);
  const minimumTop=Math.min(0,stage.clientHeight-renderedHeight);
  const centredLeft=stage.clientWidth/2-state.player.x*scale;
  const centredTop=stage.clientHeight/2-state.player.y*scale;
  canvas.style.width=`${renderedWidth}px`;
  canvas.style.height=`${renderedHeight}px`;
  canvas.style.left=`${Math.max(minimumLeft,Math.min(0,centredLeft))}px`;
  canvas.style.top=`${Math.max(minimumTop,Math.min(0,centredTop))}px`;
  canvas.style.transform='none';
}
function draw(){updateMobileCamera();drawShed();drawConveyor();drawTruck();drawBoxes();drawFoods();drawPlayer();state.particles.forEach(p=>{ctx.globalAlpha=p.life/.8;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,6,6)});ctx.globalAlpha=1}
function loop(t){if(!state.running)return;const dt=Math.min(.04,(t-last)/1000);last=t;update(dt);updateHud();draw();if(state.running)raf=requestAnimationFrame(loop)}
function keyName(e){return e.key.length===1?e.key.toLowerCase():e.key}addEventListener('keydown',e=>{const k=keyName(e);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){e.preventDefault();keys[k]=true}});addEventListener('keyup',e=>keys[keyName(e)]=false);addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput()});
document.querySelector('[data-farm-dpad]').addEventListener('farmleague:directionchange',e=>{mobileDirection=e.detail.direction});
$('startButton').addEventListener('click',startRound);$('restartButton').addEventListener('click',startRound);state=fresh();resetRound();
