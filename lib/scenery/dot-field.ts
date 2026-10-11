import { DESIGN_H, DESIGN_W, type Cells, type Frame, type Grid } from "./types";

// Renders a frame of per-cell colours as dot "ascii": brightness picks the dot
// (six sizes) through an ordered dither, colour is quantised to a 1000-colour cube
// with the same dither, and each (glyph, colour) pair is drawn once into an
// atlas and copied into its cell. A frame only redraws cells whose glyph or
// colour changed. The dot-and-dither look follows the scenes on ascii.rest.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
// Six dot sizes, so tone steps finely; colour has ten levels a channel.
const DOT_RADIUS = [0, 0.1, 0.165, 0.23, 0.3, 0.38, 0.47];
const STEPS = DOT_RADIUS.length - 1;
const LEVELS = 9;
const ATLAS_COLS = 64;
const ATLAS_ROWS = 64;
const MONO = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';

export type DotFieldOptions = {
  // Fill for empty cells; null leaves them transparent.
  ground: string | null;
  // Ink on paper: dots grow with darkness instead of brightness.
  light?: boolean;
};

export class DotField {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement;
  private actx: CanvasRenderingContext2D;
  private slots = new Map<number, number>();
  private ground: string | null;
  private light: boolean;
  private xs = new Int32Array(0);
  private ys = new Int32Array(0);
  private last = new Uint32Array(0);
  private slot = 0;
  private slotPx = 0;
  private glow: ImageData | null = null;
  private sum = new Float32Array(0);
  private blur = new Float32Array(0);
  private dirty = new Int32Array(0);
  private flushed = false;
  cols = 0;
  rows = 0;
  cells: Cells = emptyCells(0);

  constructor(canvas: HTMLCanvasElement, options: DotFieldOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: options.ground === null })!;
    this.atlas = document.createElement("canvas");
    this.actx = this.atlas.getContext("2d")!;
    this.ground = options.ground;
    this.light = options.light ?? false;
  }

  // Sizes the canvas backing store to cols x rows cells of `cell` CSS pixels.
  resize(cols: number, rows: number, cell: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = cell * dpr;
    this.cols = cols;
    this.rows = rows;
    this.canvas.width = Math.round(cols * px);
    this.canvas.height = Math.round(rows * px);
    this.xs = Int32Array.from({ length: cols + 1 }, (_, i) => Math.round(i * px));
    this.ys = Int32Array.from({ length: rows + 1 }, (_, i) => Math.round(i * px));
    this.slot = Math.ceil(px);
    this.slotPx = this.slot + 2;
    this.atlas.width = this.slotPx * ATLAS_COLS;
    this.atlas.height = this.slotPx * ATLAS_ROWS;
    this.slots.clear();
    this.cells = emptyCells(cols * rows);
    this.last = new Uint32Array(cols * rows).fill(0xffffffff);
    this.dirty = new Int32Array(cols * rows);
    if (this.ground) {
      this.ctx.fillStyle = this.ground;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private sprite(key: number) {
    let s = this.slots.get(key);
    if (s !== undefined) return s;
    if (this.slots.size >= ATLAS_COLS * ATLAS_ROWS) {
      this.actx.clearRect(0, 0, this.atlas.width, this.atlas.height);
      this.slots.clear();
      this.flushed = true;
    }
    s = this.slots.size;
    const ox = (s % ATLAS_COLS) * this.slotPx + 1;
    const oy = Math.floor(s / ATLAS_COLS) * this.slotPx + 1;
    const code = key >>> 10;
    const ci = key & 1023;
    const q = (n: number) => Math.round((n * 255) / LEVELS);
    const ctx = this.actx;
    const size = this.slot;
    if (this.ground) {
      // Sprites carry their own ground, so a changed cell is one copy, not a clear and a copy.
      ctx.fillStyle = this.ground;
      ctx.fillRect(ox - 1, oy - 1, size + 2, size + 2);
    }
    ctx.fillStyle = `rgb(${q(Math.floor(ci / 100))},${q(Math.floor(ci / 10) % 10)},${q(ci % 10)})`;
    if (code <= STEPS) {
      ctx.beginPath();
      ctx.arc(ox + size / 2, oy + size / 2, Math.max(0.6, DOT_RADIUS[code]! * size), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, size, size);
      ctx.clip();
      ctx.font = `600 ${size * 1.12}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String.fromCharCode(code), ox + size / 2, oy + size / 2 + size * 0.04);
      ctx.restore();
    }
    this.slots.set(key, s);
    return s;
  }

  // `veil` dims cells behind the page's text (0..1 per cell), blended in by `amount`.
  // Paints a soft, low-resolution copy of the frame's light into `out`, one pixel
  // per `scale` x `scale` block of cells, for the page to screen over the dots.
  // Bright cells count for more, so lamps bloom and dim stone doesn't haze.
  bloom(out: CanvasRenderingContext2D, scale: number) {
    const { cols, rows, cells } = this;
    const { r, g, b } = cells;
    const w = Math.ceil(cols / scale);
    const h = Math.ceil(rows / scale);
    if (!this.glow || this.glow.width !== w || this.glow.height !== h) {
      this.glow = out.createImageData(w, h);
      this.sum = new Float32Array(w * h * 3);
      this.blur = new Float32Array(w * h * 3);
    }
    const sum = this.sum;
    const blur = this.blur;
    sum.fill(0);
    for (let y = 0, k = 0; y < rows; y++) {
      const row = Math.floor(y / scale) * w;
      for (let x = 0; x < cols; x++, k++) {
        const i = (row + Math.floor(x / scale)) * 3;
        const cr = Math.min(r[k]!, 1.6);
        const cg = Math.min(g[k]!, 1.6);
        const cb = Math.min(b[k]!, 1.6);
        sum[i] += cr * cr;
        sum[i + 1] += cg * cg;
        sum[i + 2] += cb * cb;
      }
    }
    // a 3 x 3 tent over the blocks, so the halo has no grid in it
    const norm = 1 / (scale * scale * 16);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let acc = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              acc += sum[(yy * w + xx) * 3 + c]! * (2 - Math.abs(dx)) * (2 - Math.abs(dy));
            }
          }
          blur[(y * w + x) * 3 + c] = acc * norm;
        }
      }
    }
    const data = this.glow.data;
    for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) {
      // Light as alpha over the dark ground: close to screening it, without
      // asking the compositor for a blend mode.
      const a = Math.min(1, Math.max(blur[i]!, blur[i + 1]!, blur[i + 2]!, 1e-3));
      data[j] = Math.min(255, (blur[i]! / a) * 255);
      data[j + 1] = Math.min(255, (blur[i + 1]! / a) * 255);
      data[j + 2] = Math.min(255, (blur[i + 2]! / a) * 255);
      data[j + 3] = a * 255;
    }
    if (out.canvas.width !== w || out.canvas.height !== h) {
      out.canvas.width = w;
      out.canvas.height = h;
    }
    out.putImageData(this.glow, 0, 0);
  }

  render(frame: Frame, t: number, veil?: Float32Array, amount = 1) {
    const { cols, rows, cells, ctx, xs, ys, last } = this;
    const { r, g, b, floor, glyph } = cells;
    floor.fill(0);
    glyph.fill(0);
    frame(t, cells);
    if (veil && amount > 0) {
      for (let k = 0; k < r.length; k++) {
        const s = 1 + (veil[k]! - 1) * amount;
        if (this.light) {
          // toward the paper, so the dots shrink
          r[k] = 1 - (1 - r[k]!) * s;
          g[k] = 1 - (1 - g[k]!) * s;
          b[k] = 1 - (1 - b[k]!) * s;
        } else {
          r[k] = r[k]! * s;
          g[k] = g[k]! * s;
          b[k] = b[k]! * s;
        }
        floor[k] = floor[k]! * s;
      }
    }
    if (this.ground) ctx.fillStyle = this.ground;
    const dirty = this.dirty;
    let count = 0;
    for (let y = 0, k = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, k++) {
        const d = BAYER[(y & 3) * 4 + (x & 3)]!;
        let cr = r[k]!;
        let cg = g[k]!;
        let cb = b[k]!;
        let code = glyph[k]!;
        const peak = Math.max(cr, cg, cb, 1e-4);
        if (code === 0 && this.light) {
          const lum = clampUnit(0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
          const f = floor[k]!;
          const level = clampUnit(f + (1 - f) * Math.pow(1 - lum, 0.9) * 1.05);
          const step = Math.max(0, Math.min(STEPS, Math.round(level * STEPS + d)));
          code = step;
          // the pigment at full strength, a little darker where the ink is heavy
          const s = (0.5 + 0.38 * Math.min(peak, 1)) / peak;
          cr *= s;
          cg *= s;
          cb *= s;
        } else if (code === 0) {
          const f = floor[k]!;
          const level = clampUnit(f + (1 - f) * Math.pow(Math.min(peak, 1), 0.85) * 0.97);
          const step = Math.max(0, Math.min(STEPS, Math.round(level * STEPS + d)));
          code = step;
          if (step > 0) {
            // A small dot is drawn brighter and a large one dimmer, so a gradient
            // stays smooth across the dither's steps.
            const s = Math.min(1, (0.28 + 0.82 * Math.min(peak, 1)) * ((level * STEPS) / step)) / peak;
            cr *= s;
            cg *= s;
            cb *= s;
          }
        } else {
          const s = peak > 1 ? 1 / peak : 1;
          cr *= s;
          cg *= s;
          cb *= s;
        }
        const key =
          code === 0
            ? 0
            : code * 1024 + quant(cr, d) * 100 + quant(cg, d) * 10 + quant(cb, d);
        if (key === last[k]) continue;
        last[k] = key;
        // Every sprite this frame needs is made before any is copied: copying
        // from the atlas after it changes costs the browser a copy of the atlas.
        if (key !== 0) this.sprite(key);
        dirty[count++] = k;
      }
    }
    if (this.flushed) {
      // the atlas filled up and was cleared part way through; paint everything again
      this.flushed = false;
      last.fill(0xffffffff);
      return;
    }
    for (let i = 0; i < count; i++) {
      const k = dirty[i]!;
      const key = last[k]!;
      const y = Math.floor(k / cols);
      const x = k - y * cols;
      const x0 = xs[x]!;
      const y0 = ys[y]!;
      const w = xs[x + 1]! - x0;
      const h = ys[y + 1]! - y0;
      if (key === 0) {
        if (this.ground) ctx.fillRect(x0, y0, w, h);
        else ctx.clearRect(x0, y0, w, h);
        continue;
      }
      if (!this.ground) ctx.clearRect(x0, y0, w, h);
      const s = this.slots.get(key)!;
      const sx = (s % ATLAS_COLS) * this.slotPx + 1;
      const sy = Math.floor(s / ATLAS_COLS) * this.slotPx + 1;
      ctx.drawImage(this.atlas, sx, sy, w, h, x0, y0, w, h);
    }
  }
}

function clampUnit(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function quant(v: number, d: number) {
  const q = Math.round(v * LEVELS + d * 0.85);
  return q < 0 ? 0 : q > LEVELS ? LEVELS : q;
}

function emptyCells(n: number): Cells {
  return {
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    floor: new Float32Array(n),
    glyph: new Uint16Array(n),
  };
}

// Maps a cols x rows viewport grid onto the design frame, cropped like
// `object-fit: cover` around the focus point.
export function coverGrid(
  cols: number,
  rows: number,
  focusX: number,
  focusY: number,
  width = DESIGN_W,
  height = DESIGN_H,
  anchor?: { x: number; y: number; atX: number; atY: number; zoom: number },
): Grid {
  const unit = Math.min(width / cols, height / rows) / (anchor?.zoom ?? 1);
  const spanX = cols * unit;
  const spanY = rows * unit;
  const clampTo = (v: number, max: number) => Math.min(Math.max(v, Math.min(0, max)), Math.max(0, max));
  const x0 = anchor ? clampTo(anchor.x - anchor.atX * spanX, width - spanX) : (width - spanX) * focusX;
  const y0 = anchor ? clampTo(anchor.y - anchor.atY * spanY, height - spanY) : (height - spanY) * focusY;
  const X = new Float32Array(cols * rows);
  const Y = new Float32Array(cols * rows);
  for (let y = 0, k = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, k++) {
      X[k] = x0 + (x + 0.5) * unit;
      Y[k] = y0 + (y + 0.5) * unit;
    }
  }
  return { cols, rows, X, Y, unit, x0, y0 };
}
