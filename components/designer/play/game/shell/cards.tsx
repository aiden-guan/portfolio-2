"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Sound } from "../../sound";
import type { Chapter } from "../chapters/types";
import type { Feat } from "../chapters/feats";
import { prefersReduced } from "./motion";
import { CHECK, MOMENT, Pixels, SPARK } from "./pixels";
import styles from "./cards.module.css";

// The cards between the playing: the sheet of paper that comes down over
// the screen when the game changes place (and the chapter intros written on
// it), the banner that says where and when, the card at the end of a
// chapter, and the card that says a moment was found.

/** The sheet coming down over everything, or going back up. */
export function Curtain({ phase }: { phase: "down" | "up" }) {
  return <div className={styles.curtain} data-phase={phase} aria-hidden="true" />;
}

/** Before a chapter: a few lines on the sheet, then its title card. It lifts
 * off when it's done, or the moment it's skipped. */
export function Intro({
  lines,
  number,
  title,
  resumed,
  leaving,
  touch,
  onDone,
  soundRef,
}: {
  lines: string[];
  number: string;
  title: string;
  resumed: boolean;
  leaving: boolean;
  touch: boolean;
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
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "e" || key === " " || key === "enter" || key === "escape") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);
  useEffect(() => {
    const timers: number[] = [];
    const per = 1350;
    lines.forEach((_, i) => timers.push(window.setTimeout(() => setAt(i + 1), 450 + i * per)));
    const cardAt = lines.length ? 450 + lines.length * per + 350 : 250;
    timers.push(window.setTimeout(() => setCard(true), cardAt));
    timers.push(window.setTimeout(() => soundRef.current?.sting(), cardAt + 90));
    timers.push(window.setTimeout(finish, cardAt + 2400));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [lines, soundRef, finish]);
  return (
    <div className={styles.intro} data-ui="" onClick={finish} data-card={card || undefined} data-leaving={leaving || undefined}>
      <div className={styles.introLines}>
        {lines.map((text, i) => (
          <p key={text} data-shown={at > i || undefined}>
            {text}
          </p>
        ))}
      </div>
      <div className={styles.chapterCard} aria-live="polite">
        <small>{resumed ? `${number} · continued` : number}</small>
        <strong>{title}</strong>
      </div>
      <span className={styles.skip}>{touch ? "Tap to skip" : <>{"Skip "}<kbd>E</kbd></>}</span>
    </div>
  );
}

/** Arriving somewhere: where, and when. */
export function Banner({ place, time }: { place: string; time: string }) {
  return (
    <div className={styles.banner} aria-live="polite">
      <strong>
        <span>{place}</span>
      </strong>
      <small>{time}</small>
    </div>
  );
}

/** "$45,000" counts up from nothing; "Your own" just lands. */
function StatValue({ value, delay }: { value: string; delay: number }) {
  const match = /^(\$?)([\d,]+)$/.exec(value);
  const prefix = match?.[1] ?? "";
  const target = match ? Number(match[2].replace(/,/g, "")) : NaN;
  const counts = Number.isFinite(target) && target >= 10;
  const node = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el || !counts) return;
    const write = (n: number) => {
      el.textContent = `${prefix}${n.toLocaleString("en-US")}`;
    };
    if (prefersReduced()) {
      write(target);
      return;
    }
    write(0);
    let raf = 0;
    const length = 900;
    const begin = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - begin) / length));
      write(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [counts, target, prefix, delay]);
  return <span ref={node}>{counts ? null : value}</span>;
}

export function EndCard({ chapter, onNext, onTitle, onQuit }: { chapter: Chapter; onNext?: () => void; onTitle: () => void; onQuit: () => void }) {
  const end = chapter.end;
  return (
    <div className={styles.end} data-ui="">
      <div className={styles.endCard} role="dialog" aria-label={`${chapter.number} complete`}>
        <p className={styles.kicker}>
          <Pixels art={CHECK} className={styles.kickerCheck} />
          {end.tbc ? `${chapter.number} · to be continued` : `${chapter.number} complete`}
        </p>
        <h2>{end.title}</h2>
        <dl>
          {end.stats.map(([label, value], i) => (
            <div key={label} style={{ "--i": i } as CSSProperties} data-handsome={label === "Handsome" || undefined}>
              <dt>{label}</dt>
              <dd>
                <StatValue value={value} delay={420 + i * 90} />
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.next}>
          <small>Next · {end.next.number}</small>
          <strong>{end.next.title}</strong>
          <span>
            {end.next.line}
            {end.next.chapter || end.tbc ? "" : " Coming soon: come back for it."}
          </span>
        </div>
        <div className={styles.endButtons}>
          {onNext ? (
            <button type="button" className={styles.primary} onClick={onNext} autoFocus>
              Play {end.next.number}
            </button>
          ) : null}
          <button type="button" className={onNext ? styles.secondary : styles.primary} onClick={onTitle}>
            Title screen
          </button>
          <button type="button" className={styles.secondary} onClick={onQuit}>
            Back to the island
          </button>
        </div>
      </div>
    </div>
  );
}

const BURST: Array<[number, number]> = [
  [-26, -20],
  [24, -24],
  [30, 12],
  [-22, 22],
];

/** A moment, found for the first time: it slides in, the stamp lands, and
 * it slides away on its own (or at a click). */
export function MomentCard({ feat, found, total, leaving, onDismiss }: { feat: Feat; found: number; total: number; leaving: boolean; onDismiss: () => void }) {
  return (
    <div className={styles.moment} data-leaving={leaving || undefined} data-ui="" role="status" onClick={onDismiss}>
      <span className={styles.stamp}>
        <Pixels art={MOMENT} className={styles.stampArt} />
        {BURST.map(([x, y], i) => (
          <Pixels key={i} art={SPARK} className={styles.burst} style={{ "--x": `${x}px`, "--y": `${y}px`, "--i": i } as CSSProperties} />
        ))}
      </span>
      <span className={styles.momentText}>
        <small>
          Moment found <b>{found}/{total}</b>
        </small>
        <strong>{feat.title}</strong>
        <span>{feat.line}</span>
      </span>
    </div>
  );
}
