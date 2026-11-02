import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RectAreaLight,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { corgi, person, OUTFITS } from "../scene/kit";
import type { Quad } from "./pin";

// The room the island was playing in: a desk at night, seen from the chair.
// A monitor in the middle (its picture is the page itself, pinned on top of
// this canvas), a lamp, a mug, a window onto the Campanile, the trophies on
// the shelf. Everything here is made in code, in metres: x to the right, y
// up, z towards whoever is sitting there.

const DESK = 0.74;
/** The panel: 27 inches at 16:9, and the store page is 1600 × 900 on it. */
export const SCREEN = { w: 0.5977, h: 0.3362, x: 0, y: 1.03, z: -0.23, px: 1600, py: 900 };
const WALL = -0.62;
const FOV = 50;

export type Pose = { position: Vector3; target: Vector3; fov: number };

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
  texture.anisotropy = 4;
  return texture;
}

// —— textures, painted once

function walnut(seed: number) {
  const random = rng(seed);
  return paint(1024, 512, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#5e3d27");
    base.addColorStop(0.5, "#553521");
    base.addColorStop(1, "#5c3a24");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i += 1) {
      const y0 = random() * h;
      const amp = 2 + random() * 9;
      const freq = 0.0015 + random() * 0.005;
      const phase = random() * Math.PI * 2;
      const dark = random() < 0.62;
      ctx.strokeStyle = dark ? `rgba(34, 18, 9, ${0.06 + random() * 0.2})` : `rgba(160, 108, 66, ${0.04 + random() * 0.12})`;
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

function noiseTexture(seed: number, color: string, spread: number, size = 256) {
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
  });
}

// What the window looks out on: Berkeley at night, the hills dark behind,
// the Campanile lit, the city's lights soft because the lens is on the desk.
function nightView() {
  const random = rng(7);
  return paint(1024, 1024, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#070d1f");
    sky.addColorStop(0.45, "#13214a");
    sky.addColorStop(0.72, "#2a3a6b");
    sky.addColorStop(1, "#3b3f66");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i += 1) {
      const x = random() * w, y = random() * h * 0.55;
      const a = 0.25 + random() * 0.6;
      ctx.fillStyle = `rgba(255, 246, 225, ${a})`;
      ctx.fillRect(x, y, random() < 0.1 ? 2.5 : 1.5, random() < 0.1 ? 2.5 : 1.5);
    }
    // the moon, the same thin one the island has after dark
    ctx.save();
    ctx.translate(w * 0.24, h * 0.17);
    const halo = ctx.createRadialGradient(0, 0, 10, 0, 0, 90);
    halo.addColorStop(0, "rgba(220, 225, 255, 0.35)");
    halo.addColorStop(1, "rgba(220, 225, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-90, -90, 180, 180);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(11, -8, 23, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the hills, then the city at their foot
    const ridge = (base: number, amp: number, color: string, seed: number) => {
      const r = rng(seed);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) {
        const y = base - amp * (0.55 + 0.45 * Math.sin(x * 0.006 + seed)) - r() * amp * 0.12;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    };
    ridge(h * 0.6, 120, "#0d1430", 3);
    ridge(h * 0.68, 70, "#0a0f22", 5);
    const glow = ctx.createLinearGradient(0, h * 0.62, 0, h);
    glow.addColorStop(0, "rgba(255, 170, 90, 0)");
    glow.addColorStop(1, "rgba(255, 170, 90, 0.22)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    // lights: warm windows and street lamps, blurred into discs
    for (let i = 0; i < 260; i += 1) {
      const x = random() * w;
      const y = h * (0.66 + random() * 0.34);
      const near = (y - h * 0.66) / (h * 0.34);
      const r = 1.5 + near * 7 * random();
      const warm = random() < 0.78;
      const a = 0.25 + random() * 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, warm ? `rgba(255, 200, 130, ${a})` : `rgba(190, 215, 255, ${a})`);
      g.addColorStop(0.6, warm ? `rgba(255, 180, 110, ${a * 0.45})` : `rgba(170, 200, 255, ${a * 0.4})`);
      g.addColorStop(1, "rgba(255, 180, 110, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 40; i += 1) {
      const x = random() * w, y = h * (0.5 + random() * 0.14);
      ctx.fillStyle = `rgba(255, 210, 150, ${0.3 + random() * 0.4})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // the Campanile: a pale lit shaft, the belfry's arches, the spire
    const cx = w * 0.5, top = h * 0.22, base = h * 0.86, half = 30;
    const lit = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    lit.addColorStop(0, "#b9ab90");
    lit.addColorStop(0.55, "#e8dcc0");
    lit.addColorStop(1, "#cdbf9f");
    const towerGlow = ctx.createRadialGradient(cx, top + 120, 10, cx, top + 120, 260);
    towerGlow.addColorStop(0, "rgba(255, 228, 180, 0.22)");
    towerGlow.addColorStop(1, "rgba(255, 228, 180, 0)");
    ctx.fillStyle = towerGlow;
    ctx.fillRect(cx - 260, top - 140, 520, 520);
    ctx.fillStyle = lit;
    ctx.fillRect(cx - half, top + 70, half * 2, base - top - 70);
    ctx.fillRect(cx - half - 5, top + 70, half * 2 + 10, 12);
    ctx.fillRect(cx - half - 5, top + 168, half * 2 + 10, 8);
    // belfry openings, lit from inside
    for (let i = 0; i < 3; i += 1) {
      const x = cx - half + 8 + i * 18;
      ctx.fillStyle = "#fff1cc";
      ctx.fillRect(x, top + 92, 9, 64);
      ctx.beginPath();
      ctx.arc(x + 4.5, top + 92, 4.5, Math.PI, 0);
      ctx.fill();
    }
    // the clock
    ctx.fillStyle = "#fff6dc";
    ctx.beginPath();
    ctx.arc(cx, top + 205, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b5d45";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, top + 205);
    ctx.lineTo(cx, top + 196);
    ctx.moveTo(cx, top + 205);
    ctx.lineTo(cx + 7, top + 208);
    ctx.stroke();
    // the spire
    ctx.fillStyle = "#a99b80";
    ctx.beginPath();
    ctx.moveTo(cx - half - 4, top + 70);
    ctx.lineTo(cx, top - 10);
    ctx.lineTo(cx + half + 4, top + 70);
    ctx.fill();
    ctx.fillStyle = "#d9cbac";
    ctx.beginPath();
    ctx.moveTo(cx, top - 10);
    ctx.lineTo(cx + half + 4, top + 70);
    ctx.lineTo(cx + 6, top + 70);
    ctx.fill();
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(cx - 1, top - 34, 2, 26);
    // trees in front of its foot
    for (let i = 0; i < 60; i += 1) {
      const x = cx + (random() - 0.5) * 520;
      const y = h * (0.78 + random() * 0.1);
      const r = 22 + random() * 40;
      ctx.fillStyle = `rgba(8, 13, 26, ${0.7 + random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function spine(lines: string[], background: string, ink: string, width = 512, height = 256) {
  return paint(width, height, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    const sheen = ctx.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = sheen;
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
    shade.addColorStop(0, "rgba(0,0,0,0.12)");
    shade.addColorStop(0.18, "rgba(0,0,0,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1d2a5c";
    ctx.textBaseline = "middle";
    ctx.font = "46px 'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive";
    text.forEach((line, i) => {
      ctx.save();
      ctx.translate(26, 80 + i * 62);
      ctx.rotate((random() - 0.5) * 0.06);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
  });
}

function lockScreen(lit: "idle" | "receipt") {
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
    if (lit === "receipt") {
      ctx.fillStyle = "rgba(255,255,255,0.86)";
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
    }
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

function puff() {
  return paint(128, 128, (ctx, w, h) => {
    const random = rng(4);
    for (let i = 0; i < 18; i += 1) {
      const x = w / 2 + (random() - 0.5) * 40, y = h / 2 + (random() - 0.5) * 40;
      const r = 18 + random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
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

// —— the grade: a little lens on top of the render

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uVignette: { value: 0.7 },
    uGrain: { value: 0.045 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFade;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.014;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float d = length(c * vec2(uRes.x / uRes.y, 1.0));
      col *= mix(1.0, smoothstep(1.05, 0.2, d), uVignette);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.9, 0.97, 1.1), (1.0 - l) * 0.4);
      col = mix(col, col * vec3(1.06, 1.0, 0.93), l * 0.3);
      col += (hash(vUv * uRes + fract(uTime * 7.31) * 311.0) - 0.5) * uGrain;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createRoom(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new Scene();
  scene.background = new Color(0x05060a);
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.12;

  const camera = new PerspectiveCamera(FOV, 1, 0.01, 30);
  const owned: Array<{ dispose: () => void }> = [environment, pmrem];
  const keep = <T extends { dispose: () => void }>(thing: T) => {
    owned.push(thing);
    return thing;
  };
  const loader = new TextureLoader();

  const standard = (options: ConstructorParameters<typeof MeshStandardMaterial>[0]) => keep(new MeshStandardMaterial(options));
  const add = (geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z: number, parent: Object3D = scene) => {
    keep(geometry!);
    const m = new Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // —— the walls and the floor
  const plaster = keep(noiseTexture(11, "#a49e93", 10));
  plaster.wrapS = plaster.wrapT = RepeatWrapping;
  plaster.repeat.set(6, 3);
  const wallMaterial = standard({ map: plaster, roughness: 0.95 });
  const wall = add(new PlaneGeometry(6, 3.2), wallMaterial, 0, 1.6, WALL);
  wall.castShadow = false;
  const side = add(new PlaneGeometry(4, 3.2), wallMaterial, -1.6, 1.6, 0.6);
  side.rotation.y = Math.PI / 2;
  side.castShadow = false;
  const floor = add(new PlaneGeometry(6, 4), standard({ color: 0x2a1f19, roughness: 0.7 }), 0, 0, 0.4);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const ceiling = add(new PlaneGeometry(6, 4), standard({ color: 0x8a857c, roughness: 1 }), 0, 2.7, 0.4);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.castShadow = false;

  // —— the window, to the right of the monitor
  const view = keep(nightView());
  const windowGroup = new Group();
  windowGroup.position.set(0.86, 1.36, WALL);
  scene.add(windowGroup);
  const glass = add(new PlaneGeometry(0.84, 0.84), keep(new MeshBasicMaterial({ map: view, color: new Color(1.1, 1.1, 1.1) })), 0, 0, 0.003, windowGroup);
  glass.castShadow = false;
  glass.receiveShadow = false;
  const frameMaterial = standard({ color: 0xe9e5dc, roughness: 0.6 });
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

  // —— the desk, its mat
  const wood = keep(walnut(3));
  const deskMaterial = keep(new MeshPhysicalMaterial({ map: wood, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
  add(new RoundedBoxGeometry(1.74, 0.034, 0.8, 2, 0.008), deskMaterial, 0, DESK - 0.017, -0.21);
  for (const x of [-0.84, 0.84]) add(new BoxGeometry(0.04, DESK - 0.034, 0.7), standard({ color: 0x1b1c1f, roughness: 0.6 }), x, (DESK - 0.034) / 2, -0.22);
  const felt = keep(noiseTexture(5, "#2b2d32", 14, 128));
  felt.wrapS = felt.wrapT = RepeatWrapping;
  felt.repeat.set(4, 2);
  add(new RoundedBoxGeometry(0.92, 0.004, 0.4, 2, 0.002), standard({ map: felt, roughness: 1 }), 0.02, DESK + 0.002, 0.05);

  // —— the monitor: bezel, back, a stand, and the bias light on the wall
  const monitor = new Group();
  monitor.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  scene.add(monitor);
  const bezel = standard({ color: 0x0c0d10, roughness: 0.42, metalness: 0.15 });
  const panelH = SCREEN.h + 0.01 + 0.019;
  add(new RoundedBoxGeometry(SCREEN.w + 0.02, panelH, 0.02, 2, 0.005), bezel, 0, -0.0045, -0.01, monitor);
  add(new RoundedBoxGeometry(SCREEN.w - 0.04, panelH - 0.05, 0.035, 2, 0.012), standard({ color: 0x17191d, roughness: 0.55 }), 0, 0, -0.035, monitor);
  // the picture itself is the page, laid over this; this plane only lends its light to the bloom
  const screenGlow = new MeshBasicMaterial({ color: new Color(0.2, 0.25, 0.4) });
  keep(screenGlow);
  const proxy = add(new PlaneGeometry(SCREEN.w - 0.006, SCREEN.h - 0.006), screenGlow, 0, 0, -0.0004, monitor);
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  const aluminium = standard({ color: 0xa3a8b0, roughness: 0.32, metalness: 0.8 });
  add(new BoxGeometry(0.05, 0.27, 0.018), aluminium, 0, -0.16, -0.062, monitor).rotation.x = 0.08;
  add(new RoundedBoxGeometry(0.25, 0.012, 0.18, 2, 0.005), aluminium, SCREEN.x, DESK + 0.006, SCREEN.z - 0.06);
  // a little logo on the chin
  add(new BoxGeometry(0.018, 0.0025, 0.001), standard({ color: 0x3a3d44, metalness: 0.6, roughness: 0.3 }), 0, -SCREEN.h / 2 - 0.0095, 0.0005, monitor);
  const bias = new Mesh(
    keep(new PlaneGeometry(1.5, 0.95)),
    keep(new MeshBasicMaterial({ map: keep(glowSprite("rgba(84, 98, 255, 0.85)")), transparent: true, blending: AdditiveBlending, depthWrite: false })),
  );
  bias.position.set(SCREEN.x, SCREEN.y + 0.02, WALL + 0.004);
  scene.add(bias);

  // a sticky note on the bezel, and one beside it on the wall
  const notes = [
    { text: ["ship it", "→ sleep?"], color: "#ffe36e", x: -0.33, y: 0.86, z: SCREEN.z + 0.004, r: 0.08, s: 0.06 },
    { text: ["hackathon", "sat 9am"], color: "#9fd4ff", x: -0.42, y: 1.07, z: WALL + 0.002, r: -0.05, s: 0.07 },
  ];
  notes.forEach((note, i) => {
    const m = add(
      new PlaneGeometry(note.s, note.s),
      standard({ map: keep(stickyNote(note.text, note.color, i + 2)), roughness: 0.9 }),
      note.x,
      note.y,
      note.z,
    );
    m.rotation.z = note.r;
    m.castShadow = false;
  });

  // —— the keyboard: a dark case and cream caps, cobalt Enter, orange Esc
  const keyboard = new Group();
  keyboard.position.set(0.0, DESK + 0.004, 0.08);
  keyboard.rotation.x = 0.07;
  scene.add(keyboard);
  const U = 0.01905;
  add(new RoundedBoxGeometry(16 * U + 0.018, 0.02, 6 * U + 0.018, 3, 0.006), standard({ color: 0x24272c, roughness: 0.38, metalness: 0.55 }), 0, 0.01, 0, keyboard);
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
  const caps = new InstancedMesh(capGeometry, standard({ color: 0xffffff, roughness: 0.55 }), keyCount);
  caps.castShadow = true;
  caps.receiveShadow = true;
  const colors = { plain: new Color(0xe8e2d4), mod: new Color(0x8f96a1), esc: new Color(0xf08a32), enter: new Color(0x2f6be8), arrow: new Color(0x8f96a1) };
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
  const body = add(new SphereGeometry(1, 40, 24), keep(new MeshPhysicalMaterial({ color: 0xe9e9ec, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 })), 0, 0, 0, mouse);
  body.scale.set(0.031, 0.019, 0.057);
  add(new BoxGeometry(0.0012, 0.006, 0.03), standard({ color: 0x9a9ca3, roughness: 0.6 }), 0, 0.0175, -0.025, mouse);

  // —— the mug, on a cork coaster, steaming
  const mugAt = new Vector3(-0.37, DESK, 0.04);
  add(new CylinderGeometry(0.052, 0.052, 0.006, 40), standard({ color: 0xb08a5c, roughness: 0.95 }), mugAt.x, DESK + 0.003, mugAt.z);
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
  const ceramic = keep(new MeshPhysicalMaterial({ color: 0x2f6be8, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
  add(new LatheGeometry(mugProfile, 48), ceramic, mugAt.x, DESK + 0.006, mugAt.z);
  const handle = add(new TorusGeometry(0.024, 0.0065, 14, 28, Math.PI * 1.25), ceramic, mugAt.x + 0.042, DESK + 0.055, mugAt.z);
  handle.rotation.z = -Math.PI * 0.62;
  add(new CylinderGeometry(0.035, 0.035, 0.002, 32), standard({ color: 0x2a160c, roughness: 0.15 }), mugAt.x, DESK + 0.083, mugAt.z);
  const puffTexture = keep(puff());
  const steam = Array.from({ length: 9 }, (_, i) => {
    const m = new Mesh(
      keep(new PlaneGeometry(0.07, 0.07)),
      keep(new MeshBasicMaterial({ map: puffTexture, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(0.9, 0.85, 0.8), opacity: 0 })),
    );
    m.userData.offset = i / 9;
    scene.add(m);
    return m;
  });

  // —— the lamp: an architect's lamp leaning over the mug, warm
  const black = standard({ color: 0x16171a, roughness: 0.45, metalness: 0.4 });
  const lampBase = new Vector3(-0.72, DESK, -0.42);
  const elbow = new Vector3(-0.78, 1.12, -0.47);
  const head = new Vector3(-0.56, 1.1, -0.24);
  add(new CylinderGeometry(0.07, 0.075, 0.018, 40), black, lampBase.x, DESK + 0.009, lampBase.z);
  const arm = (a: Vector3, b: Vector3) => {
    const tube = new TubeGeometry(new CatmullRomCurve3([a, b]), 1, 0.0065, 10, false);
    add(tube, black, 0, 0, 0);
  };
  arm(lampBase.clone().setY(DESK + 0.018), elbow);
  arm(elbow, head);
  add(new SphereGeometry(0.012, 16, 12), black, elbow.x, elbow.y, elbow.z);
  const shade = new Group();
  shade.position.copy(head);
  shade.lookAt(new Vector3(-0.3, DESK, 0.08));
  scene.add(shade);
  const cone = add(new CylinderGeometry(0.026, 0.06, 0.1, 40, 1, true), keep(new MeshStandardMaterial({ color: 0x16171a, roughness: 0.45, metalness: 0.4, side: DoubleSide })), 0, 0, 0.045, shade);
  cone.rotation.x = Math.PI / 2;
  const bulb = add(new SphereGeometry(0.02, 20, 14), keep(new MeshBasicMaterial({ color: new Color(9, 6.2, 3.4) })), 0, 0, 0.05, shade);
  bulb.castShadow = false;
  const lamp = new SpotLight(0xffc68a, 6, 3, 0.85, 0.85, 1.6);
  lamp.position.copy(head);
  lamp.target.position.set(-0.3, DESK, 0.1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.camera.near = 0.05;
  lamp.shadow.camera.far = 3;
  lamp.shadow.radius = 5;
  scene.add(lamp, lamp.target);

  // —— books by the lamp: what a business and data science student keeps
  const books = [
    { lines: ["DATA C8", "Computational thinking"], bg: "#1c3f8a", ink: "#f6f1e3", w: 0.19, d: 0.24, h: 0.03 },
    { lines: ["UGBA 10", "Principles of business"], bg: "#e9b33b", ink: "#1b1d22", w: 0.17, d: 0.23, h: 0.024 },
    { lines: ["notes", "do not read"], bg: "#efe9dc", ink: "#2f6be8", w: 0.15, d: 0.21, h: 0.014 },
  ];
  let stack = DESK;
  books.forEach((book, i) => {
    const cover = keep(spine(book.lines, book.bg, book.ink));
    const plain = standard({ color: new Color(book.bg).multiplyScalar(0.85), roughness: 0.8 });
    const pages = standard({ color: 0xf1ead9, roughness: 0.9 });
    const materials = [pages, plain, standard({ map: cover, roughness: 0.75 }), plain, pages, pages];
    const geometry = keep(new BoxGeometry(book.w, book.h, book.d));
    const m = new Mesh(geometry, materials);
    m.position.set(-0.52 + i * 0.01, stack + book.h / 2, -0.1 + i * 0.006);
    m.rotation.y = 0.35 - i * 0.18;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    stack += book.h;
  });

  // —— the phone, face up: it lights when the receipt comes in
  const phone = new Group();
  phone.position.set(0.5, DESK, 0.02);
  phone.rotation.y = -0.32;
  scene.add(phone);
  add(new RoundedBoxGeometry(0.072, 0.008, 0.148, 2, 0.003), standard({ color: 0x1d1f24, roughness: 0.3, metalness: 0.6 }), 0, 0.004, 0, phone);
  const phoneIdle = keep(lockScreen("idle"));
  const phoneReceipt = keep(lockScreen("receipt"));
  const phoneScreen = keep(new MeshBasicMaterial({ map: phoneIdle, color: new Color(0, 0, 0) }));
  const phoneFace = add(new PlaneGeometry(0.066, 0.142), phoneScreen, 0, 0.0083, 0, phone);
  phoneFace.rotation.x = -Math.PI / 2;
  phoneFace.castShadow = false;
  let phoneLight = 0;

  // —— the plant, in front of the window
  const pot = keep(new LatheGeometry([new Vector2(0, 0), new Vector2(0.052, 0), new Vector2(0.066, 0.12), new Vector2(0.07, 0.125), new Vector2(0.0, 0.125)], 40));
  add(pot, standard({ color: 0xe7e1d6, roughness: 0.55 }), 0.64, DESK, -0.36);
  add(new CylinderGeometry(0.062, 0.062, 0.004, 32), standard({ color: 0x2b1d14, roughness: 1 }), 0.64, DESK + 0.118, -0.36);
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
    const leaf = add(
      geometry,
      keep(new MeshStandardMaterial({ map: keep(snakeLeaf(i + 3)), alphaTest: 0.5, side: DoubleSide, roughness: 0.6 })),
      0.64 + (leafRandom() - 0.5) * 0.05,
      DESK + 0.115,
      -0.36 + (leafRandom() - 0.5) * 0.05,
    );
    leaf.rotation.y = (i / 8) * Math.PI * 2 + leafRandom() * 0.5;
    leaf.rotation.x = -0.08 - leafRandom() * 0.12;
  }

  // —— the shelf: three first places, the team on the steps at YC, the plushie
  const shelfY = 1.27;
  add(new BoxGeometry(0.64, 0.022, 0.17), deskMaterial, -0.7, shelfY, WALL + 0.085);
  const gold = keep(new MeshPhysicalMaterial({ color: 0xe6b04a, metalness: 1, roughness: 0.22, clearcoat: 0.4 }));
  const trophy = (x: number, scale: number) => {
    const cup = keep(
      new LatheGeometry(
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
      ),
    );
    add(cup, gold, x, shelfY + 0.011, WALL + 0.09);
    add(new BoxGeometry(0.05 * scale, 0.022, 0.05 * scale), standard({ color: 0x1b1c20, roughness: 0.5 }), x, shelfY + 0.011, WALL + 0.09).scale.y = 0.6;
  };
  trophy(-0.93, 1.15);
  trophy(-0.85, 0.95);
  trophy(-0.785, 0.85);
  const frame = new Group();
  frame.position.set(-0.66, shelfY + 0.011, WALL + 0.07);
  frame.rotation.set(-0.1, 0.12, 0);
  scene.add(frame);
  add(new BoxGeometry(0.15, 0.11, 0.01), standard({ color: 0x1b1714, roughness: 0.5 }), 0, 0.055, 0, frame);
  const photo = keep(loader.load("/projects/moment-yc-sm.webp"));
  photo.colorSpace = SRGBColorSpace;
  add(new PlaneGeometry(0.13, 0.087), standard({ map: photo, roughness: 0.4 }), 0, 0.056, 0.0052, frame).castShadow = false;
  const plushieTexture = keep(loader.load("/identity/plushie.webp"));
  plushieTexture.colorSpace = SRGBColorSpace;
  const plushie = add(
    new PlaneGeometry(0.1, 0.152),
    keep(new MeshStandardMaterial({ map: plushieTexture, alphaTest: 0.4, roughness: 0.9, side: DoubleSide })),
    -0.5,
    shelfY + 0.087,
    WALL + 0.1,
  );
  plushie.rotation.y = -0.1;
  const flag = add(new PlaneGeometry(0.34, 0.17), standard({ map: keep(pennant()), roughness: 0.95, transparent: true, alphaTest: 0.2 }), -0.2, 1.33, WALL + 0.003);
  flag.rotation.z = -0.07;
  flag.castShadow = false;

  // —— on the desk, by the monitor's foot: the island's corgi and its owner, as figures
  const toy = (voxels: ReturnType<typeof corgi>, x: number, z: number, turn: number, scale: number) => {
    const geometry = keep(voxels.geometry(3, true));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const m = new Mesh(geometry, keep(new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
    m.scale.setScalar(scale);
    m.position.set(x, DESK, z);
    m.rotation.y = turn;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  toy(corgi(), 0.2, -0.2, -0.5, 0.028);
  toy(person(OUTFITS.aiden), 0.255, -0.24, -0.25, 0.032);

  // —— fairy lights strung along the wall above
  const sag = new CatmullRomCurve3([new Vector3(-1.05, 1.47, WALL + 0.02), new Vector3(-0.5, 1.39, WALL + 0.03), new Vector3(0.1, 1.43, WALL + 0.03), new Vector3(0.42, 1.4, WALL + 0.03)]);
  add(new TubeGeometry(sag, 60, 0.0012, 5, false), black, 0, 0, 0).castShadow = false;
  const bulbMaterial = keep(new MeshBasicMaterial({ color: new Color(5.5, 3.6, 1.6) }));
  for (let i = 0; i <= 16; i += 1) {
    const p = sag.getPoint(i / 16);
    const m = add(new SphereGeometry(0.0065, 10, 8), bulbMaterial, p.x, p.y - 0.008, p.z + 0.004);
    m.castShadow = false;
  }

  // —— light: the screen most of all, the lamp, a little moon through the window
  const screenLight = new RectAreaLight(0x8fb0ff, 3, SCREEN.w, SCREEN.h);
  screenLight.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.01);
  screenLight.lookAt(SCREEN.x, SCREEN.y, 2);
  scene.add(screenLight);
  const hemi = new HemisphereLight(0x2a3555, 0x0c0b0a, 0.35);
  scene.add(hemi);
  const moon = new DirectionalLight(0x7f9cff, 0.35);
  moon.position.set(1.2, 2.0, -1.4);
  scene.add(moon);

  // —— post: bloom, the camera's response, then the grade
  const target = new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.42, 0.45, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);

  // —— size and camera
  let width = 2, height = 2;
  const resize = (w: number, h: number) => {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    grade.uniforms.uRes.value.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tan = (fov: number) => Math.tan(MathUtils.degToRad(fov) / 2);
  const centre = new Vector3(SCREEN.x, SCREEN.y, SCREEN.z);

  /** A point on the screen, from store-page px. */
  const screenPoint = (px: number, py: number) =>
    new Vector3(SCREEN.x + (px / SCREEN.px - 0.5) * SCREEN.w, SCREEN.y + (0.5 - py / SCREEN.py) * SCREEN.h, SCREEN.z);

  const poses = {
    /** Square on and close enough that the screen covers the whole view. */
    cover(aspect: number): Pose {
      const d = Math.min(SCREEN.h / (2 * tan(FOV)), SCREEN.w / (2 * aspect * tan(FOV)));
      return { position: centre.clone().add(new Vector3(0, 0, d)), target: centre.clone(), fov: FOV };
    },
    /** In the chair: the monitor a little above the middle, the desk below. */
    seat(aspect: number): Pose {
      const position = new Vector3(0, 1.24, 0.9);
      const target = new Vector3(0, 0.97, -0.2);
      // on a narrow screen, sit back until the monitor fits across
      const need = (SCREEN.w * 1.18) / 2 / (aspect * tan(FOV));
      const along = position.clone().sub(target);
      if (need > along.length()) position.copy(target).addScaledVector(along.normalize(), need);
      return { position, target, fov: FOV };
    },
    /** Leaning in to read part of the screen: `span` store px across. */
    lean(aspect: number, px: number, py: number, span: number): Pose {
      const point = screenPoint(px, py);
      const fit = (SCREEN.w * (span / SCREEN.px)) / 2;
      const d = Math.max(0.3, fit / (Math.min(aspect, 1.7) * tan(FOV) * 0.9));
      const position = point.clone().add(new Vector3(0.012, d * 0.07, d));
      return { position, target: point, fov: FOV };
    },
  };

  const setPose = (pose: Pose) => {
    camera.position.copy(pose.position);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
  };

  const projected = new Vector3();
  const toViewport = (point: Vector3): [number, number] => {
    projected.copy(point).project(camera);
    return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * height];
  };
  const corners = [
    new Vector3(SCREEN.x - SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x + SCREEN.w / 2, SCREEN.y - SCREEN.h / 2, SCREEN.z),
    new Vector3(SCREEN.x - SCREEN.w / 2, SCREEN.y - SCREEN.h / 2, SCREEN.z),
  ];
  const screenQuad = (): Quad => corners.flatMap((c) => toViewport(c)) as Quad;

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

  let time = 0;
  const render = (dt: number) => {
    time += dt;
    const k = 1 - Math.exp(-dt * 6);
    glow.color.lerp(glowGoal.color, k);
    glow.level += (glowGoal.level - glow.level) * k;
    screenLight.color.copy(glow.color);
    screenLight.intensity = 7 * glow.level;
    screenGlow.color.copy(glow.color).multiplyScalar(0.4 + 0.65 * glow.level);
    bias.material.opacity = 0.35 + 0.65 * Math.min(1, glow.level);

    // the steam: puffs that rise, widen, turn and thin out
    for (const m of steam) {
      const t = (time * 0.22 + m.userData.offset) % 1;
      m.position.set(mugAt.x + Math.sin(t * 7 + m.userData.offset * 20) * 0.012 * (0.4 + t), DESK + 0.1 + t * 0.2, mugAt.z + Math.cos(t * 5) * 0.006);
      m.scale.setScalar(0.5 + t * 1.6);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(t * 2 + m.userData.offset * 6);
      (m.material as MeshBasicMaterial).opacity = Math.sin(t * Math.PI) * 0.32;
    }
    phoneLight += ((phoneScreen.map === phoneReceipt ? 1 : 0) - phoneLight) * (1 - Math.exp(-dt * 5));
    phoneScreen.color.setScalar(phoneLight * 1.3);

    grade.uniforms.uTime.value = time;
    composer.render(dt);
  };

  return {
    /** Compiles every shader off the main thread where it can, then draws a
     * frame nobody sees, so the first real one doesn't stall. */
    prepare: async (pose: Pose) => {
      setPose(pose);
      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        renderer.compile(scene, camera);
      }
      composer.render(0.016);
    },
    poses,
    screenPoint,
    setPose,
    screenQuad,
    toViewport,
    setScreen,
    /** Nudges the mouse on the desk, in metres from where it rests. */
    setMouse: (dx: number, dz: number) => {
      mouse.position.set(mouseRest.x + dx, mouseRest.y, mouseRest.z + dz);
    },
    setPhone: (lit: boolean) => {
      phoneScreen.map = lit ? phoneReceipt : phoneIdle;
      phoneScreen.needsUpdate = true;
      if (!lit) phoneLight = Math.min(phoneLight, 0.6);
    },
    setFade: (amount: number) => {
      grade.uniforms.uFade.value = amount;
    },
    resize,
    render,
    dispose: () => {
      for (const thing of owned) thing.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
    },
  };
}

export type Room = ReturnType<typeof createRoom>;
