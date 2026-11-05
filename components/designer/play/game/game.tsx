"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import { setMuted, useMuted } from "@/lib/riffle";
import { uniforms } from "../../scene/shared";
import { Logo } from "../logo";
import type { Sound } from "../sound";
import { CHAPTERS, nextOf } from "./chapters";
import { FEATS, type FeatId } from "./chapters/feats";
import { SPEAKERS, type ChapterId, type Ctx, type Emote, type SceneSetup } from "./chapters/types";
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
import { DEFAULT_SETTINGS, findFeat, loadFeats, loadSave, loadSettings, reach, writeSave, writeSettings, type Save, type Settings } from "./save";
import { pauseScreens } from "./screen-kit";
import { Screen, type ScreenSpec } from "./screens";
import { Banner, Curtain, EndCard, Intro, MomentCard } from "./shell/cards";
import { Dialogue, type Talk, type Typing } from "./shell/dialogue";
import { Hud, type StatName, type StatValues } from "./shell/hud";
import { ChaptersPanel, Pause, SettingsPanel, TitleMenu, type MenuItem } from "./shell/menus";
import { prefersReduced, useLingering } from "./shell/motion";
import { DIAMOND, Pixels, TAP } from "./shell/pixels";
import { createShake, type Shake } from "./shell/shake";
import { BubbleView, centre, EMOTE_MS, EmoteView } from "./shell/world";
import world from "./shell/world.module.css";
import { createStage, type Stage } from "./stage";
import { titleScene, type Title } from "./title";
import { createView, type View } from "./view";
import { createWingman, type Wingman } from "./wingman";
import { WingmanHud } from "./wingman-hud";
import styles from "./game.module.css";

// Aiden: Life of a Handsome Entrepreneur. The title screen, the chapters,
// and everything the chapters are told through: the HUD, the dialogue (and
// its choices), the laptop and the phone, the cards that open and close
// each chapter, the moments, and the sheet of paper that comes down between
// places. The world is drawn by view.ts the way the island is; all of the
// reading is plain HTML on top (shell/). Chapters are scripts (chapters/*.ts)
// written against the Ctx made here.

export type GamePhase = "off" | "splash" | "title" | "ready";
type Mode = "title" | "intro" | "play" | "end";
type Overlay = { spec: ScreenSpec; resolve: (value: unknown) => void; id: number };
type Bubble = { key: string; target: string | Vector3; text: string; until: number };
type EmoteMark = { id: number; who: string; kind: Emote };
type World = { view: View; title: Title; stage: Stage | null; mini: Wingman | null; shake: Shake; time: number; revealFrom: number; revealOut: number; revealMax: number };
type Panel = "chapters" | "settings" | null;
type IntroCard = { chapter: ChapterId; lines: string[]; act: number; leaving: boolean };

const CLOCK_RATE = 1500;
/** How long a moment's card stays up before it slides away. */
const MOMENT_MS = 4400;
/** From the head's pivot to the top of the hair, before the figure is scaled. */
const HEAD_TOP = 0.72;

const STATS: StatValues = {
  money: { v: 0, ms: 900 },
  members: { v: 0, ms: 900 },
  revenue: { v: 0, ms: 900 },
  ready: { v: 0, ms: 900 },
  wins: { v: 0, ms: 900 },
};

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

/** What the current step points at: the chapter's own say, or its list. */
function targetOf(id: ChapterId, step: string) {
  const chapter = CHAPTERS[id];
  return chapter.target?.(step) ?? chapter.targets?.[step];
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
  const promptBody = useRef<HTMLSpanElement>(null);
  const promptKey = useRef<HTMLElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const bubbleNodes = useRef(new Map<string, HTMLElement>());
  const emoteNodes = useRef(new Map<number, HTMLElement>());
  const worldRef = useRef<World | null>(null);
  const typingRef = useRef<Typing>({ done: true, finish: () => {} });
  const session = useRef(0);
  const busy = useRef(0);
  const waits = useRef<Array<{ at: number; resolve: () => void }>>([]);
  const stepRef = useRef("");
  const talkRef = useRef<Talk | null>(null);
  const talkSeq = useRef(0);
  const overlayRef = useRef<Overlay | null>(null);
  const choiceRef = useRef(0);
  const confirmingRef = useRef<number | null>(null);
  const chapterRef = useRef<ChapterId>("prologue");
  /** What the current step is about: used first when several things are in reach. */
  const preferred = useCallback(() => targetOf(chapterRef.current, stepRef.current) ?? stepRef.current, []);
  const bubblesRef = useRef<Bubble[]>([]);
  const emotesRef = useRef<EmoteMark[]>([]);
  const emoteSeq = useRef(0);
  const momentQueue = useRef<FeatId[]>([]);
  const momentUp = useRef(false);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  // asks for a picture of the next frame, framed on Aiden (a reel's footage)
  const shots = useRef<Array<(url: string) => void>>([]);
  const statsRef = useRef<Record<StatName, number>>({ money: 0, members: 0, revenue: 0, ready: 0, wins: 0 });

  const [mode, setMode] = useState<Mode>("title");
  const [chapterId, setChapterId] = useState<ChapterId>("prologue");
  const [intro, setIntro] = useState<IntroCard | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(0);
  const [step, setStep] = useState("");
  const [talk, setTalkState] = useState<Talk | null>(null);
  const [choice, setChoice] = useState(0);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [overlay, setOverlayState] = useState<Overlay | null>(null);
  const [stats, setStats] = useState<StatValues>(STATS);
  const [statEpoch, setStatEpoch] = useState(0);
  const [hearts, setHearts] = useState({ john: 0, jerry: 0 });
  const [day, setDay] = useState("");
  const [clock, setClock] = useState(7 * 60);
  const [banner, setBanner] = useState<{ place: string; time: string; id: number } | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [emotes, setEmotes] = useState<EmoteMark[]>([]);
  const [glint, setGlint] = useState(0);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [touch, setTouch] = useState(false);
  const [save, setSaveState] = useState<Save | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [found, setFound] = useState<Record<string, number>>({});
  const [moment, setMoment] = useState<{ id: FeatId; key: number } | null>(null);
  const [curtain, setCurtain] = useState<"down" | "up" | null>(null);
  const [mini, setMini] = useState<Wingman | null>(null);
  // a new game over a save asks once more before starting over
  const [confirmNew, setConfirmNew] = useState(false);
  // the controls hint stays up until you've walked somewhere
  const [moved, setMoved] = useState(false);
  const muted = useMuted();
  const started = phase !== "off";
  const live = useRef({ mode, paused, panel, menu, leaving, phase });

  useEffect(() => {
    live.current = { mode, paused, panel, menu, leaving, phase };
  });

  // pausing holds the screens' clocks and keys, and the music
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
    pauseScreens(paused);
    if (mode !== "play") return;
    soundRef.current?.music(!paused);
  }, [paused, mode, soundRef]);

  useEffect(() => {
    const coarse = matchMedia("(pointer: coarse)");
    const sync = () => setTouch(coarse.matches);
    coarse.addEventListener("change", sync);
    const id = window.setTimeout(() => {
      sync();
      setSaveState(loadSave());
      const kept = loadSettings();
      settingsRef.current = kept;
      setSettings(kept);
      setFound(loadFeats());
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
  // a closing box keeps its last state (the answer picked) while it goes;
  // only the next exchange starts fresh
  const setTalk = useCallback((next: Omit<Talk, "id"> | null) => {
    const value = next ? { ...next, id: (talkSeq.current += 1) } : null;
    talkRef.current = value;
    setTalkState(value);
    if (!value) return;
    choiceRef.current = 0;
    setChoice(0);
    confirmingRef.current = null;
    setConfirming(null);
  }, []);

  // the room's wall clocks follow the HUD's
  useEffect(() => {
    worldRef.current?.stage?.room.setTime?.(clock);
  }, [clock]);

  // who is talking, so the stage can turn heads towards them and animate them
  useEffect(() => {
    const stage = worldRef.current?.stage;
    if (!stage) return;
    // the line too, so mouths move about as long as the words take to type out
    const line = talk?.list[talk.at];
    stage.speaking(line?.who ?? null, line?.text);
  }, [talk]);

  const setOverlay = useCallback((next: Overlay | null) => {
    overlayRef.current = next;
    setOverlayState(next);
  }, []);

  /** A stat's new value; the HUD counts its way there over `ms`. */
  const animateStat = useCallback((name: StatName, to: number, ms = 900) => {
    statsRef.current = { ...statsRef.current, [name]: to };
    setStats((s) => ({ ...s, [name]: { v: to, ms } }));
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    settingsRef.current = next;
    setSettings(next);
    writeSettings(next);
    if (!next.shake) worldRef.current?.shake.clear();
  }, []);

  // —— moments: a card the first time each is found, one after another
  const showMoment = useCallback(() => {
    const id = momentQueue.current.shift();
    momentUp.current = Boolean(id);
    if (!id) return setMoment(null);
    setMoment({ id, key: Date.now() });
    soundRef.current?.moment();
  }, [soundRef]);
  const dismissMoment = useCallback(() => {
    setMoment(null);
    // the next one waits for this one to slide away
    window.setTimeout(showMoment, 380);
  }, [showMoment]);
  useEffect(() => {
    if (!moment) return;
    const id = window.setTimeout(dismissMoment, MOMENT_MS);
    return () => window.clearTimeout(id);
  }, [moment, dismissMoment]);

  const shownAt = useRef(0);
  const quietUntil = useRef(0);
  const markChoices = useCallback(() => {
    shownAt.current = performance.now();
  }, []);
  const advance = useCallback(() => {
    if (!typingRef.current.done) {
      typingRef.current.finish();
      return;
    }
    const current = talkRef.current;
    if (!current) return;
    if (current.choices) {
      if (performance.now() - shownAt.current < 320 || confirmingRef.current !== null) return;
      const pick = current.pick;
      const i = choiceRef.current;
      soundRef.current?.confirm();
      // the pick lands in the box for a beat before the box goes
      confirmingRef.current = i;
      setConfirming(i);
      window.setTimeout(
        () => {
          if (talkRef.current !== current) return;
          setTalk(null);
          pick?.(i);
        },
        prefersReduced() ? 120 : 260,
      );
      return;
    }
    soundRef.current?.select();
    if (current.at + 1 < current.list.length) {
      talkRef.current = { ...current, at: current.at + 1 };
      setTalkState(talkRef.current);
      return;
    }
    setTalk(null);
    quietUntil.current = performance.now() + 260;
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
          const w = worldRef.current;
          if (!w || !alive()) return never;
          if (w.stage) {
            w.revealOut = w.time;
            await ctx.wait(560);
            if (!alive()) return never;
          }
          w.stage?.dispose();
          w.shake.clear();
          const room = buildRoom(setup);
          const stage = createStage(room, { lying: setup.lying, dog: setup.dog ?? false, actors: setup.actors, at: setup.at, heading: setup.heading, hero: setup.hero });
          // wall clocks in the room show the scene's time from the first frame
          room.setTime?.(setup.clock);
          stage.snapLook();
          w.stage = stage;
          w.revealOut = -1;
          w.revealFrom = w.time;
          w.revealMax = reachOf(room);
          bubblesRef.current = [];
          setBubbles([]);
          emotesRef.current = [];
          setEmotes([]);
          setDay(setup.day);
          setClock(setup.clock);
          setBanner(setup.banner ? { ...setup.banner, id: Date.now() } : null);
          soundRef.current?.scene(chapterRef.current, setup.id, setup.night);
          setMode("play");
          await ctx.wait(setup.banner ? 1300 : 900);
        },
        stage: () => worldRef.current!.stage!,
        wait: (ms) => {
          if (!alive()) return never;
          const w = worldRef.current;
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
        // a hit: the camera takes it, unless the player would rather it didn't
        shake: (strength = 0.3) => {
          if (!alive() || !settingsRef.current.shake || prefersReduced()) return;
          worldRef.current?.shake.add(strength);
        },
        feat: (id) => {
          if (!alive() || !(id in FEATS) || !findFeat(id)) return;
          setFound(loadFeats());
          momentQueue.current.push(id);
          if (!momentUp.current) showMoment();
        },
        emote: (who, kind) => {
          if (!alive()) return;
          const id = (emoteSeq.current += 1);
          emotesRef.current = [...emotesRef.current.filter((e) => e.who !== who), { id, who, kind }];
          setEmotes(emotesRef.current);
          soundRef.current?.blip(kind === "!" ? 14 : kind === "?" ? 8 : kind === "heart" ? 12 : 4);
          window.setTimeout(() => {
            if (!emotesRef.current.some((e) => e.id === id)) return;
            emotesRef.current = emotesRef.current.filter((e) => e.id !== id);
            setEmotes(emotesRef.current);
          }, EMOTE_MS);
        },
        sound: () => soundRef.current,
        checkpoint: (act) => {
          if (!alive()) return;
          reach(chapterRef.current, act);
          setSaveState(loadSave());
        },
        minigame: () => {
          const w = worldRef.current;
          if (!w || !alive()) return never;
          return new Promise((resolve) => {
            const game = createWingman({
              sound: () => soundRef.current,
              onDone: (result) => {
                window.setTimeout(() => {
                  const live = worldRef.current;
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
          const next = nextOf(current);
          reach(next ?? current, next ? 0 : CHAPTERS[current].acts.length - 1, [current]);
          setSaveState(loadSave());
          soundRef.current?.sting();
          setMode("end");
        },
      };
      return ctx;
    },
    [animateStat, setOverlay, setTalk, showMoment, soundRef],
  );

  /** Runs a piece of a chapter, the player waiting while it does. */
  const run = useCallback(
    (fn: (ctx: Ctx) => Promise<void> | void) => {
      const ctx = makeCtx(session.current);
      busy.current += 1;
      Promise.resolve()
        .then(() => fn(ctx))
        .catch((error) => console.error(error))
        .finally(() => {
          busy.current = Math.max(0, busy.current - 1);
        });
    },
    [makeCtx],
  );

  const interact = useCallback(
    (id: string) => {
      const stage = worldRef.current?.stage;
      if (!stage || busy.current || performance.now() < quietUntil.current) return;
      const spot = stage.spot(id);
      if (spot) stage.faceTowards(spot.at);
      stage.stop();
      run((ctx) => CHAPTERS[chapterRef.current].use(id, ctx));
    },
    [run],
  );

  const wake = useCallback(() => {
    const stage = worldRef.current?.stage;
    if (!stage?.lying || busy.current) return;
    const chapter = CHAPTERS[chapterRef.current];
    if (chapter.wake) run((ctx) => chapter.wake!(ctx));
  }, [run]);

  // —— the sheet: down over the screen, a change behind it, and up again
  // (or left down, when what comes next is written on it)
  const cover = useCallback(
    (then: () => void, lift = true) => {
      const reduced = prefersReduced();
      setCurtain("down");
      soundRef.current?.whoosh(0.45, false, 0.05);
      window.setTimeout(
        () => {
          then();
          if (!lift) return setCurtain(null);
          setCurtain("up");
          window.setTimeout(() => setCurtain(null), reduced ? 260 : 520);
        },
        reduced ? 220 : 470,
      );
    },
    [soundRef],
  );

  // —— starting chapters
  const playAct = useCallback(
    (id: ChapterId, act: number) => {
      const chapter = CHAPTERS[id];
      act = Math.max(0, Math.min(chapter.acts.length - 1, act));
      const stats = chapter.acts[act].stats;
      statsRef.current = { money: stats.money, members: stats.members ?? 0, revenue: stats.revenue ?? 0, ready: stats.ready ?? 0, wins: stats.wins ?? 0 };
      const at = statsRef.current;
      setStats({ money: { v: at.money, ms: 0 }, members: { v: at.members, ms: 0 }, revenue: { v: at.revenue, ms: 0 }, ready: { v: at.ready, ms: 0 }, wins: { v: at.wins, ms: 0 } });
      setStatEpoch((n) => n + 1);
      setHearts(stats.hearts ?? { john: 0, jerry: 0 });
      setTalk(null);
      setOverlay(null);
      setPaused(false);
      reach(id, act);
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
      setPanel(null);
      setPaused(false);
      bubblesRef.current = [];
      setBubbles([]);
      emotesRef.current = [];
      setEmotes([]);
      const w = worldRef.current;
      if (w?.stage) {
        w.stage.dispose();
        w.stage = null;
      }
      if (w?.mini) {
        w.mini.dispose();
        w.mini = null;
      }
      setMini(null);
      setIntro({ chapter: id, lines: act === 0 ? CHAPTERS[id].intro : [], act, leaving: false });
      setMode("intro");
    },
    [setOverlay, setTalk],
  );

  /** The intro's done: the chapter starts under it, and the sheet lifts off. */
  const liftIntro = useCallback(() => {
    if (!intro || intro.leaving) return;
    playAct(intro.chapter, intro.act);
    setIntro({ ...intro, leaving: true });
    window.setTimeout(() => setIntro((i) => (i?.leaving ? null : i)), prefersReduced() ? 260 : 600);
  }, [intro, playAct]);

  const leaveTitle = useCallback(
    (then: () => void) => {
      if (live.current.leaving) return;
      soundRef.current?.confirm();
      setPanel(null);
      setLeaving(true);
      const w = worldRef.current;
      if (w) w.revealOut = w.time;
      cover(() => {
        setLeaving(false);
        then();
      }, false);
    },
    [cover, soundRef],
  );

  const toTitle = useCallback(() => {
    soundRef.current?.select();
    cover(() => {
      session.current += 1;
      busy.current = 0;
      setPaused(false);
      setTalk(null);
      setOverlay(null);
      setIntro(null);
      setMode("title");
      setMenu(0);
      setSaveState(loadSave());
      soundRef.current?.scene(null);
      const w = worldRef.current;
      if (w) {
        w.stage?.dispose();
        w.stage = null;
        w.mini?.dispose();
        w.mini = null;
        w.shake.clear();
        w.revealOut = -1;
        w.revealFrom = -1;
      }
      setMini(null);
    });
  }, [cover, setOverlay, setTalk, soundRef]);

  // nothing to continue once every chapter there is has been played
  const resumable = save && !(save.done.includes(save.chapter) && !nextOf(save.chapter));
  const menuItems: MenuItem[] = resumable ? ["continue", "new", "chapters", "settings", "island"] : ["new", "chapters", "settings", "island"];
  const choose = useCallback(
    (item: MenuItem) => {
      if (item !== "new") setConfirmNew(false);
      if (item === "new") {
        // starting over replaces where Continue would pick up; ask first
        const s = loadSave();
        if (s && (s.chapter !== "prologue" || s.act > 0) && !confirmNew) {
          soundRef.current?.select();
          setConfirmNew(true);
          return;
        }
        setConfirmNew(false);
        if (s) writeSave({ chapter: "prologue", act: 0, done: s.done });
        leaveTitle(() => startChapter("prologue", 0));
      } else if (item === "continue") {
        const s = loadSave();
        if (s) leaveTitle(() => startChapter(s.chapter, s.act));
      } else if (item === "chapters" || item === "settings") {
        soundRef.current?.select();
        setPanel((open) => (open === item ? null : item));
      } else onQuit();
    },
    [confirmNew, leaveTitle, onQuit, soundRef, startChapter],
  );

  // —— the clock in the HUD: a minute every second and a half, while playing
  const still = Boolean(talk) || Boolean(overlay) || Boolean(mini);
  useEffect(() => {
    if (mode !== "play" || paused || step === "wake" || still) return;
    const id = window.setInterval(() => setClock((m) => m + 1), CLOCK_RATE);
    return () => window.clearInterval(id);
  }, [mode, paused, step, still]);

  // the music hears the clock (the Campanile strikes the hour)
  useEffect(() => {
    if (mode === "play") soundRef.current?.clock(clock);
  }, [clock, mode, soundRef]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 3250);
    return () => window.clearTimeout(id);
  }, [banner]);

  // expired bubbles go, shrinking away a moment before they do
  useEffect(() => {
    if (!bubbles.some((b) => b.until)) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      for (const b of bubblesRef.current) if (b.until && b.until - now < 190) bubbleNodes.current.get(b.key)?.setAttribute("data-out", "");
      const kept = bubblesRef.current.filter((b) => !b.until || b.until > now);
      if (kept.length !== bubblesRef.current.length) {
        bubblesRef.current = kept;
        setBubbles(kept);
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [bubbles]);

  const { shown: momentShown, leaving: momentLeaving } = useLingering(moment, 330);

  // the prompt keeps its word while it fades, and hangs centred on whole pixels
  const { shown: promptLabel } = useLingering(near, 160);
  // its size, so words and emotes over the world can keep off it
  const promptSize = useRef({ half: 0, tall: 0 });
  useLayoutEffect(() => {
    const body = promptBody.current;
    centre(body);
    promptSize.current = { half: Math.round((body?.offsetWidth ?? 0) / 2), tall: body?.offsetHeight ?? 0 };
  }, [promptLabel, touch, mode]);

  // —— the world, drawn every frame, and the keys and the pointer
  const actions = useRef({ interact, advance, wake, choose, setPaused, setMenu, setPanel, setNear, setChoice, setMoved });
  useEffect(() => {
    actions.current = { interact, advance, wake, choose, setPaused, setMenu, setPanel, setNear, setChoice, setMoved };
  }, [interact, advance, wake, choose]);
  const items = useRef(menuItems);
  useEffect(() => {
    items.current = menuItems;
  });

  useEffect(() => {
    if (!started || !container.current || !canvas.current) return;
    const cv = canvas.current;
    const view = createView(container.current, cv);
    const title = titleScene();
    const w: World = { view, title, stage: null, mini: null, shake: createShake(), time: 0, revealFrom: -1, revealOut: -1, revealMax: 0.4 };
    worldRef.current = w;
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();
    let lastNear: string | null = null;
    // where each thing over the world was last put, so a still camera
    // writes nothing at all
    const placed = new WeakMap<HTMLElement, { x: number; y: number }>();
    const at = new Vector3();
    let dpr = window.devicePixelRatio || 1;
    // the prompt's box this frame: words and emotes keep off it
    const box = { on: false, x: 0, y: 0, half: 0, tall: 0 };

    /** Moves something over the world to a screen point, on whole device pixels. */
    const put = (el: HTMLElement, x: number, y: number) => {
      const sx = Math.round(x * dpr) / dpr;
      const sy = Math.round(y * dpr) / dpr;
      let last = placed.get(el);
      if (!last) placed.set(el, (last = { x: NaN, y: NaN }));
      if (last.x === sx && last.y === sy) return;
      last.x = sx;
      last.y = sy;
      el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    };

    /** Puts a word or an emote, on top of the prompt if it would cover it. */
    const putClear = (el: HTMLElement, x: number, y: number) => {
      if (box.on) {
        const w = Number(el.dataset.w) / 2 || 0;
        const h = Number(el.dataset.h) || 0;
        if (x + w > box.x - box.half && x - w < box.x + box.half && y > box.y - box.tall && y - h < box.y) y = box.y - box.tall - 6;
      }
      put(el, x, y);
    };

    /** Art pixels per world unit, measured off the camera as it is. */
    const artPerUnit = (target: Vector3) => {
      const a = view.project(target);
      const ax = a.x;
      const ay = a.y;
      const b = view.project(w.shake.rightOf(target));
      const cssPerArt = parseFloat(cv.style.width) / cv.width || 1;
      return Math.hypot(b.x - ax, b.y - ay) / cssPerArt;
    };

    /** Where to hang something over someone's head (or over a thing). */
    const anchorOf = (stage: Stage, who: string | Vector3, lift: number) => {
      if (typeof who !== "string") return at.copy(who);
      const rig = who === "aiden" ? stage.aidenRig() : stage.actor(who)?.rig;
      if (rig) {
        rig.head.getWorldPosition(at);
        at.y += HEAD_TOP * rig.scale + lift;
        return at;
      }
      const spot = stage.spot(who);
      return spot ? at.copy(spot.at).setY(spot.at.y + 0.55 + lift) : null;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = live.current;
      if (s.paused) return;
      w.time += dt;
      const time = w.time;
      dpr = window.devicePixelRatio || 1;
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
        // its arrival waits for its shaders, so it starts from nothing on the first frame drawn
        if (!view.render({ scene: game.scene, ...game.look(tall) }, 15 + Math.round(7 * night))) w.revealFrom = time;
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
          const k = Math.min(1, (time - w.revealOut) / 0.55);
          uniforms.uReveal.value = w.revealMax * (1 - k) ** 1.5;
        } else {
          const k = Math.min(1, (time - w.revealFrom) / 1.3);
          uniforms.uReveal.value = k >= 1 ? 1 : w.revealMax * (1 - (1 - k) ** 2);
        }
        const frozen = busy.current > 0 || Boolean(talkRef.current) || Boolean(overlayRef.current) || s.mode === "end";
        let x = 0,
          y = 0;
        if (keys.has("arrowleft") || keys.has("a")) x -= 1;
        if (keys.has("arrowright") || keys.has("d")) x += 1;
        if (keys.has("arrowup") || keys.has("w")) y += 1;
        if (keys.has("arrowdown") || keys.has("s")) y -= 1;
        if ((x || y) && !frozen) actions.current.setMoved(true);
        stage.update(dt, time, { x, y, run: keys.has("shift") }, view.axes(), frozen, () => soundRef.current?.step());
        const look = stage.look(tall);
        const target = w.shake.apply(look.target, dt, time, () => artPerUnit(look.target));
        // a room's arrival waits for its shaders, so it starts from nothing on the first frame drawn
        if (!view.render({ scene: stage.scene, target, span: look.span, background: room.background }, 15 + Math.round(7 * room.night)) && w.revealOut < 0) w.revealFrom = time;
        // a picture of this frame, while the canvas still holds it
        if (shots.current.length) {
          const head = view.project(stage.position.clone().setY(1.3));
          const rect = cv.getBoundingClientRect();
          const sx = cv.width / rect.width,
            sy = cv.height / rect.height;
          const h = Math.min(cv.height, cv.width * (16 / 9)) * 0.62;
          const wide = h * (9 / 16);
          const box = container.current!.getBoundingClientRect();
          const cx = Math.max(wide / 2, Math.min(cv.width - wide / 2, (head.x - (rect.left - box.left)) * sx));
          const cy = Math.max(h / 2, Math.min(cv.height - h / 2, (head.y - (rect.top - box.top)) * sy));
          const out = document.createElement("canvas");
          out.width = Math.round(wide);
          out.height = Math.round(h);
          const ctx2 = out.getContext("2d")!;
          ctx2.imageSmoothingEnabled = false;
          ctx2.drawImage(cv, cx - wide / 2, cy - h / 2, wide, h, 0, 0, out.width, out.height);
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
        const goal = targetOf(chapterRef.current, stepRef.current);
        const aim = goal && !frozen && arrived && !stage.lying ? stage.spot(goal) : null;
        const pin = marker.current;
        if (pin) {
          const show = Boolean(aim) && aim?.id !== spot?.id;
          if (pin.hasAttribute("data-shown") !== show) pin.toggleAttribute("data-shown", show);
          if (show && aim) {
            const p = view.project(at.copy(aim.at).setY(aim.at.y + 1.0));
            put(pin, p.x, p.y);
          }
        }
        const node = prompt.current;
        box.on = Boolean(node && label);
        if (node && label) {
          if (stage.lying) at.copy((room as Room & { bed?: Vector3 }).bed ?? stage.position).setY(1.45);
          else at.copy(spot!.at).setY(spot!.at.y + 0.45);
          const p = view.project(at);
          box.x = p.x;
          box.y = p.y;
          box.half = promptSize.current.half;
          box.tall = promptSize.current.tall;
          put(node, p.x, p.y);
        }
        for (const b of bubblesRef.current) {
          const el = bubbleNodes.current.get(b.key);
          const point = el ? anchorOf(stage, b.target, 0.16) : null;
          if (!el || !point) continue;
          const p = view.project(point);
          putClear(el, p.x, p.y);
        }
        for (const e of emotesRef.current) {
          const el = emoteNodes.current.get(e.id);
          const point = el ? anchorOf(stage, e.who, 0.12) : null;
          if (!el || !point) continue;
          const p = view.project(point);
          putClear(el, p.x, p.y);
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
    const CODES: Record<string, string> = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyE: "e" };
    const keyOf = (event: KeyboardEvent) => CODES[event.code] ?? event.key.toLowerCase();
    // the key on the prompt goes down with yours
    const press = () => {
      const k = promptKey.current;
      if (!k) return;
      k.setAttribute("data-down", "");
      window.setTimeout(() => k.removeAttribute("data-down"), 130);
    };
    let held = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = keyOf(event);
      const s = live.current;
      const a = actions.current;
      if (key === "escape") {
        if (s.mode === "play") a.setPaused(!s.paused);
        else if (s.panel) a.setPanel(null);
        return;
      }
      if (s.paused) return;
      if (s.mode === "title") {
        // only once the menu is up, and not under a panel, which the
        // browser's own focus moves through
        if (s.leaving || s.phase !== "ready" || s.panel) return;
        const list = items.current;
        if (key === "arrowdown" || key === "s") a.setMenu((s.menu + 1) % list.length);
        else if (key === "arrowup" || key === "w") a.setMenu((s.menu + list.length - 1) % list.length);
        else if ((key === "enter" || key === " ") && !event.repeat) a.choose(list[s.menu]);
        if (key.startsWith("arrow") || key === " " || key === "enter") event.preventDefault();
        return;
      }
      if (s.mode !== "play" || overlayRef.current) return;
      if (key.startsWith("arrow") || key === " " || key === "enter") event.preventDefault();
      if (w.mini) {
        if (interactKey(key) && !event.repeat) {
          event.preventDefault();
          w.mini.press();
        }
        return;
      }
      const current = talkRef.current;
      if (current?.choices && typingRef.current.done) {
        if (confirmingRef.current !== null) return;
        const n = current.choices.length;
        // a number picks its answer straight away
        const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : 0;
        if (digit && digit <= n && !event.repeat) {
          choiceRef.current = digit - 1;
          a.setChoice(choiceRef.current);
          a.advance();
          return;
        }
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
      // held down through lines: on through them, quickly, but never into a choice
      if (event.repeat && interactKey(key) && talkRef.current && !talkRef.current.choices) {
        const now = performance.now();
        if (now - held > 110) {
          held = now;
          a.advance();
        }
        return;
      }
      if (!interactKey(key) || event.repeat) return;
      if (talkRef.current) a.advance();
      else if (busy.current) return;
      else if (w.stage?.lying) {
        if (uniforms.uReveal.value >= 1) {
          press();
          a.wake();
        }
      } else {
        const spot = w.stage?.nearest(preferred());
        if (spot) {
          press();
          a.interact(spot.id);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(keyOf(event));
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
      if (talkRef.current) {
        if (talkRef.current.choices && typingRef.current.done) return;
        return a.advance();
      }
      if (busy.current) return;
      if (stage.lying) {
        if (uniforms.uReveal.value >= 1) a.wake();
        return;
      }
      const rect = container.current!.getBoundingClientRect();
      const px = event.clientX - rect.left,
        py = event.clientY - rect.top;
      let hit: ReturnType<Stage["spots"]>[number] | null = null;
      let best = 46;
      const wanted = preferred();
      for (const spot of stage.spots()) {
        const p = view.project(spot.at);
        // Phoebe, always at your heels, only when you click right on her
        const d = Math.hypot(p.x - px, p.y - py) + (spot.id === "phoebe" ? 18 : 0) - (spot.id === wanted ? 16 : 0);
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
      if (point) {
        stage.walkTo(point);
        actions.current.setMoved(true);
      }
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
      worldRef.current = null;
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
        const w = worldRef.current;
        if (w?.mini) {
          w.mini.dispose();
          w.mini = null;
          setMini(null);
        }
        chapterRef.current = id;
        setChapterId(id);
        setIntro(null);
        playAct(id, act);
      },
      step: (next: string) => {
        stepRef.current = next;
        setStep(next);
      },
      use: (id: string) => interact(id),
      ctx: () => makeCtx(session.current),
      mini: () => worldRef.current?.mini ?? null,
      /** Forgets every moment found, to see their cards again. */
      forget: () => {
        try {
          localStorage.removeItem("aiden-game-feats");
        } catch {}
        setFound({});
      },
      looks: LOOKS,
    };
  }, [interact, makeCtx, playAct, startChapter]);

  const projectPoint = useCallback((point: Vector3) => worldRef.current?.view.project(point) ?? { x: -999, y: -999 }, []);

  // a tap on the prompt itself works too
  const tapPrompt = () => {
    const stage = worldRef.current?.stage;
    if (!stage) return;
    if (stage.lying) return wake();
    const spot = stage.nearest(preferred());
    if (spot) interact(spot.id);
  };

  const chapter = CHAPTERS[chapterId];
  const hours = Math.floor(clock / 60) % 24;
  const done = save?.done ?? [];
  const objective = chapter.objectives[step] ?? "";
  const next = chapter.end.next.chapter;

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
          <TitleMenu items={menuItems} menu={menu} shown={phase === "ready"} leaving={leaving} save={save} confirmNew={confirmNew} onHover={setMenu} onChoose={choose} />
          <p className={styles.version} data-shown={phase === "ready" || undefined}>
            v1.2 · Life, so far
          </p>
          <ChaptersPanel open={panel === "chapters"} done={done} found={found} onClose={() => setPanel(null)} onPlay={(id) => leaveTitle(() => startChapter(id, 0))} />
          <SettingsPanel open={panel === "settings"} settings={settings} muted={muted} onSettings={updateSettings} onMuted={setMuted} onClose={() => setPanel(null)} />
        </div>
      ) : null}

      {/* —— before a chapter: a few lines on the sheet, its card */}
      {intro ? (
        <Intro
          key={`${intro.chapter}-${intro.act}`}
          lines={intro.lines}
          number={CHAPTERS[intro.chapter].number}
          title={CHAPTERS[intro.chapter].title}
          resumed={intro.act > 0}
          leaving={intro.leaving}
          touch={touch}
          onDone={liftIntro}
          soundRef={soundRef}
        />
      ) : null}

      {/* —— playing */}
      {mode === "play" || mode === "end" ? (
        <>
          <Hud
            hidden={mode === "end" || Boolean(mini)}
            day={day}
            clock={clock}
            night={hours >= 19 || hours < 6}
            objective={objective}
            chapter={chapter}
            stats={stats}
            epoch={statEpoch}
            hearts={hearts}
            faceOf={faceOf}
            glint={glint}
            toast={toast}
            onPause={() => setPaused(true)}
          />

          {banner ? <Banner key={banner.id} place={banner.place} time={banner.time} /> : null}

          {bubbles.map((b) => (
            <BubbleView
              key={b.key}
              text={b.text}
              ringing={!b.until}
              anchor={(node) => {
                if (node) bubbleNodes.current.set(b.key, node);
                else bubbleNodes.current.delete(b.key);
              }}
            />
          ))}
          {emotes.map((e) => (
            <EmoteView
              key={e.id}
              kind={e.kind}
              anchor={(node) => {
                if (node) emoteNodes.current.set(e.id, node);
                else emoteNodes.current.delete(e.id);
              }}
            />
          ))}
          <div ref={marker} className={world.marker} aria-hidden="true">
            <Pixels art={DIAMOND} className={world.diamond} />
          </div>
          <button ref={prompt} type="button" className={world.prompt} data-shown={near ? "" : undefined} onMouseDown={(event) => event.preventDefault()} onClick={tapPrompt} tabIndex={-1} aria-hidden={!near}>
            <span key={promptLabel ?? ""} ref={promptBody} className={world.promptBody}>
              {touch ? <Pixels art={TAP} className={world.tap} /> : <kbd ref={promptKey}>E</kbd>}
              {promptLabel}
            </span>
          </button>

          {mini ? <WingmanHud game={mini} project={projectPoint} touch={touch} onPause={() => setPaused(true)} /> : null}

          <Dialogue
            talk={talk}
            speed={settings.text}
            touch={touch}
            pausedRef={pausedRef}
            typingRef={typingRef}
            soundRef={soundRef}
            faceOf={faceOf}
            selected={choice}
            confirming={confirming}
            onNext={advance}
            onChoices={markChoices}
            onPick={(i) => {
              if (confirmingRef.current !== null) return;
              choiceRef.current = i;
              setChoice(i);
              advance();
            }}
            onHover={(i) => {
              if (confirmingRef.current !== null || choiceRef.current === i) return;
              choiceRef.current = i;
              setChoice(i);
            }}
          />

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

          {mode === "end" ? <EndCard chapter={chapter} onNext={next ? () => cover(() => startChapter(next, 0), false) : undefined} onTitle={toTitle} onQuit={onQuit} /> : null}

          <Pause
            open={paused}
            where={`${chapter.number} · ${chapter.title}`}
            found={found}
            settings={settings}
            muted={muted}
            onResume={() => setPaused(false)}
            onTitle={toTitle}
            onQuit={onQuit}
            onSettings={updateSettings}
            onMuted={setMuted}
          />

          {mode === "play" && chapterId === "prologue" && !moved && !talk && !overlay ? (
            <p className={styles.controls}>
              {touch ? (
                "Tap to walk · tap things to use them"
              ) : (
                <>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> walk <i aria-hidden="true">·</i> <kbd>Shift</kbd> run <i aria-hidden="true">·</i> <kbd>E</kbd> use <i aria-hidden="true">·</i> or just click
                </>
              )}
            </p>
          ) : null}
        </>
      ) : null}

      {momentShown ? (
        <MomentCard
          key={momentShown.key}
          feat={FEATS[momentShown.id]}
          found={Object.keys(found).filter((id) => id in FEATS).length}
          total={Object.keys(FEATS).length}
          leaving={momentLeaving}
          onDismiss={dismissMoment}
        />
      ) : null}

      {curtain ? <Curtain phase={curtain} /> : null}
    </div>
  );
}
