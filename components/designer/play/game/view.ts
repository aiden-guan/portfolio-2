import {
  BufferGeometry,
  Color,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Plane,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { POST_FRAGMENT, POST_VERTEX } from "../../scene/post";
import { glowMaterial, shaftMaterial, uniforms, worldMaterial } from "../../scene/shared";
import { Voxels } from "../../scene/voxels";

// How the game is drawn: the island's own way. A low art resolution scaled up
// by whole device pixels, the island's post pass for the dither, the levels
// and the rims, and the camera snapped to the pixel grid so nothing swims.

export const VIEW = new Vector3(Math.SQRT1_2 * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), Math.SQRT1_2 * Math.cos(Math.PI / 6)).normalize();

export type Look = {
  scene: Scene;
  /** World point the camera looks at. */
  target: Vector3;
  /** World units across the narrower fit of the screen. */
  span: number;
  background: { top: Color; bottom: Color };
};

export function createView(container: HTMLElement, canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;

  const color = new WebGLRenderTarget(2, 2, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
  color.depthTexture = new DepthTexture(2, 2);
  // the island outlines what's pointed at through a mask; the game never does
  const mask = new WebGLRenderTarget(2, 2, { minFilter: NearestFilter, magFilter: NearestFilter });
  mask.depthTexture = new DepthTexture(2, 2);

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
      uBgTop: { value: new Color() },
      uBgBottom: { value: new Color() },
      uRing: { value: new Color(0xfff6e2) },
      // the game turns on the post pass's contact shadow; the island leaves it off
      uAo: { value: 0.9 },
      uUnit: { value: 0.05 },
      uDepthSpan: { value: 0 },
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

  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 400);
  post.uniforms.uDepthSpan.value = camera.far - camera.near;
  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  camera.position.copy(VIEW).multiplyScalar(140);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  forward.copy(VIEW).negate();

  let artW = 2, artH = 2, cssPerArt = 3;
  // TEMP(g1-render): css px per art px, while trying a finer picture
  let artDivisor = 3;
  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const target = Math.min(560 * (3 / artDivisor), Math.max(300, w / artDivisor));
    const devPerArt = Math.max(1, Math.round((w * dpr) / target));
    cssPerArt = devPerArt / dpr;
    artW = Math.ceil(w / cssPerArt) + 2;
    artH = Math.ceil(h / cssPerArt) + 2;
    renderer.setSize(artW, artH, false);
    canvas.style.width = `${artW * cssPerArt}px`;
    canvas.style.height = `${artH * cssPerArt}px`;
    color.setSize(artW, artH);
    post.uniforms.uRes.value.set(artW, artH);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const offset = { x: 0, y: 0 };
  const snapped = new Vector3();
  let ppu = 20;
  const place = (target: Vector3, span: number) => {
    // the span fits across, or down on a tall screen
    ppu = Math.min((artW - 2) / span, ((artH - 2) / span) * 1.45);
    const halfW = artW / 2 / ppu, halfH = artH / 2 / ppu;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    post.uniforms.uUnit.value = 1 / ppu;
    const sx = target.dot(right) * ppu, sy = target.dot(up) * ppu, sz = target.dot(forward);
    const rx = Math.round(sx), ry = Math.round(sy);
    snapped.set(0, 0, 0).addScaledVector(right, rx / ppu).addScaledVector(up, ry / ppu).addScaledVector(forward, sz);
    camera.position.copy(snapped).addScaledVector(VIEW, 140);
    camera.updateMatrixWorld();
    post.uniforms.uSnap.value.set(rx, ry);
    offset.x = -(1 + (sx - rx)) * cssPerArt;
    offset.y = -(1 - (sy - ry)) * cssPerArt;
    canvas.style.transform = `translate3d(${offset.x.toFixed(3)}px, ${offset.y.toFixed(3)}px, 0)`;
  };

  // TEMP(g1-render): a handle for comparing passes while working on them
  if (process.env.NODE_ENV !== "production") (window as unknown as { __view?: unknown }).__view = {
      post,
      renderer,
      uniforms,
      shaftMaterial,
      glowMaterial,
      worldMaterial,
      Voxels,
      Mesh,
      art: (divisor: number) => {
        artDivisor = divisor;
        resize();
      },
    };

  // —— shaders, built before a scene's first frame
  // The first time a scene is drawn every material in it is built for that
  // scene's lights, which can hold the page for most of a second. So the first
  // time render() meets a scene, it starts the build where the browser can run
  // it off the main thread (KHR_parallel_shader_compile), against the target
  // the scene draws into so they're the very programs the draw will ask for,
  // and the canvas keeps its last frame until they're ready. If they never
  // report back, it draws anyway after a while.
  const HOLD_MS = 1500;
  const built = new WeakSet<Scene>();
  const building = new WeakMap<Scene, number>();
  let postBuilt = false;
  const build = (scene: Scene) => {
    building.set(scene, performance.now());
    renderer.setRenderTarget(color);
    const work: Array<Promise<unknown>> = [renderer.compileAsync(scene, camera)];
    renderer.setRenderTarget(null);
    if (!postBuilt) work.push(renderer.compileAsync(postScene, postCamera));
    const done = () => {
      built.add(scene);
      postBuilt = true;
    };
    Promise.all(work).then(done, done);
  };

  /** Draws a frame; false while the scene's shaders are still being built
   * (the canvas holds its last frame meanwhile). */
  const render = (look: Look, levels = 15) => {
    place(look.target, look.span);
    if (!built.has(look.scene)) {
      const since = building.get(look.scene);
      if (since === undefined) build(look.scene);
      if (since === undefined || performance.now() - since < HOLD_MS) return false;
      built.add(look.scene);
    }
    post.uniforms.uBgTop.value.copy(look.background.top);
    post.uniforms.uBgBottom.value.copy(look.background.bottom);
    post.uniforms.uLevels.value = levels;
    renderer.setRenderTarget(color);
    renderer.setClearColor(0x000000, 0);
    renderer.render(look.scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    return true;
  };

  const projected = new Vector3();
  /** Css px within the container. */
  const project = (point: Vector3) => {
    projected.copy(point).project(camera);
    return {
      x: ((projected.x + 1) / 2) * artW * cssPerArt + offset.x,
      y: ((1 - projected.y) / 2) * artH * cssPerArt + offset.y,
    };
  };

  const raycaster = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const ndc = new Vector2();
  /** Where a point on the screen lands on the floor. */
  const ground = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new Vector3();
    return raycaster.ray.intersectPlane(floor, hit) ? hit : null;
  };

  return {
    render,
    project,
    ground,
    /** Screen-space directions on the floor: what "up" and "right" mean when walking. */
    axes: () => ({
      right: new Vector3(right.x, 0, right.z).normalize(),
      up: new Vector3(-VIEW.x, 0, -VIEW.z).normalize(),
    }),
    renderer,
    dispose: () => {
      observer.disconnect();
      color.dispose();
      mask.dispose();
      post.dispose();
      triangle.dispose();
      renderer.dispose();
    },
  };
}

export type View = ReturnType<typeof createView>;
