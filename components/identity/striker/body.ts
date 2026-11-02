import { BLACK, CYAN, DEEP, DIM, FAINT, HAIR, INK, type Ink, type Paint, ROYAL, SKIN, SLATE, STRIPE, SUIT, TAN, tone } from "./ink";

// A player, side on. Measures are in world units, about 28 to the metre, so a
// player stands a little under fifty tall, about seven heads. Legs are placed
// by their ankles and solved for the knee, so a planted foot stays planted
// whatever the hips do.

export const THIGH = 12.2;
export const SHIN = 12;
export const ANKLE = 1.6;
export const HIP = THIGH + SHIN + ANKLE - 1.2;
/** pelvis to the base of the neck */
const TORSO = 15.2;
/** the middle of the head, up and forward of the base of the neck */
const HEAD_UP = 5.2;
const HEAD_FWD = 0.55;
/** the shoulder joint, under the base of the neck */
const SHOULDER = 1.7;
const UPPER = 9;
const FORE = 7.4;
/** how far apart the near and far hips sit in depth, and the shoulders */
const SIDE = 2.2;
const SHOULDERS = 2.8;
/** the sock comes up to just under the knee */
const SOCK_TOP = 0.13;

export type Foot = { x: number; y: number; a: number };
/** shoulder swing from hanging (forward positive), elbow bend, how far the
 * hand is closed (0 open, a half loosely, 1 a fist) and how far it is turned
 * at the wrist, toward the thumb positive */
export type Arm = { s: number; e: number; g?: number; w?: number };

export type Pose = {
  /** pelvis, in the world */
  x: number;
  y: number;
  /** depth: positive is further from the camera */
  z: number;
  /** 1 faces the goal, -1 faces back up the pitch */
  f: number;
  /** torso lean from upright, forward positive */
  lean: number;
  /** head tilt on top of the lean, down positive */
  head: number;
  /** ankles, in the world, and the pitch of each foot (toes up positive) */
  near: Foot;
  far: Foot;
  armNear: Arm;
  armFar: Arm;
  /** 0 calm, 1 locked on, 2 shouting, 3 the grin */
  face: number;
  /** how hard the air pushes his hair and shirt back, about 0.3 standing */
  hair: number;
};

export type Look = {
  skin: Paint;
  /** skin on the far arm and leg, a step down */
  farSkin: Paint;
  /** the line round the light parts */
  line: Paint;
  farLine: Paint;
  /** the edge of the dark kit, so it holds against the black */
  trim: Paint;
  farTrim: Paint;
  /** screentone on the shadow side of the near limbs */
  shade: Paint;
  shirt: Paint;
  shirtShade: Paint;
  /** long fitted sleeves, or bare arms under short ones */
  sleeves: "long" | "short";
  sleeve: Paint;
  farSleeve: Paint;
  /** lines that wind round the long sleeves */
  stripes?: Paint;
  /** a high collar up the neck */
  collar?: Paint;
  /** the fitted top, where it shows in a bib's scooped neck; without one
   * the shirt comes up round the neck */
  top?: Paint;
  /** the edging round the bib's neck and along its hem */
  edging?: Paint;
  shorts: Paint;
  socks: Paint;
  /** a band round the top of each sock */
  band?: Paint;
  boots: Paint;
  farBoots: Paint;
  hair: Paint;
  hairLine: Paint;
  /** darker lines between the locks */
  strands?: Paint;
  /** the narrow light along the top of the hair */
  shine: Paint;
  /** lids, brows and mouth */
  mark: Paint;
  /** the iris, and what it turns when he locks on */
  iris: Paint;
  lit: Paint;
  gloves?: Paint;
  cut: "fringe" | "crop";
};

/** Where the camera is: world point (cx, cy) sits `ox` pixels across and
 * `base` pixels down, the middle of the window the play is seen through,
 * which is w by h, and one world unit is `zoom` pixels. */
export type View = { cx: number; cy: number; zoom: number; w: number; h: number; base: number; ox: number };

// a slightly raised side view: depth runs up and to the right
export const DX = 0.34;
export const DY = 0.16;
export const px = (v: View, x: number, z: number) => v.ox + (x + z * DX - v.cx) * v.zoom;
export const py = (v: View, y: number, z: number) => v.base - (y + z * DY - v.cy) * v.zoom;

/** how much of the lean his pelvis takes. A runner leans from the ankles,
 * hips kept under him; the lean that shows in his chest comes up through
 * the lower back, not from folding at the hips, which sits the seat back and
 * out behind him. */
const PELVIS = 0.4;

/** His spine, from the pelvis to the base of the neck: tipped forward only a
 * little low down, coming round to the full lean of the chest over the
 * lower back. `at` takes a point given forward and up from the pelvis, as the
 * torso's shapes are, onto it. */
export function spine(p: Pose) {
  const f = p.f;
  const low = p.lean * PELVIS;
  const angle = (b: number) => {
    const k = Math.min(1, Math.max(0, (b - 1.5) / 8));
    return low + (p.lean - low) * k * k * (3 - 2 * k);
  };
  // the line of it, a unit at a time
  const xs = [p.x];
  const ys = [p.y];
  for (let s = 1; s <= 17; s += 1) {
    const a = angle(s - 0.5);
    xs.push(xs[s - 1] + f * Math.sin(a));
    ys.push(ys[s - 1] + Math.cos(a));
  }
  const at = (fwd: number, up: number) => {
    const a = angle(up);
    let cx: number;
    let cy: number;
    if (up <= 0) {
      cx = p.x + f * Math.sin(low) * up;
      cy = p.y + Math.cos(low) * up;
    } else {
      const i = Math.min(16, Math.floor(up));
      const k = Math.min(1, up - i);
      cx = xs[i] + (xs[i + 1] - xs[i]) * k;
      cy = ys[i] + (ys[i + 1] - ys[i]) * k;
    }
    return [cx + f * Math.cos(a) * fwd, cy - Math.sin(a) * fwd];
  };
  return { at, neck: at(0, TORSO) };
}

/** The middle of his head, in the world. */
export function headOf(p: Pose) {
  const [neckX, neckY] = spine(p).neck;
  const tilt = p.lean * 0.45 + p.head;
  return {
    x: neckX + p.f * (Math.sin(tilt) * HEAD_UP + Math.cos(tilt) * HEAD_FWD),
    y: neckY + Math.cos(tilt) * HEAD_UP - Math.sin(tilt) * HEAD_FWD,
  };
}

/** An arm's shoulder, elbow and wrist in the world, and the angle of the
 * forearm. */
function armJoints(p: Pose, a: Arm) {
  const f = p.f;
  // the shoulder comes forward with the arm as the chest turns into the
  // swing, and goes back with it, but not once the arm is up over his head
  const turn = 0.7 * Math.sin(a.s) * Math.max(0, 1 - Math.max(0, Math.abs(a.s) - 1.4) / 0.6) - 0.4;
  const [sx, sy] = spine(p).at(turn, TORSO - SHOULDER);
  const ua = a.s - p.lean;
  const ex = sx + f * Math.sin(ua) * UPPER;
  const ey = sy - Math.cos(ua) * UPPER;
  const fa = ua + a.e;
  return { sx, sy, ex, ey, wx: ex + f * Math.sin(fa) * FORE, wy: ey - Math.cos(fa) * FORE, fa };
}

/** His bones in the world, each [x0, y0, x1, y1, depth, how far the flesh
 * stands off it]: what the flow comes off. Torso, head, near leg, far leg,
 * near arm, far arm. */
export function bones(p: Pose) {
  const [neckX, neckY] = spine(p).neck;
  const head = headOf(p);
  const out = [
    [p.x, p.y, neckX, neckY, p.z, 3.3],
    [head.x, head.y, head.x, head.y, p.z, 3.4],
  ];
  for (const [foot, z] of [[p.near, p.z - SIDE], [p.far, p.z + SIDE]] as const) {
    const { kx, ky, ax, ay } = knee(p.f, p.x, p.y, foot.x, foot.y);
    out.push([p.x, p.y, kx, ky, z, 2.7], [kx, ky, ax, ay, z, 1.7]);
  }
  for (const [a, z] of [[p.armNear, p.z - SHOULDERS], [p.armFar, p.z + SHOULDERS]] as const) {
    const j = armJoints(p, a);
    out.push([j.sx, j.sy, j.ex, j.ey, z, 1.6], [j.ex, j.ey, j.wx, j.wy, z, 1.2]);
  }
  return out;
}

/** Solves a leg: the knee bends forward, and an ankle out of reach pulls the
 * leg straight toward it. */
export function knee(f: number, hx: number, hy: number, ax: number, ay: number) {
  let dx = ax - hx;
  let dy = ay - hy;
  let d = Math.hypot(dx, dy);
  const reach = THIGH + SHIN - 0.02;
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
    d = reach;
  }
  d = Math.max(d, Math.abs(THIGH - SHIN) + 0.5);
  const toward = Math.atan2(f * dx, -dy);
  const open = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d))));
  const thigh = toward + open;
  return { kx: hx + f * Math.sin(thigh) * THIGH, ky: hy - Math.cos(thigh) * THIGH, ax: hx + dx, ay: hy + dy };
}


// —— shapes. Each limb is a contour: how far its front and back edges stand
// off the bone along its length, so a thigh carries its quad and a shin its
// calf, with the ends rounded off into the joints. He is lean: slim arms with
// the elbow showing, a trained thigh, a lean knee, a calf and a slim ankle.
// The thigh starts slim at the hip joint, which is inside the pelvis, and
// fills out below it, so its rounded end stays hidden in the shorts.

type Profile = { t: number[]; front: number[]; back: number[] };

const THIGH_SHAPE: Profile = { t: [0, 0.16, 0.38, 0.62, 0.86, 1], front: [1.9, 2.75, 2.95, 2.55, 1.85, 1.6], back: [1.75, 2.35, 2.3, 1.95, 1.62, 1.55] };
const SHIN_SHAPE: Profile = { t: [0, 0.13, 0.3, 0.56, 0.82, 1], front: [1.6, 1.5, 1.35, 1.12, 0.9, 0.85], back: [1.55, 2.15, 2.3, 1.55, 0.95, 0.9] };
const UPPER_SHAPE: Profile = { t: [0, 0.3, 0.62, 1], front: [1.75, 1.5, 1.38, 1], back: [1.75, 1.6, 1.3, 1] };
const FORE_SHAPE: Profile = { t: [0, 0.22, 0.62, 1], front: [1, 1.25, 0.92, 0.66], back: [1, 1.15, 0.85, 0.66] };
const NECK_SHAPE: Profile = { t: [0, 1], front: [1.4, 1.2], back: [1.65, 1.45] };

const widthAt = (values: number[], ts: number[], t: number) => {
  if (t <= ts[0]) return values[0];
  for (let i = 1; i < ts.length; i += 1) {
    if (t <= ts[i]) {
      const k = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
      return values[i - 1] + (values[i] - values[i - 1]) * k * k * (3 - 2 * k);
    }
  }
  return values[values.length - 1];
};

/** A limb's outline, in world units: front edge down, round the far end,
 * back edge up and round the near end. `swell` thickens it, for a sleeve or
 * the leg of a pair of shorts; `from` and `to` take only part of it. */
function limb(ax: number, ay: number, bx: number, by: number, shape: Profile, f: number, swell = 0, from = 0, to = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  const nx = f * -uy;
  const ny = f * ux;
  const ts: number[] = [from];
  for (const t of shape.t) if (t > from && t < to) ts.push(t);
  ts.push(to);
  const front = (t: number) => widthAt(shape.front, shape.t, t) + swell;
  const back = (t: number) => widthAt(shape.back, shape.t, t) + swell;
  const pts: number[] = [];
  const at = (t: number, off: number) => pts.push(ax + ux * t * len + nx * off, ay + uy * t * len + ny * off);
  for (const t of ts) at(t, front(t));
  if (to === 1) {
    const r = (front(1) + back(1)) / 2;
    const shift = (front(1) - back(1)) / 2;
    for (let i = 1; i < 6; i += 1) {
      const a = (i / 6) * Math.PI;
      pts.push(bx + nx * (shift + r * Math.cos(a)) + ux * r * Math.sin(a), by + ny * (shift + r * Math.cos(a)) + uy * r * Math.sin(a));
    }
  }
  for (let i = ts.length - 1; i >= 0; i -= 1) at(ts[i], -back(ts[i]));
  if (from === 0) {
    const r = (front(0) + back(0)) / 2;
    const shift = (front(0) - back(0)) / 2;
    for (let i = 1; i < 6; i += 1) {
      const a = (i / 6) * Math.PI;
      pts.push(ax + nx * (shift - r * Math.cos(a)) - ux * r * Math.sin(a), ay + ny * (shift - r * Math.cos(a)) - uy * r * Math.sin(a));
    }
  }
  return pts;
}

/** The back half of a limb, where the screentone goes. */
function limbShade(ax: number, ay: number, bx: number, by: number, shape: Profile, f: number, from = 0, to = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  const nx = f * -uy;
  const ny = f * ux;
  const pts: number[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps;
    const b = widthAt(shape.back, shape.t, t);
    pts.push(ax + ux * t * len - nx * b, ay + uy * t * len - ny * b);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const t = from + ((to - from) * i) / steps;
    const b = widthAt(shape.back, shape.t, t) * 0.12;
    pts.push(ax + ux * t * len - nx * b, ay + uy * t * len - ny * b);
  }
  return pts;
}

/** A thin shape along a spine of points, `widths` either side of each. */
function taper(spine: number[][], widths: number[]) {
  const left: number[][] = [];
  const right: number[][] = [];
  spine.forEach(([a, b], i) => {
    const [pa, pb] = spine[Math.max(0, i - 1)];
    const [na, nb] = spine[Math.min(spine.length - 1, i + 1)];
    const l = Math.hypot(na - pa, nb - pb) || 1;
    const w = widths[i];
    left.push([a - ((nb - pb) / l) * w, b + ((na - pa) / l) * w]);
    right.push([a + ((nb - pb) / l) * w, b - ((na - pa) / l) * w]);
  });
  return [...left, ...right.reverse()];
}

/** Points given in a local frame (forward, up) about an origin, into the world. */
function frame(points: number[][], ox: number, oy: number, fx: number, fy: number, ux: number, uy: number) {
  const pts: number[] = [];
  for (const [a, b] of points) pts.push(ox + fx * a + ux * b, oy + fy * a + uy * b);
  return pts;
}

// the torso, about the pelvis: forward, then up. A loose sleeveless bib over
// a fitted top, hanging to the tops of the legs, its neck scooped low in
// front so the top shows between it and the collar. He is built like a
// winger: deep through the chest, narrowing to a lean waist, and only a
// little seat behind the hips.
const TOP = [[3.4, 10.6], [3.05, 12.8], [2.15, 14.4], [1.05, 15.2], [-0.2, 15.35], [-0.3, 12], [2, 10.4]];
const SHIRT = [
  [2.9, -0.4], [2.6, 2.5], [2.65, 5.3], [3.1, 8.1], [3.4, 10.6], [3.28, 11.9], [2.3, 12.55], [1.35, 13.6], [0.55, 15.05],
  [-1, 15.3], [-2.3, 14.6], [-3.2, 12.4], [-3.25, 9.8], [-2.7, 6.6], [-2.65, 3.6], [-2.95, -0.25], [-1.6, -0.7], [0.5, -0.55], [2, -0.75],
];
const SHIRT_SHADE = [[-2.95, -0.2], [-2.65, 3.6], [-2.7, 6.6], [-3.25, 9.8], [-3.2, 12.4], [-2.35, 14.4], [-1.3, 12.5], [-1.45, 9.4], [-1.05, 6], [-1.25, 2.8], [-1.6, -0.3]];
const NECKLINE = [[3.28, 11.9], [2.3, 12.55], [1.35, 13.6], [0.55, 15.05]];
// the bottom of the bib again, to hang over the near leg, with its edging;
// and the bib over the near shoulder, where the arm comes out of it
const HEM = [[2.9, -0.4], [2.6, 2.5], [2.62, 4.4], [-2.68, 4.4], [-2.65, 3.6], [-2.95, -0.25], [-1.6, -0.7], [0.5, -0.55], [2, -0.75]];
const HEM_EDGE = [[2.8, 0.4], [1.2, 0.1], [-1.4, 0.05], [-2.85, 0.5]];
const STRAP = [[-2.3, 14.6], [-1, 15.3], [0.55, 15.05], [1.05, 14.1], [1.45, 13.55], [0.5, 14.15], [-1, 14.1], [-1.85, 13.4]];
const ARMHOLE = [[1.45, 13.55], [0.5, 14.15], [-1, 14.1], [-1.85, 13.4]];
const SHORTS = [[-2.95, 3.2], [2.75, 3.2], [3, 0.7], [2.55, -2.2], [-0.6, -2.55], [-2.95, -1.85], [-3.3, 0.9]];
// the head, about its middle: the back of the skull, the crown, the brow, a
// short straight nose with a small point, thin lips, a small chin, the jaw
const HEAD_SHAPE = [
  [-1.45, -2.35], [-2.4, -1.4], [-2.88, -0.05], [-2.82, 1.5], [-2.22, 2.8], [-1.1, 3.55], [0.3, 3.75], [1.55, 3.42], [2.4, 2.65],
  [2.82, 1.6], [2.93, 0.82], [2.74, 0.42], [3, -0.18], [3.32, -0.86], [3.18, -1.06], [2.96, -1.14], [3.02, -1.5], [2.86, -1.72],
  [2.92, -1.92], [2.66, -2.26], [2.74, -2.66], [2.42, -3.16], [1.66, -3.08], [0.66, -2.58], [-0.22, -2],
];
const EAR = [[0.05, 0.55], [0.22, 0.08], [0.12, -0.55], [-0.15, -0.98], [-0.55, -1.02], [-0.85, -0.58], [-0.88, 0.3], [-0.55, 0.72]];
// the jaw, from under the chin back to below the ear
const JAW = [[2.25, -3.12], [1.25, -2.95], [0.35, -2.42]];
// his hair: thick, short and round as a helmet, smooth over the crown. A
// fringe of locks hangs over the brow to the eyes and stands a little off
// the forehead; it comes down over the top of the ear with a lock in front
// of it, and ends at the nape in a few short points
const FRINGE = [
  [1.3, 1.35], [1.75, 0.4], [2.05, 1.05], [2.45, 0.5], [2.62, 1.1], [3.05, 0.42], [3, 1.35], [3.4, 1.05], [3.42, 2],
  [3.25, 2.85], [2.85, 3.55], [2.15, 4.2], [1.2, 4.62], [0.1, 4.82], [-1, 4.72], [-1.95, 4.32], [-2.75, 3.68], [-3.3, 2.85],
  [-3.62, 1.85], [-3.7, 0.8], [-3.55, -0.2], [-3.35, -1.05], [-2.95, -0.7], [-2.75, -1.75], [-2.35, -1.05], [-1.95, -1.55],
  [-1.6, -0.6], [-1, 0.05], [-0.45, 0.35], [0.1, 0.15], [0.3, -0.75], [0.62, -0.05], [1, -1.2], [1.25, 0.1],
];
// where one lock lies over the next, and the grey light across the top
const FRINGE_STRANDS = [
  [[2.35, 3.1], [2.3, 2], [2.2, 1.15]],
  [[0.85, 3.85], [1.1, 2.6], [1.45, 1.7]],
  [[-1.45, 3.65], [-1.6, 2.2], [-1.85, 0.7]],
];
const FRINGE_SHINE = [
  [[2.6, 3.3], [1.85, 3.9], [0.95, 4.25]],
  [[-1.15, 4.25], [-2.05, 3.78], [-2.75, 3]],
  [[3.08, 2.65], [3.15, 1.95]],
];
// the two strands that stand up off his crown: base, bend, tip
const SPROUTS = [
  [[-0.15, 4.7], [-0.05, 5.65], [0.55, 6.05]],
  [[-0.4, 4.65], [-0.8, 5.35], [-1.25, 5.5]],
];
const CROP = [[2.5, 2.35], [1.15, 3.95], [-1.25, 4.1], [-3.15, 2.85], [-3.7, 0.65], [-3.4, -1.5], [-2.3, -1], [-1.4, 1], [0.5, 1.85]];
const BOOT = [[-1.95, 0.7], [-1.85, -0.95], [-1.2, -1.5], [3.5, -1.5], [5.35, -1.05], [5.15, -0.1], [3, 0.75], [1.1, 1.55], [-0.65, 1.95]];
// a hand from the wrist, along the line of the forearm and out toward the
// thumb, seen across its back: open, the fingers together and a little
// curled; loosely shut, as a runner carries it, the fingers curled in and
// the thumb lying along the first of them; and clenched. The same points in
// each, so a hand closes by degrees. Then the line under the thumb and the
// lines between the fingers, likewise
const HANDS = [
  [[-0.3, 0.66], [0.6, 1], [1.45, 1.4], [2.3, 1.6], [3.05, 1.52], [2.9, 1.1], [3.95, 1], [4.65, 0.68], [4.55, 0.4], [4.95, 0.12], [4.6, -0.15], [4.78, -0.4], [4.22, -0.62], [4.3, -0.82], [3.6, -1.02], [2.65, -1.12], [1.7, -1.1], [0.9, -0.96], [0.32, -0.76], [-0.3, -0.66]],
  [[-0.3, 0.66], [0.6, 0.98], [1.4, 1.36], [2.25, 1.48], [2.95, 1.38], [3.22, 1.1], [3.42, 0.78], [3.5, 0.42], [3.42, 0.2], [3.44, -0.02], [3.3, -0.24], [3.3, -0.45], [3.13, -0.66], [3.07, -0.85], [2.68, -1.1], [2.1, -1.15], [1.5, -1.1], [0.85, -0.95], [0.3, -0.76], [-0.3, -0.66]],
  [[-0.3, 0.66], [0.55, 0.98], [1.3, 1.3], [2.1, 1.42], [2.75, 1.34], [3, 1.06], [3.16, 0.74], [3.22, 0.38], [3.15, 0.17], [3.18, -0.04], [3.06, -0.25], [3.06, -0.45], [2.9, -0.64], [2.86, -0.82], [2.52, -1.07], [2, -1.15], [1.42, -1.1], [0.8, -0.95], [0.28, -0.76], [-0.3, -0.66]],
];
const CREASES = [
  [[1, 0.76], [2.8, 1.1], [3, 0.4], [4.55, 0.4], [3, -0.15], [4.62, -0.15], [2.9, -0.62], [4.2, -0.62]],
  [[0.95, 0.74], [2.85, 1.06], [2.75, 0.22], [3.38, 0.22], [2.65, -0.24], [3.25, -0.24], [2.5, -0.68], [3.02, -0.68]],
  [[0.9, 0.74], [2.65, 1.04], [2.6, 0.18], [3.12, 0.18], [2.5, -0.26], [3, -0.26], [2.36, -0.66], [2.8, -0.66]],
];
/** a hand's points `g` of the way from open to clenched */
const shut = (shapes: number[][][], g: number) => {
  const [a, b] = g < 0.5 ? [shapes[0], shapes[1]] : [shapes[1], shapes[2]];
  const k = g < 0.5 ? g * 2 : g * 2 - 1;
  return a.map(([u, n], i) => [u + (b[i][0] - u) * k, n + (b[i][1] - n) * k]);
};

type Part = { pts: number[]; fill: Paint; line: Paint; shade?: number[]; tone?: Paint };
type Mark = { pts: number[]; paint: Paint; line?: Paint; r?: number };

export function drawPlayer(ink: Ink, v: View, p: Pose, look: Look, between?: () => void) {
  const zoom = v.zoom;
  const width = Math.max(1, Math.min(2.2, 0.42 * zoom));
  const f = p.f;
  const up = [f * Math.sin(p.lean), Math.cos(p.lean)];
  const back = spine(p);
  const neck = back.neck;
  const tilt = p.lean * 0.45 + p.head;
  const hu = [f * Math.sin(tilt), Math.cos(tilt)];
  const hf = [f * Math.cos(tilt), -Math.sin(tilt)];
  const middle = headOf(p);
  const head = [middle.x, middle.y];
  const wind = Math.max(0, Math.min(1.3, (p.hair - 0.3) / 1.2));

  // world → strip, at a depth
  const project = (pts: number[], z: number) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(px(v, pts[i], z), py(v, pts[i + 1], z));
    return out;
  };
  const inHead = (points: number[][]) => frame(points, head[0], head[1], hf[0], hf[1], hu[0], hu[1]);
  const inTorso = (points: number[][]) => points.flatMap(([a, b]) => back.at(a, b));
  // the loose bib lifts at the back and flaps at the hem as he goes, up
  // off him like cloth rather than out behind him
  const billow = (points: number[][]) =>
    points.map(([a, b]) => {
      const low = Math.max(0, 1 - b / 5);
      return a < 0 ? [a - wind * 0.55 * low, b + wind * 1.05 * low * low] : [a - wind * 0.25 * low, b];
    });

  // —— a leg: the bare thigh and knee, the sock pulled up under the knee
  // with a band round its top, the boot, the leg of the shorts
  const leg = (foot: Foot, z: number, far: boolean) => {
    const parts: Part[] = [];
    const { kx, ky, ax, ay } = knee(f, p.x, p.y, foot.x, foot.y);
    const skin = far ? look.farSkin : look.skin;
    const line = far ? look.farLine : look.line;
    const trim = far ? look.farTrim : look.trim;
    const shade = far ? 0 : look.shade;
    parts.push({
      pts: project(limb(p.x, p.y, kx, ky, THIGH_SHAPE, f), z),
      fill: skin,
      line,
      shade: shade ? project(limbShade(p.x, p.y, kx, ky, THIGH_SHAPE, f, 0.42, 1), z) : undefined,
      tone: shade,
    });
    parts.push({ pts: project(limb(kx, ky, ax, ay, SHIN_SHAPE, f), z), fill: skin, line });
    parts.push({ pts: project(limb(kx, ky, ax, ay, SHIN_SHAPE, f, 0.14, SOCK_TOP, 1), z), fill: look.socks, line: trim });
    if (look.band && !far) parts.push({ pts: project(limb(kx, ky, ax, ay, SHIN_SHAPE, f, 0.2, SOCK_TOP, SOCK_TOP + 0.085), z), fill: look.band, line: trim });
    const da = [f * Math.cos(foot.a), Math.sin(foot.a)];
    const na = [-f * Math.sin(foot.a), Math.cos(foot.a)];
    parts.push({ pts: project(frame(BOOT, ax, ay, da[0], da[1], na[0], na[1]), z), fill: far ? look.farBoots : look.boots, line });
    parts.push({ pts: project(limb(p.x, p.y, kx, ky, THIGH_SHAPE, f, 0.6, 0, 0.5), z), fill: look.shorts, line: trim });
    return { parts, ax, ay };
  };

  // —— an arm: in a fitted sleeve to the wrist, or bare under a short one,
  // and a hand, loosely shut while he runs, that opens and clenches
  const arm = (a: Arm, z: number, far: boolean) => {
    const parts: Part[] = [];
    const marks: Mark[] = [];
    const { sx, sy, ex, ey, wx, wy, fa } = armJoints(p, a);
    const skin = far ? look.farSkin : look.skin;
    const line = far ? look.farLine : look.line;
    const trim = far ? look.farTrim : look.trim;
    const long = look.sleeves === "long";
    const fill = long ? (far ? look.farSleeve : look.sleeve) : skin;
    const edge = long ? trim : line;
    const shade = far || long ? 0 : look.shade;
    parts.push({ pts: project(limb(sx, sy, ex, ey, UPPER_SHAPE, f), z), fill, line: edge, shade: shade ? project(limbShade(sx, sy, ex, ey, UPPER_SHAPE, f, 0.45, 1), z) : undefined, tone: shade });
    parts.push({ pts: project(limb(ex, ey, wx, wy, FORE_SHAPE, f), z), fill, line: edge, shade: shade ? project(limbShade(ex, ey, wx, wy, FORE_SHAPE, f), z) : undefined, tone: shade });
    // the hand, turned at the wrist
    const ha = fa + (a.w ?? 0);
    const du = [f * Math.sin(ha), -Math.cos(ha)];
    const dn = [f * Math.cos(ha), Math.sin(ha)];
    const g = Math.max(0, Math.min(1, a.g ?? 0));
    const size = look.gloves ? 1.3 : 1;
    const inHand = (points: number[][]) => project(frame(points.map(([u, n]) => [u * size, n * size]), wx, wy, du[0], du[1], dn[0], dn[1]), z);
    parts.push({ pts: inHand(shut(HANDS, g)), fill: look.gloves ?? skin, line });
    const creases = shut(CREASES, g);
    for (let i = 0; i < creases.length; i += 2) marks.push({ pts: inHand([creases[i], creases[i + 1]]), paint: far ? look.farLine : look.farSkin, r: 0.07 });
    if (!long) parts.push({ pts: project(limb(sx, sy, ex, ey, UPPER_SHAPE, f, 0.45, 0, 0.45), z), fill: far ? look.farSleeve : look.sleeve, line: trim });
    if (long && look.stripes) {
      // the lines wind round the arm: across the upper arm from the front of
      // the shoulder to behind the elbow, back across the forearm, and a
      // ring at the cuff
      const on = (bx: number, by: number, cx: number, cy: number, shape: Profile, t: number, side: number) => {
        const len = Math.hypot(cx - bx, cy - by) || 1e-6;
        const ux = (cx - bx) / len;
        const uy = (cy - by) / len;
        const off = side * widthAt(side > 0 ? shape.front : shape.back, shape.t, t);
        return [bx + ux * t * len - f * uy * off, by + uy * t * len + f * ux * off];
      };
      const lines = [
        [on(sx, sy, ex, ey, UPPER_SHAPE, 0.2, 0.78), on(sx, sy, ex, ey, UPPER_SHAPE, 0.92, -0.72)],
        [on(ex, ey, wx, wy, FORE_SHAPE, 0.12, -0.72), on(ex, ey, wx, wy, FORE_SHAPE, 0.8, 0.7)],
        [on(ex, ey, wx, wy, FORE_SHAPE, 0.95, -0.75), on(ex, ey, wx, wy, FORE_SHAPE, 0.95, 0.75)],
      ];
      for (const [b, c] of lines) marks.push({ pts: project([...b, ...c], z), paint: look.stripes, r: 0.2 });
    }
    return { parts, marks };
  };

  // —— the body: shorts, the bib, neck and collar, head and hair
  const z = p.z;
  const body: Part[] = [];
  const marks: Mark[] = [];
  body.push({ pts: project(inTorso(SHORTS), z), fill: look.shorts, line: look.trim });
  body.push({ pts: project(inTorso(TOP), z), fill: look.top ?? look.shirt, line: look.line });
  body.push({
    pts: project(inTorso(billow(SHIRT)), z),
    fill: look.shirt,
    line: look.line,
    shade: look.shirtShade ? project(inTorso(billow(SHIRT_SHADE)), z) : undefined,
    tone: look.shirtShade,
  });
  const neckFrom = [neck[0] - up[0] * 0.6, neck[1] - up[1] * 0.6];
  const headBase = [head[0] - hu[0] * 2.2 - hf[0] * 0.35, head[1] - hu[1] * 2.2 - hf[1] * 0.35];
  body.push({ pts: project(limb(neckFrom[0], neckFrom[1], headBase[0], headBase[1], NECK_SHAPE, f), z), fill: look.skin, line: look.line });
  if (look.collar) body.push({ pts: project(limb(neckFrom[0], neckFrom[1], headBase[0], headBase[1], NECK_SHAPE, f, 0.32, 0, 0.72), z), fill: look.collar, line: look.trim });
  // the jaw drops a little when he shouts
  const shout = p.face > 1.5 && p.face < 2.5 ? 1 : 0;
  const skull = HEAD_SHAPE.map(([a, b]) => (b < -1.7 && a > 0 ? [a - 0.12 * shout, b - 0.45 * shout] : [a, b]));
  const jaw = JAW.map(([a, b]) => [a - 0.12 * shout, b - 0.4 * shout * Math.min(1, a)]);
  // the head without an outline of its own, so the face runs into the neck
  // under a drawn jawline, and the ear, which the hair comes down over
  const skin: Part[] = [{ pts: project(inHead(skull), z), fill: look.skin, line: 0 }];
  const under: Mark[] = [
    { pts: project(inHead(jaw), z), paint: look.line, r: 0.11 },
    { pts: project(inHead(EAR), z), paint: look.skin, line: look.line },
    { pts: project(inHead([[-0.12, 0.3], [-0.45, 0.42], [-0.62, -0.1], [-0.38, -0.62]]), z), paint: look.line, r: 0.07 },
  ];
  const hair: Part[] = [];
  if (look.cut === "fringe") {
    // short hair hardly streams, but the points at the back lie down and the
    // locks in front lift
    const blown = (points: number[][]) =>
      points.map(([a, b]) => (a < -2 ? [a - (-a - 2) * 0.22 * wind, b - 0.12 * wind] : a > 2 ? [a - 0.18 * wind, b + 0.22 * wind] : [a, b]));
    hair.push({ pts: project(inHead(blown(FRINGE)), z), fill: look.hair, line: look.hairLine });
    for (const sprout of SPROUTS) {
      const bent = sprout.map(([a, b], i) => [a - 0.3 * wind * i, b - 0.1 * wind * i]);
      hair.push({ pts: project(inHead(taper(bent, [0.2, 0.13, 0.03])), z), fill: look.hair, line: look.hairLine });
    }
    if (look.strands) for (const strand of FRINGE_STRANDS) marks.push({ pts: project(inHead(blown(strand)), z), paint: look.strands, r: 0.1 });
    for (const streak of FRINGE_SHINE) marks.push({ pts: project(inHead(blown(streak)), z), paint: look.shine, r: 0.18 });
  } else {
    hair.push({ pts: project(inHead(CROP), z), fill: look.hair, line: look.hairLine });
  }

  // an ear, an eye under its brow, and the mouth
  const face: Mark[] = [];
  const set = p.face;
  const locked = set > 0.5;
  face.push({ pts: project(inHead([[2.47, 0.16], [2.47, 0.12]]), z), paint: locked ? look.lit : look.iris, r: 0.3 });
  face.push({ pts: project(inHead(locked ? [[1.96, 0.5], [2.8, 0.3]] : [[1.98, 0.43], [2.76, 0.33]]), z), paint: look.mark, r: 0.2 });
  face.push({ pts: project(inHead(locked ? [[1.8, 1.1], [2.88, 0.72]] : [[1.85, 1], [2.86, 0.95]]), z), paint: look.mark, r: 0.17 });
  if (shout) face.push({ pts: project(inHead([[2.42, -1.58], [3.02, -1.5], [2.95, -2.28], [2.48, -2.12]]), z), paint: look.mark, line: look.mark });
  else if (set > 2.5) face.push({ pts: project(inHead([[2.25, -1.52], [2.6, -1.8], [2.95, -1.74]]), z), paint: look.mark, r: 0.17 });
  else face.push({ pts: project(inHead([[2.42, -1.8], [2.92, -1.77]]), z), paint: look.mark, r: 0.15 });

  const nearZ = z - SIDE;
  const farZ = z + SIDE;
  const farArm = arm(p.armFar, z + SHOULDERS, true);
  const farLeg = leg(p.far, farZ, true);
  const nearLeg = leg(p.near, nearZ, false);
  const nearArm = arm(p.armNear, z - SHOULDERS, false);

  const edging = (points: number[][], r: number) => {
    if (look.edging) strokes(ink, [{ pts: project(inTorso(points), z), paint: look.edging, r }], zoom);
  };
  paint(ink, farArm.parts, width);
  strokes(ink, farArm.marks, zoom);
  paint(ink, farLeg.parts, width);
  paint(ink, body, width);
  edging(NECKLINE, 0.15);
  paint(ink, skin, width);
  strokes(ink, under, zoom);
  paint(ink, hair, width);
  strokes(ink, marks, zoom);
  strokes(ink, face, zoom);
  if (shout) strokes(ink, [{ pts: project(inHead([[2.52, -1.64], [2.94, -1.58]]), z), paint: tone(INK), r: 0.12 }], zoom);
  between?.();
  paint(ink, nearLeg.parts, width);
  paint(ink, [{ pts: project(inTorso(billow(HEM)), z), fill: look.shirt, line: 0 }], width);
  edging(billow(HEM_EDGE), 0.13);
  paint(ink, nearArm.parts, width);
  strokes(ink, nearArm.marks, zoom);
  paint(ink, [{ pts: project(inTorso(STRAP), z), fill: look.shirt, line: 0 }], width);
  strokes(ink, [{ pts: project(inTorso(ARMHOLE), z), paint: look.line, r: 0.16 }], zoom);
  edging([NECKLINE[2], NECKLINE[3]], 0.15);
  const eye = inHead([[2.47, 0.14]]);
  return { head: [px(v, head[0], z), py(v, head[1], z)], eye: [px(v, eye[0], z), py(v, eye[1], z)] };
}

/** Draws a group of parts: every outline first, then every fill and its
 * tone, so parts in a group run into each other and only the group's own
 * edge is lined. */
function paint(ink: Ink, parts: Part[], width: number) {
  for (const s of parts) if (s.line >> 4) ink.poly(grow(s.pts, width), s.line);
  for (const s of parts) {
    ink.poly(s.pts, s.fill);
    if (s.shade && s.tone) ink.poly(s.shade, s.tone);
  }
}

/** Lines and small filled shapes: two points make a stroke, three a stroke
 * that tapers, four a bent line unless it is outlined, more a filled shape
 * (with its own outline when it has one). Strokes are `r` world units thick,
 * and never under half a pixel. */
function strokes(ink: Ink, marks: Mark[], zoom: number) {
  for (const m of marks) {
    const pts = m.pts;
    const r = Math.max(0.5, (m.r ?? 0.26) * zoom);
    if (pts.length === 4) {
      ink.cap(pts[0], pts[1], r, pts[2], pts[3], r * 0.8, m.paint);
      continue;
    }
    if (pts.length === 6) {
      ink.cap(pts[0], pts[1], r, pts[2], pts[3], r * 0.8, m.paint);
      ink.cap(pts[2], pts[3], r * 0.8, pts[4], pts[5], r * 0.35, m.paint);
      continue;
    }
    if (pts.length === 8 && !m.line) {
      ink.cap(pts[0], pts[1], r, pts[2], pts[3], r, m.paint);
      ink.cap(pts[2], pts[3], r, pts[4], pts[5], r, m.paint);
      ink.cap(pts[4], pts[5], r, pts[6], pts[7], r * 0.6, m.paint);
      continue;
    }
    if (m.line) ink.poly(grow(pts, Math.max(1, 0.2 * zoom)), m.line);
    ink.poly(pts, m.paint);
  }
}

/** Pushes each corner of a polygon out along its bisector. */
function grow(pts: number[], d: number) {
  const n = pts.length >> 1;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) area += pts[j * 2] * pts[i * 2 + 1] - pts[i * 2] * pts[j * 2 + 1];
  const sign = area > 0 ? 1 : -1;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    const ax = pts[i * 2] - pts[prev * 2];
    const ay = pts[i * 2 + 1] - pts[prev * 2 + 1];
    const bx = pts[next * 2] - pts[i * 2];
    const by = pts[next * 2 + 1] - pts[i * 2 + 1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    const n1x = (ay / la) * sign;
    const n1y = (-ax / la) * sign;
    const n2x = (by / lb) * sign;
    const n2y = (-bx / lb) * sign;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = Math.min(2.2, 1 / Math.max(0.45, mx * n1x + my * n1y));
    out.push(pts[i * 2] + mx * d * k, pts[i * 2 + 1] + my * d * k);
  }
  return out;
}

// —— the three kits

/** The striker: a loose royal-blue bib, edged dark at the neck and hem,
 * over a slate compression top with long sleeves, indigo lines winding
 * round them, and a high collar; royal-blue shorts, slate socks. Fair skin,
 * blue-grey hair, blue eyes. */
export const STRIKER: Look = {
  skin: tone(SKIN),
  farSkin: tone(TAN),
  line: tone(BLACK),
  farLine: tone(BLACK),
  trim: tone(BLACK),
  farTrim: tone(BLACK),
  shade: tone(TAN, 6),
  shirt: tone(ROYAL),
  shirtShade: tone(DEEP, 7),
  sleeves: "long",
  sleeve: tone(SUIT),
  farSleeve: tone(SUIT),
  stripes: tone(STRIPE),
  collar: tone(SUIT),
  top: tone(SUIT),
  edging: tone(BLACK),
  shorts: tone(ROYAL),
  socks: tone(SUIT),
  band: tone(ROYAL),
  boots: tone(ROYAL),
  farBoots: tone(DEEP),
  hair: tone(HAIR),
  hairLine: tone(BLACK),
  strands: tone(SUIT),
  shine: tone(SLATE),
  mark: tone(BLACK),
  iris: tone(ROYAL),
  lit: tone(CYAN),
  cut: "fringe",
};

/** Defenders: a black kit, drawn in outline. */
export const DEFENDER: Look = {
  skin: tone(DIM),
  farSkin: tone(BLACK),
  line: tone(INK),
  farLine: tone(DIM),
  trim: tone(INK),
  farTrim: tone(DIM),
  shade: 0,
  shirt: tone(BLACK),
  shirtShade: 0,
  sleeves: "short",
  sleeve: tone(BLACK),
  farSleeve: tone(BLACK),
  shorts: tone(BLACK),
  socks: tone(BLACK),
  boots: tone(INK),
  farBoots: tone(DIM),
  hair: tone(DIM, 9),
  hairLine: tone(INK),
  shine: 0,
  mark: tone(BLACK),
  iris: tone(BLACK),
  lit: tone(BLACK),
  cut: "crop",
};

/** The keeper: a toned shirt with long sleeves and big white gloves. */
export const KEEPER: Look = {
  ...DEFENDER,
  shirt: tone(DIM),
  sleeves: "long",
  sleeve: tone(DIM),
  farSleeve: tone(FAINT),
  farSkin: tone(FAINT),
  gloves: tone(INK),
};
