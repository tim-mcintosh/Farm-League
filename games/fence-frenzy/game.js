(() => {
  const CONFIG = window.FENCE_FRENZY_CONFIG;
  const renderer = window.FenceFrenzyRenderer;
  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');
  const elements = {
    time: document.getElementById('time'),
    coins: document.getElementById('coins'),
    score: document.getElementById('score'),
    announcement: document.getElementById('announcement'),
    actionNotice: document.getElementById('actionNotice'),
    startOverlay: document.getElementById('startOverlay'),
    resultsOverlay: document.getElementById('resultsOverlay'),
    harvestBonus: document.getElementById('harvestBonus'),
    defenceBonus: document.getElementById('defenceBonus'),
    fieldBonus: document.getElementById('fieldBonus'),
    coinBonus: document.getElementById('coinBonus'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScore')
  };
  const keys = {};
  let mobileDirection = null;
  const mobileCameraQuery = window.matchMedia?.('(pointer: coarse) and (orientation: portrait)');
  const cropStages = ['seed', 'growing', 'ready', 'overripe', 'dead'];
  const notificationSeconds = 1.5;
  const fieldCentre = { x: CONFIG.arena.width / 2, y: CONFIG.arena.height / 2 };
  let state;
  let animationFrame = 0;
  let lastFrame = 0;
  let nextRabbitId = 1;
  let nextCrowId = 1;
  let nextCropId = 1;

  // Persistence and presentation hooks remain optional so the local game loop is self-contained.
  function loadBest() {
    try {
      const storedScore = key => {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
      };
      return storedScore(CONFIG.bestScoreKey);
    } catch {
      return 0;
    }
  }

  function saveBest(score) {
    const candidate = Math.max(0, Math.floor(score));
    if (candidate <= state.best) return;
    state.best = candidate;
    try {
      localStorage.setItem(CONFIG.bestScoreKey, String(state.best));
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
    document.dispatchEvent(new CustomEvent('fencefrenzy:sound', { detail: { type } }));
  }

  function announce(text) {
    elements.announcement.textContent = text;
  }

  function notify(text, bad = false) {
    elements.actionNotice.textContent = text;
    elements.actionNotice.classList.toggle('bad', bad);
    elements.actionNotice.classList.add('visible');
    state.notificationTime = notificationSeconds;
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

  function createFences() {
    const fences = [];
    const inset = CONFIG.fences.boundaryInset;
    const right = CONFIG.arena.width - inset;
    const bottom = CONFIG.arena.height - inset;
    const horizontalSegments = Math.ceil((right - inset) / CONFIG.fences.segmentLength);
    const verticalSegments = Math.ceil((bottom - inset) / CONFIG.fences.segmentLength);
    const horizontalLength = (right - inset) / horizontalSegments;
    const verticalLength = (bottom - inset) / verticalSegments;
    for (let index = 0; index < horizontalSegments; index++) {
      const x1 = inset + index * horizontalLength;
      const x2 = inset + (index + 1) * horizontalLength;
      fences.push(makeFence(`top-${index}`, 'top', index, x1, inset, x2, inset));
      fences.push(makeFence(`bottom-${index}`, 'bottom', index, x1, bottom, x2, bottom));
    }
    for (let index = 0; index < verticalSegments; index++) {
      const y1 = inset + index * verticalLength;
      const y2 = inset + (index + 1) * verticalLength;
      fences.push(makeFence(`left-${index}`, 'left', index, inset, y1, inset, y2));
      fences.push(makeFence(`right-${index}`, 'right', index, right, y1, right, y2));
    }
    return fences;
  }

  function createStations() {
    return [
      { type: 'dog', label: 'DOG KENNEL', x: 78, y: 462, width: 120, height: 64, level: 0, cost: CONFIG.dogs.costs[0], maxed: false, ready: true },
      { type: 'fence', label: 'FENCE SUPPLIES', x: 602, y: 462, width: 120, height: 64, level: 1, cost: CONFIG.fences.upgradeCosts[0], maxed: false, ready: true }
    ];
  }

  function createState() {
    const field = fieldForLevel(0);
    const initial = {
      running: false,
      elapsed: 0,
      timeLeft: CONFIG.roundSeconds,
      coins: 0,
      coinsCollected: 0,
      best: loadBest(),
      harvests: 0,
      rabbitsScared: 0,
      crowsScared: 0,
      fencesRepaired: 0,
      lastExpansionHarvests: 0,
      expansionCooldown: 0,
      expansionPulse: 0,
      field,
      crops: [],
      fences: [],
      rabbits: [],
      crows: [],
      dogs: [],
      dogPurchases: 0,
      fenceLevel: 1,
      pendingDog: null,
      repair: null,
      spawnClock: CONFIG.rabbits.initialSpawnDelay,
      nextCrowSpawnAt: CONFIG.crows.startAt,
      player: { x: 400, y: 420, radius: CONFIG.player.radius, facingX: 0, facingY: -1, step: 0 },
      stations: createStations(),
      particles: [],
      coinPops: [],
      notificationTime: 0
    };
    state = initial;
    state.crops = createCrops(field);
    state.fences = createFences();
    return state;
  }

  // Rabbits arrive beyond the border, break in, and remain until a farmer or dog scares them away.
  function currentRabbitPhase() {
    return CONFIG.rabbits.spawnPhases.find(phase => state.elapsed < phase.until);
  }

  function currentCrowPhase() {
    return CONFIG.crows.spawnPhases.find(phase => state.elapsed < phase.until);
  }

  function outsideSpawnPoint() {
    const margin = 18;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: -margin, y: Math.random() * CONFIG.arena.height };
    if (side === 1) return { x: CONFIG.arena.width + margin, y: Math.random() * CONFIG.arena.height };
    if (side === 2) return { x: Math.random() * CONFIG.arena.width, y: -margin };
    return { x: Math.random() * CONFIG.arena.width, y: CONFIG.arena.height + margin };
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
      type: 'rabbit',
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      state: 'approach',
      targetFenceId: null,
      targetCropId: null,
      eatTime: 0,
      hop: Math.random() * Math.PI,
      scared: false
    };
    const fence = chooseFence(rabbit);
    rabbit.targetFenceId = fence?.id || null;
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

  function nearestExitTarget(actor) {
    const margin = 30;
    const targets = [
      { x: -margin, y: actor.y },
      { x: CONFIG.arena.width + margin, y: actor.y },
      { x: actor.x, y: -margin },
      { x: actor.x, y: CONFIG.arena.height + margin }
    ];
    return targets.reduce((best, target) => distance(actor, target) < distance(actor, best) ? target : best, targets[0]);
  }

  function sendThreatAway(threat) {
    if (threat.scared) return;
    if (threat.type === 'rabbit') state.rabbitsScared++;
    if (threat.type === 'crow') state.crowsScared++;
    threat.scared = true;
    threat.state = 'leaving';
    threat.exitTarget = nearestExitTarget(threat);
    threat.targetFenceId = null;
    threat.targetCropId = null;
  }

  function updateRabbit(rabbit, dt) {
    if (rabbit.state === 'leaving') {
      moveToward(rabbit, rabbit.exitTarget || nearestExitTarget(rabbit), CONFIG.rabbits.insideSpeed * 1.3, dt);
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
        rabbit.vx = 0;
        rabbit.vy = 0;
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
        rabbit.state = 'inside';
        rabbit.targetCropId = nearestLivingCrop(rabbit)?.id || null;
      }
    }
  }

  function updateRabbits(dt) {
    state.rabbits.forEach(rabbit => updateRabbit(rabbit, dt));
    state.rabbits = state.rabbits.filter(rabbit => rabbit.x > -55
      && rabbit.x < CONFIG.arena.width + 55
      && rabbit.y > -55
      && rabbit.y < CONFIG.arena.height + 55);
    const phase = currentRabbitPhase();
    state.spawnClock -= dt;
    if (state.spawnClock <= 0 && state.rabbits.length < phase.cap) {
      spawnRabbit();
      state.spawnClock = phase.interval * (.82 + Math.random() * .35);
    }
  }

  function spawnCrow() {
    const point = outsideSpawnPoint();
    state.crows.push({
      id: nextCrowId++,
      type: 'crow',
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      state: 'approach',
      targetCropId: nearestLivingCrop(point)?.id || null,
      eatTime: 0,
      wingPhase: Math.random() * Math.PI * 2,
      scared: false
    });
  }

  function updateCrow(crow, dt) {
    crow.wingPhase += dt * 9;
    if (crow.state === 'leaving') {
      moveToward(crow, crow.exitTarget || nearestExitTarget(crow), CONFIG.crows.flySpeed * 1.35, dt);
      return;
    }

    let crop = state.crops.find(item => item.id === crow.targetCropId && item.stage !== 'dead');
    if (!crop) {
      crop = nearestLivingCrop(crow);
      crow.targetCropId = crop?.id || null;
    }
    if (!crop) {
      crow.vx = 0;
      crow.vy = 0;
      return;
    }

    if (crow.state === 'approach') {
      if (moveToward(crow, crop, CONFIG.crows.flySpeed, dt) < 16) {
        crow.state = 'eating';
        crow.eatTime = CONFIG.crows.cropEatSeconds;
      }
      return;
    }

    crow.eatTime -= dt;
    if (crow.eatTime <= 0) {
      crop.stage = 'dead';
      crop.age = 0;
      burst(crop.x, crop.y, '#4c4a42', 8);
      crow.state = 'approach';
      crow.targetCropId = nearestLivingCrop(crow)?.id || null;
    }
  }

  function updateCrows(dt) {
    state.crows.forEach(crow => updateCrow(crow, dt));
    state.crows = state.crows.filter(crow => crow.x > -55
      && crow.x < CONFIG.arena.width + 55
      && crow.y > -55
      && crow.y < CONFIG.arena.height + 55);
    if (state.elapsed < CONFIG.crows.startAt) return;
    const phase = currentCrowPhase();
    if (state.elapsed >= state.nextCrowSpawnAt && state.crows.length < phase.cap) {
      spawnCrow();
      state.nextCrowSpawnAt = state.elapsed + phase.interval * (.85 + Math.random() * .3);
    }
  }

  function dogTargets() {
    const rabbits = state.rabbits.filter(rabbit => !rabbit.scared && (rabbit.state === 'inside' || rabbit.state === 'eating'));
    const crows = state.crows.filter(crow => !crow.scared
      && crow.x >= 0 && crow.x <= CONFIG.arena.width
      && crow.y >= 0 && crow.y <= CONFIG.arena.height);
    return rabbits.concat(crows);
  }

  function updateDogs(dt) {
    state.dogs.forEach(dog => {
      const levelIndex = Math.max(0, Math.min(CONFIG.dogs.speeds.length - 1, dog.level - 1));
      const speed = CONFIG.dogs.speeds[levelIndex];
      const scareRange = CONFIG.dogs.scareRanges[levelIndex];
      const target = dogTargets()
        .sort((a, b) => distance(dog, a) - distance(dog, b))[0];
      if (target) {
        moveToward(dog, target, speed, dt);
      } else if (distance(dog, { x: dog.anchorX, y: dog.anchorY }) > 3) {
        moveToward(dog, { x: dog.anchorX, y: dog.anchorY }, speed, dt);
      } else {
        dog.vx = 0;
        dog.vy = 0;
      }
      dog.phase += dt * 5;
      state.rabbits.forEach(rabbit => {
        if (!rabbit.scared && distance(dog, rabbit) <= scareRange) {
          sendThreatAway(rabbit);
          notify('Rabbit chased away!');
          emitSound('dogScare');
        }
      });
      state.crows.forEach(crow => {
        if (!crow.scared && distance(dog, crow) <= scareRange) {
          sendThreatAway(crow);
          notify('Crow chased away!');
          emitSound('dogScare');
        }
      });
    });
  }

  function scareThreatsNearPlayer() {
    state.rabbits.forEach(rabbit => {
      if (!rabbit.scared && distance(state.player, rabbit) <= state.player.radius + CONFIG.rabbits.radius) {
        sendThreatAway(rabbit);
        notify('Rabbit scared away!');
        emitSound('rabbitScare');
      }
    });
    state.crows.forEach(crow => {
      if (!crow.scared && distance(state.player, crow) <= state.player.radius + CONFIG.crows.radius) {
        sendThreatAway(crow);
        notify('Crow scared away!');
        emitSound('crowScare');
      }
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
    state.coinsCollected += CONFIG.crops.harvestCoins;
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
    state.expansionCooldown = CONFIG.crops.expansionCooldown;
    state.expansionPulse = 1;
    notify(`Field expanded to Level ${nextField.level + 1}!`);
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
    const collisionRange = state.player.radius + 4;
    const nextPosition = { x, y };
    return state.fences.some(fence => {
      if (fence.broken) return false;
      const nextDistance = pointSegmentDistance(nextPosition, fence);
      if (nextDistance >= collisionRange) return false;
      const currentDistance = pointSegmentDistance(state.player, fence);
      const escapingOverlap = currentDistance < collisionRange && nextDistance > currentDistance;
      return !escapingOverlap;
    });
  }

  function movementVector() {
    let x = 0;
    let y = 0;
    if (keys.ArrowUp || keys.w || mobileDirection === 'up') y--;
    if (keys.ArrowDown || keys.s || mobileDirection === 'down') y++;
    if (keys.ArrowLeft || keys.a || mobileDirection === 'left') x--;
    if (keys.ArrowRight || keys.d || mobileDirection === 'right') x++;
    const length = Math.hypot(x, y);
    return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }

  function nearestDamagedFence() {
    const chewedFenceIds = new Set(state.rabbits
      .filter(rabbit => rabbit.state === 'chewing')
      .map(rabbit => rabbit.targetFenceId));
    return state.fences
      .filter(fence => fence.health < fence.maxHealth
        && !chewedFenceIds.has(fence.id)
        && distance(state.player, fence) <= CONFIG.repair.range)
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
    const beingChewed = state.rabbits.some(rabbit => rabbit.state === 'chewing' && rabbit.targetFenceId === state.repair.fenceId);
    if (!fence || beingChewed) {
      state.repair = null;
      return false;
    }
    state.repair.elapsed += dt;
    state.repair.progress = Math.min(1, state.repair.elapsed / CONFIG.repair.seconds);
    if (state.repair.progress >= 1) {
      fence.health = fence.maxHealth;
      fence.broken = false;
      state.fencesRepaired++;
      notify('Fence repaired!');
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
    if (!playerHitsFence(nextX, state.player.y)) state.player.x = nextX;
    if (!playerHitsFence(state.player.x, nextY)) state.player.y = nextY;
  }

  function placePendingDog() {
    if (!state.pendingDog || state.pendingDog.still < CONFIG.dogs.placementSeconds) return;
    if (pointInRect(state.player.x, state.player.y, state.stations[0], 12)) return;
    const level = state.pendingDog.level;
    state.dogs.push({
      x: state.player.x,
      y: state.player.y,
      anchorX: state.player.x,
      anchorY: state.player.y,
      level,
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
      notify('Place your current dog first', true);
      return;
    }
    if (station.maxed || state.coins < station.cost) {
      if (!station.maxed) notify('Not enough coins', true);
      return;
    }
    state.coins -= station.cost;
    state.dogPurchases++;
    state.pendingDog = { level: state.dogPurchases, still: 0 };
    updateStationLabels();
    notify('Dog purchased — stand still to place');
    emitSound('purchase');
  }

  function buyFenceUpgrade(station) {
    if (station.maxed || state.coins < station.cost) {
      if (!station.maxed) notify('Not enough coins', true);
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
    notify(`Fence Level ${state.fenceLevel}`);
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
    state.notificationTime = Math.max(0, state.notificationTime - dt);
    elements.actionNotice.classList.toggle('visible', state.notificationTime > 0);
  }

  // Platform-facing results stay reducible to a small score breakdown and local best value.
  function updateHud() {
    elements.time.textContent = formatTime(state.timeLeft);
    elements.coins.textContent = state.coins.toLocaleString();
    elements.score.textContent = scoreBreakdown().total.toLocaleString();
  }

  function scoreBreakdown() {
    const harvestBonus = state.harvests * CONFIG.scoring.harvestBonus;
    const defenceBonus = state.rabbitsScared * CONFIG.scoring.rabbitScareBonus
      + state.crowsScared * CONFIG.scoring.crowScareBonus
      + state.fencesRepaired * CONFIG.scoring.repairBonus;
    const fieldBonus = state.crops.length * CONFIG.scoring.fieldTileBonus;
    const coinBonus = state.coinsCollected;
    return {
      harvestBonus,
      defenceBonus,
      fieldBonus,
      coinBonus,
      total: harvestBonus + defenceBonus + fieldBonus + coinBonus
    };
  }

  function finishRound() {
    state.running = false;
    cancelAnimationFrame(animationFrame);
    clearInput();
    const score = scoreBreakdown();
    saveBest(score.total);
    elements.harvestBonus.textContent = score.harvestBonus.toLocaleString();
    elements.defenceBonus.textContent = score.defenceBonus.toLocaleString();
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
    updateCrows(dt);
    scareThreatsNearPlayer();
    updateEffects(dt);
  }

  function draw() {
    updateMobileCamera();
    renderer.draw(context, state);
  }

  function updateMobileCamera() {
    if (!mobileCameraQuery?.matches) {
      canvas.style.removeProperty('left');
      canvas.style.removeProperty('transform');
      return;
    }
    const stage = canvas.parentElement;
    if (!stage?.clientHeight || !stage.clientWidth) return;
    const scale = stage.clientHeight / canvas.height;
    const renderedWidth = canvas.width * scale;
    const minimumLeft = Math.min(0, stage.clientWidth - renderedWidth);
    const centredOnPlayer = stage.clientWidth / 2 - state.player.x * scale;
    canvas.style.left = `${Math.max(minimumLeft, Math.min(0, centredOnPlayer))}px`;
    canvas.style.transform = 'none';
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
    mobileDirection = null;
    document.querySelector('[data-farm-dpad]')?.farmLeagueDPad?.reset();
  }

  function resetRound() {
    cancelAnimationFrame(animationFrame);
    nextRabbitId = 1;
    nextCrowId = 1;
    nextCropId = 1;
    state = createState();
    updateStationLabels();
    clearInput();
    elements.announcement.textContent = '';
    elements.actionNotice.textContent = '';
    elements.actionNotice.classList.remove('visible', 'bad');
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInput();
  });

  document.querySelector('[data-farm-dpad]').addEventListener('farmleague:directionchange', event => {
    mobileDirection = event.detail.direction;
  });

  document.getElementById('startButton').addEventListener('click', startRound);
  document.getElementById('restartButton').addEventListener('click', startRound);

  resetRound();
})();
