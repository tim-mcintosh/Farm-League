(() => {
  'use strict';

  const Data = window.MyFarmData;
  const Placement = window.MyFarmPlacement;
  const canvas = document.getElementById('farmCanvas');
  const renderer = window.MyFarmRenderer.create(canvas);
  const elements = {
    coins: document.getElementById('farmCoins'),
    mode: document.getElementById('farmMode'),
    status: document.getElementById('builderStatus'),
    saveStatus: document.getElementById('saveStatus'),
    inventory: document.getElementById('inventoryList'),
    inventoryPanel: document.getElementById('inventoryPanel'),
    shop: document.getElementById('shopList'),
    shopPanel: document.getElementById('shopPanel'),
    placed: document.getElementById('placedList'),
    storage: document.getElementById('storageButton'),
    shopButton: document.getElementById('shopButton'),
    remove: document.getElementById('removeButton')
  };

  const loadedFarm = Data.load();
  const safePlaced = Placement.sanitise(loadedFarm.placed);
  if (safePlaced.length !== loadedFarm.placed.length) {
    const safeIds = new Set(safePlaced.map(object => object.id));
    loadedFarm.placed
      .filter(object => !safeIds.has(object.id) && Data.catalog[object.type])
      .forEach(object => {
        loadedFarm.inventory[object.type] = Math.min(999, loadedFarm.inventory[object.type] + 1);
      });
    loadedFarm.placed = safePlaced;
  }
  const initialSaveSucceeded = Data.save(loadedFarm);

  const view = {
    farm: loadedFarm,
    mode: 'view',
    selectedObjectId: null,
    selectedType: null,
    preview: null,
    activePanel: null
  };
  const DOUBLE_ACTIVATION_MS = 550;
  let lastCanvasAction = null;

  function selectedObject() {
    return view.farm.placed.find(object => object.id === view.selectedObjectId) || null;
  }

  function announce(message) {
    elements.status.textContent = message;
  }

  function saveFarm(message) {
    const saved = Data.save(view.farm);
    elements.saveStatus.textContent = saved ? 'Saved on this device' : 'Changes could not be saved';
    announce(saved ? message : `${message} Storage is unavailable, so this change is temporary.`);
  }

  function itemSize(definition) {
    return `${definition.width} × ${definition.height}`;
  }

  function renderInventory() {
    const ownedItems = Object.values(Data.catalog).filter(definition =>
      (view.farm.inventory[definition.type] || 0) > 0
    );
    elements.inventory.innerHTML = ownedItems.map(definition => {
      const count = view.farm.inventory[definition.type] || 0;
      const active = view.mode === 'build' && view.selectedType === definition.type;
      return `
        <button class="inventory-item${active ? ' is-selected' : ''}" type="button"
          data-inventory-type="${definition.type}" ${count < 1 ? 'disabled' : ''}
          aria-pressed="${active}">
          <span class="inventory-item__icon" aria-hidden="true">${definition.icon}</span>
          <span><strong>${definition.name}</strong><small>${itemSize(definition)} grid cells</small></span>
          <b aria-label="${count} in storage">${count}</b>
        </button>`;
    }).join('') || '<p class="empty-list">Storage is empty. Visit the Shop to buy an item.</p>';
  }

  function renderShop() {
    elements.shop.innerHTML = Object.values(Data.catalog).map(definition => {
      const affordable = view.farm.coins >= definition.price;
      return `
        <article class="shop-item">
          <span class="shop-item__icon" aria-hidden="true">${definition.icon}</span>
          <span><strong>${definition.name}</strong><small>${itemSize(definition)} grid cells</small></span>
          <button type="button" data-shop-type="${definition.type}" ${affordable ? '' : 'disabled'}
            aria-label="Buy ${definition.name} for ${definition.price} farm coins">
            <span class="shop-coin-icon" aria-hidden="true">🪙</span> ${definition.price}
          </button>
        </article>`;
    }).join('');
  }

  function renderPlacedList() {
    elements.placed.innerHTML = view.farm.placed.map(object => {
      const definition = Data.catalog[object.type];
      const selected = object.id === view.selectedObjectId;
      return `
        <button type="button" data-object-id="${object.id}" class="${selected ? 'is-selected' : ''}"
          aria-pressed="${selected}">
          <span aria-hidden="true">${definition.icon}</span>
          <span>${definition.name}<small>Column ${object.x + 1}, row ${object.y + 1}</small></span>
        </button>`;
    }).join('');
  }

  function renderControls() {
    const object = selectedObject();
    const active = view.mode !== 'view';
    elements.coins.textContent = view.farm.coins.toLocaleString();
    elements.mode.textContent = view.mode === 'view' ? 'Viewing' : view.mode === 'move' ? 'Moving' : 'Placing';
    elements.storage.setAttribute('aria-pressed', String(view.activePanel === 'storage'));
    elements.shopButton.setAttribute('aria-pressed', String(view.activePanel === 'shop'));
    elements.remove.disabled = !object || active;
    elements.inventoryPanel.hidden = view.activePanel !== 'storage';
    elements.shopPanel.hidden = view.activePanel !== 'shop';
  }

  function render() {
    renderer.render(view);
    renderInventory();
    renderShop();
    renderPlacedList();
    renderControls();
  }

  function cancel() {
    const hadAction = view.mode !== 'view' || view.activePanel !== null;
    view.mode = 'view';
    view.selectedType = selectedObject()?.type || null;
    view.preview = null;
    view.activePanel = null;
    if (hadAction) announce('Action stopped. Your farm was not changed.');
    render();
  }

  function openStorage() {
    view.mode = 'view';
    view.selectedType = selectedObject()?.type || null;
    view.preview = null;
    view.activePanel = 'storage';
    announce('Storage opened. Select an existing farm object, or choose a stored item to place.');
    render();
    elements.inventoryPanel.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest'
    });
  }

  function openShop() {
    view.mode = 'view';
    view.preview = null;
    view.activePanel = 'shop';
    announce('Choose an item to buy. Purchases are added to Storage.');
    render();
    elements.shopPanel.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest'
    });
  }

  function chooseInventory(type) {
    if (view.activePanel !== 'storage' || !Data.catalog[type] || view.farm.inventory[type] < 1) return;
    view.mode = 'build';
    view.selectedObjectId = null;
    view.selectedType = type;
    view.preview = null;
    announce(`${Data.catalog[type].name} selected. Double-tap or double-click a valid position.`);
    render();
    canvas.focus({ preventScroll: true });
  }

  function beginMove() {
    const object = selectedObject();
    if (!object) return;
    view.mode = 'move';
    view.selectedType = object.type;
    view.preview = { x: object.x, y: object.y, valid: true, reason: 'Current position.' };
    if (view.activePanel !== 'storage') view.activePanel = null;
    announce(`Moving ${Data.catalog[object.type].name}. Double-tap or double-click its new position.`);
    render();
    canvas.focus({ preventScroll: true });
  }

  function storeSelected() {
    const object = selectedObject();
    if (!object || view.mode !== 'view') return;
    view.farm.placed = view.farm.placed.filter(item => item.id !== object.id);
    view.farm.inventory[object.type] = (view.farm.inventory[object.type] || 0) + 1;
    view.selectedObjectId = null;
    view.selectedType = null;
    view.preview = null;
    saveFarm(`${Data.catalog[object.type].name} removed from the farm and returned to Storage.`);
    render();
  }

  function buyItem(type) {
    const definition = Data.catalog[type];
    if (!definition || view.farm.coins < definition.price) {
      announce('You do not have enough farm coins for that item.');
      return;
    }
    if ((view.farm.inventory[type] || 0) >= 999) {
      announce(`${definition.name} storage is full.`);
      return;
    }
    view.farm.coins -= definition.price;
    view.farm.inventory[type] = (view.farm.inventory[type] || 0) + 1;
    saveFarm(`${definition.name} purchased and added to Storage.`);
    render();
  }

  function setPreview(position) {
    if (view.mode === 'view' || !view.selectedType || !position) return;
    const result = Placement.check(
      view.farm.placed,
      view.selectedType,
      position.x,
      position.y,
      view.mode === 'move' ? view.selectedObjectId : null
    );
    view.preview = { ...position, ...result };
    announce(`${Data.catalog[view.selectedType].name}: column ${position.x + 1}, row ${position.y + 1}. ${result.reason}`);
    render();
  }

  function confirmPlacement() {
    if (view.mode === 'view' || !view.preview?.valid || !view.selectedType) return;
    const definition = Data.catalog[view.selectedType];
    if (view.mode === 'build') {
      if (view.farm.inventory[view.selectedType] < 1) {
        announce(`${definition.name} is no longer available in storage.`);
        return;
      }
      const object = {
        id: Data.createObjectId(view.selectedType),
        type: view.selectedType,
        x: view.preview.x,
        y: view.preview.y
      };
      view.farm.inventory[view.selectedType]--;
      view.farm.placed.push(object);
      view.selectedObjectId = object.id;
    } else {
      const object = selectedObject();
      if (!object) return;
      object.x = view.preview.x;
      object.y = view.preview.y;
    }
    view.mode = 'view';
    view.preview = null;
    view.selectedType = selectedObject()?.type || null;
    saveFarm(`${definition.name} placed on your farm.`);
    render();
  }

  function selectObject(id) {
    if (view.mode !== 'view') return;
    const object = view.farm.placed.find(item => item.id === id);
    view.selectedObjectId = object?.id || null;
    view.selectedType = object?.type || null;
    view.preview = null;
    announce(object
      ? `${Data.catalog[object.type].name} selected. Double-tap or double-click it to move the object, or choose Remove to send it back to Storage.`
      : 'No object selected.');
    render();
  }

  function matchesLastCanvasAction(key, now) {
    const matches = lastCanvasAction
      && lastCanvasAction.key === key
      && lastCanvasAction.mode === view.mode
      && now - lastCanvasAction.time <= DOUBLE_ACTIVATION_MS;
    lastCanvasAction = { key, mode: view.mode, time: now };
    return matches;
  }

  function handleCanvasActivation(event) {
    event.preventDefault();
    const position = Placement.gridPosition(canvas, event.clientX, event.clientY);
    if (!position) return;
    const now = performance.now();

    if (view.mode === 'view') {
      const object = Placement.objectAt(view.farm.placed, position.x, position.y);
      const matchesPrevious = matchesLastCanvasAction(`object:${object?.id || 'empty'}`, now);
      const isDoubleActivation = object && matchesPrevious;
      selectObject(object?.id);
      if (isDoubleActivation) {
        lastCanvasAction = null;
        beginMove();
      }
      return;
    }

    const destinationKey = `destination:${position.x}:${position.y}`;
    const isDoubleActivation = matchesLastCanvasAction(destinationKey, now);
    setPreview(position);
    if (isDoubleActivation && view.preview?.valid) {
      lastCanvasAction = null;
      confirmPlacement();
    }
  }

  elements.storage.addEventListener('click', () => {
    if (view.activePanel === 'storage' || view.mode !== 'view') cancel();
    else openStorage();
  });
  elements.shopButton.addEventListener('click', () => {
    if (view.activePanel === 'shop') cancel();
    else openShop();
  });
  elements.remove.addEventListener('click', storeSelected);

  elements.inventory.addEventListener('click', event => {
    const button = event.target.closest('[data-inventory-type]');
    if (button) chooseInventory(button.dataset.inventoryType);
  });

  elements.shop.addEventListener('click', event => {
    const button = event.target.closest('[data-shop-type]');
    if (button) buyItem(button.dataset.shopType);
  });

  elements.placed.addEventListener('click', event => {
    const button = event.target.closest('[data-object-id]');
    if (button) selectObject(button.dataset.objectId);
  });

  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || view.mode === 'view' || !view.selectedType) return;
    setPreview(Placement.gridPosition(canvas, event.clientX, event.clientY));
  });

  canvas.addEventListener('click', handleCanvasActivation);
  canvas.addEventListener('dblclick', event => event.preventDefault());

  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape' && view.mode !== 'view') {
      event.preventDefault();
      cancel();
      return;
    }
    if (view.mode === 'view' || !view.selectedType) return;
    if (event.key === 'Enter' && view.preview?.valid) {
      event.preventDefault();
      confirmPlacement();
      return;
    }
    const movement = {
      ArrowUp: [0, -1],
      ArrowRight: [1, 0],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0]
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    const current = view.preview || { x: 0, y: 0 };
    setPreview({
      x: Math.max(0, Math.min(Data.grid.columns - 1, current.x + movement[0])),
      y: Math.max(0, Math.min(Data.grid.rows - 1, current.y + movement[1]))
    });
  });

  window.addEventListener('resize', () => renderer.render(view));
  announce('Farm loaded. Double-tap or double-click an object to move it, or enter Build mode.');
  elements.saveStatus.textContent = initialSaveSucceeded ? 'Saved on this device' : 'Storage is unavailable';
  render();
})();
