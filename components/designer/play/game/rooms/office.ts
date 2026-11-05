import { Color, DirectionalLight, Group, HemisphereLight, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, calm, disposeAll, grid, indoorFloor, letters, meshOf, nearEdge, textScreen, textWidth, twinkleGlow, viewGlow, type Collider, type Room, type Spot } from "./common";
import { alive, motes, shaft, steam, towards, type Life, type Opening } from "./life";

// A startup's office in San Francisco at golden hour: brick, big factory
// windows with the city and the Bay Bridge in them (its cables lighting up
// as the sky goes), the low sun laid across the floor in long bars, standing
// desks with code on every screen, a whiteboard nobody has erased in weeks,
// a couch, the kombucha tap, and a neon sign that says what every office
// here says.
//
// 120 × 84 voxels; the windows across the back, the sign on the left wall.

const W = 120;
const D = 84;
const H = 40;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

export function office({ dusk = false }: { dusk?: boolean } = {}) {
  calm();
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
      if (nearEdge(i, k, W - 1, D - 1)) for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x6d6b65);
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

  // —— the city through the glass: towers, the bay, and the Bay Bridge.
  // Seen through the glass from above, what's further back shows lower down
  // and to the left, so the view is drawn that much below where it appears.
  const city = new Voxels(S, 0);
  const sky = (j: number) => (dusk ? mix(0xf6b088, 0x6a5aa8, Math.min(1, Math.max(0, j - 4) / 28)) : mix(0xffdcaa, 0x9ec4ee, Math.min(1, Math.max(0, j - 4) / 28)));
  for (let i = 2; i <= 102; i += 1)
    for (let j = 2; j <= 36; j += 1) {
      const tower = 11 + Math.floor(hash3(Math.floor(i / 5), 1, 9) * 13) + (i > 22 && i < 30 ? 8 : 0);
      let c = sky(j);
      if (j <= 6) c = dusk ? (hash3(i, j, 4) > 0.9 ? 0x8a8ab8 : 0x3a4a7a) : hash3(i, j, 4) > 0.9 ? 0xbfe0f0 : 0x6a9ac0; // the bay, catching the light
      else if (i < 66 && j <= tower) {
        c = dusk ? 0x2a3050 : (i % 5 === 0 ? 0x7a8298 : 0x8a92a8);
        if (i % 2 === 0 && j % 2 === 0 && hash3(i, j, 3) > (dusk ? 0.35 : 0.8)) c = dusk ? 0xffd998 : 0xdfe6f0;
      } else if (i >= 66 && j <= 8 + Math.round(Math.sin(i * 0.2) * 1.2)) c = dusk ? 0x3a3a5e : 0x8a9ab0; // the hills over the water
      city.set(i, j, -6, c);
    }
  mesh(city, viewGlow, false).receiveShadow = false;
  // the bridge, across the right two windows: towers, the deck, the cable's
  // swoop, and the cables hanging from it, which light up at dusk
  const bridge = new Voxels(S, 0);
  const lights = new Voxels(S, 0);
  const deck = 9;
  for (const t of [74, 90]) bridge.box(t, 5, -5, t + 1, 24, -5, (x, y) => (y === 16 || y === 22 ? (dusk ? 0x8a8296 : 0xa0a4ac) : dusk ? 0xd9d4ca : 0xc9ccd2));
  for (let i = 64; i <= 102; i += 1) {
    bridge.set(i, deck, -5, dusk ? 0x4a4a62 : 0x8a8f99);
    const span = i >= 75 && i <= 90;
    const y = span ? 23 - Math.round(Math.sin(((i - 75) / 15) * Math.PI) * 11) : i < 75 ? Math.round(23 - ((75 - i) / 11) * 13) : Math.round(23 - ((i - 90) / 12) * 13);
    if (y > deck) bridge.set(i, y, -5, dusk ? 0xfff1d6 : 0xd9d4ca);
    // the hangers, every other voxel: lit at dusk
    if (i % 2 === 0 && y > deck + 1) for (let j = deck + 1; j < y; j += 1) (dusk ? lights : bridge).set(i, j, -5.4, dusk ? 0xfff4dc : 0xb0b4bc);
    if (dusk && i % 3 === 0) lights.set(i, deck + 1, -4.6, i % 6 ? 0xffd998 : 0xff8a5c);
  }
  mesh(bridge, viewGlow, false).receiveShadow = false;
  if (dusk) mesh(lights, twinkleGlow, false).receiveShadow = false;

  // —— the room: standing desks, a whiteboard, the couch, the kitchen
  const f = new Voxels(S, 0.035);
  for (const k0 of [22, 40])
    for (const i0 of [14, 40]) {
      f.box(i0, 10, k0, i0 + 22, 10, k0 + 7, 0xd9c49b);
      for (const x of [i0 + 1, i0 + 21]) f.box(x, 0, k0 + 3, x + 1, 9, k0 + 4, 0x2a2f3d);
      for (let x = i0 + 2; x < i0 + 20; x += 7) {
        f.box(x + 1, 11, k0 + 1, x + 2, 12, k0 + 1, 0x1b1d22);
        f.box(x, 13, k0, x + 4, 17, k0, 0x1b1d22);
        f.box(x, 13, k0 + 1, x + 4, 17, k0 + 1, (vx, y) => (vx === x || vx === x + 4 || y === 13 || y === 17 ? 0x1b1d22 : null));
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

  // what's on the screens
  const screens = [new Voxels(S, 0), new Voxels(S, 0)];
  for (const k0 of [22, 40])
    for (const i0 of [14, 40])
      for (let x = i0 + 2; x < i0 + 20; x += 7) screens[Math.floor(hash3(x, k0, 5) * 2)].box(x + 1, 14, k0 + 1, x + 3, 16, k0 + 1, 0x141c30);
  mesh(screens[0], textScreen("z", 0x9cc0fa, 0.9), false);
  mesh(screens[1], textScreen("z", 0x7dffa8, 1.4), false);

  // the neon on the left wall
  // on the left wall, words run toward you to read left to right
  const neon = new Voxels(S, 0);
  const words = "WE'RE HIRING";
  // low enough, and near enough, to be read from across the room
  const end = 74;
  letters(neon, words, 1, 24, end, 0xff5f8f, { axis: "-z" });
  for (let k = end - textWidth(words) - 2; k <= end + 2; k += 1) {
    neon.set(1, 17, k, 0xff8fb1);
    neon.set(1, 26, k, 0xff8fb1);
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
  const hemi = new HemisphereLight(dusk ? 0xd0c0e8 : 0xf6efe4, 0x9a8a7a, dusk ? 1.35 : 1.5);
  group.add(sun, sun.target, hemi);
  // the room's own lights coming on as it gets dark
  for (const [i, k] of [[25, 32], [51, 32]]) {
    const pendant = new PointLight(0xffd6a0, dusk ? 1.6 : 0.5, 4.5, 2);
    pendant.position.copy(at(i, 26, k));
    group.add(pendant);
  }

  // the low sun through each window, long across the floor, and dust in it
  const light = towards(sun.position, sun.target.position);
  const lives: Life[] = [steam(at(33, 14, 27), { count: 4, rise: 0.25, rate: 0.28, seed: 6 }), steam(at(3.5, 16, 54.5), { count: 5, rise: 0.3, rate: 0.36, seed: 2 })];
  for (const i0 of [10, 42, 74]) {
    const opening: Opening = [at(i0, 8, 0), at(i0 + 27, 8, 0), at(i0 + 27, 35, 0), at(i0, 35, 0)];
    lives.push(shaft(opening, light, { color: dusk ? 0xffc89a : 0xffe2b8, strength: dusk ? 0.03 : 0.04, panes: [3, 3] }));
    if (i0 !== 74) lives.push(motes(opening, light, { count: 14, seed: i0 }));
  }
  const life = alive(group, lives);

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
    { id: "neon", label: "Neon sign", at: at(1, 21, 51), reach: 1.6 },
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
    update: (time: number, dt: number) => life.update(time, dt),
    dispose: () => {
      life.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Office = ReturnType<typeof office>;
