"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Vector3 } from "three";
import { ZONES, type Wingman } from "./wingman";
import styles from "./wingman.module.css";

// Wingman's own HUD: how far, how many, the throw meter, the dives left,
// the words that pop up where things happen, and the cards between throws.
// Discrete things come from the game's snapshot; the numbers that change
// every frame are written straight into the page.

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

  useEffect(() => {
    const nodes = new Map<number, HTMLElement>();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const live = game.live();
      if (distance.current) distance.current.textContent = `${live.distance} m`;
      if (needle.current) needle.current.style.left = `${(live.meter * 100).toFixed(1)}%`;
      const host = layer.current;
      if (!host) return;
      const seen = new Set<number>();
      for (const p of live.popups) {
        seen.add(p.id);
        let el = nodes.get(p.id);
        if (!el) {
          el = document.createElement("span");
          el.className = styles.popup;
          el.dataset.tone = p.tone;
          const word = document.createElement("b");
          word.textContent = p.text;
          el.appendChild(word);
          host.appendChild(el);
          nodes.set(p.id, el);
        }
        const s = project(p.at);
        el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      }
      for (const [id, el] of nodes)
        if (!seen.has(id)) {
          el.remove();
          nodes.delete(id);
        }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const el of nodes.values()) el.remove();
    };
  }, [game, project]);

  const zone = ZONES[view.zone];
  const key = touch ? null : <kbd>E</kbd>;
  const best = view.results.length ? Math.max(...view.results.map((r) => r.distance)) : 0;
  const top = view.results.reduce((t, r) => Math.max(t, ZONES.findIndex((z) => z.rating === r.top)), 0);

  return (
    <div className={styles.hud} data-phase={view.phase}>
      <div className={styles.popups} ref={layer} aria-hidden="true" />

      {view.phase !== "title" && view.phase !== "results" && view.phase !== "done" ? (
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

      {view.phase === "aim" ? (
        <div className={styles.meter} data-ui="">
          <div className={styles.track}>
            <i className={styles.sweet} />
            <i className={styles.needle} ref={needle} />
          </div>
          <span className={styles.hint}>
            {key} {touch ? "Tap in the gold to throw" : "throw in the gold"}
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
            <li>Three throws: the beach, the pier, the marina</li>
            <li>Watch out for boyfriends</li>
          </ul>
          <span className={styles.hint}>
            {key} {touch ? "Tap to start" : "start"}
          </span>
        </div>
      ) : null}

      {view.phase === "results" || view.phase === "done" ? (
        <div className={styles.results}>
          <small className={styles.kicker}>Summer stats</small>
          <h2>A busy summer</h2>
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
              <dd>{best} m</dd>
            </div>
            <div>
              <dt>Baddies rizzed</dt>
              <dd>{view.total}</dd>
            </div>
            <div>
              <dt>Baddest</dt>
              <dd>{ZONES[top].rating}</dd>
            </div>
          </dl>
          <span className={styles.hint}>
            {key} {touch ? "Tap to go back" : "back to graduation"}
          </span>
        </div>
      ) : null}

      <div className={styles.wipe} data-on={view.wipe ? "" : undefined} />
    </div>
  );
}
