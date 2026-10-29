"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { ArcadeHandle, ArcadePhase } from "@/components/break/arcade";
import { mountCorruption } from "@/components/break/corrupt";
import { breakSignal } from "@/components/break/signal";
import { SoundToggle } from "@/components/sound-toggle";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
const subscribeReady = () => () => {};
const subscribeMotion = (notify: () => void) => {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function BreakRun({
  children,
  footer,
  name,
}: {
  children: ReactNode;
  footer: ReactNode;
  name: string;
}) {
  const ready = useSyncExternalStore(
    subscribeReady,
    () => true,
    () => false,
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const run = useRef<HTMLElement>(null);
  const shake = useRef<HTMLDivElement>(null);
  const fractures = useRef<HTMLDivElement>(null);
  const monitor = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const corruption = useRef<HTMLCanvasElement>(null);
  const game = useRef<ArcadeHandle | null>(null);
  const actions = useRef({ open: () => {}, leave: () => {} });
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<ArcadePhase>("loading");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!ready || !corruption.current) return;
    breakSignal.reduced = reduced;
    return mountCorruption(corruption.current);
  }, [ready, reduced]);

  useEffect(() => {
    if (!live || !glass.current) return;
    let cancelled = false;
    const host = glass.current;
    // The game code is downloaded only after the monitor takes over.
    import("@/components/break/arcade")
      .then(({ mountArcade }) => {
        if (cancelled) return;
        game.current = mountArcade(host, setPhase, setPaused, reduced);
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
      game.current?.stop();
      game.current = null;
    };
  }, [live, reduced]);

  useEffect(() => {
    const section = run.current;
    const card = shake.current;
    const screen = monitor.current;
    const slices = fractures.current;
    if (!ready || !section || !card || !screen || !slices) return;
    let raf = 0;
    let engaged = false;
    let dismissed = false;
    let target = 0;
    let progress = 0;
    let top = 0;
    let distance = 1;
    let pageDistance = 1;
    let vw = innerWidth;
    let vh = innerHeight;
    let cardWidth = 480;
    let last = 0;
    let lockY = 0;
    let savedStyle = "";
    let previousFocus: HTMLElement | null = null;
    let restorations: (() => void)[] = [];
    const pieces: HTMLElement[] = [];
    const original = card.querySelector<HTMLElement>(".thing");

    // Real slices of the final printed object, so the breakup belongs to the page.
    if (original) {
      for (let i = 0; i < 22; i++) {
        const copy = original.cloneNode(true) as HTMLElement;
        copy.removeAttribute("id");
        copy.removeAttribute("tabindex");
        copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        copy.inert = true;
        if (i < 14)
          copy.style.clipPath = `inset(${(i * 100) / 14}% 0 ${Math.max(0, 100 - ((i + 1) * 100) / 14)}% 0)`;
        else {
          const col = (i - 14) % 4,
            row = Math.floor((i - 14) / 4);
          copy.style.clipPath = `inset(${row * 43 + 6}% ${76 - col * 24}% ${55 - row * 43}% ${col * 24}%)`;
        }
        slices.append(copy);
        pieces.push(copy);
      }
    }

    function measure() {
      if (engaged) return;
      vw = innerWidth;
      vh = innerHeight;
      top = section!.getBoundingClientRect().top + scrollY;
      distance = Math.max(1, section!.offsetHeight - vh);
      pageDistance = Math.max(1, top - vh * 0.5);
      cardWidth = card!.offsetWidth || Math.min(480, vw * 0.75);
    }

    function unlock() {
      document.body.style.cssText = savedStyle;
      if (!engaged) measure();
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo({ top: top, behavior: "instant" });
      document.documentElement.style.scrollBehavior = "";
      for (const restore of restorations) restore();
      restorations = [];
    }

    function open() {
      if (engaged) return;
      engaged = true;
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      lockY = scrollY;
      savedStyle = document.body.style.cssText;
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      // Everything outside the monitor is unavailable to keyboard and assistive tech.
      restorations = [...document.body.children]
        .filter(
          (el) =>
            el !== screen &&
            el !== corruption.current &&
            el instanceof HTMLElement &&
            el.tagName !== "SCRIPT",
        )
        .map((el) => {
          const node = el as HTMLElement;
          const was = node.inert;
          node.inert = true;
          return () => {
            node.inert = was;
          };
        });
      document.documentElement.dataset.break = "live";
      window.dispatchEvent(new Event("aiden-arcade-change"));
      breakSignal.live = true;
      screen!.style.transform = "none";
      screen!.style.clipPath = "none";
      screen!.style.opacity = "1";
      screen!.style.visibility = "visible";
      setLive(true);
    }

    function leave() {
      if (!engaged) return;
      engaged = false;
      dismissed = true;
      progress = target = 0;
      breakSignal.live = false;
      delete document.documentElement.dataset.break;
      window.dispatchEvent(new Event("aiden-arcade-change"));
      screen!.style.opacity = "0";
      screen!.style.visibility = "hidden";
      setLive(false);
      setPhase("loading");
      setPaused(false);
      unlock();
      (previousFocus?.isConnected && !previousFocus.closest("[inert]")
        ? previousFocus
        : section!.querySelector<HTMLElement>(".break-open")
      )?.focus({ preventScroll: true });
    }
    actions.current = { open, leave };

    function draw(now: number) {
      raf = 0;
      if (document.hidden) return;
      const y = engaged ? lockY : scrollY;
      const raw = clamp((y - top) / distance);
      const dt = Math.min(50, now - last || 16);
      last = now;
      target = dismissed || reduced ? 0 : raw;
      progress += (target - progress) * (1 - Math.exp(-dt / 65));
      if (Math.abs(progress - target) < 0.0002) progress = target;
      if (dismissed && y < top - vh * 0.35) dismissed = false;
      const p = progress;
      breakSignal.fracture =
        smooth((p - 0.04) / 0.4) * (1 - smooth((p - 0.48) / 0.16));
      breakSignal.spread = dismissed
        ? 0
        : Math.max(
            clamp(y / pageDistance) * 0.72,
            0.72 + p * 0.28 * (raw > 0 ? 1 : 0),
          );
      // At the top there is no corruption; it grows with the actual story.
      if (y < top) breakSignal.spread = clamp(y / pageDistance) * 0.72;
      const fracture =
        smooth((p - 0.04) / 0.4) * (1 - smooth((p - 0.42) / 0.16));
      const morph = smooth((p - 0.32) / 0.28);
      const zoom = smooth((p - 0.52) / 0.46);
      const tick = Math.floor(now / 85);
      const jitter = reduced ? 0 : fracture;
      card!.style.transform = `translate3d(${Math.sin(tick * 5.7) * jitter * 4}px,${Math.cos(tick * 3.1) * jitter * 2}px,0) scale(${1 - morph * 0.08})`;
      card!.style.opacity = String(1 - smooth((p - 0.35) / 0.18));
      card!.inert = p > 0.08;
      pieces.forEach((piece, i) => {
        const burst = Math.sin(tick * 0.8 + i * 1.4) > 0.3 ? 1 : 0.12;
        const chip = i >= 14;
        piece.style.transform = `translate3d(${Math.sin(tick * 1.1 + i * 3.5) * jitter * burst * (chip ? 84 : 26 + i * 2)}px,${jitter * Math.sin(i * 8) * (chip ? 40 : 4)}px,0) scaleX(${1 + jitter * burst * (chip ? 0.04 : Math.sin(i) * 0.035)})`;
        piece.style.opacity = String(jitter * 0.85);
      });
      const small = Math.min(0.58, (cardWidth * 1.08) / vw);
      if (!engaged) {
        screen!.style.transform = `translate3d(0,${-vh * 0.03 * (1 - zoom)}px,0) scale(${small + (1 - small) * zoom})`;
        screen!.style.opacity = String(morph);
        screen!.style.clipPath =
          morph < 0.99 ? `inset(${(1 - morph) * 46}% 0 round 12px)` : "none";
        screen!.style.visibility = morph > 0.001 ? "visible" : "hidden";
      }
      if (!reduced && !dismissed && !engaged && raw >= 0.995 && p > 0.984)
        open();
      if (
        !engaged &&
        ((p > 0.02 && p < 0.62) || Math.abs(progress - target) > 0.0002)
      )
        raf = requestAnimationFrame(draw);
    }

    function wake() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    }
    function resized() {
      measure();
      wake();
    }
    function onKey(event: KeyboardEvent) {
      if (!engaged) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        leave();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...screen!.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [tabindex='0']",
        ),
      ].filter((el) => el.offsetParent !== null && !el.closest("[inert]"));
      const first = controls[0],
        end = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !screen!.contains(document.activeElement))
      ) {
        event.preventDefault();
        end?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === end ||
          !screen!.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    }
    const sizes = new ResizeObserver(resized);
    sizes.observe(section);
    if (section.parentElement) sizes.observe(section.parentElement);
    measure();
    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", resized);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", resized);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", wake);
      pieces.forEach((piece) => piece.remove());
      if (engaged) unlock();
      delete document.documentElement.dataset.break;
      window.dispatchEvent(new Event("aiden-arcade-change"));
      breakSignal.live = false;
      breakSignal.spread = 0;
      breakSignal.fracture = 0;
    };
  }, [ready, reduced]);

  useEffect(() => {
    if (!live) return;
    const selector = paused
      ? ".crt-pause .crt-launch"
      : phase === "intro" || phase === "fight" || phase === "transform"
        ? ".crt-glass > canvas"
        : ".crt-launch:not([disabled]), .crt-leave";
    const first = monitor.current?.querySelector<HTMLElement>(selector);
    first?.focus({ preventScroll: true });
  }, [live, phase, paused]);

  const start = () => {
    game.current?.start();
    glass.current?.querySelector("canvas")?.focus();
  };
  const inPlay =
    phase === "intro" || phase === "fight" || phase === "transform";

  return (
    <section
      className="break-run"
      id="break"
      ref={run}
      aria-label="Arcade entrance"
    >
      <div className="break-sticky">
        <div className="break-object">
          <div className="break-shake" ref={shake}>
            {children}
          </div>
          <div
            className="break-fractures"
            ref={fractures}
            aria-hidden="true"
            inert
          />
        </div>
        <div className="break-invitation">
          <button
            className="break-open"
            type="button"
            disabled={!ready}
            onClick={() => actions.current.open()}
          >
            Arcade
          </button>
        </div>
        {footer}
      </div>
      {ready
        ? createPortal(
            <>
              <canvas ref={corruption} className="corrupt" aria-hidden="true" />
              <div
                ref={monitor}
                className="crt"
                role="dialog"
                aria-modal={live || undefined}
                aria-hidden={!live}
                aria-label={`${name} · Arcade`}
                inert={!live}
                data-phase={phase}
              >
                <div className="crt-case-top" aria-hidden="true">
                  <span>GUAN</span>
                  <span>28</span>
                </div>
                <div className="crt-bezel">
                  <div className="crt-glass" ref={glass}>
                    <canvas
                      tabIndex={live && inPlay && !paused ? 0 : -1}
                      role="img"
                      aria-label="Move with WASD, arrow keys, or drag. Auto-fire. Space to dash. Hold Shift for precise movement. X for a pulse. P to pause. Escape to exit."
                    />
                    <div className="crt-scan" aria-hidden="true" />
                    <div className="crt-vignette" aria-hidden="true" />
                    <div className="crt-hud" aria-hidden="true">
                      <div className="crt-boss-label">
                        GUAN <span data-stage="">I</span>
                      </div>
                      <div className="crt-health">
                        <span data-signal="" />
                      </div>
                      <span className="crt-score" data-score="">
                        000000
                      </span>
                    </div>
                    {(phase === "loading" ||
                      phase === "ready" ||
                      phase === "error") && (
                      <div className="crt-welcome">
                        <h2>GUAN</h2>
                        <div className="crt-start-controls">
                          <button
                            type="button"
                            className="crt-launch"
                            onClick={start}
                            disabled={phase !== "ready"}
                          >
                            {phase === "loading"
                              ? "Loading…"
                              : phase === "error"
                                ? "Unavailable"
                                : "Play"}
                          </button>
                          {phase === "error" ? (
                            <p className="crt-controls">
                              Couldn’t load. Exit and retry.
                            </p>
                          ) : (
                            <div className="crt-control-legend">
                              <span>
                                <kbd>WASD</kbd>
                                <span className="crt-desktop-control">
                                  {" "}
                                  / Arrows
                                </span>
                                <span className="crt-touch-control">Drag</span>
                              </span>
                              <span className="crt-focus-hint">
                                <kbd>SHIFT</kbd> Focus
                              </span>
                              <span>
                                <kbd>SPACE</kbd> Dash
                              </span>
                              <span>
                                <kbd>X</kbd> Pulse
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {inPlay && (
                      <div className="crt-flight-bar" inert={paused}>
                        <div className="crt-player-hud">
                          <span
                            className="crt-lives"
                            data-hull=""
                            aria-label="Three shields remaining"
                          >
                            ◆ ◆ ◆
                          </span>
                          <span className="crt-combo" data-combo="" />
                        </div>
                        <div className="crt-abilities">
                          <button
                            type="button"
                            className="crt-ability"
                            data-dash-button=""
                            aria-label="Dash. Space."
                            onClick={() => game.current?.dash()}
                          >
                            <span className="crt-ability-fill" data-dash="" />

                            <span>
                              Dash <kbd>SPACE</kbd>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="crt-ability"
                            data-pulse-button=""
                            aria-label="Pulse. X."
                            onClick={() => game.current?.pulse()}
                          >
                            <span className="crt-ability-fill" data-energy="" />

                            <span>
                              Pulse <kbd>X</kbd>
                            </span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="crt-pause-button"
                          onClick={() => game.current?.togglePause()}
                          aria-label="Pause game"
                        >
                          Ⅱ
                        </button>
                      </div>
                    )}
                    {paused && (
                      <div className="crt-pause">
                        <button
                          className="crt-launch"
                          onClick={() => game.current?.togglePause()}
                        >
                          Resume
                        </button>
                      </div>
                    )}
                    {(phase === "win" || phase === "lose") && (
                      <div className="crt-end" role="status">
                        <h2>{phase === "win" ? "CLEAR" : "GAME OVER"}</h2>
                        <span className="crt-result-score" data-result-score="">
                          000000
                        </span>
                        <span className="crt-best">
                          BEST <span data-best="">000000</span>
                        </span>
                        <button
                          className="crt-launch"
                          onClick={() => game.current?.reset()}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="crt-chin">
                  <span className="crt-logotype">guan</span>
                  <div className="crt-vents" aria-hidden="true" />
                  <SoundToggle />
                  <button
                    type="button"
                    className="crt-leave"
                    onClick={() => actions.current.leave()}
                  >
                    <span className="crt-led" aria-hidden="true" />
                    Exit <kbd>ESC</kbd>
                  </button>
                </div>
              </div>
              <span className="sr-only" role="status" aria-live="polite">
                {live
                  ? paused
                    ? "Game paused"
                    : phase === "transform"
                      ? "Second stage: catboy"
                      : phase === "fight"
                        ? "Boss fight started"
                        : phase === "win"
                          ? "You won"
                          : phase === "lose"
                            ? "Game over"
                            : "Arcade open"
                  : ""}
              </span>
            </>,
            document.body,
          )
        : null}
    </section>
  );
}
