import { generateHouse } from './house.js';
import { buildWorld, stampBlood, drawMinimap, drawPlan, drawCompass } from './world.js';
import { Sound } from './audio.js';
import {
  clamp, lerp, angleLerp, dist, dist2, raycast, lineBlocked, raySegment, formatTime
} from './utils.js';

const $ = (id) => document.getElementById(id);
const dom = {
  app: $('app'),
  canvas: $('game'),
  hud: $('hud'),
  startScreen: $('startScreen'),
  endScreen: $('endScreen'),
  pauseScreen: $('pauseScreen'),
  touchControls: $('touchControls'),
  moveStick: $('moveStick'),
  aimStick: $('aimStick'),
  moveKnob: $('moveKnob'),
  aimKnob: $('aimKnob'),
  touchReload: $('touchReload'),
  touchPause: $('touchPause'),
  startBtn: $('startBtn'),
  newSeedBtn: $('newSeedBtn'),
  retryBtn: $('retryBtn'),
  newHouseBtn: $('newHouseBtn'),
  resumeBtn: $('resumeBtn'),
  pauseRestartBtn: $('pauseRestartBtn'),
  pauseNewBtn: $('pauseNewBtn'),
  muteBtn: $('muteBtn'),
  pauseBtn: $('pauseBtn'),
  toast: $('toast'),
  roomChip: $('roomChip'),
  hostiles: $('hostiles'),
  healthValue: $('healthValue'),
  healthBar: $('healthBar'),
  armorValue: $('armorValue'),
  armorBar: $('armorBar'),
  ammoMag: $('ammoMag'),
  ammoReserve: $('ammoReserve'),
  ammo: document.querySelector('.ammo'),
  weapon: document.querySelector('.weapon'),
  reloadBar: $('reloadBar'),
  reloadHint: $('reloadHint'),
  fireMode: $('fireMode'),
  seedLabel: $('seedLabel'),
  houseNumber: $('houseNumber'),
  compass: $('compass'),
  minimap: $('minimap'),
  plan: $('plan'),
  planTitle: $('planTitle'),
  planRooms: $('planRooms'),
  planHalls: $('planHalls'),
  planHostiles: $('planHostiles'),
  planSeed: $('planSeed'),
  resultKicker: $('resultKicker'),
  resultTitle: $('resultTitle'),
  resultSub: $('resultSub'),
  statKills: $('statKills'),
  statAccuracy: $('statAccuracy'),
  statTime: $('statTime'),
  statDamage: $('statDamage'),
  resultSeed: $('resultSeed'),
  damageFlash: $('damageFlash'),
  lowHealth: $('lowHealth'),
  grain: $('grain'),
  rotateHint: $('rotateHint')
};

const ctx = dom.canvas.getContext('2d');
const blurCanvas = document.createElement('canvas');
const blurCtx = blurCanvas.getContext('2d');

const SOFTWARE_RENDER = (() => {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|softpipe|software/i.test(String(name));
  } catch {
    return false;
  }
})();

const BLUR_SCALE = SOFTWARE_RENDER ? 0.3 : 0.35;

function radialSprite(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

const fadeSprite = radialSprite([
  [0, 'rgba(3, 7, 11, 0)'],
  [0.45, 'rgba(3, 7, 11, 0.035)'],
  [1, 'rgba(3, 7, 11, 0.36)']
]);
const lightSprite = radialSprite([
  [0, 'rgba(255, 218, 168, 0.085)'],
  [0.4, 'rgba(255, 204, 145, 0.035)'],
  [1, 'rgba(255, 190, 120, 0)']
]);

const QUERY = new URLSearchParams(location.search);
const DEBUG = QUERY.has('debug');
const DEBUG_HOUSE = QUERY.get('debug') === 'house';
const VIEW = { w: 1, h: 1, dpr: 1, zoom: 1, rs: 1 };
const RS_OVERRIDE = Number.parseFloat(QUERY.get('rs') || '');
const MAG_SIZE = 24;
const RESERVE_SIZE = 144;
const RELOAD_TIME = 1.35;
const FIRE_DELAY = 0.098;
const PLAYER_SPEED = 180;
const SPRINT_SPEED = 242;
const PLAYER_DAMAGE = 34;
const CONE_HALF = Math.PI / 8;
const CONE_RANGE = 1050;

const sound = new Sound();
let house = null;
let world = null;
let seed = readSeed();
let coarse = window.matchMedia('(pointer: coarse)').matches;
let lastTime = performance.now();
let toastTimer = 0;
let stepTimer = 0;
let frameCount = 0;
const perf = { scene: 0, blur: 0, vision: 0, frame: 0, n: 0 };

const state = {
  mode: 'menu',
  time: 0,
  runTime: 0,
  timeScale: 1,
  killSlow: 0,
  player: null,
  enemies: [],
  bullets: [],
  tracers: [],
  particles: [],
  texts: [],
  camera: { x: 0, y: 0, shake: 0 },
  mouse: { x: 0, y: 0, down: false, moved: false },
  keys: new Set(),
  touch: {
    move: { x: 0, y: 0, active: false },
    aim: { x: 0, y: 0, active: false }
  },
  stats: { shots: 0, hits: 0, kills: 0, damage: 0 },
  aimTarget: null,
  hitMarker: 0,
  killMarker: 0,
  damageTimer: 99,
  winTimer: 0,
  deathTimer: 0,
  godMode: false,
  currentRoomId: null
};

function readSeed() {
  const value = new URLSearchParams(location.search).get('seed');
  if (value !== null) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

function makePlayer() {
  return {
    x: house.spawn.x,
    y: house.spawn.y,
    radius: 13,
    vx: 0,
    vy: 0,
    hp: 100,
    maxHp: 100,
    armor: 75,
    maxArmor: 75,
    aimAngle: 0,
    mag: MAG_SIZE,
    reserve: RESERVE_SIZE,
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
    heat: 0,
    hitFlash: 0,
    moving: false,
    sprint: false,
    autoReload: 0
  };
}

function makeEnemies() {
  return house.enemies.map((base) => {
    const maxHp = base.variant === 'heavy' ? 120 : 100;
    return {
      ...base,
      hp: maxHp,
      maxHp,
      alive: true,
      alert: 0,
      lastSeen: -10,
      windup: 0,
      burst: 0,
      burstTimer: 0,
      cooldown: 0.45 + Math.random() * 1.15,
      hitFlash: 0,
      deathTime: 0,
      shotCount: 0,
      seen: false,
      hasLos: false,
      angle: base.patrolAngle
    };
  });
}

function prepareRun(rebuildWorld) {
  if (rebuildWorld) world = buildWorld(house);
  state.player = makePlayer();
  state.enemies = makeEnemies();
  for (const room of house.allRooms) room.cleared = false;
  state.bullets = [];
  state.tracers = [];
  state.particles = [];
  state.texts = [];
  state.camera = { x: state.player.x, y: state.player.y, shake: 0 };
  state.stats = { shots: 0, hits: 0, kills: 0, damage: 0 };
  state.runTime = 0;
  state.timeScale = 1;
  state.killSlow = 0;
  state.winTimer = 0;
  state.deathTimer = 0;
  state.aimTarget = null;
  state.hitMarker = 0;
  state.killMarker = 0;
  state.damageTimer = 99;
  state.currentRoomId = null;
  state.mouse.down = false;
  state.mouse.moved = false;
  state.keys.clear();
  state.touch.move = { x: 0, y: 0, active: false };
  state.touch.aim = { x: 0, y: 0, active: false };
  stepTimer = 0;
  resetStickVisuals();
  hideToast();
}

function loadHouse(nextSeed, build = true) {
  seed = nextSeed >>> 0;
  house = generateHouse(seed);
  if (build) world = buildWorld(house);
  updateLabels();
  drawPlanNow();
}

function updateLabels() {
  if (!house) return;
  const seedText = `SEED ${String(seed).padStart(8, '0')}`;
  dom.seedLabel.textContent = seedText;
  dom.planSeed.textContent = seedText;
  dom.resultSeed.textContent = seedText;
  dom.houseNumber.textContent = house.houseNumber;
  dom.planTitle.textContent = `SAFEHOUSE ${house.houseNumber}`;
  dom.planRooms.textContent = String(house.roomCount);
  dom.planHalls.textContent = String(house.hallwayCount);
  dom.planHostiles.textContent = String(house.enemies.length);
}

function beginPlaying() {
  state.mode = 'playing';
  dom.startScreen.classList.add('hidden');
  dom.endScreen.classList.add('hidden');
  dom.pauseScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  state.mouse.down = false;
  state.mouse.moved = false;
  state.keys.clear();
  updateTouchVisibility();
  lastTime = performance.now();
}

function startGame() {
  if (!house) return;
  sound.init();
  prepareRun(true);
  beginPlaying();
  showToast('BREACH // CLEAR ALL HOSTILES', 2.4);
}

function newPreviewHouse() {
  loadHouse((Math.random() * 0xffffffff) >>> 0, true);
  prepareRun(false);
  state.mode = 'menu';
  state.player.aimAngle = 0;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  updateLabels();
  drawPlanNow();
}

function retryHouse() {
  if (!house) return;
  sound.init();
  prepareRun(true);
  beginPlaying();
  showToast('RAID RESTARTED // SAME SAFEHOUSE', 2.2);
}

function startNewHouse() {
  sound.init();
  loadHouse((Math.random() * 0xffffffff) >>> 0, true);
  prepareRun(false);
  beginPlaying();
  showToast(`NEW SAFEHOUSE ${house.houseNumber} // BREACH`, 2.4);
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  state.mouse.down = false;
  state.keys.clear();
  dom.pauseScreen.classList.remove('hidden');
  updateTouchVisibility();
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  dom.pauseScreen.classList.add('hidden');
  updateTouchVisibility();
  lastTime = performance.now();
}

function showResults(won) {
  state.mode = won ? 'won' : 'dead';
  state.mouse.down = false;
  state.keys.clear();
  updateTouchVisibility();
  dom.hud.classList.add('hidden');
  dom.endScreen.classList.remove('hidden');
  dom.resultKicker.textContent = won ? 'MISSION COMPLETE' : 'OPERATOR DOWN';
  dom.resultTitle.textContent = won ? 'SAFEHOUSE CLEARED' : 'RAID FAILED';
  dom.resultTitle.classList.toggle('lost', !won);
  dom.resultSub.textContent = won
    ? 'All hostiles neutralized. The house is yours.'
    : 'The house held. Change your angle and try again.';
  dom.statKills.textContent = String(state.stats.kills);
  const accuracy = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;
  dom.statAccuracy.textContent = `${accuracy}%`;
  dom.statTime.textContent = formatTime(state.runTime);
  dom.statDamage.textContent = String(Math.round(state.stats.damage));
  dom.resultSeed.textContent = `SEED ${String(seed).padStart(8, '0')}`;
  if (won) sound.win();
  else sound.lose();
}

/* ------------------------------ geometry ------------------------------ */

function clampCamera(x, y) {
  const halfW = VIEW.w / (2 * VIEW.zoom);
  const halfH = VIEW.h / (2 * VIEW.zoom);
  const w = house ? house.world.w : 1820;
  const h = house ? house.world.h : 1040;
  return {
    x: w <= halfW * 2 ? w / 2 : clamp(x, halfW, w - halfW),
    y: h <= halfH * 2 ? h / 2 : clamp(y, halfH, h - halfH)
  };
}

function worldToScreen(wx, wy, cam = state.camera) {
  return {
    x: (wx - cam.x) * VIEW.zoom + VIEW.w / 2,
    y: (wy - cam.y) * VIEW.zoom + VIEW.h / 2
  };
}

function screenToWorld(sx, sy, cam = state.camera) {
  return {
    x: (sx - VIEW.w / 2) / VIEW.zoom + cam.x,
    y: (sy - VIEW.h / 2) / VIEW.zoom + cam.y
  };
}

function resolveCircle(entity, rects) {
  for (let iter = 0; iter < 2; iter++) {
    for (const rect of rects) {
      const nx = clamp(entity.x, rect.x, rect.x + rect.w);
      const ny = clamp(entity.y, rect.y, rect.y + rect.h);
      let dx = entity.x - nx;
      let dy = entity.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= entity.radius * entity.radius) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = entity.radius - d;
        entity.x += (dx / d) * push;
        entity.y += (dy / d) * push;
      } else {
        const left = entity.x - rect.x;
        const right = rect.x + rect.w - entity.x;
        const top = entity.y - rect.y;
        const bottom = rect.y + rect.h - entity.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) entity.x = rect.x - entity.radius;
        else if (m === right) entity.x = rect.x + rect.w + entity.radius;
        else if (m === top) entity.y = rect.y - entity.radius;
        else entity.y = rect.y + rect.h + entity.radius;
      }
    }
  }
}

function movePlayer(dx, dy) {
  const p = state.player;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    p.y += dy / steps;
    resolveCircle(p, house.collisionRects);
  }
  p.x = clamp(p.x, 20, house.world.w - 20);
  p.y = clamp(p.y, 20, house.world.h - 20);
}

function segmentHit(ax, ay, bx, by, segments) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return null;
  const ux = dx / len;
  const uy = dy / len;
  let best = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const t = raySegment(ax, ay, ux, uy, s.x1, s.y1, s.x2, s.y2);
    if (t >= 0 && t <= len && t < best) best = t;
  }
  if (!Number.isFinite(best)) return null;
  return { dist: best, x: ax + ux * best, y: ay + uy * best };
}

function segmentCircleDistance(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return Infinity;
  let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = ax + dx * t;
  const py = ay + dy * t;
  if (dist2(px, py, cx, cy) <= radius * radius) return Math.sqrt(len2) * t;
  return Infinity;
}

/* ------------------------------- input -------------------------------- */

function mouseWorldPoint() {
  return screenToWorld(state.mouse.x, state.mouse.y);
}

function startReload() {
  const p = state.player;
  if (!p || state.mode !== 'playing') return;
  if (p.reloading || p.mag >= MAG_SIZE || p.reserve <= 0) return;
  p.reloading = true;
  p.reloadTimer = RELOAD_TIME;
  sound.reload();
}

function attemptFire() {
  const p = state.player;
  if (!p || state.mode !== 'playing' || p.reloading || p.fireCooldown > 0) return;
  if (p.mag <= 0) {
    if (p.reserve > 0) startReload();
    else if (p.fireCooldown <= 0) {
      sound.empty();
      p.fireCooldown = 0.28;
    }
    return;
  }

  p.mag--;
  p.fireCooldown = FIRE_DELAY;
  p.heat = Math.min(1, p.heat + 0.18);
  state.stats.shots++;
  state.camera.shake = Math.max(state.camera.shake, 1.9 + p.heat * 1.5);
  sound.shot();

  const moveAmount = clamp(Math.hypot(p.vx, p.vy) / PLAYER_SPEED, 0, 1.35);
  const spread = 0.011 + p.heat * 0.018 + moveAmount * 0.018 + (p.sprint ? 0.014 : 0);
  const angle = p.aimAngle + (Math.random() - 0.5) * spread * 2;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const muzzle = {
    x: p.x + dirX * 22,
    y: p.y + dirY * 22
  };

  const wallHit = raycast(p.x, p.y, angle, house.bulletSegments, 1500);
  let bestDist = wallHit.dist;
  let target = null;

  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const t = ex * dirX + ey * dirY;
    if (t <= 0 || t >= bestDist) continue;
    const perp = Math.abs(-ex * dirY + ey * dirX);
    if (perp <= e.radius + 3) {
      bestDist = t;
      target = e;
    }
  }

  const end = {
    x: p.x + dirX * bestDist,
    y: p.y + dirY * bestDist
  };

  state.tracers.push({
    x1: muzzle.x, y1: muzzle.y, x2: end.x, y2: end.y,
    life: 0.075, maxLife: 0.075, color: '#ffe1a8', width: 1.7
  });
  state.particles.push({
    type: 'flash', x: muzzle.x, y: muzzle.y, vx: 0, vy: 0,
    life: 0.055, maxLife: 0.055, size: 21 + Math.random() * 8, angle, color: '#ffd28a'
  });
  const side = (Math.random() > 0.5 ? 1 : -1);
  state.particles.push({
    type: 'casing', x: p.x + dirX * 8 - dirY * side * 7, y: p.y + dirY * 8 + dirX * side * 7,
    vx: dirX * 35 - dirY * side * (45 + Math.random() * 30),
    vy: dirY * 35 + dirX * side * (45 + Math.random() * 30),
    life: 0.7 + Math.random() * 0.4, maxLife: 1.1, size: 2.6, rot: Math.random() * 6, rotV: 10
  });

  if (target) {
    state.stats.hits++;
    damageEnemy(target, PLAYER_DAMAGE, angle, end);
  } else if (wallHit.dist < 1499) {
    addImpact(end, angle);
    stampHole(end.x, end.y, angle);
  }

  if (p.mag === 0 && p.reserve > 0) p.autoReload = 0.32;
}

function damageEnemy(enemy, damage, angle, point) {
  enemy.hp -= damage;
  enemy.hitFlash = 1;
  enemy.alert = 1;
  enemy.lastSeen = state.time;
  enemy.angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  state.hitMarker = Math.max(state.hitMarker, 0.13);
  spawnBlood(point.x, point.y, angle, 5);
  if (enemy.hp <= 0) {
    killEnemy(enemy, angle);
  } else {
    sound.hit();
  }
}

function killEnemy(enemy, angle) {
  enemy.alive = false;
  enemy.hp = 0;
  enemy.deathTime = state.time;
  enemy.angle += (Math.random() - 0.5) * 0.9;
  state.stats.kills++;
  state.hitMarker = 0.18;
  state.killMarker = 0.46;
  state.camera.shake = Math.max(state.camera.shake, 6);
  sound.kill();
  stampBlood(world.ctx, enemy.x, enemy.y, enemy.angle, enemy.variant === 'heavy' ? 1.4 : 1, 1 + state.stats.kills);
  spawnBlood(enemy.x, enemy.y, angle, 22);
  addText(enemy.x, enemy.y - 26, '+100', '#ffd29a');
  const alive = state.enemies.filter((e) => e.alive).length;
  if (alive === 0) {
    state.winTimer = 1.5;
    state.killSlow = 0.8;
    state.timeScale = 0.28;
    showToast('SAFEHOUSE CLEARED', 2.6);
  }
}

function damagePlayer(damage) {
  const p = state.player;
  if (!p || state.mode !== 'playing' || p.hp <= 0 || state.godMode) return;
  state.stats.damage += damage;
  let remaining = damage;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, remaining);
    p.armor -= absorbed;
    remaining -= absorbed;
  }
  p.hp -= remaining;
  p.hitFlash = 1;
  state.damageTimer = 0;
  state.camera.shake = Math.max(state.camera.shake, 10);
  sound.hurt();
  addText(p.x, p.y - 30, `-${Math.round(damage)}`, '#ff7168');
  if (p.hp <= 0) {
    p.hp = 0;
    state.mode = 'dying';
    state.deathTimer = 1.3;
    state.mouse.down = false;
    state.camera.shake = 22;
    sound.lose();
    updateTouchVisibility();
  }
}

/* ------------------------------ updates ------------------------------- */

function updateMenu(dt) {
  const p = state.player;
  if (!p) return;
  p.aimAngle = -0.14 + Math.sin(state.time * 0.42) * 0.34;
  p.vx = 0;
  p.vy = 0;
  updateCamera(dt);
  state.camera.shake = 0;
}

function updateCamera(dt) {
  const p = state.player;
  if (!p) return;
  const look = state.mode === 'menu' ? 46 : 58;
  const tx = p.x + Math.cos(p.aimAngle) * look;
  const ty = p.y + Math.sin(p.aimAngle) * look;
  const target = clampCamera(tx, ty);
  const t = 1 - Math.exp(-9 * dt);
  state.camera.x = lerp(state.camera.x, target.x, t);
  state.camera.y = lerp(state.camera.y, target.y, t);
  state.camera.shake = Math.max(0, state.camera.shake - dt * 26);
}

function updatePlayer(dt) {
  const p = state.player;
  if (!p || p.hp <= 0) return;

  let mx = 0;
  let my = 0;
  const keys = state.keys;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (state.touch.move.active) {
    mx += state.touch.move.x;
    my += state.touch.move.y;
  }
  let len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
    len = 1;
  }
  p.moving = len > 0.1;
  p.sprint = (keys.has('shift') || keys.has('shiftleft')) && p.moving && !state.touch.aim.active;
  const speed = p.sprint ? SPRINT_SPEED : PLAYER_SPEED;
  const accel = 1 - Math.exp(-15 * dt);
  p.vx = lerp(p.vx, mx * speed, accel);
  p.vy = lerp(p.vy, my * speed, accel);
  movePlayer(p.vx * dt, p.vy * dt);

  if (state.touch.aim.active && Math.hypot(state.touch.aim.x, state.touch.aim.y) > 0.16) {
    p.aimAngle = Math.atan2(state.touch.aim.y, state.touch.aim.x);
  } else if (state.mouse.moved && !coarse) {
    const m = mouseWorldPoint();
    p.aimAngle = Math.atan2(m.y - p.y, m.x - p.x);
  } else if (p.moving && coarse && !state.touch.aim.active) {
    p.aimAngle = Math.atan2(my, mx);
  }

  updateAimTarget();

  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.heat = Math.max(0, p.heat - dt * 1.9);
  p.hitFlash = Math.max(0, p.hitFlash - dt * 4.2);
  p.autoReload = Math.max(0, p.autoReload - dt);

  if (p.reloading) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      const need = MAG_SIZE - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take;
      p.reserve -= take;
      p.reloading = false;
      p.reloadTimer = 0;
    }
  } else if (p.mag === 0 && p.reserve > 0) {
    if (p.autoReload <= 0) startReload();
  }

  const firingMouse = state.mouse.down && !coarse;
  const aimMag = Math.hypot(state.touch.aim.x, state.touch.aim.y);
  const firingTouch = state.touch.aim.active && aimMag > 0.34;
  if (firingMouse || firingTouch) attemptFire();

  if (p.moving) {
    stepTimer -= dt;
    if (stepTimer <= 0) {
      sound.footstep();
      stepTimer = p.sprint ? 0.27 : 0.4;
    }
  } else {
    stepTimer = 0.08;
  }
}

function updateAimTarget() {
  const p = state.player;
  if (!p) return;
  const angle = p.aimAngle;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const wall = raycast(p.x, p.y, angle, house.bulletSegments, 1100);
  let best = wall.dist;
  let found = null;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const t = ex * dirX + ey * dirY;
    if (t <= 0 || t >= best) continue;
    const perp = Math.abs(-ex * dirY + ey * dirX);
    if (perp <= e.radius + 4) {
      best = t;
      found = e;
    }
  }
  state.aimTarget = found;
}

function updateEnemies(dt) {
  const p = state.player;
  if (!p) return;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    const d = dist(e.x, e.y, p.x, p.y);
    const los = d < 700 && !lineBlocked(e.x, e.y, p.x, p.y, house.bulletSegments);
    e.hasLos = los;

    if (los) {
      e.seen = true;
      e.alert = Math.min(1, e.alert + dt * 4.6);
      e.lastSeen = state.time;
      e.angle = angleLerp(e.angle, Math.atan2(p.y - e.y, p.x - e.x), dt * 7);
    } else {
      e.alert = Math.max(0, e.alert - dt * 0.5);
      if (state.time - e.lastSeen > 3.4) {
        e.angle = angleLerp(e.angle, e.patrolAngle, dt * 1.6);
      }
    }

    if (state.mode !== 'playing' || p.hp <= 0 || !los || e.alert < 0.55) {
      e.windup = 0;
      e.burst = 0;
      e.cooldown = Math.max(e.cooldown, 0.3);
      continue;
    }

    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        e.burst = e.variant === 'heavy' ? 4 : 2 + (Math.random() < 0.45 ? 1 : 0);
        e.burstTimer = 0;
      }
    } else if (e.burst > 0) {
      e.burstTimer -= dt;
      if (e.burstTimer <= 0) {
        enemyFire(e);
        e.burst--;
        e.burstTimer = e.variant === 'heavy' ? 0.16 : 0.14;
        if (e.burst <= 0) {
          e.cooldown = e.variant === 'heavy' ? 1.7 + Math.random() * 1.0 : 1.1 + Math.random() * 0.9;
        }
      }
    } else {
      e.cooldown -= dt;
      if (e.cooldown <= 0) {
        e.windup = e.variant === 'heavy' ? 0.48 + Math.random() * 0.24 : 0.36 + Math.random() * 0.22;
      }
    }
  }
}

function enemyFire(enemy) {
  const p = state.player;
  const aim = Math.atan2(p.y - enemy.y, p.x - enemy.x);
  const d = dist(enemy.x, enemy.y, p.x, p.y);
  const inaccuracy = (enemy.variant === 'heavy' ? 0.038 : 0.062) + d * 0.000035;
  const angle = aim + (Math.random() - 0.5) * 2 * inaccuracy;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const muzzle = { x: enemy.x + dirX * 22, y: enemy.y + dirY * 22 };
  const speed = 545;
  state.bullets.push({
    x: muzzle.x,
    y: muzzle.y,
    px: muzzle.x,
    py: muzzle.y,
    vx: dirX * speed,
    vy: dirY * speed,
    life: 1.8,
    damage: enemy.variant === 'heavy' ? 14 : 10,
    owner: 'enemy'
  });
  state.particles.push({
    type: 'flash', x: muzzle.x, y: muzzle.y, vx: 0, vy: 0,
    life: 0.06, maxLife: 0.06, size: 18 + Math.random() * 8, angle, color: '#ff9f62'
  });
  state.particles.push({
    type: 'smoke', x: muzzle.x, y: muzzle.y, vx: dirX * 12, vy: dirY * 12,
    life: 0.4, maxLife: 0.4, size: 3, color: 'rgba(150, 140, 130, 0.16)'
  });
  const volume = clamp(1.15 - d / 900, 0.22, 1);
  sound.enemyShot(volume);
  enemy.shotCount++;
}

function updateBullets(dt) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }
    b.px = b.x;
    b.py = b.y;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    const wall = segmentHit(b.x, b.y, nx, ny, house.bulletSegments);
    let hitPlayer = Infinity;
    if (p && p.hp > 0) {
      hitPlayer = segmentCircleDistance(b.x, b.y, nx, ny, p.x, p.y, p.radius + 2);
    }
    const len = Math.hypot(nx - b.x, ny - b.y);
    if (hitPlayer <= len && (!wall || hitPlayer < wall.dist)) {
      damagePlayer(b.damage);
      addImpact({ x: p.x, y: p.y }, Math.atan2(b.vy, b.vx));
      state.bullets.splice(i, 1);
      continue;
    }
    if (wall && wall.dist <= len) {
      addImpact(wall, Math.atan2(b.vy, b.vx));
      stampHole(wall.x, wall.y, Math.atan2(b.vy, b.vx));
      state.bullets.splice(i, 1);
      continue;
    }
    b.x = nx;
    b.y = ny;
  }
}

function updateTracers(dt) {
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].life -= dt;
    if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.6 * dt;
    p.vy *= 1 - 2.6 * dt;
    if (p.type === 'blood' || p.type === 'spark') p.vy += 24 * dt;
    if (p.type === 'smoke') p.size += dt * 22;
    if (p.rot !== undefined) p.rot += p.rotV * dt;
  }
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const t = state.texts[i];
    t.life -= dt;
    t.y -= dt * 20;
    if (t.life <= 0) state.texts.splice(i, 1);
  }
}

function updateRooms() {
  const anyAlive = state.enemies.some((e) => e.alive);
  for (const room of house.allRooms) {
    if (room.cleared) continue;
    const alive = state.enemies.some((e) => e.roomId === room.id && e.alive);
    if (!alive) {
      room.cleared = true;
      if (anyAlive) showToast(`${room.name} CLEAR`, 1.5);
    }
  }
}

function update(dtReal) {
  if (state.killSlow > 0) {
    state.killSlow -= dtReal;
    state.timeScale = lerp(state.timeScale, 0.28, 0.22);
  } else {
    state.timeScale = lerp(state.timeScale, 1, 0.07);
  }
  const dt = dtReal * state.timeScale;

  if (state.mode === 'playing') {
    state.runTime += dtReal;
    state.damageTimer += dtReal;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateTracers(dt);
    updateParticles(dt);
    updateCamera(dtReal);
    state.hitMarker = Math.max(0, state.hitMarker - dtReal);
    state.killMarker = Math.max(0, state.killMarker - dtReal);
    const p = state.player;
    if (p.hp > 0 && state.damageTimer > 6) {
      p.hp = Math.min(p.maxHp, p.hp + 13 * dtReal);
    }
    updateRooms();
    if (state.winTimer > 0) {
      state.winTimer -= dtReal;
      if (state.winTimer <= 0) showResults(true);
    }
  } else if (state.mode === 'dying') {
    state.deathTimer -= dtReal;
    updateBullets(dt);
    updateTracers(dt);
    updateParticles(dt);
    updateCamera(dtReal);
    if (state.deathTimer <= 0) showResults(false);
  }
  updateHud();
}

/* ------------------------------ spawning ------------------------------ */

function spawnBlood(x, y, angle, count) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * 1.7;
    const speed = 30 + Math.random() * 120;
    state.particles.push({
      type: 'blood',
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.3 + Math.random() * 0.45,
      maxLife: 0.75,
      size: 1.5 + Math.random() * 3.5,
      color: `rgba(${90 + Math.floor(Math.random() * 40)}, 12, 16, 0.85)`
    });
  }
}

function addImpact(point, angle) {
  for (let i = 0; i < 7; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 2.2;
    const speed = 45 + Math.random() * 170;
    state.particles.push({
      type: 'spark',
      x: point.x, y: point.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.08 + Math.random() * 0.2,
      maxLife: 0.28,
      size: 1 + Math.random() * 1.7,
      color: '#ffbe72'
    });
  }
  for (let i = 0; i < 3; i++) {
    state.particles.push({
      type: 'smoke',
      x: point.x, y: point.y,
      vx: (Math.random() - 0.5) * 25,
      vy: (Math.random() - 0.5) * 25,
      life: 0.25 + Math.random() * 0.35,
      maxLife: 0.6,
      size: 2 + Math.random() * 3,
      color: 'rgba(150, 145, 130, 0.14)'
    });
  }
}

function addText(x, y, text, color) {
  state.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
}

function stampHole(x, y, angle) {
  if (!world) return;
  const c = world.ctx;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.fillStyle = 'rgba(0, 0, 0, 0.62)';
  c.beginPath();
  c.arc(0, 0, 1.6 + Math.random(), 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  c.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const a = (Math.random() - 0.5) * 1.4;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (3 + Math.random() * 5), Math.sin(a) * (3 + Math.random() * 5));
    c.stroke();
  }
  c.restore();
}

/* --------------------------------- HUD -------------------------------- */

function fitCanvas(canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const pw = Math.round(w * VIEW.dpr);
  const ph = Math.round(h * VIEW.dpr);
  if (canvasEl.width !== pw || canvasEl.height !== ph) {
    canvasEl.width = pw;
    canvasEl.height = ph;
  }
  const c = canvasEl.getContext('2d');
  c.setTransform(pw / w, 0, 0, ph / h, 0, 0);
  return { ctx: c, w, h };
}

function drawMinimapNow() {
  if (!house || !state.player || dom.hud.classList.contains('hidden')) return;
  const { ctx: c, w, h } = fitCanvas(dom.minimap);
  drawMinimap(c, house, state.player, w, h, state.time);
}

function drawCompassNow() {
  if (!house || !state.player || dom.hud.classList.contains('hidden')) return;
  const { ctx: c, w, h } = fitCanvas(dom.compass);
  drawCompass(c, state.player.aimAngle, w, h);
}

function drawPlanNow() {
  if (!house) return;
  if (dom.startScreen.classList.contains('hidden')) return;
  const rect = dom.plan.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return;
  const { ctx: c, w, h } = fitCanvas(dom.plan);
  drawPlan(c, house, w, h);
}

function showToast(text, duration = 1.6) {
  dom.toast.textContent = text;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), duration * 1000);
}

function hideToast() {
  clearTimeout(toastTimer);
  dom.toast.classList.remove('show');
}

function updateHud() {
  const p = state.player;
  if (!p) return;
  const alive = state.enemies.filter((e) => e.alive).length;
  dom.hostiles.textContent = String(alive);
  dom.healthValue.textContent = String(Math.max(0, Math.round(p.hp)));
  dom.healthBar.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`;
  dom.armorBar.style.width = `${clamp((p.armor / p.maxArmor) * 100, 0, 100)}%`;
  dom.armorValue.textContent = `${Math.round(p.armor)} ARMOR`;
  dom.ammoMag.textContent = String(p.mag);
  dom.ammoReserve.textContent = `/ ${p.reserve}`;
  dom.ammo.classList.toggle('low', p.mag <= 6);
  dom.weapon.classList.toggle('reloading', p.reloading);
  dom.reloadBar.style.width = p.reloading ? `${clamp((1 - p.reloadTimer / RELOAD_TIME) * 100, 0, 100)}%` : '0%';
  dom.reloadHint.textContent = p.reloading ? 'RELOADING' : (coarse ? 'TAP RELOAD' : 'R TO RELOAD');
  dom.damageFlash.style.opacity = String(clamp(p.hitFlash * 0.9, 0, 0.9));
  dom.lowHealth.classList.toggle('active', p.hp > 0 && p.hp < 34);

  const room = house.roomAt(p.x, p.y);
  const roomName = room ? room.name : 'EXTERIOR';
  if (state.currentRoomId !== (room ? room.id : 'outside')) {
    const first = state.currentRoomId === null;
    state.currentRoomId = room ? room.id : 'outside';
    dom.roomChip.textContent = roomName;
    if (!first && state.mode === 'playing') showToast(roomName, 1.4);
  }

  drawCompassNow();
  drawMinimapNow();
}

/* ------------------------------- drawing ------------------------------ */

function computeVisionPolygon() {
  const p = state.player;
  const points = [{ x: p.x, y: p.y }];
  const rays = 78;
  for (let i = 0; i <= rays; i++) {
    const a = p.aimAngle - CONE_HALF + (i / rays) * CONE_HALF * 2;
    const hit = raycast(p.x, p.y, a, house.visionSegments, CONE_RANGE);
    points.push({ x: hit.x, y: hit.y });
  }
  return points;
}

function drawScene(c, cam) {
  c.save();
  c.translate(VIEW.w / 2, VIEW.h / 2);
  c.scale(VIEW.zoom, VIEW.zoom);
  c.translate(-cam.x, -cam.y);

  if (world) {
    const z = VIEW.zoom;
    const sw = Math.min(VIEW.w / z, world.canvas.width);
    const sh = Math.min(VIEW.h / z, world.canvas.height);
    const sx = clamp(cam.x - sw / 2, 0, world.canvas.width - sw);
    const sy = clamp(cam.y - sh / 2, 0, world.canvas.height - sh);
    c.drawImage(world.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  if (state.mode === 'playing' || state.mode === 'dying') {
    drawEnemyLasers(c);
  }

  const p = state.player;
  const seen = (e) => !p || !lineBlocked(p.x, p.y, e.x, e.y, house.visionSegments);
  for (const e of state.enemies) {
    if (!e.alive && seen(e)) drawEnemyCorpse(c, e);
  }
  for (const e of state.enemies) {
    if (e.alive && seen(e)) drawEnemy(c, e);
  }

  drawPlayer(c);
  drawTracers(c);
  drawBullets(c);
  drawParticles(c);
  drawTexts(c);

  c.restore();
}

function drawEnemyLasers(c) {
  const p = state.player;
  if (!p) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const e of state.enemies) {
    if (!e.alive || !e.hasLos) continue;
    if (e.windup <= 0 && e.burst <= 0) continue;
    if (lineBlocked(p.x, p.y, e.x, e.y, house.visionSegments)) continue;
    const mx = e.x + Math.cos(e.angle) * 22;
    const my = e.y + Math.sin(e.angle) * 22;
    const pulse = 0.13 + (Math.sin(state.time * 44 + e.x) * 0.5 + 0.5) * 0.22;
    const g = c.createLinearGradient(mx, my, p.x, p.y);
    g.addColorStop(0, `rgba(255, 76, 62, ${pulse})`);
    g.addColorStop(0.6, `rgba(255, 76, 62, ${pulse * 0.35})`);
    g.addColorStop(1, 'rgba(255, 76, 62, 0)');
    c.strokeStyle = g;
    c.lineWidth = 1;
    c.setLineDash([3, 7]);
    c.beginPath();
    c.moveTo(mx, my);
    c.lineTo(p.x, p.y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = `rgba(255, 84, 68, ${pulse * 1.5})`;
    c.beginPath();
    c.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawEnemy(c, e) {
  c.save();
  c.translate(e.x, e.y);
  c.fillStyle = 'rgba(0, 0, 0, 0.44)';
  c.beginPath();
  c.ellipse(2, 5, e.radius + 5, e.radius + 2, 0, 0, Math.PI * 2);
  c.fill();

  if (e.alert > 0.45) {
    c.strokeStyle = `rgba(255, 90, 74, ${0.12 + e.alert * 0.22})`;
    c.lineWidth = 1;
    c.setLineDash([2, 4]);
    c.beginPath();
    c.arc(0, 0, e.radius + 8 + Math.sin(state.time * 4 + e.x) * 1.5, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }

  c.rotate(e.angle);
  const heavy = e.variant === 'heavy';
  c.fillStyle = '#202626';
  c.beginPath();
  c.ellipse(-8, -6, 6, 4, -0.3, 0, Math.PI * 2);
  c.ellipse(-8, 6, 6, 4, 0.3, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = heavy ? '#44453b' : '#37413f';
  c.beginPath();
  c.ellipse(0, 0, e.radius + 1, e.radius - 2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = heavy ? '#2e3028' : '#252e2d';
  c.beginPath();
  c.ellipse(-1, 0, e.radius - 3, e.radius - 5, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = heavy ? '#5b5847' : '#47524e';
  c.fillRect(-5, -e.radius + 1, 9, 5);
  c.fillRect(-5, e.radius - 6, 9, 5);

  c.fillStyle = '#4b5552';
  c.beginPath();
  c.ellipse(4, 0, 6.2, 5.4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = heavy ? '#6a6854' : '#59635f';
  c.beginPath();
  c.ellipse(4.5, 0, 4.6, 4.2, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = '#111616';
  c.fillRect(5, -2.3, 24, 4.6);
  c.fillStyle = '#2d3635';
  c.fillRect(5, -3.2, 14, 6.4);
  c.fillStyle = '#0a0d0d';
  c.fillRect(27, -2, 10, 4);
  c.fillStyle = '#7a857e';
  c.fillRect(21, -2.6, 6, 5.2);

  c.fillStyle = 'rgba(255, 82, 68, 0.95)';
  c.beginPath();
  c.arc(10, -0.5, 1.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255, 82, 68, 0.18)';
  c.beginPath();
  c.arc(10, -0.5, 6, 0, Math.PI * 2);
  c.fill();

  if (heavy) {
    c.strokeStyle = 'rgba(255, 180, 92, 0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-7, -e.radius + 3);
    c.lineTo(-2, -e.radius + 3);
    c.stroke();
  }

  if (e.hitFlash > 0) {
    c.fillStyle = `rgba(255, 235, 210, ${e.hitFlash * 0.4})`;
    c.beginPath();
    c.ellipse(0, 0, e.radius + 2, e.radius, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  if (e.hp < e.maxHp) {
    const w = 30;
    c.fillStyle = 'rgba(5, 8, 10, 0.72)';
    c.fillRect(e.x - w / 2, e.y - 25, w, 3);
    c.fillStyle = heavy ? '#ffb45c' : '#ff655c';
    c.fillRect(e.x - w / 2, e.y - 25, w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}

function drawEnemyCorpse(c, e) {
  c.save();
  c.translate(e.x, e.y);
  c.rotate(e.angle);
  c.globalAlpha = 0.92;
  c.fillStyle = 'rgba(0, 0, 0, 0.32)';
  c.beginPath();
  c.ellipse(0, 3, 21, 12, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1d2423';
  c.beginPath();
  c.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#2c3532';
  c.beginPath();
  c.ellipse(-2, 0, 11, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#3b4541';
  c.beginPath();
  c.ellipse(9, 0, 5, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#101414';
  c.fillRect(-3, 8, 24, 3);
  c.fillStyle = '#4b5450';
  c.fillRect(-2, -9, 8, 3);
  c.globalAlpha = 1;
  c.restore();
}

function drawPlayer(c) {
  const p = state.player;
  if (!p) return;

  c.save();
  c.translate(p.x, p.y);
  const ring = 18 + Math.sin(state.time * 2.5) * 1.2;
  c.strokeStyle = 'rgba(116, 217, 222, 0.16)';
  c.lineWidth = 1;
  c.setLineDash([2, 5]);
  c.beginPath();
  c.arc(0, 0, ring, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);

  c.fillStyle = 'rgba(0, 0, 0, 0.5)';
  c.beginPath();
  c.ellipse(2, 5, 17, 12, 0, 0, Math.PI * 2);
  c.fill();

  c.rotate(p.aimAngle);
  c.fillStyle = '#1b2223';
  c.beginPath();
  c.ellipse(-8, -6, 6.5, 4.2, -0.3, 0, Math.PI * 2);
  c.ellipse(-8, 6, 6.5, 4.2, 0.3, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = '#3d4a49';
  c.beginPath();
  c.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#222b2c';
  c.beginPath();
  c.ellipse(-1, 0, 11, 8, 0, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = '#64716d';
  c.fillRect(-6, -14, 11, 5);
  c.fillRect(-6, 9, 11, 5);
  c.fillStyle = 'rgba(116, 217, 222, 0.85)';
  c.fillRect(-4, -13, 3, 3);
  c.fillRect(-4, 10, 3, 3);

  c.fillStyle = '#6f7b74';
  c.beginPath();
  c.ellipse(5, 0, 6.5, 5.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#a0aaa0';
  c.beginPath();
  c.ellipse(5.5, 0, 4.8, 4.3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(116, 217, 222, 0.9)';
  c.beginPath();
  c.arc(8, 0, 1.3, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = '#101515';
  c.fillRect(7, -2.4, 25, 4.8);
  c.fillStyle = '#394441';
  c.fillRect(7, -3.2, 15, 6.4);
  c.fillStyle = '#0a0d0d';
  c.fillRect(29, -2.1, 11, 4.2);
  c.fillStyle = '#7d8880';
  c.fillRect(22, -2.7, 7, 5.4);
  c.fillStyle = '#c8d2c7';
  c.fillRect(15, -4, 2, 8);

  if (p.hitFlash > 0) {
    c.fillStyle = `rgba(255, 80, 70, ${p.hitFlash * 0.45})`;
    c.beginPath();
    c.ellipse(0, 0, 16, 13, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawTracers(c) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const t of state.tracers) {
    const a = clamp(t.life / t.maxLife, 0, 1);
    c.strokeStyle = `rgba(255, 210, 145, ${a * 0.18})`;
    c.lineWidth = t.width * 4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(t.x1, t.y1);
    c.lineTo(t.x2, t.y2);
    c.stroke();
    c.strokeStyle = `rgba(255, 244, 214, ${a * 0.85})`;
    c.lineWidth = t.width;
    c.beginPath();
    c.moveTo(t.x1, t.y1);
    c.lineTo(t.x2, t.y2);
    c.stroke();
  }
  c.restore();
}

function drawBullets(c) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const b of state.bullets) {
    const tail = 0.045;
    const tx = b.x - b.vx * tail;
    const ty = b.y - b.vy * tail;
    const g = c.createLinearGradient(tx, ty, b.x, b.y);
    g.addColorStop(0, 'rgba(255, 126, 58, 0)');
    g.addColorStop(0.7, 'rgba(255, 142, 68, 0.65)');
    g.addColorStop(1, 'rgba(255, 235, 190, 0.95)');
    c.strokeStyle = g;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(tx, ty);
    c.lineTo(b.x, b.y);
    c.stroke();
    const glow = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, 8);
    glow.addColorStop(0, 'rgba(255, 230, 180, 0.7)');
    glow.addColorStop(1, 'rgba(255, 120, 50, 0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(b.x, b.y, 8, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawParticles(c) {
  for (const p of state.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    if (p.type === 'flash') {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle);
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(0, 0, 0, 0, 0, p.size);
      g.addColorStop(0, `rgba(255, 246, 214, ${a})`);
      g.addColorStop(0.3, `rgba(255, 196, 108, ${a * 0.8})`);
      g.addColorStop(1, 'rgba(255, 130, 50, 0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, p.size, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(255, 244, 208, ${a})`;
      c.beginPath();
      c.moveTo(0, -3);
      c.lineTo(p.size * 0.8, 0);
      c.lineTo(0, 3);
      c.closePath();
      c.fill();
      c.restore();
    } else if (p.type === 'spark') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = p.color;
      c.globalAlpha = a;
      c.lineWidth = p.size;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
      c.stroke();
      c.restore();
    } else if (p.type === 'blood') {
      c.fillStyle = p.color;
      c.globalAlpha = a;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    } else if (p.type === 'smoke') {
      c.fillStyle = p.color;
      c.globalAlpha = a * 0.9;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    } else if (p.type === 'casing') {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = a;
      c.fillStyle = '#c9a45d';
      c.fillRect(-2.2, -1, 4.4, 2);
      c.restore();
    }
  }
}

function drawTexts(c) {
  c.save();
  c.textAlign = 'center';
  c.font = '600 9px monospace';
  for (const t of state.texts) {
    c.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
    c.fillStyle = t.color;
    c.fillText(t.text, t.x, t.y);
  }
  c.globalAlpha = 1;
  c.restore();
}

function drawConeEdges(c, poly, cam) {
  if (poly.length < 3) return;
  const p = state.player;
  const origin = worldToScreen(p.x, p.y, cam);
  const left = worldToScreen(poly[1].x, poly[1].y, cam);
  const right = worldToScreen(poly[poly.length - 1].x, poly[poly.length - 1].y, cam);

  c.save();
  c.globalCompositeOperation = 'lighter';
  const drawEdge = (end, side) => {
    c.strokeStyle = 'rgba(255, 190, 120, 0.16)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(origin.x, origin.y);
    c.lineTo(end.x, end.y);
    c.stroke();
    c.strokeStyle = `rgba(255, 220, 170, ${side === 0 ? 0.05 : 0.03})`;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(origin.x, origin.y);
    c.lineTo(end.x, end.y);
    c.stroke();
  };
  drawEdge(left, 0);
  drawEdge(right, 1);
  c.restore();
}

function drawReticle(c, cam) {
  if (state.mode === 'menu' || state.mode === 'paused' || state.mode === 'won' || state.mode === 'dead') return;
  const p = state.player;
  if (!p) return;
  let sx;
  let sy;
  if (coarse || !state.mouse.moved) {
    const s = worldToScreen(p.x + Math.cos(p.aimAngle) * 250, p.y + Math.sin(p.aimAngle) * 250, cam);
    sx = s.x;
    sy = s.y;
  } else {
    sx = state.mouse.x;
    sy = state.mouse.y;
  }
  if (sx < 0 || sy < 0 || sx > VIEW.w || sy > VIEW.h) return;

  const target = state.aimTarget;
  const color = target ? 'rgba(255, 96, 84, 0.95)' : 'rgba(233, 243, 242, 0.86)';
  const move = clamp(Math.hypot(p.vx, p.vy) / PLAYER_SPEED, 0, 1.3);
  const gap = 6 + p.heat * 11 + move * 4 + (p.reloading ? 5 : 0);
  const len = 6.5;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 1.3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(sx - gap - len, sy); c.lineTo(sx - gap, sy);
  c.moveTo(sx + gap, sy); c.lineTo(sx + gap + len, sy);
  c.moveTo(sx, sy - gap - len); c.lineTo(sx, sy - gap);
  c.moveTo(sx, sy + gap); c.lineTo(sx, sy + gap + len);
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.arc(sx, sy, 1.2, 0, Math.PI * 2);
  c.fill();

  if (p.reloading) {
    const prog = clamp(1 - p.reloadTimer / RELOAD_TIME, 0, 1);
    c.strokeStyle = 'rgba(255, 180, 92, 0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(sx, sy, 19, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    c.stroke();
  }

  if (state.hitMarker > 0) {
    const a = clamp(state.hitMarker / 0.13, 0, 1);
    c.strokeStyle = state.killMarker > 0 ? `rgba(255, 86, 74, ${a})` : `rgba(255, 246, 224, ${a})`;
    c.lineWidth = 1.8;
    const r = 5.5;
    c.beginPath();
    c.moveTo(sx - r, sy - r); c.lineTo(sx - 2, sy - 2);
    c.moveTo(sx + r, sy - r); c.lineTo(sx + 2, sy - 2);
    c.moveTo(sx - r, sy + r); c.lineTo(sx - 2, sy + 2);
    c.moveTo(sx + r, sy + r); c.lineTo(sx + 2, sy + 2);
    c.stroke();
  }
  c.restore();
}

function render() {
  const frameStart = performance.now();
  const pixelScale = VIEW.dpr * VIEW.rs;
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  if (!house || !world || !state.player) return;

  const shake = state.camera.shake;
  const cam = {
    x: state.camera.x + (Math.random() - 0.5) * shake,
    y: state.camera.y + (Math.random() - 0.5) * shake
  };

  if (DEBUG_HOUSE) {
    const scale = Math.min(VIEW.w / house.world.w, VIEW.h / house.world.h) * 0.94;
    const ox = (VIEW.w - house.world.w * scale) / 2;
    const oy = (VIEW.h - house.world.h * scale) / 2;
    ctx.drawImage(world.canvas, ox, oy, house.world.w * scale, house.world.h * scale);
    for (const e of state.enemies) {
      if (!e.alive) continue;
      ctx.save();
      ctx.translate(ox + e.x * scale, oy + e.y * scale);
      ctx.rotate(e.angle);
      ctx.fillStyle = '#ff5b56';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, 13 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(ox + state.player.x * scale, oy + state.player.y * scale);
    ctx.rotate(state.player.aimAngle);
    ctx.fillStyle = '#74d9de';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, 14 * scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const sceneStart = performance.now();
  drawScene(ctx, cam);
  perf.scene = perf.scene * 0.85 + (performance.now() - sceneStart) * 0.15;

  if (DEBUG) {
    drawReticle(ctx, cam);
    return;
  }

  const visionStart = performance.now();
  const poly = computeVisionPolygon();
  const screenPoly = poly.map((pt) => worldToScreen(pt.x, pt.y, cam));
  perf.vision = perf.vision * 0.85 + (performance.now() - visionStart) * 0.15;
  const p = state.player;
  const pScreen = worldToScreen(p.x, p.y, cam);

  const blurStart = performance.now();
  blurCtx.setTransform(1, 0, 0, 1, 0, 0);
  blurCtx.clearRect(0, 0, blurCanvas.width, blurCanvas.height);
  blurCtx.imageSmoothingEnabled = true;
  blurCtx.imageSmoothingQuality = 'high';
  blurCtx.drawImage(dom.canvas, 0, 0, dom.canvas.width, dom.canvas.height, 0, 0, blurCanvas.width, blurCanvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW.w, VIEW.h);
  ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
  for (let i = 1; i < screenPoly.length; i++) ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
  ctx.closePath();
  ctx.clip('evenodd');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.96;
  ctx.drawImage(blurCanvas, 0, 0, blurCanvas.width, blurCanvas.height, 0, 0, VIEW.w, VIEW.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(3, 7, 11, 0.3)';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.restore();
  perf.blur = perf.blur * 0.85 + (performance.now() - blurStart) * 0.15;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
  for (let i = 1; i < screenPoly.length; i++) ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
  ctx.closePath();
  ctx.clip();

  const fadeSize = CONE_RANGE * VIEW.zoom * 2;
  ctx.drawImage(fadeSprite, pScreen.x - fadeSize / 2, pScreen.y - fadeSize / 2, fadeSize, fadeSize);

  ctx.globalCompositeOperation = 'lighter';
  const lightSize = 1040 * VIEW.zoom;
  ctx.drawImage(lightSprite, pScreen.x - lightSize / 2, pScreen.y - lightSize / 2, lightSize, lightSize);
  ctx.restore();

  drawConeEdges(ctx, poly, cam);
  drawReticle(ctx, cam);

  if (state.mode === 'playing' || state.mode === 'dying') {
    const pulse = 0.5 + Math.sin(state.time * 2.2) * 0.5;
    if (state.player.hp > 0 && state.player.hp < 34) {
      ctx.fillStyle = `rgba(160, 12, 14, ${0.018 + pulse * 0.02})`;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }
  }
  perf.frame = perf.frame * 0.85 + (performance.now() - frameStart) * 0.15;
  perf.n++;
}

/* ------------------------------ lifecycle ----------------------------- */

function resize() {
  VIEW.w = Math.max(320, window.innerWidth);
  VIEW.h = Math.max(320, window.innerHeight);
  VIEW.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  VIEW.zoom = clamp(Math.min(VIEW.w / 1250, VIEW.h / 760), 0.78, 1.18);
  VIEW.rs = Number.isFinite(RS_OVERRIDE) ? clamp(RS_OVERRIDE, 0.4, 1) : (SOFTWARE_RENDER ? 0.6 : (VIEW.w * VIEW.h > 900000 ? 0.7 : 1));
  const pixelScale = VIEW.dpr * VIEW.rs;
  dom.canvas.width = Math.round(VIEW.w * pixelScale);
  dom.canvas.height = Math.round(VIEW.h * pixelScale);
  dom.canvas.style.width = `${VIEW.w}px`;
  dom.canvas.style.height = `${VIEW.h}px`;
  blurCanvas.width = Math.max(1, Math.round(VIEW.w * BLUR_SCALE));
  blurCanvas.height = Math.max(1, Math.round(VIEW.h * BLUR_SCALE));
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  coarse = window.matchMedia('(pointer: coarse)').matches;
  if (SOFTWARE_RENDER) dom.grain.style.display = 'none';
  updateTouchVisibility();
  if (state.player) {
    const c = clampCamera(state.camera.x, state.camera.y);
    state.camera.x = c.x;
    state.camera.y = c.y;
  }
  drawPlanNow();
}

function updateTouchVisibility() {
  const show = coarse && state.mode === 'playing';
  dom.touchControls.classList.toggle('hidden', !show);
  dom.rotateHint.classList.toggle('hidden', !(coarse && state.mode === 'playing' && VIEW.h > VIEW.w));
}

function resetStickVisuals() {
  if (dom.moveKnob) dom.moveKnob.style.transform = 'translate(0px, 0px)';
  if (dom.aimKnob) dom.aimKnob.style.transform = 'translate(0px, 0px)';
}

function setupStick(el, knob, which) {
  let activeId = null;
  const radius = 44;
  const update = (e) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx *= radius / d;
      dy *= radius / d;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / radius;
    const ny = dy / radius;
    if (which === 'move') state.touch.move = { x: nx, y: ny, active: true };
    else state.touch.aim = { x: nx, y: ny, active: true };
  };
  const start = (e) => {
    if (state.mode !== 'playing') return;
    e.preventDefault();
    activeId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch {}
    update(e);
  };
  const move = (e) => {
    if (e.pointerId !== activeId) return;
    e.preventDefault();
    update(e);
  };
  const end = (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    knob.style.transform = 'translate(0px, 0px)';
    if (which === 'move') state.touch.move = { x: 0, y: 0, active: false };
    else state.touch.aim = { x: 0, y: 0, active: false };
  };
  el.addEventListener('pointerdown', start, { passive: false });
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}

function makeGrain() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 34;
  }
  g.putImageData(img, 0, 0);
  dom.grain.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
}

function bindEvents() {
  dom.startBtn.addEventListener('click', startGame);
  dom.newSeedBtn.addEventListener('click', newPreviewHouse);
  dom.retryBtn.addEventListener('click', retryHouse);
  dom.newHouseBtn.addEventListener('click', startNewHouse);
  dom.resumeBtn.addEventListener('click', resumeGame);
  dom.pauseRestartBtn.addEventListener('click', retryHouse);
  dom.pauseNewBtn.addEventListener('click', startNewHouse);
  dom.pauseBtn.addEventListener('click', pauseGame);
  dom.touchPause.addEventListener('click', pauseGame);
  dom.touchReload.addEventListener('click', startReload);
  dom.muteBtn.addEventListener('click', () => {
    sound.init();
    sound.setMuted(!sound.muted);
    dom.muteBtn.classList.toggle('muted', sound.muted);
  });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'escape' || key === 'p') {
      if (state.mode === 'playing') pauseGame();
      else if (state.mode === 'paused') resumeGame();
      e.preventDefault();
      return;
    }
    if (key === 'enter' && state.mode === 'menu') {
      startGame();
      e.preventDefault();
      return;
    }
    if (key === 'r' && state.mode === 'playing') {
      startReload();
      e.preventDefault();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
      state.keys.add(key);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    state.keys.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.mouse.down = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') pauseGame();
  });

  dom.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    state.mouse.moved = true;
  });
  dom.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (state.mode !== 'playing') return;
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
    state.mouse.moved = true;
    state.mouse.down = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') state.mouse.down = false;
  });
  dom.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  setupStick(dom.moveStick, dom.moveKnob, 'move');
  setupStick(dom.aimStick, dom.aimKnob, 'aim');

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 220));
}

function loop(now) {
  const raw = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  state.time += raw;
  frameCount++;
  if (state.mode === 'menu') {
    updateMenu(raw);
  } else if (state.mode === 'playing' || state.mode === 'dying') {
    update(raw);
  }
  render();
  requestAnimationFrame(loop);
}

function init() {
  makeGrain();
  bindEvents();
  resize();
  loadHouse(seed, true);
  prepareRun(false);
  state.mode = 'menu';
  state.player.aimAngle = 0;
  updateLabels();
  drawPlanNow();
  requestAnimationFrame(loop);
}

window.__IRONSIGHT__ = {
  get state() { return state; },
  get house() { return house; },
  get world() { return world; },
  get view() { return VIEW; },
  get camera() { return state.camera; },
  get perf() { return perf; },
  get seed() { return seed; },
  startGame,
  retryHouse,
  startNewHouse,
  prepareRun,
  killAll() {
    for (const e of state.enemies) {
      if (e.alive) killEnemy(e, 0);
    }
  },
  clearRoom(id) {
    for (const e of state.enemies) {
      if (e.alive && e.roomId === id) killEnemy(e, 0);
    }
  },
  teleport(x, y) {
    state.player.x = x;
    state.player.y = y;
    state.camera.x = x;
    state.camera.y = y;
  },
  aim(angle) {
    state.player.aimAngle = angle;
  },
  damage(n) {
    damagePlayer(n);
  },
  setGodMode(on) {
    state.godMode = !!on;
  }
};

init();
