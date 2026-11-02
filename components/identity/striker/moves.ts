import { ANKLE, HIP, type Pose } from "./body";

// How the players move. Running is generated: each ankle follows a sprint
// path relative to the hips, a stance that sweeps back exactly as fast as the
// body goes forward (so a planted foot never slides) and a swing that kicks
// the heel up, drives the knee and paws the foot back down. Everything else
// is posed by hand, as keyframes eased without overshoot.

export type Gait = {
  /** distance covered in one full cycle, two steps */
  cycle: number;
  /** the share of the cycle a foot is on the ground */
  stance: number;
  /** how high the heel and knee come up, 1 for a sprint */
  lift: number;
  lean: number;
  arms: number;
  bob: number;
  /** pelvis height, mid-stride */
  height: number;
};

// Contact is short, as it is for footballers at pace, so a planted foot is
// never far out in front of him or behind: his hips can ride high, with the
// knee giving a little under him rather than squatting, and the leg never
// has to stretch further than it can. At pace he leans right into it from
// the hips, the knees and heels come up high and the arms drive hard.
export const SPRINT: Gait = { cycle: 94, stance: 0.23, lift: 1.1, lean: 0.68, arms: 1.1, bob: 0.55, height: HIP - 1.8 };
export const DRIBBLE: Gait = { cycle: 82, stance: 0.26, lift: 0.95, lean: 0.55, arms: 0.95, bob: 0.55, height: HIP - 1.7 };
export const JOG: Gait = { cycle: 62, stance: 0.31, lift: 0.55, lean: 0.2, arms: 0.6, bob: 0.55, height: HIP - 1.4 };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** 0 before a, easing to 1 at b */
export const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));

export function mixGait(a: Gait, b: Gait, t: number): Gait {
  return {
    cycle: lerp(a.cycle, b.cycle, t),
    stance: lerp(a.stance, b.stance, t),
    lift: lerp(a.lift, b.lift, t),
    lean: lerp(a.lean, b.lean, t),
    arms: lerp(a.arms, b.arms, t),
    bob: lerp(a.bob, b.bob, t),
    height: lerp(a.height, b.height, t),
  };
}

/** Eases through keys without overshooting them (monotone cubic), so a key
 * held twice in a row is a true hold. It starts and ends at rest unless it
 * is given the speed it comes in with and leaves with. */
export function curve(times: number[], values: number[], enter = 0, leave = 0) {
  const n = times.length;
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) slope.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
  const m = new Array<number>(n).fill(0);
  m[0] = enter;
  m[n - 1] = leave;
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) continue;
    const w1 = 2 * (times[i + 1] - times[i]) + (times[i] - times[i - 1]);
    const w2 = (times[i + 1] - times[i]) + 2 * (times[i] - times[i - 1]);
    m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  return (t: number) => {
    if (t <= times[0]) return values[0];
    if (t >= times[n - 1]) return values[n - 1];
    let i = 0;
    while (t > times[i + 1]) i += 1;
    const h = times[i + 1] - times[i];
    const s = (t - times[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * values[i] +
      (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * values[i + 1] +
      (s3 - s2) * h * m[i + 1]
    );
  };
}

// —— poses as flat channels, for easing and blending

const CHANNELS = 19;

export function flat(p: Pose) {
  return [
    p.x, p.y, p.z, p.lean, p.head,
    p.near.x, p.near.y, p.near.a, p.far.x, p.far.y, p.far.a,
    p.armNear.s, p.armNear.e, p.armFar.s, p.armFar.e,
    p.face, p.hair, p.armNear.g ?? 0, p.armFar.g ?? 0,
  ];
}

export function unflat(c: number[], f: number): Pose {
  return {
    x: c[0], y: c[1], z: c[2], f, lean: c[3], head: c[4],
    near: { x: c[5], y: c[6], a: c[7] },
    far: { x: c[8], y: c[9], a: c[10] },
    armNear: { s: c[11], e: c[12], g: c[17] },
    armFar: { s: c[13], e: c[14], g: c[18] },
    face: c[15], hair: c[16],
  };
}

export function mix(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = flat(a);
  const cb = flat(b);
  return unflat(ca.map((v, i) => lerp(v, cb[i], t)), t < 0.5 ? a.f : b.f);
}

export type Key = { t: number; p: Partial<FlatPose> };
type FlatPose = {
  x: number; y: number; z: number; lean: number; head: number;
  nx: number; ny: number; na: number; fx: number; fy: number; fa: number;
  ns: number; ne: number; fs: number; fe: number; face: number; hair: number; ng: number; fg: number;
};
const NAMES: (keyof FlatPose)[] = ["x", "y", "z", "lean", "head", "nx", "ny", "na", "fx", "fy", "fa", "ns", "ne", "fs", "fe", "face", "hair", "ng", "fg"];

/** A hand-posed move. Each key may leave channels out, and they carry over
 * from the key before. Positions are relative to (ox, 0). `before` and
 * `after`, poses a moment either side of it, let it pick up the motion it
 * takes over from and hand its own on, instead of starting and ending still. */
export function move(keys: Key[], f: number, before?: Key, after?: Key) {
  const times = keys.map((k) => k.t);
  const tracks: ((t: number) => number)[] = [];
  const filled: number[][] = [];
  let last: number[] = new Array(CHANNELS).fill(0);
  for (const key of keys) {
    const row = NAMES.map((name, i) => (key.p[name] ?? last[i]));
    filled.push(row);
    last = row;
  }
  const first = filled[0];
  const end = filled[filled.length - 1];
  const speed = (edge: Key | undefined, row: number[], at: number, c: number) =>
    edge ? ((edge.t > at ? 1 : -1) * ((edge.p[NAMES[c]] ?? row[c]) - row[c])) / Math.abs(edge.t - at) : 0;
  for (let c = 0; c < CHANNELS; c += 1) {
    const enter = speed(before, first, times[0], c);
    const leave = speed(after, end, times[times.length - 1], c);
    tracks.push(curve(times, filled.map((row) => row[c]), enter, leave));
  }
  const relative = new Set([0, 5, 8]);
  return {
    start: times[0],
    end: times[times.length - 1],
    at(t: number, ox: number, oz = 0): Pose {
      const c = tracks.map((track, i) => track(t) + (relative.has(i) ? ox : 0));
      c[2] += oz;
      return unflat(c, f);
    },
  };
}

// —— running

const SWING_U = [0, 0.17, 0.4, 0.63, 0.84, 1];
/** from the ankle to the ball of the foot, which the foot rolls over as the
 * heel comes up */
const BALL = 3.6;

/** The foot on the grass, `u` of the way from touching down to leaving it,
 * relative to the hips. The heel peels up over the last part of it, faster
 * and faster as he pushes off, the foot rolling over its ball, which stays
 * where it is on the grass. */
function planted(u: number, g: Gait) {
  const reach = g.cycle * g.stance;
  const k = Math.max(0, (u - 0.45) / 0.55);
  const a = -0.75 * Math.max(0.5, g.lift) * k * k;
  return { x: reach * 0.4 - u * reach + BALL * (1 - Math.cos(a)), y: ANKLE - BALL * Math.sin(a), a };
}

/** One ankle, relative to the hips, `s` of the way through its cycle from
 * touching down. */
export function stride(s: number, g: Gait) {
  if (s < g.stance) return planted(s / g.stance, g);
  const u = (s - g.stance) / (1 - g.stance);
  const reach = g.cycle * g.stance;
  const land = reach * 0.4;
  const L = g.lift;
  // it leaves the grass going the way the push-off sends it, and comes down
  // going back as fast as the grass goes by, pawing at it, so it never snaps
  // as it lifts or stamps as it lands
  const off = planted(1, g);
  const last = planted(1 - 1e-3, g);
  const rate = (1 - g.stance) / g.stance / 1e-3;
  const back = (-reach * (1 - g.stance)) / g.stance;
  const xs = [off.x, off.x - 3 * L, -4.5 * L, reach * 0.18 + 3.5 * L, land + 4.5 * L, land];
  const ys = [off.y, ANKLE + 7 * L, ANKLE + 14.5 * L, ANKLE + 11.5 * L, ANKLE + 4 * L, ANKLE];
  const as = [off.a, -1.05 * L, -0.95 * L, -0.25 * L, 0.12 * L, 0];
  return {
    x: swingCurves(xs, (off.x - last.x) * rate, back)(u),
    y: swingCurves(ys, (off.y - last.y) * rate, 0)(u),
    a: swingCurves(as, (off.a - last.a) * rate, 0)(u),
  };
}

const swingCache = new Map<string, (u: number) => number>();
/** A swing channel through its keys, leaving at one speed and arriving at
 * another. */
function swingCurves(values: number[], enter: number, leave: number) {
  const key = `${values.map((v) => v.toFixed(3)).join()}/${enter.toFixed(2)}/${leave.toFixed(2)}`;
  let c = swingCache.get(key);
  if (!c) {
    c = curve(SWING_U, values, enter, leave);
    if (swingCache.size > 400) swingCache.clear();
    swingCache.set(key, c);
  }
  return c;
}

/** The whole body at a point in its running cycle: `phase` counts cycles,
 * and at whole numbers the near foot is touching down. */
export function run(x: number, phase: number, g: Gait, f = 1, z = 0, speed = 1): Pose {
  const s = phase - Math.floor(phase);
  const sFar = (s + 0.5) % 1;
  const near = stride(s, g);
  const far = stride(sFar, g);
  // lowest halfway through each foot taking the weight, highest in the air
  // between, and the trunk dipping forward a touch as it takes it
  const step = (s * 2) % 1;
  const sink = Math.cos(2 * Math.PI * (step - g.stance));
  const y = g.height - g.bob * sink;
  const lean = g.lean + 0.03 * sink;
  // the arms drive against the legs, a beat behind them, swinging about
  // straight down rather than about the leaning trunk, so they punch up in
  // front instead of flinging out behind. The elbow follows the shoulder:
  // it closes as the hand comes up in front and opens as it goes back past
  // the hip
  const arm = (offset: number) => {
    const at = 2 * Math.PI * (s + offset - 0.04);
    return { s: -g.arms * Math.cos(at) + lean * 0.7, e: 1.5 - 0.36 * Math.cos(at - 0.5) };
  };
  return {
    x,
    y,
    z,
    f,
    lean,
    // the head goes with the spine, a little less, chin out and eyes up on
    // what is coming
    head: -lean * 0.2 + 0.04,
    near: { x: x + f * near.x, y: near.y, a: near.a },
    far: { x: x + f * far.x, y: far.y, a: far.a },
    armNear: arm(0),
    armFar: arm(0.5),
    face: 0,
    hair: 0.35 + 0.95 * speed + 0.16 * Math.sin(4 * Math.PI * s - 1.2),
  };
}

/** Where the near toe is, relative to the hips, at a point in the cycle:
 * the ball goes just in front of it on a touch. */
export function toeAt(phase: number, g: Gait) {
  const s = phase - Math.floor(phase);
  const a = stride(s, g);
  return { x: a.x + Math.cos(a.a) * 5.6, y: a.y + Math.sin(a.a) * 5.6 - 1 };
}
