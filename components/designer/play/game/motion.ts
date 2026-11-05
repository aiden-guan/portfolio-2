import { Quaternion, Vector3, type Object3D } from "three";
import type { Dog, Pose, Rig } from "./people";

// How everyone moves. A foot is put down and stays exactly where it was put
// while the body passes over it: the knee and ankle bend to keep it there
// (two-bone IK), and the hips ride over it, highest mid-step in a walk and
// lowest there in a run, the way people's do. Stride and cadence come from
// leg length and speed (a Froude number), so a short person takes quicker
// steps beside a tall one, and a walk turns into a run past about 0.6 of it.
// Standing still is never quite still: breath, weight going from foot to
// foot, glances and blinks. People talk with their hands and look at whoever
// is talking. Lengths are rig units: 0.1 m voxels, the figure drawn at 178 cm.

const HIP = 0.7;
const THIGH = 0.3;
const SHIN = 0.2;
/** The ankle joint above the sole, and the heel behind it and the toe ahead of it. */
const ANKLE = 0.2;
const HEEL = 0.1;
const TOE = 0.2;
/** Each hip either side of the middle. */
const SIDE = 0.1;
const REACH = THIGH + SHIN;
const G = 9.81;
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const frac = (v: number) => v - Math.floor(v);
const wrap = (a: number) => {
  a = (a + Math.PI) % TAU;
  return (a < 0 ? a + TAU : a) - Math.PI;
};
/** Moves toward a target at rate k per second, the same at any frame rate. */
const approach = (current: number, target: number, k: number, dt: number) => current + (target - current) * (1 - Math.exp(-k * dt));
/** 0 at both ends, 1 in the middle (at s = 0.5 ** (1 / p)). */
const bump = (s: number, p = 1) => Math.sin(Math.PI * Math.pow(clamp(s, 0, 1), p));

/** A critically damped spring: chases its target without overshooting, settled in about 5 / w seconds. */
export class Spring {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  step(target: number, w: number, dt: number) {
    const d = this.x - target;
    const e = Math.exp(-w * dt);
    const c = this.v + w * d;
    this.x = target + (d + c * dt) * e;
    this.v = (this.v - w * c * dt) * e;
    return this.x;
  }
  /** For an angle: the short way round. */
  turn(target: number, w: number, dt: number) {
    return this.step(this.x + wrap(target - this.x), w, dt);
  }
  set(x: number) {
    this.x = x;
    this.v = 0;
  }
}

function random(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scratch, so a frame allocates nothing
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const qA = new Quaternion();
const qB = new Quaternion();
const vA = new Vector3();
const vB = new Vector3();
const qIdentity = new Quaternion();
const ankle = { f: 0, u: 0 };

/** Where the ankle sits over the point under it, for a foot pitched this much:
 * heel up, it rolls on the toe; toe up, on the heel. Either way, the part
 * touching the floor stays put. */
function ankleOver(pitch: number) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  if (pitch >= 0) {
    ankle.f = TOE - TOE * c + ANKLE * s;
    ankle.u = ANKLE * c + TOE * s;
  } else {
    ankle.f = -HEEL + HEEL * c + ANKLE * s;
    ankle.u = ANKLE * c - HEEL * s;
  }
  return ankle;
}

/** Points a leg so its ankle reaches a point (root space): the knee goes forward. */
function reach(hip: Object3D, knee: Object3D, hx: number, hy: number, hz: number, tx: number, ty: number, tz: number) {
  let dx = tx - hx, dy = ty - hy, dz = tz - hz;
  const d = Math.hypot(dx, dy, dz);
  const D = clamp(d, 0.06, REACH - 1e-4);
  if (d > 1e-6) {
    const k = D / d;
    dx *= k;
    dy *= k;
    dz *= k;
  }
  const bend = Math.acos(clamp((D * D - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const r = THIGH + SHIN * Math.cos(bend);
  const out = Math.asin(clamp(dx / r, -1, 1));
  const pitch = Math.atan2(dz, dy) - Math.atan2(-SHIN * Math.sin(bend), -r * Math.cos(out));
  hip.rotation.set(pitch, 0, out);
  knee.rotation.set(bend, 0, 0);
}

/** Turns a foot to a heading and a pitch in root space, whatever the leg above it is doing. */
function orient(hip: Object3D, knee: Object3D, foot: Object3D, yaw: number, pitch: number) {
  qA.setFromAxisAngle(Y, yaw).multiply(qB.setFromAxisAngle(X, pitch));
  qB.copy(hip.quaternion).multiply(knee.quaternion).invert();
  foot.quaternion.copy(qB).multiply(qA);
}

export type Trait = {
  /** Fidgets, glances, weight shifts: 0 still to 1 restless. */
  restless: number;
  /** Loose joints: a wider stance, more swing, slower settling (0 to 1). */
  loose: number;
  /** How big the hands get when talking. */
  gesture: number;
  /** Round shoulders and a forward head (0 to 1). */
  slouch: number;
  /** Seconds a breath takes. */
  breath: number;
  /** Seconds between blinks, on average. */
  blink: number;
  /** How quickly the head turns to look (rad/s). */
  turn: number;
  /** Arm swing when walking, as a multiple. */
  swing: number;
};

const BASE: Trait = { restless: 0.35, loose: 0.4, gesture: 0.8, slouch: 0.12, breath: 4.2, blink: 3.6, turn: 9, swing: 1 };

/** The cast, in motion. Kind, unforced: each moves like themselves. */
export const TRAITS: Record<string, Partial<Trait>> = {
  aiden: { restless: 0.28, loose: 0.35, gesture: 0.85, slouch: 0, swing: 1.05 },
  // still and precise: few fidgets, quick exact glances, small crisp gestures
  allen: { restless: 0.06, loose: 0.08, gesture: 0.55, slouch: 0, blink: 4.8, turn: 15, swing: 0.85 },
  // relaxed and loose
  miles: { restless: 0.3, loose: 0.95, gesture: 0.75, slouch: 0.22, breath: 4.9, turn: 6.5, swing: 1.2 },
  // restless
  jun: { restless: 0.95, loose: 0.5, gesture: 1, breath: 3.4, blink: 2.6, turn: 12.5, swing: 1.1 },
  // animated
  john: { restless: 0.5, loose: 0.4, gesture: 1.45, slouch: 0.04, turn: 11 },
  // slouchy
  jerry: { restless: 0.4, loose: 0.7, gesture: 1.1, slouch: 0.85, turn: 8, swing: 0.8 },
};

/** How someone moves: theirs if they're in the cast, otherwise a little different for each seed. */
export function traitOf(id: string, seed = 1): Trait {
  const own = TRAITS[id];
  if (own) return { ...BASE, ...own };
  const r = random(seed * 7 + 3);
  return { ...BASE, restless: 0.15 + r() * 0.45, loose: 0.2 + r() * 0.6, gesture: 0.6 + r() * 0.5, slouch: r() * 0.35, breath: 3.8 + r() * 1.2, blink: 3 + r() * 2 };
}

type Foot = {
  side: number;
  offset: number;
  planted: boolean;
  /** The floor point under the ankle, in the world: planted, or wherever it is mid-step. */
  at: Vector3;
  yaw: number;
  pitch: number;
  from: Vector3;
  fromYaw: number;
  fromPitch: number;
  to: Vector3;
  toYaw: number;
  s: number;
  lift: number;
  dur: number;
  gait: boolean;
  /** How much of a cycle it has stood since it landed. */
  stood: number;
  /** How far the body still has to go before this step comes down (world m). */
  left: number;
};

const foot = (side: number, offset: number): Foot => ({
  side,
  offset,
  planted: true,
  at: new Vector3(),
  yaw: 0,
  pitch: 0,
  from: new Vector3(),
  fromYaw: 0,
  fromPitch: 0,
  to: new Vector3(),
  toYaw: 0,
  s: 0,
  lift: 0,
  dur: 0.3,
  gait: false,
  stood: 1,
  left: 0,
});

/** An arm's pose: shoulder (x forward/back, z out, y turned), elbow, forearm turn; how much
 * a walk swings it, and how free it is to gesture while talking (a hand on a lap is; a
 * hand holding a phone isn't). */
type Arm = { x: number; y: number; z: number; elbow: number; twist: number; swing: number; free: number };
const arm = (): Arm => ({ x: 0, y: 0, z: 0.07, elbow: 0.12, twist: 0, swing: 1, free: 1 });
const setArm = (a: Arm, x: number, z: number, elbow: number, twist = 0, swing = 0, free = swing) => {
  a.x = x;
  a.z = z;
  a.elbow = elbow;
  a.twist = twist;
  a.swing = swing;
  a.free = free;
  a.y = 0;
};

const LEG_POSES: ReadonlySet<Pose> = new Set<Pose>(["sit", "type", "ride", "fly"]);
const FADE = 0.3;

/** One person's motion: feed it where to look and whether they're talking; animate() does the rest. */
export class Motion {
  readonly trait: Trait;
  /** A world point to look at (a face, usually), and how much to (0 to 1). */
  readonly look = new Vector3();
  attend = 0;
  /** Talking: gestures (0 to 1), and how many more seconds the mouth moves. */
  talk = 0;
  voice = 0;
  /** Somebody else is talking: an occasional nod (0 to 1). */
  listen = 0;
  /** The floor's height at a point. */
  floor: (x: number, z: number) => number = () => 0;
  /** Called as a foot lands while walking or running: where, and how hard (0 to 1). */
  onStep: ((at: Vector3, hard: number) => void) | null = null;

  private readonly rand: () => number;
  private last = -1;
  private fresh = true;
  private px = 0;
  private pz = 0;
  private yaw0 = 0;
  private speed = 0;
  private accel = 0;
  private turnRate = 0;
  private readonly dir = new Vector3(0, 0, 1);
  private moving = false;
  private still = 0;
  private runW = 0;
  private runGoal = 0;
  private u = 0;
  private walkW = 0;
  private readonly feet: [Foot, Foot] = [foot(-1, 0), foot(1, 0.5)];
  private readonly lean = new Spring();
  private readonly bank = new Spring();
  private readonly headYaw = new Spring();
  private readonly headPitch = new Spring();
  private readonly tilt = new Spring();
  private readonly shift = new Spring();
  private shiftGoal = 0;
  private shiftAt = 0;
  private glanceYaw = 0;
  private glancePitch = 0;
  private glanceAt = 0;
  private attendW = 0;
  private lastYawGoal = 0;
  private breath = 0;
  private blinkAt = 0;
  private blinkT = -1;
  private blinkAgain = false;
  private bounceT = -1;
  private bounceAt = 0;
  private talkW = 0;
  private phraseAt = 0;
  private phrase = 0;
  private readonly gestureL = arm();
  private readonly gestureR = arm();
  private readonly shownL = arm();
  private readonly shownR = arm();
  private nodAt = 0;
  private nodT = -1;
  private mouth = 0;
  private fidgetAt = 0;
  private fidgetT = -1;
  private pocket = 0;
  private pose: Pose = "stand";
  private fade = 1;
  private fadeLegs = false;
  private readonly from: Quaternion[] = Array.from({ length: 12 }, () => new Quaternion());
  private readonly fromAt: Vector3[] = Array.from({ length: 3 }, () => new Vector3());
  private readonly poseL = arm();
  private readonly poseR = arm();

  constructor(trait: Partial<Trait> | Trait = {}, seed = 1) {
    this.trait = { ...BASE, ...trait };
    this.rand = random(seed);
    this.breath = this.rand() * TAU;
    this.blinkAt = 0.5 + this.rand() * 3;
    this.shiftAt = 1 + this.rand() * 4;
    this.glanceAt = 1 + this.rand() * 3;
    this.bounceAt = 3 + this.rand() * 6;
    this.fidgetAt = 4 + this.rand() * 6;
    this.nodAt = this.rand() * 2;
  }

  /** Puts the feet back under the body wherever it is now (after being placed somewhere). */
  reset() {
    this.fresh = true;
  }

  /** How fast the figure is going over the ground (m/s), as the motion sees it. */
  get pace() {
    return this.speed;
  }

  apply(rig: Rig, time: number, pose: Pose, offset: number) {
    const dt = this.last < 0 ? 0 : clamp(time - this.last, 0, 0.05);
    this.last = time;
    const t = time + offset;
    const root = rig.root;
    const sc = root.scale.x;
    const yaw = root.rotation.y;
    const upright = Math.abs(root.rotation.x) < 1e-4 && Math.abs(root.rotation.z) < 1e-4;
    const legPose = LEG_POSES.has(pose);
    const free = upright && !legPose;
    const trait = this.trait;

    if (pose !== this.pose) {
      this.fadeLegs = legPose !== LEG_POSES.has(this.pose);
      this.capture(rig);
      this.pose = pose;
      this.fade = 0;
    }

    // —— how the root is moving
    const dx = root.position.x - this.px, dz = root.position.z - this.pz;
    const dist = Math.hypot(dx, dz);
    this.px = root.position.x;
    this.pz = root.position.z;
    const jumped = this.fresh || dist > 0.9 || !free;
    if (jumped) {
      this.fresh = !free;
      this.speed = 0;
      this.accel = 0;
      this.moving = false;
      this.walkW = 0;
      this.plantAll(root.position, yaw, sc);
    }
    const step = jumped ? 0 : dist;
    const raw = dt > 0 ? step / dt : 0;
    const before = this.speed;
    this.speed = approach(this.speed, raw, 14, dt);
    this.accel = approach(this.accel, dt > 0 ? (this.speed - before) / dt : 0, 8, dt);
    this.turnRate = approach(this.turnRate, dt > 0 ? wrap(yaw - this.yaw0) / dt : 0, 10, dt);
    this.yaw0 = yaw;
    if (step > 1e-6) {
      this.dir.set(dx / step, 0, dz / step);
    }
    if (!this.moving && this.speed > 0.22) this.start();
    else if (this.moving && this.speed < 0.1) this.stop();
    this.still = this.moving ? 0 : this.still + dt;
    this.walkW = approach(this.walkW, this.moving ? clamp(this.speed / 0.9, 0, 1) : 0, 9, dt);

    // the gait: a walk below Froude 0.55, a run above 0.8, eased between
    const leg = HIP * sc;
    const fr = (this.speed * this.speed) / (G * leg);
    if (fr > 0.8) this.runGoal = 1;
    else if (fr < 0.55) this.runGoal = 0;
    this.runW = approach(this.runW, this.moving ? this.runGoal : 0, 7, dt);
    const run = this.runW;
    const duty = lerp(0.6, 0.31, run);
    // stride (two steps) from speed and leg length, Alexander's 2.3·Fr^0.3, capped
    // at what the leg can sweep while a foot is down
    const natural = 2.3 * leg * Math.pow(Math.max(fr, 1e-4), 0.3);
    const stride = Math.max(0.12 * sc, Math.min(natural, (lerp(0.7, 0.62, run) / duty) * sc));
    const du = this.moving ? step / stride : 0;
    this.u = frac(this.u + du);

    const feet = this.feet;
    if (free) this.stepFeet(root.position, yaw, sc, dt, du, duty, stride, run);

    // —— the hips: over the feet, bobbing with the gait, the weight going side to side
    const w = this.walkW;
    const u = this.u;
    const pelvisYaw = lerp(0.06, 0.08, run) * Math.cos(TAU * u) * w;
    let sway = -lerp(0.022, 0.008, run) * Math.cos(TAU * (u - duty / 2)) * w;
    const bob = lerp(0.015 * Math.cos(2 * TAU * (u - duty / 2)), -0.03 + -0.026 * Math.cos(2 * TAU * (u - duty / 2)), run) * w;
    // standing: the weight onto one foot now and then, and back
    if (!this.moving && free) {
      if (time > this.shiftAt) {
        const r = this.rand();
        this.shiftGoal = r < 0.34 ? 0 : r < 0.67 ? -1 : 1;
        this.shiftAt = time + lerp(9, 2.2, trait.restless) * (0.6 + this.rand() * 0.8);
      }
    } else this.shiftGoal = 0;
    this.shift.step(this.shiftGoal, lerp(3.2, 2, trait.loose), dt);
    const weight = this.shift.x * (0.022 + 0.018 * trait.loose) * (1 - trait.restless * 0.3);
    sway += weight;
    this.breath += (dt / trait.breath) * TAU;
    const inhale = Math.sin(this.breath);
    // a restless one comes up on their toes now and then
    let bounce = 0;
    if (!this.moving && free && trait.restless > 0.6) {
      if (this.bounceT < 0 && time > this.bounceAt) this.bounceT = 0;
      if (this.bounceT >= 0) {
        this.bounceT += dt / 0.5;
        bounce = bump(this.bounceT) * 0.035;
        if (this.bounceT >= 1) {
          this.bounceT = -1;
          this.bounceAt = time + 2 + this.rand() * 5;
        }
      }
    }
    const cheer = pose === "cheer" ? Math.pow(Math.abs(Math.sin(t * 7)), 1.5) : 0;
    let pelvisY = HIP + bob - 0.004 * Math.abs(this.shift.x) + bounce + cheer * 0.12;
    if (pose === "sick") pelvisY -= 0.012;
    if (free) pelvisY = this.guard(root.position, yaw, sc, sway, pelvisY, pelvisYaw, cheer > 0 || bounce > 0, dt);

    // —— the legs
    if (free) {
      for (const f of feet) {
        const hip = f.side < 0 ? rig.legL : rig.legR;
        const knee = f.side < 0 ? rig.shinL : rig.shinR;
        const ft = f.side < 0 ? rig.footL : rig.footR;
        const hx = sway + f.side * SIDE * Math.cos(pelvisYaw), hz = -f.side * SIDE * Math.sin(pelvisYaw);
        hip.position.set(hx, pelvisY, hz);
        this.ankleRoot(f, root.position, yaw, sc);
        reach(hip, knee, hx, pelvisY, hz, vA.x, vA.y, vA.z);
        orient(hip, knee, ft, wrap(f.yaw - yaw), f.pitch);
      }
    } else this.legPose(rig, pose, t, root.position.y, sc);

    // —— the upper body
    const body = rig.body;
    const twist = -lerp(0.05, 0.1, run) * Math.cos(TAU * u) * w;
    const slouch = trait.slouch * (1 - 0.5 * w);
    this.lean.step(lerp(0.03, 0.15, run) * w + clamp((this.accel / G) * 0.55, -0.12, 0.18) * w + slouch * 0.08 + (pose === "sick" ? 0.08 : 0), 10, dt);
    this.bank.step(clamp(-this.turnRate * this.speed * 0.045, -0.17, 0.17) * w, 9, dt);
    if (free) body.position.set(sway, pelvisY + inhale * 0.004 * (1 - w), 0);
    else body.position.set(0, HIP + inhale * 0.004, 0);
    body.rotation.set(this.lean.x + (pose === "type" ? 0.06 : 0), twist, this.bank.x - weight * 0.6);

    // arms: the pose, then the swing, then whatever the hands are saying
    this.armsFor(pose, t);
    this.gestures(time, dt, pose, free && !this.moving);
    const swingAmp = lerp(0.2 + 0.12 * clamp(this.speed / 2, 0, 1), 0.62, run) * trait.swing * w;
    const sL = Math.cos(TAU * (u - 0.04 - trait.loose * 0.03));
    const breathe = inhale * 0.012;
    this.place(this.poseL, this.gestureL, this.shownL, sL, swingAmp, run, w, slouch, breathe);
    this.place(this.poseR, this.gestureR, this.shownR, -sL, swingAmp, run, w, slouch, breathe);
    // a slouchy one, standing about, puts their hands in their pocket
    this.pocket = approach(this.pocket, trait.slouch > 0.6 && free && this.still > 1.2 && this.talkW < 0.1 && pose === "stand" ? 1 : 0, 3, dt);
    if (this.pocket > 0.001) {
      this.pocketed(this.shownL);
      this.pocketed(this.shownR);
    }
    rig.armL.rotation.set(this.shownL.x, -this.shownL.y, -this.shownL.z);
    rig.armR.rotation.set(this.shownR.x, this.shownR.y, this.shownR.z);
    rig.foreL.rotation.set(-this.shownL.elbow, 0, -this.shownL.twist);
    rig.foreR.rotation.set(-this.shownR.elbow, 0, this.shownR.twist);

    // —— the head: steady against the body, looking at something, blinking
    this.headFor(rig, time, t, dt, pose, root.position, yaw, sc, twist);

    if (this.fade < 1) this.blend(rig, dt);
  }

  // —— feet

  private home(f: Foot, p: Vector3, yaw: number, sc: number, out: Vector3) {
    const x = f.side * (SIDE + 0.025 * this.trait.loose), z = this.trait.loose * 0.05 * (f.side > 0 ? 1 : -0.6);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.set(p.x + (x * c + z * s) * sc, 0, p.z + (-x * s + z * c) * sc);
    out.y = this.floor(out.x, out.z);
    return out;
  }

  private plantAll(p: Vector3, yaw: number, sc: number) {
    for (const f of this.feet) {
      this.home(f, p, yaw, sc, f.at);
      f.planted = true;
      f.yaw = yaw;
      f.pitch = 0;
      f.stood = 1;
      f.s = 0;
    }
  }

  private start() {
    this.moving = true;
    const feet = this.feet;
    const swinging = feet.find((f) => !f.planted);
    const duty = lerp(0.6, 0.31, this.runW);
    if (swinging) {
      // already mid-step: carry on with it as the first step
      swinging.gait = true;
      this.u = frac(duty + swinging.s * (1 - duty) - swinging.offset);
    } else {
      // the foot further behind goes first
      const [a, b] = feet;
      const behind = (f: Foot) => (f.at.x - this.px) * this.dir.x + (f.at.z - this.pz) * this.dir.z;
      const lead = behind(a) <= behind(b) ? a : b;
      this.u = frac(duty - lead.offset + 1e-4);
    }
    for (const f of feet) f.stood = 1;
  }

  private stop() {
    this.moving = false;
    for (const f of this.feet) {
      if (f.planted || !f.gait) continue;
      // a step in the air finishes, but onto the spot beside the other foot
      f.gait = false;
      f.from.copy(f.at);
      f.fromYaw = f.yaw;
      f.fromPitch = f.pitch;
      f.dur = Math.max(0.12, (1 - f.s) * 0.32);
      f.s = 0;
      f.lift = 0.03;
    }
  }

  private stepFeet(p: Vector3, yaw: number, sc: number, dt: number, du: number, duty: number, stride: number, run: number) {
    const feet = this.feet;
    for (const f of feet) {
      const other = f === feet[0] ? feet[1] : feet[0];
      if (f.planted) {
        f.stood += du;
        if (this.moving) {
          const ui = frac(this.u + f.offset);
          // up when the cycle says so, once it's stood a while, and in a walk never both feet
          // at once; or sooner, if the body has gone on so far it would have to crouch to keep it
          const behind = ((p.x - f.at.x) * this.dir.x + (p.z - f.at.z) * this.dir.z) / sc;
          if (((ui >= duty && f.stood > duty * 0.4) || (behind > 0.5 && f.stood > 0.1)) && (other.planted || run > 0.5)) {
            f.planted = false;
            f.gait = true;
            f.from.copy(f.at);
            f.fromYaw = f.yaw;
            f.fromPitch = f.pitch;
            f.s = 0;
            f.to.copy(f.at);
            f.toYaw = f.yaw;
            f.lift = lerp(0.065 + 0.02 * clamp(this.speed / 2, 0, 1), 0.2, run);
            continue;
          }
          // heel strike, foot flat, then up onto the toe, by where the foot is against the
          // hips (as it is in a body, so a turn or a change of pace can't put them out of
          // step); whatever the pitch, the part of the foot on the floor stays put, so
          // easing it is free
          const ahead = ((f.at.x - p.x) * Math.sin(yaw) + (f.at.z - p.z) * Math.cos(yaw)) / sc;
          const goal = lerp(-0.25 * ramp(0.06, 0.24, ahead) + 0.72 * Math.pow(ramp(0.1, 0.48, -ahead), 1.3), 0.04 * ramp(0.05, 0.2, ahead) + 0.82 * Math.pow(ramp(0.02, 0.4, -ahead), 1.2), run);
          f.pitch = approach(f.pitch, goal, 30, dt);
        } else {
          f.pitch = approach(f.pitch, 0, 10, dt);
        }
        continue;
      }
      // in the air
      if (f.gait && this.moving) {
        const raw = f.s + du / (1 - duty);
        f.s = Math.min(1, raw);
        // where it'll come down: ahead of where the hips will be by then (on the
        // frame it lands, the body may be a hair past that, and the spot stays put)
        const left = (1 - raw) * (1 - duty) * stride;
        f.left = left;
        const ahead = lerp(0.36, 0.3, run) * duty * (stride / sc);
        const x = f.side * (SIDE + 0.01), z = ahead;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        vB.set(p.x + this.dir.x * left + (x * c + z * s) * sc, 0, p.z + this.dir.z * left + (-x * s + z * c) * sc);
        // aim anew while the foot's high, then commit to the spot (and the way it points) as it comes down
        const aim = raw - du / (1 - duty) < 1e-6 ? 1 : 1 - ramp(0.55, 0.92, f.s);
        f.to.lerp(vB, aim);
        f.toYaw += wrap(yaw - f.toYaw) * aim;
      } else {
        f.s = Math.min(1, f.s + dt / f.dur);
        f.left = 0;
        this.home(f, p, yaw, sc, f.to);
        f.toYaw = yaw;
      }
      f.to.y = this.floor(f.to.x, f.to.z);
      const s = f.s;
      const hold = f.gait ? lerp(0, 0.12, run) : 0;
      const h = smoother(clamp((s - hold) / (1 - hold), 0, 1));
      f.at.x = lerp(f.from.x, f.to.x, h);
      f.at.z = lerp(f.from.z, f.to.z, h);
      f.at.y = lerp(f.from.y, f.to.y, h) + f.lift * sc * bump(s, f.gait ? lerp(0.85, 0.7, run) : 1);
      f.yaw = f.fromYaw + wrap(f.toYaw - f.fromYaw) * h;
      const land = f.gait ? lerp(-0.25, 0.04, run) : 0;
      f.pitch = lerp(f.fromPitch, land, ramp(0.05, 0.9, s)) - (f.gait ? lerp(0.2, -0.15, run) : 0.15) * bump(s);
      if (s >= 1) {
        f.planted = true;
        f.at.copy(f.to);
        f.yaw = f.toYaw;
        f.pitch = land;
        f.stood = 0;
        if (f.gait && this.moving) this.onStep?.(f.at, clamp(this.speed / 4, 0.25, 1));
        f.gait = false;
      }
    }
    if (!this.moving) {
      // standing: a foot that's out of place steps back under the body, one at a time
      if (feet[0].planted && feet[1].planted) {
        let worst: Foot | null = null, most = this.still < 1 ? 0.06 : 0.11;
        for (const f of feet) {
          this.home(f, p, yaw, sc, vA);
          const off = Math.hypot(f.at.x - vA.x, f.at.z - vA.z) / sc;
          const turned = Math.abs(wrap(f.yaw - yaw));
          const need = Math.max(off, turned > 0.55 ? 0.2 + turned * 0.1 : 0);
          if (need > most) {
            most = need;
            worst = f;
          }
        }
        if (worst) {
          worst.planted = false;
          worst.gait = false;
          worst.from.copy(worst.at);
          worst.fromYaw = worst.yaw;
          worst.fromPitch = worst.pitch;
          worst.s = 0;
          worst.dur = lerp(0.26, 0.34, this.trait.loose);
          worst.lift = 0.05;
        }
      }
    }
  }

  /** The ankle of a foot, in root space (into vA). */
  private ankleRoot(f: Foot, p: Vector3, yaw: number, sc: number) {
    const a = ankleOver(f.pitch);
    const wx = f.at.x + Math.sin(f.yaw) * a.f * sc, wz = f.at.z + Math.cos(f.yaw) * a.f * sc, wy = f.at.y + a.u * sc;
    const ox = wx - p.x, oz = wz - p.z, c = Math.cos(yaw), s = Math.sin(yaw);
    vA.set((ox * c - oz * s) / sc, (wy - p.y) / sc, (ox * s + oz * c) / sc);
    return vA;
  }

  /** Keeps the hips low enough for every foot that's down (and the one about to be)
   * to reach the floor: first up onto the toes, then down at the hips. */
  private guard(p: Vector3, yaw: number, sc: number, sway: number, want: number, pelvisYaw: number, hop: boolean, dt: number) {
    let y = want;
    // just short of straight: a standing knee keeps a few degrees of give
    const r = REACH - 0.0015;
    for (const f of this.feet) {
      const weight = f.planted ? 1 : f.gait ? ramp(0.5, 0.9, f.s) : 0;
      if (weight <= 0) continue;
      const hx = sway + f.side * SIDE * Math.cos(pelvisYaw), hz = -f.side * SIDE * Math.sin(pelvisYaw);
      // a foot behind the hips (or under a body going up) can come up onto its toe instead,
      // rolling up at a foot's pace rather than all at once
      if (f.planted && (hop || this.ankleRoot(f, p, yaw, sc).z < hz) && this.far(f, p, yaw, sc, f.pitch, hx, want, hz, r)) {
        let lo = f.pitch, hi = 0.95;
        if (this.far(f, p, yaw, sc, hi, hx, want, hz, r)) lo = hi;
        else
          for (let i = 0; i < 9; i += 1) {
            const mid = (lo + hi) / 2;
            if (this.far(f, p, yaw, sc, mid, hx, want, hz, r)) lo = mid;
            else hi = mid;
          }
        f.pitch = Math.max(f.pitch, Math.min(hi, f.pitch + dt * 5));
      }
      // a hop lets the feet leave the floor
      if (hop && f.planted) continue;
      // a foot about to land needs reaching where it'll land, not where it is
      const a = f.planted ? this.ankleRoot(f, p, yaw, sc) : this.landing(f, p, yaw, sc);
      const flat = (a.x - hx) ** 2 + (a.z - hz) ** 2;
      const top = a.y + Math.sqrt(Math.max(0, r * r - flat));
      y = Math.min(y, lerp(y, top, weight));
    }
    return y;
  }

  /** Where a stepping foot's ankle will be against the hips when it comes down, in root space (into vA). */
  private landing(f: Foot, p: Vector3, yaw: number, sc: number) {
    const keepX = f.at.x, keepY = f.at.y, keepZ = f.at.z, keepYaw = f.yaw, keepPitch = f.pitch;
    f.at.set(f.to.x - this.dir.x * f.left, f.to.y, f.to.z - this.dir.z * f.left);
    f.yaw = f.toYaw;
    f.pitch = f.gait ? lerp(-0.25, 0.04, this.runW) : 0;
    this.ankleRoot(f, p, yaw, sc);
    f.at.set(keepX, keepY, keepZ);
    f.yaw = keepYaw;
    f.pitch = keepPitch;
    return vA;
  }

  /** Whether a foot pitched this much is out of reach of a hip here. */
  private far(f: Foot, p: Vector3, yaw: number, sc: number, pitch: number, hx: number, hy: number, hz: number, r: number) {
    const keep = f.pitch;
    f.pitch = pitch;
    const a = this.ankleRoot(f, p, yaw, sc);
    f.pitch = keep;
    return Math.hypot(a.x - hx, a.y - hy, a.z - hz) > r;
  }

  /** Legs for the poses that aren't standing on them. */
  private legPose(rig: Rig, pose: Pose, t: number, rootY: number, sc: number) {
    this.legFor(rig.legL, rig.shinL, rig.footL, -1, pose, t, rootY, sc);
    this.legFor(rig.legR, rig.shinR, rig.footR, 1, pose, t, rootY, sc);
  }

  private legFor(hip: Object3D, knee: Object3D, ft: Object3D, side: number, pose: Pose, t: number, rootY: number, sc: number) {
    hip.position.set(side * SIDE, HIP, 0);
    if (pose === "sit" || pose === "type") {
      // thighs along the seat, shins down to the floor where it's near enough (knees up
      // on a low seat), dangling where it isn't
      const floor = -rootY / sc + ANKLE;
      const ty = Math.max(clamp(floor, HIP - REACH, HIP - 0.08), HIP - SHIN - 0.001);
      reach(hip, knee, side * SIDE, HIP, 0, side * (SIDE + 0.015), ty, THIGH - 0.02 * side);
      orient(hip, knee, ft, 0, floor > HIP - SHIN - 0.02 ? 0 : 0.3);
    } else if (pose === "ride") {
      hip.rotation.set(-1.3, 0, side * 0.22);
      knee.rotation.set(1.15, 0, 0);
      ft.rotation.set(0.35, 0, 0);
    } else if (pose === "fly") {
      // flying: legs together, a little flutter
      hip.rotation.set(0.12 + side * Math.sin(t * 16) * 0.08, 0, 0);
      knee.rotation.set(0.12, 0, 0);
      ft.rotation.set(0.55, 0, 0);
    } else {
      // lying down, or carried: legs long, knees soft, feet relaxed
      hip.rotation.set(-0.04, 0, side * 0.03);
      knee.rotation.set(0.08, 0, 0);
      ft.rotation.set(0.25, 0, 0);
    }
  }

  // —— arms

  /** One arm, shown: its pose, the walk's swing on it if it's free, and a gesture if they're talking. */
  private place(a: Arm, g: Arm, out: Arm, s: number, swingAmp: number, run: number, w: number, slouch: number, breathe: number) {
    const gw = this.talkW * (1 - 0.7 * w) * a.free;
    out.x = a.x + a.swing * s * swingAmp + g.x * gw - slouch * 0.08;
    out.z = a.z + a.swing * (0.05 + 0.08 * run) * w + g.z * gw + breathe;
    out.y = a.y;
    out.elbow = a.elbow + a.swing * w * lerp(0.1 + 0.2 * Math.max(0, -s), 1.35 + 0.16 * -s, run) + g.elbow * gw;
    out.twist = a.twist + g.twist * gw;
  }

  private pocketed(out: Arm) {
    out.x = lerp(out.x, -0.5, this.pocket);
    out.z = lerp(out.z, -0.22, this.pocket);
    out.elbow = lerp(out.elbow, 1.2, this.pocket);
    out.twist = lerp(out.twist, -0.35, this.pocket);
  }

  private armsFor(pose: Pose, t: number) {
    const L = this.poseL, R = this.poseR;
    setArm(L, 0, 0.07, 0.12, 0, 1);
    setArm(R, 0, 0.07, 0.12, 0, 1);
    switch (pose) {
      case "sit":
        setArm(L, -0.42, 0.03, 0.95, 0, 0, 0.75);
        setArm(R, -0.42, 0.03, 0.95, 0, 0, 0.85);
        break;
      case "type": {
        // typing, or paused mid-word when someone's talking to them
        const keys = 1 - this.attendW * 0.8;
        setArm(L, -0.74 + Math.max(0, Math.sin(t * 13)) * 0.05 * keys, -0.12, 0.8 - Math.max(0, Math.sin(t * 13)) * 0.12 * keys, 0, 0, 0.15);
        setArm(R, -0.74 + Math.max(0, Math.sin(t * 13 + 2.1)) * 0.05 * keys, -0.12, 0.8 - Math.max(0, Math.sin(t * 13 + 2.1)) * 0.12 * keys, 0, 0, 0.15);
        break;
      }
      case "cheer": {
        const pump = Math.abs(Math.sin(t * 7));
        setArm(L, -2.85 + pump * 0.12, 0.28 + pump * 0.12, 0.25);
        setArm(R, -2.85 + pump * 0.12, 0.28 + pump * 0.12, 0.25);
        break;
      }
      case "wave":
        setArm(R, -2.6, 0.38, 0.45, Math.sin(t * 9) * 0.45);
        break;
      case "carry":
        setArm(L, -2.6, 0.24, 0.55);
        setArm(R, -2.6, 0.24, 0.55);
        break;
      case "throw":
        setArm(L, -1.25, 0.05, 0.15);
        setArm(R, -1.25, 0.05, 0.15);
        break;
      case "hip":
        setArm(L, 0.25, 0.62, 1.5, 0.6);
        setArm(R, 0.03 + Math.sin(t * 1.4) * 0.05, 0.08, 0.15, 0, 0.5, 0.7);
        break;
      case "cross":
        setArm(L, -0.55, -0.3, 1.75, -0.8, 0, 0.2);
        setArm(R, -0.62, -0.3, 1.75, -0.8, 0, 0.2);
        break;
      case "sick":
        setArm(R, -2.35, -0.55, 1.95);
        setArm(L, 0.02, 0.05, 0.2, 0, 0.6);
        break;
      case "think":
        setArm(R, -1.15, -0.4, 2.05, 0, 0, 0.2);
        setArm(L, -0.35, -0.25, 1.4, 0, 0, 0.3);
        break;
      case "phone":
        setArm(R, -0.5, -0.2, 1.45);
        L.free = 0.8;
        break;
      case "swoon":
        setArm(L, -0.75, -0.3, 2.35);
        setArm(R, -0.75, -0.3, 2.35);
        break;
      case "ride": {
        const pump = Math.abs(Math.sin(t * 6));
        setArm(L, -2.8, 0.25 + pump * 0.2, 0.5);
        setArm(R, -0.9, 0.1, 0.7);
        break;
      }
      case "fly":
        setArm(L, -3.06, -0.1, 0.05);
        setArm(R, -3.06 + Math.sin(t * 20) * 0.05, -0.1, 0.05);
        break;
    }
  }

  /** Hands while talking: a gesture held for a phrase, small beats on the words. */
  private gestures(time: number, dt: number, pose: Pose, idle: boolean) {
    const trait = this.trait;
    const talking = this.talk > 0 || pose === "talk";
    this.talkW = approach(this.talkW, talking ? Math.max(this.talk, pose === "talk" ? 0.85 : 0) : 0, talking ? 6 : 3, dt);
    // an animated one moves their hands a little even when nobody's asked them anything
    let fidget = 0;
    if (idle && !talking && trait.gesture > 1.2) {
      if (this.fidgetT < 0 && time > this.fidgetAt) this.fidgetT = 0;
      if (this.fidgetT >= 0) {
        this.fidgetT += dt / 1.3;
        fidget = bump(this.fidgetT);
        if (this.fidgetT >= 1) {
          this.fidgetT = -1;
          this.fidgetAt = time + 4 + this.rand() * 6;
        }
      }
      this.talkW = Math.max(this.talkW, fidget * 0.35);
    }
    if (time > this.phraseAt) {
      const r = this.rand();
      const g = trait.gesture;
      // Allen keeps to one hand; the animated use both
      const both = g > 1.2 ? 0.45 : g < 0.6 ? 0.08 : 0.25;
      const shrug = g > 0.9 ? 0.16 : 0.05;
      this.phrase = r < 0.2 ? 0 : r < 0.2 + both ? 2 : r < 0.2 + both + shrug ? 3 : 1;
      this.phraseAt = time + lerp(1.1, 2.3, this.rand()) * (g < 0.6 ? 1.25 : 1);
    }
    const g = trait.gesture;
    const beatHz = g < 0.6 ? 2 : 2.4 + trait.restless * 0.8;
    const beat = Math.pow(Math.max(0, Math.sin(time * beatHz * TAU)), 3);
    const L = this.gestureL, R = this.gestureR;
    const k = 1 - Math.exp(-dt * (g < 0.6 ? 11 : 7));
    const to = (a: Arm, x: number, z: number, elbow: number, twist: number) => {
      a.x += (x - a.x) * k;
      a.z += (z - a.z) * k;
      a.elbow += (elbow - a.elbow) * k;
      a.twist += (twist - a.twist) * k;
    };
    switch (this.phrase) {
      case 0:
        to(L, 0, 0, 0.1, 0);
        to(R, -0.08 * g, 0, 0.25 * g, 0);
        break;
      case 1:
        to(L, 0, 0, 0.1, 0);
        to(R, -0.36 * g, 0.04, 0.95 + 0.15 * g, 0.15);
        break;
      case 2:
        to(L, -0.3 * g, 0.16 * g, 0.92, 0.28);
        to(R, -0.3 * g, 0.16 * g, 0.92, 0.28);
        break;
      case 3:
        to(L, -0.12, 0.3 * g, 1.2, 0.55);
        to(R, -0.12, 0.3 * g, 1.2, 0.55);
        break;
    }
    // the beat: the hand comes down a touch on the stressed words
    R.elbow -= beat * 0.15 * g * (this.phrase ? 1 : 0.3) * k * 4;
    if (this.phrase >= 2) L.elbow -= beat * 0.12 * g * k * 4;
  }

  // —— the head

  private headFor(rig: Rig, time: number, t: number, dt: number, pose: Pose, p: Vector3, yaw: number, sc: number, twist: number) {
    const trait = this.trait;
    // where to look: at whatever we're asked to, or a glance about now and then
    this.attendW = approach(this.attendW, this.attend, this.attend > this.attendW ? 6 : 2.5, dt);
    if (time > this.glanceAt) {
      const r = this.rand();
      const wide = lerp(0.35, 0.85, trait.restless);
      if (r < 0.35) {
        this.glanceYaw = 0;
        this.glancePitch = 0;
      } else {
        this.glanceYaw = (this.rand() * 2 - 1) * wide;
        this.glancePitch = (this.rand() - 0.6) * 0.3;
      }
      this.glanceAt = time + lerp(6.5, 1.6, trait.restless) * (0.5 + this.rand());
    }
    let yawGoal = this.moving ? this.glanceYaw * 0.25 : this.glanceYaw;
    let pitchGoal = this.moving ? 0.05 : this.glancePitch;
    if (this.attendW > 0.001) {
      const hx = p.x, hy = p.y + 1.45 * sc, hz = p.z;
      const lx = this.look.x - hx, ly = this.look.y - hy, lz = this.look.z - hz;
      const lookYaw = clamp(wrap(Math.atan2(lx, lz) - yaw - twist), -1.25, 1.25);
      const lookPitch = clamp(-Math.atan2(ly, Math.hypot(lx, lz)), -0.5, 0.45);
      yawGoal = lerp(yawGoal, lookYaw, this.attendW);
      pitchGoal = lerp(pitchGoal, lookPitch, this.attendW);
    }
    if (pose === "sick" || pose === "phone") pitchGoal = Math.max(pitchGoal, 0.24);
    if (pose === "type") pitchGoal = lerp(0.18, pitchGoal, this.attendW);
    // a big turn of the head brings a blink with it, the way it does
    if (Math.abs(yawGoal - this.lastYawGoal) > 0.45 && this.blinkT < 0) this.blinkT = 0;
    this.lastYawGoal = yawGoal;
    const w = trait.turn;
    this.headYaw.turn(yawGoal, w, dt);
    this.headPitch.step(pitchGoal, w, dt);
    // tilts while talking, nods while listening
    const talkTilt = this.talkW > 0.05 ? Math.sin(time * 0.9 + this.phrase * 2.1) * 0.07 * this.trait.gesture * this.talkW : 0;
    this.tilt.step(talkTilt + (pose === "swoon" ? Math.sin(t * 5) * 0.12 : 0) + (this.trait.loose - 0.4) * 0.05 * (1 - this.walkW), 6, dt);
    let nod = 0;
    if (this.listen > 0.3 && this.talkW < 0.2) {
      if (this.nodT < 0 && time > this.nodAt) this.nodT = 0;
      if (this.nodT >= 0) {
        this.nodT += dt / 0.42;
        nod = bump(this.nodT) * (trait.gesture < 0.6 ? 0.07 : 0.1);
        if (this.nodT >= 1) {
          this.nodT = -1;
          this.nodAt = time + (trait.gesture < 0.6 ? 3.4 : 2.2 + this.rand() * 3);
        }
      }
    }
    const beat = this.talkW * Math.pow(Math.max(0, Math.sin(time * (trait.gesture < 0.6 ? 2 : 2.4) * TAU + 0.6)), 3) * 0.05 * trait.gesture;
    const head = rig.head;
    head.rotation.set(
      this.headPitch.x - this.lean.x * 0.85 + nod + beat + this.trait.slouch * -0.05 + Math.sin(this.breath) * 0.006,
      this.headYaw.x - twist * 0.9,
      this.tilt.x - this.bank.x * 0.5,
    );

    // blinks: every few seconds, sometimes twice
    if (this.blinkT < 0 && time > this.blinkAt) this.blinkT = 0;
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt / 0.15;
      lid = 1 - bump(this.blinkT) * 0.86;
      if (this.blinkT >= 1) {
        this.blinkT = -1;
        if (!this.blinkAgain && this.rand() < 0.14) {
          this.blinkAgain = true;
          this.blinkAt = time + 0.12;
        } else {
          this.blinkAgain = false;
          this.blinkAt = time + trait.blink * (0.4 + this.rand() * 1.2) * (this.talkW > 0.5 ? 0.8 : 1);
        }
      }
    }
    rig.eyes.scale.set(1, lid, 1);

    // the mouth, while there's still something left to say
    this.voice = Math.max(0, this.voice - dt);
    const open = this.voice > 0 ? 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(time * 4.7 * TAU + 1.3 * Math.sin(time * 1.1 * TAU))), 0.7) : pose === "talk" ? 0.3 + 0.4 * Math.abs(Math.sin(time * 3.9 * TAU)) : 0;
    this.mouth = approach(this.mouth, open, 28, dt);
    rig.mouth.scale.set(1, Math.max(0, this.mouth * 0.75), 1);
  }

  // —— crossfading between poses, so nothing snaps

  private list: Object3D[] = [];
  private listOf: Rig | null = null;

  private bones(rig: Rig) {
    if (this.listOf !== rig) {
      this.listOf = rig;
      this.list = [rig.body, rig.head, rig.armL, rig.foreL, rig.armR, rig.foreR, rig.legL, rig.shinL, rig.footL, rig.legR, rig.shinR, rig.footR];
    }
    return this.list;
  }

  private capture(rig: Rig) {
    const list = this.bones(rig);
    for (let i = 0; i < list.length; i += 1) this.from[i].copy(list[i].quaternion);
    this.fromAt[0].copy(rig.body.position);
    this.fromAt[1].copy(rig.legL.position);
    this.fromAt[2].copy(rig.legR.position);
  }

  private blend(rig: Rig, dt: number) {
    this.fade = Math.min(1, this.fade + dt / FADE);
    const e = smoother(this.fade);
    const list = this.bones(rig);
    const count = this.fadeLegs ? list.length : 6;
    for (let i = 0; i < count; i += 1) list[i].quaternion.slerpQuaternions(this.from[i], list[i].quaternion, e);
    rig.body.position.lerpVectors(this.fromAt[0], rig.body.position, e);
    if (this.fadeLegs) {
      rig.legL.position.lerpVectors(this.fromAt[1], rig.legL.position, e);
      rig.legR.position.lerpVectors(this.fromAt[2], rig.legR.position, e);
    }
  }
}

// —— Phoebe

type Paw = { at: Vector3; planted: boolean; from: Vector3; to: Vector3; s: number; dur: number; gait: boolean; stood: number };
const paw = (): Paw => ({ at: new Vector3(), planted: true, from: new Vector3(), to: new Vector3(), s: 0, dur: 0.2, gait: false, stood: 1 });

/** Where each leg meets the body (front left, front right, hind left, hind right), and the body's own centre. */
const PAWS: ReadonlyArray<[number, number]> = [
  [-0.15, 0.3],
  [0.15, 0.3],
  [-0.15, -0.3],
  [0.15, -0.3],
];
const DOG_HIP = 0.3;
const DOG_BODY = 0.45;
/** Hip to the top of the paw, and the paw itself. */
const DOG_LEG = 0.2;
const PAW = 0.1;
// a trot moves the diagonals together; a gallop the hind pair, then the front
const TROT = [0, 0.5, 0.5, 0];
const GALLOP = [0.5, 0.58, 0, 0.08];

export type DogMode = "stand" | "sit" | "lie" | "sniff";

/** Phoebe's motion: a trot that turns into a gallop, paws that stay put, a tail that says how she feels. */
export class DogMotion {
  /** 0 calm to 1 beside herself: the tail, the ears, the hops. */
  excited = 0.2;
  mode: DogMode = "stand";
  /** A world point to look at, and how much. */
  readonly look = new Vector3();
  attend = 0;
  /** Head on one side: someone's talking to her. */
  curious = 0;
  floor: (x: number, z: number) => number = () => 0;
  onStep: ((at: Vector3, hard: number) => void) | null = null;

  private readonly rand = random(91);
  private last = -1;
  private fresh = true;
  private px = 0;
  private pz = 0;
  private speed = 0;
  private moving = false;
  private gallop = 0;
  private u = 0;
  private readonly dir = new Vector3(0, 0, 1);
  private readonly paws: Paw[] = [paw(), paw(), paw(), paw()];
  private readonly sit = new Spring();
  private readonly lie = new Spring();
  private readonly sniff = new Spring();
  private readonly headYaw = new Spring();
  private readonly headPitch = new Spring();
  private readonly tilt = new Spring();
  private readonly ear = new Spring();
  private hop = -1;
  private wag = 0;
  private breath = 0;
  private blinkAt = 1.5;
  private blinkT = -1;
  private pant = 0;

  /** A happy hop. */
  jump() {
    if (this.hop < 0 && this.mode === "stand") this.hop = 0;
  }

  reset() {
    this.fresh = true;
  }

  get pace() {
    return this.speed;
  }

  apply(rig: Dog, time: number) {
    const dt = this.last < 0 ? 0 : clamp(time - this.last, 0, 0.05);
    this.last = time;
    const root = rig.root;
    const yaw = root.rotation.y;
    const p = root.position;
    const dx = p.x - this.px, dz = p.z - this.pz;
    const dist = Math.hypot(dx, dz);
    this.px = p.x;
    this.pz = p.z;
    const jumped = this.fresh || dist > 0.8;
    if (jumped) {
      this.fresh = false;
      this.speed = 0;
      this.moving = false;
      for (let i = 0; i < 4; i += 1) this.home(i, p, yaw, this.paws[i].at);
      for (const q of this.paws) q.planted = true;
    }
    const step = jumped ? 0 : dist;
    this.speed = approach(this.speed, dt > 0 ? step / dt : 0, 12, dt);
    if (step > 1e-6) this.dir.set(dx / step, 0, dz / step);
    if (!this.moving && this.speed > 0.2) {
      this.moving = true;
      this.u = frac(0.5 + 1e-4);
      for (const q of this.paws) q.stood = 1;
    } else if (this.moving && this.speed < 0.08) {
      this.moving = false;
      for (const q of this.paws) if (!q.planted) {
        q.gait = false;
        q.from.copy(q.at);
        q.s = 0;
        q.dur = 0.14;
      }
    }
    const sitting = this.mode === "sit" || this.mode === "lie";
    this.sit.step(this.mode === "sit" ? 1 : 0, 7, dt);
    this.lie.step(this.mode === "lie" ? 1 : 0, 5, dt);
    this.sniff.step(this.mode === "sniff" && !this.moving ? 1 : this.mode === "sniff" ? 0.4 : 0, 6, dt);
    const down = clamp(Math.max(this.sit.x, this.lie.x), 0, 1);

    // trot below about Froude 2, a gallop above (for her legs, 2.4 m/s)
    const fr = (this.speed * this.speed) / (G * DOG_HIP);
    this.gallop = approach(this.gallop, this.moving && fr > 2.1 ? 1 : 0, 6, dt);
    const duty = lerp(0.52, 0.3, this.gallop);
    const natural = 2.3 * DOG_HIP * Math.pow(Math.max(fr, 1e-4), 0.3);
    const stride = Math.max(0.08, Math.min(natural, lerp(0.22, 0.3, this.gallop) / duty));
    const du = this.moving ? step / stride : 0;
    this.u = frac(this.u + du);

    // the body: low and quick in a trot, rocking in a gallop, down on the floor sitting
    this.breath += dt * TAU * (0.35 + this.pant * 0.9 + (1 - down) * 0.1);
    const bob = this.moving ? lerp(0.008 * Math.cos(2 * TAU * this.u), 0.02 * Math.cos(TAU * this.u), this.gallop) : 0;
    let pitch = this.moving ? this.gallop * 0.12 * Math.sin(TAU * this.u) : 0;
    let lift = 0;
    if (this.hop >= 0) {
      this.hop += dt / 0.5;
      // up on the back legs, front paws off the ground, twice
      const h = bump(frac(this.hop * 2));
      lift = h * 0.07;
      pitch -= h * 0.32;
      if (this.hop >= 1) this.hop = -1;
    }
    // sitting: rump on the floor and front legs straight, which for her build is a 0.3 rad tilt
    const sitPitch = -0.3 * this.sit.x * (1 - this.lie.x);
    const bodyY = DOG_BODY + bob + lift - this.sit.x * (1 - this.lie.x) * 0.083 - this.lie.x * 0.18 + Math.sin(this.breath) * 0.004 * (1 + this.lie.x);
    rig.body.position.set(0, bodyY, 0);
    // the bounce of a happy dog: the back end wiggles with the tail
    const wiggle = this.moving ? 0 : Math.sin(this.wag) * 0.05 * clamp(this.excited - 0.4, 0, 1) * (1 - down);
    rig.body.rotation.set(pitch + sitPitch + this.sniff.x * 0.08, wiggle, 0);
    rig.body.updateMatrix();

    // —— legs: planted paws, or folded under her
    const offsets = this.gallop > 0.5 ? GALLOP : TROT;
    for (let i = 0; i < 4; i += 1) {
      const q = this.paws[i];
      const leg = rig.legs[i];
      const [ax, az] = PAWS[i];
      // where the leg meets the body, wherever the body is
      const top = vA.set(ax, DOG_HIP - DOG_BODY, az).applyMatrix4(rig.body.matrix);
      const tx = top.x, ty = top.y, tz = top.z;
      leg.position.set(tx, ty, tz);
      if (!sitting || down < 0.98) this.stepPaw(i, q, p, yaw, dt, du, duty, stride, offsets[i]);
      // the top of the paw, in root space: the leg points at it, the paw sits flat under it
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const ox = q.at.x - p.x, oz = q.at.z - p.z;
      const rx = ox * c - oz * s, ry = q.at.y - p.y + PAW, rz = ox * s + oz * c;
      const lx = rx - tx, ly = ry - ty, lz = rz - tz;
      const len = Math.hypot(lx, ly, lz);
      let px = Math.atan2(-lz, -ly);
      let pz = Math.asin(clamp(lx / Math.max(len, 1e-4), -1, 1));
      // the paw slides a hair along the leg rather than leave the floor (the leg hides the join)
      let reachTo = clamp(len, DOG_LEG - 0.05, DOG_LEG + 0.06);
      // folded: front legs out ahead, back legs tucked
      const front = i < 2;
      let fold = 0;
      if (down > 0.001) {
        const bend = front ? lerp(-0.12, -1.42, this.lie.x) : lerp(-1.25, -1.35, this.lie.x);
        const out = front ? 0 : (ax < 0 ? -1 : 1) * 0.3 * this.lie.x;
        fold = front ? clamp(this.lie.x * 1.2, 0, 1) : down;
        px = lerp(px, bend - sitPitch * (front ? 0 : 0.2), fold);
        pz = lerp(pz, out, fold);
        reachTo = lerp(reachTo, DOG_LEG, fold);
      }
      leg.rotation.set(px, 0, pz);
      const pawBone = rig.paws[i];
      pawBone.position.set(0, -reachTo, 0);
      // flat on the floor; folded, along the leg
      qA.copy(leg.quaternion).invert();
      pawBone.quaternion.slerpQuaternions(qA, qIdentity, fold);
    }

    // —— head: looking, sniffing, tilting
    this.attend = clamp(this.attend, 0, 1);
    let yawGoal = 0, pitchGoal = 0;
    if (this.attend > 0.01) {
      const hx = p.x, hy = p.y + 0.62, hz = p.z;
      const lx = this.look.x - hx, ly = this.look.y - hy, lz = this.look.z - hz;
      yawGoal = clamp(wrap(Math.atan2(lx, lz) - yaw), -1.1, 1.1) * this.attend;
      pitchGoal = clamp(-Math.atan2(ly, Math.hypot(lx, lz)), -0.75, 0.4) * this.attend;
    }
    const sniffing = this.sniff.x;
    yawGoal = lerp(yawGoal, Math.sin(time * 0.9) * 0.4, sniffing);
    pitchGoal = lerp(pitchGoal, 0.55 + Math.sin(time * 19) * 0.03, sniffing);
    pitchGoal = lerp(pitchGoal, 0.3, this.lie.x);
    this.headYaw.turn(yawGoal, 10, dt);
    this.headPitch.step(pitchGoal - sitPitch * 0.8 - pitch * 0.7, 10, dt);
    this.tilt.step(this.curious * 0.32 * Math.sin(time * 0.35 + 1), 5, dt);
    rig.head.rotation.set(this.headPitch.x, this.headYaw.x, this.tilt.x);

    // ears: soft, they lag the bounce, and lift out when she's excited or running
    this.ear.step(bob * 5 - lift * 3, 14, dt);
    const spread = 0.06 + 0.22 * clamp(this.excited, 0, 1) + 0.3 * this.gallop;
    rig.ears[0].rotation.set(this.ear.x, 0, -spread);
    rig.ears[1].rotation.set(this.ear.x, 0, spread);

    // tail: faster and wider the happier she is; swept along the floor sitting
    const happy = clamp(this.excited, 0, 1);
    this.wag += dt * TAU * lerp(2.2, 7, happy);
    rig.tail.rotation.set(lerp(0.25, 0.75, happy) * (1 - down * 0.8) - this.lie.x * 0.3, Math.sin(this.wag) * lerp(0.22, 0.7, happy) * (1 - this.lie.x * 0.7) + this.lie.x * 0.9, 0);

    // panting after a run, blinking now and then (sleeping: shut)
    this.pant = approach(this.pant, this.gallop > 0.5 ? 1 : this.moving ? 0.25 : 0, this.gallop > 0.5 ? 1.5 : 0.25, dt);
    rig.tongue.rotation.set(0.12 + this.pant * (0.35 + Math.sin(time * 16) * 0.12), 0, 0);
    rig.tongue.scale.set(1, 1, 1 + this.pant * 0.6);
    if (this.blinkT < 0 && time > this.blinkAt) this.blinkT = 0;
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt / 0.14;
      lid = 1 - bump(this.blinkT) * 0.85;
      if (this.blinkT >= 1) {
        this.blinkT = -1;
        this.blinkAt = time + 2 + this.rand() * 4;
      }
    }
    rig.eyes.scale.set(1, this.lie.x > 0.6 && this.mode === "lie" ? 0.15 : lid, 1);
  }

  private home(i: number, p: Vector3, yaw: number, out: Vector3) {
    const [x, z] = PAWS[i];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.set(p.x + x * c + z * s, 0, p.z - x * s + z * c);
    out.y = this.floor(out.x, out.z);
    return out;
  }

  private stepPaw(i: number, q: Paw, p: Vector3, yaw: number, dt: number, du: number, duty: number, stride: number, offset: number) {
    if (q.planted) {
      q.stood += du;
      if (this.moving) {
        const ui = frac(this.u + offset);
        // up when the cycle says, or when the body's gone on too far past it
        this.home(i, p, yaw, vA);
        const behind = (vA.x - q.at.x) * this.dir.x + (vA.z - q.at.z) * this.dir.z;
        if ((ui >= duty && q.stood > duty * 0.4) || (behind > 0.17 && q.stood > 0.1)) {
          q.planted = false;
          q.gait = true;
          q.from.copy(q.at);
          q.to.copy(q.at);
          q.s = 0;
        }
      } else {
        this.home(i, p, yaw, vA);
        const off = Math.hypot(q.at.x - vA.x, q.at.z - vA.z);
        // one paw at a time, and not one that's still settling
        let settled = true;
        for (const o of this.paws) if (!o.planted) settled = false;
        if (off > 0.09 && settled) {
          q.planted = false;
          q.gait = false;
          q.from.copy(q.at);
          q.s = 0;
          q.dur = 0.16;
        }
      }
      return;
    }
    if (q.gait && this.moving) {
      const raw = q.s + du / (1 - duty);
      q.s = Math.min(1, raw);
      const left = (1 - raw) * (1 - duty) * stride;
      const [x, z0] = PAWS[i];
      const z = z0 + 0.32 * duty * stride;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      vB.set(p.x + this.dir.x * left + x * c + z * s, 0, p.z + this.dir.z * left - x * s + z * c);
      // aim while the paw's up, commit as it comes down
      q.to.lerp(vB, raw - du / (1 - duty) < 1e-6 ? 1 : 1 - ramp(0.55, 0.92, q.s));
    } else {
      q.s = Math.min(1, q.s + dt / q.dur);
      this.home(i, p, yaw, q.to);
    }
    q.to.y = this.floor(q.to.x, q.to.z);
    const h = smoother(q.s);
    q.at.x = lerp(q.from.x, q.to.x, h);
    q.at.z = lerp(q.from.z, q.to.z, h);
    q.at.y = lerp(q.from.y, q.to.y, h) + lerp(0.05, 0.09, this.gallop) * bump(q.s, 0.8);
    if (q.s >= 1) {
      q.planted = true;
      q.at.copy(q.to);
      q.stood = 0;
      if (q.gait && this.moving && i >= 2) this.onStep?.(q.at, clamp(this.speed / 4, 0.15, 0.6));
      q.gait = false;
    }
  }
}
