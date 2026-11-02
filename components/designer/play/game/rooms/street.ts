import { Color, DirectionalLight, Group, HemisphereLight, PointLight, Vector3 } from "three";
import { materials } from "../../../scene/kit";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S } from "../people";
import { blocker, disposeAll, grid, letters, meshOf, outdoorFloor, outdoorSolid, textWidth, type Collider, type Room, type Spot } from "./common";

// Drop morning: a sneaker store before it opens, the line outside it since
// four, the street still blue at the edges and going gold. The shutter goes
// up at seven.
//
// 130 × 80 voxels: buildings along the back (z < −2.6), the sidewalk, the
// curb, the road nearest the camera.

const W = 130;
const D = 80;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);
const FACADE = 14;

const BRICK = [0xb5583e, 0xa64e36, 0xc0644a, 0x9c4732];

export function street() {
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material ?? outdoorSolid, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the ground: sidewalk slabs, a curb, the road and its line
  const ground = new Voxels(S, 0.035);
  for (let i = -1; i <= W; i += 1)
    for (let k = FACADE - 1; k <= D; k += 1) {
      for (let j = -4; j <= -2; j += 1) ground.set(i, j, k, 0x6a6560);
      let c: number;
      if (k < 50) {
        const seam = i % 10 === 0 || (k - FACADE) % 10 === 0;
        c = seam ? 0xa8a39a : mix(0xc9c4ba, 0xbdb8ae, hash3(Math.floor(i / 10), Math.floor(k / 10), 1));
        if (hash3(i, k, 3) > 0.97) c = 0xb3ada3;
      } else if (k < 52) c = 0x8f8b84;
      else {
        c = mix(0x3a3d44, 0x34373d, hash3(i, k, 2));
        if (k === 66 && i % 12 < 6) c = 0xf2c46b;
        if (k === 53 && i % 4 < 3) c = 0xd9d5cc;
      }
      ground.set(i, -1, k, c);
      if (k >= 50 && k < 52) ground.set(i, 0, k, 0x9a968e);
    }
  mesh(ground, outdoorFloor, false);

  // —— the buildings: a café, the store, a brick block on the right
  const b = new Voxels(S, 0.03);
  const brick = (x: number, y: number) => BRICK[Math.floor(hash3(Math.floor((x + (Math.floor(y / 2) % 2) * 2) / 4), Math.floor(y / 2), 5) * BRICK.length)];
  // café: cream plaster, a striped awning, its shutters still down
  b.box(0, 0, 0, 28, 30, FACADE, (x, y, z) => (z === FACADE && (y < 2 || y === 30) ? 0x8a8478 : 0xe9dfcc));
  b.box(3, 2, FACADE, 25, 18, FACADE, (x, y) => (y % 2 ? 0x8f949c : 0x7b8089));
  for (let i = 1; i <= 27; i += 1) for (let k = FACADE + 1; k <= FACADE + 4; k += 1) b.set(i, 20 - (k - FACADE - 1), k, Math.floor(i / 3) % 2 ? 0x2f6be8 : 0xf6f4ee);
  letters(b, "BREW", 6, 28, FACADE + 1, 0x6b4a32, { axis: "x", scale: 1 });
  // the store: a dark shell with a roof, so the windows look into somewhere
  b.box(30, 0, FACADE, 100, 44, FACADE, (x, y) => (y < 2 ? 0x1b1d22 : y >= 40 ? 0x1f232c : 0x2a2f3d));
  b.box(30, 44, 0, 100, 44, FACADE, 0x1f232c);
  b.box(30, 0, 0, 30, 43, FACADE - 1, 0x232833);
  b.box(100, 0, 0, 100, 43, FACADE - 1, 0x232833);
  b.box(31, 0, 1, 99, 0, FACADE - 1, 0xd9d4ca);
  // two big windows of shoes on shelves
  for (const [x0, x1] of [[33, 62], [76, 97]] as const) {
    for (let x = x0; x <= x1; x += 1) for (let y = 4; y <= 24; y += 1) b.set(x, y, FACADE, null);
    b.box(x0 - 1, 3, FACADE, x1 + 1, 3, FACADE + 1, 0xbfc4cc);
    b.box(x0 - 1, 25, FACADE, x1 + 1, 25, FACADE, 0xbfc4cc);
    for (const y of [8, 14, 20]) {
      b.box(x0, y, FACADE - 4, x1, y, FACADE - 1, 0xd9d4ca);
      for (let x = x0 + 2; x < x1 - 2; x += 6) {
        const tone = [0xfbf8f1, 0xf08a32, 0x2f6be8, 0x1b1d22, 0xd74718][Math.floor(hash3(x, y, 1) * 5)];
        b.box(x, y + 1, FACADE - 3, x + 3, y + 2, FACADE - 2, (vx, vy) => (vy === y + 1 ? 0xe9e4da : tone));
        b.set(x + 3, y + 3, FACADE - 2, tone);
      }
    }
  }
  // the door's frame; the shutter is its own piece
  for (let x = 65; x <= 74; x += 1) for (let y = 2; y <= 26; y += 1) b.set(x, y, FACADE, null);
  b.box(64, 2, FACADE, 64, 27, FACADE + 1, 0xbfc4cc);
  b.box(75, 2, FACADE, 75, 27, FACADE + 1, 0xbfc4cc);
  b.box(64, 27, FACADE, 75, 27, FACADE + 1, 0xbfc4cc);
  // the sign
  const name = "SOLE DISTRICT";
  const wide = textWidth(name, 1);
  const x0 = Math.round(65 - wide / 2);
  b.box(x0 - 3, 30, FACADE + 1, x0 + wide + 2, 38, FACADE + 1, 0x1b1d22);
  // upstairs windows
  for (let x = 34; x <= 96; x += 9) b.box(x, 31, FACADE, x + 4, 37, FACADE, (vx, vy) => (vy === 31 ? 0x8a8478 : hash3(x, 1, 2) > 0.6 ? 0xffd998 : 0x3a4252));
  // the brick block
  b.box(102, 0, 0, W - 1, 38, FACADE, (x, y, z) => (z === FACADE ? brick(x, y) : 0x8f4a36));
  for (let x = 106; x <= 124; x += 8)
    for (const y of [6, 20]) b.box(x, y, FACADE, x + 4, y + 9, FACADE, (vx, vy) => (vy === y ? 0xe9dfcc : hash3(x, y, 4) > 0.55 ? 0xffd998 : 0x2f3a4c));
  mesh(b);

  // inside the store: lit, warm, the back wall glowing
  const lit = new Voxels(S, 0);
  lit.box(31, 1, FACADE - 8, 99, 30, FACADE - 8, (x, y) => mix(0xfff1d6, 0xffd9a0, y / 30));
  letters(lit, name, x0, 36, FACADE + 2, 0xf08a32, { axis: "x", scale: 1 });
  mesh(lit, materials.glow, false);

  // the shutter over the door, rolled down
  const shutterV = new Voxels(S, 0.02);
  shutterV.box(65, 2, FACADE - 1, 74, 26, FACADE - 1, (x, y) => (y % 2 ? 0x9aa0a8 : 0x858b94));
  const shutter = mesh(shutterV);

  // —— the street's things
  const p = new Voxels(S, 0.04);
  // lamp posts on the curb
  for (const x of [14, 108]) {
    p.box(x, 0, 48, x, 30, 48, 0x2a2f3d);
    p.box(x - 1, 0, 47, x + 1, 1, 49, 0x2a2f3d);
    p.box(x, 30, 45, x, 30, 48, 0x2a2f3d);
  }
  // a bus stop: a bench under a little roof
  p.box(2, 0, 30, 3, 22, 30, 0x2a2f3d);
  p.box(14, 0, 30, 15, 22, 30, 0x2a2f3d);
  p.box(1, 23, 26, 16, 23, 34, 0x2f6be8);
  p.box(3, 4, 27, 14, 4, 30, 0xb8834f);
  p.box(3, 5, 27, 14, 8, 27, 0xb8834f);
  p.box(4, 9, 27, 13, 18, 27, (x, y) => (y === 18 || y === 9 ? 0x2a2f3d : 0xd9e6f2));
  // a hydrant, a bin, a tree in a planter
  p.box(94, 0, 44, 96, 4, 46, 0xd74718);
  p.box(95, 5, 45, 95, 5, 45, 0xd74718);
  p.box(24, 0, 44, 27, 6, 47, 0x3a4252);
  p.box(38, 0, 42, 44, 2, 48, (x, y, z) => (x === 38 || x === 44 || z === 42 || z === 48 ? 0x8a8478 : 0x5a3e2a));
  p.box(41, 3, 45, 41, 12, 45, 0x6b4a32);
  p.blob(41, 17, 45, 5, 5, 5, (x, y, z) => (hash3(x, y, z) > 0.5 ? 0x5a9a3c : 0x4a8a30), 0.85, 3);
  // what the line brought: a tent, folding chairs, a cooler
  p.box(117, 0, 20, 126, 1, 30, 0x2f6be8);
  for (let y = 2; y <= 8; y += 1) p.box(117 + Math.floor((y - 2) * 0.7), y, 20, 126 - Math.floor((y - 2) * 0.7), y, 30, (x, vy, z) => (z === 20 || z === 30 ? 0x2a59cc : 0x3a75f0));
  for (const x of [87, 108]) {
    p.box(x, 0, 24, x + 4, 4, 28, (vx, y) => (y === 4 ? 0xf08a32 : vx === x || vx === x + 4 ? 0x2a2f3d : null));
    p.box(x, 5, 28, x + 4, 9, 28, 0xf08a32);
  }
  p.box(98, 0, 30, 102, 3, 33, (x, y) => (y === 3 ? 0xf6f4ee : 0x2f6be8));
  mesh(p);

  // a parked car, the street side of the curb
  const car = new Voxels(S, 0.03);
  const body = 0xe9dfcc, trim = 0x2a2f3d;
  car.box(70, 2, 55, 104, 7, 66, (x, y) => (y === 2 ? trim : body));
  car.box(78, 8, 56, 96, 12, 65, (x, y, z) => (z === 56 || z === 65 || x === 78 || x === 96 ? (y > 8 ? 0x9cc0fa : body) : body));
  car.box(78, 13, 56, 96, 13, 65, body);
  for (const x of [74, 98]) for (const z of [54, 67]) car.box(x, 0, z, x + 4, 3, z, (vx, y) => (y === 0 || y === 3 ? 0x1b1d22 : 0x2a2f3d));
  car.box(104, 4, 57, 104, 5, 59, 0xfff4d6);
  car.box(104, 4, 62, 104, 5, 64, 0xfff4d6);
  car.box(70, 4, 57, 70, 5, 59, 0xd74718);
  car.box(70, 4, 62, 70, 5, 64, 0xd74718);
  mesh(car);

  // the lamps, still on at dawn
  const glow = new Voxels(S, 0);
  for (const x of [14, 108]) glow.box(x - 1, 28, 44, x + 1, 29, 46, 0xffd27a);
  mesh(glow, materials.lamp, false);

  // —— light: a low sun from up the street, the sky still cool
  const sun = new DirectionalLight(0xffc89a, 3.1);
  sun.position.set(-16, 7, 6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(0xc9d4f0, 0x8a7a66, 1.25);
  const storeLight = new PointLight(0xffd9a0, 0, 5, 2);
  storeLight.position.copy(at(70, 12, FACADE + 4));
  group.add(sun, sun.target, hemi, storeLight);

  const colliders: Collider[] = [
    block(0, 0, W - 1, FACADE), // the buildings
    block(1, 26, 16, 31), // the bus stop
    block(24, 44, 27, 47), // the bin
    block(38, 42, 44, 48), // the planter
    block(94, 44, 96, 46), // the hydrant
    block(116, 19, 127, 31), // the tent
    block(86, 23, 92, 29), // chairs
    block(107, 23, 113, 29),
    block(97, 29, 103, 34), // the cooler
  ];
  const spots: Spot[] = [{ id: "store", label: "Store", at: at(69.5, 12, FACADE + 2), reach: 1.4 }];
  // the way home only matters once the shutter's up
  const home: Spot = { id: "home", label: "Walk home", at: at(8, 6, 38), reach: 1.3 };

  let opening = 0;
  let open = false;
  const room = {
    group,
    colliders,
    spots,
    background: { top: new Color(0xb9c8ea), bottom: new Color(0xfbd9bd) },
    span: { wide: 12.6, tall: 8.2 },
    centre: new Vector3(0, 0.9, -0.9),
    follow: 0.55,
    bounds: { x0: -6.2, x1: 6.2, z0: -2.35, z1: 0.75 },
    spawn: at(14, 0, 38),
    heading: Math.PI / 2,
    night: 0.22,
    clouds: 0.55,
    setShutter: (on: boolean) => {
      open = on;
      if (on && !spots.includes(home)) spots.push(home);
    },
    update: (time: number, dt: number) => {
      opening += ((open ? 1 : 0) - opening) * (1 - Math.exp(-dt * 1.6));
      shutter.position.y = opening * 2.45;
      storeLight.intensity = opening * 2.4;
    },
    dispose: () => disposeAll(group),
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Street = ReturnType<typeof street>;
