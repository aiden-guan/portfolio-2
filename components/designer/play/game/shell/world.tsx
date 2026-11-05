"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Emote } from "../chapters/types";
import { EMOTES, Pixels, TAIL } from "./pixels";
import styles from "./world.module.css";

// What floats over the world: words over people's heads, and emotes. Each is
// an anchor with no size that the frame loop moves to a point on the screen
// (in whole device pixels, so it sits still against the pixel-snapped
// world), and a body hung above it, a whole number of pixels to the left of
// its middle, that does the animating.

/** How long an emote stays up, all told. */
export const EMOTE_MS = 1700;

/** Hangs `node` centred over its anchor, on a whole pixel, and notes its
 * size on the anchor, so the frame loop can keep things off each other. */
export function centre(node: HTMLElement | null, rise = 0) {
  if (!node) return;
  node.style.left = `${-Math.round(node.offsetWidth / 2)}px`;
  const anchor = node.closest<HTMLElement>("[data-anchor]");
  if (!anchor) return;
  anchor.dataset.w = String(node.offsetWidth);
  anchor.dataset.h = String(node.offsetHeight + rise);
}

export function EmoteView({ kind, anchor }: { kind: Emote; anchor: (node: HTMLDivElement | null) => void }) {
  const art = EMOTES[kind];
  const body = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = body.current;
    const host = el?.closest<HTMLElement>("[data-anchor]");
    if (!el || !host) return;
    host.dataset.w = String(el.offsetWidth);
    host.dataset.h = String(el.offsetHeight);
  }, [kind]);
  return (
    <div ref={anchor} className={styles.anchor} data-anchor="" data-emote={kind} aria-hidden="true" style={{ "--life": `${EMOTE_MS}ms` } as CSSProperties}>
      <span ref={body} className={styles.emote} style={{ "--w": art.w, "--h": art.h } as CSSProperties}>
        <Pixels art={art} className={styles.emoteArt} parts={{ a: styles.partA, b: styles.partB, c: styles.partC }} />
      </span>
    </div>
  );
}

/** A bubble that stays up is something ringing (a phone, an alarm), so it
 * buzzes; one that times out is somebody saying something: it pops and bobs. */
export function BubbleView({ text, ringing, anchor }: { text: string; ringing: boolean; anchor: (node: HTMLDivElement | null) => void }) {
  const body = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => centre(body.current, 6), [text]);
  return (
    <div ref={anchor} className={styles.anchor} data-anchor="" data-ringing={ringing || undefined} aria-hidden="true">
      <span className={styles.pop}>
        <span ref={body} className={styles.bubble}>
          {text}
        </span>
        <Pixels art={TAIL} className={styles.tail} />
      </span>
    </div>
  );
}
