window.FenceFrenzyRenderer = (() => {
  const CONFIG = window.FENCE_FRENZY_CONFIG;
  const cropColours = {
    seed: '#745236',
    growing: '#58a94d',
    ready: '#f0c84a',
    overripe: '#df8738',
    dead: '#806b50'
  };

  // Canvas rendering is stateless: every frame is derived entirely from the supplied game state.
  function drawGrass(context, time) {
    context.fillStyle = '#70aa51';
    context.fillRect(0, 0, CONFIG.arena.width, CONFIG.arena.height);
    context.strokeStyle = 'rgba(40, 111, 48, .25)';
    context.lineWidth = 1.4;
    for (let y = 16; y < 500; y += 36) {
      for (let x = 12 + (y % 3) * 6; x < CONFIG.arena.width; x += 44) {
        const sway = Math.sin(time * 1.5 + x * .08 + y * .05) * 2;
        context.beginPath();
        context.moveTo(x, y + 8);
        context.lineTo(x + sway, y);
        context.stroke();
      }
    }
  }

  function drawFieldGround(context, field, expansionPulse) {
    const padding = 12 + expansionPulse * 5;
    context.fillStyle = 'rgba(68, 111, 45, .28)';
    context.fillRect(field.left - padding, field.top - padding, field.width + padding * 2, field.height + padding * 2);
    context.fillStyle = '#9b7a4c';
    context.fillRect(field.left, field.top, field.width, field.height);
    context.fillStyle = 'rgba(239, 205, 126, .14)';
    for (let y = field.top + 12; y < field.bottom; y += 21) {
      context.fillRect(field.left + 5, y, field.width - 10, 2);
    }
  }

  function drawCrop(context, crop, time) {
    const pulse = crop.spawnScale ?? 1;
    const sway = Math.sin(time * 2 + crop.x * .04 + crop.y * .03) * (crop.stage === 'dead' ? .5 : 2);
    context.save();
    context.translate(crop.x, crop.y);
    context.scale(pulse, pulse);

    context.fillStyle = 'rgba(53, 37, 24, .18)';
    context.beginPath();
    context.ellipse(0, 10, 15, 6, 0, 0, Math.PI * 2);
    context.fill();

    if (crop.stage === 'seed') {
      context.fillStyle = cropColours.seed;
      context.beginPath();
      context.arc(0, 5, 4, 0, Math.PI * 2);
      context.fill();
    } else if (crop.stage === 'dead') {
      context.strokeStyle = cropColours.dead;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-7, 7);
      context.lineTo(0, -7);
      context.lineTo(7, 7);
      context.stroke();
    } else {
      const height = crop.stage === 'growing' ? 15 : 23;
      context.strokeStyle = '#397c3f';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(0, 9);
      context.lineTo(sway, 9 - height);
      context.stroke();
      context.fillStyle = cropColours[crop.stage];
      const headY = 7 - height;
      for (const [dx, dy] of [[0, 0], [-6, 3], [6, 3], [-4, -4], [4, -4]]) {
        context.beginPath();
        context.arc(sway + dx, headY + dy, crop.stage === 'growing' ? 3 : 5, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = '#4d9448';
      context.beginPath();
      context.ellipse(-5, -2, 8, 3, -.5, 0, Math.PI * 2);
      context.ellipse(6, 1, 8, 3, .5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawFence(context, fence, level) {
    const ratio = fence.maxHealth ? fence.health / fence.maxHealth : 0;
    const damaged = ratio < .66;
    const badlyDamaged = ratio < .33;
    const x1 = fence.x1;
    const y1 = fence.y1;
    const x2 = fence.x2;
    const y2 = fence.y2;
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const railOffsets = level === 1 ? [0] : level === 2 ? [-4, 4] : [-6, 0, 6];
    const timberDark = level === 1 ? '#563522' : level === 2 ? '#473729' : '#33434a';
    const timberLight = level === 1 ? '#c28a4e' : level === 2 ? '#d7a45e' : '#8fb1b9';

    context.lineCap = 'round';
    if (!fence.broken) {
      railOffsets.forEach(offset => {
        const offsetX = horizontal ? 0 : offset;
        const offsetY = horizontal ? offset : 0;
        context.strokeStyle = damaged ? '#563522' : timberDark;
        context.lineWidth = level === 1 ? 11 : 7;
        context.beginPath();
        context.moveTo(x1 + offsetX, y1 + offsetY);
        context.lineTo(x2 + offsetX, y2 + offsetY);
        context.stroke();
        context.strokeStyle = badlyDamaged ? '#9e5a3f' : damaged ? '#ad7145' : timberLight;
        context.lineWidth = level === 1 ? 6 : 4;
        context.beginPath();
        context.moveTo(x1 + offsetX, y1 + offsetY);
        context.lineTo(x2 + offsetX, y2 + offsetY);
        context.stroke();
      });
      if (damaged) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        context.strokeStyle = '#3d281d';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(midX - 5, midY - 6);
        context.lineTo(midX + 4, midY + 5);
        context.lineTo(midX - 2, midY + 10);
        context.stroke();
      }
    } else {
      context.strokeStyle = '#70462b';
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x1 + (x2 - x1) * .28, y1 + (y2 - y1) * .28 + 8);
      context.moveTo(x2, y2);
      context.lineTo(x1 + (x2 - x1) * .72, y1 + (y2 - y1) * .72 - 8);
      context.stroke();
    }

    for (const amount of [0, 1]) {
      const x = x1 + (x2 - x1) * amount;
      const y = y1 + (y2 - y1) * amount;
      const postRadius = 6 + level;
      context.fillStyle = timberDark;
      context.beginPath();
      context.arc(x + 2, y + 3, postRadius + 1, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = timberLight;
      context.beginPath();
      context.arc(x, y, postRadius, 0, Math.PI * 2);
      context.fill();
      if (level === 3) {
        context.fillStyle = '#d9ebee';
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawStation(context, station) {
    context.fillStyle = station.type === 'dog' ? '#315d45' : '#5a4b3d';
    context.beginPath();
    context.roundRect(station.x, station.y, station.width, station.height, 12);
    context.fill();
    context.strokeStyle = station.ready ? '#d9f598' : 'rgba(255,255,255,.18)';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#fff';
    context.font = '22px system-ui';
    context.textAlign = 'center';
    context.fillText(station.type === 'dog' ? '🐕' : '🧱', station.x + station.width / 2, station.y + 26);
    context.font = 'bold 11px system-ui';
    context.fillText(station.label, station.x + station.width / 2, station.y + 44);
    context.fillStyle = station.maxed ? '#b4ed73' : '#ffd77b';
    context.fillText(station.maxed ? 'MAX LEVEL' : `Level ${station.level + 1} · $${station.cost}`, station.x + station.width / 2, station.y + 59);
  }

  function drawRabbit(context, rabbit, time) {
    const hop = Math.abs(Math.sin(rabbit.hop + time * 5)) * 5;
    const movingLeft = rabbit.vx < 0;
    const angle = Math.atan2(movingLeft ? -rabbit.vy : rabbit.vy, movingLeft ? -rabbit.vx : rabbit.vx);
    context.save();
    context.translate(rabbit.x, rabbit.y - hop);
    context.rotate(angle);
    if (movingLeft) context.scale(-1, 1);
    context.fillStyle = 'rgba(38, 41, 34, .2)';
    context.beginPath();
    context.ellipse(0, 9 + hop, 13, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = rabbit.scared ? '#d8c6ad' : '#eee1c9';
    context.beginPath();
    context.ellipse(-2, 0, 13, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(10, -2, 8, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#eee1c9';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(12, -7);
    context.lineTo(15, -18);
    context.moveTo(7, -7);
    context.lineTo(6, -18);
    context.stroke();
    context.fillStyle = '#2e2a26';
    context.beginPath();
    context.arc(13, -4, 1.8, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCrow(context, crow) {
    const wingLift = Math.sin(crow.wingPhase) * 7;
    context.save();
    context.translate(crow.x, crow.y);
    context.rotate(Math.atan2(crow.vy, crow.vx));
    context.fillStyle = 'rgba(28, 34, 31, .2)';
    context.beginPath();
    context.ellipse(-5, 14, 18, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = crow.scared ? '#525b62' : '#24292d';
    context.beginPath();
    context.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(-2, -2);
    context.quadraticCurveTo(-12, -18 - wingLift, -24, -9 - wingLift);
    context.quadraticCurveTo(-14, 2, -2, 4);
    context.moveTo(-2, 2);
    context.quadraticCurveTo(-12, 18 + wingLift, -24, 9 + wingLift);
    context.quadraticCurveTo(-14, -2, -2, -4);
    context.fill();
    context.fillStyle = '#171a1c';
    context.beginPath();
    context.arc(13, 0, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d3a94f';
    context.beginPath();
    context.moveTo(19, -2);
    context.lineTo(27, 0);
    context.lineTo(19, 3);
    context.closePath();
    context.fill();
    context.fillStyle = '#e7e2c6';
    context.beginPath();
    context.arc(15, -2, 1.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawDog(context, dog, time) {
    const stride = Math.sin(time * 7 + dog.phase) * 2;
    const level = Math.max(1, Math.min(3, dog.level));
    const coat = level === 1 ? '#8e5c37' : level === 2 ? '#252b2c' : '#d79c3d';
    const muzzle = level === 1 ? '#f1d2a1' : level === 2 ? '#f4f1e8' : '#f5cc78';
    const markings = level === 1 ? '#4a3024' : level === 2 ? '#f4f1e8' : '#7b4a25';
    const scale = 1 + (level - 1) * .08;
    context.save();
    context.translate(dog.x, dog.y);
    context.rotate(Math.atan2(dog.vy, dog.vx));
    context.scale(scale, scale);
    context.fillStyle = 'rgba(38, 42, 30, .22)';
    context.beginPath();
    context.ellipse(0, 9, 17, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = coat;
    context.beginPath();
    context.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = muzzle;
    context.beginPath();
    context.arc(15, -1, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = markings;
    context.beginPath();
    context.ellipse(13, -8, 5, 8, -.5, 0, Math.PI * 2);
    context.fill();
    if (level >= 2) {
      context.fillStyle = markings;
      context.beginPath();
      context.ellipse(-5, 0, level === 2 ? 7 : 5, 9, 0, 0, Math.PI * 2);
      context.fill();
    }
    if (level === 3) {
      context.strokeStyle = '#3f77a1';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(8, 0, 9, -1.1, 1.1);
      context.stroke();
    }
    context.strokeStyle = markings;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-10, 6);
    context.lineTo(-13 + stride, 13);
    context.moveTo(8, 6);
    context.lineTo(11 - stride, 13);
    context.stroke();
    context.restore();
  }

  function drawFarmer(context, player, time, pendingDog) {
    const angle = Math.atan2(player.facingY, player.facingX);
    const stride = Math.sin(player.step) * 2;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(angle);
    context.fillStyle = 'rgba(34,45,28,.24)';
    context.beginPath();
    context.ellipse(-2, 6, 22, 14, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3a2c24';
    context.beginPath();
    context.ellipse(-12 + stride, -8, 8, 5, -.25, 0, Math.PI * 2);
    context.ellipse(-12 - stride, 8, 8, 5, .25, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#356a78';
    context.beginPath();
    context.ellipse(-1, 0, 18, 14, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f0b978';
    context.beginPath();
    context.arc(10, 0, 12, 0, Math.PI * 2);
    context.arc(-1, -15, 5, 0, Math.PI * 2);
    context.arc(-1, 15, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#efc64e';
    context.beginPath();
    context.ellipse(8, 0, 14, 21, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#dcae35';
    context.beginPath();
    context.ellipse(7, 0, 10, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    if (pendingDog) {
      context.setLineDash([5, 5]);
      context.strokeStyle = '#d9f598';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(player.x, player.y, 29 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.font = '20px system-ui';
      context.textAlign = 'center';
      context.fillText('🐕', player.x, player.y - 29);
    }
  }

  function drawRepair(context, repair, fences) {
    if (!repair) return;
    const fence = fences.find(item => item.id === repair.fenceId);
    if (!fence) return;
    const width = 72;
    const x = fence.x - width / 2;
    const y = fence.y - 30;
    context.fillStyle = 'rgba(15, 33, 20, .9)';
    context.beginPath();
    context.roundRect(x, y, width, 13, 7);
    context.fill();
    context.fillStyle = '#b4ed73';
    context.beginPath();
    context.roundRect(x + 2, y + 2, (width - 4) * repair.progress, 9, 5);
    context.fill();
    context.fillStyle = '#fff';
    context.font = 'bold 11px system-ui';
    context.textAlign = 'center';
    context.fillText('REPAIRING', fence.x, y - 5);
  }

  function drawParticles(context, state) {
    state.particles.forEach(particle => {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    context.globalAlpha = 1;
    state.coinPops.forEach(coin => {
      context.globalAlpha = Math.max(0, coin.life);
      context.fillStyle = '#ffe078';
      context.font = 'bold 16px system-ui';
      context.textAlign = 'center';
      context.fillText(`+$${coin.amount}`, coin.x, coin.y);
    });
    context.globalAlpha = 1;
    state.notifications.forEach(note => {
      context.globalAlpha = Math.min(1, note.life * 2);
      context.fillStyle = note.bad ? '#ffaea6' : '#fff';
      context.font = 'bold 17px system-ui';
      context.textAlign = 'center';
      context.fillText(note.text, note.x, note.y);
    });
    context.globalAlpha = 1;
  }

  function draw(context, state) {
    drawGrass(context, state.elapsed);
    drawFieldGround(context, state.field, state.expansionPulse);
    state.crops.forEach(crop => drawCrop(context, crop, state.elapsed));
    state.fences.forEach(fence => drawFence(context, fence, state.fenceLevel));
    state.rabbits.forEach(rabbit => drawRabbit(context, rabbit, state.elapsed));
    state.crows.forEach(crow => drawCrow(context, crow));
    state.dogs.forEach(dog => drawDog(context, dog, state.elapsed));
    state.stations.forEach(station => drawStation(context, station));
    drawRepair(context, state.repair, state.fences);
    drawFarmer(context, state.player, state.elapsed, state.pendingDog);
    drawParticles(context, state);
  }

  return { draw };
})();
