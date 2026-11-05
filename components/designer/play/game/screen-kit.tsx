"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Sound } from "../sound";
import styles from "./screens.module.css";

// What every screen is made with: its props, the press that moves it on,
// the hint that says how, the laptop's window, and a list of answers you
// can pick with the arrows, a click or a tap. And what the mini-games share:
// a clock that stops when the game does, little numbers that pop, a jolt
// for a hit, the line that says what to do, and a results card with a rank
// and the best you've done, kept in this browser.

export type Props<T> = { spec: T; soundRef: RefObject<Sound | null>; onDone: (result?: unknown) => void; touch: boolean };

// While the game is paused a screen hears no keys and its clocks stand still.
let paused = false;
export const pauseScreens = (on: boolean) => {
  paused = on;
};
export const screensPaused = () => paused;

const isPress = (key: string) => key === "e" || key === " " || key === "enter";

/** Calls `fn` on E, space or enter. */
export function usePress(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (paused || event.repeat || !isPress(key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** Calls `down` when E, space or enter goes down and `up` when it comes
 * back up (or the window loses focus): for the things you hold. */
export function useHold(down: () => void, up: () => void) {
  const ref = useRef({ down, up });
  useEffect(() => {
    ref.current = { down, up };
  });
  useEffect(() => {
    let held = false;
    const onDown = (event: KeyboardEvent) => {
      if (!isPress(event.key.toLowerCase())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (paused || event.repeat || held) return;
      held = true;
      ref.current.down();
    };
    const onUp = (event: KeyboardEvent) => {
      if (!isPress(event.key.toLowerCase()) || !held) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      held = false;
      ref.current.up();
    };
    const onBlur = () => {
      if (!held) return;
      held = false;
      ref.current.up();
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}

/** Calls `fn` with −1 or +1 on the arrow keys (and WASD). */
export function useArrows(fn: (step: number) => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paused) return;
      const key = event.key.toLowerCase();
      const step = key === "arrowup" || key === "arrowleft" || key === "w" || key === "a" ? -1 : key === "arrowdown" || key === "arrowright" || key === "s" || key === "d" ? 1 : 0;
      if (!step) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ref.current(step);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** A frame loop for as long as `on` is true: `fn(dt, t)` gets the seconds
 * since the last frame and the seconds it has run, neither counting time
 * spent paused. Nothing is allocated per frame. */
export function useFrame(fn: (dt: number, t: number) => void, on = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = paused ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      t += dt;
      ref.current(dt, t);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** How long `on` has been true: a results card takes a press only once it
 * has been up a moment, so a key mashed at the finish doesn't skip it. */
export function useSince(on: boolean) {
  const at = useRef(0);
  useEffect(() => {
    at.current = on ? performance.now() : 0;
  }, [on]);
  return useCallback((ms = 450) => at.current > 0 && performance.now() - at.current >= ms, []);
}

/** Whether the visitor asked for less motion: then nothing jolts or punches,
 * and the information stays. */
export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A small, sharp shake of one element, for a hit or a miss: `strength` 0 to 1. */
export function jolt(el: Element | null | undefined, strength = 0.5, duration = 260) {
  if (!el || reducedMotion()) return;
  const s = Math.max(0.1, Math.min(1, strength)) * 7;
  el.animate(
    [
      { translate: "0 0" },
      { translate: `${-s}px ${s * 0.45}px` },
      { translate: `${s * 0.8}px ${-s * 0.35}px` },
      { translate: `${-s * 0.45}px ${-s * 0.2}px` },
      { translate: `${s * 0.2}px ${s * 0.15}px` },
      { translate: "0 0" },
    ],
    { duration, easing: "ease-out" },
  );
}

/** A quick press-in and spring back, for something that was just hit. */
export function punch(el: Element | null | undefined, amount = 0.06, duration = 240) {
  if (!el || reducedMotion()) return;
  el.animate([{ scale: "1" }, { scale: `${1 - amount} ${1 + amount * 0.6}`, offset: 0.25 }, { scale: `${1 + amount * 0.35}`, offset: 0.6 }, { scale: "1" }], { duration, easing: "ease-out" });
}

/** The same random numbers every play, so a best score means the same game. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// —— little words and numbers that pop out of where something happened

export type PopTone = "good" | "great" | "bad" | "ink" | "gold";
export type Pop = { id: number; text: string; tone: PopTone; x: number; y: number };

/** Pops that clear themselves: `pop(text, tone, x, y)` with x and y in
 * percent of the box they're drawn in. */
export function usePops(life = 900) {
  const [pops, setPops] = useState<Pop[]>([]);
  const next = useRef(0);
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((id) => window.clearTimeout(id));
  }, []);
  const pop = useCallback(
    (text: string, tone: PopTone = "good", x = 50, y = 40) => {
      next.current += 1;
      const id = next.current;
      setPops((list) => [...list.slice(-5), { id, text, tone, x, y }]);
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        setPops((list) => list.filter((p) => p.id !== id));
      }, life);
      timers.current.add(timer);
    },
    [life],
  );
  return { pops, pop };
}

export function Pops({ items }: { items: Pop[] }) {
  return (
    <div className={styles.pops} aria-hidden="true">
      {items.map((p) => (
        <b key={p.id} data-tone={p.tone} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {p.text}
        </b>
      ))}
    </div>
  );
}

// —— the best you've done, per mini-game, kept in this browser

export type Rank = "S" | "A" | "B" | "C";
export type Best = { score: number; rank: Rank; label: string };
const BEST_KEY = "aiden-game-best";

function readAll(): Record<string, Best> {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Record<string, Best>) : {};
  } catch {
    return {};
  }
}

export function readBest(id: string): Best | null {
  const hit = readAll()[id];
  return hit && typeof hit.score === "number" && typeof hit.label === "string" ? hit : null;
}

/** Keeps `entry` if it beats what's there. Says what the best was before it. */
export function recordBest(id: string, entry: Best): { before: Best | null; fresh: boolean } {
  const all = readAll();
  const before = readBest(id);
  const fresh = !before || entry.score > before.score;
  if (fresh) {
    all[id] = entry;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {}
  }
  return { before, fresh };
}

/** A rank from how much of the way to perfect you got: `at` are the
 * fractions an S, an A and a B need. */
export function rankOf(fraction: number, at: [number, number, number] = [1, 0.75, 0.5]): Rank {
  if (fraction >= at[0] - 1e-9) return "S";
  if (fraction >= at[1] - 1e-9) return "A";
  if (fraction >= at[2] - 1e-9) return "B";
  return "C";
}

/** The end of a mini-game: the rank, stamped on, what it was for, and how it
 * stands against your best. It never holds the story up: any press goes on. */
export function Results({
  game,
  rank,
  score,
  label,
  reason,
  kicker = "Results",
  touch,
  soundRef,
}: {
  game: string;
  rank: Rank;
  score: number;
  label: string;
  reason: string;
  kicker?: string;
  touch: boolean;
  soundRef: RefObject<Sound | null>;
}) {
  // recorded once, when the card first shows (and kept across a remount)
  const [best, setBest] = useState<{ before: Best | null; fresh: boolean } | null>(null);
  const kept = useRef<{ before: Best | null; fresh: boolean } | null>(null);
  useEffect(() => {
    kept.current ??= recordBest(game, { score, rank, label });
    const result = kept.current;
    const id = window.setTimeout(() => setBest(result), 0);
    const sound = soundRef.current;
    // the stamp lands
    const land = window.setTimeout(() => {
      sound?.stamp(rank);
      if (rank === "S") sound?.sparkle();
      else if (result.fresh && result.before) sound?.chime();
    }, 380);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(land);
    };
  }, [game, label, rank, score, soundRef]);
  return (
    <div className={styles.results} role="status">
      <small className={styles.resultsKicker}>{kicker}</small>
      <b className={styles.rank} data-rank={rank} aria-label={`Rank ${rank}`}>
        {rank}
      </b>
      <strong className={styles.resultsScore}>{label}</strong>
      <span className={styles.reason}>{reason}</span>
      <span className={styles.best}>
        {best?.fresh && best.before ? (
          <em data-new="">New best</em>
        ) : best && !best.fresh && best.before ? (
          <>
            Best: <b>{best.before.rank}</b> · {best.before.label}
          </>
        ) : null}
      </span>
      <footer className={styles.resultsFoot}>
        <Hint touch={touch} label="continue" />
      </footer>
    </div>
  );
}

/** What to do, in a line, before it starts. */
export function Brief({ text, touch, dark }: { text: string; touch: boolean; dark?: boolean }) {
  return (
    <div className={styles.brief} data-dark={dark || undefined}>
      <p>{text}</p>
      <Hint touch={touch} label="start" />
    </div>
  );
}

export function Hint({ touch, label = "close" }: { touch: boolean; label?: string }) {
  return <span className={styles.hint}>{touch ? `Tap to ${label}` : <><kbd>E</kbd> {label}</>}</span>;
}

export function Window({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={styles.window} data-wide={wide || undefined}>
      <div className={styles.bar}>
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
