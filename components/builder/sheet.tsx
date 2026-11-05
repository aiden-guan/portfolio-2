"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { formatMonth, imageFocus } from "@/content/worlds";
import { leave, move } from "./address";
import type { GridHandle } from "./grid";
import { ArrowUpRight, Chevron, Cross, Trophy } from "./icons";
import { EASE_OUT, EASE_SHEET, ago, corners, fadeAway, freeze, ghost, rectTransform, reducedMotion, release } from "./motion";
import { HERO, Shot, THUMB, warm } from "./shot";
import { StatusMark } from "./status";
import type { Build } from "./types";
import styles from "./sheet.module.css";

// morph: the card's picture grows into the sheet, and back. slide: a phone's
// sheet, up from the bottom (opened from a link, or flicked away). rise: opened
// from a link on a wider screen, with no card to grow from. fade: reduced motion.
type Motion = "morph" | "slide" | "rise" | "fade";

export type SheetHandle = {
  /** Closes with the sheet's own motion; `fromHistory` when the back arrow already left its step. */
  close: (fromHistory?: boolean) => void;
};

const phone = () => window.matchMedia("(max-width: 639px)").matches;

const pad = (n: number) => String(n).padStart(2, "0");

const radius = (element: Element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;

// Scrolls the page underneath (locked, and covered) so the card the sheet is
// about to fold back into is on screen.
function bringIntoView(media: HTMLElement) {
  const box = media.getBoundingClientRect();
  if (box.top >= 64 && box.bottom <= window.innerHeight - 24) return;
  window.scrollBy({ top: box.top - (window.innerHeight - box.height) / 2, behavior: "instant" });
}

export function Sheet({
  ref,
  builds,
  initial,
  view: firstView,
  placeholder,
  from,
  now,
  grid,
  onClosed,
}: {
  ref?: Ref<SheetHandle>;
  builds: Build[];
  initial: string;
  /** Which of the build's pictures it opens on (the one the card was scrubbed to). */
  view: number;
  /** The file the card already has on screen, shown under the hero until its own arrives. */
  placeholder: string | null;
  from: "card" | "link";
  now: number;
  grid: RefObject<GridHandle | null>;
  onClosed: (slug: string) => void;
}) {
  const [index, setIndex] = useState(() => Math.max(0, builds.findIndex((build) => build.slug === initial)));
  const [view, setView] = useState(firstView);
  const build = builds[index];
  const count = builds.length;
  const images = [build.slug, ...(build.gallery ?? [])];
  const titleId = useId();

  const layer = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const heroGhosts = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const copyGhosts = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // where the sheet is in its life, and the card whose picture it has
  // lifted out of the grid
  const life = useRef<{ phase: "opening" | "open" | "closing"; lifted: HTMLElement | null }>({
    phase: "opening",
    lifted: null,
  });

  // While the hero stands in for a card's picture, the picture itself is
  // hidden, so the two never show at once.
  function lift(media: HTMLElement | null) {
    const state = life.current;
    if (state.lifted && state.lifted !== media) state.lifted.style.visibility = "";
    if (media) media.style.visibility = "hidden";
    state.lifted = media;
  }

  const parts = () => [...(layer.current?.querySelectorAll<HTMLElement>("[data-stagger]") ?? [])];

  const enter = useEffectEvent((media: HTMLElement | null) => {
    const shade = backdrop.current;
    const sheet = panel.current;
    const card = surface.current;
    const picture = hero.current;
    const running: Animation[] = [];
    if (!shade || !sheet || !card || !picture) return running;
    const motion: Motion = reducedMotion() ? "fade" : media ? "morph" : phone() ? "slide" : "rise";
    const play = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
      running.push(element.animate(keyframes, { fill: "backwards", ...options }));

    play(shade, [{ opacity: 0 }, { opacity: 1 }], { duration: motion === "fade" ? 200 : 420, easing: EASE_OUT });
    if (motion === "fade") {
      play(sheet, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
    } else if (motion === "slide") {
      play(sheet, [{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 560, easing: EASE_SHEET });
    } else {
      const grow = { duration: 560, easing: EASE_SHEET };
      if (motion === "morph" && media) {
        // The card's picture grows into the hero while the sheet unfolds out
        // of the card behind it, both with corners counter-scaled so they
        // stay as round as the card's on the way.
        const start = media.getBoundingClientRect();
        const round = radius(media);
        const box = picture.getBoundingClientRect();
        const area = card.getBoundingClientRect();
        play(
          picture,
          [
            { transform: rectTransform(box, start), borderRadius: corners(round, box, start) },
            { transform: "none", borderRadius: `${radius(picture)}px` },
          ],
          grow,
        );
        play(
          card,
          [
            { transform: rectTransform(area, start), borderRadius: corners(round, area, start), opacity: 0 },
            { opacity: 1, offset: 0.14 },
            { transform: "none", borderRadius: `${radius(card)}px`, opacity: 1 },
          ],
          grow,
        );
        lift(media);
      } else {
        const rise: Keyframe[] = [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }];
        play(picture, rise, grow);
        play(card, rise, grow);
      }
      parts().forEach((part, order) =>
        play(part, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
          duration: 520,
          delay: 150 + order * 32,
          easing: EASE_OUT,
        }),
      );
    }
    Promise.allSettled(running.map((animation) => animation.finished)).then(() => {
      const played = running.every((animation) => animation.playState === "finished");
      if (played && life.current.phase === "opening") life.current.phase = "open";
    });
    return running;
  });

  // Open at once, on the frame the click lands on: lock the page, start the
  // motion, and put focus inside.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    const state = life.current;
    const running = enter(from === "card" ? (grid.current?.media(initial) ?? null) : null);
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = overflow;
      // undone entirely, so a second run (React does one in development)
      // measures the sheet where it really lies
      for (const animation of running) animation.cancel();
      if (state.phase === "opening" && state.lifted) {
        state.lifted.style.visibility = "";
        state.lifted = null;
      }
    };
  }, [from, grid, initial]);

  // the builds either side, ready before they're asked for
  useEffect(() => {
    if (count < 2) return;
    warm(builds[(index + 1) % count].slug, HERO);
    warm(builds[(index - 1 + count) % count].slug, HERO);
  }, [builds, count, index]);

  function close({ velocity, fromHistory = false }: { velocity?: number; fromHistory?: boolean } = {}) {
    const state = life.current;
    if (state.phase === "closing") return;
    state.phase = "closing";
    if (!fromHistory) leave();
    const slug = build.slug;
    const done = () => {
      lift(null);
      onClosed(slug);
    };
    const root = layer.current;
    const shade = backdrop.current;
    const sheet = panel.current;
    const card = surface.current;
    const picture = hero.current;
    if (!root || !shade || !sheet || !card || !picture) return done();

    const moving = parts();
    for (const element of [shade, sheet, card, picture, ...moving]) freeze(element);

    let motion: Motion = reducedMotion() ? "fade" : velocity !== undefined ? "slide" : "morph";
    let media: HTMLElement | null = null;
    let target: DOMRect | null = null;
    if (motion === "morph") {
      media = grid.current?.media(slug) ?? null;
      if (media) {
        grid.current?.reveal(slug);
        bringIntoView(media);
        target = media.getBoundingClientRect();
      }
      const shown = picture.getBoundingClientRect();
      const offscreen = (box: DOMRect) => box.bottom < 0 || box.top > window.innerHeight;
      // with nothing to fold back into, or the hero scrolled away, it goes the plain way
      if (!target || offscreen(target) || offscreen(shown)) motion = phone() ? "slide" : "rise";
    }

    const running: Animation[] = [];
    const play = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
      running.push(element.animate(keyframes, { fill: "both", ...options }));

    if (motion === "morph" && media && target) {
      // The words go first; then the hero and the sheet fold back down into
      // the card together, from wherever they are (even part-way open).
      const round = radius(media);
      const pictureNow = release(picture);
      const pictureBox = picture.getBoundingClientRect();
      const cardNow = release(card);
      const cardBox = card.getBoundingClientRect();
      lift(media);
      // cards rest on their first picture: the hero turns back to it on the way down
      if (view !== 0) setView(0);
      for (const part of moving) play(part, [{ opacity: 0 }], { duration: 90, easing: "linear" });
      const fold = { duration: 480, delay: 50, easing: EASE_SHEET };
      play(picture, [pictureNow, { transform: rectTransform(pictureBox, target), borderRadius: corners(round, pictureBox, target) }], fold);
      play(
        card,
        [
          cardNow,
          { opacity: cardNow.opacity, offset: 0.4 },
          { transform: rectTransform(cardBox, target), borderRadius: corners(round, cardBox, target), opacity: 0 },
        ],
        fold,
      );
      play(shade, [{ opacity: 0 }], { duration: 420, delay: 70, easing: EASE_OUT });
    } else if (motion === "slide") {
      lift(null);
      // a flick carries on at its own speed
      const duration = velocity ? Math.min(420, Math.max(180, window.innerHeight / velocity)) : 420;
      play(sheet, [{ transform: "translateY(100%)" }], { duration, easing: EASE_SHEET });
      play(shade, [{ opacity: 0 }], { duration: Math.max(240, duration - 40), easing: EASE_OUT });
    } else if (motion === "rise") {
      lift(null);
      play(sheet, [{ opacity: 0, transform: "translateY(16px)" }], { duration: 260, easing: "cubic-bezier(0.4, 0, 1, 1)" });
      play(shade, [{ opacity: 0 }], { duration: 300, easing: EASE_OUT });
    } else {
      lift(null);
      play(root, [{ opacity: 0 }], { duration: 180, easing: "ease-out" });
    }
    Promise.allSettled(running.map((animation) => animation.finished)).then(done);
  }

  useImperativeHandle(ref, () => ({ close: (fromHistory) => close({ fromHistory }) }));

  function go(step: 1 | -1) {
    const state = life.current;
    if (state.phase !== "open" || count < 2) return;
    const next = (index + step + count) % count;
    const still = reducedMotion();
    const arriving = () => [
      ...(layer.current?.querySelectorAll<HTMLElement>("[data-thumbs]") ?? []),
      ...((copy.current?.children ?? []) as Iterable<HTMLElement>),
    ];
    // a step taken mid-way through the last one starts from its end
    for (const element of [stack.current, surface.current, ...arriving()]) {
      for (const animation of element?.getAnimations() ?? []) animation.finish();
    }
    const height = panel.current?.offsetHeight ?? 0;

    // The old picture holds still underneath while the new one wipes across
    // it from the side it comes from; the old words leave just ahead of the
    // new ones.
    if (stack.current && heroGhosts.current) {
      fadeAway(
        ghost(stack.current, heroGhosts.current),
        still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "none" }, { transform: `translateX(${-step * 12}%)` }],
        { duration: still ? 220 : 620, easing: EASE_SHEET },
      );
    }
    if (copy.current && copyGhosts.current) {
      fadeAway(
        ghost(copy.current, copyGhosts.current),
        still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-step * 16}px)` }],
        { duration: 160, easing: "ease-out" },
      );
    }

    flushSync(() => {
      setIndex(next);
      setView(0);
    });
    if (scroller.current) scroller.current.scrollTop = 0;
    if (state.lifted) lift(grid.current?.media(builds[next].slug) ?? null);
    move(builds[next].slug);

    if (still) {
      for (const element of [stack.current, ...arriving()]) {
        element?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out", fill: "backwards" });
      }
      return;
    }
    // the sheet's foot glides to the new build's height, corners kept round
    const card = surface.current;
    const grown = panel.current?.offsetHeight ?? 0;
    if (card && height && grown && Math.abs(height - grown) > 1 && !phone()) {
      const ratio = height / grown;
      const round = radius(card);
      card.animate([{ transform: `scaleY(${ratio})`, borderRadius: `${round}px / ${round / ratio}px` }, { transform: "none", borderRadius: `${round}px` }], {
        duration: 600,
        easing: EASE_SHEET,
      });
    }
    stack.current?.animate(
      [
        { clipPath: step > 0 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)", transform: `translateX(${step * 6}%)` },
        { clipPath: "inset(0 0 0 0)", transform: "none" },
      ],
      { duration: 620, easing: EASE_SHEET, fill: "backwards" },
    );
    arriving().forEach((element, order) =>
      element.animate([{ opacity: 0, transform: `translateX(${step * 20}px)` }, { opacity: 1, transform: "none" }], {
        duration: 500,
        delay: 110 + order * 32,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
  }

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      go(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (event.key !== "Tab") return;
    // focus goes round inside the sheet
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
      (element) => !element.closest("[inert]"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey ? active === first || active === event.currentTarget : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function outside(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) close();
  }

  // On a phone, pulling the sheet down from the top of its scroll lets it go.
  const letGo = useEffectEvent((velocity: number) => close({ velocity }));
  useEffect(() => {
    const area = scroller.current;
    const sheet = panel.current;
    const shade = backdrop.current;
    if (!area || !sheet || !shade) return;
    let state: "idle" | "maybe" | "dragging" = "idle";
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let offset = 0;

    const begin = (event: TouchEvent) => {
      const touch = event.touches[0];
      state = touch && event.touches.length === 1 && phone() && life.current.phase === "open" && area.scrollTop <= 0 ? "maybe" : "idle";
      startY = lastY = touch?.clientY ?? 0;
      lastTime = event.timeStamp;
      velocity = 0;
      offset = 0;
    };
    const drag = (event: TouchEvent) => {
      if (state === "idle") return;
      const y = event.touches[0]?.clientY ?? lastY;
      if (state === "maybe") {
        if (y - startY < -4 || area.scrollTop > 0) state = "idle";
        else if (y - startY > 8) {
          state = "dragging";
          freeze(sheet);
          freeze(shade);
        }
        if (state !== "dragging") return;
      }
      event.preventDefault();
      velocity = (y - lastY) / Math.max(1, event.timeStamp - lastTime);
      lastY = y;
      lastTime = event.timeStamp;
      offset = Math.max(0, y - startY - 8);
      sheet.style.transform = `translateY(${offset}px)`;
      shade.style.opacity = String(1 - Math.min(1, offset / window.innerHeight));
    };
    const end = () => {
      if (state !== "dragging") {
        state = "idle";
        return;
      }
      state = "idle";
      if (offset > 120 || velocity > 0.5) {
        letGo(Math.max(0, velocity));
        return;
      }
      // not far enough: back up
      const back = { duration: 420, easing: EASE_SHEET };
      sheet.animate([{ transform: `translateY(${offset}px)` }, { transform: "none" }], back);
      shade.animate([{ opacity: shade.style.opacity }, { opacity: 1 }], back);
      sheet.style.transform = "";
      shade.style.opacity = "";
    };

    area.addEventListener("touchstart", begin, { passive: true });
    area.addEventListener("touchmove", drag, { passive: false });
    area.addEventListener("touchend", end);
    area.addEventListener("touchcancel", end);
    return () => {
      area.removeEventListener("touchstart", begin);
      area.removeEventListener("touchmove", drag);
      area.removeEventListener("touchend", end);
      area.removeEventListener("touchcancel", end);
    };
  }, []);

  const previous = builds[(index - 1 + count) % count];
  const next = builds[(index + 1) % count];
  // the card's own file sits under the first picture, so the morph never
  // starts on an empty frame while the bigger one loads
  const under = (image: string, i: number): CSSProperties | undefined =>
    placeholder && build.slug === initial && i === firstView
      ? { backgroundImage: `url("${placeholder}")`, backgroundPosition: imageFocus(image) }
      : undefined;

  return (
    <div ref={layer} className={styles.layer} style={{ "--accent": build.accent } as CSSProperties}>
      <div ref={backdrop} className={styles.backdrop} />
      <div
        ref={scroller}
        className={styles.scroller}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keys}
      >
        <div className={styles.frame} onClick={outside}>
          <div ref={panel} className={styles.panel}>
            <div ref={surface} className={styles.surface} />
            <div className={styles.content}>
              <div className={styles.head} data-stagger="">
                <p className={styles.place}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.at}>{pad(index + 1)}</span>
                  <span aria-hidden="true">/</span>
                  <span className={styles.quiet}>of</span>
                  <span>{pad(count)}</span>
                </p>
                <div className={styles.controls}>
                  {count > 1 ? (
                    <>
                      <button type="button" className={styles.icon} aria-label={`Previous: ${previous.name}`} onClick={() => go(-1)}>
                        <Chevron direction="left" />
                      </button>
                      <button type="button" className={styles.icon} aria-label={`Next: ${next.name}`} onClick={() => go(1)}>
                        <Chevron direction="right" />
                      </button>
                    </>
                  ) : null}
                  <button ref={closeButton} type="button" className={styles.icon} aria-label="Close" onClick={() => close()}>
                    <Cross />
                  </button>
                </div>
              </div>

              <div className={styles.media}>
                <div ref={hero} className={styles.hero} data-tone={build.tone}>
                  <div ref={stack} className={styles.stack}>
                    {images.map((image, i) => (
                      <div
                        key={image}
                        className={styles.view}
                        style={under(image, i)}
                        data-active={i === view ? "" : undefined}
                        aria-hidden={i === view ? undefined : true}
                      >
                        <Shot image={image} alt={i === 0 ? build.name : `${build.name}, ${i + 1} of ${images.length}`} slot={HERO} eager />
                      </div>
                    ))}
                  </div>
                  <div ref={heroGhosts} className={styles.behind} aria-hidden="true" />
                </div>
                {images.length > 1 ? (
                  <div className={styles.thumbs} data-stagger="" data-thumbs="">
                    {images.map((image, i) => (
                      <button
                        key={image}
                        type="button"
                        className={styles.thumb}
                        aria-label={`${build.name}, image ${i + 1} of ${images.length}`}
                        aria-pressed={i === view}
                        onClick={() => setView(i)}
                      >
                        <Shot image={image} alt="" slot={THUMB} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={styles.body}>
                <div ref={copy} className={styles.copy}>
                  <h2 id={titleId} className={styles.name} data-stagger="">
                    {build.name}
                  </h2>
                  <p className={styles.line} data-stagger="">
                    {build.line}
                  </p>
                  <p className={styles.about} data-stagger="">
                    {build.about}
                  </p>
                  <dl className={styles.facts} data-stagger="">
                    <dt>Status</dt>
                    <dd>
                      <StatusMark status={build.status} />
                      {build.status}
                    </dd>
                    <dt>When</dt>
                    <dd>{formatMonth(build.date)}</dd>
                    {build.event ? (
                      <>
                        <dt>Event</dt>
                        <dd>{build.event}</dd>
                      </>
                    ) : null}
                    {build.award ? (
                      <>
                        <dt>Award</dt>
                        <dd>
                          <Trophy className={styles.trophy} />
                          {build.award}
                        </dd>
                      </>
                    ) : null}
                    <dt>Stack</dt>
                    <dd>
                      <ul className={styles.chips}>
                        {build.stack.map((tool) => (
                          <li key={tool}>{tool}</li>
                        ))}
                      </ul>
                    </dd>
                    {build.pushedAt ? (
                      <>
                        <dt>Updated</dt>
                        <dd>{ago(build.pushedAt, now)}</dd>
                      </>
                    ) : null}
                  </dl>
                  {build.live || build.source ? (
                    <div className={styles.actions} data-stagger="">
                      {build.live ? (
                        <a className={styles.primary} href={build.live} target="_blank" rel="noreferrer">
                          Visit <ArrowUpRight />
                        </a>
                      ) : null}
                      {build.source ? (
                        <a className={build.live ? styles.secondary : styles.primary} href={build.source} target="_blank" rel="noreferrer">
                          Source <ArrowUpRight />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div ref={copyGhosts} className={styles.ghosts} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className={styles.quiet} aria-live="polite">
        {`${build.name}, ${index + 1} of ${count}`}
      </p>
    </div>
  );
}
