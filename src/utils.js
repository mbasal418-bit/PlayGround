export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};
export const angleDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function makeRange(rng) {
  return (min, max) => min + rng() * (max - min);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function pointInCircle(x, y, cx, cy, radius) {
  return dist2(x, y, cx, cy) <= radius * radius;
}

export function raySegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sdx = x2 - x1;
  const sdy = y2 - y1;
  const denom = dx * sdy - dy * sdx;
  if (Math.abs(denom) < 1e-9) return Infinity;
  const qx = x1 - ox;
  const qy = y1 - oy;
  const t = (qx * sdy - qy * sdx) / denom;
  const u = (qx * dy - qy * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return Infinity;
}

export function raycast(ox, oy, angle, segments, maxDist = 1200) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxDist;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const t = raySegment(ox, oy, dx, dy, s.x1, s.y1, s.x2, s.y2);
    if (t < best) best = t;
  }
  return { x: ox + dx * best, y: oy + dy * best, dist: best };
}

export function lineBlocked(ax, ay, bx, by, segments) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  const ux = dx / len;
  const uy = dy / len;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const t = raySegment(ax, ay, ux, uy, s.x1, s.y1, s.x2, s.y2);
    if (t > 0.5 && t < len - 0.5) return true;
  }
  return false;
}

export function circleRectOverlap(cx, cy, radius, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  return dist2(cx, cy, nx, ny) < radius * radius;
}

export function rectSegments(r) {
  return [
    { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
    { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
    { x1: r.x + r.w, y1: r.y + r.h, x2: r.x, y2: r.y + r.h },
    { x1: r.x, y1: r.y + r.h, x2: r.x, y2: r.y }
  ];
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
