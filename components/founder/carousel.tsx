"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { prefersReducedMotion } from "./provider";
import styles from "./founder.module.css";

type Drag = { id: number; x: number; left: number; moved: boolean; lastX: number; lastT: number; velocity: number };

/**
 * A row of cards that scrolls sideways, with LinkedIn's round arrows on hover.
 * Touch scrolls it natively; a mouse can drag it too, and a flick carries on
 * to the card it was heading for.
 */
export function Carousel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    // Scroll fires every frame of a drag; only a change at either end re-renders the cards.
    const update = () => {
      const start = element.scrollLeft <= 2;
      const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
      window.clearTimeout(settle.current);
    };
  }, []);

  const step = (element: HTMLElement) => {
    const item = element.firstElementChild as HTMLElement | null;
    return item ? item.getBoundingClientRect().width + 8 : element.clientWidth * 0.8;
  };

  const page = (direction: 1 | -1) => {
    const element = track.current;
    if (!element) return;
    const size = step(element);
    const perPage = Math.max(1, Math.floor((element.clientWidth + 8) / size));
    element.scrollBy({ left: direction * size * perPage, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  /** The card start nearest to a scroll position, as the snap points would pick it. */
  const nearest = (element: HTMLElement, left: number) => {
    const max = element.scrollWidth - element.clientWidth;
    let best = 0;
    for (const child of Array.from(element.children) as HTMLElement[]) {
      const at = Math.min(child.offsetLeft, max);
      if (Math.abs(at - left) < Math.abs(best - left)) best = at;
    }
    return best;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLUListElement>) => {
    const element = track.current;
    if (event.pointerType !== "mouse" || event.button !== 0 || !element) return;
    if (element.scrollWidth <= element.clientWidth + 2) return;
    window.clearTimeout(settle.current);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      left: element.scrollLeft,
      moved: false,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLUListElement>) => {
    const element = track.current;
    const state = drag.current;
    if (!element || !state || event.pointerId !== state.id) return;
    const dx = event.clientX - state.x;
    if (!state.moved) {
      // A few pixels of slack, so a click with an unsteady hand is still a click.
      if (Math.abs(dx) < 6) return;
      state.moved = true;
      element.setPointerCapture(event.pointerId);
      element.dataset.dragging = "";
    }
    element.scrollLeft = state.left - dx;
    const dt = event.timeStamp - state.lastT;
    if (dt > 0) {
      state.velocity = 0.75 * ((event.clientX - state.lastX) / dt) + 0.25 * state.velocity;
      state.lastX = event.clientX;
      state.lastT = event.timeStamp;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLUListElement>) => {
    const element = track.current;
    const state = drag.current;
    if (!element || !state || event.pointerId !== state.id) return;
    drag.current = null;
    if (!state.moved) return;
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 0);
    // Carry the flick on for about a fifth of a second, then settle on a card.
    const still = event.timeStamp - state.lastT > 80;
    const target = nearest(element, element.scrollLeft - (still ? 0 : state.velocity * 200));
    const reduced = prefersReducedMotion();
    element.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    // Snapping comes back once the glide is over, so it can't cut the glide short.
    const done = () => {
      window.clearTimeout(settle.current);
      element.removeEventListener("scrollend", done);
      delete element.dataset.dragging;
    };
    if (reduced) done();
    else {
      element.addEventListener("scrollend", done, { once: true });
      settle.current = window.setTimeout(done, 600);
    }
  };

  return (
    <div className={[styles.carousel, className].filter(Boolean).join(" ")}>
      <ul
        ref={track}
        className={styles.track}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </ul>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowPrev}`}
        aria-label="Previous"
        hidden={edges.start}
        onClick={() => page(-1)}
      >
        <ChevronIcon direction="left" size={24} />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowNext}`}
        aria-label="Next"
        hidden={edges.end}
        onClick={() => page(1)}
      >
        <ChevronIcon direction="right" size={24} />
      </button>
    </div>
  );
}
