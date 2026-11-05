import { Color, DirectionalLight, Group, HemisphereLight, InstancedMesh, Mesh, Object3D, Vector3 } from "three";
import { hash3, mix, Voxels } from "../../../scene/voxels";
import { S, solid } from "../people";
import { blocker, calm, disposeAll, grid, hangSway, hanging, letters, meshOf, motion, nearEdge, outdoorFloor, outdoorSolid, textWidth, type Collider, type Room, type Spot } from "./common";
import { alive, birds } from "./life";

// Graduation on the football field, late afternoon: striped grass, a stage
// with the class's banner stirring between its poles, balloons bobbing,
// flowers along the front, rows of gowns on folding chairs, families in the
// stands, a goalpost, birds going over. At the end, a signpost: three ways.
//
// 140 × 100 voxels; the stage across the back, raised 0.3.

const W = 140;
const D = 100;
const ORIGIN: [number, number] = [W / 2, D / 2];
const at = grid(ORIGIN);
const block = blocker(ORIGIN);
const STAGE = { i0: 38, i1: 102, k0: 4, k1: 22, h: 3 };

export function field() {
  calm();
  const group = new Group();
  const mesh = (v: Voxels, material?: Parameters<typeof meshOf>[1], shadow = true) => {
    const m = meshOf(v, material ?? outdoorSolid, { shadow, origin: [ORIGIN[0], 0, ORIGIN[1]] });
    group.add(m);
    return m;
  };

  // —— the grass: mown stripes, yard lines, the sideline
  const ground = new Voxels(S, 0.04);
  for (let i = -1; i <= W; i += 1)
    for (let k = -1; k <= D; k += 1) {
      if (nearEdge(i, k, W, D)) for (let j = -4; j <= -2; j += 1) ground.set(i, j, k, j === -4 ? 0x5e4630 : 0x6b4f36);
      let c = Math.floor(i / 10) % 2 ? 0x5a9a3c : 0x4f8f34;
      if (hash3(i, k, 7) > 0.9) c = mix(c, 0x7fbf55, 0.4);
      if ((i - 10) % 20 === 0 && k > 26 && k < 96) c = 0xf4f2ea;
      if (k === 26 || k === 96) c = 0xf4f2ea;
      ground.set(i, -1, k, c);
    }
  mesh(ground, outdoorFloor, false);

  const f = new Voxels(S, 0.04);
  // the stage, its skirt, steps
  f.box(STAGE.i0, 0, STAGE.k0, STAGE.i1, STAGE.h - 1, STAGE.k1, (x, y, z) => (y === STAGE.h - 1 ? (Math.floor(x / 4) % 2 ? 0xd9d4ca : 0xcfc9bd) : z === STAGE.k1 ? 0x1f3f8a : 0x2a2f3d));
  f.box(STAGE.i0 + 4, 0, STAGE.k1 + 1, STAGE.i0 + 12, 1, STAGE.k1 + 2, 0xcfc9bd);
  f.box(STAGE.i1 - 12, 0, STAGE.k1 + 1, STAGE.i1 - 4, 1, STAGE.k1 + 2, 0xcfc9bd);
  // the podium
  f.box(67, STAGE.h, 18, 73, STAGE.h + 10, 21, (x, y, z) => (z === 21 && y === STAGE.h + 7 ? 0xf2c46b : 0x1f3f8a));
  // the banner on two poles
  const words = "CLASS OF 2026";
  const wide = textWidth(words, 1);
  const b0 = 70 - Math.ceil(wide / 2) - 4, b1 = 70 + Math.ceil(wide / 2) + 4;
  f.box(b0 - 1, STAGE.h, 6, b0 - 1, 36, 6, 0x8a8f99);
  f.box(b1 + 1, STAGE.h, 6, b1 + 1, 36, 6, 0x8a8f99);
  // the banner itself stirs a little between its poles
  const banner = new Voxels(S, 0.03);
  banner.box(b0, 27, 6, b1, 35, 6, (x, y) => (y === 27 || y === 35 ? 0xf2c46b : 0x1f3f8a));
  letters(banner, words, 70 - Math.ceil(wide / 2), 33, 7, 0xf2c46b, { axis: "x" });
  group.add(hanging(banner, hangSway("z", 0.03), 35, ORIGIN));
  f.box(b0 - 1, 36, 6, b1 + 1, 36, 6, 0x8a8f99);
  // ribbons down from the balloons to where they're tied, either end
  for (const x0 of [STAGE.i0 + 2, STAGE.i1 - 2]) f.box(x0, STAGE.h, 10, x0, 16, 10, 0xd9d4ca);
  // flowers along the front of the stage, between the steps
  for (let x = STAGE.i0 + 15; x <= STAGE.i1 - 15; x += 6) {
    if (Math.abs(x - 70) < 5) continue;
    f.box(x, 0, STAGE.k1 + 1, x + 2, 2, STAGE.k1 + 2, 0xf4f2ea);
    f.blob(x + 1, 4, STAGE.k1 + 1.5, 1.8, 1.6, 1.4, (vx, vy, vz) => (hash3(vx, vy, vz) > 0.55 ? (x % 12 ? 0xf2c46b : 0x2f6be8) : 0x4f8f34), 0.9, x);
  }
  // folding chairs for the class, facing the stage
  for (const z of [0.6, 1.4]) for (const x of [-3.6, -2.8, -2.0, -1.2, 0.8, 1.6, 2.4, 3.2]) {
    const i = Math.round(70 + x * 10), k = Math.round(50 + z * 10);
    f.box(i - 2, 0, k - 2, i + 2, 3, k + 2, (vx, y) => (y === 3 ? 0xf4f2ea : vx === i - 2 || vx === i + 2 ? 0xd9d4ca : null));
    f.box(i - 2, 4, k + 2, i + 2, 8, k + 2, 0xf4f2ea);
  }
  // the stands, stepped, aluminium
  for (let i = 120; i <= 139; i += 1)
    for (let k = 58; k <= 88; k += 1) {
      const tier = i < 129 ? 1 : 2;
      const top = tier * 3;
      for (let j = 0; j <= top; j += 1) f.set(i, j, k, j === top ? 0xbfc4cc : 0x8a8f99);
    }
  // the goalpost, at the far end
  f.box(8, 0, 60, 9, 18, 61, 0xf2c46b);
  f.box(8, 18, 50, 9, 18, 72, 0xf2c46b);
  f.box(8, 18, 50, 9, 32, 51, 0xf2c46b);
  f.box(8, 18, 71, 9, 32, 72, 0xf2c46b);
  mesh(f);

  // the signpost, for the end: three boards, three ways
  const sign = new Voxels(S, 0.04);
  sign.box(69, 0, 90, 70, 30, 91, 0x8a5a3c);
  const board = (y: number, text: string, left: boolean, colour: number) => {
    const w = textWidth(text, 1) + 6;
    const x0 = left ? 69 - w + 2 : 69;
    sign.box(x0, y, 92, x0 + w, y + 6, 92, (x) => ((left && x === x0) || (!left && x === x0 + w) ? 0x6b4a32 : colour));
    letters(sign, text, x0 + 3, y + 5, 93, 0xfbf8f1, { axis: "x" });
  };
  board(23, "< BERKELEY", true, 0x1f3f8a);
  board(15, "USC >", false, 0x9a1f2a);
  board(7, "CC > USC", false, 0x4f7a3a);
  const signs = mesh(sign);
  signs.visible = false;

  // —— light: late afternoon, gold, long shadows; clouds drifting over
  const sun = new DirectionalLight(0xffd29a, 3.3);
  sun.position.set(14, 9, -10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(0xd6e2ff, 0x5e7a3a, 1.3);
  group.add(sun, sun.target, hemi);

  // balloons, blue and gold, bobbing on their strings either end of the stage
  const balloonV = new Voxels(S, 0.02);
  balloonV.blob(0, 0, 0, 2.2, 2.6, 2.2, 0xffffff, 1, 1);
  balloonV.set(0, -3, 0, 0xe9e4da);
  balloonV.set(0, -4, 0, 0xd9d4ca);
  const balloonGeometry = balloonV.geometry(3);
  const balloons = new InstancedMesh(balloonGeometry, outdoorSolid, 14);
  balloons.castShadow = true;
  balloons.frustumCulled = false;
  const tint = new Color();
  const homes: Vector3[] = [];
  for (const [side, x0] of [STAGE.i0 + 2, STAGE.i1 - 2].entries())
    for (let n = 0; n < 7; n += 1) {
      const x = x0 + Math.round(Math.sin(n * 2.1) * 3), y = 18 + n * 3 + Math.round(Math.cos(n * 1.3) * 2), z = 10 + Math.round(Math.cos(n * 2.7) * 3);
      homes.push(at(x + 0.5, y + 0.5, z + 0.5));
      balloons.setColorAt(side * 7 + n, tint.setHex(n % 2 ? 0xf2c46b : 0x2f6be8));
    }
  if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
  group.add(balloons);
  const dummy = new Object3D();
  const life = alive(group, [birds(new Vector3(9, 7.5, -9), new Vector3(-9, 7.5, 9), { count: 5, voxel: 0.1, every: 30, seconds: 13, seed: 4 })]);

  // caps, thrown
  const caps: Array<{ mesh: Mesh; v: Vector3; spin: Vector3; rest: boolean }> = [];
  const capGeometry = (() => {
    const v = new Voxels(S, 0.02);
    v.box(-2, 0, -2, 1, 1, 1, 0x1f3f8a);
    v.box(-3, 2, -3, 2, 2, 2, 0x2a4f9e);
    v.set(-1, 3, -1, 0xf2c46b);
    v.box(2, 0, 0, 2, 1, 0, 0xf2c46b);
    return v.geometry(9);
  })();

  const colliders: Collider[] = [
    block(STAGE.i0 + 13, STAGE.k0, STAGE.i1 - 13, STAGE.k0 + 1),
    block(66, 17, 74, 22), // the podium
    block(120, 56, 139, 90), // the stands
    block(7, 49, 10, 73), // the goalpost
  ];
  for (const z of [0.6, 1.4]) {
    const k = Math.round(50 + z * 10);
    colliders.push(block(30, k - 2, 63, k + 2), block(76, k - 2, 104, k + 2));
  }
  for (let x = STAGE.i0 + 15; x <= STAGE.i1 - 15; x += 6) if (Math.abs(x - 70) >= 5) colliders.push(block(x, STAGE.k1 + 1, x + 2, STAGE.k1 + 2));
  const signCollider = block(68, 89, 71, 92);
  const spots: Spot[] = [{ id: "podium", label: "Podium", at: at(70, 10, 22), reach: 1.5 }];
  const signSpot: Spot = { id: "signs", label: "Signpost", at: at(70, 14, 92), reach: 1.6 };

  const room = {
    group,
    colliders,
    spots,
    background: { top: new Color(0xa9c6ef), bottom: new Color(0xfbe3c4) },
    span: { wide: 14.4, tall: 9.8 },
    // aimed a little above the grass, so the banner clears the HUD on a wide screen
    centre: new Vector3(0, 1.9, 0),
    follow: 0.45,
    bounds: { x0: -6.6, x1: 6.6, z0: -4.4, z1: 4.6 },
    spawn: at(40, 0, 80),
    heading: Math.PI,
    night: 0,
    clouds: 0.7,
    floorAt: (x: number, z: number) => {
      const i = x / S + ORIGIN[0], k = z / S + ORIGIN[1];
      return i >= STAGE.i0 && i <= STAGE.i1 + 1 && k >= STAGE.k0 && k <= STAGE.k1 + 1 ? STAGE.h * S : 0;
    },
    /** Caps in the air, from where the heads are. */
    toss: (from: Vector3[] = []) => {
      const starts = from.length ? from : [at(16, 19, 82), at(22, 19, 86), at(28, 19, 82)];
      const extra = Array.from({ length: 10 }, (_, n) => at(30 + n * 7, 14, 60 + (n % 2) * 8));
      for (const p of [...starts, ...extra]) {
        const m = new Mesh(capGeometry, solid);
        m.castShadow = true;
        m.position.copy(p);
        group.add(m);
        caps.push({
          mesh: m,
          v: new Vector3((Math.random() - 0.5) * 1.2, 5.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2),
          spin: new Vector3(Math.random() * 8 - 4, Math.random() * 10 - 5, Math.random() * 8 - 4),
          rest: false,
        });
      }
    },
    showSigns: (on: boolean) => {
      signs.visible = on;
      const has = spots.includes(signSpot);
      if (on && !has) {
        spots.push(signSpot);
        colliders.push(signCollider);
      }
      if (!on && has) {
        spots.splice(spots.indexOf(signSpot), 1);
        colliders.splice(colliders.indexOf(signCollider), 1);
      }
    },
    update: (time: number, dt: number) => {
      life.update(time, dt);
      const bob = motion.value;
      homes.forEach((home, n) => {
        dummy.position.set(home.x + Math.sin(time * 0.6 + n * 1.7) * 0.03 * bob, home.y + Math.sin(time * 1.1 + n * 2.3) * 0.05 * bob, home.z);
        dummy.rotation.set(0, 0, Math.sin(time * 0.8 + n) * 0.08 * bob);
        dummy.updateMatrix();
        balloons.setMatrixAt(n, dummy.matrix);
      });
      balloons.instanceMatrix.needsUpdate = true;
      for (const cap of caps) {
        if (cap.rest) continue;
        cap.v.y -= 9.8 * dt;
        cap.mesh.position.addScaledVector(cap.v, dt);
        cap.mesh.rotation.x += cap.spin.x * dt;
        cap.mesh.rotation.y += cap.spin.y * dt;
        cap.mesh.rotation.z += cap.spin.z * dt;
        if (cap.mesh.position.y <= 0.05 && cap.v.y < 0) {
          cap.mesh.position.y = 0.05;
          cap.mesh.rotation.set(0, cap.mesh.rotation.y, 0);
          cap.rest = true;
        }
      }
    },
    dispose: () => {
      life.dispose();
      capGeometry.dispose();
      balloonGeometry.dispose();
      disposeAll(group);
    },
  } satisfies Room & Record<string, unknown>;
  return room;
}

export type Field = ReturnType<typeof field>;
