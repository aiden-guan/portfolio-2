"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { prefersReducedMotion } from "./provider";
import styles from "./founder.module.css";

/** A row of cards that scrolls sideways, with LinkedIn's round arrows on hover. */
export function Carousel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft <= 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const element = track.current;
    if (!element) return;
    const item = element.firstElementChild as HTMLElement | null;
    const step = item ? item.getBoundingClientRect().width + 8 : element.clientWidth * 0.8;
    const perPage = Math.max(1, Math.floor((element.clientWidth + 8) / step));
    element.scrollBy({ left: direction * step * perPage, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div className={[styles.carousel, className].filter(Boolean).join(" ")}>
      <ul ref={track} className={styles.track} aria-label={label}>
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
