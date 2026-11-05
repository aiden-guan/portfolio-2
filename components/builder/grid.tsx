"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
} from "react";
import { formatMonth } from "@/content/worlds";
import type { PillHandle } from "./cursor";
import { Trophy } from "./icons";
import { EASE_OUT, EASE_SHEET, fadeAway, ghost, reducedMotion } from "./motion";
import { CARD, HERO, Shot, warm } from "./shot";
import { StatusMark } from "./status";
import type { Build } from "./types";
import styles from "./grid.module.css";

/** What a card is showing as it opens: which of its pictures, and the file already on screen. */
export type Showing = { view: number; src: string | null };

export type GridHandle = {
  /** Before the filter changes: where each card is now. The ones about to go fade out as copies. */
  measure: (next: Set<string>) => Map<string, DOMRect>;
  /** After it has: the cards that stayed glide over from there, new ones fade in. */
  settle: (before: Map<string, DOMRect>) => void;
  card: (slug: string) => HTMLAnchorElement | null;
  media: (slug: string) => HTMLElement | null;
  showing: (slug: string) => Showing;
  /** Shows a card at once if it hasn't been scrolled to yet. */
  reveal: (slug: string) => void;
};

// A card scrolled to for the first time rises the last few pixels into place
// from where it waited (grid.module.css), and its picture settles in its
// frame a little behind it.
function arrive(item: HTMLElement, delay: number) {
  if (!("pending" in item.dataset)) return;
  delete item.dataset.pending;
  item.animate([{ transform: "translateY(24px)" }, { transform: "none" }], {
    duration: 900,
    delay,
    easing: EASE_OUT,
    fill: "backwards",
  });
  item.querySelector("[data-frame]")?.animate([{ transform: "scale(1.03)" }, { transform: "none" }], {
    duration: 1200,
    delay,
    easing: EASE_OUT,
    fill: "backwards",
  });
}

// The card in the row above or below that sits nearest across.
function across(boxes: DOMRect[], from: number, step: 1 | -1) {
  const here = boxes[from];
  const middle = here.left + here.width / 2;
  let best = -1;
  let row = Infinity;
  let gap = Infinity;
  boxes.forEach((box, i) => {
    const down = (box.top - here.top) * step;
    if (down < here.height / 2) return;
    const off = Math.abs(box.left + box.width / 2 - middle);
    if (down < row - 1 || (Math.abs(down - row) <= 1 && off < gap)) {
      best = i;
      row = down;
      gap = off;
    }
  });
  return best;
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
  const watcher = useRef<IntersectionObserver | null>(null);

  useImperativeHandle(ref, () => {
    const item = (slug: string) => list.current?.querySelector<HTMLElement>(`:scope > [data-slug="${slug}"]`) ?? null;
    const showing = () => [...(list.current?.querySelectorAll<HTMLElement>(":scope > li:not([hidden])") ?? [])];

    return {
      measure(next) {
        const before = new Map<string, DOMRect>();
        const still = reducedMotion();
        if (list.current) list.current.dataset.calm = "";
        for (const li of showing()) {
          const slug = li.dataset.slug ?? "";
          before.set(slug, li.getBoundingClientRect());
          if (next.has(slug) || !ghosts.current) continue;
          fadeAway(
            ghost(li, ghosts.current),
            still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.95)" }],
            { duration: still ? 160 : 300, easing: EASE_OUT },
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
          // one that was waiting to be scrolled to is shown now, wherever it lands
          const waiting = "pending" in li.dataset;
          if (waiting) {
            delete li.dataset.pending;
            watcher.current?.unobserve(li);
          }
          if (!was || waiting) {
            li.animate(
              still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }],
              { duration: still ? 200 : 440, delay: still ? 0 : 120 + arriving * 40, easing: EASE_OUT, fill: "backwards" },
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

      showing(slug) {
        const media = item(slug)?.querySelector<HTMLElement>("[data-media]");
        const view = Number(media?.dataset.view ?? 0) || 0;
        const img = media?.querySelector<HTMLImageElement>(`[data-layer="${view}"] img`);
        return { view, src: img?.complete && img.naturalWidth ? img.currentSrc : null };
      },

      reveal(slug) {
        const li = item(slug);
        if (!li) return;
        delete li.dataset.pending;
        watcher.current?.unobserve(li);
        for (const animation of li.getAnimations({ subtree: true })) {
          if (animation.effect?.getComputedTiming().iterations === Infinity) continue;
          animation.finish();
        }
      },
    };
  }, []);

  // Every card is drawn on the first paint and the entrance is CSS's alone.
  // Once hydrated, the cards below the fold wait a little low, to rise into
  // place as they're scrolled to; nothing is ever hidden.
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const entrance = ul
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    // once it has played, it's switched off, so a card filtered out and back doesn't play it again
    Promise.allSettled(entrance.map((animation) => animation.finished)).then(() => {
      ul.dataset.calm = "";
    });
    if (reducedMotion()) return;
    // A picture still on its way fades in on arrival instead of popping. It
    // isn't hidden beforehand: until then there's nothing of it to hide.
    for (const img of ul.querySelectorAll<HTMLImageElement>("[data-layer] img")) {
      if (img.complete) continue;
      img.addEventListener("load", () => img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "ease-out" }), { once: true });
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        arriving.forEach((entry, order) => {
          observer.unobserve(entry.target);
          arrive(entry.target as HTMLElement, order * 70);
        });
      },
      { rootMargin: "0px 0px -8px 0px" },
    );
    watcher.current = observer;
    for (const li of ul.querySelectorAll<HTMLElement>(":scope > li")) {
      if (li.hidden || li.getBoundingClientRect().top < window.innerHeight) continue;
      li.dataset.pending = "";
      observer.observe(li);
    }
    return () => {
      observer.disconnect();
      watcher.current = null;
    };
  }, []);

  // Arrow keys move between cards the way they sit on screen; Enter opens one.
  function keys(event: KeyboardEvent<HTMLUListElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const from = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-card]");
    const ul = list.current;
    if (!from || !ul) return;
    const cards = [...ul.querySelectorAll<HTMLAnchorElement>(":scope > li:not([hidden]) > a")];
    const at = cards.indexOf(from);
    let to: number;
    if (event.key === "ArrowRight") to = at + 1;
    else if (event.key === "ArrowLeft") to = at - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      to = across(
        cards.map((card) => card.getBoundingClientRect()),
        at,
        event.key === "ArrowDown" ? 1 : -1,
      );
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = cards.length - 1;
    else return;
    event.preventDefault();
    const card = cards[to];
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  return (
    <div className={styles.wrap}>
      <ul ref={list} className={styles.grid} role="list" onKeyDown={keys}>
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
  const images = [build.slug, ...(build.gallery ?? [])];
  // the rest of a build's pictures are only fetched once a pointer comes over it
  const [primed, setPrimed] = useState(false);
  const media = useRef<HTMLDivElement>(null);
  const wanted = useRef(0);
  const current = useRef(0);

  // Shows picture i as soon as it can be painted; until then the last one
  // stays, so scrubbing never flashes the empty frame.
  const view = (i: number) => {
    const box = media.current;
    if (!box) return;
    wanted.current = i;
    if (i > 0) {
      const img = box.querySelector<HTMLImageElement>(`[data-layer="${i}"] img`);
      if (!img) return;
      if (!img.complete || !img.naturalWidth) {
        img.addEventListener("load", () => wanted.current === i && view(i), { once: true });
        return;
      }
      box.dataset.view = String(i);
    } else {
      delete box.dataset.view;
    }
    current.current = i;
  };

  // Moving across a picture leafs through the build's screenshots, one per
  // slice of its width.
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    if (images.length < 2) return;
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.min(images.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * images.length)));
    if (i !== current.current) view(i);
  };

  const enter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (images.length > 1) setPrimed(true);
    warm(build.slug, HERO);
    pill.current?.show(event.clientX, event.clientY);
    scrub(event);
  };

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    pill.current?.move(event.clientX, event.clientY);
    scrub(event);
  };

  const leave = () => {
    pill.current?.hide();
    view(0);
  };

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // a new tab or window still gets the link
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(build.slug);
  };

  return (
    <li className={styles.item} id={build.slug} data-slug={build.slug} hidden={hidden} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
      <a
        href={`/builder#${build.slug}`}
        className={styles.card}
        data-card=""
        aria-labelledby={`${id}name`}
        aria-describedby={`${id}meta ${id}line`}
        onClick={open}
        onFocus={() => warm(build.slug, HERO)}
        onPointerDown={() => warm(images[current.current], HERO)}
      >
        <div
          ref={media}
          className={styles.media}
          data-media=""
          data-tone={build.tone}
          onPointerEnter={enter}
          onPointerMove={follow}
          onPointerLeave={leave}
        >
          <div className={styles.frame} data-frame="">
            {(primed ? images : images.slice(0, 1)).map((image, i) => (
              <div key={image} className={styles.layer} data-layer={i}>
                <Shot image={image} alt={i === 0 ? build.name : ""} slot={CARD} eager={i > 0 || index < 3} />
              </div>
            ))}
          </div>
          {images.length > 1 ? (
            <span className={styles.ticks} aria-hidden="true">
              {images.map((image) => (
                <span key={image} />
              ))}
            </span>
          ) : null}
        </div>
        <div className={styles.text}>
          <h2 className={styles.name} id={`${id}name`}>
            {build.name}
            {build.award ? <Trophy className={styles.trophy} /> : null}
          </h2>
          <p className={styles.meta} id={`${id}meta`}>
            <StatusMark status={build.status} phase={(index * 0.83) % 2.6} className={styles.mark} />
            <span>{build.status}</span>
            <span aria-hidden="true">·</span>
            <span>{formatMonth(build.date)}</span>
            {build.award ? <span className={styles.quiet}>, won {build.award}</span> : null}
          </p>
          <p className={styles.line} id={`${id}line`}>
            {build.line}
          </p>
        </div>
      </a>
    </li>
  );
}
