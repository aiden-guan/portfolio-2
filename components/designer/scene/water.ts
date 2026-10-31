import { Mesh, PlaneGeometry, type Texture } from "three";
import { WATER_LEVEL } from "./layout";
import { color, FLAG, worldMaterial } from "./shared";
import { EXTENT } from "./terrain";

// One sheet of water at a fixed level under the whole island; the ground
// hides it everywhere except the pond and the stream. Colour comes from the
// depth of the bed below, with pixel-sized glints that drift on the surface.
export function buildWater(heights: Texture) {
  const geometry = new PlaneGeometry(EXTENT * 2, EXTENT * 2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, WATER_LEVEL, 0);

  const material = worldMaterial(
    {
      key: "water",
      flag: FLAG.ground,
      dissolve: "ground",
      extraUniforms: {
        uHeights: { value: heights },
        uShallow: { value: color(0x7fc8c6) },
        uMid: { value: color(0x4a9cb2) },
        uDeep: { value: color(0x27648f) },
        uFoam: { value: color(0xe4f4ef) },
        uGlint: { value: color(0xf6fbff) },
      },
      fragmentHead: /* glsl */ `
uniform sampler2D uHeights;
uniform vec3 uShallow, uMid, uDeep, uFoam, uGlint;
float waterDepth(vec2 xz) {
  float h = texture2D(uHeights, (xz + ${EXTENT.toFixed(1)}) / ${(EXTENT * 2).toFixed(1)}).r * 10.0 - 1.5;
  return ${WATER_LEVEL.toFixed(3)} - h;
}`,
      diffuse: /* glsl */ `
{
  vec2 xz = vWorld.xz;
  float depth = waterDepth(xz);
  if (depth < -0.02) discard;
  vec2 cell = floor(xz / 0.14);
  float grain = hash12(cell);
  vec3 water = mix(uShallow, uMid, smoothstep(0.05, 0.45, depth));
  water = mix(water, uDeep, smoothstep(0.45, 1.0, depth));
  // slow light bands across the surface
  float band = vnoise(vec2(xz.x * 0.35 + uTime * 0.12, xz.y * 1.1 - uTime * 0.05));
  water *= 0.92 + 0.16 * smoothstep(0.45, 0.8, band);
  water *= 0.94 + grain * 0.1;
  // a pale rim where it meets the bank
  if (depth < 0.07 + grain * 0.05) water = mix(water, uFoam, 0.75);
  diffuseColor.rgb = water;
}`,
      emissive: /* glsl */ `
{
  // glints: short horizontal dashes that wink in and out
  vec2 xz = vWorld.xz;
  vec2 g = floor(vec2((xz.x - xz.y) / 0.3, (xz.x + xz.y) / 0.15));
  float wink = hash12(g + floor(uTime * 1.6 + hash12(g) * 7.0));
  float lit = step(0.988, wink) * step(0.12, waterDepth(xz));
  totalEmissiveRadiance += uGlint * lit * 0.9;
}`,
    },
    { vertexColors: false },
  );

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "water";
  return mesh;
}
