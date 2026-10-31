// Where everything stands. Positions are written in screen terms, (s, t):
// s runs left→right across the screen and t top→bottom, which on this
// camera are the world's diagonals. at() turns them into world (x, z).

export function at(s: number, t: number): [number, number] {
  return [(s + t) / 2, (t - s) / 2];
}

export const WATER_LEVEL = 0.12;
export const GROUND = 0.35;

// Hills: [s, t, radius, height]
export const HILLS: Array<[number, number, number, number]> = [
  [-2, -24, 9.5, 5.8], // the tree's hill, at the back
  [12, -25, 6.5, 3.4],
  [-15, -21, 6, 2.6],
  [4, -3, 7.5, 2.3], // the field Aiden stands in
  [25, -15, 6, 2.7], // the dovecote's
  [-27, -7, 6.5, 3.1],
  [27, 3, 5, 1.6],
  [-6, 27, 6, 1.2],
];

export type Pad = { s: number; t: number; hx: number; hz: number; round?: boolean; falloff: number };

// Flat ground for things that need it. Rectangles are aligned to the world
// axes, so they read as diamonds on screen.
export const PADS: Record<string, Pad> = {
  court: { s: 16, t: 10, hx: 4.7, hz: 4.3, falloff: 2.4 },
  rally: { s: 13, t: -10, hx: 3.5, hz: 2.7, falloff: 2 },
  seyrin: { s: -4, t: 11, hx: 2.6, hz: 2.6, round: true, falloff: 2 },
  alai: { s: 5, t: 20, hx: 2.6, hz: 2.6, round: true, falloff: 2 },
  corgis: { s: -12, t: 19, hx: 2.2, hz: 2.2, round: true, falloff: 2 },
  dovecote: { s: 25, t: -15, hx: 1.6, hz: 1.6, round: true, falloff: 2 },
  tree: { s: -2, t: -24, hx: 2.4, hz: 2.4, round: true, falloff: 3 },
  aiden: { s: 6, t: -2, hx: 1, hz: 1, round: true, falloff: 2 },
};

// The koi pond: an ellipse in world space, and the stream that leaves it for
// the island's south-west edge.
export const POND = { s: -12, t: -5, rx: 5.6, rz: 4.4, angle: 0.5, depth: 1.1 };

export const STREAM: Array<[number, number]> = [
  [-15.5, -1],
  [-19, 2.5],
  [-22, 4.6],
  [-25.5, 6.5],
  [-29, 8.6],
  [-33, 11],
  [-38, 13.5],
];

export const BRIDGE = { s: -22.4, t: 5.2 };

// Footpaths, as (s, t) polylines.
export const PATHS: Array<Array<[number, number]>> = [
  [[-1.5, -18.5], [-5, -12], [-5.5, -5], [-4, 1], [-3.5, 7.5]],
  [[-3.5, 8.5], [-9, 6.8], [-15, 6], [-19.5, 5.4]],
  [[-25.2, 5], [-29, 2], [-32, -1.5]],
  [[-2.5, 13.5], [0, 17], [3, 19]],
  [[7.5, 19.5], [11, 16.5], [13.2, 13]],
  [[17.5, 4.5], [16, -1], [14, -6.5]],
  [[16, -11.5], [19.5, -14], [23, -14.5]],
  [[10, -11.5], [5, -15], [0.5, -18.5]],
];

// Where the yellow field (image two's) and the blue wildflowers (image
// one's) grow: [s, t, radius, strength]
export const YELLOW_FLOWERS: Array<[number, number, number, number]> = [
  [5, -3, 6.8, 1],
  [9, 1, 3.5, 0.8],
  [0, -6, 3, 0.7],
];

export const BLUE_FLOWERS: Array<[number, number, number, number]> = [
  [-2, 26, 7, 1],
  [8, 27, 5, 0.9],
  [-12, 24, 4, 0.7],
  [-18, -2, 2.2, 0.6],
  [20, -20, 2.5, 0.5],
];
