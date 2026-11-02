import type { ChapterId } from "./chapters/types";

// Where you got to, kept in this browser so you can come back and finish:
// the chapter, the act within it, and which chapters you've finished.

const KEY = "aiden-game-save";

export type Save = { v: 1; chapter: ChapterId; act: number; done: ChapterId[]; at: number };

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as Save;
    return save?.v === 1 && typeof save.chapter === "string" ? save : null;
  } catch {
    return null;
  }
}

export function writeSave(save: { chapter: ChapterId; act: number; done: ChapterId[] }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), ...save }));
  } catch {}
}
