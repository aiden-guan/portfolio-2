"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import { setMuted, useMuted } from "@/lib/riffle";
import { uniforms } from "../../scene/shared";
import { Logo } from "../logo";
import type { Sound } from "../sound";
import { CHAPTERS, COMING, nextOf, ORDER } from "./chapters";
import { SPEAKERS, type ChapterId, type Ctx, type Line, type SceneSetup, type Stats } from "./chapters/types";
import { face as drawnFace } from "./faces";
import { LOOKS } from "./people";
import { pixelPortrait } from "./portrait";
import { auditorium } from "./rooms/auditorium";
import { bedroom, type Feature } from "./rooms/bedroom";
import type { Room } from "./rooms/common";
import { dorm, type DormFeature } from "./rooms/dorm";
import { field } from "./rooms/field";
import { glade } from "./rooms/glade";
import { hackathon } from "./rooms/hackathon";
import { hall } from "./rooms/hall";
import { hallway } from "./rooms/hallway";
import { office } from "./rooms/office";
import { street } from "./rooms/street";
import { loadSave, writeSave, type Save } from "./save";
import { Screen, type ScreenSpec } from "./screens";
import { createStage, type Stage } from "./stage";
import { titleScene, type Title } from "./title";
import { createView, type View } from "./view";
import { createWingman, type Wingman } from "./wingman";
import { WingmanHud } from "./wingman-hud";
import styles from "./game.module.css";

// Aiden: Life of a Handsome Entrepreneur. The title screen, the chapters,
// and everything the chapters are told through: the HUD, the dialogue (and
// its choices), the laptop and the phone, the cards that open and close
// each chapter. The world is drawn by view.ts the way the island is; all
// of the reading is plain HTML on top. Chapters are scripts (chapters/*.ts)
// written against the Ctx made here.

export type GamePhase = "off" | "splash" | "title" | "ready";
type Mode = "title" | "intro" | "play" | "end";
type Talk = { list: Line[]; at: number; then?: () => void; choices?: Array<{ label: string; who?: string }>; pick?: (i: number) => void };
type Overlay = { spec: ScreenSpec; resolve: (value: unknown) => void; id: number };
type Bubble = { key: string; target: string | Vector3; text: string; until: number };
type World = { view: View; title: Title; stage: Stage | null; mini: Wingman | null; time: number; revealFrom: number; revealOut: number; revealMax: number };

const CLOCK_RATE = 1500;

function buildRoom(setup: SceneSetup): Room {
  switch (setup.id) {
    case "bedroom": {
      const room = bedroom({ night: setup.night });
      for (const feature of setup.features ?? []) room.show(feature as Feature);
      return room;
    }
    case "street":
      return street();
    case "hallway":
      return hallway({ trophies: setup.trophies });
    case "auditorium":
      return auditorium();
    case "field":
      return field();
    case "dorm": {
      const room = dorm({ night: setup.night });
      for (const feature of setup.features ?? []) room.show(feature as DormFeature);
      return room;
    }
    case "hall":
      return hall({ mode: setup.hall, slide: setup.slide, exam: setup.exam });
    case "glade":
      return glade({ night: setup.night });
    case "hackathon":
      return hackathon({ event: setup.event });
    case "office":
      return office({ dusk: setup.dusk });
  }
}

/** How far the dissolve has to reach before the whole room is there. */
function reachOf(room: Room) {
  const b = room.bounds;
  const far = Math.max(...[[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].map(([x, z]) => Math.hypot(x, z))) + 1.2;
  return Math.min(1, (far + 8) / 44 + 0.02);
}

export function Game({ phase, soundRef, onQuit }: { phase: GamePhase; soundRef: RefObject<Sound | null>; onQuit: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const prompt = useRef<HTMLButtonElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const bubbleNodes = useRef(new Map<string, HTMLElement>());
  const world = useRef<World | null>(null);
  const typingRef = useRef<{ done: boolean; finish: () => void }>({ done: true, finish: () => {} });
  const session = useRef(0);
  const busy = useRef(0);
  const waits = useRef<Array<{ at: number; resolve: () => void }>>([]);
  const stepRef = useRef("");
  const talkRef = useRef<Talk | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const choiceRef = useRef(0);
  const chapterRef = useRef<ChapterId>("prologue");
  /** What the current step is about: used first when several things are in reach. */
  const preferred = useCallback(() => CHAPTERS[chapterRef.current].targets?.[stepRef.current] ?? stepRef.current, []);
  const bubblesRef = useRef<Bubble[]>([]);
  // asks for a picture of the next frame, framed on Aiden (a reel's footage)
  const shots = useRef<Array<(url: string) => void>>([]);
  const statsRef = useRef<Required<Pick<Stats, "money" | "members" | "revenue" | "ready" | "wins">>>({ money: 0, members: 0, revenue: 0, ready: 0, wins: 0 });

  const [mode, setMode] = useState<Mode>("title");
  const [chapterId, setChapterId] = useState<ChapterId>("prologue");
  const [intro, setIntro] = useState<{ chapter: ChapterId; lines: string[]; act: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(0);
  const [step, setStep] = useState("");
  const [talk, setTalkState] = useState<Talk | null>(null);
  const [choice, setChoice] = useState(0);
  const [overlay, setOverlayState] = useState<Overlay | null>(null);
  const [stats, setStats] = useState({ money: 0, members: 0, revenue: 0, ready: 0, wins: 0 });
  const [hearts, setHearts] = useState({ john: 0, jerry: 0 });
  const [day, setDay] = useState("");
  const [clock, setClock] = useState(7 * 60);
  const [banner, setBanner] = useState<{ place: string; time: string; id: number } | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [glint, setGlint] = useState(0);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [touch, setTouch] = useState(false);
  const [save, setSaveState] = useState<Save | null>(null);
  const [mini, setMini] = useState<Wingman | null>(null);
  const muted = useMuted();
  const started = phase !== "off";
  const live = useRef({ mode, paused, chaptersOpen, menu, leaving });

  useEffect(() => {
    live.current = { mode, paused, chaptersOpen, menu, leaving };
  });

  useEffect(() => {
    const coarse = matchMedia("(pointer: coarse)");
    const sync = () => setTouch(coarse.matches);
    coarse.addEventListener("change", sync);
    const id = window.setTimeout(() => {
      sync();
      setSaveState(loadSave());
    }, 0);
    return () => {
      coarse.removeEventListener("change", sync);
      window.clearTimeout(id);
    };
  }, []);

  // the faces in the dialogue, from the photographs
  useEffect(() => {
    if (!started) return;
    let alive = true;
    Promise.all([
      pixelPortrait("/aiden.webp", [0.2, 0.17, 0.6, 0.6], 36, 7).then((src) => ["aiden", src] as const),
      pixelPortrait("/arcade/phoebe.webp", [0.575, 0.0, 0.32, 0.56], 36, 7).then((src) => ["phoebe", src] as const),
    ])
      .then((list) => {
        if (alive) setPhotos(Object.fromEntries(list));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [started]);

  const faceOf = useCallback(
    (who: string | undefined) => {
      const spec = who ? SPEAKERS[who] : undefined;
      if (!spec?.face) return undefined;
      return spec.face.startsWith("photo:") ? photos[spec.face.slice(6)] : drawnFace(spec.face);
    },
    [photos],
  );

  // —— the state the scripts lean on, kept readable the instant it changes
  const setTalk = useCallback((next: Talk | null) => {
    talkRef.current = next;
    setTalkState(next);
    choiceRef.current = 0;
    setChoice(0);
  }, []);
  const setOverlay = useCallback((next: Overlay | null) => {
    overlayRef.current = next;
    setOverlayState(next);
  }, []);

  const animateStat = useCallback((name: "money" | "members" | "revenue" | "ready" | "wins", to: number, ms = 900) => {
    const from = statsRef.current[name];
    statsRef.current = { ...statsRef.current, [name]: to };
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const value = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      setStats((s) => ({ ...s, [name]: value }));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const advance = useCallback(() => {
    if (!typingRef.current.done) {
      typingRef.current.finish();
      return;
    }
    const current = talkRef.current;
    if (!current) return;
    if (current.choices) {
      const pick = current.pick;
      const i = choiceRef.current;
      soundRef.current?.confirm();
      setTalk(null);
      pick?.(i);
      return;
    }
    soundRef.current?.select();
    if (current.at + 1 < current.list.length) {
      talkRef.current = { ...current, at: current.at + 1 };
      setTalkState(talkRef.current);
      return;
    }
    setTalk(null);
    current.then?.();
  }, [setTalk, soundRef]);

  // —— the Ctx: everything a chapter can do
  const makeCtx = useCallback(
    (token: number): Ctx => {
      const alive = () => token === session.current;
      const never = new Promise<never>(() => {});
      const ctx: Ctx = {
        step: () => stepRef.current,
        go: (next) => {
          if (!alive()) return;
          stepRef.current = next;
          setStep(next);
        },
        say: (lines) => {
          if (!alive()) return never;
          if (!lines.length) return Promise.resolve();
          return new Promise<void>((resolve) => setTalk({ list: lines, at: 0, then: resolve }));
        },
        choose: (line, options) => {
          if (!alive()) return never;
          return new Promise<number>((resolve) => setTalk({ list: [line], at: 0, choices: options, pick: resolve }));
        },
        open: <T,>(spec: ScreenSpec) => {
          if (!alive()) return never;
          return new Promise<T>((resolve) => {
            const show = (next: ScreenSpec) => setOverlay({ spec: next, resolve: resolve as (value: unknown) => void, id: Date.now() });
            // a reel is made from what's on screen right now
            if (spec.kind === "reel" && !spec.image) {
              const reel = spec;
              shots.current.push((image) => show({ ...reel, image }));
            } else show(spec);
          });
        },
        scene: async (setup) => {
          const w = world.current;
          if (!w || !alive()) return never;
          if (w.stage) {
            w.revealOut = w.time;
            await ctx.wait(620);
            if (!alive()) return never;
          }
          w.stage?.dispose();
          const room = buildRoom(setup);
          const stage = createStage(room, { lying: setup.lying, dog: setup.dog ?? false, actors: setup.actors, at: setup.at, heading: setup.heading, hero: setup.hero });
          stage.snapLook();
          w.stage = stage;
          w.revealOut = -1;
          w.revealFrom = w.time;
          w.revealMax = reachOf(room);
          bubblesRef.current = [];
          setBubbles([]);
          setDay(setup.day);
          setClock(setup.clock);
          setBanner(setup.banner ? { ...setup.banner, id: Date.now() } : null);
          setMode("play");
          await ctx.wait(setup.banner ? 1300 : 900);
        },
        stage: () => world.current!.stage!,
        wait: (ms) => {
          if (!alive()) return never;
          const w = world.current;
          return new Promise<void>((resolve) => waits.current.push({ at: (w?.time ?? 0) + ms / 1000, resolve }));
        },
        earn: (amount) => {
          if (!alive() || !amount) return;
          soundRef.current?.coin();
          setToast({ text: `+$${amount.toLocaleString("en-US")}`, id: Date.now() });
          animateStat("money", statsRef.current.money + amount);
        },
        stat: (name, value, ms) => {
          if (!alive()) return;
          animateStat(name, value, ms);
        },
        hearts: (who, value) => {
          if (!alive()) return;
          setHearts((h) => ({ ...h, [who]: value }));
          soundRef.current?.sparkle();
        },
        bubble: (target, text, ms = 2200) => {
          if (!alive()) return;
          const key = typeof target === "string" ? target : `p${target.x.toFixed(2)},${target.z.toFixed(2)}`;
          const rest = bubblesRef.current.filter((b) => b.key !== key);
          bubblesRef.current = text ? [...rest, { key, target, text, until: ms > 0 ? performance.now() + ms : 0 }] : rest;
          setBubbles(bubblesRef.current);
        },
        glint: () => {
          if (!alive()) return;
          setGlint((n) => n + 1);
        },
        sound: () => soundRef.current,
        checkpoint: (act) => {
          if (!alive()) return;
          const done = loadSave()?.done ?? [];
          writeSave({ chapter: chapterRef.current, act, done });
          setSaveState(loadSave());
        },
        minigame: () => {
          const w = world.current;
          if (!w || !alive()) return never;
          return new Promise((resolve) => {
            const game = createWingman({
              sound: () => soundRef.current,
              onDone: (result) => {
                window.setTimeout(() => {
                  const live = world.current;
                  if (!live || live.mini !== game) return;
                  live.mini = null;
                  game.dispose();
                  setMini(null);
                  // the room comes back the way rooms arrive
                  if (live.stage) live.revealMax = reachOf(live.stage.room);
                  live.revealOut = -1;
                  live.revealFrom = live.time;
                  if (alive()) resolve(result);
                }, 450);
              },
            });
            w.mini = game;
            w.revealOut = -1;
            w.revealFrom = w.time;
            w.revealMax = 0.62;
            setNear(null);
            setMini(game);
          });
        },
        end: () => {
          if (!alive()) return;
          const current = chapterRef.current;
          const done = Array.from(new Set([...(loadSave()?.done ?? []), current]));
          const next = nextOf(current);
          writeSave({ chapter: next ?? current, act: 0, done });
          setSaveState(loadSave());
          soundRef.current?.sting();
          setMode("end");
        },
      };
      return ctx;
    },
    [animateStat, setOverlay, setTalk, soundRef],
  );

  /** Runs a piece of a chapter, the player waiting while it does. */
  const run = useCallback((fn: (ctx: Ctx) => Promise<void> | void) => {
    const ctx = makeCtx(session.current);
    busy.current += 1;
    Promise.resolve()
      .then(() => fn(ctx))
      .catch((error) => console.error(error))
      .finally(() => {
        busy.current = Math.max(0, busy.current - 1);
      });
  }, [makeCtx]);

  const interact = useCallback(
    (id: string) => {
      const stage = world.current?.stage;
      if (!stage || busy.current) return;
      const spot = stage.spot(id);
      if (spot) stage.faceTowards(spot.at);
      stage.stop();
      run((ctx) => CHAPTERS[chapterRef.current].use(id, ctx));
    },
    [run],
  );

  const wake = useCallback(() => {
    const stage = world.current?.stage;
    if (!stage?.lying || busy.current) return;
    const chapter = CHAPTERS[chapterRef.current];
    if (chapter.wake) run((ctx) => chapter.wake!(ctx));
  }, [run]);

  // —— starting chapters
  const playAct = useCallback(
    (id: ChapterId, act: number) => {
      const chapter = CHAPTERS[id];
      const stats = chapter.acts[act].stats;
      statsRef.current = { money: stats.money, members: stats.members ?? 0, revenue: stats.revenue ?? 0, ready: stats.ready ?? 0, wins: stats.wins ?? 0 };
      setStats(statsRef.current);
      setHearts(stats.hearts ?? { john: 0, jerry: 0 });
      setTalk(null);
      setOverlay(null);
      setPaused(false);
      setIntro(null);
      writeSave({ chapter: id, act, done: loadSave()?.done ?? [] });
      setSaveState(loadSave());
      run((ctx) => chapter.acts[act].run(ctx));
    },
    [run, setOverlay, setTalk],
  );

  const startChapter = useCallback(
    (id: ChapterId, act = 0) => {
      session.current += 1;
      busy.current = 0;
      waits.current = [];
      chapterRef.current = id;
      setChapterId(id);
      stepRef.current = "";
      setStep("");
      setTalk(null);
      setOverlay(null);
      setChaptersOpen(false);
      bubblesRef.current = [];
      setBubbles([]);
      const w = world.current;
      if (w?.stage) {
        w.stage.dispose();
        w.stage = null;
      }
      if (w?.mini) {
        w.mini.dispose();
        w.mini = null;
      }
      setMini(null);
      setIntro({ chapter: id, lines: act === 0 ? CHAPTERS[id].intro : [], act });
      setMode("intro");
    },
    [setOverlay, setTalk],
  );

  const leaveTitle = useCallback(
    (then: () => void) => {
      if (live.current.leaving) return;
      soundRef.current?.confirm();
      setChaptersOpen(false);
      setLeaving(true);
      const w = world.current;
      if (w) w.revealOut = w.time;
      window.setTimeout(() => {
        setLeaving(false);
        then();
      }, 1100);
    },
    [soundRef],
  );

  const toTitle = useCallback(() => {
    soundRef.current?.select();
    session.current += 1;
    busy.current = 0;
    setPaused(false);
    setTalk(null);
    setOverlay(null);
    setMode("title");
    setMenu(0);
    setSaveState(loadSave());
    const w = world.current;
    if (w) {
      w.stage?.dispose();
      w.stage = null;
      w.mini?.dispose();
      w.mini = null;
      w.revealOut = -1;
      w.revealFrom = -1;
    }
    setMini(null);
  }, [setOverlay, setTalk, soundRef]);

  // nothing to continue once every chapter there is has been played
  const resumable = save && !(save.done.includes(save.chapter) && !nextOf(save.chapter));
  const menuItems = (resumable ? ["continue", "new", "chapters", "sound", "island"] : ["new", "chapters", "sound", "island"]) as Array<"continue" | "new" | "chapters" | "sound" | "island">;
  const choose = useCallback(
    (item: "continue" | "new" | "chapters" | "sound" | "island") => {
      if (item === "new") leaveTitle(() => startChapter("prologue", 0));
      else if (item === "continue") {
        const s = loadSave();
        if (s) leaveTitle(() => startChapter(s.chapter, s.act));
      } else if (item === "chapters") {
        soundRef.current?.select();
        setChaptersOpen((open) => !open);
      } else if (item === "sound") setMuted(!muted);
      else onQuit();
    },
    [leaveTitle, muted, onQuit, soundRef, startChapter],
  );

  // —— the clock in the HUD: a minute every second and a half, while playing
  useEffect(() => {
    if (mode !== "play" || paused || step === "wake") return;
    const id = window.setInterval(() => setClock((m) => m + 1), CLOCK_RATE);
    return () => window.clearInterval(id);
  }, [mode, paused, step]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 3200);
    return () => window.clearTimeout(id);
  }, [banner]);

  // expired bubbles go
  useEffect(() => {
    if (!bubbles.some((b) => b.until)) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      const kept = bubblesRef.current.filter((b) => !b.until || b.until > now);
      if (kept.length !== bubblesRef.current.length) {
        bubblesRef.current = kept;
        setBubbles(kept);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [bubbles]);

  // —— the world, drawn every frame, and the keys and the pointer
  const actions = useRef({ interact, advance, wake, choose, setPaused, setMenu, setChaptersOpen, setNear, setChoice });
  useEffect(() => {
    actions.current = { interact, advance, wake, choose, setPaused, setMenu, setChaptersOpen, setNear, setChoice };
  }, [interact, advance, wake, choose]);
  const items = useRef(menuItems);
  useEffect(() => {
    items.current = menuItems;
  });

  useEffect(() => {
    if (!started || !container.current || !canvas.current) return;
    const view = createView(container.current, canvas.current);
    const title = titleScene();
    const w: World = { view, title, stage: null, mini: null, time: 0, revealFrom: -1, revealOut: -1, revealMax: 0.4 };
    world.current = w;
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();
    let lastNear: string | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = live.current;
      if (s.paused) return;
      w.time += dt;
      const time = w.time;
      for (let i = waits.current.length - 1; i >= 0; i -= 1) {
        if (time >= waits.current[i].at) {
          const { resolve } = waits.current[i];
          waits.current.splice(i, 1);
          resolve();
        }
      }
      const tall = window.innerHeight > window.innerWidth;
      uniforms.uTime.value = time;
      uniforms.uCloud.value.set(time * 0.02, time * -0.012);

      const game = w.mini;
      if (game && s.mode === "play") {
        const night = game.night();
        uniforms.uNight.value = night;
        uniforms.uCloudAmount.value = 0.45;
        const k = Math.min(1, (time - w.revealFrom) / 1.2);
        uniforms.uReveal.value = k >= 1 ? 1 : w.revealMax * (1 - (1 - k) ** 2);
        game.update(dt, time);
        view.render({ scene: game.scene, ...game.look(tall) }, 15 + Math.round(7 * night));
        marker.current?.removeAttribute("data-shown");
        return;
      }

      const stage = w.stage;
      if ((s.mode === "play" || s.mode === "end") && stage) {
        const room = stage.room;
        uniforms.uNight.value = room.night;
        uniforms.uCloudAmount.value = room.clouds;
        // rooms arrive the way the island does, a pixel at a time from the middle
        if (w.revealOut >= 0) {
          const k = Math.min(1, (time - w.revealOut) / 0.6);
          uniforms.uReveal.value = w.revealMax * (1 - k) ** 1.5;
        } else {
          const k = Math.min(1, (time - w.revealFrom) / 1.4);
          uniforms.uReveal.value = k >= 1 ? 1 : w.revealMax * (1 - (1 - k) ** 2);
        }
        const frozen = busy.current > 0 || Boolean(talkRef.current) || Boolean(overlayRef.current) || s.mode === "end";
        let x = 0, y = 0;
        if (keys.has("arrowleft") || keys.has("a")) x -= 1;
        if (keys.has("arrowright") || keys.has("d")) x += 1;
        if (keys.has("arrowup") || keys.has("w")) y += 1;
        if (keys.has("arrowdown") || keys.has("s")) y -= 1;
        stage.update(dt, time, { x, y }, view.axes(), frozen, () => soundRef.current?.step());
        view.render({ scene: stage.scene, ...stage.look(tall), background: room.background }, 15 + Math.round(7 * room.night));
        // a picture of this frame, while the canvas still holds it
        if (shots.current.length && canvas.current) {
          const source = canvas.current;
          const head = view.project(stage.position.clone().setY(1.3));
          const rect = source.getBoundingClientRect();
          const sx = source.width / rect.width, sy = source.height / rect.height;
          const h = Math.min(source.height, source.width * (16 / 9)) * 0.62;
          const w = h * (9 / 16);
          const frame = container.current!.getBoundingClientRect();
          const cx = Math.max(w / 2, Math.min(source.width - w / 2, (head.x - (rect.left - frame.left)) * sx));
          const cy = Math.max(h / 2, Math.min(source.height - h / 2, (head.y - (rect.top - frame.top)) * sy));
          const out = document.createElement("canvas");
          out.width = Math.round(w);
          out.height = Math.round(h);
          const ctx2 = out.getContext("2d")!;
          ctx2.imageSmoothingEnabled = false;
          ctx2.drawImage(source, cx - w / 2, cy - h / 2, w, h, 0, 0, out.width, out.height);
          const url = out.toDataURL("image/png");
          for (const take of shots.current.splice(0)) take(url);
        }

        const arrived = uniforms.uReveal.value >= 1;
        const spot = frozen || !arrived ? null : stage.nearest(preferred());
        const label = stage.lying ? (arrived && !frozen ? "Wake up" : null) : spot ? spot.label : null;
        if (label !== lastNear) {
          lastNear = label;
          actions.current.setNear(label);
        }
        // the objective's marker, over where to go, until you're there
        const goal = CHAPTERS[chapterRef.current].targets?.[stepRef.current];
        const target = goal && !frozen && arrived && !stage.lying ? stage.spot(goal) : null;
        const pin = marker.current;
        if (pin) {
          const show = Boolean(target) && target?.id !== spot?.id;
          pin.toggleAttribute("data-shown", show);
          if (show && target) {
            const p = view.project(target.at.clone().setY(target.at.y + 1.0));
            pin.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
          }
        }
        const node = prompt.current;
        if (node && label) {
          const anchor = stage.lying ? ((room as Room & { bed?: Vector3 }).bed ?? stage.position).clone().setY(1.45) : spot!.at.clone().setY(spot!.at.y + 0.45);
          const p = view.project(anchor);
          node.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        }
        for (const b of bubblesRef.current) {
          const el = bubbleNodes.current.get(b.key);
          if (!el) continue;
          let point: Vector3 | null = null;
          if (typeof b.target !== "string") point = b.target;
          else if (b.target === "aiden") point = stage.position.clone().setY(2.25);
          else {
            const actor = stage.actor(b.target);
            if (actor) point = actor.pos.clone().setY(actor.rig.root.position.y + 2.15);
            else {
              const sp = stage.spot(b.target);
              if (sp) point = sp.at.clone().setY(sp.at.y + 0.55);
            }
          }
          if (!point) continue;
          const p = view.project(point);
          el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        }
      } else {
        uniforms.uNight.value = 0;
        uniforms.uCloudAmount.value = 1;
        // the title's island goes the way it came, from the edge in
        uniforms.uReveal.value = w.revealOut >= 0 ? Math.max(0, 1 - (time - w.revealOut) / 1.05) : 1;
        title.update(time, dt);
        view.render({ scene: title.scene, ...title.look(time, tall), background: title.background });
      }
    };
    raf = requestAnimationFrame(frame);

    const interactKey = (key: string) => key === "e" || key === " " || key === "enter";
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const s = live.current;
      const a = actions.current;
      if (key === "escape") {
        if (overlayRef.current) return;
        if (s.mode === "play") a.setPaused(!s.paused);
        else if (s.chaptersOpen) a.setChaptersOpen(false);
        return;
      }
      if (s.paused) return;
      if (s.mode === "title" && !s.leaving) {
        const list = items.current;
        if (key === "arrowdown" || key === "s") a.setMenu((s.menu + 1) % list.length);
        else if (key === "arrowup" || key === "w") a.setMenu((s.menu + list.length - 1) % list.length);
        else if (key === "enter" || key === " ") a.choose(list[s.menu]);
        if (key.startsWith("arrow") || key === " ") event.preventDefault();
        return;
      }
      if (s.mode !== "play" || overlayRef.current) return;
      if (key.startsWith("arrow") || key === " ") event.preventDefault();
      if (w.mini) {
        if (interactKey(key) && !event.repeat) {
          event.preventDefault();
          w.mini.press();
        }
        return;
      }
      const current = talkRef.current;
      if (current?.choices && typingRef.current.done) {
        const n = current.choices.length;
        if (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d") {
          choiceRef.current = (choiceRef.current + 1) % n;
          a.setChoice(choiceRef.current);
          soundRef.current?.select();
          return;
        }
        if (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a") {
          choiceRef.current = (choiceRef.current + n - 1) % n;
          a.setChoice(choiceRef.current);
          soundRef.current?.select();
          return;
        }
      }
      keys.add(key);
      if (!interactKey(key) || event.repeat) return;
      if (talkRef.current) a.advance();
      else if (busy.current) return;
      else if (w.stage?.lying) {
        if (uniforms.uReveal.value >= 1) a.wake();
      } else {
        const spot = w.stage?.nearest(preferred());
        if (spot) a.interact(spot.id);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const onBlur = () => keys.clear();

    // a click or a tap: on something, go and use it; on the floor, go there
    const onPointerDown = (event: PointerEvent) => {
      const s = live.current;
      if (s.mode !== "play" || s.paused || overlayRef.current) return;
      if ((event.target as HTMLElement).closest("button, a, [data-ui]")) return;
      if (w.mini) {
        w.mini.press();
        return;
      }
      const a = actions.current;
      const stage = w.stage;
      if (!stage) return;
      if (talkRef.current) return a.advance();
      if (busy.current) return;
      if (stage.lying) {
        if (uniforms.uReveal.value >= 1) a.wake();
        return;
      }
      const rect = container.current!.getBoundingClientRect();
      const px = event.clientX - rect.left, py = event.clientY - rect.top;
      let hit: ReturnType<Stage["spots"]>[number] | null = null;
      let best = 46;
      for (const spot of stage.spots()) {
        const p = view.project(spot.at);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < best) {
          best = d;
          hit = spot;
        }
      }
      if (hit) {
        const target = hit;
        stage.walkTo(target.at, () => a.interact(target.id), target.reach * 0.85);
        return;
      }
      const point = view.ground(event.clientX, event.clientY);
      if (point) stage.walkTo(point);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const host = container.current;
    host.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      host.removeEventListener("pointerdown", onPointerDown);
      session.current += 1;
      w.stage?.dispose();
      w.mini?.dispose();
      title.dispose();
      view.dispose();
      world.current = null;
      // hand the island's uniforms back as they were
      uniforms.uReveal.value = 1;
      uniforms.uCloudAmount.value = 1;
      uniforms.uNight.value = 0;
    };
  }, [started, soundRef, preferred]);

  // for jumping to a moment while working on it
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __game: unknown }).__game = {
      start: (id: ChapterId, act = 0) => startChapter(id, act),
      play: (id: ChapterId, act = 0) => {
        // a clean slate, the way starting a chapter makes one
        session.current += 1;
        busy.current = 0;
        waits.current = [];
        const w = world.current;
        if (w?.mini) {
          w.mini.dispose();
          w.mini = null;
          setMini(null);
        }
        chapterRef.current = id;
        setChapterId(id);
        playAct(id, act);
      },
      step: (next: string) => {
        stepRef.current = next;
        setStep(next);
      },
      use: (id: string) => interact(id),
      ctx: () => makeCtx(session.current),
      mini: () => world.current?.mini ?? null,
      looks: LOOKS,
    };
  }, [interact, makeCtx, playAct, startChapter]);

  const projectPoint = useCallback((point: Vector3) => world.current?.view.project(point) ?? { x: -999, y: -999 }, []);

  // a tap on the prompt itself works too
  const tapPrompt = () => {
    const stage = world.current?.stage;
    if (!stage) return;
    if (stage.lying) return wake();
    const spot = stage.nearest(preferred());
    if (spot) interact(spot.id);
  };

  const chapter = CHAPTERS[chapterId];
  const line = talk ? talk.list[talk.at] : null;
  const hours = Math.floor(clock / 60) % 24;
  const time = `${((hours + 11) % 12) + 1}:${String(clock % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  const done = save?.done ?? [];
  const open = (id: ChapterId) => id === "prologue" || done.includes(id) || done.includes(ORDER[ORDER.indexOf(id) - 1]);
  const objective = chapter.objectives[step] ?? "";

  return (
    <div ref={container} className={styles.game} data-phase={phase} data-screen={mode} data-leaving={leaving || undefined} data-talking={talk ? "" : undefined}>
      <canvas ref={canvas} className={styles.canvas} aria-label="Aiden: Life of a Handsome Entrepreneur" />

      {/* —— the boot */}
      <div className={styles.splash} aria-hidden={phase !== "splash"}>
        <span className={styles.splashName}>Aiden Guan</span>
        <small>presents</small>
      </div>

      {/* —— the title screen */}
      {mode === "title" ? (
        <div className={styles.title}>
          <Logo size="xl" className={styles.titleLogo} />
          <nav className={styles.menu} aria-label="Main menu" data-shown={phase === "ready" || undefined}>
            {menuItems.map((item, i) => (
              <button
                key={item}
                type="button"
                className={styles.menuItem}
                data-on={menu === i || undefined}
                disabled={leaving}
                onPointerEnter={() => setMenu(i)}
                onClick={() => choose(item)}
              >
                {item === "continue" ? (
                  <>
                    Continue
                    <small>
                      {CHAPTERS[save!.chapter].number} · {CHAPTERS[save!.chapter].title}
                    </small>
                  </>
                ) : item === "new" ? (
                  "New game"
                ) : item === "chapters" ? (
                  "Chapters"
                ) : item === "sound" ? (
                  muted ? "Sound: off" : "Sound: on"
                ) : (
                  "Back to the island"
                )}
              </button>
            ))}
          </nav>
          <p className={styles.version} data-shown={phase === "ready" || undefined}>
            v1.2 · Life, so far
          </p>
          {chaptersOpen ? (
            <div className={styles.chapters} data-ui="">
              <header>
                <h2>Chapters</h2>
                <button type="button" className={styles.close} onClick={() => setChaptersOpen(false)} aria-label="Close chapters">
                  ×
                </button>
              </header>
              <ol>
                {ORDER.map((id) => {
                  const c = CHAPTERS[id];
                  const playable = open(id);
                  return (
                    <li key={id} data-open={playable || undefined}>
                      <span className={styles.chapterNumber}>{c.number}</span>
                      <strong>{c.title}</strong>
                      <span>{c.line}</span>
                      {playable ? (
                        <button type="button" className={styles.chapterPlay} onClick={() => leaveTitle(() => startChapter(id, 0))}>
                          {done.includes(id) ? "Replay" : "Play"}
                        </button>
                      ) : (
                        <em>Finish the one before</em>
                      )}
                    </li>
                  );
                })}
                {COMING.map((c) => (
                  <li key={c.title}>
                    <span className={styles.chapterNumber}>{c.number}</span>
                    <strong>{c.title}</strong>
                    <span>{c.line}</span>
                    <em>Coming soon</em>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* —— before a chapter: a few lines on paper, its card */}
      {mode === "intro" && intro ? (
        <Intro
          key={`${intro.chapter}-${intro.act}`}
          lines={intro.lines}
          number={CHAPTERS[intro.chapter].number}
          title={CHAPTERS[intro.chapter].title}
          resumed={intro.act > 0}
          onDone={() => playAct(intro.chapter, intro.act)}
          soundRef={soundRef}
        />
      ) : null}

      {/* —— playing */}
      {mode === "play" || mode === "end" ? (
        <>
          <div className={styles.hud} data-hidden={mode === "end" || Boolean(mini) || undefined}>
            <div className={styles.card} data-ui="">
              <div className={styles.when}>
                <svg viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
                  <path d="M4 0h2v2H4zM4 8h2v2H4zM0 4h2v2H0zM8 4h2v2H8zM3 3h4v4H3z" />
                </svg>
                <span>{day}</span>
                <b>{time}</b>
              </div>
              {objective ? (
                <div className={styles.objective} key={step}>
                  <i aria-hidden="true" />
                  {objective}
                </div>
              ) : null}
              {chapter.hud.ready && stats.ready < 100 ? (
                <div className={styles.goal} data-ready="">
                  <span>
                    {chapter.hud.ready} <b>{stats.ready}%</b>
                  </span>
                  <i style={{ width: `${Math.min(100, stats.ready)}%` }} />
                </div>
              ) : null}
              {chapter.hud.goal ? (
                <div className={styles.goal}>
                  <span>
                    Revenue <b>${stats.revenue.toLocaleString("en-US")}</b>
                  </span>
                  <small>of ${chapter.hud.goal.toLocaleString("en-US")}</small>
                  <i style={{ width: `${Math.min(100, (stats.revenue / chapter.hud.goal) * 100).toFixed(1)}%` }} />
                </div>
              ) : null}
            </div>
            <div className={styles.right} data-ui="">
              {chapter.hud.hearts ? (
                <div className={styles.hearts}>
                  {(["john", "jerry"] as const).map((who) => (
                    <span key={who} title={SPEAKERS[who].name}>
                      <img src={faceOf(who)} alt={SPEAKERS[who].name} />
                      <b key={hearts[who]}>{[0, 1, 2, 3, 4].map((n) => (n < hearts[who] ? "♥" : "♡")).join("")}</b>
                    </span>
                  ))}
                </div>
              ) : chapter.hud.money === false ? null : (
                <div className={styles.money}>
                  <span>$</span>
                  {stats.money.toLocaleString("en-US")}
                  {toast ? (
                    <em key={toast.id} className={styles.toast}>
                      {toast.text}
                    </em>
                  ) : null}
                </div>
              )}
              {chapter.hud.members ? (
                <div className={styles.members} title={typeof chapter.hud.members === "string" ? chapter.hud.members : "Members"}>
                  <small>{typeof chapter.hud.members === "string" ? chapter.hud.members : "Members"}</small>
                  <span>{stats.members.toLocaleString("en-US")}</span>
                </div>
              ) : null}
              {chapter.hud.wins && stats.wins > 0 ? (
                <div className={styles.members} title="First places" key={`w${stats.wins}`} data-pop={stats.wins > 0 || undefined}>
                  <small>1st places</small>
                  <span>{"🏆".repeat(stats.wins) || "—"}</span>
                </div>
              ) : null}
              <div className={styles.handsome} key={glint} data-glint={glint > 0 || undefined} title="Handsome">
                <small>Handsome</small>
                <span aria-label="Maxed out">✦✦✦✦✦</span>
              </div>
              <button type="button" className={styles.pause} onClick={() => setPaused(true)} aria-label="Pause">
                <svg viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
                  <path d="M2 2h2v6H2zM6 2h2v6H6z" />
                </svg>
              </button>
            </div>
          </div>

          {banner ? (
            <div className={styles.banner} key={banner.id} aria-live="polite">
              <strong>{banner.place}</strong>
              <span>{banner.time}</span>
            </div>
          ) : null}

          {bubbles.map((b) => (
            <div
              key={b.key}
              className={styles.bubble}
              ref={(node) => {
                if (node) bubbleNodes.current.set(b.key, node);
                else bubbleNodes.current.delete(b.key);
              }}
              aria-hidden="true"
            >
              {b.text}
            </div>
          ))}
          <div ref={marker} className={styles.marker} aria-hidden="true">
            <i />
          </div>
          <button ref={prompt} type="button" className={styles.prompt} data-shown={near || undefined} onClick={tapPrompt} tabIndex={-1}>
            {touch ? <span className={styles.tap} aria-hidden="true" /> : <kbd>E</kbd>}
            {near}
          </button>

          {mini ? <WingmanHud game={mini} project={projectPoint} touch={touch} onPause={() => setPaused(true)} /> : null}

          {line ? (
            <Dialogue
              key={`${talk!.list.length}-${talk!.at}-${line.text}`}
              line={line}
              face={faceOf(line.who)}
              soundRef={soundRef}
              typingRef={typingRef}
              onNext={advance}
              choices={talk!.choices}
              selected={choice}
              faceOf={faceOf}
              onPick={(i) => {
                choiceRef.current = i;
                setChoice(i);
                advance();
              }}
              onHover={(i) => {
                choiceRef.current = i;
                setChoice(i);
              }}
            />
          ) : null}

          {overlay ? (
            <Screen
              key={overlay.id}
              spec={overlay.spec}
              soundRef={soundRef}
              touch={touch}
              photo={photos.aiden}
              onDone={(result) => {
                const current = overlayRef.current;
                if (!current) return;
                setOverlay(null);
                current.resolve(result);
              }}
            />
          ) : null}

          {mode === "end" ? (
            <div className={styles.end} data-ui="">
              <div className={styles.endCard}>
                <p className={styles.endKicker}>{chapter.end.tbc ? `${chapter.number} · to be continued` : `${chapter.number} complete`}</p>
                <h2>{chapter.end.title}</h2>
                <dl>
                  {chapter.end.stats.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.next}>
                  <small>Next · {chapter.end.next.number}</small>
                  <strong>{chapter.end.next.title}</strong>
                  <span>
                    {chapter.end.next.line}
                    {chapter.end.next.chapter || chapter.end.tbc ? "" : " Coming soon: come back for it."}
                  </span>
                </div>
                <div className={styles.endButtons}>
                  {chapter.end.next.chapter ? (
                    <button type="button" className={styles.primary} onClick={() => startChapter(chapter.end.next.chapter!, 0)}>
                      Play {chapter.end.next.number}
                    </button>
                  ) : null}
                  <button type="button" className={chapter.end.next.chapter ? styles.secondary : styles.primary} onClick={toTitle}>
                    Title screen
                  </button>
                  <button type="button" className={styles.secondary} onClick={onQuit}>
                    Back to the island
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {paused ? (
            <div className={styles.paused} data-ui="">
              <div className={styles.pauseCard}>
                <h2>Paused</h2>
                <p className={styles.saved}>Progress saves as you go. Come back any time.</p>
                <button type="button" className={styles.primary} onClick={() => setPaused(false)}>
                  Resume
                </button>
                <button type="button" className={styles.secondary} onClick={() => setMuted(!muted)}>
                  {muted ? "Sound: off" : "Sound: on"}
                </button>
                <button type="button" className={styles.secondary} onClick={toTitle}>
                  Title screen
                </button>
                <button type="button" className={styles.secondary} onClick={onQuit}>
                  Back to the island
                </button>
              </div>
            </div>
          ) : null}

          {mode === "play" && chapterId === "prologue" && step === "wake" && !talk ? (
            <p className={styles.controls}>{touch ? "Tap to walk · tap things to use them" : "WASD or arrows to walk · E to use · or just click"}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Dialogue({
  line,
  face,
  soundRef,
  typingRef,
  onNext,
  choices,
  selected,
  faceOf,
  onPick,
  onHover,
}: {
  line: Line;
  face?: string;
  soundRef: RefObject<Sound | null>;
  typingRef: RefObject<{ done: boolean; finish: () => void }>;
  onNext: () => void;
  choices?: Array<{ label: string; who?: string }>;
  selected: number;
  faceOf: (who: string | undefined) => string | undefined;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
}) {
  const [shown, setShown] = useState(0);
  const length = line.text.length;
  const speaker = SPEAKERS[line.who] ?? SPEAKERS.note;
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n = Math.min(length, n + 1);
      setShown(n);
      if (n % 3 === 1 && line.who !== "note") soundRef.current?.blip(speaker.pitch + (n % 2));
      if (n >= length) {
        window.clearInterval(id);
        typingRef.current.done = true;
      }
    }, 22);
    typingRef.current = {
      done: false,
      finish: () => {
        window.clearInterval(id);
        n = length;
        setShown(length);
        typingRef.current.done = true;
      },
    };
    return () => window.clearInterval(id);
  }, [line, length, soundRef, typingRef, speaker.pitch]);

  const typed = shown >= length;
  return (
    <div
      className={styles.dialogue}
      data-ui=""
      data-who={line.who === "note" ? "note" : undefined}
      data-choosing={choices && typed ? "" : undefined}
      onClick={choices && typed ? undefined : onNext}
      role="dialog"
      aria-live="polite"
    >
      {line.who !== "note" ? <div className={styles.face}>{face ? <img src={face} alt="" /> : <span className={styles.faceIcon} />}</div> : null}
      <div className={styles.speech}>
        {speaker.name ? (
          <span className={styles.name} data-tag={speaker.tag}>
            {speaker.name}
          </span>
        ) : null}
        <p>
          {line.text.slice(0, shown)}
          <span className={styles.rest}>{line.text.slice(shown)}</span>
        </p>
        {choices && typed ? (
          <div className={styles.choices} role="listbox">
            {choices.map((c, i) => (
              <button
                key={c.label}
                type="button"
                role="option"
                aria-selected={selected === i}
                className={styles.choice}
                data-on={selected === i || undefined}
                onPointerEnter={() => onHover(i)}
                onClick={(event) => {
                  event.stopPropagation();
                  onPick(i);
                }}
              >
                {c.who ? <img src={faceOf(c.who)} alt={SPEAKERS[c.who]?.name ?? ""} /> : null}
                <span>
                  {c.who ? <b>{SPEAKERS[c.who]?.name}</b> : null}
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {choices ? null : (
        <span className={styles.more} data-shown={typed || undefined} aria-hidden="true">
          ▼
        </span>
      )}
    </div>
  );
}

function Intro({
  lines,
  number,
  title,
  resumed,
  onDone,
  soundRef,
}: {
  lines: string[];
  number: string;
  title: string;
  resumed: boolean;
  onDone: () => void;
  soundRef: RefObject<Sound | null>;
}) {
  const [at, setAt] = useState(0);
  const [card, setCard] = useState(false);
  const done = useRef(onDone);
  const called = useRef(false);
  useEffect(() => {
    done.current = onDone;
  });
  const finish = useCallback(() => {
    if (called.current) return;
    called.current = true;
    done.current();
  }, []);
  useEffect(() => {
    const timers: number[] = [];
    const per = 1350;
    lines.forEach((_, i) => timers.push(window.setTimeout(() => setAt(i + 1), 500 + i * per)));
    const cardAt = lines.length ? 500 + lines.length * per + 400 : 300;
    timers.push(window.setTimeout(() => setCard(true), cardAt));
    timers.push(window.setTimeout(() => soundRef.current?.sting(), cardAt + 100));
    timers.push(window.setTimeout(finish, cardAt + 2500));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [lines, soundRef, finish]);
  return (
    <div className={styles.intro} data-ui="" onClick={finish} data-card={card || undefined}>
      <div className={styles.introLines}>
        {lines.map((text, i) => (
          <p key={text} data-shown={at > i || undefined}>
            {text}
          </p>
        ))}
      </div>
      <div className={styles.chapterCard}>
        <small>{resumed ? `${number} · continued` : number}</small>
        <strong>{title}</strong>
      </div>
      <span className={styles.skip}>click to skip</span>
    </div>
  );
}
