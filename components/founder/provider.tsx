"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircleIcon, CloseIcon } from "./icons";
import styles from "./chrome.module.css";

// What the islands on the page share: the messaging dock, the toast, and a way
// for anything (search, notifications, skills) to bring a project into view.

type Founder = {
  dockOpen: boolean;
  /** Bumps each time something asks the dock to focus its message box. */
  dockFocus: number;
  setDockOpen: (open: boolean) => void;
  openMessaging: () => void;
  revealProject: (slug: string) => void;
  registerProjects: (reveal: (slug: string) => void) => () => void;
  toast: (text: string) => void;
  copyProfileLink: () => void;
};

const FounderContext = createContext<Founder | null>(null);

export function useFounder() {
  const value = useContext(FounderContext);
  if (!value) throw new Error("useFounder() needs a <FounderProvider> above it");
  return value;
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scrolls a section in under the sticky nav. */
export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

async function copyText(text: string) {
  try {
    // A browser that never answers (no permission, unfocused) falls through.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard timed out")), 800)),
    ]);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    Object.assign(field.style, { position: "fixed", top: "0", left: "0", opacity: "0" });
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

export function FounderProvider({ children }: { children: ReactNode }) {
  const [dockOpen, setDockOpen] = useState(false);
  const [dockFocus, setDockFocus] = useState(0);
  const [toastState, setToastState] = useState<{ id: number; text: string } | null>(null);
  const revealer = useRef<((slug: string) => void) | null>(null);
  const toastCount = useRef(0);

  const openMessaging = useCallback(() => {
    setDockOpen(true);
    setDockFocus((count) => count + 1);
  }, []);

  const toast = useCallback((text: string) => {
    toastCount.current += 1;
    setToastState({ id: toastCount.current, text });
  }, []);

  const revealProject = useCallback((slug: string) => {
    revealer.current?.(slug);
  }, []);

  const registerProjects = useCallback((reveal: (slug: string) => void) => {
    revealer.current = reveal;
    return () => {
      if (revealer.current === reveal) revealer.current = null;
    };
  }, []);

  const copyProfileLink = useCallback(() => {
    copyText(`${window.location.origin}/founder`).then((copied) =>
      toast(copied ? "Copied profile link." : "Couldn’t copy the link. It’s /founder on this site."),
    );
  }, [toast]);

  useEffect(() => {
    if (!toastState) return;
    const timer = window.setTimeout(() => setToastState(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toastState]);

  const value = useMemo(
    () => ({ dockOpen, dockFocus, setDockOpen, openMessaging, revealProject, registerProjects, toast, copyProfileLink }),
    [dockOpen, dockFocus, openMessaging, revealProject, registerProjects, toast, copyProfileLink],
  );

  return (
    <FounderContext.Provider value={value}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toastState ? (
          <div key={toastState.id} className={styles.toast}>
            <CheckCircleIcon className={styles.toastIcon} />
            <p className={styles.toastText}>{toastState.text}</p>
            <button type="button" className={styles.toastClose} aria-label="Dismiss" onClick={() => setToastState(null)}>
              <CloseIcon size={20} />
            </button>
          </div>
        ) : null}
      </div>
    </FounderContext.Provider>
  );
}
