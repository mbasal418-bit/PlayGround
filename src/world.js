import { mulberry32, clamp, pointInRect } from './utils.js';
import { HOUSE, WORLD, WALL, HALL_Y, HALL_H } from './house.js';

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r = 4) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, color) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amount, 0, 255);
  const g = clamp(((n >> 8) & 255) + amount, 0, 255);
  const b = clamp((n & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function itemSeed(item, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < item.kind.length; i++) h = Math.imul(h ^ item.kind.charCodeAt(i), 16777619);
  h ^= Math.imul(Math.round(item.x * 13) ^ Math.round(item.y * 7), 2654435761);
  h ^= Math.imul(Math.round(item.w * 3) ^ Math.round(item.h * 5), 2246822519);
  return h >>> 0;
}

function withShadow(ctx, blur, offsetY, fn) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  fn();
  ctx.restore();
}

/* ------------------------------- floors ------------------------------- */

function drawWoodFloor(ctx, room, rng) {
  ctx.fillStyle = room.base;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  const plank = 21;
  for (let y = room.y; y < room.y + room.h; y += plank) {
    const h = Math.min(plank, room.y + room.h - y);
    const v = Math.floor(rng() * 18) - 9;
    ctx.fillStyle = shade(room.base, v);
    ctx.fillRect(room.x, y, room.w, h - 1);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(room.x, y + h - 0.5);
    ctx.lineTo(room.x + room.w, y + h - 0.5);
    ctx.stroke();
    let sx = room.x + rng() * 120;
    while (sx < room.x + room.w) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, y + h);
      ctx.stroke();
      sx += 120 + rng() * 180;
    }
    if (rng() > 0.55) {
      ctx.strokeStyle = `rgba(255, 210, 160, ${0.018 + rng() * 0.03})`;
      ctx.beginPath();
      const gy = y + rng() * h;
      ctx.moveTo(room.x + rng() * room.w, gy);
      ctx.bezierCurveTo(room.x + room.w * 0.4, gy + rng() * 4, room.x + room.w * 0.7, gy - rng() * 4, room.x + room.w, gy + rng() * 3);
      ctx.stroke();
    }
  }
}

function drawTileFloor(ctx, room, rng, size = 38) {
  ctx.fillStyle = room.base;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  for (let y = room.y; y < room.y + room.h; y += size) {
    for (let x = room.x; x < room.x + room.w; x += size) {
      const v = Math.floor(rng() * 16) - 8;
      ctx.fillStyle = shade(room.base, v);
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      if (rng() > 0.72) {
        ctx.fillStyle = 'rgba(255,255,255,0.018)';
        ctx.fillRect(x + 5, y + 5, size - 10, 2);
      }
    }
  }
  ctx.strokeStyle = 'rgba(2, 5, 7, 0.38)';
  ctx.lineWidth = 1;
  for (let y = room.y; y <= room.y + room.h; y += size) {
    ctx.beginPath(); ctx.moveTo(room.x, y + 0.5); ctx.lineTo(room.x + room.w, y + 0.5); ctx.stroke();
  }
  for (let x = room.x; x <= room.x + room.w; x += size) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, room.y); ctx.lineTo(x + 0.5, room.y + room.h); ctx.stroke();
  }
}

function drawCarpetFloor(ctx, room, rng) {
  ctx.fillStyle = room.base;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  for (let i = 0; i < Math.floor((room.w * room.h) / 150); i++) {
    const a = 0.015 + rng() * 0.035;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.7})`;
    ctx.fillRect(room.x + rng() * room.w, room.y + rng() * room.h, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.018)';
  ctx.lineWidth = 1;
  for (let y = room.y + 12; y < room.y + room.h; y += 48) {
    ctx.beginPath(); ctx.moveTo(room.x, y); ctx.lineTo(room.x + room.w, y); ctx.stroke();
  }
}

function drawConcreteFloor(ctx, room, rng, slab = 92) {
  ctx.fillStyle = room.base;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  for (let y = room.y; y < room.y + room.h; y += slab) {
    for (let x = room.x; x < room.x + room.w; x += slab) {
      const v = Math.floor(rng() * 10) - 5;
      ctx.fillStyle = shade(room.base, v);
      ctx.fillRect(x + 1, y + 1, slab - 2, slab - 2);
    }
  }
  ctx.strokeStyle = 'rgba(2, 5, 7, 0.34)';
  ctx.lineWidth = 1;
  for (let y = room.y; y <= room.y + room.h; y += slab) {
    ctx.beginPath(); ctx.moveTo(room.x, y + 0.5); ctx.lineTo(room.x + room.w, y + 0.5); ctx.stroke();
  }
  for (let x = room.x; x <= room.x + room.w; x += slab) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, room.y); ctx.lineTo(x + 0.5, room.y + room.h); ctx.stroke();
  }
  for (let i = 0; i < Math.floor((room.w * room.h) / 9000); i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.1 + rng() * 0.14})`;
    ctx.lineWidth = 1;
    let x = room.x + rng() * room.w;
    let y = room.y + rng() * room.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += rng() * 30 - 15;
      y += rng() * 30 - 15;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawFloor(ctx, room, seed) {
  const rng = mulberry32(seed + room.id.charCodeAt(1) * 71);
  ctx.save();
  ctx.beginPath();
  ctx.rect(room.x, room.y, room.w, room.h);
  ctx.clip();
  if (room.floor === 'wood') drawWoodFloor(ctx, room, rng);
  else if (room.floor === 'tile') drawTileFloor(ctx, room, rng, room.type === 'bath' ? 29 : 40);
  else if (room.floor === 'carpet') drawCarpetFloor(ctx, room, rng);
  else drawConcreteFloor(ctx, room, rng, room.type === 'hall' ? 120 : 88);

  const edge = 34;
  const gradTop = ctx.createLinearGradient(0, room.y, 0, room.y + edge);
  gradTop.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
  gradTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradTop;
  ctx.fillRect(room.x, room.y, room.w, edge);
  const gradBottom = ctx.createLinearGradient(0, room.y + room.h, 0, room.y + room.h - edge);
  gradBottom.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
  gradBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradBottom;
  ctx.fillRect(room.x, room.y + room.h - edge, room.w, edge);
  const gradLeft = ctx.createLinearGradient(room.x, 0, room.x + edge, 0);
  gradLeft.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  gradLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradLeft;
  ctx.fillRect(room.x, room.y, edge, room.h);
  const gradRight = ctx.createLinearGradient(room.x + room.w, 0, room.x + room.w - edge, 0);
  gradRight.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  gradRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradRight;
  ctx.fillRect(room.x + room.w - edge, room.y, edge, room.h);

  if (room.type === 'hall') {
    ctx.strokeStyle = 'rgba(175, 210, 218, 0.04)';
    ctx.lineWidth = 2;
    for (let x = room.x + 40; x < room.x + room.w; x += 110) {
      ctx.beginPath(); ctx.moveTo(x, room.y); ctx.lineTo(x, room.y + room.h); ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------ furniture ----------------------------- */

function drawRug(ctx, item, seed) {
  const rng = mulberry32(seed);
  const palettes = [
    ['#3a2a29', '#5b3b36', '#211919'],
    ['#263336', '#385157', '#172124'],
    ['#322c3b', '#4d4162', '#1d1924'],
    ['#343126', '#55503b', '#201e17']
  ];
  const p = palettes[Math.floor(rng() * palettes.length)];
  ctx.save();
  ctx.globalAlpha = 0.92;
  fillRR(ctx, item.x, item.y, item.w, item.h, 5, p[0]);
  ctx.strokeStyle = p[1];
  ctx.lineWidth = 2;
  rr(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 3);
  ctx.stroke();
  ctx.strokeStyle = p[2];
  ctx.lineWidth = 1;
  rr(ctx, item.x + 10, item.y + 10, item.w - 20, item.h - 20, 2);
  ctx.stroke();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = p[1];
  for (let x = item.x + 20; x < item.x + item.w - 10; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, item.y + 14);
    ctx.lineTo(x + 12, item.y + item.h - 14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSofa(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 11, 6, () => fillRR(ctx, item.x, item.y, item.w, item.h, 8, '#34383a'));
  const grad = ctx.createLinearGradient(0, item.y, 0, item.y + item.h);
  grad.addColorStop(0, '#484e4f');
  grad.addColorStop(0.25, '#3b4142');
  grad.addColorStop(1, '#292e2f');
  fillRR(ctx, item.x, item.y, item.w, item.h, 8, grad);
  fillRR(ctx, item.x + 4, item.y + 4, item.w - 8, 17, 5, '#2a2f30');
  const cushions = item.w > 150 ? 3 : 2;
  const gap = 6;
  const cw = (item.w - 22 - gap * (cushions - 1)) / cushions;
  for (let i = 0; i < cushions; i++) {
    const cx = item.x + 11 + i * (cw + gap);
    fillRR(ctx, cx, item.y + 25, cw, item.h - 33, 4, shade('#3f4546', Math.floor(rng() * 8) - 4));
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    rr(ctx, cx + 2, item.y + 27, cw - 4, item.h - 37, 3);
    ctx.stroke();
  }
  fillRR(ctx, item.x, item.y + 5, 8, item.h - 8, 4, '#2c3132');
  fillRR(ctx, item.x + item.w - 8, item.y + 5, 8, item.h - 8, 4, '#2c3132');
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(item.x + 10, item.y + 2, item.w - 20, 1);
}

function drawCoffeeTable(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 10, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 5, '#4c3828'));
  const grad = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  grad.addColorStop(0, '#684b32');
  grad.addColorStop(0.6, '#513a28');
  grad.addColorStop(1, '#3d2c1f');
  fillRR(ctx, item.x, item.y, item.w, item.h, 5, grad);
  ctx.strokeStyle = 'rgba(255,220,175,0.12)';
  ctx.lineWidth = 1;
  rr(ctx, item.x + 3, item.y + 3, item.w - 6, item.h - 6, 4);
  ctx.stroke();
  ctx.fillStyle = '#d8d4c8';
  ctx.save();
  ctx.translate(item.x + item.w * 0.3, item.y + item.h * 0.42);
  ctx.rotate(-0.18);
  ctx.fillRect(-15, -8, 30, 16);
  ctx.fillStyle = '#8e948e';
  ctx.fillRect(-12, -5, 24, 1);
  ctx.fillRect(-12, -1, 18, 1);
  ctx.restore();
  ctx.fillStyle = '#c8c4b8';
  ctx.beginPath();
  ctx.arc(item.x + item.w * 0.7, item.y + item.h * 0.58, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3a2a20';
  ctx.beginPath();
  ctx.arc(item.x + item.w * 0.7, item.y + item.h * 0.58, 5, 0, TAU);
  ctx.fill();
  if (rng() > 0.5) {
    ctx.fillStyle = 'rgba(120, 150, 140, 0.25)';
    ctx.beginPath();
    ctx.arc(item.x + item.w * 0.52, item.y + item.h * 0.35, 5, 0, TAU);
    ctx.fill();
  }
}

function drawTvConsole(ctx, item) {
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#2c2620'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#40352a');
  fillRR(ctx, item.x + 8, item.y + 7, item.w - 16, item.h - 18, 2, '#0b1012');
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  g.addColorStop(0, 'rgba(88, 155, 168, 0.1)');
  g.addColorStop(0.5, 'rgba(88, 155, 168, 0.02)');
  g.addColorStop(1, 'rgba(88, 155, 168, 0.07)');
  ctx.fillStyle = g;
  ctx.fillRect(item.x + 10, item.y + 9, item.w - 20, item.h - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(item.x + 8, item.y + item.h - 8, item.w - 16, 1);
}

function drawArmchair(ctx, item) {
  withShadow(ctx, 8, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 9, '#3c4142'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 9, '#3c4142');
  fillRR(ctx, item.x + 4, item.y + 4, item.w - 8, item.h - 12, 6, '#4a5051');
  fillRR(ctx, item.x + 7, item.y + 8, item.w - 14, 12, 4, '#333839');
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  rr(ctx, item.x + 9, item.y + 24, item.w - 18, item.h - 32, 3);
  ctx.stroke();
}

function drawPlant(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 8, 4, () => {
    ctx.fillStyle = '#3b2a22';
    ctx.beginPath();
    ctx.arc(item.x + item.w / 2, item.y + item.h / 2 + 2, item.w * 0.38, 0, TAU);
    ctx.fill();
  });
  ctx.fillStyle = '#3d2b21';
  ctx.beginPath();
  ctx.arc(item.x + item.w / 2, item.y + item.h / 2 + 2, item.w * 0.36, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng() * 0.4;
    const len = item.w * (0.25 + rng() * 0.28);
    ctx.fillStyle = `rgba(${40 + Math.floor(rng() * 30)}, ${85 + Math.floor(rng() * 45)}, ${58 + Math.floor(rng() * 25)}, 0.9)`;
    ctx.beginPath();
    ctx.ellipse(
      item.x + item.w / 2 + Math.cos(a) * len * 0.6,
      item.y + item.h / 2 + Math.sin(a) * len * 0.6,
      len * 0.42, len * 0.19, a, 0, TAU
    );
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(190, 220, 160, 0.16)';
  ctx.beginPath();
  ctx.arc(item.x + item.w * 0.38, item.y + item.h * 0.35, 2.5, 0, TAU);
  ctx.fill();
}

function drawFloorLamp(ctx, item) {
  withShadow(ctx, 8, 4, () => {
    ctx.fillStyle = '#2f3334';
    ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.3, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = '#2f3334';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.28, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255, 196, 119, 0.85)';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, 3, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(item.x + item.w / 2, item.y + item.h / 2, 0, item.x + item.w / 2, item.y + item.h / 2, 42);
  g.addColorStop(0, 'rgba(255, 190, 100, 0.22)');
  g.addColorStop(1, 'rgba(255, 190, 100, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, 42, 0, TAU); ctx.fill();
}

function drawPapers(ctx, item, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(item.x + rng() * item.w, item.y + rng() * item.h);
    ctx.rotate(rng() * 1.2 - 0.6);
    ctx.fillStyle = `rgba(${180 + Math.floor(rng() * 30)}, ${180 + Math.floor(rng() * 25)}, ${170 + Math.floor(rng() * 20)}, ${0.4 + rng() * 0.25})`;
    ctx.fillRect(-9, -6, 18, 12);
    ctx.restore();
  }
}

function drawCounter(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 10, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#2c3234'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#343b3d');
  fillRR(ctx, item.x - 2, item.y - 2, item.w + 4, 10, 2, '#626b6d');
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(item.x + 2, item.y + 1, item.w - 4, 1);
  const sinkX = item.x + item.w * 0.24;
  fillRR(ctx, sinkX, item.y + 18, 62, 30, 5, '#22292b');
  fillRR(ctx, sinkX + 4, item.y + 21, 54, 24, 4, '#3a4446');
  ctx.strokeStyle = 'rgba(190, 220, 225, 0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sinkX + 31, item.y + 18);
  ctx.lineTo(sinkX + 31, item.y + 10);
  ctx.lineTo(sinkX + 40, item.y + 10);
  ctx.stroke();
  const stoveX = item.x + item.w * 0.63;
  fillRR(ctx, stoveX, item.y + 15, 72, 35, 3, '#1c2123');
  for (let i = 0; i < 4; i++) {
    const bx = stoveX + 15 + (i % 2) * 38;
    const by = item.y + 25 + Math.floor(i / 2) * 15;
    ctx.strokeStyle = 'rgba(190, 110, 70, 0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = '#7b5b3c';
  ctx.save();
  ctx.translate(item.x + item.w * 0.45, item.y + 30);
  ctx.rotate(-0.1);
  ctx.fillRect(-15, -9, 30, 18);
  ctx.fillStyle = '#b9a98a';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
  ctx.restore();
  for (let x = item.x + 8; x < item.x + item.w - 8; x += 58) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, item.y + 12); ctx.lineTo(x, item.y + item.h - 4); ctx.stroke();
  }
  if (rng() > 0.5) {
    ctx.fillStyle = '#c9c3b4';
    ctx.fillRect(item.x + item.w - 38, item.y + 20, 14, 20);
  }
}

function drawFridge(ctx, item) {
  withShadow(ctx, 10, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#454d50'));
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  g.addColorStop(0, '#5a6366');
  g.addColorStop(0.5, '#464e51');
  g.addColorStop(1, '#373e41');
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, g);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + 3, item.y + item.h * 0.38); ctx.lineTo(item.x + item.w - 3, item.y + item.h * 0.38); ctx.stroke();
  ctx.fillStyle = '#202628';
  ctx.fillRect(item.x + item.w - 14, item.y + 9, 3, 16);
  ctx.fillRect(item.x + item.w - 14, item.y + item.h * 0.5, 3, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(item.x + 3, item.y + 2, 1, item.h - 4);
}

function drawIsland(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 11, 6, () => fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#2b3133'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#333b3d');
  fillRR(ctx, item.x - 3, item.y - 3, item.w + 6, 13, 2, '#707a7b');
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(item.x, item.y, item.w, 1);
  ctx.fillStyle = '#2a2420';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.3, item.y + item.h * 0.62, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a56d4f';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.3, item.y + item.h * 0.62, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b7b0a0';
  ctx.save();
  ctx.translate(item.x + item.w * 0.68, item.y + item.h * 0.52);
  ctx.rotate(0.2);
  ctx.fillRect(-18, -10, 36, 20);
  ctx.fillStyle = '#7e8a7d';
  ctx.fillRect(-14, -6, 28, 2);
  ctx.fillRect(-14, -1, 20, 2);
  ctx.restore();
  if (rng() > 0.5) {
    ctx.fillStyle = '#8b3e33';
    ctx.beginPath(); ctx.arc(item.x + item.w * 0.52, item.y + item.h * 0.5, 5, 0, TAU); ctx.fill();
  }
}

function drawDiningTable(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 9, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 5, '#4b392a'));
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  g.addColorStop(0, '#665039');
  g.addColorStop(1, '#433226');
  fillRR(ctx, item.x, item.y, item.w, item.h, 5, g);
  ctx.strokeStyle = 'rgba(255,220,170,0.08)';
  ctx.lineWidth = 1;
  rr(ctx, item.x + 4, item.y + 4, item.w - 8, item.h - 8, 4); ctx.stroke();
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = '#c9c1ae';
    ctx.beginPath();
    ctx.arc(item.x + item.w * (0.3 + i * 0.4), item.y + item.h * 0.5, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3c2e24';
    ctx.beginPath();
    ctx.arc(item.x + item.w * (0.3 + i * 0.4), item.y + item.h * 0.5, 4.5, 0, TAU);
    ctx.fill();
  }
  if (rng() > 0.5) {
    ctx.fillStyle = 'rgba(210, 205, 190, 0.35)';
    ctx.save();
    ctx.translate(item.x + item.w * 0.5, item.y + item.h * 0.7);
    ctx.rotate(0.4);
    ctx.fillRect(-10, -6, 20, 12);
    ctx.restore();
  }
}

function drawBed(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 13, 7, () => fillRR(ctx, item.x, item.y, item.w, item.h, 6, '#2e2a29'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 6, '#4a342b');
  fillRR(ctx, item.x + 4, item.y + 4, item.w - 8, item.h - 8, 4, '#6b625e');
  const blanket = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  blanket.addColorStop(0, '#3b4a4c');
  blanket.addColorStop(1, '#283437');
  fillRR(ctx, item.x + 7, item.y + item.h * 0.3, item.w - 14, item.h * 0.64, 3, blanket);
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let y = item.y + item.h * 0.38; y < item.y + item.h * 0.9; y += 13) {
    ctx.beginPath(); ctx.moveTo(item.x + 9, y); ctx.lineTo(item.x + item.w - 9, y); ctx.stroke();
  }
  fillRR(ctx, item.x + 11, item.y + 11, item.w * 0.38, item.h * 0.16, 6, '#b5b0a6');
  fillRR(ctx, item.x + item.w * 0.52, item.y + 11, item.w * 0.34, item.h * 0.16, 6, '#aaa59b');
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + item.w / 2, item.y + 11); ctx.lineTo(item.x + item.w / 2, item.y + item.h * 0.25); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(item.x + 8, item.y + item.h * 0.3, item.w - 16, 1);
  if (rng() > 0.4) {
    ctx.fillStyle = '#b8b1a3';
    ctx.fillRect(item.x + item.w * 0.55, item.y + item.h * 0.78, 16, 10);
  }
}

function drawNightstand(ctx, item) {
  withShadow(ctx, 7, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#3b2c22'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#4c3829');
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + 4, item.y + item.h * 0.5); ctx.lineTo(item.x + item.w - 4, item.y + item.h * 0.5); ctx.stroke();
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.5, item.y + item.h * 0.25, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255, 200, 120, 0.2)';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.5, item.y + item.h * 0.25, 14, 0, TAU); ctx.fill();
}

function drawWardrobe(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 11, 6, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#2b211b'));
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y);
  g.addColorStop(0, '#4a3629');
  g.addColorStop(0.5, '#3d2d23');
  g.addColorStop(1, '#32251d');
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, g);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + item.w / 2, item.y + 4); ctx.lineTo(item.x + item.w / 2, item.y + item.h - 4); ctx.stroke();
  ctx.fillStyle = '#1c1714';
  ctx.fillRect(item.x + item.w / 2 - 6, item.y + item.h * 0.45, 2, 14);
  ctx.fillRect(item.x + item.w / 2 + 4, item.y + item.h * 0.45, 2, 14);
  ctx.strokeStyle = 'rgba(255,220,170,0.07)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = item.y + (item.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(item.x + 5, y); ctx.lineTo(item.x + item.w - 5, y); ctx.stroke();
  }
  if (rng() > 0.6) {
    ctx.fillStyle = 'rgba(180, 160, 130, 0.2)';
    ctx.fillRect(item.x + 4, item.y + 4, 2, item.h - 8);
  }
}

function drawDresser(ctx, item) {
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#35281f'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#493528');
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const y = item.y + (item.h / 3) * i;
    ctx.beginPath(); ctx.moveTo(item.x + 4, y); ctx.lineTo(item.x + item.w - 4, y); ctx.stroke();
  }
  ctx.fillStyle = '#8e7a5d';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(item.x + item.w * 0.42, item.y + 8 + i * (item.h / 3), item.w * 0.16, 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(item.x + 3, item.y + 2, item.w - 6, 1);
}

function drawDesk(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 9, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#443326'));
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  g.addColorStop(0, '#5c452f');
  g.addColorStop(1, '#3d2c21');
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, g);
  fillRR(ctx, item.x + item.w * 0.3, item.y + 8, item.w * 0.38, item.h * 0.44, 2, '#0a0e10');
  ctx.fillStyle = 'rgba(90, 160, 170, 0.11)';
  ctx.fillRect(item.x + item.w * 0.32, item.y + 10, item.w * 0.34, item.h * 0.4);
  fillRR(ctx, item.x + item.w * 0.36, item.y + item.h * 0.58, item.w * 0.27, 10, 1, '#2a3032');
  ctx.fillStyle = '#1c2022';
  ctx.fillRect(item.x + item.w * 0.4, item.y + item.h * 0.6, 2, 5);
  ctx.fillRect(item.x + item.w * 0.58, item.y + item.h * 0.6, 2, 5);
  ctx.fillStyle = '#b9b2a2';
  ctx.save();
  ctx.translate(item.x + item.w * 0.16, item.y + item.h * 0.7);
  ctx.rotate(0.3);
  ctx.fillRect(-11, -7, 22, 14);
  ctx.restore();
  ctx.fillStyle = '#c9c4b7';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.82, item.y + item.h * 0.64, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3328';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.82, item.y + item.h * 0.64, 4, 0, TAU); ctx.fill();
  if (rng() > 0.4) {
    ctx.fillStyle = '#a33b35';
    ctx.beginPath(); ctx.arc(item.x + item.w * 0.86, item.y + item.h * 0.26, 3, 0, TAU); ctx.fill();
  }
}

function drawBookshelf(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 10, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 2, '#211b18'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 2, '#3c2d23');
  fillRR(ctx, item.x + 4, item.y + 4, item.w - 8, item.h - 8, 1, '#1b1715');
  const shelves = 5;
  for (let i = 0; i < shelves; i++) {
    const sy = item.y + 5 + i * ((item.h - 10) / shelves);
    ctx.fillStyle = '#4a382b';
    ctx.fillRect(item.x + 4, sy + (item.h - 10) / shelves - 4, item.w - 8, 3);
    let bx = item.x + 7;
    while (bx < item.x + item.w - 10) {
      const bw = 4 + rng() * 6;
      const bh = 10 + rng() * 12;
      const colors = ['#6b4d3b', '#536068', '#5b423a', '#6d6241', '#394f50', '#7a5a45'];
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      ctx.fillRect(bx, sy + ((item.h - 10) / shelves) - 5 - bh, bw, bh);
      bx += bw + 1.5;
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(item.x + 2, item.y + 2, 1, item.h - 4);
}

function drawSafe(ctx, item) {
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#202527'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#343b3e');
  fillRR(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 2, '#272d30');
  ctx.strokeStyle = 'rgba(200, 215, 220, 0.18)';
  ctx.lineWidth = 1;
  rr(ctx, item.x + 8, item.y + 8, item.w - 16, item.h - 16, 1); ctx.stroke();
  ctx.strokeStyle = '#8b969a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(item.x + item.w * 0.5, item.y + item.h * 0.48, item.w * 0.14, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#8b969a';
  ctx.fillRect(item.x + item.w * 0.5 - 1, item.y + item.h * 0.48 - item.w * 0.14, 2, item.w * 0.14);
  ctx.fillStyle = '#a0aaad';
  ctx.fillRect(item.x + item.w * 0.66, item.y + item.h * 0.43, 3, item.h * 0.14);
}

function drawChair(ctx, item) {
  withShadow(ctx, 6, 4, () => {
    ctx.fillStyle = '#2b3032';
    ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.34, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = '#32383a';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.31, 0, TAU); ctx.fill();
  ctx.fillStyle = '#41494b';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.24, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a2f31';
  ctx.fillRect(item.x + item.w * 0.18, item.y + 2, item.w * 0.64, 5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.strokeStyle = 'rgba(15,18,19,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(item.x + item.w / 2, item.y + item.h / 2);
    ctx.lineTo(item.x + item.w / 2 + Math.cos(a) * item.w * 0.34, item.y + item.h / 2 + Math.sin(a) * item.h * 0.34);
    ctx.stroke();
  }
}

function drawTub(ctx, item) {
  withShadow(ctx, 10, 5, () => fillRR(ctx, item.x, item.y, item.w, item.h, 12, '#d7d8d2'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 12, '#d7d8d2');
  fillRR(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 9, '#b7c4c5');
  fillRR(ctx, item.x + 10, item.y + 10, item.w - 20, item.h - 20, 7, '#8ea9ac');
  const g = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
  g.addColorStop(0, 'rgba(185, 230, 235, 0.3)');
  g.addColorStop(0.6, 'rgba(130, 190, 198, 0.14)');
  g.addColorStop(1, 'rgba(210, 245, 250, 0.24)');
  ctx.fillStyle = g;
  rr(ctx, item.x + 10, item.y + 10, item.w - 20, item.h - 20, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(230, 250, 252, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + 22, item.y + item.h * 0.42); ctx.lineTo(item.x + item.w * 0.45, item.y + item.h * 0.4); ctx.stroke();
  ctx.fillStyle = '#b9c2c3';
  ctx.fillRect(item.x + item.w - 14, item.y + item.h * 0.4, 4, 14);
}

function drawToilet(ctx, item) {
  withShadow(ctx, 7, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 8, '#d5d6d1'));
  fillRR(ctx, item.x + 4, item.y + 2, item.w - 8, item.h * 0.32, 3, '#cfd1cb');
  ctx.fillStyle = '#c4c7c1';
  ctx.beginPath();
  ctx.ellipse(item.x + item.w / 2, item.y + item.h * 0.68, item.w * 0.4, item.h * 0.29, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9fa8a6';
  ctx.beginPath();
  ctx.ellipse(item.x + item.w / 2, item.y + item.h * 0.68, item.w * 0.26, item.h * 0.19, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d7dad5';
  ctx.beginPath();
  ctx.ellipse(item.x + item.w / 2, item.y + item.h * 0.68, item.w * 0.18, item.h * 0.13, 0, 0, TAU);
  ctx.fill();
}

function drawSink(ctx, item) {
  withShadow(ctx, 7, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#40484a'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#596365');
  fillRR(ctx, item.x + 5, item.y + 4, item.w - 10, item.h - 10, 3, '#c8cecb');
  fillRR(ctx, item.x + 10, item.y + 8, item.w - 20, item.h - 18, 2, '#9ea9a7');
  ctx.strokeStyle = 'rgba(220, 245, 245, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(item.x + item.w * 0.5, item.y + 8); ctx.lineTo(item.x + item.w * 0.5, item.y - 1); ctx.lineTo(item.x + item.w * 0.62, item.y - 1); ctx.stroke();
  ctx.fillStyle = 'rgba(220, 245, 245, 0.22)';
  ctx.beginPath(); ctx.ellipse(item.x + item.w * 0.5, item.y + item.h * 0.58, 3, 8, 0, 0, TAU); ctx.fill();
}

function drawMat(ctx, item, seed) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = 0.8;
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#394648');
  ctx.strokeStyle = 'rgba(200, 230, 232, 0.12)';
  ctx.lineWidth = 1;
  rr(ctx, item.x + 4, item.y + 4, item.w - 8, item.h - 8, 3); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(190, 220, 222, ${0.04 + rng() * 0.05})`;
    ctx.fillRect(item.x + 10 + i * 12, item.y + 10, 1, item.h - 20);
  }
  ctx.restore();
}

function drawCabinet(ctx, item) {
  withShadow(ctx, 7, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#3e4648'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#4d5759');
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(item.x + item.w / 2, item.y + 4); ctx.lineTo(item.x + item.w / 2, item.y + item.h - 4); ctx.stroke();
  ctx.fillStyle = '#202527';
  ctx.fillRect(item.x + item.w / 2 - 7, item.y + item.h * 0.48, 2, 10);
  ctx.fillRect(item.x + item.w / 2 + 5, item.y + item.h * 0.48, 2, 10);
}

function drawShelves(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 2, '#24292b'));
  ctx.strokeStyle = '#596265';
  ctx.lineWidth = 3;
  ctx.strokeRect(item.x + 2, item.y + 2, item.w - 4, item.h - 4);
  for (let i = 1; i < 4; i++) {
    const y = item.y + (item.h / 4) * i;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(item.x + 3, y); ctx.lineTo(item.x + item.w - 3, y); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const y = item.y + (item.h / 4) * i + 5;
    if (rng() > 0.25) {
      ctx.fillStyle = rng() > 0.5 ? '#5d513e' : '#414b4e';
      ctx.fillRect(item.x + 7, y, item.w - 14, (item.h / 4) - 11);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(item.x + 9, y + 2, item.w - 18, 1);
    }
  }
}

function drawCrate(ctx, item, seed) {
  const rng = mulberry32(seed);
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 2, '#4b3a27'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 2, '#5c472e');
  ctx.strokeStyle = '#332619';
  ctx.lineWidth = 3;
  ctx.strokeRect(item.x + 2, item.y + 2, item.w - 4, item.h - 4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(item.x + 4, item.y + 4); ctx.lineTo(item.x + item.w - 4, item.y + item.h - 4);
  ctx.moveTo(item.x + item.w - 4, item.y + 4); ctx.lineTo(item.x + 4, item.y + item.h - 4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,225,180,0.05)';
  ctx.fillRect(item.x + 5, item.y + 3, item.w - 10, 1);
  if (rng() > 0.5) {
    ctx.fillStyle = 'rgba(210, 200, 170, 0.28)';
    ctx.fillRect(item.x + item.w * 0.32, item.y + item.h * 0.38, item.w * 0.36, item.h * 0.2);
  }
}

function drawWasher(ctx, item) {
  withShadow(ctx, 8, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#c4c7c2'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#d0d2cc');
  fillRR(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 3, '#b7bbb5');
  ctx.fillStyle = '#3a4143';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h * 0.54, item.w * 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(190, 220, 225, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h * 0.54, item.w * 0.18, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#6d7474';
  ctx.fillRect(item.x + 7, item.y + 7, item.w - 14, 3);
}

function drawBoxes(ctx, item, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < 3; i++) {
    const w = item.w * (0.4 + rng() * 0.25);
    const h = item.h * (0.35 + rng() * 0.3);
    const x = item.x + rng() * (item.w - w);
    const y = item.y + rng() * (item.h - h);
    withShadow(ctx, 5, 3, () => fillRR(ctx, x, y, w, h, 2, '#5b4a36'));
    ctx.strokeStyle = 'rgba(40,30,20,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = 'rgba(210,195,160,0.25)';
    ctx.fillRect(x + w * 0.2, y + h * 0.45, w * 0.6, 2);
  }
}

function drawRunner(ctx, item, seed) {
  const rng = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = 0.9;
  fillRR(ctx, item.x, item.y, item.w, item.h, 4, '#2d3537');
  ctx.strokeStyle = 'rgba(160, 190, 196, 0.14)';
  ctx.lineWidth = 2;
  rr(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 3); ctx.stroke();
  for (let x = item.x + 22; x < item.x + item.w - 10; x += 34) {
    ctx.strokeStyle = `rgba(180, 205, 210, ${0.04 + rng() * 0.04})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, item.y + 8); ctx.lineTo(x - 14, item.y + item.h - 8); ctx.stroke();
  }
  ctx.restore();
}

function drawConsoleTable(ctx, item) {
  withShadow(ctx, 7, 4, () => fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#3c2c21'));
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#4c3829');
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(item.x + 2, item.y + 2, item.w - 4, 1);
  ctx.fillStyle = '#d7c08e';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.3, item.y + item.h * 0.55, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,205,120,0.25)';
  ctx.beginPath(); ctx.arc(item.x + item.w * 0.3, item.y + item.h * 0.55, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9fa9a5';
  ctx.fillRect(item.x + item.w * 0.62, item.y + item.h * 0.3, 20, 12);
}

function drawCoatRack(ctx, item) {
  withShadow(ctx, 5, 3, () => {
    ctx.fillStyle = '#2a2e30';
    ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.28, 0, TAU); ctx.fill();
  });
  ctx.strokeStyle = '#43494b';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    ctx.beginPath();
    ctx.moveTo(item.x + item.w / 2, item.y + item.h / 2);
    ctx.lineTo(item.x + item.w / 2 + Math.cos(a) * item.w * 0.55, item.y + item.h / 2 + Math.sin(a) * item.h * 0.55);
    ctx.stroke();
  }
  ctx.fillStyle = '#2e3335';
  ctx.beginPath(); ctx.arc(item.x + item.w / 2, item.y + item.h / 2, item.w * 0.22, 0, TAU); ctx.fill();
}

function drawEntryMat(ctx, item) {
  fillRR(ctx, item.x, item.y, item.w, item.h, 3, '#30383a');
  ctx.strokeStyle = 'rgba(200, 220, 220, 0.13)';
  ctx.lineWidth = 2;
  rr(ctx, item.x + 5, item.y + 5, item.w - 10, item.h - 10, 2); ctx.stroke();
  ctx.fillStyle = 'rgba(210, 225, 225, 0.14)';
  ctx.font = '600 9px monospace';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(item.x + item.w / 2, item.y + item.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('ENTRY', 0, 3);
  ctx.restore();
}

function drawFurniture(ctx, item, seed) {
  switch (item.kind) {
    case 'rug': drawRug(ctx, item, seed); break;
    case 'sofa': drawSofa(ctx, item, seed); break;
    case 'coffeeTable': drawCoffeeTable(ctx, item, seed); break;
    case 'tvConsole': drawTvConsole(ctx, item); break;
    case 'armchair': drawArmchair(ctx, item); break;
    case 'plant': drawPlant(ctx, item, seed); break;
    case 'floorLamp': drawFloorLamp(ctx, item); break;
    case 'papers': drawPapers(ctx, item, seed); break;
    case 'counter': drawCounter(ctx, item, seed); break;
    case 'fridge': drawFridge(ctx, item); break;
    case 'island': drawIsland(ctx, item, seed); break;
    case 'diningTable': drawDiningTable(ctx, item, seed); break;
    case 'bed': drawBed(ctx, item, seed); break;
    case 'nightstand': drawNightstand(ctx, item); break;
    case 'wardrobe': drawWardrobe(ctx, item, seed); break;
    case 'dresser': drawDresser(ctx, item); break;
    case 'desk': drawDesk(ctx, item, seed); break;
    case 'bookshelf': drawBookshelf(ctx, item, seed); break;
    case 'safe': drawSafe(ctx, item); break;
    case 'chair': drawChair(ctx, item); break;
    case 'tub': drawTub(ctx, item); break;
    case 'toilet': drawToilet(ctx, item); break;
    case 'sink': drawSink(ctx, item); break;
    case 'mat': drawMat(ctx, item, seed); break;
    case 'cabinet': drawCabinet(ctx, item); break;
    case 'shelves': drawShelves(ctx, item, seed); break;
    case 'crate': drawCrate(ctx, item, seed); break;
    case 'washer': drawWasher(ctx, item); break;
    case 'boxes': drawBoxes(ctx, item, seed); break;
    case 'runner': drawRunner(ctx, item, seed); break;
    case 'consoleTable': drawConsoleTable(ctx, item); break;
    case 'coatRack': drawCoatRack(ctx, item); break;
    case 'entryMat': drawEntryMat(ctx, item); break;
    default: break;
  }
}

/* -------------------------------- walls -------------------------------- */

function drawWall(ctx, wall) {
  const vertical = wall.h > wall.w;
  const grad = vertical
    ? ctx.createLinearGradient(wall.x, 0, wall.x + wall.w, 0)
    : ctx.createLinearGradient(0, wall.y, 0, wall.y + wall.h);
  if (wall.kind === 'outer') {
    grad.addColorStop(0, '#3b4247');
    grad.addColorStop(0.35, '#272d31');
    grad.addColorStop(1, '#14181b');
  } else {
    grad.addColorStop(0, '#4a5156');
    grad.addColorStop(0.32, '#33393d');
    grad.addColorStop(1, '#1a1f22');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

  ctx.strokeStyle = 'rgba(4, 7, 9, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
  if (vertical) {
    ctx.fillRect(wall.x + 1, wall.y + 1, 2, wall.h - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(wall.x + wall.w - 3, wall.y + 1, 2, wall.h - 2);
  } else {
    ctx.fillRect(wall.x + 1, wall.y + 1, wall.w - 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(wall.x + 1, wall.y + wall.h - 3, wall.w - 2, 2);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  if (vertical) {
    for (let y = wall.y + 28; y < wall.y + wall.h; y += 48) {
      ctx.beginPath(); ctx.moveTo(wall.x + 3, y); ctx.lineTo(wall.x + wall.w - 3, y); ctx.stroke();
    }
  } else {
    for (let x = wall.x + 36; x < wall.x + wall.w; x += 58) {
      ctx.beginPath(); ctx.moveTo(x, wall.y + 3); ctx.lineTo(x, wall.y + wall.h - 3); ctx.stroke();
    }
  }

  if (wall.kind === 'outer') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (wall.w > wall.h) ctx.fillRect(wall.x, wall.y + wall.h, wall.w, 5);
    else ctx.fillRect(wall.x + wall.w, wall.y, 5, wall.h);
  }
}

function drawDoor(ctx, room) {
  const d = room.door;
  const gapX = d.centerX - d.width / 2;
  const gapY = d.side === 'south' ? room.y + room.h : room.y - WALL;
  ctx.fillStyle = room.floor === 'tile' ? '#333c3e' : '#393128';
  ctx.fillRect(gapX, gapY, d.width, WALL);
  ctx.fillStyle = 'rgba(255, 180, 92, 0.055)';
  ctx.fillRect(gapX, gapY, d.width, WALL);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(gapX, gapY + WALL * 0.5 - 1, d.width, 1);

  ctx.fillStyle = '#5a6165';
  ctx.fillRect(gapX - 3, gapY - 2, 4, WALL + 4);
  ctx.fillRect(gapX + d.width - 1, gapY - 2, 4, WALL + 4);
  ctx.fillStyle = 'rgba(255, 180, 92, 0.65)';
  ctx.fillRect(gapX - 1, gapY + 2, 1, WALL - 4);
  ctx.fillRect(gapX + d.width, gapY + 2, 1, WALL - 4);

  ctx.strokeStyle = 'rgba(255, 180, 92, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(gapX, gapY + WALL / 2, d.width, 0, Math.PI / 2);
  ctx.stroke();
}

function drawEntryDoor(ctx, house) {
  const x = HOUSE.x + 2;
  const y = house.hall.y + house.hall.h / 2 - 58;
  ctx.fillStyle = '#151b1e';
  ctx.fillRect(x - 1, y - 3, WALL + 2, 122);
  ctx.fillStyle = '#394347';
  ctx.fillRect(x + 2, y, WALL - 4, 116);
  const grad = ctx.createLinearGradient(x, y, x + WALL, y);
  grad.addColorStop(0, '#4b565a');
  grad.addColorStop(0.45, '#2c3437');
  grad.addColorStop(1, '#1a2023');
  ctx.fillStyle = grad;
  ctx.fillRect(x + 4, y + 3, WALL - 8, 110);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let yy = y + 16; yy < y + 110; yy += 18) {
    ctx.beginPath(); ctx.moveTo(x + 5, yy); ctx.lineTo(x + WALL - 5, yy); ctx.stroke();
  }
  ctx.fillStyle = '#0d1214';
  ctx.fillRect(x + 7, y + 45, 4, 26);
  ctx.fillStyle = 'rgba(255, 90, 80, 0.85)';
  ctx.beginPath(); ctx.arc(x + 9, y + 38, 2.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255, 90, 80, 0.18)';
  ctx.beginPath(); ctx.arc(x + 9, y + 38, 10, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255, 180, 92, 0.22)';
  ctx.fillRect(x + WALL + 2, y + 50, 16, 16);
  ctx.fillStyle = 'rgba(255, 180, 92, 0.08)';
  ctx.fillRect(x + WALL + 2, y + 50, 40, 16);
}

/* ------------------------------- exterior ------------------------------ */

function drawExterior(ctx, house) {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, '#080d10');
  g.addColorStop(0.5, '#0b1115');
  g.addColorStop(1, '#070b0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  const rng = mulberry32(house.seed ^ 0x9e3779b9);
  for (let i = 0; i < 260; i++) {
    const x = rng() * WORLD.w;
    const y = rng() * WORLD.h;
    const s = 8 + rng() * 60;
    ctx.fillStyle = rng() > 0.55 ? `rgba(42, 60, 56, ${0.018 + rng() * 0.03})` : `rgba(0,0,0,${0.04 + rng() * 0.08})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetX = 18;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#020405';
  ctx.fillRect(HOUSE.x - 8, HOUSE.y - 8, HOUSE.w + 16, HOUSE.h + 16);
  ctx.restore();

  const pathY = house.hall.y + house.hall.h / 2;
  ctx.fillStyle = '#1a2125';
  ctx.fillRect(0, pathY - 62, HOUSE.x + 6, 124);
  ctx.fillStyle = '#222a2e';
  ctx.fillRect(0, pathY - 58, HOUSE.x - 4, 116);
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 1;
  for (let x = 18; x < HOUSE.x; x += 56) {
    ctx.beginPath(); ctx.moveTo(x, pathY - 58); ctx.lineTo(x, pathY + 58); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, pathY); ctx.lineTo(HOUSE.x, pathY); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 180, 92, 0.08)';
  ctx.fillRect(0, pathY - 40, HOUSE.x, 3);
  ctx.fillStyle = 'rgba(116, 217, 222, 0.06)';
  ctx.fillRect(0, pathY + 38, HOUSE.x, 2);

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#293136' : '#232b2f';
    ctx.fillRect(HOUSE.x - 12 - i * 10, pathY - 54 + i * 4, 12 + i * 10, 108 - i * 8);
  }

  const bush = (x, y, r) => {
    ctx.fillStyle = 'rgba(18, 34, 28, 0.9)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40, 68, 54, 0.32)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.52, 0, TAU); ctx.fill();
  };
  bush(HOUSE.x + 44, HOUSE.y - 26, 22);
  bush(HOUSE.x + 84, HOUSE.y - 30, 17);
  bush(HOUSE.x + HOUSE.w - 62, HOUSE.y - 28, 20);
  bush(HOUSE.x - 30, HOUSE.y + 70, 18);
  bush(HOUSE.x - 32, HOUSE.y + HOUSE.h - 64, 20);
  bush(HOUSE.x + HOUSE.w + 30, HOUSE.y + HOUSE.h - 80, 22);

  ctx.strokeStyle = 'rgba(90, 120, 116, 0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(HOUSE.x - 26, HOUSE.y - 26, HOUSE.w + 52, HOUSE.h + 52);
  ctx.strokeStyle = 'rgba(90, 120, 116, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(HOUSE.x - 26, HOUSE.y - 26 + i * 180);
    ctx.lineTo(HOUSE.x - 26 + 40, HOUSE.y - 26 + i * 180);
    ctx.stroke();
  }
}

/* -------------------------------- lights ------------------------------- */

function drawLampPools(ctx, house) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const lamp of house.lamps) {
    const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.radius);
    g.addColorStop(0, hexToRgba(lamp.color, lamp.intensity));
    g.addColorStop(0.35, hexToRgba(lamp.color, lamp.intensity * 0.55));
    g.addColorStop(1, hexToRgba(lamp.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, lamp.radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return `rgba(255, 210, 160, ${alpha})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawCeilingLamps(ctx, house) {
  for (const lamp of house.lamps) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 26);
    g.addColorStop(0, hexToRgba(lamp.color, 0.42));
    g.addColorStop(0.4, hexToRgba(lamp.color, 0.16));
    g.addColorStop(1, hexToRgba(lamp.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(245, 242, 225, 0.5)';
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------- assemble ------------------------------ */

export function buildWorld(house) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.w;
  canvas.height = WORLD.h;
  const ctx = canvas.getContext('2d');
  drawExterior(ctx, house);

  for (const room of house.allRooms) drawFloor(ctx, room, house.seed);
  drawLampPools(ctx, house);

  const furniture = house.allRooms.flatMap((room) => room.furniture);
  furniture.sort((a, b) => a.z - b.z || a.y - b.y);
  for (const item of furniture) drawFurniture(ctx, item, itemSeed(item, house.seed));

  for (const wall of house.walls) drawWall(ctx, wall);
  for (const room of house.rooms) drawDoor(ctx, room);
  drawEntryDoor(ctx, house);
  drawCeilingLamps(ctx, house);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
  for (let i = 0; i < 80; i++) {
    const room = house.allRooms[i % house.allRooms.length];
    ctx.fillRect(room.x + (i * 37) % room.w, room.y + (i * 71) % room.h, 1, 1);
  }

  return { canvas, ctx };
}

export function stampBlood(ctx, x, y, angle, amount = 1, seed = 1) {
  const rng = mulberry32((seed * 2654435761) >>> 0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(44, 8, 9, 0.82)';
  ctx.beginPath();
  ctx.ellipse(x, y, 20 * amount, 14 * amount, angle, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 10 * amount; i++) {
    const a = rng() * TAU;
    const d = (10 + rng() * 34) * amount;
    const r = 1.5 + rng() * 5 * amount;
    ctx.fillStyle = `rgba(${38 + Math.floor(rng() * 26)}, 7, 9, ${0.35 + rng() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r, r * (0.4 + rng() * 0.4), a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawMinimap(ctx, house, player, w, h, time) {
  ctx.clearRect(0, 0, w, h);
  const pad = 9;
  const scale = Math.min((w - pad * 2) / HOUSE.w, (h - pad * 2) / HOUSE.h);
  const ox = (w - HOUSE.w * scale) / 2 - HOUSE.x * scale;
  const oy = (h - HOUSE.h * scale) / 2 - HOUSE.y * scale;
  const mapX = (x) => ox + x * scale;
  const mapY = (y) => oy + y * scale;

  ctx.fillStyle = 'rgba(4, 8, 11, 0.5)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120, 160, 172, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 12) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 12) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }

  for (const room of house.rooms) {
    const x = mapX(room.x);
    const y = mapY(room.y);
    const rw = room.w * scale;
    const rh = room.h * scale;
    ctx.fillStyle = room.cleared ? 'rgba(72, 150, 148, 0.26)' : 'rgba(78, 96, 105, 0.2)';
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeStyle = room.cleared ? 'rgba(116, 217, 222, 0.55)' : 'rgba(140, 168, 178, 0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, rw - 1, rh - 1);
    if (rw > 30) {
      ctx.fillStyle = 'rgba(150, 176, 184, 0.28)';
      ctx.font = '5px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(room.name.slice(0, 9), x + 3, y + 8);
    }
  }
  const hall = house.hall;
  ctx.fillStyle = 'rgba(170, 194, 200, 0.18)';
  ctx.fillRect(mapX(hall.x), mapY(hall.y), hall.w * scale, hall.h * scale);
  ctx.strokeStyle = 'rgba(180, 205, 210, 0.4)';
  ctx.strokeRect(mapX(hall.x) + 0.5, mapY(hall.y) + 0.5, hall.w * scale - 1, hall.h * scale - 1);

  ctx.fillStyle = 'rgba(255, 180, 92, 0.65)';
  ctx.fillRect(mapX(HOUSE.x) - 2, mapY(house.entry.y) + 1, 2, Math.max(3, house.entry.h * scale));

  const px = mapX(player.x);
  const py = mapY(player.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.aimAngle);
  ctx.fillStyle = 'rgba(255, 180, 92, 0.14)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 18, -0.38, 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb45c';
  ctx.beginPath();
  ctx.moveTo(5, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 180, 92, 0.9)';
  ctx.beginPath();
  ctx.arc(px, py, 1.8, 0, TAU);
  ctx.fill();

  const pulse = 0.5 + Math.sin(time * 3) * 0.5;
  ctx.strokeStyle = `rgba(255, 180, 92, ${0.08 + pulse * 0.12})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX(hall.x) - 1, mapY(hall.y) - 1, hall.w * scale + 2, hall.h * scale + 2);
}

export function drawPlan(ctx, house, w, h) {
  ctx.clearRect(0, 0, w, h);
  const pad = 26;
  const scale = Math.min((w - pad * 2) / HOUSE.w, (h - pad * 2) / HOUSE.h);
  const ox = (w - HOUSE.w * scale) / 2 - HOUSE.x * scale;
  const oy = (h - HOUSE.h * scale) / 2 - HOUSE.y * scale;
  const mx = (x) => ox + x * scale;
  const my = (y) => oy + y * scale;

  ctx.fillStyle = 'rgba(4, 8, 11, 0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120, 160, 172, 0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 20) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }

  const drawRoom = (room, isHall) => {
    const x = mx(room.x);
    const y = my(room.y);
    const rw = room.w * scale;
    const rh = room.h * scale;
    ctx.fillStyle = isHall ? 'rgba(170, 194, 200, 0.12)' : 'rgba(255, 180, 92, 0.045)';
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeStyle = isHall ? 'rgba(180, 205, 210, 0.5)' : 'rgba(255, 180, 92, 0.4)';
    ctx.lineWidth = isHall ? 1 : 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, rw - 1, rh - 1);
    if (isHall) {
      ctx.strokeStyle = 'rgba(180, 205, 210, 0.12)';
      ctx.lineWidth = 1;
      for (let xx = x + 8; xx < x + rw; xx += 10) {
        ctx.beginPath(); ctx.moveTo(xx, y + 2); ctx.lineTo(xx + 7, y + rh - 2); ctx.stroke();
      }
    }
    if (rw > 52 && rh > 28) {
      ctx.fillStyle = isHall ? 'rgba(200, 225, 230, 0.55)' : 'rgba(255, 205, 150, 0.58)';
      ctx.font = '600 7px monospace';
      ctx.textAlign = 'center';
      const label = room.name.length > 12 ? room.name.slice(0, 11) + '…' : room.name;
      ctx.fillText(label, x + rw / 2, y + rh / 2 + 2);
    }
  };

  drawRoom(house.hall, true);
  for (const room of house.rooms) drawRoom(room, false);

  for (const room of house.rooms) {
    const d = room.door;
    const x = mx(d.centerX - d.width / 2);
    const y = my(d.side === 'south' ? room.y + room.h : room.y - 2);
    ctx.fillStyle = 'rgba(255, 180, 92, 0.85)';
    ctx.fillRect(x, y - 1, d.width * scale, 2);
  }

  const ex = mx(HOUSE.x) - 8;
  const ey = my(house.entry.y + house.entry.h / 2);
  ctx.strokeStyle = 'rgba(116, 217, 222, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ex + 6, ey); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 5, ey - 4); ctx.moveTo(ex, ey); ctx.lineTo(ex + 5, ey + 4); ctx.stroke();
  ctx.fillStyle = 'rgba(116, 217, 222, 0.8)';
  ctx.font = '7px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ENTRY', ex + 2, ey - 7);

  ctx.strokeStyle = 'rgba(255, 180, 92, 0.1)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(ex + 2, ey);
  ctx.lineTo(mx(house.spawn.x), my(house.spawn.y));
  ctx.stroke();
  ctx.setLineDash([]);

  const sx = mx(house.spawn.x);
  const sy = my(house.spawn.y);
  ctx.fillStyle = 'rgba(255, 180, 92, 0.95)';
  ctx.beginPath(); ctx.arc(sx, sy, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 180, 92, 0.28)';
  ctx.beginPath(); ctx.arc(sx, sy, 8, 0, TAU); ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 180, 92, 0.18)';
  ctx.lineWidth = 1;
  const bx = mx(HOUSE.x) - 14;
  const by = my(HOUSE.y) - 14;
  const bw = HOUSE.w * scale + 28;
  const bh = HOUSE.h * scale + 28;
  const corner = 9;
  ctx.beginPath();
  ctx.moveTo(bx, by + corner); ctx.lineTo(bx, by); ctx.lineTo(bx + corner, by);
  ctx.moveTo(bx + bw - corner, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + corner);
  ctx.moveTo(bx + bw, by + bh - corner); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - corner, by + bh);
  ctx.moveTo(bx + corner, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - corner);
  ctx.stroke();
}

export function drawCompass(ctx, angle, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  const cw = w;
  const ch = h;
  const bearing = ((angle * 180) / Math.PI + 90 + 360) % 360;
  const span = 118;
  const pxPerDeg = cw / span;
  const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  const grad = ctx.createLinearGradient(0, 0, cw, 0);
  grad.addColorStop(0, 'rgba(120, 150, 160, 0)');
  grad.addColorStop(0.15, 'rgba(120, 150, 160, 0.24)');
  grad.addColorStop(0.85, 'rgba(120, 150, 160, 0.24)');
  grad.addColorStop(1, 'rgba(120, 150, 160, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ch - 19);
  ctx.lineTo(cw, ch - 19);
  ctx.stroke();

  for (let d = -70; d <= 70; d += 5) {
    const deg = Math.round((bearing + d) / 5) * 5;
    const delta = ((deg - bearing + 540) % 360) - 180;
    if (Math.abs(delta) > span / 2) continue;
    const x = cw / 2 + delta * pxPerDeg;
    const normalized = ((deg % 360) + 360) % 360;
    const major = normalized % 45 === 0;
    const mid = normalized % 15 === 0;
    const len = major ? 11 : mid ? 7 : 4;
    ctx.strokeStyle = major ? 'rgba(220, 236, 240, 0.72)' : mid ? 'rgba(180, 205, 214, 0.32)' : 'rgba(140, 170, 180, 0.18)';
    ctx.beginPath();
    ctx.moveTo(x, ch - 19);
    ctx.lineTo(x, ch - 19 - len);
    ctx.stroke();
    if (major && labels[normalized] !== undefined) {
      ctx.fillStyle = normalized === Math.round(bearing / 45) * 45 ? '#ffb45c' : 'rgba(200, 220, 226, 0.55)';
      ctx.font = `${normalized % 90 === 0 ? '600 9px' : '7px'} monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(labels[normalized], x, ch - 34);
    }
  }

  ctx.fillStyle = 'rgba(255, 180, 92, 0.9)';
  ctx.beginPath();
  ctx.moveTo(cw / 2, ch - 4);
  ctx.lineTo(cw / 2 - 4, ch - 11);
  ctx.lineTo(cw / 2 + 4, ch - 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 220, 180, 0.9)';
  ctx.font = '600 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(bearing) % 360).padStart(3, '0')}°`, cw / 2, ch - 15);
  ctx.fillStyle = 'rgba(120, 150, 160, 0.4)';
  ctx.font = '6px monospace';
  ctx.fillText('45° ARC', cw / 2, ch - 44);
  ctx.restore();
}
