import { clamp } from "@/components/break/physics";
type Pixel = {
  ear?: boolean;
  blush?: number;
  reveal?: number;
  repair?: number;
  evil?: number;
  col: number;
  row: number;
  ink: number;
  alive: boolean;
  loose: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
};
export const PALETTE = [
  "#243c2c",
  "#385440",
  "#688363",
  "#a1bb8a",
  "#d8e4bb",
  "#f0efce",
];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function originalPortrait(image: HTMLImageElement) {
  const cols = 62,
    rows = 70;
  const sample = document.createElement("canvas");
  sample.width = cols;
  sample.height = rows;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Portrait canvas unavailable");
  ctx.drawImage(
    image,
    image.width * 0.105,
    image.height * 0.105,
    image.width * 0.72,
    image.height * 0.82,
    0,
    0,
    cols,
    rows,
  );
  const rgba = ctx.getImageData(0, 0, cols, rows).data;
  const pixels: Pixel[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = rgba[i],
        g = rgba[i + 1],
        b = rgba[i + 2];
      const u = col / cols,
        v = row / rows;
      const luminance = r * 0.299 + g * 0.587 + b * 0.114;
      const hair = luminance < 81;
      const skin = r - g > 13 && r - b > 23;
      // Background removal stays local, sampled from the supplied portrait.
      const half =
        v < 0.18 ? 0.3 + v * 0.95 : v < 0.51 ? 0.47 : 0.47 - (v - 0.51) * 0.43;
      if ((!hair && !skin) || Math.abs(u - 0.51) > half || v > 0.98) continue;
      if (v > 0.78 && ((u - 0.51) / 0.3) ** 2 + ((v - 0.78) / 0.24) ** 2 > 1)
        continue;
      const dither = (BAYER[(row % 4) * 4 + (col % 4)] / 16 - 0.5) * 26;
      const ink = clamp(
        Math.floor((luminance + dither - 18) / 34),
        0,
        PALETTE.length - 1,
      );
      pixels.push({
        col,
        row,
        ink,
        alive: true,
        loose: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  // Keep the connected portrait and discard stray background islands.
  const byPosition = new Map(pixels.map((p) => [p.row * cols + p.col, p]));
  const visited = new Set<number>();
  let largest: Pixel[] = [];
  for (const pixel of pixels) {
    const key = pixel.row * cols + pixel.col;
    if (visited.has(key)) continue;
    const component: Pixel[] = [],
      pending = [key];
    visited.add(key);
    while (pending.length) {
      const next = pending.pop()!,
        p = byPosition.get(next)!;
      component.push(p);
      for (const neighbor of [
        next - cols,
        next + cols,
        ...(p.col > 0 ? [next - 1] : []),
        ...(p.col < cols - 1 ? [next + 1] : []),
      ]) {
        if (byPosition.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (pixels.length < 100) throw new Error("Portrait could not be sampled");
  return { cols, rows, pixels: largest };
}

export function guestPortrait(image: HTMLImageElement, dog: boolean) {
  const cols = 62,
    rows = 70;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const iw = image.naturalWidth,
    ih = image.naturalHeight;
  if (dog)
    ctx.drawImage(image, iw * 0.49, 0, iw * 0.43, ih * 0.83, 0, 0, cols, rows);
  else ctx.drawImage(image, 0, ih * 0.05, iw, ih * 0.69, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const pixels: Pixel[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const at = (row * cols + col) * 4;
      if (data[at + 3] < 90) continue;
      const light =
        data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
      const dither = (BAYER[(row % 4) * 4 + (col % 4)] / 16 - 0.5) * 26;
      pixels.push({
        col,
        row,
        ink: clamp(Math.floor((light + dither - 18) / 34), 0, 5),
        alive: true,
        loose: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  return { cols, rows, pixels };
}
export type PixelPortrait = ReturnType<typeof originalPortrait>;
