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
function animate(fps: number, draw: (t: number) => void) {
  let raf = 0;
  let last = 0;
  let t = 0;
  draw(0);
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
  let frames = 0;
  const timings: number[] = [];
  const draw = (t: number) => {
    now = t;
    const target = root.dataset.gaze === "true" ? 0 : revealing && t < 1.1 ? 0 : 1;
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
// How far the peel has travelled, as x / width + y / height of the fold line:
// 0 is the corner, 2.2 is past the far corner. The page-turn keyframes in
// scenery.css move both the clip and the paper roll linearly in this measure.
const PEEL_END = 2.2;
const PEEL_MS = 1100;

type Peel = {
  id: number;
  // the version being peeled away, and the one under it
  from: SceneId;
  to: SceneId;
  x: number;
  y: number;
  at: number;
  speed: number;
  progress: number;
  dragging: boolean;
  transition: ViewTransition | null;
  animations: Animation[];
  released: boolean;
};

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

  function settle() {
    const root = document.documentElement;
    delete root.dataset.turning;
    window.setTimeout(() => delete root.dataset.revealing, 1600);
  }

  // The whole turn on its own, for the keyboard (and browsers that can't peel).
  async function turn() {
    if (busy.current) return;
    busy.current = true;
    const root = document.documentElement;
    try {
      const ready = next === "original" ? Promise.resolve() : loadScene(next);
      if (!document.startViewTransition || reducedMotion()) {
        await ready;
        applyScene(next);
        return;
      }
      const transition = document.startViewTransition(async () => {
        await ready;
        root.dataset.turning = "true";
        root.dataset.revealing = "true";
        flushSync(() => applyScene(next));
      });
      await transition.finished.catch(() => {});
      settle();
    } catch {
      applyScene(next);
    } finally {
      busy.current = false;
    }
  }

  // While a finger holds the corner, the turn's animations are paused and
  // scrubbed so the fold line runs under the pointer.
  function show(state: Peel) {
    const curl = button.current;
    if (state.animations.length) {
      const time = (Math.min(state.progress, PEEL_END) / PEEL_END) * PEEL_MS;
      for (const animation of state.animations) animation.currentTime = time;
    } else if (curl) {
      // until the turn is ready (or where it can't run), the corner itself lifts
      const size = Math.max(0, state.progress) * Math.min(window.innerWidth, window.innerHeight) * 0.5;
      curl.style.setProperty("--curl", `${Math.max(size, 40).toFixed(0)}px`);
    }
  }

  function begin(state: Peel) {
    if (!document.startViewTransition || reducedMotion()) return;
    const root = document.documentElement;
    const ready = state.to === "original" ? Promise.resolve() : loadScene(state.to);
    const transition = document.startViewTransition(async () => {
      await ready;
      root.dataset.turning = "true";
      root.dataset.revealing = "true";
      flushSync(() => applyScene(state.to));
    });
    state.transition = transition;
    transition.ready
      .then(() => {
        state.animations = document
          .getAnimations()
          .filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"));
        for (const animation of state.animations) {
          animation.pause();
          (animation.effect as KeyframeEffect).updateTiming({ easing: "linear" });
        }
        button.current?.style.removeProperty("--curl");
        show(state);
        if (state.released) release(state);
      })
      .catch(() => {});
    transition.finished
      .catch(() => {})
      .finally(() => {
        settle();
        busy.current = false;
        peel.current = null;
      });
  }

  // Let go: past the middle of the corner (or flicked) the page keeps going;
  // otherwise it falls back into place.
  function release(state: Peel) {
    state.released = true;
    const curl = button.current;
    const forward = state.progress > 0.55 || (state.speed > 0.0012 && state.progress > 0.12);
    if (!state.transition) {
      curl?.style.removeProperty("--curl");
      if (forward) applyScene(state.to);
      busy.current = false;
      peel.current = null;
      return;
    }
    // the turn hasn't caught up with the finger yet; this runs again once it has
    if (!state.animations.length) return;
    const from = state.progress;
    const to = forward ? PEEL_END : 0;
    const duration = forward ? 260 + 520 * (1 - from / PEEL_END) : 220 + 160 * Math.min(1, from);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      state.progress = from + (to - from) * eased;
      show(state);
      if (k < 1) {
        requestAnimationFrame(step);
        return;
      }
      if (!forward) {
        // The old page covers everything again: put the DOM back under it
        // before the snapshot lifts away.
        const root = document.documentElement;
        flushSync(() => applyScene(state.from));
        delete root.dataset.revealing;
        delete root.dataset.turning;
      }
      for (const animation of state.animations) animation.finish();
    };
    requestAnimationFrame(step);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (busy.current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    peel.current = {
      id: event.pointerId,
      from: scene,
      to: next,
      x: event.clientX,
      y: event.clientY,
      at: event.timeStamp,
      speed: 0,
      progress: 0,
      dragging: false,
      transition: null,
      animations: [],
      released: false,
    };
    warm();
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId || state.released) return;
    const progress = Math.max(0, event.clientX / window.innerWidth + event.clientY / window.innerHeight);
    if (!state.dragging) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 6) return;
      state.dragging = true;
      busy.current = true;
      begin(state);
    }
    const dt = Math.max(1, event.timeStamp - state.at);
    state.speed = state.speed * 0.6 + ((progress - state.progress) / dt) * 0.4;
    state.at = event.timeStamp;
    state.progress = progress;
    show(state);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.dragging) {
      // a plain click: lift the corner a little and say what to do
      peel.current = null;
      setHint((n) => n + 1);
      return;
    }
    release(state);
  }

  function onPointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    const state = peel.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.dragging) {
      peel.current = null;
      return;
    }
    state.progress = 0;
    state.speed = 0;
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
