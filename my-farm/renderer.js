(() => {
  'use strict';

  const { catalog, grid } = window.MyFarmData;
  const WIDTH = 1200;
  const HEIGHT = 800;
  const CELL_WIDTH = WIDTH / grid.columns;
  const CELL_HEIGHT = HEIGHT / grid.rows;
  const SPRITE_PATHS = Object.freeze({
    farmhouse: 'assets/small-farmhouse-top-down.png',
    barn: 'assets/barn-top-down.png',
    garden: 'assets/garden-patch-top-down.png',
    pond: 'assets/pond-top-down.png',
    coop: 'assets/chicken-coop-top-down.png',
    windmill: 'assets/windmill-top-down.png',
    tree: 'assets/tree-top-down.png',
    fence: 'assets/fence-top-down.png',
    stone: 'assets/stone-top-down.png',
    mailbox: 'assets/mailbox-top-down.png',
    cow: 'assets/cow-top-down.png',
    horse: 'assets/horse-top-down.png',
    rabbit: 'assets/rabbit-top-down.png',
    crow: 'assets/crow-top-down.png',
    sheep: 'assets/sheep-top-down.png',
    chicken: 'assets/chicken-top-down.png',
    dog: 'assets/farm-dog-top-down.png',
    tractor: 'assets/tractor-top-down.png',
    deliveryTruck: 'assets/delivery-truck-top-down.png',
    hayBale: 'assets/hay-bale-top-down.png'
  });
  const SPRITE_SCALES = Object.freeze({
    farmhouse: .92,
    barn: .92,
    garden: .9,
    pond: .88,
    coop: .9,
    windmill: .86,
    tree: .82,
    fence: .92,
    stone: .56,
    mailbox: .72,
    cow: .82,
    horse: .8,
    rabbit: .68,
    crow: .55,
    sheep: .74,
    chicken: .62,
    dog: .7,
    tractor: .84,
    deliveryTruck: .88,
    hayBale: .58
  });

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function drawFarmGround(context) {
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#84bd58');
    gradient.addColorStop(1, '#659e43');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.strokeStyle = 'rgba(39, 101, 45, .18)';
    context.lineWidth = 3;
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const x = column * CELL_WIDTH;
        const y = row * CELL_HEIGHT;
        const offset = ((row * 17 + column * 11) % 24) - 12;
        context.beginPath();
        context.moveTo(x + 24 + offset * .25, y + 76);
        context.quadraticCurveTo(x + 28, y + 54, x + 34 + offset * .2, y + 38);
        context.stroke();
      }
    }

    context.strokeStyle = '#b17a3c';
    context.lineWidth = 9;
    context.setLineDash([34, 9]);
    context.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);
    context.setLineDash([]);
    context.strokeStyle = '#6b4829';
    context.lineWidth = 3;
    context.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);
  }

  function drawGrid(context) {
    context.save();
    context.strokeStyle = 'rgba(238, 255, 220, .22)';
    context.lineWidth = 2;
    context.setLineDash([7, 8]);
    for (let column = 1; column < grid.columns; column++) {
      const x = column * CELL_WIDTH;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, HEIGHT);
      context.stroke();
    }
    for (let row = 1; row < grid.rows; row++) {
      const y = row * CELL_HEIGHT;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(WIDTH, y);
      context.stroke();
    }
    context.restore();
  }

  function drawBuilding(context, x, y, width, height, colors, kind) {
    context.fillStyle = 'rgba(31, 55, 31, .24)';
    roundedRect(context, x + 12, y + height - 16, width - 24, 28, 14);
    context.fill();

    context.fillStyle = colors.wall;
    roundedRect(context, x + 13, y + height * .28, width - 26, height * .62, 10);
    context.fill();
    context.strokeStyle = colors.trim;
    context.lineWidth = 7;
    context.stroke();

    context.fillStyle = colors.roof;
    context.beginPath();
    context.moveTo(x + 2, y + height * .36);
    context.lineTo(x + width / 2, y + 5);
    context.lineTo(x + width - 2, y + height * .36);
    context.closePath();
    context.fill();
    context.strokeStyle = colors.roofEdge;
    context.lineWidth = 7;
    context.stroke();

    context.fillStyle = colors.door;
    const doorWidth = kind === 'barn' ? width * .25 : width * .16;
    context.fillRect(x + width / 2 - doorWidth / 2, y + height * .55, doorWidth, height * .35);
    context.strokeStyle = colors.trim;
    context.lineWidth = 4;
    context.strokeRect(x + width / 2 - doorWidth / 2, y + height * .55, doorWidth, height * .35);

    context.fillStyle = '#bde7ee';
    const windowSize = Math.min(38, width * .13);
    for (const windowX of [x + width * .25, x + width * .75]) {
      context.fillRect(windowX - windowSize / 2, y + height * .5, windowSize, windowSize);
      context.strokeRect(windowX - windowSize / 2, y + height * .5, windowSize, windowSize);
    }

    if (kind === 'barn') {
      context.strokeStyle = '#fff1d2';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(x + width / 2 - doorWidth / 2, y + height * .55);
      context.lineTo(x + width / 2 + doorWidth / 2, y + height * .9);
      context.moveTo(x + width / 2 + doorWidth / 2, y + height * .55);
      context.lineTo(x + width / 2 - doorWidth / 2, y + height * .9);
      context.stroke();
    }
  }

  function drawTree(context, x, y, width, height) {
    context.fillStyle = 'rgba(35, 58, 32, .25)';
    context.beginPath();
    context.ellipse(x + width / 2, y + height * .82, width * .32, height * .12, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#744824';
    roundedRect(context, x + width * .43, y + height * .48, width * .14, height * .36, 6);
    context.fill();
    for (const [dx, dy, radius, color] of [
      [.35, .34, .27, '#3f8e45'],
      [.63, .34, .28, '#4d9f4d'],
      [.5, .18, .31, '#5aaa50'],
      [.5, .44, .3, '#39823e']
    ]) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x + width * dx, y + height * dy, width * radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawGarden(context, x, y, width, height) {
    context.fillStyle = '#6f4d2f';
    roundedRect(context, x + 10, y + 12, width - 20, height - 24, 16);
    context.fill();
    context.strokeStyle = '#bb8350';
    context.lineWidth = 9;
    context.stroke();
    const colors = ['#ef6646', '#f6c94b', '#65b94e'];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        const px = x + 34 + column * (width - 68) / 3;
        const py = y + 38 + row * (height - 76) / 2;
        context.fillStyle = colors[(row + column) % colors.length];
        context.beginPath();
        context.arc(px, py, 12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#3f8f3e';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(px, py - 7);
        context.lineTo(px - 5, py - 17);
        context.moveTo(px, py - 7);
        context.lineTo(px + 7, py - 15);
        context.stroke();
      }
    }
  }

  function drawPond(context, x, y, width, height) {
    context.fillStyle = 'rgba(35, 57, 31, .24)';
    context.beginPath();
    context.ellipse(x + width / 2, y + height * .56, width * .48, height * .4, -.08, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#67b9cf';
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, width * .43, height * .38, -.08, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#d0bd7b';
    context.lineWidth = 12;
    context.stroke();
    context.strokeStyle = 'rgba(255,255,255,.5)';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(x + width * .46, y + height * .48, width * .18, .2, 2.1);
    context.stroke();
    context.fillStyle = '#5da94a';
    for (const [px, py] of [[.25, .32], [.72, .66], [.62, .3]]) {
      context.beginPath();
      context.ellipse(x + width * px, y + height * py, 14, 8, .3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCoop(context, x, y, width, height) {
    context.fillStyle = '#ba743d';
    roundedRect(context, x + 20, y + 30, width - 40, height - 40, 8);
    context.fill();
    context.strokeStyle = '#fff0cf';
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#733c28';
    context.beginPath();
    context.moveTo(x + 10, y + 38);
    context.lineTo(x + width / 2, y + 4);
    context.lineTo(x + width - 10, y + 38);
    context.closePath();
    context.fill();
    context.fillStyle = '#332318';
    context.beginPath();
    context.arc(x + width / 2, y + 62, 18, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f4d256';
    context.font = 'bold 30px system-ui';
    context.textAlign = 'center';
    context.fillText('🐔', x + width * .74, y + height * .78);
  }

  function drawWindmill(context, x, y, width, height) {
    const centreX = x + width / 2;
    const centreY = y + height * .31;
    context.strokeStyle = '#6d5945';
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(centreX, centreY);
    context.lineTo(x + width * .24, y + height * .92);
    context.moveTo(centreX, centreY);
    context.lineTo(x + width * .76, y + height * .92);
    context.moveTo(x + width * .33, y + height * .68);
    context.lineTo(x + width * .67, y + height * .68);
    context.stroke();
    context.save();
    context.translate(centreX, centreY);
    context.strokeStyle = '#d7d0b3';
    context.lineWidth = 10;
    for (let index = 0; index < 6; index++) {
      context.rotate(Math.PI / 3);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -width * .42);
      context.stroke();
    }
    context.fillStyle = '#85582e';
    context.beginPath();
    context.arc(0, 0, 13, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawFence(context, x, y, width, height) {
    context.strokeStyle = '#70401f';
    context.lineWidth = 10;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x + 18, y + 18);
    context.lineTo(x + 18, y + height - 16);
    context.moveTo(x + width - 18, y + 18);
    context.lineTo(x + width - 18, y + height - 16);
    context.moveTo(x + 13, y + height * .4);
    context.lineTo(x + width - 13, y + height * .34);
    context.moveTo(x + 13, y + height * .7);
    context.lineTo(x + width - 13, y + height * .64);
    context.stroke();
    context.strokeStyle = '#bd8144';
    context.lineWidth = 5;
    context.stroke();
  }

  function drawStone(context, x, y, width, height) {
    context.fillStyle = 'rgba(35, 58, 32, .22)';
    context.beginPath();
    context.ellipse(x + width * .5, y + height * .78, width * .36, height * .12, 0, 0, Math.PI * 2);
    context.fill();

    const gradient = context.createLinearGradient(x + width * .25, y + height * .24, x + width * .72, y + height * .76);
    gradient.addColorStop(0, '#aeb6ad');
    gradient.addColorStop(1, '#65706b');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(x + width * .18, y + height * .68);
    context.lineTo(x + width * .28, y + height * .35);
    context.lineTo(x + width * .48, y + height * .18);
    context.lineTo(x + width * .72, y + height * .28);
    context.lineTo(x + width * .84, y + height * .62);
    context.lineTo(x + width * .69, y + height * .78);
    context.lineTo(x + width * .32, y + height * .79);
    context.closePath();
    context.fill();
    context.strokeStyle = '#4f5a56';
    context.lineWidth = 5;
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, .34)';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + width * .36, y + height * .37);
    context.lineTo(x + width * .5, y + height * .27);
    context.lineTo(x + width * .65, y + height * .35);
    context.stroke();
  }

  function drawMailbox(context, x, y, width, height) {
    context.fillStyle = 'rgba(35, 58, 32, .22)';
    context.beginPath();
    context.ellipse(x + width * .5, y + height * .86, width * .28, height * .09, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#754a29';
    roundedRect(context, x + width * .45, y + height * .46, width * .12, height * .4, 4);
    context.fill();
    context.fillStyle = '#3b7652';
    roundedRect(context, x + width * .2, y + height * .2, width * .62, height * .38, 12);
    context.fill();
    context.strokeStyle = '#234a35';
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#e7e6cf';
    context.fillRect(x + width * .22, y + height * .34, width * .18, height * .08);
    context.fillStyle = '#d94e3e';
    context.fillRect(x + width * .72, y + height * .14, width * .07, height * .34);
    context.beginPath();
    context.moveTo(x + width * .72, y + height * .14);
    context.lineTo(x + width * .55, y + height * .14);
    context.lineTo(x + width * .55, y + height * .27);
    context.lineTo(x + width * .72, y + height * .27);
    context.closePath();
    context.fill();
  }

  function drawSprite(context, image, x, y, width, height, visualScale = 1) {
    if (!image?.complete || image.naturalWidth < 1) return false;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight) * visualScale;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    return true;
  }

  function drawObject(context, object, selected, sprites) {
    const definition = catalog[object.type];
    if (!definition) return;
    const x = object.x * CELL_WIDTH + 5;
    const y = object.y * CELL_HEIGHT + 5;
    const width = definition.width * CELL_WIDTH - 10;
    const height = definition.height * CELL_HEIGHT - 10;

    if (drawSprite(context, sprites[object.type], x, y, width, height, SPRITE_SCALES[object.type])) {
      // Approved artwork replaces the temporary canvas drawing when loaded.
    } else if (object.type === 'farmhouse') {
      drawBuilding(context, x, y, width, height, {
        wall: '#f0d49b', trim: '#6e4a2d', roof: '#315d3a', roofEdge: '#203e29', door: '#8a4e2e'
      }, 'house');
    } else if (object.type === 'barn') {
      drawBuilding(context, x, y, width, height, {
        wall: '#b94437', trim: '#fff1d2', roof: '#493b34', roofEdge: '#28221f', door: '#763129'
      }, 'barn');
    } else if (object.type === 'garden') {
      drawGarden(context, x, y, width, height);
    } else if (object.type === 'pond') {
      drawPond(context, x, y, width, height);
    } else if (object.type === 'coop') {
      drawCoop(context, x, y, width, height);
    } else if (object.type === 'windmill') {
      drawWindmill(context, x, y, width, height);
    } else if (object.type === 'tree') {
      drawTree(context, x, y, width, height);
    } else if (object.type === 'fence') {
      drawFence(context, x, y, width, height);
    } else if (object.type === 'stone') {
      drawStone(context, x, y, width, height);
    } else if (object.type === 'mailbox') {
      drawMailbox(context, x, y, width, height);
    }

    if (selected) {
      context.save();
      context.strokeStyle = '#fff7ad';
      context.lineWidth = 6;
      context.setLineDash([16, 9]);
      roundedRect(context, x - 2, y - 2, width + 4, height + 4, 14);
      context.stroke();
      context.restore();
    }
  }

  function drawPreview(context, preview, type) {
    if (!preview || !catalog[type]) return;
    const definition = catalog[type];
    const x = preview.x * CELL_WIDTH;
    const y = preview.y * CELL_HEIGHT;
    const width = definition.width * CELL_WIDTH;
    const height = definition.height * CELL_HEIGHT;
    context.save();
    context.fillStyle = preview.valid ? 'rgba(170, 238, 78, .3)' : 'rgba(244, 86, 71, .33)';
    context.strokeStyle = preview.valid ? '#dcff93' : '#ff8d80';
    context.lineWidth = 8;
    context.setLineDash([18, 10]);
    roundedRect(context, x + 5, y + 5, width - 10, height - 10, 14);
    context.fill();
    context.stroke();
    context.fillStyle = '#fff';
    context.font = '900 34px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(preview.valid ? '✓' : '×', x + width / 2, y + height / 2);
    context.restore();
  }

  function create(canvas) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    const sprites = Object.fromEntries(Object.entries(SPRITE_PATHS).map(([type, path]) => {
      const image = new Image();
      image.src = path;
      return [type, image];
    }));
    let lastFrame = null;

    function render(frame) {
      lastFrame = frame;
      const { farm, mode, selectedObjectId, selectedType, preview } = frame;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      drawFarmGround(context);
      if (mode !== 'view') drawGrid(context);
      const hiddenId = mode === 'move' ? selectedObjectId : null;
      farm.placed
        .filter(object => object.id !== hiddenId)
        .sort((first, second) => (first.y + catalog[first.type].height) - (second.y + catalog[second.type].height))
        .forEach(object => drawObject(context, object, mode === 'view' && object.id === selectedObjectId, sprites));
      if (mode === 'move') {
        const selected = farm.placed.find(object => object.id === selectedObjectId);
        if (selected && !preview) drawObject(context, selected, true, sprites);
      }
      if (mode !== 'view') drawPreview(context, preview, selectedType);
    }

    Object.values(sprites).forEach(image => {
      image.addEventListener('load', () => {
        if (lastFrame) render(lastFrame);
      });
    });

    return Object.freeze({ render, width: WIDTH, height: HEIGHT });
  }

  window.MyFarmRenderer = Object.freeze({ create });
})();
