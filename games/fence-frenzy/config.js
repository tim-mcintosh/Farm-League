window.FENCE_FRENZY_CONFIG = Object.freeze({
  roundSeconds: 120,
  arena: { width: 800, height: 600 },
  player: { speed: 245, radius: 17 },
  repair: { seconds: 2, range: 31 },
  crops: {
    tileSize: 42,
    initialColumns: 4,
    initialRows: 3,
    maxExpansionLevel: 3,
    stageSeconds: { seed: 3.5, growing: 5.5, ready: 7, overripe: 5, dead: 3 },
    harvestCoins: 20,
    harvestRange: 27,
    expansionHarvests: [4, 11, 21],
    expansionHealthyRatio: 0.62,
    expansionCooldown: 12
  },
  fences: {
    boundaryInset: 24,
    segmentLength: 50,
    baseHealth: 42,
    upgradeMultipliers: [1, 1.5, 2],
    upgradeCosts: [180, 360],
    rabbitDamagePerSecond: 10
  },
  rabbits: {
    initialSpawnDelay: 1.5,
    radius: 12,
    approachSpeed: 43,
    insideSpeed: 50,
    cropEatSeconds: 1.8,
    spawnPhases: [
      { until: 30, interval: 3.2, cap: 7 },
      { until: 60, interval: 2, cap: 12 },
      { until: 90, interval: 1.4, cap: 18 },
      { until: Infinity, interval: .75, cap: 26 }
    ]
  },
  crows: {
    startAt: 60,
    radius: 15,
    flySpeed: 78,
    cropEatSeconds: 1.5,
    spawnPhases: [
      { until: 90, interval: 4.5, cap: 5 },
      { until: Infinity, interval: 2.8, cap: 7 }
    ]
  },
  dogs: {
    costs: [120, 240, 400],
    speeds: [72, 88, 104],
    scareRanges: [36, 44, 54],
    placementSeconds: 0.8
  },
  scoring: { harvestBonus: 50, fieldTileBonus: 10 },
  bestScoreKey: 'farmLeague.fenceFrenzy.bestScore',
  legacyBestScoreKey: 'farmLeague.farmDefence.bestScore'
});
