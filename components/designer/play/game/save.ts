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

// —— settings: how fast the text types and whether the camera shakes. Sound
// isn't here: it's the site's own setting, shared with every page.

const SETTINGS = "aiden-game-settings";

export type TextSpeed = "normal" | "fast" | "instant";
export type Settings = { text: TextSpeed; shake: boolean };
export const DEFAULT_SETTINGS: Settings = { text: "normal", shake: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<Settings> | null;
    return { text: s?.text === "fast" || s?.text === "instant" ? s.text : "normal", shake: s?.shake !== false };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
  } catch {}
}

// —— moments (chapters/feats.ts): which ones this browser has found, and
// when. Kept apart from the save, so starting over never loses them, and ids
// the list no longer has are kept rather than thrown away.

const FEATS = "aiden-game-feats";

export function loadFeats(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FEATS);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    const found: Record<string, number> = {};
    if (Array.isArray(data)) {
      for (const id of data) if (typeof id === "string") found[id] = 0;
    } else if (data && typeof data === "object") {
      for (const [id, at] of Object.entries(data)) found[id] = typeof at === "number" ? at : 0;
    }
    return found;
  } catch {
    return {};
  }
}

/** Marks a moment found. True only the first time. */
export function findFeat(id: string) {
  const found = loadFeats();
  if (id in found) return false;
  found[id] = Date.now();
  try {
    localStorage.setItem(FEATS, JSON.stringify(found));
  } catch {}
  return true;
}
