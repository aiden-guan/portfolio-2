"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Vector3 } from "three";
import { recordBest, type Best, type Rank } from "./screen-kit";
import { ZONES, type Wingman } from "./wingman";
import styles from "./wingman.module.css";

// Wingman's own HUD: how far, how many, the throw meter, the dives left,
// the words that pop up where things happen, a few speed lines when John
// is really moving, and the cards between throws. Discrete things come from
// the game's snapshot; the numbers that change every frame are written
// straight into the page, and only when they change.

// a summer, ranked by how many baddies John got to; the course caps it near forty
const rankOf = (rizzed: number): Rank => (rizzed >= 34 ? "S" : rizzed >= 26 ? "A" : rizzed >= 14 ? "B" : "C");
const REASON: Record<Rank, [string, string]> = {
  S: ["A busy summer", "John has no follow-up questions."],
  A: ["A busy summer", "John has a few questions."],
  B: ["Busy enough", "John is unconvinced."],
  C: ["A quiet summer", "John wants names."],
};
// the speed lines' strength, in steps, so the page is written only when it changes
const LINES = ["0", "0.12", "0.24", "0.36", "0.48", "0.6"];

export function WingmanHud({
  game,
  project,
  touch,
  onPause,
}: {
  game: Wingman;
  project: (point: Vector3) => { x: number; y: number };
  touch: boolean;
  onPause: () => void;
}) {
  const view = useSyncExternalStore(game.subscribe, game.snapshot, game.snapshot);
  const distance = useRef<HTMLElement>(null);
  const needle = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const [best, setBest] = useState<{ before: Best | null; fresh: boolean } | null>(null);
  const kept = useRef<{ before: Best | null; fresh: boolean } | null>(null);

  useEffect(() => {
    const nodes = new Map<number, { el: HTMLElement; seen: number }>();
    const words = new Map<number, string>();
    let raf = 0;
    let frame = 0;
    let shownDistance = -1;
    let shownLines = -1;
    // drop the pops that have gone, without a new set every frame
    const sweep = (node: { el: HTMLElement; seen: number }, id: number) => {
      if (node.seen === frame) return;
      node.el.remove();
      nodes.delete(id);
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      frame += 1;
      const live = game.live();
      if (live.distance !== shownDistance && distance.current) {
        shownDistance = live.distance;
        let text = words.get(live.distance);
        if (!text) {
          text = `${live.distance} m`;
          words.set(live.distance, text);
        }
        distance.current.textContent = text;
      }
      if (needle.current) needle.current.style.transform = `translate3d(${(live.meter * 100).toFixed(2)}%, 0, 0)`;
      const level = Math.max(0, Math.min(LINES.length - 1, Math.floor((live.speed - 13) / 3)));
      if (level !== shownLines && lines.current) {
        shownLines = level;
        lines.current.style.opacity = LINES[level];
      }
      const host = layer.current;
      if (!host) return;
      for (let i = 0; i < live.popups.length; i += 1) {
        const p = live.popups[i];
        let node = nodes.get(p.id);
        if (!node) {
          const el = document.createElement("span");
          el.className = styles.popup;
          el.dataset.tone = p.tone;
          const word = document.createElement("b");
          word.textContent = p.text;
          el.appendChild(word);
          host.appendChild(el);
          node = { el, seen: frame };
          nodes.set(p.id, node);
        }
        node.seen = frame;
        const s = project(p.at);
        node.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      }
      nodes.forEach(sweep);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      nodes.forEach((node) => node.el.remove());
    };
  }, [game, project]);

  const zone = ZONES[view.zone];
  const key = touch ? null : <kbd>E</kbd>;
  const furthest = view.results.length ? Math.max(...view.results.map((r) => r.distance)) : 0;
  const top = view.results.reduce((t, r) => Math.max(t, ZONES.findIndex((z) => z.rating === r.top)), 0);
  const over = view.phase === "results" || view.phase === "done";
  const rank = rankOf(view.total);
  const label = `${view.total} rizzed · ${furthest} m`;

  // the best summer, kept once the results are in
  useEffect(() => {
    if (!over) return;
    // once, and kept across a remount
    kept.current ??= recordBest("wingman", { score: view.total * 1000 + furthest, rank, label });
    const result = kept.current;
    const id = window.setTimeout(() => setBest(result), 0);
    return () => window.clearTimeout(id);
  }, [over, view.total, furthest, rank, label]);

  return (
    <div className={styles.hud} data-phase={view.phase}>
      <div className={styles.lines} ref={lines} aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <div className={styles.popups} ref={layer} aria-hidden="true" />

      {view.phase !== "title" && !over ? (
        <div className={styles.top}>
          <div className={styles.card} data-ui="">
            <span className={styles.kicker}>
              Throw {Math.min(view.round + 1, view.rounds)} of {view.rounds} · {view.place}
            </span>
            <strong ref={distance} className={styles.distance}>
              0 m
            </strong>
            <span className={styles.count}>
              <i aria-hidden="true">♥</i> {view.rizzed} this throw · {view.total} in all
            </span>
            {view.combo >= 2 && view.phase === "flight" ? (
              <b className={styles.combo} key={view.combo} data-hot={view.combo >= 5 || undefined}>
                ×{view.combo}
              </b>
            ) : null}
          </div>
          <div className={styles.right} data-ui="">
            <div className={styles.dives} title="Dives left">
              <small>Dives</small>
              <span>
                {[0, 1, 2].map((n) => (
                  <i key={n} data-on={n < view.dives || undefined} />
                ))}
              </span>
            </div>
            <button type="button" className={styles.pause} onClick={onPause} aria-label="Pause">
              <svg viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
                <path d="M2 2h2v6H2zM6 2h2v6H6z" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {view.zone > 0 && (view.phase === "flight" || view.phase === "landed") ? (
        <div className={styles.zone} key={view.zone} aria-live="polite">
          <small>Now entering</small>
          <strong>{zone.name}</strong>
          <span>{zone.rating}s only</span>
        </div>
      ) : null}

      {view.phase === "aim" || view.phase === "windup" ? (
        <div className={styles.meter} data-ui="" data-locked={view.phase === "windup" ? view.power : undefined}>
          <div className={styles.track}>
            <i className={styles.weak} />
            <i className={styles.good} />
            <i className={styles.sweet} />
            <span className={styles.needleLayer} ref={needle}>
              <i className={styles.needle} />
            </span>
          </div>
          <div className={styles.meterFoot}>
            <small>weak</small>
            <small>good</small>
            <small data-gold="">perfect</small>
          </div>
          <span className={styles.hint}>
            {view.phase === "windup" ? (
              <b className={styles.verdict} data-power={view.power}>
                {view.power === "PERFECT" ? "Perfect throw" : view.power === "GOOD" ? "Good throw" : "Weak throw"}
              </b>
            ) : (
              <>
                {key} {touch ? "Tap in the gold to throw" : "throw in the gold"}
              </>
            )}
          </span>
        </div>
      ) : null}

      {view.phase === "flight" ? (
        <p className={styles.tip}>
          {key} {touch ? "Tap to dive onto a baddie" : "dive onto a baddie"}
        </p>
      ) : null}

      {view.phase === "landed" && view.results.length ? (
        <div className={styles.landed}>
          <small>Throw {view.results.length}</small>
          <strong>{view.results.at(-1)!.distance} m</strong>
          <span>
            {view.results.at(-1)!.rizzed} rizzed · {view.results.at(-1)!.top}s reached
          </span>
        </div>
      ) : null}

      {view.phase === "title" ? (
        <div className={styles.title}>
          <small className={styles.kicker}>Summer, 2026</small>
          <h2>
            WING<span>MAN</span>
          </h2>
          <p>Throw John. Land him on the baddies. Every one he rizzes bounces him further down the coast, and the further he goes, the badder they get.</p>
          <ul>
            <li>
              {key} {touch ? "Tap in the gold" : "in the gold"} to throw
            </li>
            <li>
              {key} {touch ? "Tap again" : "again"} mid-air to dive
            </li>
            <li>Chain them without touching the sand</li>
            <li>Watch out for boyfriends</li>
          </ul>
          <span className={styles.hint}>
            {key} {touch ? "Tap to start" : "start"}
          </span>
        </div>
      ) : null}

      {over ? (
        <div className={styles.results}>
          <small className={styles.kicker}>Summer stats</small>
          <div className={styles.verdictRow}>
            <b className={styles.rank} data-rank={rank} aria-label={`Rank ${rank}`}>
              {rank}
            </b>
            <div>
              <h2>{REASON[rank][0]}</h2>
              <p>{REASON[rank][1]}</p>
            </div>
          </div>
          <ol>
            {view.results.map((r, i) => (
              <li key={i}>
                <span>Throw {i + 1}</span>
                <b>{r.distance} m</b>
                <span>{r.rizzed} rizzed</span>
                <em>{r.top}s</em>
              </li>
            ))}
          </ol>
          <dl>
            <div>
              <dt>Furthest</dt>
              <dd>{furthest} m</dd>
            </div>
            <div>
              <dt>Rizzed</dt>
              <dd>{view.total}</dd>
            </div>
            <div>
              <dt>Best chain</dt>
              <dd>×{view.bestCombo}</dd>
            </div>
            <div>
              <dt>Baddest</dt>
              <dd>{ZONES[top].rating}</dd>
            </div>
          </dl>
          <span className={styles.best}>
            {best?.fresh && best.before ? (
              <em>New best</em>
            ) : best && !best.fresh && best.before ? (
              <>
                Best: <b>{best.before.rank}</b> · {best.before.label}
              </>
            ) : null}
          </span>
          <span className={styles.hint}>
            {key} {touch ? "Tap to go back" : "back to graduation"}
          </span>
        </div>
      ) : null}

      <div className={styles.wipe} data-on={view.wipe ? "" : undefined} />
    </div>
  );
}
