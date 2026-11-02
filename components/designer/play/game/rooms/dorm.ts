import { Color, DirectionalLight, Group, HemisphereLight, Mesh, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, indoorFloor, letters, meshOf, type Collider, type Room, type Spot } from "./common";

// A double in a Berkeley dorm: two twin beds, two desks, cinderblock painted
// cream, a window with the Campanile in it. Aiden's half has the cobalt
// bedding, the pennant, string lights and Phoebe in a frame; Miles's half
// has a jacket thrown on the bed, because he's always on his way out. What's on the desk changes with the
// chapter: textbooks, then tissues and Tylenol, then an iPad and trophies.
//
// 84 × 64 voxels; the back wall at z = −3.2, the door on the left wall.

const W = 84;
const D = 64;
const H = 32;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

export type DormFeature = "sick" | "boxes" | "trophies" | "ipad" | "monitor" | "late";

export function dorm({ night = false }: { night?: boolean } = {}) {
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: institutional carpet, grey-blue, and Aiden's own rug
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x5a5f6a);
      let c = hash3(i, k, 3) > 0.5 ? 0x7d8494 : 0x767d8c;
      if (hash3(i * 3, k, 9) > 0.96) c = 0x6b7180;
      const rug = i >= 30 && i <= 54 && k >= 24 && k <= 42;
      if (rug) c = i === 30 || i === 54 || k === 24 || k === 42 ? 0xf6f4ee : (i + k) % 6 < 3 ? 0x2f6be8 : 0x2a5fd0;
      floor.set(i, -1, k, c);
    }
  mesh(floor, indoorFloor, false);

  // —— cinderblock walls, painted; a window in the back one
  const walls = new Voxels(S, 0.02);
  const block2 = (a: number, j: number) => (j <= 1 ? 0xd9d4ca : j % 4 === 0 || (a + (Math.floor(j / 4) % 2) * 4) % 8 === 0 ? 0xe2dccd : 0xefe9dc);
  const windowHole = (i: number, j: number) => i >= 32 && i <= 52 && j >= 12 && j <= 27;
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) if (!windowHole(i, j)) walls.set(i, j, k, block2(i, j));
    for (let k = 0; k < D; k += 1) for (let i = -2; i <= -1; i += 1) if (!(k >= 50 && k <= 59 && j <= 21)) walls.set(i, j, k, block2(k, j));
  }
  // the window frame and sill
  for (let i = 31; i <= 53; i += 1) {
    walls.set(i, 11, 0, 0xc9c2b4);
    walls.set(i, 11, 1, 0xc9c2b4);
    walls.set(i, 28, 0, 0xd9d4ca);
  }
  for (let j = 11; j <= 28; j += 1) {
    walls.set(31, j, 0, 0xd9d4ca);
    walls.set(53, j, 0, 0xd9d4ca);
    walls.set(42, j, -1, 0x9a948a);
  }
  // the door: on the left wall, near you
  walls.box(-1, 0, 50, -1, 21, 59, (x, y, z) => (z === 50 || z === 59 || y === 21 ? 0xc9c2b4 : 0x8a5a3c));
  walls.set(0, 10, 57, 0xbfc4cc);
  mesh(walls);

  // —— outside the window: the hills, the town, the Campanile. Only what's
  // lit out there glows: stars, windows, the clock
  const out = new Voxels(S, 0);
  const outLit = new Voxels(S, 0);
  const sky = (j: number) => (night ? mix(0x16244a, 0x34477a, (28 - j) / 16) : mix(0x8ec0ee, 0xdcecfa, (28 - j) / 16));
  for (let i = 32; i <= 52; i += 1)
    for (let j = 12; j <= 27; j += 1) {
      const hill = 15 + Math.round(Math.sin(i * 0.35) * 1.5 + Math.sin(i * 0.9) * 0.7);
      if (night && j > hill && hash3(i, j, 5) > 0.95) outLit.set(i, j, -6, 0xc9d4f0);
      else if (night && j <= 13 && hash3(i, j, 8) > 0.6 && hash3(i, j, 2) > 0.5) outLit.set(i, j, -6, 0xd9a050);
      else out.set(i, j, -6, j <= 13 && hash3(i, j, 8) > 0.6 ? (night ? 0x2a3c4c : 0xd9d4ca) : j <= hill ? (night ? 0x1c2a3a : 0x5e8a4a) : sky(j));
    }
  // the tower, right of centre: shaft, belfry, clock, the point
  for (let j = 12; j <= 24; j += 1) out.box(44, j, -5, 47, j, -5, night ? 0x9a948a : 0xf1ece2);
  out.box(43, 22, -5, 48, 22, -5, night ? 0xb9b2a6 : 0xfbf8f1);
  (night ? outLit : out).box(44, 20, -4, 47, 21, -4, night ? 0xd9b878 : 0x2a2f3d);
  out.box(45, 25, -5, 46, 26, -5, night ? 0x6f8478 : 0x9bb0a6);
  out.set(45, 27, -5, night ? 0x6f8478 : 0x9bb0a6);
  mesh(out, materials.solid, false);
  if (outLit.cells.size) mesh(outLit, materials.glow, false);

  // —— the furniture
  const f = new Voxels(S, 0.035);
  const wood = (x: number, y: number, z: number) => (hash3(x, y, z) > 0.5 ? 0xb8834f : 0xae7745);
  // Aiden's bed, along the left wall: frame, mattress, cobalt blanket, pillow
  f.box(0, 0, 2, 11, 3, 22, (x, y) => (y === 3 ? 0x8a5a3c : 0x6b4a32));
  f.box(0, 4, 2, 11, 5, 22, 0xf4f2ee);
  f.box(0, 6, 7, 11, 6, 22, (x, y, z) => ((x + z) % 7 === 0 ? 0x2a5fd0 : 0x2f6be8));
  f.box(1, 6, 3, 10, 7, 6, 0xfbf8f1);
  f.box(0, 4, 23, 11, 4, 23, 0x2f6be8);
  f.box(5, 7, 19, 7, 7, 21, 0x1b1d22);
  // Miles's: navy, made, a jacket thrown across it
  f.box(71, 0, 14, 82, 3, 34, (x, y) => (y === 3 ? 0x8a5a3c : 0x6b4a32));
  f.box(71, 4, 14, 82, 6, 34, (x, y, z) => (y === 6 ? (z > 17 ? 0x2b3f63 : 0xfbf8f1) : 0xe9e4da));
  f.box(73, 7, 22, 79, 7, 27, (x, y, z) => ((x + z) % 4 ? 0x1b1d22 : 0x2a2f3d));
  // desks along the back wall, chairs pulled up
  for (const i0 of [13, 56]) {
    f.box(i0, 7, 0, i0 + 15, 8, 7, wood);
    f.box(i0, 0, 0, i0, 6, 7, 0x8a5a3c);
    f.box(i0 + 15, 0, 0, i0 + 15, 6, 7, 0x8a5a3c);
    f.box(i0 + 1, 3, 0, i0 + 5, 6, 6, 0x9a6a42);
    f.box(i0 + 1, 18, 0, i0 + 14, 18, 3, 0x9a6a42); // a shelf over it
    const c = i0 === 13 ? 0x2f6be8 : 0x8a8f99;
    f.box(i0 + 5, 4, 10, i0 + 10, 4, 14, c);
    f.box(i0 + 5, 5, 14, i0 + 10, 10, 14, c);
    for (const [x, z] of [[i0 + 5, 10], [i0 + 10, 10], [i0 + 5, 14], [i0 + 10, 14]]) f.box(x, 0, z, x, 3, z, 0x2a2f3d);
  }
  // on Aiden's desk: the laptop, a lamp, the books, Phoebe in a frame, a mug
  f.box(18, 9, 2, 24, 9, 5, 0xc9ccd2);
  f.box(18, 10, 1, 24, 14, 1, 0xc9ccd2);
  f.box(14, 9, 1, 15, 9, 2, 0x2a2f3d);
  f.box(14, 10, 1, 14, 14, 1, 0x2a2f3d);
  f.box(13, 15, 0, 16, 16, 3, 0xf2c46b);
  for (const [n, c] of [[0, 0x1f3f8a], [1, 0xd74718], [2, 0xf2c46b], [3, 0x4f9a5c]] as const) f.box(16 + n * 2, 19, 0, 17 + n * 2, 23 - (n % 2), 2, c);
  f.box(25, 9, 1, 27, 13, 1, (x, y) => (x === 25 || x === 27 || y === 9 || y === 13 ? 0x6b4a32 : 0xf3ead9));
  f.set(26, 11, 2, 0xe2c49b);
  f.box(27, 9, 4, 28, 11, 5, 0xf6f4ee);
  // the roommate's desk: bare but for a lamp
  f.box(60, 9, 1, 61, 9, 2, 0x2a2f3d);
  f.box(60, 10, 1, 60, 13, 1, 0x2a2f3d);
  f.box(59, 14, 0, 62, 15, 3, 0xf6f4ee);
  // wardrobe, a mini fridge and microwave, the bin
  f.box(0, 0, 27, 6, 26, 36, (x, y, z) => (x === 6 && z === 31 ? 0x6b4a32 : y === 26 ? 0x9a6a42 : wood(x, y, z)));
  f.box(6, 12, 30, 6, 14, 30, 0xbfc4cc);
  f.box(0, 0, 39, 5, 8, 45, (x, y) => (y === 8 ? 0xd9d4ca : 0xf4f2ee));
  f.box(0, 9, 39, 5, 13, 45, (x, y, z) => (x === 5 && z > 39 && z < 44 && y > 9 && y < 13 ? 0x2a2f3d : 0xe9e4da));
  f.box(29, 0, 2, 31, 4, 4, 0x8a8f99);
  // the pennant over the bed: navy, gold letters
  for (let k = 6; k <= 20; k += 1) {
    const h = Math.round(((20 - k) / 14) * 3);
    f.box(0, 24 - h, k, 0, 24 + h, k, 0x1f3f8a);
  }
  letters(f, "CAL", 1, 26, 16, 0xf2c46b, { axis: "-z" });
  // a corkboard over the desk, notes on it
  f.box(14, 20, 0, 27, 28, 0, (x, y) => (x === 14 || x === 27 || y === 20 || y === 28 ? 0x6b4a32 : hash3(x, y, 2) > 0.5 ? 0xb07c48 : 0xc08850));
  for (const [x, y, c] of [[16, 25, 0xf2c46b], [20, 26, 0x9cc0fa], [23, 23, 0xe88a9a], [17, 22, 0xfbf8f1]] as const) f.box(x, y - 1, 1, x + 2, y, 1, c);
  mesh(f);

  // string lights over the bed, the laptop screen, the lamp's bulb
  const lit = new Voxels(S, 0);
  for (let k = 2; k <= 26; k += 1) if (k % 3 === 0) lit.set(1, 29 - Math.round(Math.sin(((k - 2) / 24) * Math.PI) * 2), k, 0xd99040);
  lit.box(19, 11, 2, 23, 13, 2, night ? 0x9cc0fa : 0x2f6be8);
  lit.box(14, 14, 1, 15, 14, 2, 0xfff1d6);
  lit.box(6, 8, 19, 6, 8, 20, 0x9cc0fa);
  mesh(lit, materials.glow, false);

  // —— what's here depends on the chapter
  const features = new Map<DormFeature, Mesh[]>();
  const add = (name: DormFeature, build: (v: Voxels) => void, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const v = new Voxels(S, 0.04);
    build(v);
    const m = mesh(v, material, shadow);
    m.visible = false;
    features.set(name, [...(features.get(name) ?? []), m]);
  };
  // sick: tissues everywhere, tea, a thermometer, the Tylenol
  add("sick", (v) => {
    const tissue = (x: number, z: number, y = 0) => {
      v.box(x, y, z, x + 1, y + 1, z + 1, 0xfbf8f1);
      v.set(x + (hash3(x, z, 1) > 0.5 ? 1 : 0), y + 2, z, 0xf4f2ee);
    };
    for (const [x, z] of [[13, 16], [16, 20], [12, 25], [20, 18], [9, 26], [24, 24], [34, 20], [15, 30], [27, 15]]) tissue(x, z);
    for (const [x, z] of [[3, 12], [7, 17], [9, 9]]) tissue(x, z, 7);
    v.box(7, 7, 19, 10, 9, 21, (x, y) => (y === 9 ? 0xfbf8f1 : 0x8fd3b6));
    v.box(24, 9, 4, 25, 11, 5, 0xd74718); // tea
    v.set(24, 12, 4, 0xfbf8f1);
    v.box(26, 9, 6, 26, 9, 7, 0xf6f4ee); // a thermometer
    v.set(26, 9, 5, 0xd74718);
    v.box(20, 9, 6, 21, 11, 7, 0xf6f4ee); // the bottle, red cap
    v.box(20, 12, 6, 21, 12, 7, 0xd74718);
  });
  // still unpacked
  add("boxes", (v) => {
    v.box(60, 0, 40, 68, 6, 47, (x, y) => (y === 6 ? 0xc9a27a : 0xb8834f));
    v.box(62, 7, 41, 67, 11, 46, (x, y) => (y === 11 ? 0xc9a27a : 0xb8834f));
    v.box(64, 7, 41, 64, 11, 46, 0xd9c49b);
  });
  // three cups on the windowsill, where the light hits them
  add("trophies", (v) => {
    [[34, 0xf2c46b], [39, 0xe6b04a], [44, 0xf2c46b]].forEach(([x, gold]) => {
      v.box(x, 12, 1, x + 2, 12, 2, 0x2a2f3d);
      v.box(x + 1, 13, 1, x + 1, 14, 2, gold);
      v.box(x, 15, 1, x + 2, 17, 2, gold);
      v.set(x - 1, 16, 1, gold);
      v.set(x + 3, 16, 1, gold);
    });
  });
  // an iPad and its pencil, for alai
  add("ipad", (v) => {
    v.box(19, 9, 5, 24, 9, 7, 0x2a2f3d);
    v.box(25, 9, 6, 25, 9, 6, 0xfbf8f1);
  });
  add("ipad", (v) => v.box(20, 10, 5, 23, 10, 6, 0xffd23f), materials.glow, false);
  add("monitor", (v) => {
    v.box(13, 9, 3, 15, 9, 4, 0x1b1d22);
    v.box(14, 10, 3, 14, 11, 3, 0x1b1d22);
  });
  add("monitor", (v) => v.box(11, 12, 3, 17, 16, 3, (x, y) => (y === 16 || x === 11 || x === 17 ? 0x1b1d22 : (x + y) % 3 ? 0x16203a : 0x3fd17a)), materials.glow, false);
  // a late night: cans, a pizza box
  add("late", (v) => {
    for (const x of [26, 28]) v.box(x, 9, 2, x, 11, 2, x === 26 ? 0x2fb5a6 : 0xd74718);
    v.box(34, 0, 14, 41, 1, 20, (x, y) => (y === 1 ? 0xf6f4ee : 0xc9a27a));
  });

  // —— light: the moon or the sun through the window, the desk lamp, the string lights
  const sun = new DirectionalLight(night ? 0x9fb4ff : 0xffe2b8, night ? 0.9 : 3.0);
  sun.position.set(2, 9, -14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = night ? new HemisphereLight(0x5a6fb0, 0x2a2430, 1.15) : new HemisphereLight(0xeef2ff, 0xc9c0b0, 1.6);
  const lamp = new PointLight(0xffc98a, night ? 3.4 : 1.0, night ? 5 : 3.5, 2);
  lamp.position.copy(at(15, 14, 5));
  const fairy = new PointLight(0xffb98a, night ? 1.4 : 0, 3.5, 2);
  fairy.position.copy(at(4, 26, 16));
  group.add(sun, sun.target, hemi, lamp, fairy);

  const colliders: Collider[] = [
    block(0, 0, 11, 23), // Aiden's bed
    block(71, 14, 82, 34), // the roommate's
    block(13, 0, 28, 7), // desks
    block(56, 0, 71, 7),
    block(18, 10, 23, 14), // chairs
    block(61, 10, 66, 14),
    block(0, 27, 6, 36), // wardrobe
    block(0, 39, 5, 45), // fridge
  ];
  const boxes = block(60, 40, 68, 47);
  const spots: Spot[] = [
    { id: "laptop", label: "Laptop", at: at(21, 11, 6), reach: 1.5 },
    { id: "phone", label: "Phone", at: at(6, 7, 20), reach: 1.3 },
    { id: "bed", label: "Bed", at: at(6, 6, 8), reach: 1.5 },
    { id: "window", label: "Window", at: at(42, 18, 1), reach: 1.7 },
    { id: "photo", label: "Photo", at: at(26, 11, 2), reach: 1.4 },
    { id: "door", label: "Door", at: at(1, 10, 54.5), reach: 1.3 },
    { id: "pennant", label: "Pennant", at: at(1, 24, 13), reach: 1.4 },
    { id: "fridge", label: "Mini fridge", at: at(6, 6, 42), reach: 1.2 },
    { id: "roommate", label: "Miles’s bed", at: at(76, 6, 24), reach: 1.4 },
    { id: "board", label: "Corkboard", at: at(20, 24, 1), reach: 1.5 },
  ];
  const extra: Record<string, Spot> = {
    sick: { id: "pills", label: "Tylenol", at: at(20.5, 10, 7), reach: 1.4 },
    trophies: { id: "trophies", label: "Trophies", at: at(40, 15, 2), reach: 1.6 },
    ipad: { id: "ipad", label: "iPad", at: at(21, 10, 7), reach: 1.4 },
  };

  const shown = new Set<DormFeature>();
  const room = {
    group,
    colliders,
    spots,
    background: night ? { top: new Color(0x0e1c40), bottom: new Color(0x283a68) } : { top: new Color(0xf3ece0), bottom: new Color(0xe9e2d4) },
    span: { wide: 11.4, tall: 9.2 },
    centre: new Vector3(0, 0.9, 0.1),
    follow: 0.3,
    bounds: { x0: -4.15, x1: 4.15, z0: -2.55, z1: 3.15 },
    spawn: at(36, 0, 48),
    heading: Math.PI * 0.85,
    night: night ? 1 : 0,
    clouds: 0,
    /** The bed: where its prompt goes, where Aiden lies in it, and where to stand up. */
    bed: at(5.5, 6, 6),
    lie: at(5.5, 6.6, 18),
    rise: at(15, 0, 17),
    show: (name: DormFeature, on = true) => {
      for (const m of features.get(name) ?? []) m.visible = on;
      if (on) shown.add(name);
      else shown.delete(name);
      for (const [when, spot] of Object.entries(extra)) {
        const has = spots.includes(spot);
        if (shown.has(when as DormFeature) && !has) spots.push(spot);
        if (!shown.has(when as DormFeature) && has) spots.splice(spots.indexOf(spot), 1);
      }
      const hasBoxes = colliders.includes(boxes);
      if (shown.has("boxes") && !hasBoxes) colliders.push(boxes);
      if (!shown.has("boxes") && hasBoxes) colliders.splice(colliders.indexOf(boxes), 1);
    },
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Dorm = ReturnType<typeof dorm>;
