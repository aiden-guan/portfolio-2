import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";

// A sparse voxel model and the mesher that turns it into one geometry: only
// faces that touch air are kept, each corner is darkened by the voxels around
// it (ambient occlusion), and every voxel gets a hair of colour noise so a
// flat colour still reads as a made thing at pixel size.

const OFFSET = 512;
const key = (x: number, y: number, z: number) => ((x + OFFSET) << 20) | ((y + OFFSET) << 10) | (z + OFFSET);

export type Paint = number | ((x: number, y: number, z: number) => number | null);

// Corner occlusion by how many of a corner's three neighbours are solid.
const AO = [1, 0.84, 0.72, 0.58];

// The six faces: normal, and the four corners as offsets from the voxel's min corner.
const FACES: Array<{ n: [number, number, number]; c: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

export function shade(color: number, amount: number) {
  return amount >= 0 ? mix(color, 0xffffff, amount) : mix(color, 0x000000, -amount);
}

export class Voxels {
  readonly cells = new Map<number, number>();

  constructor(
    readonly size: number,
    readonly jitter = 0.05,
  ) {}

  set(x: number, y: number, z: number, color: number | null) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (color === null) this.cells.delete(key(x, y, z));
    else this.cells.set(key(x, y, z), color);
  }

  has(x: number, y: number, z: number) {
    return this.cells.has(key(x, y, z));
  }

  paint(paint: Paint, x: number, y: number, z: number) {
    return typeof paint === "number" ? paint : paint(x, y, z);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z += 1) {
          const color = this.paint(paint, x, y, z);
          if (color !== null) this.set(x, y, z, color);
        }
  }

  // An ellipsoid; `fill` < 1 leaves it airy (foliage, clouds).
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, paint: Paint, fill = 1, seed = 0) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z += 1) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d > 1) continue;
          if (fill < 1 && hash3(x + seed, y * 3, z - seed) > fill + (1 - d) * 0.25) continue;
          const color = this.paint(paint, x, y, z);
          if (color !== null) this.set(x, y, z, color);
        }
  }

  // A thick segment from a to b, radius tapering from r0 to r1.
  limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, paint: Paint) {
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(1, Math.ceil(length * 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      const r = r0 + (r1 - r0) * t;
      const reach = Math.ceil(r);
      for (let dx = -reach; dx <= reach; dx += 1)
        for (let dy = -reach; dy <= reach; dy += 1)
          for (let dz = -reach; dz <= reach; dz += 1) {
            if (dx * dx + dy * dy + dz * dz > r * r + 0.35) continue;
            const vx = Math.round(x + dx), vy = Math.round(y + dy), vz = Math.round(z + dz);
            const color = this.paint(paint, vx, vy, vz);
            if (color !== null) this.set(vx, vy, vz, color);
          }
    }
  }

  // Pixel art drawn on a plane: rows top to bottom, one character per voxel,
  // looked up in `palette` ('.' or ' ' is empty). `axis` is the plane's width
  // direction; height is always +y.
  sprite(rows: string[], palette: Record<string, number>, x: number, y: number, z: number, axis: "x" | "z" = "x", depth = 1) {
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const color = palette[ch];
        if (color === undefined) return;
        for (let d = 0; d < depth; d += 1) {
          const vy = y + rows.length - 1 - r;
          if (axis === "x") this.set(x + c, vy, z + d, color);
          else this.set(x + d, vy, z + c, color);
        }
      });
    });
  }

  // What's solid, as a test: a dense grid one voxel wider than the model all
  // round (every neighbour the mesher asks about is within one voxel of a
  // solid one), so each test is an index rather than a lookup; the map itself
  // for a model too big for that.
  private occupancy() {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const k of this.cells.keys()) {
      const x = (k >>> 20) & 1023, y = (k >>> 10) & 1023, z = k & 1023;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const sx = x1 - x0 + 3, sy = y1 - y0 + 3, sz = z1 - z0 + 3;
    if (!this.cells.size || sx * sy * sz > 1 << 26) return (x: number, y: number, z: number) => this.cells.has(key(x, y, z));
    const grid = new Uint8Array(sx * sy * sz);
    // in the keys' own offset space, shifted so the border starts at 0
    const bx = x0 - 1 - OFFSET, by = y0 - 1 - OFFSET, bz = z0 - 1 - OFFSET;
    for (const k of this.cells.keys()) grid[((((k >>> 20) & 1023) - x0 + 1) * sy + (((k >>> 10) & 1023) - y0 + 1)) * sz + ((k & 1023) - z0 + 1)] = 1;
    return (x: number, y: number, z: number) => grid[((x - bx) * sy + (y - by)) * sz + (z - bz)] === 1;
  }

  /** `sway`, if given, says how much each point of the model gives in the
   * wind, 0 (still) to 1, by its position in voxels. It's read at the
   * corners, so neighbouring voxels bend together, and kept as the geometry's
   * `sway` attribute for a material made with `swayAttribute`. */
  geometry(seed = 1, occlude = true, { sway }: { sway?: (x: number, y: number, z: number) => number } = {}) {
    // TEMP(g1-render): time spent meshing, while measuring start-up
    const t0 = performance.now();
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const give: number[] = [];
    const occlusion = [1, 1, 1, 1];
    const s = this.size;
    const solid = this.occupancy();
    let vertex = 0;

    for (const [k, color] of this.cells) {
      const x = ((k >>> 20) & 1023) - OFFSET;
      const y = ((k >>> 10) & 1023) - OFFSET;
      const z = (k & 1023) - OFFSET;
      const noise = 1 + (hash3(x + seed, y, z) - 0.5) * 2 * this.jitter;
      const r = (((color >> 16) & 255) / 255) * noise;
      const g = (((color >> 8) & 255) / 255) * noise;
      const b = ((color & 255) / 255) * noise;

      for (const face of FACES) {
        const [nx, ny, nz] = face.n;
        if (solid(x + nx, y + ny, z + nz)) continue;
        let at = 0;
        for (const [cx, cy, cz] of face.c) {
          // the corner's neighbours in the plane just outside the face
          const ox = cx === 0 ? -1 : 1, oy = cy === 0 ? -1 : 1, oz = cz === 0 ? -1 : 1;
          const px = x + nx, py = y + ny, pz = z + nz;
          let side1 = false, side2 = false, corner = false;
          if (nx !== 0) {
            side1 = solid(px, py + oy, pz);
            side2 = solid(px, py, pz + oz);
            corner = solid(px, py + oy, pz + oz);
          } else if (ny !== 0) {
            side1 = solid(px + ox, py, pz);
            side2 = solid(px, py, pz + oz);
            corner = solid(px + ox, py, pz + oz);
          } else {
            side1 = solid(px + ox, py, pz);
            side2 = solid(px, py + oy, pz);
            corner = solid(px + ox, py + oy, pz);
          }
          const level = side1 && side2 ? 3 : Number(side1) + Number(side2) + Number(corner);
          occlusion[at++] = occlude ? AO[level] : 1;
          positions.push((x + cx) * s, (y + cy) * s, (z + cz) * s);
          normals.push(nx, ny, nz);
          if (sway) give.push(sway(x + cx, y + cy, z + cz));
        }
        for (const ao of occlusion) colors.push(srgbToLinear(r * ao), srgbToLinear(g * ao), srgbToLinear(b * ao));
        // split the quad along the diagonal that keeps the occlusion smooth
        if (occlusion[0] + occlusion[2] >= occlusion[1] + occlusion[3]) {
          indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
        } else {
          indices.push(vertex + 1, vertex + 2, vertex + 3, vertex + 1, vertex + 3, vertex);
        }
        vertex += 4;
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (sway) geometry.setAttribute("sway", new Float32BufferAttribute(give, 1));
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const g1 = globalThis as unknown as { __g1mesh?: number };
    g1.__g1mesh = (g1.__g1mesh ?? 0) + performance.now() - t0;
    return geometry;
  }
}

function srgbToLinear(c: number) {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
