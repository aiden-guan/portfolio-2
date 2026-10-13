import { clamp, fbm, hash, hex, mix, noise, ramp, smooth, type RGB } from "../math";
import type { Cells, Grid, SceneProgram, Weather } from "../types";

// The Great Barrier Reef, painted from scratch: light coming down through the
// surface in rays, caustics crawling over the sand and the coral, a school of
// fusiliers wheeling overhead, clownfish at their anemone, a green turtle
// passing, and bubbles rising from the reef.

const W = 160;
const DEPTH: RGB[] = ["#57cfd6", "#2196b4", "#106f9c", "#0a4d7c", "#062f55", "#031c36"].map(hex);
const SAND: RGB = hex("#f1dfae");

const AIR = 0;
const BACK = 1;
const SAND_M = 2;
const BRAIN = 3;
const TABLE = 4;
const STAG = 5;
const SPONGE = 6;
const BOULDER = 7;

const sandTop = (x: number) => 80 + 3 * fbm(x * 0.045, 3.1, 3) - 2 * smooth(30, 0, Math.abs(x - 22));
const backTop = (x: number) => 62 + 9 * fbm(x * 0.028, 9.3, 4);

// Branching staghorn coral as segments, grown once.
type Segment = { ax: number; ay: number; bx: number; by: number; w: number; tip: number };
function staghorn(x: number, y: number, seed: number) {
  const out: Segment[] = [];
  const grow = (px: number, py: number, angle: number, len: number, depth: number, w: number) => {
    const qx = px + Math.sin(angle) * len;
    const qy = py - Math.cos(angle) * len;
    out.push({ ax: px, ay: py, bx: qx, by: qy, w, tip: depth === 0 ? 1 : 0 });
    if (depth === 0) return;
    const h = hash(out.length, seed);
    grow(qx, qy, angle - 0.32 - h * 0.35, len * (0.7 + h * 0.15), depth - 1, w * 0.8);
    grow(qx, qy, angle + 0.28 + (1 - h) * 0.3, len * (0.68 + (1 - h) * 0.15), depth - 1, w * 0.8);
    if (h > 0.55) grow(qx, qy, angle * 0.4, len * 0.6, depth - 1, w * 0.75);
  };
  for (let i = 0; i < 5; i++) {
    grow(x + (i - 2) * 2.6, y, (i - 2) * 0.22, 4.2 + hash(i, seed) * 2, 3, 0.85);
  }
  return out;
}

function build(grid: Grid) {
  const { cols, rows, X, Y, unit, x0, y0 } = grid;
  const n = cols * rows;
  const mat = new Uint8Array(n);
  const sr = new Float32Array(n);
  const sg = new Float32Array(n);
  const sb = new Float32Array(n);
  const tmp: RGB = [0, 0, 0];
  const put = (k: number, m: number, c: RGB, s: number) => {
    mat[k] = m;
    sr[k] = c[0] * s;
    sg[k] = c[1] * s;
    sb[k] = c[2] * s;
  };
  const brains = [
    { x: 22, y: 84, r: 12, c: hex("#d6ad5f") },
    { x: 121, y: 83, r: 9, c: hex("#a2c86f") },
    { x: 84, y: 86, r: 7, c: hex("#e09460") },
  ];
  const sponges = [
    { x: 6, h: 14, c: hex("#8a5cc2") },
    { x: 8.6, h: 10, c: hex("#9a68d0") },
    { x: 152, h: 12, c: hex("#d0566e") },
    { x: 154.5, h: 8, c: hex("#e06a7c") },
  ];
  const segments = [...staghorn(66, 82, 3), ...staghorn(103, 83, 7)];

  for (let k = 0; k < n; k++) {
    const x = X[k]!;
    const y = Y[k]!;
    ramp(DEPTH, clamp(y / 100), tmp);
    put(k, AIR, tmp, 1);
    if (y > backTop(x)) {
      // far reef, blue with distance
      const tex = fbm(x * 0.3, y * 0.3, 3);
      const s = 0.55 + 0.5 * tex;
      put(k, BACK, [mix(tmp[0], 0.2, 0.4) * s, mix(tmp[1], 0.42, 0.4) * s, mix(tmp[2], 0.55, 0.3) * s], 0.75);
    }
    const st = sandTop(x);
    if (y > st) {
      const ripple = 0.85 + 0.15 * Math.sin(x * 0.9 + fbm(x * 0.1, y * 0.4, 2) * 6);
      const depthDim = 0.75 - (y - st) * 0.02;
      put(k, SAND_M, SAND, ripple * depthDim);
    }
    // a boulder of old reef rock, crusted
    const bx = (x - 140) / 13;
    const by = (y - 84) / 9;
    if (bx * bx + by * by < 1 && y < st + 2) {
      const crust = fbm(x * 0.6, y * 0.6, 3);
      put(k, BOULDER, crust > 0.55 ? hex("#c4697d") : hex("#5f7a7c"), 0.55 + 0.6 * crust - by * 0.15);
    }
    for (const brain of brains) {
      const dx = (x - brain.x) / brain.r;
      const dy = (y - brain.y) / (brain.r * 0.72);
      const d = dx * dx + dy * dy;
      if (d < 1 && y < st + 2) {
        // maze grooves, lit from the surface on top
        const maze = Math.abs(Math.sin(fbm(x * 0.35, y * 0.35, 3) * 26));
        const top = clamp(0.55 - dy * 0.55 - dx * 0.15);
        put(k, BRAIN, brain.c, (0.35 + 0.75 * top) * (0.55 + 0.45 * maze));
      }
    }
    // table coral: a plate on a short stalk
    const tx = (x - 92) / 13;
    const ty = y - 67 - tx * tx * 1.4;
    if (Math.abs(tx) < 1 && ty > -1.1 && ty < 0.9) {
      const rim = smooth(0.75, 1, Math.abs(tx));
      put(k, TABLE, hex("#7fc7b0"), ty < 0 ? 1.05 + rim * 0.3 : 0.45);
    } else if (Math.abs(x - 92) < 1.4 && y > 67 && y < st) {
      put(k, TABLE, hex("#5f9d8a"), 0.5);
    }
    for (const sponge of sponges) {
      const top = st - sponge.h;
      if (Math.abs(x - sponge.x) < 1.1 && y > top && y < st + 1) {
        const lip = y < top + 1.2;
        put(k, SPONGE, sponge.c, lip ? 1.2 : 0.6 + 0.3 * (1 - Math.abs(x - sponge.x)));
      }
    }
  }
  // staghorn branches, rasterised into the cells they cover
  for (const s of segments) {
    const minC = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - s.w - x0) / unit));
    const maxC = Math.min(cols - 1, Math.ceil((Math.max(s.ax, s.bx) + s.w - x0) / unit));
    const minR = Math.max(0, Math.floor((Math.min(s.ay, s.by) - s.w - y0) / unit));
    const maxR = Math.min(rows - 1, Math.ceil((Math.max(s.ay, s.by) + s.w - y0) / unit));
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const len2 = vx * vx + vy * vy || 1;
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        const k = row * cols + col;
        const px = X[k]! - s.ax;
        const py = Y[k]! - s.ay;
        const h = clamp((px * vx + py * vy) / len2);
        const dx = px - vx * h;
        const dy = py - vy * h;
        const d = Math.sqrt(dx * dx + dy * dy);
        const w = Math.max(unit * 0.6, s.w);
        if (d < w) {
          const tip = s.tip * h;
          const c: RGB = [mix(0.95, 0.85, tip), mix(0.62, 0.4, tip), mix(0.42, 0.95, tip)];
          put(k, STAG, c, 0.55 + 0.55 * (1 - d / w) - (dx > 0 ? 0.15 : 0));
        }
      }
    }
  }

  const cellAt = (x: number, y: number) => {
    const col = Math.floor((x - x0) / unit);
    const row = Math.floor((y - y0) / unit);
    return col < 0 || col >= cols || row < 0 || row >= rows ? -1 : row * cols + col;
  };
  const write = (cells: Cells, x: number, y: number, text: string, c: RGB) => {
    for (let i = 0; i < text.length; i++) {
      const k = cellAt(x + i * unit, y);
      if (k < 0) continue;
      cells.glyph[k] = text.charCodeAt(i);
      cells.r[k] = c[0];
      cells.g[k] = c[1];
      cells.b[k] = c[2];
    }
  };
  const school = Array.from({ length: 46 }, (_, i) => ({
    ring: 4 + hash(i, 1) * 9,
    phase: i * 2.399,
    lift: (hash(i, 2) - 0.5) * 5,
    speed: 0.45 + hash(i, 3) * 0.2,
    tint: hash(i, 4),
  }));
  const ANEMONE_X = 46;
  const ANEMONE_Y = sandTop(46) + 0.5;

  return (t: number, cells: Cells) => {
    const { r, g, b, floor, glyph } = cells;
    for (let k = 0; k < n; k++) {
      const x = X[k]!;
      const y = Y[k]!;
      const m = mat[k]!;
      let cr = sr[k]!;
      let cg = sg[k]!;
      let cb = sb[k]!;
      const deep = y / 100;
      // god rays leaning down from the sun at the upper left
      const q = x - y * 0.42;
      const ray = smooth(0.5, 0.9, noise(q * 0.06 + t * 0.05, t * 0.09)) * smooth(96, 4, y) * 0.62;
      if (m === AIR || m === BACK) {
        const murk = m === AIR ? 0.62 : 0.85;
        cr = cr * murk + ray * 0.55;
        cg = cg * murk + ray * 0.85;
        cb = cb * murk + ray * 0.8;
        // the underside of the surface, bright and moving
        if (y < 10) {
          const surf = smooth(0.5, 0.8, noise(x * 0.16 + t * 0.35, y * 0.7 - t * 0.25)) * smooth(10, 0, y);
          cr += surf * 0.7;
          cg += surf * 0.85;
          cb += surf * 0.8;
        }
        // marine snow
        if (hash(k, Math.floor(t * 2 + hash(k, 3) * 8)) > 0.9985) {
          cr += 0.4;
          cg += 0.45;
          cb += 0.45;
        }
        floor[k] = m === BACK ? 0.1 : 0.06;
      } else {
        // caustics on everything the light reaches
        const c1 = noise(x * 0.32 + t * 0.4, y * 0.55 - t * 0.1);
        const c2 = noise(x * 0.28 - t * 0.3, y * 0.6 + 4 + t * 0.15);
        const caustic = Math.pow(clamp(1 - Math.abs(c1 - c2) * 3.2), 5) * (1.2 - deep * 0.6);
        const lit = 1 + caustic * 0.9 + ray * 0.6;
        cr *= lit;
        cg *= lit;
        cb *= lit;
        floor[k] = 0.1;
      }
      r[k] = cr;
      g[k] = cg;
      b[k] = cb;
    }

    // the anemone's tentacles, swaying, and its clownfish
    for (let i = 0; i < 22; i++) {
      const a = (i / 21 - 0.5) * 2.4;
      const len = 6 + hash(i, 21) * 3;
      for (let s = 0; s < len; s += unit * 0.8) {
        const sway = Math.sin(t * 1.4 + s * 0.35 + i * 0.4) * 0.25 * (s / len);
        const ang = a * (0.35 + s / len * 0.4) + sway;
        const k = cellAt(ANEMONE_X + Math.sin(ang) * s * 1.1, ANEMONE_Y - Math.cos(ang) * s * 0.9);
        if (k < 0) continue;
        const tip = s / len;
        r[k] = mix(0.85, 1, tip);
        g[k] = mix(0.45, 0.78, tip);
        b[k] = mix(0.75, 0.88, tip);
        floor[k] = 0.3;
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = t * (0.5 + i * 0.12) + i * 2.1;
      const fx = ANEMONE_X + Math.cos(a) * (6 + i * 2) - 1;
      const fy = ANEMONE_Y - 8 + Math.sin(a * 1.3) * 2.2 - i;
      write(cells, fx, fy, -Math.sin(a) > 0 ? "><>" : "<><", [1, 0.52, 0.16]);
    }

    // the turtle, gliding left to right and around again
    const period = 70;
    const tt = ((t / period) % 1) * (W + 50) - 25;
    const turtleY = 36 + Math.sin(t * 0.21) * 5;
    const beat = Math.sin(t * 1.6);
    const tc = Math.max(0, Math.floor((tt - 10 - x0) / unit));
    const tcEnd = Math.min(cols - 1, Math.ceil((tt + 10 - x0) / unit));
    const trStart = Math.max(0, Math.floor((turtleY - 9 - y0) / unit));
    const trEnd = Math.min(rows - 1, Math.ceil((turtleY + 9 - y0) / unit));
    for (let row = trStart; row <= trEnd; row++) {
      for (let col = tc; col <= tcEnd; col++) {
        const k = row * cols + col;
        const dx = X[k]! - tt;
        const dy = Y[k]! - turtleY;
        let hit = 0;
        let cr = 0;
        let cg = 0;
        let cb = 0;
        // front flippers, long and sweeping, one mirrored onto each side of the shell
        const fa = 0.9 + beat * 0.45;
        for (const side of [-1, 1]) {
          const fx = dx - 2.2;
          const fy = -side * dy + 1.5;
          const along = fx * Math.cos(fa) + fy * Math.sin(fa);
          const across = -fx * Math.sin(fa) + fy * Math.cos(fa);
          if (along < 1 && along > -7 && Math.abs(across) < 1.1 - along * -0.08) {
            hit = 1;
            cr = 0.34;
            cg = 0.42;
            cb = 0.3;
          }
        }
        const ex = dx / 6.2;
        const ey = dy / 4.1;
        const shell = ex * ex + ey * ey;
        if (shell < 1) {
          // scutes: a coarse cell pattern, edged darker
          const sx = Math.floor((dx + 20) / 2.4);
          const sy = Math.floor((dy + 20) / 2.2 + (sx & 1) * 0.5);
          const seam = hash(sx, sy) * 0.25;
          const top = clamp(0.8 - ey * 0.5);
          hit = 1;
          cr = (0.42 + seam) * top;
          cg = (0.36 + seam * 0.8) * top;
          cb = (0.18 + seam * 0.3) * top;
        }
        const hx = dx - 7.6;
        if (hx * hx + dy * dy * 1.6 < 3.2) {
          hit = 1;
          cr = 0.6;
          cg = 0.62;
          cb = 0.42;
        }
        if (hit) {
          const lit = 1 + 0.4 * smooth(0.6, 0.9, noise(X[k]! * 0.4 + t * 0.4, Y[k]! * 0.6));
          r[k] = cr * lit;
          g[k] = cg * lit;
          b[k] = cb * lit;
          glyph[k] = 0;
          floor[k] = 0.3;
        }
      }
    }

    // moon jellies, glowing faintly, pulsing their way up through the water
    for (let i = 0; i < 3; i++) {
      const life = 70;
      const rise = ((t * 1.1 + i * 23) % life) / life;
      const jx = 30 + i * 47 + Math.sin(t * 0.07 + i * 2) * 8;
      const jy = 66 - rise * 78;
      const pulse = Math.sin(t * 1.8 + i * 1.7);
      const R = 3.4 + 0.45 * pulse;
      const H = 2.6 - 0.4 * pulse;
      const fade = smooth(0, 0.12, rise) * smooth(1, 0.85, rise);
      if (fade <= 0) continue;
      const c0 = Math.max(0, Math.floor((jx - R - 2 - x0) / unit));
      const c1 = Math.min(cols - 1, Math.ceil((jx + R + 2 - x0) / unit));
      const r0 = Math.max(0, Math.floor((jy - H - 1 - y0) / unit));
      const r1 = Math.min(rows - 1, Math.ceil((jy + 12 - y0) / unit));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const k = row * cols + col;
          const dx = X[k]! - jx;
          const dy = Y[k]! - jy;
          let a = 0;
          if (dy <= 0.4) {
            // the bell: a dome, brighter at its rim and its four gonads
            const e = (dx / R) ** 2 + (dy / H) ** 2;
            if (e < 1) {
              const rim = smooth(0.55, 1, e);
              const ring = smooth(0.18, 0.05, Math.abs(Math.hypot(dx * 0.9, dy * 1.6) - R * 0.4));
              a = 0.35 + 0.5 * rim + 0.5 * ring;
            }
          } else if (Math.abs(dx) < R * 0.95) {
            // trailing tentacles and the frilled oral arms
            const sway = Math.sin(dy * 0.55 - t * 2.2 + dx) * (0.25 + dy * 0.08);
            const lane = Math.abs(((dx + sway) / (R * 0.32) + 100) % 1 - 0.5);
            const len = 7 + 4 * hash(Math.floor(dx * 2), i);
            if (lane < 0.16 && dy < len) a = 0.55 * (1 - dy / len);
          }
          if (a <= 0) continue;
          a *= fade;
          r[k] = mix(r[k]!, 1.0, a * 0.8) + a * 0.25;
          g[k] = mix(g[k]!, 0.62, a * 0.8) + a * 0.12;
          b[k] = mix(b[k]!, 0.95, a * 0.8) + a * 0.25;
          glyph[k] = 0;
          floor[k] = Math.max(floor[k]!, 0.2 * a);
        }
      }
    }

    // fusiliers: a school turning as one
    const cx = 92 + Math.sin(t * 0.09) * 32;
    const cy = 30 + Math.sin(t * 0.13) * 8;
    for (const fish of school) {
      const a = t * fish.speed + fish.phase;
      const fx = cx + Math.cos(a) * fish.ring * 2;
      const fy = cy + Math.sin(a) * fish.ring * 0.55 + fish.lift;
      const right = -Math.sin(a) > 0;
      const k = cellAt(fx, fy);
      if (k < 0) continue;
      glyph[k] = (right ? ">" : "<").charCodeAt(0);
      r[k] = mix(0.55, 1, fish.tint);
      g[k] = mix(0.85, 0.9, fish.tint);
      b[k] = mix(1, 0.35, fish.tint);
    }
    // a lone yellow fish taking its time
    const lx = W + 20 - ((t * 4) % (W + 60));
    write(cells, lx, 58 + Math.sin(t * 0.5) * 2, "<º)))><", [1, 0.86, 0.28]);

    // bubbles from the reef
    for (let i = 0; i < 18; i++) {
      const src = i % 3 === 0 ? 22 : i % 3 === 1 ? 104 : 139;
      const life = 9 + hash(i, 31) * 6;
      const age = (t + hash(i, 32) * life) % life;
      const by = 78 - age * 7;
      const bx = src + Math.sin(age * 2.2 + i) * 1.2 + (hash(i, 33) - 0.5) * 4;
      const k = cellAt(bx, by);
      if (k < 0 || by < 1) continue;
      glyph[k] = (age > life * 0.5 ? "o" : age > life * 0.2 ? "°" : ".").charCodeAt(0);
      r[k] = 0.85;
      g[k] = 0.97;
      b[k] = 1;
    }
  };
}

// Bubbles drifting up over the page.
function weather(width: number, height: number): Weather {
  const count = Math.round(Math.min(34, (width * height) / 36000));
  const bubbles = Array.from({ length: count }, (_, i) => ({
    x: hash(i, 1) * width,
    phase: hash(i, 2),
    rise: 22 + hash(i, 3) * 34,
    size: 1.5 + hash(i, 4) * 4,
  }));
  return (t, ctx) => {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    for (const bubble of bubbles) {
      const span = height + 30;
      const y = height + 15 - ((bubble.phase * span + t * bubble.rise) % span);
      const x = bubble.x + Math.sin(t * 1.1 + bubble.phase * 12) * 10;
      ctx.strokeStyle = `rgba(200, 248, 255, ${0.12 + 0.16 * (1 - y / height)})`;
      ctx.beginPath();
      ctx.arc(x, y, bubble.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
}

export const scene: SceneProgram = {
  veil: { identity: 0.5, content: 0.36 },
  fps: 15,
  focusX: 0.4,
  focusY: 0.6,
  build,
  weather,
  title(u, v, t, out) {
    // shallow-water aqua with caustic light crawling over it
    const c1 = noise(u * 6 + t * 0.5, v * 3 - t * 0.2);
    const c2 = noise(u * 5 - t * 0.4, v * 3.5 + 3);
    const caustic = Math.pow(clamp(1 - Math.abs(c1 - c2) * 3), 4);
    out[0] = mix(0.32, 0.18, v) + caustic * 0.7;
    out[1] = mix(0.96, 0.7, v) + caustic * 0.35;
    out[2] = mix(0.9, 1.0, v) + caustic * 0.2;
  },
};
