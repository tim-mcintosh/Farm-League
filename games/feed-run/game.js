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
  horses: { name: 'Horses', icon: '🐴', color: '#c98a54', pen: { x: 22, y: 42, width: 180, height: 142 } },
  cows: { name: 'Cows', icon: '🐄', color: '#68a9cb', pen: { x: 598, y: 42, width: 180, height: 142 } },
  sheep: { name: 'Sheep', icon: '🐑', color: '#b49ad8', pen: { x: 22, y: 416, width: 180, height: 142 } },
  chickens: { name: 'Chickens', icon: '🐔', color: '#df9d49', pen: { x: 598, y: 416, width: 180, height: 142 } }
};

const animalKeys = Object.keys(ANIMAL_DEFINITIONS);
const foodEntries = Object.entries(CONFIG.food.types);
const directionKeys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const keys = {};
const pointerDirections = new Map();

let state;
let animationFrame = 0;
let lastFrame = 0;
let nextFoodId = 1;

function createAnimalState() {
  return Object.fromEntries(animalKeys.map(key => [key, {
    hunger: CONFIG.hunger.starting,
    hearts: CONFIG.hunger.hearts,
    wasCritical: false
  }]));
}

function createInitialState() {
  return {
    running: false,
    timeLeft: CONFIG.roundSeconds,
    elapsed: 0,
    score: 0,
    combo: 0,
    best: loadBestScore(),
    player: { x: CONFIG.arena.width / 2, y: CONFIG.arena.height / 2 },
    animals: createAnimalState(),
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
    elements.endEyebrow.textContent = 'Out of hearts';
    elements.endTitle.textContent = `${animal.name} went hungry`;
    elements.endMessage.textContent = `${animal.icon} The ${animal.name.toLowerCase()} lost all three hearts.`;
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

function updatePlayer(dt) {
  const movement = movementVector();
  const radius = CONFIG.player.radius;
  state.player.x = Math.max(radius, Math.min(CONFIG.arena.width - radius, state.player.x + movement.x * CONFIG.player.speed * dt));
  state.player.y = Math.max(radius, Math.min(CONFIG.arena.height - radius, state.player.y + movement.y * CONFIG.player.speed * dt));
}

// Hunger drains by phase. Losing a heart recovers some hunger and breaks the combo.
function updateHunger(dt) {
  const multiplier = currentPhase().drainMultiplier;
  for (const animalKey of animalKeys) {
    const animal = state.animals[animalKey];
    animal.hunger -= CONFIG.hunger.drainPerSecond[animalKey] * multiplier * dt;
    const isCritical = animal.hunger <= CONFIG.hunger.criticalAt;
    if (isCritical && !animal.wasCritical) emitSoundCue('hungerWarning');
    animal.wasCritical = isCritical;
    if (animal.hunger > 0) continue;

    animal.hearts -= 1;
    animal.hunger = CONFIG.hunger.recoveryAfterHeartLoss;
    animal.wasCritical = false;
    state.combo = 0;
    emitSoundCue('heartLost');

    if (animal.hearts <= 0) {
      animal.hunger = 0;
      finishRound('defeat', animalKey);
      return false;
    }

    showFeedback(`${ANIMAL_DEFINITIONS[animalKey].icon} ${ANIMAL_DEFINITIONS[animalKey].name} lost a heart!`, 'bad');
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
    card.querySelector('[data-hearts]').textContent = `${'♥'.repeat(animal.hearts)}${'♡'.repeat(CONFIG.hunger.hearts - animal.hearts)}`;
    card.querySelector('[data-label]').textContent = hungerStatus(percentage);
    card.classList.toggle('critical', percentage <= CONFIG.hunger.criticalAt);
    card.classList.toggle('warning', percentage > CONFIG.hunger.criticalAt && percentage <= 50);
  });
}

function drawFarmBackground() {
  context.fillStyle = '#78ae52';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(241, 222, 157, 0.34)';
  context.fillRect(0, 264, canvas.width, 72);
  context.fillRect(364, 0, 72, canvas.height);
  context.strokeStyle = 'rgba(48, 105, 51, 0.2)';
  context.lineWidth = 2;
  for (let x = 10; x < canvas.width; x += 34) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x - 24, canvas.height);
    context.stroke();
  }
}

function drawPens() {
  animalKeys.forEach(key => {
    const definition = ANIMAL_DEFINITIONS[key];
    const animal = state.animals[key];
    const { pen } = definition;
    const critical = animal.hunger <= CONFIG.hunger.criticalAt;
    context.fillStyle = `${definition.color}d9`;
    context.fillRect(pen.x, pen.y, pen.width, pen.height);
    context.strokeStyle = critical ? '#ff4f45' : 'rgba(255,255,255,.72)';
    context.lineWidth = critical ? 7 : 4;
    context.strokeRect(pen.x, pen.y, pen.width, pen.height);
    context.fillStyle = 'rgba(17, 31, 19, .76)';
    context.fillRect(pen.x + 10, pen.y + 9, pen.width - 20, 36);
    context.fillStyle = '#fffdf1';
    context.font = 'bold 19px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${definition.icon} ${definition.name}`, pen.x + pen.width / 2, pen.y + 27);
    context.font = '38px system-ui';
    context.fillText(definition.icon, pen.x + pen.width / 2, pen.y + 94);
    if (critical) {
      context.fillStyle = '#7c1712';
      context.font = 'bold 14px system-ui';
      context.fillText('FEED NOW!', pen.x + pen.width / 2, pen.y + 129);
    }
  });
}

function drawFoods() {
  state.foods.forEach(food => {
    const remaining = CONFIG.food.expirySeconds - food.age;
    context.globalAlpha = remaining < 3 ? Math.max(0.3, remaining / 3) : 1;
    context.fillStyle = 'rgba(255,255,245,.94)';
    context.beginPath();
    context.arc(food.x, food.y, CONFIG.food.radius + 5, 0, Math.PI * 2);
    context.fill();
    context.font = '25px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(food.icon, food.x, food.y + 1);
    context.globalAlpha = 1;
  });
}

function drawPlayer() {
  const { x, y } = state.player;
  context.fillStyle = '#244b2b';
  context.beginPath();
  context.arc(x, y + 5, CONFIG.player.radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f1bd81';
  context.beginPath();
  context.arc(x, y - 8, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#e6b946';
  context.fillRect(x - 17, y - 18, 34, 7);
  context.fillRect(x - 11, y - 25, 22, 10);
  context.fillStyle = '#fff';
  context.font = 'bold 11px system-ui';
  context.textAlign = 'center';
  context.fillText('YOU', x, y + 9);
  if (state.carriedFood) {
    context.fillStyle = 'rgba(13,32,19,.9)';
    context.beginPath();
    context.arc(x, y - 42, 20, 0, Math.PI * 2);
    context.fill();
    context.font = '24px system-ui';
    context.fillText(state.carriedFood.icon, x, y - 40);
  }
}

function draw() {
  drawFarmBackground();
  drawPens();
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
});

document.getElementById('startButton').addEventListener('click', startRound);
document.getElementById('restartButton').addEventListener('click', startRound);

state = createInitialState();
resetRound();
