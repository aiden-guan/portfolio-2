import { InstancedMesh, Matrix4, Quaternion, Scene, Vector3, type Mesh } from "three";
import { Voxels } from "../../scene/voxels";
import { DogMotion, Motion, Spring, traitOf } from "./motion";
import { animate, animateDog, dog, LOOKS, person, type Look, type Pose, type Rig } from "./people";
import { disposeAll, outdoorFloor, softSolid, type Collider, type Room, type Spot } from "./rooms/common";

// A room, played: Aiden walking (or, with Shift, running) wherever the keys
// or a click on the floor say, Phoebe close behind when she's there, and the
// other people in the room standing, sitting, wandering, watching Aiden or
// walking alongside, all of them looking at whoever's talking. Speeds are a
// person's: a brisk walk for legs Aiden's length is 1.8 m/s, a run 3.7.

const RADIUS = 0.26;
const CELL = 0.2;
const WALK = 1.8;
const RUN = 3.7;
const SICK = 1.05;
const ACCEL = 7.5;
const ACCEL_RUN = 9;
const BRAKE = 11;
const G = 9.81;
/** A click further than this away is run to, not walked. */
const FAR = 4.5;

export type Behaviour = "idle" | "watch" | "wander" | "follow";

export type ActorSpec = {
  id: string;
  look: Look;
  at: Vector3;
  heading?: number;
  /** When set, he or she can be talked to, as this. */
  label?: string;
  reach?: number;
  pose?: Pose;
  /** Seat height, for sitting. */
  seat?: number;
  behaviour?: Behaviour;
  /** Which side of Aiden to walk on, for followers: +1 right, −1 left. */
  side?: number;
  area?: { x0: number; x1: number; z0: number; z1: number };
  /** Gets in the way of walking. */
  solid?: boolean;
  seed?: number;
};

type Actor = {
  spec: ActorSpec;
  rig: Rig;
  motion: Motion;
  pos: Vector3;
  heading: number;
  turn: Spring;
  /** Speed over the ground, the way it's headed, and how fast that's turning, eased. */
  speed: number;
  course: number;
  swing: number;
  /** Its own comfortable walk (m/s), for its legs; and whether this walk is a run. */
  pace: number;
  running: boolean;
  pose: Pose;
  poseUntil: number;
  phase: number;
  path: Vector3[];
  arrive: (() => void) | null;
  face: Vector3 | null;
  next: number;
  offset: number;
  y: Spring;
  visible: boolean;
  behaviour: Behaviour;
  spot: Spot;
  collider: Collider;
  /** A glance at Aiden while walking alongside him. */
  glanceAt: number;
  /** A heading to turn to, standing (to face whoever's talking). */
  turnTo: number | null;
};

/** Which way the player is pushing (screen axes, -1 to 1), and whether Shift is held to run. */
export type Intent = { x: number; y: number; run?: boolean };

const wrap = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  return (a < 0 ? a + Math.PI * 2 : a) - Math.PI;
};
const approach = (current: number, target: number, k: number, dt: number) => current + (target - current) * (1 - Math.exp(-k * dt));

/** A walking speed that suits a pair of legs: Froude 0.36, a comfortable stroll. */
const strollFor = (rig: Rig) => Math.sqrt(0.36 * G * 0.7 * rig.scale);

function blockedAt(x: number, z: number, room: Room, radius: number) {
  const b = room.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return true;
  return room.colliders.some((c) => x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius);
}

function pushOut(p: Vector3, radius: number, list: readonly Collider[], count = list.length) {
  for (let i = 0; i < count; i += 1) {
    const c = list[i];
    const x0 = c.x0 - radius, x1 = c.x1 + radius, z0 = c.z0 - radius, z1 = c.z1 + radius;
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
    const a = p.x - x0, b = x1 - p.x, d = p.z - z0, e = z1 - p.z;
    const least = Math.min(a, b, d, e);
    if (least === a) p.x = x0;
    else if (least === b) p.x = x1;
    else if (least === d) p.z = z0;
    else p.z = z1;
  }
}

function push(p: Vector3, radius: number, room: Room, extra?: readonly Collider[], extraCount = 0) {
  pushOut(p, radius, room.colliders);
  if (extra) pushOut(p, radius, extra, extraCount);
  const b = room.bounds;
  p.x = Math.max(b.x0, Math.min(b.x1, p.x));
  p.z = Math.max(b.z0, Math.min(b.z1, p.z));
}

// A* over a fifth-of-a-metre grid laid over the room, then straightened
// wherever the way is clear.
function route(from: Vector3, to: Vector3, room: Room): Vector3[] {
  const b = room.bounds;
  const cols = Math.max(1, Math.round((b.x1 - b.x0) / CELL) + 1);
  const rows = Math.max(1, Math.round((b.z1 - b.z0) / CELL) + 1);
  const cx = (x: number) => Math.max(0, Math.min(cols - 1, Math.round((x - b.x0) / CELL)));
  const cz = (z: number) => Math.max(0, Math.min(rows - 1, Math.round((z - b.z0) / CELL)));
  const wx = (c: number) => b.x0 + c * CELL;
  const wz = (r: number) => b.z0 + r * CELL;
  const free = (c: number, r: number) => !blockedAt(wx(c), wz(r), room, RADIUS * 0.9);
  // the nearest free cell to one that isn't (somebody standing in a chair's shadow)
  const nearestFree = (cell: [number, number]): [number, number] | null => {
    if (free(cell[0], cell[1])) return cell;
    let best: [number, number] | null = null, bestD = Infinity;
    for (let dx = -6; dx <= 6; dx += 1)
      for (let dz = -6; dz <= 6; dz += 1) {
        const c = cell[0] + dx, r = cell[1] + dz;
        if (c < 0 || r < 0 || c >= cols || r >= rows || !free(c, r)) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = [c, r];
        }
      }
    return best;
  };
  const start = nearestFree([cx(from.x), cz(from.z)]);
  const goal = nearestFree([cx(to.x), cz(to.z)]);
  if (!start || !goal) return [];
  const key = (c: number, r: number) => r * cols + c;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  // a binary heap of [f, key]
  const heap: Array<[number, number]> = [];
  const pushHeap = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const popHeap = () => {
    const top = heap[0];
    const end = heap.pop()!;
    if (heap.length) {
      heap[0] = end;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const h = (c: number, r: number) => Math.hypot(c - goal[0], r - goal[1]);
  const sk = key(start[0], start[1]);
  const gk = key(goal[0], goal[1]);
  g[sk] = 0;
  pushHeap([h(start[0], start[1]), sk]);
  let found = false;
  while (heap.length) {
    const [, k] = popHeap();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === gk) {
      found = true;
      break;
    }
    const c = k % cols, r = Math.floor(k / cols);
    for (let dx = -1; dx <= 1; dx += 1)
      for (let dz = -1; dz <= 1; dz += 1) {
        if (!dx && !dz) continue;
        const nc = c + dx, nr = r + dz;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || !free(nc, nr)) continue;
        if (dx && dz && (!free(c + dx, r) || !free(c, r + dz))) continue;
        const nk = key(nc, nr);
        const t = g[k] + (dx && dz ? Math.SQRT2 : 1);
        if (t < g[nk]) {
          g[nk] = t;
          came[nk] = k;
          pushHeap([t + h(nc, nr), nk]);
        }
      }
  }
  if (!found) return [];
  const cells: Vector3[] = [];
  for (let k = gk; k !== sk && k >= 0; k = came[k]) cells.unshift(new Vector3(wx(k % cols), 0, wz(Math.floor(k / cols))));
  const clear = (a: Vector3, z: Vector3) => {
    const steps = Math.ceil(a.distanceTo(z) / 0.08);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (blockedAt(a.x + (z.x - a.x) * t, a.z + (z.z - a.z) * t, room, RADIUS * 0.9)) return false;
    }
    return true;
  };
  const path: Vector3[] = [];
  let anchor = from.clone();
  for (let i = 0; i < cells.length; i += 1) {
    if (i === cells.length - 1 || !clear(anchor, cells[i + 1])) {
      path.push(cells[i]);
      anchor = cells[i];
    }
  }
  return path;
}

/** How far is left along a path, from a point. */
function pathLeft(from: Vector3, path: Vector3[]) {
  let total = 0;
  let x = from.x, z = from.z;
  for (const p of path) {
    total += Math.hypot(p.x - x, p.z - z);
    x = p.x;
    z = p.z;
  }
  return total;
}

/** Turns a direction of travel toward a goal at a limited rate, the way a body can (rad/s). */
const steer = (course: number, goal: number, rate: number, dt: number) => {
  const d = wrap(goal - course);
  const most = rate * dt;
  return course + Math.max(-most, Math.min(most, d));
};

// —— dust, kicked up by running feet outdoors: a few specks that spread and shrink

const SPECKS = 30;
type Speck = { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; size: number };

function dust(scene: Scene) {
  const v = new Voxels(0.07, 0);
  v.set(0, 0, 0, 0xe8dcc6);
  const geometry = v.geometry(3);
  geometry.translate(-0.035, -0.035, -0.035);
  const mesh = new InstancedMesh(geometry, softSolid, SPECKS);
  mesh.count = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const specks: Speck[] = [];
  const free: Speck[] = Array.from({ length: SPECKS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, size: 1 }));
  const m = new Matrix4();
  const q = new Quaternion();
  const at = new Vector3();
  const size = new Vector3();
  return {
    /** A puff at a foot, thrown back against the way it's going. */
    puff: (x: number, y: number, z: number, backX: number, backZ: number, hard: number) => {
      const n = hard > 0.8 ? 3 : 2;
      for (let i = 0; i < n && free.length; i += 1) {
        const s = free.pop()!;
        const a = (i / n) * Math.PI * 2 + Math.random() * 1.2;
        s.x = x + Math.cos(a) * 0.05;
        s.y = y + 0.03;
        s.z = z + Math.sin(a) * 0.05;
        s.vx = backX * 0.6 * hard + Math.cos(a) * 0.35;
        s.vz = backZ * 0.6 * hard + Math.sin(a) * 0.35;
        s.vy = 0.35 + Math.random() * 0.25;
        s.t = 0;
        s.life = 0.38 + Math.random() * 0.18;
        s.size = 0.7 + Math.random() * 0.5 * hard;
        specks.push(s);
      }
    },
    update: (dt: number) => {
      let n = 0;
      for (let i = specks.length - 1; i >= 0; i -= 1) {
        const s = specks[i];
        s.t += dt;
        if (s.t >= s.life) {
          specks.splice(i, 1);
          free.push(s);
          continue;
        }
        const drag = Math.exp(-dt * 6);
        s.vx *= drag;
        s.vz *= drag;
        s.vy = s.vy * drag - dt * 0.4;
        s.x += s.vx * dt;
        s.y = Math.max(0.01, s.y + s.vy * dt);
        s.z += s.vz * dt;
        const k = s.size * (1 - s.t / s.life) ** 1.4 * (0.8 + Math.min(1, s.t * 8) * 0.4);
        m.compose(at.set(s.x, s.y, s.z), q, size.set(k, k, k));
        mesh.setMatrixAt(n, m);
        n += 1;
      }
      mesh.count = n;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
    },
  };
}

export function createStage(
  room: Room,
  options: { lying?: boolean; dog?: "bed" | "follow" | false; actors?: ActorSpec[]; hero?: Look; at?: Vector3; heading?: number } = {},
) {
  const scene = new Scene();
  scene.add(room.group);
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const calm = (m: Motion) => {
    // reduced motion: the fidgets go; breath, blinks and looks stay
    if (reduced) m.trait.restless = Math.min(m.trait.restless, 0.12);
    return m;
  };
  let aiden = person(options.hero ?? LOOKS.aiden, 1);
  scene.add(aiden.root);
  // a room with a bed can say where in it Aiden lies, and where to stand up
  const bedroom = room as Room & { bed?: Vector3; dogBed?: Vector3; lie?: Vector3; rise?: Vector3 };
  const lieAt = () => bedroom.lie ?? new Vector3(bedroom.bed!.x, 0.62, -1.95);
  const riseAt = () => bedroom.rise ?? room.spawn;

  const floorAt = (x: number, z: number) => room.floorAt?.(x, z) ?? 0;
  // dust only where there's dirt to kick up
  let outdoors = false;
  room.group.traverse((o) => {
    if ((o as Mesh).isMesh && (o as Mesh).material === outdoorFloor) outdoors = true;
  });
  const specks = dust(scene);
  let stepSound: (() => void) | null = null;

  const me = {
    y: new Spring(0),
    pos: (options.at ?? room.spawn).clone().setY(0),
    heading: new Spring(options.heading ?? room.heading),
    /** The way he's going and how fast, eased with a body's limits; and how fast that way is turning. */
    course: options.heading ?? room.heading,
    swing: 0,
    speed: 0,
    phase: 0,
    hop: 0,
    pose: "stand" as Pose,
    poseUntil: 0,
    /** Seat height while sitting (0: wherever the floor is). */
    seat: 0,
    /** A heading to turn to, standing (to face whoever's talking). */
    turnTo: null as number | null,
  };
  const motion = calm(new Motion(traitOf("aiden", 1), 1));
  motion.floor = floorAt;
  motion.onStep = (at, hard) => {
    stepSound?.();
    if (outdoors && hard > 0.55 && !reduced) specks.puff(at.x, at.y, at.z, -Math.sin(me.course), -Math.cos(me.course), hard);
  };
  let lying = Boolean(options.lying && bedroom.bed);
  let waking = -1;
  let path: Vector3[] = [];
  let arrive: (() => void) | null = null;
  let face: Vector3 | null = null;
  /** Whether this walk is a scripted one (never a run). */
  let scripted = false;
  const lookTarget = room.centre.clone();

  // —— Phoebe
  const phoebe = options.dog ? dog() : null;
  const pupMotion = new DogMotion();
  pupMotion.floor = floorAt;
  const pup = {
    pos: (bedroom.dogBed ?? room.spawn).clone(),
    y: new Spring((bedroom.dogBed ?? room.spawn).y),
    heading: new Spring(Math.PI * 0.25),
    course: Math.PI * 0.25,
    swing: 0,
    speed: 0,
    excited: 0.2,
    awake: options.dog === "follow",
    /** How long Aiden's been standing still, and how long he's been far off. */
    idle: 0,
    apart: 0,
    sniff: null as Vector3 | null,
    sniffFor: 0,
    sniffs: 0,
    /** How many smells a wait is worth: one, sometimes two. */
    curiosity: 1,
    /** Sitting, and how much longer she'll stay sat once he's walked off; how far off he got. */
    sitting: false,
    stay: 0,
    farthest: 0,
    glanceAt: 0,
    spot: { id: "phoebe", label: "Phoebe", at: new Vector3(), reach: 1.15 } as Spot,
  };
  if (phoebe) {
    scene.add(phoebe.root);
    if (pup.awake) {
      pup.pos.copy(me.pos).add(new Vector3(-0.8, 0, 0.6));
      pup.y.set(floorAt(pup.pos.x, pup.pos.z));
    }
    phoebe.root.position.copy(pup.pos);
    if (!pup.awake) pupMotion.mode = "lie";
  }

  const lyingPose = () => {
    aiden.root.position.copy(lieAt());
    aiden.root.rotation.set(-Math.PI / 2, 0, 0);
  };
  if (lying) lyingPose();
  me.y.set(floorAt(me.pos.x, me.pos.z));

  // —— everyone else (a map to find them, a list to go through them)
  const actors = new Map<string, Actor>();
  const cast: Actor[] = [];
  const addActor = (spec: ActorSpec) => {
    const seed = spec.seed ?? spec.id.length * 7 + 3;
    const rig = person(spec.look, seed);
    scene.add(rig.root);
    const m = calm(new Motion(traitOf(spec.id, seed), seed * 13 + 5));
    m.floor = floorAt;
    m.onStep = (at, hard) => {
      if (outdoors && hard > 0.55 && !reduced) specks.puff(at.x, at.y, at.z, -Math.sin(actor.course), -Math.cos(actor.course), hard * 0.8);
    };
    const heading = spec.heading ?? 0;
    const actor: Actor = {
      spec,
      rig,
      motion: m,
      pos: spec.at.clone(),
      heading,
      turn: new Spring(heading),
      speed: 0,
      course: heading,
      swing: 0,
      pace: strollFor(rig),
      running: false,
      pose: spec.pose ?? "stand",
      poseUntil: 0,
      phase: Math.random() * 6,
      path: [],
      arrive: null,
      face: null,
      next: Math.random() * 3,
      offset: (spec.seed ?? spec.id.length) * 1.37,
      y: new Spring(floorAt(spec.at.x, spec.at.z)),
      visible: true,
      behaviour: spec.behaviour ?? "idle",
      spot: { id: spec.id, label: spec.label ?? "", at: new Vector3(), reach: spec.reach ?? 1.25 },
      collider: { x0: 0, x1: 0, z0: 0, z1: 0 },
      glanceAt: Math.random() * 4,
      turnTo: null,
    };
    if (actor.pose === "sit" || actor.pose === "type") actor.y.set((spec.seat ?? 0.45) - 0.62 * rig.scale);
    actors.set(spec.id, actor);
    cast.push(actor);
    return actor;
  };
  for (const spec of options.actors ?? []) addActor(spec);

  const actorSpots = (): Spot[] =>
    [...cast]
      .filter((a) => a.visible && a.spec.label)
      .map((a) => ({ id: a.spec.id, label: a.spec.label!, at: a.pos.clone().setY(1.2), reach: a.spec.reach ?? 1.25 }));
  const allSpots = (): Spot[] => [
    ...room.spots,
    ...actorSpots(),
    ...(phoebe && pup.awake ? [{ id: "phoebe", label: "Phoebe", at: pup.pos.clone().setY(0.7), reach: 1.15 }] : []),
  ];

  // people in the way, without making a list every frame
  const blockers: Collider[] = [];
  let blocking = 0;
  const collectSolids = () => {
    blocking = 0;
    for (const a of cast) {
      if (!a.visible || a.spec.solid === false || a.pose === "sit") continue;
      const c = a.collider;
      c.x0 = a.pos.x - 0.18;
      c.x1 = a.pos.x + 0.18;
      c.z0 = a.pos.z - 0.18;
      c.z1 = a.pos.z + 0.18;
      blockers[blocking] = c;
      blocking += 1;
    }
  };

  const actorHandle = (id: string) => {
    const a = actors.get(id);
    if (!a) return null;
    return {
      get pos() {
        return a.pos;
      },
      rig: a.rig,
      /** Walks there (or runs, if asked); resolves on arrival. */
      walkTo: (point: Vector3, run = false) =>
        new Promise<void>((resolve) => {
          a.behaviour = a.behaviour === "follow" ? "follow" : "idle";
          a.path = route(a.pos, point.clone().setY(0), room);
          a.running = run;
          a.arrive = resolve;
          if (!a.path.length) {
            a.arrive = null;
            resolve();
          }
        }),
      place: (point: Vector3, heading?: number) => {
        a.pos.copy(point).setY(0);
        a.path = [];
        a.speed = 0;
        if (heading !== undefined) {
          a.heading = heading;
          a.turn.set(heading);
          a.course = heading;
        }
        a.motion.reset();
      },
      face: (point: Vector3 | null) => {
        a.face = point ? point.clone() : null;
      },
      pose: (pose: Pose, ms = 0) => {
        a.pose = pose;
        a.poseUntil = ms ? performance.now() + ms : 0;
      },
      behave: (behaviour: Behaviour, side?: number) => {
        a.behaviour = behaviour;
        if (side !== undefined) a.spec.side = side;
      },
      show: (on: boolean) => {
        if (on && !a.visible) a.motion.reset();
        a.visible = on;
        a.rig.root.visible = on;
      },
    };
  };

  // —— who's talking
  let speaker: string | null = null;
  let voiceLeft = 0;
  let lastOther: string | null = null;
  const talker = new Vector3();
  const listener = new Vector3();
  const scratch = new Vector3();
  /** The head of whoever has this id, into `out`; false if they aren't here. */
  const headOf = (id: string | null, out: Vector3) => {
    if (!id) return false;
    if (id === "aiden") {
      out.set(me.pos.x, aiden.root.position.y + 1.62 * aiden.scale, me.pos.z);
      return !lying;
    }
    if (id === "phoebe") {
      if (!phoebe || !pup.awake) return false;
      out.set(pup.pos.x, pup.y.x + 0.62, pup.pos.z);
      return true;
    }
    const a = actors.get(id);
    if (!a || !a.visible) return false;
    out.set(a.pos.x, a.rig.root.position.y + 1.62 * a.rig.scale, a.pos.z);
    return true;
  };

  // —— the camera: a small dead zone, a little look ahead, settling without a bounce
  const cam = { anchor: me.pos.clone(), ahead: new Vector3(), x: new Spring(lookTarget.x), z: new Spring(lookTarget.z) };
  const camWant = new Vector3();
  const DEAD = 0.35;

  // what's in reach, found without making anything every frame
  const pick = { best: null as Spot | null, d: Infinity, prefer: undefined as string | undefined };
  const consider = (spot: Spot, weight = 0) => {
    const d = Math.hypot(spot.at.x - me.pos.x, spot.at.z - me.pos.z);
    if (d > spot.reach) return false;
    if (spot.id === pick.prefer) {
      pick.best = spot;
      return true;
    }
    if (d + weight < pick.d) {
      pick.best = spot;
      pick.d = d + weight;
    }
    return false;
  };

  /** Whether a point is within earshot of whoever's talking (`live`: someone on stage is). */
  let live = false;
  const inEarshot = (x: number, z: number) => live && Math.hypot(talker.x - x, talker.z - z) < 5.5;

  return {
    scene,
    room,
    get lying() {
      return lying;
    },
    get position() {
      return me.pos;
    },
    get heading() {
      return wrap(me.heading.x);
    },
    /** Out of bed: a roll and a hop onto the floor. */
    wake: () => {
      if (!lying || waking >= 0) return;
      waking = 0;
    },
    hop: () => {
      me.hop = 1;
    },
    pose: (pose: Pose, ms = 0, seat = 0) => {
      me.pose = pose;
      me.poseUntil = ms ? performance.now() + ms : 0;
      me.seat = seat;
    },
    /** Dresses Aiden differently (a gown, for graduation). */
    dress: (look: Look) => {
      scene.remove(aiden.root);
      aiden.root.traverse((o) => {
        const m = o as { isMesh?: boolean; geometry?: { dispose: () => void } };
        if (m.isMesh) m.geometry?.dispose();
      });
      aiden = person(look, 1);
      scene.add(aiden.root);
      motion.reset();
    },
    aidenRig: () => aiden,
    wakePhoebe: () => {
      pup.awake = true;
      pupMotion.mode = "stand";
    },
    cheer: () => {
      pup.excited = 1;
      pupMotion.jump();
    },
    place: (point: Vector3, heading?: number) => {
      me.pos.copy(point).setY(0);
      path = [];
      me.speed = 0;
      if (heading !== undefined) {
        me.heading.set(heading);
        me.course = heading;
      }
      motion.reset();
    },
    /** Walks there by the shortest way, then does `then`; a long way is run. */
    walkTo: (point: Vector3, then?: () => void, near = 0) => {
      if (lying) return;
      const to = point.clone().setY(0);
      scripted = false;
      if (near && Math.hypot(me.pos.x - to.x, me.pos.z - to.z) <= near) {
        path = [];
        face = to;
        then?.();
        return;
      }
      path = route(me.pos, to, room);
      arrive = then ?? null;
      face = near ? to : null;
      if (!path.length && then) {
        face = to;
        arrive = null;
        then();
      }
    },
    /** Walks there and resolves on arrival (for cutscenes). */
    goTo: (point: Vector3) =>
      new Promise<void>((resolve) => {
        const to = point.clone().setY(0);
        path = route(me.pos, to, room);
        scripted = true;
        arrive = resolve;
        face = null;
        if (!path.length) {
          arrive = null;
          resolve();
        }
      }),
    stop: () => {
      path = [];
      arrive = null;
    },
    faceTowards: (point: Vector3) => {
      face = point.clone();
    },
    /** What's in reach: what you came for first, then the nearest thing,
     * and Phoebe (who is always near) only when there's nothing else. */
    nearest: (prefer?: string): Spot | null => {
      if (lying) return null;
      pick.best = null;
      pick.d = Infinity;
      pick.prefer = prefer;
      for (const spot of room.spots) if (consider(spot)) return pick.best;
      for (const a of cast) {
        if (!a.visible || !a.spec.label) continue;
        a.spot.at.copy(a.pos).setY(1.2);
        if (consider(a.spot)) return pick.best;
      }
      if (phoebe && pup.awake) {
        pup.spot.at.copy(pup.pos).setY(0.7);
        if (consider(pup.spot, 0.9)) return pick.best;
      }
      return pick.best;
    },
    spots: allSpots,
    spot: (id: string) => allSpots().find((s) => s.id === id) ?? null,
    actor: actorHandle,
    addActor: (spec: ActorSpec) => {
      if (actors.has(spec.id)) return;
      addActor(spec);
    },
    removeActor: (id: string) => {
      const a = actors.get(id);
      if (!a) return;
      scene.remove(a.rig.root);
      disposeAll(a.rig.root);
      actors.delete(id);
      cast.splice(cast.indexOf(a), 1);
    },
    update: (dt: number, time: number, intent: Intent, axes: { right: Vector3; up: Vector3 }, frozen: boolean, onStep: () => void) => {
      room.update?.(time, dt);
      const now = performance.now();
      stepSound = onStep;
      collectSolids();

      // getting out of bed
      if (waking >= 0 && bedroom.bed) {
        waking = Math.min(1, waking + dt / 0.85);
        const t = waking < 0.5 ? 4 * waking ** 3 : 1 - (-2 * waking + 2) ** 3 / 2;
        const from = lieAt(), to = riseAt();
        aiden.root.rotation.x = (-Math.PI / 2) * (1 - t);
        aiden.root.position.set(from.x + (to.x - from.x) * t, from.y * (1 - t) + Math.sin(t * Math.PI) * 0.55, from.z + (to.z - from.z) * t);
        aiden.root.rotation.y = me.heading.x * t;
        if (waking >= 1) {
          waking = -1;
          lying = false;
          me.pos.copy(to).setY(0);
          me.y.set(floorAt(me.pos.x, me.pos.z));
          motion.reset();
        }
      }

      // —— Aiden: where the keys (or the path) say, with a body's acceleration
      const sick = me.pose === "sick";
      const walk = sick ? SICK : WALK;
      let want = 0, goal = me.course;
      const up = !lying && waking < 0;
      if (up && !frozen) {
        const len = Math.hypot(intent.x, intent.y);
        if (len > 0.1) {
          path = [];
          arrive = null;
          face = null;
          const vx = axes.right.x * intent.x + axes.up.x * intent.y;
          const vz = axes.right.z * intent.x + axes.up.z * intent.y;
          goal = Math.atan2(vx, vz);
          want = (intent.run && !sick ? RUN : walk) * Math.min(1, len);
        }
      }
      if (up && !want && path.length) {
        const next = path[0];
        const d = Math.hypot(next.x - me.pos.x, next.z - me.pos.z);
        if (d < Math.max(0.08, me.speed * dt * 1.5)) {
          path.shift();
          if (!path.length && arrive) {
            const done = arrive;
            arrive = null;
            done();
          }
        }
        if (path.length) {
          const n = path[0];
          goal = Math.atan2(n.x - me.pos.x, n.z - me.pos.z);
          const left = pathLeft(me.pos, path);
          // a long way is run (unless it's a scene being played out); either way, slowing to arrive
          const top = !sick && !scripted && left > FAR ? RUN : walk;
          want = Math.min(top, Math.max(0.35, Math.sqrt(2 * 6 * left)));
        }
      }
      // turning round costs speed; turning a corner doesn't
      const off = Math.abs(wrap(goal - me.course));
      if (want && off > 1.6) want *= Math.max(0.12, 1 - (off - 1.6) / 1.1);
      const limit = want > me.speed ? (want > WALK + 0.2 ? ACCEL_RUN : ACCEL) : BRAKE;
      me.speed += Math.max(-limit * dt, Math.min(limit * dt, want - me.speed));
      const was = me.course;
      if (want || me.speed > 0.05) me.course = steer(me.course, goal, me.speed > WALK + 0.4 ? 9 : 13, dt);
      me.swing = approach(me.swing, dt > 0 ? (me.course - was) / dt : 0, 12, dt);
      if (me.speed > 0.001 && up) {
        const bx = me.pos.x, bz = me.pos.z;
        me.pos.x += Math.sin(me.course) * me.speed * dt;
        me.pos.z += Math.cos(me.course) * me.speed * dt;
        push(me.pos, RADIUS, room, blockers, blocking);
        // a wall takes the speed out of you, rather than leaving you walking on the spot
        const moved = Math.hypot(me.pos.x - bx, me.pos.z - bz);
        if (dt > 0) me.speed = Math.min(me.speed, moved / dt + 0.05);
      } else if (!up) me.speed = 0;
      // facing the way he's going: led by a hair through a turn, so the body doesn't lag it
      if (me.speed > 0.15) me.heading.turn(me.course + me.swing * (2 / 18), 18, dt);
      else if (face && up) me.heading.turn(Math.atan2(face.x - me.pos.x, face.z - me.pos.z), 9, dt);
      else if (me.turnTo !== null && up) me.heading.turn(me.turnTo, 7, dt);
      else me.heading.step(me.heading.x, 9, dt);
      me.turnTo = null;
      me.phase += (me.speed * dt) / 0.7;
      if (me.poseUntil && now > me.poseUntil) {
        me.pose = "stand";
        me.poseUntil = 0;
        me.seat = 0;
      }
      if (up) {
        me.hop = Math.max(0, me.hop - dt * 2.6);
        const seated = me.seat && (me.pose === "sit" || me.pose === "type");
        me.y.step(seated ? me.seat - 0.62 * aiden.scale : floorAt(me.pos.x, me.pos.z), seated || Math.abs(me.y.x) > 0.3 ? 12 : 22, dt);
        aiden.root.position.set(me.pos.x, me.y.x + (me.hop > 0 ? Math.sin((1 - me.hop) * Math.PI) * 0.3 : 0), me.pos.z);
        aiden.root.rotation.set(0, me.heading.x, 0);
      }

      // —— everyone else
      for (const a of cast) {
        if (!a.visible) continue;
        if (a.poseUntil && now > a.poseUntil) {
          a.pose = a.spec.pose ?? "stand";
          a.poseUntil = 0;
        }
        let aim = 0, toward = a.course;
        if (a.path.length) {
          const next = a.path[0];
          const d = Math.hypot(next.x - a.pos.x, next.z - a.pos.z);
          if (d < Math.max(0.06, a.speed * dt * 1.5)) {
            a.path.shift();
            if (!a.path.length && a.arrive) {
              const done = a.arrive;
              a.arrive = null;
              done();
            }
          }
          if (a.path.length) {
            const n = a.path[0];
            toward = Math.atan2(n.x - a.pos.x, n.z - a.pos.z);
            const left = pathLeft(a.pos, a.path);
            aim = Math.min(a.running ? a.pace * 2.3 : a.pace, Math.max(0.3, Math.sqrt(2 * 5 * left)));
          } else a.running = false;
        } else if (a.behaviour === "follow" && !lying) {
          // beside and a little behind, matching his pace and catching up when left behind
          const side = a.spec.side ?? 1;
          const ang = me.heading.x + Math.PI - 0.75 * side;
          const sx = me.pos.x + Math.sin(ang) * 0.95, sz = me.pos.z + Math.cos(ang) * 0.95;
          const d = Math.hypot(sx - a.pos.x, sz - a.pos.z);
          if (d > 0.3 || a.speed > 0.2) {
            toward = Math.atan2(sx - a.pos.x, sz - a.pos.z);
            // his pace, plus whatever closes the gap
            aim = Math.min(Math.max(a.pace * 2.4, me.speed + 1.2), Math.max(0, (me.speed > 0.2 ? me.speed : 0) + (d - 0.25) * 3));
          }
        } else if (a.behaviour === "wander" && a.spec.area) {
          a.next -= dt;
          if (a.next <= 0) {
            const r = a.spec.area;
            a.path = route(a.pos, new Vector3(r.x0 + Math.random() * (r.x1 - r.x0), 0, r.z0 + Math.random() * (r.z1 - r.z0)), room);
            a.next = 3 + Math.random() * 5;
          }
        }
        const sitting = a.pose === "sit" || a.pose === "type";
        if (sitting) aim = 0;
        const lim = aim > a.speed ? 7 : 10;
        a.speed += Math.max(-lim * dt, Math.min(lim * dt, aim - a.speed));
        const was = a.course;
        if (aim || a.speed > 0.05) a.course = steer(a.course, toward, a.speed > 2.4 ? 9 : 12, dt);
        a.swing = approach(a.swing, dt > 0 ? (a.course - was) / dt : 0, 12, dt);
        if (a.speed > 0.001) {
          const bx = a.pos.x, bz = a.pos.z;
          a.pos.x += Math.sin(a.course) * a.speed * dt;
          a.pos.z += Math.cos(a.course) * a.speed * dt;
          if (a.behaviour === "follow" && !a.path.length) push(a.pos, 0.2, room);
          if (dt > 0) a.speed = Math.min(a.speed, Math.hypot(a.pos.x - bx, a.pos.z - bz) / dt + 0.05);
        }
        // room to breathe: followers don't stand on Aiden's feet
        if (a.behaviour === "follow" && !a.path.length) {
          const ax = a.pos.x - me.pos.x, az = a.pos.z - me.pos.z;
          const apart = Math.hypot(ax, az);
          if (apart < 0.55 && apart > 0.001) {
            const k = Math.min(1, dt * 12) * (0.55 - apart);
            a.pos.x += (ax / apart) * k;
            a.pos.z += (az / apart) * k;
          }
        }
        const moving = a.speed > 0.15;
        if (moving) a.heading = a.turn.turn(a.course + a.swing * (2 / 16), 16, dt);
        else if (!sitting) {
          let target: number | null = null, rate = 6.5;
          if (a.face) target = Math.atan2(a.face.x - a.pos.x, a.face.z - a.pos.z);
          else if (a.turnTo !== null) target = a.turnTo;
          else if (a.behaviour === "watch" && Math.hypot(me.pos.x - a.pos.x, me.pos.z - a.pos.z) < 2.6) target = Math.atan2(me.pos.x - a.pos.x, me.pos.z - a.pos.z);
          else if (a.behaviour === "follow" && !lying) {
            target = me.heading.x;
            rate = 4;
          }
          a.heading = target === null ? a.turn.step(a.turn.x, 7, dt) : a.turn.turn(target, rate, dt);
        }
        a.turnTo = null;
        a.phase += (a.speed * dt) / 0.7;
        a.y.step(sitting ? (a.spec.seat ?? 0.45) - 0.62 * a.rig.scale : floorAt(a.pos.x, a.pos.z), 16, dt);
        a.rig.root.position.set(a.pos.x, a.y.x, a.pos.z);
        a.rig.root.rotation.y = a.heading;
      }

      // —— Phoebe: on her bed until you're up, then never far away
      if (phoebe) {
        if (pup.awake && !lying) {
          const moving = me.speed > 0.2;
          pup.idle = moving ? 0 : pup.idle + dt;
          const toMe = Math.hypot(me.pos.x - pup.pos.x, me.pos.z - pup.pos.z);
          // a happy hop when he comes back after being off somewhere
          if (toMe > 2.6) pup.apart += dt;
          else if (toMe < 1.3) {
            if (pup.apart > 0.8) {
              pupMotion.jump();
              pup.excited = Math.max(pup.excited, 0.9);
            }
            pup.apart = 0;
          }
          // sat down, she stays a moment when he walks off; back before she's up, and she's thrilled
          if (pup.sitting && moving) {
            if (pup.stay <= 0) pup.stay = 1.5;
            pup.farthest = Math.max(pup.farthest, toMe);
          }
          // a step behind and to the side
          const ang = me.heading.x + 2.4;
          let gx = me.pos.x + Math.sin(ang) * 1.05, gz = me.pos.z + Math.cos(ang) * 1.05;
          const near = Math.hypot(gx - pup.pos.x, gz - pup.pos.z);
          let mode: "stand" | "sit" | "sniff" = "stand";
          // somebody talking is more interesting than any smell
          if (speaker && pup.sniff) {
            pup.sniff = null;
            pup.sniffs = pup.curiosity;
          }
          if (!moving && !speaker && pup.idle > 3 && pup.sniffs < pup.curiosity && near < 1.2) {
            // a wait is a chance to smell something
            if (!pup.sniff) {
              const a = Math.random() * Math.PI * 2;
              const r = 0.8 + Math.random() * 0.6;
              const sx = me.pos.x + Math.cos(a) * r, sz = me.pos.z + Math.sin(a) * r;
              if (!blockedAt(sx, sz, room, 0.25)) {
                pup.sniff = new Vector3(sx, 0, sz);
                pup.sniffFor = 1.3 + Math.random() * 1.1;
              } else pup.sniffs += 1;
            }
          }
          if (pup.sniff && !moving) {
            gx = pup.sniff.x;
            gz = pup.sniff.z;
            if (Math.hypot(gx - pup.pos.x, gz - pup.pos.z) < 0.25) {
              mode = "sniff";
              pup.sniffFor -= dt;
              if (pup.sniffFor <= 0) {
                pup.sniff = null;
                pup.sniffs += 1;
              }
            }
          } else if (moving) {
            pup.sniff = null;
            pup.sniffs = 0;
            pup.curiosity = Math.random() < 0.35 ? 2 : 1;
          }
          if (!pup.sniff && !moving && pup.idle > 6.5 && near < 0.7) mode = "sit";
          if (pup.sitting && pup.stay > 0) {
            pup.stay -= dt;
            if (toMe < 2.1 && pup.stay > 0) {
              mode = "sit";
              if (pup.farthest > 1.3 && toMe < 1.1) {
                // he came back for her
                pup.stay = 0;
                pup.farthest = 0;
                pup.sitting = false;
                mode = "stand";
                pupMotion.jump();
                pup.excited = Math.max(pup.excited, 1);
              }
            } else pup.stay = 0;
          }
          if (mode !== "sit") {
            pup.stay = 0;
            pup.farthest = 0;
          }
          pup.sitting = mode === "sit";
          const d = Math.hypot(gx - pup.pos.x, gz - pup.pos.z);
          let aim = 0;
          if (d > (pup.sniff ? 0.18 : 0.4) || pup.speed > 0.2) aim = Math.min(Math.max(2.4, me.speed + 1.4), Math.max(0, (moving ? me.speed : 0) + (d - (pup.sniff ? 0.1 : 0.3)) * 3.2));
          if (pup.sniff && aim > 1.1) aim = 1.1;
          if (mode === "sit") aim = 0;
          const toward = Math.atan2(gx - pup.pos.x, gz - pup.pos.z);
          const lim = aim > pup.speed ? 9 : 12;
          pup.speed += Math.max(-lim * dt, Math.min(lim * dt, aim - pup.speed));
          const was = pup.course;
          if (aim || pup.speed > 0.05) pup.course = steer(pup.course, toward, 12, dt);
          pup.swing = approach(pup.swing, dt > 0 ? (pup.course - was) / dt : 0, 12, dt);
          pup.pos.x += Math.sin(pup.course) * pup.speed * dt;
          pup.pos.z += Math.cos(pup.course) * pup.speed * dt;
          const ax = pup.pos.x - me.pos.x, az = pup.pos.z - me.pos.z;
          const apart = Math.hypot(ax, az);
          if (apart < 0.55 && apart > 0.001) {
            const k = Math.min(1, dt * 12) * (0.55 - apart);
            pup.pos.x += (ax / apart) * k;
            pup.pos.z += (az / apart) * k;
          }
          push(pup.pos, 0.22, room);
          if (pup.speed > 0.15) pup.heading.turn(pup.course + pup.swing * (2 / 14), 14, dt);
          else if (mode !== "sniff") pup.heading.turn(Math.atan2(me.pos.x - pup.pos.x, me.pos.z - pup.pos.z), 6, dt);
          else pup.heading.step(pup.heading.x, 6, dt);
          // happier when he runs, when he's back, when he's talking to her
          const base = 0.18 + (me.speed > WALK + 0.5 ? 0.45 : 0) + (toMe < 1.6 ? 0.12 : 0);
          pup.excited = Math.max(base, pup.excited - dt * 0.35);
          pupMotion.mode = mode;
          pup.y.step(floorAt(pup.pos.x, pup.pos.z), 14, dt);
          phoebe.root.position.set(pup.pos.x, pup.y.x, pup.pos.z);
        } else {
          const bed = bedroom.dogBed ?? pup.pos;
          pup.pos.copy(bed);
          pup.y.set(bed.y);
          phoebe.root.position.copy(bed);
          pupMotion.mode = pup.awake ? "stand" : "lie";
          pup.excited = Math.max(0.12, pup.excited - dt * 0.35);
        }
        phoebe.root.rotation.y = pup.heading.x;
        pupMotion.excited = pup.excited;
      }

      // —— who's talking, and everyone looking at them
      voiceLeft = Math.max(0, voiceLeft - dt);
      live = headOf(speaker, talker);
      // Aiden
      {
        const talking = live && speaker === "aiden";
        motion.talk = talking ? 1 : 0;
        motion.voice = talking ? voiceLeft : 0;
        motion.listen = live && !talking ? 1 : 0;
        if (talking) {
          // to whoever he's talking with: the last one to speak, or whoever's nearest
          let to = lastOther && headOf(lastOther, listener) ? lastOther : null;
          if (!to) {
            let best = 3.5;
            for (const a of cast) {
              if (!a.visible || !a.spec.label) continue;
              const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
              if (d < best) {
                best = d;
                to = a.spec.id;
              }
            }
            if (to) headOf(to, listener);
          }
          if (to) motion.look.copy(listener);
          motion.attend = to ? 0.85 : 0;
        } else if (inEarshot(me.pos.x, me.pos.z)) {
          motion.look.copy(talker);
          motion.attend = 1;
          const yaw = Math.atan2(talker.x - me.pos.x, talker.z - me.pos.z);
          if (Math.abs(wrap(yaw - me.heading.x)) > 1.05 && me.speed < 0.1) me.turnTo = yaw;
        } else {
          // otherwise eye contact with whoever's close, and Phoebe when she's right there
          let best = 2.2, found = false;
          for (const a of cast) {
            if (!a.visible || !a.spec.label) continue;
            const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
            if (d < best && headOf(a.spec.id, scratch)) {
              best = d;
              motion.look.copy(scratch);
              found = true;
            }
          }
          if (!found && phoebe && pup.awake && Math.hypot(pup.pos.x - me.pos.x, pup.pos.z - me.pos.z) < 1.6 && headOf("phoebe", scratch)) {
            motion.look.copy(scratch);
            found = pup.excited > 0.5 || pup.idle > 1.5;
          }
          motion.attend = found ? (me.speed > 0.3 ? 0.35 : 0.7) : 0;
        }
      }
      // the others
      const aidenHead = headOf("aiden", listener);
      for (const a of cast) {
        if (!a.visible) continue;
        const m = a.motion;
        const talking = live && speaker === a.spec.id;
        m.talk = talking ? 1 : 0;
        m.voice = talking ? voiceLeft : 0;
        m.listen = 0;
        if (talking) {
          // talking to Aiden, looking at him
          if (aidenHead) m.look.copy(listener);
          m.attend = aidenHead ? 0.9 : 0;
          const yaw = Math.atan2(me.pos.x - a.pos.x, me.pos.z - a.pos.z);
          if (Math.abs(wrap(yaw - a.heading)) > 1.05) a.turnTo = yaw;
        } else if (inEarshot(a.pos.x, a.pos.z) && a.behaviour !== "wander") {
          m.look.copy(talker);
          m.attend = 1;
          m.listen = 1;
          const yaw = Math.atan2(talker.x - a.pos.x, talker.z - a.pos.z);
          if (Math.abs(wrap(yaw - a.heading)) > 1.05) a.turnTo = yaw;
        } else if (inEarshot(a.pos.x, a.pos.z)) {
          // passing by: a look, no more
          m.look.copy(talker);
          m.attend = 0.45;
        } else if (aidenHead && Math.hypot(me.pos.x - a.pos.x, me.pos.z - a.pos.z) < (a.behaviour === "watch" ? 2.8 : 1.8)) {
          m.look.copy(listener);
          m.attend = a.behaviour === "watch" ? 0.85 : 0.55;
        } else if (a.behaviour === "follow" && aidenHead) {
          // walking alongside: a glance at him now and then
          if (time > a.glanceAt) a.glanceAt = time + 2.5 + Math.random() * 4;
          m.look.copy(listener);
          m.attend = time > a.glanceAt - 1.1 ? 0.7 : 0;
        } else m.attend = 0;
      }
      // Phoebe looks up at whoever's talking, and at him the rest of the time
      if (phoebe && pup.awake) {
        if (live && speaker !== "phoebe" && Math.hypot(talker.x - pup.pos.x, talker.z - pup.pos.z) < 6) {
          pupMotion.look.copy(talker);
          pupMotion.attend = 1;
          pupMotion.curious = speaker === "aiden" ? 1 : 0.4;
        } else if (aidenHead) {
          pupMotion.look.copy(listener);
          const glance = time > pup.glanceAt - 0.9;
          if (time > pup.glanceAt) pup.glanceAt = time + 1.8 + Math.random() * 3;
          pupMotion.attend = pupMotion.mode === "sniff" ? 0 : me.speed > 0.2 ? (glance ? 0.8 : 0.15) : 1;
          pupMotion.curious = speaker === "phoebe" ? 1 : 0;
        }
      }

      // —— and move them all
      animate(aiden, me.phase, Math.min(1, me.speed / WALK), time, lying ? "stand" : me.pose, 0, motion);
      for (const a of cast) if (a.visible) animate(a.rig, a.phase, Math.min(1, a.speed / a.pace), time, a.pose, a.offset, a.motion);
      if (phoebe) animateDog(phoebe, time, Math.min(1, pup.speed / 2), pup.excited, pupMotion);
      specks.update(dt);

      // the camera keeps the room in view and leans after you, a little ahead of where
      // you're going; it only moves once you've left a small zone round where it's looking,
      // so a shuffle doesn't move it, and stopping doesn't pull it back
      const lead = reduced ? 0 : Math.min(1.1, me.speed * 0.4);
      cam.ahead.x = approach(cam.ahead.x, Math.sin(me.course) * lead, 2.2, dt);
      cam.ahead.z = approach(cam.ahead.z, Math.cos(me.course) * lead, 2.2, dt);
      const wantX = me.pos.x + cam.ahead.x, wantZ = me.pos.z + cam.ahead.z;
      const away = Math.hypot(wantX - cam.anchor.x, wantZ - cam.anchor.z);
      if (away > DEAD) {
        const k = 1 - DEAD / away;
        cam.anchor.x += (wantX - cam.anchor.x) * k;
        cam.anchor.z += (wantZ - cam.anchor.z) * k;
      }
      let fx = cam.anchor.x, fz = cam.anchor.z;
      // in a conversation, the other one's in the shot too
      if (live && speaker !== "aiden") {
        fx += (talker.x - fx) * 0.22;
        fz += (talker.z - fz) * 0.22;
      }
      const c = room.centre;
      camWant.set(c.x + (fx - c.x) * room.follow, c.y, c.z + (fz - c.z) * room.follow);
      lookTarget.set(cam.x.step(camWant.x, 4.2, dt), c.y, cam.z.step(camWant.z, 4.2, dt));
    },
    look: (tall: boolean) => ({ target: lookTarget, span: tall ? room.span.tall : room.span.wide }),
    /** Who is talking (a speaker id: "aiden", an actor's id, or anyone else), or null when no one is;
     * and what they're saying, if it's known, so the mouth moves for as long as the words take. */
    speaking: (who: string | null, line?: string) => {
      speaker = who;
      voiceLeft = who ? (line ? Math.min(6, 0.25 + line.length * 0.022) : 1.6) : 0;
      if (who && who !== "aiden" && who !== "phoebe" && actors.has(who)) lastOther = who;
      if (who === "phoebe") {
        pup.excited = Math.max(pup.excited, 0.85);
        pupMotion.jump();
      }
      if (!who) lastOther = null;
    },
    snapLook: () => {
      const c = room.centre;
      cam.anchor.copy(me.pos);
      cam.ahead.set(0, 0, 0);
      lookTarget.set(c.x + (me.pos.x - c.x) * room.follow, c.y, c.z + (me.pos.z - c.z) * room.follow);
      cam.x.set(lookTarget.x);
      cam.z.set(lookTarget.z);
    },
    dispose: () => {
      specks.dispose();
      room.dispose();
      disposeAll(scene);
    },
  };
}

export type Stage = ReturnType<typeof createStage>;
export type ActorHandle = NonNullable<ReturnType<Stage["actor"]>>;
