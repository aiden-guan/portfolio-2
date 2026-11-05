import { Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, Skeleton, SkinnedMesh, Uint16BufferAttribute, Uint32BufferAttribute, type Object3D } from "three";
import { FLAG, worldMaterial } from "../../scene/shared";
import { hash3, Voxels } from "../../scene/voxels";
import type { DogMotion, Motion } from "./motion";

// Everyone in the game, and the dog: voxel figures a little finer than the
// island's, cut into parts that hinge where people do (hips, knees, ankles,
// shoulders, elbows, the neck), so they can walk, run, sit, cheer, lie in bed
// and wag. One builder makes all of them from a Look, as a single skinned
// mesh each: a crowd costs a draw call a head, not one per limb.

export const S = 0.1;

export const solid = worldMaterial({ key: "game-solid", flag: FLAG.solid, cloud: false });

type Vec = [number, number, number];

// One figure, one draw. Every part is meshed on its own, so the faces where
// two parts meet survive them moving apart; then all of them are merged, each
// vertex riding the bone of the part it came from. A "cap" is a part's first
// row of its neighbour, shrunk a hair so it never fights it: it hides inside
// a straight joint and fills the gap in a bent one.
class Figure {
  readonly bones: Bone[] = [];
  private readonly root: Group;
  private readonly pivots: Vec[] = [];
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly color: number[] = [];
  private readonly skin: number[] = [];
  private readonly index: number[] = [];

  constructor(root: Group) {
    this.root = root;
  }

  /** A joint at `pivot` (voxel coordinates), hung from `parent` or the root. */
  bone(pivot: Vec, parent?: Bone) {
    const bone = new Bone();
    const base = parent ? this.pivots[this.bones.indexOf(parent)] : ([0, 0, 0] as Vec);
    bone.position.set((pivot[0] - base[0]) * S, (pivot[1] - base[1]) * S, (pivot[2] - base[2]) * S);
    (parent ?? this.root).add(bone);
    this.bones.push(bone);
    this.pivots.push(pivot);
    return bone;
  }

  /** Meshes `build` onto `bone`. `inset` shrinks it about the bone's upright axis; `nudge` moves it forward (voxels). */
  add(bone: Bone, seed: number, build: (v: Voxels) => void, inset = 0, nudge = 0) {
    const v = new Voxels(S, 0.035);
    build(v);
    if (!v.cells.size) return;
    const geometry = v.geometry(seed);
    const n = this.bones.indexOf(bone);
    const ax = this.pivots[n][0] * S, az = this.pivots[n][2] * S;
    const k = 1 - inset;
    const p = geometry.getAttribute("position"), no = geometry.getAttribute("normal"), c = geometry.getAttribute("color");
    const first = this.skin.length;
    for (let i = 0; i < p.count; i += 1) {
      this.position.push(ax + (p.getX(i) - ax) * k, p.getY(i), az + (p.getZ(i) - az) * k + nudge * S);
      this.normal.push(no.getX(i), no.getY(i), no.getZ(i));
      this.color.push(c.getX(i), c.getY(i), c.getZ(i));
      this.skin.push(n);
    }
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 1) this.index.push(first + index.getX(i));
    geometry.dispose();
  }

  mesh() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.color, 3));
    const count = this.skin.length;
    const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      skinIndex[i * 4] = this.skin[i];
      skinWeight[i * 4] = 1;
    }
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeight, 4));
    geometry.setIndex(count < 65536 ? new Uint16BufferAttribute(this.index, 1) : new Uint32BufferAttribute(this.index, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new SkinnedMesh(geometry, solid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // a pose reaches past the rest pose's bounds, and everyone's always on stage anyway
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    const skeleton = new Skeleton(this.bones);
    mesh.bind(skeleton);
    geometry.addEventListener("dispose", () => skeleton.dispose());
    return mesh;
  }
}

/** A loose piece (the mortarboard), its own mesh so it can be thrown. */
function piece(build: (v: Voxels) => void, pivot: Vec, seed: number) {
  const v = new Voxels(S, 0.035);
  build(v);
  const geometry = v.geometry(seed);
  geometry.translate(-pivot[0] * S, -pivot[1] * S, -pivot[2] * S);
  const mesh = new Mesh(geometry, solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const joint = new Group();
  joint.add(mesh);
  return joint;
}

export type Hair = "curls" | "short" | "messy" | "long" | "bun" | "buzz" | "bald" | "pony" | "waves";

export type Look = {
  skin: number;
  hair: Hair;
  hairColor: number;
  /** The shirt, or the outer layer over it. */
  top: number;
  style: "tee" | "hoodie" | "jacket" | "gown" | "blazer" | "dress" | "crop" | "tank";
  /** What shows at the collar under a jacket or blazer. */
  inner?: number;
  bottom: number;
  shoes: number;
  /** A flash on the shoes, a mark on the chest. */
  accent?: number;
  glasses?: boolean;
  /** Sunglasses. */
  shades?: boolean;
  earrings?: boolean;
  /** A bag on the right arm, in this colour. */
  bag?: number;
  /** Shorts: bare legs under the knee. */
  shorts?: boolean;
  hat?: "cap" | "beanie" | "grad" | "sunhat";
  hatColor?: number;
  /** How tall, in centimetres (the rig is drawn at 178). */
  height?: number;
  /** Round: a wider, deeper middle. */
  build?: "round";
};

const shade = (color: number, k: number) => {
  const r = Math.round(((color >> 16) & 255) * k), g = Math.round(((color >> 8) & 255) * k), b = Math.round((color & 255) * k);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};

const SKINS = [0xf3cfae, 0xe9b98f, 0xd9a277, 0xb9805a, 0x8e5c3d, 0x6b4430];
const HAIRS = [0x1d1a19, 0x2a2420, 0x4a3324, 0x6b4426, 0xc79a5b, 0x8e3b22];
const TOPS = [0x2f6be8, 0xf08a32, 0xf6f4ee, 0x2a2f3d, 0xd74718, 0x4f9a5c, 0x8fd3b6, 0xf2c46b, 0x5b4fd6, 0xe88a9a, 0x9aa4ae];
const BOTTOMS = [0x2a2f3d, 0x2b3f63, 0x6b5a45, 0x1b1d22, 0x8a8f99, 0xb59a6c];

// Heights are the real ones: Aiden 6'5", Miles 5'11", Allen 5'10", John 5'4", Jun 4'11".
export const LOOKS = {
  aiden: { skin: 0xe9b98f, hair: "curls", hairColor: 0x1d1a19, top: 0xf6f4ee, style: "tee", bottom: 0x2a2f3d, shoes: 0xf4f2ee, accent: 0xf08a32, height: 196 },
  // John wears what he sells
  john: { skin: 0xecc39e, hair: "short", hairColor: 0x161413, top: 0x4a6f9e, style: "jacket", inner: 0xf6f4ee, bottom: 0x2b3f63, shoes: 0x1b1d22, accent: 0xf6f4ee, height: 163 },
  jerry: { skin: 0xe2b28a, hair: "messy", hairColor: 0x2a2420, top: 0x4f9a5c, style: "hoodie", bottom: 0xb59a6c, shoes: 0x9aa4ae, accent: 0xf2c46b },
  editor: { skin: 0xd09a70, hair: "short", hairColor: 0x1d1a19, top: 0x1b1d22, style: "hoodie", bottom: 0x2a2f3d, shoes: 0xf4f2ee, hat: "cap", hatColor: 0xd74718 },
  judge: { skin: 0xf0c9a8, hair: "short", hairColor: 0xbfbab2, top: 0x2a2f3d, style: "blazer", inner: 0xf6f4ee, bottom: 0x2a2f3d, shoes: 0x1b1d22, glasses: true },
  principal: { skin: 0xb9805a, hair: "bald", hairColor: 0x2a2420, top: 0x1b1d22, style: "gown", bottom: 0x1b1d22, shoes: 0x1b1d22, glasses: true },
  // Berkeley, and the people met there (looks are guesses until there are photos)
  allen: { skin: 0xe9b98f, hair: "short", hairColor: 0x161413, top: 0xffd23f, style: "hoodie", bottom: 0x2a2f3d, shoes: 0xf4f2ee, glasses: true, height: 178 },
  // the roommate: dressed to go out, every night
  miles: { skin: 0xe2b28a, hair: "short", hairColor: 0x2a2420, top: 0x1b1d22, style: "jacket", inner: 0xf6f4ee, bottom: 0x2b3f63, shoes: 0xf4f2ee, height: 180 },
  // the floormate: a felt-green visor, a deck of cards somewhere on him
  jun: { skin: 0xe9b98f, hair: "short", hairColor: 0x1d1a19, top: 0x8a8f99, style: "hoodie", bottom: 0x2a2f3d, shoes: 0x2a2f3d, hat: "cap", hatColor: 0x2f7a4a, height: 150, build: "round" },
  dylan: { skin: 0xf0c9a8, hair: "messy", hairColor: 0x2a2420, top: 0x2a2f3d, style: "tee", bottom: 0x6b5a45, shoes: 0x1b1d22, accent: 0xd74718 },
  samuel: { skin: 0xd9a277, hair: "short", hairColor: 0x1d1a19, top: 0x4f6b8a, style: "jacket", inner: 0xf6f4ee, bottom: 0x2b3f63, shoes: 0xf4f2ee },
  professor: { skin: 0xf0c9a8, hair: "short", hairColor: 0xbfbab2, top: 0x6b5a45, style: "blazer", inner: 0xd9e6f2, bottom: 0x2a2f3d, shoes: 0x6b4a32, glasses: true },
  founder: { skin: 0xe2b28a, hair: "messy", hairColor: 0x4a3324, top: 0x2a2f3d, style: "jacket", inner: 0x8a8f99, bottom: 0x2b3f63, shoes: 0xf4f2ee },
  founder2: { skin: 0xb9805a, hair: "long", hairColor: 0x1d1a19, top: 0x1b1d22, style: "tee", bottom: 0x2a2f3d, shoes: 0xf4f2ee, glasses: true },
  founder3: { skin: 0xf3cfae, hair: "buzz", hairColor: 0xc79a5b, top: 0x4f9a5c, style: "hoodie", bottom: 0x6b5a45, shoes: 0x2a2f3d },
} satisfies Record<string, Look>;

/** In a cap and gown, for graduation. */
export function gowned(look: Look, gown = 0x1f3f8a): Look {
  return { ...look, top: gown, style: "gown", hat: "grad", hatColor: gown };
}

/** Somebody: a student, a camper in a line, a parent in the stands. */
export function someone(seed: number, overrides: Partial<Look> = {}): Look {
  const pick = <T,>(list: T[], salt: number) => list[Math.floor(hash3(seed, salt, 7) * list.length) % list.length];
  const hairs: Hair[] = ["short", "messy", "long", "bun", "buzz", "curls", "short", "long"];
  return {
    skin: pick(SKINS, 1),
    hair: pick(hairs, 2),
    hairColor: pick(HAIRS, 3),
    top: pick(TOPS, 4),
    style: hash3(seed, 5, 1) > 0.65 ? "hoodie" : "tee",
    bottom: pick(BOTTOMS, 6),
    shoes: hash3(seed, 8, 2) > 0.5 ? 0xf4f2ee : 0x2a2f3d,
    hat: hash3(seed, 9, 3) > 0.86 ? "beanie" : hash3(seed, 9, 4) > 0.9 ? "cap" : undefined,
    hatColor: pick(TOPS, 10),
    glasses: hash3(seed, 11, 5) > 0.82,
    height: 160 + Math.round(hash3(seed, 12, 6) * 24),
    ...overrides,
  };
}

export type Rig = {
  root: Group;
  /** The upper body, hinged at the hips. */
  body: Object3D;
  head: Object3D;
  /** Shoulders and elbows. */
  armL: Object3D;
  armR: Object3D;
  foreL: Object3D;
  foreR: Object3D;
  /** Hips, knees and ankles. */
  legL: Object3D;
  legR: Object3D;
  shinL: Object3D;
  shinR: Object3D;
  footL: Object3D;
  footR: Object3D;
  /** They blink. */
  eyes: Object3D;
  /** It opens to talk (0 tall when shut). */
  mouth: Object3D;
  /** The mortarboard, its own piece so it can be thrown. */
  cap: Group | null;
  /** Height against the drawn 178 cm; the whole figure is scaled by it. */
  scale: number;
};

function hairOn(v: Voxels, look: Look, seed: number) {
  const c = look.hairColor;
  const tones = [c, shade(c, 1.25), shade(c, 1.55)];
  const hair = (x: number, y: number, z: number) => tones[Math.floor(hash3(x + seed, y, z) * tones.length)];
  switch (look.hair) {
    case "curls": {
      // the mop: the crown, the back, the sides, and curls that won't lie down
      v.box(-3, 16, -2, 2, 16, 1, hair);
      v.box(-3, 13, -2, 2, 15, -2, hair);
      v.box(-3, 14, -1, -3, 15, 0, hair);
      v.box(2, 14, -1, 2, 15, 0, hair);
      for (let x = -4; x <= 3; x += 1)
        for (let z = -3; z <= 2; z += 1) {
          const edge = x === -4 || x === 3 || z === -3 || z === 2;
          if (!edge && hash3(x, 17, z) > 0.18) v.set(x, 17, z, hair(x, 17, z));
          if (!edge && hash3(x, 18, z) > 0.72) v.set(x, 18, z, hair(x, 18, z));
          if (edge && z !== 2 && hash3(x, 16, z * 3) > 0.35) v.set(x, 16, z, hair(x, 16, z));
          if (edge && z !== 2 && z !== -3 && hash3(x * 5, 15, z) > 0.55) v.set(x, 15, z, hair(x, 15, z));
        }
      v.box(-4, 13, -3, 3, 15, -3, (x, y, z) => (hash3(x, y, z) > 0.3 ? hair(x, y, z) : null));
      for (const x of [-3, -1, 0, 2]) v.set(x, 15, 2, hair(x, 15, 2));
      for (let x = -3; x <= 2; x += 1) v.set(x, 16, 2, hair(x, 16, 2));
      v.set(-2, 17, 2, hair(-2, 17, 2));
      v.set(1, 17, 2, hair(1, 17, 2));
      break;
    }
    case "short": {
      // neat, a side part, a little lift at the front
      v.box(-3, 16, -2, 2, 16, 2, hair);
      v.box(-3, 13, -2, 2, 15, -2, hair);
      v.box(-3, 15, -1, -3, 15, 1, hair);
      v.box(2, 15, -1, 2, 15, 1, hair);
      v.box(-1, 17, -1, 2, 17, 2, hair);
      v.set(1, 17, 3, hair(1, 17, 3));
      v.set(-3, 16, 2, null); // the part
      break;
    }
    case "messy": {
      v.box(-3, 16, -2, 2, 16, 2, hair);
      v.box(-3, 13, -2, 2, 15, -2, hair);
      v.box(-3, 14, -1, -3, 15, 1, hair);
      v.box(2, 14, -1, 2, 15, 1, hair);
      for (let x = -3; x <= 2; x += 1)
        for (let z = -2; z <= 2; z += 1) if (hash3(x, z, 4) > 0.45) v.set(x, 17, z, hair(x, 17, z));
      v.set(-2, 18, 0, hair(-2, 18, 0));
      v.set(1, 18, -1, hair(1, 18, -1));
      for (const x of [-2, 0, 1]) v.set(x, 15, 2, hair(x, 15, 2));
      break;
    }
    case "long": {
      v.box(-3, 16, -2, 2, 16, 2, hair);
      v.box(-3, 10, -2, 2, 15, -2, hair);
      v.box(-4, 11, -2, -4, 16, 1, hair);
      v.box(3, 11, -2, 3, 16, 1, hair);
      v.box(-3, 17, -1, 2, 17, 1, hair);
      for (const x of [-3, -2, 1, 2]) v.set(x, 15, 2, hair(x, 15, 2));
      break;
    }
    case "bun": {
      v.box(-3, 16, -2, 2, 16, 2, hair);
      v.box(-3, 13, -2, 2, 15, -2, hair);
      v.box(-3, 15, -1, -3, 15, 1, hair);
      v.box(2, 15, -1, 2, 15, 1, hair);
      v.box(-1, 17, -2, 0, 18, -1, hair);
      break;
    }
    case "buzz": {
      v.box(-3, 16, -2, 2, 16, 1, (x, y, z) => shade(hair(x, y, z), 1.1));
      v.box(-3, 14, -2, 2, 15, -2, hair);
      break;
    }
    case "pony": {
      v.box(-3, 16, -2, 2, 16, 2, hair);
      v.box(-3, 13, -2, 2, 15, -2, hair);
      v.box(-3, 15, -1, -3, 15, 1, hair);
      v.box(2, 15, -1, 2, 15, 1, hair);
      v.box(-1, 17, -2, 0, 17, 1, hair);
      // tied high, swinging down the back
      v.box(-1, 15, -3, 0, 16, -3, shade(c, 0.8));
      v.box(-1, 10, -4, 0, 15, -4, hair);
      v.set(0, 9, -4, hair(0, 9, -4));
      break;
    }
    case "waves": {
      v.box(-3, 16, -2, 2, 17, 2, hair);
      v.box(-4, 9, -3, 3, 15, -3, (x, y, z) => (y < 11 && (x === -4 || x === 3) && hash3(x, y, z) > 0.5 ? null : hair(x, y, z)));
      v.box(-4, 9, -2, -4, 16, 1, (x, y, z) => (y < 12 && z > 0 ? null : hair(x, y, z)));
      v.box(3, 9, -2, 3, 16, 1, (x, y, z) => (y < 12 && z > 0 ? null : hair(x, y, z)));
      // a side part, and a wave falling over one shoulder
      for (const x of [-3, -2, 1, 2]) v.set(x, 16, 2, hair(x, 16, 2));
      v.box(-3, 15, 2, -3, 15, 2, hair);
      v.box(3, 8, 0, 3, 11, 1, hair);
      break;
    }
    case "bald":
      v.box(-3, 13, -2, 2, 14, -2, hair);
      v.box(-3, 14, -1, -3, 14, 0, hair);
      v.box(2, 14, -1, 2, 14, 0, hair);
      break;
  }
}

/** A person, 19 voxels tall in Aiden's proportions, facing +z. */
export function person(look: Look, seed = 1): Rig {
  const root = new Group();
  const fig = new Figure(root);
  const gown = look.style === "gown";
  const dress = look.style === "dress";
  const bare = dress || look.shorts;
  const round = look.build === "round";
  const topShade = shade(look.top, 0.86);

  // the upper body hinges at the hips, so it can lean without sliding
  const body = fig.bone([0, 7, 0]);
  fig.add(body, seed, (v) => {
    v.box(-2, 7, -1, 1, 11, 0, (x, y, z) => (y === 7 && !gown && !dress ? shade(look.bottom, 0.82) : z === -1 && y < 10 ? topShade : look.top));
    if (round) {
      v.box(-3, 7, -2, 2, 10, 0, (x, y, z) => (y === 7 ? shade(look.bottom, 0.82) : z === -2 || x === -3 || x === 2 ? topShade : look.top));
      v.box(-2, 8, 1, 1, 9, 1, look.top); // the belly
    }
    if (dress) {
      // bare shoulders, two straps
      v.box(-2, 11, -1, 1, 11, 0, (x) => (x === -2 || x === 1 ? look.top : look.skin));
      v.box(-2, 8, 0, 1, 8, 0, shade(look.top, 0.9));
    } else if (look.style === "crop") {
      v.box(-2, 8, -1, 1, 8, 0, look.skin);
      v.box(-2, 11, -1, 1, 11, 0, (x) => (x === -2 || x === 1 ? look.top : look.skin));
    } else if (look.style === "tank") {
      v.box(-1, 11, 0, 0, 11, 0, look.skin);
    } else if (look.style === "hoodie") {
      v.box(-2, 11, -2, 1, 11, -2, topShade); // the hood, down
      v.box(-1, 8, 1, 0, 9, 1, topShade); // the pocket
      v.set(-1, 10, 1, 0xf4f2ee);
      v.set(0, 10, 1, 0xf4f2ee);
    } else if (look.style === "jacket" || look.style === "blazer") {
      v.box(-1, 8, 0, 0, 11, 0, look.inner ?? 0xf6f4ee);
      if (look.style === "jacket") {
        v.set(-2, 10, 1, shade(look.top, 1.2));
        v.set(1, 10, 1, shade(look.top, 1.2));
        v.box(-2, 7, 1, 1, 7, 1, shade(look.top, 0.8));
      }
    } else if (gown) {
      v.box(-2, 11, 1, 1, 11, 1, shade(look.top, 1.25)); // the collar
    } else if (look.accent) {
      v.set(0, 10, round ? 1 : 0, look.accent === 0xf08a32 ? 0x2f6be8 : look.accent);
    }
  });

  // shoulders and elbows
  const sleeveless = dress || look.style === "crop" || look.style === "tank";
  const sleeve = (vx: number, y: number) => (sleeveless || y <= 7 ? look.skin : y === 8 && look.style === "tee" ? shade(look.skin, 0.93) : y === 8 ? topShade : look.top);
  const arm = (x: number) => {
    const shoulder = fig.bone([x + 0.5, 11.5, 0], body);
    const elbow = fig.bone([x + 0.5, 9, 0], shoulder);
    fig.add(shoulder, seed, (v) => {
      v.box(x, 9, -1, x, 11, 0, sleeve);
      if (look.bag && x > 0) v.box(x + 1, 9, -1, x + 1, 10, -1, shade(look.bag, 0.7));
    });
    fig.add(elbow, seed, (v) => {
      v.box(x, 7, -1, x, 8, 0, sleeve);
      if (look.bag && x > 0) v.box(x + 1, 6, -1, x + 2, 8, 0, look.bag);
    });
    fig.add(elbow, seed, (v) => v.box(x, 9, -1, x, 9, 0, sleeve), 0.08);
    return [shoulder, elbow] as const;
  };
  const [armL, foreL] = arm(round ? -4 : -3);
  const [armR, foreR] = arm(round ? 3 : 2);

  // the head, with eyes of their own (they blink) and a mouth that opens
  const head = fig.bone([0, 12, 0], body);
  head.rotation.order = "YXZ";
  fig.add(head, seed + 2, (v) => {
    const skinShade = shade(look.skin, 0.93);
    v.box(-3, 12, -2, 2, 16, 1, (x, y, z) => (z === 1 && y === 12 ? skinShade : look.skin));
    v.set(-1, 12, 1, shade(look.skin, 0.82));
    v.set(0, 12, 1, shade(look.skin, 0.82));
    if (look.glasses) {
      v.box(-3, 14, 2, -1, 14, 2, (x) => (x === -2 ? null : 0x1b1d22));
      v.box(0, 14, 2, 2, 14, 2, (x) => (x === 1 ? null : 0x1b1d22));
      v.set(-2, 15, 2, 0x1b1d22);
      v.set(1, 15, 2, 0x1b1d22);
    }
    if (look.shades) {
      v.box(-3, 14, 2, 2, 14, 2, (x) => (x === -1 || x === 0 ? 0x2a2f3d : 0x141519));
      v.box(-3, 15, 2, 2, 15, 2, 0x2a2f3d);
    }
    if (look.earrings) {
      v.set(-4, 12, 0, 0xf2c46b);
      v.set(3, 12, 0, 0xf2c46b);
    }
    hairOn(v, look, seed);
    if (look.hat === "sunhat") {
      const c = look.hatColor ?? 0xf1dcaa;
      for (let x = -6; x <= 5; x += 1)
        for (let z = -5; z <= 4; z += 1) if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= 33) v.set(x, 17, z, (x + z) % 3 ? c : shade(c, 0.92));
      v.box(-3, 18, -2, 2, 19, 1, c);
      v.box(-3, 18, -2, 2, 18, 1, (x, y, z) => (z === 1 || z === -2 || x === -3 || x === 2 ? 0x1b1d22 : c));
    } else if (look.hat === "cap") {
      const c = look.hatColor ?? 0xd74718;
      v.box(-3, 17, -2, 2, 18, 2, c);
      v.box(-3, 17, 3, 2, 17, 4, shade(c, 0.85));
    } else if (look.hat === "beanie") {
      const c = look.hatColor ?? 0x2f6be8;
      v.box(-3, 16, -2, 2, 18, 2, (x, y) => (y === 16 ? shade(c, 0.8) : c));
      v.set(-1, 19, 0, 0xf4f2ee);
    }
  });
  const eyes = fig.bone([-0.5, 14.5, 2], head);
  fig.add(eyes, seed + 2, (v) => {
    v.set(-2, 14, 1, 0x1d1a19);
    v.set(1, 14, 1, 0x1d1a19);
  }, 0, 0.04);
  const mouth = fig.bone([0, 13, 2], head);
  fig.add(mouth, seed + 3, (v) => {
    v.set(-1, 12, 1, 0x5c2b27);
    v.set(0, 12, 1, 0x5c2b27);
  }, 0, 0.03);

  // hips, knees, ankles: the shin carries a cap of thigh, the foot a cap of shin
  const cloth = (y: number) =>
    (gown || dress) && y >= 4 ? (dress && y === 4 ? shade(look.top, 0.85) : look.top) : bare && y <= 4 ? look.skin : y === 6 ? shade(look.bottom, 0.82) : look.bottom;
  const leg = (x0: number) => {
    const hip = fig.bone([x0 + 1, 7, 0]);
    const knee = fig.bone([x0 + 1, 4, 0], hip);
    const ankle = fig.bone([x0 + 1, 2, 0], knee);
    fig.add(hip, seed, (v) => v.box(x0, 4, -1, x0 + 1, 6, 0, (x, y) => cloth(y)));
    fig.add(knee, seed, (v) => v.box(x0, 2, -1, x0 + 1, 3, 0, (x, y) => cloth(y)));
    fig.add(knee, seed, (v) => v.box(x0, 4, -1, x0 + 1, 4, 0, (x, y) => cloth(y)), 0.05);
    fig.add(ankle, seed, (v) =>
      v.box(x0, 0, -1, x0 + 1, 1, 1, (x, y, z) => (y === 0 ? shade(look.shoes, 0.85) : look.accent && z === 1 && x === x0 + (x0 < 0 ? 0 : 1) ? look.accent : look.shoes)),
    );
    fig.add(ankle, seed, (v) => v.box(x0, 2, -1, x0 + 1, 2, 0, (x, y) => cloth(y)), 0.05);
    return [hip, knee, ankle] as const;
  };
  const [legL, shinL, footL] = leg(-2);
  const [legR, shinR, footR] = leg(0);

  fig.mesh();
  // shut until there's something to say (after binding: a bone can't be bound at zero)
  mouth.scale.set(1, 0, 1);

  let cap: Group | null = null;
  if (look.hat === "grad") {
    cap = piece((v) => {
      const c = look.hatColor ?? 0x1f3f8a;
      v.box(-3, 17, -2, 2, 18, 1, c);
      v.box(-3, 19, -3, 2, 19, 2, shade(c, 1.12));
      v.set(-1, 20, -1, 0xf2c46b);
      v.box(2, 17, 0, 2, 18, 0, 0xf2c46b); // the tassel
    }, [0, 18, 0], seed + 4);
    cap.position.set(0, (18 - 12) * S, 0);
    head.add(cap);
  }

  const scale = (look.height ?? 178) / 178;
  root.scale.setScalar(scale);
  return { root, body, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, footL, footR, eyes, mouth, cap, scale };
}

export type Pose =
  | "stand"
  | "sit"
  | "cheer"
  | "wave"
  | "talk"
  | "swoon"
  | "ride"
  | "carry"
  | "throw"
  | "fly"
  | "hip"
  | "cross"
  | "sick"
  | "type"
  | "think"
  | "phone";

const HIP = 7 * S;

/** Moves a rig: `phase` advances with distance, `move` is 0 standing to 1 walking.
 * Given a Motion (motion.ts), it walks and runs on planted feet, breathes,
 * blinks, looks about and talks with its hands, and `phase` and `move` are
 * read off the way the root moves instead; without one, it's the plain swing
 * from before, for anything that drives a figure directly. */
export function animate(rig: Rig, phase: number, move: number, time: number, pose: Pose = "stand", offset = 0, motion?: Motion) {
  if (motion) {
    motion.apply(rig, time, pose, offset);
    return;
  }
  const swing = Math.sin(phase) * move;
  const t = time + offset;
  rig.head.rotation.z = 0;
  rig.head.rotation.y = 0;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, HIP, 0);
  rig.legL.position.set(-S, HIP, 0);
  rig.legR.position.set(S, HIP, 0);
  rig.legL.rotation.z = 0;
  rig.legR.rotation.z = 0;
  // knees that give a little behind, elbows that bend on the move, feet along for the ride
  rig.shinL.rotation.set(Math.max(0, swing) * 0.9, 0, 0);
  rig.shinR.rotation.set(Math.max(0, -swing) * 0.9, 0, 0);
  rig.footL.rotation.set(0, 0, 0);
  rig.footR.rotation.set(0, 0, 0);
  rig.foreL.rotation.set(-0.35 * move, 0, 0);
  rig.foreR.rotation.set(-0.35 * move, 0, 0);
  rig.eyes.scale.set(1, 1, 1);
  rig.mouth.scale.set(1, 0, 1);
  if (pose === "sit" || pose === "type") {
    rig.legL.rotation.x = -Math.PI / 2;
    rig.legR.rotation.x = -Math.PI / 2;
    rig.shinL.rotation.x = Math.PI / 2;
    rig.shinR.rotation.x = Math.PI / 2;
    rig.armL.rotation.x = -0.5;
    rig.armR.rotation.x = -0.5;
    rig.armL.rotation.z = -0.05;
    rig.armR.rotation.z = 0.05;
    rig.body.position.y = HIP + Math.sin(t * 1.6) * 0.005;
    rig.head.rotation.x = Math.sin(t * 0.9) * 0.04;
    if (pose === "type") {
      // both hands on the keys, one a little ahead of the other
      rig.armL.rotation.x = -1.15 + Math.max(0, Math.sin(t * 13)) * 0.12;
      rig.armR.rotation.x = -1.15 + Math.max(0, Math.sin(t * 13 + 2.1)) * 0.12;
      rig.armL.rotation.z = 0.12;
      rig.armR.rotation.z = -0.12;
      rig.head.rotation.x = 0.16 + Math.sin(t * 0.9) * 0.03;
    }
    return;
  }
  if (pose === "ride") {
    // on somebody's shoulders: legs over the front, one fist up
    rig.legL.rotation.x = -1.3;
    rig.legR.rotation.x = -1.3;
    rig.legL.rotation.z = -0.22;
    rig.legR.rotation.z = 0.22;
    rig.shinL.rotation.x = 1.1;
    rig.shinR.rotation.x = 1.1;
    rig.armL.rotation.x = Math.PI * 0.9;
    rig.armL.rotation.z = -0.2 - Math.abs(Math.sin(t * 6)) * 0.2;
    rig.armR.rotation.x = -0.9;
    rig.armR.rotation.z = 0.1;
    rig.body.position.y = HIP + Math.abs(Math.sin(t * 6)) * 0.03;
    rig.head.rotation.x = -0.08;
    return;
  }
  if (pose === "fly") {
    // arms out ahead, legs together: the body is pitched by whoever's throwing
    rig.armL.rotation.x = Math.PI - 0.08;
    rig.armR.rotation.x = Math.PI - 0.08 + Math.sin(t * 20) * 0.05;
    rig.armL.rotation.z = 0.1;
    rig.armR.rotation.z = -0.1;
    rig.legL.rotation.x = 0.12 + Math.sin(t * 16) * 0.08;
    rig.legR.rotation.x = 0.12 - Math.sin(t * 16) * 0.08;
    rig.shinL.rotation.x = 0;
    rig.shinR.rotation.x = 0;
    rig.head.rotation.x = -0.7;
    return;
  }
  rig.legL.rotation.x = swing * 0.62;
  rig.legR.rotation.x = -swing * 0.62;
  if (pose === "cheer") {
    const pump = Math.abs(Math.sin(t * 7));
    rig.armL.rotation.x = Math.PI * 0.92;
    rig.armR.rotation.x = Math.PI * 0.92;
    rig.armL.rotation.z = -0.25 - pump * 0.15;
    rig.armR.rotation.z = 0.25 + pump * 0.15;
    rig.body.position.y = HIP + pump * 0.12;
  } else if (pose === "carry" || pose === "throw") {
    // hands up on the shins of whoever's up there; or the release, forward
    const k = pose === "throw" ? 1 : 0;
    rig.armL.rotation.x = -2.55 + k * 1.35;
    rig.armR.rotation.x = -2.55 + k * 1.35;
    rig.armL.rotation.z = 0.22 - k * 0.2;
    rig.armR.rotation.z = -0.22 + k * 0.2;
    rig.body.position.y = HIP + Math.abs(Math.sin(phase)) * 0.05 * move;
  } else if (pose === "swoon") {
    // hands to her cheeks, swaying
    const sway = Math.sin(t * 5);
    rig.armL.rotation.x = -2.6;
    rig.armR.rotation.x = -2.6;
    rig.armL.rotation.z = 0.42;
    rig.armR.rotation.z = -0.42;
    rig.head.rotation.z = sway * 0.12;
    rig.body.rotation.z = sway * 0.03;
    rig.body.position.y = HIP + Math.abs(Math.sin(t * 8)) * 0.05;
  } else if (pose === "hip") {
    // a hand on the hip, the weight on one leg
    rig.armL.rotation.x = 0.15;
    rig.armL.rotation.z = -0.55;
    rig.armR.rotation.x = Math.sin(t * 1.4) * 0.05;
    rig.armR.rotation.z = 0.08;
    rig.body.rotation.z = 0.035;
    rig.head.rotation.z = -0.06 + Math.sin(t * 0.8) * 0.03;
    rig.body.position.y = HIP + Math.sin(t * 2.2) * 0.006;
  } else if (pose === "cross") {
    rig.armL.rotation.x = -1.25;
    rig.armR.rotation.x = -1.35;
    rig.armL.rotation.z = 0.78;
    rig.armR.rotation.z = -0.78;
    rig.body.position.y = HIP + Math.sin(t * 2.2) * 0.006;
  } else if (pose === "sick") {
    // a hand on the forehead, slow, everything heavy
    rig.armR.rotation.x = -2.75;
    rig.armR.rotation.z = -0.38;
    rig.armL.rotation.x = -swing * 0.3 - 0.1;
    rig.armL.rotation.z = -0.05;
    rig.head.rotation.z = Math.sin(t * 0.7) * 0.06;
    rig.body.rotation.z = Math.sin(t * 0.7 + 1) * 0.02;
    rig.body.position.y = HIP + Math.abs(Math.sin(phase)) * 0.03 * move - 0.02;
  } else if (pose === "think") {
    rig.armR.rotation.x = -2.25;
    rig.armR.rotation.z = -0.48;
    rig.armL.rotation.x = -1.05;
    rig.armL.rotation.z = 0.5;
    rig.head.rotation.z = 0.08;
    rig.body.position.y = HIP + Math.sin(t * 2.2) * 0.006;
  } else if (pose === "phone") {
    rig.armR.rotation.x = -1.95;
    rig.armR.rotation.z = -0.32;
    rig.armL.rotation.x = -swing * 0.5;
    rig.armL.rotation.z = -0.05;
    rig.body.position.y = HIP + Math.abs(Math.sin(phase)) * 0.05 * move;
  } else if (pose === "wave") {
    rig.armL.rotation.x = -swing * 0.5;
    rig.armR.rotation.x = Math.PI * 0.85;
    rig.armR.rotation.z = 0.3 + Math.sin(t * 9) * 0.3;
    rig.armL.rotation.z = -0.05;
    rig.body.position.y = HIP + Math.sin(t * 2.2) * 0.006;
  } else {
    rig.armL.rotation.x = -swing * 0.5 + (pose === "talk" ? Math.sin(t * 5) * 0.12 - 0.15 : 0);
    rig.armR.rotation.x = swing * 0.5 + (pose === "talk" ? Math.sin(t * 4 + 1) * 0.1 : 0);
    rig.armL.rotation.z = -0.05;
    rig.armR.rotation.z = 0.05;
    rig.body.position.y = HIP + Math.abs(Math.sin(phase)) * 0.05 * move + Math.sin(t * 2.2) * 0.006 * (1 - move);
  }
  if (pose === "sick" || pose === "phone") rig.head.rotation.x = 0.22 + Math.sin(t * 0.7) * 0.03;
  else if (pose === "swoon") rig.head.rotation.x = -0.12;
  else rig.head.rotation.x = (pose === "talk" ? Math.sin(t * 6) * 0.05 : Math.sin(t * 1.1) * 0.03) * (1 - move);
}

export type Dog = {
  root: Group;
  body: Object3D;
  tail: Object3D;
  head: Object3D;
  /** Front left, front right, hind left, hind right: the leg, and the paw under it (it stays flat). */
  legs: Object3D[];
  paws: Object3D[];
  ears: Object3D[];
  eyes: Object3D;
  tongue: Object3D;
};

/** Phoebe: white, soft-eared, happiest in a tortilla. */
export function dog(): Dog {
  const root = new Group();
  const fig = new Figure(root);
  const fur = (x: number, y: number, z: number) => (hash3(x, y, z) > 0.8 ? 0xe9ddc7 : 0xf3ead9);
  const body = fig.bone([0, 4.5, 0]);
  fig.add(body, 1, (v) => {
    v.box(-2, 3, -4, 1, 6, 3, fur);
    v.box(-2, 2, -3, 1, 2, 2, 0xe6dccb);
  });
  // four legs, each its own (a trot moves them in diagonal pairs), each with a
  // paw that stays flat on the floor while the leg above it swings
  const legs: Bone[] = [], paws: Bone[] = [];
  for (const [x, z] of [
    [-2, 2],
    [1, 2],
    [-2, -4],
    [1, -4],
  ] as const) {
    const leg = fig.bone([x + 0.5, 3, z + 1]);
    fig.add(leg, 1, (v) => v.box(x, 1, z, x, 2, z + 1, 0xf3ede3), 0.06);
    const paw = fig.bone([x + 0.5, 1, z + 1], leg);
    fig.add(paw, 1, (v) => v.box(x, 0, z, x, 0, z + 1, 0xe2d6c2));
    fig.add(paw, 1, (v) => v.box(x, 1, z, x, 1, z + 1, 0xf3ede3), 0.14);
    legs.push(leg);
    paws.push(paw);
  }
  const head = fig.bone([0, 6, 4], body);
  head.rotation.order = "YXZ";
  fig.add(head, 1, (v) => {
    v.box(-2, 5, 4, 1, 8, 7, fur);
    v.box(-1, 5, 8, 0, 6, 9, 0xf3ede3);
    v.set(-1, 6, 10, 0x3a2a2a);
    v.set(0, 6, 10, 0x3a2a2a);
    // her collar
    v.box(-2, 4, 4, 1, 5, 4, 0x2f6be8);
    v.set(-1, 4, 5, 0xf2c46b);
  });
  const eyes = fig.bone([0, 7.5, 8.5], head);
  fig.add(eyes, 1, (v) => {
    v.set(-2, 7, 8, 0x1d1a19);
    v.set(1, 7, 8, 0x1d1a19);
  });
  const tongue = fig.bone([-0.5, 5, 9], head);
  fig.add(tongue, 1, (v) => v.set(-1, 4, 9, 0xe88a9a));
  // ears, folded soft
  const ears = [-3, 2].map((x) => {
    const ear = fig.bone([x + 0.5, 9, 6], head);
    fig.add(ear, 1, (v) => v.box(x, 6, 5, x, 8, 6, 0xe2c49b));
    return ear;
  });
  const tail = fig.bone([0, 5.5, -4.5], body);
  fig.add(tail, 1, (v) => {
    v.box(-1, 5, -6, 0, 6, -5, fur);
    v.box(-1, 6, -7, 0, 7, -7, fur);
  });
  fig.mesh();
  return { root, body, tail, head, legs, paws, ears, eyes, tongue };
}

/** Wags and bobs; given a DogMotion (motion.ts), trots, gallops, sits, sniffs and looks up. */
export function animateDog(rig: Dog, time: number, move: number, excited: number, motion?: DogMotion) {
  if (motion) {
    motion.apply(rig, time);
    return;
  }
  const bob = Math.abs(Math.sin(time * 9)) * 0.04 * move;
  rig.tail.rotation.y = Math.sin(time * (8 + excited * 10)) * (0.35 + excited * 0.35);
  rig.body.position.y = 4.5 * S + bob;
  rig.legs.forEach((leg, i) => leg.position.y = 3 * S + bob * (i < 2 ? 1 : 0.6));
  rig.head.rotation.x = Math.sin(time * 1.3) * 0.05 - excited * 0.08;
  rig.head.rotation.z = Math.sin(time * 0.7) * 0.06 * (1 - move);
}
