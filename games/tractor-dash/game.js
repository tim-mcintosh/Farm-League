const CONFIG = window.TRACTOR_DASH_CONFIG;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const speedEl = document.getElementById('speed');
const fieldProgressEl = document.getElementById('fieldProgress');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const W = canvas.width;
const H = canvas.height;
const TILE = CONFIG.tileSize;
const FARM_RENDERING = window.FARM_RENDERING;
const keys = {};
let mobileDirection = null;

const SPRITE_DEFINITIONS = Object.freeze({
  tractor: { src: 'assets/tractor-top-down.png', width: 48, height: 76 },
  tree: { src: 'assets/tree-top-down.png', width: 66, height: 66 },
  stone: { src: 'assets/stone-top-down.png', width: 48, height: 48 },
  cow: { src: '../../assets/shared/game-sprites/cow-top-down.png', width: 66, height: 36 },
  sheep: { src: '../../assets/shared/game-sprites/sheep-top-down.png', width: 56, height: 34 }
});
const sprites = {};

for (const [name, definition] of Object.entries(SPRITE_DEFINITIONS)) {
  const image = new Image();
  image.src = definition.src;
  sprites[name] = image;
}

let running = false;
let last = 0;
let score = 0;
let best = loadBestScore();
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

function loadBestScore() {
  try {
    const stored = Number(localStorage.getItem(CONFIG.bestScoreKey));
    return Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  const candidate = Math.max(0, Math.floor(score));
  if (candidate <= best) return;
  best = candidate;
  try {
    localStorage.setItem(CONFIG.bestScoreKey, String(best));
  } catch {
    // The current session still tracks the best score when storage is unavailable.
  }
}

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
  clearInput();
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
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function end(type) {
  running = false;
  cancelAnimationFrame(raf);
  clearInput();
  saveBestScore();
  document.getElementById('gameOverTitle').textContent =
    type === 'timer' ? 'Time!' :
    type === 'cow' ? 'You hit a cow' :
    type === 'sheep' ? 'You hit a sheep' : 'Run ended';
  document.getElementById('finalText').textContent = `You scored ${Math.floor(score).toLocaleString()} points.`;
  document.getElementById('finalBest').textContent = `Best score: ${Math.floor(best).toLocaleString()}`;
  const survived = Math.min(elapsed, CONFIG.roundSeconds);
  document.getElementById('finalTime').textContent = `Time survived: ${formatTime(survived)}`;
  document.getElementById('finalSpeed').textContent = `Fields cleared: ${fieldsCleared}`;
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
  const progress = field.totalTiles ? Math.min(100, Math.round(mown.size / field.totalTiles * 100)) : 0;
  fieldProgressEl.textContent = `${level} · ${progress}%`;
}

function resolveDir() {
  let x = 0;
  let y = 0;
  if (keys.ArrowUp || keys.w || mobileDirection === 'up') y--;
  if (keys.ArrowDown || keys.s || mobileDirection === 'down') y++;
  if (keys.ArrowLeft || keys.a || mobileDirection === 'left') x--;
  if (keys.ArrowRight || keys.d || mobileDirection === 'right') x++;
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

function spriteReady(name) {
  const image = sprites[name];
  return Boolean(image?.complete && image.naturalWidth > 0);
}

function drawSprite(name) {
  const image = sprites[name];
  const definition = SPRITE_DEFINITIONS[name];
  if (!spriteReady(name)) return false;
  ctx.drawImage(
    image,
    -definition.width / 2,
    -definition.height / 2,
    definition.width,
    definition.height
  );
  return true;
}

function drawSpriteShadow(radiusX, radiusY, offsetY = 5) {
  ctx.fillStyle = 'rgba(20, 31, 23, .25)';
  ctx.beginPath();
  ctx.ellipse(0, offsetY, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrassTile(screen, tileX, tileY, cut) {
  FARM_RENDERING.drawCleanArcadeGrassTile(ctx, screen, tileX, tileY, TILE, cut);
}

function drawGround() {
  const startX = Math.floor((tractor.x - W / 2) / TILE) - 1;
  const endX = Math.ceil((tractor.x + W / 2) / TILE) + 1;
  const startY = Math.floor((tractor.y - H / 2) / TILE) - 1;
  const endY = Math.ceil((tractor.y + H / 2) / TILE) + 1;

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const screen = worldToScreen(x * TILE, y * TILE);
      const insideField = x >= field.minTileX && x <= field.maxTileX && y >= field.minTileY && y <= field.maxTileY;
      const blocked = insideField && tileBlocked(x, y);
      const cut = insideField && (blocked || mown.has(tileKey(x, y)));
      drawGrassTile(screen, x, y, cut);
    }
  }

  const topLeft = worldToScreen(field.left, field.top);
  const right = topLeft.x + field.width;
  const bottom = topLeft.y + field.height;
  drawFenceSegment(topLeft.x, topLeft.y, right, topLeft.y);
  drawFenceSegment(topLeft.x, bottom, right, bottom);
  drawFenceSegment(topLeft.x, topLeft.y, topLeft.x, bottom);
  drawFenceSegment(right, topLeft.y, right, bottom);
}

function drawFenceSegment(x1, y1, x2, y2) {
  FARM_RENDERING.drawFarmFenceSegment(ctx, x1, y1, x2, y2);
}

function drawObstacle(obstacle) {
  const screen = worldToScreen(obstacle.x, obstacle.y);
  if (screen.x < -50 || screen.x > W + 50 || screen.y < -50 || screen.y > H + 50) return;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  const spriteName = obstacle.type === 'rock' ? 'stone' : 'tree';
  if (spriteReady(spriteName)) {
    drawSpriteShadow(obstacle.type === 'rock' ? 20 : 27, obstacle.type === 'rock' ? 8 : 11, 10);
    drawSprite(spriteName);
    ctx.restore();
    return;
  }
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
  if (spriteReady(animal.type)) {
    drawSpriteShadow(animal.type === 'cow' ? 25 : 21, animal.type === 'cow' ? 10 : 9, 6);
    drawSprite(animal.type);
    ctx.restore();
    return;
  }
  if (animal.type === 'cow') {
    ctx.fillStyle = 'rgba(28, 35, 29, .22)';
    ctx.beginPath();
    ctx.ellipse(-2, 7, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a322b';
    for (const [x, y] of [[-12, -12], [-12, 12], [8, -12], [8, 12]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#f2eadb';
    ctx.beginPath();
    ctx.ellipse(-3, 0, 21, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2b2d2b';
    ctx.beginPath();
    ctx.ellipse(-10, -6, 8, 6, -.25, 0, Math.PI * 2);
    ctx.ellipse(4, 7, 7, 5, .3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#554334';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-28, -5, -28, -11);
    ctx.stroke();
    ctx.fillStyle = '#332c27';
    ctx.beginPath();
    ctx.arc(-28, -12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.ellipse(17, 0, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(14, -11, 7, 4, -.35, 0, Math.PI * 2);
    ctx.ellipse(14, 11, 7, 4, .35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e4c67b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, -8);
    ctx.quadraticCurveTo(21, -15, 25, -13);
    ctx.moveTo(17, 8);
    ctx.quadraticCurveTo(21, 15, 25, 13);
    ctx.stroke();

    ctx.fillStyle = '#d9a99d';
    ctx.beginPath();
    ctx.ellipse(24, 0, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54413b';
    ctx.beginPath();
    ctx.arc(26, -3, 1.3, 0, Math.PI * 2);
    ctx.arc(26, 3, 1.3, 0, Math.PI * 2);
    ctx.arc(19, -5, 1.5, 0, Math.PI * 2);
    ctx.arc(19, 5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(28, 35, 29, .2)';
    ctx.beginPath();
    ctx.ellipse(-2, 7, 21, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#343832';
    for (const [x, y] of [[-10, -10], [-10, 10], [7, -10], [7, 10]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#f3f0df';
    for (const [x, y, radius] of [
      [-12, -5, 9], [-12, 5, 9], [-4, -8, 10], [-4, 8, 10],
      [5, -7, 10], [5, 7, 10], [11, 0, 9], [-4, 0, 12]
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#faf8ed';
    ctx.beginPath();
    ctx.arc(-19, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#303630';
    ctx.beginPath();
    ctx.ellipse(16, 0, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(13, -8, 6, 3, -.35, 0, Math.PI * 2);
    ctx.ellipse(13, 8, 6, 3, .35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#eee9d8';
    ctx.beginPath();
    ctx.arc(19, -3, 1.4, 0, Math.PI * 2);
    ctx.arc(19, 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#191c19';
    ctx.beginPath();
    ctx.arc(19.4, -3, .65, 0, Math.PI * 2);
    ctx.arc(19.4, 3, .65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTractor() {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.atan2(tractor.dy, tractor.dx) + Math.PI / 2);
  ctx.globalAlpha = tractor.crashTimer > 0 && Math.floor(tractor.crashTimer * 12) % 2 === 0 ? 0.45 : 1;
  if (spriteReady('tractor')) {
    drawSpriteShadow(21, 29, 3);
    drawSprite('tractor');
    ctx.restore();
    return;
  }
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
      elapsed = CONFIG.roundSeconds;
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

function clearInput() {
  Object.keys(keys).forEach(key => { keys[key] = false; });
  mobileDirection = null;
  document.querySelector('[data-farm-dpad]')?.farmLeagueDPad?.reset();
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

addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput();
});

document.querySelector('[data-farm-dpad]').addEventListener('farmleague:directionchange', event => {
  mobileDirection = event.detail.direction;
});

document.getElementById('startButton').addEventListener('click', start);
document.getElementById('restartButton').addEventListener('click', start);

reset();
draw();
