// The strip is drawn the way a thermal printer or a manga tone sheet would:
// a handful of flat inks, no anti-aliasing, and every in-between shade made
// of an ordered-dither pattern. Everything draws into a small indexed buffer
// that is scaled up by whole device pixels.

export const BLACK = 0;
export const INK = 1;
export const DIM = 2;
export const FAINT = 3;
export const BLUE = 4;
export const DEEP = 5;
/** the compression suit under his bib: a dark slate, nearly black */
export const SUIT = 6;
/** the grey light in his hair */
export const SLATE = 7;
export const SKIN = 8;
/** skin on the far side, a step down */
export const TAN = 9;
/** what comes off him when he locks in: cyan and a blue-green */
export const CYAN = 10;
export const MINT = 11;
/** his bib and shorts: a royal blue, softer than the electric one */
export const ROYAL = 12;
/** his hair, a dark blue-grey */
export const HAIR = 13;
/** the indigo lines that wind round the suit's sleeves */
export const STRIPE = 14;

const PALETTE = [
  [0, 0, 0],
  [246, 246, 242],
  [108, 108, 104],
  [40, 40, 38],
  [64, 112, 255],
  [26, 50, 132],
  [44, 48, 65],
  [106, 114, 134],
  [251, 228, 199],
  [178, 144, 124],
  [86, 232, 255],
  [110, 255, 198],
  [90, 119, 205],
  [63, 72, 89],
  [68, 69, 132],
];

// The same inks re-mapped for an impact frame: the first prints him as a
// black cut-out on white paper, the second as white on electric blue, the
// third as a white shape on black with nothing else left but white lines.
export const NEGATIVE = 1;
export const BLUEPRINT = 2;
export const SILHOUETTE = 3;
const MODES = [
  PALETTE.map((_, i) => i),
  [INK, BLACK, FAINT, DIM, BLACK, FAINT, BLACK, DIM, BLACK, FAINT, BLACK, BLACK, BLACK, BLACK, FAINT],
  [BLUE, INK, DEEP, DEEP, INK, INK, INK, INK, INK, INK, INK, INK, INK, INK, INK],
  [BLACK, INK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK],
];

/** An impact frame cut in two by a slash through (x, y): pixels on the side
 * (dx, dy) points to print in `mode` instead. */
export type Split = { x: number; y: number; dx: number; dy: number; mode: number };

// A paint is an ink plus how much of it the dither lets through, 1 to 16.
export type Paint = number;
export const tone = (ink: number, level = 16): Paint => ink | (level << 4);
export const SOLID_BLACK = tone(BLACK);
export const SOLID_INK = tone(INK);

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// 8×8 ordered-dither thresholds, 0..63
const BAYER8 = new Uint8Array(64);
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) {
    let value = 0;
    for (let bit = 0; bit < 3; bit += 1) {
      const xb = (x >> bit) & 1;
      const yb = (y >> bit) & 1;
      value |= ((xb ^ yb) << (5 - bit * 2)) | (yb << (4 - bit * 2));
    }
    BAYER8[y * 8 + x] = value;
  }
}

export const bayer = (x: number, y: number) => BAYER8[(y & 7) * 8 + (x & 7)] / 64;

export class Ink {
  w: number;
  h: number;
  color: Uint8Array;
  owner: Uint8Array;
  /** who is drawing: 1 is the striker, whose pixels the aura grows from, 2
   * the ball, 3 what comes off him */
  who = 0;
  /** an optional mask, to keep what comes off him from going over him */
  clip: ((x: number, y: number) => boolean) | null = null;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.color = new Uint8Array(w * h);
    this.owner = new Uint8Array(w * h);
  }

  clear() {
    this.color.fill(BLACK);
    this.owner.fill(0);
  }

  put(x: number, y: number, paint: Paint) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const level = paint >> 4;
    if (level < 16 && BAYER4[(y & 3) * 4 + (x & 3)] >= level) return;
    if (this.clip && !this.clip(x, y)) return;
    const i = y * this.w + x;
    this.color[i] = paint & 15;
    this.owner[i] = this.who;
  }

  /** A limb: a capsule that tapers from radius ar at a to br at b. */
  cap(ax: number, ay: number, ar: number, bx: number, by: number, br: number, paint: Paint) {
    const x0 = Math.max(0, Math.floor(Math.min(ax - ar, bx - br)));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax + ar, bx + br)));
    const y0 = Math.max(0, Math.floor(Math.min(ay - ar, by - br)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay + ar, by + br)));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y += 1) {
      const py = y + 0.5 - ay;
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5 - ax;
        let t = (px * dx + py * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx;
        const ey = py - t * dy;
        const r = ar + (br - ar) * t;
        if (ex * ex + ey * ey <= r * r) this.put(x, y, paint);
      }
    }
  }

  disc(cx: number, cy: number, r: number, paint: Paint) {
    this.cap(cx, cy, r, cx, cy, r, paint);
  }

  /** An ellipse, rx across and ry down, turned by angle. */
  oval(cx: number, cy: number, rx: number, ry: number, angle: number, paint: Paint) {
    const reach = Math.max(rx, ry);
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + reach));
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5 - cx;
        const py = y + 0.5 - cy;
        const u = (px * c + py * s) / rx;
        const v = (-px * s + py * c) / ry;
        if (u * u + v * v <= 1) this.put(x, y, paint);
      }
    }
  }

  /** Any simple polygon, filled even-odd, from flat [x, y, x, y, …]. Solid
   * ink with nothing masked goes down a run at a time. */
  poly(points: number[], paint: Paint) {
    const level = paint >> 4;
    if (level < 1) return;
    if (level < 16 || this.clip) {
      this.spans(points, (y, from, to) => {
        for (let x = from; x <= to; x += 1) this.put(x, y, paint);
      });
      return;
    }
    const { color, owner, who, w } = this;
    const ink = paint & 15;
    this.spans(points, (y, from, to) => {
      for (let i = y * w + from, end = y * w + to; i <= end; i += 1) {
        color[i] = ink;
        owner[i] = who;
      }
    });
  }

  /** Visits every pixel inside a polygon, as `poly` would fill it. */
  scan(points: number[], visit: (x: number, y: number) => void) {
    this.spans(points, (y, from, to) => {
      for (let x = from; x <= to; x += 1) visit(x, y);
    });
  }

  /** Visits each run of pixels inside a polygon, a row at a time. */
  spans(points: number[], visit: (y: number, from: number, to: number) => void) {
    const n = points.length >> 1;
    if (n < 3) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < n; i += 1) {
      top = Math.min(top, points[i * 2 + 1]);
      bottom = Math.max(bottom, points[i * 2 + 1]);
    }
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(this.h - 1, Math.ceil(bottom));
    const cross: number[] = [];
    for (let y = y0; y <= y1; y += 1) {
      const sy = y + 0.5;
      cross.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
        const ay = points[i * 2 + 1];
        const by = points[j * 2 + 1];
        if (ay <= sy === by <= sy) continue;
        const ax = points[i * 2];
        const bx = points[j * 2];
        cross.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      cross.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const from = Math.max(0, Math.ceil(cross[k] - 0.5));
        const to = Math.min(this.w - 1, Math.ceil(cross[k + 1] - 0.5) - 1);
        if (from <= to) visit(y, from, to);
      }
    }
  }

  /** A hairline, one pixel wide. */
  line(ax: number, ay: number, bx: number, by: number, paint: Paint) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.put(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), paint);
    }
  }

  /** A wedge, as the lines a manga panel uses to pull the eye in. */
  wedge(ax: number, ay: number, bx: number, by: number, width: number, paint: Paint) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;
    this.poly([ax + nx, ay + ny, ax - nx, ay - ny, bx, by], paint);
  }

  /** Copies the indexed picture into rgba pixels, re-mapping the inks for an
   * impact frame (or two, either side of a slash), dithering the left and
   * right edges of the window it is seen through away into the page, and
   * dissolving the whole picture in or out as `shown` goes between 0 and 1.
   * In a silhouette he prints solid white. */
  blit(out: Uint32Array, mode: number, fade: number, shown = 1, split: Split | null = null, win: { x: number; w: number } | null = null, tilt = 0) {
    const { w, h, color, owner } = this;
    const tables = [mode, split ? split.mode : mode].map((m) => {
      const map = MODES[m] ?? MODES[0];
      const table = new Uint32Array(PALETTE.length + 1);
      for (let i = 0; i < PALETTE.length; i += 1) {
        const [r, g, b] = PALETTE[map[i]];
        table[i] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
      table[PALETTE.length] = m === SILHOUETTE ? table[INK] : 0;
      return table;
    });
    // the page is black, whatever the frame
    const page = 255 << 24;
    const left = win ? win.x : 0;
    const right = win ? win.x + win.w - 1 : w - 1;
    if (shown >= 1 && fade <= 0 && !split && !tables[0][PALETTE.length] && !tilt) {
      const table = tables[0];
      for (let i = 0; i < w * h; i += 1) out[i] = table[color[i]];
      return;
    }
    // rolled about the middle of the window: each pixel printed from where
    // it was before the roll
    const ca = Math.cos(tilt);
    const sa = Math.sin(tilt);
    const mx = (left + right + 1) / 2;
    const my = h / 2;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const edge = Math.min(x - left, right - x);
        const cut = bayer(x, y);
        if (cut >= shown || (edge < fade && cut * fade >= edge)) {
          out[i] = page;
          continue;
        }
        let at = i;
        if (tilt) {
          const dx = x + 0.5 - mx;
          const dy = y + 0.5 - my;
          const sx = Math.floor(mx + dx * ca + dy * sa);
          const sy = Math.floor(my - dx * sa + dy * ca);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
            out[i] = page;
            continue;
          }
          at = sy * w + sx;
        }
        const table = split && (x - split.x) * split.dx + (y - split.y) * split.dy > 0 ? tables[1] : tables[0];
        out[i] = owner[at] === 1 && table[PALETTE.length] ? table[PALETTE.length] : table[color[at]];
      }
    }
  }
}
