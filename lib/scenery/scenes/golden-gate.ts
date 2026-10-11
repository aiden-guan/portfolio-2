import { clamp, fbm, hash, mix, noise, smooth } from "../math";
import { loadPhoto, region, sample, type Photo } from "../photo";
import type { Cells, Grid, SceneProgram, Weather } from "../types";

// The Golden Gate from the Presidio's bluffs on a bright afternoon: the bay
// glitters, the coastal scrub moves in the wind, gulls cross, and a bank of
// fog creeps in low over the Marin headlands.

const WIDTH = (100 * 16) / 9;
const WATER = 1;
const SKY = 2;
const SCRUB = 3;
const GULL = "v".charCodeAt(0);

let photo: Photo | null = null;

function build(grid: Grid) {
  const p = photo!;
  const { cols, rows, X, Y, unit, x0, y0 } = grid;
  const n = cols * rows;
  const base = new Float32Array(n * 3);
  const kind = new Uint8Array(n);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const u = X[k]! / WIDTH;
    const v = Y[k]! / 100;
    sample(p, u, v, tmp);
    base.set(tmp, k * 3);
    kind[k] = region(p, u, v);
  }
  const gulls = Array.from({ length: 5 }, (_, i) => ({
    y: 8 + hash(i, 1) * 26,
    speed: 3 + hash(i, 2) * 3,
    phase: hash(i, 3) * WIDTH * 1.4,
    bob: hash(i, 4) * 6,
  }));

  return (t: number, cells: Cells) => {
    const { r, g, b, floor, glyph } = cells;
    for (let k = 0; k < n; k++) {
      const x = X[k]!;
      const y = Y[k]!;
      const v = y / 100;
      let cr = base[k * 3]!;
      let cg = base[k * 3 + 1]!;
      let cb = base[k * 3 + 2]!;
      const m = kind[k]!;
      floor[k] = 0.08;
      if (m === SKY) {
        const du = (fbm(x * 0.025 + t * 0.03, y * 0.08, 3) - 0.5) * 0.04;
        const dv = (fbm(x * 0.025 + 5, y * 0.08 - t * 0.02, 3) - 0.5) * 0.02;
        const u2 = x / WIDTH + du;
        const v2 = v + dv;
        if (region(p, u2, v2) === SKY) {
          sample(p, u2, v2, tmp);
          cr = tmp[0];
          cg = tmp[1];
          cb = tmp[2];
        }
      } else if (m === WATER) {
        const du = (noise(x * 0.2, y * 1.6 + t * 0.6) - 0.5) * 0.006;
        const u2 = x / WIDTH + du;
        if (region(p, u2, v) === WATER) {
          sample(p, u2, v, tmp);
          cr = tmp[0];
          cg = tmp[1];
          cb = tmp[2];
        }
        const swell = 0.82 + 0.3 * noise(x * 0.5 - t * 0.4, y * 2.6 + t * 0.3);
        cr *= swell;
        cg *= swell;
        cb *= swell;
        // sun on the chop, thicker toward the light on the left
        const glint = smooth(0.8, 0.96, noise(x * 1.2 + t * 0.9, y * 4.5 - t * 1.4)) * (1.1 - x / WIDTH);
        cr += glint;
        cg += glint * 0.95;
        cb += glint * 0.85;
      } else if (m === SCRUB) {
        const gust = noise(x * 0.04 - t * 0.5, y * 0.05);
        const du = Math.sin(t * 1.6 + x * 0.3 + y * 0.2) * 0.0025 * (0.5 + gust);
        if (region(p, x / WIDTH + du, v) === SCRUB) {
          sample(p, x / WIDTH + du, v, tmp);
          cr = tmp[0];
          cg = tmp[1];
          cb = tmp[2];
        }
        const lit = 0.9 + 0.25 * gust;
        cr *= lit;
        cg *= lit;
        cb *= lit;
      }
      // fog bank sliding in over the headlands, under the deck
      const low = smooth(0.38, 0.45, v) * smooth(0.56, 0.48, v) * smooth(0.45, 0.75, x / WIDTH);
      if (low > 0 && m !== SCRUB) {
        const red = cr > cg * 1.5 ? 0.25 : 1;
        const f = smooth(0.42, 0.72, fbm(x * 0.05 - t * 0.12, y * 0.2, 4)) * low * 0.85 * red;
        cr = mix(cr, 0.95, f);
        cg = mix(cg, 0.95, f);
        cb = mix(cb, 0.98, f);
      }
      r[k] = cr * 1.05;
      g[k] = cg * 1.05;
      b[k] = cb * 1.05;
    }
    // sailboats tacking slowly across the bay, smaller toward the horizon
    for (let i = 0; i < 4; i++) {
      const by = 100 * (0.565 + i * 0.045);
      const size = 1.6 + i * 0.9;
      const dir = i % 2 === 0 ? 1 : -1;
      const span = WIDTH * 0.72;
      const bx = WIDTH * 0.27 + ((((hash(i, 8) * span + dir * t * (0.5 + i * 0.25)) % span) + span) % span);
      const c0 = Math.max(0, Math.floor((bx - size - x0) / unit));
      const c1 = Math.min(cols - 1, Math.ceil((bx + size - x0) / unit));
      const r0 = Math.max(0, Math.floor((by - size * 1.8 - y0) / unit));
      const r1 = Math.min(rows - 1, Math.ceil((by + size * 0.3 - y0) / unit));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const k = row * cols + col;
          const dx = (X[k]! - bx) * dir;
          const dy = Y[k]! - by;
          const h = size * 1.8;
          if (dy < 0 && dy > -h && dx > -0.1 * size && dx < size * 0.75 * (1 + dy / h)) {
            r[k] = 1;
            g[k] = 0.98;
            b[k] = 0.95;
          } else if (dy >= 0 && dy < size * 0.3 && Math.abs(dx - size * 0.2) < size * 0.6) {
            r[k] = 0.16;
            g[k] = 0.15;
            b[k] = 0.2;
          }
        }
      }
    }

    // gulls crossing, wings beating between v and -
    for (const gull of gulls) {
      const gx = ((gull.phase + t * gull.speed) % (WIDTH * 1.4)) - WIDTH * 0.2;
      const gy = gull.y + Math.sin(t * 0.7 + gull.bob) * 1.5;
      const col = Math.floor((gx - x0) / unit);
      const row = Math.floor((gy - y0) / unit);
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      const k = row * cols + col;
      glyph[k] = Math.sin(t * 7 + gull.bob) > 0 ? GULL : "-".charCodeAt(0);
      r[k] = 0.2;
      g[k] = 0.22;
      b[k] = 0.28;
    }
  };
}

// Pollen and salt in the low sun, catching the light as they turn.
function weather(width: number, height: number): Weather {
  const count = Math.round(Math.min(40, (width * height) / 32000));
  const motes = Array.from({ length: count }, (_, i) => ({
    x: hash(i, 1) * width,
    y: hash(i, 2) * height,
    phase: hash(i, 3) * 10,
    size: 1 + hash(i, 4) * 1.6,
  }));
  return (t, ctx) => {
    ctx.clearRect(0, 0, width, height);
    for (const mote of motes) {
      const x = (mote.x + t * 9 + Math.sin(t * 0.5 + mote.phase) * 24) % width;
      const y = (mote.y - t * 4 + Math.cos(t * 0.4 + mote.phase) * 18 + height) % height;
      const a = 0.12 + 0.3 * Math.max(0, Math.sin(t * 1.2 + mote.phase * 3));
      ctx.fillStyle = `rgba(214, 150, 60, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

export const scene: SceneProgram = {
  veil: { identity: 0.4, content: 0.26 },
  light: true,
  anchor: { x: 96, y: 40, atY: 0.42, zoom: 1.3 },
  fps: 15,
  focusX: 0.56,
  focusY: 0.45,
  width: WIDTH,
  height: 100,
  async load() {
    photo ??= await loadPhoto("/scenery/golden-gate.webp", "/scenery/golden-gate-mask.png");
  },
  build,
  weather,
  title(u, v, t, out) {
    // international orange warming to gold, a band of fog drifting through it
    const k = clamp(u * 0.8 + v * 0.4);
    const fog = smooth(0.55, 0.9, noise(u * 3 - t * 0.35, v * 1.5)) * 0.55;
    out[0] = mix(mix(0.75, 0.45, k), 0.7, fog);
    out[1] = mix(mix(0.2, 0.1, k), 0.66, fog);
    out[2] = mix(mix(0.12, 0.08, k), 0.62, fog);
  },
};
