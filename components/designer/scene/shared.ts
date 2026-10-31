import { Color, MeshLambertMaterial, Vector2, type IUniform, type WebGLProgramParametersWithUniforms } from "three";

// What every material in the world shares: the clock, the drift of the cloud
// shadows across the land, the island's dissolving edge, and the hover/flag
// channel the post pass reads from alpha.

export const uniforms = {
  uTime: { value: 0 },
  uCloud: { value: new Vector2(0, 0) },
  uCloudAmount: { value: 1 },
  uReveal: { value: 0 },
  uNight: { value: 0 },
} satisfies Record<string, IUniform>;

// Alpha written to the colour target, read back by the post pass:
// terrain and water dissolve and never outline; soft things (clouds, koi,
// glow) don't outline either; solid props get a dark pixel outline.
export const FLAG = { ground: 0, soft: 0.5, solid: 1 } as const;

// The island's outline, shared by the CPU (heights, placement) and the GPU
// (the dither dissolve at the edge).
export const ISLAND = {
  base: 26,
  waves: [
    [2.2, 3, 0.7],
    [1.4, 5, 2.1],
    [0.8, 9, 0.3],
  ] as Array<[number, number, number]>,
  inner: 3.5,
  outer: 0.6,
};

export function islandRadius(angle: number) {
  let r = ISLAND.base;
  for (const [amp, freq, phase] of ISLAND.waves) r += amp * Math.sin(freq * angle + phase);
  return r;
}

export function islandMask(x: number, z: number) {
  const r = Math.hypot(x, z);
  const R = islandRadius(Math.atan2(z, x));
  return 1 - smoothstep(R - ISLAND.inner, R + ISLAND.outer, r);
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const glslWaves = ISLAND.waves
  .map(([amp, freq, phase]) => `${amp.toFixed(3)} * sin(${freq.toFixed(1)} * a + ${phase.toFixed(3)})`)
  .join(" + ");

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uCloud;
uniform float uCloudAmount;
uniform float uReveal;
uniform float uNight;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float islandMask(vec2 xz) {
  float a = atan(xz.y, xz.x);
  float R = ${ISLAND.base.toFixed(1)} + ${glslWaves};
  return 1.0 - smoothstep(R - ${ISLAND.inner.toFixed(2)}, R + ${ISLAND.outer.toFixed(2)}, length(xz));
}

// 1 under a cloud's shadow
float cloudShade(vec2 xz) {
  vec2 p = xz * 0.075 + uCloud;
  float n = vnoise(p) * 0.66 + vnoise(p * 2.07 + 13.1) * 0.34;
  return smoothstep(0.62, 0.68, n) * uCloudAmount;
}

// Everything arrives as a dither dissolve from the middle outwards, and the
// ground's edge stays dissolved: each pixel-sized cell keeps or drops by a
// fixed random, so the edge is still while the camera moves.
float revealFront(vec2 xz) {
  return 1.0 - smoothstep(uReveal * 44.0 - 8.0, uReveal * 44.0, length(xz));
}

bool groundDissolved(vec2 xz) {
  float keep = min(islandMask(xz), revealFront(xz));
  return keep < hash12(floor(xz / 0.14) + 17.0);
}

bool objectDissolved(vec3 p) {
  return revealFront(p.xz) < hash12(floor(p.xz / 0.14) + floor(p.y / 0.14) * vec2(7.0, 13.0) + 3.0);
}
`;

type Options = {
  flag?: number;
  sway?: number;
  /** model-space height below which sway is zero */
  swayFrom?: number;
  /** ground dissolves at the island's edge too; objects only arrive */
  dissolve?: "ground" | "object";
  cloud?: boolean;
  /** extra fragment code run after the lights, with `vWorld` available */
  fragment?: string;
  /** extra declarations for the fragment shader */
  fragmentHead?: string;
  /** replaces the diffuse colour after <color_fragment> */
  diffuse?: string;
  emissive?: string;
  extraUniforms?: Record<string, IUniform>;
  key: string;
};

// A Lambert material wired into the world: world-position varying, cloud
// shadows on the direct light, optional wind sway, optional edge dissolve,
// and the flag in alpha.
export function worldMaterial(options: Options, base: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) {
  const material = new MeshLambertMaterial({ vertexColors: true, ...base });
  const flag = options.flag ?? FLAG.solid;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms, options.extraUniforms ?? {});
    shader.uniforms.uSway = { value: options.sway ?? 0 };
    shader.uniforms.uSwayFrom = { value: options.swayFrom ?? 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${GLSL_COMMON}
uniform float uSway;
uniform float uSwayFrom;
varying vec3 vWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 swayOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec3 swayOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
  float swayLift = max(0.0, transformed.y - uSwayFrom);
  float gust = sin(uTime * 1.3 + swayOrigin.x * 0.21 + swayOrigin.z * 0.17);
  transformed.x += uSway * swayLift * (sin(uTime * 2.1 + transformed.y * 1.7 + swayOrigin.z) * 0.6 + gust * 0.8);
  transformed.z += uSway * swayLift * 0.5 * sin(uTime * 1.7 + transformed.x * 1.3 + swayOrigin.x);`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
${GLSL_COMMON}
varying vec3 vWorld;
${options.fragmentHead ?? ""}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
${options.dissolve === "ground" ? "if (groundDissolved(vWorld.xz)) discard;" : "if (uReveal < 0.999 && objectDissolved(vWorld)) discard;"}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
${options.diffuse ?? ""}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
${options.emissive ?? ""}`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
${options.cloud === false ? "" : "reflectedLight.directDiffuse *= 1.0 - 0.52 * cloudShade(vWorld.xz);"}
${options.fragment ?? ""}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
gl_FragColor.a = ${flag.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => `world-${options.key}`;
  return material;
}

export const color = (hex: number) => new Color(hex);
