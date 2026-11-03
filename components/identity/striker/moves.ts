import { ANKLE, HIP, type Pose, SHIN, THIGH } from "./body";

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
  /** how much of the foot's time on the ground is in front of his hips:
   * less, and he is leaning from the ankles, falling over a planted leg */
  plant: number;
  /** how high the heel and knee come up, 1 for a sprint */
  lift: number;
  lean: number;
  arms: number;
  /** how far the arms are out for balance rather than driving him on: most
   * with the ball at his feet, least flat out with nothing to carry */
  balance: number;
  bob: number;
  /** pelvis height, mid-stride */
  height: number;
};

// Contact is short, as it is for footballers at pace, so a planted foot is
// never far out in front of him or behind: his hips can ride high, with the
// knee giving a little under him rather than squatting, and the leg never
// has to stretch further than it can. At pace he leans into it, from the
// ankles rather than the hips (see `spine`): about twenty-odd degrees, as
// footballers do flat out, a little less on the ball, where the head stays
// up to see and the arms stay looser for balance; knees and heels come up,
// and the arms drive hard when he is free of it.
// Paced off measured running at 6.5 to 8 m/s (Clark 2020: about 4 steps a
// second and a quarter of the cycle on the ground; COM rising and falling
// some 4 to 6 cm; trunk 10 to 13° forward in team-sport athletes, a few
// degrees more on the ball). On the ball the hips ride a little lower and
// the knees and thighs swing through a little less (Zago 2016).
export const SPRINT: Gait = { cycle: 100, stance: 0.24, plant: 0.27, lift: 1.06, lean: 0.24, arms: 1.1, balance: 0.25, bob: 0.5, height: HIP - 0.3 };
export const DRIBBLE: Gait = { cycle: 90, stance: 0.25, plant: 0.27, lift: 0.94, lean: 0.3, arms: 0.85, balance: 0.85, bob: 0.45, height: HIP - 0.45 };
export const JOG: Gait = { cycle: 68, stance: 0.33, plant: 0.36, lift: 0.7, lean: 0.12, arms: 0.6, balance: 0.5, bob: 0.6, height: HIP - 0.4 };

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
    plant: lerp(a.plant, b.plant, t),
    stance: lerp(a.stance, b.stance, t),
    lift: lerp(a.lift, b.lift, t),
    lean: lerp(a.lean, b.lean, t),
    arms: lerp(a.arms, b.arms, t),
    balance: lerp(a.balance, b.balance, t),
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

const CHANNELS = 21;

export function flat(p: Pose) {
  return [
    p.x, p.y, p.z, p.lean, p.head,
    p.near.x, p.near.y, p.near.a, p.far.x, p.far.y, p.far.a,
    p.armNear.s, p.armNear.e, p.armFar.s, p.armFar.e,
    p.face, p.hair, p.armNear.g ?? 0, p.armFar.g ?? 0, p.armNear.w ?? 0, p.armFar.w ?? 0,
  ];
}

export function unflat(c: number[], f: number): Pose {
  return {
    x: c[0], y: c[1], z: c[2], f, lean: c[3], head: c[4],
    near: { x: c[5], y: c[6], a: c[7] },
    far: { x: c[8], y: c[9], a: c[10] },
    armNear: { s: c[11], e: c[12], g: c[17], w: c[19] },
    armFar: { s: c[13], e: c[14], g: c[18], w: c[20] },
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
  ns: number; ne: number; fs: number; fe: number; face: number; hair: number; ng: number; fg: number; nw: number; fw: number;
};
const NAMES: (keyof FlatPose)[] = ["x", "y", "z", "lean", "head", "nx", "ny", "na", "fx", "fy", "fa", "ns", "ne", "fs", "fe", "face", "hair", "ng", "fg", "nw", "fw"];

/** A hand-posed move. Each key may leave channels out, and they carry over
 * from the key before, all but the wrists, which nobody holds bent: left
 * out, they hang straight. Positions are relative to (ox, 0). `before` and
 * `after`, poses a moment either side of it, let it pick up the motion it
 * takes over from and hand its own on, instead of starting and ending still. */
export function move(keys: Key[], f: number, before?: Key, after?: Key) {
  const times = keys.map((k) => k.t);
  const tracks: ((t: number) => number)[] = [];
  const filled: number[][] = [];
  let last: number[] = new Array(CHANNELS).fill(0);
  for (const key of keys) {
    const row = NAMES.map((name, i) => key.p[name] ?? (name === "nw" || name === "fw" ? 0 : last[i]));
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

// One leg through a cycle of running at pace, from its touchdown: the
// thigh's angle from upright (forward positive) and the knee's bend, in
// degrees, every twentieth of the cycle, with toe-off at a quarter. The
// swing is Lin et al. 2023's, measured at 7.09 m/s, its toe-off remapped
// from the treadmill's 33% to the 26% of running over ground; the stance is
// footballers' at 7.5 m/s (knee 26° at touchdown, 40° at its deepest, about
// 20° as the foot leaves), and the thigh's drive forward is held to a team
// sport athlete's 64° rather than a sprinter's 72°. So: the foot lands a
// little ahead of the hips on a nearly straight leg, the knee gives as he
// passes over it, and he leaves the grass on his toes with the leg nearly
// straight again and the thigh well behind him; then the heel folds up
// toward the seat (the knee most bent, 125°, at 55 to 60%), the knee drives
// forward and up to its highest at about 75%, and the shin unfolds so the
// foot paws back down under him.
const LEG_T = Array.from({ length: 21 }, (_, i) => i / 20);
const THIGH_DEG = [33, 24, 13, 1, -12, -25, -26, -17, -6, 5, 16, 29, 43, 55, 62, 64, 62, 55, 46, 38, 33];
const KNEE_DEG = [26, 33, 39, 39, 31, 22, 42, 63, 84, 104, 118, 125, 125, 118, 104, 86, 65, 48, 35, 29, 26];
/** the foot, pointed past square to the shin: most as it leaves the grass,
 * none by the middle of the swing, cocked up a touch before it lands */
const POINT_DEG = [0, 0, 0, 0, 8, 26, 22, 16, 10, 6, 3, 0, 0, 0, 0, -2, -4, -5, -4, -2, 0];
const legCurves = [THIGH_DEG, KNEE_DEG, POINT_DEG].map((deg) => curve(LEG_T, deg.map((d) => (d * Math.PI) / 180)));

/** The ankle, relative to the hips, and the foot's pitch, with the leg at
 * `c` of the way through the canonical cycle and the hips at `hip`. */
function legAt(c: number, hip: number) {
  const [thigh, knee, point] = legCurves.map((f) => f(c));
  const shin = thigh - knee;
  return { x: THIGH * Math.sin(thigh) + SHIN * Math.sin(shin), y: hip - THIGH * Math.cos(thigh) - SHIN * Math.cos(shin), a: shin - point };
}

const SWING_U = [0, 0.1, 0.24, 0.38, 0.52, 0.66, 0.8, 0.92, 1];
/** from the ankle to the ball of the foot, which the foot rolls over as the
 * heel comes up */
const BALL = 3.6;

/** The foot on the grass, `u` of the way from touching down to leaving it,
 * relative to the hips. The heel peels up over the last part of it, faster
 * and faster as he pushes off, the foot rolling over its ball, which stays
 * where it is on the grass. */
function planted(u: number, g: Gait) {
  const reach = g.cycle * g.stance;
  // he leaves on his toes, the foot pitched some 70° from the grass (Lin et
  // al.'s 69° just after toe-off): rolling over the ball of the foot is how
  // a stride gets its length behind him
  const k = Math.max(0, (u - 0.45) / 0.55);
  const a = -1.3 * Math.max(0.5, g.lift) * k * k;
  return { x: reach * g.plant - u * reach + BALL * (1 - Math.cos(a)), y: ANKLE - BALL * Math.sin(a), a };
}

/** One ankle, relative to the hips, `s` of the way through its cycle from
 * touching down. */
export function stride(s: number, g: Gait) {
  if (s < g.stance) return planted(s / g.stance, g);
  const u = (s - g.stance) / (1 - g.stance);
  const reach = g.cycle * g.stance;
  const land = reach * g.plant;
  const L = g.lift;
  // it leaves the grass going the way the push-off sends it, and comes down
  // going back as fast as the grass goes by, pawing at it, so it never snaps
  // as it lifts or stamps as it lands
  const off = planted(1, g);
  const last = planted(1 - 1e-3, g);
  const rate = (1 - g.stance) / g.stance / 1e-3;
  const back = (-reach * (1 - g.stance)) / g.stance;
  // the measured path through the air, its shape scaled by how hard he's
  // running and pinned to where this foot leaves the grass and lands
  const path = SWING_U.map((k) => legAt(0.25 + 0.75 * k, g.height));
  const first = path[0];
  const end = path[path.length - 1];
  const xs = path.map((p, i) => lerp(off.x, land, SWING_U[i]) + (p.x - lerp(first.x, end.x, SWING_U[i])) * L);
  const ys = path.map((p, i) => lerp(off.y, ANKLE, SWING_U[i]) + (p.y - lerp(first.y, end.y, SWING_U[i])) * L);
  const as = path.map((p, i) => (i === 0 ? off.a : i === path.length - 1 ? 0 : p.a * (0.55 + 0.45 * L)));
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

/** A hand on a relaxed wrist is a weight on a spring that the forearm swings
 * about: how far it carries on past the forearm, and how late, for a swing
 * at `r` of the wrist's own rate. The stride is about a third of it, so the
 * hand mostly keeps up, and overshoots most on the elbow's quicker beat. */
function flop(r: number) {
  const damping = 0.5;
  return { gain: (r * r) / Math.hypot(1 - r * r, 2 * damping * r), lag: Math.atan2(2 * damping * r, 1 - r * r) };
}
const WRIST = flop(0.32);
const WRIST2 = flop(0.64);

/** A slow wander between about -1 and 1, through a fresh random value a
 * little more often than once a stride and smooth through all of them, so it
 * never comes round the same way twice. `seed` picks which. */
export function wander(phase: number, seed: number) {
  const t = phase * 1.37 + seed * 7.13;
  const i = Math.floor(t);
  const k = t - i;
  const at = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const a = at(i - 1);
  const b = at(i);
  const c = at(i + 1);
  const d = at(i + 2);
  return b + 0.5 * k * (c - a + k * (2 * a - 5 * b + 4 * c - d + k * (3 * (b - c) + d - a)));
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
  // the arms, measured off film of a man running flat out. Each swings
  // against the leg on its own side, about straight down rather than about
  // the leaning trunk and further behind him than in front: furthest
  // forward just before the other foot lands, furthest back just before its
  // own does. The elbow is never set at one angle. The forearm trails the
  // upper arm and whips round on it, so the elbow closes as the hand comes
  // up in front, opens as the arm drives down past the hip, closes again
  // behind as the upper arm stops and the forearm swings on, and opens a
  // little as the arm starts forward: twice bent, twice straightened a
  // stride. The hands ride the wrist, each carried on a little past its
  // forearm at either end of the swing.
  //
  // That is how he drives when he is free. With the ball at his feet a
  // footballer runs otherwise, as film of Son and Vinícius on their solo
  // runs shows: the arms are out for balance, long rather than pumping. The
  // arm going forward reaches, the elbow all but straight and the hand open
  // somewhere between hip and chest; the arm going back folds, the hand by
  // the hip. `balance` mixes the two.
  //
  // And no two swings are the same: each arm wanders in how far it goes,
  // where it carries, how bent it is and when it turns, the far arm a little
  // wider and quieter than the near, and the hands open and close as they go.
  const arm = (offset: number, seed: number, wide: number) => {
    const k = g.arms * (1 - 0.1 * wide) * (1 + 0.25 * wander(phase, seed));
    const b = g.balance;
    const at = 2 * Math.PI * (s - 0.47 - offset + 0.035 * wander(phase * 0.7, seed + 1));
    const swing = Math.cos(at);
    const twice = 2 * at - 0.5;
    const reach = lerp(0.72, 0.62, b) * k;
    const bend = lerp(0.4 * k, -0.275, b);
    const whip = lerp(0.3 * k, 0.12, b);
    const upper = lerp(-0.24 - 0.2 * k, -0.16, b) + 0.12 * wide + reach * swing + 0.15 * wander(phase * 0.8, seed + 2);
    return {
      s: upper + lean,
      e: Math.max(0.12, lerp(1.6 - 0.25 * k, 0.62, b) - 0.15 * wide + bend * swing + whip * Math.cos(twice) + 0.2 * wander(phase, seed + 3)),
      g: lerp(0.3, 0.21 - 0.09 * swing, b) + 0.12 * wander(phase, seed + 4),
      w: (reach + bend) * WRIST.gain * Math.cos(at - WRIST.lag) + whip * WRIST2.gain * Math.cos(twice - WRIST2.lag),
    };
  };
  return {
    x,
    y,
    z,
    f,
    lean,
    // the head goes a little with the spine but stays up, eyes on the play
    head: -lean * 0.32 + 0.04,
    near: { x: x + f * near.x, y: near.y, a: near.a },
    far: { x: x + f * far.x, y: far.y, a: far.a },
    armNear: arm(0, 1, 0),
    armFar: arm(0.5, 11, 1),
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
