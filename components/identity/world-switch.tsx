"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ROLES, type Role } from "@/content/worlds";
import { coverBlack, liftCovers, wash } from "./leave";
import styles from "./world-switch.module.css";

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// a click the browser should handle itself: a new tab, a download, a window
const ownClick = (event: React.MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

function roleOf(href: string) {
  const path = new URL(href, location.href).pathname;
  return ROLES.find((role) => path === `/${role}`);
}

// The four pages stand side by side, so moving between them takes the place
// of this one in the history: the browser's back arrow always leads home to
// the black page, not back through every page on the way. The next page's
// ground washes in from the link first, as it does from the black page, and
// the next page starts on that same colour.
export function switchWorld(event: React.MouseEvent<HTMLAnchorElement>) {
  if (ownClick(event)) return;
  event.preventDefault();
  const link = event.currentTarget;
  const href = link.href;
  const role = roleOf(href);
  if (!role || new URL(href).pathname === location.pathname) {
    window.location.replace(href);
    return;
  }
  void wash(role, { box: link.getBoundingClientRect(), reduced: reducedMotion(), quick: true }).then(() =>
    window.location.replace(href),
  );
}

// The way back to the black page: this page goes black from the link, then
// the black page loads onto black.
export function goHome(event: React.MouseEvent<HTMLAnchorElement>) {
  if (ownClick(event)) return;
  event.preventDefault();
  const href = event.currentTarget.href;
  void coverBlack(event.currentTarget.getBoundingClientRect(), reducedMotion()).then(() => window.location.assign(href));
}

// "← I am a builder ▾": the way from any of the four pages back to the black
// page, or on to the others. Links are full page loads on purpose, so the
// mat's global styles never follow you out of /student.
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
  // the highlight under the item pointed at or focused, and whether it is
  // gliding from another item or arriving fresh
  const [mark, setMark] = useState<{ y: number; h: number; glide: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const viaKeys = useRef(false);
  const menuId = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setMark(null);
    if (refocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(root.current?.contains(document.activeElement) ?? false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, close]);

  // the back arrow can bring this page back from the browser's cache just as
  // it was left: gone black, or washed over with the next page's ground
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      liftCovers();
      close();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [close]);

  const point = (item: HTMLElement | null) => {
    if (!item) {
      setMark(null);
      return;
    }
    setMark((was) => ({ y: item.offsetTop, h: item.offsetHeight, glide: was !== null }));
  };

  const focusItem = (which: "current" | "first" | "last") => {
    const list = items();
    const item =
      which === "first"
        ? list[0]
        : which === "last"
          ? list[list.length - 1]
          : (list.find((link) => link.getAttribute("aria-current") === "page") ?? list[0]);
    item?.focus();
  };

  // opened from the keyboard, focus goes into the menu once it is showing
  const openTo = (which: "current" | "first" | "last") => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(which));
  };

  const onTriggerKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") viaKeys.current = true;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openTo(event.key === "ArrowDown" ? "current" : "last");
    }
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: HTMLAnchorElement | undefined;
    if (event.key === "ArrowDown") next = list[(at + 1) % list.length];
    else if (event.key === "ArrowUp") next = list[(at - 1 + list.length) % list.length];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list[list.length - 1];
    else if (event.key === "Tab") {
      close();
      return;
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      next = list.find((link) => link.textContent?.trim().startsWith(event.key.toLowerCase()));
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const onItemClick = (role: Role) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    // the page you are on is no way out of it
    if (role === current && !ownClick(event)) {
      event.preventDefault();
      close(true);
      return;
    }
    switchWorld(event);
  };

  return (
    <div
      ref={root}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-bare={bare || undefined}
      data-align={align}
      data-open={open || undefined}
    >
      {/* a full load, on purpose, like every way out of a world */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className={styles.home} aria-label="Back to the start" title="Back to the start" onClick={goHome}>
        <BackArrow />
      </a>
      <div className={styles.anchor}>
        <button
          ref={trigger}
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={(event) => {
            // from the keyboard (or a screen reader), focus goes in with it
            const keys = viaKeys.current || event.detail === 0;
            viaKeys.current = false;
            if (open) close(keys);
            else if (keys) openTo("current");
            else setOpen(true);
          }}
          onKeyDown={onTriggerKey}
        >
          <span className={styles.lead} data-lead="">
            I am a
          </span>{" "}
          <span className={styles.role}>{current}</span>
          <svg className={styles.chevron} viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <nav
          ref={menu}
          id={menuId}
          className={styles.menu}
          aria-label="I am a"
          data-shown={open || undefined}
          onKeyDown={onMenuKey}
          onPointerLeave={() => {
            if (!menu.current?.contains(document.activeElement)) point(null);
          }}
        >
          <span
            className={styles.mark}
            data-shown={mark !== null || undefined}
            data-glide={mark?.glide || undefined}
            style={mark ? ({ "--y": `${mark.y}px`, "--h": `${mark.h}px` } as React.CSSProperties) : undefined}
            aria-hidden="true"
          />
          {ROLES.map((role) => (
            <a
              key={role}
              href={`/${role}`}
              aria-current={role === current ? "page" : undefined}
              className={styles.item}
              // the arrows move through these; Tab moves on past them
              tabIndex={-1}
              onPointerEnter={(event) => point(event.currentTarget)}
              onFocus={(event) => point(event.currentTarget)}
              onClick={onItemClick(role)}
            >
              {role}
              {role === current ? <Check /> : null}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M10 6H2.25M5.5 2.5 2 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg className={styles.check} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.4 4.9 8.75 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
