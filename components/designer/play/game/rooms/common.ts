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
  dispose: () => void;
};

export const indoorFloor = worldMaterial({ key: "game-floor", flag: FLAG.ground, cloud: false });
export const outdoorFloor = worldMaterial({ key: "game-floor-out", flag: FLAG.ground });
export const outdoorSolid = worldMaterial({ key: "game-solid-out", flag: FLAG.solid });
export const softSolid = worldMaterial({ key: "game-soft", flag: FLAG.soft, cloud: false });

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
  $: ["011", "110", "010", "011", "110"],
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
