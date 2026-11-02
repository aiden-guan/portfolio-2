import { Color, Group, HemisphereLight, PointLight, SpotLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, indoorFloor, letters, meshOf, textWidth, type Collider, type Room, type Spot } from "./common";

// A hackathon at night: long tables of laptops, a stage with the event's
// name on the screen, pizza going cold on the side, beanbags for whoever's
// given up on sleep. The same room for every event, lit in each one's
// colour and with its own name up on the screen.
//
// 130 × 90 voxels; the stage across the back, raised 0.3.

const W = 130;
const D = 90;
const H = 42;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);
const STAGE_K = 18;
const STAGE_H = 3;

export type EventId = "buildnight" | "speedhacks" | "yc";

const EVENTS: Record<EventId, { lines: [string, string]; accent: number; second: number; wall: number }> = {
  buildnight: { lines: ["SPACEXAI", "BUILD NIGHT"], accent: 0x6b4de6, second: 0x9cc0fa, wall: 0x1c1a2e },
  speedhacks: { lines: ["A16Z", "SPEEDHACKS"], accent: 0xffd23f, second: 0xf08a32, wall: 0x1e1c1a },
  yc: { lines: ["MAKE SOMETHING", "AGENTS WANT"], accent: 0xf26522, second: 0xfbf8f1, wall: 0x22201e },
};

/** The team's table, middle row on the right: chair x positions along it,
 * and the z of the chairs on the near side (facing away) and the far side. */
export const TEAM = { xs: [1.0, 1.8, 2.6, 3.4], near: (59 - ORIGIN[1]) * S, far: (47 - ORIGIN[1]) * S };

export function hackathon({ event = "buildnight" as EventId } = {}) {
  const e = EVENTS[event];
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: a venue's dark carpet, cables taped down across it
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, 0x1b1d22);
      let c = hash3(i, k, 2) > 0.5 ? 0x2e3140 : 0x2a2d3a;
      if ((k === 44 || k === 60) && i > 6 && i < 124) c = 0x4a4d5a;
      floor.set(i, -1, k, c);
    }
  mesh(floor, indoorFloor, false);

  const stage = new Voxels(S, 0.035);
  for (let i = 6; i <= 123; i += 1)
    for (let k = 0; k <= STAGE_K; k += 1) for (let j = 0; j < STAGE_H; j += 1) stage.set(i, j, k, j === STAGE_H - 1 ? (Math.floor(i / 5) % 2 ? 0x2a2d3a : 0x24273a) : k === STAGE_K ? e.accent : 0x16171f);
  for (const i0 of [10, 112]) stage.box(i0, 0, STAGE_K + 1, i0 + 7, 1, STAGE_K + 3, 0x2a2d3a);
  mesh(stage, indoorFloor);

  // —— walls: dark, an LED strip along the top in the event's colour
  const walls = new Voxels(S, 0.02);
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) walls.set(i, j, k, j < 2 ? 0x101116 : e.wall);
    for (let k = 0; k < D; k += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, j < 2 ? 0x101116 : e.wall);
  }
  mesh(walls);

  const f = new Voxels(S, 0.035);
  // the stage: a podium, speakers either side
  f.box(56, STAGE_H, 9, 64, STAGE_H + 10, 13, (x, y, z) => (z === 13 && y === STAGE_H + 7 ? e.accent : 0x2a2d3a));
  for (const i0 of [14, 108]) f.box(i0, STAGE_H, 3, i0 + 7, STAGE_H + 16, 9, (x, y, z) => (z === 9 && (y - STAGE_H) % 5 > 1 && x > i0 && x < i0 + 7 ? 0x3a3d4a : 0x1b1d22));
  // the long tables: two runs a row, three rows, chairs either side
  const tables = [34, 50, 66];
  for (const k0 of tables)
    for (const [i0, i1] of [[10, 60], [70, 120]]) {
      f.box(i0, 6, k0, i1, 7, k0 + 6, (x, y) => (y === 7 ? 0xe9e4da : 0x9aa0a8));
      for (const x of [i0 + 1, i1 - 1]) for (const z of [k0 + 1, k0 + 5]) f.box(x, 0, z, x, 5, z, 0x5a5f6a);
      for (let x = i0 + 3; x < i1 - 3; x += 8) for (const z of [k0 - 4, k0 + 8]) f.box(x, 0, z, x + 4, 4, z + 2, (vx, y) => (y === 4 ? 0x2a2d3a : vx === x || vx === x + 4 ? 0x1b1d22 : null));
      // laptops, cans, a hoodie over a chair
      for (let x = i0 + 3; x < i1 - 3; x += 8) {
        const open = hash3(x, k0, 3) > 0.25;
        if (open) {
          f.box(x, 8, k0 + 1, x + 4, 8, k0 + 2, 0xbfc4cc);
          f.box(x, 9, k0, x + 4, 12, k0, 0xbfc4cc);
          f.box(x, 8, k0 + 4, x + 4, 8, k0 + 5, 0xbfc4cc);
          f.box(x, 9, k0 + 6, x + 4, 12, k0 + 6, 0xbfc4cc);
        }
        if (hash3(x, k0, 5) > 0.55) f.box(x + 5, 8, k0 + 3, x + 5, 10, k0 + 3, [0x2fb5a6, 0xd74718, 0xf6f4ee, 0x4f9a5c][Math.floor(hash3(x, k0, 6) * 4)]);
      }
    }
  // pizza on a side table, boxes open, one slice left in each
  f.box(2, 0, 38, 8, 7, 62, (x, y) => (y === 7 ? 0xe9e4da : x === 2 || x === 8 ? 0x5a5f6a : null));
  for (let n = 0; n < 4; n += 1) {
    const z = 40 + n * 6;
    f.box(2, 8, z, 7, 8, z + 4, 0xc9a27a);
    f.box(3, 9, z + 1, 4, 9, z + 2, 0xf2c46b);
    f.set(3, 9, z + 1, 0xd74718);
  }
  // beanbags in the near corner
  for (const [i, k, c] of [[104, 80, e.accent], [114, 84, 0x2f6be8], [96, 86, 0xd74718]] as const) f.blob(i, 3, k, 5, 3.5, 5, (x, y) => (y > 4 ? mix(c, 0xffffff, 0.12) : c));
  // a sponsor wall down the side
  f.box(0, 8, 70, 0, 30, 88, (x, y, z) => ((Math.floor(y / 6) + Math.floor(z / 6)) % 2 ? mix(e.wall, 0xffffff, 0.12) : mix(e.wall, 0xffffff, 0.06)));
  mesh(f);

  // —— what glows: the screen, the strips, the laptops, the podium's mark
  const lit = new Voxels(S, 0);
  // the event's name in two lines, as big as each fits
  lit.box(28, 11, 0, 102, 38, 0, (x, y) => (x === 28 || x === 102 || y === 11 || y === 38 ? e.accent : mix(0x0e0f16, e.accent, 0.12)));
  const [a, b] = e.lines;
  const scaleA = textWidth(a, 2) <= 70 ? 2 : 1;
  const scaleB = textWidth(b, 2) <= 70 ? 2 : 1;
  letters(lit, a, 65 - Math.floor(textWidth(a, scaleA) / 2), 35, 1, 0xfbf8f1, { axis: "x", scale: scaleA });
  letters(lit, b, 65 - Math.floor(textWidth(b, scaleB) / 2), 35 - 5 * scaleA - 3, 1, e.accent, { axis: "x", scale: scaleB });
  for (let i = 0; i < W; i += 1) lit.set(i, H - 3, 0, i % 4 === 0 ? e.second : e.accent);
  for (let k = 0; k < D; k += 1) lit.set(0, H - 3, k, k % 4 === 0 ? e.second : e.accent);
  for (const k0 of tables)
    for (const [i0, i1] of [[10, 60], [70, 120]])
      for (let x = i0 + 3; x < i1 - 3; x += 8) {
        if (hash3(x, k0, 3) <= 0.25) continue;
        const c = [0x9cc0fa, 0x3fd17a, 0xfbf8f1, e.accent, 0x2f6be8][Math.floor(hash3(x, k0, 4) * 5)];
        lit.box(x + 1, 10, k0 + 1, x + 3, 11, k0 + 1, c);
        lit.box(x + 1, 10, k0 + 5, x + 3, 11, k0 + 5, mix(c, 0xffffff, 0.2));
      }
  mesh(lit, materials.glow, false);

  // —— light: low house lights, the screen's colour, a spot on the podium
  const hemi = new HemisphereLight(mix(0x8a86c8, e.accent, 0.25), 0x1b1a22, 1.3);
  const screen = new PointLight(e.accent, 3.5, 9, 2);
  screen.position.copy(at(65, 24, 6));
  const spot = new SpotLight(0xfff1dc, 30, 14, 0.4, 0.6, 1.4);
  spot.position.set(0, 7, 2);
  spot.target.position.copy(at(60, STAGE_H, 11));
  const room1 = new PointLight(0xfff1dc, 2.6, 8, 2);
  room1.position.copy(at(40, 30, 50));
  const room2 = new PointLight(0xfff1dc, 2.6, 8, 2);
  room2.position.copy(at(95, 30, 55));
  group.add(hemi, screen, spot, spot.target, room1, room2);

  const colliders: Collider[] = [
    block(56, 9, 64, 13), // podium
    block(14, 3, 21, 9),
    block(108, 3, 115, 9),
    block(2, 38, 8, 62), // pizza
  ];
  for (const k0 of tables) colliders.push(block(10, k0, 60, k0 + 6), block(70, k0, 120, k0 + 6));
  for (const [i, k] of [[104, 80], [114, 84], [96, 86]]) colliders.push(block(i - 4, k - 4, i + 4, k + 4));
  const spots: Spot[] = [
    { id: "table", label: "Your table", at: at(82, 9, 58), reach: 1.4 },
    { id: "stage", label: "Demo", at: at(60, 10, 16), reach: 1.6 },
    { id: "pizza", label: "Pizza", at: at(8, 9, 50), reach: 1.3 },
    { id: "screen", label: "Screen", at: at(65, 24, 1), reach: 2.6 },
    { id: "beanbag", label: "Beanbag", at: at(104, 5, 80), reach: 1.4 },
  ];

  const room = {
    group,
    colliders,
    spots,
    background: { top: new Color(0x0c0d14), bottom: new Color(mix(0x1b1a2a, e.accent, 0.18)) },
    span: { wide: 13.6, tall: 9.8 },
    centre: new Vector3(0, 1.2, 0.2),
    follow: 0.34,
    bounds: { x0: -6.2, x1: 6.2, z0: -4.3, z1: 4.4 },
    spawn: at(124, 0, 76),
    heading: -Math.PI * 0.7,
    night: 0.55,
    clouds: 0,
    floorAt: (x: number, z: number) => (z < (STAGE_K + 1 - ORIGIN[1]) * S && x > (6 - ORIGIN[0]) * S && x < (124 - ORIGIN[0]) * S ? STAGE_H * S : 0),
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Hackathon = ReturnType<typeof hackathon>;
