"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import { identityFonts } from "@/components/identity/fonts";
import { cover as coverWith } from "@/components/identity/leave";
import { setMuted, useMuted } from "@/lib/riffle";
import type { Engine, Marker } from "../scene/engine";
import { Game, type GamePhase } from "./game/game";
import { bezier, clamp01, cover, ease, lerpQuad, pin, subQuad, unpin, type Box, type Quad } from "./pin";
import { createRoom, makePose, type Pose, type Room } from "./room";
import { createSound, type Sound } from "./sound";
import { STORE, StoreOver, StorePage, type Shots, type Stage } from "./store";
import styles from "./play.module.css";

// PLAY, from the island: the page turns out to be a trailer on a store page,
// the store page turns out to be on a monitor, someone at the desk buys the
// game and runs it, and the camera goes through the screen into the game.
// One clock runs the whole thing so it can be paused, sped up and skipped.

type Props = {
  root: RefObject<HTMLDivElement | null>;
  engine: RefObject<Engine | null>;
  /** Asks the island for its next frame, drawn, with where its places are. */
  capture: (fn: ((canvas: HTMLCanvasElement, markers: Marker[]) => void) | null) => void;
  onExit: () => void;
};

// When the opening happens, in ms on the cinematic's clock. Everything after
// the pull back follows on from the purchase, one beat after another.
const T = {
  video: 150,
  shrink: 1300,
  shrinkFor: 1050,
  cursor: 2200,
  pull: 2800,
  pullFor: 2450,
};

// The trailer cuts between these while it's a video: a hard cut, then a slow push in.
const SHOTS: Array<[string, number]> = [
  ["courtvision", 2.2],
  ["ledgerlens-pond", 2.5],
  ["barkoff", 2.6],
  ["rally", 2.4],
  ["ledgerlens-tree", 2.0],
  ["continuity", 2.3],
];
const CUT_EVERY = 1250;

// How the camera moves: each a dolly with weight, slow to start and slower to stop.
const CURVES = {
  // the pull back through the glass: it leaves gently, travels, and settles long
  pull: bezier(0.62, 0, 0.12, 1),
  lean: bezier(0.42, 0, 0.18, 1),
  reframe: bezier(0.45, 0, 0.25, 1),
  back: bezier(0.38, 0, 0.16, 1),
  // into the screen: gathers itself, commits, and lands square on the glass
  dive: bezier(0.72, 0, 0.26, 1),
};

type Tween = { from: number; length: number; run: (k: number) => void; done?: () => void };

function createClock() {
  const waits: Array<{ at: number; resolve: () => void }> = [];
  const tweens: Tween[] = [];
  const clock = {
    t: 0,
    speed: 1,
    paused: false,
    aborted: false,
    /** The clock won't pass this until it's opened: the room compiling. */
    gate: Infinity,
    /** Pauses itself here: for looking at one frame while working on it. */
    stopAt: Infinity,
    until(at: number) {
      return new Promise<void>((resolve) => {
        if (clock.t >= at) resolve();
        else waits.push({ at, resolve });
      });
    },
    tween(length: number, run: (k: number) => void) {
      return new Promise<void>((resolve) => {
        tweens.push({ from: clock.t, length, run, done: resolve });
      });
    },
    advance(ms: number) {
      if (!clock.paused) clock.t = Math.min(clock.gate, clock.t + ms * clock.speed);
      if (clock.t >= clock.stopAt) {
        clock.t = clock.stopAt;
        clock.paused = true;
        clock.stopAt = Infinity;
      }
      for (let i = tweens.length - 1; i >= 0; i -= 1) {
        const tween = tweens[i];
        const k = clamp01((clock.t - tween.from) / tween.length);
        tween.run(k);
        if (k >= 1) {
          tweens.splice(i, 1);
          tween.done?.();
        }
      }
      for (let i = waits.length - 1; i >= 0; i -= 1) {
        if (clock.t >= waits[i].at) {
          waits[i].resolve();
          waits.splice(i, 1);
        }
      }
    },
  };
  return clock;
}

const lerpBox = (a: Box, b: Box, k: number, out: Box): Box => {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.w = a.w + (b.w - a.w) * k;
  out.h = a.h + (b.h - a.h) * k;
  return out;
};

const PAGE: Box = { x: 0, y: 0, w: STORE.w, h: STORE.h };

const copyPose = (to: Pose, from: Pose) => {
  to.position.copy(from.position);
  to.target.copy(from.target);
  to.fov = from.fov;
  to.roll = from.roll;
  return to;
};

/** The 16:9 box, centred on the viewport, that the viewport just fits inside:
 * the game drawn on the monitor exactly as it will fill the page. */
const contain = (w: number, h: number, out: Box): Box => {
  const wide = w / h < 16 / 9;
  out.w = wide ? (h * 16) / 9 : w;
  out.h = wide ? h : (w * 9) / 16;
  out.x = (w - out.w) / 2;
  out.y = (h - out.h) / 2;
  return out;
};

// Where an element sits in its layer, in the layer's own px: offsets don't
// see transforms, so this holds however the layer is pinned.
function centreOf(layer: HTMLElement | null, selector: string): [number, number] {
  const node = layer?.querySelector<HTMLElement>(selector);
  if (!node || !layer) return [STORE.w / 2, STORE.h / 2];
  let x = node.offsetWidth / 2, y = node.offsetHeight / 2;
  let at: HTMLElement | null = node;
  while (at && at !== layer) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return [x, y];
}

// A hand on a mouse: a quick reach that lands a touch long and a little to
// the side, then a small correction onto the target. Each part follows the
// minimum-jerk profile a practised movement has.
const jerk = (s: number) => s * s * s * (10 + s * (-15 + s * 6));

export default function Play({ root: rootRef, engine: engineRef, capture, onExit }: Props) {
  const roomCanvas = useRef<HTMLCanvasElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const gameLayer = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLDivElement>(null);
  const videoTime = useRef<HTMLSpanElement>(null);
  const sound = useRef<Sound | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const [stage, setStage] = useState<Stage>("page");
  const [shots, setShots] = useState<Shots | null>(null);
  const [videoShown, setVideoShown] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("off");
  const [cinematic, setCinematic] = useState(true);
  const [black, setBlack] = useState<"" | "in" | "out">("");
  const muted = useMuted();

  // the island's frame as it was when PLAY was pressed: the capsule art, the
  // backdrop and the screenshots on the store page are all cut from it
  useEffect(() => {
    capture((canvas, markers) => {
      const root = rootRef.current;
      if (!root) return;
      try {
        const rect = canvas.getBoundingClientRect();
        const frame = root.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        const cut = (cx: number, cy: number, w: number, h: number, scale = 1) => {
          const out = document.createElement("canvas");
          out.width = Math.round(w * scale);
          out.height = Math.round(h * scale);
          const ctx = out.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          const x = Math.max(0, Math.min(canvas.width - w, cx - w / 2));
          const y = Math.max(0, Math.min(canvas.height - h, cy - h / 2));
          ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
          return out.toDataURL("image/png");
        };
        const at = (id: string) => {
          const m = markers.find((marker) => marker.id === id);
          if (!m) return [canvas.width / 2, canvas.height / 2];
          return [(m.x + frame.left - rect.left) * sx, ((m.y + m.bottom) / 2 + frame.top - rect.top) * sy];
        };
        const w = canvas.width, h = canvas.height;
        const thumbW = Math.round(Math.min(w, h * 1.75) * 0.34);
        const thumbH = Math.round(thumbW / 1.75);
        setShots({
          capsule: cut(w / 2, h * 0.5, Math.min(w, h * 2.14) * 0.86, Math.min(w, h * 2.14) * 0.86 / 2.14, 2),
          wide: cut(w / 2, h / 2, w, h),
          thumbs: ["courtvision", "ledgerlens-pond", "barkoff", "rally"].map((id) => {
            const [x, y] = at(id);
            return cut(x, y, thumbW, thumbH, 2);
          }),
        });
      } catch (error) {
        console.error(error);
      }
    });
    return () => capture(null);
  }, [capture, rootRef]);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const engine = engineRef.current;
    const root = rootRef.current!;
    const audio = createSound();
    sound.current = audio;
    const clock = createClock();
    let room: Room | null = null;
    let raf = 0;
    let alive = true;
    let full = false;
    let islandShown = true;
    let gameShown = false;
    const cursorAt = { x: 640, y: 480 };

    const width = () => window.innerWidth;
    const height = () => window.innerHeight;
    const aspect = () => width() / height();
    // the frame's own corners, kept in one array that's updated, not remade
    const view: Quad = [0, 0, 0, 0, 0, 0, 0, 0];
    const viewport = (): Quad => {
      const w = width(), h = height();
      view[2] = view[4] = w;
      view[5] = view[7] = h;
      return view;
    };

    if (!reduced) {
      room = createRoom(roomCanvas.current!);
      room.resize(width(), height());
      // the room builds while the trailer and the store page play; the clock
      // only waits for it if it isn't ready by the time the camera pulls back
      clock.gate = T.pull;
      room
        .prepare(room.poses.cover(aspect()))
        .then(() => {
          clock.gate = Infinity;
        })
        .catch((error) => console.error(error));
    }
    if (process.env.NODE_ENV !== "production") {
      const stop = (window as unknown as { __playStopAt?: number }).__playStopAt;
      if (typeof stop === "number") clock.stopAt = stop;
    }
    const onResize = () => room?.resize(width(), height());
    window.addEventListener("resize", onResize);

    // —— the camera: named shots, moves between them, and the operator's breath
    const shot = {
      cover: (out: Pose) => room!.poses.cover(aspect(), out),
      seat: (out: Pose) => room!.poses.seat(aspect(), out),
      // leaning in to buy: the price, the button and the dialog that follows
      buy: (out: Pose) => room!.poses.lean(aspect(), 790, 560, aspect() < 1 ? 720 : 1540, out),
      // the library: the art, the button and the download beside it
      library: (out: Pose) => room!.poses.lean(aspect(), 880, 450, aspect() < 1 ? 760 : 1400, out),
    };
    type ShotName = keyof typeof shot;
    const rig = { from: makePose(), to: "cover" as ShotName, at: 0, length: 0, curve: ease.inOut, arc: new Vector3() };
    const base = makePose();
    const goal = makePose();
    const pose = makePose();
    const move = (to: ShotName, length: number, curve: (t: number) => number, arc: [number, number, number] = [0, 0, 0]) => {
      copyPose(rig.from, base);
      rig.to = to;
      rig.at = clock.t;
      rig.length = length;
      rig.curve = curve;
      rig.arc.set(arc[0], arc[1], arc[2]);
    };
    const place = (t: number) => {
      shot[rig.to](goal);
      const k = rig.length > 0 ? clamp01((t - rig.at) / rig.length) : 1;
      if (k >= 1) return copyPose(base, goal);
      const e = rig.curve(k);
      base.position.lerpVectors(rig.from.position, goal.position, e).addScaledVector(rig.arc, Math.sin(Math.PI * e));
      // the operator keeps the frame a touch ahead of the move
      base.target.lerpVectors(rig.from.target, goal.target, Math.min(1, e * 1.06));
      base.fov = rig.from.fov + (goal.fov - rig.from.fov) * e;
      base.roll = 0;
      return base;
    };
    // hand-held: slow, uneven drift in where it points, a breath in its height
    let steady = 0;
    let steadyGoal = 0;
    let wander = 0;
    const forward = new Vector3(), right = new Vector3(), up = new Vector3(), lift = new Vector3(0, 1, 0);
    const wobble = (t: number, a: number, b: number, c: number) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.7) * 0.32 + Math.sin(t * c + 4.1) * 0.18;
    const handheld = (dt: number, out: Pose, amount: number) => {
      wander += dt;
      if (amount <= 0.0005) return out;
      forward.subVectors(out.target, out.position);
      const distance = forward.length();
      forward.divideScalar(distance);
      right.crossVectors(forward, lift).normalize();
      up.crossVectors(right, forward);
      const yaw = wobble(wander, 0.53, 1.31, 2.9) * 0.0021 * amount;
      const pitch = (wobble(wander + 11, 0.47, 1.17, 2.6) * 0.0017 + Math.sin(wander * 1.45) * 0.0009) * amount;
      out.target.addScaledVector(right, yaw * distance).addScaledVector(up, pitch * distance);
      out.position.addScaledVector(up, Math.sin(wander * 1.45) * 0.0016 * amount).addScaledVector(right, wobble(wander + 5, 0.37, 0.91, 2.2) * 0.0012 * amount);
      out.roll = wobble(wander + 23, 0.41, 1.07, 2.3) * 0.0012 * amount;
      return out;
    };

    // —— the pointer on the screen, and the mouse on the desk under the hand
    const placeCursor = () => {
      const node = cursor.current;
      if (!node) return;
      node.style.transform = `translate3d(${cursorAt.x.toFixed(1)}px, ${cursorAt.y.toFixed(1)}px, 0)`;
      room?.setMouse(((cursorAt.x - 800) / 1600) * 0.07, ((cursorAt.y - 450) / 900) * 0.045);
    };
    const moveCursor = (to: [number, number], length: number) => {
      const fx = cursorAt.x, fy = cursorAt.y;
      const dx = to[0] - fx, dy = to[1] - fy;
      const distance = Math.hypot(dx, dy) || 1;
      const nx = -dy / distance, ny = dx / distance;
      // where the reach lands: a little long, a little to the side
      const lx = to[0] + dx * 0.05 + nx * Math.min(14, distance * 0.03);
      const ly = to[1] + dy * 0.05 + ny * Math.min(14, distance * 0.03);
      const bow = Math.min(46, distance * 0.09);
      const split = 0.74;
      return clock.tween(length, (k) => {
        if (k < split) {
          const s = jerk(k / split);
          const arc = Math.sin(Math.PI * s) * bow;
          cursorAt.x = fx + (lx - fx) * s + nx * arc;
          cursorAt.y = fy + (ly - fy) * s + ny * arc;
        } else {
          const s = jerk((k - split) / (1 - split));
          cursorAt.x = lx + (to[0] - lx) * s;
          cursorAt.y = ly + (to[1] - ly) * s;
        }
        placeCursor();
      });
    };
    const hover = (target: string | null) => {
      for (const layer of [under.current, over.current]) {
        if (!layer) continue;
        if (target) layer.dataset.hover = target;
        else delete layer.dataset.hover;
      }
      if (cursor.current) cursor.current.toggleAttribute("data-hand", Boolean(target));
    };
    const click = async (target: string) => {
      audio.click();
      for (const layer of [under.current, over.current]) if (layer) layer.dataset.press = target;
      cursor.current?.setAttribute("data-down", "");
      await clock.until(clock.t + 120);
      for (const layer of [under.current, over.current]) if (layer) delete layer.dataset.press;
      cursor.current?.removeAttribute("data-down");
    };

    // —— the trailer: hard cuts on the clock, each shot pushing in slowly
    // the first cut waits for the player bar to land, so the page reads as
    // the same page, playing, before it starts cutting
    let cut = -1;
    let nextCut = T.video + 900;
    let drift: [string, number] | null = null;
    const trailer = (t: number) => {
      if (!engine || !islandShown) return;
      if (drift) {
        engine.look(drift[0], drift[1] * 1.12, 0.55);
        drift = null;
      }
      if (t < nextCut) return;
      cut += 1;
      nextCut += CUT_EVERY;
      const [id, zoom] = SHOTS[cut % SHOTS.length];
      engine.look(id, zoom, 600);
      drift = [id, zoom];
      // the player keeps time with the footage: the clock and the bar move on
      const seconds = 41 + Math.floor(t / 1000);
      if (videoTime.current) videoTime.current.textContent = `0:${String(seconds).padStart(2, "0")} / 1:30`;
      video.current?.style.setProperty("--progress", `${((seconds / 90) * 100).toFixed(1)}%`);
    };

    // —— each frame: the camera, then everything pinned to where it lands
    const quad: Quad = [0, 0, 0, 0, 0, 0, 0, 0];
    const slot: Quad = [0, 0, 0, 0, 0, 0, 0, 0];
    const at: Quad = [0, 0, 0, 0, 0, 0, 0, 0];
    const whole: Box = { x: 0, y: 0, w: 0, h: 0 };
    const crop: Box = { x: 0, y: 0, w: 0, h: 0 };
    const box: Box = { x: 0, y: 0, w: 0, h: 0 };
    const picture: Box = { x: 0, y: 0, w: 0, h: 0 };
    let last = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      clock.advance(dt * 1000);
      const t = clock.t;
      const W = width(), H = height();
      if (full) return;
      trailer(t);

      let screen: Quad = viewport();
      if (room) {
        place(t);
        steady += (steadyGoal - steady) * (1 - Math.exp(-dt * 2.2));
        // the push in ends square on the glass, so the hand steadies as it goes
        const settle = rig.to === "cover" && rig.length > 0 ? (1 - clamp01((t - rig.at) / (rig.length * 0.8))) ** 2 : 1;
        room.setPose(handheld(dt, copyPose(pose, base), steady * settle));
        room.render(dt);
        screen = room.screenQuad(quad);
        if (under.current) pin(under.current, PAGE, screen, STORE.w, STORE.h);
        if (over.current) pin(over.current, PAGE, screen, STORE.w, STORE.h);
      }

      if (islandShown) {
        whole.w = W;
        whole.h = H;
        cover(W, H, STORE.slot.w / STORE.slot.h, crop);
        const k = room ? ease.inOut(clamp01((t - T.shrink) / T.shrinkFor)) : 0;
        lerpBox(whole, crop, k, box);
        if (k > 0) lerpQuad(viewport(), subQuad(PAGE, screen, STORE.slot, slot), k, at);
        else lerpQuad(viewport(), viewport(), 0, at);
        pin(root, box, at, W, H);
        const v = video.current;
        if (v) {
          pin(v, box, at, W, H);
          const inner = v.firstElementChild as HTMLElement;
          inner.style.left = `${box.x}px`;
          inner.style.top = `${box.y}px`;
          inner.style.width = `${box.w}px`;
          inner.style.height = `${box.h}px`;
        }
      }

      const layer = gameLayer.current;
      if (layer && room) {
        if (gameShown) {
          // the game, as it will fill the page, on the monitor; the camera
          // pushes in until the two are the same
          contain(W, H, picture);
          pin(layer, picture, screen, W, H);
          layer.style.clipPath = `inset(${picture.y.toFixed(2)}px ${(W - picture.x - picture.w).toFixed(2)}px ${(H - picture.y - picture.h).toFixed(2)}px ${picture.x.toFixed(2)}px)`;
        }
      }
    };
    raf = requestAnimationFrame(frame);

    // —— the end state, reached by the script or by skipping to it
    const finish = () => {
      if (full) return;
      full = true;
      gameShown = true;
      islandShown = false;
      root.style.visibility = "hidden";
      if (video.current) video.current.style.visibility = "hidden";
      engine?.pause(true);
      if (gameLayer.current) {
        unpin(gameLayer.current);
        gameLayer.current.dataset.shown = "";
      }
      room?.dispose(true);
      room = null;
      setCinematic(false);
      setPhase("ready");
      audio.room(false);
      audio.music(true);
    };

    // skipping cuts to black, swaps underneath, and comes up on the title
    const skip = () => {
      if (full || clock.aborted) return;
      clock.aborted = true;
      setBlack("in");
      window.setTimeout(() => {
        finish();
        window.setTimeout(() => setBlack("out"), 120);
      }, 190);
    };
    skipRef.current = skip;

    // —— the script, with each beat noted on the clock (for timing it while working on it)
    const beats: Array<[string, number]> = [];
    const beat = (name: string) => {
      if (process.env.NODE_ENV !== "production") beats.push([name, Math.round(clock.t)]);
    };
    const wait = (ms: number) => clock.until(clock.t + ms);
    const script = async () => {
      if (reduced) {
        audio.unlock();
        setBlack("in");
        await new Promise((resolve) => window.setTimeout(resolve, 380));
        finish();
        setBlack("out");
        return;
      }
      const stop = () => clock.aborted || !alive;
      room!.setScreen(0x7d9bd6, 1, true);
      room!.setStop(2);
      // a frame first, so the press shows before anything waits on the sound card
      await new Promise((resolve) => requestAnimationFrame(resolve));
      audio.unlock();
      audio.press();
      beat("press");

      await clock.until(T.video);
      if (stop()) return;
      setVideoShown(true);
      beat("trailer");

      await clock.until(T.shrink);
      if (stop()) return;
      audio.whoosh(1.3, false, 0.08);
      beat("store page");

      await clock.until(T.cursor);
      if (stop()) return;
      cursorAt.x = 760;
      cursorAt.y = 520;
      placeCursor();
      cursor.current?.setAttribute("data-shown", "");
      void moveCursor([700, 492], 600);

      // the pull back through the glass: the room comes into focus as it goes
      await clock.until(T.pull);
      if (stop()) return;
      audio.whoosh(2.2, false, 0.14);
      audio.room(true);
      move("seat", T.pullFor, CURVES.pull, [-0.025, 0.03, 0]);
      beat("pull back");
      steadyGoal = 1;
      await wait(T.pullFor * 0.6);
      if (stop()) return;
      room!.setStop(3.2);
      await clock.until(T.pull + T.pullFor + 300);
      if (stop()) return;

      // leaning in to buy it
      move("buy", 1250, CURVES.lean);
      beat("lean in");
      steadyGoal = 0.45;
      room!.setStop(2.8);
      await wait(320);
      if (stop()) return;
      await moveCursor(centreOf(under.current, "[data-target='buy']"), 820);
      if (stop()) return;
      hover("buy");
      await wait(150);
      if (stop()) return;
      await click("buy");
      hover(null);
      setStage("confirm");
      beat("buy");
      room!.setScreen(0x5a6f96, 0.8);

      await wait(200);
      if (stop()) return;
      await moveCursor(centreOf(over.current, "[data-target='purchase']"), 600);
      if (stop()) return;
      hover("purchase");
      await wait(140);
      if (stop()) return;
      await click("purchase");
      setStage("paying");
      beat("purchase");
      // the game starts up under the spinner, out of sight, so it's warm by
      // the time the screen goes over to it
      setPhase("splash");
      await wait(450);
      if (stop()) return;
      setStage("paid");
      beat("thank you");
      audio.chime();
      room!.setPhone(true);
      hover(null);

      // the library: install, then play
      await wait(480);
      if (stop()) return;
      setStage("library");
      beat("library");
      room!.setScreen(0x8899b8, 0.9);
      islandShown = false;
      root.style.visibility = "hidden";
      if (video.current) video.current.style.visibility = "hidden";
      engine?.pause(true);
      move("library", 700, CURVES.reframe);
      await wait(150);
      if (stop()) return;
      await moveCursor(centreOf(over.current, "[data-target='action']"), 520);
      if (stop()) return;
      hover("action");
      await wait(130);
      if (stop()) return;
      await click("action");
      setStage("installing");
      beat("install");
      for (let i = 0; i < 8; i += 1) {
        await wait(110);
        if (stop()) return;
        audio.tick();
      }
      setStage("ready");
      beat("installed");
      await wait(240);
      if (stop()) return;
      await click("action");
      setStage("launching");
      beat("play");
      hover(null);

      // the screen goes over to the game, and the camera sits back to watch it start
      await wait(320);
      if (stop()) return;
      setStage("dark");
      beat("dark");
      cursor.current?.removeAttribute("data-shown");
      room!.setScreen(0x000000, 0.04);
      audio.launch();
      move("seat", 1300, CURVES.back);
      steadyGoal = 1;
      room!.setStop(3.2);
      room!.setPhone(false);

      await wait(380);
      if (stop()) return;
      gameShown = true;
      if (gameLayer.current) gameLayer.current.dataset.shown = "";
      beat("presents");
      room!.setScreen(0x1a1a22, 0.12);
      await wait(200);
      if (stop()) return;
      audio.sting();

      await wait(1100);
      if (stop()) return;
      setPhase("title");
      beat("title");
      room!.setScreen(0xffc79a, 1.25);

      // through the screen
      await wait(800);
      if (stop()) return;
      audio.whoosh(1.5, true, 0.2);
      audio.room(false);
      move("cover", 1300, CURVES.dive, [0.01, 0.018, 0]);
      beat("into the screen");
      room!.setStop(2.2);
      await wait(1300);
      if (stop()) return;
      beat("game");
      finish();
    };
    script().catch((error) => console.error(error));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !full) skip();
    };
    window.addEventListener("keydown", onKey);

    // for looking at single frames while working on it
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __play: unknown }).__play = {
        clock,
        beats,
        pause: () => (clock.paused = true),
        play: () => (clock.paused = false),
        speed: (s: number) => (clock.speed = s),
        stopAt: (ms: number) => {
          clock.stopAt = ms;
          clock.paused = false;
        },
      };
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      room?.dispose();
      audio.dispose();
      sound.current = null;
    };
  }, [engineRef, rootRef]);

  const quit = useCallback(async () => {
    sound.current?.music(false);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sheet = await coverWith("designer", window.innerWidth / 2, window.innerHeight / 2, reduced);
    onExit();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        sheet
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out", fill: "forwards" })
          .finished.then(() => sheet.remove(), () => sheet.remove());
      }),
    );
  }, [onExit]);

  return (
    <>
      <canvas ref={roomCanvas} className={styles.room} hidden={!cinematic} aria-hidden="true" />
      {cinematic ? (
        <>
          <StorePage shots={shots} layer={under} />
          <StoreOver stage={stage} shots={shots} layer={over} cursor={cursor} />
        </>
      ) : null}
      <div ref={video} className={`${styles.videoLayer} ${identityFonts}`} data-shown={videoShown || undefined}>
        <div className={styles.video}>
          <span className={styles.videoBadge}>
            <i />
            Trailer · Aiden: Life of a Handsome Entrepreneur
          </span>
          <div className={styles.videoBar}>
            <div className={styles.videoTrack}>
              <i />
            </div>
            <div className={styles.videoRow}>
              <svg viewBox="0 0 16 16"><path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" /></svg>
              <svg viewBox="0 0 16 16" className={styles.stroke}><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" /></svg>
              <span ref={videoTime} className={styles.videoTime}>0:41 / 1:30</span>
              <span className={styles.videoGrow} />
              <span className={styles.videoHd}>HD</span>
              <svg viewBox="0 0 16 16" className={styles.stroke}><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg>
            </div>
          </div>
        </div>
      </div>
      <div ref={gameLayer} className={`${styles.gameLayer} ${identityFonts}`} hidden={phase === "off"}>
        <Game phase={phase} soundRef={sound} onQuit={quit} />
      </div>
      <div className={styles.fade} data-state={black || undefined} />
      {cinematic ? (
        <div className={`${styles.chrome} ${identityFonts}`}>
          <button type="button" className={styles.chromeButton} onClick={() => setMuted(!muted)} aria-pressed={!muted}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" className={styles.chromeButton} onClick={() => skipRef.current()}>
            Skip <kbd>esc</kbd>
          </button>
        </div>
      ) : null}
    </>
  );
}
