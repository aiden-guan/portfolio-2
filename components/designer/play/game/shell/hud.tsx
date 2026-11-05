"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { SPEAKERS, type Chapter } from "../chapters/types";
import { prefersReduced, usePresence } from "./motion";
import { BULLET, CHECK, clockArt, HEART, HEART_EMPTY, PAUSE, Pixels, SPARK, STAR, TROPHY } from "./pixels";
import styles from "./hud.module.css";

// The HUD: the day and the clock, what to do next under them, the chapter's
// bars, and on the right its counters (the wallet, members, friendship,
// first places), HANDSOME and the pause button. Numbers count up in the page
// itself, a frame at a time, rather than through React.

export type StatName = "money" | "members" | "revenue" | "ready" | "wins";
export type StatValues = Record<StatName, { v: number; ms: number }>;

type Format = "plain" | "money" | "percent";
const FORMAT: Record<Format, (n: number) => string> = {
  plain: (n) => n.toLocaleString("en-US"),
  money: (n) => `$${n.toLocaleString("en-US")}`,
  percent: (n) => `${n}%`,
};

const HOP: Keyframe[] = [{ transform: "translateY(0)" }, { transform: "translateY(-4px)", offset: 0.3 }, { transform: "translateY(0)" }];

/** A number that counts its way to `value`; going up makes its chip hop. */
export function Count({ value, ms = 900, format = "plain", hop = false }: { value: number; ms?: number; format?: Format; hop?: boolean }) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const from = shown.current ?? value;
    const write = (n: number) => {
      shown.current = n;
      el.textContent = FORMAT[format](n);
    };
    if (from === value) {
      write(value);
      return;
    }
    const reduced = prefersReduced();
    const length = reduced ? Math.min(ms, 240) : ms;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / length);
      write(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    if (hop && value > from && !reduced) el.closest<HTMLElement>("[data-chip]")?.animate(HOP, { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
    return () => cancelAnimationFrame(raf);
  }, [value, ms, format, hop]);
  return <span ref={node} className={styles.count} />;
}

function Time({ minutes }: { minutes: number }) {
  const hours = Math.floor(minutes / 60) % 24;
  return (
    <b className={styles.time}>
      {((hours + 11) % 12) + 1}:
      <span key={minutes} className={styles.tick}>
        {String(minutes % 60).padStart(2, "0")}
      </span>{" "}
      {hours < 12 ? "AM" : "PM"}
    </b>
  );
}

/** How long a finished objective takes to tick off and roll away. */
const DONE = 900;

/** What to do next. A new one ticks the old one off, then rolls in; the row
 * eases to the width of its words, so the card never jumps. */
function Objective({ text }: { text: string }) {
  const [rows, setRows] = useState({ now: text, was: "", n: 0 });
  if (rows.now !== text) setRows({ now: text, was: rows.now, n: rows.n + 1 });
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rows.was) return;
    const n = rows.n;
    const id = window.setTimeout(() => setRows((r) => (r.n === n ? { ...r, was: "" } : r)), DONE);
    return () => window.clearTimeout(id);
  }, [rows.n, rows.was]);
  useLayoutEffect(() => {
    const el = box.current;
    const r = ruler.current;
    if (el && r) el.style.width = `${Math.ceil(r.getBoundingClientRect().width)}px`;
  }, [rows.now, rows.was]);
  if (!rows.now && !rows.was) return null;
  return (
    <div className={styles.objective}>
      <div ref={box} className={styles.tasks} data-changing={rows.was ? "" : undefined}>
        <div ref={ruler} className={`${styles.task} ${styles.ruler}`} aria-hidden="true">
          <Pixels art={BULLET} className={styles.bullet} />
          <span>{rows.now || rows.was}</span>
        </div>
        {rows.was ? (
          <div key={`was${rows.n}`} className={styles.task} data-done="" aria-hidden="true">
            <Pixels art={CHECK} className={styles.check} />
            <span>{rows.was}</span>
          </div>
        ) : null}
        {rows.now ? (
          <div key={`now${rows.n}`} className={styles.task} data-new={rows.n > 0 ? (rows.was ? "after" : "") : undefined} aria-live="polite">
            <Pixels art={BULLET} className={styles.bullet} />
            <span>{rows.now}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A bar: the new amount shows at once, pale, and the fill eases up to it. */
function Meter({ label, value, max, ms, format, tone, of, leaving }: { label: string; value: number; max: number; ms: number; format: Format; tone: "money" | "ready"; of?: string; leaving?: boolean }) {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const shift = `translateX(${((k - 1) * 100).toFixed(2)}%)`;
  return (
    <div className={styles.meter} data-tone={tone} data-leaving={leaving || undefined} style={{ "--ms": `${ms}ms` } as CSSProperties}>
      <div className={styles.meterRow}>
        <span>{label}</span>
        <b>
          <Count value={value} ms={ms} format={format} />
        </b>
        {of ? <small>of {of}</small> : null}
      </div>
      <span className={styles.bar} aria-hidden="true">
        <i className={styles.ghost} style={{ transform: shift }} />
        <i className={styles.fill} style={{ transform: shift }} />
      </span>
    </div>
  );
}

/** The readiness bar fills to the top, holds a moment, and goes. */
function Readiness({ label, value, ms }: { label: string; value: number; ms: number }) {
  const { mounted, leaving } = usePresence(value < 100, ms + 1100);
  if (!mounted) return null;
  return <Meter label={label} value={leaving ? 100 : value} max={100} ms={ms} format="percent" tone="ready" leaving={leaving} />;
}

/** HANDSOME: five stars, maxed, glinting now and then. That's the joke. */
function Handsome({ glint }: { glint: number }) {
  return (
    <>
      <small>Handsome</small>
      <span key={glint} className={styles.stars} data-glint={glint > 0 || undefined} role="img" aria-label="Maxed out">
        {[0, 1, 2, 3, 4].map((n) => (
          <Pixels key={n} art={STAR} className={styles.star} parts={{ shine: styles.shine }} style={{ "--i": n } as CSSProperties} />
        ))}
        <Pixels art={SPARK} className={styles.spark} />
      </span>
    </>
  );
}

export function Hud({
  hidden,
  day,
  clock,
  night,
  objective,
  chapter,
  stats,
  epoch,
  hearts,
  faceOf,
  glint,
  toast,
  onPause,
}: {
  hidden: boolean;
  day: string;
  clock: number;
  night: boolean;
  objective: string;
  chapter: Chapter;
  stats: StatValues;
  /** Changes when an act starts, so counters jump to its numbers instead of counting. */
  epoch: number;
  hearts: { john: number; jerry: number };
  faceOf: (who: string) => string | undefined;
  glint: number;
  toast: { text: string; id: number } | null;
  onPause: () => void;
}) {
  const hud = chapter.hud;
  // the pieces drop in one after another when the HUD first arrives; a
  // counter that turns up later just pops in
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArrived(true), 1600);
    return () => window.clearTimeout(id);
  }, []);
  let order = 0;
  const enter = () => ({ "--enter": arrived ? "0ms" : `${820 + order++ * 60}ms` }) as CSSProperties;

  return (
    <div className={styles.hud} data-hidden={hidden || undefined}>
      <div className={styles.card} data-ui="" style={{ "--enter": arrived ? "0ms" : "740ms" } as CSSProperties}>
        <div className={styles.when}>
          <Pixels art={clockArt(clock, night)} className={styles.clock} />
          <span className={styles.day}>{day}</span>
          <Time minutes={clock} />
        </div>
        <Objective text={objective} />
        {hud.ready ? <Readiness key={`r${epoch}`} label={hud.ready} value={stats.ready.v} ms={stats.ready.ms} /> : null}
        {hud.goal ? (
          <Meter key={`g${epoch}`} label="Revenue" value={stats.revenue.v} max={hud.goal} ms={stats.revenue.ms} format="money" tone="money" of={`$${hud.goal.toLocaleString("en-US")}`} />
        ) : null}
      </div>

      <div className={styles.chips} data-ui="">
        {hud.hearts ? (
          <div className={`${styles.chip} ${styles.hearts}`} data-chip="" style={enter()}>
            {(["john", "jerry"] as const).map((who) => (
              <span key={who} className={styles.person} title={SPEAKERS[who].name}>
                <img src={faceOf(who)} alt={SPEAKERS[who].name} />
                <span className={styles.heartRow} role="img" aria-label={`${hearts[who]} of 5 hearts`}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <Pixels key={`${n}${n < hearts[who] ? "on" : ""}`} art={n < hearts[who] ? HEART : HEART_EMPTY} className={styles.heart} style={{ "--i": n } as CSSProperties} />
                  ))}
                </span>
              </span>
            ))}
          </div>
        ) : hud.money === false ? null : (
          <div className={`${styles.chip} ${styles.money}`} data-chip="" style={enter()}>
            <span className={styles.dollar}>$</span>
            <Count key={`m${epoch}`} value={stats.money.v} ms={stats.money.ms} hop />
            {toast ? (
              <em key={toast.id} className={styles.toast}>
                {toast.text}
              </em>
            ) : null}
          </div>
        )}
        {hud.members ? (
          <div className={styles.chip} data-chip="" style={enter()}>
            <small>{typeof hud.members === "string" ? hud.members : "Members"}</small>
            <Count key={`n${epoch}`} value={stats.members.v} ms={stats.members.ms} hop />
          </div>
        ) : null}
        {hud.wins && stats.wins.v > 0 ? (
          <div className={styles.chip} data-chip="" style={enter()}>
            <small>1st places</small>
            <span className={styles.trophies} role="img" aria-label={`${stats.wins.v}`}>
              {Array.from({ length: stats.wins.v }, (_, n) => (
                <Pixels key={n} art={TROPHY} className={styles.trophy} style={{ "--i": n } as CSSProperties} />
              ))}
            </span>
          </div>
        ) : null}
        <div className={styles.chip} data-chip="" title="Handsome" style={enter()}>
          <Handsome glint={glint} />
        </div>
      </div>

      <button type="button" className={styles.pause} style={enter()} onMouseDown={(event) => event.preventDefault()} onClick={onPause} aria-label="Pause" data-ui="">
        <Pixels art={PAUSE} />
      </button>
    </div>
  );
}
