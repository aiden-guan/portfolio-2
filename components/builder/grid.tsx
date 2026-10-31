"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
} from "react";
import { formatMonth } from "@/content/worlds";
import { PILL_CLEARANCE, type PillHandle } from "./cursor";
import { Trophy } from "./icons";
import { EASE_OUT, EASE_SHEET, fadeAway, ghost, reducedMotion } from "./motion";
import { Shot } from "./shot";
import { StatusMark } from "./status";
import type { Build } from "./types";
import styles from "./grid.module.css";

const CARD_SIZES = "(min-width: 1440px) 440px, (min-width: 1100px) 30vw, (min-width: 640px) 45vw, 100vw";

export type GridHandle = {
  /** Before the filter changes: where each card is now. The ones about to go fade out as copies. */
  measure: (next: Set<string>) => Map<string, DOMRect>;
  /** After it has: the cards that stayed glide over from there, new ones fade in. */
  settle: (before: Map<string, DOMRect>) => void;
  card: (slug: string) => HTMLAnchorElement | null;
  media: (slug: string) => HTMLElement | null;
  /** Shows a card at once if it hasn't scrolled into view yet. */
  reveal: (slug: string) => void;
};

// A card coming into view: the picture unmasks upward from its bottom edge
// while it settles out of a slight zoom, and the words rise in behind it.
function arrive(item: HTMLElement, delay: number) {
  item.dataset.shown = "";
  const media = item.querySelector<HTMLElement>("[data-media]");
  const frame = media?.firstElementChild;
  const text = item.querySelector<HTMLElement>("[data-text]");
  if (!media || !frame || !text) return;
  if (reducedMotion()) {
    item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay, easing: "ease-out", fill: "backwards" });
    return;
  }
  const round = getComputedStyle(media).borderTopLeftRadius;
  media.animate([{ clipPath: `inset(100% 0 0 0 round ${round})` }, { clipPath: `inset(0 0 0 0 round ${round})` }], {
    duration: 900,
    delay,
    easing: "cubic-bezier(0.65, 0, 0.25, 1)",
    fill: "backwards",
  });
  frame.animate([{ transform: "scale(1.06)" }, { transform: "none" }], {
    duration: 1400,
    delay,
    easing: EASE_OUT,
    fill: "backwards",
  });
  text.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
    duration: 700,
    delay: delay + 200,
    easing: EASE_OUT,
    fill: "backwards",
  });
}

export function Grid({
  ref,
  builds,
  shown,
  onOpen,
  pill,
}: {
  ref?: Ref<GridHandle>;
  builds: Build[];
  shown: Set<string>;
  onOpen: (slug: string) => void;
  pill: RefObject<PillHandle | null>;
}) {
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => {
    const item = (slug: string) => list.current?.querySelector<HTMLElement>(`:scope > [data-slug="${slug}"]`) ?? null;
    const showing = () => [...(list.current?.querySelectorAll<HTMLElement>(":scope > li:not([hidden])") ?? [])];

    return {
      measure(next) {
        const before = new Map<string, DOMRect>();
        const still = reducedMotion();
        for (const li of showing()) {
          const slug = li.dataset.slug ?? "";
          before.set(slug, li.getBoundingClientRect());
          if (next.has(slug) || !ghosts.current) continue;
          fadeAway(
            ghost(li, ghosts.current),
            still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.94)" }],
            { duration: still ? 160 : 320, easing: EASE_OUT },
          );
        }
        // a glide still under way starts again from where it got to
        for (const li of showing()) for (const animation of li.getAnimations()) animation.cancel();
        return before;
      },

      settle(before) {
        const still = reducedMotion();
        let arriving = 0;
        for (const li of showing()) {
          const was = before.get(li.dataset.slug ?? "");
          // new to the grid, or never yet scrolled into view: fade in where it lands
          if (!was || !("shown" in li.dataset)) {
            li.dataset.shown = "";
            li.animate(
              still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }],
              { duration: still ? 200 : 440, delay: still ? 0 : 140 + arriving * 45, easing: EASE_OUT, fill: "backwards" },
            );
            arriving += 1;
            continue;
          }
          if (still) continue;
          const now = li.getBoundingClientRect();
          const dx = was.left - now.left;
          const dy = was.top - now.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
          li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 560, easing: EASE_SHEET });
        }
      },

      card: (slug) => item(slug)?.querySelector("a") ?? null,
      media: (slug) => item(slug)?.querySelector<HTMLElement>("[data-media]") ?? null,

      reveal(slug) {
        const li = item(slug);
        if (!li) return;
        li.dataset.shown = "";
        for (const animation of li.getAnimations({ subtree: true })) {
          if (animation.effect?.getComputedTiming().iterations === Infinity) continue;
          animation.finish();
        }
      },
    };
  }, []);

  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    // from here on, cards wait for the observer rather than the CSS fallback
    ul.dataset.ready = "";
    const observer = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((entry) => entry.isIntersecting && !("shown" in (entry.target as HTMLElement).dataset))
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        for (const entry of entries) if (entry.isIntersecting) observer.unobserve(entry.target);
        arriving.forEach((entry, order) => arrive(entry.target as HTMLElement, order * 55));
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    for (const li of ul.children) observer.observe(li);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.wrap}>
      <ul ref={list} className={styles.grid} role="list">
        {builds.map((build, index) => (
          <Card key={build.slug} build={build} index={index} hidden={!shown.has(build.slug)} onOpen={onOpen} pill={pill} />
        ))}
      </ul>
      <div ref={ghosts} className={styles.ghosts} aria-hidden="true" />
    </div>
  );
}

function Card({
  build,
  index,
  hidden,
  onOpen,
  pill,
}: {
  build: Build;
  index: number;
  hidden: boolean;
  onOpen: (slug: string) => void;
  pill: RefObject<PillHandle | null>;
}) {
  const id = useId();

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // a new tab or window still gets the link
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(build.slug);
  };

  // Over the words on the picture, the pill rides on top of them rather
  // than covering them.
  const aim = (event: PointerEvent<HTMLAnchorElement>): [number, number] => {
    const media = event.currentTarget.querySelector<HTMLElement>("[data-media]");
    const about = media?.querySelector<HTMLElement>("[data-about]");
    if (!media || !about) return [event.clientX, event.clientY];
    const box = media.getBoundingClientRect();
    const ceiling = box.top + about.offsetTop - PILL_CLEARANCE;
    return [event.clientX, event.clientY > ceiling && event.clientY < box.bottom ? ceiling : event.clientY];
  };

  const enter = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "mouse") pill.current?.show(...aim(event));
  };

  const follow = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "mouse") pill.current?.move(...aim(event));
  };

  return (
    <li className={styles.item} data-slug={build.slug} hidden={hidden}>
      <a
        href={`/builder?p=${build.slug}`}
        className={styles.card}
        aria-labelledby={`${id}name`}
        aria-describedby={`${id}meta ${id}line`}
        onClick={open}
        onPointerEnter={enter}
        onPointerMove={follow}
        onPointerLeave={() => pill.current?.hide()}
      >
        <div className={styles.media} data-media="" data-tone={build.tone}>
          <div className={styles.frame}>
            <Shot image={build.slug} alt={build.name} sizes={CARD_SIZES} eager={index < 6} className={styles.shot} />
          </div>
          <div className={styles.about} data-about="" aria-hidden="true">
            <p>{build.about}</p>
          </div>
        </div>
        <div className={styles.text} data-text="">
          <div className={styles.row}>
            <h2 className={styles.name} id={`${id}name`}>
              {build.name}
              {build.award ? <Trophy className={styles.trophy} /> : null}
            </h2>
            <p className={styles.meta} id={`${id}meta`}>
              <StatusMark status={build.status} phase={(index * 0.83) % 2.6} className={styles.mark} />
              <span>{build.status}</span> <span aria-hidden="true">·</span> <span>{formatMonth(build.date)}</span>
              {build.award ? <span className={styles.quiet}>, won {build.award}</span> : null}
            </p>
          </div>
          <p className={styles.line} id={`${id}line`}>
            {build.line}
          </p>
        </div>
      </a>
    </li>
  );
}
