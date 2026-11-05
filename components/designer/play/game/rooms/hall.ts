import { Color, DirectionalLight, Group, HemisphereLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, calm, disposeAll, grid, indoorFloor, letters, meshOf, nearEdge, textScreen, textWidth, viewGlow, type Collider, type Room, type Spot } from "./common";
import { alive, clockHands, motes, shaft, towards, type Life, type Opening } from "./life";

// A big lecture hall: the board across the far wall, a lectern, and rows
// of long desks stepping up toward you, an aisle down the middle, tall
// windows down the side with the afternoon coming through them across the
// rows. For a lecture there's a slide up and laptops open; for a midterm,
// papers face down on every desk and the clock is the loudest thing in the
// room, its second hand going round.
//
// 130 × 96 voxels; four tiers, each a fifth of a metre up.

const W = 130;
const D = 96;
const H = 44;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);
/** Where each tier starts (k) and how high it is (voxels). */
const TIERS = [
  { k: 38, h: 0 },
  { k: 50, h: 2 },
  { k: 62, h: 4 },
  { k: 74, h: 6 },
];
const tierAt = (k: number) => TIERS.reduce((t, row) => (k >= row.k ? row : t), { k: 0, h: 0 }).h;

/** The desks of a row: the two runs either side of the aisle. */
export const ROWS = TIERS.map((t, r) => ({ z: (t.k + 8.5 - ORIGIN[1]) * S, seat: (t.h + 5) * S, r }));
export const SEATS_X = [-5.2, -4.4, -3.6, -2.8, -2.0, -1.2, 1.3, 2.1, 2.9, 3.7, 4.5, 5.3];

export function hall({ mode = "lecture" as "lecture" | "exam", slide = "DATA C8", exam = "Midterm 1" }: { mode?: "lecture" | "exam"; slide?: string; exam?: string } = {}) {
  calm();
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: a flat front, then the tiers, carpeted; the aisle stepped
  const floor = new Voxels(S, 0.03);
  for (let i = -2; i < W; i += 1)
    for (let k = -2; k < D; k += 1) {
      const h = tierAt(k);
      if (nearEdge(i, k, W - 1, D - 1)) for (let j = -4; j < h - 1; j += 1) floor.set(i, j, k, 0x5a3e2e);
      const aisle = i >= 59 && i <= 71;
      let c = k < 34 ? (hash3(i, k, 2) > 0.5 ? 0xb8834f : 0xae7745) : aisle ? 0x6b4a3a : (i + k) % 10 === 0 ? 0x7a2a2a : 0x8e3a33;
      if (TIERS.some((t) => t.k === k) && k > 38) c = 0xd9c49b; // the nosing on each step
      floor.set(i, h - 1, k, c);
    }
  mesh(floor, indoorFloor, false);

  // —— walls: wood panelling low, cream above
  const walls = new Voxels(S, 0.02);
  const paint = (j: number, a: number) => (j <= 12 ? (a % 12 === 0 ? 0x6b4a32 : 0x8a5a3c) : j === 13 ? 0x6b4a32 : 0xefe7d6);
  for (let j = 0; j < H; j += 1) {
    for (let i = -2; i < W; i += 1) for (let k = -2; k <= -1; k += 1) walls.set(i, j, k, paint(j, i));
    for (let k = 0; k < D; k += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, paint(j, k));
  }
  // tall windows down the side wall, the afternoon coming in through them
  const WINDOWS = [20, 46, 72];
  for (const k0 of WINDOWS) {
    for (let k = k0 + 1; k <= k0 + 11; k += 1) for (let j = 17; j <= 35; j += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, null);
    for (let k = k0; k <= k0 + 12; k += 1) {
      walls.set(0, 16, k, 0xfbf8f1);
      walls.set(1, 16, k, 0xf4efe6);
      walls.set(0, 36, k, 0xfbf8f1);
    }
    for (let j = 16; j <= 36; j += 1) {
      walls.set(0, j, k0, 0xfbf8f1);
      walls.set(0, j, k0 + 12, 0xfbf8f1);
      walls.set(-1, j, k0 + 6, 0xe9e4da);
    }
    for (let k = k0 + 1; k <= k0 + 11; k += 1) walls.set(-1, 26, k, 0xe9e4da);
  }
  mesh(walls);
  // what's out there: the campus's trees against a clear sky. Seen from
  // above through the glass, the view shows a little up and along from
  // where it's drawn.
  const view = new Voxels(S, 0);
  for (const k0 of WINDOWS)
    for (let k = k0 - 4; k <= k0 + 12; k += 1)
      for (let j = 12; j <= 36; j += 1) {
        const crown = 22 + Math.round(Math.sin(k * 0.5) * 1.5 + Math.sin(k * 1.3) * 0.8);
        const c = j <= crown ? (hash3(k, j, 3) > 0.6 ? 0x6faa48 : j > crown - 2 ? 0x7cb954 : 0x5a9a3c) : mix(0xe8f2f8, 0x9ccbee, Math.min(1, (j - crown) / 10));
        view.set(-4, j, k, c);
      }
  mesh(view, viewGlow, false).receiveShadow = false;

  // —— the front: the board, a lectern, the clock
  const f = new Voxels(S, 0.035);
  f.box(22, 8, 0, 108, 36, 0, (x, y) => (x === 22 || x === 108 || y === 8 || y === 36 ? 0x8a8f99 : 0x2f4a3a));
  f.box(22, 8, 1, 108, 8, 2, 0x8a8f99);
  for (const [x, y] of [[34, 28], [46, 26], [70, 14], [88, 24], [94, 12]]) f.box(x, y, 1, x + 6, y, 1, 0x6f8a7a); // old chalk
  f.box(58, 0, 14, 72, 11, 19, (x, y, z) => (y === 11 ? 0x6b4a32 : z === 19 && y > 3 && y < 9 ? 0x9a6a42 : 0x8a5a3c));
  f.box(61, 12, 16, 69, 12, 18, 0x2a2f3d);
  // the clock, right of the board
  for (let x = -5; x <= 5; x += 1) for (let y = -5; y <= 5; y += 1) if (x * x + y * y <= 26) f.set(117 + x, 28 + y, 0, x * x + y * y > 18 ? 0x2a2f3d : 0xfbf8f1);
  // the desks: a long counter at the front of each tier, chairs behind
  TIERS.forEach((t, r) => {
    const top = t.h + 7;
    for (const [i0, i1] of [[8, 57], [73, 122]]) {
      f.box(i0, t.h, t.k + 2, i1, top, t.k + 4, (x, y, z) => (y === top ? 0xc9a27a : z === t.k + 2 ? 0x8a5a3c : 0x6b4a32));
      for (let x = i0 + 3; x < i1; x += 8) f.box(x, t.h + 3, t.k + 7, x + 4, t.h + 4, t.k + 10, (vx, y) => (y === t.h + 4 ? 0x2a2f3d : 0x1b1d22));
    }
    // a front rail along the lowest row, and the step's riser lit by the room
    if (r === 0) f.box(8, 0, t.k - 2, 122, 1, t.k - 2, 0x6b4a32);
  });
  mesh(f);

  // what's on the board, and what's on the desks
  const lit = new Voxels(S, 0);
  if (mode === "lecture") {
    lit.box(32, 11, 1, 98, 30, 1, (x, y) => (x === 32 || x === 98 || y === 11 || y === 30 ? 0x9cc0fa : 0xfbf8f1));
    letters(lit, slide, 65 - Math.floor(textWidth(slide, 2) / 2), 28, 2, 0x1f3f8a, { axis: "x", scale: 2 });
    // a table on the slide, and code beside it that doesn't run
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 3; c += 1) lit.box(38 + c * 9, 13 + r * 2, 2, 45 + c * 9, 13 + r * 2, 2, r === 3 ? 0x2f6be8 : 0x9aa4ae);
    lit.box(72, 19, 2, 92, 19, 2, 0xd74718);
    lit.box(72, 16, 2, 88, 16, 2, 0x9aa4ae);
    lit.box(72, 13, 2, 84, 13, 2, 0x9aa4ae);
  } else {
    // the course, which midterm, and the one rule
    // (spaced well apart: on this wall a line of text slants, and close lines run into each other)
    letters(lit, slide, 65 - Math.floor(textWidth(slide, 2) / 2), 33, 1, 0xfbf8f1, { axis: "x", scale: 2 });
    letters(lit, exam, 65 - Math.floor(textWidth(exam, 1) / 2), 20, 1, 0xf2c46b, { axis: "x" });
    const rule = "PHONES AWAY";
    letters(lit, rule, 65 - Math.floor(textWidth(rule, 1) / 2), 13, 1, 0x9cc0fa, { axis: "x" });
  }
  mesh(lit, materials.glow, false);

  // a lecture: laptops open along the rows, notes scrolling
  if (mode === "lecture") {
    const kit = new Voxels(S, 0.03);
    const screens = new Voxels(S, 0);
    ROWS.forEach((_, r) =>
      SEATS_X.forEach((x, n) => {
        if (hash3(r, n, 17) < 0.3) return;
        const t = TIERS[r];
        const i = Math.round(x / S + ORIGIN[0]);
        const top = t.h + 7;
        kit.box(i - 2, top + 1, t.k + 3, i + 1, top + 1, t.k + 4, 0xbfc4cc);
        kit.box(i - 2, top + 2, t.k + 2, i + 1, top + 4, t.k + 2, 0xbfc4cc);
        screens.box(i - 1, top + 2, t.k + 3, i, top + 3, t.k + 3, 0x16223e);
      }),
    );
    mesh(kit);
    mesh(screens, textScreen("z", 0x9cc0fa, 0.8), false);
  }

  if (mode === "exam") {
    const papers = new Voxels(S, 0.02);
    TIERS.forEach((t) => {
      for (const [i0, i1] of [[8, 57], [73, 122]])
        for (let x = i0 + 3; x < i1; x += 8) {
          papers.box(x, t.h + 8, t.k + 2, x + 3, t.h + 8, t.k + 4, 0xfbf8f1);
          papers.set(x + 4, t.h + 8, t.k + 3, 0xf2c46b);
        }
    });
    mesh(papers);
  }

  // —— light: the long windows, and the room's own
  const sun = new DirectionalLight(0xffe8c4, 2.4);
  sun.position.set(-14, 12, 5);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(0xf2f4ff, 0xb9a890, 1.55);
  group.add(sun, sun.target, hemi);

  // the windows' light across the rows, the dust in it, and the clock
  const light = towards(sun.position, sun.target.position);
  const clock = clockHands(at(117.5, 28.5, 1), "z", { minutes: mode === "exam" ? 9 * 60 : 10 * 60, radius: 0.46, seconds: mode === "exam" });
  const lives: Life[] = [clock];
  for (const k0 of WINDOWS) {
    const opening: Opening = [at(0, 17, k0 + 12), at(0, 17, k0 + 1), at(0, 36, k0 + 1), at(0, 36, k0 + 12)];
    // (it lands a little nearer the board than the window, on whatever tier is there)
    const floor = tierAt(k0 - 2) * S;
    lives.push(shaft(opening, light, { color: 0xffeccc, strength: 0.04, floor, panes: [2, 2] }));
    lives.push(motes(opening, light, { count: 10, seed: k0, floor }));
  }
  const life = alive(group, lives);

  const colliders: Collider[] = [block(58, 14, 72, 19)];
  TIERS.forEach((t) => {
    colliders.push(block(8, t.k + 2, 57, t.k + 4), block(73, t.k + 2, 122, t.k + 4));
  });
  const spots: Spot[] = [
    { id: "board", label: mode === "exam" ? "The clock" : "Board", at: at(65, 18, 2), reach: 2.2 },
    { id: "lectern", label: "Lectern", at: at(65, 11, 20), reach: 1.3 },
    { id: "door", label: "Door", at: at(1, 10, 90), reach: 1.4 },
    { id: "seat", label: mode === "exam" ? "Your seat" : "A seat", at: at(76, TIERS[1].h + 5, TIERS[1].k + 8), reach: 1.3 },
  ];

  const room = {
    group,
    colliders,
    spots,
    background: { top: new Color(0xf1ece2), bottom: new Color(0xe6e0d4) },
    span: { wide: 14.2, tall: 10.4 },
    centre: new Vector3(0, 1.4, 0.2),
    follow: 0.32,
    bounds: { x0: -6.3, x1: 6.3, z0: -4.4, z1: 4.6 },
    spawn: at(65, 0, 90),
    heading: Math.PI,
    night: 0,
    clouds: 0,
    floorAt: (x: number, z: number) => tierAt(Math.round(z / S + ORIGIN[1])) * S,
    setTime: (minutes: number) => clock.set(minutes),
    update: (time: number, dt: number) => life.update(time, dt),
    dispose: () => {
      life.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Hall = ReturnType<typeof hall>;
