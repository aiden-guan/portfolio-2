"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./founder.module.css";

/**
 * Text clamped to a few lines with LinkedIn's "…see more" over the end of the
 * last one. The clamp is there from the first paint; the button only appears
 * once the text is measured and found to run over.
 */
export function SeeMore({
  text,
  lines = 3,
  label = "see more",
  className,
}: {
  text: string;
  lines?: number;
  label?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element || expanded) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div
      className={[styles.seeMore, className].filter(Boolean).join(" ")}
      data-expanded={expanded || undefined}
      style={{ "--lines": lines } as CSSProperties}
    >
      <div ref={box} className={styles.seeMoreText}>
        {text}
      </div>
      {!expanded && overflowing ? (
        <button type="button" className={styles.seeMoreButton} onClick={() => setExpanded(true)}>
          <span aria-hidden="true">…</span>
          {label}
        </button>
      ) : null}
    </div>
  );
}
