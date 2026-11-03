import { CHAPTERS, ORDER } from "./chapters";
import type { ChapterId } from "./chapters/types";

// Where you got to, kept in this browser so you can come back and finish:
// the chapter, the act within it, and which chapters you've finished. It only
// ever moves forward: replaying an earlier chapter keeps your place.

const KEY = "aiden-game-save";

export type Save = { v: 1; chapter: ChapterId; act: number; done: ChapterId[]; at: number };

const known = (id: unknown): id is ChapterId => typeof id === "string" && (ORDER as string[]).includes(id);

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as Partial<Save> | null;
    if (save?.v !== 1 || !known(save.chapter)) return null;
    const acts = CHAPTERS[save.chapter].acts.length;
    const act = Number.isInteger(save.act) ? Math.max(0, Math.min(acts - 1, save.act as number)) : 0;
    const done = Array.isArray(save.done) ? save.done.filter(known) : [];
    return { v: 1, chapter: save.chapter, act, done, at: typeof save.at === "number" ? save.at : 0 };
  } catch {
    return null;
  }
}

export function writeSave(save: { chapter: ChapterId; act: number; done: ChapterId[] }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), ...save }));
  } catch {}
}

/** How far along a place is, for comparing two. */
const place = (s: { chapter: ChapterId; act: number }) => ORDER.indexOf(s.chapter) * 100 + s.act;

/** Saves a place only if it's at or past the one already saved; the list of
 * finished chapters is always kept. */
export function reach(chapter: ChapterId, act: number, done?: ChapterId[]) {
  const current = loadSave();
  const finished = Array.from(new Set([...(current?.done ?? []), ...(done ?? [])]));
  if (!current || place({ chapter, act }) >= place(current)) writeSave({ chapter, act, done: finished });
  else writeSave({ chapter: current.chapter, act: current.act, done: finished });
}
