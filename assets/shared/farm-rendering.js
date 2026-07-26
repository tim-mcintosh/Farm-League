(() => {
  function tileHash(x, y, salt = 0) {
    const value = Math.imul(x + salt * 17, 73856093) ^ Math.imul(y - salt * 31, 19349663);
    return (value >>> 0) / 4294967295;
  }

  function drawCleanArcadeGrassTile(context, screen, tileX, tileY, tileSize, cut = false) {
    const uncutColors = ['#6eaa36', '#72ad38', '#75af3a'];
    const cutColors = ['#b2c761', '#b7cc66', '#adc25d'];
    const colors = cut ? cutColors : uncutColors;
    const colorIndex = Math.floor(tileHash(tileX, tileY) * colors.length);
    context.fillStyle = colors[colorIndex];
    context.fillRect(screen.x, screen.y, tileSize + 1, tileSize + 1);

    if (cut) {
      context.fillStyle = 'rgba(246, 234, 147, .14)';
      context.fillRect(screen.x + tileSize * .07, screen.y, tileSize * .21, tileSize + 1);
      context.fillStyle = 'rgba(67, 109, 41, .1)';
      context.fillRect(screen.x + tileSize * .71, screen.y, tileSize * .18, tileSize + 1);
      const clippingX = screen.x + tileSize * (.29 + tileHash(tileX, tileY, 3) * .43);
      const clippingY = screen.y + tileSize * (.29 + tileHash(tileY, tileX, 5) * .43);
      context.strokeStyle = 'rgba(83, 105, 46, .22)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(clippingX - 2, clippingY);
      context.lineTo(clippingX + 3, clippingY - 1);
      context.stroke();
      return;
    }

    if (tileHash(tileX, tileY, 9) < .72) return;
    const x = screen.x + tileSize * (.25 + tileHash(tileX, tileY, 1) * .5);
    const baseY = screen.y + tileSize * (.57 + tileHash(tileY, tileX, 7) * .25);
    const height = tileSize * (.21 + tileHash(tileX, tileY, 11) * .14);
    context.strokeStyle = 'rgba(43, 121, 42, .45)';
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(x, baseY);
    context.quadraticCurveTo(x - 2, baseY - height * .5, x - 1, baseY - height);
    context.moveTo(x, baseY);
    context.quadraticCurveTo(x + 2, baseY - height * .48, x + 3, baseY - height * .78);
    context.moveTo(x, baseY);
    context.lineTo(x, baseY - height * .72);
    context.stroke();
  }

  function drawFarmFenceSegment(context, x1, y1, x2, y2) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!length) return;
    const normalX = -(y2 - y1) / length;
    const normalY = (x2 - x1) / length;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    context.lineCap = 'round';
    for (const offset of [-5, 5]) {
      const startX = x1 + normalX * offset;
      const startY = y1 + normalY * offset;
      const endX = x2 + normalX * offset;
      const endY = y2 + normalY * offset;

      context.strokeStyle = 'rgba(42, 29, 16, .28)';
      context.lineWidth = 10;
      context.beginPath();
      context.moveTo(startX + 3, startY + 4);
      context.lineTo(endX + 3, endY + 4);
      context.stroke();

      context.strokeStyle = '#6b421f';
      context.lineWidth = 9;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();

      context.strokeStyle = '#bd7d38';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(startX, startY - 1);
      context.lineTo(endX, endY - 1);
      context.stroke();

      context.strokeStyle = 'rgba(244, 189, 102, .55)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(startX, startY - 2);
      context.lineTo(endX, endY - 2);
      context.stroke();
    }

    const posts = Math.max(1, Math.floor(length / 46));
    for (let index = 0; index <= posts; index++) {
      const amount = index / posts;
      const x = x1 + (x2 - x1) * amount;
      const y = y1 + (y2 - y1) * amount;
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.fillStyle = 'rgba(38, 27, 16, .3)';
      context.fillRect(-6, -8, 16, 20);
      context.fillStyle = '#5c351a';
      context.fillRect(-8, -10, 16, 20);
      context.fillStyle = '#a9672d';
      context.fillRect(-5, -8, 10, 16);
      context.fillStyle = '#dfa45d';
      context.fillRect(-4, -8, 8, 3);
      context.fillStyle = 'rgba(76, 39, 16, .5)';
      context.fillRect(-2, -5, 2, 10);
      context.restore();
    }
  }

  window.FARM_RENDERING = Object.freeze({
    drawCleanArcadeGrassTile,
    drawFarmFenceSegment
  });
})();
