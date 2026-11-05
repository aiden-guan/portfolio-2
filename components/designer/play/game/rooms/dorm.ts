import { Color, DirectionalLight, Group, HemisphereLight, Mesh, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import {
  blinkGlow,
  blocker,
  bulbGlow,
  calm,
  disposeAll,
  grid,
  indoorFloor,
  letters,
  meshOf,
  nearEdge,
  screenGlow,
  shadeGlow,
  textScreen,
  twinkleGlow,
  viewGlow,
  type Collider,
  type Room,
  type Spot,
} from "./common";
import { alive, motes, shaft, steam, towards, type Life, type Opening } from "./life";

// A double in a Berkeley dorm: two twin beds, two desks, cinderblock painted
// cream, a radiator under a window with the Campanile in it, lit all night.
// Aiden's half has the cobalt bedding, the pennant, string lights and Phoebe
// in a frame; Miles's half has a jacket thrown on the bed, his going-out
// shoes at the foot of it and a mirror over the desk, because he's always on
// his way out. What's on the desk changes with the chapter: textbooks, then
// tissues and Tylenol, then an iPad and trophies.
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
  calm();
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
      if (nearEdge(i, k, W - 1, D - 1)) for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x5a5f6a);
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

  // —— out of the window: the town, the hills, the Campanile. Seen through
  // the glass from above, what's further back shows lower down, so each
  // layer is drawn a little below and left of where it appears.
  const sky = new Voxels(S, 0);
  const town = new Voxels(S, 0);
  const tower = new Voxels(S, 0);
  const skyAt = (j: number) => (night ? mix(0x2a3a66, 0x111b3c, Math.min(1, Math.max(0, j - 10) / 14)) : mix(0xe4eef6, 0x95c3ec, Math.min(1, Math.max(0, j - 10) / 14)));
  for (let i = 27; i <= 53; i += 1)
    for (let j = 8; j <= 28; j += 1) {
      let c = skyAt(j);
      if (night && j > 16 && hash3(i, j, 5) > 0.975) c = mix(c, 0xc9d4f0, 0.5);
      sky.set(i, j, -5, c);
    }
  if (night) sky.box(31, 22, -5, 32, 23, -5, (x, y) => (x === 32 && y === 23 ? mix(skyAt(23), 0xfff1c8, 0.4) : 0xf6ecc8));
  for (let i = 28; i <= 53; i += 1) {
    // the hills behind the town, and the town's roofs in front of them
    const hill = 13 + Math.round(Math.sin(i * 0.33) * 1.4 + Math.sin(i * 0.81 + 1) * 0.7);
    for (let j = 8; j <= hill; j += 1) town.set(i, j, -4, night ? (j === hill ? 0x24324a : 0x1c2838) : j === hill ? 0x7ea45e : 0x6a9450);
    const roof = 10 + Math.round(hash3(Math.floor(i / 3), 2, 7) * 2);
    for (let j = 8; j <= roof; j += 1) {
      const lit = night ? hash3(i, j, 8) > 0.72 : false;
      town.set(i, j, -4, lit ? 0xd9a050 : night ? 0x2a3444 : j === roof ? 0xc9b8a2 : 0xd9d0c2);
    }
    if (night && i % 4 === 0 && hash3(i, 3, 3) > 0.4) town.set(i, hill - 1, -4, 0xb08a52);
  }
  // the tower, right of centre: shaft, clock, belfry, roof and lantern
  const stone = night ? 0xc9bfa6 : 0xf1ece2;
  tower.box(44, 9, -3, 46, 19, -3, (x, y) => (y % 4 === 0 ? (night ? 0xb9ae96 : 0xe2dccd) : stone));
  tower.box(43, 20, -3, 47, 20, -3, night ? 0xd9cfb6 : 0xfbf8f1);
  tower.box(44, 21, -3, 46, 22, -3, (x) => (x === 45 ? (night ? 0x2a2a34 : 0x3a3a44) : stone));
  tower.box(43, 23, -3, 47, 23, -3, night ? 0xd9cfb6 : 0xfbf8f1);
  tower.box(44, 24, -3, 46, 24, -3, night ? 0x6f8478 : 0x9bb0a6);
  tower.set(45, 25, -3, night ? 0x6f8478 : 0x9bb0a6);
  tower.set(45, 26, -3, night ? 0xd9c48a : 0xc9b98a);
  mesh(sky, viewGlow, false).receiveShadow = false;
  mesh(town, viewGlow, false).receiveShadow = false;
  mesh(tower, viewGlow, false).receiveShadow = false;
  const clockFace = new Voxels(S, 0);
  clockFace.box(44, 17, -2, 46, 18, -2, (x, y) => (x === 45 && y === 18 ? 0x2a2f3d : night ? 0xfff1c8 : 0xfbf8f1));
  mesh(clockFace, night ? bulbGlow : viewGlow, false).receiveShadow = false;

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
  // Miles's: navy, made, a jacket thrown across it, his shoes at the foot
  f.box(71, 0, 14, 82, 3, 34, (x, y) => (y === 3 ? 0x8a5a3c : 0x6b4a32));
  f.box(71, 4, 14, 82, 6, 34, (x, y, z) => (y === 6 ? (z > 17 ? 0x2b3f63 : 0xfbf8f1) : 0xe9e4da));
  f.box(73, 7, 22, 79, 7, 27, (x, y, z) => ((x + z) % 4 ? 0x1b1d22 : 0x2a2f3d));
  f.box(75, 7, 26, 76, 8, 27, 0x1b1d22);
  for (const x of [74, 77]) f.box(x, 0, 36, x + 1, 1, 38, (vx, y, z) => (y === 0 ? 0xd9d4ca : z === 38 && vx === x ? 0x2a2f3d : 0xf4f2ee));
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
  for (const [n, c] of [[0, 0x1f3f8a], [1, 0xd74718], [2, 0xf2c46b], [3, 0x4f9a5c]] as const) f.box(16 + n * 2, 19, 0, 17 + n * 2, 23 - (n % 2), 2, c);
  f.box(25, 9, 1, 27, 13, 1, (x, y) => (x === 25 || x === 27 || y === 9 || y === 13 ? 0x6b4a32 : 0xf3ead9));
  f.set(26, 11, 2, 0xe2c49b);
  f.box(27, 9, 4, 28, 11, 5, 0xf6f4ee);
  // the roommate's desk: a lamp, a mirror over it, a bottle of cologne
  f.box(60, 9, 1, 61, 9, 2, 0x2a2f3d);
  f.box(60, 10, 1, 60, 13, 1, 0x2a2f3d);
  f.box(66, 9, 2, 66, 10, 2, 0x8fbfd9);
  f.set(66, 11, 2, 0x2a2f3d);
  f.box(61, 20, 0, 66, 28, 0, (x, y) => (x === 61 || x === 66 || y === 20 || y === 28 ? 0x2a2f3d : (x - y + 40) % 5 === 0 ? 0xf2f8fc : 0xc9dbe6));
  // wardrobe, a mini fridge and microwave, the bin
  f.box(0, 0, 27, 6, 26, 36, (x, y, z) => (x === 6 && z === 31 ? 0x6b4a32 : y === 26 ? 0x9a6a42 : wood(x, y, z)));
  f.box(6, 12, 30, 6, 14, 30, 0xbfc4cc);
  f.box(0, 0, 39, 5, 8, 45, (x, y) => (y === 8 ? 0xd9d4ca : 0xf4f2ee));
  f.box(0, 9, 39, 5, 13, 45, (x, y, z) => (x === 5 && z > 39 && z < 44 && y > 9 && y < 13 ? 0x2a2f3d : 0xe9e4da));
  f.box(29, 0, 2, 31, 4, 4, 0x8a8f99);
  // on the microwave: a deck of cards and two stacks of chips, for Jun's
  // poker nights (five-dollar buy-in)
  f.box(1, 14, 40, 2, 14, 41, (x, y, z) => (x === 1 && z === 40 ? 0xd74718 : 0xfbf8f1));
  for (const [z, c] of [[43, 0xd74718], [44, 0x2f6be8]] as const) f.box(2, 14, z, 2, z === 43 ? 16 : 15, z, (x, y) => (y % 2 ? c : 0xfbf8f1));
  f.box(3, 14, 43, 3, 14, 43, 0x2a2f3d);
  // the radiator under the window
  f.box(34, 1, 0, 50, 7, 1, (x, y) => (y === 7 ? 0xd9d4ca : x % 2 ? 0xe9e4da : 0xd2ccc0));
  for (const x of [35, 49]) f.box(x, 0, 0, x, 0, 1, 0x9a948a);
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

  // the lampshades, lit through at night
  const shades = new Voxels(S, 0.03);
  shades.box(13, 15, 0, 16, 16, 3, 0xf2c46b);
  shades.box(59, 14, 0, 62, 15, 3, 0xf6f4ee);
  mesh(shades, shadeGlow);
  // string lights over the bed, each bulb on its own slow beat
  const bulbs = new Voxels(S, 0);
  // (strung high, clear of the pennant)
  const sag = (k: number) => 31 - Math.round(Math.sin(((k - 2) / 24) * Math.PI) * 2);
  for (let k = 2; k <= 26; k += 1) if (k % 3 === 0) bulbs.set(1, sag(k), k, [0xffc477, 0xffd59a, 0xffb466][(k / 3) % 3]);
  mesh(bulbs, twinkleGlow, false);
  const wire = new Voxels(S, 0);
  for (let k = 2; k <= 26; k += 1) if (k % 3 !== 0) wire.set(0, sag(k), k, 0x3a3f4a);
  mesh(wire, undefined, false);
  // the laptop's screen: a problem set, or whatever's on tonight, scrolling
  const screen = new Voxels(S, 0);
  screen.box(19, 11, 2, 23, 13, 2, 0x16223e);
  mesh(screen, textScreen("z", night ? 0x9cc0fa : 0x5a8ae0, 0.7), false);
  const glass = new Voxels(S, 0);
  glass.box(14, 14, 1, 15, 14, 2, 0xfff1d6);
  glass.box(6, 8, 19, 6, 8, 20, 0x9cc0fa);
  mesh(glass, materials.glow, false);
  // the power strip under the desk, its switch lit
  const strip = new Voxels(S, 0);
  strip.box(19, 0, 1, 23, 0, 1, 0xe9e4da);
  const switchLit = new Voxels(S, 0);
  switchLit.set(23, 0, 2, 0xff6a4a);
  mesh(strip);
  mesh(switchLit, blinkGlow, false);

  // —— what's here depends on the chapter
  const features = new Map<DormFeature, Mesh[]>();
  const add = (name: DormFeature, build: (v: Voxels) => void, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const v = new Voxels(S, 0.04);
    build(v);
    const m = mesh(v, material, shadow);
    m.visible = false;
    features.set(name, [...(features.get(name) ?? []), m]);
    return m;
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
  add("ipad", (v) => v.box(20, 10, 5, 23, 10, 6, 0xffd23f), screenGlow, false);
  // a second screen, up behind the laptop
  add("monitor", (v) => v.box(17, 15, 0, 25, 17, 0, 0x1b1d22));
  add("monitor", (v) => v.box(18, 15, 1, 24, 17, 1, 0x101a30), textScreen("z", 0x3fd17a, 1.3), false);
  // a late night: cans, a pizza box
  add("late", (v) => {
    for (const x of [26, 28]) v.box(x, 9, 2, x, 11, 2, x === 26 ? 0x2fb5a6 : 0xd74718);
    v.box(34, 0, 14, 41, 1, 20, (x, y) => (y === 1 ? 0xf6f4ee : 0xc9a27a));
  });

  // —— light: the moon or the sun through the window, the desk lamps, the string lights
  const sun = new DirectionalLight(night ? 0x9fb4ff : 0xffe2b8, night ? 0.9 : 3.3);
  sun.position.set(2, 9, -14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = night ? new HemisphereLight(0x5a6fb0, 0x2a2430, 1.1) : new HemisphereLight(0xeef2ff, 0xc9c0b0, 1.45);
  const lamp = new PointLight(0xffc98a, night ? 3.4 : 1.0, night ? 5 : 3.5, 2);
  lamp.position.copy(at(15, 14, 5));
  const fairy = new PointLight(0xffb98a, night ? 0.9 : 0, 3.2, 2);
  fairy.position.copy(at(5, 28, 14));
  const milesLamp = new PointLight(0xfff1dc, night ? 1.3 : 0, 3, 2);
  milesLamp.position.copy(at(60.5, 13, 4));
  const screenLight = new PointLight(0x7aa4f5, night ? 0.8 : 0, 2.2, 2);
  screenLight.position.copy(at(21, 12, 6));
  group.add(sun, sun.target, hemi, lamp, fairy, milesLamp, screenLight);

  const opening: Opening = [at(32, 12, 0), at(53, 12, 0), at(53, 28, 0), at(32, 28, 0)];
  const light = towards(sun.position, sun.target.position);
  const lives: Life[] = [
    shaft(opening, light, night ? { color: 0x8fa6ef, strength: 0.02, panes: [2, 1] } : { color: 0xffedd0, strength: 0.05, panes: [2, 1] }),
    steam(at(28, 12, 5), { count: 4, rise: 0.24, rate: 0.26, seed: 4 }),
  ];
  if (!night) lives.push(motes(opening, light, { count: 22, seed: 5 }));
  const tea = steam(at(25, 12.5, 5), { count: 5, rise: 0.3, rate: 0.3, seed: 8 });
  tea.object.visible = false;
  const life = alive(group, lives);
  group.add(tea.object);

  const colliders: Collider[] = [
    block(0, 0, 11, 23), // Aiden's bed
    block(71, 14, 82, 34), // the roommate's
    block(13, 0, 28, 7), // desks
    block(56, 0, 71, 7),
    block(18, 10, 23, 14), // chairs
    block(61, 10, 66, 14),
    block(0, 27, 6, 36), // wardrobe
    block(0, 39, 5, 45), // fridge
    block(34, 0, 50, 1), // the radiator
    block(74, 36, 78, 38), // Miles's shoes
  ];
  const boxes = block(60, 40, 68, 47);
  const spots: Spot[] = [
    { id: "laptop", label: "Laptop", at: at(21, 11, 6), reach: 1.5 },
    { id: "phone", label: "Phone", at: at(6, 7, 20), reach: 1.3 },
    { id: "bed", label: "Bed", at: at(6, 6, 8), reach: 1.5 },
    { id: "window", label: "Window", at: at(42, 18, 1), reach: 1.7 },
    { id: "photo", label: "Photo", at: at(26, 11, 2), reach: 1.4 },
    { id: "door", label: "Door", at: at(1, 10, 54.5), reach: 1.3 },
    { id: "pennant", label: "Pennant", at: at(1, 24, 13), reach: 1.9 },
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
      // the tea's hot while there's tea
      tea.object.visible = shown.has("sick");
      for (const [when, spot] of Object.entries(extra)) {
        const has = spots.includes(spot);
        if (shown.has(when as DormFeature) && !has) spots.push(spot);
        if (!shown.has(when as DormFeature) && has) spots.splice(spots.indexOf(spot), 1);
      }
      const hasBoxes = colliders.includes(boxes);
      if (shown.has("boxes") && !hasBoxes) colliders.push(boxes);
      if (!shown.has("boxes") && hasBoxes) colliders.splice(colliders.indexOf(boxes), 1);
    },
    update: (time: number, dt: number) => {
      life.update(time, dt);
      if (shown.has("sick")) tea.update(time, dt);
    },
    dispose: () => {
      life.dispose();
      tea.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Dorm = ReturnType<typeof dorm>;
