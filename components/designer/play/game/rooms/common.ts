import { Color, Mesh, Vector3, type Group, type Material, type Object3D } from "three";
import { FLAG, worldMaterial } from "../../../scene/shared";
import { Voxels } from "../../../scene/voxels";
import { S, solid } from "../people";

// What every place in the game is made of: the shape the stage expects a
// room to have, the materials, and small helpers for building them out of
// 0.1 m voxels, including a little pixel font for signs.

export type Collider = { x0: number; z0: number; x1: number; z1: number };
export type Spot = { id: string; label: string; at: Vector3; reach: number };

export type Room = {
  group: Group;
  colliders: Collider[];
  spots: Spot[];
  background: { top: Color; bottom: Color };
  /** World units to fit across a wide screen, and a tall one. */
  span: { wide: number; tall: number };
  /** Where the camera rests, and how far it leans after Aiden (0 to 1). */
  centre: Vector3;
  follow: number;
  /** Where anyone can walk. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  spawn: Vector3;
  heading: number;
  /** The island's night (0 to 1) and how much cloud shadow drifts over. */
  night: number;
  clouds: number;
  /** The floor's height here, where it isn't 0 (a stage). */
  floorAt?: (x: number, z: number) => number;
  update?: (time: number, dt: number) => void;
  /** The time on the HUD's clock, in minutes since midnight, for a room with a clock on the wall. */
  setTime?: (minutes: number) => void;
  dispose: () => void;
};

export const indoorFloor = worldMaterial({ key: "game-floor", flag: FLAG.ground, cloud: false });
export const outdoorFloor = worldMaterial({ key: "game-floor-out", flag: FLAG.ground });
export const outdoorSolid = worldMaterial({ key: "game-solid-out", flag: FLAG.solid });
export const softSolid = worldMaterial({ key: "game-soft", flag: FLAG.soft, cloud: false });

/** 1 normally, 0 for someone who asked for less motion: what sways and drifts is multiplied by it. */
export const motion = { value: 1 };
let query: MediaQueryList | null = null;
/** Whether someone asked for less motion, read as it is now; keeps `motion` in step with it. */
export function calm() {
  if (!query && typeof window !== "undefined" && window.matchMedia) query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = Boolean(query?.matches);
  motion.value = reduce ? 0 : 1;
  return reduce;
}

// Light that comes from the thing itself. The island's glow is made for
// night-time lamps and runs hot after dark, which turns a screen into a
// blob; these stay what they are by day and by night.
/** A screen, a sign, a lit window: its own colour, a little under full. */
export const screenGlow = worldMaterial({
  key: "game-screen",
  flag: FLAG.solid,
  cloud: false,
  fragment: "reflectedLight.directDiffuse *= 0.12; reflectedLight.indirectDiffuse *= 0.12; totalEmissiveRadiance = diffuseColor.rgb * 0.92;",
});
/** What's out of a window: unlit, exactly the colours it's painted. */
export const viewGlow = worldMaterial({
  key: "game-view",
  flag: FLAG.ground,
  cloud: false,
  fragment: "reflectedLight.directDiffuse = vec3(0.0); reflectedLight.indirectDiffuse = vec3(0.0); totalEmissiveRadiance = diffuseColor.rgb;",
});
/** A bulb, a moon: bright enough that at night it bleeds into the pixels around it. */
export const bulbGlow = worldMaterial({
  key: "game-bulb",
  flag: FLAG.soft,
  cloud: false,
  fragment: "totalEmissiveRadiance = diffuseColor.rgb * 2.4;",
});
/** A lampshade: cloth by day, lit through from inside after dark. */
export const shadeGlow = worldMaterial({
  key: "game-shade",
  flag: FLAG.solid,
  cloud: false,
  fragment: "totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.9;",
});
/** Fairy lights: each bulb warms and dims slowly, on its own beat. */
export const twinkleGlow = worldMaterial({
  key: "game-twinkle",
  flag: FLAG.soft,
  cloud: false,
  fragment:
    "float beat = sin(uTime * (0.6 + hash12(floor(vWorld.xz * 10.0)) * 0.7) + hash12(floor(vWorld.zy * 10.0)) * 6.28); totalEmissiveRadiance = diffuseColor.rgb * (0.8 + 0.22 * beat) * (0.55 + 0.45 * uNight);",
});
/** A power light: on for a moment every couple of seconds, each on its own beat. */
export const blinkGlow = worldMaterial({
  key: "game-blink",
  flag: FLAG.soft,
  cloud: false,
  fragment:
    "float beat = fract(uTime * 0.45 + hash12(floor(vWorld.xz * 10.0) + floor(vWorld.y * 10.0)) * 9.0); totalEmissiveRadiance = diffuseColor.rgb * mix(0.35, 2.4, step(0.62, beat));",
});

const screens = new Map<string, ReturnType<typeof worldMaterial>>();
/** A screen with text on it that scrolls up a line at a time: lines of words
 * a pixel high in `ink` over the screen's own colour. `axis` is the way the
 * screen faces (a screen facing +x reads along −z). */
export function textScreen(axis: "x" | "z", ink: number, rate = 1.6) {
  const key = `${axis}-${ink}-${rate}`;
  const existing = screens.get(key);
  if (existing) return existing;
  const c = new Color(ink);
  const material = worldMaterial({
    key: `game-text-${axis}`,
    flag: FLAG.solid,
    cloud: false,
    extraUniforms: { uInk: { value: c }, uRate: { value: rate } },
    fragmentHead: "uniform vec3 uInk; uniform float uRate;",
    fragment: /* glsl */ `
{
  vec2 q = vec2(${axis === "x" ? "-vWorld.z" : "vWorld.x"}, vWorld.y);
  float r = q.y / 0.064;
  float line = floor(uTime * uRate) - floor(r);
  float word = floor(q.x / 0.046 + hash12(vec2(line, 3.0)) * 4.0);
  float on = step(0.5, fract(r)) * step(0.34, hash12(vec2(word, line))) * step(0.18, hash12(vec2(line, 11.0)));
  vec3 face = mix(diffuseColor.rgb, uInk, on);
  reflectedLight.directDiffuse *= 0.12;
  reflectedLight.indirectDiffuse *= 0.12;
  totalEmissiveRadiance = face * 0.92;
}`,
  });
  screens.set(key, material);
  return material;
}

const hangs = new Map<string, ReturnType<typeof worldMaterial>>();
/** Cloth that hangs from a line and breathes in the room's air: the further
 * below its top, the more it moves, along `axis` (the way the wall it hangs on
 * faces). Its mesh's origin has to be on the line it hangs from (see `hanging`). */
export function hangSway(axis: "x" | "z", amount = 0.02, solidFlag = true) {
  const key = `${axis}-${amount}-${solidFlag}`;
  const existing = hangs.get(key);
  if (existing) return existing;
  const material = worldMaterial({
    key: `game-hang-${axis}`,
    flag: solidFlag ? FLAG.solid : FLAG.soft,
    cloud: false,
    extraUniforms: { uMotion: motion, uAmount: { value: amount } },
    vertexHead: "uniform float uMotion; uniform float uAmount;",
    vertex: /* glsl */ `
{
  float hang = max(0.0, -transformed.y);
  float along = transformed.x + transformed.z;
  float breathe = sin(uTime * 0.85 + along * 3.1 + swayOrigin.x * 1.7 + swayOrigin.z) * 0.6 + sin(uTime * 0.33 + along * 1.3) * 0.4;
  // out from the wall it hangs on and back, never into it
  transformed.${axis} += hang * uAmount * (0.5 + 0.5 * breathe) * uMotion;
}`,
  });
  hangs.set(key, material);
  return material;
}

/** A mesh for something that hangs (see `hangSway`): `top` is the voxel row it hangs from. */
export function hanging(v: Voxels, material: Material, top: number, origin: [number, number]) {
  const m = meshOf(v, material, { origin: [origin[0], top + 1, origin[1]] });
  m.position.y = (top + 1) * S;
  return m;
}

/** The floor slab only shows its thickness along the two near edges, so only they need it. */
export const nearEdge = (i: number, k: number, iMax: number, kMax: number) => i >= iMax || k >= kMax;

/** A voxel model as a mesh, `origin` voxels shifted to the world origin. */
export function meshOf(v: Voxels, material: Material = solid, { shadow = true, origin = [0, 0, 0] as [number, number, number], seed = 5 } = {}) {
  const geometry = v.geometry(seed);
  geometry.translate(-origin[0] * S, -origin[1] * S, -origin[2] * S);
  const m = new Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function disposeAll(object: Object3D) {
  object.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.geometry.dispose();
    // a light's shadow map is a render target of its own, 2048² for a sun
    const light = o as Object3D & { isLight?: boolean; shadow?: { map?: { dispose: () => void } | null }; dispose?: () => void };
    if (light.isLight) {
      light.shadow?.map?.dispose();
      light.dispose?.();
    }
  });
}

export const colour = (hex: number) => new Color(hex);

// —— a pixel font for signs: 5 tall, mostly 3 wide

const GLYPHS: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["1001", "1101", "1011", "1001", "1001"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "110", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["10001", "10001", "10101", "11011", "10001"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "110"],
  $: ["01111", "10100", "01110", "00101", "11110"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  "&": ["010", "101", "010", "101", "011"],
  "·": ["0", "0", "1", "0", "0"],
  ".": ["0", "0", "0", "0", "1"],
  "'": ["1", "1", "0", "0", "0"],
  ":": ["0", "1", "0", "1", "0"],
  "!": ["1", "1", "1", "0", "1"],
  "#": ["101", "111", "101", "111", "101"],
  "<": ["001", "010", "100", "010", "001"],
  ">": ["100", "010", "001", "010", "100"],
  "/": ["001", "001", "010", "100", "100"],
  " ": ["00", "00", "00", "00", "00"],
};

/** How many voxels wide a string sets at a scale. */
export function textWidth(text: string, scale = 1) {
  let w = 0;
  for (const ch of text.toUpperCase()) w += ((GLYPHS[ch] ?? GLYPHS[" "])[0].length + 1) * scale;
  return Math.max(0, w - scale);
}

/** Sets `text` into `v`, its top-left at (x, y, z), running along `axis`
 * (pick the one that reads left to right from the camera). */
export function letters(
  v: Voxels,
  text: string,
  x: number,
  y: number,
  z: number,
  color: number,
  { axis = "x" as "x" | "-x" | "z" | "-z", scale = 1, depth = 1, centre = false } = {},
) {
  let cursor = centre ? -textWidth(text, scale) / 2 : 0;
  const dir = axis === "x" || axis === "z" ? 1 : -1;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "];
    glyph.forEach((row, r) => {
      [...row].forEach((bit, c) => {
        if (bit !== "1") return;
        for (let sx = 0; sx < scale; sx += 1)
          for (let sy = 0; sy < scale; sy += 1)
            for (let d = 0; d < depth; d += 1) {
              const along = Math.round(cursor + c * scale + sx) * dir;
              const vy = y - r * scale - sy;
              if (axis === "x" || axis === "-x") v.set(x + along, vy, z + d, color);
              else v.set(x + d, vy, z + along, color);
            }
      });
    });
    cursor += (glyph[0].length + 1) * scale;
  }
}

/** World point from grid voxel coordinates, for a room built around `origin`. */
export function grid(origin: [number, number]) {
  return (i: number, j: number, k: number) => new Vector3((i - origin[0]) * S, j * S, (k - origin[1]) * S);
}

/** A collider from grid voxel bounds (inclusive), for a room built around `origin`. */
export function blocker(origin: [number, number]) {
  return (i0: number, k0: number, i1: number, k1: number): Collider => ({
    x0: (i0 - origin[0]) * S,
    z0: (k0 - origin[1]) * S,
    x1: (i1 + 1 - origin[0]) * S,
    z1: (k1 + 1 - origin[1]) * S,
  });
}
