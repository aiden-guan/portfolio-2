import { CanvasTexture, Group, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace, Vector3, type Material, type Object3D } from "three";
import { materials, mesh, V } from "./kit";
import { PADS } from "./layout";
import { ground, type Place } from "./places";
import { padHeight } from "./terrain";
import { hash3, shade, Voxels } from "./voxels";

// ——— Rally: table tennis with your phone as the paddle ———————————————————
//
// Two people at a table of the real size (2.74 by 1.525 m, 76 cm high), a
// phone each for a bat, playing real points: a serve tossed up out of the
// open hand that bounces once on each side, rallies of forehands and
// backhands, and an end the way points end, past someone, into the net or
// long. They split-step as the other one hits, shuffle across to where the
// ball is going, turn into a forehand and finish up by the forehead, and the
// board keeps the score, to eleven. Everything is a function of the clock but
// the feet, which step when the body has moved off them.

const TABLE = { length: 2.74, width: 1.525, height: 0.76, net: 0.1525 };
const HALF = TABLE.length / 2;
const BALL = 0.025;
const TOP = TABLE.height + BALL;
const NET_TOP = TABLE.height + TABLE.net;
const G = 9.8;

/** body voxels, and the finer ones the phones are cut from */
const S = 0.08;
const P = 0.02;

type Look = { skin: number; hair: number; top: number; bottom: number; shoes: number; shorts?: boolean; cap?: number; height: number };

// a cobalt tee at the far end, an orange one in a cap at the near end
const LOOKS: [Look, Look] = [
  { skin: 0xe9b98f, hair: 0x1d1a19, top: 0x2f6be8, bottom: 0x2a2f3d, shoes: 0xf4f2ee, height: 1.79 },
  { skin: 0xc98b62, hair: 0x241b16, top: 0xf08a32, bottom: 0x1f2633, shoes: 0xf5f5f5, shorts: true, cap: 0x1b1d22, height: 1.72 },
];

// measured on a 1.75 m body, scaled by height
const BODY = { thigh: 0.43, shin: 0.43, ankle: 0.07, hipW: 0.09, spine: 0.5, shoulderW: 0.2, drop: 0.05, upper: 0.29, fore: 0.26, hand: 0.07 };

const UP = new Vector3(0, 1, 0);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// —— the people

/** A part cut from voxels, its joint at the origin. */
function part(size: number, build: (v: Voxels) => void, pivot: [number, number, number], material: Material = materials.solid) {
  const v = new Voxels(size, 0.04);
  build(v);
  const geometry = v.geometry(1);
  geometry.translate(-pivot[0] * size, -pivot[1] * size, -pivot[2] * size);
  const m = new Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

type Figure = {
  root: Group;
  pelvis: Mesh;
  torso: Mesh;
  head: Mesh;
  upper: [Mesh, Mesh];
  fore: [Mesh, Mesh];
  thigh: [Mesh, Mesh];
  shin: [Mesh, Mesh];
  foot: [Mesh, Mesh];
  phone: Group;
  /** height against the 1.75 m the measures are for */
  k: number;
};

function figure(look: Look): Figure {
  const k = look.height / 1.75;
  const { skin, top, bottom } = look;
  const hair = (x: number, y: number, z: number) => (hash3(x, y, z) > 0.6 ? shade(look.hair, 0.12) : look.hair);
  const pelvis = part(S, (v) => v.box(-2, 0, -1, 1, 1, 0, (x, y) => (y === 1 ? shade(bottom, -0.2) : bottom)), [0, 1, 0]);
  const torso = part(
    S,
    (v) => {
      v.box(-2, 0, -1, 1, 5, 1, (x, y, z) => (z === -1 && y < 4 ? shade(top, -0.12) : y === 0 ? shade(top, -0.06) : top));
      // the neck of the tee
      v.set(-1, 5, 1, shade(skin, -0.05));
      v.set(0, 5, 1, shade(skin, -0.05));
    },
    [0, 0, 0.5],
  );
  const head = part(
    S,
    (v) => {
      v.set(0, -1, 0, shade(skin, -0.08));
      v.box(-1, 0, -1, 1, 1, 1, skin);
      v.set(-1, 1, 1, 0x1d1a19);
      v.set(1, 1, 1, 0x1d1a19);
      v.box(-1, 2, -1, 1, 2, 1, hair);
      v.box(-1, 0, -1, 1, 1, -1, hair);
      v.set(-1, 1, 0, hair(-1, 1, 0));
      v.set(1, 1, 0, hair(1, 1, 0));
      if (look.cap !== undefined) {
        v.box(-1, 2, -1, 1, 2, 1, look.cap);
        v.box(-1, 2, 2, 1, 2, 2, shade(look.cap, 0.15));
      }
    },
    [0.5, -1, 0.5],
  );
  const upper = () => part(S, (v) => v.box(0, -4, 0, 0, -1, 0, (x, y) => (y >= -1 ? top : skin)), [0.5, 0, 0.5]);
  const fore = () => part(S, (v) => v.box(0, -4, 0, 0, -1, 0, (x, y) => (y === -4 ? shade(skin, -0.1) : skin)), [0.5, 0, 0.5]);
  const thigh = () => part(S, (v) => v.box(-1, -5, -1, 0, -1, 0, (x, y) => (look.shorts && y <= -4 ? skin : bottom)), [0, 0, 0]);
  const shin = () => part(S, (v) => v.box(-1, -5, -1, 0, -1, 0, (x, y) => (y === -5 ? 0xf2f0ea : look.shorts ? skin : bottom)), [0, 0, 0]);
  const foot = () => part(S, (v) => v.box(-1, -1, -1, 0, -1, 2, (x, y, z) => (z === 2 ? shade(look.shoes, -0.12) : look.shoes)), [0, 0, 0]);

  // the phone: held at one end like a handle, its screen lit (and lit up at night)
  const phone = new Group();
  const body = part(P, (v) => v.box(-2, -8, 0, 1, -1, 0, 0x22262e), [0, 0, 0]);
  const screen = part(P, (v) => v.box(-2, -8, 1, 1, -1, 1, (x, y) => (x === -2 || x === 1 || y === -1 || y === -8 ? 0x22262e : y === -3 && x === 0 ? 0xf08a32 : 0x2f6be8)), [0, 0, 0], materials.glow);
  screen.castShadow = false;
  phone.add(body, screen);
  phone.scale.set(1, 1, 0.45);

  const root = new Group();
  const f: Figure = { root, pelvis, torso, head, upper: [upper(), upper()], fore: [fore(), fore()], thigh: [thigh(), thigh()], shin: [shin(), shin()], foot: [foot(), foot()], phone, k };
  root.add(pelvis, torso, head, phone, ...f.upper, ...f.fore, ...f.thigh, ...f.shin, ...f.foot);
  return f;
}

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
/** Puts a part at `at`, its +y along `y` and its front as near `front` as it can be. */
function orient(o: Object3D, at: Vector3, y: Vector3, front: Vector3) {
  _y.copy(y).normalize();
  _z.copy(front).addScaledVector(_y, -front.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  o.quaternion.setFromRotationMatrix(_m);
  o.position.copy(at);
}

/** Two bones from `a` toward `target`: where the middle joint goes, bent
 * toward `pole`, and where the end gets to (short of the target if it is out
 * of reach). */
function reach(a: Vector3, target: Vector3, l1: number, l2: number, pole: Vector3, joint: Vector3, end: Vector3) {
  const d = end.copy(target).sub(a);
  let dist = d.length();
  const most = l1 + l2 - 1e-4;
  if (dist > most) {
    d.multiplyScalar(most / dist);
    dist = most;
  }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
  const dir = d.clone().normalize();
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(dir, -dir.y);
  side.normalize();
  joint.copy(a).addScaledVector(dir, along).addScaledVector(side, off);
  end.copy(a).addScaledVector(dir, dist);
}

// —— the points

type Kind = "fh" | "bh" | "serve";
type Shot = {
  who: 0 | 1;
  kind: Kind;
  /** contact */
  t: number;
  /** the ball, at contact (or where it went by, for a miss) */
  at: Vector3;
  /** where the hitter's feet are centred for it */
  body: Vector3;
  miss?: boolean;
};
/** A ball in the air: across linearly, up and down under gravity. */
type Flight = { t0: number; t1: number; a: Vector3; b: Vector3; vy: number };
type Point = {
  start: number;
  /** the score changes and the next point starts */
  end: number;
  server: 0 | 1;
  /** the server's free hand lets go of the ball */
  toss: number;
  shots: Shot[];
  flights: Flight[];
  winner: 0 | 1;
  /** where the ball ends up, and when */
  rest: { t: number; at: Vector3 };
};

const side = (who: number) => (who === 0 ? -1 : 1);
const forward = (who: number) => new Vector3(-side(who), 0, 0);
const rightOf = (who: number) => new Vector3(0, 0, -side(who));

/** Where someone stands to take the ball at `at` with this stroke: a forehand
 * out to their right and in front, a backhand in front of the belly. */
function stance(who: 0 | 1, kind: Kind, at: Vector3) {
  const F = forward(who);
  const R = rightOf(who);
  const out = kind === "fh" ? 0.44 : kind === "bh" ? -0.04 : 0.32;
  const ahead = kind === "serve" ? 0.36 : 0.34;
  return at.clone().addScaledVector(R, -out).addScaledVector(F, -ahead).setY(0);
}

function flight(t0: number, a: Vector3, t1: number, b: Vector3): Flight {
  const T = t1 - t0;
  return { t0, t1, a: a.clone(), b: b.clone(), vy: (b.y - a.y + 0.5 * G * T * T) / T };
}
const heightAt = (f: Flight, x: number) => {
  const u = (x - f.a.x) / (f.b.x - f.a.x);
  const s = u * (f.t1 - f.t0);
  return f.a.y + f.vy * s - 0.5 * G * s * s;
};
/** A flight from a to b at `speed` across, slowed until it clears the net. */
function over(t0: number, a: Vector3, b: Vector3, speed: number) {
  let T = Math.abs(b.x - a.x) / speed;
  let f = flight(t0, a, t0 + T, b);
  for (let i = 0; i < 12 && (a.x < 0) !== (b.x < 0) && heightAt(f, 0) < NET_TOP + 0.03; i += 1) {
    T *= 1.08;
    f = flight(t0, a, t0 + T, b);
  }
  return f;
}

/** Off the end of a flight onto the ground: a few bounces on the terrace,
 * each lower, then a roll to a stop. */
function bounceAway(flights: Flight[], last: Flight, floor: number) {
  let f = last;
  for (let n = 0; n < 4; n += 1) {
    const T = f.t1 - f.t0;
    const vx = (f.b.x - f.a.x) / T;
    const vz = (f.b.z - f.a.z) / T;
    const vy = -(f.vy - G * T) * 0.55;
    const up = (2 * vy) / G;
    if (vy < 0.25) break;
    const a = f.b.clone();
    const b = a.clone().add(new Vector3(vx * 0.75 * up, 0, vz * 0.75 * up)).setY(floor);
    f = { t0: f.t1, t1: f.t1 + up, a, b, vy };
    flights.push(f);
  }
  const T = f.t1 - f.t0;
  const speed = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z) / T;
  const roll = Math.min(1.2, 0.4 + speed * 0.25);
  const dir = new Vector3(f.b.x - f.a.x, 0, f.b.z - f.a.z).normalize();
  const stop = f.b.clone().addScaledVector(dir, (speed * roll) / 2);
  // a roll is a flight with no height
  flights.push({ t0: f.t1, t1: f.t1 + roll, a: f.b.clone(), b: stop, vy: 0, roll: true } as Flight & { roll: boolean });
  return { t: f.t1 + roll, at: stop };
}

/** where the server holds the ball up before the toss */
const palmOf = (who: 0 | 1, body: Vector3) => body.clone().addScaledVector(rightOf(who), -0.04).addScaledVector(forward(who), 0.34).setY(0.97);
/** the serve is struck this long after the point starts */
const SERVE_AT = 2.3;
/** no pass is quicker than this, contact to contact, so whoever hit it is
 * always back to ready before they have to go again */
const PASS = 0.64;

function makePoint(start: number, server: 0 | 1, random: () => number): Point {
  const shots: Shot[] = [];
  const flights: Flight[] = [];
  const pick = (a: number, b: number) => a + (b - a) * random();

  // the serve: from a little to the backhand side, tossed up out of the
  // open hand and struck low as it falls, once on each side of the net
  const sv = side(server);
  const P0 = new Vector3(sv * (HALF + 0.12), 0.9, -rightOf(server).z * pick(0.05, 0.3));
  const tServe = start + SERVE_AT;
  const serveBody = stance(server, "serve", P0);
  const toss = tServe - 0.55;
  flights.push(flight(toss, palmOf(server, serveBody), tServe, P0));
  shots.push({ who: server, kind: "serve", t: tServe, at: P0, body: serveBody });
  const B1 = new Vector3(sv * pick(0.55, 0.95), TOP, P0.z * 0.6 + pick(-0.15, 0.15));
  const serveSpeed = pick(3.3, 4.1);
  const f1 = flight(tServe, P0, tServe + Math.abs(B1.x - P0.x) / serveSpeed, B1);
  flights.push(f1);

  let hitter = server;
  let from = B1;
  let t = f1.t1;
  let speed = serveSpeed;
  const rallies = 2 + Math.floor(random() * 7);
  let winner: 0 | 1 = server;
  let rest: Point["rest"] | null = null;
  // each pass: from `from` (the serve's first bounce, or a contact) over the
  // net, a bounce on the other side, and the other one takes it, or doesn't
  for (let n = 0; ; n += 1) {
    const to = (1 - hitter) as 0 | 1;
    const sTo = side(to);
    const ending = n >= rallies ? (random() < 0.5 ? "winner" : random() < 0.5 ? "net" : "long") : null;

    if (ending === "net") {
      // into the tape, and down onto the hitter's own side
      const N = new Vector3(0, pick(0.82, 0.88), from.z * 0.5 + pick(-0.2, 0.2));
      const fn = flight(t, from, t + Math.abs(from.x) / speed, N);
      flights.push(fn);
      const D = new Vector3(side(hitter) * pick(0.05, 0.12), TOP, N.z);
      const fd = flight(fn.t1, N, fn.t1 + 0.16, D);
      flights.push(fd);
      rest = bounceAway(flights, fd, TOP);
      winner = to;
      break;
    }
    if (ending === "long") {
      // over everything and down behind them
      const L = new Vector3(sTo * pick(HALF + 0.7, HALF + 1.3), BALL, from.z + pick(-0.4, 0.4));
      let T = Math.abs(L.x - from.x) / (speed * 1.1);
      let fl = flight(t, from, t + T, L);
      for (let i = 0; i < 12 && heightAt(fl, sTo * HALF) < TABLE.height + 0.08; i += 1) {
        T *= 1.06;
        fl = flight(t, from, t + T, L);
      }
      flights.push(fl);
      rest = bounceAway(flights, fl, BALL);
      winner = to;
      break;
    }

    // over the net to a bounce on their side, then up to where they take it
    const bounce = n === 0
      ? new Vector3(sTo * pick(0.5, 1.0), TOP, from.z * 0.4 + pick(-0.35, 0.35))
      : new Vector3(sTo * pick(0.4, 1.15), TOP, from.z * 0.35 + pick(-0.45, 0.45));
    const R = rightOf(to);
    const wide = ending === "winner";
    const lateral = wide ? (random() < 0.5 ? -1 : 1) * pick(0.95, 1.1) : pick(-0.6, 0.6);
    const Q = new Vector3(sTo * pick(HALF + 0.12, HALF + 0.32), pick(0.9, 1.04), lateral);
    let pace = speed;
    let fo = over(t, from, bounce, pace);
    let slow = pick(0.78, 0.88);
    let T2 = Math.abs(Q.x - bounce.x) / (pace * slow);
    if (fo.t1 - t + T2 < PASS && !wide) {
      pace *= (fo.t1 - t + T2) / PASS;
      fo = over(t, from, bounce, pace);
      T2 = Math.abs(Q.x - bounce.x) / (pace * slow);
      slow = 0;
    }
    flights.push(fo);
    const tb = fo.t1;
    const fq = flight(tb, bounce, tb + T2, Q);
    if (wide) {
      // past them: on along the same arc to the ground, and they go for it,
      // late, and swing at where it was
      const vx = (Q.x - bounce.x) / T2;
      const vz = (Q.z - bounce.z) / T2;
      const vyQ = fq.vy - G * T2;
      const drop = (vyQ + Math.sqrt(vyQ * vyQ + 2 * G * (Q.y - BALL))) / G;
      const L = new Vector3(Q.x + vx * drop, BALL, Q.z + vz * drop);
      const fl = flight(tb, bounce, tb + T2 + drop, L);
      flights.push(fl);
      const kind: Kind = Q.z * R.z > 0 ? "fh" : "bh";
      const reachFor = Q.clone().setZ(Q.z - Math.sign(Q.z) * 0.34);
      const body = stance(to, kind, reachFor).lerp(stance(to, "fh", Q.clone().setZ(0)), 0.35);
      shots.push({ who: to, kind, t: fq.t1, at: reachFor, body, miss: true });
      rest = bounceAway(flights, fl, BALL);
      winner = hitter;
      break;
    }
    flights.push(fq);
    const kind: Kind = random() < 0.62 ? "fh" : "bh";
    shots.push({ who: to, kind, t: fq.t1, at: Q, body: stance(to, kind, Q) });
    hitter = to;
    from = Q;
    t = fq.t1;
    speed = kind === "fh" ? pick(4.6, 6.4) : pick(3.8, 5.2);
  }
  const end = (rest?.t ?? t) + pick(1.1, 1.5);
  return { start, end, server, toss, shots, flights, winner, rest: rest ?? { t, at: from } };
}

function ballAt(point: Point, t: number, out: Vector3) {
  for (const f of point.flights) {
    if (t > f.t1) continue;
    if (t < f.t0) return false;
    const u = (t - f.t0) / (f.t1 - f.t0);
    out.lerpVectors(f.a, f.b, (f as Flight & { roll?: boolean }).roll ? 1 - (1 - u) * (1 - u) : u);
    if (!(f as Flight & { roll?: boolean }).roll) {
      const s = t - f.t0;
      out.y = f.a.y + f.vy * s - 0.5 * G * s * s;
    }
    return true;
  }
  out.copy(point.rest.at);
  return true;
}

// —— the strokes, as keys a stroke's hand and trunk pass through, timed from
// contact. The hand is in the frame of the hips: out to the right, up, and
// forward. The forehand turns the chest back to the right, drops the hand
// behind the hip, and swings up and across through the ball to finish by the
// forehead; the backhand starts in front of the belly with the elbow out and
// flicks forward from the forearm; the serve tosses and strikes it low.

type Key = { t: number; hand: [number, number, number]; twist: number; shift: number; dip: number };
const READY: Omit<Key, "t"> = { hand: [0.2, 0.93, 0.3], twist: 0, shift: 0, dip: 0 };
const STROKES: Record<Kind, Array<Key | { t: 0; contact: true; twist: number; shift: number; dip: number }>> = {
  fh: [
    { t: -0.62, ...READY },
    { t: -0.38, hand: [0.4, 0.86, 0.12], twist: 0.28, shift: 0.03, dip: 0.02 },
    { t: -0.17, hand: [0.6, 0.79, -0.08], twist: 0.62, shift: 0.07, dip: 0.04 },
    { t: 0, contact: true, twist: 0.1, shift: 0.01, dip: 0.01 },
    { t: 0.1, hand: [0.14, 1.3, 0.42], twist: -0.34, shift: -0.05, dip: -0.02 },
    { t: 0.22, hand: [-0.02, 1.4, 0.3], twist: -0.44, shift: -0.06, dip: -0.01 },
    { t: 0.55, ...READY },
  ],
  bh: [
    { t: -0.56, ...READY },
    { t: -0.3, hand: [0.03, 0.88, 0.26], twist: -0.12, shift: -0.02, dip: 0.02 },
    { t: -0.13, hand: [-0.1, 0.86, 0.18], twist: -0.26, shift: -0.03, dip: 0.03 },
    { t: 0, contact: true, twist: -0.02, shift: 0, dip: 0.01 },
    { t: 0.1, hand: [0.3, 1.08, 0.55], twist: 0.12, shift: 0.02, dip: -0.01 },
    { t: 0.46, ...READY },
  ],
  serve: [
    { t: -1.5, hand: [0.24, 0.9, 0.22], twist: 0.05, shift: 0, dip: -0.02 },
    { t: -0.85, hand: [0.42, 0.86, 0.06], twist: 0.32, shift: 0.03, dip: 0.02 },
    { t: -0.55, hand: [0.46, 0.85, 0.02], twist: 0.38, shift: 0.04, dip: 0.03 },
    { t: -0.16, hand: [0.54, 0.83, -0.02], twist: 0.5, shift: 0.05, dip: 0.05 },
    { t: 0, contact: true, twist: 0.18, shift: 0.02, dip: 0.03 },
    { t: 0.13, hand: [0.12, 1.02, 0.46], twist: -0.12, shift: -0.02, dip: 0 },
    { t: 0.5, ...READY },
  ],
};

/** Eases through values at times without overshooting (monotone cubic). */
function through(times: number[], values: number[], t: number) {
  const n = times.length;
  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let i = 0;
  while (t > times[i + 1]) i += 1;
  const slope = (j: number) => (values[j + 1] - values[j]) / (times[j + 1] - times[j]);
  const tangent = (j: number) => {
    if (j === 0 || j === n - 1) return 0;
    const a = slope(j - 1);
    const b = slope(j);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const h = times[i + 1] - times[i];
  const s = (t - times[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h * tangent(i) + (-2 * s3 + 3 * s2) * values[i + 1] + (s3 - s2) * h * tangent(i + 1);
}

// —— the scoreboard: two numbers on a dark face, the far player's in white

const GLYPHS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

function scoreboard() {
  const canvas = document.createElement("canvas");
  canvas.width = 34;
  canvas.height = 11;
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  const number = (g: CanvasRenderingContext2D, value: number, centre: number, colour: string) => {
    const text = String(value);
    const width = text.length * 4 - 1;
    g.fillStyle = colour;
    [...text].forEach((ch, i) => {
      GLYPHS[ch]?.forEach((row, y) => [...row].forEach((c, x) => c === "#" && g.fillRect(Math.round(centre - width / 2) + i * 4 + x, 3 + y, 1, 1)));
    });
  };
  const draw = (a: number, b: number, serving: 0 | 1) => {
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#151b26";
    g.fillRect(0, 0, 34, 11);
    g.fillStyle = "#2a3446";
    g.fillRect(16, 2, 2, 7);
    number(g, a, 8, "#f4f6fb");
    number(g, b, 26, "#ff8a2a");
    // who's serving: a dot by their number
    g.fillStyle = serving === 0 ? "#f4f6fb" : "#ff8a2a";
    g.fillRect(serving === 0 ? 1 : 32, 5, 1, 1);
    texture.needsUpdate = true;
  };
  draw(0, 0, 0);
  return { texture, draw };
}

// —— the place

export function rallyTable(): Place {
  const group = new Group();
  const pad = PADS.rally;
  const base = ground(pad.s, pad.t);
  base.y = padHeight("rally");
  // everything at the table stands on the terrace's top
  const local = new Group();
  local.position.copy(base).add(new Vector3(0, V * 0.25, 0));
  group.add(local);

  const terrace = new Voxels(V, 0.04);
  const hx = Math.round(pad.hx / V), hz = Math.round(pad.hz / V);
  terrace.box(-hx, 0, -hz, hx, 0, hz, (x, y, z) =>
    (x + 1000) % 6 === 0 || (z + 1000) % 6 === 0 ? 0xc6bdaa : hash3(x, y, z) > 0.9 ? 0xcfc7b6 : 0xddd6c6);
  const slab = mesh(terrace, materials.solid, { shadow: false });
  slab.position.set(base.x, base.y - V * 0.75, base.z);
  group.add(slab);

  // the table, to size: Rally's blue, white lines, a net with a white tape
  const T = 0.05;
  const lx = Math.round(TABLE.length / 2 / T), lz = Math.round(TABLE.width / 2 / T);
  const ty = Math.round(TABLE.height / T) - 1;
  const table = new Voxels(T, 0.025);
  table.box(-lx, ty, -lz, lx - 1, ty, lz - 1, (x, y, z) => (x === -lx || x === lx - 1 || z === -lz || z === lz - 1 || z === -1 ? 0xf3f5fa : 0x2f6fe4));
  table.box(-lx + 1, ty - 1, -lz + 1, lx - 2, ty - 1, lz - 2, (x, y, z) => (Math.abs(x + 0.5) > lx - 3 || Math.abs(z + 0.5) > lz - 3 ? 0x24314a : null));
  for (const x of [-lx + 4, lx - 5]) for (const z of [-lz + 3, lz - 4]) table.box(x, 1, z, x, ty - 1, z, 0x1d2430);
  for (const x of [-lx + 4, lx - 5]) table.box(x, 3, -lz + 3, x, 3, lz - 4, 0x1d2430);
  for (const x of [-lx + 4, lx - 5]) for (const z of [-lz + 3, lz - 4]) table.set(x, 0, z, 0x3a3f4a);
  const tableMesh = mesh(table);
  tableMesh.position.set(0, 0, 0);
  local.add(tableMesh);
  const net = new Voxels(T, 0.02);
  const ny = Math.round(TABLE.net / T);
  net.box(0, ty + 1, -lz - 3, 0, ty + ny, lz + 2, (x, y, z) => (z < -lz || z >= lz ? (y === ty + ny ? 0x9aa4ae : 0x5d6573) : y === ty + ny ? 0xf3f5fa : (y + z) % 2 ? 0x2a2f3a : 0x3a404c));
  const netMesh = mesh(net);
  netMesh.position.set(-T / 2, 0, 0);
  local.add(netMesh);

  // the two of them
  const people = LOOKS.map((look) => {
    const f = figure(look);
    local.add(f.root);
    return f;
  });

  const ballV = new Voxels(0.05, 0);
  ballV.set(0, 0, 0, 0xff8a2a);
  const ball = mesh(ballV, materials.glow, { shadow: true });
  ball.geometry.translate(-0.025, -0.025, -0.025);
  local.add(ball);

  const board = new Group();
  const boardPost = new Voxels(V, 0.03);
  boardPost.box(0, 0, 0, 0, 6, 0, 0x30384a);
  board.add(mesh(boardPost));
  const { texture, draw } = scoreboard();
  const face = new Mesh(new PlaneGeometry(1.5, 0.48), new MeshBasicMaterial({ map: texture }));
  face.position.set(0.1, 1.55, 0.12);
  board.add(face);
  board.position.set(base.x + 0.4, base.y, base.z - pad.hz + 0.5);
  group.add(board);

  // —— the match: points made a little ahead of the clock, each with the
  // score before and after it, serve changing every two points (every point
  // from ten-all), a game to eleven by two
  const random = rng(1107);
  type Played = Point & { before: [number, number]; after: [number, number] };
  const points: Played[] = [];
  let tally: [number, number] = [0, 0];
  let first: 0 | 1 = 0;
  const serverOf = ([a, b]: [number, number]) => {
    const total = a + b;
    return ((first + (total >= 20 ? total : Math.floor(total / 2))) % 2) as 0 | 1;
  };
  const next = (start: number) => {
    const point = makePoint(start, serverOf(tally), random);
    const before: [number, number] = [...tally];
    tally[point.winner] += 1;
    const after: [number, number] = [...tally];
    let gap = 0.3;
    if (Math.max(...tally) >= 11 && Math.abs(tally[0] - tally[1]) >= 2) {
      tally = [0, 0];
      first = (1 - first) as 0 | 1;
      gap = 2.6;
    }
    points.push({ ...point, before, after });
    return point.end + gap;
  };
  let following = next(0.4);
  let shown = "";

  // per person: where each foot is planted, and the step it's taking
  const feet = people.map(() => ({ at: [new Vector3(), new Vector3()], from: [new Vector3(), new Vector3()], to: [new Vector3(), new Vector3()], step: [-1, -1], ready: false }));

  const ballNow = new Vector3();
  const knee = new Vector3();
  const ankle = new Vector3();
  const elbow = new Vector3();
  const wrist = new Vector3();
  const turned = (F: Vector3, R: Vector3, a: number) => F.clone().multiplyScalar(Math.cos(a)).addScaledVector(R, Math.sin(a));

  // —— one person at one moment
  const pose = (who: 0 | 1, point: Played, t: number, dt: number) => {
    const f = people[who];
    const k = f.k;
    const F = forward(who);
    const R = rightOf(who);
    const sv = side(who);
    const mine = point.shots.filter((s) => s.who === who);
    const theirs = point.shots.filter((s) => s.who !== who);
    const serve = point.shots[0];
    const serving = point.server === who;
    const home = new Vector3(sv * (HALF + 0.52), 0, sv * 0.1);
    const done = point.rest.t;

    // —— where to stand: from one stroke's spot to the next, off as soon as
    // they've hit and there before the swing starts; still until the serve,
    // and back to the end of the table once the point is over
    const spots: Array<{ t: number; at: Vector3; late?: boolean }> = [{ t: point.start, at: home }];
    if (serving) spots.push({ t: point.start + 1.0, at: serve.body }, { t: serve.t, at: serve.body });
    else spots.push({ t: serve.t, at: home });
    for (const s of mine) if (s.kind !== "serve") spots.push({ t: s.t, at: s.body, late: s.miss });
    const lastAt = spots[spots.length - 1];
    spots.push({ t: Math.max(done, lastAt.t + 0.2), at: lastAt.at }, { t: Math.max(done, lastAt.t + 0.2) + 1.2, at: home });
    let body = spots[0].at.clone();
    for (let i = 1; i < spots.length; i += 1) {
      const a = spots[i - 1];
      const b = spots[i];
      const from = a.t + 0.14;
      const to = b.late ? b.t + 0.05 : b.t - 0.24;
      if (t <= from) break;
      body = a.at.clone().lerp(b.at, smooth((t - from) / Math.max(0.12, to - from)));
      if (t < to) break;
    }

    // —— the stroke: the one coming, or the one just played, as keys
    let key: Omit<Key, "t"> = READY;
    for (const s of mine) {
      const u = t - s.t;
      const rows = STROKES[s.kind];
      if (u < rows[0].t || u > rows[rows.length - 1].t) continue;
      // the hand meets the ball with the middle of the phone
      const meet = s.at.clone().addScaledVector(R, s.kind === "bh" ? 0.06 : -0.08).addScaledVector(F, -0.06);
      const d = meet.clone().sub(s.body);
      const contact: [number, number, number] = [d.dot(R), meet.y, d.dot(F)];
      const keys = rows.map((row) => ("contact" in row ? { t: row.t, hand: contact, twist: row.twist, shift: row.shift, dip: row.dip } : row));
      const times = keys.map((row) => row.t);
      key = {
        hand: [0, 1, 2].map((c) => through(times, keys.map((row) => row.hand[c]), u)) as [number, number, number],
        twist: through(times, keys.map((row) => row.twist), u),
        shift: through(times, keys.map((row) => row.shift), u),
        dip: through(times, keys.map((row) => row.dip), u),
      };
    }
    const backhand = mine.some((s) => s.kind === "bh" && Math.abs(t - s.t) < 0.5);

    // —— how low: crouched and bouncing on the balls of the feet through a
    // point, a split step as the other one hits, upright between points
    const live = t > point.start + (serving ? 0.9 : 1.6) && t < done + 0.3;
    let crouch = live ? 0.12 : 0.03;
    crouch += live ? Math.sin(t * 9.5 + who * 2) * 0.006 : Math.sin(t * 1.7 + who * 2) * 0.004;
    for (const s of theirs) {
      const u = t - s.t + 0.06;
      if (u > -0.12 && u < 0.3) crouch += 0.045 * Math.sin(Math.PI * clamp01((u + 0.12) / 0.42)) * (u < 0 ? -0.4 : 1);
    }
    crouch = crouch * k + key.dip;
    const lean = live ? 0.3 + key.dip * 1.5 : 0.08;

    // —— the feet: planted until the body has moved off them, then a quick
    // step, the one on the side it's going to first
    const state = feet[who];
    const stanceW = live ? 0.31 : 0.15;
    const want = [body.clone().addScaledVector(R, -stanceW * k).addScaledVector(F, live ? 0.04 : 0), body.clone().addScaledVector(R, stanceW * k)];
    // in a forehand the right foot drops back as the chest turns
    want[1].addScaledVector(F, -0.1 * clamp01(key.twist / 0.6));
    if (!state.ready || dt > 0.25) {
      for (const i of [0, 1]) state.at[i].copy(want[i]);
      state.step = [-1, -1];
      state.ready = true;
    }
    for (const i of [0, 1]) {
      if (state.step[i] < 0) continue;
      state.step[i] += dt / 0.15;
      state.to[i].copy(want[i]);
      if (state.step[i] >= 1) {
        state.at[i].copy(state.to[i]);
        state.step[i] = -1;
      } else state.at[i].lerpVectors(state.from[i], state.to[i], smooth(state.step[i]));
    }
    if (state.step[0] < 0 && state.step[1] < 0) {
      const off = [state.at[0].distanceTo(want[0]), state.at[1].distanceTo(want[1])];
      const which = off[0] > off[1] ? 0 : 1;
      if (off[which] > 0.09) {
        state.step[which] = 0;
        state.from[which].copy(state.at[which]);
        state.to[which].copy(want[which]);
      }
    }

    // —— the skeleton: hips over the feet, the chest turned into the stroke
    const hip = (BODY.thigh + BODY.shin + BODY.ankle) * k;
    const pelvisAt = body.clone().addScaledVector(R, key.shift).setY(hip - crouch);
    const Fp = turned(F, R, key.twist * 0.3);
    const Rp = turned(R, F, -key.twist * 0.3);
    const Fc = turned(F, R, key.twist);
    const Rc = turned(R, F, -key.twist);
    const spineUp = UP.clone().multiplyScalar(Math.cos(lean)).addScaledVector(Fc, Math.sin(lean));
    orient(f.pelvis, pelvisAt, UP.clone().lerp(spineUp, 0.4), Fp);
    f.pelvis.scale.setScalar(k);
    orient(f.torso, pelvisAt.clone().addScaledVector(spineUp, 0.04 * k), spineUp, Fc);
    f.torso.scale.set(k, ((BODY.spine - 0.04) * k) / 0.48, k);
    const neck = pelvisAt.clone().addScaledVector(spineUp, BODY.spine * k);

    for (const i of [0, 1]) {
      const sideSign = i === 0 ? -1 : 1;
      const hipAt = pelvisAt.clone().addScaledVector(Rp, sideSign * BODY.hipW * k);
      const lift = state.step[i] >= 0 ? Math.sin(Math.PI * state.step[i]) * 0.06 : 0;
      reach(hipAt, state.at[i].clone().setY(BODY.ankle * k + lift), BODY.thigh * k, BODY.shin * k, Fp.clone().addScaledVector(Rp, sideSign * 0.25), knee, ankle);
      orient(f.thigh[i], hipAt, hipAt.clone().sub(knee), Fp);
      f.thigh[i].scale.set(k, (BODY.thigh * k) / 0.4, k);
      orient(f.shin[i], knee, knee.clone().sub(ankle), Fp);
      f.shin[i].scale.set(k, (BODY.shin * k) / 0.4, k);
      // toes out a little, and round with the hips
      orient(f.foot[i], ankle, UP, turned(F, R, sideSign * 0.3 + key.twist * 0.15));
      f.foot[i].scale.setScalar(k);
    }

    // arms: the right swings the phone, the left is out in front for
    // balance and turns with the chest; serving, it holds the ball up on
    // the open palm and tosses it
    const strokeHand = body.clone().addScaledVector(R, key.hand[0]).addScaledVector(F, key.hand[2]).setY(key.hand[1]);
    const elbowPole = backhand
      ? Rc.clone().multiplyScalar(0.6).addScaledVector(Fc, 0.6).addScaledVector(UP, -0.2)
      : Rc.clone().multiplyScalar(0.55).addScaledVector(UP, -0.7).addScaledVector(Fc, -0.25);
    const freeHand = neck.clone().addScaledVector(Rc, -0.27 * k).addScaledVector(UP, -0.52 * k).addScaledVector(Fc, 0.26 * k);
    if (serving) {
      const u = t - serve.t;
      const held = clamp01((u + 1.45) / 0.4) * (1 - clamp01((u - 0.05) / 0.35));
      const tossUp = Math.sin(Math.PI * clamp01((u + 0.6) / 0.3)) * 0.07;
      freeHand.lerp(palmOf(who, serve.body).add(new Vector3(0, tossUp, 0)), held);
    }
    const freePole = Rc.clone().multiplyScalar(-0.6).addScaledVector(UP, -0.6).addScaledVector(Fc, -0.2);
    for (const i of [0, 1]) {
      const shoulder = neck.clone().addScaledVector(spineUp, -BODY.drop * k).addScaledVector(Rc, (i === 0 ? -1 : 1) * BODY.shoulderW * k);
      reach(shoulder, i === 1 ? strokeHand : freeHand, BODY.upper * k, BODY.fore * k, i === 1 ? elbowPole : freePole, elbow, wrist);
      orient(f.upper[i], shoulder, shoulder.clone().sub(elbow), Fc);
      f.upper[i].scale.set(k, (BODY.upper * k) / 0.32, k);
      orient(f.fore[i], elbow, elbow.clone().sub(wrist), Fc);
      f.fore[i].scale.set(k, ((BODY.fore + BODY.hand) * k) / 0.32, k);
      if (i === 1) {
        // the phone sticks out of the hand like a bat's blade, face to the ball
        const along = wrist.clone().sub(elbow).normalize();
        const blade = along.clone().addScaledVector(UP, 0.35).addScaledVector(Rc, backhand ? -0.2 : 0.2).normalize();
        orient(f.phone, wrist.clone().addScaledVector(along, 0.04 * k), blade.negate(), Fc.clone().addScaledVector(UP, -0.2));
      }
    }

    // the head turns to the ball, and drops to look down at it
    const look = live && ball.visible ? ballNow.clone().sub(neck).normalize() : Fc.clone();
    look.y = Math.max(-0.6, Math.min(0.35, look.y));
    const front = Fc.clone().lerp(look, 0.8).normalize();
    orient(f.head, neck, UP.clone().addScaledVector(front, -front.y), front);
    f.head.scale.setScalar(k);
  };

  let lastT = 0;
  return {
    object: group,
    spot: { id: "rally", slug: "rally", object: group, anchor: base.clone().add(new Vector3(0, 2.6, 0)), focus: base.clone().add(new Vector3(0, 0.6, 0)) },
    update: (time) => {
      const dt = Math.min(0.5, Math.max(0, time - lastT));
      lastT = time;
      while (following < time + 1) following = next(following);
      while (points.length > 2 && points[0].end < time - 1) points.shift();
      const i = Math.max(0, points.findIndex((p) => time < p.end));
      const point = points[i];

      // the board: the score as it stands, the last one held between games
      const score = i > 0 && time < point.start ? points[i - 1].after : time >= point.end ? point.after : point.before;
      const label = `${score[0]}-${score[1]}-${point.server}`;
      if (label !== shown) {
        shown = label;
        draw(score[0], score[1], point.server);
      }

      // the ball: up on the server's palm, in the air, or lying where it
      // stopped, a moment, before the next one comes out of a pocket
      const flying = ballAt(point, time, ballNow);
      ball.visible = time >= point.start + 0.9 && time < point.rest.t + 1 && (flying || time < point.toss);
      if (time < point.toss) ballNow.copy(palmOf(point.server, point.shots[0].body)).setY(0.97 + BALL);
      ball.position.copy(ballNow);
      for (const who of [0, 1] as const) pose(who, point, time, dt);
    },
  };
}
