import { bayer, BLACK, type Ink, type Paint } from "./ink";

// The puzzle the play is made of.

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A jigsaw piece as a polygon: a square of side `s` about (cx, cy), turned
 * by `angle`, with a knob (1), a socket (-1) or a flat edge (0) on each of
 * its sides, top, right, bottom, left. */
export function piece(cx: number, cy: number, s: number, angle: number, sides: number[]) {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const out: number[] = [];
  const put = (u: number, v: number) => out.push(cx + (u * c - v * sn) * s, cy + (u * sn + v * c) * s);
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let k = 0; k < 4; k += 1) {
    const [ax, ay] = corners[k];
    const [bx, by] = corners[(k + 1) % 4];
    const ex = bx - ax;
    const ey = by - ay;
    put(ax, ay);
    const d = sides[k];
    if (!d) continue;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    // out along the neck and round the knob, or into the socket
    put(mx - ex * 0.1, my - ey * 0.1);
    for (let i = 0; i <= 8; i += 1) {
      const phi = Math.PI + 0.65 - (i / 8) * (Math.PI + 1.3);
      const along = Math.cos(phi) * 0.13;
      const reach = (0.17 + Math.sin(phi) * 0.13) * d;
      put(mx + ex * along + ey * reach, my + ey * along - ex * reach);
    }
    put(mx + ex * 0.1, my + ey * 0.1);
  }
  return out;
}

/** The edges of a cols × rows jigsaw: each piece's four sides, interlocking
 * with its neighbours' and flat round the outside. */
export function jigsaw(cols: number, rows: number, seed: number) {
  const across = (i: number, j: number) => (hash(seed + i * 7.3 + j * 31.1) < 0.5 ? 1 : -1);
  const down = (i: number, j: number) => (hash(seed + i * 13.7 + j * 5.9 + 0.5) < 0.5 ? 1 : -1);
  return (i: number, j: number) => [
    j > 0 ? -down(i, j - 1) : 0,
    i < cols - 1 ? across(i, j) : 0,
    j < rows - 1 ? down(i, j) : 0,
    i > 0 ? -across(i - 1, j) : 0,
  ];
}

/** A piece as a thing you could pick up: filled, and edged in `edge` except
 * where an edge faces up and to the right, into the light, which catches
 * `light`. A piece is wound clockwise on the strip, so (dy, -dx) is out. */
export function tile(ink: Ink, pts: number[], fill: Paint, edge: Paint, light: Paint) {
  if (fill >> 4) ink.poly(pts, fill);
  const n = pts.length >> 1;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const dx = pts[j * 2] - pts[i * 2];
    const dy = pts[j * 2 + 1] - pts[i * 2 + 1];
    const lit = (dy * 0.6 + dx * 0.8) / (Math.hypot(dx, dy) || 1);
    ink.line(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], lit > 0.3 ? light : edge);
  }
}

/** A polygon's edge as hairlines. */
export function outline(ink: Ink, pts: number[], paint: Paint) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    ink.line(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], paint);
  }
}

/** The strip cut into a jigsaw of pieces about `s` across, and which piece
 * each of its pixels belongs to, for `crumble`. */
export type Grid = { w: number; h: number; s: number; cells: { x: number; y: number; sides: number[]; r: number }[]; member: Int32Array };

export function grid(ink: Ink, s: number): Grid {
  const { w, h } = ink;
  const cols = Math.ceil(w / s) + 1;
  const rows = Math.ceil(h / s) + 1;
  const sides = jigsaw(cols, rows, 7);
  const cells: Grid["cells"] = [];
  const member = new Int32Array(w * h);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const c = cells.length;
      cells.push({ x: i * s, y: j * s, sides: sides(i, j), r: hash(i * 7.1 + j * 13.3 + 0.5) });
      // a pixel the outlines leave out goes to the piece its square is in
      for (let y = Math.max(0, j * s - s / 2); y < Math.min(h, j * s + s / 2); y += 1) {
        for (let x = Math.max(0, i * s - s / 2); x < Math.min(w, i * s + s / 2); x += 1) member[Math.floor(y) * w + Math.floor(x)] = c;
      }
    }
  }
  for (let c = 0; c < cells.length; c += 1) ink.scan(piece(cells[c].x, cells[c].y, s, 0, cells[c].sides), (x, y) => (member[y * w + x] = c));
  return { w, h, s, cells, member };
}

/** The picture breaking up as that jigsaw. A wave runs out from (cx, cy),
 * and the seams light up in `seam` just ahead of it; behind it each piece
 * flies off away from the middle, turning, and thins out. `since` is
 * seconds since the wave set off, and the seams start to show half a second
 * before. Everything but his own pixels, owner 1, goes into `art` first, for
 * the pieces to carry. */
export function crumble(ink: Ink, g: Grid, art: Uint8Array, cx: number, cy: number, since: number, seam: Paint) {
  const WAVE = 1100;
  const FLY = 0.75;
  const { w, h, color, owner } = ink;
  const { s, cells, member } = g;
  const k = new Float32Array(cells.length);
  const full = new Uint8Array(cells.length);
  cells.forEach((c, i) => (k[i] = since - (Math.hypot(c.x - cx, c.y - cy) || 1) / WAVE - c.r * 0.08));
  // take the picture, and lift every piece that has gone
  for (let i = 0; i < w * h; i += 1) {
    if (owner[i] === 1) {
      art[i] = BLACK;
      continue;
    }
    const c = member[i];
    art[i] = color[i];
    if (color[i] !== BLACK) full[c] = 1;
    if (k[c] >= 0) {
      color[i] = BLACK;
      owner[i] = 0;
    }
  }
  // then put them down on their way out
  for (let i = 0; i < cells.length; i += 1) {
    const c = cells[i];
    const t = k[i];
    if (t < -0.5 || t >= FLY) continue;
    if (t < 0) {
      // more of the seams show the nearer the wave comes
      if (hash(c.r * 91.7) < (0.5 + t) * 2) outline(ink, piece(c.x, c.y, s, 0, c.sides), seam);
      continue;
    }
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const go = (140 + 260 * c.r) * t + 700 * t * t;
    const ox = c.x + (dx / d) * go;
    const oy = c.y + (dy / d) * go + 120 * t * t;
    const turn = (c.r - 0.5) * 7 * t;
    const shrink = 1 - 0.25 * t;
    const pts = piece(ox, oy, s * shrink, turn, c.sides);
    if (full[i]) {
      const keep = 1 - t / FLY;
      const cs = Math.cos(-turn) / shrink;
      const sn = Math.sin(-turn) / shrink;
      ink.scan(pts, (x, y) => {
        const at = y * w + x;
        if (owner[at] === 1 || bayer(x, y) >= keep) return;
        const rx = x + 0.5 - ox;
        const ry = y + 0.5 - oy;
        const sx = Math.floor(c.x + rx * cs - ry * sn);
        const sy = Math.floor(c.y + rx * sn + ry * cs);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
        color[at] = art[sy * w + sx];
        owner[at] = 0;
      });
    }
    if (t < 0.3) outline(ink, pts, seam);
  }
}

/** A ring of air pushed out from a point, thinning as it grows. */
export function ring(ink: Ink, cx: number, cy: number, r: number, width: number, paint: Paint, squash = 1) {
  const outer = r + width / 2;
  const inner = Math.max(0, r - width / 2);
  const y0 = Math.max(0, Math.floor(cy - outer * squash));
  const y1 = Math.min(ink.h - 1, Math.ceil(cy + outer * squash));
  for (let y = y0; y <= y1; y += 1) {
    const dy = (y + 0.5 - cy) / squash;
    if (dy * dy > outer * outer) continue;
    const far = Math.sqrt(outer * outer - dy * dy);
    const near = dy * dy < inner * inner ? Math.sqrt(inner * inner - dy * dy) : 0;
    // the two runs either side of the middle, in pixel centres
    for (const [a, b] of [[cx - far, cx - near], [cx + near, cx + far]]) {
      for (let x = Math.max(0, Math.ceil(a - 0.5)); x <= Math.min(ink.w - 1, Math.floor(b - 0.5)); x += 1) ink.put(x, y, paint);
    }
  }
}
