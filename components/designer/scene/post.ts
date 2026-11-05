// The post pass shared by the island (scene/engine.ts) and the game
// (play/game/view.ts): both render the scene at a low art resolution into a
// colour target with depth, then draw it to the screen through this.

export const POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** What a caller can add to the post pass's uniforms to turn on its optional
 * parts. Left out (as the island leaves them), each one stays off. */
export type PostExtras = {
  /** Contact shadow strength, 0 to 1. */
  uAo: { value: number };
  /** World units across one art pixel (1 / pixels per unit). */
  uUnit: { value: number };
  /** World units from the camera's near plane to its far one. */
  uDepthSpan: { value: number };
};

// The pixel-art pass. Reads the scene rendered at art resolution and:
// paints the paper (and at night, the sky: stars and a moon) where nothing was
// drawn; tucks a soft contact shadow under things that stand on others; lets
// lit things at night throw a little light onto the pixels around them; eases
// what's hotter than white back into range without losing its colour; darkens
// the rim of solid things where they stand in front of something far away;
// grades the scene to moonlight at night; snaps colour to a small set of
// levels with ordered dither, except across flat surfaces, which keep one
// calm colour until their light actually changes; and eases a one-pixel rim
// around whatever is pointed at.
export const POST_FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tMask;
uniform sampler2D tMaskDepth;
uniform vec2 uRes;
uniform vec2 uSnap;
uniform float uHasMask;
uniform float uHover;
uniform float uLevels;
uniform float uNight;
uniform float uTime;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uRing;
uniform float uAo;
uniform float uUnit;
uniform float uDepthSpan;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// for stars: whole-pixel inputs make the hash above fall into rows
float starHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float masked(vec2 uv) {
  float hit = step(0.5, texture2D(tMask, uv).r);
  float visible = step(texture2D(tMaskDepth, uv).r, texture2D(tDepth, uv).r + 0.0004);
  return hit * visible;
}

// —— contact shadow
// How much of the open air over a surface the things right beside it take
// up, read off the depth of the pixels around: under a chair, at the foot of
// a wall, round a pair of shoes on the floor. The camera is orthographic, so
// a pixel's position is its place on the grid and its depth, in world units.
const int AO_TAPS = 12;
const vec2 AO_KERNEL[12] = vec2[12](
  vec2(0.26, 0.07), vec2(-0.07, 0.26), vec2(-0.26, -0.07), vec2(0.07, -0.26),
  vec2(0.42, 0.42), vec2(-0.42, 0.42), vec2(-0.42, -0.42), vec2(0.42, -0.42),
  vec2(0.92, 0.38), vec2(-0.38, 0.92), vec2(-0.92, -0.38), vec2(0.38, -0.92)
);
// the reach of the shadow, in world units
const float AO_REACH = 0.4;

float contact(vec2 uv, float depth, vec2 texel) {
  float zc = depth * uDepthSpan;
  float zl = texture2D(tDepth, uv - vec2(texel.x, 0.0)).r * uDepthSpan;
  float zr = texture2D(tDepth, uv + vec2(texel.x, 0.0)).r * uDepthSpan;
  float zd = texture2D(tDepth, uv - vec2(0.0, texel.y)).r * uDepthSpan;
  float zu = texture2D(tDepth, uv + vec2(0.0, texel.y)).r * uDepthSpan;
  // the surface's slope, from whichever neighbour carries it on
  float a = abs(zr - zc) < abs(zc - zl) ? zr - zc : zc - zl;
  float b = abs(zu - zc) < abs(zc - zd) ? zu - zc : zc - zd;
  vec3 n = normalize(vec3(a, b, uUnit));
  float reach = AO_REACH / uUnit;
  float shut = 0.0;
  for (int i = 0; i < AO_TAPS; i++) {
    vec2 o = floor(AO_KERNEL[i] * reach + 0.5);
    float zs = texture2D(tDepth, uv + o * texel).r * uDepthSpan;
    vec3 v = vec3(o * uUnit, zc - zs);
    float d = length(v);
    if (d < 0.0001) continue;
    float up = dot(n, v) / d;
    shut += max(0.0, up - 0.12) * (1.0 - smoothstep(AO_REACH * 0.45, AO_REACH, d));
  }
  return 1.0 - uAo * clamp(shut * (2.4 / float(AO_TAPS)), 0.0, 1.0);
}

// —— night glow
// Lit things at night cast a little light onto the pixels around them, in
// their own colour: added before the levels, so the levels' dither draws the
// falloff.
const int GLOW_TAPS = 32;
const vec2 GLOW_KERNEL[32] = vec2[32](
  vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(-1.0, 0.0), vec2(0.0, -1.0),
  vec2(1.0, 1.0), vec2(-1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0),
  vec2(2.0, 0.0), vec2(0.0, 2.0), vec2(-2.0, 0.0), vec2(0.0, -2.0),
  vec2(2.0, 1.0), vec2(1.0, 2.0), vec2(-1.0, 2.0), vec2(-2.0, 1.0),
  vec2(-2.0, -1.0), vec2(-1.0, -2.0), vec2(1.0, -2.0), vec2(2.0, -1.0),
  vec2(2.0, 2.0), vec2(-2.0, 2.0), vec2(-2.0, -2.0), vec2(2.0, -2.0),
  vec2(3.0, 0.0), vec2(0.0, 3.0), vec2(-3.0, 0.0), vec2(0.0, -3.0),
  vec2(3.0, 2.0), vec2(-2.0, 3.0), vec2(-3.0, -2.0), vec2(2.0, -3.0)
);

vec3 nightGlow(vec2 uv, vec2 texel) {
  vec3 light = vec3(0.0);
  for (int i = 0; i < GLOW_TAPS; i++) {
    vec2 o = GLOW_KERNEL[i];
    vec3 c = texture2D(tColor, uv + o * texel).rgb;
    float m = max(c.r, max(c.g, c.b));
    float hot = smoothstep(1.02, 2.4, m);
    if (hot <= 0.0) continue;
    float r = length(o);
    float w = (1.0 - r / 4.2);
    // the source's own hue at full value, a touch paler than the source
    light += mix(c / m, vec3(1.0), 0.18) * hot * w * w;
  }
  return light * 0.07;
}

// Past nearly white, bright things ease into range instead of clipping hard.
// Pale ones (the sun, a white bulb) burn to white a channel at a time, the
// way film takes them; strongly coloured ones keep their colour, so a lit
// screen stays blue and its lines legible, and a lantern stays amber.
vec3 ease(vec3 c) {
  return mix(c, 0.88 + 0.12 * (1.0 - exp(-(c - 0.88) / 0.12)), step(0.88, c));
}
vec3 shoulder(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  if (m <= 0.88) return c;
  float k = ease(vec3(m)).x;
  float tint = (m - min(c.r, min(c.g, c.b))) / m;
  return mix(ease(c), c * (k / m), smoothstep(0.3, 0.6, tint));
}

// —— levels
// the width, in pixels, that a dithered step between two levels may spread
// over on a flat surface, and how far (at most) the step is sharpened to get there
const float DITHER_WIDTH = 2.6;
const float SHARP_MAX = 24.0;
// change in perceived lightness per pixel too small to be a ramp
const float NOISE_FLOOR = 0.004;
// how much fine texture still counts as a flat surface (0 to 1)
const float CALM_GRAIN = 0.5;
// flat surfaces take their lightness from twice as many levels: with no grain
// to hide in, a whole wall or a sun rounding half a coarse level reads as dull
const float CALM_LEVELS = 2.0;
// differences (in levels) that melt into a flat surface, fully and not at all
const float SETTLE_NEAR = 0.35;
const float SETTLE_FAR = 0.75;

// Perceived lightness of a raw scene pixel, for judging where tone runs.
float tone(vec2 uv) {
  return sqrt(max(dot(texture2D(tColor, uv).rgb, LUMA), 0.0));
}
// How steadily tone runs through the middle of three samples: a ramp has
// both sides agree; an edge, a speck or a voxel's own grain doesn't.
float ramp(float a, float b, float c) {
  float l = b - a, r = c - b;
  return l * r > 0.0 ? min(abs(l), abs(r)) : 0.0;
}

// A painter's simplification before the levels are taken. Around each pixel:
// how much fine texture there is (what's left of opposite neighbours once a
// steady ramp through them is taken out: wood grain, grass, painted noise,
// but not light falling off, and not a hard edge), and the pixel with its
// smallest differences melted into the pixels around it. Textured surfaces
// keep the classic dither, which is what makes them sparkle; flat ones
// settle, so a voxel's grain can't split a painted wall into blotches where
// it happens to straddle a level.
const vec2 SETTLE_KERNEL[6] = vec2[6](
  vec2(2.0, 0.0), vec2(0.0, 2.0), vec2(2.0, 2.0), vec2(2.0, -2.0), vec2(4.0, 0.0), vec2(0.0, 4.0)
);
float apart(vec3 a, vec3 b) {
  vec3 d = abs(a - b) * uLevels;
  return max(d.r, max(d.g, d.b));
}
vec3 settle(vec2 uv, vec2 texel, vec3 centre, out float grain) {
  vec3 c0 = sqrt(max(centre, vec3(0.0)));
  vec3 sum = centre;
  float weight = 1.0;
  grain = 0.0;
  for (int i = 0; i < 6; i++) {
    vec2 o = SETTLE_KERNEL[i] * texel;
    vec3 a = texture2D(tColor, uv + o).rgb;
    vec3 b = texture2D(tColor, uv - o).rgb;
    vec3 sa = sqrt(max(a, vec3(0.0)));
    vec3 sb = sqrt(max(b, vec3(0.0)));
    float bend = apart((sa + sb) * 0.5, c0);
    grain = max(grain, smoothstep(0.22, 0.4, bend) * (1.0 - smoothstep(1.4, 2.2, bend)));
    float wa = 1.0 - smoothstep(SETTLE_NEAR, SETTLE_FAR, apart(sa, c0));
    float wb = 1.0 - smoothstep(SETTLE_NEAR, SETTLE_FAR, apart(sb, c0));
    sum += a * wa + b * wb;
    weight += wa + wb;
  }
  return sum / weight;
}

// For flat surfaces: ordered dither on lightness alone, sharpened where
// nothing changes. Only how light or dark a pixel is snaps to the levels (the
// finer set); its hue stays its own. Across an evenly lit wall each pixel
// takes the nearest level, so it reads as one colour the way a painter would
// keep it; where light falls off or a shadow edges in, the pattern comes back
// over a few pixels, the way a painter dithers a ramp. sharp = 1 is the plain
// dither.
vec3 quantize(vec3 c, float threshold, float sharp) {
  float levels = uLevels * CALM_LEVELS;
  float y = dot(c, LUMA);
  float v = y * levels;
  float base = floor(v);
  float f = clamp((v - base - 0.5) * sharp + 0.5, 0.0, 1.0);
  float level = (base + step(1.0 - f, threshold)) / levels;
  return clamp(c + (level - y), 0.0, 1.0);
}

// For textured surfaces: the classic ordered dither, each channel on its own.
vec3 quantizeRGB(vec3 c, float threshold) {
  return floor(c * uLevels + threshold) / uLevels;
}

void main() {
  vec2 px = floor(vUv * uRes);
  vec2 texel = 1.0 / uRes;
  vec2 uv = (px + 0.5) * texel;
  float depth = texture2D(tDepth, uv).r;
  vec4 src = texture2D(tColor, uv);
  // the pattern belongs to the world, not the screen, so it holds still as the camera moves
  float threshold = bayer8(px + uSnap);
  vec3 glow = uNight > 0.01 ? nightGlow(uv, texel) * uNight : vec3(0.0);
  vec3 col;

  if (depth >= 0.99999) {
    float sky = smoothstep(0.25, 1.0, vUv.y);
    col = mix(uBgBottom, uBgTop, sky);
    col += (hash(px + uSnap + 7.0) - 0.5) * (2.0 / 255.0);
    if (uNight > 0.01) {
      // many faint stars, a few bright ones with short arms; none low down
      vec2 cell = px + uSnap;
      float s = starHash(cell);
      float above = smoothstep(0.24, 0.42, vUv.y);
      float twinkle = 0.62 + 0.38 * sin(uTime * (0.7 + s * 2.4) + s * 50.0);
      float faint = step(0.9925, s) * mix(0.25, 0.5, fract(s * 97.0));
      float arms = max(max(starHash(cell + vec2(1.0, 0.0)), starHash(cell - vec2(1.0, 0.0))), max(starHash(cell + vec2(0.0, 1.0)), starHash(cell - vec2(0.0, 1.0))));
      float bright = s > 0.99935 ? 1.0 : (arms > 0.99935 ? 0.38 : 0.0);
      col = mix(col, vec3(1.0, 0.97, 0.88), max(faint, bright) * twinkle * above * uNight);
      // the moon, fixed in the sky the way the real one is
      vec2 mc = vec2(0.82, 0.79) * uRes;
      float r = max(7.0, uRes.y * 0.034);
      float d = length(px + 0.5 - mc);
      float bite = length(px + 0.5 - (mc + vec2(r * 0.42, r * 0.3)));
      // the halo only exists near the moon: tested explicitly, because a
      // threshold that is merely tiny still lights one pixel in every 8x8
      if (d < r * 2.8) {
        float halo = 1.0 - smoothstep(r, r * 2.8, d);
        col = mix(col, vec3(0.36, 0.44, 0.7), step(bayer8(px) + 0.02, halo * 0.5) * uNight * 0.45);
      }
      if (d < r && bite > r * 0.9) col = mix(col, vec3(1.0, 0.95, 0.8), uNight);
      // light that spills past the edge of things onto the sky, as a dither
      float spill = dot(glow, LUMA);
      if (spill > 0.002) {
        vec3 tint = toSRGB(glow / max(max(glow.r, max(glow.g, glow.b)), 0.0001));
        col = mix(col, max(col, tint), step(threshold + 0.001, min(spill * 0.9, 0.6)));
      }
    }
  } else {
    float grain;
    vec3 settled = settle(uv, texel, src.rgb, grain);
    bool calm = grain < CALM_GRAIN;
    vec3 lin = calm ? settled : src.rgb;
    if (uAo > 0.0 && uUnit > 0.0) {
      // lit things (screens, lamps) shine through their own contact shadow
      float m = max(lin.r, max(lin.g, lin.b));
      lin *= mix(contact(uv, depth, texel), 1.0, smoothstep(0.9, 1.6, m));
    }
    lin = shoulder(lin + glow);
    col = toSRGB(lin);
    if (src.a > 0.75) {
      float dl = texture2D(tDepth, uv - vec2(texel.x, 0.0)).r;
      float dr = texture2D(tDepth, uv + vec2(texel.x, 0.0)).r;
      float du = texture2D(tDepth, uv + vec2(0.0, texel.y)).r;
      float dd = texture2D(tDepth, uv - vec2(0.0, texel.y)).r;
      float far = max(max(dl, dr), max(du, dd)) - depth;
      if (far > 0.0022) col *= mix(0.6, 0.55, uNight);
    }
    float luma = dot(col, LUMA);
    col = clamp(mix(vec3(luma), col, 1.12), 0.0, 1.0);
    // moonlight: cool and a little grey, except where something warm is lit
    if (uNight > 0.01) {
      float l = dot(col, LUMA);
      float warm = clamp((col.r - col.b) * 2.5, 0.0, 1.0) * smoothstep(0.1, 0.3, l);
      vec3 moonlit = vec3(l) * vec3(0.74, 0.88, 1.22) + vec3(0.0, 0.012, 0.035);
      col = mix(col, moonlit, 0.45 * uNight * (1.0 - warm));
    }
    if (calm) {
      // how fast tone runs here, in levels per pixel, from the raw scene two
      // pixels either way; a flat wall and a voxel's grain read as still
      vec2 r2 = texel * 2.0;
      float t0 = tone(uv);
      float run = max(
        ramp(tone(uv - vec2(r2.x, 0.0)), t0, tone(uv + vec2(r2.x, 0.0))),
        ramp(tone(uv - vec2(0.0, r2.y)), t0, tone(uv + vec2(0.0, r2.y)))
      ) * 0.5;
      run = max(0.0, run - NOISE_FLOOR) * uLevels * CALM_LEVELS;
      float sharp = clamp(1.0 / max(run * DITHER_WIDTH, 0.001), 1.0, SHARP_MAX);
      col = quantize(col, threshold, sharp);
    } else {
      col = quantizeRGB(col, threshold);
    }
  }

  if (uHasMask > 0.5 && uHover > 0.001) {
    float m = masked(uv);
    float near = max(
      max(masked(uv - vec2(texel.x, 0.0)), masked(uv + vec2(texel.x, 0.0))),
      max(masked(uv + vec2(0.0, texel.y)), masked(uv - vec2(0.0, texel.y)))
    );
    if (m < 0.5 && near > 0.5) col = mix(col, uRing, 0.92 * uHover);
    else if (m > 0.5) col = mix(col, vec3(1.0), 0.07 * uHover);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
