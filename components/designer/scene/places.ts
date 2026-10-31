import {
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import {
  agent,
  ally,
  bush,
  capsule,
  centred,
  cloud,
  corgi,
  envelope,
  koi,
  lampPost,
  lilyPad,
  materials,
  mesh,
  OUTFITS,
  paddle,
  person,
  pigeon,
  reeds,
  rock,
  roundTree,
  V,
  wing,
} from "./kit";
import { at, BRIDGE, PADS, POND, WATER_LEVEL } from "./layout";
import { FLAG } from "./shared";
import { heightAt, padHeight } from "./terrain";
import { hash3, Voxels } from "./voxels";

export type Spot = {
  id: string;
  /** a project slug from content/worlds, or "about" */
  slug: string;
  object: Object3D;
  /** where the marker and label sit, in world space */
  anchor: Vector3;
  /** where the camera looks when this is opened */
  focus: Vector3;
};

export type Place = {
  object: Object3D;
  spot?: Spot;
  update?: (time: number, delta: number) => void;
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

export function ground(s: number, t: number) {
  const [x, z] = at(s, t);
  return new Vector3(x, heightAt(x, z), z);
}

function line(points: Vector3[], color: number, soft = false) {
  const material = new LineBasicMaterial({ color });
  if (soft) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>\ngl_FragColor.a = ${FLAG.soft.toFixed(2)};`,
      );
    };
    material.customProgramCacheKey = () => "soft-line";
  }
  return new Line(new BufferGeometry().setFromPoints(points), material);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// ——— LedgerLens: the tree on the hill ———————————————————————————————

const WOOD = [0x2b2623, 0x3a332e, 0x4b433c, 0x5f564d, 0x7c7268, 0x9a9085];
// LedgerLens's palette: cobalt, sky, orange, peach, cream. Each cluster
// leans one way, so the crown reads as patches the way the original does.
const BLUES = [0x3a75f0, 0x2f66e0, 0x2a59cc, 0x6f9cf5, 0x9cc0fa, 0xcfe0fd];
const ORANGES = [0xf39a45, 0xf08a32, 0xf8c08e, 0xfad7b2];
const CREAM = 0xf6eedd;

export function ledgerTree(): Place {
  const random = rng(11);
  const wood = new Voxels(V, 0.05);
  const leaves = new Voxels(V, 0.03);
  const woodPaint = (x: number, y: number, z: number) => WOOD[Math.floor(hash3(x, y, z) ** 1.5 * WOOD.length)];

  const tips: Vector3[] = [];
  const twigs: Vector3[] = [];
  const grow = (from: Vector3, dir: Vector3, length: number, radius: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, length);
    wood.limb(from.x, from.y, from.z, to.x, to.y, to.z, radius, Math.max(0.45, radius * 0.72), woodPaint);
    if (depth === 0) {
      tips.push(to);
      return;
    }
    if (depth <= 2) twigs.push(from.clone().lerp(to, 0.6));
    const children = depth === 3 ? 3 : 2;
    const yaw0 = random() * Math.PI * 2;
    for (let i = 0; i < children; i += 1) {
      const yaw = yaw0 + (i / children) * Math.PI * 2 + (random() - 0.5) * 0.9;
      const tilt = (depth >= 3 ? 0.62 : 0.85) + random() * 0.25;
      const out = new Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw));
      const next = out.multiplyScalar(0.7).addScaledVector(dir, 0.45).normalize();
      grow(to, next, length * (0.68 + random() * 0.1), radius * 0.64, depth - 1);
    }
  };

  // a short, thick trunk that leans a little, then four limbs
  const top = new Vector3(0.5, 12, -0.4);
  wood.limb(0, 0, 0, top.x, top.y, top.z, 2.7, 1.9, woodPaint);
  for (let k = 0; k < 4; k += 1) {
    const yaw = (k / 4) * Math.PI * 2 + 0.5 + (random() - 0.5) * 0.5;
    const tilt = 0.55 + random() * 0.25;
    const dir = new Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw));
    grow(top, dir, 12 + random() * 3, 1.55, 3);
  }

  // roots, navy like the drawing on LedgerLens's landing page
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const reach = 4.5 + random() * 2.5;
    wood.limb(Math.cos(a) * 1.4, 0.6, Math.sin(a) * 1.4, Math.cos(a) * reach, -1.6, Math.sin(a) * reach, 0.9, 0.45, (x, y, z) =>
      hash3(x, y, z) > 0.72 ? 0x2c3f8f : 0x3d3530);
  }

  const cluster = (at: Vector3, rx: number, ry: number, fill: number) => {
    const lean = random();
    const palette = lean < 0.62 ? BLUES : lean < 0.92 ? ORANGES : [...BLUES, ...ORANGES];
    leaves.blob(at.x, at.y, at.z, rx, ry, rx, (x, y, z) => {
      const r = hash3(x * 7, y, z);
      if (r > 0.96) return CREAM;
      if (r > 0.86) return (palette === BLUES ? ORANGES : BLUES)[Math.floor(hash3(z, x, y) * 3)];
      return palette[Math.floor(hash3(x, z * 5, y) * palette.length)];
    }, fill, Math.floor(random() * 999));
  };
  for (const tip of tips) cluster(tip.clone().add(new Vector3(0, 1.2, 0)), 4.6 + random() * 2, 2.6 + random() * 1.2, 0.46);
  for (const twig of twigs) cluster(twig.clone().add(new Vector3(0, 1, 0)), 3 + random() * 1.4, 2 + random(), 0.34);

  // money does grow on trees
  for (let i = 0; i < 5; i += 1) {
    const c = tips[Math.floor(random() * tips.length)];
    const x = Math.round(c.x), y = Math.round(c.y) - 2, z = Math.round(c.z);
    leaves.box(x, y, z, x + 1, y + 1, z, (vx, vy) => (vy === y + 1 ? 0xffe07a : 0xf2c230));
  }

  const group = new Group();
  group.add(mesh(wood), mesh(leaves, materials.blossom, { seed: 3, occlude: false, receive: false }));

  // a few petals let go and drift down
  const petals: Array<{ m: Mesh; start: Vector3; t: number; speed: number }> = [];
  for (let i = 0; i < 9; i += 1) {
    const p = new Voxels(V * 0.9, 0);
    p.set(0, 0, 0, i % 3 === 0 ? ORANGES[0] : BLUES[i % BLUES.length]);
    const m = mesh(p, materials.soft, { shadow: false });
    const start = tips[Math.floor(random() * tips.length)].clone().multiplyScalar(V);
    petals.push({ m, start, t: random(), speed: 0.06 + random() * 0.05 });
    group.add(m);
  }

  const place = ground(-2, -24);
  group.position.copy(place).add(new Vector3(0, -0.1, 0));
  const height = 8.6;
  return {
    object: group,
    spot: {
      id: "ledgerlens-tree",
      slug: "ledgerlens",
      object: group,
      anchor: place.clone().add(new Vector3(0, height + 0.4, 0)),
      focus: place.clone().add(new Vector3(0, 4.2, 0)),
    },
    update: (time) => {
      for (const petal of petals) {
        const t = (time * petal.speed + petal.t) % 1;
        const fall = t * (petal.start.y + 0.2);
        petal.m.position.set(
          petal.start.x + Math.sin(time * 1.7 + petal.t * 9) * 0.5 + t * 1.6,
          petal.start.y - fall,
          petal.start.z + Math.cos(time * 1.3 + petal.t * 5) * 0.4 + t * 0.8,
        );
        petal.m.visible = t < 0.97;
      }
    },
  };
}

// ——— LedgerLens: the koi pond ————————————————————————————————————————

export function koiPond(): Place {
  const group = new Group();
  const random = rng(21);
  const [cx, cz] = at(POND.s, POND.t);
  const centre = new Vector3(cx, WATER_LEVEL, cz);
  const c = Math.cos(POND.angle), s = Math.sin(POND.angle);
  const inPond = (u: number, v: number) => new Vector3(cx + (u * c - v * s), WATER_LEVEL, cz + (u * s + v * c));

  // lily pads
  for (let i = 0; i < 8; i += 1) {
    const a = random() * Math.PI * 2;
    const r = 0.35 + random() * 0.5;
    const p = inPond(Math.cos(a) * POND.rx * r, Math.sin(a) * POND.rz * r);
    if (p.x > cx + 1.6 && Math.abs(p.z - cz) < 1.2) continue; // keep the dock clear
    const pad = centred(lilyPad(i * 13 + 5), materials.solid, { shadow: false });
    pad.position.copy(p).add(new Vector3(0, 0.015, 0));
    pad.rotation.y = random() * Math.PI * 2;
    group.add(pad);
  }

  // stones and reeds around the edge
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + random() * 0.35;
    const r = 1.04 + random() * 0.14;
    const p = inPond(Math.cos(a) * POND.rx * r, Math.sin(a) * POND.rz * r);
    if (p.x > cx + 3 && Math.abs(p.z - cz) < 1.4) continue;
    const big = random() > 0.6;
    const stone = centred(rock(i * 7 + 3, big ? 0.8 : 0.55));
    stone.position.set(p.x, heightAt(p.x, p.z) - 0.12, p.z);
    stone.rotation.y = random() * 3;
    group.add(stone);
  }
  for (let i = 0; i < 5; i += 1) {
    const a = 1.9 + i * 0.75 + random() * 0.3;
    const p = inPond(Math.cos(a) * POND.rx * 0.97, Math.sin(a) * POND.rz * 0.97);
    const tuft = centred(reeds(i * 31 + 2), materials.reeds, { shadow: false });
    tuft.position.set(p.x, Math.max(WATER_LEVEL, heightAt(p.x, p.z)) - 0.05, p.z);
    group.add(tuft);
  }

  // the dock, out from the east bank, and someone fishing off its end
  const dockStart = cx + 6.4, dockEnd = cx + 2.4;
  const dock = new Voxels(V, 0.07);
  const length = Math.round((dockStart - dockEnd) / V);
  for (let i = 0; i <= length; i += 1) {
    const tone = i % 3 === 0 ? 0x9b6f45 : i % 3 === 1 ? 0xb88a58 : 0xab7d4d;
    dock.box(i, 0, -3, i, 0, 3, (x, y, z) => (hash3(x, y, z) > 0.93 ? 0x7a5636 : tone));
  }
  for (const i of [1, Math.round(length / 2), length - 1]) {
    for (const z of [-3, 3]) dock.box(i, -5, z, i, -1, z, 0x3b2f28);
  }
  const dockMesh = mesh(dock);
  dockMesh.position.set(dockEnd, WATER_LEVEL + 0.3, cz);
  group.add(dockMesh);

  const fisher = centred(person(OUTFITS.fisher, "sit"));
  fisher.position.set(dockEnd + 0.35, WATER_LEVEL + 0.5, cz + 0.25);
  fisher.rotation.y = -Math.PI / 2;
  group.add(fisher);
  const hand = new Vector3(dockEnd - 0.1, WATER_LEVEL + 1.25, cz + 0.45);
  const tip = new Vector3(dockEnd - 2.1, WATER_LEVEL + 2.6, cz + 1.3);
  group.add(line([hand, tip], 0x2a2420));
  const bobberAt = new Vector3(dockEnd - 2.7, WATER_LEVEL + 0.04, cz + 1.4);
  const fishingLine = line([tip, bobberAt], 0xe9e4d6, true);
  group.add(fishingLine);
  const bobberVox = new Voxels(V * 0.6, 0);
  bobberVox.set(0, 0, 0, 0xf4f1ea);
  bobberVox.set(0, 1, 0, 0xe5484d);
  const bobber = centred(bobberVox, materials.solid, { shadow: false });
  group.add(bobber);
  const ripple = new LineLoop(
    new BufferGeometry().setFromPoints(
      Array.from({ length: 24 }, (_, i) => new Vector3(Math.cos((i / 24) * Math.PI * 2), 0, Math.sin((i / 24) * Math.PI * 2) * 0.8)),
    ),
    new LineBasicMaterial({ color: 0xd8f0ee }),
  );
  ripple.position.copy(bobberAt);
  group.add(ripple);

  // the koi: orange, white and LedgerLens blue, just under the surface
  const fish: Array<{ m: Object3D; rx: number; rz: number; speed: number; phase: number; wobble: number }> = [];
  for (let i = 0; i < 7; i += 1) {
    const m = centred(koi(i * 17 + 3), materials.soft, { shadow: false });
    m.scale.setScalar(0.9 + random() * 0.35);
    group.add(m);
    fish.push({
      m,
      rx: POND.rx * (0.3 + random() * 0.42),
      rz: POND.rz * (0.25 + random() * 0.45),
      speed: (0.12 + random() * 0.12) * (random() > 0.5 ? 1 : -1),
      phase: random() * Math.PI * 2,
      wobble: random() * 10,
    });
  }

  return {
    object: group,
    spot: {
      id: "ledgerlens-pond",
      slug: "ledgerlens",
      object: group,
      anchor: centre.clone().add(new Vector3(0, 1.4, 0)),
      focus: centre.clone(),
    },
    update: (time) => {
      for (const f of fish) {
        const a = f.phase + time * f.speed;
        const u = Math.cos(a) * f.rx + Math.sin(a * 2.3 + f.wobble) * 0.5;
        const v = Math.sin(a) * f.rz + Math.cos(a * 1.7 + f.wobble) * 0.4;
        const p = inPond(u, v);
        const a2 = a + 0.02 * Math.sign(f.speed);
        const q = inPond(Math.cos(a2) * f.rx + Math.sin(a2 * 2.3 + f.wobble) * 0.5, Math.sin(a2) * f.rz + Math.cos(a2 * 1.7 + f.wobble) * 0.4);
        f.m.position.set(p.x, WATER_LEVEL - 0.02, p.z);
        f.m.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x) + Math.sin(time * 6 + f.wobble) * 0.18;
      }
      const bite = Math.sin(time * 0.9) > 0.93;
      bobber.position.set(bobberAt.x, WATER_LEVEL + (bite ? -0.04 : 0.02 + Math.sin(time * 2.2) * 0.025), bobberAt.z);
      const cycle = (time * 0.45) % 1;
      ripple.visible = cycle < 0.6;
      ripple.scale.setScalar(0.2 + cycle * 0.9);
      ripple.position.set(bobberAt.x, WATER_LEVEL + 0.01, bobberAt.z);
    },
  };
}

// ——— Continuity: the bridge, the thread, and the handoff ——————————————

export function continuityBridge(): Place {
  const group = new Group();
  const [bx, bz] = at(BRIDGE.s, BRIDGE.t);
  const deckY = heightAt(bx - 3.4, bz) * 0.5 + heightAt(bx + 3.4, bz) * 0.5;
  const L = 30, arch = 5, half = 3;
  const stone = (x: number, y: number, z: number) => {
    const r = hash3(x, y, z);
    if (r > 0.94) return 0x8fa465;
    return [0xb9b3a7, 0xa9a397, 0x9c968b, 0xc7c1b4][Math.floor(r * 4)];
  };
  const bridge = new Voxels(V, 0.06);
  for (let i = 0; i <= L; i += 1) {
    const y = Math.round(arch * Math.sin((Math.PI * i) / L));
    bridge.box(i, y - 2, -half, i, y, half, stone);
    bridge.box(i, y + 1, -half, i, y + 2, -half, stone);
    bridge.box(i, y + 1, half, i, y + 2, half, stone);
    if (i % 5 === 0) {
      bridge.set(i, y + 3, -half, 0xd9d3c6);
      bridge.set(i, y + 3, half, 0xd9d3c6);
    }
  }
  // ramps down to the banks
  for (let i = -3; i < 0; i += 1) bridge.box(i, -2, -half + 1, i, Math.round((i + 3) * 0.5) - 2, half - 1, stone);
  for (let i = L + 1; i <= L + 3; i += 1) bridge.box(i, -2, -half + 1, i, Math.round((L + 3 - i) * 0.5) - 2, half - 1, stone);
  const deck = mesh(bridge);
  deck.position.set(bx - (L * V) / 2, deckY + 0.05, bz);
  group.add(deck);

  // two posts, and a red thread between them with the letters pegged on it
  const thread = 0xd74718;
  const postA = new Vector3(bx - (L * V) / 2 - 0.9, heightAt(bx - (L * V) / 2 - 0.9, bz - 1.1), bz - 1.1);
  const postB = new Vector3(bx + (L * V) / 2 + 0.9, heightAt(bx + (L * V) / 2 + 0.9, bz - 1.1), bz - 1.1);
  for (const p of [postA, postB]) {
    const post = new Voxels(V, 0.05);
    post.box(0, 0, 0, 0, 12, 0, 0x4a3a2e);
    post.set(0, 13, 0, thread);
    const m = mesh(post);
    m.position.set(p.x - V / 2, p.y - 0.05, p.z - V / 2);
    group.add(m);
  }
  const topA = postA.clone().add(new Vector3(0, 2.6, 0));
  const topB = postB.clone().add(new Vector3(0, 2.6, 0));
  const sag: Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    sag.push(topA.clone().lerp(topB, t).add(new Vector3(0, -Math.sin(Math.PI * t) * 0.8, 0)));
  }
  group.add(line(sag, thread));
  for (const t of [0.3, 0.5, 0.7]) {
    const letter = centred(envelope(thread), materials.solid, { shadow: true });
    const p = sag[Math.round(t * 24)];
    letter.position.set(p.x, p.y - 0.42, p.z + 0.02);
    group.add(letter);
  }

  // Agent A hands the thread to Agent B
  const a = centred(agent(thread));
  const b = centred(agent(0x2bc48a));
  const aAt = new Vector3(bx - (L * V) / 2 - 1.3, 0, bz + 0.5);
  const bAt = new Vector3(bx + (L * V) / 2 + 1.3, 0, bz + 0.5);
  aAt.y = heightAt(aAt.x, aAt.z);
  bAt.y = heightAt(bAt.x, bAt.z);
  a.position.copy(aAt);
  b.position.copy(bAt);
  a.rotation.y = Math.PI / 2;
  b.rotation.y = -Math.PI / 2;
  group.add(a, b);
  const flying = centred(envelope(thread), materials.solid, { shadow: true });
  group.add(flying);
  const from = aAt.clone().add(new Vector3(0.35, 0.95, 0));
  const to = bAt.clone().add(new Vector3(-0.35, 0.95, 0));

  const centre = new Vector3(bx, deckY + 1, bz);
  return {
    object: group,
    spot: {
      id: "continuity",
      slug: "continuity",
      object: group,
      anchor: centre.clone().add(new Vector3(0, 2.6, 0)),
      focus: centre.clone(),
    },
    update: (time) => {
      const cycle = (time % 5.2) / 5.2;
      const t = ease(clamp01((cycle - 0.15) / 0.5));
      const p = from.clone().lerp(to, t);
      p.y += Math.sin(Math.PI * t) * 1.9;
      flying.position.copy(p);
      flying.rotation.y = 0;
      flying.visible = cycle < 0.85;
      b.position.y = bAt.y + (cycle > 0.66 && cycle < 0.74 ? 0.12 : 0);
    },
  };
}

// ——— Seyrin: the inbox, the work, the check ————————————————————————————

export function seyrinDesk(): Place {
  const group = new Group();
  const base = ground(-4, 11);
  base.y = padHeight("seyrin");

  // mailbox in Seyrin violet, its red flag up when there's mail
  const box = new Voxels(V, 0.04);
  box.box(0, 0, 0, 0, 4, 0, 0x6b4a32);
  box.box(-2, 5, -1, 2, 7, 1, (x, y) => (y === 7 && Math.abs(x) === 2 ? null : y === 7 ? 0x6d62e6 : 0x5b4fd6));
  box.box(3, 5, -1, 3, 6, 1, 0x4436b5);
  box.set(3, 6, 0, 0x1f1a4d);
  const mailbox = mesh(box);
  mailbox.position.set(base.x - 1.4, base.y, base.z - 0.6);
  group.add(mailbox);
  const flagV = new Voxels(V, 0);
  flagV.box(0, 0, 0, 0, 3, 0, 0x8a8f99);
  flagV.box(1, 2, 0, 2, 3, 0, 0xe5484d);
  const flag = new Group();
  const flagMesh = mesh(flagV);
  flagMesh.position.set(-V / 2, 0, -V / 2);
  flag.add(flagMesh);
  flag.position.set(base.x - 1.4 + V * -0.5, base.y + V * 5.6, base.z - 0.6 - V * 1.6);
  group.add(flag);

  // the desk, a laptop, and the agent at work
  const desk = new Voxels(V, 0.05);
  desk.box(0, 4, 0, 6, 4, 3, (x, y, z) => (hash3(x, y, z) > 0.9 ? 0xb08a58 : 0xc9a46c));
  for (const [x, z] of [[0, 0], [6, 0], [0, 3], [6, 3]]) desk.box(x, 0, z, x, 3, z, 0x5a4330);
  desk.box(2, 5, 1, 4, 5, 2, 0x9aa1ab);
  desk.box(2, 6, 0, 4, 7, 0, 0x2b2f36);
  const deskMesh = mesh(desk);
  deskMesh.position.set(base.x + 0.1, base.y, base.z - 0.5);
  group.add(deskMesh);
  const screenV = new Voxels(V * 0.5, 0);
  screenV.box(0, 0, 0, 3, 2, 0, 0xeae6ff);
  const screen = mesh(screenV, materials.glow, { shadow: false });
  screen.position.set(base.x + 0.1 + 2.2 * V, base.y + 6.2 * V, base.z - 0.5 + V * 1.02);
  group.add(screen);
  const worker = centred(agent(0x8b7ff0));
  worker.position.set(base.x + 0.1 + 3 * V + 0.1, base.y, base.z - 0.5 + 6 * V);
  worker.rotation.y = Math.PI;
  group.add(worker);

  // the green check that means "proved in a browser"
  const checkV = new Voxels(V * 0.55, 0);
  checkV.sprite(["....#", "...##", "#.##.", "###..", ".#..."], { "#": 0x2bc48a }, 0, 0, 0, "x");
  const check = centred(checkV, materials.glow, { shadow: false });
  group.add(check);
  const checkAt = new Vector3(base.x + 0.1 + 3 * V, base.y + 2.2, base.z - 0.5);

  for (const [dx, dz, seed] of [[-2.6, 1.4, 4], [1.9, -2.2, 9]] as const) {
    const b = centred(bush(seed, seed === 4 ? 0xf2f0ea : undefined));
    b.position.set(base.x + dx, heightAt(base.x + dx, base.z + dz) - 0.05, base.z + dz);
    group.add(b);
  }

  return {
    object: group,
    spot: { id: "seyrin", slug: "seyrin", object: group, anchor: base.clone().add(new Vector3(0, 2.8, 0)), focus: base.clone().add(new Vector3(0, 0.6, 0)) },
    update: (time) => {
      const cycle = (time % 7) / 7;
      const up = cycle > 0.08 && cycle < 0.8;
      flag.rotation.x = up ? 0 : Math.PI / 2;
      const working = cycle > 0.22 && cycle < 0.58;
      worker.position.y = base.y + (working ? Math.abs(Math.sin(time * 9)) * 0.06 : 0);
      screen.visible = !working || Math.sin(time * 23) > -0.6;
      const shown = cycle > 0.58 && cycle < 0.9;
      check.visible = shown;
      const pop = clamp01((cycle - 0.58) / 0.05);
      check.scale.setScalar(shown ? 0.6 + 0.4 * pop + Math.sin(pop * Math.PI) * 0.25 : 1);
      check.position.copy(checkAt).add(new Vector3(0, Math.sin(time * 2) * 0.05, 0));
    },
  };
}

// ——— Rally: a ping-pong table and two capsules mid-rally —————————————————

function pixelDigits(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 9;
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  const glyphs: Record<string, string[]> = {
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
  const draw = (value: string) => {
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#151b26";
    g.fillRect(0, 0, 24, 9);
    g.fillStyle = "#2a3446";
    g.fillRect(11, 1, 2, 7);
    [...value].forEach((ch, i) => {
      const rows = glyphs[ch];
      if (!rows) return;
      const ox = i === 0 ? 3 : 15;
      g.fillStyle = i === 0 ? "#f4f6fb" : "#ff8a2a";
      rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && g.fillRect(ox + x * 2, 2 + y, 2, 1)));
    });
    texture.needsUpdate = true;
  };
  draw(text);
  return { texture, draw };
}

export function rallyTable(): Place {
  const group = new Group();
  const pad = PADS.rally;
  const base = ground(pad.s, pad.t);
  base.y = padHeight("rally");

  const terrace = new Voxels(V, 0.04);
  const hx = Math.round(pad.hx / V), hz = Math.round(pad.hz / V);
  terrace.box(-hx, 0, -hz, hx, 0, hz, (x, y, z) =>
    (x + 1000) % 6 === 0 || (z + 1000) % 6 === 0 ? 0xc6bdaa : hash3(x, y, z) > 0.9 ? 0xcfc7b6 : 0xddd6c6);
  const slab = mesh(terrace, materials.solid, { shadow: false });
  slab.position.set(base.x, base.y - V * 0.75, base.z);
  group.add(slab);

  const table = new Voxels(V, 0.03);
  table.box(-8, 4, -4, 8, 4, 4, (x, y, z) => (Math.abs(x) === 8 || Math.abs(z) === 4 || z === 0 ? 0xf3f5fa : 0x2f6fe4));
  for (const [x, z] of [[-7, -3], [7, -3], [-7, 3], [7, 3]]) table.box(x, 0, z, x, 3, z, 0x1d2430);
  table.box(0, 5, -5, 0, 5, 5, 0x2a2f3a);
  table.box(0, 6, -5, 0, 6, 5, 0xf3f5fa);
  const tableMesh = mesh(table);
  tableMesh.position.set(base.x, base.y + V * 0.25, base.z);
  group.add(tableMesh);
  const topY = base.y + V * 5.25;

  const players = [-1, 1].map((side) => {
    const p = new Group();
    const body = centred(capsule());
    const bat = centred(paddle(), materials.solid);
    bat.position.set(0, 0.95, 0.42);
    p.add(body, bat);
    p.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(p);
    return { p, bat, side };
  });

  const ballV = new Voxels(V * 0.55, 0);
  ballV.set(0, 0, 0, 0xff8a2a);
  const ball = centred(ballV, materials.solid, { shadow: true });
  group.add(ball);

  const { texture, draw } = pixelDigits("72");
  const board = new Group();
  const boardPost = new Voxels(V, 0.03);
  boardPost.box(0, 0, 0, 0, 6, 0, 0x30384a);
  board.add(mesh(boardPost));
  const face = new Mesh(new PlaneGeometry(1.5, 0.56), new MeshBasicMaterial({ map: texture }));
  face.position.set(0.1, 1.55, 0.12);
  board.add(face);
  board.position.set(base.x + 0.4, base.y, base.z - pad.hz + 0.5);
  group.add(board);

  let score = [7, 2];
  let lastPoint = 0;
  return {
    object: group,
    spot: { id: "rally", slug: "rally", object: group, anchor: base.clone().add(new Vector3(0, 2.6, 0)), focus: base.clone().add(new Vector3(0, 0.6, 0)) },
    update: (time) => {
      const period = 0.95;
      const leg = Math.floor(time / period);
      const u = (time % period) / period;
      const dir = leg % 2 === 0 ? 1 : -1;
      const lateral = Math.sin(leg * 1.9) * 0.55;
      const lateralNext = Math.sin((leg + 1) * 1.9) * 0.55;
      const x = dir * (-2.1 + 4.2 * u);
      const z = lateral + (lateralNext - lateral) * u;
      const bounce = 0.72;
      const y =
        u < bounce
          ? topY + 0.32 + Math.sin((u / bounce) * Math.PI) * 0.55 - (u / bounce) * 0.32
          : topY + Math.sin(((u - bounce) / (1 - bounce)) * Math.PI * 0.5) * 0.38;
      ball.position.set(base.x + x, y, base.z + z);
      for (const { p, bat, side } of players) {
        const toward = side === dir ? 1 - u : u;
        p.position.set(base.x + side * 2.45, base.y + V * 0.25, base.z + z * (side === dir ? 0.3 : 0.85));
        bat.rotation.z = Math.sin(clamp01(1 - toward * 4) * Math.PI) * 0.9;
      }
      if (time - lastPoint > 9.5) {
        lastPoint = time;
        score = score[0] >= 11 ? [0, 0] : [score[0] + (Math.random() > 0.4 ? 1 : 0), score[1] + 1];
        draw(`${Math.min(9, score[0] % 10)}${Math.min(9, score[1] % 10)}`);
      }
    },
  };
}

// ——— CourtVision: a half court, a game, and the one camera watching it ————

export function court(): Place {
  const group = new Group();
  const pad = PADS.court;
  const base = ground(pad.s, pad.t);
  base.y = padHeight("court");
  const hx = Math.round(pad.hx / V) - 1, hz = Math.round(pad.hz / V) - 1;
  const hoopZ = -hz + 5;
  const c = new Voxels(V, 0.02);
  const asphalt = [0x3a3d43, 0x41444b, 0x35383d, 0x474a51];
  c.box(-hx - 1, 0, -hz - 1, hx + 1, 0, hz + 1, (x, y, z) => {
    if (Math.abs(x) === hx + 1 || Math.abs(z) === hz + 1) return hash3(x, y, z) > 0.5 ? 0xa0623e : 0x92573a;
    const line = 0xeceae4;
    const key = Math.abs(x) <= 7 && z <= hoopZ + 13 && z >= -hz;
    if (z === -hz || Math.abs(x) === hx || z === hz) return line;
    const fromHoop = Math.hypot(x, z - hoopZ);
    if (Math.abs(fromHoop - 19.5) < 0.6 && z > hoopZ) return line;
    if (Math.abs(x) >= 18 && z <= hoopZ && Math.abs(x) <= 19) return line;
    if (key && (Math.abs(x) === 7 || z === hoopZ + 13)) return line;
    if (Math.abs(Math.hypot(x, z - (hoopZ + 13)) - 5.5) < 0.55 && z > hoopZ + 13) return line;
    if (Math.abs(Math.hypot(x, z - hz) - 5.5) < 0.55 && z < hz) return line;
    if (key) return hash3(x, y, z) > 0.8 ? 0x4775bd : 0x3f6db5;
    return asphalt[Math.floor(hash3(x, y, z) * asphalt.length)];
  });
  const slab = mesh(c, materials.solid, { shadow: false });
  slab.position.set(base.x, base.y - V * 0.8, base.z);
  group.add(slab);

  // the hoop
  const hoop = new Voxels(V, 0.03);
  hoop.box(0, 0, -2, 0, 17, -2, 0x1d2740);
  hoop.box(0, 17, -2, 0, 17, 0, 0x1d2740);
  hoop.box(-4, 13, 0, 4, 18, 0, (x, y) => (Math.abs(x) === 4 || y === 13 || y === 18 ? 0xd94a3a : x >= -1 && x <= 1 && y >= 14 && y <= 15 ? (Math.abs(x) === 1 || y === 14 ? 0xd94a3a : 0xf5f5f2) : 0xf5f5f2));
  hoop.box(-1, 13, 1, 1, 13, 3, (x, y, z) => (x === 0 && z === 2 ? null : 0xf26b1d));
  hoop.box(-1, 11, 1, 1, 12, 3, (x, y, z) => (x === 0 && z === 2 ? null : hash3(x, y, z) > 0.4 ? 0xf2f2ee : null));
  const hoopMesh = mesh(hoop);
  hoopMesh.position.set(base.x, base.y, base.z + (-hz - 1) * V);
  group.add(hoopMesh);
  const rim = new Vector3(base.x, base.y + 13.5 * V, base.z + (-hz - 1 + 2) * V);

  // players, each with the ring CourtVision draws under them
  const outfits = [OUTFITS.orange, OUTFITS.blue, OUTFITS.white];
  const rings = [0xf08a32, 0x5b7cf0, 0xf08a32];
  const random = rng(5);
  const players = outfits.map((outfit, i) => {
    const p = new Group();
    p.add(centred(person(outfit)));
    const ring = new LineLoop(
      new BufferGeometry().setFromPoints(Array.from({ length: 16 }, (_, k) => new Vector3(Math.cos((k / 16) * Math.PI * 2) * 0.42, 0.03, Math.sin((k / 16) * Math.PI * 2) * 0.42))),
      new LineBasicMaterial({ color: rings[i] }),
    );
    p.add(ring);
    group.add(p);
    return { p, from: new Vector3(), to: new Vector3(), start: 0, seed: random() * 10 };
  });
  const spots = [
    [-2.5, -0.5], [2.6, 0.4], [0, 2.4], [-3.4, 1.8], [3.3, 2.2], [-1.2, -1.6], [1.4, -1.2], [0.4, 3.6],
  ].map(([x, z]) => new Vector3(base.x + x, base.y, base.z + z));
  players.forEach((p, i) => {
    p.from.copy(spots[i]);
    p.to.copy(spots[(i + 3) % spots.length]);
  });

  const ballV = new Voxels(V * 0.7, 0);
  ballV.box(0, 0, 0, 1, 1, 1, 0xe8712a);
  const ball = centred(ballV, materials.solid);
  group.add(ball);

  // the camera on its tripod, and its recording light
  const cam = new Voxels(V * 0.8, 0.03);
  cam.box(0, 0, 0, 0, 8, 0, 0x2b2f36);
  cam.box(-2, 0, 0, -1, 4, 0, 0x2b2f36);
  cam.box(1, 0, 0, 2, 4, 0, 0x2b2f36);
  cam.box(-1, 9, -1, 2, 11, 1, 0x1c1f24);
  cam.box(-2, 10, 0, -2, 10, 0, 0x8b939f);
  const camMesh = centred(cam);
  camMesh.position.set(base.x + (hx + 3) * V, base.y, base.z + 1.2);
  group.add(camMesh);
  const recV = new Voxels(V * 0.4, 0);
  recV.set(0, 0, 0, 0xff3b30);
  const rec = centred(recV, materials.glow, { shadow: false });
  rec.position.set(base.x + (hx + 3) * V + 0.25, base.y + 9.4 * V, base.z + 1.2 + 0.12);
  group.add(rec);

  let shooter = 0;
  return {
    object: group,
    spot: { id: "courtvision", slug: "courtvision", object: group, anchor: base.clone().add(new Vector3(0, 3.6, -1)), focus: base.clone().add(new Vector3(0, 0.8, 0)) },
    update: (time) => {
      for (const p of players) {
        const t = clamp01((time - p.start) / 2.6);
        p.p.position.copy(p.from).lerp(p.to, ease(t));
        p.p.position.y = base.y + (t > 0 && t < 1 ? Math.abs(Math.sin(time * 9 + p.seed)) * 0.05 : 0);
        const d = p.to.clone().sub(p.from);
        if (d.lengthSq() > 0.01) p.p.rotation.y = Math.atan2(d.x, d.z);
        if (t >= 1 && time - p.start > 3.2 + p.seed * 0.1) {
          p.from.copy(p.to);
          p.to.copy(spots[Math.floor(Math.random() * spots.length)]);
          p.start = time;
        }
      }
      const cycle = (time % 4.2) / 4.2;
      if (cycle < 0.02) shooter = Math.floor(time / 4.2) % players.length;
      const hand = players[shooter].p.position.clone().add(new Vector3(0, 1.75, 0));
      if (cycle < 0.25) {
        ball.position.copy(hand).add(new Vector3(0.25, Math.abs(Math.sin(cycle * 40)) * -0.9, 0.1));
      } else if (cycle < 0.6) {
        const t = (cycle - 0.25) / 0.35;
        ball.position.copy(hand).lerp(rim, t);
        ball.position.y += Math.sin(Math.PI * t) * 1.6;
      } else {
        const t = (cycle - 0.6) / 0.4;
        ball.position.copy(rim).add(new Vector3(0, -t * 2.2 + Math.abs(Math.sin(t * 7)) * 0.4 * (1 - t), t * 0.8));
        ball.position.y = Math.max(base.y + 0.08, ball.position.y);
      }
      rec.visible = Math.sin(time * 4) > -0.2;
    },
  };
}

// ——— PigeonBox: a dovecote and its pigeons ——————————————————————————

export function dovecote(): Place {
  const group = new Group();
  const base = ground(25, -15);
  base.y = padHeight("dovecote");
  const d = new Voxels(V, 0.05);
  d.box(0, 0, 0, 1, 15, 1, 0x7a5a3c);
  d.box(-4, 16, -4, 5, 22, 5, (x, y) => (y === 16 ? 0xd8d2c4 : 0xf2efe8));
  for (const [x, y] of [[-2, 19], [2, 19], [-2, 17], [2, 17]]) {
    d.box(x, y, 5, x + 1, y + 1, 5, 0x2a2d33);
    d.box(x - 1, y - 1, 6, x + 2, y - 1, 6, 0x9a7650);
    d.box(5, y, x, 5, y + 1, x + 1, 0x2a2d33);
    d.box(6, y - 1, x - 1, 6, y - 1, x + 2, 0x9a7650);
  }
  for (let k = 0; k < 5; k += 1) d.box(-5 + k, 23 + k, -5 + k, 6 - k, 23 + k, 6 - k, k % 2 ? 0x5a7aa3 : 0x3f5f86);
  d.set(0, 28, 0, 0x3f5f86);
  const house = mesh(d);
  house.position.set(base.x - V, base.y, base.z - V);
  group.add(house);

  const perched = [
    [0.4, 5.75, -0.6, 0.3],
    [-0.5, 5.75, 0.4, 2.2],
    [1.25, 3.6, 0.4, 1.4],
  ];
  for (const [x, y, z, r] of perched) {
    const p = centred(pigeon());
    p.position.set(base.x + x, base.y + y, base.z + z);
    p.rotation.y = r;
    group.add(p);
  }
  const flock = [0, 1, 2].map((i) => {
    const g = new Group();
    g.add(centred(pigeon(i === 0)));
    const left = centred(wing(), materials.solid);
    const right = centred(wing(), materials.solid);
    left.position.set(0.05, 0.25, 0.25);
    right.position.set(0.05, 0.25, -0.25);
    g.add(left, right);
    group.add(g);
    return { g, left, right, radius: 2.4 + i * 0.7, height: 4 + i * 0.6, speed: 0.55 - i * 0.08, phase: i * 2.1 };
  });

  return {
    object: group,
    spot: { id: "pigeonbox", slug: "pigeonbox", object: group, anchor: base.clone().add(new Vector3(0, 6.6, 0)), focus: base.clone().add(new Vector3(0, 3, 0)) },
    update: (time) => {
      for (const f of flock) {
        const a = f.phase + time * f.speed;
        f.g.position.set(base.x + Math.cos(a) * f.radius, base.y + f.height + Math.sin(time * 1.3 + f.phase) * 0.35, base.z + Math.sin(a) * f.radius);
        f.g.rotation.y = -a - Math.PI;
        const flap = Math.sin(time * 14 + f.phase) * 0.9;
        f.left.rotation.x = flap;
        f.right.rotation.x = -flap;
      }
    },
  };
}

// ——— BarkOff: two corgis, one question ————————————————————————————————

export function corgis(): Place {
  const group = new Group();
  const base = ground(-12, 19);
  base.y = padHeight("corgis");
  const dogs = [-1, 1].map((side) => {
    const g = centred(corgi());
    g.position.set(base.x + side * 0.95, base.y, base.z);
    g.rotation.y = side < 0 ? 0 : Math.PI;
    group.add(g);
    const barkV = new Voxels(V * 0.6, 0);
    barkV.sprite([".#..", "#.#.", "#..#", "#.#.", ".#.."], { "#": 0xffffff }, 0, 0, 0, "z");
    const bark = centred(barkV, materials.glow, { shadow: false });
    bark.position.set(base.x + side * 0.05, base.y + 0.75, base.z);
    bark.rotation.y = side < 0 ? 0 : Math.PI;
    group.add(bark);
    return { g, bark, side };
  });
  const trophy = new Voxels(V * 0.7, 0.03);
  trophy.box(-2, 0, -2, 2, 2, 2, 0x8a6a48);
  trophy.box(-1, 3, -1, 1, 3, 1, 0xc9971f);
  trophy.box(0, 4, 0, 0, 4, 0, 0xc9971f);
  trophy.box(-2, 5, -2, 2, 7, 2, (x, y, z) => (Math.abs(x) === 2 && Math.abs(z) === 2 ? null : y === 7 ? 0xffe07a : 0xf2c230));
  trophy.set(-3, 6, 0, 0xf2c230);
  trophy.set(3, 6, 0, 0xf2c230);
  const cup = centred(trophy);
  cup.position.set(base.x, base.y, base.z - 1.3);
  group.add(cup);

  return {
    object: group,
    spot: { id: "barkoff", slug: "barkoff", object: group, anchor: base.clone().add(new Vector3(0, 2, 0)), focus: base.clone().add(new Vector3(0, 0.5, 0)) },
    update: (time) => {
      const turn = Math.floor(time / 1.1) % 2;
      const u = (time % 1.1) / 1.1;
      dogs.forEach(({ g, bark, side }, i) => {
        const barking = i === turn && u < 0.35;
        g.position.y = base.y + (barking ? Math.sin((u / 0.35) * Math.PI) * 0.16 : 0);
        bark.visible = barking && u > 0.06;
        bark.position.x = base.x + side * (0.08 - u * 0.4) * -1;
      });
    },
  };
}

// ——— alai: a chalkboard, a wrong step, and Ally ———————————————————————

export function chalkboard(): Place {
  const group = new Group();
  const base = ground(5, 20);
  base.y = padHeight("alai");
  const easel = new Voxels(V, 0.04);
  for (const x of [-8, 8]) easel.limb(x, 0, 1.5, x, 17, 0, 0.6, 0.5, 0x9a7650);
  easel.limb(0, 0, -3, 0, 16, 0, 0.5, 0.5, 0x8a6a48);
  easel.box(-9, 5, 0, 9, 17, 0, (x, y) => (Math.abs(x) === 9 || y === 5 || y === 17 ? 0xc8a06a : 0x23392f));
  easel.box(-8, 5, 1, 8, 5, 1, 0xc8a06a);
  const easelMesh = mesh(easel);
  easelMesh.position.copy(base);
  group.add(easelMesh);

  // chalk: "3x+4=19", then a wrong step, underlined in Ally's yellow
  const chalk = new Voxels(0.145, 0);
  const glyph: Record<string, string[]> = {
    "3": ["##", ".#", "##", ".#", "##"],
    x: ["..", "#.", ".#", "#.", ".."],
    "+": ["..", ".#", "##", ".#", ".."],
    "4": ["#.", "#.", "##", ".#", ".#"],
    "=": ["..", "##", "..", "##", ".."],
    "1": [".#", ".#", ".#", ".#", ".#"],
    "9": ["##", "##", ".#", ".#", ".#"],
    "2": ["##", ".#", "##", "#.", "##"],
  };
  const write = (text: string, x0: number, y0: number, tone: number) => {
    let x = x0;
    for (const ch of text) {
      const rows = glyph[ch];
      if (rows) chalk.sprite(rows, { "#": tone }, x, y0, 0, "x");
      x += 3;
    }
  };
  write("3x+4=19", -10, 9, 0xf4f2ea);
  write("3x=23", -10, 2, 0xe2e0d6);
  chalk.box(-4, 0, 0, 4, 0, 0, 0xffd23f);
  const writing = mesh(chalk, materials.soft, { shadow: false });
  writing.position.set(base.x + 0.05, base.y + 6.6 * V, base.z + V * 0.55);
  group.add(writing);

  const bird = centred(ally());
  const perch = new Vector3(base.x + 0.8, base.y + 18 * V, base.z);
  group.add(bird);
  return {
    object: group,
    spot: { id: "alai", slug: "alai", object: group, anchor: base.clone().add(new Vector3(0, 4.9, 0)), focus: base.clone().add(new Vector3(0, 1.6, 0)) },
    update: (time) => {
      const hop = (time % 3.4) / 3.4;
      bird.position.copy(perch);
      bird.position.y += hop < 0.12 ? Math.sin((hop / 0.12) * Math.PI) * 0.28 : 0;
      bird.rotation.y = hop > 0.5 ? 0.6 : -0.2;
    },
  };
}

// ——— Aiden, standing in the yellow field ————————————————————————————

export function aiden(): Place {
  const group = new Group();
  const base = ground(6, -2);
  base.y = padHeight("aiden");
  const me = centred(person(OUTFITS.aiden));
  me.position.copy(base);
  me.rotation.y = Math.PI * 0.82;
  group.add(me);
  return {
    object: group,
    spot: { id: "aiden", slug: "about", object: group, anchor: base.clone().add(new Vector3(0, 2.4, 0)), focus: base.clone().add(new Vector3(0, 0.8, 0)) },
    // looking out over the island, now and then turning to take in more of it
    update: (time) => {
      me.rotation.y = Math.PI * 0.82 + Math.sin(time * 0.23) * 0.45 + Math.sin(time * 0.61) * 0.12;
    },
  };
}

// ——— scenery: trees, bushes, stones, butterflies ——————————————————————

export function scenery(): Place[] {
  const places: Place[] = [];
  const trees: Array<[number, number, number]> = [
    [-14, -28, 1.1], [8, -30, 1.25], [17, -27, 0.95], [-22, -18, 1], [-30, -5, 1.15], [-28, 15, 0.9],
    [29, -5, 1], [31, 7, 0.85], [21, 24, 1.05], [-21, 25, 0.8], [-8, -31, 0.85], [24, -24, 0.75],
    [-31, 4, 0.75], [33, -12, 0.7],
  ];
  trees.forEach(([s, t, size], i) => {
    const tree = centred(roundTree(i * 7 + 2, size), materials.foliage, { seed: i });
    tree.position.copy(ground(s, t)).add(new Vector3(0, -0.15, 0));
    tree.rotation.y = i * 1.3;
    places.push({ object: tree });
  });
  const bushes: Array<[number, number, number?]> = [
    [10, 15, 0xf6c4d6], [20, 17], [8, 3], [-18, 13, 0xf2f0ea], [-24, 10], [12, -18], [-8, -14], [2, 25, 0xf7d046],
    [-14, 30], [26, -9, 0xf2f0ea], [18, -4], [-2, 2],
  ];
  bushes.forEach(([s, t, flower], i) => {
    const b = centred(bush(i * 11 + 1, flower));
    b.position.copy(ground(s, t)).add(new Vector3(0, -0.06, 0));
    places.push({ object: b });
  });
  const stones: Array<[number, number, number]> = [[14, 22, 1], [-26, 20, 0.8], [30, -1, 0.9], [-10, 25, 0.6], [4, -12, 0.7], [-20, -12, 0.9]];
  stones.forEach(([s, t, k], i) => {
    const r = centred(rock(i * 5 + 40, k));
    r.position.copy(ground(s, t)).add(new Vector3(0, -0.1, 0));
    r.rotation.y = i;
    places.push({ object: r });
  });

  // butterflies over the flowers
  const flutter: Array<{ m: Object3D; home: Vector3; phase: number }> = [];
  const group = new Group();
  [[5, -3], [7, 0], [-1, 25], [6, 27]].forEach(([s, t], i) => {
    const v = new Voxels(V * 0.5, 0);
    const tone = i % 2 ? 0xfff6c9 : 0xffffff;
    v.set(0, 0, 0, tone);
    v.set(0, 0, 1, tone);
    v.set(1, 0, 0, 0x3a3020);
    const m = mesh(v, materials.soft, { shadow: false });
    group.add(m);
    flutter.push({ m, home: ground(s, t), phase: i * 1.7 });
  });
  places.push({
    object: group,
    update: (time) => {
      for (const f of flutter) {
        const a = time * 0.6 + f.phase;
        f.m.position.set(f.home.x + Math.sin(a) * 1.4, f.home.y + 0.7 + Math.sin(time * 5 + f.phase) * 0.18, f.home.z + Math.cos(a * 1.3) * 1.1);
        f.m.scale.z = Math.abs(Math.sin(time * 16 + f.phase)) + 0.2;
      }
    },
  });
  return places;
}

export function clouds(): Place {
  const group = new Group();
  const items: Array<{ m: Object3D; s: number; t: number; y: number; phase: number }> = [];
  [[-27, -24, 10, 26], [27, -25, 11, 22], [-6, -40, 16, 16], [40, -6, 9, 14]].forEach(([s, t, y, width], i) => {
    const m = centred(cloud(i * 19 + 4, width), materials.cloud, { shadow: false, occlude: false, receive: false });
    group.add(m);
    items.push({ m, s, t, y, phase: i * 1.9 });
  });
  return {
    object: group,
    update: (time) => {
      for (const c of items) {
        const s = c.s + Math.sin(time * 0.045 + c.phase) * 5;
        const [x, z] = at(s, c.t);
        c.m.position.set(x, c.y + Math.sin(time * 0.3 + c.phase) * 0.15, z);
      }
    },
  };
}


// ——— night: lamps along the paths and fireflies over the water ——————————

export function nightLights(): Place[] {
  const places: Place[] = [];
  const lamps: Array<[number, number]> = [[-6.2, -9], [-2.5, 9.5], [-17.5, 7], [12.5, 14.5], [15.6, -4], [18.5, -13], [1.6, 17]];
  for (const [s, t] of lamps) {
    const { post, glass } = lampPost();
    const g = new Group();
    g.add(centred(post), centred(glass, materials.lamp, { shadow: false, occlude: false }));
    g.position.copy(ground(s, t)).add(new Vector3(0, -0.05, 0));
    places.push({ object: g });
  }
  const random = rng(77);
  const group = new Group();
  const flies: Array<{ m: Object3D; home: Vector3; phase: number; r: number }> = [];
  const homes: Array<[number, number, number]> = [[-12, -5, 6], [-21, 5, 3], [-12, 19, 3], [6, -2, 5], [-2, 26, 6], [24, -14, 3]];
  for (let i = 0; i < 34; i += 1) {
    const [s, t, r] = homes[i % homes.length];
    const v = new Voxels(V * 0.6, 0);
    v.set(0, 0, 0, i % 4 === 0 ? 0xfff2a8 : 0xd9ff7a);
    const m = mesh(v, materials.firefly, { shadow: false, occlude: false });
    group.add(m);
    flies.push({ m, home: ground(s + (random() - 0.5) * r * 2, t + (random() - 0.5) * r * 2), phase: random() * 20, r: 0.6 + random() * 1.4 });
  }
  places.push({
    object: group,
    update: (time) => {
      for (const f of flies) {
        const a = time * 0.35 + f.phase;
        f.m.position.set(
          f.home.x + Math.sin(a) * f.r,
          Math.max(f.home.y, 0.12) + 0.5 + Math.sin(a * 1.7 + f.phase) * 0.35,
          f.home.z + Math.cos(a * 0.8) * f.r,
        );
      }
    },
  });
  return places;
}
