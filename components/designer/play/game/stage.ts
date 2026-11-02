import { Scene, Vector3 } from "three";
import { animate, animateDog, dog, LOOKS, person, type Look, type Pose, type Rig } from "./people";
import type { Collider, Room, Spot } from "./rooms/common";

// A room, played: Aiden walking wherever the keys or a click on the floor
// say, Phoebe close behind when she's there, and the other people in the
// room standing, sitting, wandering, watching Aiden or walking alongside.

const RADIUS = 0.26;
const SPEED = 2.5;
const CELL = 0.2;

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
  pos: Vector3;
  heading: number;
  pose: Pose;
  poseUntil: number;
  move: number;
  phase: number;
  path: Vector3[];
  arrive: (() => void) | null;
  face: Vector3 | null;
  next: number;
  offset: number;
  y: number;
  visible: boolean;
  behaviour: Behaviour;
};

export type Intent = { x: number; y: number };

const turnTowards = (current: number, goal: number, k: number) => {
  let d = goal - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * k;
};

function blockedAt(x: number, z: number, room: Room, radius: number) {
  const b = room.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return true;
  return room.colliders.some((c) => x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius);
}

function push(p: Vector3, radius: number, room: Room) {
  for (const c of room.colliders) {
    const x0 = c.x0 - radius, x1 = c.x1 + radius, z0 = c.z0 - radius, z1 = c.z1 + radius;
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
    const out = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
    const least = Math.min(...out);
    if (least === out[0]) p.x = x0;
    else if (least === out[1]) p.x = x1;
    else if (least === out[2]) p.z = z0;
    else p.z = z1;
  }
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

export function createStage(
  room: Room,
  options: { lying?: boolean; dog?: "bed" | "follow" | false; actors?: ActorSpec[]; hero?: Look; at?: Vector3; heading?: number } = {},
) {
  const scene = new Scene();
  scene.add(room.group);
  let aiden = person(options.hero ?? LOOKS.aiden, 1);
  scene.add(aiden.root);
  // a room with a bed can say where in it Aiden lies, and where to stand up
  const bedroom = room as Room & { bed?: Vector3; dogBed?: Vector3; lie?: Vector3; rise?: Vector3 };
  const lieAt = () => bedroom.lie ?? new Vector3(bedroom.bed!.x, 0.62, -1.95);
  const riseAt = () => bedroom.rise ?? room.spawn;

  const floorAt = (x: number, z: number) => room.floorAt?.(x, z) ?? 0;
  const me = {
    y: 0,
    pos: (options.at ?? room.spawn).clone().setY(0),
    heading: options.heading ?? room.heading,
    phase: 0,
    move: 0,
    hop: 0,
    pose: "stand" as Pose,
    poseUntil: 0,
    /** Seat height while sitting (0: wherever the floor is). */
    seat: 0,
  };
  let lying = Boolean(options.lying && bedroom.bed);
  let waking = -1;
  let path: Vector3[] = [];
  let arrive: (() => void) | null = null;
  let face: Vector3 | null = null;
  const lookTarget = room.centre.clone();

  // —— Phoebe
  const phoebe = options.dog ? dog() : null;
  const pup = { pos: (bedroom.dogBed ?? room.spawn).clone(), heading: Math.PI * 0.25, move: 0, excited: 0, awake: options.dog === "follow" };
  if (phoebe) {
    scene.add(phoebe.root);
    if (pup.awake) pup.pos.copy(me.pos).add(new Vector3(-0.8, 0, 0.6));
    phoebe.root.position.copy(pup.pos);
  }

  const lyingPose = () => {
    aiden.root.position.copy(lieAt());
    aiden.root.rotation.set(-Math.PI / 2, 0, 0);
  };
  if (lying) lyingPose();

  // —— everyone else
  const actors = new Map<string, Actor>();
  const addActor = (spec: ActorSpec) => {
    const rig = person(spec.look, spec.seed ?? spec.id.length * 7 + 3);
    scene.add(rig.root);
    const actor: Actor = {
      spec,
      rig,
      pos: spec.at.clone(),
      heading: spec.heading ?? 0,
      pose: spec.pose ?? "stand",
      poseUntil: 0,
      move: 0,
      phase: Math.random() * 6,
      path: [],
      arrive: null,
      face: null,
      next: Math.random() * 3,
      offset: (spec.seed ?? spec.id.length) * 1.37,
      y: 0,
      visible: true,
      behaviour: spec.behaviour ?? "idle",
    };
    actors.set(spec.id, actor);
    return actor;
  };
  for (const spec of options.actors ?? []) addActor(spec);

  const actorSpots = (): Spot[] =>
    [...actors.values()]
      .filter((a) => a.visible && a.spec.label)
      .map((a) => ({ id: a.spec.id, label: a.spec.label!, at: a.pos.clone().setY(1.2), reach: a.spec.reach ?? 1.25 }));
  const allSpots = (): Spot[] => [
    ...room.spots,
    ...actorSpots(),
    ...(phoebe && pup.awake ? [{ id: "phoebe", label: "Phoebe", at: pup.pos.clone().setY(0.7), reach: 1.15 }] : []),
  ];

  const solids = (): Collider[] =>
    [...actors.values()]
      .filter((a) => a.visible && a.spec.solid !== false && a.pose !== "sit")
      .map((a) => ({ x0: a.pos.x - 0.18, x1: a.pos.x + 0.18, z0: a.pos.z - 0.18, z1: a.pos.z + 0.18 }));

  const actorHandle = (id: string) => {
    const a = actors.get(id);
    if (!a) return null;
    return {
      get pos() {
        return a.pos;
      },
      rig: a.rig,
      /** Walks there; resolves on arrival. */
      walkTo: (point: Vector3) =>
        new Promise<void>((resolve) => {
          a.behaviour = a.behaviour === "follow" ? "follow" : "idle";
          a.path = route(a.pos, point.clone().setY(0), room);
          a.arrive = resolve;
          if (!a.path.length) {
            a.arrive = null;
            resolve();
          }
        }),
      place: (point: Vector3, heading?: number) => {
        a.pos.copy(point).setY(0);
        a.path = [];
        if (heading !== undefined) a.heading = heading;
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
        a.visible = on;
        a.rig.root.visible = on;
      },
    };
  };

  const step = (pos: Vector3, toward: Vector3, speed: number, dt: number) => {
    const dx = toward.x - pos.x, dz = toward.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.0001) return { d, vx: 0, vz: 0 };
    const s = Math.min(d, speed * dt);
    pos.x += (dx / d) * s;
    pos.z += (dz / d) * s;
    return { d, vx: dx / d, vz: dz / d };
  };

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
      return me.heading;
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
    },
    aidenRig: () => aiden,
    wakePhoebe: () => {
      pup.awake = true;
    },
    cheer: () => {
      pup.excited = 1;
    },
    place: (point: Vector3, heading?: number) => {
      me.pos.copy(point).setY(0);
      path = [];
      if (heading !== undefined) me.heading = heading;
    },
    /** Walks there by the shortest way, then does `then`. */
    walkTo: (point: Vector3, then?: () => void, near = 0) => {
      if (lying) return;
      const to = point.clone().setY(0);
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
      let best: Spot | null = null;
      let bestD = Infinity;
      for (const spot of allSpots()) {
        const d = Math.hypot(spot.at.x - me.pos.x, spot.at.z - me.pos.z);
        if (d > spot.reach) continue;
        if (spot.id === prefer) return spot;
        const weighted = spot.id === "phoebe" ? d + 0.9 : d;
        if (weighted < bestD) {
          best = spot;
          bestD = weighted;
        }
      }
      return best;
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
      actors.delete(id);
    },
    update: (dt: number, time: number, intent: Intent, axes: { right: Vector3; up: Vector3 }, frozen: boolean, onStep: () => void) => {
      room.update?.(time, dt);
      const now = performance.now();

      // getting out of bed
      if (waking >= 0 && bedroom.bed) {
        waking = Math.min(1, waking + dt / 0.85);
        const t = waking < 0.5 ? 4 * waking ** 3 : 1 - (-2 * waking + 2) ** 3 / 2;
        const from = lieAt(), to = riseAt();
        aiden.root.rotation.x = (-Math.PI / 2) * (1 - t);
        aiden.root.position.set(from.x + (to.x - from.x) * t, from.y * (1 - t) + Math.sin(t * Math.PI) * 0.55, from.z + (to.z - from.z) * t);
        aiden.root.rotation.y = me.heading * t;
        if (waking >= 1) {
          waking = -1;
          lying = false;
          me.pos.copy(to).setY(0);
        }
      }

      let vx = 0, vz = 0;
      if (!lying && waking < 0 && !frozen) {
        const len = Math.hypot(intent.x, intent.y);
        if (len > 0.1) {
          path = [];
          arrive = null;
          face = null;
          vx = (axes.right.x * intent.x + axes.up.x * intent.y) / Math.max(1, len);
          vz = (axes.right.z * intent.x + axes.up.z * intent.y) / Math.max(1, len);
        }
      }
      if (!lying && waking < 0 && !vx && !vz && path.length) {
        const next = path[0];
        const dx = next.x - me.pos.x, dz = next.z - me.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) {
          path.shift();
          if (!path.length && arrive) {
            const done = arrive;
            arrive = null;
            done();
          }
        } else {
          vx = dx / d;
          vz = dz / d;
        }
      }
      const speed = Math.hypot(vx, vz);
      if (speed > 0) {
        const before = me.phase;
        me.pos.x += vx * SPEED * dt;
        me.pos.z += vz * SPEED * dt;
        push(me.pos, RADIUS, { ...room, colliders: [...room.colliders, ...solids()] });
        me.heading = turnTowards(me.heading, Math.atan2(vx, vz), 1 - Math.exp(-dt * 14));
        me.phase += dt * 11;
        if (Math.floor(before / Math.PI) !== Math.floor(me.phase / Math.PI)) onStep();
      } else if (face && !lying) {
        me.heading = turnTowards(me.heading, Math.atan2(face.x - me.pos.x, face.z - me.pos.z), 1 - Math.exp(-dt * 10));
      }
      me.move += ((speed > 0 ? 1 : 0) - me.move) * (1 - Math.exp(-dt * 12));
      if (me.poseUntil && now > me.poseUntil) {
        me.pose = "stand";
        me.poseUntil = 0;
        me.seat = 0;
      }
      if (!lying && waking < 0) {
        me.hop = Math.max(0, me.hop - dt * 2.6);
        me.y += (floorAt(me.pos.x, me.pos.z) - me.y) * (1 - Math.exp(-dt * 16));
        const seated = me.seat && (me.pose === "sit" || me.pose === "type");
        aiden.root.position.set(me.pos.x, seated ? me.seat - 0.62 * aiden.scale : me.y + (me.hop > 0 ? Math.sin((1 - me.hop) * Math.PI) * 0.3 : 0), me.pos.z);
        aiden.root.rotation.set(0, me.heading, 0);
      }
      animate(aiden, me.phase, lying ? 0 : me.move, time, lying ? "stand" : me.pose);

      // everyone else
      for (const a of actors.values()) {
        if (!a.visible) continue;
        if (a.poseUntil && now > a.poseUntil) {
          a.pose = a.spec.pose ?? "stand";
          a.poseUntil = 0;
        }
        let moving = false;
        if (a.path.length) {
          const s = step(a.pos, a.path[0], SPEED * 0.85, dt);
          if (s.d < 0.06) {
            a.path.shift();
            if (!a.path.length && a.arrive) {
              const done = a.arrive;
              a.arrive = null;
              done();
            }
          } else {
            moving = true;
            a.heading = turnTowards(a.heading, Math.atan2(s.vx, s.vz), 1 - Math.exp(-dt * 12));
          }
        } else if (a.behaviour === "follow" && !lying) {
          const side = a.spec.side ?? 1;
          const spot = new Vector3(Math.sin(me.heading + Math.PI - 0.75 * side), 0, Math.cos(me.heading + Math.PI - 0.75 * side)).multiplyScalar(0.95).add(me.pos);
          const d = Math.hypot(spot.x - a.pos.x, spot.z - a.pos.z);
          if (d > 0.35) {
            const s = step(a.pos, spot, Math.min(SPEED * 1.1, d * 2.8), dt);
            push(a.pos, 0.2, room);
            moving = true;
            a.heading = turnTowards(a.heading, Math.atan2(s.vx, s.vz), 1 - Math.exp(-dt * 10));
          } else {
            a.heading = turnTowards(a.heading, me.heading, 1 - Math.exp(-dt * 4));
          }
          const ax = a.pos.x - me.pos.x, az = a.pos.z - me.pos.z;
          const apart = Math.hypot(ax, az);
          if (apart < 0.5 && apart > 0.001) {
            a.pos.x = me.pos.x + (ax / apart) * 0.5;
            a.pos.z = me.pos.z + (az / apart) * 0.5;
          }
        } else if (a.behaviour === "wander" && a.spec.area) {
          a.next -= dt;
          if (a.next <= 0) {
            const r = a.spec.area;
            a.path = route(a.pos, new Vector3(r.x0 + Math.random() * (r.x1 - r.x0), 0, r.z0 + Math.random() * (r.z1 - r.z0)), room);
            a.next = 3 + Math.random() * 5;
          }
        }
        if (!moving && a.pose !== "sit") {
          const target = a.face ?? (a.behaviour === "watch" && Math.hypot(me.pos.x - a.pos.x, me.pos.z - a.pos.z) < 2.6 ? me.pos : null);
          if (target) a.heading = turnTowards(a.heading, Math.atan2(target.x - a.pos.x, target.z - a.pos.z), 1 - Math.exp(-dt * 6));
        }
        a.move += ((moving ? 1 : 0) - a.move) * (1 - Math.exp(-dt * 10));
        if (moving) a.phase += dt * 10;
        a.y += (floorAt(a.pos.x, a.pos.z) - a.y) * (1 - Math.exp(-dt * 16));
        a.rig.root.position.set(a.pos.x, a.pose === "sit" || a.pose === "type" ? (a.spec.seat ?? 0.45) - 0.62 * a.rig.scale : a.y, a.pos.z);
        a.rig.root.rotation.y = a.heading;
        animate(a.rig, a.phase, a.move, time, a.pose, a.offset);
      }

      // Phoebe: on her bed until you're up, then never far away
      if (phoebe) {
        if (pup.awake) {
          const behind = new Vector3(Math.sin(me.heading + 2.4), 0, Math.cos(me.heading + 2.4)).multiplyScalar(1.05).add(me.pos);
          const dx = behind.x - pup.pos.x, dz = behind.z - pup.pos.z;
          const d = Math.hypot(dx, dz);
          const go = d > 0.45 && !lying;
          if (go) {
            const s = Math.min(SPEED * 1.15, d * 2.6);
            pup.pos.x += (dx / d) * s * dt;
            pup.pos.z += (dz / d) * s * dt;
            pup.heading = turnTowards(pup.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
          } else {
            pup.heading = turnTowards(pup.heading, Math.atan2(me.pos.x - pup.pos.x, me.pos.z - pup.pos.z), 1 - Math.exp(-dt * 4));
          }
          const ax = pup.pos.x - me.pos.x, az = pup.pos.z - me.pos.z;
          const apart = Math.hypot(ax, az);
          if (apart < 0.55 && apart > 0.001) {
            pup.pos.x = me.pos.x + (ax / apart) * 0.55;
            pup.pos.z = me.pos.z + (az / apart) * 0.55;
          }
          push(pup.pos, 0.22, room);
          pup.move += ((go ? 1 : 0) - pup.move) * (1 - Math.exp(-dt * 10));
          phoebe.root.position.set(pup.pos.x, 0, pup.pos.z);
        } else {
          phoebe.root.position.copy(bedroom.dogBed ?? pup.pos);
        }
        phoebe.root.rotation.y = pup.heading;
        pup.excited = Math.max(0, pup.excited - dt * 0.5);
        const close = Math.hypot(me.pos.x - pup.pos.x, me.pos.z - pup.pos.z) < 1.6 ? 0.35 : 0;
        animateDog(phoebe, time, pup.move, Math.max(pup.excited, pup.awake ? close : 0));
      }

      // the camera keeps the room in view and leans after you
      const c = room.centre;
      const want = new Vector3(c.x + (me.pos.x - c.x) * room.follow, c.y, c.z + (me.pos.z - c.z) * room.follow);
      lookTarget.lerp(want, 1 - Math.exp(-dt * 3));
    },
    look: (tall: boolean) => ({ target: lookTarget, span: tall ? room.span.tall : room.span.wide }),
    snapLook: () => {
      const c = room.centre;
      lookTarget.set(c.x + (me.pos.x - c.x) * room.follow, c.y, c.z + (me.pos.z - c.z) * room.follow);
    },
    dispose: () => {
      room.dispose();
      scene.traverse((o) => {
        const m = o as { isMesh?: boolean; geometry?: { dispose: () => void } };
        if (m.isMesh) m.geometry?.dispose();
      });
    },
  };
}

export type Stage = ReturnType<typeof createStage>;
export type ActorHandle = NonNullable<ReturnType<Stage["actor"]>>;
