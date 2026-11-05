import { BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, Scene, Vector3 } from "three";
import { materials } from "../../scene/kit";
import { hash3, mix, Voxels } from "../../scene/voxels";
import type { Sound } from "../sound";
import { animate, LOOKS, person, S, solid, type Look, type Pose, type Rig } from "./people";
import { letters, outdoorFloor, outdoorSolid, textWidth } from "./rooms/common";

// Wingman: the summer after graduation, played as a launcher. Aiden runs
// with John on his shoulders and throws him down the coast. John bounces off
// every baddie he lands on (and rizzes her up), off the sand when he misses,
// and as far as the bounces carry him. The further he gets, the badder they
// get: the beach, the pier, the marina, the yacht club. Three throws; every
// heart won makes the next throw stronger.
//
// The course runs along local +x, turned so +x is screen-right in the game's
// fixed camera. Ground is 0.2 m voxels, everything else the game's 0.1 m.

const TILE = 24;
const G = 16;
const ROUNDS = 3;
// each throw starts further down the coast: the beach, the pier, the marina
const STARTS = [-3, 69, 165];
const CENTER = 0.95; // a middle, above the feet, at the drawn height
const HEAD = 2.3; // where a landing on a head bounces from
const MAX_VX = 34;
// the physics runs in fixed steps, so a throw goes the same way at any frame rate
const STEP = 1 / 240;
// the throw meter sweeps faster each throw
const SWEEP = [1.15, 1.32, 1.5];
// a landing's spring: starts squashed, wobbles back
const spring = (t: number) => (t < 0 || t > 0.45 ? 0 : Math.exp(-t * 11) * Math.cos(t * 28));

type Zone = {
  from: number;
  name: string;
  rating: string;
  bounce: number;
  boost: number;
  sky: [number, number];
  night: number;
  sun: number;
  sunColor: number;
  hemi: [number, number];
};

export const ZONES: Zone[] = [
  { from: -999, name: "The Beach", rating: "6/10", bounce: 9.4, boost: 0.5, sky: [0x8cc4f2, 0xfde8c9], night: 0, sun: 3.3, sunColor: 0xfff0d6, hemi: [0xe6eeff, 0xe6cfa0] },
  { from: 72, name: "The Pier", rating: "8/10", bounce: 10.4, boost: 0.9, sky: [0x8fa4ea, 0xffcda8], night: 0.12, sun: 2.9, sunColor: 0xffd7a2, hemi: [0xd8d6ff, 0xd9b48c] },
  { from: 168, name: "The Marina", rating: "9/10", bounce: 11.4, boost: 1.3, sky: [0x7a73cc, 0xffa98f], night: 0.3, sun: 2.3, sunColor: 0xffb386, hemi: [0xb9b0f0, 0xb98c80] },
  { from: 288, name: "The Yacht Club", rating: "10/10", bounce: 12.8, boost: 1.9, sky: [0x2f3079, 0xf08c88], night: 0.42, sun: 2.1, sunColor: 0xffb49a, hemi: [0xc4bdf0, 0x8a7480] },
];

const zoneAt = (x: number) => {
  let z = 0;
  for (let i = 0; i < ZONES.length; i += 1) if (x >= ZONES[i].from) z = i;
  return z;
};

export type WingmanResult = { best: number; rizzed: number; top: string };
type Phase = "title" | "aim" | "windup" | "flight" | "landed" | "results" | "done";
type Popup = { id: number; text: string; tone: "rizz" | "gold" | "nope" | "dm" | "oof" | "power"; at: Vector3; born: number };
type RoundResult = { distance: number; rizzed: number; top: string };

export type WingmanView = {
  phase: Phase;
  round: number;
  rounds: number;
  zone: number;
  dives: number;
  rizzed: number;
  total: number;
  combo: number;
  power: string;
  results: RoundResult[];
  wipe: number;
  /** Where this throw starts. */
  place: string;
  /** The longest run of baddies without touching the ground, this summer. */
  bestCombo: number;
};

// —— the coast, a tile at a time

type Built = { ground: BufferGeometry; props: BufferGeometry; glow: BufferGeometry | null; foam: BufferGeometry | null };

const SAND = [0xf1dcaa, 0xeed6a2, 0xf4e2b6, 0xebd19a];

function sea(g: Voxels, gi: number, gk: number, top: number, seed: number) {
  const z = gk * 0.2;
  const deep = Math.min(1, Math.max(0, (-z - 3.4) / 5));
  let c = mix(0x63bbe0, 0x2f78bb, deep);
  if (hash3(gi * 3 + seed, gk, 3) > 0.955) c = mix(c, 0xeaf6fb, 0.75);
  else if (hash3(gi, gk * 2 + seed, 5) > 0.9) c = mix(c, 0x8fd3f0, 0.35);
  g.set(gi, top, gk, c);
}

function umbrella(v: Voxels, i: number, k: number, a: number, b: number) {
  v.box(i, 0, k, i, 21, k, 0xe9e4da);
  for (let dx = -9; dx <= 9; dx += 1)
    for (let dz = -9; dz <= 9; dz += 1) {
      const r = Math.hypot(dx, dz);
      if (r > 9.2) continue;
      const sector = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8) % 2;
      v.set(i + dx, 23 - Math.round(r * 0.32), k + dz, sector ? a : b);
    }
  v.set(i, 24, k, 0xe9e4da);
}

function towel(v: Voxels, i: number, k: number, a: number, b: number) {
  v.box(i - 4, 0, k - 7, i + 4, 0, k + 7, (x, y, z) => (Math.floor((z - k + 7) / 3) % 2 ? a : b));
}

function palm(v: Voxels, i: number, k: number, h: number, lean: number) {
  for (let y = 0; y <= h; y += 1) {
    const t = y / h;
    const x = i + Math.round(lean * t * t * 6);
    v.box(x, y, k, x + 1, y, k + 1, y % 3 === 0 ? 0x8a6a4a : 0xa47d55);
  }
  const top = i + Math.round(lean * 6);
  for (let f = 0; f < 7; f += 1) {
    const a = (f / 7) * Math.PI * 2 + 0.3;
    for (let s = 0; s <= 12; s += 1) {
      const x = top + Math.round(Math.cos(a) * s), z = k + Math.round(Math.sin(a) * s * 0.8);
      const y = h + 2 - Math.round(s * s * 0.045);
      v.set(x, y, z, s % 4 === 0 ? 0x3f8a3a : 0x4fa045);
      if (s > 2 && s < 11) v.set(x, y - 1, z, 0x3f8a3a);
    }
  }
  v.box(top, h, k, top + 1, h + 1, k + 1, 0x6b4a32);
}

function lifeguard(v: Voxels, i: number, k: number) {
  for (const [dx, dz] of [[0, 0], [12, 0], [0, 10], [12, 10]]) v.box(i + dx, 0, k + dz, i + dx, 15, k + dz, 0xf6f4ee);
  v.box(i - 2, 16, k - 2, i + 14, 16, k + 12, 0xd9d4ca);
  v.box(i, 17, k, i + 12, 26, k + 10, (x, y, z) => (y > 21 && y < 25 && z === k + 10 && x > i + 1 && x < i + 11 ? 0x9cc0fa : y % 4 === 0 ? 0xd74718 : 0xf6f4ee));
  v.box(i - 2, 27, k - 2, i + 14, 27, k + 12, 0xd74718);
  v.box(i + 6, 28, k + 5, i + 6, 36, k + 5, 0x8a8f99);
  v.box(i + 7, 33, k + 5, i + 11, 36, k + 5, 0xd74718);
  // the ramp up
  for (let s = 0; s < 14; s += 1) v.box(i + 14 + s, 15 - s, k + 3, i + 14 + s, 15 - s, k + 7, 0xd9d4ca);
}

function surfboard(v: Voxels, i: number, k: number, c: number) {
  for (let y = 0; y <= 18; y += 1) {
    const w = y < 2 || y > 15 ? 0 : 1;
    v.box(i - w, y, k, i + w, y, k, y === 9 ? 0xf6f4ee : c);
  }
}

function castle(v: Voxels, i: number, k: number) {
  v.box(i, 0, k, i + 7, 2, k + 5, 0xe2c48e);
  for (const [dx, dz] of [[0, 0], [6, 0], [0, 4], [6, 4]]) v.box(i + dx, 3, k + dz, i + dx + 1, 5, k + dz + 1, 0xd9b77c);
  v.set(i + 3, 3, k + 2, 0xd9b77c);
  v.set(i + 3, 6, k + 2, 0xd74718);
}

function lampPost(v: Voxels, glow: Voxels, i: number, k: number, height = 34) {
  v.box(i, 0, k, i + 1, height, k + 1, 0x2a2f3d);
  v.box(i - 1, height + 1, k - 1, i + 2, height + 1, k + 2, 0x2a2f3d);
  glow.box(i - 1, height - 2, k - 1, i + 2, height, k + 2, 0xffd998);
}

function bulbs(glow: Voxels, x0: number, x1: number, k: number, y: number, sag: number, palette = [0xffd998, 0xff9fb8, 0x9cc0fa, 0xfff1d6]) {
  for (let x = x0; x <= x1; x += 1) {
    const t = (x - x0) / (x1 - x0);
    const yy = y - Math.round(Math.sin(t * Math.PI) * sag);
    if ((x - x0) % 4 === 0) glow.set(x, yy - 1, k, palette[((x - x0) / 4) % palette.length]);
    else glow.set(x, yy, k, 0x4a4238);
  }
}

function sailboat(v: Voxels, i: number, k: number, stripe: number, mast: number) {
  // the hull, tapering to a bow at +x
  for (let x = 0; x <= 52; x += 1) {
    const taper = x > 40 ? Math.round((x - 40) * 0.55) : 0;
    v.box(i + x, -4, k - 7 + taper, i + x, 3, k + 7 - taper, (vx, y) => (y === 3 ? 0xc9a27a : y === 0 ? stripe : 0xf6f4ee));
  }
  v.box(i + 14, 4, k - 4, i + 30, 8, k + 4, (x, y, z) => (y === 6 && (x % 4 === 0) && Math.abs(z - k) === 4 ? 0x2a2f3d : 0xf6f4ee));
  v.box(i + 22, 4, k, i + 22, 4 + mast, k, 0xd9d4ca);
  v.box(i + 22, 12, k, i + 46, 12, k, 0xbfc4cc);
  // the furled sail on the boom, and the pennant
  v.box(i + 23, 13, k, i + 44, 14, k, 0xf6f4ee);
  v.box(i + 23, 4 + mast - 2, k, i + 27, 4 + mast, k, stripe);
}

function yacht(v: Voxels, glow: Voxels, i: number, k: number) {
  for (let x = 0; x <= 200; x += 1) {
    const bow = x > 160 ? Math.round((x - 160) * 0.42) : 0;
    v.box(i + x, -6, k - 22 + bow, i + x, 22, k + 22 - bow, (vx, y) => (y === 22 ? 0xc9a27a : y === 4 || y === 5 ? 0x1f3f8a : y < 0 ? 0x1f3f8a : 0xf6f4ee));
  }
  // decks, stepping back
  v.box(i + 10, 23, k - 16, i + 150, 34, k + 16, 0xf6f4ee);
  v.box(i + 24, 35, k - 12, i + 128, 44, k + 12, 0xf6f4ee);
  v.box(i + 40, 45, k - 8, i + 104, 50, k + 8, 0xe9e4da);
  v.box(i + 70, 51, k - 2, i + 76, 62, k + 2, 0xd9d4ca);
  v.box(i + 64, 60, k - 6, i + 82, 61, k + 6, 0xd9d4ca);
  // lit windows down the side that faces you
  for (let x = 14; x < 146; x += 6) glow.box(i + x, 27, k + 17, i + x + 3, 31, k + 17, x % 18 === 2 ? 0xfff1d6 : 0xffd998);
  for (let x = 28; x < 124; x += 8) glow.box(i + x, 38, k + 13, i + x + 5, 42, k + 13, 0xffe2b0);
  for (let x = 0; x <= 200; x += 5) glow.set(i + x, 23, k + 22 - (x > 160 ? Math.round((x - 160) * 0.42) : 0), 0xfff4e0);
}

function railing(v: Voxels, x0: number, x1: number, k: number, color: number, height = 9) {
  for (let x = x0; x <= x1; x += 1) {
    v.set(x, height, k, color);
    if ((x - x0) % 10 === 0) v.box(x, 0, k, x, height, k, color);
  }
}

function buildTile(zone: number, variant: number): Built {
  const g = new Voxels(0.2, 0.03);
  const v = new Voxels(S, 0.035);
  const glow = new Voxels(S, 0);
  const foam = new Voxels(S, 0);
  const seed = zone * 31 + variant * 7;

  if (zone === 0) {
    // sand, wet sand, the sea
    for (let gi = 0; gi < 120; gi += 1)
      for (let gk = -40; gk < 52; gk += 1) {
        const z = gk * 0.2;
        if (z < -4.4) sea(g, gi, gk, -2, seed);
        else if (z < -3.6) g.set(gi, -1, gk, hash3(gi, gk, 1) > 0.8 ? 0xcdb07e : 0xd6bb88);
        else g.set(gi, -1, gk, SAND[Math.floor(hash3(gi + seed, gk, 2) * SAND.length)]);
        if (gk === 51) for (const j of [-2, -3]) g.set(gi, j, gk, 0xc9ab78);
      }
    for (let i = 0; i < 240; i += 1) foam.set(i, -1, -44 + Math.round(Math.sin(i * 0.21) * 1.5), 0xf6fbff);
    const umbrellas: Array<[number, number, number]> = [[0xd74718, 0xf6f4ee, 0], [0x2f6be8, 0xf2c46b, 1], [0x4f9a5c, 0xf6f4ee, 2], [0xe88a9a, 0xf6f4ee, 3]];
    if (variant === 0) {
      umbrella(v, 30, -24, umbrellas[0][0], umbrellas[0][1]);
      towel(v, 30, -12, 0xd74718, 0xf6f4ee);
      umbrella(v, 150, -26, umbrellas[1][0], umbrellas[1][1]);
      towel(v, 162, -14, 0x2f6be8, 0xf2c46b);
      palm(v, 95, -34, 34, 0.9);
      palm(v, 210, -32, 30, -0.7);
      surfboard(v, 70, -30, 0xf08a32);
      surfboard(v, 74, -30, 0x2fb5a6);
      castle(v, 118, 24);
      v.blob(190, 2, 22, 2, 2, 2, (x, y, z) => ((x + z) % 3 ? 0xf6f4ee : 0xd74718));
    } else {
      lifeguard(v, 40, -36);
      umbrella(v, 130, -22, umbrellas[2][0], umbrellas[2][1]);
      towel(v, 120, -10, 0x4f9a5c, 0xf6f4ee);
      umbrella(v, 205, -26, umbrellas[3][0], umbrellas[3][1]);
      palm(v, 170, -34, 32, 0.6);
      surfboard(v, 100, -30, 0x8a6cff);
      v.box(150, 0, 20, 158, 3, 26, (x, y) => (y === 3 ? 0x2f6be8 : 0xf6f4ee)); // a cooler
    }
  } else {
    // the water, then a deck over it: planks, stone, or white teak
    for (let gi = 0; gi < 120; gi += 1)
      for (let gk = -40; gk < 52; gk += 1) {
        const z = gk * 0.2;
        const deck = z >= -3.2 && z < 2.8;
        if (!deck) {
          sea(g, gi, gk, -3, seed);
          continue;
        }
        let c: number;
        if (zone === 1) c = gi % 6 === 0 ? 0x6b4a32 : Math.floor(gi / 6) % 2 ? 0xb07f50 : 0xa47447;
        else if (zone === 2) c = (gi + gk) % 2 ? 0xd9d4ca : 0xcfc9bd;
        else c = gk % 5 === 0 ? 0xc9a27a : 0xf3efe6;
        if (hash3(gi, gk, seed) > 0.93) c = mix(c, 0x000000, 0.06);
        g.set(gi, -1, gk, c);
        if (gk === 13) for (const j of [-2, -3]) g.set(gi, j, gk, zone === 3 ? 0xf2c46b : zone === 2 ? 0xa8a294 : 0x6b4a32);
      }
    if (zone === 1) {
      // pilings down into the water, a rail along the back, lights
      for (let i = 4; i < 240; i += 30) for (const k of [26, -34]) v.box(i, -8, k, i + 1, -1, k + 1, 0x5a3e2a);
      railing(v, 0, 239, -33, 0x6b4a32, 10);
      for (const i of [0, 120]) lampPost(v, glow, i + 2, -31);
      bulbs(glow, 3, 121, -31, 33, 7);
      bulbs(glow, 123, 239, -31, 33, 7);
      if (variant === 0) {
        // a boba stand
        v.box(150, 0, -26, 190, 14, -14, (x, y, z) => (y === 14 ? 0xf6f4ee : z === -14 && y > 6 ? 0x2a2f3d : y < 2 ? 0x8a5a3c : 0xf08a32));
        v.box(148, 15, -28, 192, 16, -12, (x) => (Math.floor(x / 4) % 2 ? 0xf6f4ee : 0xe88a9a));
        letters(v, "BOBA", 160, 22, -13, 0xf6f4ee, { axis: "x" });
        v.box(158, 18, -14, 182, 24, -14, 0x8a5a3c);
        v.box(60, 0, 18, 84, 4, 22, (x, y) => (y === 4 || y === 2 ? 0x8a5a3c : x % 8 === 0 ? 0x2a2f3d : null)); // a bench
      } else {
        v.box(40, 0, -26, 74, 12, -16, (x, y, z) => (y === 12 ? 0xd74718 : z === -16 && y > 5 ? 0x2a2f3d : 0xf6f4ee));
        v.box(38, 13, -28, 76, 14, -14, (x) => (Math.floor(x / 4) % 2 ? 0xf6f4ee : 0xd74718));
        letters(v, "CHURROS", 44, 20, -15, 0xf2c46b, { axis: "x" });
        v.box(42, 15, -15, 72, 21, -15, 0xd74718);
        v.box(170, 0, 18, 194, 4, 22, (x, y) => (y === 4 || y === 2 ? 0x8a5a3c : x % 8 === 0 ? 0x2a2f3d : null));
      }
    } else if (zone === 2) {
      for (let i = 10; i < 240; i += 40) {
        v.box(i, 0, -32, i + 2, 4, -30, 0x2a2f3d);
        v.box(i - 1, 5, -33, i + 3, 5, -29, 0x2a2f3d);
      }
      sailboat(v, variant ? 30 : 120, -64, variant ? 0x2f6be8 : 0xd74718, 58);
      sailboat(v, variant ? 160 : 10, -52, variant ? 0xf2c46b : 0x2fb5a6, 46);
      for (const i of [60, 180]) {
        v.box(i - 4, 0, 20, i + 4, 6, 26, 0xe9e4da);
        palm(v, i, 22, 18, variant ? 0.3 : -0.3);
      }
      for (const i of [2, 122]) lampPost(v, glow, i, -31, 30);
      bulbs(glow, 4, 120, -31, 29, 6, [0xffd998, 0xfff1d6]);
      bulbs(glow, 124, 239, -31, 29, 6, [0xffd998, 0xfff1d6]);
    } else {
      yacht(v, glow, variant ? 12 : 30, -66);
      railing(v, 0, 239, -33, 0xf2c46b, 9);
      // velvet rope at the front, gold posts
      for (let i = 8; i < 240; i += 24) v.box(i, 0, 25, i + 1, 9, 26, 0xf2c46b);
      for (let i = 8; i < 232; i += 24) for (let x = 0; x <= 23; x += 1) v.set(i + x, 7 - Math.round(Math.sin((x / 23) * Math.PI) * 2), 25, 0xa3262a);
      // champagne on a white table
      const t = variant ? 150 : 70;
      v.box(t, 0, -20, t + 14, 7, -12, (x, y, z) => (y === 7 || z === -12 ? 0xf6f4ee : null));
      for (let n = 0; n < 4; n += 1) v.box(t + 2 + n * 3, 8, -16, t + 2 + n * 3, 10, -16, 0xf2e2a8);
      v.box(t + 6, 8, -18, t + 8, 13, -18, 0x2f5a3a);
      for (const i of [24, 120, 216]) {
        v.box(i - 3, 0, -28, i + 3, 5, -24, 0xf6f4ee);
        v.blob(i, 11, -26, 4.5, 5, 4.5, 0x3f8a3a);
      }
      bulbs(glow, 0, 239, -33, 20, 4, [0xfff1d6, 0xffd998, 0xff9fb8]);
    }
  }
  return {
    ground: g.geometry(seed + 1),
    props: v.geometry(seed + 2),
    glow: glow.cells.size ? glow.geometry(seed + 3) : null,
    foam: foam.cells.size ? foam.geometry(seed + 4) : null,
  };
}

/** A billboard at the start of each zone: its name, and what's ahead. */
function gate(zone: Zone) {
  const v = new Voxels(S, 0.03);
  const glow = new Voxels(S, 0);
  const name = zone.name.toUpperCase();
  const w = Math.max(textWidth(name, 2), textWidth(zone.rating, 3)) + 12;
  const x0 = -Math.round(w / 2);
  const k = -36;
  // high on its posts, clear of the string lights
  v.box(x0 + 2, 0, k, x0 + 3, 62, k + 1, 0x2a2f3d);
  v.box(x0 + w - 3, 0, k, x0 + w - 2, 62, k + 1, 0x2a2f3d);
  v.box(x0, 28, k, x0 + w, 63, k, (x, y) => (y === 28 || y === 63 || x === x0 || x === x0 + w ? 0xf2c46b : 0x1b1d22));
  // the name over the rating: 10 rows at scale 2, a gap, 15 rows at scale 3
  letters(v, name, Math.round(-textWidth(name, 2) / 2), 60, k + 1, 0xfbf8f1, { axis: "x", scale: 2 });
  letters(glow, zone.rating, Math.round(-textWidth(zone.rating, 3) / 2), 46, k + 1, 0xff5f8f, { axis: "x", scale: 3 });
  const group = new Group();
  const m = new Mesh(v.geometry(9), outdoorSolid);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m, new Mesh(glow.geometry(10), materials.glow));
  return group;
}

/** A Ferris wheel out over the water, behind the pier. */
function ferrisWheel() {
  const v = new Voxels(S, 0.03);
  const glow = new Voxels(S, 0);
  const R = 52;
  for (let a = 0; a < 360; a += 1) {
    const r = (a * Math.PI) / 180;
    v.set(Math.round(Math.cos(r) * R), Math.round(Math.sin(r) * R), 0, 0xf6f4ee);
    if (a % 15 === 0) glow.set(Math.round(Math.cos(r) * (R + 1)), Math.round(Math.sin(r) * (R + 1)), 1, a % 30 ? 0xff9fb8 : 0xffd998);
  }
  for (let n = 0; n < 12; n += 1) {
    const r = (n / 12) * Math.PI * 2;
    for (let s = 0; s <= R; s += 2) v.set(Math.round(Math.cos(r) * s), Math.round(Math.sin(r) * s), 0, 0xe9e4da);
    const gx = Math.round(Math.cos(r) * R), gy = Math.round(Math.sin(r) * R);
    v.box(gx - 3, gy - 7, -2, gx + 3, gy - 2, 2, [0xd74718, 0x2f6be8, 0xf2c46b, 0x4f9a5c][n % 4]);
  }
  v.box(-3, -3, -1, 3, 3, 1, 0xd9d4ca);
  const wheel = new Group();
  wheel.add(new Mesh(v.geometry(21), outdoorSolid), new Mesh(glow.geometry(22), materials.glow));
  const legs = new Voxels(S, 0.03);
  legs.limb(0, 0, 0, -26, -62, 0, 1.4, 1.8, 0xd9d4ca);
  legs.limb(0, 0, 0, 26, -62, 0, 1.4, 1.8, 0xd9d4ca);
  const stand = new Mesh(legs.geometry(23), outdoorSolid);
  const group = new Group();
  group.add(wheel, stand);
  return { group, wheel };
}

/** The sun, low over the water, and a few clouds: kept in the sky as the camera moves. */
function skyThings() {
  const sun = new Voxels(0.2, 0);
  for (let x = -7; x <= 7; x += 1) for (let y = -7; y <= 7; y += 1) if (x * x + y * y <= 50) sun.set(x, y, 0, x * x + y * y > 34 ? 0xffd6a0 : 0xfff3dc);
  const sunMesh = new Mesh(sun.geometry(31), materials.glow);
  const clouds: Mesh[] = [];
  for (let n = 0; n < 4; n += 1) {
    const c = new Voxels(0.2, 0.02);
    for (let b = 0; b < 3; b += 1) c.blob(b * 3.4 - 3.4 + (n % 2), 1 + (b % 2) * 1.2, 0, 2.6 + (b % 2) * 0.8, 1.8, 1.6, (x, y) => (y < 0 ? 0xf6e9ef : 0xfffcf6));
    const m = new Mesh(c.geometry(40 + n), materials.solid);
    m.castShadow = false;
    clouds.push(m);
  }
  return { sunMesh, clouds };
}

// —— the people

function baddieLook(tier: number, seed: number): Look {
  const r = (salt: number) => hash3(seed, salt, tier + 11);
  return { ...baddieStyle(tier, seed, r), height: 158 + Math.round(r(13) * 18) };
}

function baddieStyle(tier: number, seed: number, r: (salt: number) => number): Look {
  const pick = <T,>(list: T[], salt: number) => list[Math.floor(r(salt) * list.length) % list.length];
  const skin = pick([0xf3cfae, 0xe9b98f, 0xd9a277, 0xb9805a, 0x8e5c3d, 0xf0c9a8], 1);
  const hairColor = pick([0x1d1a19, 0x2a2420, 0x4a3324, 0x6b4426, 0xc79a5b, 0x8e3b22], 2);
  if (tier === 0)
    return {
      skin,
      hair: pick(["pony", "bun", "long", "pony"], 3),
      hairColor,
      top: pick([0xf08a32, 0x8fd3b6, 0xe88a9a, 0xf2c46b, 0x9cc0fa, 0xf6f4ee], 4),
      style: pick(["tee", "tank"] as const, 5),
      bottom: pick([0x2b3f63, 0x6b5a45, 0x8a8f99, 0x4a6f9e], 6),
      shorts: true,
      shoes: 0xf4f2ee,
      hat: r(7) > 0.7 ? "cap" : undefined,
      hatColor: pick([0xd74718, 0x2f6be8, 0xf6f4ee], 8),
    };
  if (tier === 1)
    return {
      skin,
      hair: pick(["waves", "pony", "long"], 3),
      hairColor,
      top: pick([0xff8fb1, 0xf6f4ee, 0x1b1d22, 0x8fd3b6, 0xf2c46b], 4),
      style: "crop",
      bottom: pick([0x4a6f9e, 0xf6f4ee, 0x1b1d22, 0xe9dfcc], 6),
      shorts: true,
      shoes: 0xf4f2ee,
      shades: r(8) > 0.5,
    };
  if (tier === 2)
    return {
      skin,
      hair: pick(["waves", "long", "bun"], 3),
      hairColor,
      top: pick([0xf6f4ee, 0x9cc0fa, 0xffd23f, 0xe88a9a, 0x8fd3b6], 4),
      style: "dress",
      bottom: skin,
      shoes: 0xc9a27a,
      shades: r(8) > 0.4,
      hat: r(7) > 0.55 ? "sunhat" : undefined,
      hatColor: pick([0xf1dcaa, 0xf6f4ee], 9),
      bag: r(9) > 0.5 ? pick([0xd74718, 0x1b1d22, 0xc9a27a], 10) : undefined,
    };
  return {
    skin,
    hair: pick(["waves", "waves", "long"], 3),
    hairColor,
    top: pick([0xe23d5d, 0xf2c46b, 0xf6f4ee, 0xff8fb1, 0x2fb5a6], 4),
    style: "dress",
    bottom: skin,
    shoes: pick([0x1b1d22, 0xf2c46b, 0xe23d5d], 6),
    shades: r(8) > 0.35,
    earrings: true,
    bag: pick([0xf2c46b, 0x1b1d22, 0xf6f4ee], 10),
  };
}

const BOYFRIEND = (seed: number): Look => ({
  skin: [0xe9b98f, 0xb9805a, 0xd9a277][seed % 3],
  hair: "buzz",
  hairColor: 0x1d1a19,
  top: [0xd74718, 0x2a2f3d, 0x4f9a5c][seed % 3],
  style: "tank",
  bottom: 0x2a2f3d,
  shorts: true,
  shoes: 0x1b1d22,
  shades: true,
});

type Body = { holder: Group; rig: Rig; heart: Mesh; sparkle: Group | null; kind: string };
type Entity = {
  kind: "baddie" | "boyfriend" | "dm";
  x: number;
  y: number;
  z: number;
  tier: number;
  seed: number;
  hit: boolean;
  at: number;
  body: Body | null;
  phone: Group | null;
};

function heartGeometry(size: number) {
  const v = new Voxels(size, 0);
  v.sprite([".PP.PP.", "PPPPPPP", "PPPPPPP", ".PPPPP.", "..PPP..", "...P..."], { P: 0xff5f8f }, -3, 0, 0, "x", 2);
  return v.geometry(3);
}

function phoneGeometry() {
  const v = new Voxels(S, 0);
  v.box(-3, 0, 0, 3, 11, 1, (x, y) => (x > -3 && x < 3 && y > 1 && y < 10 ? 0x9cc0fa : 0x1b1d22));
  v.sprite([".P.P.", "PPPPP", ".PPP.", "..P.."], { P: 0xff5f8f }, -2, 4, 2, "x");
  return v.geometry(5);
}

// —— the game

export function createWingman({ sound, onDone }: { sound: () => Sound | null; onDone: (result: WingmanResult) => void }) {
  // with reduced motion the camera holds still: no shake, no punch in, no squash
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new Scene();
  const course = new Group();
  course.rotation.y = Math.PI / 4;
  scene.add(course);

  const tiles = ZONES.map((_, z) => [buildTile(z, 0), buildTile(z, 1)]);
  const live = new Map<number, { group: Group; foam: Mesh | null }>();
  const foams: Array<{ i: number; mesh: Mesh }> = [];
  let shownFirst = NaN;
  let shownLast = NaN;
  const ensureTiles = (camX: number) => {
    const first = Math.floor((camX - 28) / TILE), last = Math.floor((camX + 34) / TILE);
    // only when the camera has crossed into another tile
    if (first === shownFirst && last === shownLast) return;
    shownFirst = first;
    shownLast = last;
    for (const [i, t] of live)
      if (i < first - 1 || i > last + 1) {
        course.remove(t.group);
        live.delete(i);
        const f = foams.findIndex((x) => x.i === i);
        if (f >= 0) foams.splice(f, 1);
      }
    for (let i = first; i <= last; i += 1) {
      if (live.has(i)) continue;
      const built = tiles[zoneAt(i * TILE)][((i % 2) + 2) % 2];
      const group = new Group();
      group.position.x = i * TILE;
      const ground = new Mesh(built.ground, outdoorFloor);
      ground.receiveShadow = true;
      const props = new Mesh(built.props, outdoorSolid);
      props.castShadow = true;
      props.receiveShadow = true;
      group.add(ground, props);
      if (built.glow) group.add(new Mesh(built.glow, materials.glow));
      let foam: Mesh | null = null;
      if (built.foam) {
        foam = new Mesh(built.foam, materials.glow);
        group.add(foam);
        foams.push({ i, mesh: foam });
      }
      course.add(group);
      live.set(i, { group, foam });
    }
  };

  // signs at each zone, the wheel behind the pier, the sun and the clouds
  const gates = ZONES.slice(1).map((zone) => {
    const g = gate(zone);
    // between the lamp posts, a few metres in
    g.position.x = zone.from + 6;
    course.add(g);
    return g;
  });
  const wheel = ferrisWheel();
  wheel.group.position.set(120, 5.6, -5.4);
  course.add(wheel.group);
  const sky = skyThings();
  course.add(sky.sunMesh, ...sky.clouds);

  // light that follows the camera, warming as it goes
  const sun = new DirectionalLight(0xfff0d6, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new HemisphereLight(0xe6eeff, 0xe6cfa0, 1.6);
  scene.add(sun, sun.target, hemi);

  // Aiden, and John on his shoulders
  const aiden = person({ ...LOOKS.aiden, shorts: true }, 1);
  // both turned a little toward you, so you see faces and not just profiles
  const TURN = 0.5;
  const aidenHolder = new Group();
  aidenHolder.rotation.y = Math.PI / 2 - TURN;
  aidenHolder.add(aiden.root);
  course.add(aidenHolder);
  const john = person({ ...LOOKS.john, style: "tee", top: 0xf6f4ee, bottom: 0x4a6f9e, shorts: true, shades: true }, 2);
  const johnHolder = new Group();
  const johnYaw = new Group();
  const johnSpin = new Group();
  johnYaw.rotation.y = Math.PI / 2 - TURN;
  // John is 5'4", Aiden 6'5": the middle and the shoulders move with them
  const mid = CENTER * john.scale;
  const shoulders = 1.6 * aiden.scale + 0.25 * john.scale;
  john.root.position.y = -mid;
  johnSpin.add(john.root);
  johnYaw.add(johnSpin);
  johnHolder.add(johnYaw);
  course.add(johnHolder);

  // hearts and dust, pooled
  const heartBig = heartGeometry(0.06);
  const heartSmall = heartGeometry(0.035);
  const speck = (color: number) => {
    const v = new Voxels(0.12, 0);
    v.set(0, 0, 0, color);
    return v.geometry(2);
  };
  const dustSand = speck(0xf1dcaa);
  const dustStone = speck(0xd9d4ca);
  const phoneGeom = phoneGeometry();
  // hearts and dust: a fixed pool, reused, so a busy bounce allocates nothing
  type Particle = { mesh: Mesh; v: Vector3; life: number; max: number; spin: number; scale: number; gravity: number; on: boolean };
  const POOL = 120;
  const particles: Particle[] = [];
  let rolls = 0;
  // the same scatter every time, so nothing on screen depends on Math.random
  const roll = () => hash3((rolls += 1), 7, 13);
  const spawn = (geometry: BufferGeometry, material: Mesh["material"], x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, spin: number, scale: number, gravity: number) => {
    let p: Particle | undefined;
    for (let i = 0; i < particles.length; i += 1)
      if (!particles[i].on) {
        p = particles[i];
        break;
      }
    if (!p) {
      if (particles.length >= POOL) return;
      p = { mesh: new Mesh(geometry, material), v: new Vector3(), life: 0, max: 1, spin: 0, scale: 1, gravity: 0, on: false };
      particles.push(p);
      course.add(p.mesh);
    }
    p.on = true;
    p.mesh.visible = true;
    p.mesh.geometry = geometry;
    p.mesh.material = material;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(0, 0, 0);
    p.mesh.scale.setScalar(scale);
    p.v.set(vx, vy, vz);
    p.life = 0;
    p.max = max;
    p.spin = spin;
    p.scale = scale;
    p.gravity = gravity;
  };
  const burstHearts = (x: number, y: number, z: number, n: number) => {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + roll();
      spawn(heartBig, materials.glow, x, y, z, Math.cos(a) * 2.2, 2.5 + roll() * 2.5, Math.sin(a) * 1.2, 0.9 + roll() * 0.4, roll() * 6 - 3, 0.8 + roll() * 0.6, 2.5);
    }
  };
  const dust = (x: number, y: number, z: number, n: number, stone = false) => {
    for (let i = 0; i < n; i += 1) spawn(stone ? dustStone : dustSand, solid, x, y, z, (roll() - 0.6) * 3, 1 + roll() * 2.4, (roll() - 0.5) * 2, 0.5 + roll() * 0.3, 0, 0.6 + roll() * 0.8, 9);
  };
  /** A landing kicks up a ring of it, low and out. */
  const ring = (x: number, z: number, n: number, stone = false) => {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const v = 2.6 + roll() * 1.6;
      spawn(stone ? dustStone : dustSand, solid, x + Math.cos(a) * 0.2, 0.08, z + Math.sin(a) * 0.2, Math.cos(a) * v, 0.9 + roll() * 0.9, Math.sin(a) * v * 0.6, 0.42 + roll() * 0.25, 0, 0.7 + roll() * 0.7, 7);
    }
  };

  // the people John can land on, pooled by kind
  const pools = new Map<string, Body[]>();
  let made = 0;
  const keyOf = (kind: string, tier: number) => (kind === "bf" ? "bf" : `b${tier}`);
  const makeBody = (key: string, tier: number): Body => {
    made += 1;
    const kind = key;
    const look = kind === "bf" ? BOYFRIEND(made) : baddieLook(tier, made * 17 + tier);
    const rig = person(look, 40 + made);
    const holder = new Group();
    holder.add(rig.root);
    if (kind === "bf") rig.root.scale.setScalar(1.14);
    const heart = new Mesh(heartSmall, materials.glow);
    heart.position.y = 2.25;
    heart.visible = false;
    holder.add(heart);
    let sparkle: Group | null = null;
    if (tier === 3 && kind !== "bf") {
      const pool = new Voxels(0.1, 0);
      for (let x = -5; x <= 5; x += 1) for (let z = -5; z <= 5; z += 1) if (x * x + z * z <= 26 && (x * x + z * z > 12 || (x + z) % 2 === 0)) pool.set(x, 0, z, x * x + z * z > 18 ? 0xffd998 : 0xfff1d6);
      const light = new Mesh(pool.geometry(8), materials.glow);
      light.position.y = -0.09;
      holder.add(light);
      sparkle = new Group();
      const s = new Voxels(0.05, 0);
      s.set(0, 0, 0, 0xfff1d6);
      s.set(1, 0, 0, 0xffd998);
      const g = s.geometry(7);
      for (let n = 0; n < 4; n += 1) {
        const m = new Mesh(g, materials.glow);
        const a = (n / 4) * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.55, 1.2 + n * 0.22, Math.sin(a) * 0.55);
        sparkle.add(m);
      }
      holder.add(sparkle);
    }
    return { holder, rig, heart, sparkle, kind };
  };
  const take = (kind: string, tier: number) => {
    const key = keyOf(kind, tier);
    const list = pools.get(key) ?? [];
    pools.set(key, list);
    return list.pop() ?? makeBody(key, tier);
  };
  const give = (body: Body) => {
    course.remove(body.holder);
    body.holder.scale.set(1, 1, 1);
    const key = body.kind;
    const list = pools.get(key) ?? [];
    list.push(body);
    pools.set(key, list);
  };
  // warm the pools so the first throw never waits on a build
  for (let t = 0; t < 4; t += 1) for (let n = 0; n < (t === 0 ? 7 : 4); n += 1) give(makeBody(`b${t}`, t));
  for (let n = 0; n < 2; n += 1) give(makeBody("bf", 1));

  // —— state
  let phase: Phase = "title";
  let round = 0;
  let entities: Entity[] = [];
  const results: RoundResult[] = [];
  let total = 0;
  let rizzed = 0;
  let combo = 0;
  let dives = 3;
  let power = "";
  let meterT = 0;
  let meter = 0;
  let phaseAt = 0;
  let now = 0;
  let freeze = 0;
  let shake = 0;
  // the camera's punch in on an impact, and John's squash on a landing
  let kick = 0;
  let landedAt = -1;
  let acc = 0;
  let bounces = 0;
  let slides = 0;
  let wasGold = false;
  let bestCombo = 0;
  let wipe = 0;
  let wipeAt = -1;
  let topZone = 0;
  let zoneShown = 0;
  let popupId = 0;
  const popups: Popup[] = [];
  let origin = STARTS[0];
  const j = { x: origin, y: 1.8, vx: 0, vy: 0, spin: 0, sliding: false, angle: 0 };
  const a = { x: origin, run: 0, pose: "carry" as Pose, phase: 0 };
  const cam = { x: origin + 2, y: 1.8, span: 1, shake: new Vector3() };
  const listeners = new Set<() => void>();
  const liveView = { distance: 0, meter: 0, speed: 0, height: 0, rising: false, combo: 0, popups };
  let snapshot: WingmanView = view();

  function view(): WingmanView {
    return { phase, round, rounds: ROUNDS, zone: zoneShown, dives, rizzed, total, combo, power, results: [...results], wipe, place: ZONES[zoneAt(origin + 4)].name, bestCombo };
  }
  const emit = () => {
    snapshot = view();
    for (const fn of listeners) fn();
  };

  const popup = (text: string, tone: Popup["tone"], x: number, y: number, z: number) => {
    popupId += 1;
    popups.push({ id: popupId, text, tone, at: course.localToWorld(new Vector3(x, y, z)), born: now });
    if (popups.length > 8) popups.shift();
  };

  const layout = (r: number) => {
    for (const e of entities) {
      if (e.body) give(e.body);
      if (e.phone) course.remove(e.phone);
    }
    entities = [];
    let x = origin + 10;
    let n = 0;
    while (x < origin + 640) {
      const zone = zoneAt(x);
      const roll = hash3(r * 97 + n, 3, 5);
      if (zone >= 1 && roll < 0.1) entities.push({ kind: "boyfriend", x, y: 0, z: 0, tier: zone, seed: n, hit: false, at: 0, body: null, phone: null });
      else entities.push({ kind: "baddie", x, y: 0, z: (hash3(n, r, 9) - 0.5) * 0.4, tier: zone, seed: n, hit: false, at: 0, body: null, phone: null });
      if (n % 6 === 3) entities.push({ kind: "dm", x: x + 3, y: 4.2 + hash3(n, r, 2) * 3, z: 0, tier: zone, seed: n, hit: false, at: 0, body: null, phone: null });
      x += (4.6 + hash3(r * 13 + n, 7, 1) * 4.2) * (1 - zone * 0.05);
      n += 1;
    }
  };

  const resetRound = () => {
    origin = STARTS[round];
    j.x = origin;
    j.y = 1.8;
    j.vx = 0;
    j.vy = 0;
    j.spin = 0;
    j.sliding = false;
    a.x = origin;
    a.run = 0;
    a.pose = "carry";
    rizzed = 0;
    combo = 0;
    dives = 3;
    power = "";
    acc = 0;
    kick = 0;
    landedAt = -1;
    johnHolder.scale.set(1, 1, 1);
    topZone = zoneAt(origin + 4);
    zoneShown = topZone;
    cam.x = origin + 2;
    cam.y = 1.8;
    layout(round + 1);
    ensureTiles(cam.x);
  };
  resetRound();

  const setPhase = (next: Phase) => {
    phase = next;
    phaseAt = now;
    emit();
  };

  const confidence = () => 1 + Math.min(0.42, total * 0.02);

  const throwJohn = () => {
    const q = meter;
    const v0 = (11 + 9 * q) * confidence();
    const angle = (54 * Math.PI) / 180;
    j.vx = Math.cos(angle) * v0;
    j.vy = Math.sin(angle) * v0;
    j.x = a.x + 0.35;
    j.y = 2.1;
    j.angle = angle;
    a.pose = "throw";
    sound()?.whoosh(0.5, true, 0.16);
    sound()?.boing(-4);
    if (q > 0.9) {
      kick = 0.8;
      sound()?.sparkle();
    }
    dust(a.x, 0.06, 0, 6, zoneAt(a.x) > 0);
    setPhase("flight");
  };

  const land = () => {
    const distance = Math.max(0, Math.round(j.x - origin));
    results.push({ distance, rizzed, top: ZONES[topZone].rating });
    sound()?.thud();
    setPhase("landed");
  };

  const hitBaddie = (e: Entity) => {
    e.hit = true;
    e.at = now;
    const zone = ZONES[e.tier];
    combo += 1;
    rizzed += 1;
    total += 1;
    bestCombo = Math.max(bestCombo, combo);
    if (rizzed % 2 === 0) dives = Math.min(3, dives + 1);
    j.y = HEAD;
    j.vy = zone.bounce + Math.min(6, combo) * 0.15;
    // a chain is worth a little more speed with every link
    j.vx = Math.min(MAX_VX, Math.max(j.vx, 7) + zone.boost + Math.min(8, combo) * 0.22);
    j.spin = 0;
    // a few frames of hit-stop, longer the longer the chain; a punch in; a squash
    freeze = 0.06 + Math.min(5, combo) * 0.006;
    shake = 0.16;
    kick = Math.min(1.25, 0.75 + combo * 0.06);
    landedAt = now;
    const rating = e.tier === 0 ? (e.seed % 2 ? "7/10" : "6/10") : zone.rating;
    popup(combo > 1 ? `${rating} · RIZZED ×${combo}` : `${rating} · RIZZED`, e.tier === 3 ? "gold" : "rizz", e.x, 2.6, e.z);
    burstHearts(e.x, 2.1, e.z, e.tier === 3 ? 10 : 6);
    sound()?.rizz(combo);
    sound()?.boing(e.tier * 2);
    emit();
  };

  const hitBoyfriend = (e: Entity) => {
    e.hit = true;
    e.at = now;
    combo = 0;
    j.y = HEAD + 0.15;
    j.vy = 6;
    j.vx *= 0.45;
    freeze = 0.11;
    shake = 0.24;
    kick = 1.3;
    landedAt = now;
    popup("SHE HAS A BOYFRIEND", "nope", e.x, 2.8, 0);
    sound()?.nope();
    emit();
  };

  const takeDm = (e: Entity) => {
    e.hit = true;
    e.at = now;
    j.vx = Math.min(MAX_VX, j.vx + 4.5);
    j.vy = Math.max(j.vy, 5.5);
    dives = Math.min(3, dives + 1);
    kick = Math.max(kick, 0.5);
    popup("SLID INTO HER DMs", "dm", e.x, e.y + 0.6, 0);
    burstHearts(e.x, e.y, 0, 4);
    sound()?.notify();
    sound()?.whoosh(0.4, true, 0.12);
    emit();
  };

  // a dive swoops onto the best baddie ahead: pressing about when one is in
  // reach is the skill, not landing on the exact pixel. Nobody in reach, and
  // it's just a drop.
  const dive = () => {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of entities) {
      if (e.hit || e.kind !== "baddie") continue;
      const dx = e.x - j.x;
      if (dx < 0.8 || dx > 9.5) continue;
      // the one about where the throw is taking him anyway
      const score = Math.abs(dx - Math.max(1.5, j.vx * 0.32));
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    if (!best) {
      j.vy = Math.min(j.vy, -14);
      return;
    }
    const dx = best.x - j.x;
    // long enough to be coming down when he gets there, even from low
    const low = Math.sqrt(Math.max(0, (2 * (HEAD - j.y)) / G)) + 0.06;
    const t = Math.max(0.2, low, Math.min(0.55, dx / Math.max(6, j.vx * 1.15)));
    j.vx = Math.max(4, Math.min(MAX_VX, dx / t));
    j.vy = (HEAD - 0.05 - j.y + 0.5 * G * t * t) / t;
  };

  const physics = (h: number) => {
    j.vy -= G * h;
    j.x += j.vx * h;
    j.y += j.vy * h;
    for (const e of entities) {
      if (e.hit || Math.abs(e.x - j.x) > 1.2) continue;
      if (e.kind === "dm") {
        if (Math.hypot(e.x - j.x, e.y - j.y) < 0.9) takeDm(e);
      } else if (j.vy < 0 && Math.abs(e.x - j.x) < 0.85 && j.y <= HEAD && j.y >= 1.15) {
        if (e.kind === "boyfriend") hitBoyfriend(e);
        else hitBaddie(e);
      }
    }
    if (j.y <= 0.35) {
      j.y = 0.35;
      if (j.vy < -4.2 && !j.sliding) {
        const hard = Math.min(1, -j.vy / 16);
        j.vy = -j.vy * 0.42;
        j.vx *= 0.72;
        j.spin = 10;
        // a chain that ends on the sand still gets its number
        if (combo >= 3) popup(`COMBO ×${combo}`, "power", j.x, 2.2, 0);
        combo = 0;
        bounces += 1;
        const stone = zoneAt(j.x) > 0;
        ring(j.x, 0, 10, stone);
        dust(j.x, 0.1, 0, 4, stone);
        kick = Math.max(kick, 0.35 + hard * 0.4);
        shake = Math.max(shake, 0.1 + hard * 0.08);
        landedAt = now;
        sound()?.thud();
        if (bounces % 3 === 1) popup("OOF", "oof", j.x, 1.2, 0);
        emit();
      } else {
        j.vy = 0;
        j.sliding = true;
      }
    }
    if (j.sliding) {
      j.vx = Math.max(0, j.vx - 10 * h);
      // a trail of sand behind the slide, twenty puffs a second
      slides += 1;
      if (slides % 12 === 0) dust(j.x, 0.05, 0, 1, zoneAt(j.x) > 0);
      if (j.vx <= 0.01) land();
    }
  };

  const showZone = () => {
    const z = zoneAt(j.x);
    if (z > topZone) topZone = z;
    if (z !== zoneShown) {
      zoneShown = z;
      if (z > 0) sound()?.sparkle();
      emit();
    }
  };

  const nextRound = () => {
    if (round + 1 >= ROUNDS) {
      sound()?.sting();
      setPhase("results");
      return;
    }
    wipeAt = now;
    wipe = 1;
    emit();
  };

  // what each body does: idle, swooning, glowing
  const posePeople = (time: number) => {
    for (const e of entities) {
      if (e.kind === "dm") {
        const near = Math.abs(e.x - cam.x) < 28 && !e.hit;
        if (near && !e.phone) {
          const g = new Group();
          const m = new Mesh(phoneGeom, materials.glow);
          g.add(m);
          e.phone = g;
          course.add(g);
        }
        if (e.phone && (!near || e.hit)) {
          course.remove(e.phone);
          e.phone = null;
        }
        if (e.phone) {
          e.phone.position.set(e.x, e.y + Math.sin(time * 2.4 + e.seed) * 0.15, 0);
          e.phone.rotation.y = Math.sin(time * 1.6 + e.seed) * 0.6;
        }
        continue;
      }
      const near = e.x > cam.x - 22 && e.x < cam.x + 30;
      if (near && !e.body) {
        e.body = take(e.kind === "boyfriend" ? "bf" : "baddie", e.tier);
        e.body.holder.position.set(e.x, 0, e.z);
        e.body.heart.visible = false;
        course.add(e.body.holder);
      } else if (!near && e.body) {
        give(e.body);
        e.body = null;
      }
      const body = e.body;
      if (!body) continue;
      const since = e.hit ? now - e.at : Infinity;
      let pose: Pose = e.kind === "boyfriend" ? "cross" : e.tier >= 2 ? "hip" : "stand";
      let turn = e.kind === "boyfriend" ? -0.35 : -0.45 + Math.sin(time * 0.6 + e.seed) * 0.15;
      if (e.hit && e.kind === "baddie") {
        pose = since < 1.7 ? "swoon" : "wave";
        turn = 0.7;
        body.heart.visible = true;
        body.heart.position.y = 2.3 + Math.sin(time * 3 + e.seed) * 0.06;
        body.heart.rotation.y = time * 2;
      } else if (e.hit && e.kind === "boyfriend") {
        body.rig.head.rotation.y = Math.sin(time * 14) * 0.5 * Math.max(0, 1 - since);
      }
      body.holder.rotation.y += (turn - body.holder.rotation.y) * 0.12;
      // the one he lands on gives a little under him, and springs back
      const sink = e.hit && e.kind === "baddie" && !calm ? spring(since) : 0;
      body.holder.scale.set(1 + sink * 0.1, 1 - sink * 0.2, 1 + sink * 0.1);
      animate(body.rig, 0, 0, time, pose, e.seed);
      if (body.sparkle) body.sparkle.rotation.y = time * 1.6;
    }
  };

  // the people: Aiden (on the ground), John (wherever he's been thrown)
  const poseBoys = (time: number, dt: number) => {
    if (phase === "windup") {
      a.x += 7 * dt;
      a.phase += dt * 14;
    }
    const running = phase === "windup" ? 1 : phase === "aim" ? 0.35 : 0;
    if (phase === "aim") a.phase += dt * 9;
    aidenHolder.position.set(a.x, 0, 0);
    const aPose: Pose = phase === "title" || phase === "aim" || phase === "windup" ? "carry" : phase === "flight" && now - phaseAt < 0.45 ? "throw" : phase === "landed" || phase === "results" ? "cheer" : "stand";
    animate(aiden, a.phase, running, time, aPose);
    const ride = phase === "title" || phase === "aim" || phase === "windup";
    johnYaw.rotation.y = Math.PI / 2 - (ride ? TURN : TURN * 0.5);
    if (ride) {
      const bob = Math.abs(Math.sin(a.phase)) * 0.05 * running;
      johnHolder.position.set(a.x - 0.17, shoulders + bob, 0.02);
      johnSpin.rotation.x = 0;
      animate(john, 0, 0, time, "ride");
      return;
    }
    johnHolder.position.set(j.x, j.y, 0);
    const squash = calm ? 0 : spring(now - landedAt);
    johnHolder.scale.set(1 + squash * 0.16, 1 - squash * 0.26, 1 + squash * 0.16);
    const r = johnSpin.rotation.x;
    johnSpin.rotation.x = Math.atan2(Math.sin(r), Math.cos(r));
    if (phase === "flight" && !j.sliding) {
      const want = Math.PI / 2 - Math.atan2(j.vy, Math.max(0.5, j.vx));
      if (j.spin > 0) {
        johnSpin.rotation.x += j.spin * dt * 2.2;
        j.spin = Math.max(0, j.spin - dt * 9);
      } else {
        let d = want - johnSpin.rotation.x;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        johnSpin.rotation.x += d * Math.min(1, dt * 10);
      }
      animate(john, 0, 0, time, "fly");
    } else if (j.sliding || phase === "landed") {
      // face down, sliding to a stop, then up with a wave
      const up = phase === "landed" && now - phaseAt > 0.6;
      const target = up ? 0 : Math.PI / 2;
      johnSpin.rotation.x += (target - johnSpin.rotation.x) * Math.min(1, dt * (up ? 8 : 12));
      if (up) johnHolder.position.y = mid;
      animate(john, 0, 0, time, up ? "cheer" : "fly");
    } else animate(john, 0, 0, time, "stand");
  };

  const look = { target: new Vector3(), span: 15, background: { top: new Color(0x8cc4f2), bottom: new Color(0xfde8c9) } };
  // reused every frame
  const local = new Vector3();
  const over = new Vector3();
  const sunAt = new Vector3();
  let night = 0;
  const skyColour = (x: number) => {
    // blend between zones over the last 18 m before each starts
    const i = zoneAt(x);
    const A = ZONES[i];
    const B = ZONES[i + 1] ?? A;
    const t = B !== A ? Math.max(0, Math.min(1, (x - (B.from - 18)) / 18)) : 0;
    look.background.top.setHex(mix(A.sky[0], B.sky[0], t));
    look.background.bottom.setHex(mix(A.sky[1], B.sky[1], t));
    night = A.night + (B.night - A.night) * t;
    sun.color.setHex(mix(A.sunColor, B.sunColor, t));
    sun.intensity = A.sun + (B.sun - A.sun) * t;
    hemi.color.setHex(mix(A.hemi[0], B.hemi[0], t));
    hemi.groundColor.setHex(mix(A.hemi[1], B.hemi[1], t));
  };

  const update = (dt: number, time: number) => {
    now += dt;
    // the throw meter, up and down, a little faster each throw; a tick on the way into the gold
    if (phase === "aim") {
      meterT += dt;
      meter = 1 - Math.abs(((meterT * SWEEP[Math.min(round, SWEEP.length - 1)]) % 2) - 1);
      const gold = meter > 0.9;
      if (gold && !wasGold) sound()?.tick();
      wasGold = gold;
    }
    if (phase === "windup" && now - phaseAt > 0.42) throwJohn();
    if (phase === "flight") {
      // hit-stop eats whole frames; then the physics catches up in fixed steps
      if (freeze > 0) freeze = Math.max(0, freeze - dt);
      else {
        acc = Math.min(acc + dt, 0.1);
        while (acc >= STEP && phase === "flight") {
          physics(STEP);
          acc -= STEP;
          if (freeze > 0) {
            acc = 0;
            break;
          }
        }
      }
      showZone();
    }
    if (phase === "landed" && now - phaseAt > 2.1 && wipeAt < 0) nextRound();
    // the wipe between throws: cover, reset under it, uncover
    if (wipeAt >= 0) {
      const t = now - wipeAt;
      if (t > 0.45 && phase === "landed") {
        round += 1;
        resetRound();
        meterT = 0;
        setPhase("aim");
      }
      if (t > 0.95) {
        wipeAt = -1;
        wipe = 0;
        emit();
      }
    }

    // the camera: ahead of John, up with him, out when he's high, in for a moment on a hit
    const flying = phase === "flight" || phase === "landed" || phase === "results" || phase === "done";
    const fx = flying ? j.x + Math.min(4, Math.max(0, j.vx * 0.22)) : a.x + 2.2;
    const fy = flying ? Math.max(1.7, j.y * 0.62 + 0.7) : 1.9;
    const k = 1 - Math.exp(-dt * (flying ? 6 : 4));
    cam.x += (fx - cam.x) * k;
    cam.y += (fy - cam.y) * k;
    const zoom = 1 + Math.min(0.55, Math.max(0, (j.y - 4.5) / 16)) * (flying ? 1 : 0);
    cam.span += (zoom - cam.span) * (1 - Math.exp(-dt * 3));
    kick = calm ? 0 : Math.max(0, kick - dt * 3.6);
    shake = Math.max(0, shake - dt);
    const s = calm ? 0 : shake * shake * 2.2;
    local.set(cam.x + (hash3(Math.floor(now * 60), 3, 1) - 0.5) * s, cam.y + (hash3(Math.floor(now * 60), 5, 2) - 0.5) * s, -0.6);
    look.target.copy(local);
    course.localToWorld(look.target);

    ensureTiles(cam.x);
    skyColour(cam.x);
    // the sun and the clouds stay in the sky; the wheel turns, a little behind
    sky.sunMesh.position.set(cam.x + 3.2, cam.y * 0.95 - 21.2, -44);
    for (let n = 0; n < sky.clouds.length; n += 1) {
      const drift = ((((time * 0.4 + n * 9.3 - cam.x * 0.12) % 34) + 34) % 34) - 17;
      sky.clouds[n].position.set(cam.x + drift, cam.y * 0.9 - 19.5 + n * 0.9, -40);
    }
    wheel.group.position.x = 120 + (cam.x - 120) * 0.45;
    wheel.wheel.rotation.z = time * 0.08;
    for (let n = 0; n < foams.length; n += 1) foams[n].mesh.position.z = Math.sin(time * 0.9 + foams[n].i) * 0.12 + 0.05;
    for (let n = 0; n < gates.length; n += 1) gates[n].visible = Math.abs(gates[n].position.x - cam.x) < 40;

    // light: always over the action, from in front and to the right, so the
    // sides you can see are lit and the shadows fall back toward the water
    over.set(cam.x, 0, 0);
    course.localToWorld(over);
    sunAt.set(cam.x + 6, 13, 9);
    course.localToWorld(sunAt);
    sun.position.copy(sunAt);
    sun.target.position.copy(over);
    sun.target.updateMatrixWorld();

    posePeople(time);
    poseBoys(time, dt);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.on) continue;
      p.life += dt;
      const t = p.life / p.max;
      p.v.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      // dust settles on the ground; hearts float off
      if (p.gravity > 5 && p.mesh.position.y < 0.04) {
        p.mesh.position.y = 0.04;
        p.v.set(p.v.x * 0.6, 0, p.v.z * 0.6);
      }
      p.mesh.rotation.y += p.spin * dt;
      p.mesh.scale.setScalar(Math.max(0.001, p.scale * (1 - t * t)));
      if (t >= 1) {
        p.on = false;
        p.mesh.visible = false;
      }
    }
    while (popups.length && now - popups[0].born > 1.4) popups.shift();
  };

  const press = () => {
    if (phase === "title") {
      sound()?.confirm();
      meterT = 0;
      setPhase("aim");
    } else if (phase === "aim") {
      power = meter > 0.9 ? "PERFECT" : meter > 0.7 ? "GOOD" : "WEAK";
      sound()?.[meter > 0.9 ? "chime" : "select"]();
      popup(power === "PERFECT" ? "PERFECT THROW" : power === "GOOD" ? "GOOD THROW" : "…WEAK THROW", "power", a.x, 3.2, 0);
      setPhase("windup");
    } else if (phase === "flight" && !j.sliding && dives > 0 && j.y > 1) {
      dives -= 1;
      dive();
      j.spin = 0;
      sound()?.dive();
      emit();
    } else if (phase === "results" && now - phaseAt > 0.8) {
      phase = "done";
      emit();
      const best = Math.max(...results.map((r) => r.distance));
      onDone({ best, rizzed: total, top: ZONES[Math.max(...results.map((r) => ZONES.findIndex((z) => z.rating === r.top)))].rating });
    }
  };

  return {
    scene,
    update,
    press,
    look: (tall: boolean) => {
      // a hit punches in a few percent, and eases back out
      look.span = (tall ? 11 : 15) * cam.span * (1 - 0.065 * kick * kick);
      return look;
    },
    night: () => night,
    /** Where John is, how fast, how far, for the HUD: the same object every frame. */
    live: () => {
      liveView.distance = Math.max(0, Math.round((phase === "flight" || phase === "landed" ? j.x : origin) - origin));
      liveView.meter = meter;
      liveView.speed = phase === "flight" && !j.sliding ? Math.hypot(j.vx, j.vy) : 0;
      liveView.height = j.y;
      liveView.rising = j.vy > 0;
      liveView.combo = combo;
      return liveView;
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => snapshot,
    dispose: () => {
      for (const zone of tiles)
        for (const t of zone) {
          t.ground.dispose();
          t.props.dispose();
          t.glow?.dispose();
          t.foam?.dispose();
        }
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && ![heartBig, heartSmall, dustSand, dustStone, phoneGeom].includes(m.geometry)) m.geometry.dispose();
        // and the sun's shadow map
        const light = o as Mesh & { isLight?: boolean; shadow?: { map?: { dispose: () => void } | null } };
        if (light.isLight) light.shadow?.map?.dispose();
      });
      for (const list of pools.values()) for (const b of list) b.holder.traverse((o) => (o as Mesh).isMesh && (o as Mesh).geometry.dispose());
      heartBig.dispose();
      heartSmall.dispose();
      dustSand.dispose();
      dustStone.dispose();
      phoneGeom.dispose();
    },
  };
}

export type Wingman = ReturnType<typeof createWingman>;
