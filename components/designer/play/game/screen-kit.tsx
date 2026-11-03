"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Sound } from "../sound";
import styles from "./screens.module.css";

// What every screen is made with: its props, the press that moves it on,
// the hint that says how, the laptop's window, and a list of answers you
// can pick with the arrows, a click or a tap.

export type Props<T> = { spec: T; soundRef: RefObject<Sound | null>; onDone: (result?: unknown) => void; touch: boolean };

// While the game is paused a screen hears no keys and its clocks stand still.
let paused = false;
export const pauseScreens = (on: boolean) => {
  paused = on;
};
export const screensPaused = () => paused;

/** Calls `fn` on E, space or enter. */
export function usePress(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (paused || event.repeat || (key !== "e" && key !== " " && key !== "enter")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
