// Small, allocation-free helpers shared by the scenery shaders.

export function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let norm = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export function smooth(a: number, b: number, v: number) {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
}

export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export type RGB = [number, number, number];

export function hex(css: string): RGB {
  return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16) / 255) as RGB;
}

// Linear interpolation through a list of colour stops spread evenly over 0..1.
export function ramp(stops: RGB[], k: number, out: RGB) {
  const n = stops.length - 1;
  const p = clamp(k) * n;
  const i = Math.min(n - 1, Math.floor(p));
  const f = p - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}
