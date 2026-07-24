(() => {
  const CONFIG = window.FARM_DEFENCE_CONFIG;
  const renderer = window.FarmDefenceRenderer;
  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');
  const elements = {
    time: document.getElementById('time'),
    coins: document.getElementById('coins'),
    announcement: document.getElementById('announcement'),
    startOverlay: document.getElementById('startOverlay'),
    resultsOverlay: document.getElementById('resultsOverlay'),
    harvestBonus: document.getElementById('harvestBonus'),
    fieldBonus: document.getElementById('fieldBonus'),
    coinBonus: document.getElementById('coinBonus'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScore')
  };
  const keys = {};
  const pointers = new Map();
  const cropStages = ['seed', 'growing', 'ready', 'overripe', 'dead'];
  const fieldCentre = { x: 400, y: 205 };
  let state;
  let animationFrame = 0;
  let lastFrame = 0;
  let nextRabbitId = 1;
  let nextCropId = 1;

  // Persistence and presentation hooks remain optional so the local game loop is self-contained.
  function loadBest() {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem(CONFIG.bestScoreKey), 10) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest(score) {
    const best = Math.max(state.best, score);
    state.best = best;
    try {
      localStorage.setItem(CONFIG.bestScoreKey, String(best));
    } catch {
      // Local storage is optional; gameplay remains available when it is blocked.
    }
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function pointInRect(x, y, rect, padding = 0) {
    return x >= rect.x - padding && x <= rect.x + rect.width + padding
      && y >= rect.y - padding && y <= rect.y + rect.height + padding;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function emitSound(type) {
    document.dispatchEvent(new CustomEvent('farmdefence:sound', { detail: { type } }));
  }

  function announce(text) {
    elements.announcement.textContent = text;
  }

  function notify(text, x = state.player.x, y = state.player.y - 28, bad = false) {
    state.notifications.push({ text, x, y, life: 1.25, bad });
    announce(text);
  }

  // Field geometry is derived from expansion level; existing grid coordinates survive expansion.
  function fieldForLevel(level) {
    const columns = CONFIG.crops.initialColumns + level * 2;
    const rows = CONFIG.crops.initialRows + level * 2;
    const width = columns * CONFIG.crops.tileSize;
    const height = rows * CONFIG.crops.tileSize;
    return {
      level,
      columns,
      rows,
      width,
      height,
      left: fieldCentre.x - width / 2,
      right: fieldCentre.x + width / 2,
      top: fieldCentre.y - height / 2,
      bottom: fieldCentre.y + height / 2
    };
  }

  function cropKey(gx, gy) {
    return `${gx},${gy}`;
  }

  function cropCoordinates(field) {
    const coordinates = [];
    const minX = -Math.floor(field.columns / 2);
    const minY = -Math.floor(field.rows / 2);
    for (let row = 0; row < field.rows; row++) {
      for (let column = 0; column < field.columns; column++) {
        coordinates.push({ gx: minX + column, gy: minY + row });
      }
    }
    return coordinates;
  }

  function createCrop(gx, gy, fresh, field) {
    const tile = CONFIG.crops.tileSize;
    return {
      id: nextCropId++,
      gx,
      gy,
      x: fieldCentre.x + (gx + (field.columns % 2 ? 0 : .5)) * tile,
      y: fieldCentre.y + (gy + (field.rows % 2 ? 0 : .5)) * tile,
      stage: 'seed',
      age: fresh ? 0 : Math.random() * 4,
      spawnScale: fresh ? .1 : 1
    };
  }

  function createCrops(field, existing = []) {
    const existingByKey = new Map(existing.map(crop => [cropKey(crop.gx, crop.gy), crop]));
    return cropCoordinates(field).map(({ gx, gy }) => existingByKey.get(cropKey(gx, gy)) || createCrop(gx, gy, true, field));
  }

  function fenceMaximumHealth() {
    return CONFIG.fences.baseHealth * CONFIG.fences.upgradeMultipliers[state?.fenceLevel - 1 || 0];
  }

  function makeFence(id, side, index, x1, y1, x2, y2) {
    const maxHealth = fenceMaximumHealth();
    return { id, side, index, x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2, health: maxHealth, maxHealth, broken: false };
  }

  function createFences(field) {
    const fences = [];
    const tile = CONFIG.crops.tileSize;
    const gateIndexes = new Set([Math.floor(field.columns / 2) - 1, Math.floor(field.columns / 2)]);
    for (let index = 0; index < field.columns; index++) {
      const x1 = field.left + index * tile;
      fences.push(makeFence(`top-${index}`, 'top', index, x1, field.top, x1 + tile, field.top));
      if (!gateIndexes.has(index)) fences.push(makeFence(`bottom-${index}`, 'bottom', index, x1, field.bottom, x1 + tile, field.bottom));
    }
    for (let index = 0; index < field.rows; index++) {
      const y1 = field.top + index * tile;
      fences.push(makeFence(`left-${index}`, 'left', index, field.left, y1, field.left, y1 + tile));
      fences.push(makeFence(`right-${index}`, 'right', index, field.right, y1, field.right, y1 + tile));
    }
    return fences;
  }

  function createStations() {
    return [
      { type: 'dog', label: 'DOG KENNEL', x: 54, y: 510, width: 142, height: 68, level: 0, cost: CONFIG.dogs.costs[0], maxed: false, ready: true },
      { type: 'fence', label: 'FENCE SUPPLIES', x: 604, y: 510, width: 142, height: 68, level: 1, cost: CONFIG.fences.upgradeCosts[0], maxed: false, ready: true }
    ];
  }

  function createState() {
    const field = fieldForLevel(0);
    const initial = {
      running: false,
      elapsed: 0,
      timeLeft: CONFIG.roundSeconds,
      coins: 0,
      best: loadBest(),
      harvests: 0,
      lastExpansionHarvests: 0,
      expansionCooldown: 0,
      expansionPulse: 0,
      field,
      crops: [],
      fences: [],
      rabbits: [],
      dogs: [],
      dogPurchases: 0,
      fenceLevel: 1,
      pendingDog: null,
      repair: null,
      spawnClock: 2.5,
      player: { x: 400, y: 420, radius: CONFIG.player.radius, facingX: 0, facingY: -1, step: 0 },
      stations: createStations(),
      particles: [],
      coinPops: [],
      notifications: []
    };
    state = initial;
    state.crops = createCrops(field);
    state.fences = createFences(field);
    return state;
  }

  // Rabbits wander on arrival, chew one fence section, eat one crop, then leave the map.
  function currentRabbitPhase() {
    return CONFIG.rabbits.spawnPhases.find(phase => state.elapsed < phase.until);
  }

  function outsideSpawnPoint() {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: -18, y: 55 + Math.random() * 390 };
    if (side === 1) return { x: 818, y: 55 + Math.random() * 390 };
    if (side === 2) return { x: 40 + Math.random() * 720, y: -18 };
    return { x: 40 + Math.random() * 720, y: 475 };
  }

  function chooseFence(rabbit) {
    const intact = state.fences.filter(fence => !fence.broken);
    const choices = intact.length ? intact : state.fences;
    return choices.reduce((best, fence) => distance(rabbit, fence) < distance(rabbit, best) ? fence : best, choices[0]);
  }

  function spawnRabbit() {
    const point = outsideSpawnPoint();
    const rabbit = {
      id: nextRabbitId++,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      state: 'wander',
      wanderTime: .7 + Math.random() * 1.1,
      targetFenceId: null,
      targetCropId: null,
      eatTime: 0,
      hop: Math.random() * Math.PI,
      scared: false
    };
    const fence = chooseFence(rabbit);
    rabbit.targetFenceId = fence?.id || null;
    const wanderAngle = Math.atan2(fieldCentre.y - rabbit.y, fieldCentre.x - rabbit.x) + (Math.random() - .5) * 1.5;
    rabbit.vx = Math.cos(wanderAngle) * CONFIG.rabbits.wanderSpeed;
    rabbit.vy = Math.sin(wanderAngle) * CONFIG.rabbits.wanderSpeed;
    state.rabbits.push(rabbit);
  }

  function moveToward(actor, target, speed, dt) {
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    const length = Math.hypot(dx, dy) || 1;
    actor.vx = dx / length * speed;
    actor.vy = dy / length * speed;
    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;
    actor.hop = (actor.hop || 0) + dt * speed * .08;
    return length;
  }

  function nearestLivingCrop(actor) {
    const available = state.crops.filter(crop => crop.stage !== 'dead');
    if (!available.length) return null;
    return available.reduce((best, crop) => distance(actor, crop) < distance(actor, best) ? crop : best, available[0]);
  }

  function rabbitExitTarget(rabbit) {
    const targets = [
      { x: -30, y: rabbit.y },
      { x: 830, y: rabbit.y },
      { x: rabbit.x, y: -30 },
      { x: rabbit.x, y: 490 }
    ];
    return targets.reduce((best, target) => distance(rabbit, target) < distance(rabbit, best) ? target : best, targets[0]);
  }

  function sendRabbitAway(rabbit) {
    rabbit.scared = true;
    rabbit.state = 'leaving';
    rabbit.exitTarget = rabbitExitTarget(rabbit);
    rabbit.targetFenceId = null;
    rabbit.targetCropId = null;
  }

  function updateRabbit(rabbit, dt) {
    if (rabbit.state === 'wander') {
      rabbit.wanderTime -= dt;
      rabbit.x += rabbit.vx * dt;
      rabbit.y += rabbit.vy * dt;
      rabbit.hop += dt * 3;
      if (rabbit.wanderTime <= 0) rabbit.state = 'approach';
      return;
    }

    if (rabbit.state === 'leaving') {
      moveToward(rabbit, rabbit.exitTarget || rabbitExitTarget(rabbit), CONFIG.rabbits.insideSpeed * 1.3, dt);
      return;
    }

    if (rabbit.state === 'approach') {
      const fence = state.fences.find(item => item.id === rabbit.targetFenceId);
      if (!fence) {
        rabbit.targetFenceId = chooseFence(rabbit)?.id || null;
        return;
      }
      if (fence.broken) {
        rabbit.state = 'inside';
        rabbit.targetCropId = nearestLivingCrop(rabbit)?.id || null;
        return;
      }
      if (moveToward(rabbit, fence, CONFIG.rabbits.approachSpeed, dt) < 15) {
        rabbit.state = 'chewing';
        rabbit.vx = 0;
        rabbit.vy = 0;
      }
      return;
    }

    if (rabbit.state === 'chewing') {
      const fence = state.fences.find(item => item.id === rabbit.targetFenceId);
      if (!fence || fence.broken) {
        rabbit.state = 'inside';
        rabbit.targetCropId = nearestLivingCrop(rabbit)?.id || null;
        emitSound('fenceBreak');
        return;
      }
      fence.health = Math.max(0, fence.health - CONFIG.fences.rabbitDamagePerSecond * dt);
      if (fence.health <= 0) fence.broken = true;
      return;
    }

    if (rabbit.state === 'inside') {
      let crop = state.crops.find(item => item.id === rabbit.targetCropId && item.stage !== 'dead');
      if (!crop) {
        crop = nearestLivingCrop(rabbit);
        rabbit.targetCropId = crop?.id || null;
      }
      if (!crop) {
        sendRabbitAway(rabbit);
        return;
      }
      if (moveToward(rabbit, crop, CONFIG.rabbits.insideSpeed, dt) < 14) {
        rabbit.state = 'eating';
        rabbit.eatTime = CONFIG.rabbits.cropEatSeconds;
      }
      return;
    }

    if (rabbit.state === 'eating') {
      rabbit.eatTime -= dt;
      if (rabbit.eatTime <= 0) {
        const crop = state.crops.find(item => item.id === rabbit.targetCropId);
        if (crop) {
          crop.stage = 'dead';
          crop.age = 0;
          burst(crop.x, crop.y, '#8f6e45', 10);
        }
        sendRabbitAway(rabbit);
      }
    }
  }

  function updateRabbits(dt) {
    state.rabbits.forEach(rabbit => updateRabbit(rabbit, dt));
    state.rabbits = state.rabbits.filter(rabbit => rabbit.x > -55 && rabbit.x < 855 && rabbit.y > -55 && rabbit.y < 635);
    const phase = currentRabbitPhase();
    state.spawnClock -= dt;
    if (state.spawnClock <= 0 && state.rabbits.length < phase.cap) {
      spawnRabbit();
      state.spawnClock = phase.interval * (.82 + Math.random() * .35);
    }
  }

  function updateDogs(dt) {
    state.dogs.forEach(dog => {
      const nearby = state.rabbits
        .filter(rabbit => !rabbit.scared && Math.hypot(rabbit.x - dog.anchorX, rabbit.y - dog.anchorY) <= dog.radius)
        .sort((a, b) => distance(dog, a) - distance(dog, b))[0];
      let target;
      if (nearby) {
        target = nearby;
      } else {
        dog.angle += dt * (.65 + dog.level * .08);
        target = {
          x: dog.anchorX + Math.cos(dog.angle) * dog.radius * .55,
          y: dog.anchorY + Math.sin(dog.angle) * dog.radius * .35
        };
      }
      moveToward(dog, target, CONFIG.dogs.speed, dt);
      dog.phase += dt * 5;
      state.rabbits.forEach(rabbit => {
        if (!rabbit.scared && distance(dog, rabbit) <= CONFIG.dogs.scareRange) {
          sendRabbitAway(rabbit);
          notify('Rabbit chased away!', rabbit.x, rabbit.y - 18);
          emitSound('dogScare');
        }
      });
    });
  }

  // Crop stages cycle continuously. Harvesting restarts a tile at seed stage.
  function stageDuration(stage) {
    return CONFIG.crops.stageSeconds[stage];
  }

  function advanceCrop(crop) {
    const index = cropStages.indexOf(crop.stage);
    crop.stage = cropStages[(index + 1) % cropStages.length];
    crop.age = 0;
    if (crop.stage === 'seed') crop.spawnScale = .25;
  }

  function updateCrops(dt) {
    state.crops.forEach(crop => {
      crop.age += dt;
      crop.spawnScale = Math.min(1, crop.spawnScale + dt * 2.4);
      if (crop.age >= stageDuration(crop.stage)) advanceCrop(crop);
    });
  }

  function burst(x, y, color, count = 12) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        color,
        size: 3 + Math.random() * 3,
        life: .55 + Math.random() * .35,
        maxLife: .9
      });
    }
  }

  function harvestNearbyCrop() {
    const crop = state.crops.find(item => item.stage === 'ready' && distance(item, state.player) <= CONFIG.crops.harvestRange);
    if (!crop) return;
    crop.stage = 'seed';
    crop.age = 0;
    crop.spawnScale = .45;
    state.harvests++;
    state.coins += CONFIG.crops.harvestCoins;
    state.coinPops.push({ x: crop.x, y: crop.y - 12, amount: CONFIG.crops.harvestCoins, life: 1 });
    burst(crop.x, crop.y, '#f3d35e');
    emitSound('harvest');
    announce(`Harvested crop. ${CONFIG.crops.harvestCoins} coins earned.`);
  }

  function healthyCropRatio() {
    const healthy = state.crops.filter(crop => crop.stage !== 'dead').length;
    return state.crops.length ? healthy / state.crops.length : 0;
  }

  function maybeExpandField() {
    if (state.field.level >= CONFIG.crops.maxExpansionLevel || state.expansionCooldown > 0) return;
    const threshold = CONFIG.crops.expansionHarvests[state.field.level];
    if (state.harvests < threshold || healthyCropRatio() < CONFIG.crops.expansionHealthyRatio) return;
    const nextField = fieldForLevel(state.field.level + 1);
    state.field = nextField;
    state.crops = createCrops(nextField, state.crops);
    state.fences = createFences(nextField);
    state.repair = null;
    state.expansionCooldown = CONFIG.crops.expansionCooldown;
    state.expansionPulse = 1;
    notify(`Field expanded to Level ${nextField.level + 1}!`, 400, nextField.top - 18);
    emitSound('expand');
  }

  // Movement-only interactions: fences repair by proximity and all purchases use walk-in stations.
  function pointSegmentDistance(point, fence) {
    const vx = fence.x2 - fence.x1;
    const vy = fence.y2 - fence.y1;
    const lengthSquared = vx * vx + vy * vy || 1;
    const amount = Math.max(0, Math.min(1, ((point.x - fence.x1) * vx + (point.y - fence.y1) * vy) / lengthSquared));
    const x = fence.x1 + vx * amount;
    const y = fence.y1 + vy * amount;
    return Math.hypot(point.x - x, point.y - y);
  }

  function playerHitsFence(x, y) {
    return state.fences.some(fence => !fence.broken && pointSegmentDistance({ x, y }, fence) < state.player.radius + 4);
  }

  function playerHitsWorkshop(x, y) {
    return pointInRect(x, y, { x: 225, y: 445, width: 350, height: 145 }, state.player.radius - 2);
  }

  function movementVector() {
    const held = new Set(pointers.values());
    let x = 0;
    let y = 0;
    if (keys.ArrowUp || keys.w || held.has('up')) y--;
    if (keys.ArrowDown || keys.s || held.has('down')) y++;
    if (keys.ArrowLeft || keys.a || held.has('left')) x--;
    if (keys.ArrowRight || keys.d || held.has('right')) x++;
    const length = Math.hypot(x, y);
    return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }

  function nearestDamagedFence() {
    return state.fences
      .filter(fence => fence.health < fence.maxHealth && distance(state.player, fence) <= CONFIG.repair.range)
      .sort((a, b) => distance(state.player, a) - distance(state.player, b))[0] || null;
  }

  function updateRepair(dt) {
    if (!state.repair) {
      const fence = nearestDamagedFence();
      if (fence) {
        state.repair = { fenceId: fence.id, elapsed: 0, progress: 0 };
        announce('Repairing fence');
        emitSound('repairStart');
      }
      return false;
    }
    const fence = state.fences.find(item => item.id === state.repair.fenceId);
    if (!fence) {
      state.repair = null;
      return false;
    }
    state.repair.elapsed += dt;
    state.repair.progress = Math.min(1, state.repair.elapsed / CONFIG.repair.seconds);
    if (state.repair.progress >= 1) {
      fence.health = fence.maxHealth;
      fence.broken = false;
      notify('Fence repaired!', fence.x, fence.y - 18);
      state.repair = null;
      emitSound('repairComplete');
    }
    return true;
  }

  function updatePlayer(dt) {
    if (updateRepair(dt)) return;
    const vector = movementVector();
    if (!vector.x && !vector.y) {
      if (state.pendingDog) state.pendingDog.still += dt;
      return;
    }
    if (state.pendingDog) state.pendingDog.still = 0;
    state.player.facingX = vector.x;
    state.player.facingY = vector.y;
    state.player.step += dt * 10;
    const speed = CONFIG.player.speed;
    const nextX = Math.max(state.player.radius, Math.min(CONFIG.arena.width - state.player.radius, state.player.x + vector.x * speed * dt));
    const nextY = Math.max(state.player.radius, Math.min(CONFIG.arena.height - state.player.radius, state.player.y + vector.y * speed * dt));
    if (!playerHitsFence(nextX, state.player.y) && !playerHitsWorkshop(nextX, state.player.y)) state.player.x = nextX;
    if (!playerHitsFence(state.player.x, nextY) && !playerHitsWorkshop(state.player.x, nextY)) state.player.y = nextY;
  }

  function placePendingDog() {
    if (!state.pendingDog || state.pendingDog.still < CONFIG.dogs.placementSeconds) return;
    if (state.player.y > 465 || pointInRect(state.player.x, state.player.y, state.stations[0], 12)) return;
    const level = state.pendingDog.level;
    state.dogs.push({
      x: state.player.x,
      y: state.player.y,
      anchorX: state.player.x,
      anchorY: state.player.y,
      level,
      radius: CONFIG.dogs.patrolRadii[level - 1],
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * 4,
      vx: 1,
      vy: 0
    });
    state.pendingDog = null;
    notify(`Dog Level ${level} placed!`);
    emitSound('dogPlaced');
  }

  function updateStationLabels() {
    const dog = state.stations.find(station => station.type === 'dog');
    dog.level = state.dogPurchases;
    dog.maxed = state.dogPurchases >= CONFIG.dogs.costs.length;
    dog.cost = dog.maxed ? 0 : CONFIG.dogs.costs[state.dogPurchases];
    const fence = state.stations.find(station => station.type === 'fence');
    fence.level = state.fenceLevel;
    fence.maxed = state.fenceLevel >= CONFIG.fences.upgradeMultipliers.length;
    fence.cost = fence.maxed ? 0 : CONFIG.fences.upgradeCosts[state.fenceLevel - 1];
  }

  function buyDog(station) {
    if (state.pendingDog) {
      notify('Place your current dog first', station.x + station.width / 2, station.y - 8, true);
      return;
    }
    if (station.maxed || state.coins < station.cost) {
      if (!station.maxed) notify('Not enough coins', station.x + station.width / 2, station.y - 8, true);
      return;
    }
    state.coins -= station.cost;
    state.dogPurchases++;
    state.pendingDog = { level: state.dogPurchases, still: 0 };
    updateStationLabels();
    notify(`Dog purchased — stand still to place`, station.x + station.width / 2, station.y - 8);
    emitSound('purchase');
  }

  function buyFenceUpgrade(station) {
    if (station.maxed || state.coins < station.cost) {
      if (!station.maxed) notify('Not enough coins', station.x + station.width / 2, station.y - 8, true);
      return;
    }
    state.coins -= station.cost;
    state.fenceLevel++;
    const maxHealth = fenceMaximumHealth();
    state.fences.forEach(fence => {
      fence.maxHealth = maxHealth;
      fence.health = maxHealth;
      fence.broken = false;
    });
    updateStationLabels();
    notify(`Fence Level ${state.fenceLevel}`, station.x + station.width / 2, station.y - 8);
    emitSound('purchase');
  }

  function updateStations() {
    state.stations.forEach(station => {
      const inside = pointInRect(state.player.x, state.player.y, station);
      if (!inside) {
        station.ready = true;
        return;
      }
      if (!station.ready) return;
      station.ready = false;
      if (station.type === 'dog') buyDog(station);
      else buyFenceUpgrade(station);
    });
  }

  function updateEffects(dt) {
    state.expansionCooldown = Math.max(0, state.expansionCooldown - dt);
    state.expansionPulse = Math.max(0, state.expansionPulse - dt * 1.4);
    state.particles.forEach(particle => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 35 * dt;
    });
    state.particles = state.particles.filter(particle => particle.life > 0);
    state.coinPops.forEach(coin => {
      coin.life -= dt;
      coin.y -= 28 * dt;
    });
    state.coinPops = state.coinPops.filter(coin => coin.life > 0);
    state.notifications.forEach(note => {
      note.life -= dt;
      note.y -= 21 * dt;
    });
    state.notifications = state.notifications.filter(note => note.life > 0);
  }

  // Platform-facing results stay reducible to a small score breakdown and local best value.
  function updateHud() {
    elements.time.textContent = formatTime(state.timeLeft);
    elements.coins.textContent = state.coins.toLocaleString();
  }

  function scoreBreakdown() {
    const harvestBonus = state.harvests * CONFIG.scoring.harvestBonus;
    const fieldBonus = state.crops.length * CONFIG.scoring.fieldTileBonus;
    const coinBonus = state.coins;
    return { harvestBonus, fieldBonus, coinBonus, total: harvestBonus + fieldBonus + coinBonus };
  }

  function finishRound() {
    state.running = false;
    cancelAnimationFrame(animationFrame);
    clearInput();
    const score = scoreBreakdown();
    saveBest(score.total);
    elements.harvestBonus.textContent = score.harvestBonus.toLocaleString();
    elements.fieldBonus.textContent = score.fieldBonus.toLocaleString();
    elements.coinBonus.textContent = score.coinBonus.toLocaleString();
    elements.finalScore.textContent = score.total.toLocaleString();
    elements.bestScore.textContent = state.best.toLocaleString();
    elements.resultsOverlay.classList.remove('hidden');
    emitSound('roundEnd');
  }

  function update(dt) {
    state.elapsed += dt;
    state.timeLeft = Math.max(0, CONFIG.roundSeconds - state.elapsed);
    if (state.timeLeft <= 0) {
      finishRound();
      return;
    }
    updatePlayer(dt);
    harvestNearbyCrop();
    updateStations();
    placePendingDog();
    updateCrops(dt);
    maybeExpandField();
    updateDogs(dt);
    updateRabbits(dt);
    updateEffects(dt);
  }

  function draw() {
    renderer.draw(context, state);
  }

  function gameLoop(timestamp) {
    if (!state.running) return;
    const dt = Math.min(.04, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    update(dt);
    updateHud();
    draw();
    if (state.running) animationFrame = requestAnimationFrame(gameLoop);
  }

  function clearInput() {
    Object.keys(keys).forEach(key => { keys[key] = false; });
    pointers.clear();
    document.querySelectorAll('[data-direction]').forEach(button => button.classList.remove('active'));
  }

  function resetRound() {
    cancelAnimationFrame(animationFrame);
    nextRabbitId = 1;
    nextCropId = 1;
    state = createState();
    updateStationLabels();
    clearInput();
    elements.announcement.textContent = '';
    updateHud();
    draw();
  }

  function startRound() {
    resetRound();
    state.running = true;
    elements.startOverlay.classList.add('hidden');
    elements.resultsOverlay.classList.add('hidden');
    lastFrame = performance.now();
    animationFrame = requestAnimationFrame(gameLoop);
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
  addEventListener('keyup', event => { keys[normaliseKey(event)] = false; });
  addEventListener('blur', clearInput);

  document.querySelectorAll('[data-direction]').forEach(button => {
    const release = event => {
      pointers.delete(event.pointerId);
      button.classList.remove('active');
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      pointers.set(event.pointerId, button.dataset.direction);
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

  resetRound();
})();
