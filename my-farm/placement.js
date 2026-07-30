(() => {
  'use strict';

  const { catalog, grid } = window.MyFarmData;

  function boundsFor(object, x = object.x, y = object.y) {
    const definition = catalog[object.type];
    return {
      left: x,
      top: y,
      right: x + definition.width,
      bottom: y + definition.height
    };
  }

  function overlaps(first, second) {
    return first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
  }

  function check(placed, type, x, y, ignoreId = null) {
    const definition = catalog[type];
    if (!definition) return { valid: false, reason: 'Unknown farm item.' };
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      return { valid: false, reason: 'Choose a grid square.' };
    }

    const candidate = {
      left: x,
      top: y,
      right: x + definition.width,
      bottom: y + definition.height
    };
    if (candidate.left < 0 || candidate.top < 0
      || candidate.right > grid.columns || candidate.bottom > grid.rows) {
      return { valid: false, reason: 'That item would extend beyond the farm.' };
    }

    const collision = placed.find(object => object.id !== ignoreId
      && catalog[object.type]
      && overlaps(candidate, boundsFor(object)));
    if (collision) {
      return {
        valid: false,
        reason: `${definition.name} would overlap ${catalog[collision.type].name}.`
      };
    }
    return { valid: true, reason: 'Ready to place.' };
  }

  function objectAt(placed, x, y) {
    return [...placed].reverse().find(object => {
      if (!catalog[object.type]) return false;
      const bounds = boundsFor(object);
      return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
    }) || null;
  }

  function sanitise(placed) {
    return placed.reduce((safe, object) => {
      const result = check(safe, object.type, object.x, object.y);
      if (result.valid) safe.push(object);
      return safe;
    }, []);
  }

  function gridPosition(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor((clientX - rect.left) / rect.width * grid.columns);
    const y = Math.floor((clientY - rect.top) / rect.height * grid.rows);
    if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return null;
    return { x, y };
  }

  window.MyFarmPlacement = Object.freeze({ boundsFor, check, objectAt, sanitise, gridPosition });
})();
