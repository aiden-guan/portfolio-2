import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DepthTexture,
  DoubleSide,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  LinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoBlending,
  NoColorSpace,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RectAreaLight,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  type BufferGeometry,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { corgi, person, OUTFITS } from "../scene/kit";
import type { Quad } from "./pin";

// The room the island was playing in: a desk at night, shot like a film. The
// lamp is the key light, the monitor spills cool light over the desk and
// whatever is on it, the window fills from the right with the night outside
// (the Campanile lit), and the fairy lights warm the wall above. The monitor's
// picture is the page itself, pinned on top of this canvas. Everything is made
// in code, in metres: x to the right, y up, z towards whoever is sitting there.

const DESK = 0.74;
/** The panel: 27 inches at 16:9, and the store page is 1600 × 900 on it. */
export const SCREEN = { w: 0.5977, h: 0.3362, x: 0, y: 1.03, z: -0.23, px: 1600, py: 900 };
const WALL = -0.62;
/** The lens, as a vertical field of view in degrees: about a 33 mm on full frame. */
export const LENS = 40;
const NEAR = 0.02;
const FAR = 12;
/** The camera's sensor height in metres (full frame), for the depth of field. */
const SENSOR = 0.024;

export type Pose = { position: Vector3; target: Vector3; fov: number; roll: number };

export const makePose = (): Pose => ({ position: new Vector3(), target: new Vector3(), fov: LENS, roll: 0 });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!, w, h);
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// —— textures, painted once while the trailer plays

function walnut(seed: number) {
  const random = rng(seed);
  return paint(1024, 512, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#4e301d");
    base.addColorStop(0.5, "#452a19");
    base.addColorStop(1, "#4c2f1c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i += 1) {
      const y0 = random() * h;
      const amp = 2 + random() * 9;
      const freq = 0.0015 + random() * 0.005;
      const phase = random() * Math.PI * 2;
      const dark = random() < 0.62;
      ctx.strokeStyle = dark ? `rgba(30, 16, 8, ${0.06 + random() * 0.2})` : `rgba(160, 108, 66, ${0.04 + random() * 0.12})`;
      ctx.lineWidth = 0.5 + random() * 2.4;
      ctx.beginPath();
      for (let x = -8; x <= w + 8; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.3 + phase * 1.7) * amp * 0.25;
        if (x < 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function noiseTexture(seed: number, color: string, spread: number, size = 256, srgb = true) {
  const random = rng(seed);
  return paint(size, size, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (random() - 0.5) * spread;
      image.data[i] += n;
      image.data[i + 1] += n;
      image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
  }, srgb);
}

// What the window looks out on: Berkeley at night, the hills dark behind, the
// Campanile floodlit in the left pane (the one the chair can see past the
// monitor), the city's lights at the foot of the hills.
function nightView() {
  const random = rng(7);
  return paint(1024, 1024, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#03060f");
    sky.addColorStop(0.42, "#0b1430");
    sky.addColorStop(0.7, "#1a2550");
    sky.addColorStop(1, "#2e2d4a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i += 1) {
      const x = random() * w, y = h * (0.28 + random() * 0.32);
      ctx.fillStyle = `rgba(255, 246, 225, ${0.18 + random() * 0.5})`;
      const s = random() < 0.08 ? 2.4 : 1.4;
      ctx.fillRect(x, y, s, s);
    }
    // a thin moon, the one the island has after dark
    ctx.save();
    ctx.translate(w * 0.1, h * 0.37);
    const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, 80);
    halo.addColorStop(0, "rgba(210, 220, 255, 0.28)");
    halo.addColorStop(1, "rgba(210, 220, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-80, -80, 160, 160);
    ctx.fillStyle = "#fff1d0";
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(7, -5, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the hills, then the city at their foot
    const ridge = (base: number, amp: number, color: string, seed: number) => {
      const r = rng(seed);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 12) {
        const y = base - amp * (0.55 + 0.45 * Math.sin(x * 0.005 + seed)) - r() * amp * 0.1;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    };
    ridge(h * 0.64, 110, "#0b1129", 3);
    ridge(h * 0.72, 60, "#080c1d", 5);
    const haze = ctx.createLinearGradient(0, h * 0.66, 0, h);
    haze.addColorStop(0, "rgba(255, 160, 90, 0)");
    haze.addColorStop(1, "rgba(255, 160, 90, 0.2)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    // lights in the hills, then the city's: warm windows and cool street lamps
    for (let i = 0; i < 50; i += 1) {
      const x = random() * w, y = h * (0.56 + random() * 0.14);
      ctx.fillStyle = `rgba(255, 210, 150, ${0.3 + random() * 0.45})`;
      ctx.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 300; i += 1) {
      const x = random() * w;
      const y = h * (0.72 + random() * 0.28);
      const near = (y - h * 0.72) / (h * 0.28);
      const r = 1.2 + near * 5 * random();
      const warm = random() < 0.8;
      const a = 0.3 + random() * 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, warm ? `rgba(255, 205, 140, ${a})` : `rgba(200, 220, 255, ${a})`);
      g.addColorStop(0.55, warm ? `rgba(255, 180, 110, ${a * 0.4})` : `rgba(170, 200, 255, ${a * 0.35})`);
      g.addColorStop(1, "rgba(255, 180, 110, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the Campanile, floodlit: a pale shaft lit from the left, the belfry's
    // arches glowing, the clock, the spire, and the haze its lights make
    const cx = w * 0.27, top = h * 0.5, base = h * 0.86, half = 22;
    const towerGlow = ctx.createRadialGradient(cx, top + 80, 4, cx, top + 80, 150);
    towerGlow.addColorStop(0, "rgba(255, 220, 170, 0.16)");
    towerGlow.addColorStop(1, "rgba(255, 220, 170, 0)");
    ctx.fillStyle = towerGlow;
    ctx.fillRect(cx - 150, top - 80, 300, 320);
    const lit = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    lit.addColorStop(0, "#d9c9a6");
    lit.addColorStop(0.55, "#c8b690");
    lit.addColorStop(0.56, "#8f8068");
    lit.addColorStop(1, "#7c6f5a");
    ctx.fillStyle = lit;
    ctx.fillRect(cx - half, top + 36, half * 2, base - top - 36);
    // the belfry: a darker band with three tall arches, warm inside
    ctx.fillStyle = "#6f624d";
    ctx.fillRect(cx - half, top + 44, half * 2, 46);
    for (let i = 0; i < 3; i += 1) {
      const x = cx - half + 6 + i * 13;
      ctx.fillStyle = "#ffd690";
      ctx.fillRect(x, top + 52, 6, 34);
      ctx.beginPath();
      ctx.arc(x + 3, top + 52, 3, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = lit;
    ctx.fillRect(cx - half - 3, top + 36, half * 2 + 6, 8);
    ctx.fillRect(cx - half - 3, top + 90, half * 2 + 6, 6);
    ctx.fillStyle = "#f4e8cc";
    ctx.beginPath();
    ctx.arc(cx, top + 116, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d5140";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, top + 116);
    ctx.lineTo(cx, top + 110);
    ctx.moveTo(cx, top + 116);
    ctx.lineTo(cx + 4.5, top + 118);
    ctx.stroke();
    // the spire, lit on the side the floodlights reach
    ctx.fillStyle = "#cdbb94";
    ctx.beginPath();
    ctx.moveTo(cx - half - 2, top + 36);
    ctx.lineTo(cx, top - 10);
    ctx.lineTo(cx, top + 36);
    ctx.fill();
    ctx.fillStyle = "#857659";
    ctx.beginPath();
    ctx.moveTo(cx, top - 10);
    ctx.lineTo(cx + half + 2, top + 36);
    ctx.lineTo(cx, top + 36);
    ctx.fill();
    ctx.fillStyle = "#d9c393";
    ctx.fillRect(cx - 0.75, top - 18, 1.5, 9);
    // trees in front of its foot, and the campus's lamps between them
    for (let i = 0; i < 70; i += 1) {
      const x = cx + (random() - 0.5) * 460;
      const y = h * (0.84 + random() * 0.1);
      const r = 14 + random() * 30;
      ctx.fillStyle = `rgba(6, 10, 22, ${0.75 + random() * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 26; i += 1) {
      const x = cx + (random() - 0.5) * 420, y = h * (0.86 + random() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
      g.addColorStop(0, "rgba(255, 214, 160, 0.8)");
      g.addColorStop(1, "rgba(255, 214, 160, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 5, y - 5, 10, 10);
    }
  });
}

function spine(lines: string[], background: string, ink: string, width = 512, height = 256) {
  return paint(width, height, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(h * 0.24)}px Geist, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(lines[0], w * 0.08, h * 0.36);
    if (lines[1]) {
      ctx.font = `500 ${Math.round(h * 0.12)}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.globalAlpha = 0.8;
      ctx.fillText(lines[1], w * 0.08, h * 0.66);
      ctx.globalAlpha = 1;
    }
  });
}

function stickyNote(text: string[], color: string, seed: number) {
  const random = rng(seed);
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,0.14)");
    shade.addColorStop(0.18, "rgba(0,0,0,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ctx.strokeStyle = "#1d2a5c";
    ctx.textBaseline = "middle";
    ctx.font = "46px 'Marker Felt', 'Noteworthy', 'Bradley Hand', cursive";
    ctx.lineWidth = 4;
    ctx.lineCap = ctx.lineJoin = "round";
    text.forEach((line, i) => {
      ctx.save();
      ctx.translate(26, 80 + i * 62);
      ctx.rotate((random() - 0.5) * 0.06);
      // an arrow is drawn the way a pen draws one: the marker fonts don't
      // have the glyph, and finding one that does stalls the page
      let words = line;
      if (line.startsWith("> ")) {
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.quadraticCurveTo(18, -2, 34, 1);
        ctx.moveTo(25, -7);
        ctx.lineTo(35, 1);
        ctx.lineTo(25, 9);
        ctx.stroke();
        ctx.translate(48, 0);
        words = line.slice(2);
      }
      ctx.fillText(words, 0, 0);
      ctx.restore();
    });
  });
}

function lockScreen() {
  return paint(256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1b2a6b");
    g.addColorStop(0.55, "#4a2f7a");
    g.addColorStop(1, "#f08a32");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.font = "600 18px Geist, system-ui, sans-serif";
    ctx.fillText("Sunday, November 1", w / 2, 78);
    ctx.font = "700 78px Geist, system-ui, sans-serif";
    ctx.fillText("11:52", w / 2, 156);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.roundRect(14, 200, w - 28, 92, 18);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#1b1d22";
    ctx.font = "700 15px Geist, system-ui, sans-serif";
    ctx.fillText("esteem", 30, 226);
    ctx.font = "500 14px Geist, system-ui, sans-serif";
    ctx.fillText("Thanks for your purchase!", 30, 250);
    ctx.fillStyle = "#555a66";
    ctx.fillText("Aiden: Life of a Handsome…  $4.50", 30, 272);
  });
}

function pennant() {
  return paint(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#003262";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6f1e3";
    ctx.fillRect(0, 0, 34, h);
    ctx.fillStyle = "#fdb515";
    ctx.font = "italic 800 104px Georgia, 'Times New Roman', serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Cal", 74, h / 2 + 6);
  });
}

function snakeLeaf(seed: number) {
  const random = rng(seed);
  return paint(128, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    // a long blade, widest a third of the way up, coming to a point
    ctx.moveTo(w / 2, 0);
    ctx.bezierCurveTo(w * 0.98, h * 0.22, w * 0.96, h * 0.7, w * 0.62, h);
    ctx.lineTo(w * 0.38, h);
    ctx.bezierCurveTo(w * 0.04, h * 0.7, w * 0.02, h * 0.22, w / 2, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#c9b34a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2f5a2a";
    ctx.fillRect(w * 0.1, 0, w * 0.8, h);
    for (let y = 0; y < h; y += 9 + random() * 10) {
      ctx.fillStyle = random() < 0.5 ? "rgba(140, 180, 110, 0.45)" : "rgba(20, 40, 22, 0.45)";
      ctx.beginPath();
      ctx.ellipse(w / 2, y, w * 0.34, 2.5 + random() * 3, (random() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// A breath of steam: a thin, uneven streak, softest at its ends.
function wisp(seed: number) {
  const random = rng(seed);
  return paint(64, 256, (ctx, w, h) => {
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      const x = w / 2 + Math.sin(t * 5.5 + seed) * w * 0.16 + (random() - 0.5) * 4;
      const y = h * (0.92 - t * 0.84);
      const r = 5 + t * 12 + random() * 4;
      const a = Math.sin(t * Math.PI) * (0.1 + random() * 0.08);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, false);
}

function glowSprite(color: string) {
  return paint(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Contact shadows: the soft dark a thing leaves where it sits, in an alpha map.
function softShadow(round: boolean) {
  const w = round ? 128 : 256, h = 128;
  return paint(w, h, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (round) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.35, "rgba(255,255,255,0.62)");
      g.addColorStop(0.7, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    // a rounded box, blurred by its own shadow drawn from off the canvas
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = w * 2;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(-w * 2 + 26, 26, w - 52, h - 52, 12);
    ctx.fill();
  }, false);
}

// The warm wash the fairy lights leave on the wall below them: a scallop of
// light under each bulb, painted where the bulbs hang (the wall is 6 × 3.2 m).
function fairyWash(points: Vector3[]) {
  return paint(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const u = (x: number) => ((x + 3) / 6) * w;
    const v = (y: number) => (1 - y / 3.2) * h;
    ctx.globalCompositeOperation = "lighter";
    for (const p of points) {
      const x = u(p.x), y = v(p.y) + 3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 44);
      g.addColorStop(0, "rgba(255,255,255,0.6)");
      g.addColorStop(0.3, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 44, y - 44, 88, 88);
    }
  }, false);
}

// —— the lens: depth of field, bloom and halation, then the grade

const FULL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const DEPTH_TO_Z = /* glsl */ `
  float depthToZ(float d) { return (uLens.x * uLens.y) / (uLens.y - (uLens.y - uLens.x) * d); }`;

// Half size: the picture averaged down, with each pixel's circle of confusion
// (signed: behind the focus positive, in front negative) in alpha.
const PREP_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform vec4 uLens;
  uniform float uMaxCoc;
  varying vec2 vUv;
  ${DEPTH_TO_Z}
  void main() {
    vec2 a = vUv + uTexel * vec2(-0.5, -0.5), b = vUv + uTexel * vec2(0.5, -0.5);
    vec2 c = vUv + uTexel * vec2(-0.5, 0.5), d = vUv + uTexel * vec2(0.5, 0.5);
    vec3 color = (texture2D(tColor, a).rgb + texture2D(tColor, b).rgb + texture2D(tColor, c).rgb + texture2D(tColor, d).rgb) * 0.25;
    // the nearest of the four, so a thin thing in front keeps its blur
    float depth = min(min(texture2D(tDepth, a).r, texture2D(tDepth, b).r), min(texture2D(tDepth, c).r, texture2D(tDepth, d).r));
    float coc = clamp(uLens.w * (uLens.z - 1.0 / depthToZ(depth)), -uMaxCoc, uMaxCoc);
    gl_FragColor = vec4(min(color, vec3(48.0)), coc);
  }`;

// The blur, gathered on a golden-angle spiral: a sample counts if its own
// circle reaches this pixel, and something behind can't spill over something
// sharper in front of it. Alpha says how much of a blurred foreground has
// spilled over, so the full-size pass knows to use the blur there too.
const DOF_FRAGMENT = /* glsl */ `
  uniform sampler2D tHalf;
  uniform vec2 uTexel;
  uniform float uMaxCoc;
  varying vec2 vUv;
  const int TAPS = 40;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    vec4 centre = texture2D(tHalf, vUv);
    float own = abs(centre.a);
    float reach = own;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976 + 0.5;
      reach = max(reach, -texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * uMaxCoc * 0.6 * uTexel).a);
    }
    if (reach < 0.6) {
      gl_FragColor = vec4(centre.rgb, 0.0);
      return;
    }
    float radius = min(uMaxCoc, reach + 1.0);
    float spin = ign(gl_FragCoord.xy) * 6.2831853;
    vec3 sum = centre.rgb;
    float weight = 1.0, spill = 0.0;
    for (int i = 1; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt(fi / float(TAPS)) * radius;
      float th = fi * 2.3999632 + spin;
      vec4 s = texture2D(tHalf, vUv + vec2(cos(th), sin(th)) * r * uTexel);
      float sr = abs(s.a);
      float covers = s.a > centre.a ? min(sr, own) : sr;
      float w = clamp(covers - r + 0.75, 0.0, 1.0);
      sum += s.rgb * w;
      weight += w;
      spill += w * step(s.a, centre.a - 1.0) * step(0.8, sr);
    }
    gl_FragColor = vec4(sum / weight, clamp(spill / weight * 2.2, 0.0, 1.0));
  }`;

// Bloom: a 13-tap downsample (the first one keeps only what's bright, with
// each block averaged by its brightness so one hot pixel doesn't flicker),
// then a tent filter back up.
const DOWN_FRAGMENT = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uFirst;
  varying vec2 vUv;
  vec3 at(vec2 o) { return texture2D(tSource, vUv + o * uTexel).rgb; }
  float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * uFirst); }
  void main() {
    vec3 a = at(vec2(-2.0, 2.0)), b = at(vec2(0.0, 2.0)), c = at(vec2(2.0, 2.0));
    vec3 d = at(vec2(-2.0, 0.0)), e = at(vec2(0.0, 0.0)), f = at(vec2(2.0, 0.0));
    vec3 g = at(vec2(-2.0, -2.0)), h = at(vec2(0.0, -2.0)), i = at(vec2(2.0, -2.0));
    vec3 j = at(vec2(-1.0, 1.0)), k = at(vec2(1.0, 1.0)), l = at(vec2(-1.0, -1.0)), m = at(vec2(1.0, -1.0));
    vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25, g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
    float w0 = karis(g0) * 0.5, w1 = karis(g1) * 0.125, w2 = karis(g2) * 0.125, w3 = karis(g3) * 0.125, w4 = karis(g4) * 0.125;
    vec3 color = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
    if (uFirst > 0.5) {
      float bright = max(color.r, max(color.g, color.b));
      float knee = clamp(bright - uThreshold * 0.6, 0.0, uThreshold * 0.8);
      knee = knee * knee / (uThreshold * 3.2 + 1e-4);
      color *= max(knee, bright - uThreshold) / max(bright, 1e-4);
    }
    gl_FragColor = vec4(color, 1.0);
  }`;

const UP_FRAGMENT = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 at(vec2 o) { return texture2D(tSource, vUv + o * uTexel).rgb; }
  void main() {
    vec3 color = at(vec2(0.0)) * 4.0
      + (at(vec2(-1.0, 0.0)) + at(vec2(1.0, 0.0)) + at(vec2(0.0, -1.0)) + at(vec2(0.0, 1.0))) * 2.0
      + at(vec2(-1.0, -1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0)) + at(vec2(1.0, 1.0));
    gl_FragColor = vec4(color / 16.0, 1.0);
  }`;

// The film: the focus mixed in, bloom and a red halation around the brightest
// things, tone mapped, cool in the shadows and warm in the highlights, a
// natural vignette, a trace of lateral colour, and grain that changes 24 times
// a second and sits mostly in the midtones.
const FINAL_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform sampler2D tDof;
  uniform sampler2D tTight;
  uniform sampler2D tWide;
  uniform vec4 uLens;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uExposure;
  uniform float uBloom;
  uniform float uHalation;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFade;
  varying vec2 vUv;
  ${DEPTH_TO_Z}
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 aces(vec3 c) {
    const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = inM * c;
    vec3 a = c * (c + 0.0245786) - 0.000090537;
    vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
    return clamp(outM * (a / b), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec2 c = vUv - 0.5;
    vec2 fringe = c * dot(c, c) * 0.0045;
    vec3 sharp = vec3(texture2D(tScene, vUv + fringe).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - fringe).b);
    float coc = abs(uLens.w * (uLens.z - 1.0 / depthToZ(texture2D(tDepth, vUv).r)));
    vec4 dof = texture2D(tDof, vUv);
    vec3 color = mix(sharp, dof.rgb, max(smoothstep(0.7, 2.4, coc), dof.a));
    vec3 tight = texture2D(tTight, vUv).rgb, wide = texture2D(tWide, vUv).rgb;
    color += (tight * 0.4 + wide) * uBloom + tight * vec3(1.0, 0.3, 0.1) * uHalation;
    color = aces(color * uExposure);
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color * vec3(0.92, 0.98, 1.08), color * vec3(1.05, 1.0, 0.93), smoothstep(0.04, 0.55, l));
    float d = length(c * vec2(uRes.x / uRes.y, 1.0));
    color *= mix(1.0, smoothstep(1.15, 0.25, d), uVignette);
    color = toSrgb(color);
    color = color * 0.985 + 0.012;
    vec2 seed = floor(gl_FragCoord.xy) + floor(uTime * 24.0) * vec2(37.0, 17.0);
    float n = (hash(seed) + hash(seed + 71.3) - 1.0);
    float ls = dot(color, vec3(0.333));
    color += n * uGrain * (0.35 + 2.4 * ls * (1.0 - ls));
    color *= 1.0 - uFade;
    gl_FragColor = vec4(color, 1.0);
  }`;

// the area lights' lookup tables, made once a page and shared by every room
let areaTables = false;

export function createRoom(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  // never more than 1.5 pixels per css pixel; less if the machine can't keep up
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // nothing in the lamp's light moves but the mouse, so its shadow is redrawn only when that does
  renderer.shadowMap.autoUpdate = false;
  if (!areaTables) {
    RectAreaLightUniformsLib.init();
    areaTables = true;
  }

  const scene = new Scene();
  scene.background = new Color(0x020203);
  const camera = new PerspectiveCamera(LENS, 1, NEAR, FAR);

  const owned: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(thing: T) => {
    owned.push(thing);
    // a texture painted in a slice goes up to the GPU in that slice too, so
    // the first frame doesn't stall uploading all of them at once
    if (thing instanceof CanvasTexture && building) renderer.initTexture(thing);
    return thing;
  };
  let building = false;
  const loader = new TextureLoader();
  const standard = (options: ConstructorParameters<typeof MeshStandardMaterial>[0]) => keep(new MeshStandardMaterial(options));
  const physical = (options: ConstructorParameters<typeof MeshPhysicalMaterial>[0]) => keep(new MeshPhysicalMaterial(options));
  const add = (geometry: BufferGeometry, material: Material | Material[], x: number, y: number, z: number, parent: Object3D = scene) => {
    keep(geometry);
    const m = new Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // the painting and meshing happen in slices while the trailer plays, so the
  // page never stalls; each slice is one of these
  const slices: Array<() => void> = [];

  // —— the walls and the floor
  const wallMaterial = standard({ color: 0xbdb5aa, roughness: 0.94, emissive: 0xffb36e, emissiveIntensity: 0 });
  const sideMaterial = standard({ color: 0xb4aa9c, roughness: 0.95 });
  const wall = add(new PlaneGeometry(6, 3.2), wallMaterial, 0, 1.6, WALL);
  wall.castShadow = false;
  const side = add(new PlaneGeometry(4, 3.2), sideMaterial, -1.6, 1.6, 0.6);
  side.rotation.y = Math.PI / 2;
  side.castShadow = false;
  const floor = add(new PlaneGeometry(6, 4), standard({ color: 0x1f1712, roughness: 0.6 }), 0, 0, 0.4);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const ceiling = add(new PlaneGeometry(6, 4), standard({ color: 0x55514b, roughness: 1 }), 0, 2.7, 0.4);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.castShadow = false;
  slices.push(() => {
    // its wrapping is set before it's kept, since keeping it uploads it
    const plaster = noiseTexture(11, "#808080", 18, 256, false);
    plaster.wrapS = plaster.wrapT = RepeatWrapping;
    plaster.repeat.set(9, 5);
    plaster.colorSpace = NoColorSpace;
    keep(plaster);
    wallMaterial.bumpMap = plaster;
    wallMaterial.bumpScale = 0.6;
    sideMaterial.bumpMap = plaster;
    sideMaterial.bumpScale = 0.6;
    wallMaterial.needsUpdate = sideMaterial.needsUpdate = true;
  });

  // —— the window, to the right of the monitor: glass that holds the night and
  // catches a little of the room
  const windowGroup = new Group();
  windowGroup.position.set(0.86, 1.36, WALL);
  scene.add(windowGroup);
  const glassMaterial = standard({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.06, metalness: 0 });
  const glass = add(new PlaneGeometry(0.84, 0.84), glassMaterial, 0, 0, 0.003, windowGroup);
  glass.castShadow = false;
  glass.receiveShadow = false;
  slices.push(() => {
    glassMaterial.emissiveMap = keep(nightView());
    glassMaterial.needsUpdate = true;
  });
  const frameMaterial = standard({ color: 0xe6e1d7, roughness: 0.55 });
  for (const [w, h, x, y] of [
    [0.92, 0.045, 0, 0.44],
    [0.92, 0.045, 0, -0.44],
    [0.045, 0.92, -0.44, 0],
    [0.045, 0.92, 0.44, 0],
    [0.84, 0.022, 0, 0.04],
    [0.022, 0.84, 0, 0],
  ] as const) {
    add(new BoxGeometry(w, h, 0.04), frameMaterial, x, y, 0.02, windowGroup);
  }
  add(new BoxGeometry(1.0, 0.03, 0.12), frameMaterial, 0, -0.47, 0.06, windowGroup);

  // —— the desk, its felt mat
  // oiled walnut: a low sheen, not a lacquer, so the grain reads under the lamp
  const deskMaterial = physical({ color: 0xffffff, roughness: 0.62, specularIntensity: 0.45, clearcoat: 0.14, clearcoatRoughness: 0.3, envMapIntensity: 0.3 });
  add(new RoundedBoxGeometry(1.74, 0.034, 0.8, 2, 0.008), deskMaterial, 0, DESK - 0.017, -0.21);
  const legMaterial = standard({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.6 });
  for (const x of [-0.84, 0.84]) add(new BoxGeometry(0.04, DESK - 0.034, 0.7), legMaterial, x, (DESK - 0.034) / 2, -0.22);
  const feltMaterial = physical({ color: 0xffffff, roughness: 1, sheen: 1, sheenRoughness: 0.75, sheenColor: new Color(0x6f7784) });
  add(new RoundedBoxGeometry(0.92, 0.004, 0.34, 2, 0.002), feltMaterial, 0.02, DESK + 0.002, 0.01);
  slices.push(() => {
    deskMaterial.map = keep(walnut(3));
    const felt = noiseTexture(5, "#2a2c31", 14, 128);
    felt.wrapS = felt.wrapT = RepeatWrapping;
    felt.repeat.set(5, 2);
    keep(felt);
    feltMaterial.map = felt;
    deskMaterial.needsUpdate = feltMaterial.needsUpdate = true;
  });

  // contact shadows: what a thing leaves on the desk where it sits
  const shadowMaterials = { round: [] as MeshBasicMaterial[], box: [] as MeshBasicMaterial[] };
  const shadowMaps: { round: CanvasTexture | null; box: CanvasTexture | null } = { round: null, box: null };
  const contact = (round: boolean, w: number, d: number, x: number, y: number, z: number, turn = 0, opacity = 0.6, parent: Object3D = scene) => {
    const material = keep(
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    material.alphaMap = round ? shadowMaps.round : shadowMaps.box;
    material.visible = material.alphaMap !== null;
    (round ? shadowMaterials.round : shadowMaterials.box).push(material);
    const m = new Mesh(keep(new PlaneGeometry(w, d)), material);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = turn;
    m.position.set(x, y, z);
    m.renderOrder = 1;
    parent.add(m);
    return m;
  };
  slices.push(() => {
    shadowMaps.round = keep(softShadow(true));
    shadowMaps.box = keep(softShadow(false));
    for (const material of shadowMaterials.round) material.alphaMap = shadowMaps.round;
    for (const material of shadowMaterials.box) material.alphaMap = shadowMaps.box;
    for (const material of [...shadowMaterials.round, ...shadowMaterials.box]) {
      material.visible = true;
      material.needsUpdate = true;
    }
  });

  // —— the monitor: bezel, back, a stand, and the bias light on the wall
  const monitor = new Group();
  monitor.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  scene.add(monitor);
  const bezel = standard({ color: 0x0b0c0f, roughness: 0.48, metalness: 0.1 });
  const panelH = SCREEN.h + 0.01 + 0.019;
  add(new RoundedBoxGeometry(SCREEN.w + 0.02, panelH, 0.02, 2, 0.005), bezel, 0, -0.0045, -0.01, monitor);
  add(new RoundedBoxGeometry(SCREEN.w - 0.04, panelH - 0.05, 0.035, 2, 0.012), standard({ color: 0x16181c, roughness: 0.55 }), 0, 0, -0.035, monitor);
  // the picture itself is the page, laid over this; this plane only lends its light to the bloom
  const screenGlow = keep(new MeshBasicMaterial({ color: new Color(0.2, 0.25, 0.4) }));
  const proxy = add(new PlaneGeometry(SCREEN.w - 0.004, SCREEN.h - 0.004), screenGlow, 0, 0, -0.0004, monitor);
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  const aluminium = standard({ color: 0xb9bec6, roughness: 0.3, metalness: 1 });
  add(new BoxGeometry(0.05, 0.27, 0.018), aluminium, 0, -0.16, -0.062, monitor).rotation.x = 0.08;
  add(new RoundedBoxGeometry(0.25, 0.012, 0.18, 2, 0.005), aluminium, SCREEN.x, DESK + 0.006, SCREEN.z - 0.06);
  contact(false, 0.3, 0.23, SCREEN.x, DESK + 0.0006, SCREEN.z - 0.06, 0, 0.7);
  add(new BoxGeometry(0.018, 0.0025, 0.001), standard({ color: 0x3a3d44, metalness: 0.6, roughness: 0.3 }), 0, -SCREEN.h / 2 - 0.0095, 0.0005, monitor);
  const biasMaterial = keep(new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, color: new Color(0.55, 0.62, 0.95) }));
  const bias = new Mesh(keep(new PlaneGeometry(1.35, 0.85)), biasMaterial);
  bias.position.set(SCREEN.x, SCREEN.y + 0.02, WALL + 0.004);
  scene.add(bias);
  slices.push(() => {
    biasMaterial.map = keep(glowSprite("rgba(255, 255, 255, 0.5)"));
    biasMaterial.needsUpdate = true;
  });

  // a sticky note on the bezel, and one beside it on the wall
  const notes = [
    { text: ["ship it", "> sleep?"], color: "#ffe36e", x: -0.33, y: 0.86, z: SCREEN.z + 0.004, r: 0.08, s: 0.06 },
    { text: ["hackathon", "sat 9am"], color: "#9fd4ff", x: -0.42, y: 1.07, z: WALL + 0.002, r: -0.05, s: 0.07 },
  ];
  notes.forEach((note, i) => {
    const material = standard({ color: 0xffffff, roughness: 0.9 });
    const m = add(new PlaneGeometry(note.s, note.s), material, note.x, note.y, note.z);
    m.rotation.z = note.r;
    m.castShadow = false;
    slices.push(() => {
      material.map = keep(stickyNote(note.text, note.color, i + 2));
      material.needsUpdate = true;
    });
  });

  // —— the keyboard: an aluminium case, cream PBT caps, cobalt Enter, orange Esc
  const keyboard = new Group();
  keyboard.position.set(0.0, DESK + 0.004, 0.08);
  keyboard.rotation.x = 0.07;
  scene.add(keyboard);
  const U = 0.01905;
  add(new RoundedBoxGeometry(16 * U + 0.018, 0.02, 6 * U + 0.018, 3, 0.006), standard({ color: 0x2b2e34, roughness: 0.36, metalness: 0.85 }), 0, 0.01, 0, keyboard);
  contact(false, 16 * U + 0.06, 6 * U + 0.06, 0, DESK + 0.0045, 0.082, 0, 0.75);
  const rows: Array<Array<[number, string?]>> = [
    [[1, "esc"], ...Array.from({ length: 14 }, () => [1] as [number]), [1]],
    [...Array.from({ length: 13 }, () => [1] as [number]), [2, "mod"], [1, "mod"]],
    [[1.5, "mod"], ...Array.from({ length: 12 }, () => [1] as [number]), [1.5, "mod"], [1, "mod"]],
    [[1.75, "mod"], ...Array.from({ length: 11 }, () => [1] as [number]), [2.25, "enter"], [1, "mod"]],
    [[2.25, "mod"], ...Array.from({ length: 10 }, () => [1] as [number]), [1.75, "mod"], [1, "arrow"], [1, "mod"]],
    [[1.25, "mod"], [1.25, "mod"], [1.25, "mod"], [6.25], [1, "mod"], [1, "mod"], [1, "mod"], [1, "arrow"], [1, "arrow"], [1, "arrow"]],
  ];
  const keyCount = rows.reduce((n, row) => n + row.length, 0);
  const capGeometry = keep(new RoundedBoxGeometry(1, 1, 1, 2, 0.16));
  const caps = new InstancedMesh(capGeometry, standard({ color: 0xffffff, roughness: 0.64 }), keyCount);
  keep(caps);
  caps.castShadow = true;
  caps.receiveShadow = true;
  const colors = { plain: new Color(0xe2dccd), mod: new Color(0x8a919c), esc: new Color(0xe9792a), enter: new Color(0x2a62de), arrow: new Color(0x8a919c) };
  const matrix = new Matrix4();
  let index = 0;
  rows.forEach((row, r) => {
    let x = -8 * U;
    for (const [width, kind] of row) {
      const w = width * U;
      // the top row sits a little apart, the way it does on a real board
      const z = (r - 2.5) * U + (r === 0 ? -0.004 : 0);
      matrix.makeScale(w - 0.0028, 0.0095, U - 0.0028);
      matrix.setPosition(x + w / 2, 0.025 + (5 - r) * 0.0006, z);
      caps.setMatrixAt(index, matrix);
      caps.setColorAt(index, colors[(kind as keyof typeof colors) ?? "plain"] ?? colors.plain);
      index += 1;
      x += w;
    }
  });
  keyboard.add(caps);

  // —— the mouse, which moves with the pointer on the screen
  const mouse = new Group();
  const mouseRest = new Vector3(0.31, DESK + 0.004, 0.1);
  mouse.position.copy(mouseRest);
  scene.add(mouse);
  const body = add(new SphereGeometry(1, 40, 24), physical({ color: 0xe6e6e9, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35 }), 0, 0, 0, mouse);
  body.scale.set(0.031, 0.019, 0.057);
  add(new BoxGeometry(0.0012, 0.006, 0.03), standard({ color: 0x9a9ca3, roughness: 0.6 }), 0, 0.0175, -0.025, mouse);
  contact(true, 0.1, 0.14, 0, 0.0007, 0.004, 0, 0.7, mouse);

  // —— the mug, cobalt glaze on a cork coaster, steaming a little
  const mugAt = new Vector3(-0.37, DESK, 0.04);
  add(new CylinderGeometry(0.052, 0.052, 0.006, 40), standard({ color: 0xa47b4f, roughness: 0.95 }), mugAt.x, DESK + 0.003, mugAt.z);
  contact(true, 0.15, 0.15, mugAt.x, DESK + 0.0006, mugAt.z, 0, 0.55);
  contact(true, 0.1, 0.1, mugAt.x, DESK + 0.0064, mugAt.z, 0, 0.6);
  const mugProfile = [
    new Vector2(0.0, 0.0),
    new Vector2(0.036, 0.0),
    new Vector2(0.04, 0.004),
    new Vector2(0.041, 0.09),
    new Vector2(0.044, 0.096),
    new Vector2(0.038, 0.096),
    new Vector2(0.036, 0.088),
    new Vector2(0.035, 0.012),
    new Vector2(0.0, 0.012),
  ];
  const ceramic = physical({ color: 0x2a58d0, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
  add(new LatheGeometry(mugProfile, 48), ceramic, mugAt.x, DESK + 0.006, mugAt.z);
  const handle = add(new TorusGeometry(0.024, 0.0065, 14, 28, Math.PI * 1.25), ceramic, mugAt.x + 0.042, DESK + 0.055, mugAt.z);
  handle.rotation.z = -Math.PI * 0.62;
  add(new CylinderGeometry(0.035, 0.035, 0.002, 32), physical({ color: 0x1c0e06, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }), mugAt.x, DESK + 0.083, mugAt.z);
  const steam = Array.from({ length: 5 }, (_, i) => {
    const material = keep(
      new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(1, 0.86, 0.68), opacity: 0 }),
    );
    const m = new Mesh(keep(new PlaneGeometry(0.045, 0.16)), material);
    m.userData.offset = i / 5;
    m.userData.sway = 1.3 + i * 0.37;
    m.renderOrder = 2;
    m.visible = false;
    scene.add(m);
    slices.push(() => {
      material.map = keep(wisp(i + 1));
      material.needsUpdate = true;
      m.visible = true;
    });
    return m;
  });

  // —— the lamp: an architect's lamp leaning over the mug, warm, the key light
  const black = standard({ color: 0x141518, roughness: 0.42, metalness: 0.6 });
  const lampBase = new Vector3(-0.72, DESK, -0.42);
  const elbow = new Vector3(-0.78, 1.12, -0.47);
  const head = new Vector3(-0.56, 1.1, -0.24);
  add(new CylinderGeometry(0.07, 0.075, 0.018, 40), black, lampBase.x, DESK + 0.009, lampBase.z);
  contact(true, 0.2, 0.2, lampBase.x, DESK + 0.0006, lampBase.z, 0, 0.6);
  const arm = (a: Vector3, b: Vector3) => {
    add(new TubeGeometry(new CatmullRomCurve3([a, b]), 1, 0.0065, 10, false), black, 0, 0, 0);
  };
  arm(lampBase.clone().setY(DESK + 0.018), elbow);
  arm(elbow, head);
  add(new SphereGeometry(0.012, 16, 12), black, elbow.x, elbow.y, elbow.z);
  const aim = new Vector3(-0.32, DESK, 0.06);
  const shade = new Group();
  shade.position.copy(head);
  shade.lookAt(aim);
  scene.add(shade);
  const cone = add(new CylinderGeometry(0.026, 0.06, 0.1, 40, 1, true), standard({ color: 0x141518, roughness: 0.42, metalness: 0.6, side: DoubleSide }), 0, 0, 0.045, shade);
  cone.rotation.x = Math.PI / 2;
  // the inside of the shade, lit by the bulb
  const lining = add(
    new CylinderGeometry(0.0255, 0.0595, 0.099, 40, 1, true),
    keep(new MeshBasicMaterial({ color: new Color(1.6, 1.05, 0.55), side: BackSide })),
    0,
    0,
    0.045,
    shade,
  );
  lining.rotation.x = Math.PI / 2;
  lining.castShadow = false;
  const bulb = add(new SphereGeometry(0.019, 20, 14), keep(new MeshBasicMaterial({ color: new Color(14, 9, 4.6) })), 0, 0, 0.052, shade);
  bulb.castShadow = false;
  const lamp = new SpotLight(0xffb06a, 2.1, 0, 0.82, 1, 2);
  lamp.position.copy(head).addScaledVector(aim.clone().sub(head).normalize(), 0.05);
  lamp.target.position.copy(aim);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.normalBias = 0.012;
  lamp.shadow.camera.near = 0.04;
  lamp.shadow.camera.far = 2.5;
  lamp.shadow.radius = 6;
  scene.add(lamp, lamp.target);

  // —— books by the lamp: what a business and data science student keeps
  const books = [
    { lines: ["DATA C8", "Computational thinking"], bg: "#1c3f8a", ink: "#f6f1e3", w: 0.19, d: 0.24, h: 0.03 },
    { lines: ["UGBA 10", "Principles of business"], bg: "#e9b33b", ink: "#1b1d22", w: 0.17, d: 0.23, h: 0.024 },
    { lines: ["notes", "do not read"], bg: "#b69a74", ink: "#2b2118", w: 0.15, d: 0.21, h: 0.014 },
  ];
  let stack = DESK;
  books.forEach((book, i) => {
    const plain = standard({ color: new Color(book.bg).multiplyScalar(0.85), roughness: 0.8 });
    const pages = standard({ color: 0xece4d2, roughness: 0.9 });
    const top = standard({ color: 0xffffff, roughness: 0.75 });
    const m = add(new BoxGeometry(book.w, book.h, book.d), [pages, plain, top, plain, pages, pages], -0.6 + i * 0.01, stack + book.h / 2, -0.06 + i * 0.006);
    m.rotation.y = 0.35 - i * 0.18;
    if (i === 0) contact(false, book.w + 0.05, book.d + 0.05, m.position.x, DESK + 0.0006, m.position.z, 0.35, 0.65);
    slices.push(() => {
      top.map = keep(spine(book.lines, book.bg, book.ink));
      top.needsUpdate = true;
    });
    stack += book.h;
  });

  // —— the phone, face up: it lights when the receipt comes in, and stays lit a while
  const phone = new Group();
  phone.position.set(0.56, DESK, 0.0);
  phone.rotation.y = -0.32;
  scene.add(phone);
  add(new RoundedBoxGeometry(0.072, 0.008, 0.148, 2, 0.003), standard({ color: 0x1d1f24, roughness: 0.3, metalness: 0.7 }), 0, 0.004, 0, phone);
  contact(false, 0.1, 0.18, 0, 0.0006, 0, 0, 0.65, phone);
  const phoneScreen = standard({ color: 0x040405, roughness: 0.22, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 0.5 });
  const phoneFace = add(new PlaneGeometry(0.066, 0.142), phoneScreen, 0, 0.0083, 0, phone);
  phoneFace.rotation.x = -Math.PI / 2;
  phoneFace.castShadow = false;
  slices.push(() => {
    phoneScreen.emissiveMap = keep(lockScreen());
    phoneScreen.needsUpdate = true;
  });
  let phoneLit = false;
  let phoneLight = 0;

  // —— the plant, in front of the window's right-hand pane
  const plantAt = new Vector3(0.75, DESK, -0.38);
  const pot = new LatheGeometry([new Vector2(0, 0), new Vector2(0.052, 0), new Vector2(0.066, 0.12), new Vector2(0.07, 0.125), new Vector2(0.0, 0.125)], 40);
  add(pot, standard({ color: 0xe3ddd2, roughness: 0.6 }), plantAt.x, DESK, plantAt.z);
  add(new CylinderGeometry(0.062, 0.062, 0.004, 32), standard({ color: 0x24180f, roughness: 1 }), plantAt.x, DESK + 0.118, plantAt.z);
  contact(true, 0.19, 0.19, plantAt.x, DESK + 0.0006, plantAt.z, 0, 0.6);
  const leafRandom = rng(21);
  for (let i = 0; i < 8; i += 1) {
    const height = 0.3 + leafRandom() * 0.22;
    const geometry = new PlaneGeometry(0.05, height, 1, 6);
    const position = geometry.attributes.position;
    for (let v = 0; v < position.count; v += 1) {
      const y = position.getY(v) + height / 2;
      position.setZ(v, (y / height) ** 2 * 0.05);
    }
    geometry.translate(0, height / 2, 0);
    const material = standard({ color: 0xffffff, alphaTest: 0.5, side: DoubleSide, roughness: 0.48, transparent: false, opacity: 1 });
    material.visible = false;
    const leaf = add(geometry, material, plantAt.x + (leafRandom() - 0.5) * 0.05, DESK + 0.115, plantAt.z + (leafRandom() - 0.5) * 0.05);
    leaf.rotation.y = (i / 8) * Math.PI * 2 + leafRandom() * 0.5;
    leaf.rotation.x = -0.08 - leafRandom() * 0.12;
    slices.push(() => {
      material.map = keep(snakeLeaf(i + 3));
      material.visible = true;
      material.needsUpdate = true;
    });
  }

  // —— the shelf: three first places, the team on the steps at YC, the plushie
  const shelfY = 1.24;
  add(new BoxGeometry(0.6, 0.022, 0.17), deskMaterial, -0.57, shelfY, WALL + 0.085);
  const gold = physical({ color: 0xe0ad52, metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  const plinth = standard({ color: 0x1b1c20, roughness: 0.5 });
  const trophy = (x: number, scale: number) => {
    const cup = new LatheGeometry(
      [
        new Vector2(0, 0),
        new Vector2(0.03, 0),
        new Vector2(0.03, 0.014),
        new Vector2(0.008, 0.02),
        new Vector2(0.006, 0.06),
        new Vector2(0.02, 0.07),
        new Vector2(0.036, 0.1),
        new Vector2(0.04, 0.135),
        new Vector2(0.035, 0.135),
        new Vector2(0.0, 0.1),
      ].map((p) => p.multiplyScalar(scale)),
      40,
    );
    add(cup, gold, x, shelfY + 0.011, WALL + 0.09);
    add(new BoxGeometry(0.05 * scale, 0.022, 0.05 * scale), plinth, x, shelfY + 0.011, WALL + 0.09).scale.y = 0.6;
  };
  trophy(-0.79, 1.15);
  trophy(-0.71, 0.95);
  trophy(-0.645, 0.85);
  const frame = new Group();
  frame.position.set(-0.52, shelfY + 0.011, WALL + 0.07);
  frame.rotation.set(-0.1, 0.12, 0);
  scene.add(frame);
  add(new BoxGeometry(0.15, 0.11, 0.01), standard({ color: 0x1b1714, roughness: 0.5 }), 0, 0.055, 0, frame);
  const photo = keep(loader.load("/projects/moment-yc-sm.webp"));
  photo.colorSpace = SRGBColorSpace;
  add(new PlaneGeometry(0.13, 0.087), standard({ map: photo, roughness: 0.32 }), 0, 0.056, 0.0052, frame).castShadow = false;
  const plushieTexture = keep(loader.load("/identity/plushie.webp"));
  plushieTexture.colorSpace = SRGBColorSpace;
  const plushie = add(
    new PlaneGeometry(0.1, 0.152),
    standard({ map: plushieTexture, alphaTest: 0.4, roughness: 0.95, side: DoubleSide }),
    -0.375,
    shelfY + 0.087,
    WALL + 0.1,
  );
  plushie.rotation.y = -0.1;
  const flagMaterial = standard({ color: 0xffffff, roughness: 0.95, transparent: true, alphaTest: 0.2 });
  flagMaterial.visible = false;
  const flag = add(new PlaneGeometry(0.34, 0.17), flagMaterial, -0.08, 1.305, WALL + 0.003);
  flag.rotation.z = -0.07;
  flag.castShadow = false;
  slices.push(() => {
    flagMaterial.map = keep(pennant());
    flagMaterial.visible = true;
    flagMaterial.needsUpdate = true;
  });

  // —— on the desk, by the monitor's foot: the island's corgi and its owner, as figures
  const toyMaterial = standard({ vertexColors: true, roughness: 0.5 });
  const toy = (voxels: ReturnType<typeof corgi>, x: number, z: number, turn: number, scale: number) => {
    const geometry = keep(voxels.geometry(3, true));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const m = new Mesh(geometry, toyMaterial);
    m.scale.setScalar(scale);
    m.position.set(x, DESK, z);
    m.rotation.y = turn;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    contact(true, (box.max.x - box.min.x) * scale + 0.03, (box.max.z - box.min.z) * scale + 0.03, x, DESK + 0.0006, z, turn, 0.6);
  };
  slices.push(() => toy(corgi(), 0.2, -0.2, -0.5, 0.028));
  slices.push(() => toy(person(OUTFITS.aiden), 0.255, -0.24, -0.25, 0.032));

  // —— fairy lights strung along the wall above: warm glass bulbs on a dark
  // wire, each a little different, and the wash they leave on the wall
  const sag = new CatmullRomCurve3([new Vector3(-1.05, 1.44, WALL + 0.02), new Vector3(-0.5, 1.365, WALL + 0.03), new Vector3(0.1, 1.405, WALL + 0.03), new Vector3(0.42, 1.375, WALL + 0.03)]);
  add(new TubeGeometry(sag, 60, 0.0011, 5, false), black, 0, 0, 0).castShadow = false;
  const BULBS = 18;
  const bulbs = new InstancedMesh(keep(new SphereGeometry(1, 12, 10)), keep(new MeshBasicMaterial({ color: 0xffffff })), BULBS);
  keep(bulbs);
  const sockets = new InstancedMesh(keep(new CylinderGeometry(1, 1, 1, 8)), standard({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.4 }), BULBS);
  keep(sockets);
  const bulbRandom = rng(31);
  const bulbPoints: Vector3[] = [];
  const bulbColor = new Color();
  for (let i = 0; i < BULBS; i += 1) {
    const p = sag.getPoint((i + 0.5) / BULBS);
    bulbPoints.push(p);
    const lean = (bulbRandom() - 0.5) * 0.5;
    matrix.makeRotationZ(lean);
    matrix.scale(new Vector3(0.0034, 0.0056, 0.0034));
    matrix.setPosition(p.x + Math.sin(lean) * 0.008, p.y - 0.011, p.z + 0.004);
    bulbs.setMatrixAt(i, matrix);
    const heat = 0.85 + bulbRandom() * 0.3;
    bulbColor.setRGB(7.5 * heat, 4.2 * heat, 1.55 * heat);
    bulbs.setColorAt(i, bulbColor);
    matrix.makeRotationZ(lean);
    matrix.scale(new Vector3(0.0022, 0.005, 0.0022));
    matrix.setPosition(p.x, p.y - 0.004, p.z + 0.004);
    sockets.setMatrixAt(i, matrix);
  }
  scene.add(bulbs, sockets);
  slices.push(() => {
    wallMaterial.emissiveMap = keep(fairyWash(bulbPoints));
    wallMaterial.emissiveIntensity = 0.18;
    wallMaterial.needsUpdate = true;
  });

  // —— light: the lamp (above) is the key; the screen spills over the desk;
  // the window fills cool from the right; a breath of night in the shadows
  const screenLight = new RectAreaLight(0x8fb0ff, 2, SCREEN.w, SCREEN.h);
  screenLight.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.01);
  screenLight.lookAt(SCREEN.x, SCREEN.y, 2);
  scene.add(screenLight);
  const moonlight = new RectAreaLight(0x7d98ff, 0.55, 0.8, 0.8);
  moonlight.position.set(0.86, 1.36, WALL + 0.03);
  moonlight.lookAt(0.4, 0.8, 0.9);
  scene.add(moonlight);
  scene.add(new HemisphereLight(0x1d2848, 0x120d0a, 0.16));
  // what the string of bulbs gives the shelf and the pennant below it
  const string = new PointLight(0xffb463, 0.12, 1.6, 2);
  string.position.set(-0.45, 1.5, WALL + 0.38);
  scene.add(string);

  // reflections come from a little model of the same room: the lamp, its pool
  // on the desk, the screen, the window and the string of lights, so glaze,
  // chrome and gold catch what is really around them
  const pmrem = new PMREMGenerator(renderer);
  slices.push(() => {
    const env = new Scene();
    const parts: Array<{ dispose: () => void }> = [];
    const glow = (geometry: BufferGeometry, color: Color, x: number, y: number, z: number) => {
      const material = new MeshBasicMaterial({ color, side: DoubleSide });
      parts.push(geometry, material);
      const m = new Mesh(geometry, material);
      m.position.set(x, y, z);
      env.add(m);
      return m;
    };
    const room = glow(new BoxGeometry(3.4, 2.7, 3.2), new Color(0.012, 0.011, 0.012), 0, 1.35, 0.4);
    (room.material as MeshBasicMaterial).side = BackSide;
    glow(new PlaneGeometry(1.74, 0.8), new Color(0.03, 0.018, 0.012), 0, DESK, -0.21).rotation.x = -Math.PI / 2;
    glow(new SphereGeometry(0.05, 16, 12), new Color(30, 19, 9), head.x, head.y, head.z);
    glow(new PlaneGeometry(0.5, 0.36), new Color(0.5, 0.32, 0.16), aim.x, DESK + 0.001, aim.z).rotation.x = -Math.PI / 2;
    glow(new PlaneGeometry(SCREEN.w, SCREEN.h), new Color(0.6, 0.72, 1.1), SCREEN.x, SCREEN.y, SCREEN.z + 0.001);
    glow(new PlaneGeometry(0.84, 0.84), new Color(0.05, 0.07, 0.16), 0.86, 1.36, WALL + 0.004);
    glow(new PlaneGeometry(1.1, 0.5), new Color(0.07, 0.05, 0.035), -0.4, 1.2, WALL + 0.002);
    for (const p of bulbPoints) glow(new SphereGeometry(0.012, 8, 6), new Color(6, 3.4, 1.3), p.x, p.y, p.z);
    const target = pmrem.fromScene(env, 0, 0.02, 8, { position: new Vector3(0, 0.95, -0.05) });
    keep(target);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.9;
    for (const part of parts) part.dispose();
  });

  // —— the lens and the film
  const quad = new FullScreenQuad();
  const target = (w: number, h: number, depth = false) =>
    keep(
      new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        depthBuffer: depth,
        stencilBuffer: false,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      }),
    );
  const sceneTarget = keep(
    new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: 4, stencilBuffer: false, depthTexture: new DepthTexture(2, 2, UnsignedIntType) }),
  );
  owned.push({ dispose: () => sceneTarget.depthTexture?.dispose() });
  const half = target(2, 2);
  const blurred = target(2, 2);
  const levels = [target(2, 2), target(2, 2), target(2, 2), target(2, 2), target(2, 2)];
  // near, far, 1 / focus distance, and the aperture in px·m at each size
  const lensHalf = new Vector4(NEAR, FAR, 1, 1);
  const lensFull = new Vector4(NEAR, FAR, 1, 1);
  const pass = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
    keep(new ShaderMaterial({ vertexShader: FULL_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false }));
  const prep = pass(PREP_FRAGMENT, {
    tColor: { value: sceneTarget.texture },
    tDepth: { value: sceneTarget.depthTexture },
    uTexel: { value: new Vector2() },
    uLens: { value: lensHalf },
    uMaxCoc: { value: 9 },
  });
  const dof = pass(DOF_FRAGMENT, { tHalf: { value: half.texture }, uTexel: { value: new Vector2() }, uMaxCoc: { value: 9 } });
  const down = pass(DOWN_FRAGMENT, { tSource: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 1.1 }, uFirst: { value: 0 } });
  const up = pass(UP_FRAGMENT, { tSource: { value: null }, uTexel: { value: new Vector2() } });
  up.blending = AdditiveBlending;
  up.transparent = true;
  const final = pass(FINAL_FRAGMENT, {
    tScene: { value: sceneTarget.texture },
    tDepth: { value: sceneTarget.depthTexture },
    tDof: { value: blurred.texture },
    tTight: { value: levels[0].texture },
    tWide: { value: levels[1].texture },
    uLens: { value: lensFull },
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uExposure: { value: 1.12 },
    uBloom: { value: 0.07 },
    uHalation: { value: 0.07 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.022 },
    uFade: { value: 0 },
  });

  // —— size and camera
  let width = 2, height = 2;
  let pixelsHigh = 2;
  const resize = (w: number, h: number) => {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    const W = Math.max(2, Math.round(w * ratio)), H = Math.max(2, Math.round(h * ratio));
    pixelsHigh = H;
    sceneTarget.setSize(W, H);
    const hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
    half.setSize(hw, hh);
    blurred.setSize(hw, hh);
    let lw = hw, lh = hh;
    for (const level of levels) {
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
      level.setSize(lw, lh);
    }
    (prep.uniforms.uTexel.value as Vector2).set(1 / W, 1 / H);
    (dof.uniforms.uTexel.value as Vector2).set(1 / hw, 1 / hh);
    (final.uniforms.uRes.value as Vector2).set(W, H);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tan = (fov: number) => Math.tan(MathUtils.degToRad(fov) / 2);
  const centre = new Vector3(SCREEN.x, SCREEN.y, SCREEN.z);
  const scratch = new Vector3();

  /** A point on the screen, from store-page px. */
  const screenPoint = (px: number, py: number, out = new Vector3()) =>
    out.set(SCREEN.x + (px / SCREEN.px - 0.5) * SCREEN.w, SCREEN.y + (0.5 - py / SCREEN.py) * SCREEN.h, SCREEN.z);

  const poses = {
    /** Square on and close enough that the screen just covers the view. */
    cover(aspect: number, out: Pose = makePose()): Pose {
      const d = Math.min(SCREEN.h / (2 * tan(LENS)), SCREEN.w / (2 * aspect * tan(LENS)));
      out.position.set(centre.x, centre.y, centre.z + d);
      out.target.copy(centre);
      out.fov = LENS;
      out.roll = 0;
      return out;
    },
    /** From the chair, a little to the left: the lamp near, the window and the
     * Campanile beyond the monitor, the desk below. */
    seat(aspect: number, out: Pose = makePose()): Pose {
      out.position.set(-0.15, 1.21, 1.03);
      out.target.set(0.005, 1.005, -0.23);
      // on a narrow screen, sit back until the monitor fits across
      const need = (SCREEN.w * 1.18) / 2 / (aspect * tan(LENS));
      scratch.subVectors(out.position, out.target);
      if (need > scratch.length()) out.position.copy(out.target).addScaledVector(scratch.normalize(), need);
      out.fov = LENS;
      out.roll = 0;
      return out;
    },
    /** Leaning in to read part of the screen, square on: `span` store px across. */
    lean(aspect: number, px: number, py: number, span: number, out: Pose = makePose()): Pose {
      screenPoint(px, py, out.target);
      const fit = (SCREEN.w * (span / SCREEN.px)) / 2;
      const d = Math.max(0.3, fit / (Math.min(aspect, 1.7) * tan(LENS)));
      out.position.set(out.target.x, out.target.y + d * 0.03, out.target.z + d);
      out.fov = LENS;
      out.roll = 0;
      return out;
    },
  };

  const forward = new Vector3();
  const setPose = (pose: Pose) => {
    camera.position.copy(pose.position);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(pose.target);
    if (pose.roll) camera.rotateZ(pose.roll);
    camera.updateMatrixWorld();
  };

  const projected = new Vector3();
  const corners = [
    new Vector3(SCREEN.x - SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x + SCREEN.w / 2, SCREEN.y - SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x - SCREEN.w / 2, SCREEN.y - SCREEN.h / 2, SCREEN.z),
  ];
  /** Where the screen's corners are in the viewport, clockwise from the top left. */
  const screenQuad = (out: Quad = [0, 0, 0, 0, 0, 0, 0, 0]): Quad => {
    for (let i = 0; i < 4; i += 1) {
      projected.copy(corners[i]).project(camera);
      out[i * 2] = ((projected.x + 1) / 2) * width;
      out[i * 2 + 1] = ((1 - projected.y) / 2) * height;
    }
    return out;
  };

  // —— the screen's light: its colour and how bright, eased
  const glow = { color: new Color(0.42, 0.55, 1), level: 1 };
  const glowGoal = { color: glow.color.clone(), level: 1 };
  const setScreen = (color: Color | number, level: number, now = false) => {
    glowGoal.color.set(color);
    glowGoal.level = level;
    if (now) {
      glow.color.copy(glowGoal.color);
      glow.level = level;
    }
  };

  // —— the focus: on the screen, eased the way a focus puller follows a move
  let focus = 1;
  let fStop = 2.8;
  let ready = false;
  let disposed = false;
  let time = 0;
  let shadowsDirty = true;
  const mouseAt = new Vector3();

  const draw = (dt: number) => {
    // the focus distance: how far the screen is along the lens's axis
    camera.getWorldDirection(forward);
    const want = Math.max(0.05, scratch.subVectors(centre, camera.position).dot(forward));
    focus = dt > 0 ? focus + (want - focus) * (1 - Math.exp(-dt * 16)) : want;
    const aperture = (SENSOR * pixelsHigh) / (4 * fStop * tan(camera.fov) ** 2);
    lensHalf.set(NEAR, FAR, 1 / focus, aperture / 2);
    lensFull.set(NEAR, FAR, 1 / focus, aperture);

    if (shadowsDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowsDirty = false;
    }
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);

    renderer.setRenderTarget(half);
    quad.material = prep;
    quad.render(renderer);
    renderer.setRenderTarget(blurred);
    quad.material = dof;
    quad.render(renderer);

    // bloom, down from the focused picture, then back up
    quad.material = down;
    let source: WebGLRenderTarget = blurred;
    levels.forEach((level, i) => {
      down.uniforms.tSource.value = source.texture;
      (down.uniforms.uTexel.value as Vector2).set(1 / source.width, 1 / source.height);
      down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      renderer.setRenderTarget(level);
      quad.render(renderer);
      source = level;
    });
    quad.material = up;
    for (let i = levels.length - 1; i > 1; i -= 1) {
      up.uniforms.tSource.value = levels[i].texture;
      (up.uniforms.uTexel.value as Vector2).set(1 / levels[i].width, 1 / levels[i].height);
      renderer.setRenderTarget(levels[i - 1]);
      renderer.autoClear = false;
      quad.render(renderer);
      renderer.autoClear = true;
    }

    renderer.setRenderTarget(null);
    quad.material = final;
    quad.render(renderer);
  };

  // a laptop that can't hold the frame rate gets a smaller picture rather
  // than a stuttering one: a quarter step down at a time, never below 1x, and
  // never back up (a change of sharpness mid-shot shows more than it helps)
  let pace = 1 / 60;
  let paced = 0;
  const govern = (dt: number) => {
    // a stall (something else starting up) says nothing about the steady cost
    if (dt <= 0 || dt >= 0.05) return;
    pace += (dt - pace) * 0.05;
    paced += 1;
    if (paced < 90 || pace < 1 / 48 || ratio <= 1) return;
    ratio = Math.max(1, ratio - 0.25);
    renderer.setPixelRatio(ratio);
    resize(width, height);
    paced = 0;
    pace = 1 / 60;
  };

  const render = (dt: number) => {
    if (!ready || disposed) return;
    govern(dt);
    time += dt;
    const k = 1 - Math.exp(-dt * 6);
    glow.color.lerp(glowGoal.color, k);
    glow.level += (glowGoal.level - glow.level) * k;
    screenLight.color.copy(glow.color);
    screenLight.intensity = 1.9 * glow.level;
    screenGlow.color.copy(glow.color).multiplyScalar(0.5 + 1.1 * glow.level);
    biasMaterial.opacity = 0.16 + 0.3 * Math.min(1, glow.level);

    // the steam: thin breaths that rise, widen, lean and thin out
    for (const m of steam) {
      const t = (time * 0.2 + m.userData.offset) % 1;
      const sway = m.userData.sway as number;
      m.position.set(mugAt.x + Math.sin(t * 4 + sway) * 0.006 * (0.5 + t), DESK + 0.105 + t * 0.12, mugAt.z + Math.cos(t * 3 + sway) * 0.004);
      m.scale.set(0.7 + t * 0.9, 0.6 + t * 0.5, 1);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(Math.sin(t * 2.2 + sway) * 0.25);
      (m.material as MeshBasicMaterial).opacity = Math.sin(t * Math.PI) ** 1.5 * 0.2;
    }
    phoneLight += ((phoneLit ? 1 : 0) - phoneLight) * (1 - Math.exp(-dt * (phoneLit ? 7 : 1.2)));
    phoneScreen.emissiveIntensity = phoneLight * 1.25;
    if (!mouse.position.equals(mouseAt)) {
      mouseAt.copy(mouse.position);
      shadowsDirty = true;
    }

    final.uniforms.uTime.value = time;
    draw(dt);
  };

  return {
    /** Paints, meshes and compiles everything a slice at a time, then draws a
     * frame nobody sees, so the first real one doesn't stall. */
    prepare: async (pose: Pose) => {
      building = true;
      for (const slice of slices) {
        if (disposed) return;
        slice();
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      building = false;
      if (disposed) return;
      setPose(pose);
      // every program is compiled for the target it will draw into (a shader
      // for a float target differs from one for the page), off the main
      // thread where the browser can, so the first frame doesn't compile them
      const lensGeometry = new PlaneGeometry(2, 2);
      const lens = (materials: Material[]) => {
        const group = new Scene();
        for (const material of materials) group.add(new Mesh(lensGeometry, material));
        return group;
      };
      const compiling: Array<Promise<unknown>> = [];
      try {
        renderer.setRenderTarget(sceneTarget);
        compiling.push(renderer.compileAsync(scene, camera));
        renderer.setRenderTarget(half);
        compiling.push(renderer.compileAsync(lens([prep, dof, down, up]), camera));
        renderer.setRenderTarget(null);
        compiling.push(renderer.compileAsync(lens([final]), camera));
        await Promise.all(compiling);
      } catch {
        renderer.setRenderTarget(sceneTarget);
        renderer.compile(scene, camera);
      }
      renderer.setRenderTarget(null);
      lensGeometry.dispose();
      if (disposed) return;
      ready = true;
      draw(0);
    },
    get ready() {
      return ready;
    },
    poses,
    screenPoint,
    setPose,
    screenQuad,
    setScreen,
    /** How shallow the focus is, as an f-number: smaller is shallower. */
    setStop: (stop: number) => {
      fStop = stop;
    },
    /** Nudges the mouse on the desk, in metres from where it rests. */
    setMouse: (dx: number, dz: number) => {
      mouse.position.set(mouseRest.x + dx, mouseRest.y, mouseRest.z + dz);
    },
    /** The phone on the desk wakes with the receipt, and dims again slowly. */
    setPhone: (lit: boolean) => {
      phoneLit = lit;
    },
    setFade: (amount: number) => {
      final.uniforms.uFade.value = amount;
    },
    resize,
    render,
    /** Frees everything on the GPU. `lose` also lets go of the context itself,
     * for when the canvas won't be drawn on again. */
    dispose: (lose = false) => {
      disposed = true;
      for (const thing of owned) thing.dispose();
      lamp.dispose();
      quad.dispose();
      pmrem.dispose();
      renderer.setSize(1, 1, false);
      renderer.dispose();
      if (lose) renderer.forceContextLoss();
    },
  };
}

export type Room = ReturnType<typeof createRoom>;
