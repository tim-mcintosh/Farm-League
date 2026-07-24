const CONFIG = window.FEED_RUN_CONFIG;
const canvas = document.getElementById('game');
const context = canvas.getContext('2d');

const elements = {
  score: document.getElementById('score'),
  time: document.getElementById('time'),
  best: document.getElementById('best'),
  combo: document.getElementById('combo'),
  carriedItem: document.getElementById('carriedItem'),
  feedback: document.getElementById('feedback'),
  startOverlay: document.getElementById('startOverlay'),
  endOverlay: document.getElementById('endOverlay'),
  endEyebrow: document.getElementById('endEyebrow'),
  endTitle: document.getElementById('endTitle'),
  endMessage: document.getElementById('endMessage'),
  finalScore: document.getElementById('finalScore'),
  finalBest: document.getElementById('finalBest'),
  finalTime: document.getElementById('finalTime')
};

const ANIMAL_DEFINITIONS = {
  horses: { name: 'Horses', icon: '🐴', color: '#c98a54', speed: 15, pen: { x: 22, y: 42, width: 180, height: 142, gateSide: 'right' } },
  cows: { name: 'Cows', icon: '🐄', color: '#68a9cb', speed: 11, pen: { x: 598, y: 42, width: 180, height: 142, gateSide: 'left' } },
  sheep: { name: 'Sheep', icon: '🐑', color: '#b49ad8', speed: 13, pen: { x: 22, y: 416, width: 180, height: 142, gateSide: 'right' } },
  chickens: { name: 'Chickens', icon: '🐔', color: '#df9d49', speed: 19, pen: { x: 598, y: 416, width: 180, height: 142, gateSide: 'left' } }
};

const animalKeys = Object.keys(ANIMAL_DEFINITIONS);
const foodEntries = Object.entries(CONFIG.food.types);
const directionKeys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const keys = {};
const pointerDirections = new Map();
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

let state;
let animationFrame = 0;
let lastFrame = 0;
let nextFoodId = 1;

function createAnimalState() {
  return Object.fromEntries(animalKeys.map(key => [key, {
    hunger: CONFIG.hunger.starting,
    wasCritical: false
  }]));
}

function createPenAnimalState() {
  return Object.fromEntries(animalKeys.map((key, index) => {
    const definition = ANIMAL_DEFINITIONS[key];
    const angle = index * Math.PI / 2 + 0.45;
    return [key, {
      x: definition.pen.x + definition.pen.width / 2,
      y: definition.pen.y + definition.pen.height / 2 + 12,
      vx: Math.cos(angle) * definition.speed,
      vy: Math.sin(angle) * definition.speed,
      facing: angle,
      turnTimer: 1.4 + index * 0.35,
      step: index
    }];
  }));
}

function createInitialState() {
  return {
    running: false,
    timeLeft: CONFIG.roundSeconds,
    elapsed: 0,
    score: 0,
    combo: 0,
    best: loadBestScore(),
    player: { x: CONFIG.arena.width / 2, y: CONFIG.arena.height / 2, facingX: 0, facingY: 1, step: 0 },
    animals: createAnimalState(),
    penAnimals: createPenAnimalState(),
    foods: [],
    carriedFood: null,
    spawnHistory: [],
    spawnsSinceHay: 0,
    feedbackTime: 0,
    lastWrongPen: null
  };
}

// Persistence is deliberately limited to the local best score.
function loadBestScore() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(CONFIG.bestScoreKey), 10) || 0);
  } catch (error) {
    return 0;
  }
}

function saveBestScore() {
  state.best = Math.max(state.best, state.score);
  try {
    localStorage.setItem(CONFIG.bestScoreKey, String(state.best));
  } catch (error) {
    // The game remains playable when storage is unavailable or blocked.
  }
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function currentPhase() {
  return CONFIG.difficultyPhases.find(phase => state.elapsed < phase.until);
}

function foodSupportsAnimal(food, animalKey) {
  return food.animals.includes(animalKey);
}

function pointInsideRect(x, y, rect, padding = 0) {
  return x >= rect.x - padding && x <= rect.x + rect.width + padding
    && y >= rect.y - padding && y <= rect.y + rect.height + padding;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// This event is the stable hook for adding sounds later without coupling audio to gameplay.
function emitSoundCue(type) {
  document.dispatchEvent(new CustomEvent('feedrun:sound', { detail: { type } }));
}

function showFeedback(message, tone = 'good') {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('bad', tone === 'bad');
  elements.feedback.classList.remove('hidden');
  state.feedbackTime = CONFIG.feedbackSeconds;
}

function clearInput() {
  Object.keys(keys).forEach(key => { keys[key] = false; });
  pointerDirections.clear();
  document.querySelectorAll('[data-direction]').forEach(button => button.classList.remove('active'));
}

function resetRound() {
  cancelAnimationFrame(animationFrame);
  const existingBest = state ? state.best : loadBestScore();
  state = createInitialState();
  state.best = existingBest;
  nextFoodId = 1;
  clearInput();
  maintainFoodSupply();
  updateHud();
  draw();
}

function startRound() {
  resetRound();
  state.running = true;
  elements.startOverlay.classList.add('hidden');
  elements.endOverlay.classList.add('hidden');
  lastFrame = performance.now();
  animationFrame = requestAnimationFrame(gameLoop);
}

function finishRound(outcome, failedAnimalKey = null) {
  if (!state.running) return;
  state.running = false;
  cancelAnimationFrame(animationFrame);
  clearInput();

  if (outcome === 'victory') {
    state.score += CONFIG.scoring.completionBonus;
    elements.endEyebrow.textContent = 'Breakfast bell!';
    elements.endTitle.textContent = 'Farm fed!';
    elements.endMessage.textContent = `You kept every animal fed for two minutes and earned a ${CONFIG.scoring.completionBonus}-point completion bonus.`;
    emitSoundCue('victory');
  } else {
    const animal = ANIMAL_DEFINITIONS[failedAnimalKey];
    elements.endEyebrow.textContent = 'Out of food';
    elements.endTitle.textContent = `${animal.name} went hungry`;
    elements.endMessage.textContent = `${animal.icon} The ${animal.name.toLowerCase()} hunger bar reached zero.`;
    emitSoundCue('gameOver');
  }

  saveBestScore();
  updateHud();
  elements.finalScore.textContent = state.score.toLocaleString();
  elements.finalBest.textContent = state.best.toLocaleString();
  elements.finalTime.textContent = formatTime(state.elapsed);
  elements.endOverlay.classList.remove('hidden');
}

// Input resolves keyboard and simultaneous touch directions into direct movement.
function movementVector() {
  const heldDirections = new Set(pointerDirections.values());
  let x = 0;
  let y = 0;
  if (keys.ArrowUp || keys.w || heldDirections.has('up')) y -= 1;
  if (keys.ArrowDown || keys.s || heldDirections.has('down')) y += 1;
  if (keys.ArrowLeft || keys.a || heldDirections.has('left')) x -= 1;
  if (keys.ArrowRight || keys.d || heldDirections.has('right')) x += 1;
  const length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

function playerTouchesPenFence(x, y, pen) {
  const radius = CONFIG.player.radius;
  const fenceReach = radius + CONFIG.pens.fenceWidth / 2;
  const gateCentre = pen.y + pen.height / 2;
  const gateClearance = CONFIG.pens.gateSize / 2 - radius - 2;
  const insideGate = Math.abs(y - gateCentre) <= gateClearance;
  const alongsidePen = y >= pen.y && y <= pen.y + pen.height;
  const acrossPen = x >= pen.x && x <= pen.x + pen.width;

  const touchesLeft = Math.abs(x - pen.x) <= fenceReach
    && alongsidePen
    && !(pen.gateSide === 'left' && insideGate);
  const touchesRight = Math.abs(x - (pen.x + pen.width)) <= fenceReach
    && alongsidePen
    && !(pen.gateSide === 'right' && insideGate);
  const touchesTop = Math.abs(y - pen.y) <= fenceReach && acrossPen;
  const touchesBottom = Math.abs(y - (pen.y + pen.height)) <= fenceReach && acrossPen;
  return touchesLeft || touchesRight || touchesTop || touchesBottom;
}

function canPlayerOccupy(x, y) {
  return !animalKeys.some(key => playerTouchesPenFence(x, y, ANIMAL_DEFINITIONS[key].pen));
}

function updatePlayer(dt) {
  const movement = movementVector();
  const radius = CONFIG.player.radius;
  if (movement.x || movement.y) {
    state.player.facingX = movement.x;
    state.player.facingY = movement.y;
    state.player.step += dt * 10;
  }
  const nextX = Math.max(radius, Math.min(CONFIG.arena.width - radius, state.player.x + movement.x * CONFIG.player.speed * dt));
  const nextY = Math.max(radius, Math.min(CONFIG.arena.height - radius, state.player.y + movement.y * CONFIG.player.speed * dt));
  if (canPlayerOccupy(nextX, state.player.y)) state.player.x = nextX;
  if (canPlayerOccupy(state.player.x, nextY)) state.player.y = nextY;
}

function updatePenAnimals(dt) {
  if (reduceMotion) return;
  animalKeys.forEach(key => {
    const definition = ANIMAL_DEFINITIONS[key];
    const animal = state.penAnimals[key];
    const inset = CONFIG.pens.animalInset;
    const bounds = {
      left: definition.pen.x + inset,
      right: definition.pen.x + definition.pen.width - inset,
      top: definition.pen.y + inset + 18,
      bottom: definition.pen.y + definition.pen.height - inset
    };

    animal.turnTimer -= dt;
    if (animal.turnTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      animal.vx = Math.cos(angle) * definition.speed;
      animal.vy = Math.sin(angle) * definition.speed;
      animal.turnTimer = 1.2 + Math.random() * 2.2;
    }

    animal.x += animal.vx * dt;
    animal.y += animal.vy * dt;
    if (animal.x <= bounds.left || animal.x >= bounds.right) {
      animal.x = Math.max(bounds.left, Math.min(bounds.right, animal.x));
      animal.vx *= -1;
    }
    if (animal.y <= bounds.top || animal.y >= bounds.bottom) {
      animal.y = Math.max(bounds.top, Math.min(bounds.bottom, animal.y));
      animal.vy *= -1;
    }
    animal.facing = Math.atan2(animal.vy, animal.vx);
    animal.step += dt * definition.speed * 0.14;
  });
}

// Hunger drains by phase. A group reaching zero ends the round immediately.
function updateHunger(dt) {
  const multiplier = currentPhase().drainMultiplier;
  for (const animalKey of animalKeys) {
    const animal = state.animals[animalKey];
    animal.hunger -= CONFIG.hunger.drainPerSecond[animalKey] * multiplier * dt;
    const isCritical = animal.hunger <= CONFIG.hunger.criticalAt;
    if (isCritical && !animal.wasCritical) emitSoundCue('hungerWarning');
    animal.wasCritical = isCritical;
    if (animal.hunger > 0) continue;
    animal.hunger = 0;
    finishRound('defeat', animalKey);
    return false;
  }
  return true;
}

function compatibleSupplyExists(animalKey) {
  if (state.carriedFood && foodSupportsAnimal(state.carriedFood, animalKey)) return true;
  return state.foods.some(food => foodSupportsAnimal(food, animalKey));
}

function chooseTargetAnimal() {
  const critical = animalKeys
    .filter(key => state.animals[key].hunger <= CONFIG.hunger.criticalAt && !compatibleSupplyExists(key))
    .sort((a, b) => state.animals[a].hunger - state.animals[b].hunger);

  if (critical.length && Math.random() < CONFIG.food.criticalFoodChance) return critical[0];

  const supplyCounts = Object.fromEntries(animalKeys.map(key => [key, 0]));
  state.foods.forEach(food => {
    if (!food.universal) food.animals.forEach(key => { supplyCounts[key] += 1; });
  });
  state.spawnHistory.forEach(key => { supplyCounts[key] += 0.6; });
  const minimum = Math.min(...Object.values(supplyCounts));
  const leastSupplied = animalKeys.filter(key => supplyCounts[key] === minimum);
  return leastSupplied[Math.floor(Math.random() * leastSupplied.length)];
}

function chooseFoodType(forcedAnimalKey = null) {
  const forceHay = state.spawnsSinceHay >= CONFIG.food.forceHayAfterSpawns;
  if (forceHay || Math.random() < CONFIG.food.normalHayChance) return ['hay', CONFIG.food.types.hay];

  const target = forcedAnimalKey || chooseTargetAnimal();
  const choices = foodEntries.filter(([, food]) => !food.universal && food.animals.includes(target));
  const choice = choices[Math.floor(Math.random() * choices.length)];
  state.spawnHistory.push(target);
  state.spawnHistory = state.spawnHistory.slice(-3);
  return choice;
}

function isValidFoodPosition(position, minimumPlayerDistance) {
  const padding = CONFIG.food.spawnPadding;
  if (position.x < padding || position.x > CONFIG.arena.width - padding
    || position.y < padding || position.y > CONFIG.arena.height - padding) return false;
  if (distance(position, state.player) < minimumPlayerDistance) return false;
  if (animalKeys.some(key => pointInsideRect(position.x, position.y, ANIMAL_DEFINITIONS[key].pen, CONFIG.food.radius))) return false;
  if (state.foods.some(food => distance(position, food) < CONFIG.food.minimumSeparation)) return false;
  return true;
}

function findFoodPosition() {
  const minimumPlayerDistance = currentPhase().spawnDistance;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const position = {
      x: CONFIG.food.spawnPadding + Math.random() * (CONFIG.arena.width - CONFIG.food.spawnPadding * 2),
      y: CONFIG.food.spawnPadding + Math.random() * (CONFIG.arena.height - CONFIG.food.spawnPadding * 2)
    };
    if (isValidFoodPosition(position, minimumPlayerDistance)) return position;
  }

  // Deterministic fallback prevents a temporary crowded map from starving the supply.
  for (let y = 220; y <= 380; y += 40) {
    for (let x = 240; x <= 560; x += 40) {
      const position = { x, y };
      if (isValidFoodPosition(position, 0)) return position;
    }
  }
  return null;
}

function spawnFood(forcedAnimalKey = null) {
  const choice = chooseFoodType(forcedAnimalKey);
  const position = findFoodPosition();
  if (!position) return false;
  const [type, definition] = choice;
  state.foods.push({ id: nextFoodId, type, age: 0, ...definition, ...position });
  nextFoodId += 1;
  state.spawnsSinceHay = definition.universal ? 0 : state.spawnsSinceHay + 1;
  return true;
}

function maintainFoodSupply() {
  const targetCount = currentPhase().visibleFood || CONFIG.food.maximumVisible;
  while (state.foods.length < targetCount) {
    if (!spawnFood()) break;
  }
}

function guaranteeCriticalFood() {
  const unsupportedCriticalAnimal = animalKeys
    .filter(key => state.animals[key].hunger <= CONFIG.hunger.criticalAt && !compatibleSupplyExists(key))
    .sort((a, b) => state.animals[a].hunger - state.animals[b].hunger)[0];
  if (!unsupportedCriticalAnimal) return;

  const replaceableFoods = state.foods.filter(food => !foodSupportsAnimal(food, unsupportedCriticalAnimal));
  if (replaceableFoods.length) {
    const oldest = replaceableFoods.sort((a, b) => b.age - a.age)[0];
    state.foods = state.foods.filter(food => food.id !== oldest.id);
  }
  spawnFood(unsupportedCriticalAnimal);
}

function updateFood(dt) {
  state.foods.forEach(food => { food.age += dt; });
  state.foods = state.foods.filter(food => food.age < CONFIG.food.expirySeconds);
  guaranteeCriticalFood();
  maintainFoodSupply();

  if (state.carriedFood) return;
  const pickupDistance = CONFIG.player.radius + CONFIG.food.radius + CONFIG.player.pickupPadding;
  const food = state.foods.find(item => distance(item, state.player) < pickupDistance);
  if (!food) return;
  state.carriedFood = food;
  state.foods = state.foods.filter(item => item.id !== food.id);
  showFeedback(`Picked up ${food.icon} ${food.name}`);
  emitSoundCue('pickup');
  maintainFoodSupply();
}

function deliverFood(animalKey) {
  const food = state.carriedFood;
  const animal = state.animals[animalKey];
  const wasCritical = animal.hunger <= CONFIG.hunger.criticalAt;
  animal.hunger = Math.min(CONFIG.hunger.maximum, animal.hunger + food.restore);
  animal.wasCritical = animal.hunger <= CONFIG.hunger.criticalAt;
  state.combo += 1;

  const urgencyBonus = wasCritical ? CONFIG.scoring.urgencyBonus : 0;
  const comboBonus = Math.min(CONFIG.scoring.maximumComboBonus, Math.max(0, state.combo - 1) * CONFIG.scoring.comboStep);
  const points = food.score + urgencyBonus + comboBonus;
  state.score += points;
  state.carriedFood = null;
  state.lastWrongPen = null;
  showFeedback(`${food.icon} ${ANIMAL_DEFINITIONS[animalKey].name} fed! +${points}`);
  emitSoundCue('delivery');
}

function updateDeliveries() {
  if (!state.carriedFood) {
    state.lastWrongPen = null;
    return;
  }
  const currentPen = animalKeys.find(key => pointInsideRect(state.player.x, state.player.y, ANIMAL_DEFINITIONS[key].pen));
  if (!currentPen) {
    state.lastWrongPen = null;
    return;
  }
  if (foodSupportsAnimal(state.carriedFood, currentPen)) {
    deliverFood(currentPen);
    return;
  }
  if (state.lastWrongPen !== currentPen) {
    showFeedback(`${state.carriedFood.icon} ${state.carriedFood.name} belongs somewhere else`, 'bad');
    emitSoundCue('wrongAnimal');
    state.lastWrongPen = currentPen;
  }
}

function updateFeedback(dt) {
  if (state.feedbackTime <= 0) return;
  state.feedbackTime -= dt;
  if (state.feedbackTime <= 0) elements.feedback.classList.add('hidden');
}

function update(dt) {
  state.elapsed += dt;
  state.timeLeft = Math.max(0, CONFIG.roundSeconds - state.elapsed);
  if (state.timeLeft <= 0) {
    state.elapsed = CONFIG.roundSeconds;
    finishRound('victory');
    return;
  }
  updatePlayer(dt);
  updatePenAnimals(dt);
  if (!updateHunger(dt)) return;
  updateFood(dt);
  updateDeliveries();
  updateFeedback(dt);
}

function hungerStatus(hunger) {
  if (hunger <= CONFIG.hunger.criticalAt) return 'FEED NOW!';
  if (hunger <= 50) return 'Getting hungry';
  return 'Fed';
}

function updateHud() {
  elements.score.textContent = state.score.toLocaleString();
  elements.time.textContent = formatTime(state.timeLeft);
  elements.best.textContent = state.best.toLocaleString();
  elements.combo.textContent = `${state.combo}×`;
  elements.carriedItem.textContent = state.carriedFood ? `${state.carriedFood.icon} ${state.carriedFood.name}` : 'Nothing';

  document.querySelectorAll('.hunger-card').forEach(card => {
    const animal = state.animals[card.dataset.animal];
    const percentage = Math.max(0, animal.hunger);
    const meter = card.querySelector('[data-meter]');
    const progress = card.querySelector('[role="progressbar"]');
    meter.style.width = `${percentage}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(percentage)));
    card.querySelector('[data-label]').textContent = hungerStatus(percentage);
    card.classList.toggle('critical', percentage <= CONFIG.hunger.criticalAt);
    card.classList.toggle('warning', percentage > CONFIG.hunger.criticalAt && percentage <= 50);
  });
}

function drawFarmBackground() {
  context.fillStyle = '#72a94e';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 32) {
    for (let x = 0; x < canvas.width; x += 32) {
      context.fillStyle = (x / 32 + y / 32) % 2
        ? 'rgba(255,255,255,.018)'
        : 'rgba(25,83,36,.035)';
      context.fillRect(x, y, 32, 32);
    }
  }

  context.fillStyle = '#cfb978';
  context.fillRect(0, 267, canvas.width, 66);
  context.fillRect(368, 0, 64, canvas.height);
  context.fillStyle = 'rgba(255,245,193,.18)';
  context.fillRect(0, 276, canvas.width, 5);
  context.fillRect(380, 0, 5, canvas.height);

  context.fillStyle = 'rgba(33, 91, 39, .34)';
  for (let index = 0; index < 52; index += 1) {
    const x = (index * 83 + 47) % canvas.width;
    const y = (index * 137 + 29) % canvas.height;
    if (x > 350 && x < 450 || y > 250 && y < 350) continue;
    context.beginPath();
    context.arc(x, y, 2 + index % 2, 0, Math.PI * 2);
    context.fill();
  }
}

function drawPenGrounds() {
  animalKeys.forEach(key => {
    const definition = ANIMAL_DEFINITIONS[key];
    const animal = state.animals[key];
    const { pen } = definition;
    const critical = animal.hunger <= CONFIG.hunger.criticalAt;

    if (critical) {
      context.fillStyle = 'rgba(255, 75, 63, .22)';
      context.fillRect(pen.x - 9, pen.y - 9, pen.width + 18, pen.height + 18);
    }
    context.fillStyle = '#a98552';
    context.fillRect(pen.x, pen.y, pen.width, pen.height);
    context.fillStyle = 'rgba(244, 217, 146, .18)';
    for (let index = 0; index < 14; index += 1) {
      const x = pen.x + 18 + (index * 43) % (pen.width - 34);
      const y = pen.y + 30 + (index * 29) % (pen.height - 45);
      context.fillRect(x, y, 10, 2);
    }
  });
}

function drawFenceSegment(x1, y1, x2, y2) {
  context.lineCap = 'round';
  context.strokeStyle = '#694527';
  context.lineWidth = 11;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.strokeStyle = '#c28a4e';
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();

  const length = Math.hypot(x2 - x1, y2 - y1);
  const posts = Math.max(1, Math.floor(length / 46));
  for (let index = 0; index <= posts; index += 1) {
    const amount = index / posts;
    const x = x1 + (x2 - x1) * amount;
    const y = y1 + (y2 - y1) * amount;
    context.fillStyle = '#5b3820';
    context.beginPath();
    context.arc(x + 2, y + 3, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d39a59';
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
  }
}

function drawPenFences() {
  animalKeys.forEach(key => {
    const definition = ANIMAL_DEFINITIONS[key];
    const animal = state.animals[key];
    const { pen } = definition;
    const gateCentre = pen.y + pen.height / 2;
    const gateStart = gateCentre - CONFIG.pens.gateSize / 2;
    const gateEnd = gateCentre + CONFIG.pens.gateSize / 2;
    const left = pen.x;
    const right = pen.x + pen.width;
    const top = pen.y;
    const bottom = pen.y + pen.height;

    drawFenceSegment(left, top, right, top);
    drawFenceSegment(left, bottom, right, bottom);
    if (pen.gateSide === 'left') {
      drawFenceSegment(left, top, left, gateStart);
      drawFenceSegment(left, gateEnd, left, bottom);
      drawFenceSegment(left, gateStart, left - 33, gateStart - 16);
    } else {
      drawFenceSegment(left, top, left, bottom);
    }
    if (pen.gateSide === 'right') {
      drawFenceSegment(right, top, right, gateStart);
      drawFenceSegment(right, gateEnd, right, bottom);
      drawFenceSegment(right, gateEnd, right + 33, gateEnd + 16);
    } else {
      drawFenceSegment(right, top, right, bottom);
    }

    context.fillStyle = '#5c3a20';
    context.fillRect(pen.x + pen.width / 2 - 55, pen.y + 7, 110, 27);
    context.fillStyle = definition.color;
    context.fillRect(pen.x + pen.width / 2 - 51, pen.y + 11, 102, 19);
    context.fillStyle = '#fff9e8';
    context.font = 'bold 14px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(definition.name.toUpperCase(), pen.x + pen.width / 2, pen.y + 21);

    if (animal.hunger <= CONFIG.hunger.criticalAt) {
      context.fillStyle = '#8b1e17';
      context.fillRect(pen.x + pen.width / 2 - 43, pen.y + pen.height - 25, 86, 19);
      context.fillStyle = '#fff';
      context.font = 'bold 11px system-ui';
      context.fillText('FEED NOW!', pen.x + pen.width / 2, pen.y + pen.height - 15);
    }
  });
}

function drawHorse(actor) {
  context.fillStyle = '#4a2b1d';
  context.beginPath();
  context.ellipse(-9, -10, 11, 5, -.2, 0, Math.PI * 2);
  context.ellipse(-9, 10, 11, 5, .2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#9b5f35';
  context.beginPath();
  context.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#764127';
  context.fillRect(13, -8, 17, 16);
  context.beginPath();
  context.ellipse(30, 0, 12, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#332018';
  context.fillRect(-4, -17, 20, 4);
  context.beginPath();
  context.moveTo(-24, 0);
  context.lineTo(-36, -8);
  context.lineTo(-29, 3);
  context.fill();
  context.fillStyle = '#e9c08d';
  context.beginPath();
  context.arc(34, -3, 2, 0, Math.PI * 2);
  context.fill();
}

function drawCow(actor) {
  context.fillStyle = '#5b4232';
  for (const y of [-11, 11]) {
    context.beginPath();
    context.ellipse(-8, y, 10, 5, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#f2ead8';
  context.beginPath();
  context.ellipse(0, 0, 27, 17, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#40352f';
  context.beginPath();
  context.ellipse(-10, -6, 9, 6, -.3, 0, Math.PI * 2);
  context.ellipse(7, 7, 10, 6, .2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#d9ad82';
  context.beginPath();
  context.ellipse(28, 0, 13, 11, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#eee0c5';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(29, -8);
  context.lineTo(36, -15);
  context.moveTo(29, 8);
  context.lineTo(36, 15);
  context.stroke();
  context.fillStyle = '#3b2b25';
  context.beginPath();
  context.arc(33, -3, 2, 0, Math.PI * 2);
  context.fill();
}

function drawSheep(actor) {
  context.fillStyle = '#3f403a';
  context.beginPath();
  context.ellipse(-8, -10, 9, 5, 0, 0, Math.PI * 2);
  context.ellipse(-8, 10, 9, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f4f0df';
  for (const [x, y, radius] of [[-11,0,13],[0,-6,14],[0,7,14],[12,0,13]]) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#343a33';
  context.beginPath();
  context.ellipse(25, 0, 12, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f7f1dd';
  context.beginPath();
  context.arc(29, -3, 2, 0, Math.PI * 2);
  context.fill();
}

function drawChicken(actor) {
  context.strokeStyle = '#b47b35';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-4, 8);
  context.lineTo(-9, 18);
  context.moveTo(4, 8);
  context.lineTo(9, 18);
  context.stroke();
  context.fillStyle = '#f8f1dc';
  context.beginPath();
  context.ellipse(0, 0, 19, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ded3b9';
  context.beginPath();
  context.ellipse(-4, 2, 11, 7, -.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f5ead0';
  context.beginPath();
  context.arc(18, 0, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#d94135';
  context.beginPath();
  context.arc(17, -10, 5, 0, Math.PI * 2);
  context.arc(23, -8, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#e7a936';
  context.beginPath();
  context.moveTo(27, 0);
  context.lineTo(38, 4);
  context.lineTo(27, 7);
  context.fill();
  context.fillStyle = '#322b25';
  context.beginPath();
  context.arc(21, -2, 2, 0, Math.PI * 2);
  context.fill();
}

function drawPenAnimals() {
  animalKeys.forEach(key => {
    const actor = state.penAnimals[key];
    context.save();
    context.translate(actor.x, actor.y);
    context.rotate(actor.facing);
    context.fillStyle = 'rgba(41, 32, 21, .2)';
    context.beginPath();
    context.ellipse(2, 7, key === 'chickens' ? 20 : 30, key === 'chickens' ? 10 : 13, 0, 0, Math.PI * 2);
    context.fill();
    if (key === 'horses') drawHorse(actor);
    if (key === 'cows') drawCow(actor);
    if (key === 'sheep') drawSheep(actor);
    if (key === 'chickens') drawChicken(actor);
    context.restore();
  });
}

function drawFoods() {
  state.foods.forEach(food => {
    const remaining = CONFIG.food.expirySeconds - food.age;
    context.save();
    context.globalAlpha = remaining < 3 ? Math.max(0.3, remaining / 3) : 1;
    context.shadowColor = 'rgba(8, 20, 11, .9)';
    context.shadowBlur = 7;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 3;
    context.font = '30px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(food.icon, food.x, food.y + 1);
    context.restore();
  });
}

function drawPlayer() {
  const { x, y, facingX, facingY, step } = state.player;
  const angle = Math.atan2(facingY, facingX);
  const stride = Math.sin(step) * 2;
  context.save();
  context.translate(x, y);
  context.rotate(angle);

  context.fillStyle = 'rgba(34, 45, 28, .24)';
  context.beginPath();
  context.ellipse(-2, 6, 22, 14, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#3a2c24';
  context.beginPath();
  context.ellipse(-12 + stride, -8, 8, 5, -.25, 0, Math.PI * 2);
  context.ellipse(-12 - stride, 8, 8, 5, .25, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#356a78';
  context.beginPath();
  context.ellipse(-1, 0, 18, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f0b978';
  context.beginPath();
  context.arc(10, 0, 12, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(-1, -15, 5, 0, Math.PI * 2);
  context.arc(-1, 15, 5, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(10, 0, 12, Math.PI / 2, Math.PI * 1.5);
  context.fillStyle = '#6e4327';
  context.fill();

  context.fillStyle = '#efc64e';
  context.beginPath();
  context.ellipse(8, 0, 14, 21, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#dcae35';
  context.beginPath();
  context.ellipse(7, 0, 10, 13, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#9a7021';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(7, -14);
  context.lineTo(7, 14);
  context.stroke();

  context.fillStyle = '#efb473';
  context.beginPath();
  context.arc(22, 0, 4, 0, Math.PI * 2);
  context.fill();
  context.restore();

  if (state.carriedFood) {
    context.fillStyle = 'rgba(13,32,19,.9)';
    context.beginPath();
    context.arc(x, y - 38, 20, 0, Math.PI * 2);
    context.fill();
    context.font = '24px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(state.carriedFood.icon, x, y - 37);
  }
}

function draw() {
  drawFarmBackground();
  drawPenGrounds();
  drawPenAnimals();
  drawPenFences();
  drawFoods();
  drawPlayer();
}

function gameLoop(timestamp) {
  if (!state.running) return;
  const dt = Math.min(0.04, Math.max(0, (timestamp - lastFrame) / 1000));
  lastFrame = timestamp;
  update(dt);
  updateHud();
  draw();
  if (state.running) animationFrame = requestAnimationFrame(gameLoop);
}

function normaliseKey(event) {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

addEventListener('keydown', event => {
  const key = normaliseKey(event);
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) return;
  event.preventDefault();
  keys[key] = true;
});

addEventListener('keyup', event => {
  keys[normaliseKey(event)] = false;
});

addEventListener('blur', clearInput);

document.querySelectorAll('[data-direction]').forEach(button => {
  const release = event => {
    pointerDirections.delete(event.pointerId);
    button.classList.toggle('active', [...pointerDirections.values()].includes(button.dataset.direction));
  };
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    pointerDirections.set(event.pointerId, button.dataset.direction);
    button.classList.add('active');
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

document.getElementById('startButton').addEventListener('click', startRound);
document.getElementById('restartButton').addEventListener('click', startRound);

state = createInitialState();
resetRound();
