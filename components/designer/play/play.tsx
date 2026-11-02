"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import { identityFonts } from "@/components/identity/fonts";
import { cover as coverWith } from "@/components/identity/leave";
import { setMuted, useMuted } from "@/lib/riffle";
import type { Engine, Marker } from "../scene/engine";
import { Game, type GamePhase } from "./game/game";
import { clamp01, cover, ease, lerpQuad, pin, subQuad, unpin, type Box, type Quad } from "./pin";
import { createRoom, type Pose, type Room } from "./room";
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

// When things happen, in ms on the cinematic's clock.
const T = {
  video: 250,
  shrink: 900,
  shrinkFor: 1250,
  cursor: 2300,
  pull: 2700,
  pullFor: 2600,
  lean: 5500,
  leanFor: 1300,
  back: 12750,
  backFor: 1400,
  dark: 12900,
  splash: 13250,
  title: 14950,
  dive: 15850,
  diveFor: 1500,
};
const END = T.dive + T.diveFor;

// The trailer cuts between these while it's a video.
const SHOTS: Array<[string, number]> = [
  ["ledgerlens-tree", 2.1],
  ["courtvision", 2.3],
  ["ledgerlens-pond", 2.5],
  ["barkoff", 2.6],
  ["rally", 2.4],
];

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

const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  position: a.position.clone().lerp(b.position, k),
  target: a.target.clone().lerp(b.target, k),
  fov: a.fov + (b.fov - a.fov) * k,
});

const lerpBox = (a: Box, b: Box, k: number): Box => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
});

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

export default function Play({ root: rootRef, engine: engineRef, capture, onExit }: Props) {
  const roomCanvas = useRef<HTMLCanvasElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const gameLayer = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLDivElement>(null);
  const sound = useRef<Sound | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const [stage, setStage] = useState<Stage>("page");
  const [shots, setShots] = useState<Shots | null>(null);
  const [videoShown, setVideoShown] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("off");
  const [cinematic, setCinematic] = useState(true);
  const [black, setBlack] = useState(false);
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
    audio.unlock();
    const clock = createClock();
    let room: Room | null = null;
    let raf = 0;
    let alive = true;
    let full = false;
    let islandShown = true;
    let gameShown = false;
    let breathing = 0;
    const cursorAt = { x: 640, y: 480, shown: false };

    const width = () => window.innerWidth;
    const height = () => window.innerHeight;
    const viewport = (): Quad => [0, 0, width(), 0, width(), height(), 0, height()];

    let roomReady = false;
    if (!reduced) {
      room = createRoom(roomCanvas.current!);
      room.resize(width(), height());
      clock.gate = T.shrink;
      room
        .prepare(room.poses.cover(width() / height()))
        .then(() => {
          roomReady = true;
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

    const buyAt = () => centreOf(under.current, "[data-target='buy']");
    const poseAt = (t: number): Pose | null => {
      if (!room) return null;
      const aspect = width() / height();
      const { cover: coverPose, seat, lean } = room.poses;
      const front = coverPose(aspect);
      const chair = seat(aspect);
      // lean in to read: the lower middle of the screen, where buying happens
      const close = lean(aspect, 830, 560, 1240);
      if (t < T.pull) return front;
      if (t < T.pull + T.pullFor) return mixPose(front, chair, ease.pull((t - T.pull) / T.pullFor));
      if (t < T.lean) return chair;
      if (t < T.lean + T.leanFor) return mixPose(chair, close, ease.inOut((t - T.lean) / T.leanFor));
      if (t < T.back) return close;
      if (t < T.back + T.backFor) return mixPose(close, chair, ease.inOut((t - T.back) / T.backFor));
      if (t < T.dive) return chair;
      if (t < END) return mixPose(chair, front, ease.in(clamp01((t - T.dive) / T.diveFor)) * 0.6 + ease.inOut(clamp01((t - T.dive) / T.diveFor)) * 0.4);
      return front;
    };

    // —— the pointer on the screen, and the mouse on the desk under the hand
    const placeCursor = () => {
      const node = cursor.current;
      if (!node) return;
      node.style.transform = `translate3d(${cursorAt.x.toFixed(1)}px, ${cursorAt.y.toFixed(1)}px, 0)`;
      room?.setMouse(((cursorAt.x - 800) / 1600) * 0.07, ((cursorAt.y - 450) / 900) * 0.045);
    };
    const moveCursor = (to: [number, number], length: number) => {
      const from = { x: cursorAt.x, y: cursorAt.y };
      const dx = to[0] - from.x, dy = to[1] - from.y;
      // a hand doesn't draw straight lines: bow the path a little, and overshoot
      const bow = { x: from.x + dx * 0.5 - dy * 0.12, y: from.y + dy * 0.5 + dx * 0.08 };
      return clock.tween(length, (k) => {
        const e = ease.inOut(k);
        const s = e + Math.sin(e * Math.PI) * 0.035;
        const u = 1 - s;
        cursorAt.x = u * u * from.x + 2 * u * s * bow.x + s * s * to[0];
        cursorAt.y = u * u * from.y + 2 * u * s * bow.y + s * s * to[1];
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
      await clock.until(clock.t + 130);
      for (const layer of [under.current, over.current]) if (layer) delete layer.dataset.press;
      cursor.current?.removeAttribute("data-down");
    };

    // —— each frame: the camera, then everything pinned to where it lands
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

      let screen: Quad = viewport();
      if (room) {
        const pose = poseAt(t)!;
        // once it's a person in a chair, it breathes
        breathing += dt;
        const settle = clamp01((t - T.pull - T.pullFor * 0.7) / 1200) * (t < T.dive ? 1 : clamp01(1 - (t - T.dive) / 500));
        pose.position.add(new Vector3(Math.sin(breathing * 0.7) * 0.004, Math.sin(breathing * 1.1) * 0.003, 0).multiplyScalar(settle));
        pose.target.add(new Vector3(Math.sin(breathing * 0.5 + 1) * 0.003, Math.sin(breathing * 0.8) * 0.002, 0).multiplyScalar(settle));
        room.setPose(pose);
        if (roomReady) room.render(dt);
        screen = room.screenQuad();
        const page = { x: 0, y: 0, w: STORE.w, h: STORE.h };
        if (under.current) pin(under.current, page, screen, STORE.w, STORE.h);
        if (over.current) pin(over.current, page, screen, STORE.w, STORE.h);
      }

      if (islandShown) {
        const whole: Box = { x: 0, y: 0, w: W, h: H };
        const crop = cover(W, H, STORE.slot.w / STORE.slot.h);
        const slot = subQuad({ x: 0, y: 0, w: STORE.w, h: STORE.h }, screen, STORE.slot);
        const k = room ? ease.inOut(clamp01((t - T.shrink) / T.shrinkFor)) : 0;
        const box = lerpBox(whole, crop, k);
        const quad = k > 0 ? lerpQuad(viewport(), slot, k) : viewport();
        pin(root, box, quad, W, H);
        const v = video.current;
        if (v) {
          pin(v, box, quad, W, H);
          const frame = v.firstElementChild as HTMLElement;
          frame.style.left = `${box.x}px`;
          frame.style.top = `${box.y}px`;
          frame.style.width = `${box.w}px`;
          frame.style.height = `${box.h}px`;
        }
      }

      if (gameShown && gameLayer.current) {
        const whole: Box = { x: 0, y: 0, w: W, h: H };
        const crop = cover(W, H, 16 / 9);
        const k = room ? ease.inOut(clamp01((t - (T.dive + T.diveFor * 0.4)) / (T.diveFor * 0.6))) : 1;
        if (k >= 1) unpin(gameLayer.current);
        else pin(gameLayer.current, lerpBox(crop, whole, k), lerpQuad(screen, viewport(), k), W, H);
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
      if (gameLayer.current) unpin(gameLayer.current);
      room?.dispose();
      room = null;
      setCinematic(false);
      setPhase("ready");
      audio.room(false);
      audio.music(true);
    };

    const skip = () => {
      if (full || clock.aborted) return;
      clock.aborted = true;
      setBlack(true);
      window.setTimeout(() => {
        finish();
        window.setTimeout(() => setBlack(false), 80);
      }, 380);
    };
    skipRef.current = skip;

    // —— the script
    const script = async () => {
      if (reduced) {
        setBlack(true);
        await new Promise((resolve) => window.setTimeout(resolve, 380));
        finish();
        setBlack(false);
        return;
      }
      const stop = () => clock.aborted || !alive;
      room!.setScreen(0x7d9bd6, 1, true);
      audio.press();

      await clock.until(T.video);
      if (stop()) return;
      setVideoShown(true);
      let shot = 0;
      const nextShot = () => {
        const [id, zoom] = SHOTS[shot % SHOTS.length];
        engine?.look(id, zoom, 0.9);
        shot += 1;
      };
      nextShot();
      const cuts = window.setInterval(() => {
        if (!islandShown || stop()) window.clearInterval(cuts);
        else nextShot();
      }, 2400);

      await clock.until(T.shrink);
      if (stop()) return;
      audio.whoosh(1.3, false, 0.08);

      await clock.until(T.cursor);
      if (stop()) return;
      cursorAt.x = 760;
      cursorAt.y = 520;
      placeCursor();
      cursor.current?.setAttribute("data-shown", "");
      moveCursor([706, 498], 700);

      await clock.until(T.pull);
      if (stop()) return;
      audio.whoosh(2.2, false, 0.14);
      audio.room(true);

      // the purchase
      await clock.until(T.lean + 150);
      if (stop()) return;
      await moveCursor(buyAt(), 900);
      hover("buy");
      await clock.until(clock.t + 260);
      if (stop()) return;
      await click("buy");
      hover(null);
      setStage("confirm");
      room!.setScreen(0x5a6f96, 0.8);

      await clock.until(clock.t + 280);
      if (stop()) return;
      await moveCursor(centreOf(over.current, "[data-target='purchase']"), 750);
      hover("purchase");
      await clock.until(clock.t + 220);
      if (stop()) return;
      await click("purchase");
      setStage("paying");
      await clock.until(clock.t + 560);
      if (stop()) return;
      setStage("paid");
      audio.chime();
      room!.setPhone(true);
      hover(null);

      // the library: install, then play
      await clock.until(clock.t + 700);
      if (stop()) return;
      setStage("library");
      room!.setScreen(0x8899b8, 0.9);
      islandShown = false;
      root.style.visibility = "hidden";
      if (video.current) video.current.style.visibility = "hidden";
      engine?.pause(true);
      await clock.until(clock.t + 200);
      if (stop()) return;
      await moveCursor(centreOf(over.current, "[data-target='action']"), 650);
      hover("action");
      await clock.until(clock.t + 200);
      if (stop()) return;
      await click("action");
      setStage("installing");
      for (let i = 0; i < 9; i += 1) {
        await clock.until(clock.t + 125);
        if (stop()) return;
        audio.tick();
      }
      setStage("ready");
      room!.setPhone(false);
      await clock.until(clock.t + 380);
      if (stop()) return;
      await click("action");
      setStage("launching");
      hover(null);

      // the screen goes over to the game
      await clock.until(T.dark);
      if (stop()) return;
      setStage("dark");
      cursor.current?.removeAttribute("data-shown");
      room!.setScreen(0x000000, 0.04);
      audio.launch();

      await clock.until(T.splash);
      if (stop()) return;
      gameShown = true;
      setPhase("splash");
      room!.setScreen(0x1a1a22, 0.12);
      await clock.until(T.splash + 200);
      if (stop()) return;
      audio.sting();

      await clock.until(T.title);
      if (stop()) return;
      setPhase("title");
      room!.setScreen(0xffc79a, 1.25);

      await clock.until(T.dive);
      if (stop()) return;
      audio.whoosh(1.5, true, 0.2);
      audio.room(false);

      await clock.until(END);
      if (stop()) return;
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
              <span className={styles.videoTime}>0:41 / 1:30</span>
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
      <div className={styles.fade} data-shown={black || undefined} />
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
