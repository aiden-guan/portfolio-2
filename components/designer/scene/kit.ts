import { Group, Mesh, type Material } from "three";
import { FLAG, worldMaterial } from "./shared";
import { hash3, mix, Voxels } from "./voxels";

// Materials and small builders shared by every prop: people, agents, birds,
// dogs, fish, trees and stones, all as voxel models in local coordinates
// (y up, standing on y = 0, facing +z unless said otherwise).

export const V = 0.2;

export const materials = {
  solid: worldMaterial({ key: "solid", flag: FLAG.solid }),
  foliage: worldMaterial({ key: "foliage", flag: FLAG.solid, sway: 0.022, swayFrom: 1.2 }),
  blossom: worldMaterial({
    key: "blossom",
    flag: FLAG.soft,
    sway: 0.03,
    swayFrom: 1.5,
    fragment: "totalEmissiveRadiance += diffuseColor.rgb * (0.06 + uNight * 0.42);",
  }),
  reeds: worldMaterial({ key: "reeds", flag: FLAG.soft, sway: 0.09, swayFrom: 0 }),
  soft: worldMaterial({ key: "soft", flag: FLAG.soft }),
  cloud: worldMaterial({
    key: "cloud",
    flag: FLAG.soft,
    cloud: false,
    fragment:
      "reflectedLight.directDiffuse *= 0.18; reflectedLight.indirectDiffuse *= 0.3; totalEmissiveRadiance += diffuseColor.rgb * mix(0.82, 0.07, uNight) + vec3(0.01, 0.016, 0.035) * uNight;",
  }),
  glow: worldMaterial({ key: "glow", flag: FLAG.solid, fragment: "totalEmissiveRadiance = diffuseColor.rgb * (0.55 + uNight * 2.6);" }),
  // lamp glass: pale by day, lit at night
  lamp: worldMaterial({ key: "lamp", flag: FLAG.soft, fragment: "totalEmissiveRadiance += diffuseColor.rgb * uNight * 3.2;" }),
  // only out at night, blinking
  firefly: worldMaterial({
    key: "firefly",
    flag: FLAG.soft,
    cloud: false,
    fragment:
      "float blink = 0.5 + 0.5 * sin(uTime * 2.7 + vWorld.x * 9.0 + vWorld.z * 5.0); if (uNight * blink < 0.35) discard; totalEmissiveRadiance = diffuseColor.rgb * 3.0 * uNight;",
  }),
};

export function mesh(
  voxels: Voxels,
  material: Material = materials.solid,
  options: { shadow?: boolean; seed?: number; occlude?: boolean; receive?: boolean } = {},
) {
  const m = new Mesh(voxels.geometry(options.seed ?? 1, options.occlude ?? true), material);
  m.castShadow = options.shadow ?? true;
  m.receiveShadow = options.receive ?? true;
  return m;
}

/** A group whose children are centred on its own origin in x/z. */
export function centred(voxels: Voxels, material?: Material, options?: { shadow?: boolean; seed?: number; occlude?: boolean; receive?: boolean }) {
  const m = mesh(voxels, material, options);
  const box = m.geometry.boundingBox!;
  m.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
  const g = new Group();
  g.add(m);
  return g;
}

export type Outfit = { skin: number; hair: number; top: number; bottom: number; shoes: number; hat?: number };

export const OUTFITS: Record<string, Outfit> = {
  aiden: { skin: 0xe9b98f, hair: 0x1d1a19, top: 0xf6f4ee, bottom: 0x2a2f3d, shoes: 0x1c1c1c },
  fisher: { skin: 0xe2a77c, hair: 0x3a2a20, top: 0xd9893a, bottom: 0x3f5ea8, shoes: 0x3a2a20, hat: 0xf2c14e },
  orange: { skin: 0xc98b62, hair: 0x241b16, top: 0xef7d32, bottom: 0x1f2633, shoes: 0xf5f5f5 },
  blue: { skin: 0xf0c49d, hair: 0x6b4426, top: 0x2f62d6, bottom: 0x1f2633, shoes: 0xf5f5f5 },
  white: { skin: 0x8a5a3c, hair: 0x15110f, top: 0xf4f4f4, bottom: 0x2b2b2b, shoes: 0xd94a3a },
};

// A person, nine voxels tall.
export function person(outfit: Outfit, pose: "stand" | "sit" = "stand") {
  const v = new Voxels(V, 0.04);
  const { skin, hair, top, bottom, shoes, hat } = outfit;
  if (pose === "stand") {
    v.box(0, 0, 0, 0, 0, 1, shoes);
    v.box(1, 0, 0, 1, 0, 1, shoes);
    v.box(0, 1, 0, 1, 2, 1, bottom);
    v.box(0, 3, 0, 1, 5, 1, top);
    v.box(-1, 3, 0, -1, 5, 1, (x, y) => (y === 3 ? skin : top));
    v.box(2, 3, 0, 2, 5, 1, (x, y) => (y === 3 ? skin : top));
    v.box(0, 6, 0, 1, 7, 1, skin);
    v.box(0, 8, 0, 1, 8, 1, hair);
    v.box(0, 6, 0, 1, 7, 0, hair); // the back of the head
  } else {
    // seated on an edge, legs over it towards +z
    v.box(0, 0, 2, 1, 0, 2, shoes);
    v.box(0, 1, 1, 1, 1, 2, bottom);
    v.box(0, 2, 0, 1, 2, 1, bottom);
    v.box(0, 3, 0, 1, 5, 1, top);
    v.box(-1, 3, 1, -1, 4, 1, top);
    v.box(2, 3, 1, 2, 4, 1, top);
    v.set(-1, 3, 2, skin);
    v.set(2, 3, 2, skin);
    v.box(0, 6, 0, 1, 7, 1, skin);
    v.box(0, 8, 0, 1, 8, 1, hair);
    v.box(0, 6, 0, 1, 7, 0, hair);
  }
  if (hat) {
    const y = pose === "stand" ? 8 : 8;
    v.box(-1, y, -1, 2, y, 2, hat);
    v.box(0, y + 1, 0, 1, y + 1, 1, hat);
  }
  return v;
}

// An agent: a small white robot with a dark visor and a lit antenna.
export function agent(light: number) {
  const v = new Voxels(V, 0.03);
  const body = 0xeef0f3, shade = 0xc9ced6, visor = 0x262c38;
  v.box(0, 0, 0, 0, 1, 0, 0x3a3f4a);
  v.box(2, 0, 0, 2, 1, 0, 0x3a3f4a);
  v.box(0, 0, 1, 0, 1, 1, 0x3a3f4a);
  v.box(2, 0, 1, 2, 1, 1, 0x3a3f4a);
  v.box(-0, 2, 0, 2, 4, 1, (x, y) => (y === 2 ? shade : body));
  v.box(-1, 3, 0, -1, 4, 1, shade);
  v.box(3, 3, 0, 3, 4, 1, shade);
  v.box(0, 5, -0, 2, 6, 1, body);
  v.box(0, 6, 1, 2, 6, 1, visor);
  v.set(1, 7, 0, 0x8a909c);
  v.set(1, 8, 0, light);
  return v;
}

// Rally's player: a pale blue capsule in sunglasses.
export function capsule() {
  const v = new Voxels(V, 0.03);
  const blue = 0x8fc0f2, deep = 0x5b93d6, face = 0xf7f9fc, shades = 0x15181d;
  v.blob(0, 4, 0, 1.7, 4.2, 1.7, (x, y) => (y < 2 ? deep : blue));
  v.box(-1, 5, 1, 1, 6, 1, face);
  v.box(-1, 6, 2, 1, 6, 2, shades);
  v.set(0, 5, 2, 0x262626);
  return v;
}

export function paddle() {
  const v = new Voxels(V * 0.7, 0.02);
  v.blob(0, 3, 0, 1.6, 1.6, 0.5, 0xe5484d);
  v.box(0, 0, 0, 0, 1, 0, 0x8a5a3c);
  return v;
}

export function corgi() {
  const v = new Voxels(V, 0.04);
  const fur = 0xdf8a3c, deep = 0xb8692c, white = 0xf7f1e6, nose = 0x1d1a19;
  // legs
  for (const x of [0, 4]) for (const z of [0, 2]) v.set(x, 0, z, white);
  // body
  v.box(0, 1, 0, 5, 2, 2, (x, y) => (y === 1 && x > 3 ? white : fur));
  v.box(-1, 2, 1, -1, 2, 1, deep); // tail
  // head
  v.box(5, 2, 0, 6, 4, 2, fur);
  v.box(7, 2, 1, 7, 3, 1, white);
  v.set(8, 3, 1, nose);
  v.set(6, 4, 0, nose);
  v.set(6, 4, 2, nose);
  v.box(5, 5, 0, 5, 6, 0, deep);
  v.box(5, 5, 2, 5, 6, 2, deep);
  return v;
}

// alai's Ally: a round yellow bird with pale blue wings.
export function ally() {
  const v = new Voxels(V * 0.8, 0.02);
  const lamp = 0xffd23f, shade = 0xf2a93b, wing = 0xdce6ff, ink = 0x1e1b3a, cheek = 0xff8fab, beak = 0xf28a1d;
  v.blob(0, 2.6, 0, 2.4, 2.4, 2.2, (x, y) => (y <= 1 ? shade : lamp));
  v.box(-1, 2, -3, 1, 3, -3, wing);
  v.box(-1, 2, 3, 1, 3, 3, wing);
  v.set(2, 3, -1, ink);
  v.set(2, 3, 1, ink);
  v.set(2, 2, -2, cheek);
  v.set(2, 2, 2, cheek);
  v.set(3, 2, 0, beak);
  v.set(0, 5, 0, lamp);
  v.set(-1, 5, 0, shade);
  return v;
}

export function pigeon(withLetter = false) {
  const v = new Voxels(V * 0.8, 0.03);
  const grey = 0x9aa4ae, dark = 0x737c88, neck = 0x5f9e7a, beak = 0xd8cdb8;
  v.box(0, 1, 0, 2, 2, 1, grey);
  v.box(-1, 2, 0, -1, 2, 1, dark);
  v.box(3, 2, 0, 3, 3, 1, (x, y) => (y === 2 ? neck : dark));
  v.set(4, 3, 0, beak);
  v.set(1, 0, 0, 0xc0675a);
  v.set(1, 0, 1, 0xc0675a);
  if (withLetter) v.box(4, 1, 0, 5, 2, 1, 0xfbf8f1);
  return v;
}

export function wing() {
  const v = new Voxels(V * 0.8, 0.03);
  v.box(0, 0, 0, 2, 0, 2, (x, y, z) => (z === 2 ? 0x5c6570 : 0x8d97a2));
  return v;
}

export function koi(seed: number) {
  const v = new Voxels(V * 0.9, 0.02);
  const orange = 0xf2782d, white = 0xf6efe4, blue = 0x2e5ed6, light = 0xf7b07a;
  const paint = (x: number, y: number, z: number) => {
    const r = hash3(x * 3 + seed, z, seed * 7);
    if (r < 0.22) return blue;
    if (r < 0.45) return white;
    return r < 0.55 ? light : orange;
  };
  v.box(0, 0, 0, 4, 0, 1, paint);
  v.box(5, 0, 0, 5, 0, 1, orange);
  v.box(-1, 0, 0, -1, 0, 1, light);
  v.set(-2, 0, -1, light);
  v.set(-2, 0, 2, light);
  v.set(2, 0, -1, light);
  v.set(2, 0, 2, light);
  return v;
}

export function lampPost() {
  const post = new Voxels(V, 0.04);
  post.box(0, 0, 0, 0, 9, 0, 0x2f3238);
  post.box(-1, 0, -1, 1, 0, 1, 0x3c4048);
  post.box(-1, 13, -1, 1, 13, 1, 0x2f3238);
  const glass = new Voxels(V, 0);
  glass.box(-1, 10, -1, 1, 12, 1, (x, y, z) => (Math.abs(x) + Math.abs(z) === 2 ? null : 0xffd27a));
  return { post, glass };
}

export function envelope(seal = 0xd74718) {
  const v = new Voxels(V * 0.6, 0);
  v.box(0, 0, 0, 3, 2, 0, (x, y) => (x === 1 && y === 1 ? seal : y === 2 && (x === 1 || x === 2) ? 0xe7e2d6 : 0xfbf9f3));
  return v;
}

const LEAVES = [0x2f6b2a, 0x3d7d2e, 0x4f9336, 0x67a83e, 0x86bf4b];

// A round tree; `size` scales the canopy.
export function roundTree(seed: number, size = 1) {
  const v = new Voxels(0.25, 0.05);
  const trunk = 0x6b4a32;
  const height = Math.round(4 + size * 2);
  v.box(0, 0, 0, 1, height, 1, trunk);
  const r = 4.2 * size;
  v.blob(0.5, height + r * 0.75, 0.5, r, r * 0.85, r, (x, y, z) => {
    const top = (y - height) / (r * 1.7);
    const pick = hash3(x + seed, y, z) * 0.5 + top * 0.7;
    return LEAVES[Math.min(LEAVES.length - 1, Math.max(0, Math.floor(pick * LEAVES.length)))];
  }, 0.92, seed);
  v.blob(0.5 + r * 0.45, height + r * 0.55, 0.5 - r * 0.2, r * 0.6, r * 0.55, r * 0.6, (x, y, z) =>
    LEAVES[Math.floor(hash3(x, y + seed, z) * 3) + 1], 0.9, seed + 3);
  return v;
}

export function bush(seed: number, flowers?: number) {
  const v = new Voxels(V, 0.06);
  const r = 2.2 + hash3(seed, 1, 2) * 1.2;
  v.blob(0, r * 0.7, 0, r, r * 0.75, r * 0.9, (x, y, z) => {
    if (flowers && hash3(x + seed, y, z) > 0.86) return flowers;
    return LEAVES[Math.floor(hash3(x, y, z + seed) * 3) + (y > r * 0.6 ? 2 : 0)];
  }, 0.95, seed);
  return v;
}

export function rock(seed: number, scale = 1) {
  const v = new Voxels(V, 0.05);
  const rx = (2 + hash3(seed, 0, 0) * 1.6) * scale;
  const ry = (1.2 + hash3(0, seed, 0) * 1) * scale;
  const rz = (1.8 + hash3(0, 0, seed) * 1.4) * scale;
  v.blob(0, ry * 0.55, 0, rx, ry, rz, (x, y, z) => {
    const top = y >= ry * 0.9;
    const base = top ? 0xb9b5ad : 0x96928b;
    return hash3(x, y, z + seed) > 0.9 ? 0x7f7b75 : top && hash3(x + 2, y, z) > 0.8 ? 0x8fa36a : base;
  }, 1, seed);
  return v;
}

export function reeds(seed: number) {
  const v = new Voxels(0.14, 0.05);
  for (let i = 0; i < 7; i += 1) {
    const x = Math.round((hash3(seed, i, 1) - 0.5) * 6);
    const z = Math.round((hash3(seed, i, 2) - 0.5) * 6);
    const h = 5 + Math.floor(hash3(seed, i, 3) * 6);
    const tone = mix(0x8f9a3c, 0xc9b65a, hash3(seed, i, 4));
    v.box(x, 0, z, x, h, z, tone);
    if (hash3(seed, i, 5) > 0.55) v.box(x, h + 1, z, x, h + 2, z, 0x6b4527);
  }
  return v;
}

export function lilyPad(seed: number) {
  const v = new Voxels(V * 0.8, 0.04);
  const r = 2 + hash3(seed, 3, 3) * 1.2;
  for (let x = -3; x <= 3; x += 1)
    for (let z = -3; z <= 3; z += 1) {
      if (Math.hypot(x, z) > r) continue;
      if (x > 0 && Math.abs(z) <= Math.max(0, x - 1) * 0.45) continue; // the notch
      v.set(x, 0, z, hash3(x, seed, z) > 0.7 ? 0x6cb24a : 0x4c9437);
    }
  if (hash3(seed, 9, 9) > 0.5) {
    v.set(-1, 1, 0, 0xf4a6c0);
    v.set(-1, 1, 1, 0xf7c4d4);
    v.set(-2, 1, 0, 0xf7c4d4);
    v.set(-1, 2, 0, 0xfff1a8);
  }
  return v;
}

export function cloud(seed: number, width = 26) {
  const v = new Voxels(0.32, 0.012);
  const puffs = 5 + Math.floor(hash3(seed, 1, 1) * 3);
  const paint = (x: number, y: number) => (y <= 1 ? 0xd2ddeb : y <= 3 ? 0xe9eff7 : hash3(x, y, seed) > 0.85 ? 0xf6f9fd : 0xffffff);
  for (let i = 0; i < puffs; i += 1) {
    const k = i / (puffs - 1) - 0.5;
    const x = k * width + (hash3(seed, i, 2) - 0.5) * 3;
    const r = 4 + (1 - Math.abs(k) * 2) * 5 + hash3(seed, i, 3) * 2.5;
    v.blob(x, r * 0.45, (hash3(seed, i, 4) - 0.5) * 4, r, r * 0.85, r * 0.75, paint, 1, seed + i);
  }
  v.blob((hash3(seed, 7, 7) - 0.5) * 6, 9, 0, 5.5, 5, 4.5, paint, 1, seed + 9);
  // flat underside
  for (const [k] of [...v.cells]) {
    const y = ((k >>> 10) & 1023) - 512;
    if (y < 0) v.cells.delete(k);
  }
  return v;
}
