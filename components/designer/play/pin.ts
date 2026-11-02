// Corner pinning: lay an element's own w×h box onto any four points on the
// page, the way a monitor in the room holds whatever is on it. The element
// keeps its layout; only its transform changes, so text and canvases inside
// stay live.

/** Viewport px, clockwise from the top left: TL, TR, BR, BL. */
export type Quad = [number, number, number, number, number, number, number, number];

/** A box in an element's own px. */
export type Box = { x: number; y: number; w: number; h: number };

// The projective map from the unit square onto the quad (Heckbert's), as the
// 3×3 [a b c; d e f; g h 1].
function squareToQuad(q: Quad) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0];
  }
  const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

/** The css `matrix3d` that carries `box` (in the element's own px, with
 * transform-origin 0 0) onto `quad`. */
export function pinMatrix(box: Box, quad: Quad) {
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  // first move the box to the unit square
  const sx = 1 / box.w, sy = 1 / box.h;
  const A = a * sx, B = b * sy, C = c - (a * box.x * sx + b * box.y * sy);
  const D = d * sx, E = e * sy, F = f - (d * box.x * sx + e * box.y * sy);
  const G = g * sx, H = h * sy, I = 1 - (g * box.x * sx + h * box.y * sy);
  const n = (v: number) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(10));
  return `matrix3d(${[A, D, 0, G, B, E, 0, H, 0, 0, 1, 0, C, F, 0, I].map(n).join(",")})`;
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

export function lerpQuad(a: Quad, b: Quad, t: number): Quad {
  return a.map((v, i) => v + (b[i] - v) * t) as Quad;
}

/** The part of a w×h box that fills a frame of the given aspect, centred:
 * what a video player does to footage of another shape. */
export function cover(w: number, h: number, aspect: number): Box {
  if (w / h > aspect) {
    const cw = h * aspect;
    return { x: (w - cw) / 2, y: 0, w: cw, h };
  }
  const ch = w / aspect;
  return { x: 0, y: (h - ch) / 2, w, h: ch };
}

/** A sub-rectangle of a pinned quad: `box` within a `frame` (both in the
 * same element px), carried along by the same projective map. */
export function subQuad(frame: Box, quad: Quad, box: Box): Quad {
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  const map = (x: number, y: number) => {
    const u = (x - frame.x) / frame.w, v = (y - frame.y) / frame.h;
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
  return [
    ...map(box.x, box.y),
    ...map(box.x + box.w, box.y),
    ...map(box.x + box.w, box.y + box.h),
    ...map(box.x, box.y + box.h),
  ] as Quad;
}

export const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  // the pull back: slow to leave, a long slow settle
  pull: (t: number) => {
    const a = t * t * t, b = 1 - (1 - t) ** 4;
    return a + (b - a) * t;
  },
};

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
