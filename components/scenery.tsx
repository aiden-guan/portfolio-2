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

function cellSize(width: number, height: number) {
  // About 26k cells at most: dense on a monitor, lighter on a phone.
  return Math.min(9, Math.max(5, Math.sqrt((width * height) / 26000)));
}

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
    const py = (y + 0.5) * cell;
    for (let x = 0; x < cols; x++, k++) {
      const px = (x + 0.5) * cell;
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
      ? { ...program.anchor, atX: (identity.left + identity.width * 0.45) / width }
      : undefined;
  return coverGrid(cols, rows, program.focusX, program.focusY, program.width, program.height, anchor);
}

function mountBackdrop(program: SceneProgram, canvas: HTMLCanvasElement, sky: HTMLCanvasElement) {
  const root = document.documentElement;
  const width = window.innerWidth;
  // The tallest the viewport gets, so a phone's toolbar sliding away needs no rebuild.
  const height = Math.max(window.innerHeight, root.clientHeight);
  const cell = cellSize(width, height);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil((height * 1.12) / cell);
  const field = new DotField(canvas, {
    ground: getComputedStyle(canvas).backgroundColor || "#000",
    light: program.light,
  });
  field.resize(cols, rows, cell);
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  const frame = program.build(gridFor(program, cols, rows, width));
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
  const draw = (t: number) => {
    now = t;
    const target = root.dataset.gaze === "true" ? 0 : revealing && t < 1.1 ? 0 : 1;
    amount = still ? target : amount + (target - amount) * 0.09;
    field.render(frame, t, veil, amount);
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
  const sky = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);

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
    if (scene === "original" || !canvas.current || !sky.current) return;
    const target = canvas.current;
    const overlay = sky.current;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const program = loadedScene(scene);
    if (program) stop = mountBackdrop(program, target, overlay);
    else
      loadScene(scene).then((loaded) => {
        if (!cancelled) stop = mountBackdrop(loaded, target, overlay);
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
        <canvas ref={canvas} className="scenery-canvas" />
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
  const cell = width < 420 ? 3.4 : 4;
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
export function PageCurl() {
  const scene = useScene();
  const next = nextScene(scene);
  const busy = useRef(false);

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
      delete root.dataset.turning;
      window.setTimeout(() => delete root.dataset.revealing, 1600);
    } catch {
      applyScene(next);
    } finally {
      busy.current = false;
    }
  }

  const label = `Turn the page to the ${SCENE_INFO[next].name} version`;
  return (
    <>
      <button
        type="button"
        className="page-curl"
        data-next={next}
        aria-label={label}
        title={label}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={turn}
      >
        <span className="page-curl-peek" aria-hidden="true" />
        <span className="page-curl-flap" aria-hidden="true" />
        <span className="page-curl-label" aria-hidden="true">
          {SCENE_INFO[next].name}
          <span>→</span>
        </span>
      </button>
      <div className="page-fold" aria-hidden="true" />
    </>
  );
}
