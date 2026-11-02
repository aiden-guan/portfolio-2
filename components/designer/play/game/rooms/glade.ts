import { Color, DirectionalLight, Group, HemisphereLight, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, letters, meshOf, outdoorFloor, outdoorSolid, textWidth, type Collider, type Room, type Spot } from "./common";

// Memorial Glade: the lawn in front of Doe Library, the Campanile over the
// trees at the far corner, paths cut across the grass, a kiosk of flyers,
// a bench under the lamps. By day, people everywhere on blankets; by night,
// the clock lit and nobody but whoever needed the walk.
//
// 140 × 100 voxels; the library across the back, the tower at the right.

const W = 140;
const D = 100;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

export function glade({ night = false }: { night?: boolean } = {}) {
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material ?? outdoorSolid, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the lawn, the paths across it
  const ground = new Voxels(S, 0.04);
  const path = (i: number, k: number) => {
    if (k >= 18 && k <= 24) return true; // along the library
    const d = Math.abs(i - 70 - (k - 60) * 0.9);
    if (d <= 3 && k > 24) return true; // the diagonal
    return Math.abs(i - 26) <= 2 && k > 24;
  };
  for (let i = -1; i <= W; i += 1)
    for (let k = -1; k <= D; k += 1) {
      for (let j = -4; j <= -2; j += 1) ground.set(i, j, k, j === -4 ? 0x5e4630 : 0x6b4f36);
      let c: number;
      if (path(i, k)) c = hash3(i, k, 2) > 0.5 ? 0xd9d4ca : 0xcfc9bd;
      else {
        c = Math.floor((i + k * 0.3) / 7) % 2 ? 0x5a9a3c : 0x529236;
        if (hash3(i, k, 7) > 0.92) c = mix(c, 0x8fcf55, 0.35);
      }
      ground.set(i, -1, k, c);
    }
  mesh(ground, outdoorFloor, false);

  const f = new Voxels(S, 0.035);
  // —— Doe Library: steps, columns, a cornice, dark windows behind
  const stone = (x: number, y: number, z: number) => (hash3(x, y, z) > 0.85 ? 0xe2dccd : 0xefe9dc);
  f.box(14, 0, 0, 94, 34, 9, (x, y, z) => (z === 9 && y > 4 && y < 28 && x % 10 > 3 && x % 10 < 8 ? 0x3a4252 : stone(x, y, z)));
  for (let x = 18; x <= 90; x += 10) f.box(x, 3, 10, x + 2, 28, 12, (vx, y) => (y === 3 || y === 28 ? 0xd9d4ca : 0xfbf8f1));
  f.box(14, 29, 9, 94, 31, 13, 0xe2dccd);
  f.box(14, 32, 9, 94, 33, 11, 0xd9d4ca);
  f.box(18, 0, 13, 90, 1, 16, 0xd9d4ca);
  f.box(20, 2, 13, 88, 2, 14, 0xd9d4ca);
  letters(f, "DOE LIBRARY", 54 - Math.floor(textWidth("DOE LIBRARY") / 2), 31, 14, 0x8a8f99, { axis: "x" });

  // —— the Campanile, just past the library's end
  const T = { i: 100, k: 4 };
  f.box(T.i, 0, T.k, T.i + 11, 2, T.k + 11, 0xd9d4ca);
  const drop = 8;
  f.box(T.i + 1, 3, T.k + 1, T.i + 10, 46 - drop, T.k + 10, (x, y, z) => (y % 8 === 0 ? 0xe2dccd : (x + z) % 5 === 0 ? 0xe9e3d6 : 0xf1ece2));
  // the belfry: open arches, a dark inside
  f.box(T.i + 1, 47 - drop, T.k + 1, T.i + 10, 55 - drop, T.k + 10, (x, y, z) => ((x === T.i + 1 || x === T.i + 10 || z === T.k + 1 || z === T.k + 10) && (x + z) % 3 !== 0 && y > 48 - drop && y < 55 - drop ? 0x3a3a44 : 0xefe9dc));
  f.box(T.i, 56 - drop, T.k, T.i + 11, 57 - drop, T.k + 11, 0xe2dccd);
  // the roof, stepped to a point, and its lantern
  for (let s = 0; s < 8; s += 1) f.box(T.i + 1 + Math.floor(s * 0.6), 58 - drop + s, T.k + 1 + Math.floor(s * 0.6), T.i + 10 - Math.floor(s * 0.6), 58 - drop + s, T.k + 10 - Math.floor(s * 0.6), s % 2 ? 0x8fa49a : 0x9bb0a6);
  f.box(T.i + 5, 66 - drop, T.k + 5, T.i + 6, 70 - drop, T.k + 6, 0xc9b98a);
  mesh(f);

  // the clock faces you can see, lit at night
  const lit = new Voxels(S, 0);
  for (const [face, axis] of [["front", "z"], ["side", "x"]] as const) {
    for (let a = -3; a <= 3; a += 1)
      for (let b = -3; b <= 3; b += 1) {
        if (a * a + b * b > 10) continue;
        const c = a * a + b * b > 6 ? 0x2a2f3d : night ? 0xfff1c8 : 0xfbf8f1;
        if (axis === "z") lit.set(T.i + 5 + a, 34 + b, T.k + 11, c);
        else lit.set(T.i + 11, 34 + b, T.k + 5 + a, c);
      }
    if (face === "front") {
      lit.box(T.i + 5, 34, T.k + 12, T.i + 5, 36, T.k + 12, 0x1b1d22);
      lit.box(T.i + 5, 34, T.k + 12, T.i + 7, 34, T.k + 12, 0x1b1d22);
    }
  }
  mesh(lit, night ? materials.glow : materials.solid, false);

  // —— trees, a kiosk of flyers, a bench, bikes, lamps
  const t = new Voxels(S, 0.04);
  const oak = (i: number, k: number, h: number, r: number) => {
    t.limb(i, 0, k, i + 1, h, k, 1.6, 1.1, 0x6b4a32);
    t.limb(i, h - 3, k, i - 4, h + 2, k + 2, 0.9, 0.6, 0x6b4a32);
    t.blob(i, h + 4, k, r, r * 0.7, r, (x, y, z) => (hash3(x, y, z) > 0.75 ? 0x3f7a32 : y > h + 6 ? 0x5a9a3c : 0x4a8a38), 0.85, i);
    t.blob(i - 5, h + 1, k + 3, r * 0.6, r * 0.5, r * 0.6, 0x4a8a38, 0.85, k);
  };
  oak(8, 40, 24, 11);
  oak(132, 52, 22, 10);
  oak(12, 88, 20, 9);
  oak(124, 34, 24, 10);
  // the kiosk, round, flyers all over it
  t.box(40, 0, 30, 45, 22, 35, (x, y, z) => (y > 3 && y < 21 ? [0xf2c46b, 0xfbf8f1, 0xe88a9a, 0x9cc0fa, 0x8fd3b6][Math.floor(hash3(x, Math.floor(y / 4), z) * 5)] : 0x2a5f3a));
  t.box(39, 23, 29, 46, 24, 36, 0x2a5f3a);
  t.box(43, 12, 36, 45, 16, 36, 0x6b4de6); // Build Night's flyer, purple
  // a bench under a lamp, facing the glade
  t.box(84, 4, 80, 100, 4, 84, 0x8a5a3c);
  t.box(84, 5, 85, 100, 9, 85, 0x8a5a3c);
  for (const x of [85, 99]) t.box(x, 0, 81, x, 3, 85, 0x2a2f3d);
  for (const [i, k] of [[80, 82], [104, 82], [34, 22], [118, 22]]) {
    t.box(i, 0, k, i + 1, 30, k + 1, 0x2a2f3d);
    t.box(i - 1, 31, k - 1, i + 2, 31, k + 2, 0x2a2f3d);
  }
  // bikes in a rack by the library
  for (let n = 0; n < 4; n += 1) {
    const x = 6 + n * 5;
    for (const z of [26, 33]) for (let a = 0; a < 16; a += 1) t.set(x, 3 + Math.round(Math.sin((a / 16) * Math.PI * 2) * 3), z + Math.round(Math.cos((a / 16) * Math.PI * 2) * 3), 0x2a2f3d);
    t.box(x, 4, 26, x, 4, 33, [0xd74718, 0x2f6be8, 0x4f9a5c, 0xf2c46b][n]);
    t.box(x, 5, 31, x, 7, 31, 0x2a2f3d);
  }
  mesh(t);

  const glow = new Voxels(S, 0);
  for (const [i, k] of [[80, 82], [104, 82], [34, 22], [118, 22]]) glow.box(i - 1, 28, k - 1, i + 2, 30, k + 2, 0xffd998);
  mesh(glow, night ? materials.glow : materials.lamp, false);

  // —— light: afternoon, or the moon and the lamps
  const sun = new DirectionalLight(night ? 0x9fb4ff : 0xffe2b0, night ? 0.8 : 3.1);
  sun.position.set(12, 10, 8);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = night ? new HemisphereLight(0x5a6fb0, 0x22302a, 1.1) : new HemisphereLight(0xdfeaff, 0x6a8a4a, 1.45);
  group.add(sun, sun.target, hemi);
  if (night)
    for (const [i, k] of [[80, 82], [104, 82]]) {
      const lamp = new PointLight(0xffd29a, 3.2, 5, 2);
      lamp.position.copy(at(i, 28, k));
      group.add(lamp);
    }

  const colliders: Collider[] = [
    block(14, 0, 94, 16), // the library and its steps
    block(100, 0, 111, 15), // the tower
    block(40, 30, 45, 35), // the kiosk
    block(84, 80, 100, 85), // the bench
    block(4, 24, 24, 35), // bikes
    block(7, 39, 9, 41),
    block(131, 51, 133, 53),
    block(11, 87, 13, 89),
    block(123, 33, 125, 35),
  ];
  const spots: Spot[] = [
    { id: "flyer", label: "Kiosk", at: at(44, 14, 36), reach: 1.4 },
    { id: "campanile", label: "Campanile", at: at(105, 10, 16), reach: 1.8 },
    { id: "library", label: "Doe Library", at: at(54, 6, 17), reach: 1.8 },
    { id: "bench", label: "Bench", at: at(92, 6, 86), reach: 1.4 },
  ];

  const room = {
    group,
    colliders,
    spots,
    background: night ? { top: new Color(0x0e1c40), bottom: new Color(0x2a3c6c) } : { top: new Color(0xa9c6ef), bottom: new Color(0xf2e6d0) },
    span: { wide: 14.6, tall: 10.2 },
    centre: new Vector3(0.7, 1.8, 0.2),
    follow: 0.4,
    bounds: { x0: -6.8, x1: 6.8, z0: -3.2, z1: 4.8 },
    spawn: at(70, 0, 92),
    heading: Math.PI,
    night: night ? 0.85 : 0,
    clouds: night ? 0 : 0.6,
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Glade = ReturnType<typeof glade>;
