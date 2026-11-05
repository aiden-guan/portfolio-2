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
import { POST_FRAGMENT, POST_VERTEX } from "./post";
import { uniforms } from "./shared";
import { buildWorld, LIGHT, type WorldSpot } from "./world";

/** Css px within the container: the marker at (x, y), and how far up and
 * down the thing itself reaches on screen. */
export type Marker = { id: string; x: number; y: number; top: number; bottom: number; visible: boolean };

/** The art's pixel grid this frame, in css px within the container: an art
 * pixel is `unit` across and the grid starts at (x, y), so whatever is laid
 * over the canvas can sit on it. `moved` is false when nothing on screen has
 * moved since the frame before. */
export type Grid = { unit: number; x: number; y: number; moved: boolean };

const PICK_SPACING = 10;
/** the pick is drawn for this many art pixels square around the pointer */
const PICK_SIZE = 5;

export type EngineEvents = {
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onFrame: (markers: Marker[], grid: Grid) => void;
  onInteract: () => void;
};

const MASK_LAYER = 1;
const VIEW = new Vector3(Math.SQRT1_2 * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.SQRT1_2 * Math.cos(Math.PI / 6)).normalize();
const HOME = new Vector3(0, 5.8, 0);
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 3.2;

// How far the island reaches on screen, along the camera's right and up, in
// world units: the edge all round, and the top of the tree.
const REACH = { left: -30, right: 30, bottom: -15, top: 24 };

// How quickly the camera settles, as the angular frequency of a critically
// damped spring: gliding to a place, zooming, panning by keys, and coasting
// to a stop after a flick (where it is also the friction).
const GLIDE = 4.4;
const ZOOM = 9;
const PAN = 7;
const COAST = 4.5;

const BACKGROUND = {
  day: { top: new Color(0xdbe6ec), bottom: new Color(0xf2efe8) },
  night: { top: new Color(0x0e1c40), bottom: new Color(0x283a68) },
};

export { POST_FRAGMENT, POST_VERTEX } from "./post";

// A critically damped spring, stepped exactly, so it is the same at any frame
// rate: returns where it is now and leaves its velocity in `springSpeed`. It
// never overshoots a goal it starts at rest from, and a new goal mid-move
// keeps the speed it has, so every move can be interrupted.
let springSpeed = 0;
function spring(x: number, v: number, goal: number, omega: number, dt: number) {
  const d = x - goal;
  const c = v + omega * d;
  const e = Math.exp(-omega * dt);
  springSpeed = (v - c * omega * dt) * e;
  return goal + (d + c * dt) * e;
}

// Past an edge the island gives, less the further it's pulled.
function give(value: number, lo: number, hi: number, room: number) {
  if (value < lo) return lo - band(lo - value, room);
  if (value > hi) return hi + band(value - hi, room);
  return value;
}
const band = (over: number, room: number) => (1 - 1 / ((over * 0.55) / room + 1)) * room;
// and back: how far it was pulled to give this much, for a drag that starts
// out there
function ungive(value: number, lo: number, hi: number, room: number) {
  const back = (over: number) => over / 0.55 / Math.max(1e-3, 1 - Math.min(0.999, over / room));
  if (value < lo) return lo - back(lo - value);
  if (value > hi) return hi + back(value - hi);
  return value;
}
const clamp = (value: number, lo: number, hi: number) => (value < lo ? lo : value > hi ? hi : value);

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
  // whatever stands in front wins. Only the few pixels around the pointer are
  // drawn, by narrowing the camera to them.
  const pickTarget = new WebGLRenderTarget(PICK_SIZE, PICK_SIZE, { minFilter: NearestFilter, magFilter: NearestFilter });
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
  // the island doesn't change what it's made of, so what to swap for the pick
  // is worked out once
  const pickMeshes: Mesh[] = [];
  const pickWith: Material[] = [];
  const drawnWith: Array<Material | Material[]> = [];
  const pickHidden: Object3D[] = [];
  const pickHiddenWas: boolean[] = [];
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const id = pickOf.get(o) ?? 0;
      pickMeshes.push(mesh);
      pickWith.push(id ? pickColours[id - 1] : pickBlack);
      drawnWith.push(mesh.material);
    } else if ("isLine" in o || "isPoints" in o) {
      pickHidden.push(o);
      pickHiddenWas.push(false);
    }
  });
  const pickPixels = new Uint8Array(PICK_SIZE * PICK_SIZE * 4);
  const pickCounts = new Uint8Array(spots.length + 1);

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
      // the rim round whatever is pointed at; the page's place tags are lit
      // in the same cream (designer.module.css, --rim)
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
  let artW = 2, artH = 2, cssPerArt = 3, ppu = 7, fit = 7, dpr = 1;
  // the container's place on the page, read once per resize rather than per frame
  const box = { left: 0, top: 0, width: 0, height: 0 };
  let resized = true;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
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
    post.uniforms.uRes.value.set(artW, artH);
    fit = Math.min((artW - 2) / 58, (artH - 2) / 41);
    if (w < 700) fit = Math.min((artW - 2) / 52, (artH - 2) / 40);
    const rect = container.getBoundingClientRect();
    box.left = rect.left;
    box.top = rect.top;
    box.width = rect.width;
    box.height = rect.height;
    resized = true;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // —— the camera, kept as where it looks along the screen's right and up
  // (the island is drawn straight down one axis, so depth never shows)
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  camera.position.copy(HOME).addScaledVector(VIEW, 140);
  camera.lookAt(HOME);
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  forward.copy(VIEW).negate();
  const depth = HOME.dot(forward);
  const home = { x: HOME.dot(right), y: HOME.dot(up) };
  const focusOf = spots.map((spot) => ({ x: spot.focus.dot(right), y: spot.focus.dot(up) }));

  // what is drawn, where it's going, and how fast it's moving on the way
  const view = { x: home.x, y: home.y, zoom: 1 };
  const goal = { x: home.x, y: home.y, zoom: 1 };
  const velocity = { x: 0, y: 0, zoom: 0 };
  // everything a visitor does settles on a spring; the trailer's slow moves
  // (look) keep the plain drift they were cut to
  let follow: "spring" | "drift" = "spring";
  let pace = GLIDE;
  // css px the open panel takes from the right / bottom, eased with the camera
  const inset = { x: 0, y: 0 };
  const insetGoal = { x: 0, y: 0 };
  const insetSpeed = { x: 0, y: 0 };
  // while zooming about a point, that point stays put on screen: where it is
  // on the island, and how far it is from the middle of the view, in css px
  const anchor = { on: false, x: 0, y: 0, dx: 0, dy: 0 };
  const anchoredX = (zoom: number) => anchor.x - anchor.dx / (cssPerArt * fit * zoom);
  const anchoredY = (zoom: number) => anchor.y + anchor.dy / (cssPerArt * fit * zoom);

  // Where the camera may look at a zoom: from half a view in from the
  // island's ends; when the view holds all of it, near the middle.
  const limits = { x0: 0, x1: 0, y0: 0, y1: 0, roomX: 1, roomY: 1 };
  const boundsAt = (zoom: number) => {
    const p = fit * zoom;
    const halfW = (artW - 2) / 2 / p;
    const halfH = (artH - 2) / 2 / p;
    const span = (lo: number, hi: number, half: number, i: 0 | 1) => {
      const inward = Math.min(half * 0.5, (hi - lo) / 2);
      let a = lo + inward;
      let b = hi - inward;
      if (b - a < 6) {
        a = (lo + hi) / 2 - 3;
        b = (lo + hi) / 2 + 3;
      }
      if (i === 0) {
        limits.x0 = a;
        limits.x1 = b;
      } else {
        limits.y0 = a;
        limits.y1 = b;
      }
    };
    span(REACH.left, REACH.right, halfW, 0);
    span(REACH.bottom, REACH.top, halfH, 1);
    // how far past an edge a drag can pull it
    limits.roomX = halfW * 0.3;
    limits.roomY = halfH * 0.3;
    return limits;
  };

  // The middle of the canvas in css px within the container (the canvas
  // overhangs by an art pixel all round), and the middle of what the panel
  // leaves of it.
  const centreX = () => (artW / 2 - 1) * cssPerArt - inset.x / 2;
  const centreY = () => (artH / 2 - 1) * cssPerArt - inset.y / 2;
  const anchorAt = (clientX: number, clientY: number) => {
    const k = 1 / (cssPerArt * fit * view.zoom);
    anchor.dx = clientX - box.left - centreX();
    anchor.dy = clientY - box.top - centreY();
    anchor.x = view.x + anchor.dx * k;
    anchor.y = view.y - anchor.dy * k;
    anchor.on = true;
  };

  const offset = { x: 0, y: 0 };
  // the camera's pixel on the grid and its scale, to tell when the picture
  // has moved
  let snapX = 0, snapY = 0, snapPpu = 0;
  let moved = true;
  const placeCamera = () => {
    ppu = fit * view.zoom;
    const halfW = artW / 2 / ppu, halfH = artH / 2 / ppu;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    // the panel covers part of the view: look at a point offset so the
    // subject sits in the middle of what is left; then snap to the pixel
    // grid so the picture moves in whole pixels, and make up the remainder
    // by sliding the canvas itself
    const sx = (view.x + inset.x / 2 / cssPerArt / ppu) * ppu;
    const sy = (view.y - inset.y / 2 / cssPerArt / ppu) * ppu;
    const rx = Math.round(sx), ry = Math.round(sy);
    camera.position.set(0, 0, 0).addScaledVector(right, rx / ppu).addScaledVector(up, ry / ppu).addScaledVector(forward, depth).addScaledVector(VIEW, 140);
    camera.updateMatrixWorld();
    post.uniforms.uSnap.value.set(rx, ry);
    // (on whole device pixels, so the canvas is never resampled between them)
    const ox = Math.round(-(1 + (sx - rx)) * cssPerArt * dpr) / dpr;
    const oy = Math.round(-(1 - (sy - ry)) * cssPerArt * dpr) / dpr;
    moved = resized || rx !== snapX || ry !== snapY || ppu !== snapPpu || Math.abs(ox - offset.x) > 1e-3 || Math.abs(oy - offset.y) > 1e-3;
    if (moved) canvas.style.transform = `translate3d(${ox.toFixed(3)}px, ${oy.toFixed(3)}px, 0)`;
    snapX = rx;
    snapY = ry;
    snapPpu = ppu;
    offset.x = ox;
    offset.y = oy;
    resized = false;
  };

  // —— pointing: hover, click, drag to look around, wheel and pinch to zoom
  const pickAt = (clientX: number, clientY: number): string | null => {
    const x = Math.floor((clientX - box.left - offset.x) / cssPerArt);
    const y = artH - 1 - Math.floor((clientY - box.top - offset.y) / cssPerArt);
    if (x < 0 || y < 0 || x >= artW || y >= artH) return null;
    const x0 = clamp(x - 2, 0, artW - PICK_SIZE);
    const y0 = clamp(y - 2, 0, artH - PICK_SIZE);
    for (let i = 0; i < pickMeshes.length; i += 1) pickMeshes[i].material = pickWith[i];
    for (let i = 0; i < pickHidden.length; i += 1) {
      pickHiddenWas[i] = pickHidden[i].visible;
      pickHidden[i].visible = false;
    }
    camera.setViewOffset(artW, artH, x0, artH - y0 - PICK_SIZE, PICK_SIZE, PICK_SIZE);
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(pickTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    renderer.shadowMap.enabled = shadows;
    camera.clearViewOffset();
    for (let i = 0; i < pickMeshes.length; i += 1) pickMeshes[i].material = drawnWith[i];
    for (let i = 0; i < pickHidden.length; i += 1) pickHidden[i].visible = pickHiddenWas[i];
    renderer.readRenderTargetPixels(pickTarget, 0, 0, PICK_SIZE, PICK_SIZE, pickPixels);
    const idAt = (i: number) => Math.round(pickPixels[i * 4] / PICK_SPACING);
    // the pixel under the pointer wins; failing that, whatever covers most
    // of the pixels within two of it, so small things are easy to land on
    const centre = idAt((y - y0) * PICK_SIZE + (x - x0));
    if (centre) return spots[centre - 1]?.id ?? null;
    pickCounts.fill(0);
    let best = 0;
    for (let i = 0; i < PICK_SIZE * PICK_SIZE; i += 1) {
      const id = idAt(i);
      if (id <= 0 || id > spots.length) continue;
      pickCounts[id] += 1;
      if (pickCounts[id] > pickCounts[best]) best = id;
    }
    return best ? spots[best - 1].id : null;
  };

  // What is pointed at, from two places: the picture under the mouse, and
  // the page (a marker hovered or focused). The page's wins, and leaving the
  // canvas for a marker only clears the picture's, whichever event comes first.
  let pickHover: string | null = null;
  let pageHover: string | null = null;
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

  type Mode = "idle" | "press" | "drag" | "pinch";
  let mode: Mode = "idle";
  const setCursor = () => {
    canvas.style.cursor = mode === "drag" || mode === "pinch" ? "grabbing" : pickHover ? "pointer" : "grab";
  };
  const applyHover = () => {
    setCursor();
    const next = pageHover ?? pickHover;
    if (next === hovered) return;
    hovered = next;
    syncHighlight();
    events.onHover(next);
  };

  // the mouse over the canvas, and the art pixel it was last picked at
  let pointerIn = false, pointerX = 0, pointerY = 0;
  let pickedPixel = -1;
  let pickWait = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const press = { x: 0, y: 0 };
  const pinch = { distance: 1, zoom: 1 };
  // where a drag would have put the camera with no edges, and how fast it
  // was going (world units a second, smoothed over the last few moves)
  const raw = { x: 0, y: 0 };
  const flick = { x: 0, y: 0, at: 0 };

  const catchCamera = () => {
    goal.x = view.x;
    goal.y = view.y;
    goal.zoom = view.zoom;
    velocity.x = velocity.y = velocity.zoom = 0;
    anchor.on = false;
    follow = "spring";
  };
  const pinchState = () => {
    let i = 0, ax = 0, ay = 0, bx = 0, by = 0;
    for (const p of pointers.values()) {
      if (i === 0) {
        ax = p.x;
        ay = p.y;
      } else if (i === 1) {
        bx = p.x;
        by = p.y;
      }
      i += 1;
    }
    return { mx: (ax + bx) / 2, my: (ay + by) / 2, distance: Math.max(1, Math.hypot(ax - bx, ay - by)) };
  };

  const onPointerDown = (event: PointerEvent) => {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // a pointer already gone; the drag carries on without the capture
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    events.onInteract();
    catchCamera();
    if (pointers.size === 1) {
      mode = "press";
      press.x = event.clientX;
      press.y = event.clientY;
      const lim = boundsAt(view.zoom);
      raw.x = ungive(view.x, lim.x0, lim.x1, lim.roomX);
      raw.y = ungive(view.y, lim.y0, lim.y1, lim.roomY);
      flick.x = flick.y = 0;
      flick.at = event.timeStamp;
    } else if (pointers.size === 2) {
      mode = "pinch";
      const { mx, my, distance } = pinchState();
      pinch.distance = distance;
      pinch.zoom = view.zoom;
      anchorAt(mx, my);
      pickHover = null;
      applyHover();
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      if (event.pointerType === "mouse") {
        pointerIn = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
      }
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    if (mode === "pinch") {
      if (pointers.size < 2) return;
      // two fingers zoom about the point between them, and carry it with them
      const { mx, my, distance } = pinchState();
      const zoom = clamp((pinch.zoom * distance) / pinch.distance, MIN_ZOOM, MAX_ZOOM);
      anchor.dx = mx - box.left - centreX();
      anchor.dy = my - box.top - centreY();
      const lim = boundsAt(zoom);
      view.zoom = goal.zoom = zoom;
      view.x = goal.x = give(anchoredX(zoom), lim.x0, lim.x1, lim.roomX);
      view.y = goal.y = give(anchoredY(zoom), lim.y0, lim.y1, lim.roomY);
      return;
    }
    if (mode === "press" && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {
      mode = "drag";
      pickHover = null;
      applyHover();
    }
    if (mode !== "drag") return;
    const k = 1 / (cssPerArt * ppu);
    raw.x -= dx * k;
    raw.y += dy * k;
    const lim = boundsAt(view.zoom);
    const nx = give(raw.x, lim.x0, lim.x1, lim.roomX);
    const ny = give(raw.y, lim.y0, lim.y1, lim.roomY);
    const seconds = Math.max(0.001, (event.timeStamp - flick.at) / 1000);
    const w = 1 - Math.exp(-seconds / 0.045);
    flick.x += ((nx - view.x) / seconds - flick.x) * w;
    flick.y += ((ny - view.y) / seconds - flick.y) * w;
    flick.at = event.timeStamp;
    view.x = goal.x = nx;
    view.y = goal.y = ny;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    const cancelled = event.type === "pointercancel";
    if (mode === "pinch") {
      if (pointers.size === 1) {
        // one finger left: it carries on as a drag from where it is
        mode = "drag";
        anchor.on = false;
        const lim = boundsAt(view.zoom);
        raw.x = ungive(view.x, lim.x0, lim.x1, lim.roomX);
        raw.y = ungive(view.y, lim.y0, lim.y1, lim.roomY);
        flick.x = flick.y = 0;
        flick.at = event.timeStamp;
        return;
      }
      if (pointers.size > 0) return;
    }
    if (pointers.size > 0) return;
    const was = mode;
    mode = "idle";
    if (was === "press" && !cancelled) {
      select(pickAt(event.clientX, event.clientY));
    } else if (was === "drag" || was === "pinch") {
      // let go, it keeps going and slows to a stop; short of an edge it was
      // pulled past, it comes back
      anchor.on = false;
      const fresh = !reduced && was === "drag" && event.timeStamp - flick.at < 80;
      velocity.x = fresh ? flick.x : 0;
      velocity.y = fresh ? flick.y : 0;
      const lim = boundsAt(view.zoom);
      goal.x = clamp(view.x + velocity.x / COAST, lim.x0, lim.x1);
      goal.y = clamp(view.y + velocity.y / COAST, lim.y0, lim.y1);
      follow = "spring";
      pace = COAST;
    }
    setCursor();
  };
  const onLeave = () => {
    pointerIn = false;
    pickedPixel = -1;
    pickHover = null;
    applyHover();
  };
  const zoomAbout = (clientX: number, clientY: number, zoom: number, direct: boolean) => {
    // successive turns of the wheel zoom about the point they started on
    if (!anchor.on || Math.abs(clientX - box.left - centreX() - anchor.dx) > 2 || Math.abs(clientY - box.top - centreY() - anchor.dy) > 2) {
      anchorAt(clientX, clientY);
    }
    goal.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    follow = "spring";
    pace = ZOOM;
    if (direct || reduced) {
      view.zoom = goal.zoom;
      velocity.zoom = 0;
    }
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    events.onInteract();
    if (mode !== "idle") return;
    const lines = event.deltaMode === 1 ? 16 : 1;
    if (event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX) * 0.6) {
      // a trackpad's pinch arrives as a wheel with ctrl held, finely, and is
      // followed directly; a wheel's notches are eased
      zoomAbout(event.clientX, event.clientY, goal.zoom * Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0016)), event.ctrlKey);
    } else {
      anchor.on = false;
      const lim = boundsAt(goal.zoom);
      goal.x = clamp(goal.x + (event.deltaX * lines) / (cssPerArt * ppu), lim.x0, lim.x1);
      follow = "spring";
      pace = PAN;
    }
  };
  const onDoubleClick = (event: MouseEvent) => zoomAbout(event.clientX, event.clientY, goal.zoom * 1.6, false);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onLeave);
  // the wheel is taken over the whole stage, so it zooms over a marker too
  container.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.style.cursor = "grab";

  const indexOf = (id: string | null) => (id ? spots.findIndex((s) => s.id === id) : -1);
  let before: { x: number; y: number; zoom: number } | null = null;
  function select(id: string | null) {
    follow = "spring";
    pace = GLIDE;
    anchor.on = false;
    if (id && !selected) before = { x: goal.x, y: goal.y, zoom: goal.zoom };
    selected = id;
    // the pointer may not be over the thing it was over once the camera moves
    pageHover = null;
    if (pickHover && pickHover !== id) pickHover = null;
    applyHover();
    syncHighlight();
    const i = indexOf(id);
    if (i >= 0) {
      goal.x = focusOf[i].x;
      goal.y = focusOf[i].y;
      goal.zoom = Math.max(goal.zoom, id === "aiden" ? 2.3 : 1.9);
    } else if (before) {
      goal.x = before.x;
      goal.y = before.y;
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

  // —— the camera, a frame on
  const moveCamera = (dt: number) => {
    if (reduced) {
      inset.x = insetGoal.x;
      inset.y = insetGoal.y;
    } else {
      inset.x = spring(inset.x, insetSpeed.x, insetGoal.x, GLIDE * 1.4, dt);
      insetSpeed.x = springSpeed;
      inset.y = spring(inset.y, insetSpeed.y, insetGoal.y, GLIDE * 1.4, dt);
      insetSpeed.y = springSpeed;
    }
    // the hand has it
    if (mode === "drag" || mode === "pinch") return;
    if (reduced) {
      if (anchor.on) {
        const lim = boundsAt(goal.zoom);
        goal.x = clamp(anchoredX(goal.zoom), lim.x0, lim.x1);
        goal.y = clamp(anchoredY(goal.zoom), lim.y0, lim.y1);
        anchor.on = false;
      }
      view.x = goal.x;
      view.y = goal.y;
      view.zoom = goal.zoom;
      return;
    }
    if (follow === "drift") {
      const k = 1 - Math.exp(-dt * pace);
      view.x += (goal.x - view.x) * k;
      view.y += (goal.y - view.y) * k;
      view.zoom += (goal.zoom - view.zoom) * k;
      return;
    }
    view.zoom = spring(view.zoom, velocity.zoom, goal.zoom, pace, dt);
    velocity.zoom = springSpeed;
    if (anchor.on) {
      // the zoom moves the camera, so the anchored point stays put
      let lim = boundsAt(goal.zoom);
      goal.x = clamp(anchoredX(goal.zoom), lim.x0, lim.x1);
      goal.y = clamp(anchoredY(goal.zoom), lim.y0, lim.y1);
      lim = boundsAt(view.zoom);
      view.x = clamp(anchoredX(view.zoom), lim.x0, lim.x1);
      view.y = clamp(anchoredY(view.zoom), lim.y0, lim.y1);
      if (Math.abs(view.zoom - goal.zoom) < 1e-4 && Math.abs(velocity.zoom) < 1e-3) {
        anchor.on = false;
        velocity.x = velocity.y = 0;
      }
      return;
    }
    view.x = spring(view.x, velocity.x, goal.x, pace, dt);
    velocity.x = springSpeed;
    view.y = spring(view.y, velocity.y, goal.y, pace, dt);
    velocity.y = springSpeed;
  };

  // —— the markers, worked out where they are on the island once, and where
  // they are on screen every frame, into the same objects
  const marks = spots.map((spot) => {
    const centre = spot.box.getCenter(new Vector3());
    const top = centre.clone().setY(spot.box.max.y);
    const bottom = centre.clone().setY(spot.box.min.y);
    return {
      x: spot.anchor.dot(right),
      y: spot.anchor.dot(up),
      top: top.dot(up),
      bottom: bottom.dot(up),
    };
  });
  const markers: Marker[] = spots.map((spot) => ({ id: spot.id, x: 0, y: 0, top: 0, bottom: 0, visible: false }));
  const grid: Grid = { unit: 3, x: 0, y: 0, moved: true };
  let shown = false;
  const placeMarkers = () => {
    const visible = uniforms.uReveal.value > 0.95;
    grid.moved = moved || visible !== shown;
    grid.unit = cssPerArt;
    grid.x = offset.x;
    grid.y = offset.y;
    shown = visible;
    if (!grid.moved) return;
    // an island point's art pixel is the canvas's middle plus its distance
    // from the camera; css px are that, scaled, plus the canvas's slide
    const cx = artW / 2 - snapX, cy = artH / 2 + snapY;
    for (let i = 0; i < marks.length; i += 1) {
      const m = marks[i];
      const out = markers[i];
      out.x = (cx + m.x * ppu) * cssPerArt + offset.x;
      out.y = (cy - m.y * ppu) * cssPerArt + offset.y;
      out.top = Math.min(out.y, (cy - m.top * ppu) * cssPerArt + offset.y);
      out.bottom = (cy - m.bottom * ppu) * cssPerArt + offset.y;
      out.visible = visible;
    }
  };

  // —— the loop
  let start = 0;
  let last = 0;
  let frame = 0;
  let running = true;
  // while the game is on, the island holds still and draws nothing
  let paused = false;
  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (paused) {
      last = now;
      return;
    }
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

    moveCamera(dt);
    placeCamera();

    // the hover is picked again when the mouse has moved an art pixel's
    // width, and now and then while the camera moves under a still mouse
    if (pointerIn && mode === "idle") {
      const px = Math.floor((pointerX - box.left) / cssPerArt) + Math.floor((pointerY - box.top) / cssPerArt) * 4096;
      pickWait -= 1;
      if (px !== pickedPixel || (moved && pickWait <= 0)) {
        pickedPixel = px;
        pickWait = 4;
        pickHover = pickAt(pointerX, pointerY);
        applyHover();
      }
    }

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

    placeMarkers();
    events.onFrame(markers, grid);
  };
  frame = requestAnimationFrame(tick);
  if (reduced) uniforms.uReveal.value = 1;

  return {
    select,
    /** What the page points at: a marker hovered or focused, or null. */
    hover: (id: string | null) => {
      pageHover = id;
      applyHover();
    },
    setInset: (x: number, y: number) => {
      insetGoal.x = x;
      insetGoal.y = y;
    },
    setNight: (on: boolean) => {
      nightGoal = on ? 1 : 0;
      if (reduced) {
        night = nightGoal;
        applyLight();
      }
    },
    /** Points the camera at a place without opening it, at its own pace: the trailer's slow moves. */
    look: (id: string | null, zoom = 1.6, speed = 5) => {
      const i = indexOf(id);
      goal.x = i >= 0 ? focusOf[i].x : home.x;
      goal.y = i >= 0 ? focusOf[i].y : home.y;
      goal.zoom = i >= 0 ? zoom : 1;
      velocity.x = velocity.y = velocity.zoom = 0;
      anchor.on = false;
      follow = "drift";
      pace = speed;
    },
    /** Brings a place's marker into view if it's off the edge or under the
     * page's chrome (reached by Tab), moving no further than it has to. */
    reveal: (id: string) => {
      const i = indexOf(id);
      if (i < 0) return;
      const m = markers[i];
      const left = 72, right = box.width - inset.x - 72;
      const top = 120, bottom = box.height - inset.y - 56;
      const dx = m.x < left ? left - m.x : m.x > right ? right - m.x : 0;
      const dy = m.y < top ? top - m.y : m.y > bottom ? bottom - m.y : 0;
      if (!dx && !dy) return;
      anchor.on = false;
      const k = 1 / (cssPerArt * fit * view.zoom);
      goal.x = view.x - dx * k;
      goal.y = view.y + dy * k;
      goal.zoom = view.zoom;
      follow = "spring";
      pace = GLIDE;
    },
    pause: (on: boolean) => {
      paused = on;
      // the game shares the island's uniforms; take them back
      if (!on) applyLight();
    },
    home: () => {
      follow = "spring";
      pace = GLIDE;
      anchor.on = false;
      goal.x = home.x;
      goal.y = home.y;
      goal.zoom = 1;
    },
    zoomBy: (factor: number) => {
      // about the middle of what's in view, which therefore stays put
      anchor.on = false;
      goal.zoom = clamp(goal.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const lim = boundsAt(goal.zoom);
      goal.x = clamp(goal.x, lim.x0, lim.x1);
      goal.y = clamp(goal.y, lim.y0, lim.y1);
      follow = "spring";
      pace = ZOOM;
    },
    panBy: (dx: number, dy: number) => {
      anchor.on = false;
      const k = 1 / (cssPerArt * fit * goal.zoom);
      const lim = boundsAt(goal.zoom);
      goal.x = clamp(goal.x - dx * k, lim.x0, lim.x1);
      goal.y = clamp(goal.y + dy * k, lim.y0, lim.y1);
      follow = "spring";
      pace = PAN;
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
      container.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      for (const m of [maskMaterial, pickBlack, ...pickColours]) m.dispose();
      triangle.dispose();
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
