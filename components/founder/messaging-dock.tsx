"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronIcon, ComposeIcon } from "./icons";
import { useFounder } from "./provider";
import ui from "./founder.module.css";
import styles from "./chrome.module.css";

/** The bar in the bottom-right corner. It writes an email, really. */
export function MessagingDock({ name, photo, email, subject }: { name: string; photo: string; email: string; subject: string }) {
  const { dockOpen, dockFocus, setDockOpen } = useFounder();
  const [text, setText] = useState("");
  const dock = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const bar = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const fieldId = useId();
  const hintId = useId();

  useEffect(() => {
    if (dockFocus) field.current?.focus({ preventScroll: true });
  }, [dockFocus]);

  useEffect(() => {
    if (!dockOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dock.current?.contains(document.activeElement)) return;
      setDockOpen(false);
      bar.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dockOpen, setDockOpen]);

  const message = text.trim();
  const send = () => {
    if (!message) return;
    window.location.assign(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
  };

  return (
    <section ref={dock} className={styles.dock} data-open={dockOpen || undefined} aria-label="Messaging">
      <button
        ref={bar}
        type="button"
        className={styles.bar}
        aria-expanded={dockOpen}
        aria-controls={panelId}
        onClick={() => setDockOpen(!dockOpen)}
      >
        <span className={styles.barAvatar}>
          <Image src={photo} alt="" width={32} height={32} />
          <span className={styles.presence} />
        </span>
        <span className={styles.barTitle}>Messaging</span>
        <ComposeIcon size={20} className={styles.barIcon} />
        <ChevronIcon direction="up" size={20} className={styles.chevron} />
      </button>
      <div id={panelId} className={styles.panel} inert={!dockOpen}>
        <div className={styles.panelInner}>
          <div className={styles.compose}>
            <p className={styles.composeHead}>New message</p>
            <div className={styles.to}>
              <span className={styles.toLabel}>To</span>
              <span className={styles.recipient}>
                <Image src={photo} alt="" width={20} height={20} />
                {name}
              </span>
            </div>
            <label className={ui.visuallyHidden} htmlFor={fieldId}>
              Message to {name}
            </label>
            <textarea
              ref={field}
              id={fieldId}
              className={styles.field}
              placeholder="Write a message…"
              aria-describedby={hintId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className={styles.composeFoot}>
              <span id={hintId} className={styles.hint}>
                Sends from your email app
              </span>
              <button type="button" className={`${ui.btn} ${ui.primary} ${ui.small}`} disabled={!message} onClick={send}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
