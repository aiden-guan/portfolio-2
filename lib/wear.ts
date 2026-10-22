import polygonClipping, { type MultiPolygon, type Ring } from "polygon-clipping";

// What a knife and a flame do to a thing on the mat. Paper doesn't heal:
// a blade drawn across a sheet leaves a slit in it, and drawn right across
// it parts the sheet in two along the line it took. A flame browns paper,
// chars it, and burns through, and the hole's edge glows and creeps a little
// way on before it goes out.
//
// A sheet's wear is kept in its own frame, in the pixels it measured when
// it was first marked (so it scales with the mat): its outline, which a cut
// replaces with two, the holes burnt in it, how charred each millimetre of it
// is, and the slits in it. It's shown on the sheet itself: the outline and
// holes clip both faces (the back mirrored), and two canvases on each face
// carry the scorch, multiplied into the paper, and the slits and embers.

export type Pt = { x: number; y: number };

// What the table (components/mat/table) lets a blade and a flame do to the
// things on it, in mat coordinates.
export type Surface = {
  // the blade, on stroke `id`, has reached (x, y): says whether it's in paper
  blade(id: number, x: number, y: number): boolean;
  // and it's out of the mat
  lift(): void;
  // the flame's heat at (x, y), across `radius`, for dt seconds: what it's on
  heat(x: number, y: number, radius: number, power: number, dt: number): { on: "paper" | "mat"; char: number; kind: string };
  // where paper's still smouldering
  embers(): { x: number; y: number; r: number; hot: number }[];
};

// A thing burnt away: where it was, for its ash.
export const ASH_EVENT = "aiden-mat-ash";
// Whether the mat itself is scorched anywhere (lib/torch): a mess Tidy clears.
export const SCORCH_EVENT = "aiden-mat-scorched";
// Tidy (components/mat/table) squaring everything up again.
export const TIDY_EVENT = "aiden-mat-tidy";

type Hole = {
  x: number;
  y: number;
  r: number;
  // how big it can get while the flame's on it
  max: number;
  // its ragged edge: how far out each of its points sits, as a fraction
  edge: number[];
  // how hot its edge still is (0..1)
  hot: number;
};

type Face = { face: HTMLElement; scorch: HTMLCanvasElement; marks: HTMLCanvasElement; back: boolean };

const SIDES = 26;
const MAX_HOLES = 40;
// the char a millimetre takes before it's burnt through
const THROUGH = 1;

// ---- geometry

export function area(poly: Pt[]) {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  }
  return Math.abs(sum) / 2;
}

export function centroid(poly: Pt[]) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j]!;
    const q = poly[i]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function inside(poly: Pt[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i]!;
    const q = poly[j]!;
    if (p.y > y !== q.y > y && x < ((q.x - p.x) * (y - p.y)) / (q.y - p.y) + p.x) hit = !hit;
  }
  return hit;
}

// Where the segment from a to b first crosses the outline, nearest a: the
// point, the edge it's on (from vertex `edge` to the next), and how far along
// that edge it is.
export function crossing(poly: Pt[], a: Pt, b: Pt) {
  let best: { x: number; y: number; edge: number; t: number; u: number } | null = null;
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sx = q.x - p.x;
    const sy = q.y - p.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const u = ((p.x - a.x) * sy - (p.y - a.y) * sx) / den;
    const t = ((p.x - a.x) * ry - (p.y - a.y) * rx) / den;
    if (u < -1e-6 || u > 1 + 1e-6 || t < -1e-6 || t > 1 + 1e-6) continue;
    if (!best || u < best.u) best = { x: a.x + rx * u, y: a.y + ry * u, edge: i, t, u };
  }
  return best;
}

// Drops the points of a line that don't change its shape by more than `tol`.
export function simplify(line: Pt[], tol: number) {
  if (line.length < 3) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    const a = line[from]!;
    const b = line[to]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let dist = tol;
    for (let i = from + 1; i < to; i++) {
      const p = line[i]!;
      const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
      if (d > dist) {
        dist = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([from, far], [far, to]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

// Parts an outline along a cut that goes in across edge `inEdge` and out
// across edge `outEdge`: the two outlines either side of it.
export function part(
  poly: Pt[],
  cut: Pt[],
  inEdge: number,
  inT: number,
  outEdge: number,
  outT: number,
): [Pt[], Pt[]] | null {
  const n = poly.length;
  if (cut.length < 2 || n < 3) return null;
  // in and out across the same edge: go round from the end nearer its start
  if (inEdge === outEdge && inT > outT) return part(poly, cut.slice().reverse(), outEdge, outT, inEdge, inT);
  const a: Pt[] = [...cut];
  const b: Pt[] = [...cut].reverse();
  if (inEdge === outEdge) {
    // a notch: the sheet less the notch, and the notch
    for (let k = 1; k <= n; k++) a.push(poly[(outEdge + k) % n]!);
  } else {
    for (let k = outEdge + 1; ; k++) {
      a.push(poly[k % n]!);
      if (k % n === inEdge) break;
    }
    for (let k = inEdge + 1; ; k++) {
      b.push(poly[k % n]!);
      if (k % n === outEdge) break;
    }
  }
  return [a, b];
}

const ring = (poly: Pt[]): Ring => poly.map((p) => [p.x, p.y]);

function ringArea(r: Ring) {
  let sum = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) sum += (r[j]![0] + r[i]![0]) * (r[j]![1] - r[i]![1]);
  return Math.abs(sum) / 2;
}

// ---- noise

function smoothNoise(cols: number, rows: number) {
  const coarse = 3;
  const gw = Math.ceil(cols / coarse) + 2;
  const gh = Math.ceil(rows / coarse) + 2;
  const grid = new Float32Array(gw * gh).map(() => Math.random());
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const fx = x / coarse;
      const fy = y / coarse;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const g = (i: number, j: number) => grid[j * gw + i]!;
      const v =
        g(ix, iy) * (1 - tx) * (1 - ty) + g(ix + 1, iy) * tx * (1 - ty) + g(ix, iy + 1) * (1 - tx) * ty + g(ix + 1, iy + 1) * tx * ty;
      out[y * cols + x] = v * 0.75 + Math.random() * 0.25;
    }
  }
  return out;
}

function raggedEdge() {
  const phases = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3];
  return Array.from({ length: SIDES }, (_, i) => {
    const a = (i / SIDES) * Math.PI * 2;
    return (
      Math.sin(a * 2 + phases[0]!) * 0.12 + Math.sin(a * 3 + phases[1]!) * 0.08 + Math.sin(a * 7 + phases[2]!) * 0.05 + (Math.random() - 0.5) * 0.1
    );
  });
}

function holeRing(h: Hole, r = h.r): Ring {
  const out: Ring = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const k = r * (1 + h.edge[i]!);
    out.push([h.x + Math.cos(a) * k, h.y + Math.sin(a) * k]);
  }
  return out;
}

// ---- a sheet's wear

export class Wear {
  // the pixels it was first marked in, and how many of today's there are to
  // one of them
  readonly w0: number;
  readonly h0: number;
  k = 1;
  w: number;
  h: number;
  // a millimetre, in the sheet's own pixels
  readonly mm: number;
  poly: Pt[];
  holes: Hole[] = [];
  slits: Pt[][] = [];
  // the lines it has been parted along, shown again while it's mended
  seams: Pt[][] = [];
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  char: Float32Array;
  readonly grain: Float32Array;
  // what's left of the sheet, as a share of the whole card it was
  left = 1;
  readonly whole: number;
  // where the flame is on it, and when it was last there
  flame: Pt | null = null;
  flameAt = 0;
  // 0 while it's worn; counts up to 1 as it's mended
  mending = -1;

  private faces: Face[] = [];
  // what's left of the sheet, for clipping the box it turns in (so that only
  // paper catches the pointer), and the clip it was last given
  private geometry: MultiPolygon = [];
  private turn: HTMLElement | null;
  private turnClip = "";
  private field: HTMLCanvasElement;
  private image: ImageData;
  private shapeDirty = true;
  private fieldDirty = true;
  private marksDirty = true;
  private shapeAt = 0;
  private slit: Pt[] | null = null;
  private dpr = 1;

  constructor(
    readonly el: HTMLElement,
    w: number,
    h: number,
    mm: number,
    from?: Wear,
  ) {
    this.w0 = from?.w0 ?? w;
    this.h0 = from?.h0 ?? h;
    this.mm = from?.mm ?? mm;
    this.w = w;
    this.h = h;
    this.k = w / this.w0;
    this.cell = from?.cell ?? Math.max(2, this.mm * 0.7);
    this.cols = from?.cols ?? Math.ceil(this.w0 / this.cell) + 1;
    this.rows = from?.rows ?? Math.ceil(this.h0 / this.cell) + 1;
    this.char = from ? from.char.slice() : new Float32Array(this.cols * this.rows);
    this.grain = from?.grain ?? smoothNoise(this.cols, this.rows);
    this.whole = from?.whole ?? this.w0 * this.h0;
    this.poly = from
      ? from.poly.map((p) => ({ ...p }))
      : [
          { x: 0, y: 0 },
          { x: this.w0, y: 0 },
          { x: this.w0, y: this.h0 },
          { x: 0, y: this.h0 },
        ];
    if (from) {
      this.holes = from.holes.map((hole) => ({ ...hole, edge: hole.edge }));
      this.slits = from.slits.map((line) => line.slice());
      this.seams = from.seams.map((line) => line.slice());
      this.left = from.left;
    }
    this.field = document.createElement("canvas");
    this.field.width = this.cols;
    this.field.height = this.rows;
    this.image = new ImageData(this.cols, this.rows);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const face of el.querySelectorAll<HTMLElement>(":scope > .thing-turn > .thing-body > .thing-face")) {
      // a clone brings its parent's canvases along, blank: start afresh
      face.querySelectorAll(":scope > .wear-scorch, :scope > .wear-marks").forEach((old) => old.remove());
      const scorch = document.createElement("canvas");
      scorch.className = "wear-scorch";
      scorch.width = this.cols;
      scorch.height = this.rows;
      const marks = document.createElement("canvas");
      marks.className = "wear-marks";
      for (const canvas of [scorch, marks]) {
        canvas.setAttribute("aria-hidden", "true");
        face.append(canvas);
      }
      this.faces.push({ face, scorch, marks, back: face.classList.contains("thing-back") });
    }
    this.turn = el.querySelector<HTMLElement>(":scope > .thing-turn");
    this.sizeMarks();
    el.dataset.worn = "";
  }

  // ---- size

  resize(w: number, h: number) {
    if (Math.abs(w - this.w) < 0.01 && Math.abs(h - this.h) < 0.01) return;
    this.w = w;
    this.h = h;
    this.k = w / this.w0;
    this.sizeMarks();
    this.shapeDirty = true;
    this.marksDirty = true;
  }

  private sizeMarks() {
    // a sheet's marks are fine lines: drawn at the screen's resolution, as
    // far as a sensible amount of memory goes
    const budget = Math.min(this.dpr, Math.sqrt(1_400_000 / Math.max(1, this.w * this.h)));
    for (const { marks } of this.faces) {
      marks.width = Math.max(1, Math.round(this.w * budget));
      marks.height = Math.max(1, Math.round(this.h * budget));
    }
  }

  // from today's pixels on the sheet to its own, and back
  toSheet(p: Pt) {
    return { x: p.x / this.k, y: p.y / this.k };
  }

  fromSheet(p: Pt) {
    return { x: p.x * this.k, y: p.y * this.k };
  }

  contains(p: Pt) {
    const q = this.toSheet(p);
    return inside(this.poly, q.x, q.y);
  }

  inHole(p: Pt) {
    const q = this.toSheet(p);
    return this.holes.some((h) => Math.hypot(q.x - h.x, q.y - h.y) < h.r * 0.92);
  }

  // The point it balances on, in today's pixels.
  pivot() {
    return this.fromSheet(centroid(this.poly));
  }

  bounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of this.poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return { x0: x0 * this.k, y0: y0 * this.k, x1: x1 * this.k, y1: y1 * this.k };
  }

  // ---- the blade

  // The blade has gone into the sheet at p, or moved on to it.
  slitTo(p: Pt, start: boolean) {
    const q = this.toSheet(p);
    if (start || !this.slit) {
      this.slit = [q];
      this.slits.push(this.slit);
      while (this.slits.length > 24) this.slits.shift();
    } else {
      const last = this.slit[this.slit.length - 1]!;
      if (Math.hypot(q.x - last.x, q.y - last.y) < 0.8) return;
      this.slit.push(q);
    }
    this.marksDirty = true;
  }

  // The blade's out of the sheet: whatever it left is a slit for good.
  endSlit() {
    if (this.slit && this.slit.length > 2) {
      const index = this.slits.indexOf(this.slit);
      if (index >= 0) this.slits[index] = simplify(this.slit, 0.25);
    }
    this.slit = null;
  }

  // Parts the sheet along the cut it just took (today's pixels), keeping one
  // side and giving back the other's outline; or null, if the cut didn't
  // part it.
  part(cut: Pt[], inEdge: number, inT: number, outEdge: number, outT: number) {
    const line = simplify(
      cut.map((p) => this.toSheet(p)),
      0.3,
    );
    if (line.length < 2) return null;
    let length = 0;
    for (let i = 1; i < line.length; i++) length += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
    if (length < this.mm * 1.2) return null;
    const pieces = part(this.poly, line, inEdge, inT, outEdge, outT);
    if (!pieces) return null;
    const [a, b] = pieces;
    // slivers too thin to pick up stay part of the sheet
    if (area(a) < this.mm * this.mm * 6 || area(b) < this.mm * this.mm * 6) return null;
    // the slit along the cut is the edge now
    if (this.slit) {
      const index = this.slits.indexOf(this.slit);
      if (index >= 0) this.slits.splice(index, 1);
      this.slit = null;
    }
    this.seams.push(line);
    this.poly = a;
    this.shapeDirty = true;
    this.marksDirty = true;
    return b;
  }

  // The other side of a cut, for the copy that takes it.
  outline(poly: Pt[]) {
    this.poly = poly;
    this.shapeDirty = true;
    this.marksDirty = true;
  }

  // The edge its outline is on, for a cut's way in or out.
  edgeOf(a: Pt, b: Pt) {
    const hit = crossing(this.poly, this.toSheet(a), this.toSheet(b));
    if (!hit) return null;
    return { point: this.fromSheet(hit), edge: hit.edge, t: hit.t };
  }

  // ---- the flame

  // Heat at p (today's pixels) across `radius`, for dt seconds: browns,
  // chars and burns through. Says how burnt it is there.
  burn(p: Pt, radius: number, power: number, dt: number) {
    const q = this.toSheet(p);
    const r = radius / this.k;
    const { cell, cols, rows, char, grain } = this;
    const x0 = Math.max(0, Math.floor((q.x - r) / cell));
    const x1 = Math.min(cols - 1, Math.ceil((q.x + r) / cell));
    const y0 = Math.max(0, Math.floor((q.y - r) / cell));
    const y1 = Math.min(rows - 1, Math.ceil((q.y + r) / cell));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x * cell - q.x, y * cell - q.y) / r;
        if (d >= 1) continue;
        const i = y * cols + x;
        const f = (1 - d) * (1 - d);
        char[i] = Math.min(1.6, char[i]! + power * f * dt * (0.82 + grain[i]! * 0.36));
      }
    }
    this.flame = q;
    this.flameAt = performance.now();
    this.fieldDirty = true;
    this.marksDirty = true;
    const here = this.charAt(q.x, q.y);
    if (here >= THROUGH) this.burnThrough(q, dt);
    return here;
  }

  private charAt(x: number, y: number) {
    const i = Math.round(y / this.cell) * this.cols + Math.round(x / this.cell);
    return this.char[i] ?? 0;
  }

  private burnThrough(q: Pt, dt: number) {
    const mm = this.mm;
    let near: Hole | null = null;
    let nearD = Infinity;
    for (const h of this.holes) {
      const d = Math.hypot(q.x - h.x, q.y - h.y) - h.r;
      if (d < nearD) {
        nearD = d;
        near = h;
      }
    }
    if (near && (nearD < mm * 1.4 || this.holes.length >= MAX_HOLES)) {
      if (nearD > 0 && this.holes.length >= MAX_HOLES) near.max = Math.max(near.max, near.r + nearD + mm);
      // held there, the flame keeps eating the hole wider
      near.max = Math.min(mm * 24, near.max + mm * 1.6 * dt);
      near.r = Math.min(near.max, near.r + mm * 7 * dt);
      near.hot = 1;
    } else {
      this.holes.push({ x: q.x, y: q.y, r: mm * 0.9, max: mm * (4 + Math.random() * 3.5), edge: raggedEdge(), hot: 1 });
    }
    this.shapeDirty = true;
  }

  // Embers creep on along a hole's edge, slower and slower, and go out.
  // Says whether anything's still changing.
  tick(dt: number, now: number) {
    let busy = this.fieldDirty || this.marksDirty || this.shapeDirty;
    for (const h of this.holes) {
      if (h.hot <= 0) continue;
      busy = true;
      const flameOn = this.flame && now - this.flameAt < 90 && Math.hypot(this.flame.x - h.x, this.flame.y - h.y) < h.r + this.mm * 3;
      if (!flameOn) {
        h.hot = Math.max(0, h.hot - dt / 1.5);
        if (h.hot > 0.35) {
          h.r = Math.min(h.max * 1.15, h.r + this.mm * 0.9 * h.hot * dt);
          this.shapeDirty = true;
        }
      }
      // the char runs on just ahead of the edge
      this.scorchRing(h);
      this.marksDirty = true;
    }
    if (this.mending >= 0) {
      busy = true;
      this.mending = Math.min(1, this.mending + dt / 0.75);
      this.shapeDirty = true;
      this.marksDirty = true;
      const fade = String(1 - easeInOut(this.mending));
      for (const { scorch } of this.faces) scorch.style.opacity = fade;
    }
    if (this.flame && now - this.flameAt > 400) this.flame = null;
    this.render(now);
    return busy;
  }

  private scorchRing(h: Hole) {
    const { cell, cols, rows, char } = this;
    const reach = h.r * 1.2 + this.mm * 2.2;
    const x0 = Math.max(0, Math.floor((h.x - reach) / cell));
    const x1 = Math.min(cols - 1, Math.ceil((h.x + reach) / cell));
    const y0 = Math.max(0, Math.floor((h.y - reach) / cell));
    const y1 = Math.min(rows - 1, Math.ceil((h.y + reach) / cell));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x * cell - h.x, y * cell - h.y);
        if (d > reach) continue;
        const i = y * cols + x;
        const want = d < h.r * 1.15 + this.mm * 0.6 ? 0.97 : 0.97 * (1 - (d - h.r * 1.15 - this.mm * 0.6) / (this.mm * 1.6));
        if (want > char[i]!) char[i] = want;
      }
    }
    this.fieldDirty = true;
  }

  // Hot points of it, in today's pixels: where smoke still comes off it.
  embers() {
    return this.holes.filter((h) => h.hot > 0.05).map((h) => ({ ...this.fromSheet(h), r: h.r * this.k, hot: h.hot }));
  }

  get burning() {
    return this.holes.some((h) => h.hot > 0);
  }

  // ---- drawing

  render(now = performance.now()) {
    if (this.shapeDirty && (now - this.shapeAt > 40 || this.mending >= 0 || !this.holes.some((h) => h.hot > 0))) this.shape(now);
    if (this.fieldDirty) this.paintField();
    if (this.marksDirty) this.paintMarks();
  }

  private shape(now: number) {
    this.shapeDirty = false;
    this.shapeAt = now;
    const shrink = this.mending >= 0 ? 1 - easeInOut(this.mending) : 1;
    let geometry: MultiPolygon = [[ring(this.poly)]];
    const holes = this.holes.filter((h) => h.r * shrink > 0.3).map((h) => [holeRing(h, h.r * shrink)]);
    if (holes.length) {
      try {
        geometry = polygonClipping.difference([ring(this.poly)], ...holes);
      } catch {
        // a degenerate outline: keep the last good one
        return;
      }
    }
    let left = 0;
    for (const polygon of geometry) {
      polygon.forEach((r, i) => (left += i === 0 ? ringArea(r) : -ringArea(r)));
    }
    this.left = left / this.whole;
    const k = this.k;
    const path = (mirror: boolean) => {
      let d = "";
      for (const polygon of geometry) {
        for (const r of polygon) {
          r.forEach(([x, y], i) => {
            const px = mirror ? this.w - x * k : x * k;
            d += `${i ? "L" : "M"}${px.toFixed(2)} ${(y * k).toFixed(2)}`;
          });
          d += "Z";
        }
      }
      return d || "M0 0Z";
    };
    const front = `path(evenodd, "${path(false)}")`;
    const back = `path(evenodd, "${path(true)}")`;
    for (const { face, back: isBack } of this.faces) face.style.clipPath = isBack ? back : front;
    this.geometry = geometry;
    this.clipTurn();
  }

  // The box it turns in is clipped to the paper too, as it lies now (turned
  // over, mirrored about the point it turns on), since a face in the middle
  // of turning doesn't catch the pointer by itself. While it's turning, the
  // faces' own clips are enough.
  private clipTurn() {
    if (!this.turn) return;
    let clip = "none";
    if (!this.el.classList.contains("is-turning")) {
      const k = this.k;
      const mirror = this.el.classList.contains("is-turned") ? 2 * centroid(this.poly).x * k : null;
      let d = "";
      for (const polygon of this.geometry) {
        for (const r of polygon) {
          r.forEach(([x, y], i) => {
            const px = mirror === null ? x * k : mirror - x * k;
            d += `${i ? "L" : "M"}${px.toFixed(2)} ${(y * k).toFixed(2)}`;
          });
          d += "Z";
        }
      }
      if (d) clip = `path(evenodd, "${d}")`;
    }
    if (clip === this.turnClip) return;
    this.turnClip = clip;
    this.turn.style.clipPath = clip === "none" ? "" : clip;
  }

  // The char, browning to black, multiplied into the paper.
  private paintField() {
    this.fieldDirty = false;
    const { cols, rows, char, grain, image } = this;
    const data = image.data;
    for (let i = 0; i < cols * rows; i++) {
      const c = char[i]! + (grain[i]! - 0.5) * 0.1;
      let r = 255;
      let g = 255;
      let b = 255;
      let a = 0;
      if (c > 0.04) {
        if (c < 0.36) {
          const t = (c - 0.04) / 0.32;
          r = 222;
          g = 182;
          b = 124;
          a = t * 0.55;
        } else if (c < 0.72) {
          const t = (c - 0.36) / 0.36;
          r = 222 + (104 - 222) * t;
          g = 182 + (62 - 182) * t;
          b = 124 + (28 - 124) * t;
          a = 0.55 + t * 0.37;
        } else {
          const t = Math.min(1, (c - 0.72) / 0.26);
          r = 104 + (24 - 104) * t;
          g = 62 + (18 - 62) * t;
          b = 28 + (14 - 28) * t;
          a = 0.92 + t * 0.08;
        }
      }
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a * 255;
    }
    const ctx = this.field.getContext("2d")!;
    ctx.putImageData(image, 0, 0);
    for (const { scorch } of this.faces) {
      const out = scorch.getContext("2d")!;
      out.clearRect(0, 0, cols, rows);
      out.drawImage(this.field, 0, 0);
    }
  }

  // The slits, the seams while it's mended, and the embers along its holes.
  private paintMarks() {
    this.marksDirty = false;
    const first = this.faces[0];
    if (!first) return;
    const canvas = first.marks;
    const ctx = canvas.getContext("2d")!;
    const scale = (canvas.width / this.w) * this.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const px = 1 / scale;
    const fade = this.mending >= 0 ? 1 - easeInOut(this.mending) : 1;

    // a slit: the paper's parted a hair, its far lip catching the light
    const line = (points: Pt[], alpha: number) => {
      if (points.length < 2 || alpha <= 0) return;
      const trace = (dx: number, dy: number) => {
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)));
        ctx.stroke();
      };
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = "rgb(255 255 255 / 0.85)";
      ctx.lineWidth = px * 0.9;
      trace(px * 0.45, px * 0.75);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgb(28 22 16 / 0.78)";
      ctx.lineWidth = px * 1.15;
      trace(0, 0);
    };
    for (const slit of this.slits) line(slit, fade);
    if (this.mending >= 0) {
      // the seams close up last
      const seam = 1 - easeInOut(Math.min(1, this.mending * 1.25));
      for (const s of this.seams) line(s, seam);
    }

    // the edge of a hole: black, and glowing while it's hot
    for (const h of this.holes) {
      const r = h.r * (this.mending >= 0 ? 1 - easeInOut(this.mending) : 1);
      if (r < 0.3) continue;
      const pts = holeRing(h, r);
      const trace = (grow: number) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const gx = h.x + (x - h.x) * grow;
          const gy = h.y + (y - h.y) * grow;
          if (i) ctx.lineTo(gx, gy);
          else ctx.moveTo(gx, gy);
        });
        ctx.closePath();
      };
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = "rgb(14 10 8)";
      ctx.lineWidth = this.mm * 0.9;
      trace(1.02);
      ctx.stroke();
      if (h.hot > 0.02) {
        const flicker = 0.82 + Math.random() * 0.18;
        ctx.globalAlpha = Math.min(1, h.hot * 1.3) * flicker * fade;
        ctx.strokeStyle = "rgb(255 120 36)";
        ctx.shadowColor = "rgb(255 96 20)";
        ctx.shadowBlur = this.mm * 2.2 * scale;
        ctx.lineWidth = this.mm * (0.35 + 0.5 * h.hot);
        trace(1);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = h.hot * h.hot * fade;
        ctx.strokeStyle = "rgb(255 226 150)";
        ctx.lineWidth = this.mm * 0.22;
        trace(0.995);
        ctx.stroke();
      }
    }

    // the paper right under the flame, glowing through the char
    if (this.flame && this.mending < 0) {
      const age = (performance.now() - this.flameAt) / 400;
      const glow = Math.max(0, 1 - age) * (0.8 + Math.random() * 0.2);
      const c = this.charAt(this.flame.x, this.flame.y);
      if (glow > 0 && c > 0.5) {
        const r = this.mm * 3.2;
        const g = ctx.createRadialGradient(this.flame.x, this.flame.y, 0, this.flame.x, this.flame.y, r);
        g.addColorStop(0, `rgb(255 170 70 / ${0.75 * glow * Math.min(1, (c - 0.5) * 2)})`);
        g.addColorStop(0.45, `rgb(230 80 20 / ${0.35 * glow})`);
        g.addColorStop(1, "rgb(200 40 10 / 0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(this.flame.x - r, this.flame.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;

    // the back is the same marks, seen from behind (only needed while it
    // can be seen, which `refresh` sees to when it's turned over)
    if (!this.el.classList.contains("is-turned") && !this.el.classList.contains("is-turning")) return;
    for (const { marks } of this.faces.slice(1)) {
      if (marks.width !== canvas.width || marks.height !== canvas.height) {
        marks.width = canvas.width;
        marks.height = canvas.height;
      }
      const out = marks.getContext("2d")!;
      out.clearRect(0, 0, marks.width, marks.height);
      out.drawImage(canvas, 0, 0);
    }
  }

  // It's being turned over, or has been: draw the side that's coming into
  // view, and clip it as it now lies.
  refresh() {
    this.marksDirty = true;
    this.clipTurn();
  }

  // ---- mending

  // Takes in what another piece of the same sheet carried.
  absorb(other: Wear) {
    for (let i = 0; i < this.char.length; i++) this.char[i] = Math.max(this.char[i]!, other.char[i] ?? 0);
    this.holes.push(...other.holes.filter((h) => !this.holes.some((o) => o.x === h.x && o.y === h.y)));
    for (const s of other.slits) if (!this.slits.includes(s)) this.slits.push(s);
    for (const s of other.seams) if (!this.seams.some((o) => o[0]?.x === s[0]?.x && o[0]?.y === s[0]?.y)) this.seams.push(s);
    this.fieldDirty = true;
    this.marksDirty = true;
  }

  // Whole again: the full sheet, and everything on it fading away.
  mend() {
    this.poly = [
      { x: 0, y: 0 },
      { x: this.w0, y: 0 },
      { x: this.w0, y: this.h0 },
      { x: 0, y: this.h0 },
    ];
    for (const h of this.holes) h.hot = 0;
    this.slit = null;
    this.mending = 0;
    this.shapeDirty = true;
    this.marksDirty = true;
  }

  get mended() {
    return this.mending >= 1;
  }

  dispose() {
    for (const { face, scorch, marks } of this.faces) {
      scorch.remove();
      marks.remove();
      face.style.clipPath = "";
    }
    this.faces = [];
    if (this.turn) this.turn.style.clipPath = "";
    delete this.el.dataset.worn;
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
