"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ROLES, type Role } from "@/content/worlds";
import styles from "./world-switch.module.css";

// "I am a builder ▾": the way from any of the four pages to the others, or
// back to the black page. Links are full page loads on purpose, so the mat's
// global styles never follow you out of /student.
export function WorldSwitch({
  current,
  tone = "light",
  bare = false,
  align = "left",
  className,
}: {
  current: Role;
  tone?: "light" | "dark";
  /** no pill: inherits the type and colour of where it sits */
  bare?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-bare={bare || undefined}
      data-align={align}
      data-open={open || undefined}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.lead} data-lead="">
          I am a
        </span>{" "}
        <span className={styles.role}>{current}</span>
        <svg className={styles.chevron} viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <nav id={menuId} className={styles.menu} aria-label="Other ways in" hidden={!open}>
        {ROLES.map((role) => (
          <a key={role} href={`/${role}`} aria-current={role === current ? "page" : undefined} className={styles.item}>
            {role}
          </a>
        ))}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={styles.back}>
          Start over
        </a>
      </nav>
    </div>
  );
}
