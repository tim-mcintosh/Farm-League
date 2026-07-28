// Central balancing configuration. Change gameplay values here, not in the game loop.
window.FEED_RUN_CONFIG = Object.freeze({
  roundSeconds: 120,
  arena: { width: 800, height: 600, edgePadding: 18 },
  player: { radius: 17, speed: 245, pickupPadding: 8 },
  pens: { fenceWidth: 6, gateSize: 76, animalInset: 28 },
  hunger: {
    maximum: 100,
    starting: 100,
    criticalAt: 25,
    drainPerSecond: {
      horses: 1.28,
      cows: 1.32,
      sheep: 1.38,
      chickens: 1.45
    }
  },
  difficultyPhases: [
    { until: 30, drainMultiplier: 0.55, spawnDistance: 80, visibleFood: 4 },
    { until: 60, drainMultiplier: 0.9, spawnDistance: 105, visibleFood: 4 },
    { until: 90, drainMultiplier: 1.25, spawnDistance: 135, visibleFood: 5 },
    { until: Infinity, drainMultiplier: 1.85, spawnDistance: 175, visibleFood: 5 }
  ],
  food: {
    maximumVisible: 4,
    expirySeconds: 14,
    radius: 15,
    spawnPadding: 32,
    minimumSeparation: 54,
    criticalFoodChance: 0.72,
    normalHayChance: 0.14,
    forceHayAfterSpawns: 6,
    types: {
      carrot: { name: 'Carrot', icon: '🥕', animals: ['horses'], restore: 38, score: 15 },
      apple: { name: 'Apple', icon: '🍎', animals: ['horses'], restore: 38, score: 15 },
      cowFeed: { name: 'Cow feed', icon: '🥣', animals: ['cows'], restore: 38, score: 15 },
      grass: { name: 'Grass bundle', icon: '🌿', animals: ['cows', 'sheep'], restore: 38, score: 15 },
      clover: { name: 'Clover', icon: '☘️', animals: ['sheep'], restore: 38, score: 15 },
      corn: { name: 'Corn', icon: '🌽', animals: ['chickens'], restore: 38, score: 15 },
      grain: { name: 'Grain', icon: '🌾', animals: ['chickens'], restore: 38, score: 15 },
      hay: { name: 'Hay', icon: '🟨', animals: ['horses', 'cows', 'sheep', 'chickens'], restore: 19, score: 8, universal: true }
    }
  },
  scoring: {
    urgencyBonus: 8,
    comboStep: 1,
    maximumComboBonus: 6,
    completionBonus: 50
  },
  bestScoreKey: 'farmLeague.feedRun.bestScore.v2'
});
