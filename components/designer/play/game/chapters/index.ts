import { chapter1 } from "./chapter1";
import { chapter2 } from "./chapter2";
import { chapter3 } from "./chapter3";
import { chapter4 } from "./chapter4";
import { prologue } from "./prologue";
import type { Chapter, ChapterId } from "./types";

// The chapters that are built, in order, and what comes after them (on the
// Chapters screen as what's next). The story has caught up with the present:
// the next chapter gets written as it happens. docs/aiden-the-game.md has the
// plan.

export const ORDER: ChapterId[] = ["prologue", "ch1", "ch2", "ch3", "ch4"];

export const CHAPTERS: Record<ChapterId, Chapter> = { prologue, ch1: chapter1, ch2: chapter2, ch3: chapter3, ch4: chapter4 };

export const COMING = [{ number: "Chapter 5", title: "To be continued", line: "Life, so far. The next chapter is still happening." }];

/** The chapter after this one, if it's built. */
export function nextOf(id: ChapterId): ChapterId | null {
  const i = ORDER.indexOf(id);
  return i >= 0 && i + 1 < ORDER.length ? ORDER[i + 1] : null;
}
