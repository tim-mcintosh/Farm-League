(() => {
  'use strict';

  const STORAGE_KEY = 'farmLeague.myFarm.v1';
  const SCHEMA_VERSION = 1;
  const GRID = Object.freeze({ columns: 12, rows: 8 });

  const CATALOG = Object.freeze({
    farmhouse: Object.freeze({
      type: 'farmhouse', name: 'Farmhouse', icon: '🏡', width: 3, height: 2,
      description: 'The heart of your farm.'
    }),
    barn: Object.freeze({
      type: 'barn', name: 'Red barn', icon: '🏚️', width: 3, height: 2,
      description: 'A roomy barn for future animals.'
    }),
    garden: Object.freeze({
      type: 'garden', name: 'Garden bed', icon: '🥕', width: 2, height: 2,
      description: 'A tidy patch of colourful vegetables.'
    }),
    pond: Object.freeze({
      type: 'pond', name: 'Farm pond', icon: '💧', width: 2, height: 2,
      description: 'A quiet watering spot.'
    }),
    coop: Object.freeze({
      type: 'coop', name: 'Chicken coop', icon: '🐔', width: 2, height: 1,
      description: 'A compact home for future chickens.'
    }),
    windmill: Object.freeze({
      type: 'windmill', name: 'Windmill', icon: '🌬️', width: 1, height: 2,
      description: 'A tall landmark for the paddock.'
    }),
    tree: Object.freeze({
      type: 'tree', name: 'Shade tree', icon: '🌳', width: 1, height: 1,
      description: 'Adds greenery to an empty corner.'
    }),
    fence: Object.freeze({
      type: 'fence', name: 'Fence section', icon: '🪵', width: 1, height: 1,
      description: 'A decorative section of timber fence.'
    })
  });

  function starterFarm() {
    return {
      version: SCHEMA_VERSION,
      coins: 250,
      inventory: {
        farmhouse: 0,
        barn: 1,
        garden: 1,
        pond: 1,
        coop: 1,
        windmill: 1,
        tree: 5,
        fence: 8
      },
      placed: [
        { id: 'starter-farmhouse', type: 'farmhouse', x: 1, y: 1 },
        { id: 'starter-garden', type: 'garden', x: 2, y: 5 },
        { id: 'starter-tree', type: 'tree', x: 7, y: 5 }
      ]
    };
  }

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 999;
  }

  function normaliseInventory(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(Object.keys(CATALOG).map(type => [
      type,
      validCount(source[type]) ? source[type] : 0
    ]));
  }

  function normalisePlaced(value) {
    if (!Array.isArray(value)) return [];
    const ids = new Set();
    return value.flatMap(object => {
      if (!object || typeof object !== 'object') return [];
      if (!CATALOG[object.type]
        || typeof object.id !== 'string'
        || !/^[a-z0-9-]{1,80}$/i.test(object.id)
        || ids.has(object.id)) return [];
      if (!Number.isSafeInteger(object.x) || !Number.isSafeInteger(object.y)) return [];
      ids.add(object.id);
      return [{ id: object.id, type: object.type, x: object.x, y: object.y }];
    });
  }

  function migrateStarterLayout(farm) {
    const retiredBarn = farm.placed.find(object => object.id === 'starter-barn');
    if (!retiredBarn) return farm;
    farm.placed = farm.placed.filter(object => object.id !== retiredBarn.id);
    farm.inventory.barn = Math.min(999, (farm.inventory.barn || 0) + 1);
    return farm;
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== SCHEMA_VERSION) return starterFarm();
      return migrateStarterLayout({
        version: SCHEMA_VERSION,
        coins: Number.isSafeInteger(parsed.coins) && parsed.coins >= 0 && parsed.coins <= 999999
          ? parsed.coins
          : 0,
        inventory: normaliseInventory(parsed.inventory),
        placed: normalisePlaced(parsed.placed)
      });
    } catch {
      return starterFarm();
    }
  }

  function save(farm) {
    const snapshot = {
      version: SCHEMA_VERSION,
      coins: farm.coins,
      inventory: normaliseInventory(farm.inventory),
      placed: normalisePlaced(farm.placed)
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  function createObjectId(type) {
    const suffix = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${type}-${suffix}`;
  }

  window.MyFarmData = Object.freeze({
    storageKey: STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    grid: GRID,
    catalog: CATALOG,
    starterFarm,
    load,
    save,
    createObjectId
  });
})();
