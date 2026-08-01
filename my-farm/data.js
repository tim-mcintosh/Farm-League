(() => {
  'use strict';

  const STORAGE_KEY = 'farmLeague.myFarm.v2';
  const LEGACY_STORAGE_KEY = 'farmLeague.myFarm.v1';
  const SCHEMA_VERSION = 2;
  const GRID = Object.freeze({ columns: 12, rows: 8 });

  const CATALOG = Object.freeze({
    farmhouse: Object.freeze({
      type: 'farmhouse', name: 'Small farmhouse', icon: '🏡', width: 2, height: 2, price: 250,
      description: 'The heart of your farm.'
    }),
    barn: Object.freeze({
      type: 'barn', name: 'Red barn', icon: '🏚️', width: 3, height: 2, price: 220,
      description: 'A roomy barn for future animals.'
    }),
    garden: Object.freeze({
      type: 'garden', name: 'Garden bed', icon: '🥕', width: 1, height: 1, price: 60,
      description: 'A tidy patch of colourful vegetables.'
    }),
    pond: Object.freeze({
      type: 'pond', name: 'Farm pond', icon: '💧', width: 2, height: 2, price: 140,
      description: 'A quiet watering spot.'
    }),
    coop: Object.freeze({
      type: 'coop', name: 'Chicken coop', icon: '🐔', width: 2, height: 1, price: 110,
      description: 'A compact home for future chickens.'
    }),
    windmill: Object.freeze({
      type: 'windmill', name: 'Windmill', icon: '🌬️', width: 1, height: 2, price: 180,
      description: 'A tall landmark for the paddock.'
    }),
    tree: Object.freeze({
      type: 'tree', name: 'Shade tree', icon: '🌳', width: 1, height: 1, price: 35,
      description: 'Adds greenery to an empty corner.'
    }),
    fence: Object.freeze({
      type: 'fence', name: 'Fence section', icon: '🪵', width: 1, height: 1, price: 10,
      description: 'A decorative section of timber fence.'
    }),
    stone: Object.freeze({
      type: 'stone', name: 'Farm stone', icon: '🪨', width: 1, height: 1, price: 15,
      description: 'A natural stone for decorating the paddock.'
    }),
    mailbox: Object.freeze({
      type: 'mailbox', name: 'Farm mailbox', icon: '📫', width: 1, height: 1, price: 25,
      description: 'A cheerful mailbox for the farm entrance.'
    }),
    cow: Object.freeze({
      type: 'cow', name: 'Cow', icon: '🐄', width: 1, height: 1, price: 30,
      description: 'A friendly cow for your farm.'
    }),
    horse: Object.freeze({
      type: 'horse', name: 'Horse', icon: '🐎', width: 1, height: 1, price: 30,
      description: 'A dependable farm horse.'
    }),
    rabbit: Object.freeze({
      type: 'rabbit', name: 'Rabbit', icon: '🐇', width: 1, height: 1, price: 30,
      description: 'A curious rabbit for the paddock.'
    }),
    crow: Object.freeze({
      type: 'crow', name: 'Crow', icon: '🐦‍⬛', width: 1, height: 1, price: 30,
      description: 'A watchful farm crow.'
    }),
    sheep: Object.freeze({
      type: 'sheep', name: 'Sheep', icon: '🐑', width: 1, height: 1, price: 30,
      description: 'A woolly sheep for your farm.'
    }),
    chicken: Object.freeze({
      type: 'chicken', name: 'Chicken', icon: '🐔', width: 1, height: 1, price: 30,
      description: 'A lively farmyard chicken.'
    }),
    dog: Object.freeze({
      type: 'dog', name: 'Farm dog', icon: '🐕', width: 1, height: 1, price: 30,
      description: 'A loyal companion for the farm.'
    }),
    tractor: Object.freeze({
      type: 'tractor', name: 'Farm tractor', icon: '🚜', width: 1, height: 2, price: 160,
      description: 'A reliable tractor ready for field work.'
    }),
    deliveryTruck: Object.freeze({
      type: 'deliveryTruck', name: 'Delivery truck', icon: '🚚', width: 2, height: 1, price: 180,
      description: 'A delivery truck for busy farm orders.'
    }),
    hayBale: Object.freeze({
      type: 'hayBale', name: 'Hay bale', icon: '🌾', width: 1, height: 1, price: 15,
      description: 'A tidy bale of farm hay.'
    })
  });

  function starterFarm() {
    return {
      version: SCHEMA_VERSION,
      coins: 250,
      inventory: {
        farmhouse: 0,
        barn: 0,
        garden: 0,
        pond: 0,
        coop: 0,
        windmill: 0,
        tree: 0,
        fence: 10,
        stone: 1,
        mailbox: 1,
        cow: 0,
        horse: 0,
        rabbit: 0,
        crow: 0,
        sheep: 0,
        chicken: 0,
        dog: 0,
        tractor: 0,
        deliveryTruck: 0,
        hayBale: 0
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

  function starterInventoryFor(placed) {
    const placedCount = type => placed.filter(object => object.type === type).length;
    return {
      farmhouse: Math.max(0, 1 - placedCount('farmhouse')),
      barn: 0,
      garden: Math.max(0, 1 - placedCount('garden')),
      pond: 0,
      coop: 0,
      windmill: 0,
      tree: Math.max(0, 1 - placedCount('tree')),
      fence: Math.max(0, 10 - placedCount('fence')),
      stone: Math.max(0, 1 - placedCount('stone')),
      mailbox: Math.max(0, 1 - placedCount('mailbox')),
      cow: 0,
      horse: 0,
      rabbit: 0,
      crow: 0,
      sheep: 0,
      chicken: 0,
      dog: 0,
      tractor: 0,
      deliveryTruck: 0,
      hayBale: 0
    };
  }

  function migrateLegacyFarm(parsed) {
    const placed = normalisePlaced(parsed.placed)
      .filter(object => object.id !== 'starter-barn');
    return {
      version: SCHEMA_VERSION,
      coins: Number.isSafeInteger(parsed.coins) && parsed.coins >= 0 && parsed.coins <= 999999
        ? parsed.coins
        : 0,
      inventory: starterInventoryFor(placed),
      placed
    };
  }

  function load() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (current?.version === SCHEMA_VERSION) {
        return {
          version: SCHEMA_VERSION,
          coins: Number.isSafeInteger(current.coins) && current.coins >= 0 && current.coins <= 999999
            ? current.coins
            : 0,
          inventory: normaliseInventory(current.inventory),
          placed: normalisePlaced(current.placed)
        };
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy?.version === 1) return migrateLegacyFarm(legacy);
      return starterFarm();
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
