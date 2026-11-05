import { Color, DirectionalLight, Group, HemisphereLight, Mesh, PointLight, Vector3 } from "three";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blinkGlow, blocker, calm, disposeAll, grid, indoorFloor, letters, meshOf, nearEdge, screenGlow, viewGlow, type Collider, type Room, type Spot } from "./common";
import { alive, clockHands, motes, shaft, towards, type Life, type Opening } from "./life";

// A high school hallway at lunch: lockers, a lit trophy case that fills up
// over the chapter, the noticeboard with the FBLA flyer, a clock over it,
// Room 204, a vending machine humming, and the noon sun coming in through
// the windows down the side and lying in bright bars across the tiles.
//
// 120 × 70 voxels; the back wall at z = −3.5, the window wall at x = −6.

const W = 120;
const D = 70;
const H = 32;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

export function hallway({ trophies = 0 }: { trophies?: number } = {}) {
  calm();
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: big cream and grey tiles, polished
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      if (nearEdge(i, k, W - 1, D - 1)) for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x8a8478);
      const checker = (Math.floor(i / 6) + Math.floor(k / 6)) % 2;
      let c = checker ? 0xe9e4d8 : 0xd6d1c5;
      if (k >= 58 || k <= 1) c = 0x9aa0a8;
      if (hash3(i, k, 4) > 0.985) c = mix(c, 0xffffff, 0.4);
      floor.set(i, -1, k, c);
    }
  mesh(floor, indoorFloor, false);

  // —— walls: school blue below, cream above; the window wall on the left
  const walls = new Voxels(S, 0.02);
  const paint = (j: number) => (j <= 1 ? 0x2a2f3d : j <= 13 ? 0x3a5fa8 : j === 14 ? 0xf4efe6 : 0xefe7d6);
  const windowAt = (k: number, j: number) => j >= 12 && j <= 26 && [6, 24, 42].some((k0) => k >= k0 && k <= k0 + 13);
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) walls.set(i, j, k, paint(j));
    for (let k = 0; k < D; k += 1)
      for (let i = -2; i <= -1; i += 1) {
        if (windowAt(k, j)) continue;
        walls.set(i, j, k, paint(j));
      }
  }
  for (const k0 of [6, 24, 42]) {
    for (let k = k0 - 1; k <= k0 + 14; k += 1) {
      walls.set(0, 11, k, 0xfbf8f1);
      walls.set(0, 27, k, 0xfbf8f1);
    }
    for (let j = 11; j <= 27; j += 1) {
      walls.set(0, j, k0 - 1, 0xfbf8f1);
      walls.set(0, j, k0 + 14, 0xfbf8f1);
      walls.set(-1, j, k0 + 6, 0xfbf8f1);
    }
  }
  mesh(walls);

  // outside: the school's trees and a noon sky (drawn a little down and
  // along, since from above through the glass that's where it shows)
  const outside = new Voxels(S, 0.02);
  for (const k0 of [6, 24, 42])
    for (let k = k0 - 4; k <= k0 + 13; k += 1)
      for (let j = 8; j <= 26; j += 1) {
        const crown = 14 + Math.round(Math.sin(k * 0.45) * 1.6 + Math.sin(k * 1.1) * 0.7);
        outside.set(-4, j, k, j <= crown ? (hash3(k, j, 3) > 0.62 ? 0x6faa48 : j > crown - 2 ? 0x7cb954 : 0x5a9a3c) : mix(0xeaf3f8, 0x9fcdee, Math.min(1, (j - crown) / 9)));
      }
  mesh(outside, viewGlow, false).receiveShadow = false;

  // —— along the back wall
  const f = new Voxels(S, 0.035);
  const lockerRun = (i0: number, i1: number) => {
    for (let i = i0; i <= i1; i += 1)
      for (let j = 1; j <= 20; j += 1)
        for (let k = 0; k <= 4; k += 1) {
          const edge = (i - i0) % 5 === 0;
          let c = edge ? 0x23468c : mix(0x2f5fb8, 0x3a6cc4, hash3(Math.floor((i - i0) / 5), 1, 1));
          if (k === 4 && !edge && (j === 16 || j === 17 || j === 18) && (i - i0) % 5 === 2) c = 0x1b3670;
          if (k === 4 && (i - i0) % 5 === 4 && j === 10) c = 0xbfc4cc;
          f.set(i, j, k, c);
        }
    f.box(i0, 0, 0, i1, 0, 4, 0x1b1d22);
  };
  lockerRun(3, 47);
  // the trophy case: a wooden frame, glass, shelves
  f.box(52, 0, 0, 70, 2, 5, 0x6b4a32);
  f.box(52, 3, 0, 52, 24, 5, 0x6b4a32);
  f.box(70, 3, 0, 70, 24, 5, 0x6b4a32);
  f.box(52, 25, 0, 70, 26, 5, 0x6b4a32);
  f.box(53, 3, 0, 69, 24, 0, 0x2a2f3d);
  for (const j of [10, 17]) f.box(53, j, 1, 69, j, 4, 0xd9e6f2);
  f.box(53, 3, 5, 69, 3, 5, 0xd9e6f2);
  f.box(53, 24, 5, 69, 24, 5, 0xd9e6f2);
  // a clock over the noticeboard, and a fire alarm by the lockers
  for (let i = 77; i <= 83; i += 1)
    for (let j = 23; j <= 29; j += 1) {
      const d = Math.hypot(i - 80, j - 26);
      if (d <= 3.4) f.set(i, j, 0, d > 2.5 ? 0x2a2f3d : 0xfbf8f1);
    }
  f.box(49, 11, 0, 50, 13, 0, (x, y) => (y === 12 && x === 49 ? 0xfbf8f1 : 0xd74718));
  // the noticeboard, flyers on it (the yellow one is FBLA's)
  f.box(74, 9, 0, 86, 21, 0, (x, y) => (x === 74 || x === 86 || y === 9 || y === 21 ? 0x6b4a32 : hash3(x, y, 2) > 0.5 ? 0xb07c48 : 0xc08850));
  f.box(76, 13, 1, 79, 18, 1, 0xf2c46b);
  f.box(81, 14, 1, 84, 19, 1, 0xe88a9a);
  f.box(80, 10, 1, 83, 12, 1, 0x8fd3b6);
  f.set(77, 18, 2, 0xd74718);
  // Room 204: a door with a window, its number over it
  f.box(90, 0, 0, 99, 22, 1, (x, y) => (x === 90 || x === 99 || y === 22 ? 0xd9d4ca : y >= 13 && y <= 18 && x >= 93 && x <= 96 ? 0x9cc0fa : 0x8a5a3c));
  f.set(97, 10, 2, 0xbfc4cc);
  f.box(88, 23, 0, 101, 30, 0, 0xfbf8f1);
  letters(f, "204", 90, 29, 1, 0x2a2f3d, { axis: "x" });
  // the vending machine, the water fountain
  f.box(103, 0, 0, 111, 21, 8, (x, y, z) => (z === 8 && x > 103 && x < 111 && y > 6 && y < 20 ? null : 0xd74718));
  f.box(104, 7, 7, 110, 19, 7, (x, y) => (y % 3 === 0 ? 0xd9d4ca : [0xf2c46b, 0x2f6be8, 0x8fd3b6, 0xf08a32][(x + y) % 4]));
  f.box(113, 6, 0, 117, 10, 4, 0xbfc4cc);
  f.box(114, 0, 0, 116, 5, 2, 0x8a8f99);
  // benches down the middle, a backpack left on one
  for (const i0 of [26, 64]) {
    f.box(i0, 4, 48, i0 + 16, 4, 53, 0xb8834f);
    for (const x of [i0 + 1, i0 + 15]) f.box(x, 0, 49, x, 3, 52, 0x2a2f3d);
  }
  f.box(30, 5, 49, 33, 9, 52, (x, y) => (y === 9 ? 0xf08a32 : 0xd74718));
  // John's laptop, on the bench beside him
  f.box(74, 5, 49, 78, 5, 52, 0xc9ccd2);
  f.box(74, 6, 52, 78, 9, 52, 0xc9ccd2);
  mesh(f);

  const lit = new Voxels(S, 0);
  lit.box(75, 6, 51, 77, 8, 51, (x, y) => (y === 8 ? 0x4a6f9e : 0xf6f4ee));
  lit.box(104, 20, 7, 110, 20, 7, 0xfff4d6);
  // the strip light inside the top of the trophy case
  lit.box(53, 23, 1, 69, 23, 2, 0xfff6e2);
  mesh(lit, screenGlow, false);
  const coin = new Voxels(S, 0);
  coin.set(110, 12, 8, 0x5fe08a);
  mesh(coin, blinkGlow, false);

  // the trophies, more of them as the chapter goes on
  const cups: Mesh[] = [];
  [[56, 11], [62, 11], [66, 18], [57, 18]].forEach(([x, y], n) => {
    const v = new Voxels(S, 0.03);
    const gold = n % 2 ? 0xf2c46b : 0xe6b04a;
    v.box(x, y, 2, x + 2, y, 3, 0x2a2f3d);
    v.box(x + 1, y + 1, 2, x + 1, y + 2, 3, gold);
    v.box(x, y + 3, 2, x + 2, y + 5, 3, gold);
    v.set(x - 1, y + 4, 2, gold);
    v.set(x + 3, y + 4, 2, gold);
    const m = mesh(v);
    m.visible = n < trophies;
    cups.push(m);
  });

  // —— light: the sun through the side windows, the hall's own fill
  const sun = new DirectionalLight(0xffe2b8, 3.2);
  sun.position.set(-14, 9, 4);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(0xeef2ff, 0xc9c0b0, 1.45);
  const caseLight = new PointLight(0xfff0d0, 1.6, 2.4, 2);
  caseLight.position.copy(at(61, 21, 3));
  group.add(sun, sun.target, hemi, caseLight);

  // the sun through each window, bars across the tiles, the dust in them; the clock
  const light = towards(sun.position, sun.target.position);
  const clock = clockHands(at(80.5, 26.5, 1), "z", { minutes: 12 * 60 + 5, radius: 0.3 });
  const lives: Life[] = [clock];
  for (const k0 of [6, 24, 42]) {
    const opening: Opening = [at(0, 12, k0 + 14), at(0, 12, k0), at(0, 27, k0), at(0, 27, k0 + 14)];
    lives.push(shaft(opening, light, { color: 0xffefd2, strength: 0.04, panes: [2, 1] }));
    lives.push(motes(opening, light, { count: 10, seed: k0 }));
  }
  const life = alive(group, lives);

  const colliders: Collider[] = [
    block(3, 0, 47, 5), // lockers
    block(52, 0, 70, 6), // the trophy case
    block(103, 0, 111, 9), // vending
    block(113, 0, 117, 5), // fountain
    block(26, 48, 42, 53), // benches
    block(64, 48, 80, 53),
  ];
  const spots: Spot[] = [
    { id: "trophies", label: "Trophy case", at: at(61, 12, 5), reach: 1.5 },
    { id: "board", label: "Noticeboard", at: at(80, 15, 1), reach: 1.5 },
    { id: "door", label: "Room 204", at: at(94.5, 11, 2), reach: 1.4 },
    { id: "lockers", label: "Lockers", at: at(22, 10, 5), reach: 1.3 },
    { id: "vending", label: "Vending machine", at: at(107, 10, 9), reach: 1.3 },
  ];

  let count = trophies;
  const room = {
    group,
    colliders,
    spots,
    background: { top: new Color(0xf1ece2), bottom: new Color(0xe6e0d4) },
    span: { wide: 12.6, tall: 8.6 },
    centre: new Vector3(0, 1.0, 0.1),
    follow: 0.38,
    bounds: { x0: -5.75, x1: 5.75, z0: -2.85, z1: 3.3 },
    spawn: at(14, 0, 40),
    heading: Math.PI / 2,
    night: 0,
    clouds: 0,
    get trophies() {
      return count;
    },
    setTrophies: (n: number) => {
      count = n;
      cups.forEach((m, i) => (m.visible = i < n));
    },
    setTime: (minutes: number) => clock.set(minutes),
    update: (time: number, dt: number) => life.update(time, dt),
    dispose: () => {
      life.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Hallway = ReturnType<typeof hallway>;
