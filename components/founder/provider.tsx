"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircleIcon, CloseIcon } from "./icons";
import styles from "./chrome.module.css";

// What the islands on the page share: the messaging dock, the toast, and a way
// for anything (search, notifications, skills) to bring a project into view.

/** A button on the toast, like "Undo". */
export type ToastAction = { label: string; run: () => void };

type Founder = {
  dockOpen: boolean;
  /** Bumps each time something asks the dock to focus its message box. */
  dockFocus: number;
  setDockOpen: (open: boolean) => void;
  openMessaging: () => void;
  revealProject: (slug: string) => void;
  registerProjects: (reveal: (slug: string) => void) => () => void;
  toast: (text: string, action?: ToastAction) => void;
  copyProfileLink: () => void;
  /** Copies a link to somewhere on this site; `what` names it in the toast, as in "Copied link to post." */
  copyLink: (path: string, what: string) => void;
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
  const [toastState, setToastState] = useState<{ id: number; text: string; action?: ToastAction } | null>(null);
  // A toast stays while the pointer or focus is on it, so there's time to read it and reach Undo.
  const [toastHeld, setToastHeld] = useState(false);
  const revealer = useRef<((slug: string) => void) | null>(null);
  const toastCount = useRef(0);

  const openMessaging = useCallback(() => {
    setDockOpen(true);
    setDockFocus((count) => count + 1);
  }, []);

  const toast = useCallback((text: string, action?: ToastAction) => {
    toastCount.current += 1;
    setToastState({ id: toastCount.current, text, action });
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

  const copyLink = useCallback(
    (path: string, what: string) => {
      copyText(`${window.location.origin}${path}`).then((copied) =>
        toast(copied ? `Copied ${what}.` : `Couldn’t copy the link. It’s ${path} on this site.`),
      );
    },
    [toast],
  );

  const copyProfileLink = useCallback(() => {
    copyText(`${window.location.origin}/founder`).then((copied) =>
      toast(copied ? "Copied profile link." : "Couldn’t copy the link. It’s /founder on this site."),
    );
  }, [toast]);

  useEffect(() => {
    if (!toastState || toastHeld) return;
    const timer = window.setTimeout(() => setToastState(null), toastState.action ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toastState, toastHeld]);

  const value = useMemo(
    () => ({ dockOpen, dockFocus, setDockOpen, openMessaging, revealProject, registerProjects, toast, copyProfileLink, copyLink }),
    [dockOpen, dockFocus, openMessaging, revealProject, registerProjects, toast, copyProfileLink, copyLink],
  );

  const dismiss = () => {
    setToastState(null);
    setToastHeld(false);
  };

  return (
    <FounderContext.Provider value={value}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toastState ? (
          <div
            key={toastState.id}
            className={styles.toast}
            onPointerEnter={() => setToastHeld(true)}
            onPointerLeave={() => setToastHeld(false)}
            onFocus={() => setToastHeld(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastHeld(false);
            }}
          >
            <CheckCircleIcon className={styles.toastIcon} />
            <p className={styles.toastText}>{toastState.text}</p>
            {toastState.action ? (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => {
                  toastState.action?.run();
                  dismiss();
                }}
              >
                {toastState.action.label}
              </button>
            ) : null}
            <button type="button" className={styles.toastClose} aria-label="Dismiss" onClick={dismiss}>
              <CloseIcon size={20} />
            </button>
          </div>
        ) : null}
      </div>
    </FounderContext.Provider>
  );
}
