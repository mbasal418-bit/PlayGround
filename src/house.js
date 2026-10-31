import {
  clamp, dist, makeRange, mulberry32, pick, pointInRect, rectSegments, rectsOverlap, shuffle
} from './utils.js';

export const WALL = 18;
export const HOUSE = { x: 120, y: 90, w: 1580, h: 860 };
export const WORLD = { w: HOUSE.x * 2 + HOUSE.w, h: HOUSE.y * 2 + HOUSE.h };
const HALL_H = 132;
const INNER = {
  left: HOUSE.x + WALL,
  right: HOUSE.x + HOUSE.w - WALL,
  top: HOUSE.y + WALL,
  bottom: HOUSE.y + HOUSE.h - WALL
};
const HALL_Y = HOUSE.y + (HOUSE.h - HALL_H) / 2;

const ROOM_TYPES = {
  living: {
    name: 'LIVING ROOM',
    floor: 'wood',
    base: '#37291f',
    accent: '#6f4b31',
    light: '#ffc477'
  },
  kitchen: {
    name: 'KITCHEN',
    floor: 'tile',
    base: '#252b2d',
    accent: '#5b7479',
    light: '#ffe0a4'
  },
  bedroom: {
    name: 'BEDROOM',
    floor: 'carpet',
    base: '#2b2830',
    accent: '#675b6f',
    light: '#ffc98e'
  },
  study: {
    name: 'STUDY',
    floor: 'wood',
    base: '#30261e',
    accent: '#775538',
    light: '#ffd09a'
  },
  bath: {
    name: 'BATHROOM',
    floor: 'tile',
    base: '#263033',
    accent: '#6e8b91',
    light: '#d8fbff'
  },
  storage: {
    name: 'STORAGE',
    floor: 'concrete',
    base: '#24282b',
    accent: '#596167',
    light: '#d9e6e9'
  },
  hall: {
    name: 'HALLWAY',
    floor: 'concrete',
    base: '#262c30',
    accent: '#5e6b71',
    light: '#cfe8ee'
  }
};

function splitRow(total, count, rng) {
  const min = total * 0.23;
  const free = total - min * count;
  const weights = Array.from({ length: count }, () => 0.72 + rng() * 0.7);
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => min + (free * w) / sum);
  const delta = total - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += delta;
  return widths;
}

function buildWalls(rooms, hall, rng) {
  const walls = [];
  const add = (x, y, w, h, kind = 'inner') => {
    if (w <= 0 || h <= 0) return;
    walls.push({ x, y, w, h, kind });
  };

  add(HOUSE.x, HOUSE.y, HOUSE.w, WALL, 'outer');
  add(HOUSE.x, HOUSE.y + HOUSE.h - WALL, HOUSE.w, WALL, 'outer');
  add(HOUSE.x, HOUSE.y, WALL, HOUSE.h, 'outer');
  add(HOUSE.x + HOUSE.w - WALL, HOUSE.y, WALL, HOUSE.h, 'outer');

  const topRooms = rooms.filter((r) => r.side === 'south');
  const bottomRooms = rooms.filter((r) => r.side === 'north');

  for (let i = 1; i < topRooms.length; i++) {
    const x = topRooms[i].x;
    add(x - WALL / 2, INNER.top, WALL, hall.y - WALL - INNER.top, 'inner');
  }
  for (let i = 1; i < bottomRooms.length; i++) {
    const x = bottomRooms[i].x;
    add(x - WALL / 2, hall.y + hall.h, WALL, INNER.bottom - (hall.y + hall.h), 'inner');
  }

  const wallYTop = hall.y - WALL;
  const wallYBottom = hall.y + hall.h;
  for (const room of rooms) {
    const door = room.door;
    const gapStart = door.centerX - door.width / 2;
    const gapEnd = door.centerX + door.width / 2;
    if (room.side === 'south') {
      add(room.x, wallYTop, Math.max(0, gapStart - room.x), WALL, 'inner');
      add(gapEnd, wallYTop, Math.max(0, room.x + room.w - gapEnd), WALL, 'inner');
    } else {
      add(room.x, wallYBottom, Math.max(0, gapStart - room.x), WALL, 'inner');
      add(gapEnd, wallYBottom, Math.max(0, room.x + room.w - gapEnd), WALL, 'inner');
    }
  }

  return walls;
}

function makeDoor(room, rng) {
  const width = 78 + rng() * 16;
  const centerX = room.x + room.w * (0.32 + rng() * 0.36);
  return {
    centerX,
    width,
    side: room.side,
    gap: {
      x: centerX - width / 2,
      y: room.side === 'south' ? room.y + room.h : room.y - WALL,
      w: width,
      h: WALL
    }
  };
}

function makeRoom(id, type, x, y, w, h, side, rng) {
  const def = ROOM_TYPES[type];
  const room = {
    id,
    type,
    name: def.name,
    side,
    x,
    y,
    w,
    h,
    floor: def.floor,
    base: def.base,
    accent: def.accent,
    light: def.light,
    door: null,
    furniture: [],
    cleared: false
  };
  room.door = makeDoor(room, rng);
  return room;
}

function doorClearance(room) {
  const d = room.door;
  if (!d) return null;
  if (room.side === 'south') {
    return { x: d.centerX - d.width / 2 - 28, y: room.y + room.h - 88, w: d.width + 56, h: 88 };
  }
  return { x: d.centerX - d.width / 2 - 28, y: room.y, w: d.width + 56, h: 88 };
}

function addFurniture(room, kind, x, y, w, h, opts = {}) {
  const solid = opts.solid !== false;
  const vision = Boolean(opts.vision);
  const z = opts.z ?? 10;
  const item = {
    kind,
    x, y, w, h,
    solid,
    vision,
    z,
    roomId: room.id,
    tone: opts.tone ?? 0,
    detail: opts.detail ?? null
  };
  const clearance = doorClearance(room);
  const bounds = { x: room.x + 10, y: room.y + 10, w: room.w - 20, h: room.h - 20 };
  if (x < bounds.x - 4 || y < bounds.y - 4 || x + w > bounds.x + bounds.w + 4 || y + h > bounds.y + bounds.h + 4) return null;
  if (solid && clearance && rectsOverlap(item, clearance, 0)) return null;
  if (solid) {
    for (const other of room.furniture) {
      if (other.solid && rectsOverlap(item, other, 8)) return null;
    }
  }
  room.furniture.push(item);
  return item;
}

function furnishLiving(room, rng) {
  const r = makeRange(rng);
  addFurniture(room, 'rug', room.x + room.w * 0.17, room.y + room.h * 0.32, room.w * 0.66, room.h * 0.52, { solid: false, z: 0, tone: r(0, 1) });
  addFurniture(room, 'sofa', room.x + 28, room.y + 28, Math.min(226, room.w * 0.56), 62, { tone: r(0, 1) });
  addFurniture(room, 'coffeeTable', room.x + room.w / 2 - 62, room.y + room.h * 0.57, 124, 58, { tone: r(0, 1) });
  addFurniture(room, 'tvConsole', room.x + room.w - 166, room.y + 30, 136, 42, { tone: r(0, 1) });
  addFurniture(room, 'armchair', room.x + room.w - 154, room.y + room.h * 0.56, 58, 62, { tone: r(0, 1) });
  addFurniture(room, 'plant', room.x + room.w - 45, room.y + room.h - 56, 26, 26, { solid: true, z: 12 });
  if (rng() > 0.4) addFurniture(room, 'floorLamp', room.x + 34, room.y + room.h - 62, 24, 24, { solid: true, z: 12 });
  if (rng() > 0.5) addFurniture(room, 'papers', room.x + room.w * 0.42, room.y + room.h * 0.8, 40, 24, { solid: false, z: 2 });
}

function furnishKitchen(room, rng) {
  const r = makeRange(rng);
  const top = room.side === 'south';
  const counterY = top ? room.y + 22 : room.y + room.h - 82;
  addFurniture(room, 'counter', room.x + 86, counterY, room.w - 110, 60, { tone: r(0, 1) });
  addFurniture(room, 'fridge', room.x + 18, counterY - 2, 62, 64, { vision: true, tone: r(0, 1) });
  addFurniture(room, 'island', room.x + room.w / 2 - 82, room.y + room.h / 2 - 33, 164, 66, { tone: r(0, 1) });
  addFurniture(room, 'rug', room.x + room.w * 0.24, room.y + room.h * 0.5, room.w * 0.52, room.h * 0.35, { solid: false, z: 0, tone: 0.4 });
  if (room.w > 430 && rng() > 0.35) {
    addFurniture(room, 'diningTable', room.x + room.w - 158, room.y + (top ? room.h - 116 : 34), 120, 78, { tone: r(0, 1) });
  }
  addFurniture(room, 'papers', room.x + 40, room.y + room.h * 0.72, 36, 22, { solid: false, z: 2 });
}

function furnishBedroom(room, rng) {
  const r = makeRange(rng);
  const bedW = Math.min(178, room.w * 0.38);
  const bedH = Math.min(224, room.h * 0.68);
  addFurniture(room, 'rug', room.x + room.w * 0.38, room.y + room.h * 0.38, room.w * 0.52, room.h * 0.48, { solid: false, z: 0, tone: r(0, 1) });
  addFurniture(room, 'bed', room.x + 24, room.y + 24, bedW, bedH, { tone: r(0, 1) });
  addFurniture(room, 'nightstand', room.x + 24 + bedW + 10, room.y + 30, 42, 42, { tone: r(0, 1) });
  addFurniture(room, 'wardrobe', room.x + room.w - 66, room.y + 28, 56, Math.min(164, room.h * 0.54), { vision: true, tone: r(0, 1) });
  addFurniture(room, 'dresser', room.x + room.w - 136, room.y + room.h - 66, 110, 42, { tone: r(0, 1) });
  if (rng() > 0.45) addFurniture(room, 'plant', room.x + room.w - 48, room.y + room.h - 54, 26, 26, { z: 12 });
  if (rng() > 0.55) addFurniture(room, 'papers', room.x + room.w * 0.48, room.y + room.h * 0.8, 34, 22, { solid: false, z: 2 });
}

function furnishStudy(room, rng) {
  const r = makeRange(rng);
  const top = room.side === 'south';
  const deskY = top ? room.y + 30 : room.y + room.h - 102;
  addFurniture(room, 'rug', room.x + room.w * 0.24, room.y + room.h * 0.4, room.w * 0.54, room.h * 0.42, { solid: false, z: 0, tone: r(0, 1) });
  addFurniture(room, 'desk', room.x + 32, deskY, Math.min(192, room.w * 0.48), 68, { tone: r(0, 1) });
  addFurniture(room, 'bookshelf', room.x + room.w - 64, room.y + 28, 54, Math.min(182, room.h * 0.6), { vision: true, tone: r(0, 1) });
  addFurniture(room, 'safe', room.x + room.w - 68, room.y + room.h - 70, 52, 52, { tone: r(0, 1) });
  addFurniture(room, 'chair', room.x + 58, deskY + 74, 44, 44, { solid: true, z: 11 });
  if (rng() > 0.4) addFurniture(room, 'floorLamp', room.x + 30, room.y + room.h - 58, 24, 24, { z: 12 });
  addFurniture(room, 'papers', room.x + room.w * 0.55, room.y + room.h * 0.76, 42, 26, { solid: false, z: 2 });
}

function furnishBath(room, rng) {
  const r = makeRange(rng);
  const top = room.side === 'south';
  const tubY = top ? room.y + 24 : room.y + room.h - 96;
  addFurniture(room, 'tub', room.x + 28, tubY, Math.min(176, room.w * 0.42), 74, { tone: r(0, 1) });
  addFurniture(room, 'toilet', room.x + 30, room.y + room.h - 104, 54, 64, { tone: r(0, 1) });
  addFurniture(room, 'sink', room.x + 104, room.y + room.h - 72, 76, 42, { tone: r(0, 1) });
  addFurniture(room, 'mat', room.x + room.w / 2 - 44, room.y + room.h * 0.48, 88, 54, { solid: false, z: 0, tone: r(0, 1) });
  if (room.w > 420) addFurniture(room, 'cabinet', room.x + room.w - 74, room.y + 30, 54, 78, { tone: r(0, 1) });
  addFurniture(room, 'papers', room.x + room.w * 0.5, room.y + 30, 28, 18, { solid: false, z: 2 });
}

function furnishStorage(room, rng) {
  const r = makeRange(rng);
  addFurniture(room, 'shelves', room.x + 20, room.y + 26, 56, Math.min(182, room.h * 0.62), { vision: true, tone: r(0, 1) });
  addFurniture(room, 'crate', room.x + room.w - 108, room.y + 34, 64, 64, { vision: true, tone: r(0, 1) });
  addFurniture(room, 'crate', room.x + room.w - 122, room.y + 118, 74, 58, { tone: r(0, 1) });
  addFurniture(room, 'washer', room.x + room.w - 78, room.y + room.h - 82, 64, 64, { tone: r(0, 1) });
  addFurniture(room, 'boxes', room.x + 92, room.y + room.h - 74, 62, 54, { solid: true, z: 9 });
  addFurniture(room, 'papers', room.x + room.w * 0.48, room.y + room.h * 0.58, 44, 26, { solid: false, z: 2 });
}

function furnishHall(hall, rng) {
  const r = makeRange(rng);
  addFurniture(hall, 'runner', hall.x + 150, hall.y + hall.h / 2 - 25, hall.w - 310, 50, { solid: false, z: 0, tone: r(0, 1) });
  addFurniture(hall, 'consoleTable', hall.x + hall.w - 242, hall.y + 18, 148, 34, { tone: r(0, 1) });
  addFurniture(hall, 'plant', hall.x + hall.w - 54, hall.y + 20, 26, 26, { z: 12 });
  addFurniture(hall, 'plant', hall.x + 58, hall.y + hall.h - 50, 24, 24, { z: 12 });
  addFurniture(hall, 'coatRack', hall.x + 104, hall.y + 20, 22, 22, { solid: true, z: 12 });
  addFurniture(hall, 'entryMat', hall.x + 18, hall.y + hall.h / 2 - 36, 72, 72, { solid: false, z: 1 });
}

function roomFurniture(room, rng) {
  switch (room.type) {
    case 'living': furnishLiving(room, rng); break;
    case 'kitchen': furnishKitchen(room, rng); break;
    case 'bedroom': furnishBedroom(room, rng); break;
    case 'study': furnishStudy(room, rng); break;
    case 'bath': furnishBath(room, rng); break;
    case 'storage': furnishStorage(room, rng); break;
    default: break;
  }
}

function placeEnemies(rooms, hall, spawn, rng) {
  const enemies = [];
  const allSolids = (room) => room.furniture.filter((f) => f.solid).map((f) => ({ x: f.x - 18, y: f.y - 18, w: f.w + 36, h: f.h + 36 }));
  const clearance = (room) => doorClearance(room);

  function candidatesFor(room, margin = 42) {
    const points = [];
    const solids = allSolids(room);
    const clear = clearance(room);
    for (let y = room.y + margin; y <= room.y + room.h - margin; y += 22) {
      for (let x = room.x + margin; x <= room.x + room.w - margin; x += 22) {
        if (clear && x > clear.x - 12 && x < clear.x + clear.w + 12 && y > clear.y - 12 && y < clear.y + clear.h + 12) continue;
        let bad = false;
        for (const s of solids) {
          if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) { bad = true; break; }
        }
        if (bad) continue;
        points.push({ x, y });
      }
    }
    return points;
  }

  function addEnemy(room, point, index) {
    const door = room.door;
    const doorX = door ? door.centerX : room.x + room.w;
    const doorY = room.side === 'south' ? room.y + room.h + 30 : room.side === 'north' ? room.y - 30 : room.y + room.h / 2;
    const angle = Math.atan2(doorY - point.y, doorX - point.x);
    enemies.push({
      id: `H-${String(enemies.length + 1).padStart(2, '0')}`,
      x: point.x,
      y: point.y,
      radius: 13,
      hp: 100,
      maxHp: 100,
      angle,
      patrolAngle: angle,
      alive: true,
      roomId: room.id,
      index,
      alert: 0,
      lastSeen: -10,
      windup: 0,
      burst: 0,
      burstTimer: 0,
      cooldown: 0.4 + rng() * 0.9,
      hitFlash: 0,
      deathTime: 0,
      shotCount: 0,
      seen: false,
      variant: rng() > 0.72 ? 'heavy' : 'standard'
    });
  }

  const roomOrder = shuffle(rng, rooms);
  for (const room of roomOrder) {
    const pts = candidatesFor(room);
    if (!pts.length) continue;
    const doorX = room.door.centerX;
    const doorY = room.side === 'south' ? room.y + room.h : room.y;
    pts.sort((a, b) => dist(b.x, b.y, doorX, doorY) - dist(a.x, a.y, doorX, doorY));
    const topHalf = pts.slice(0, Math.max(1, Math.floor(pts.length * 0.6)));
    const p = pick(rng, topHalf);
    addEnemy(room, p, 0);
  }

  const extraRooms = shuffle(rng, rooms).slice(0, 2);
  for (const room of extraRooms) {
    const pts = candidatesFor(room);
    if (pts.length < 8) continue;
    const existing = enemies.find((e) => e.roomId === room.id);
    const filtered = pts.filter((p) => !existing || dist(p.x, p.y, existing.x, existing.y) > 120);
    if (!filtered.length) continue;
    addEnemy(room, pick(rng, filtered), 1);
  }

  const hallPts = candidatesFor(hall, 34).filter((p) => p.x > spawn.x + 430 && Math.abs(p.y - (hall.y + hall.h / 2)) < hall.h / 2 - 22);
  hallPts.sort((a, b) => b.x - a.x);
  if (hallPts.length) {
    const p1 = hallPts[Math.min(hallPts.length - 1, Math.floor(hallPts.length * 0.18))];
    addEnemy(hall, p1, 0);
    const filtered = hallPts.filter((p) => dist(p.x, p.y, p1.x, p1.y) > 260);
    if (filtered.length) addEnemy(hall, filtered[Math.floor(filtered.length * 0.45)], 1);
  }

  return enemies;
}

function makeLamps(rooms, hall) {
  const lamps = [];
  for (const room of rooms) {
    lamps.push({
      x: room.x + room.w / 2,
      y: room.y + room.h / 2,
      radius: Math.max(170, Math.min(room.w, room.h) * 0.7),
      color: room.light,
      intensity: 0.23,
      roomId: room.id
    });
  }
  for (let i = 0; i < 4; i++) {
    lamps.push({
      x: hall.x + hall.w * (0.16 + i * 0.23),
      y: hall.y + hall.h / 2,
      radius: 185,
      color: '#d8f5ff',
      intensity: 0.16,
      roomId: 'hall'
    });
  }
  return lamps;
}

export function generateHouse(seed) {
  const rng = mulberry32(seed >>> 0);
  const hall = {
    id: 'hall',
    type: 'hall',
    name: 'HALLWAY',
    side: null,
    x: INNER.left,
    y: HALL_Y,
    w: INNER.right - INNER.left,
    h: HALL_H,
    floor: 'concrete',
    base: ROOM_TYPES.hall.base,
    accent: ROOM_TYPES.hall.accent,
    light: ROOM_TYPES.hall.light,
    door: null,
    furniture: [],
    cleared: false
  };

  const topWidths = splitRow(INNER.right - INNER.left, 3, rng);
  const bottomWidths = splitRow(INNER.right - INNER.left, 3, rng);
  const types = shuffle(rng, Object.keys(ROOM_TYPES).filter((t) => t !== 'hall'));
  const rooms = [];
  let cursor = INNER.left;
  for (let i = 0; i < 3; i++) {
    const w = topWidths[i];
    const room = makeRoom(`R${i + 1}`, types[i], cursor, INNER.top, w, HALL_Y - WALL - INNER.top, 'south', rng);
    rooms.push(room);
    cursor += w;
  }
  cursor = INNER.left;
  for (let i = 0; i < 3; i++) {
    const w = bottomWidths[i];
    const room = makeRoom(`R${i + 4}`, types[i + 3], cursor, HALL_Y + HALL_H + WALL, w, INNER.bottom - (HALL_Y + HALL_H + WALL), 'north', rng);
    rooms.push(room);
    cursor += w;
  }

  for (const room of rooms) roomFurniture(room, rng);
  furnishHall(hall, rng);

  const walls = buildWalls(rooms, hall, rng);
  const spawn = { x: hall.x + 92, y: hall.y + hall.h / 2 };
  const enemies = placeEnemies(rooms, hall, spawn, rng);
  const lamps = makeLamps(rooms, hall);

  const solidFurniture = [];
  for (const room of [hall, ...rooms]) {
    for (const f of room.furniture) {
      if (f.solid) solidFurniture.push(f);
    }
  }

  const collisionRects = [...walls, ...solidFurniture];
  const visionRects = [...walls, ...solidFurniture.filter((f) => f.vision)];
  const bulletRects = [...walls, ...solidFurniture];

  const segmentsFor = (rects) => rects.flatMap(rectSegments);
  const visionSegments = segmentsFor(visionRects);
  const bulletSegments = segmentsFor(bulletRects);
  const collisionSegments = segmentsFor(collisionRects);

  const houseNumber = String(1 + (seed % 98)).padStart(2, '0');
  const entry = { x: HOUSE.x, y: hall.y + hall.h / 2 - 58, w: WALL, h: 116 };

  return {
    seed,
    houseNumber,
    bounds: { ...HOUSE },
    world: { ...WORLD },
    hall,
    rooms,
    allRooms: [hall, ...rooms],
    walls,
    enemies,
    lamps,
    spawn,
    entry,
    collisionRects,
    visionRects,
    bulletRects,
    visionSegments,
    bulletSegments,
    collisionSegments,
    solidFurniture,
    roomCount: rooms.length,
    hallwayCount: 1,
    roomAt(x, y) {
      if (pointInRect(x, y, hall)) return hall;
      for (const room of rooms) if (pointInRect(x, y, room)) return room;
      return null;
    }
  };
}

export { ROOM_TYPES, INNER, HALL_Y, HALL_H };
