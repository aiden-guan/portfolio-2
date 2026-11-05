import {
  AddEquation,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  OneFactor,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
} from "three";
import { FLAG, shaftMaterial, uniforms, worldMaterial } from "../../../scene/shared";
import { hash3, Voxels } from "../../../scene/voxels";
import { solid } from "../people";
import { motion } from "./common";

// What moves in a room by itself: light coming through a window with dust
// in it, steam off a mug, the hands of a clock, birds going over, leaves
// coming down. Everything is made once and moved in place every frame, and
// what's just there for the air holds still for anyone who asked for less
// motion.

export type Life = { object: Object3D; update: (time: number, dt: number) => void; dispose: () => void };

/** The four corners of a window's opening, in the world: bottom left, bottom right, top right, top left. */
export type Opening = [Vector3, Vector3, Vector3, Vector3];

const dummy = new Object3D();
const p = new Vector3();
const fract = (x: number) => x - Math.floor(x);

const moteMaterials = new Map<number, ReturnType<typeof worldMaterial>>();
const moteMaterial = (color: number) => {
  let m = moteMaterials.get(color);
  if (!m) {
    m = worldMaterial({ key: "game-mote", flag: FLAG.soft, cloud: false, fragment: "totalEmissiveRadiance = diffuseColor.rgb * 1.15;" }, { vertexColors: false, color });
    moteMaterials.set(color, m);
  }
  return m;
};
const speck = new BoxGeometry(1, 1, 1);

/** Where the room's sun is going: a unit vector from the light's position towards its target. */
export const towards = (from: Vector3, to = new Vector3()) => to.clone().sub(from).normalize();

/** Only once the room has fully arrived, eased in, and gone again the moment it starts to leave. */
function arrival() {
  let k = 0;
  return (dt: number) => {
    k = uniforms.uReveal.value >= 1 ? Math.min(1, k + dt / 0.9) : 0;
    return k * k * (3 - 2 * k);
  };
}

/** A window's light in the air: the opening carried along the sun until it
 * meets the floor, drawn with the renderer's shaft material (a volume with
 * soft sides and the window's bars in it), which the post pass dithers. */
export function shaft(opening: Opening, dir: Vector3, { color = 0xfff0d2, strength = 0.05, floor = 0, panes = [1, 1] as [number, number] } = {}): Life {
  const far = opening.map((c) => c.clone().addScaledVector(dir, (c.y - floor - 0.012) / -dir.y));
  const positions = new Float32Array(24);
  [...opening, ...far].forEach((c, i) => {
    positions[i * 3] = c.x;
    positions[i * 3 + 1] = c.y;
    positions[i * 3 + 2] = c.z;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  const material = shaftMaterial(opening, dir, { color, floor, panes });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  const arrived = arrival();
  return {
    object: mesh,
    update: (time, dt) => {
      // a cloud goes over now and then, very slowly
      const drift = 0.9 + 0.1 * Math.sin(time * 0.21) * Math.sin(time * 0.13 + 1.3) * motion.value;
      material.uniforms.uStrength.value = strength * arrived(dt) * drift;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A stage light's beam: a cone from the lamp down to where it lands, faint
 * in the air and dithered like the window's shafts. */
export function cone(from: Vector3, to: Vector3, { radius = 0.9, top = 0.1, color = 0xfff0d8, strength = 0.045 } = {}): Life {
  const length = from.distanceTo(to);
  const geometry = new CylinderGeometry(top, radius, length, 18, 1, true);
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uStrength: { value: 0 }, uLength: { value: length } },
    vertexShader: /* glsl */ `
uniform float uLength;
varying float vAlong;
void main() {
  vAlong = 0.5 - position.y / uLength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vAlong;
void main() {
  gl_FragColor = vec4(uColor * uStrength * smoothstep(0.0, 0.12, vAlong) * (1.0 - 0.5 * vAlong), 1.0);
}`,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), to.clone().sub(from).normalize());
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  const arrived = arrival();
  return {
    object: mesh,
    update: (time, dt) => {
      material.uniforms.uStrength.value = strength * arrived(dt);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Dust in a cone of light (see `cone`). */
export function coneMotes(from: Vector3, to: Vector3, { radius = 0.9, count = 18, color = 0xfff4dc, size = 0.03, seed = 1 } = {}): Life {
  const mesh = new InstancedMesh(speck, moteMaterial(color), count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const k = Float32Array.from({ length: count * 5 }, (_, i) => hash3(i, seed, 61));
  const axis = to.clone().sub(from);
  const side = new Vector3(1, 0, 0);
  const other = new Vector3(0, 0, 1);
  const arrived = arrival();
  return {
    object: mesh,
    update: (time, dt) => {
      mesh.visible = arrived(dt) > 0.5 && motion.value > 0;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i += 1) {
        const r = i * 5;
        const t = 0.15 + 0.8 * fract(k[r] - time * 0.006 * (0.6 + k[r + 1]));
        const a = k[r + 2] * Math.PI * 2 + time * 0.05 * (k[r + 3] - 0.5);
        const d = Math.sqrt(k[r + 4]) * radius * t * 0.85;
        p.copy(from).addScaledVector(axis, t).addScaledVector(side, Math.cos(a) * d).addScaledVector(other, Math.sin(a) * d);
        const lit = Math.sin(time * (0.5 + k[r + 1]) + k[r + 3] * 30) > -0.3 ? 1 : 0;
        dummy.position.copy(p);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size * lit);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => mesh.dispose(),
  };
}

/** Dust turning slowly in a shaft of light, a pixel each, catching it and losing it. */
export function motes(opening: Opening, dir: Vector3, { count = 22, color = 0xfff4dc, size = 0.032, floor = 0, seed = 1 } = {}): Life {
  const mesh = new InstancedMesh(speck, moteMaterial(color), count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const [o, b, , d] = opening;
  const u = b.clone().sub(o);
  const v = d.clone().sub(o);
  // where in the shaft each one is, and how it wanders
  const k = Float32Array.from({ length: count * 7 }, (_, i) => hash3(i, seed, 41));
  const arrived = arrival();
  return {
    object: mesh,
    update: (time, dt) => {
      const shown = arrived(dt);
      mesh.visible = shown > 0.5 && motion.value > 0;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i += 1) {
        const r = i * 7;
        const a = fract(k[r] + 0.05 * Math.sin(time * (0.05 + k[r + 3] * 0.08) + k[r + 4] * 20));
        // a slow fall, and back to the top
        const c = fract(k[r + 1] + 0.06 * Math.sin(time * (0.04 + k[r + 5] * 0.07) + k[r + 3] * 13) - time * 0.004 * (0.5 + k[r + 6]));
        const t = 0.08 + k[r + 2] * 0.84;
        p.copy(o).addScaledVector(u, a).addScaledVector(v, c);
        p.addScaledVector(dir, ((p.y - floor) / -dir.y) * t);
        // it turns: lit, then edge-on and gone
        const lit = Math.sin(time * (0.4 + k[r + 4] * 0.9) + k[r + 6] * 30) > -0.35 ? 1 : 0;
        dummy.position.copy(p);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size * lit);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => mesh.dispose(),
  };
}

const steamMaterial = worldMaterial(
  { key: "game-steam", flag: FLAG.soft, cloud: false, fragment: "totalEmissiveRadiance += diffuseColor.rgb * 0.32;" },
  { vertexColors: false, color: 0xf3f0ea },
);

/** Steam off something hot: puffs that rise, wander and shrink away. */
export function steam(at: Vector3, { count = 6, rise = 0.32, size = 0.042, rate = 0.32, seed = 1 } = {}): Life {
  const mesh = new InstancedMesh(speck, steamMaterial, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const k = Float32Array.from({ length: count * 2 }, (_, i) => hash3(i, seed, 17));
  return {
    object: mesh,
    update: (time) => {
      mesh.visible = motion.value > 0;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i += 1) {
        const life = (time * rate + i / count + k[i * 2] * 0.1) % 1;
        const swirl = time * 1.3 + k[i * 2 + 1] * 6;
        dummy.position.set(at.x + Math.sin(swirl) * 0.022 * life + 0.03 * life, at.y + life * rise, at.z + Math.cos(swirl * 0.8) * 0.018 * life);
        dummy.rotation.set(0, life * 2, 0);
        dummy.scale.setScalar(size * (life < 0.18 ? life / 0.18 : (1 - life) / 0.82) * (0.8 + k[i * 2] * 0.4));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => mesh.dispose(),
  };
}

/** The hands of a wall clock, on a face centred at `centre`, which faces +x or +z.
 * It keeps the HUD's time once it's told it (`set`); until then it starts at
 * `minutes` and goes at the HUD's pace, a minute every second and a half. */
export function clockHands(centre: Vector3, facing: "x" | "z", { minutes = 7 * 60, radius = 0.2, seconds = false } = {}) {
  const group = new Group();
  group.position.copy(centre);
  const hand = (length: number, color: number, lift: number) => {
    const v = new Voxels(0.034, 0);
    const n = Math.max(1, Math.round(length / 0.034));
    for (let y = 0; y < n; y += 1) v.set(0, y, 0, color);
    const g = v.geometry(1, false);
    g.translate(-0.017, 0, -0.017);
    const m = new Mesh(g, solid);
    const pivot = new Group();
    pivot.add(m);
    if (facing === "z") pivot.position.z = lift;
    else pivot.position.x = lift;
    group.add(pivot);
    return pivot;
  };
  const hour = hand(radius * 0.55, 0x1b1d22, 0.012);
  const minute = hand(radius * 0.85, 0x1b1d22, 0.03);
  const second = seconds ? hand(radius * 0.9, 0xd74718, 0.048) : null;
  const turn = (pivot: Group, angle: number) => {
    if (facing === "z") pivot.rotation.z = -angle;
    else pivot.rotation.x = -angle;
  };
  let now = minutes;
  let driven = false;
  let shown = minutes;
  let tick = 0;
  const update = (time: number, dt: number) => {
    if (!driven) {
      tick += dt;
      if (tick >= 1.5) {
        tick -= 1.5;
        now += 1;
      }
    }
    // the minute hand steps, and settles
    shown += (now - shown) * (1 - Math.exp(-dt * 14));
    turn(minute, ((shown % 60) / 60) * Math.PI * 2);
    turn(hour, (((shown / 60) % 12) / 12) * Math.PI * 2);
    if (second) {
      const s = Math.floor(time);
      const settle = Math.min(1, (time - s) / 0.12);
      turn(second, ((s - 1 + settle) / 60) * Math.PI * 2);
    }
  };
  update(0, 1);
  return {
    object: group,
    update,
    set: (value: number) => {
      // keep going forward round the dial rather than spinning back
      if (!driven) shown = value;
      driven = true;
      now = value;
    },
    dispose: () => {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
    },
  } satisfies Life & { set: (value: number) => void };
}

const birdMaterial = worldMaterial({
  key: "game-bird",
  flag: FLAG.solid,
  extraUniforms: { uMotion: motion },
  vertexHead: "uniform float uMotion;",
  vertex: /* glsl */ `
{
#ifdef USE_INSTANCING
  float wingPhase = dot(instanceMatrix[3].xyz, vec3(1.7, 2.3, 1.1));
#else
  float wingPhase = 0.0;
#endif
  // wings beat; every so often a bird glides
  float beat = sin(uTime * 8.5 + wingPhase);
  float glide = step(0.0, sin(uTime * 0.7 + wingPhase * 0.31));
  transformed.y += abs(transformed.x) * 0.32 * mix(beat, 0.2, glide) * uMotion;
}`,
});

/** A few birds going over in a loose line: they cross from `from` to `to`,
 * wait a while out of sight, and come round again. They're seen from this
 * camera's one angle, so each holds its wings across the screen whichever
 * way it's going: at a few pixels a bird, the V is what reads. */
export function birds(from: Vector3, to: Vector3, { count = 5, voxel = 0.1, color = 0x3d3a3c, every = 34, seconds = 14, seed = 3 } = {}): Life {
  const v = new Voxels(voxel, 0.02);
  // a body, and wings that lift at the tips
  v.set(0, 0, 0, color);
  v.set(0, 0, 1, color);
  for (const x of [-1, 1]) v.set(x, 0, 0, color);
  for (const x of [-2, 2]) v.set(x, 1, 0, color);
  const geometry = v.geometry(seed);
  geometry.translate(-voxel / 2, 0, -voxel / 2);
  const mesh = new InstancedMesh(geometry, birdMaterial, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const heading = Math.atan2(to.x - from.x, to.z - from.z);
  const side = new Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const back = new Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const across = Math.PI / 4;
  const k = Float32Array.from({ length: count * 3 }, (_, i) => hash3(i, seed, 5));
  return {
    object: mesh,
    update: (time) => {
      const t = (time + k[0] * every) % every;
      mesh.visible = motion.value > 0 && t < seconds;
      if (!mesh.visible) return;
      const s = t / seconds;
      for (let i = 0; i < count; i += 1) {
        // a loose V: each one a little behind and to the side of the one before
        const row = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        p.copy(from).lerp(to, s);
        p.addScaledVector(side, row * voxel * 7 + Math.sin(time * 0.6 + i) * voxel * 1.5);
        p.addScaledVector(back, Math.abs(row) * voxel * 6 + k[i * 3] * voxel * 4);
        p.y += Math.sin(time * 0.9 + k[i * 3 + 1] * 6) * voxel * 2;
        dummy.position.copy(p);
        dummy.rotation.set(0, across, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      mesh.dispose();
    },
  };
}

const leafMaterial = worldMaterial({ key: "game-leaf", flag: FLAG.soft }, { vertexColors: false });
const leafShape = new BoxGeometry(1, 0.35, 1);

/** Leaves coming down from a tree's crown: each drifts and turns on the way,
 * lies on the grass a while, and goes. */
export function leaves(crowns: Array<{ x: number; z: number; y: number; r: number }>, colours: number[], { count = 14, size = 0.07, seed = 9 } = {}): Life {
  const mesh = new InstancedMesh(leafShape, leafMaterial, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const k = Float32Array.from({ length: count * 6 }, (_, i) => hash3(i, seed, 23));
  const tint = new Color();
  for (let i = 0; i < count; i += 1) mesh.setColorAt(i, tint.setHex(colours[i % colours.length]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const FALL = 9;
  const REST = 4;
  return {
    object: mesh,
    update: (time) => {
      mesh.visible = motion.value > 0;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i += 1) {
        const r = i * 6;
        const crown = crowns[i % crowns.length];
        const cycle = FALL + REST + k[r] * 6;
        const t = (time + k[r + 1] * cycle) % cycle;
        const round = Math.floor((time + k[r + 1] * cycle) / cycle);
        // a new place in the crown each time round
        const a = hash3(i, round, seed) * Math.PI * 2;
        const d = Math.sqrt(hash3(round, i, seed + 1)) * crown.r;
        const fall = Math.min(1, t / FALL);
        const x = crown.x + Math.cos(a) * d + Math.sin(t * 1.1 + k[r + 2] * 6) * 0.25 * fall + fall * 0.6;
        const z = crown.z + Math.sin(a) * d + Math.cos(t * 0.9 + k[r + 3] * 6) * 0.2 * fall;
        const y = Math.max(0.02, crown.y * (1 - fall));
        const landed = fall >= 1;
        dummy.position.set(x, y, z);
        dummy.rotation.set(landed ? 0 : Math.sin(t * 2.3 + k[r + 4] * 9) * 1.1, a + t * (landed ? 0 : 0.8), landed ? 0 : Math.cos(t * 1.9) * 0.9);
        const gone = t > FALL + REST - 0.6 ? Math.max(0, (FALL + REST - t) / 0.6) : t < 0.4 ? t / 0.4 : 1;
        dummy.scale.setScalar(size * gone);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => mesh.dispose(),
  };
}

/** Moths round a lamp at night: specks of light circling it, never quite settling. */
export function moths(lamps: Vector3[], { each = 4, color = 0xfff0c8, size = 0.03, seed = 13 } = {}): Life {
  const count = lamps.length * each;
  const mesh = new InstancedMesh(speck, moteMaterial(color), count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const k = Float32Array.from({ length: count * 4 }, (_, i) => hash3(i, seed, 71));
  return {
    object: mesh,
    update: (time) => {
      mesh.visible = motion.value > 0;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i += 1) {
        const lamp = lamps[Math.floor(i / each)];
        const r = i * 4;
        const a = time * (1.3 + k[r] * 1.6) * (k[r + 1] > 0.5 ? 1 : -1) + k[r + 2] * 6.28;
        const d = 0.16 + k[r + 3] * 0.22 + Math.sin(time * 2.7 + k[r] * 9) * 0.05;
        dummy.position.set(lamp.x + Math.cos(a) * d, lamp.y + Math.sin(time * 1.9 + k[r + 2] * 7) * 0.14, lamp.z + Math.sin(a) * d);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => mesh.dispose(),
  };
}

/** Runs a list of lives as one, and adds their objects to a group. */
export function alive(group: Group, lives: Life[]) {
  for (const life of lives) group.add(life.object);
  return {
    update: (time: number, dt: number) => {
      for (const life of lives) life.update(time, dt);
    },
    dispose: () => {
      for (const life of lives) life.dispose();
    },
  };
}
