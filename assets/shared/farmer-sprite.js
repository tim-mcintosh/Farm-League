(function initialiseFarmerSprite() {
  const image = new Image();
  image.src = '../../assets/shared/game-sprites/farmer-top-down.png';

  function drawLocal(context, step, size = 50) {
    if (!image.complete || image.naturalWidth <= 0) return false;

    const sourceSize = image.naturalWidth;
    const stride = Math.sin(step) * 2;
    const armSwing = Math.sin(step) * 1.25;
    const bodyEnd = Math.round(sourceSize * .76);
    const bootStart = Math.round(sourceSize * .68);
    const upperBootY = Math.round(sourceSize * .18);
    const lowerBootY = Math.round(sourceSize * .49);
    const bootHeight = Math.round(sourceSize * .34);
    const armStart = Math.round(sourceSize * .36);
    const armWidth = Math.round(sourceSize * .39);
    const armHeight = Math.round(sourceSize * .34);
    const lowerArmY = sourceSize - armHeight;
    const scale = size / sourceSize;
    const x = -size / 2;
    const y = -size / 2;

    context.drawImage(image, 0, 0, bodyEnd, sourceSize, x, y, bodyEnd * scale, size);
    context.drawImage(
      image,
      armStart, 0, armWidth, armHeight,
      x + armStart * scale + armSwing, y,
      armWidth * scale, armHeight * scale
    );
    context.drawImage(
      image,
      armStart, lowerArmY, armWidth, armHeight,
      x + armStart * scale - armSwing, y + lowerArmY * scale,
      armWidth * scale, armHeight * scale
    );
    context.drawImage(
      image,
      bootStart, upperBootY, sourceSize - bootStart, bootHeight,
      x + bootStart * scale + stride, y + upperBootY * scale,
      (sourceSize - bootStart) * scale, bootHeight * scale
    );
    context.drawImage(
      image,
      bootStart, lowerBootY, sourceSize - bootStart, bootHeight,
      x + bootStart * scale - stride, y + lowerBootY * scale,
      (sourceSize - bootStart) * scale, bootHeight * scale
    );
    return true;
  }

  window.FARM_LEAGUE_FARMER = Object.freeze({ drawLocal });
})();
