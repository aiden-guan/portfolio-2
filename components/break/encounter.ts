// One place to tune readability and encounter length without changing flight feel.
export const ENCOUNTER = {
  hp: 260,
  evilHp: 340,
  evilTransformSeconds: 4.3,
  transformSeconds: 3.4,
  boltDamage: 0.45,
  missileDamage: 1.25,
  pulseDamage: 2,
  boltInterval: 0.24,
  spreadInterval: 0.22,
  missileInterval: 4.2,
  boltSpeed: 600,
  enemyMinSpeed: 126,
  enemyMaxSpeed: 164,
  enemyRadius: 6.5,
  beamWarning: 1.4,
  beamEnd: 1.75,
  beamLife: 2,
} as const;

export const CAT_INKS = ["#b77d9c", "#e6a3ca", "#ffe0ef"];
export type EarPixel = { col: number; row: number; ink: number };
type Point = [number, number];
function roundedShape(start: Point, curves: [Point, Point][]) {
  const points: Point[] = [start];
  let from = start;
  for (const [control, end] of curves) {
    for (let step = 1; step <= 12; step++) {
      const t = step / 12,
        u = 1 - t;
      points.push([
        u * u * from[0] + 2 * u * t * control[0] + t * t * end[0],
        u * u * from[1] + 2 * u * t * control[1] + t * t * end[1],
      ]);
    }
    from = end;
  }
  return points;
}
function inside(x: number, y: number, points: Point[]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
// Ears use the portrait's own grid and become destructible pixels in form two.
export function createCatEars(cols: number, rows: number): EarPixel[] {
  const pixels: EarPixel[] = [];
  // Low, wide lobes keep the silhouette feline without tall, upright tips.
  const outer = roundedShape(
    [0.11, 0.165],
    [
      [
        [0.025, 0.08],
        [0.035, 0.015],
      ],
      [
        [0.035, -0.095],
        [0.13, -0.105],
      ],
      [
        [0.22, -0.11],
        [0.25, -0.005],
      ],
      [
        [0.29, 0.075],
        [0.38, 0.13],
      ],
      [
        [0.245, 0.2],
        [0.11, 0.165],
      ],
    ],
  );
  const inner = roundedShape(
    [0.155, 0.105],
    [
      [
        [0.095, 0.05],
        [0.11, 0.005],
      ],
      [
        [0.12, -0.055],
        [0.16, -0.055],
      ],
      [
        [0.205, -0.055],
        [0.22, 0.015],
      ],
      [
        [0.25, 0.07],
        [0.29, 0.1],
      ],
      [
        [0.22, 0.135],
        [0.155, 0.105],
      ],
    ],
  );
  for (let row = -Math.ceil(rows * 0.25); row < rows * 0.17; row++) {
    for (let col = 0; col < cols / 2; col++) {
      const u = (col + 0.5) / cols,
        v = (row + 0.5) / rows;
      if (!inside(u, v, outer)) continue;
      const pink = inside(u, v, inner);
      const ink = pink
        ? row % 4 === 0
          ? 8
          : row < 0
            ? 7
            : 6
        : u < 0.11
          ? 2
          : 1;
      pixels.push({ col, row, ink }, { col: cols - 1 - col, row, ink });
    }
  }
  return pixels;
}

// Three short diagonal strokes on each cheek, recolored on the face itself.
export function createBlush(cols: number, rows: number): EarPixel[] {
  const pixels: EarPixel[] = [];
  for (let mark = 0; mark < 3; mark++) {
    for (let step = 0; step < 5; step++) {
      const row = Math.round(rows * 0.645) + step;
      const start =
        Math.round(cols * (0.23 + mark * 0.055)) + Math.floor((4 - step) / 2);
      for (let width = 0; width < 2; width++) {
        const col = start + width,
          ink = width === 0 ? 7 : 6;
        pixels.push({ col, row, ink }, { col: cols - 1 - col, row, ink });
      }
    }
  }
  return pixels;
}
