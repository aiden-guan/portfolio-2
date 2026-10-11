"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  SCENE_INFO,
  SCENE_STORAGE_KEY,
  isSceneId,
  loadScene,
  loadedScene,
  nextScene,
  type SceneId,
} from "@/lib/scenery/catalog";
import { DotField, coverGrid } from "@/lib/scenery/dot-field";
import type { Cells, SceneProgram } from "@/lib/scenery/types";

const sceneEvent = "aiden-scene-change";
const gazeEvent = "aiden-scene-gaze";

function currentScene(): SceneId {
  const value = document.documentElement.dataset.scene;
  return isSceneId(value) ? value : "original";
}

function subscribe(callback: () => void) {
  window.addEventListener(sceneEvent, callback);
  return () => window.removeEventListener(sceneEvent, callback);
}

export function useScene() {
  return useSyncExternalStore(subscribe, currentScene, () => "original" as SceneId);
}

function applyScene(id: SceneId) {
  const root = document.documentElement;
  if (id === "original") delete root.dataset.scene;
  else root.dataset.scene = id;
  try {
    if (id === "original") localStorage.removeItem(SCENE_STORAGE_KEY);
    else localStorage.setItem(SCENE_STORAGE_KEY, id);
  } catch {}
  window.dispatchEvent(new Event(sceneEvent));
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Runs `draw` at the scene's frame rate while the page is visible; under
// reduced motion it draws once and holds.
// One clock for every scene on the page, so a backdrop that is mounted again
// (a peel let go and falling back) carries on where it was rather than restarting.
const clockStart = typeof performance === "undefined" ? 0 : performance.now();

function animate(fps: number, draw: (t: number) => void) {
  let raf = 0;
  let last = 0;
  let t = (performance.now() - clockStart) / 1000;
  draw(t);
  if (reducedMotion()) return () => {};
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < 1000 / fps - 2) return;
    last = now;
    t += Math.min(dt, 100) / 1000;
    draw(t);
  };
  const run = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  run();
  document.addEventListener("visibilitychange", run);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", run);
  };
}

// Grows when a machine can't keep up with the finest grid (see mountBackdrop).
let coarsen = 1;

function cellSize(width: number, height: number) {
  // About 72k cells at most: fine on a monitor, never smaller than ~4px.
  return Math.min(7 * coarsen, Math.max(3.8, Math.sqrt((width * height) / 72000)) * coarsen);
}

// Frames slower than this (render and bloom, in ms) mean the grid is too fine here.
const FRAME_BUDGET = 20;

// The scene is drawn this far past every edge so it can drift with the pointer.
const PAD = 28;

// How much of the scene shows through behind the page: dim under the reading
// column and around the name column's text, full in the margins and in the
// open space of the name column.
function veilFor(cols: number, rows: number, cell: number, levels: SceneProgram["veil"]) {
  const veil = new Float32Array(cols * rows).fill(1);
  const content = document.querySelector(".content");
  if (!content || window.innerWidth <= 880) return veil.fill(Math.min(levels.content + 0.06, 1));
  const boxes: [DOMRect, number, number, boolean][] = [
    [content.getBoundingClientRect(), levels.content, cell * 3, true],
  ];
  for (const node of document.querySelectorAll(".identity header, .index-nav, .identity-footer")) {
    boxes.push([node.getBoundingClientRect(), levels.identity, cell * 7, false]);
  }
  for (let y = 0, k = 0; y < rows; y++) {
    const py = (y + 0.5) * cell - PAD;
    for (let x = 0; x < cols; x++, k++) {
      const px = (x + 0.5) * cell - PAD;
      let v = 1;
      for (const [box, level, edge, fullHeight] of boxes) {
        const dx = Math.min(px - box.left, box.right - px);
        const dy = fullHeight ? edge : Math.min(py - box.top, box.bottom - py);
        const inside = (Math.min(dx, dy) + edge / 2) / edge;
        if (inside <= 0) continue;
        const s = inside >= 1 ? 1 : inside * inside * (3 - 2 * inside);
        v = Math.min(v, 1 + (level - 1) * s);
      }
      veil[k] = v;
    }
  }
  return veil;
}

function gridFor(program: SceneProgram, cols: number, rows: number, width: number) {
  const identity = document.querySelector(".identity")?.getBoundingClientRect();
  const anchor =
    program.anchor && identity && width > 880
      ? { ...program.anchor, atX: (identity.left + identity.width * 0.45 + PAD) / width }
      : undefined;
  return coverGrid(cols, rows, program.focusX, program.focusY, program.width, program.height, anchor);
}

function mountBackdrop(
  program: SceneProgram,
  canvas: HTMLCanvasElement,
  glow: HTMLCanvasElement,
  sky: HTMLCanvasElement,
  onSlow: () => void,
) {
  const root = document.documentElement;
  const width = window.innerWidth;
  // The tallest the viewport gets, so a phone's toolbar sliding away needs no rebuild.
  const height = Math.max(window.innerHeight, root.clientHeight);
  const cell = cellSize(width + PAD * 2, height * 1.12 + PAD * 2);
  const cols = Math.ceil((width + PAD * 2) / cell);
  const rows = Math.ceil((height * 1.12 + PAD * 2) / cell);
  const field = new DotField(canvas, {
    ground: getComputedStyle(canvas).backgroundColor || "#000",
    light: program.light,
  });
  field.resize(cols, rows, cell);
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  const frame = program.build(gridFor(program, cols, rows, width + PAD * 2));

  // A soft, low-resolution copy of the scene screened over it: light blooms like light.
  const gctx = program.light ? null : glow.getContext("2d");
  glow.style.width = canvas.style.width;
  glow.style.height = canvas.style.height;
  const veil = veilFor(cols, rows, cell, program.veil);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  sky.width = Math.round(width * dpr);
  sky.height = Math.round(height * dpr);
  sky.style.width = `${width}px`;
  sky.style.height = `${height}px`;
  const ctx = sky.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const still = reducedMotion();
  const weather = !still && program.weather ? program.weather(width, height) : null;
  ctx.clearRect(0, 0, width, height);

  // After a page turn the bare scene shows first, then the page settles over it.
  const revealing = root.dataset.revealing === "true" && !still;
  let amount = revealing ? 0 : 1;
  let now = 0;
  let born = -1;
  let frames = 0;
  const timings: number[] = [];
  const draw = (t: number) => {
    now = t;
    if (born < 0) born = t;
    const target = root.dataset.gaze === "true" ? 0 : revealing && t - born < 1.1 ? 0 : 1;
    amount = still ? target : amount + (target - amount) * 0.09;
    const begin = performance.now();
    field.render(frame, t, veil, amount);
    if (gctx) field.bloom(gctx, 4);
    // Watch a few seconds of frames once the scene has settled; if most of them
    // run over budget, give back resolution rather than frames.
    if (!still && timings.length < 40 && ++frames > 15) {
      timings.push(performance.now() - begin);
      if (timings.length === 40 && timings.sort((a, b) => a - b)[20]! > FRAME_BUDGET) onSlow();
    }
    weather?.(t, ctx, width, height);
  };
  const redraw = () => still && draw(now);
  window.addEventListener(gazeEvent, redraw);
  const stop = animate(program.fps, draw);
  return () => {
    stop();
    window.removeEventListener(gazeEvent, redraw);
  };
}

export function SceneryBackdrop() {
  const scene = useScene();
  const canvas = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);

  // The scene drifts a little against the pointer, like looking through a window.
  useEffect(() => {
    const node = stage.current;
    if (scene === "original" || !node) return;
    if (reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dx = (event.clientX / window.innerWidth - 0.5) * -2 * (PAD - 6);
        const dy = (event.clientY / window.innerHeight - 0.5) * -2 * (PAD - 10);
        node.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [scene]);

  useEffect(() => {
    let width = window.innerWidth;
    let height = window.innerHeight;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (window.innerWidth === width && window.innerHeight <= height + 120) return;
        width = window.innerWidth;
        height = window.innerHeight;
        setSize((n) => n + 1);
      }, 180);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // A layout effect, so a scene whose code is already loaded paints its first
  // frame before the browser captures the page turn's new state.
  useLayoutEffect(() => {
    if (scene === "original" || !canvas.current || !glow.current || !sky.current) return;
    const target = canvas.current;
    const bloom = glow.current;
    const overlay = sky.current;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const onSlow = () => {
      if (coarsen >= 1.5) return;
      coarsen *= 1.22;
      setSize((n) => n + 1);
    };
    const program = loadedScene(scene);
    if (program) stop = mountBackdrop(program, target, bloom, overlay, onSlow);
    else
      loadScene(scene).then((loaded) => {
        if (!cancelled) stop = mountBackdrop(loaded, target, bloom, overlay, onSlow);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [scene, size]);

  if (scene === "original") return null;
  return (
    <>
      <div className="scenery" aria-hidden="true">
        <div className="scenery-stage" ref={stage}>
          <canvas ref={canvas} className="scenery-canvas" />
          <canvas ref={glow} className="scenery-glow" />
        </div>
      </div>
      <canvas ref={sky} className="scenery-weather" aria-hidden="true" />
    </>
  );
}

// The name drawn in the scene's dots. The real heading text stays in the page.
export function AsciiTitle({ text }: { text: string }) {
  const scene = useScene();
  const canvas = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const node = canvas.current;
    if (scene === "original" || !node || !text) return;
    const program = loadedScene(scene);
    let stop: (() => void) | null = null;
    let cancelled = false;
    const start = (shader: SceneProgram["title"]) => {
      const box = node.parentElement!;
      let width = box.clientWidth;
      let halt = drawTitle(node, text, width, shader);
      const observer = new ResizeObserver(() => {
        if (box.clientWidth === width) return;
        width = box.clientWidth;
        halt();
        halt = drawTitle(node, text, width, shader);
      });
      observer.observe(box);
      stop = () => {
        observer.disconnect();
        halt();
      };
    };
    if (program) start(program.title);
    else
      loadScene(scene).then((loaded) => {
        if (!cancelled) start(loaded.title);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [scene, text]);

  if (scene === "original") return null;
  return <canvas ref={canvas} className="ascii-title" aria-hidden="true" />;
}

function drawTitle(canvas: HTMLCanvasElement, text: string, width: number, shader: SceneProgram["title"]) {
  const cell = width < 420 ? 2.8 : 3.1;
  const cols = Math.max(8, Math.floor(width / cell));
  // Measure at a reference size, then fit the name to the column.
  const probe = document.createElement("canvas").getContext("2d")!;
  const family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  probe.font = `800 100px ${family}`;
  const measured = probe.measureText(text).width || 1;
  const fontPx = Math.min((cols * cell * 0.98 * 100) / measured, 92);
  const rows = Math.ceil((fontPx * 0.9) / cell) + 2;

  const scale = 4;
  const mask = document.createElement("canvas");
  mask.width = cols * scale;
  mask.height = rows * scale;
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  mctx.fillStyle = "#fff";
  mctx.textBaseline = "alphabetic";
  mctx.font = `800 ${(fontPx / cell) * scale}px ${family}`;
  mctx.fillText(text, 0, (rows - 1.3) * scale);
  const data = mctx.getImageData(0, 0, mask.width, mask.height).data;
  const cover = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) sum += data[((y * scale + j) * mask.width + x * scale + i) * 4 + 3]!;
      }
      cover[y * cols + x] = sum / (scale * scale * 255);
    }
  }

  const field = new DotField(canvas, { ground: null });
  field.resize(cols, rows, cell);
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  const out: [number, number, number] = [0, 0, 0];
  const frame = (t: number, cells: Cells) => {
    for (let y = 0, k = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, k++) {
        const c = cover[k]!;
        if (c < 0.12) {
          cells.r[k] = 0;
          cells.g[k] = 0;
          cells.b[k] = 0;
          continue;
        }
        shader(x / cols, y / rows, t, out);
        const s = 0.35 + 0.75 * c;
        cells.r[k] = out[0] * s;
        cells.g[k] = out[1] * s;
        cells.b[k] = out[2] * s;
        cells.floor[k] = 0.45 * c;
      }
    }
  };
  return animate(20, (t) => field.render(frame, t));
}

// The scene's caption doubles as a switch that clears the page away so the
// scene can be seen on its own.
export function SceneCaption() {
  const scene = useScene();
  const [gazing, setGazing] = useState(false);

  useEffect(() => {
    if (!gazing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGazing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gazing]);

  useEffect(() => {
    const root = document.documentElement;
    if (gazing && scene !== "original") root.dataset.gaze = "true";
    else delete root.dataset.gaze;
    window.dispatchEvent(new Event(gazeEvent));
  }, [gazing, scene]);

  if (scene === "original") return null;
  return (
    <button
      type="button"
      className="scene-caption"
      aria-pressed={gazing}
      title={gazing ? "Bring the page back" : "Clear the page to see the scene"}
      onClick={() => setGazing((value) => !value)}
    >
      <span aria-hidden="true">{gazing ? "◑" : "◐"}</span>
      {SCENE_INFO[scene].caption}
    </button>
  );
}

// The page's top-left corner, curled up. Turning it peels the page away to
// the next version underneath.
// The page turn is a flat fold of the page's top-left corner. `C` is where the
// corner has been folded to: the fold line is the perpendicular bisector of the
// page corner and C, the old page is cut along it, and the flap is the cut-off
// piece mirrored over the fold. The resting curl is the same fold with C a
// short way along the diagonal, so a drag picks up exactly where the corner is.
type Point = { x: number; y: number };

function peelGeometry(c: Point, width: number, height: number) {
  const k = (c.x * c.x + c.y * c.y) / 2;
  const side = (p: Point) => p.x * c.x + p.y * c.y - k;
  const box: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  // Cut the viewport along the fold: `kept` stays on the page, `lifted` folds over.
  const kept: Point[] = [];
  const lifted: Point[] = [];
  for (let i = 0; i < box.length; i++) {
    const p = box[i]!;
    const q = box[(i + 1) % box.length]!;
    const sp = side(p);
    const sq = side(q);
    (sp >= 0 ? kept : lifted).push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      const cut = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      kept.push(cut);
      lifted.push(cut);
    }
  }
  const len2 = c.x * c.x + c.y * c.y || 1;
  const flap = lifted.map((p) => {
    const s = (2 * side(p)) / len2;
    return { x: p.x - s * c.x, y: p.y - s * c.y };
  });
  // Paper shading runs across the flap, from the crease out to the tip.
  const len = Math.sqrt(len2);
  const dx = c.x / len;
  const dy = c.y / len;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const span = Math.abs(width * dx) + Math.abs(height * dy);
  const crease = k / len - (width / 2) * dx - (height / 2) * dy + span / 2;
  const depth = Math.max(len / 2, 1);
  const poly = (points: Point[]) =>
    points.length ? `polygon(${points.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})` : "polygon(0 0, 0 0, 0 0)";
  const at = (f: number) => `${(crease + depth * f).toFixed(1)}px`;
  return {
    page: poly(kept),
    flap: poly(flap),
    paper: `linear-gradient(${angle.toFixed(2)}deg, var(--fold-crease) ${at(0)}, var(--fold-shade) ${at(0.06)}, var(--fold-mid) ${at(0.4)}, var(--fold-back) ${at(1)})`,
  };
}

type Peel = {
  id: number;
  // the version being peeled away, and the one under it
  from: SceneId;
  to: SceneId;
  // pointer at the start, and where the corner sat then
  x: number;
  y: number;
  rest: number;
  // The point of the page that was grabbed, unfolded back to where it lies on
  // the flat page; null when the grab was on the bare corner, not the flap.
  held: Point | null;
  corner: Point;
  at: number;
  speed: number;
  dragging: boolean;
  transition: ViewTransition | null;
  ready: boolean;
  released: boolean;
};

// Where the corner folds to with the pointer at (fx, fy). Paper held on the flap
// stays under the pointer: the crease is the perpendicular bisector of the held
// point and the pointer, and the corner lands at its mirror image across it. A
// grab on the bare corner just carries the folded corner along with the pointer.
function foldTo(state: Peel, fx: number, fy: number): Point {
  const held = state.held;
  let corner = { x: state.rest + fx - state.x, y: state.rest + fy - state.y };
  if (held) {
    const nx = fx - held.x;
    const ny = fy - held.y;
    const n2 = nx * nx + ny * ny;
    if (n2 > 1) {
      const d = (fx * fx + fy * fy - held.x * held.x - held.y * held.y) / 2;
      corner = { x: (2 * nx * d) / n2, y: (2 * ny * d) / n2 };
    }
  }
  // never folded back past the page edge
  return { x: Math.max(4, corner.x), y: Math.max(4, corner.y) };
}

export function PageCurl() {
  const scene = useScene();
  const next = nextScene(scene);
  const busy = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const peel = useRef<Peel | null>(null);
  const [hint, setHint] = useState(0);

  function warm() {
    if (next !== "original") loadScene(next).catch(() => {});
  }

  useEffect(() => {
    // Fetch the next page while the browser is idle so the turn is instant.
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => {
      if (next !== "original") loadScene(next).catch(() => {});
    });
    return () => cancel(id);
  }, [next]);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(0), 1800);
    return () => window.clearTimeout(id);
  }, [hint]);

  function canPeel() {
    return Boolean(document.startViewTransition) && !reducedMotion();
  }

  function restSize() {
    return button.current?.getBoundingClientRect().width ?? 56;
  }

  // The corner's size when nothing hovers it (--curl in scenery.css).
  function baseSize() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return (window.innerWidth <= 880 ? 3 : 3.6) * rem;
  }

  function show(corner: Point) {
    const root = document.documentElement;
    const shape = peelGeometry(corner, window.innerWidth, window.innerHeight);
    root.style.setProperty("--peel-page", shape.page);
    root.style.setProperty("--peel-flap", shape.flap);
    root.style.setProperty("--peel-paper", shape.paper);
  }

  function cleanUp() {
    const root = document.documentElement;
    delete root.dataset.peeling;
    delete root.dataset.turning;
    for (const name of ["--peel-page", "--peel-flap", "--peel-paper"]) root.style.removeProperty(name);
    button.current?.style.removeProperty("--curl");
    window.setTimeout(() => delete root.dataset.revealing, 1600);
  }

  // Captures the page as it is and swaps in the next version under it. Until
  // the peel ends, the old page is only an image cut along the fold.
  function begin(state: Peel) {
    const root = document.documentElement;
    const ready = state.to === "original" ? Promise.resolve() : loadScene(state.to);
    show(state.corner);
    root.dataset.peeling = "true";
    const transition = document.startViewTransition(async () => {
      await ready;
      root.dataset.turning = "true";
      root.dataset.revealing = "true";
      flushSync(() => applyScene(state.to));
    });
    state.transition = transition;
    transition.ready
      .then(() => {
        state.ready = true;
        if (state.released) release(state);
      })
      .catch(() => {});
    transition.finished
      .catch(() => {})
      .finally(() => {
        cleanUp();
        busy.current = false;
        if (peel.current === state) peel.current = null;
      });
  }

  // Runs the corner to `target` and then ends the turn there: over the far
  // corner the new page stays, back at rest the old one does.
  function glide(state: Peel, target: Point, forward: boolean, duration: number) {
    const from = { ...state.corner };
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = forward ? 1 - Math.pow(1 - k, 3) : 1 - Math.pow(1 - k, 4);
      state.corner = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
      show(state.corner);
      if (k < 1) {
        requestAnimationFrame(step);
        return;
      }
      if (!forward) {
        // The old page covers everything again: put the DOM back under it,
        // as it was (no reveal), before the snapshot lifts away.
        const root = document.documentElement;
        delete root.dataset.revealing;
        flushSync(() => applyScene(state.from));
      }
      state.transition?.skipTransition();
    };
    requestAnimationFrame(step);
  }

  function farCorner() {
    // Past twice the far corner, the fold has cleared the whole viewport.
    return { x: window.innerWidth * 2.05, y: window.innerHeight * 2.05 };
  }

  // Let go: well into the page (or flicked) it keeps going; otherwise it
  // falls back into the corner.
  function release(state: Peel) {
    state.released = true;
    const reach = state.corner.x / window.innerWidth + state.corner.y / window.innerHeight;
    const forward = reach > 0.75 || (state.speed > 0.0015 && reach > 0.2);
    if (!state.transition) {
      button.current?.style.removeProperty("--curl");
      if (forward) applyScene(state.to);
      busy.current = false;
      peel.current = null;
      return;
    }
    // the turn hasn't caught up with the pointer yet; this runs again once it has
    if (!state.ready) return;
    if (forward) glide(state, farCorner(), true, 300 + 420 * Math.max(0, 1 - reach / 2));
    else {
      const rest = baseSize();
      glide(state, { x: rest, y: rest }, false, 260 + 120 * Math.min(1, reach));
    }
  }

  // The whole turn on its own, for the keyboard.
  async function turn() {
    if (busy.current) return;
    if (!canPeel()) {
      if (next !== "original") await loadScene(next).catch(() => {});
      applyScene(next);
      return;
    }
    busy.current = true;
    const rest = restSize();
    const state: Peel = {
      id: -1,
      from: scene,
      to: next,
      x: 0,
      y: 0,
      rest,
      held: null,
      corner: { x: rest, y: rest },
      at: 0,
      speed: 0,
      dragging: true,
      transition: null,
      ready: false,
      // nothing to let go of: the glide below carries it through
      released: false,
    };
    peel.current = state;
    begin(state);
    await state.transition!.ready.catch(() => {});
    glide(state, farCorner(), true, 1050);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (busy.current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rest = restSize();
    // A grab on the folded flap holds that bit of paper; unfold it across the
    // resting crease (x + y = rest) to find which point of the page it is.
    const fold = event.clientX + event.clientY - rest;
    const held = fold >= 0 ? { x: event.clientX - fold, y: event.clientY - fold } : null;
    peel.current = {
      id: event.pointerId,
      from: scene,
      to: next,
      x: event.clientX,
      y: event.clientY,
      rest,
      held,
      corner: { x: rest, y: rest },
      at: event.timeStamp,
      speed: 0,
      dragging: false,
      transition: null,
      ready: false,
      released: false,
    };
    warm();
    // Start the turn on press, not on the first move: capturing the page and
    // mounting the next scene takes a moment, and it is better spent while the
    // finger is still settling than once it has started to pull.
    if (canPeel()) {
      busy.current = true;
      begin(peel.current);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId || state.released) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < 4) return;
      state.dragging = true;
      busy.current = true;
    }
    const corner = foldTo(state, event.clientX, event.clientY);
    const reach = corner.x / window.innerWidth + corner.y / window.innerHeight;
    const before = state.corner.x / window.innerWidth + state.corner.y / window.innerHeight;
    const dt = Math.max(1, event.timeStamp - state.at);
    state.speed = state.speed * 0.6 + ((reach - before) / dt) * 0.4;
    state.at = event.timeStamp;
    state.corner = corner;
    if (state.transition) show(corner);
    else button.current?.style.setProperty("--curl", `${Math.max(corner.x, corner.y).toFixed(0)}px`);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.dragging) {
      // a plain click: tug the corner and say what to do
      setHint((n) => n + 1);
      if (!state.transition) {
        peel.current = null;
        return;
      }
      state.speed = 0;
    }
    release(state);
  }

  function onPointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.dragging && !state.transition) {
      peel.current = null;
      return;
    }
    state.speed = 0;
    state.corner = { x: state.rest, y: state.rest };
    release(state);
  }

  const label = `Peel the page to the ${SCENE_INFO[next].name} version`;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="page-curl"
        data-next={next}
        data-hint={hint ? "true" : undefined}
        aria-label={label}
        title={label}
        onPointerEnter={warm}
        onFocus={warm}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(event) => {
          // Pointer turns happen by dragging; Enter and Space still turn the page.
          if (event.detail === 0) turn();
        }}
      >
        <span className="page-curl-peek" aria-hidden="true" />
        <span className="page-curl-flap" aria-hidden="true" />
        <span className="page-curl-label" aria-hidden="true">
          {hint ? "Drag to peel" : SCENE_INFO[next].name}
          <span>{hint ? "↘" : "→"}</span>
        </span>
      </button>
      <div className="page-fold" aria-hidden="true" />
    </>
  );
}
