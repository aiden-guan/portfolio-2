"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronIcon, ComposeIcon, GhostAvatar } from "./icons";
import { prefersReducedMotion, useFounder } from "./provider";
import ui from "./founder.module.css";
import styles from "./chrome.module.css";

/** A suggested reply, and what Aiden says back to it. */
export type ChatTopic = { ask: string; answer: string; link?: { label: string; href: string } };

/** The canned half of the conversation. Anything typed by hand gets `fallback`, and a way to send it by email. */
export type ChatScript = { greeting: string; topics: ChatTopic[]; fallback: string };

type Line = {
  id: number;
  from: "them" | "you";
  text: string;
  at: string;
  link?: { label: string; href: string };
  /** A message typed by hand, offered as an email. */
  mail?: string;
};

const clock = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** The bar in the bottom-right corner, and the conversation with Aiden it opens into. */
export function MessagingDock({
  name,
  headline,
  photo,
  email,
  subject,
  script,
}: {
  name: string;
  headline: string;
  photo: string;
  email: string;
  subject: string;
  script: ChatScript;
}) {
  const { dockOpen, dockFocus, setDockOpen } = useFounder();
  const [text, setText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const dock = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLButtonElement>(null);
  const greeted = useRef(false);
  const lineCount = useRef(0);
  const timers = useRef<number[]>([]);
  const panelId = useId();
  const fieldId = useId();
  const hintId = useId();

  const push = useCallback((line: Omit<Line, "id" | "at">) => {
    lineCount.current += 1;
    const next = { ...line, id: lineCount.current, at: clock() };
    setLines((list) => [...list, next]);
  }, []);

  // Aiden "types" for a moment before each reply. Reduced motion keeps the beat but drops the bouncing dots.
  const answer = useCallback(
    (line: Omit<Line, "id" | "at" | "from">, delay = 900) => {
      setTyping(true);
      timers.current.push(
        window.setTimeout(() => {
          setTyping(false);
          push({ ...line, from: "them" });
        }, delay),
      );
    },
    [push],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!dockOpen || greeted.current) return;
    greeted.current = true;
    answer({ text: script.greeting }, 700);
  }, [dockOpen, answer, script.greeting]);

  useEffect(() => {
    if (!dockFocus) return;
    // On a phone the keyboard would cover the suggestions, so focus lands on the conversation instead.
    if (matchMedia("(pointer: coarse)").matches) thread.current?.focus({ preventScroll: true });
    else field.current?.focus({ preventScroll: true });
  }, [dockFocus]);

  useEffect(() => {
    const element = thread.current;
    if (!element || !dockOpen) return;
    element.scrollTo({ top: element.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [lines, typing, dockOpen]);

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

  const ask = (topic: ChatTopic) => {
    if (typing) return;
    push({ from: "you", text: topic.ask });
    setAsked((list) => [...list, topic.ask]);
    answer({ text: topic.answer, link: topic.link }, 700 + Math.min(900, topic.answer.length * 8));
  };

  const message = text.trim();
  const send = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    if (!message || typing) return;
    push({ from: "you", text: message });
    setText("");
    answer({ text: script.fallback, mail: message });
  };

  const mailto = (body: string) =>
    `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Runs of messages from one person share a name and a photo, as LinkedIn groups them.
  const groups: Line[][] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last[0].from === line.from) last.push(line);
    else groups.push([line]);
  }
  const topics = script.topics.filter((topic) => !asked.includes(topic.ask));

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
          <div className={styles.convo}>
            <div ref={thread} className={styles.thread} role="log" aria-label={`Conversation with ${name}`} tabIndex={-1}>
              <div className={styles.intro}>
                <Image className={styles.introPhoto} src={photo} alt="" width={56} height={56} />
                <div className={styles.introText}>
                  <p className={styles.introName}>{name}</p>
                  <p className={styles.introLine}>{headline}</p>
                </div>
              </div>
              <p className={styles.day}>Today</p>
              {groups.map((group) => {
                const mine = group[0].from === "you";
                return (
                  <div key={group[0].id} className={styles.group}>
                    {mine ? (
                      <GhostAvatar size={32} className={styles.groupAvatar} />
                    ) : (
                      <Image className={styles.groupAvatar} src={photo} alt="" width={32} height={32} />
                    )}
                    <div className={styles.groupBody}>
                      <p className={styles.meta}>
                        <span className={styles.who}>{mine ? "You" : name}</span>
                        <span className={styles.time}> · {group[0].at}</span>
                      </p>
                      {group.map((line) => (
                        <div key={line.id} className={styles.line}>
                          <p className={styles.text}>{line.text}</p>
                          {line.link ? (
                            <a
                              className={styles.lineLink}
                              href={line.link.href}
                              {...(line.link.href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                            >
                              {line.link.label}
                            </a>
                          ) : null}
                          {line.mail ? (
                            <a className={`${ui.btn} ${ui.secondary} ${ui.small} ${styles.mailButton}`} href={mailto(line.mail)}>
                              Send it by email
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {typing ? (
                <div className={styles.typing}>
                  <Image className={styles.groupAvatar} src={photo} alt="" width={32} height={32} />
                  <span className={styles.dots}>
                    <span className={ui.visuallyHidden}>{name} is typing</span>
                    <i aria-hidden="true" />
                    <i aria-hidden="true" />
                    <i aria-hidden="true" />
                  </span>
                </div>
              ) : null}
            </div>
            {topics.length && lines.length && !typing ? (
              <div className={styles.chips} role="group" aria-label="Suggested messages">
                {topics.map((topic) => (
                  <button key={topic.ask} type="button" className={styles.chip} onClick={() => ask(topic)}>
                    {topic.ask}
                  </button>
                ))}
              </div>
            ) : null}
            <form className={styles.composer} onSubmit={send}>
              <label className={ui.visuallyHidden} htmlFor={fieldId}>
                Message to {name}
              </label>
              <textarea
                ref={field}
                id={fieldId}
                className={styles.field}
                placeholder="Write a message…"
                aria-describedby={hintId}
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  // On a phone, Return starts a new line and the Send button sends, as in the app.
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  if (matchMedia("(pointer: coarse)").matches) return;
                  send(event);
                }}
              />
              <div className={styles.composeFoot}>
                <span id={hintId} className={styles.hint}>
                  Enter to send
                </span>
                <button type="submit" className={`${ui.btn} ${ui.primary} ${ui.small}`} disabled={!message || typing}>
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
