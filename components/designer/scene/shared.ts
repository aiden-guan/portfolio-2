import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  MeshLambertMaterial,
  OneFactor,
  ShaderChunk,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from "three";

// What every material in the world shares: the clock, the drift of the cloud
// shadows across the land, the island's dissolving edge, and the hover/flag
// channel the post pass reads from alpha.

export const uniforms = {
  uTime: { value: 0 },
  uCloud: { value: new Vector2(0, 0) },
  uCloudAmount: { value: 1 },
  uReveal: { value: 0 },
  uNight: { value: 0 },
  /** How far a shadow's edge spreads, in pixels of the picture (0: as sharp as the shadow map). */
  uShadowSoft: { value: 1.15 },
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

// The shadow lookup every world material uses. The stock filter turns its
// few taps by the screen pixel, which crawls as the camera moves and leaves
// a hard stair at this resolution; this one reads a fixed ring of taps about
// a pixel of the picture wide (whatever the zoom), so a shadow's edge comes
// out as a short, still falloff the post pass dithers. Each tap's depth is
// slid along the surface it sits on, so the wider footprint can't shadow a
// floor by itself.
const SOFT_GET_SHADOW = /* glsl */ `
const vec2 SOFT_SHADOW_TAPS[12] = vec2[12](
  vec2(0.0, 0.0), vec2(0.5, 0.0), vec2(-0.25, 0.43), vec2(-0.25, -0.43),
  vec2(0.87, 0.5), vec2(0.0, 1.0), vec2(-0.87, 0.5), vec2(-0.87, -0.5), vec2(0.0, -1.0), vec2(0.87, -0.5),
  vec2(0.35, 0.2), vec2(-0.35, -0.2)
);
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  // derivatives first, while every pixel of the quad is still here
  vec3 dx = dFdx( shadowCoord.xyz );
  vec3 dy = dFdy( shadowCoord.xyz );
  bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
  if ( !inFrustum || shadowCoord.z > 1.0 ) return 1.0;
  float pixel = min( length( dx.xy ), length( dy.xy ) );
  float radius = max( shadowRadius / shadowMapSize.x, pixel * uShadowSoft );
  // how depth runs across this surface in the shadow map
  float det = dx.x * dy.y - dx.y * dy.x;
  vec2 slope = abs( det ) > 1e-14 ? vec2( dx.z * dy.y - dx.y * dy.z, dx.x * dy.z - dx.z * dy.x ) / det : vec2( 0.0 );
  slope = clamp( slope, vec2( -4.0 ), vec2( 4.0 ) );
  float lit = 0.0;
  for ( int i = 0; i < 12; i ++ ) {
    vec2 o = SOFT_SHADOW_TAPS[ i ] * radius;
    lit += texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z + dot( slope, o ) ) );
  }
  return mix( 1.0, lit / 12.0, shadowIntensity );
}
`;

// three's own shadow chunk with that lookup in place of its filtered one; if
// a future three moves the code this looks for, the stock chunk stays.
const SHADOW_CHUNK = (() => {
  const chunk = ShaderChunk.shadowmap_pars_fragment;
  const start = chunk.indexOf("float getShadow( sampler2DShadow shadowMap");
  const end = start < 0 ? -1 : chunk.indexOf("#elif defined( SHADOWMAP_TYPE_VSM )", start);
  if (start < 0 || end < 0) return chunk;
  return `uniform float uShadowSoft;\n${chunk.slice(0, start)}${SOFT_GET_SHADOW}\n${chunk.slice(end)}`;
})();

// Glints on what faces up: short dashes along the view that wink in and out,
// fewer and dimmer by moonlight.
const SHIMMER = (amount: number) => /* glsl */ `
{
  vec3 flatness = cross(dFdx(vWorld), dFdy(vWorld));
  float up = abs(flatness.y) / max(length(flatness), 1e-6);
  vec2 cell = floor(vec2((vWorld.x - vWorld.z) / 0.16, (vWorld.x + vWorld.z) / 0.06));
  float wink = hash12(cell + floor(uTime * 1.5 + hash12(cell) * 7.0));
  totalEmissiveRadiance += vec3(step(0.986, wink) * step(0.95, up) * ${amount.toFixed(3)} * (1.0 - 0.6 * uNight));
}`;

type Options = {
  flag?: number;
  sway?: number;
  /** model-space height below which sway is zero */
  swayFrom?: number;
  /** sway by the geometry's own `sway` attribute (see Voxels.geometry), so
   * `sway` is how far a point that gives fully moves, instead of by height */
  swayAttribute?: boolean;
  /** pixel-sized glints that wink on whatever faces up, like sun on water:
   * how bright, 0 to 1 */
  shimmer?: number;
  /** ground dissolves at the island's edge too; objects only arrive */
  dissolve?: "ground" | "object";
  cloud?: boolean;
  /** extra fragment code run after the lights, with `vWorld` available */
  fragment?: string;
  /** extra declarations for the fragment shader */
  fragmentHead?: string;
  /** extra declarations for the vertex shader, and code that moves
   * `transformed` (in the model's own space) after the sway */
  vertexHead?: string;
  vertex?: string;
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
varying vec3 vWorld;
${options.swayAttribute ? "attribute float sway;" : ""}
${options.vertexHead ?? ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 swayOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec3 swayOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
  float swayLift = ${options.swayAttribute ? "sway" : "max(0.0, transformed.y - uSwayFrom)"};
  float gust = sin(uTime * 1.3 + swayOrigin.x * 0.21 + swayOrigin.z * 0.17);
  transformed.x += uSway * swayLift * (sin(uTime * 2.1 + transformed.y * 1.7 + swayOrigin.z) * 0.6 + gust * 0.8);
  transformed.z += uSway * swayLift * 0.5 * sin(uTime * 1.7 + transformed.x * 1.3 + swayOrigin.x);
${options.vertex ?? ""}`,
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
      .replace("#include <shadowmap_pars_fragment>", SHADOW_CHUNK)
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
${options.shimmer ? SHIMMER(options.shimmer) : ""}
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

// —— light in the air

/** A window's opening in the world: bottom left, bottom right, top right, top left. */
export type Aperture = readonly [Vector3, Vector3, Vector3, Vector3];

const SHAFT_VERTEX = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const SHAFT_FRAGMENT = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor;
uniform float uStrength;
uniform vec4 uPlanes[6];
uniform vec3 uOrigin;
uniform vec3 uU;
uniform vec3 uV;
uniform vec3 uNormal;
uniform vec3 uDir;
uniform float uFloor;
uniform float uThickness;
uniform vec2 uPanes;
uniform float uBar;
varying vec3 vPos;

// how much lit air there is at a point: carried back along the light to the
// window, where it came through (u, v) and how far down it has come (s)
float air(vec3 x) {
  float back = dot(x - uOrigin, uNormal) / dot(uDir, uNormal);
  vec3 w = x - back * uDir;
  vec2 uv = vec2(dot(w - uOrigin, uU) / dot(uU, uU), dot(w - uOrigin, uV) / dot(uV, uV));
  float s = clamp(back / max((w.y - uFloor) / -uDir.y, 0.001), 0.0, 1.0);
  // soft sides, and the window's bars carried along as darker stripes
  vec2 side = smoothstep(vec2(0.0), vec2(0.09), uv) * smoothstep(vec2(0.0), vec2(0.09), 1.0 - uv);
  vec2 pane = fract(uv * uPanes);
  vec2 bars = smoothstep(vec2(0.0), vec2(uBar), pane) * smoothstep(vec2(0.0), vec2(uBar), 1.0 - pane);
  float d = side.x * side.y * mix(0.3, 1.0, bars.x * bars.y);
  // strongest coming in, thinning on the way down, the air stirring slowly
  d *= smoothstep(0.0, 0.05, s) * (1.0 - 0.5 * s);
  d *= 0.82 + 0.36 * vnoise(vec2(dot(x, normalize(uU)) * 2.6 + uTime * 0.07, x.y * 3.4 - uTime * 0.13));
  return d;
}

void main() {
  vec3 ray = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(vPos - cameraPosition);
  // where the line of sight through this point comes into the shaft and leaves it
  float tIn = -1e9, tOut = 1e9;
  for (int i = 0; i < 6; i++) {
    float denom = dot(uPlanes[i].xyz, ray);
    if (abs(denom) < 1e-6) continue;
    float t = -(dot(uPlanes[i].xyz, vPos) + uPlanes[i].w) / denom;
    if (denom < 0.0) tIn = max(tIn, t);
    else tOut = min(tOut, t);
  }
  // only the side it comes in through draws, so each line of sight counts once
  if (tOut - tIn < 0.0005 || abs(tIn) > abs(tOut)) discard;
  float from = max(tIn, 0.0);
  float len = tOut - from;
  float sum = 0.0;
  for (int i = 0; i < 10; i++) sum += air(vPos + ray * (from + (float(i) + 0.5) * 0.1 * len));
  gl_FragColor = vec4(uColor * uStrength * 9.0 * (sum * 0.1) * (len / uThickness), 1.0);
}`;

/**
 * A material for a shaft of light through a window: a volume, not a sheet.
 * Put it on a mesh whose faces close round the light's path (the opening
 * carried along `dir` down to the floor; which way its faces wind doesn't
 * matter), at the room's origin, and set `uniforms.uStrength.value` each
 * frame as the room fades it in. Each line of sight adds the light it passes
 * through, so the shaft thickens where you look along it, has soft sides,
 * carries the window's bars as darker stripes, thins towards the floor and
 * stirs slowly; the post pass dithers the falloff. It adds to what's behind
 * it and leaves the post pass's flags alone.
 */
export function shaftMaterial(
  opening: Aperture,
  dir: Vector3,
  { color = 0xfff0d2, strength = 0, floor = 0, panes = [1, 1] as [number, number], bar = 0.05 } = {},
) {
  const [o, b, , d] = opening;
  const along = dir.clone().normalize();
  const far = opening.map((c) => c.clone().addScaledVector(along, (c.y - floor - 0.012) / -along.y));
  const corners = [...opening, ...far];
  const centre = corners.reduce((sum, c) => sum.add(c), new Vector3()).multiplyScalar(1 / corners.length);
  const faces: Array<[number, number, number]> = [[0, 1, 2], [4, 5, 6], [0, 1, 5], [1, 2, 6], [2, 3, 7], [3, 0, 4]];
  const planes = faces.map(([i, j, k]) => {
    const n = new Vector3().subVectors(corners[j], corners[i]).cross(new Vector3().subVectors(corners[k], corners[i])).normalize();
    // facing out of the shaft
    if (n.dot(new Vector3().subVectors(centre, corners[i])) > 0) n.negate();
    return new Vector4(n.x, n.y, n.z, -n.dot(corners[i]));
  });
  const u = b.clone().sub(o);
  const v = d.clone().sub(o);
  return new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uColor: { value: new Color(color) },
      uStrength: { value: strength },
      uPlanes: { value: planes },
      uOrigin: { value: o.clone() },
      uU: { value: u },
      uV: { value: v },
      uNormal: { value: u.clone().cross(v).normalize() },
      uDir: { value: along },
      uFloor: { value: floor },
      uThickness: { value: (u.length() + v.length()) / 2 },
      uPanes: { value: new Vector2(panes[0], panes[1]) },
      uBar: { value: bar },
    },
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
}

/** A material for things that give their own light: a screen, an LED, a lit
 * window. `day` and `night` are how many times its own colour it shines by day
 * and in full dark. However hot it runs, the post pass keeps its hue (a screen
 * stays blue and its lines stay legible), and at night lets it throw a little
 * light on the pixels around it. */
export function glowMaterial({ key, day = 0.6, night = 2.4, flag = FLAG.solid }: { key: string; day?: number; night?: number; flag?: number }) {
  return worldMaterial({
    key,
    flag,
    cloud: false,
    fragment: `totalEmissiveRadiance = diffuseColor.rgb * (${day.toFixed(3)} + uNight * ${(night - day).toFixed(3)});`,
  });
}
