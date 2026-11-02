import { Color, Group, HemisphereLight, PointLight, SpotLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, indoorFloor, letters, meshOf, textWidth, type Collider, type Room, type Spot } from "./common";

// A conference auditorium on competition day: a low stage between red
// curtains, the trio's slide on the screen, a podium, the judges' table in
// front of the seats, the house lights down and the stage lights up.
//
// 120 × 90 voxels; the stage across the back (z < −1.9), raised 0.3.

const W = 120;
const D = 90;
const H = 40;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);
const STAGE_K = 26;
const STAGE_H = 3;

export function auditorium() {
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: patterned carpet, the stage's planks
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x4a2a2a);
      const motif = (i + k) % 8 === 0 || (i - k + 800) % 8 === 0;
      floor.set(i, -1, k, motif ? 0x8e3a33 : hash3(i, k, 2) > 0.5 ? 0x7a2a2a : 0x732727);
    }
  mesh(floor, indoorFloor, false);

  const stage = new Voxels(S, 0.035);
  for (let i = 6; i <= 113; i += 1)
    for (let k = 0; k <= STAGE_K; k += 1)
      for (let j = 0; j < STAGE_H; j += 1) {
        const top = j === STAGE_H - 1;
        stage.set(i, j, k, top ? (Math.floor(i / 4) % 2 ? 0xb8834f : 0xae7745) : k === STAGE_K ? 0x2a1f1a : 0x4a3426);
      }
  // steps at the front, both sides
  for (const i0 of [10, 101]) stage.box(i0, 0, STAGE_K + 1, i0 + 8, 1, STAGE_K + 3, 0x8a5a3c);
  mesh(stage, indoorFloor);

  // —— the room: dark walls, the screen, the banner, the curtains
  const walls = new Voxels(S, 0.02);
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) walls.set(i, j, k, j > H - 4 ? 0x1b1d22 : 0x2a2230);
    for (let k = 0; k < D; k += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, j < 2 ? 0x1b1d22 : (k % 14 < 2 ? 0x332a38 : 0x2a2230));
  }
  mesh(walls);

  const f = new Voxels(S, 0.035);
  // curtains, gathered in folds either side
  for (const [i0, i1] of [[6, 16], [103, 113]] as const)
    for (let i = i0; i <= i1; i += 1)
      for (let j = STAGE_H; j <= H - 2; j += 1) for (let k = 0; k <= 3; k += 1) if (k <= (i % 3 === 0 ? 3 : 1)) f.set(i, j, k, i % 3 === 0 ? 0x8e1f22 : 0xa3262a);
  for (let i = 6; i <= 113; i += 1) for (let j = H - 6; j <= H - 2; j += 1) f.set(i, j, 1, j === H - 6 ? 0xf2c46b : i % 4 === 0 ? 0x8e1f22 : 0xa3262a);
  // the banner over the screen
  const title = "FBLA REGIONALS";
  const wide = textWidth(title, 1);
  f.box(25, 26, 1, 95, 32, 1, 0x1f3f8a);
  // the podium and its microphone
  f.box(57, STAGE_H, 14, 63, STAGE_H + 10, 19, (x, y, z) => (z === 19 && y === STAGE_H + 7 ? 0xf2c46b : 0x6b4a32));
  f.box(58, STAGE_H + 11, 15, 62, STAGE_H + 11, 19, 0x4a3426);
  f.box(60, STAGE_H + 12, 18, 60, STAGE_H + 14, 18, 0x2a2f3d);
  // the judges' table: a white cloth, name cards, water
  f.box(48, 0, 39, 80, 6, 44, (x, y, z) => (y === 6 || z === 44 ? 0xf4f1ea : null));
  f.box(48, 0, 39, 48, 5, 44, 0xe4dfd4);
  f.box(80, 0, 39, 80, 5, 44, 0xe4dfd4);
  for (const x of [52, 62, 72]) {
    f.box(x, 7, 41, x + 2, 8, 41, 0xfbf8f1);
    f.box(x + 5, 7, 42, x + 5, 8, 42, 0x9cc0fa);
  }
  // judges' chairs, then the rows of seats behind them
  const chair = (x: number, k: number, seat: number) => {
    f.box(x - 2, 0, k - 2, x + 2, 3, k + 2, (vx, y) => (y === 3 ? seat : vx === x - 2 || vx === x + 2 ? 0x1b1d22 : null));
    f.box(x - 2, 4, k + 2, x + 2, 8, k + 2, seat);
  };
  for (const x of [-0.7, 0.3, 1.3]) chair(Math.round(60 + x * 10), 48, 0x2a2f3d);
  for (const z of [1.1, 1.9, 2.7]) for (const x of [-3.4, -2.6, -1.8, 1.6, 2.4, 3.2, 4.0]) chair(Math.round(60 + x * 10), Math.round(45 + z * 10), 0x8e1f22);
  mesh(f);

  // what's lit: the screen with the slide, the banner's letters, the exit sign
  const lit = new Voxels(S, 0);
  const slide = "AGNOTIFY + DENIM";
  lit.box(25, 8, 0, 95, 24, 0, (x, y) => (x === 25 || x === 95 || y === 8 || y === 24 ? 0x9cc0fa : 0x2f6be8));
  letters(lit, slide, 60 - Math.floor(textWidth(slide, 1) / 2), 22, 1, 0xfff4d6, { axis: "x" });
  // a chart on the slide that only goes up
  for (let n = 0; n < 6; n += 1) lit.box(41 + n * 7, 10, 1, 43 + n * 7, 11 + n, 1, n === 5 ? 0xf2c46b : 0x9cc0fa);
  letters(lit, title, 60 - Math.floor(wide / 2), 31, 2, 0xf2c46b, { axis: "x" });
  lit.box(2, 24, 86, 2, 26, 89, 0x3fd17a);
  mesh(lit, materials.glow, false);

  // —— light: the house down, two warm lights on the stage, the screen's blue
  const hemi = new HemisphereLight(0x8a7fb0, 0x3a2424, 1.35);
  const spots = [-2.6, 2.6].map((x) => {
    const light = new SpotLight(0xffe2b0, 34, 14, 0.42, 0.6, 1.4);
    light.position.set(x, 6.5, 2.5);
    light.target.position.set(x * 0.25, 0.3, -2.6);
    group.add(light, light.target);
    return light;
  });
  const screenLight = new PointLight(0x6f9cf5, 1.6, 6, 2);
  screenLight.position.copy(at(60, 16, 6));
  group.add(hemi, screenLight);

  const colliders: Collider[] = [
    block(47, 38, 81, 45), // the judges' table
    block(50, 46, 76, 50), // their chairs
    block(57, 13, 63, 20), // the podium
    block(6, 0, 16, 4), // curtains
    block(103, 0, 113, 4),
  ];
  for (const z of [1.1, 1.9, 2.7]) {
    const k = Math.round(45 + z * 10);
    colliders.push(block(22, k - 2, 44, k + 2), block(74, k - 2, 102, k + 2));
  }
  const spotList: Spot[] = [
    { id: "stage", label: "Present", at: at(60, 10, 21), reach: 1.6 },
    { id: "judges", label: "Judges", at: at(64, 7, 42), reach: 1.4 },
  ];

  const room = {
    group,
    colliders,
    spots: spotList,
    background: { top: new Color(0x120c18), bottom: new Color(0x2a1a28) },
    span: { wide: 13.2, tall: 9.6 },
    centre: new Vector3(0, 1.5, -0.4),
    follow: 0.3,
    bounds: { x0: -5.3, x1: 5.3, z0: -4.1, z1: 4.2 },
    spawn: at(14, 0, 82),
    heading: Math.PI,
    night: 0.4,
    clouds: 0,
    /** The stage is a step up. */
    floorAt: (x: number, z: number) => (z < (STAGE_K + 1 - ORIGIN[1]) * S && x > (6 - ORIGIN[0]) * S && x < (114 - ORIGIN[0]) * S ? STAGE_H * S : 0),
    update: (time: number) => {
      for (const [n, light] of spots.entries()) light.intensity = 34 + Math.sin(time * 0.7 + n) * 2;
    },
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Auditorium = ReturnType<typeof auditorium>;
