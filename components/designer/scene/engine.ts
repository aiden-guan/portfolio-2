import {
  BufferGeometry,
  Color,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from "three";
import { uniforms } from "./shared";
import { buildWorld, LIGHT, type WorldSpot } from "./world";

/** Css px within the container: the marker at (x, y), and how far up and
 * down the thing itself reaches on screen. */
export type Marker = { id: string; x: number; y: number; top: number; bottom: number; visible: boolean };

const PICK_SPACING = 10;

export type EngineEvents = {
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFrame: (markers: Marker[]) => void;
  onInteract: () => void;
};

const MASK_LAYER = 1;
const VIEW = new Vector3(Math.SQRT1_2 * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.SQRT1_2 * Math.cos(Math.PI / 6)).normalize();
const HOME = new Vector3(0, 5.8, 0);
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 3.2;

const BACKGROUND = {
  day: { top: new Color(0xdbe6ec), bottom: new Color(0xf2efe8) },
  night: { top: new Color(0x0e1c40), bottom: new Color(0x283a68) },
};

const POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The pixel-art pass. Reads the scene rendered at art resolution and:
// paints the paper (and at night, the sky: stars and a moon) where nothing was
// drawn; darkens the rim of solid things where they stand in front of
// something far away; grades the scene to moonlight at night; snaps colour to
// a small set of levels with ordered dither, so gradients become pixel
// patterns; lets lit things bleed a dithered glow at night; and eases a
// one-pixel rim around whatever is pointed at.
const POST_FRAGMENT = /* glsl */ `
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
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// for stars: whole-pixel inputs make the hash above fall into rows
float starHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float masked(vec2 uv) {
  float hit = step(0.5, texture2D(tMask, uv).r);
  float visible = step(texture2D(tMaskDepth, uv).r, texture2D(tDepth, uv).r + 0.0004);
  return hit * visible;
}

void main() {
  vec2 px = floor(vUv * uRes);
  vec2 texel = 1.0 / uRes;
  vec2 uv = (px + 0.5) * texel;
  float depth = texture2D(tDepth, uv).r;
  vec4 src = texture2D(tColor, uv);
  float dither = bayer8(px + uSnap) - 0.5;
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
    }
  } else {
    col = toSRGB(src.rgb);
    if (src.a > 0.75) {
      float dl = texture2D(tDepth, uv - vec2(texel.x, 0.0)).r;
      float dr = texture2D(tDepth, uv + vec2(texel.x, 0.0)).r;
      float du = texture2D(tDepth, uv + vec2(0.0, texel.y)).r;
      float dd = texture2D(tDepth, uv - vec2(0.0, texel.y)).r;
      float far = max(max(dl, dr), max(du, dd)) - depth;
      if (far > 0.0022) col *= mix(0.6, 0.55, uNight);
    }
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(luma), col, 1.12), 0.0, 1.0);
    // moonlight: cool and a little grey, except where something warm is lit
    if (uNight > 0.01) {
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float warm = clamp((col.r - col.b) * 2.5, 0.0, 1.0) * smoothstep(0.1, 0.3, l);
      vec3 moonlit = vec3(l) * vec3(0.74, 0.88, 1.22) + vec3(0.0, 0.012, 0.035);
      col = mix(col, moonlit, 0.45 * uNight * (1.0 - warm));
    }
    col = floor(col * uLevels + 0.5 + dither) / uLevels;
  }

  // at night, lit things bleed a soft dithered glow into the pixels around them
  if (uNight > 0.01) {
    float glow = 0.0;
    vec3 tint = vec3(0.0);
    for (int y = -3; y <= 3; y++) {
      for (int x = -3; x <= 3; x++) {
        vec2 o = vec2(float(x), float(y));
        float r = length(o);
        if (r < 0.5 || r > 2.6) continue;
        vec3 c = texture2D(tColor, uv + o * texel).rgb;
        float hot = smoothstep(1.05, 2.0, max(c.r, max(c.g, c.b)));
        float w = hot * (1.0 - r / 3.0) * (1.0 - r / 3.0);
        glow += w;
        tint += c * w;
      }
    }
    if (glow > 0.001) {
      vec3 halo = toSRGB(tint / glow);
      float k = clamp(glow * 0.24, 0.0, 0.55) * uNight;
      col = mix(col, max(col, halo * 0.85), step(bayer8(px + uSnap) + 0.001, k));
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

type View = { target: Vector3; zoom: number };

export function createEngine(container: HTMLElement, canvas: HTMLCanvasElement, events: EngineEvents) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.autoClear = true;

  const world = buildWorld();
  const { scene, spots } = world;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 320);

  const color = new WebGLRenderTarget(2, 2, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
  color.depthTexture = new DepthTexture(2, 2);
  const mask = new WebGLRenderTarget(2, 2, { minFilter: NearestFilter, magFilter: NearestFilter });
  mask.depthTexture = new DepthTexture(2, 2);
  const maskMaterial = new MeshBasicMaterial({ color: 0xffffff });

  // Pointing is read off a picture: every place drawn in its own flat colour
  // over a black world, so the hover follows exactly what is on screen, and
  // whatever stands in front wins.
  const pickTarget = new WebGLRenderTarget(2, 2, { minFilter: NearestFilter, magFilter: NearestFilter });
  const pickBlack = new MeshBasicMaterial({ color: 0x000000 });
  const pickColours = spots.map(
    (_, i) => new MeshBasicMaterial({ color: new Color().setRGB(((i + 1) * PICK_SPACING) / 255, 0, 0, LinearSRGBColorSpace) }),
  );
  const pickOf = new Map<Object3D, number>();
  spots.forEach((spot, i) =>
    spot.object.traverse((o) => {
      if ((o as Mesh).isMesh && !o.userData.decor) pickOf.set(o, i + 1);
    }),
  );
  const pickPixels = new Uint8Array(5 * 5 * 4);

  const post = new ShaderMaterial({
    vertexShader: POST_VERTEX,
    fragmentShader: POST_FRAGMENT,
    uniforms: {
      tColor: { value: color.texture },
      tDepth: { value: color.depthTexture },
      tMask: { value: mask.texture },
      tMaskDepth: { value: mask.depthTexture },
      uRes: { value: new Vector2(2, 2) },
      uSnap: { value: new Vector2() },
      uHasMask: { value: 0 },
      uHover: { value: 0 },
      uLevels: { value: 15 },
      uNight: uniforms.uNight,
      uTime: uniforms.uTime,
      uBgTop: { value: BACKGROUND.day.top.clone() },
      uBgBottom: { value: BACKGROUND.day.bottom.clone() },
      uRing: { value: new Color(0xfff6e2) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const triangle = new BufferGeometry();
  triangle.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const postScene = new Scene();
  const quad = new Mesh(triangle, post);
  quad.frustumCulled = false;
  postScene.add(quad);
  const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // —— size: the canvas is the art resolution, scaled up by whole device pixels
  let artW = 2, artH = 2, cssPerArt = 3, ppu = 7, fit = 7;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const target = Math.min(560, Math.max(300, w / 3));
    const devPerArt = Math.max(1, Math.round((w * dpr) / target));
    cssPerArt = devPerArt / dpr;
    artW = Math.ceil(w / cssPerArt) + 2;
    artH = Math.ceil(h / cssPerArt) + 2;
    renderer.setSize(artW, artH, false);
    canvas.style.width = `${artW * cssPerArt}px`;
    canvas.style.height = `${artH * cssPerArt}px`;
    color.setSize(artW, artH);
    mask.setSize(artW, artH);
    pickTarget.setSize(artW, artH);
    post.uniforms.uRes.value.set(artW, artH);
    fit = Math.min((artW - 2) / 58, (artH - 2) / 41);
    if (w < 700) fit = Math.min((artW - 2) / 52, (artH - 2) / 40);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // —— camera: where it is, where it is going, and how the panel shifts it
  const view: View = { target: HOME.clone(), zoom: 1 };
  const goal: View = { target: HOME.clone(), zoom: 1 };
  const inset = { x: 0, y: 0 }; // css px the open panel takes from the right / bottom
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  camera.position.copy(HOME).addScaledVector(VIEW, 140);
  camera.lookAt(HOME);
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  forward.copy(VIEW).negate();

  const clampTarget = (t: Vector3) => {
    const sx = t.dot(right), sy = t.dot(up), sz = t.dot(forward);
    const limitX = 24, limitY = 16;
    const cx = Math.max(-limitX, Math.min(limitX, sx));
    const cy = Math.max(-limitY + 1, Math.min(limitY + 3, sy));
    return new Vector3().addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(forward, sz);
  };

  const offset = { x: 0, y: 0 };
  const placeCamera = () => {
    ppu = fit * view.zoom;
    const halfW = artW / 2 / ppu, halfH = artH / 2 / ppu;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    // the panel covers part of the view: look at a point offset so the
    // subject sits in the middle of what is left
    const shiftX = (inset.x / 2 / cssPerArt) / ppu;
    const shiftY = (inset.y / 2 / cssPerArt) / ppu;
    const t = view.target.clone().addScaledVector(right, shiftX).addScaledVector(up, -shiftY);
    // snap to the pixel grid so the picture moves in whole pixels, and make
    // up the remainder by sliding the canvas itself
    const sx = t.dot(right) * ppu, sy = t.dot(up) * ppu, sz = t.dot(forward);
    const rx = Math.round(sx), ry = Math.round(sy);
    const snapped = new Vector3().addScaledVector(right, rx / ppu).addScaledVector(up, ry / ppu).addScaledVector(forward, sz);
    camera.position.copy(snapped).addScaledVector(VIEW, 140);
    camera.updateMatrixWorld();
    post.uniforms.uSnap.value.set(rx, ry);
    offset.x = -(1 + (sx - rx)) * cssPerArt;
    offset.y = -(1 - (sy - ry)) * cssPerArt;
    canvas.style.transform = `translate3d(${offset.x.toFixed(3)}px, ${offset.y.toFixed(3)}px, 0)`;
  };

  // —— pointing: hover, click, drag to look around, wheel and pinch to zoom
  const swapped: Array<{ o: Object3D; material?: Material | Material[]; visible: boolean }> = [];
  const pickAt = (clientX: number, clientY: number): string | null => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * artW);
    const y = Math.floor((1 - (clientY - rect.top) / rect.height) * artH);
    if (x < 0 || y < 0 || x >= artW || y >= artH) return null;
    swapped.length = 0;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        swapped.push({ o, material: mesh.material, visible: o.visible });
        const id = pickOf.get(o) ?? 0;
        mesh.material = id ? pickColours[id - 1] : pickBlack;
      } else if ("isLine" in o || "isPoints" in o) {
        swapped.push({ o, visible: o.visible });
        o.visible = false;
      }
    });
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(pickTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    renderer.shadowMap.enabled = shadows;
    for (const item of swapped) {
      if (item.material) (item.o as Mesh).material = item.material;
      item.o.visible = item.visible;
    }
    const x0 = Math.max(0, Math.min(artW - 5, x - 2));
    const y0 = Math.max(0, Math.min(artH - 5, y - 2));
    renderer.readRenderTargetPixels(pickTarget, x0, y0, 5, 5, pickPixels);
    const idAt = (i: number) => Math.round(pickPixels[i * 4] / PICK_SPACING);
    // the pixel under the pointer wins; failing that, whatever covers most
    // of the pixels within two of it, so small things are easy to land on
    const centre = idAt((y - y0) * 5 + (x - x0));
    if (centre) return spots[centre - 1]?.id ?? null;
    const counts = new Map<number, number>();
    for (let i = 0; i < 25; i += 1) {
      const id = idAt(i);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = 0;
    let most = 0;
    for (const [id, count] of counts) {
      if (count > most) {
        best = id;
        most = count;
      }
    }
    return best ? spots[best - 1]?.id ?? null : null;
  };

  let hovered: string | null = null;
  let selected: string | null = null;
  // what is outlined, and how far the outline has eased in
  let highlighted: WorldSpot | null = null;
  let glow = 0;
  const outline = (spot: WorldSpot | null, on: boolean) =>
    spot?.object.traverse((o) => {
      if (o.userData.decor) return;
      if (on) o.layers.enable(MASK_LAYER);
      else o.layers.disable(MASK_LAYER);
    });
  const syncHighlight = () => {
    const wanted = hovered ?? selected;
    if (!wanted || wanted === highlighted?.id) return;
    const next = spots.find((spot) => spot.id === wanted) ?? null;
    outline(highlighted, false);
    outline(next, true);
    // moving straight from one thing to the next restarts the ease low
    if (highlighted) glow = Math.min(glow, 0.3);
    highlighted = next;
  };
  const setHover = (id: string | null) => {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id ? "pointer" : "grab";
    syncHighlight();
    events.onHover(id);
  };

  let pointer: { x: number; y: number } | null = null;
  let pickDirty = false;
  let lastView = "";
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let downAt = { x: 0, y: 0, time: 0 };
  let pinchFrom = 0;
  const velocity = new Vector2();
  let lastMove = 0;

  const panBy = (dx: number, dy: number) => {
    const scale = 1 / (cssPerArt * ppu);
    goal.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    goal.target.copy(clampTarget(goal.target));
    view.target.copy(goal.target);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const before = goal.zoom;
    goal.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, goal.zoom * factor));
    // keep the point under the pointer where it is
    const rect = container.getBoundingClientRect();
    const ox = clientX - rect.left - (rect.width - inset.x) / 2;
    const oy = clientY - rect.top - (rect.height - inset.y) / 2;
    const k = 1 / (cssPerArt * fit);
    const shift = k * (1 / before - 1 / goal.zoom);
    goal.target.addScaledVector(right, ox * shift).addScaledVector(up, -oy * shift);
    goal.target.copy(clampTarget(goal.target));
  };

  const onPointerDown = (event: PointerEvent) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
    dragging = false;
    velocity.set(0, 0);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchFrom = Math.hypot(a.x - b.x, a.y - b.y);
    }
    events.onInteract();
  };
  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      if (event.pointerType === "mouse") {
        pointer = { x: event.clientX, y: event.clientY };
        pickDirty = true;
      }
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchFrom > 0) zoomAt(distance / pinchFrom, (a.x + b.x) / 2, (a.y + b.y) / 2);
      view.zoom = goal.zoom;
      pinchFrom = distance;
      dragging = true;
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (!dragging && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) {
      dragging = true;
      canvas.style.cursor = "grabbing";
      setHover(null);
    }
    if (dragging) {
      panBy(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - lastMove);
      velocity.set(dx / dt, dy / dt);
      lastMove = now;
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size > 0) return;
    if (!dragging) {
      select(pickAt(event.clientX, event.clientY));
    } else if (!reduced && performance.now() - lastMove < 60) {
      coast.set(velocity.x * 16, velocity.y * 16);
    }
    dragging = false;
    canvas.style.cursor = hovered ? "pointer" : "grab";
  };
  const onLeave = () => {
    pointer = null;
    setHover(null);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    events.onInteract();
    if (event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX) * 0.6) {
      zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016)), event.clientX, event.clientY);
    } else {
      goal.target.addScaledVector(right, (event.deltaX / (cssPerArt * ppu)));
      goal.target.copy(clampTarget(goal.target));
    }
  };
  const onDoubleClick = (event: MouseEvent) => zoomAt(1.6, event.clientX, event.clientY);
  const coast = new Vector2();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.style.cursor = "grab";

  let before: View | null = null;
  function select(id: string | null) {
    if (id && !selected) before = { target: goal.target.clone(), zoom: goal.zoom };
    selected = id;
    // the pointer may not be over the thing it was over once the camera moves
    if (hovered && hovered !== id) setHover(null);
    syncHighlight();
    const spot = id ? spots.find((s) => s.id === id) : null;
    if (spot) {
      goal.target.copy(spot.focus);
      goal.zoom = Math.max(goal.zoom, id === "aiden" ? 2.3 : 1.9);
    } else if (before) {
      goal.target.copy(before.target);
      goal.zoom = before.zoom;
      before = null;
    }
    events.onSelect(id);
  }

  // —— night
  let night = 0;
  let nightGoal = 0;
  const applyLight = () => {
    const k = night;
    world.sun.color.copy(LIGHT.day.sun).lerp(LIGHT.night.sun, k);
    world.sun.intensity = LIGHT.day.sunIntensity + (LIGHT.night.sunIntensity - LIGHT.day.sunIntensity) * k;
    world.hemi.color.copy(LIGHT.day.sky).lerp(LIGHT.night.sky, k);
    world.hemi.groundColor.copy(LIGHT.day.ground).lerp(LIGHT.night.ground, k);
    world.hemi.intensity = LIGHT.day.hemi + (LIGHT.night.hemi - LIGHT.day.hemi) * k;
    post.uniforms.uBgTop.value.copy(BACKGROUND.day.top).lerp(BACKGROUND.night.top, k);
    post.uniforms.uBgBottom.value.copy(BACKGROUND.day.bottom).lerp(BACKGROUND.night.bottom, k);
    uniforms.uNight.value = k;
    uniforms.uCloudAmount.value = 1 - k * 0.8;
    // dark colours need finer steps or the dither turns to noise
    post.uniforms.uLevels.value = 15 + 7 * k;
  };
  // the shared uniforms outlive a visit; start every visit from daylight
  applyLight();

  // —— the loop
  const projected = new Vector3();
  const toScreen = (point: Vector3) => {
    projected.copy(point).project(camera);
    return {
      x: ((projected.x + 1) / 2) * artW * cssPerArt + offset.x,
      y: ((1 - projected.y) / 2) * artH * cssPerArt + offset.y,
    };
  };
  const corner = new Vector3();
  let start = 0;
  let last = 0;
  let frame = 0;
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (!start) start = now;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const time = (now - start) / 1000;

    uniforms.uTime.value = time;
    uniforms.uCloud.value.set(time * 0.02, time * -0.012);
    uniforms.uReveal.value = reduced ? 1 : Math.min(1, easeOut(Math.max(0, time - 0.15) / 2.4));
    for (const update of world.updates) update(time, dt);

    if (Math.abs(nightGoal - night) > 0.001) {
      night += (nightGoal - night) * (1 - Math.exp(-dt * 3));
      applyLight();
    }

    if (coast.lengthSq() > 0.01 && pointers.size === 0) {
      panBy(coast.x, coast.y);
      coast.multiplyScalar(Math.exp(-dt * 6));
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    if (pointers.size === 0) view.target.lerp(goal.target, k);
    view.zoom += (goal.zoom - view.zoom) * k;
    placeCamera();

    const viewKey = `${camera.position.x.toFixed(3)},${camera.position.y.toFixed(3)},${ppu.toFixed(4)}`;
    if (pointer && pointers.size === 0 && (pickDirty || viewKey !== lastView)) setHover(pickAt(pointer.x, pointer.y));
    pickDirty = false;
    lastView = viewKey;

    const wanted = hovered ?? selected;
    glow += ((wanted ? 1 : 0) - glow) * (reduced ? 1 : 1 - Math.exp(-dt * 16));
    if (!wanted && glow < 0.01 && highlighted) {
      outline(highlighted, false);
      highlighted = null;
      glow = 0;
    }
    post.uniforms.uHover.value = glow;

    renderer.setRenderTarget(color);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    if (highlighted) {
      renderer.setRenderTarget(mask);
      renderer.setClearColor(0x000000, 0);
      scene.overrideMaterial = maskMaterial;
      camera.layers.set(MASK_LAYER);
      const shadows = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      renderer.render(scene, camera);
      renderer.shadowMap.enabled = shadows;
      camera.layers.set(0);
      scene.overrideMaterial = null;
    }
    post.uniforms.uHasMask.value = highlighted ? 1 : 0;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);

    // where the markers go, in css px within the container
    const markers: Marker[] = spots.map((spot) => {
      const { x, y } = toScreen(spot.anchor);
      spot.box.getCenter(corner);
      corner.y = spot.box.max.y;
      const top = toScreen(corner).y;
      corner.y = spot.box.min.y;
      const bottom = toScreen(corner).y;
      return { id: spot.id, x, y, top: Math.min(top, y), bottom, visible: uniforms.uReveal.value > 0.95 };
    });
    events.onFrame(markers);
  };
  frame = requestAnimationFrame(tick);
  if (reduced) uniforms.uReveal.value = 1;

  return {
    select,
    hover: (id: string | null) => setHover(id),
    setInset: (x: number, y: number) => {
      inset.x = x;
      inset.y = y;
    },
    setNight: (on: boolean) => {
      nightGoal = on ? 1 : 0;
      if (reduced) {
        night = nightGoal;
        applyLight();
      }
    },
    home: () => {
      goal.target.copy(HOME);
      goal.zoom = 1;
    },
    zoomBy: (factor: number) => {
      const rect = container.getBoundingClientRect();
      zoomAt(factor, rect.left + (rect.width - inset.x) / 2, rect.top + (rect.height - inset.y) / 2);
    },
    panBy: (dx: number, dy: number) => {
      goal.target.addScaledVector(right, -dx / (cssPerArt * ppu)).addScaledVector(up, dy / (cssPerArt * ppu));
      goal.target.copy(clampTarget(goal.target));
    },
    spots: spots.map((spot) => ({ id: spot.id, slug: spot.slug })),
    dispose: () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      color.dispose();
      mask.dispose();
      pickTarget.dispose();
      post.dispose();
      renderer.dispose();
    },
  };
}

function easeOut(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

export type Engine = ReturnType<typeof createEngine>;
