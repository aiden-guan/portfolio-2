import { clamp, fbm, hash, mix, noise, smooth } from "../math";
import { loadPhoto, region, sample, type Photo } from "../photo";
import type { Cells, Grid, SceneProgram, Weather } from "../types";

// Alpine lakes under a burning dusk, peaks on either side, larch gold in the
// valley. The sky's cloud is kept slowly billowing, the lakes ripple and hold
// the sunset, and a thin mist slides along the valley floor.

const WIDTH = (100 * 678) / 452;
const WATER = 1;
const SKY = 2;

let photo: Photo | null = null;

function build(grid: Grid) {
  const p = photo!;
  const { cols, rows, X, Y, unit } = grid;
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
  const exposure = 1.3;

  return (t: number, cells: Cells) => {
    const { r, g, b, floor } = cells;
    // now and then a meteor, low across the evening sky
    const cycle = Math.floor(t / 13);
    const age = t - cycle * 13 - 4;
    const meteor = age > 0 && age < 0.9;
    const mx = WIDTH * (0.12 + 0.55 * hash(cycle, 1)) + age * 70;
    const my = 3 + 9 * hash(cycle, 2) + age * 22;
    const trail = 14;
    for (let k = 0; k < n; k++) {
      const x = X[k]!;
      const y = Y[k]!;
      const v = y / 100;
      let cr = base[k * 3]!;
      let cg = base[k * 3 + 1]!;
      let cb = base[k * 3 + 2]!;
      const m = kind[k]!;
      floor[k] = 0.1;
      if (m === SKY) {
        // the cloud turns over on itself without travelling off the page
        const du = (fbm(x * 0.03 + t * 0.025, y * 0.07, 3) - 0.5) * 0.05;
        const dv = (fbm(x * 0.03 + 7, y * 0.07 - t * 0.02, 3) - 0.5) * 0.025;
        const u2 = x / WIDTH + du;
        const v2 = v + dv;
        if (region(p, u2, v2) === SKY) {
          sample(p, u2, v2, tmp);
          cr = tmp[0];
          cg = tmp[1];
          cb = tmp[2];
        }
        const glow = 1 + 0.18 * Math.sin(t * 0.25 + x * 0.02);
        cr *= glow;
        cg *= glow;
        floor[k] = 0.16;
        // the first stars, where the sky has already gone dark
        const dark = smooth(0.32, 0.12, cr + cg + cb) * smooth(0.3, 0.05, v);
        const h = hash(Math.floor(x / unit), Math.floor(y / unit) + 91);
        if (dark > 0 && h > 0.985) {
          const tw = (0.55 + 0.45 * Math.sin(t * (1.2 + h * 40) + h * 300)) * dark;
          cr += tw * 0.85;
          cg += tw * 0.85;
          cb += tw;
        }
        if (meteor) {
          // distance back along the streak from its head
          const dx = mx - x;
          const dy = my - y;
          const along = (dx * 0.954 + dy * 0.3) / trail;
          const across = Math.abs(-dx * 0.3 + dy * 0.954);
          if (along > 0 && along < 1 && across < unit * 0.9) {
            const a = (1 - along) * (1 - across / (unit * 0.9)) * Math.sin((age / 0.9) * Math.PI) * 1.6;
            cr += a;
            cg += a * 0.95;
            cb += a * 0.85;
          }
        }
      } else if (m === WATER) {
        const du = (noise(x * 0.18, y * 1.4 + t * 0.5) - 0.5) * 0.008;
        const dv = (noise(x * 0.6 - t * 0.3, y * 2.5) - 0.5) * 0.004;
        const u2 = x / WIDTH + du;
        const v2 = v + dv;
        if (region(p, u2, v2) === WATER) {
          sample(p, u2, v2, tmp);
          cr = tmp[0];
          cg = tmp[1];
          cb = tmp[2];
        }
        const shimmer = 0.85 + 0.35 * noise(x * 0.9, y * 4 - t * 1.6);
        cr *= shimmer;
        cg *= shimmer;
        cb *= shimmer;
        // glints where the sunset lands on a ripple
        const glint = smooth(0.78, 0.95, noise(x * 1.4 + t * 0.6, y * 5 - t)) * (cr + cg) * 1.6;
        cr += glint;
        cg += glint * 0.75;
        cb += glint * 0.6;
        floor[k] = 0.18;
      }
      // valley mist, lit pink from the sky
      const band = smooth(0.4, 0.5, v) * smooth(0.66, 0.52, v);
      if (band > 0) {
        const mist = smooth(0.48, 0.78, fbm(x * 0.05 - t * 0.05, y * 0.25, 3)) * band * 0.22;
        cr = mix(cr, 0.72, mist);
        cg = mix(cg, 0.52, mist);
        cb = mix(cb, 0.62, mist);
      }
      r[k] = cr * exposure;
      g[k] = cg * exposure;
      b[k] = cb * exposure;
    }
  };
}

// Larch needles, gold, drifting down on the wind.
function weather(width: number, height: number): Weather {
  const count = Math.round(Math.min(46, (width * height) / 30000));
  const leaves = Array.from({ length: count }, (_, i) => ({
    x: hash(i, 1) * width,
    phase: hash(i, 2),
    fall: 18 + hash(i, 3) * 30,
    drift: 14 + hash(i, 4) * 26,
    size: 7 + hash(i, 5) * 6,
    hue: hash(i, 6),
  }));
  return (t, ctx) => {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const leaf of leaves) {
      const span = height + 40;
      const y = ((leaf.phase * span + t * leaf.fall) % span) - 20;
      const x = (leaf.x + t * leaf.drift + Math.sin(t * 1.3 + leaf.phase * 9) * 18) % (width + 40) - 20;
      const flip = Math.sin(t * 2.4 + leaf.phase * 20);
      ctx.font = `${leaf.size}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = `rgba(${mix(242, 255, leaf.hue) | 0}, ${mix(176, 214, leaf.hue) | 0}, 92, ${0.28 + 0.3 * Math.abs(flip)})`;
      ctx.fillText(Math.abs(flip) > 0.5 ? "•" : "·", x, y);
    }
  };
}

export const scene: SceneProgram = {
  veil: { identity: 0.62, content: 0.52 },
  fps: 15,
  focusX: 0.5,
  focusY: 0.55,
  width: WIDTH,
  height: 100,
  async load() {
    photo ??= await loadPhoto("/scenery/rockies.webp", "/scenery/rockies-mask.png");
  },
  build,
  weather,
  title(u, v, t, out) {
    // snow on top, alpenglow under it, dusk violet at the foot
    const k = clamp(v + 0.08 * Math.sin(u * 5 + t * 0.4));
    const sparkle = hash((u * 97) | 0, ((v * 31) | 0) + Math.floor(t * 3)) > 0.93 ? 0.35 : 0;
    out[0] = mix(1.0, 0.98, k) + sparkle;
    out[1] = mix(0.94, 0.48, k) + sparkle;
    out[2] = mix(0.9, 0.62, k * k) + sparkle;
  },
};
