// Corner pinning: lay an element's own w×h box onto any four points on the
// page, the way a monitor in the room holds whatever is on it. The element
// keeps its layout; only its transform changes, so text and canvases inside
// stay live.

/** Viewport px, clockwise from the top left: TL, TR, BR, BL. */
export type Quad = [number, number, number, number, number, number, number, number];

/** A box in an element's own px. */
export type Box = { x: number; y: number; w: number; h: number };

// The projective map from the unit square onto the quad (Heckbert's), as the
// 3×3 [a b c; d e f; g h 1], written into one shared array: it's worked out
// several times a frame, and nothing here needs to keep it.
const map = [0, 0, 0, 0, 0, 0, 0, 0];
function squareToQuad(q: Quad) {
  const x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3], x2 = q[4], y2 = q[5], x3 = q[6], y3 = q[7];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) >= 1e-9 || Math.abs(dy3) >= 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  map[0] = x1 - x0 + g * x1;
  map[1] = x3 - x0 + h * x3;
  map[2] = x0;
  map[3] = y1 - y0 + g * y1;
  map[4] = y3 - y0 + h * y3;
  map[5] = y0;
  map[6] = g;
  map[7] = h;
  return map;
}

const n = (v: number) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(10));

/** The css `matrix3d` that carries `box` (in the element's own px, with
 * transform-origin 0 0) onto `quad`. */
export function pinMatrix(box: Box, quad: Quad) {
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  // first move the box to the unit square
  const sx = 1 / box.w, sy = 1 / box.h;
  const A = a * sx, B = b * sy, C = c - (a * box.x * sx + b * box.y * sy);
  const D = d * sx, E = e * sy, F = f - (d * box.x * sx + e * box.y * sy);
  const G = g * sx, H = h * sy, I = 1 - (g * box.x * sx + h * box.y * sy);
  return `matrix3d(${n(A)},${n(D)},0,${n(G)},${n(B)},${n(E)},0,${n(H)},0,0,1,0,${n(C)},${n(F)},0,${n(I)})`;
}

/** Pins `box` of `node` onto `quad`, and clips the node to that box. */
export function pin(node: HTMLElement, box: Box, quad: Quad, width: number, height: number) {
  node.style.transform = pinMatrix(box, quad);
  const top = box.y, left = box.x;
  const right = width - (box.x + box.w), bottom = height - (box.y + box.h);
  node.style.clipPath =
    top <= 0.01 && left <= 0.01 && right <= 0.01 && bottom <= 0.01
      ? ""
      : `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px)`;
}

export function unpin(node: HTMLElement) {
  node.style.transform = "";
  node.style.clipPath = "";
}

export function lerpQuad(a: Quad, b: Quad, t: number, out: Quad = [0, 0, 0, 0, 0, 0, 0, 0]): Quad {
  for (let i = 0; i < 8; i += 1) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** The part of a w×h box that fills a frame of the given aspect, centred:
 * what a video player does to footage of another shape. */
export function cover(w: number, h: number, aspect: number, out: Box = { x: 0, y: 0, w: 0, h: 0 }): Box {
  if (w / h > aspect) {
    const cw = h * aspect;
    out.x = (w - cw) / 2;
    out.y = 0;
    out.w = cw;
    out.h = h;
    return out;
  }
  const ch = w / aspect;
  out.x = 0;
  out.y = (h - ch) / 2;
  out.w = w;
  out.h = ch;
  return out;
}

/** A sub-rectangle of a pinned quad: `box` within a `frame` (both in the
 * same element px), carried along by the same projective map. */
export function subQuad(frame: Box, quad: Quad, box: Box, out: Quad = [0, 0, 0, 0, 0, 0, 0, 0]): Quad {
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  const corner = (i: number, x: number, y: number) => {
    const u = (x - frame.x) / frame.w, v = (y - frame.y) / frame.h;
    const w = g * u + h * v + 1;
    out[i] = (a * u + b * v + c) / w;
    out[i + 1] = (d * u + e * v + f) / w;
  };
  corner(0, box.x, box.y);
  corner(2, box.x + box.w, box.y);
  corner(4, box.x + box.w, box.y + box.h);
  corner(6, box.x, box.y + box.h);
  return out;
}

export const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
};

/** CSS's cubic-bezier(x1, y1, x2, y2), as a function of time from 0 to 1. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method finds the curve's own parameter for this time, and
    // halving the interval does it when the slope is too flat to trust
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const error = sampleX(t) - x;
      const slope = slopeX(t);
      if (Math.abs(error) < 1e-6 || Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(sampleX(t) - x) > 1e-4) {
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 24; i += 1) {
        const v = sampleX(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sampleY(t);
  };
}

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
