"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import styles from "./filter.module.css";

export type FilterOption<Id extends string> = { id: Id; label: string; count: number };

// Clips the ink layer to the pressed option.
function place(track: HTMLElement, ink: HTMLElement) {
  const pressed = track.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!pressed) return;
  const right = track.clientWidth - pressed.offsetLeft - pressed.offsetWidth;
  ink.style.clipPath = `inset(0 ${right}px 0 ${pressed.offsetLeft}px round 999px)`;
}

// A row of options under one sliding ink pill. The white labels on the pill
// are a second copy of the row clipped to it, so each label turns white
// exactly where the pill's edge passes over it.
export function Filter<Id extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: FilterOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (track.current && ink.current) place(track.current, ink.current);
  }, [value]);

  // The first position, and any after a resize or the font swapping in,
  // jump rather than slide; then the pill takes over from the buttons' own
  // pressed style.
  useEffect(() => {
    const row = track.current;
    const layer = ink.current;
    if (!row || !layer) return;
    const snap = () => {
      layer.style.transition = "none";
      place(row, layer);
      void layer.offsetWidth;
      layer.style.transition = "";
    };
    const observer = new ResizeObserver(snap);
    observer.observe(row);
    row.dataset.ready = "";
    return () => observer.disconnect();
  }, []);

  const row = (interactive: boolean) =>
    options.map((option) => {
      const content = (
        <>
          {option.label}
          <span className={styles.count}>{option.count}</span>
        </>
      );
      return interactive ? (
        <button
          key={option.id}
          type="button"
          className={styles.option}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {content}
        </button>
      ) : (
        <span key={option.id} className={styles.option}>
          {content}
        </span>
      );
    });

  return (
    <div className={[styles.scroll, className].filter(Boolean).join(" ")}>
      <div ref={track} className={styles.track} role="group" aria-label={label}>
        {row(true)}
        <div ref={ink} className={styles.ink} aria-hidden="true">
          {row(false)}
        </div>
      </div>
    </div>
  );
}
