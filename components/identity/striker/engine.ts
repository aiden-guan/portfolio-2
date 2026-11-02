import { Ink } from "./ink";
import { lerp } from "./moves";
import { createScene } from "./scene";

/** about one css pixel to a pixel of the picture, in whole device pixels */
const CSS_PER_PIXEL = 1;
/** the left and right edges dither away over this many pixels */
const EDGE = 28;
/** past this many pixels, the whole-screen picture's pixels grow instead */
const WIDE_PIXELS = 340_000;

type Surface = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; ink: Ink; image: ImageData; pixels: Uint32Array; per: number };

// Runs the strip on a canvas that fills `holder`: sizes the picture to it and
// waits. Asked to play, it draws a frame per animation frame while the tab is
// visible, once through, then clears and tells whoever asked. Once he is past
// the first defender the play opens out of the strip to fill the screen, on
// `wide`, a canvas over the whole page shown through a window that grows from
// where the strip is to every edge; it stays wide to the end. With reduced
// motion it shows one still for a while instead, the top of the backswing
// with the flow coming off him.
export function startStriker(canvas: HTMLCanvasElement, wide: HTMLCanvasElement, holder: HTMLElement, reduced: boolean) {
  const scene = createScene();
  const make = (target: HTMLCanvasElement): Surface | null => {
    const context = target.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(2, 2);
    return { canvas: target, context, ink: new Ink(2, 2), image, pixels: new Uint32Array(image.data.buffer), per: 1 };
  };
  const strip = make(canvas);
  const screen = make(wide);
  if (!strip || !screen) return { play: () => {}, dispose: () => {} };
  let frame = 0;
  let clock = 0;
  let last = 0;
  let opened = false;
  let playing = false;
  let done: (() => void) | null = null;
  let resting = 0;
  const still = scene.still;

  // whole device pixels to a picture pixel: as few as keep it under `most`
  const fit = (s: Surface, cssW: number, cssH: number, most: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let device = Math.max(1, Math.round(dpr * CSS_PER_PIXEL));
    while (((cssW * dpr) / device) * ((cssH * dpr) / device) > most) device += 1;
    const per = device / dpr;
    const w = Math.max(2, Math.floor(cssW / per));
    const h = Math.max(2, Math.floor(cssH / per));
    if (w === s.ink.w && h === s.ink.h && per === s.per) return;
    s.canvas.width = w;
    s.canvas.height = h;
    s.canvas.style.width = `${w * per}px`;
    s.canvas.style.height = `${h * per}px`;
    s.ink = new Ink(w, h);
    s.image = s.context.createImageData(w, h);
    s.pixels = new Uint32Array(s.image.data.buffer);
    s.per = per;
  };

  const draw = (t: number) => {
    const open = reduced ? 0 : scene.openAt(t);
    if (open <= 0) {
      if (opened) {
        wide.style.display = "none";
        canvas.style.visibility = "";
        delete holder.dataset.stage;
        opened = false;
      }
      const { mode, shown, split } = scene.frame(strip.ink, t);
      strip.ink.blit(strip.pixels, mode, EDGE, reduced ? 1 : shown, split);
      strip.context.putImageData(strip.image, 0, 0);
      return;
    }
    // the window the play is seen through: where the strip is on the
    // screen, opening out to all of it
    const box = canvas.getBoundingClientRect();
    const { ink, per } = screen;
    const win = {
      x: lerp(box.left / per, 0, open),
      y: lerp(box.top / per, 0, open),
      w: lerp(box.width / per, ink.w, open),
      h: lerp(box.height / per, ink.h, open),
    };
    const { mode, shown, split } = scene.frame(ink, t, win, open);
    ink.blit(screen.pixels, mode, (EDGE / per) * (1 - open), shown, split, win);
    screen.context.putImageData(screen.image, 0, 0);
    const right = ink.w - win.x - win.w;
    const bottom = ink.h - win.y - win.h;
    wide.style.clipPath = open < 1 ? `inset(${win.y * per}px ${right * per}px ${bottom * per}px ${win.x * per}px)` : "";
    if (!opened) {
      wide.style.display = "block";
      canvas.style.visibility = "hidden";
      opened = true;
    }
    // the page knows when the play has the stage, and steps the sentence back
    const staged = scene.stageAt(t) > 0.5;
    if (staged !== (holder.dataset.stage !== undefined)) {
      if (staged) holder.dataset.stage = "";
      else delete holder.dataset.stage;
    }
  };

  let cutting = 0;
  const resize = () => {
    fit(strip, holder.clientWidth, holder.clientHeight, Infinity);
    fit(screen, window.innerWidth, window.innerHeight, WIDE_PIXELS);
    if (playing) draw(reduced ? still : clock);
    // cut the jigsaw the screen breaks into now, between frames, rather than
    // in the middle of the celebration
    window.clearTimeout(cutting);
    cutting = window.setTimeout(() => scene.prepare(screen.ink), 200);
  };

  // once through, everything put away again
  const finish = () => {
    stop();
    window.clearTimeout(resting);
    playing = false;
    if (opened) {
      wide.style.display = "none";
      canvas.style.visibility = "";
      delete holder.dataset.stage;
      opened = false;
    }
    strip.context.clearRect(0, 0, canvas.width, canvas.height);
    const then = done;
    done = null;
    then?.();
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    // hold to about sixty a second on faster screens
    if (last && dt < 0.0155) return;
    last = now;
    clock += dt;
    if (clock >= scene.loop) finish();
    else draw(clock);
  };

  const start = () => {
    if (!playing || reduced || frame || document.hidden) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const play = (then: () => void) => {
    if (playing) return;
    playing = true;
    done = then;
    clock = 0;
    if (reduced) {
      draw(still);
      resting = window.setTimeout(finish, 6000);
      return;
    }
    start();
  };
  const onVisibility = () => (document.hidden ? stop() : start());

  const observer = new ResizeObserver(resize);
  observer.observe(holder);
  window.addEventListener("resize", resize);
  resize();
  document.addEventListener("visibilitychange", onVisibility);

  return {
    play,
    dispose() {
      stop();
      window.clearTimeout(cutting);
      window.clearTimeout(resting);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
