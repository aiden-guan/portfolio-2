import { clamp, fbm, hash, mix, noise, smooth } from "../math";
import { loadPhoto, region, sample, type Photo } from "../photo";
import type { Cells, Grid, SceneProgram, Weather } from "../types";

// Chongqing from across the Jialing: Qiansimen bridge, Hongyadong's stacked
// halls lit gold, and the LED tower spelling 重庆你好 · 世界你好. The photo is
// the base; rain, the river's ripple, the city's twinkle and the tower's
// scrolling light are painted over it every frame.

const WIDTH = (100 * 2000) / 1292;
const WATER = 1;
const LED = 2;
const LIGHTS = 3;
const SLASH = "/".charCodeAt(0);
const BAR = "|".charCodeAt(0);
const RING = "o".charCodeAt(0);
const DOT = "·".charCodeAt(0);

let photo: Photo | null = null;

function build(grid: Grid) {
  const p = photo!;
  const { cols, rows, X, Y } = grid;
  const n = cols * rows;
  const base = new Float32Array(n * 3);
  const kind = new Uint8Array(n);
  const rnd = new Float32Array(n);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const u = X[k]! / WIDTH;
    const v = Y[k]! / 100;
    sample(p, u, v, tmp);
    base[k * 3] = tmp[0];
    base[k * 3 + 1] = tmp[1];
    base[k * 3 + 2] = tmp[2];
    kind[k] = region(p, u, v);
    rnd[k] = hash(k % cols, (k / cols) | 0);
  }
  const exposure = 1.45;

  return (t: number, cells: Cells) => {
    const { r, g, b, floor, glyph } = cells;
    // sheet lightning behind the cloud every so often: a flash, a pause, a flicker
    const storm = t % 17;
    const flash =
      storm > 9 && storm < 9.12
        ? 1
        : storm > 9.22 && storm < 9.3
          ? 0.55
          : storm > 9.3 && storm < 9.9
            ? 0.25 * (9.9 - storm)
            : 0;
    for (let row = 0, k = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++, k++) {
        const x = X[k]!;
        const y = Y[k]!;
        const v = y / 100;
        let cr = base[k * 3]!;
        let cg = base[k * 3 + 1]!;
        let cb = base[k * 3 + 2]!;
        const m = kind[k]!;
        floor[k] = 0.1;
        if (m === WATER) {
          const du = (noise(x * 0.12, y * 1.3 + t * 0.7) - 0.5) * 0.012;
          const dv = (noise(x * 0.5 + t * 0.4, y * 2.2) - 0.5) * 0.006;
          const u2 = x / WIDTH + du;
          const v2 = v + dv;
          if (region(p, u2, v2) === WATER) {
            sample(p, u2, v2, tmp);
          } else {
            tmp[0] = cr;
            tmp[1] = cg;
            tmp[2] = cb;
          }
          const shimmer = 0.75 + 0.55 * noise(x * 0.7, y * 3.2 - t * 2.4) + flash * 0.6;
          cr = tmp[0] * shimmer;
          cg = tmp[1] * shimmer;
          cb = tmp[2] * shimmer;
          floor[k] = 0.14;
          // rain landing on the river
          const beat = Math.floor(t * 5 + rnd[k]! * 40);
          const ring = hash(col * 17 + beat, row * 3 + beat);
          if (ring > 0.994) {
            glyph[k] = ring > 0.997 ? RING : DOT;
            cr = cr * 0.6 + 0.45;
            cg = cg * 0.6 + 0.48;
            cb = cb * 0.6 + 0.55;
          }
        } else if (m === LED) {
          // the tower's characters, a band of light running down them
          const wave = Math.pow(Math.max(0, Math.sin(y * 0.22 - t * 2.2)), 6);
          const s = 0.55 + 0.35 * Math.sin(t * 0.9) + 1.1 * wave;
          cr *= s;
          cg *= s;
          cb *= s * 1.04;
        } else if (m === LIGHTS) {
          const s = 0.72 + 0.5 * noise(rnd[k]! * 97, t * 1.6);
          cr *= s;
          cg *= s;
          cb *= s;
        } else if (v < 0.5) {
          // low cloud dragged across the sky, lit from below by the city
          const cloud = fbm(x * 0.035 - t * 0.035, y * 0.09 + t * 0.008, 3);
          const w = smooth(0.5, 0.05, v);
          const s = 1 + w * (cloud - 0.45) * 1.3;
          cr *= s;
          cg *= s;
          cb *= s;
          if (flash > 0) {
            const lit = flash * w * (0.25 + cloud) * 0.6;
            cr += lit * 0.8;
            cg += lit * 0.85;
            cb += lit;
          }
          floor[k] = 0.12;
        }
        cr *= exposure;
        cg *= exposure;
        cb *= exposure;
        // rain: slanted streaks falling across everything
        const lane = col + Math.floor(row * 0.34);
        if (hash(lane, 5) < 0.3) {
          const period = 30 + hash(lane, 9) * 26;
          const pos = (((row - t * (34 + hash(lane, 11) * 20) - hash(lane, 13) * period) % period) + period) % period;
          if (pos < 2.4) {
            const a = clamp(0.35 + 0.65 * (1 - pos / 2.4)) * (0.55 + 0.45 * smooth(0, 0.3, v));
            glyph[k] = hash(lane, 17) > 0.5 ? SLASH : BAR;
            cr = mix(cr, 0.62 + cr * 0.4, a);
            cg = mix(cg, 0.66 + cg * 0.4, a);
            cb = mix(cb, 0.82 + cb * 0.4, a);
          }
        }
        r[k] = cr;
        g[k] = cg;
        b[k] = cb;
      }
    }
  };
}

function weather(width: number, height: number): Weather {
  const count = Math.round(Math.min(140, (width * height) / 9000));
  const drops = Array.from({ length: count }, (_, i) => ({
    x: hash(i, 1) * (width + 200),
    phase: hash(i, 2),
    speed: 700 + hash(i, 3) * 600,
    length: 14 + hash(i, 4) * 26,
    alpha: 0.05 + hash(i, 5) * 0.14,
  }));
  return (t, ctx) => {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    for (const d of drops) {
      const span = height + d.length * 2;
      const y = ((d.phase * span + t * d.speed) % span) - d.length;
      const x = d.x - y * 0.32;
      ctx.strokeStyle = `rgba(200, 214, 255, ${d.alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.length * 0.32, y + d.length);
      ctx.stroke();
    }
  };
}

export const scene: SceneProgram = {
  veil: { identity: 0.62, content: 0.5 },
  fps: 15,
  focusX: 0.62,
  focusY: 0.5,
  width: WIDTH,
  height: 100,
  async load() {
    photo ??= await loadPhoto("/scenery/chongqing.webp", "/scenery/chongqing-mask.png");
  },
  build,
  weather,
  title(u, v, t, out) {
    // a neon tube, pink running into cyan, with the odd stutter of a bad ballast
    const k = clamp(u * 1.1 - 0.05 + 0.12 * Math.sin(t * 0.6 + v * 2));
    const stutter = (t * 0.31) % 1 < 0.025 && u > 0.55 ? 0.35 : 1;
    const hum = (0.85 + 0.15 * Math.sin(t * 9 + u * 3)) * stutter;
    out[0] = mix(1.0, 0.25, k) * hum;
    out[1] = mix(0.22, 0.92, k) * hum;
    out[2] = mix(0.62, 1.0, k) * hum;
  },
};
