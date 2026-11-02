import { Color, DirectionalLight, Group, HemisphereLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, indoorFloor, letters, meshOf, textWidth, type Collider, type Room, type Spot } from "./common";

// A startup's office in San Francisco at golden hour: brick, big factory
// windows with the city and the Bay Bridge in them, standing desks, a
// whiteboard nobody has erased in weeks, a couch, the kombucha tap, and a
// neon sign that says what every office here says.
//
// 120 × 84 voxels; the windows across the back, the sign on the left wall.

const W = 120;
const D = 84;
const H = 40;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

export function office({ dusk = false }: { dusk?: boolean } = {}) {
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— polished concrete, a rug under the couch
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x6d6b65);
      let c = hash3(i >> 1, k >> 1, 4) > 0.5 ? 0xb9b6ae : 0xb2afa7;
      if (i % 30 === 0 || k % 30 === 0) c = 0xa8a59d;
      if (i >= 76 && i <= 112 && k >= 58 && k <= 80) c = (i + k) % 8 < 4 ? 0xd9c49b : 0xcbb48a;
      floor.set(i, -1, k, c);
    }
  mesh(floor, indoorFloor, false);

  // —— brick walls; factory windows in the back one
  const walls = new Voxels(S, 0.025);
  const brick = (a: number, j: number) => {
    if (j % 3 === 0) return 0xb9a898;
    const row = Math.floor(j / 3);
    const n = Math.floor((a + (row % 2) * 3) / 6);
    if ((a + (row % 2) * 3) % 6 === 0) return 0xb9a898;
    return [0xa4553a, 0x9a4b33, 0xae5e40, 0x8f4530][Math.floor(hash3(n, row, 3) * 4)];
  };
  const pane = (i: number, j: number) => j >= 8 && j <= 34 && [10, 42, 74].some((i0) => i >= i0 && i <= i0 + 26);
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) if (!pane(i, j)) walls.set(i, j, k, brick(i, j));
    for (let k = 0; k < D; k += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, brick(k, j));
  }
  // black steel mullions
  for (const i0 of [10, 42, 74]) {
    for (let i = i0 - 1; i <= i0 + 27; i += 1) for (const j of [7, 16, 25, 35]) walls.set(i, j, 0, 0x1b1d22);
    for (let j = 7; j <= 35; j += 1) for (const i of [i0 - 1, i0 + 9, i0 + 18, i0 + 27]) walls.set(i, j, 0, 0x1b1d22);
  }
  mesh(walls);

  // —— the city through the glass: towers, the bridge, the bay
  const city = new Voxels(S, 0);
  const sky = (j: number) => (dusk ? mix(0xf3a07a, 0x5a4a9a, (j - 8) / 27) : mix(0xffd9a0, 0x9ec4ee, (j - 8) / 27));
  for (let i = 10; i <= 100; i += 1)
    for (let j = 8; j <= 34; j += 1) {
      if (!pane(i, j)) continue;
      const tower = 14 + Math.floor(hash3(Math.floor(i / 5), 1, 9) * 14) + (i > 30 && i < 38 ? 8 : 0);
      let c = sky(j);
      if (j <= 11) c = dusk ? 0x3a4a7a : 0x6a9ac0; // the bay
      else if (j <= tower) {
        c = dusk ? 0x2a3050 : 0x8a92a8;
        if (i % 2 === 0 && j % 2 === 0 && hash3(i, j, 3) > (dusk ? 0.35 : 0.8)) c = dusk ? 0xffd998 : 0xdfe6f0;
      }
      city.set(i, j, -8, c);
    }
  // the bridge, across the right two windows: towers and the cable's swoop
  for (const t of [80, 96]) city.box(t, 11, -7, t + 1, 27, -7, dusk ? 0xd9d4ca : 0xc9ccd2);
  for (let i = 74; i <= 101; i += 1) {
    const y = 26 - Math.round(Math.sin(((i - 80) / 16) * Math.PI) * 8);
    if (i >= 80 && i <= 96) city.set(i, y, -7, dusk ? 0xfff1d6 : 0xd9d4ca);
    city.set(i, 14, -7, dusk ? 0xffd998 : 0x9aa4ae);
  }
  mesh(city, materials.glow, false);

  // —— the room: standing desks, a whiteboard, the couch, the kitchen
  const f = new Voxels(S, 0.035);
  for (const k0 of [22, 40])
    for (const i0 of [14, 40]) {
      f.box(i0, 10, k0, i0 + 22, 10, k0 + 7, 0xd9c49b);
      for (const x of [i0 + 1, i0 + 21]) f.box(x, 0, k0 + 3, x + 1, 9, k0 + 4, 0x2a2f3d);
      for (let x = i0 + 2; x < i0 + 20; x += 7) {
        f.box(x + 1, 11, k0 + 1, x + 2, 12, k0 + 1, 0x1b1d22);
        f.box(x, 13, k0, x + 4, 17, k0, 0x1b1d22);
      }
      f.box(i0 + 18, 11, k0 + 4, i0 + 19, 13, k0 + 5, 0xf6f4ee);
    }
  // the whiteboard on its legs, covered in boxes and arrows
  f.box(70, 0, 22, 70, 26, 23, 0x8a8f99);
  f.box(92, 0, 22, 92, 26, 23, 0x8a8f99);
  f.box(70, 8, 24, 92, 26, 24, (x, y) => (x === 70 || x === 92 || y === 8 || y === 26 ? 0xbfc4cc : 0xfbf8f1));
  for (const [x, y, w, c] of [[73, 21, 5, 0x2f6be8], [82, 22, 6, 0xd74718], [74, 13, 4, 0x4f9a5c], [84, 12, 5, 0x2f6be8]] as const) {
    f.box(x, y, 25, x + w, y, 25, c);
    f.box(x, y - 3, 25, x + w, y - 3, 25, c);
    f.box(x, y - 3, 25, x, y, 25, c);
    f.box(x + w, y - 3, 25, x + w, y, 25, c);
  }
  f.box(79, 19, 25, 81, 19, 25, 0x2a2f3d);
  f.box(78, 15, 25, 78, 17, 25, 0x2a2f3d);
  // the couch on the rug, a low table, a big plant
  f.box(80, 0, 74, 108, 4, 80, 0x4a5f8a);
  f.box(80, 5, 79, 108, 10, 80, 0x3f5278);
  for (const x of [80, 107]) f.box(x, 5, 74, x + 1, 7, 79, 0x3f5278);
  f.box(86, 0, 62, 102, 4, 68, (x, y) => (y === 4 ? 0x6b4a32 : x === 86 || x === 102 ? 0x2a2f3d : null));
  f.box(112, 0, 70, 117, 5, 75, 0xd9d4ca);
  f.blob(114.5, 12, 72.5, 5, 7, 5, (x, y, z) => (hash3(x, y, z) > 0.7 ? 0x3f7a32 : 0x4f9a45), 0.8, 3);
  // the kitchen on the left wall: counter, coffee, the kombucha tap
  f.box(0, 0, 50, 7, 9, 68, (x, y) => (y === 9 ? 0xe9e4da : 0x2a2f3d));
  f.box(1, 10, 52, 5, 15, 56, 0x8a8f99);
  f.box(2, 10, 60, 5, 13, 66, 0xb8834f);
  for (const z of [61, 63, 65]) f.box(6, 11, z, 7, 12, z, 0xd9d4ca);
  mesh(f);

  // the neon on the left wall
  // on the left wall, words run toward you to read left to right
  const neon = new Voxels(S, 0);
  const words = "WE'RE HIRING";
  const end = 60;
  letters(neon, words, 1, 31, end, 0xff5f8f, { axis: "-z" });
  for (let k = end - textWidth(words) - 2; k <= end + 2; k += 1) {
    neon.set(1, 24, k, 0xff8fb1);
    neon.set(1, 33, k, 0xff8fb1);
  }
  for (let k = 22; k <= 74; k += 1) if (k % 26 > 2) neon.set(1, H - 4, k, 0xfff1d6);
  mesh(neon, materials.glow, false);

  // —— light: the sun low through the windows
  const sun = new DirectionalLight(dusk ? 0xffb48a : 0xffd8a8, dusk ? 2.0 : 3.0);
  sun.position.set(4, 7, -14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(dusk ? 0xd0c0e8 : 0xf6efe4, 0x9a8a7a, 1.6);
  group.add(sun, sun.target, hemi);

  const colliders: Collider[] = [
    block(14, 22, 36, 29),
    block(40, 22, 62, 29),
    block(14, 40, 36, 47),
    block(40, 40, 62, 47),
    block(70, 22, 92, 25), // whiteboard
    block(80, 74, 108, 80), // couch
    block(86, 62, 102, 68), // table
    block(112, 70, 117, 75), // plant
    block(0, 50, 7, 68), // kitchen
  ];
  const spots: Spot[] = [
    { id: "window", label: "Window", at: at(55, 20, 1), reach: 2.0 },
    { id: "whiteboard", label: "Whiteboard", at: at(81, 16, 26), reach: 1.5 },
    { id: "kombucha", label: "Kombucha tap", at: at(7, 11, 63), reach: 1.4 },
    { id: "neon", label: "Neon sign", at: at(1, 27, 38), reach: 1.6 },
  ];

  const room = {
    group,
    colliders,
    spots,
    background: dusk ? { top: new Color(0x2a2a5a), bottom: new Color(0xf0a080) } : { top: new Color(0xf3ece0), bottom: new Color(0xe9e2d4) },
    span: { wide: 13.2, tall: 9.8 },
    centre: new Vector3(0, 1.2, 0.2),
    follow: 0.34,
    bounds: { x0: -5.8, x1: 5.8, z0: -3.6, z1: 4.0 },
    spawn: at(56, 0, 76),
    heading: Math.PI,
    night: dusk ? 0.3 : 0,
    clouds: 0,
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Office = ReturnType<typeof office>;
