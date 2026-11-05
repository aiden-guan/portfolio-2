import { Color, DirectionalLight, Group, HemisphereLight, Mesh, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { FLAG, worldMaterial } from "../../../scene/shared";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import {
  blinkGlow,
  blocker,
  bulbGlow,
  calm,
  disposeAll,
  grid,
  hangSway,
  hanging,
  indoorFloor,
  letters,
  meshOf,
  nearEdge,
  screenGlow,
  shadeGlow,
  textScreen,
  viewGlow,
  type Collider,
  type Room,
  type Spot,
} from "./common";
import { alive, clockHands, motes, shaft, steam, towards, type Life, type Opening } from "./life";

// Aiden's bedroom, cut away like a diorama so it floats on the paper. The
// prologue's morning happens here, and so does all of AGNotify: as the cook
// group grows, the room does too (a board of sources, a ring light, a second
// screen, LEDs, a plaque). By day the sun comes in over the neighbours'
// roofs and lies across the rug; at night the moon does, the lamps are on
// and the screens light the desk. The clock over the door keeps the HUD's
// time, the curtains breathe, and the router under the desk never sleeps.
//
// A grid of 0.1 m voxels, 80 × 80 inside, walls on the far two sides
// (x = −4 and z = −4 in the world) so the camera looks in.

const N = 80;
const WALL_H = 36;
const ORIGIN: [number, number] = [N / 2, N / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);

const WOOD = [0xb8834f, 0xae7745, 0xc28d58, 0xa66f3f];
const SHOEBOXES: Array<[number, number]> = [
  [0xf08a32, 0xfbf8f1],
  [0x22252b, 0xf4f4f4],
  [0xf2f2f2, 0x2f6be8],
  [0xd74718, 0x22252b],
  [0x8fd3b6, 0xfbf8f1],
  [0x2f6be8, 0xf2f2f2],
  [0xe9d8b4, 0x6b4426],
];

export type Feature = "board" | "boardFull" | "ringlight" | "monitor" | "leds" | "plaque" | "boxes";

// the LED strip: a slow wave of colour along it, never a flash
const ledGlow = worldMaterial({
  key: "game-leds",
  flag: FLAG.soft,
  cloud: false,
  fragment:
    "float wave = 0.5 + 0.5 * sin(uTime * 0.55 + (vWorld.x - vWorld.z) * 0.7); totalEmissiveRadiance = mix(diffuseColor.rgb, vec3(0.18, 0.32, 1.0), wave * 0.55) * (1.5 + 0.7 * wave);",
});

export function bedroom({ night = false }: { night?: boolean } = {}) {
  calm();
  const group = new Group();
  const mesh = (v: Voxels, material = undefined as Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the floor: planks with a grain, and the rug painted into them
  const floor = new Voxels(S, 0.04);
  for (let i = -2; i < N; i += 1)
    for (let k = -2; k < N; k += 1) {
      if (nearEdge(i, k, N - 1, N - 1)) for (let j = -4; j <= -2; j += 1) floor.set(i, j, k, j === -4 ? 0x8a6a4c : 0xa47a52);
      const plank = Math.floor((k + (Math.floor(i / 12) % 2) * 6) / 4);
      let color = WOOD[Math.floor(hash3(plank, Math.floor(i / 12), 3) * WOOD.length)];
      if ((k + (Math.floor(i / 12) % 2) * 6) % 4 === 0) color = mix(color, 0x6b4a32, 0.35);
      if (i % 12 === 0) color = mix(color, 0x6b4a32, 0.25);
      // the grain runs along each plank
      else if (hash3(Math.floor(i / 3), k, 13) > 0.88) color = mix(color, 0x7a5236, 0.16);
      // the rug: cobalt border, an orange line, one diamond in the middle
      if (i >= 22 && i <= 48 && k >= 25 && k <= 51) {
        const edge = i <= 23 || i >= 47 || k <= 26 || k >= 50;
        const diamond = Math.abs(i - 35) + Math.abs(k - 38) <= 6;
        const ring = Math.abs(i - 35) + Math.abs(k - 38) === 9;
        color = edge ? 0x2f6be8 : diamond ? 0x2f6be8 : ring ? 0xf08a32 : hash3(i, 7, k) > 0.5 ? 0xf6eedd : 0xf1e7d3;
        if (!edge && (i === 25 || i === 45 || k === 28 || k === 48)) color = 0xf08a32;
      }
      floor.set(i, -1, k, color);
    }
  mesh(floor, indoorFloor, false);

  // —— the two walls, a window in the far one, skirting and a dado rail
  const walls = new Voxels(S, 0.025);
  const wallPaint = (j: number) => (j <= 1 ? 0xf4efe6 : j <= 11 ? 0xd9c9ae : j === 12 ? 0xf4efe6 : 0xefe5d3);
  const windowHole = (i: number, j: number) => i >= 26 && i <= 42 && j >= 13 && j <= 27;
  for (let j = 0; j < WALL_H; j += 1) {
    for (let i = -2; i < N; i += 1) for (let k = -2; k <= -1; k += 1) if (!windowHole(i, j)) walls.set(i, j, k, wallPaint(j));
    for (let k = 0; k < N; k += 1) for (let i = -2; i <= -1; i += 1) walls.set(i, j, k, wallPaint(j));
  }
  for (let i = 25; i <= 43; i += 1) {
    walls.set(i, 12, 0, 0xfbf8f1);
    walls.set(i, 12, 1, 0xfbf8f1);
    walls.set(i, 28, 0, 0xfbf8f1);
  }
  for (let j = 12; j <= 28; j += 1) {
    walls.set(25, j, 0, 0xfbf8f1);
    walls.set(43, j, 0, 0xfbf8f1);
  }
  for (let i = 26; i <= 42; i += 1) walls.set(i, 20, -1, 0xfbf8f1);
  for (let j = 13; j <= 27; j += 1) walls.set(34, j, -1, 0xfbf8f1);
  // the curtain rod, and a socket on the skirting for the laptop's charger
  for (let i = 20; i <= 48; i += 1) walls.set(i, 30, 0, 0x8a5a3c);
  walls.set(20, 30, 1, 0x6b4a32);
  walls.set(48, 30, 1, 0x6b4a32);
  walls.box(54, 1, 0, 55, 2, 0, (x, y) => (y === 1 && x === 54 ? 0x9aa0a8 : 0xe4ddd0));
  mesh(walls);

  // the curtains, which breathe a little in the air from the window
  const curtains = new Voxels(S, 0.03);
  for (let j = 10; j <= 29; j += 1) {
    for (const i of [22, 23, 24]) curtains.set(i, j, 0, (i + j) % 3 === 0 ? 0xf2c46b : 0xf6d98c);
    for (const i of [44, 45, 46]) curtains.set(i, j, 0, (i + j) % 3 === 0 ? 0xf2c46b : 0xf6d98c);
  }
  group.add(hanging(curtains, hangSway("z", 0.022), 29, ORIGIN));

  // outside: the roofs across the street, a tree, and a morning sky over
  // them; or the night, the moon and one window still lit.
  // Seen through the glass from above, what's further back shows lower down,
  // so each layer is drawn a little below and left of where it appears.
  const outside = new Voxels(S, 0.02);
  const near = new Voxels(S, 0.02);
  const skyDay = (j: number) => (j >= 19 ? mix(0xd8e9f2, 0xa9d0f0, Math.min(1, (j - 19) / 7)) : mix(0xfbe7cc, 0xd8e9f2, Math.max(0, j - 12) / 7));
  const skyNight = (j: number) => mix(0x2a3c6e, 0x0f1a3a, Math.min(1, Math.max(0, j - 10) / 14));
  for (let i = 20; i <= 43; i += 1)
    for (let j = 8; j <= 28; j += 1) {
      let c = night ? skyNight(j) : skyDay(j);
      if (night && j > 16 && hash3(i, j, 9) > 0.972) c = mix(c, 0xb9c4ec, 0.5);
      outside.set(i, j, -5, c);
    }
  if (!night) {
    outside.box(24, 22, -5, 28, 22, -5, 0xffffff);
    outside.box(25, 23, -5, 27, 23, -5, 0xf8fbfd);
  }
  // two houses' roofs, lit on the slope that faces the sun, the nearer one with a chimney
  for (let i = 22; i <= 43; i += 1) {
    const a = Math.round(14.6 - Math.abs(i - 28.5) * 0.6);
    const b = Math.round(13.2 - Math.abs(i - 38) * 0.5);
    for (let j = 9; j <= Math.max(a, b); j += 1) {
      const front = j <= a && (i <= 34 || j > b);
      const lit = front ? i >= 28.5 : i >= 38;
      const roof = night ? (front ? 0x1a2238 : 0x151c30) : j === (front ? a : b) ? 0x9aa2b0 : lit ? 0x7d8698 : 0x5f6878;
      near.set(i, j, -3, roof);
    }
  }
  near.box(31, 13, -3, 31, 15, -3, night ? 0x221c2a : 0x9a5a48);
  if (night) near.set(27, 12, -3, 0xc89a50);
  // the tree on the corner
  near.blob(38.5, 15.5, -3, 3.4, 4.2, 0.5, (x, y, z) => (night ? (hash3(x, y, z) > 0.6 ? 0x14203a : 0x0f1830) : hash3(x, y, z) > 0.62 ? 0x7cb954 : y > 16 ? 0x62a242 : 0x4f8f36), 0.92, 4);
  near.box(38, 9, -3, 39, 11, -3, night ? 0x0f1424 : 0x5a3e2a);
  mesh(outside, viewGlow, false).receiveShadow = false;
  mesh(near, viewGlow, false).receiveShadow = false;
  if (night) {
    const moon = new Voxels(S, 0);
    moon.box(34, 21, -4, 36, 23, -4, (x, y) => ((x === 34 || x === 36) && (y === 21 || y === 23) ? 0xc9c0a4 : 0xfff1c8));
    mesh(moon, bulbGlow, false);
  }

  // —— furniture
  const f = new Voxels(S, 0.04);
  const wood = (x: number, y: number, z: number) => WOOD[Math.floor(hash3(x, y, z) * 2)];
  const dark = 0x6b4a32;
  // the bed, head against the far wall
  f.box(0, 0, 0, 11, 8, 0, (x, y) => (y === 8 ? dark : wood(x, y, 0)));
  f.box(0, 0, 1, 11, 2, 21, (x, y, z) => ((x === 0 || x === 11) && (z === 1 || z === 21) ? dark : y === 2 ? wood(x, y, z) : (z === 21 || x === 11) && y < 2 ? dark : null));
  f.box(0, 3, 1, 11, 4, 21, 0xf4f1ea);
  f.box(2, 5, 2, 9, 6, 5, (x, y) => (y === 6 ? 0xffffff : 0xf1ede4));
  f.box(0, 5, 8, 11, 5, 21, (x, y, z) => (z === 11 || z === 12 ? 0xf6eedd : 0xf08a32));
  f.box(11, 2, 8, 11, 4, 21, (x, y, z) => (z === 11 || z === 12 ? 0xf6eedd : 0xe07a26));
  f.box(0, 2, 21, 11, 4, 21, 0xe07a26);
  // the nightstand, and the lamp on it
  f.box(13, 0, 0, 18, 6, 5, (x, y, z) => (z === 5 && y === 4 ? dark : z === 5 && y === 2 && x === 15 ? 0xd9b878 : wood(x, y, z)));
  f.box(16, 7, 0, 18, 7, 2, 0x3a3f4a);
  f.box(17, 8, 1, 17, 9, 1, 0x3a3f4a);
  // a shelf of books over the bed
  f.box(0, 24, 0, 10, 24, 2, wood);
  [0x2f6be8, 0xf08a32, 0x2a2f3d, 0xd74718, 0xf6eedd, 0x5b4fd6, 0x2f6be8, 0x8fd3b6].forEach((c, n) => {
    const h = 3 + Math.floor(hash3(n, 2, 2) * 2);
    f.box(1 + n, 25, 0, 1 + n, 24 + h, 1, c);
  });
  // a basketball poster, and the Golden Gate at sunset over the desk
  f.box(17, 15, 0, 24, 25, 0, (x, y) => {
    const d = Math.hypot(x - 20.5, y - 20);
    if (x === 17 || x === 24 || y === 15 || y === 25) return 0xfbf8f1;
    if (d < 2.8) return Math.abs(x - 20.5) < 0.6 || Math.abs(y - 20) < 0.6 ? 0x5a2a12 : 0xf08a32;
    return y < 18 ? 0x1b2a4a : 0x24365e;
  });
  f.box(48, 17, 0, 58, 25, 0, (x, y) => {
    if (x === 48 || x === 58 || y === 17 || y === 25) return 0x2a2f3d;
    if (y === 19 && x > 48 && x < 58) return 0xd74718;
    if ((x === 51 || x === 55) && y >= 19 && y <= 23) return 0xd74718;
    if (y <= 18) return 0x2f5c8a;
    return y >= 23 ? 0xf6c38b : 0xf3a46a;
  });
  // the desk, under the window's right, with a shelf underneath
  f.box(50, 7, 0, 73, 8, 9, (x, y, z) => (y === 8 ? wood(x, y, z) : dark));
  for (const [x, z] of [[50, 0], [73, 0], [50, 9], [73, 9]]) f.box(x, 0, z, x, 6, z, dark);
  f.box(51, 4, 1, 72, 4, 8, wood);
  // the laptop, a mug, the lamp; the charger's cable down the back to the socket
  f.box(57, 9, 3, 64, 9, 7, (x, y, z) => (z >= 6 && x > 58 && x < 63 ? 0xb6bac2 : 0xd2d5db));
  f.box(57, 10, 2, 64, 15, 2, 0xc9ccd2);
  f.box(52, 9, 4, 53, 10, 5, (x, y) => (y === 10 ? 0x2f6be8 : 0xfbf8f1));
  f.box(54, 9, 4, 54, 10, 4, 0xfbf8f1);
  f.box(68, 9, 2, 70, 9, 4, 0x2a2f3d);
  f.box(69, 10, 3, 69, 13, 3, 0x2a2f3d);
  f.box(56, 3, 0, 56, 6, 0, 0x2a2f3d);
  f.box(55, 2, 0, 56, 2, 0, 0x2a2f3d);
  // a router on the shelf: it's what the server runs through
  f.box(59, 5, 2, 63, 5, 5, (x, y, z) => (z === 5 && (x === 60 || x === 62) ? null : 0x2a2f3d));
  f.box(62, 6, 2, 62, 7, 2, 0x2a2f3d);
  // a notepad, a pen
  f.box(65, 9, 5, 67, 9, 7, 0xfbf8f1);
  f.set(66, 9, 8, 0x2f6be8);
  // the chair, pulled out
  f.box(57, 4, 11, 63, 5, 16, (x, y) => (y === 5 ? 0x2f6be8 : 0x1f4fb8));
  f.box(57, 6, 16, 63, 12, 16, (x, y) => (y === 12 || x === 57 || x === 63 ? 0x1f4fb8 : 0x2f6be8));
  for (const [x, z] of [[57, 11], [63, 11], [57, 16], [63, 16]]) f.box(x, 0, z, x, 3, z, 0x2a2f3d);
  // the backpack, dropped against the wall
  f.box(45, 0, 1, 48, 5, 3, (x, y) => (y === 5 ? 0x2a2f3d : 0x3a3f4a));
  f.box(46, 1, 4, 47, 3, 4, (x, y) => (y === 3 ? 0xf08a32 : 0x2f6be8));
  // the sneaker wall: three bays, boxes stacked, a few pairs out
  for (const k of [38, 53, 68]) f.box(0, 0, k, 6, 27, k, wood);
  for (const j of [0, 7, 14, 21, 27]) f.box(0, j, 38, 6, j, 68, wood);
  for (const [bay, k0] of [[0, 39], [1, 54]] as const)
    for (const [row, j0] of [[0, 1], [1, 8], [2, 15]] as const)
      for (let n = 0; n < 3; n += 1) {
        const [body, lid] = SHOEBOXES[Math.floor(hash3(bay, row, n) * SHOEBOXES.length)];
        const z0 = k0 + n * 5;
        f.box(0, j0, z0, 5, j0 + 3, z0 + 3, (x, y) => (y === j0 + 3 ? lid : x === 5 && y === j0 + 1 ? lid : body));
      }
  for (const j0 of [1, 8, 15, 22])
    for (const z0 of [58, 62]) {
      f.box(1, j0, z0, 5, j0 + 1, z0 + 2, (x, y, z) => (y === j0 ? 0xe9e4da : z === z0 + 1 && x >= 2 && x <= 4 ? (j0 % 2 ? 0xf08a32 : 0x2f6be8) : 0xfbf8f1));
      f.box(4, j0 + 2, z0, 5, j0 + 2, z0 + 2, 0xfbf8f1);
    }
  // the mirror on the near wall
  f.box(0, 8, 25, 0, 27, 33, (x, y, z) => (y === 8 || y === 27 || z === 25 || z === 33 ? 0x5e3d27 : (y - z) % 9 === 0 || (y - z) % 9 === 1 ? 0xf5fbff : 0xcfe3f0));
  // Phoebe's bed, and her water
  for (let i = 39; i <= 51; i += 1)
    for (let k = 53; k <= 63; k += 1) {
      const d = Math.hypot((i - 45) / 6.2, (k - 58) / 5.2);
      if (d > 1) continue;
      f.set(i, 0, k, d > 0.72 ? 0xc9a27a : 0xefe2cc);
      if (d > 0.72) f.set(i, 1, k, 0xb88f68);
    }
  f.box(53, 0, 59, 56, 0, 62, (x, y, z) => ((x === 53 || x === 56) && (z === 59 || z === 62) ? null : x > 53 && x < 56 && z > 59 && z < 62 ? 0x9ccff0 : 0x2f6be8));
  // the savings: an orange shoebox at the foot of the bed, the lid on
  f.box(4, 0, 24, 7, 2, 26, (x, y, z) => (x === 7 && y === 1 && z === 25 ? 0x1b1d22 : 0xf08a32));
  f.box(3, 3, 23, 8, 3, 27, (x, y, z) => (x === 3 || x === 8 || z === 23 || z === 27 ? 0xf2ede2 : 0xfbf8f1));
  f.box(8, 2, 24, 8, 2, 26, 0xf2ede2);
  // the door out, near the front
  f.box(0, 0, 69, 0, 22, 78, (x, y, z) => (z === 69 || z === 78 || y === 22 ? 0xfbf8f1 : (y === 7 || y === 15) && z > 70 && z < 77 ? 0x9a6a3e : 0xb07a4a));
  f.set(1, 10, 71, 0xe6b04a);
  // the clock over it
  for (let k = 71; k <= 76; k += 1)
    for (let j = 24; j <= 29; j += 1) {
      const d = Math.hypot(k - 73.5, j - 26.5);
      if (d > 3) continue;
      f.set(0, j, k, d > 2.2 ? 0x2a2f3d : 0xfbf8f1);
    }
  // a plant in the corner, a ball on the floor, a football by the shoes
  f.box(74, 0, 1, 78, 3, 5, (x, y) => (y === 3 ? 0xa45a32 : 0xc0683a));
  f.blob(76, 7, 3, 3, 4, 3, (x, y, z) => (hash3(x, y, z) > 0.5 ? 0x4f9336 : 0x3d7d2e), 0.85, 9);
  f.blob(30, 1.5, 62, 1.6, 1.6, 1.6, (x, y) => (x === 30 || y === 2 ? 0x5a2a12 : 0xf08a32));
  f.blob(12, 1.5, 62, 1.6, 1.6, 1.6, (x, y, z) => (hash3(x, y, z) > 0.75 ? 0x1b1d22 : 0xfbf8f1));
  mesh(f);

  // the lampshades: cloth by day, lit through at night
  const shades = new Voxels(S, 0.03);
  shades.box(67, 14, 2, 71, 15, 5, 0xf08a32);
  shades.box(16, 10, 0, 18, 12, 2, (x, y) => (y === 12 ? 0xece0c6 : 0xf3e6cc));
  mesh(shades, shadeGlow);

  // what lights up: the laptop's screen (the group chats, scrolling), the phone's, the router's lights
  const laptopBar = new Voxels(S, 0);
  laptopBar.box(58, 14, 3, 63, 14, 3, 0x2a59cc);
  mesh(laptopBar, screenGlow, false);
  const laptopScreen = new Voxels(S, 0);
  laptopScreen.box(58, 11, 3, 63, 13, 3, 0x16223e);
  mesh(laptopScreen, textScreen("z", 0x9cc0fa, 0.9), false);
  const router = new Voxels(S, 0);
  router.set(60, 5, 5, 0x5fe08a);
  router.set(62, 5, 5, 0xf2c46b);
  mesh(router, blinkGlow, false);
  const phone = new Voxels(S, 0);
  phone.box(14, 7, 2, 15, 7, 3, 0x1d1f24);
  const phoneMesh = mesh(phone);
  const phoneLit = new Voxels(S, 0);
  phoneLit.box(14, 7, 2, 15, 7, 3, 0x9cc0fa);
  const phoneGlow = mesh(phoneLit, materials.glow, false);
  phoneGlow.position.y = 0.002;
  phoneGlow.visible = false;

  // —— what the room gains as AGNotify grows
  const features = new Map<Feature, Mesh[]>();
  const add = (name: Feature, build: (v: Voxels) => void, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const v = new Voxels(S, 0.04);
    build(v);
    const m = mesh(v, material, shadow);
    m.visible = false;
    features.set(name, [...(features.get(name) ?? []), m]);
  };
  // a corkboard over the bed, for the sources
  add("board", (v) => {
    v.box(0, 12, 3, 0, 23, 19, (x, y, z) => (y === 12 || y === 23 || z === 3 || z === 19 ? 0x6b4a32 : hash3(x, y, z) > 0.6 ? 0xb07c48 : 0xc08850));
    v.set(1, 20, 6, 0xfbf8f1);
    v.set(1, 16, 14, 0xf2c46b);
  });
  add("boardFull", (v) => {
    const cards: Array<[number, number, number]> = [
      [21, 5, 0x2f6be8], [21, 15, 0xf08a32], [17, 9, 0xfbf8f1], [17, 13, 0xf2c46b], [14, 5, 0xfbf8f1], [14, 16, 0xe88a9a], [19, 11, 0xfbf8f1],
    ];
    for (const [y, z, c] of cards) {
      v.box(1, y - 1, z, 1, y, z + 1, c);
      v.set(1, y + 1, z, 0xd74718);
    }
    // red string between the pins
    const string = (y0: number, z0: number, y1: number, z1: number) => {
      const steps = Math.max(Math.abs(y1 - y0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s += 1) v.set(1, Math.round(y0 + ((y1 - y0) * s) / steps), Math.round(z0 + ((z1 - z0) * s) / steps), 0xd74718);
    };
    string(22, 5, 18, 9);
    string(18, 9, 20, 11);
    string(20, 11, 22, 15);
    string(18, 13, 15, 16);
  });
  // a ring light on a tripod, by the desk
  add("ringlight", (v) => {
    for (const [x, z] of [[46, 22], [50, 22], [48, 26]]) v.box(x, 0, z, x, 1, z, 0x2a2f3d);
    v.box(48, 0, 24, 48, 15, 24, 0x2a2f3d);
    v.box(47, 2, 23, 49, 2, 25, 0x2a2f3d);
    v.box(48, 16, 24, 48, 16, 24, 0x2a2f3d);
  });
  add("ringlight", (v) => {
    for (let a = 0; a < 28; a += 1) {
      const t = (a / 28) * Math.PI * 2;
      v.set(48, Math.round(19 + Math.sin(t) * 3.4), Math.round(24 + Math.cos(t) * 3.4), 0xfff4e0);
    }
  }, bulbGlow, false);
  // a second screen, with a chart that only goes up
  add("monitor", (v) => {
    v.box(50, 10, 1, 56, 15, 1, 0x1b1d22);
    v.box(53, 9, 2, 53, 9, 2, 0x1b1d22);
  });
  add("monitor", (v) => {
    v.box(51, 11, 2, 55, 14, 2, (x, y) => (x === 55 && y === 13 ? null : y === 11 + Math.floor((x - 51) * 0.6) ? 0x3fd17a : y === 14 ? 0x2a59cc : 0x16203a));
  }, screenGlow, false);
  // the newest point on it, blinking
  add("monitor", (v) => v.set(55, 13, 2, 0x7dffa8), blinkGlow, false);
  // LEDs along the top of the walls
  add("leds", (v) => {
    for (let i = 0; i < N; i += 1) v.set(i, 34, 0, 0x8a6cff);
    for (let k = 0; k < N; k += 1) v.set(0, 34, k, 0x8a6cff);
  }, ledGlow, false);
  // more boxes than the shelves hold
  add("boxes", (v) => {
    for (let n = 0; n < 5; n += 1) {
      const [body, lid] = SHOEBOXES[(n * 3) % SHOEBOXES.length];
      const z0 = 40 + n * 6;
      v.box(0, 28, z0, 5, 30, z0 + 4, (x, y) => (y === 30 ? lid : body));
      if (n % 2 === 0) v.box(1, 31, z0 + 1, 4, 33, z0 + 3, (x, y) => (y === 33 ? body : lid));
    }
  });
  // the plaque, up where the lamp can't get in front of it
  add("plaque", (v) => {
    v.box(60, 18, 0, 78, 25, 0, (x, y) => (x === 60 || x === 78 || y === 18 || y === 25 ? 0x2a2f3d : 0x1b1d22));
    letters(v, "$45K", 62, 23, 1, 0xf2c46b, { axis: "x" });
  });

  // —— light: the sun over the roofs, or the moon; the desk lamp, the
  // bedside lamp after dark, and the laptop's own blue on the desk
  const sun = new DirectionalLight(night ? 0x9fb4ff : 0xffdcae, night ? 1.05 : 4.0);
  sun.position.set(-3, 8.5, -14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = night ? new HemisphereLight(0x5a6fb0, 0x2a2430, 1.05) : new HemisphereLight(0xe9eeff, 0xd8c3a5, 1.4);
  const lamp = new PointLight(0xffc98a, night ? 3.2 : 1.2, night ? 5 : 4, 2);
  lamp.position.copy(at(69, 15, 4));
  const bedside = new PointLight(0xffc48a, night ? 2.2 : 0, 3.4, 2);
  bedside.position.copy(at(17, 10.5, 2.5));
  const screenLight = new PointLight(0x7aa4f5, night ? 0.9 : 0, 2.4, 2);
  screenLight.position.copy(at(60.5, 12, 6));
  const ring = new PointLight(0xfff1dc, 0, 4, 2);
  ring.position.copy(at(46, 19, 24));
  group.add(sun, sun.target, hemi, lamp, bedside, screenLight, ring);

  // —— and what moves: the window's light and the dust in it, steam off
  // the mug, the clock
  const opening: Opening = [at(26, 13, 0), at(43, 13, 0), at(43, 28, 0), at(26, 28, 0)];
  const light = towards(sun.position, sun.target.position);
  const clock = clockHands(at(1, 27, 74), "x", { minutes: night ? 21 * 60 + 40 : 7 * 60, radius: 0.24 });
  const lives: Life[] = [
    shaft(opening, light, night ? { color: 0x8fa6ef, strength: 0.022, panes: [2, 2] } : { color: 0xffe9c4, strength: 0.055, panes: [2, 2] }),
    steam(at(53, 11, 5), { count: 5, rise: 0.26 }),
    clock,
  ];
  if (!night) lives.push(motes(opening, light, { count: 26, seed: 2 }));
  const life = alive(group, lives);

  const colliders: Collider[] = [
    block(0, 0, 11, 21), // the bed
    block(13, 0, 18, 5), // the nightstand
    block(50, 0, 73, 9), // the desk
    block(57, 11, 63, 16), // the chair
    block(0, 38, 6, 68), // the shoe wall
    block(3, 23, 8, 27), // the shoebox
    block(74, 1, 78, 5), // the plant
    block(29, 61, 31, 63), // the basketball
    block(45, 1, 48, 4), // the backpack
    block(53, 59, 56, 62), // Phoebe's water
  ];
  const tripod = block(46, 22, 50, 26);
  const spots: Spot[] = [
    { id: "phone", label: "Phone", at: at(14.5, 8, 2.5), reach: 1.3 },
    { id: "shoebox", label: "Shoebox", at: at(5.5, 4, 25), reach: 1.25 },
    { id: "laptop", label: "Laptop", at: at(60.5, 12, 5), reach: 1.6 },
    { id: "mirror", label: "Mirror", at: at(1, 20, 29), reach: 1.3 },
    { id: "shoes", label: "Sneaker wall", at: at(6, 16, 53), reach: 1.4 },
    { id: "window", label: "Window", at: at(34, 18, 0), reach: 1.8 },
    { id: "poster", label: "Poster", at: at(53, 21, 0), reach: 1.6 },
    { id: "ball", label: "Basketball", at: at(30, 3, 62), reach: 1.1 },
    { id: "football", label: "Football", at: at(12, 3, 62), reach: 1.1 },
    { id: "door", label: "Door", at: at(1, 12, 73.5), reach: 1.3 },
  ];
  const boardSpot: Spot = { id: "board", label: "Sources board", at: at(1, 17, 11), reach: 2.0 };
  const plaqueSpot: Spot = { id: "plaque", label: "Plaque", at: at(69, 21, 0), reach: 1.7 };

  let buzz = 0;
  const shown = new Set<Feature>();
  const room = {
    group,
    colliders,
    spots,
    background: night ? { top: new Color(0x0e1c40), bottom: new Color(0x283a68) } : { top: new Color(0xf3ece0), bottom: new Color(0xe9e2d4) },
    span: { wide: 11.8, tall: 9.6 },
    centre: new Vector3(0, 0.9, 0),
    follow: 0.3,
    bounds: { x0: -3.72, x1: 3.72, z0: -3.72, z1: 3.72 },
    spawn: at(16, 0, 13),
    heading: Math.PI * 0.35,
    night: night ? 1 : 0,
    clouds: 0,
    /** Where the bed is, for lying in it, and Phoebe's. */
    bed: at(6, 5, 9),
    dogBed: at(45, 1.2, 58),
    /** The chair, for when the night's spent at the desk. */
    desk: at(60, 0, 18),
    setBuzz: (on: boolean) => {
      buzz = on ? 1 : 0;
      phoneGlow.visible = on;
    },
    show: (name: Feature, on = true) => {
      for (const m of features.get(name) ?? []) m.visible = on;
      if (on) shown.add(name);
      else shown.delete(name);
      const hasTripod = colliders.includes(tripod);
      if (shown.has("ringlight") && !hasTripod) colliders.push(tripod);
      if (!shown.has("ringlight") && hasTripod) colliders.splice(colliders.indexOf(tripod), 1);
      ring.intensity = shown.has("ringlight") ? 1.6 : 0;
      for (const [spot, when] of [[boardSpot, "board"], [plaqueSpot, "plaque"]] as const) {
        const has = spots.includes(spot);
        if (shown.has(when) && !has) spots.push(spot);
        if (!shown.has(when) && has) spots.splice(spots.indexOf(spot), 1);
      }
    },
    setTime: (minutes: number) => clock.set(minutes),
    update: (time: number, dt: number) => {
      // the phone shivers while it's ringing
      phoneMesh.position.x = buzz ? Math.sin(time * 70) * 0.012 : 0;
      phoneGlow.position.x = phoneMesh.position.x;
      life.update(time, dt);
    },
    dispose: () => {
      life.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Bedroom = ReturnType<typeof bedroom>;
