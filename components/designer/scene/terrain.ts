import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { at, BLUE_FLOWERS, GROUND, HILLS, PADS, PATHS, POND, STREAM, WATER_LEVEL, YELLOW_FLOWERS } from "./layout";
import { color, FLAG, islandMask, islandRadius, smoothstep, worldMaterial } from "./shared";

export const EXTENT = 32;

function noise2(x: number, z: number) {
  return (
    Math.sin(x * 0.31 + z * 0.17) * 0.5 +
    Math.sin(x * 0.13 - z * 0.29 + 1.7) * 0.35 +
    Math.sin(x * 0.53 + z * 0.47 + 4.2) * 0.15
  );
}

function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function polylineDistance(px: number, pz: number, points: Array<[number, number]>) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = at(...points[i]);
    const [bx, bz] = at(...points[i + 1]);
    best = Math.min(best, segmentDistance(px, pz, ax, az, bx, bz));
  }
  return best;
}

// Distance outside the pond's ellipse, in "radii": < 1 inside.
export function pondDistance(x: number, z: number) {
  const [cx, cz] = at(POND.s, POND.t);
  const c = Math.cos(POND.angle), s = Math.sin(POND.angle);
  const dx = x - cx, dz = z - cz;
  const u = (dx * c + dz * s) / POND.rx;
  const v = (-dx * s + dz * c) / POND.rz;
  const wobble = 1 + 0.06 * Math.sin(Math.atan2(v, u) * 3 + 1.2);
  return Math.hypot(u, v) / wobble;
}

export function streamDistance(x: number, z: number) {
  return polylineDistance(x, z, STREAM);
}

function padHeightAt(name: string, base: (x: number, z: number) => number) {
  const pad = PADS[name];
  const [x, z] = at(pad.s, pad.t);
  return base(x, z);
}

function rawHeight(x: number, z: number) {
  let h = GROUND + noise2(x, z) * 0.35;
  for (const [s, t, r, height] of HILLS) {
    const [hx, hz] = at(s, t);
    const d = Math.hypot(x - hx, z - hz) / r;
    h += height * Math.exp(-d * d * 1.6);
  }
  // hills settle before the edge, so the island ends on near-flat ground
  const r = Math.hypot(x, z);
  const R = islandRadius(Math.atan2(z, x));
  const settle = 1 - smoothstep(R - 9, R - 1, r);
  return GROUND + (h - GROUND) * settle;
}

const padHeights = Object.fromEntries(Object.keys(PADS).map((name) => [name, padHeightAt(name, rawHeight)]));

export function heightAt(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const [name, pad] of Object.entries(PADS)) {
    const [px, pz] = at(pad.s, pad.t);
    const d = pad.round
      ? Math.max(0, Math.hypot(x - px, z - pz) - pad.hx)
      : Math.hypot(Math.max(0, Math.abs(x - px) - pad.hx), Math.max(0, Math.abs(z - pz) - pad.hz));
    const w = 1 - smoothstep(0, pad.falloff, d);
    h = h + (padHeights[name] - h) * w;
  }
  // the pond's basin and the stream's bed
  const pond = pondDistance(x, z);
  const stream = streamDistance(x, z);
  const bed = Math.min(
    WATER_LEVEL - 0.05 - POND.depth * (1 - smoothstep(0.2, 1, pond)),
    WATER_LEVEL - 0.05 - 0.55 * (1 - smoothstep(0.3, 1.25, stream)),
  );
  const carve = Math.max(1 - smoothstep(0.92, 1.28, pond), 1 - smoothstep(0.9, 1.8, stream));
  // banks rise just enough above the water
  const bank = Math.max(h, WATER_LEVEL + 0.18);
  h = carve > 0 ? bank + (bed - bank) * carve : h;
  return h;
}

export function padHeight(name: keyof typeof PADS) {
  return heightAt(...at(PADS[name].s, PADS[name].t));
}

// Ground paint: R paths, G yellow flowers, B blue flowers, A sand by the water.
// Heights ride along in a second texture for the water's depth.
function bake() {
  const size = 256;
  const splat = new Uint8Array(size * size * 4);
  const heights = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = ((i + 0.5) / size) * EXTENT * 2 - EXTENT;
      const z = ((j + 0.5) / size) * EXTENT * 2 - EXTENT;
      const o = (j * size + i) * 4;
      let path = Infinity;
      for (const line of PATHS) path = Math.min(path, polylineDistance(x, z, line));
      const wobble = noise2(x * 2.3, z * 2.3) * 0.12;
      splat[o] = Math.round(255 * (1 - smoothstep(0.38 + wobble, 0.72 + wobble, path)));
      let yellow = 0;
      for (const [s, t, r, k] of YELLOW_FLOWERS) {
        const [fx, fz] = at(s, t);
        yellow = Math.max(yellow, k * 0.92 * (1 - smoothstep(r * 0.25, r * (1.15 + 0.2 * noise2(x * 1.7, z * 1.7)), Math.hypot(x - fx, z - fz))));
      }
      let blue = 0;
      for (const [s, t, r, k] of BLUE_FLOWERS) {
        const [fx, fz] = at(s, t);
        blue = Math.max(blue, k * 0.8 * (1 - smoothstep(r * 0.2, r * (1.2 + 0.25 * noise2(x * 1.9 + 4, z * 1.9)), Math.hypot(x - fx, z - fz))));
      }
      splat[o + 1] = Math.round(255 * yellow * (1 - smoothstep(0.3, 0.6, splat[o] / 255)));
      splat[o + 2] = Math.round(255 * blue * (1 - smoothstep(0.3, 0.6, splat[o] / 255)));
      const shore = Math.min(Math.abs(pondDistance(x, z) - 1.02) * 3.2, Math.abs(streamDistance(x, z) - 1.25) * 1.6);
      splat[o + 3] = Math.round(255 * (1 - smoothstep(0.25, 1, shore)));
      const h = heightAt(x, z);
      heights[o] = Math.round(255 * Math.min(1, Math.max(0, (h + 1.5) / 10)));
      heights[o + 3] = 255;
    }
  }
  const texture = (data: Uint8Array) => {
    const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { splat: texture(splat), heights: texture(heights) };
}

export function buildTerrain() {
  const { splat, heights } = bake();
  const segments = 176;
  const geometry = new PlaneGeometry(EXTENT * 2, EXTENT * 2, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, islandMask(x, z) > 0.001 || Math.hypot(x, z) < 30 ? heightAt(x, z) : GROUND);
  }
  geometry.computeVertexNormals();

  const extraUniforms = {
    uSplat: { value: splat },
    uGrassDark: { value: color(0x2f6a24) },
    uGrassMid: { value: color(0x4a8a2b) },
    uGrassLight: { value: color(0x72a737) },
    uGrassHigh: { value: color(0x9cbf46) },
    uYellow: { value: color(0xf3b11c) },
    uYellow2: { value: color(0xf6cf3a) },
    uOrange: { value: color(0xe2861a) },
    uBlue: { value: color(0x3a4bb2) },
    uBlue2: { value: color(0x5f5cc6) },
    uBlueDeep: { value: color(0x26338a) },
    uPath: { value: color(0xdcd2b0) },
    uPathDark: { value: color(0xbcae86) },
    uSand: { value: color(0xc9b47e) },
  };

  const material = worldMaterial(
    {
      key: "terrain",
      flag: FLAG.ground,
      dissolve: "ground",
      extraUniforms,
      fragmentHead: /* glsl */ `
uniform sampler2D uSplat;
uniform vec3 uGrassDark, uGrassMid, uGrassLight, uGrassHigh;
uniform vec3 uYellow, uYellow2, uOrange, uBlue, uBlue2, uBlueDeep, uPath, uPathDark, uSand;`,
      diffuse: /* glsl */ `
{
  vec2 xz = vWorld.xz;
  vec4 sp = texture2D(uSplat, (xz + ${EXTENT.toFixed(1)}) / ${(EXTENT * 2).toFixed(1)});
  vec2 cell = floor(xz / 0.14);
  float grain = hash12(cell);
  float grain2 = hash12(cell + 41.0);
  float patches = vnoise(xz * 0.16) * 0.65 + vnoise(xz * 0.7 + 3.1) * 0.35;
  vec3 grass = mix(uGrassDark, uGrassMid, smoothstep(0.2, 0.55, patches));
  grass = mix(grass, uGrassLight, smoothstep(0.55, 0.9, patches));
  grass = mix(grass, uGrassHigh, smoothstep(2.5, 6.0, vWorld.y) * 0.45);
  // mown stripes on the open slopes
  grass *= 0.95 + 0.05 * step(0.5, fract((xz.x - xz.y) * 0.22));
  grass *= 0.88 + grain * 0.22;
  if (grain2 > 0.94) grass = mix(grass, uGrassHigh, 0.55);
  if (grain2 < 0.05) grass *= 0.72;
  vec3 ground = grass;

  float yellow = sp.g * (0.75 + 0.25 * vnoise(xz * 1.3));
  if (yellow > grain * 0.92 + 0.04) ground = grain2 > 0.66 ? uYellow2 : (grain2 > 0.18 ? uYellow : uOrange);
  float blue = sp.b * (0.7 + 0.3 * vnoise(xz * 1.1 + 9.0));
  if (blue > grain * 0.95 + 0.04) ground = grain2 > 0.6 ? uBlue2 : (grain2 > 0.15 ? uBlue : uBlueDeep);
  if ((yellow > 0.2 || blue > 0.2) && grain2 > 0.4 && grain2 < 0.48) ground = grass * 0.78;

  float sand = sp.a + (grain - 0.5) * 0.3;
  if (sand > 0.45) ground = mix(uSand, uPathDark, step(0.8, grain2));
  float path = sp.r + (grain - 0.5) * 0.28;
  if (path > 0.5) ground = grain2 > 0.86 ? uPathDark : uPath * (0.95 + grain * 0.08);
  diffuseColor.rgb = ground;
}`,
    },
    { vertexColors: false },
  );

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "terrain";
  return { mesh, heights, splat };
}
