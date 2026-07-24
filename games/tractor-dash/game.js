const CONFIG = window.TRACTOR_DASH_CONFIG;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const speedEl = document.getElementById('speed');
const bestEl = document.getElementById('best');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const exitButton = document.getElementById('exitButton');
const W = canvas.width;
const H = canvas.height;
const TILE = CONFIG.tileSize;
const keys = {};

let running = false;
let last = 0;
let score = 0;
let best = 0;
let timeLeft = CONFIG.roundSeconds;
let elapsed = 0;
let speedPoints = 0;
let obstacles = [];
let animals = [];
let mown = new Set();
let particles = [];
let spawnClock = 0;
let field;
let level = 1;
let fieldsCleared = 0;
let transition = null;
let raf = 0;
let runSeed = 0;

const tractor = {
  x: 0,
  y: 0,
  r: CONFIG.tractor.radius,
  dx: 1,
  dy: 0,
  base: CONFIG.tractor.baseSpeed,
  mult: 1,
  crashTimer: 0,
  crashCooldown: 0
};

function seededRandom(seed) {
  let value = seed + 0x6D2B79F5;
  return () => {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result ^= result + Math.imul(result ^ result >>> 7, 61 | result);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function fieldProfile(fieldLevel) {
  const settings = CONFIG.fields;
  return {
    columns: Math.min(settings.maxColumns, settings.baseColumns + (fieldLevel - 1) * settings.columnsPerLevel),
    rows: Math.min(settings.maxRows, settings.baseRows + (fieldLevel - 1) * settings.rowsPerLevel),
    obstacleCount: Math.min(settings.maxObstacles, settings.baseObstacles + (fieldLevel - 1) * settings.obstaclesPerLevel),
    animalCap: Math.min(settings.maxAnimals, Math.max(0, fieldLevel - settings.firstAnimalLevel + 1)),
    animalInterval: Math.max(2.6, 8.5 - fieldLevel * 0.7)
  };
}

function coll(a, b, padding = 0) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + padding;
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function tileBlocked(x, y) {
  const point = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, r: TILE * 0.36 };
  return obstacles.some(obstacle => coll(point, obstacle, 2));
}

function generateObstacles(profile) {
  const random = seededRandom((runSeed ^ Math.imul(level, 92821) ^ 4177) >>> 0);
  const generated = [];
  for (let attempt = 0; attempt < 250 && generated.length < profile.obstacleCount; attempt++) {
    const type = random() < 0.58 ? 'tree' : 'rock';
    const obstacle = {
      x: field.left + 65 + random() * (field.width - 130),
      y: field.top + 65 + random() * (field.height - 130),
      r: type === 'tree' ? 27 : 21,
      type
    };
    if (Math.hypot(obstacle.x, obstacle.y) < 115) continue;
    if (generated.some(existing => coll(obstacle, existing, 45))) continue;
    generated.push(obstacle);
  }
  return generated;
}

function countMowableTiles() {
  let count = 0;
  for (let y = field.minTileY; y <= field.maxTileY; y++) {
    for (let x = field.minTileX; x <= field.maxTileX; x++) {
      if (!tileBlocked(x, y)) count++;
    }
  }
  return count;
}

function buildField(fieldLevel) {
  level = fieldLevel;
  const profile = fieldProfile(level);
  const minTileX = -Math.floor(profile.columns / 2);
  const maxTileX = minTileX + profile.columns - 1;
  const minTileY = -Math.floor(profile.rows / 2);
  const maxTileY = minTileY + profile.rows - 1;
  const width = profile.columns * TILE;
  const height = profile.rows * TILE;
  field = {
    ...profile,
    width,
    height,
    left: minTileX * TILE,
    right: (maxTileX + 1) * TILE,
    top: minTileY * TILE,
    bottom: (maxTileY + 1) * TILE,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    totalTiles: 0
  };
  obstacles = generateObstacles(profile);
  field.totalTiles = countMowableTiles();
  mown = new Set();
  animals = [];
  particles = [];
  spawnClock = 0;
  tractor.x = 0;
  tractor.y = 0;
  tractor.crashTimer = 0;
  tractor.crashCooldown = 0;
  for (let i = 0; i < Math.min(profile.animalCap, Math.ceil(level / 3)); i++) {
    spawnAnimal(i % 2 ? 'sheep' : 'cow');
  }
}

function reset() {
  score = 0;
  speedPoints = 0;
  timeLeft = CONFIG.roundSeconds;
  elapsed = 0;
  fieldsCleared = 0;
  transition = null;
  runSeed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  tractor.dx = 1;
  tractor.dy = 0;
  tractor.mult = 1;
  buildField(1);
  updateHud();
}

function start() {
  reset();
  running = true;
  startOverlay.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  exitButton.classList.remove('hidden');
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function end(type) {
  running = false;
  cancelAnimationFrame(raf);
  exitButton.classList.add('hidden');
  best = Math.max(best, score);
  document.getElementById('gameOverTitle').textContent =
    type === 'timer' ? 'Time!' :
    type === 'cow' ? 'You hit a cow' :
    type === 'sheep' ? 'You hit a sheep' : 'Run ended';
  document.getElementById('finalText').textContent = `You scored ${Math.floor(score).toLocaleString()} points.`;
  document.getElementById('finalTime').textContent = `Time survived: ${formatTime(elapsed)}`;
  document.getElementById('finalSpeed').textContent = `Fields cleared: ${fieldsCleared}`;
  bestEl.textContent = Math.floor(best).toLocaleString();
  gameOverOverlay.classList.remove('hidden');
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function updateHud() {
  scoreEl.textContent = Math.floor(score).toLocaleString();
  timeEl.textContent = formatTime(timeLeft);
  speedEl.textContent = `${tractor.crashTimer > 0 ? '0.00' : tractor.mult.toFixed(2)}x`;
  bestEl.textContent = Math.floor(best).toLocaleString();
}

function resolveDir() {
  let x = 0;
  let y = 0;
  if (keys.ArrowUp || keys.w) y--;
  if (keys.ArrowDown || keys.s) y++;
  if (keys.ArrowLeft || keys.a) x--;
  if (keys.ArrowRight || keys.d) x++;
  if (x || y) {
    const length = Math.hypot(x, y);
    tractor.dx = x / length;
    tractor.dy = y / length;
  }
}

function nearbyObstacles(x, y, radius = 70) {
  return obstacles.filter(obstacle => Math.abs(obstacle.x - x) < radius && Math.abs(obstacle.y - y) < radius);
}

function move(dt) {
  resolveDir();
  tractor.crashCooldown = Math.max(0, tractor.crashCooldown - dt);
  if (tractor.crashTimer > 0) {
    tractor.crashTimer = Math.max(0, tractor.crashTimer - dt);
    return;
  }

  const speed = tractor.base * tractor.mult;
  const dx = tractor.dx * speed * dt;
  const dy = tractor.dy * speed * dt;
  const minX = field.left + tractor.r + 8;
  const maxX = field.right - tractor.r - 8;
  const minY = field.top + tractor.r + 8;
  const maxY = field.bottom - tractor.r - 8;
  const nextX = Math.max(minX, Math.min(maxX, tractor.x + dx));
  const nextY = Math.max(minY, Math.min(maxY, tractor.y + dy));
  const testX = { x: nextX, y: tractor.y, r: tractor.r };
  const testY = { x: tractor.x, y: nextY, r: tractor.r };
  const hitX = nearbyObstacles(testX.x, testX.y).some(obstacle => coll(testX, obstacle, 1));
  const hitY = nearbyObstacles(testY.x, testY.y).some(obstacle => coll(testY, obstacle, 1));

  if (!hitX) tractor.x = nextX;
  if (!hitY) tractor.y = nextY;
  if ((hitX || hitY) && tractor.crashCooldown <= 0) {
    tractor.crashTimer = 0.45;
    tractor.crashCooldown = 0.9;
    speedPoints = 0;
    tractor.mult = 1;
    tractor.x = Math.max(minX, Math.min(maxX, tractor.x - tractor.dx * 12));
    tractor.y = Math.max(minY, Math.min(maxY, tractor.y - tractor.dy * 12));
  }
}

function completeField() {
  fieldsCleared = level;
  const bonus = CONFIG.fieldClearBonus * level;
  score += bonus;
  animals = [];
  transition = { timeLeft: CONFIG.transitionSeconds, nextLevel: level + 1, bonus };
}

function mow() {
  const gridX = Math.floor(tractor.x / TILE);
  const gridY = Math.floor(tractor.y / TILE);
  for (let y = gridY - 1; y <= gridY + 1; y++) {
    for (let x = gridX - 1; x <= gridX + 1; x++) {
      if (x < field.minTileX || x > field.maxTileX || y < field.minTileY || y > field.maxTileY) continue;
      const key = tileKey(x, y);
      const centerX = (x + 0.5) * TILE;
      const centerY = (y + 0.5) * TILE;
      if (!mown.has(key) && !tileBlocked(x, y) && Math.hypot(centerX - tractor.x, centerY - tractor.y) < tractor.r + TILE * 0.7) {
        mown.add(key);
        score++;
        speedPoints++;
        if (Math.random() < 0.18) {
          particles.push({ x: centerX, y: centerY, life: 0.35, vx: (Math.random() - 0.5) * 35, vy: -15 - Math.random() * 25 });
        }
      }
    }
  }
  tractor.mult = 1 + Math.min(CONFIG.tractor.maxMultiplier - 1, speedPoints / CONFIG.tractor.tilesPerMultiplier);
  if (mown.size >= field.totalTiles && !transition) completeField();
}

function spawnAnimal(type) {
  if (!field) return;
  const random = Math.random;
  for (let attempt = 0; attempt < 40; attempt++) {
    const radius = type === 'cow' ? 20 : 16;
    const x = field.left + 55 + random() * (field.width - 110);
    const y = field.top + 55 + random() * (field.height - 110);
    const candidate = { x, y, r: radius };
    if (Math.hypot(x - tractor.x, y - tractor.y) < 180) continue;
    if (obstacles.some(obstacle => coll(candidate, obstacle, 18))) continue;
    const angle = random() * Math.PI * 2;
    const speed = type === 'cow' ? 37 : 54;
    animals.push({
      ...candidate,
      type,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      t: 0.8 + random() * 2.2
    });
    return;
  }
}

function updateAnimals(dt) {
  animals.forEach(animal => {
    animal.t -= dt;
    if (animal.t <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const speed = animal.type === 'cow' ? 37 : 54;
      animal.vx = Math.cos(angle) * speed;
      animal.vy = Math.sin(angle) * speed;
      animal.t = 0.7 + Math.random() * 2.5;
    }
    animal.x += animal.vx * dt;
    animal.y += animal.vy * dt;
    const margin = animal.r + 12;
    if (animal.x < field.left + margin || animal.x > field.right - margin) {
      animal.x = Math.max(field.left + margin, Math.min(field.right - margin, animal.x));
      animal.vx *= -1;
    }
    if (animal.y < field.top + margin || animal.y > field.bottom - margin) {
      animal.y = Math.max(field.top + margin, Math.min(field.bottom - margin, animal.y));
      animal.vy *= -1;
    }
  });
  for (const animal of animals) {
    if (coll(tractor, animal, 1)) {
      end(animal.type);
      return;
    }
  }
}

function updateSpawns(dt) {
  if (animals.length >= field.animalCap) return;
  spawnClock += dt;
  if (spawnClock < field.animalInterval) return;
  spawnClock = 0;
  spawnAnimal(Math.random() < 0.58 ? 'cow' : 'sheep');
}

function updateParticles(dt) {
  particles.forEach(particle => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  });
  particles = particles.filter(particle => particle.life > 0);
}

function worldToScreen(x, y) {
  return { x: x - tractor.x + W / 2, y: y - tractor.y + H / 2 };
}

function drawGround() {
  ctx.fillStyle = '#8a7048';
  ctx.fillRect(0, 0, W, H);
  const startX = Math.max(field.minTileX, Math.floor((tractor.x - W / 2) / TILE) - 1);
  const endX = Math.min(field.maxTileX, Math.ceil((tractor.x + W / 2) / TILE) + 1);
  const startY = Math.max(field.minTileY, Math.floor((tractor.y - H / 2) / TILE) - 1);
  const endY = Math.min(field.maxTileY, Math.ceil((tractor.y + H / 2) / TILE) + 1);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const screen = worldToScreen(x * TILE, y * TILE);
      const blocked = tileBlocked(x, y);
      const cut = blocked || mown.has(tileKey(x, y));
      ctx.fillStyle = cut ? ((x + y) % 2 ? '#b9cb75' : '#adc268') : ((x + y) % 2 ? '#5ca34d' : '#63ad51');
      ctx.fillRect(screen.x, screen.y, TILE + 1, TILE + 1);
      if (!cut) {
        ctx.strokeStyle = 'rgba(31,94,36,.28)';
        ctx.lineWidth = 1.4;
        const sway = ((x * 13 + y * 7) % 5) - 2;
        ctx.beginPath();
        ctx.moveTo(screen.x + 7, screen.y + 20);
        ctx.lineTo(screen.x + 8 + sway, screen.y + 7);
        ctx.moveTo(screen.x + 17, screen.y + 20);
        ctx.lineTo(screen.x + 16 - sway, screen.y + 8);
        ctx.stroke();
      }
    }
  }

  const topLeft = worldToScreen(field.left, field.top);
  ctx.strokeStyle = '#d1aa62';
  ctx.lineWidth = 10;
  ctx.strokeRect(topLeft.x, topLeft.y, field.width, field.height);
  ctx.strokeStyle = '#684a2e';
  ctx.lineWidth = 3;
  ctx.strokeRect(topLeft.x, topLeft.y, field.width, field.height);
}

function drawObstacle(obstacle) {
  const screen = worldToScreen(obstacle.x, obstacle.y);
  if (screen.x < -50 || screen.x > W + 50 || screen.y < -50 || screen.y > H + 50) return;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  if (obstacle.type === 'rock') {
    ctx.fillStyle = '#66706b';
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.lineTo(-12, -12);
    ctx.lineTo(2, -19);
    ctx.lineTo(18, -8);
    ctx.lineTo(16, 13);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#6c4c2e';
    ctx.fillRect(-5, 6, 10, 22);
    ctx.fillStyle = '#2f6c39';
    ctx.beginPath();
    ctx.arc(0, -6, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b8146';
    ctx.beginPath();
    ctx.arc(-10, -13, 15, 0, Math.PI * 2);
    ctx.arc(12, -10, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAnimal(animal) {
  const screen = worldToScreen(animal.x, animal.y);
  if (screen.x < -60 || screen.x > W + 60 || screen.y < -60 || screen.y > H + 60) return;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(Math.atan2(animal.vy, animal.vx));
  if (animal.type === 'cow') {
    ctx.fillStyle = '#f2eadb';
    ctx.fillRect(-18, -12, 34, 24);
    ctx.fillStyle = '#2b2d2b';
    ctx.fillRect(-12, -8, 8, 8);
    ctx.fillRect(4, 2, 9, 7);
    ctx.fillStyle = '#d9b889';
    ctx.beginPath();
    ctx.arc(18, -2, 10, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f3f0df';
    ctx.beginPath();
    ctx.arc(-5, 0, 14, 0, Math.PI * 2);
    ctx.arc(5, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#303630';
    ctx.beginPath();
    ctx.arc(16, 0, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTractor() {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.atan2(tractor.dy, tractor.dx) + Math.PI / 2);
  ctx.globalAlpha = tractor.crashTimer > 0 && Math.floor(tractor.crashTimer * 12) % 2 === 0 ? 0.45 : 1;
  ctx.fillStyle = '#181b19';
  ctx.fillRect(-20, -23, 9, 20);
  ctx.fillRect(11, -23, 9, 20);
  ctx.fillRect(-20, 7, 9, 20);
  ctx.fillRect(11, 7, 9, 20);
  ctx.fillStyle = '#d93f36';
  ctx.fillRect(-12, -25, 24, 48);
  ctx.fillStyle = '#b92e28';
  ctx.fillRect(-9, 10, 18, 18);
  ctx.fillStyle = '#9fd6e8';
  ctx.fillRect(-8, -18, 16, 17);
  ctx.strokeStyle = '#d9f1f7';
  ctx.lineWidth = 2;
  ctx.strokeRect(-8, -18, 16, 17);
  ctx.fillStyle = '#f0c44d';
  ctx.fillRect(-8, -29, 6, 6);
  ctx.fillRect(2, -29, 6, 6);
  ctx.fillStyle = '#6d843f';
  ctx.fillRect(-17, 23, 34, 8);
  ctx.fillStyle = '#50642d';
  ctx.fillRect(-22, 28, 44, 5);
  ctx.restore();
}

function drawParticles() {
  ctx.fillStyle = 'rgba(226,240,142,.85)';
  particles.forEach(particle => {
    const screen = worldToScreen(particle.x, particle.y);
    ctx.globalAlpha = Math.max(0, particle.life / 0.35);
    ctx.fillRect(screen.x, screen.y, 3, 8);
  });
  ctx.globalAlpha = 1;
}

function drawFieldStatus() {
  const progress = field.totalTiles ? Math.min(100, Math.round(mown.size / field.totalTiles * 100)) : 0;
  ctx.fillStyle = 'rgba(16,33,22,.9)';
  ctx.beginPath();
  ctx.roundRect(16, 16, 154, 54, 12);
  ctx.fill();
  ctx.fillStyle = '#f7f6ea';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`Field ${level}`, 30, 39);
  ctx.fillStyle = '#a6e36d';
  ctx.font = 'bold 14px system-ui';
  ctx.fillText(`${progress}% mown`, 30, 59);
}

function drawTransition() {
  if (!transition) return;
  ctx.fillStyle = 'rgba(8,22,12,.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#a6e36d';
  ctx.font = 'bold 50px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Field cleared!', W / 2, H / 2 - 10);
  ctx.fillStyle = '#f7f6ea';
  ctx.font = 'bold 22px system-ui';
  ctx.fillText(`+${transition.bonus} bonus · Field ${transition.nextLevel} next`, W / 2, H / 2 + 35);
}

function draw() {
  drawGround();
  obstacles.forEach(drawObstacle);
  animals.forEach(drawAnimal);
  drawParticles();
  drawTractor();
  drawFieldStatus();
  drawTransition();
}

function loop(timestamp) {
  if (!running) return;
  const dt = Math.min(0.033, (timestamp - last) / 1000);
  last = timestamp;

  if (transition) {
    transition.timeLeft -= dt;
    updateParticles(dt);
    if (transition.timeLeft <= 0) {
      const nextLevel = transition.nextLevel;
      transition = null;
      buildField(nextLevel);
    }
  } else {
    elapsed += dt;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud();
      draw();
      end('timer');
      return;
    }
    move(dt);
    mow();
    if (!transition) {
      updateAnimals(dt);
      if (!running) return;
      updateSpawns(dt);
    }
    updateParticles(dt);
  }

  updateHud();
  draw();
  if (running) raf = requestAnimationFrame(loop);
}

function setDir(direction, on) {
  keys[{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[direction]] = on;
}

addEventListener('keydown', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) {
    event.preventDefault();
    keys[key] = true;
  }
});

addEventListener('keyup', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys[key] = false;
});

addEventListener('blur', () => Object.keys(keys).forEach(key => keys[key] = false));

document.querySelectorAll('[data-dir]').forEach(button => {
  const direction = button.dataset.dir;
  ['pointerdown', 'touchstart'].forEach(name => button.addEventListener(name, event => {
    event.preventDefault();
    setDir(direction, true);
  }, { passive: false }));
  ['pointerup', 'pointercancel', 'pointerleave', 'touchend'].forEach(name => button.addEventListener(name, event => {
    event.preventDefault();
    setDir(direction, false);
  }, { passive: false }));
  button.addEventListener('contextmenu', event => event.preventDefault());
});

document.getElementById('startButton').addEventListener('click', start);
document.getElementById('restartButton').addEventListener('click', start);
exitButton.addEventListener('click', () => end('exit'));

reset();
draw();
