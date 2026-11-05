"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styles from "./filter.module.css";

export type FilterOption<Id extends string> = { id: Id; label: string; count: number };

// Clips the ink layer to the chosen option.
function place(track: HTMLElement, ink: HTMLElement) {
  const chosen = track.querySelector<HTMLElement>('[aria-checked="true"]');
  if (!chosen) return;
  const right = track.clientWidth - chosen.offsetLeft - chosen.offsetWidth;
  ink.style.clipPath = `inset(0 ${right}px 0 ${chosen.offsetLeft}px round 999px)`;
}

// A row of options under one sliding ink pill. The white labels on the pill
// are a second copy of the row clipped to it, so each label turns white
// exactly where the pill's edge passes over it. One choice at a time, so it's
// a radio group: Tab lands on the chosen option, the arrow keys choose.
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
  // chosen style.
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

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const at = options.findIndex((option) => option.id === value);
    let to: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = (at + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = (at - 1 + options.length) % options.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[to].id);
    track.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[to]?.focus();
  }

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
          role="radio"
          className={styles.option}
          aria-checked={option.id === value}
          tabIndex={option.id === value ? 0 : -1}
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
      <div ref={track} className={styles.track} role="radiogroup" aria-label={label} onKeyDown={keys}>
        {row(true)}
        <div ref={ink} className={styles.ink} aria-hidden="true">
          {row(false)}
        </div>
      </div>
    </div>
  );
}
