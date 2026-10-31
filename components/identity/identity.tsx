"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ROLES, type Role } from "@/content/worlds";
import { identityFonts } from "./fonts";
import { cover, uncoverWhenReady } from "./leave";
import styles from "./identity.module.css";

const HOLD = 2600;
const HINT_AFTER = 4200;
const COUNT = ROLES.length;

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Roll = { index: number; turn: number; from: number | null };

// The black page: one sentence with a blank in it. The blank rolls through
// the four answers on its own; hover or tap it to see them all and pick one.
export function Identity() {
  const router = useRouter();
  const [roll, setRoll] = useState<Roll>({ index: 0, turn: 0, from: null });
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<Role | null>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const [hint, setHint] = useState(false);
  const [touched, setTouched] = useState(false);
  const indexRef = useRef(0);
  const measure = useRef<HTMLSpanElement>(null);
  const slot = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const lastWheel = useRef(0);
  const pointerType = useRef("mouse");

  const move = useCallback((next: number) => {
    const wrapped = ((next % COUNT) + COUNT) % COUNT;
    if (wrapped === indexRef.current) return;
    indexRef.current = wrapped;
    setRoll((current) => ({ index: wrapped, turn: current.turn + 1, from: current.index }));
  }, []);

  // the blank is as wide as the word in it, and eases between widths
  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const read = () =>
      setWidths([...node.children].map((child) => Math.ceil((child as HTMLElement).getBoundingClientRect().width)));
    read();
    document.fonts?.ready.then(read);
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (open || leaving) return;
    const timer = window.setInterval(() => move(indexRef.current + 1), reducedMotion() ? HOLD * 1.5 : HOLD);
    return () => window.clearInterval(timer);
  }, [open, leaving, move]);

  // the outgoing word is only kept while it animates away
  useEffect(() => {
    if (roll.from === null) return;
    const turn = roll.turn;
    const timer = window.setTimeout(
      () => setRoll((current) => (current.turn === turn ? { ...current, from: null } : current)),
      720,
    );
    return () => window.clearTimeout(timer);
  }, [roll.from, roll.turn]);

  useEffect(() => {
    if (touched) return;
    const timer = window.setTimeout(() => setHint(true), HINT_AFTER);
    return () => window.clearTimeout(timer);
  }, [touched]);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 600));
    idle(() => {
      for (const role of ROLES) if (role !== "student") router.prefetch(`/${role}`);
    });
  }, [router]);

  const show = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setTouched(true);
    setHint(false);
    setOpen(true);
  }, []);

  const hide = useCallback((delay = 260) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  }, []);

  const go = useCallback(
    async (role: Role, from?: { x: number; y: number }) => {
      if (leaving) return;
      setLeaving(role);
      // from the list, the chosen word slides into the blank; the rest fade
      move(ROLES.indexOf(role));
      const reduced = reducedMotion();
      const box = slot.current?.getBoundingClientRect();
      const x = from?.x ?? (box ? box.left + box.width / 2 : innerWidth / 2);
      const y = from?.y ?? (box ? box.top + box.height / 2 : innerHeight / 2);
      // the rest of the sentence goes quiet before the next page arrives
      await new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 440));
      const sheet = await cover(role, x, y, reduced);
      if (role === "student") {
        // a full load, so the mat's global styles start fresh
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/student");
        return;
      }
      router.push(`/${role}`);
      uncoverWhenReady(sheet, role);
    },
    [leaving, router, move],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      show();
      move(indexRef.current + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      show();
      move(indexRef.current - 1);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!open || Math.abs(event.deltaY) < 4) return;
    const now = performance.now();
    if (now - lastWheel.current < 260) return;
    lastWheel.current = now;
    move(indexRef.current + Math.sign(event.deltaY));
  };

  const onSlotClick = (event: React.MouseEvent) => {
    // a first tap on a touch screen opens the list; a click enters
    if (pointerType.current !== "mouse" && !open) {
      show();
      return;
    }
    void go(ROLES[indexRef.current], event.detail ? { x: event.clientX, y: event.clientY } : undefined);
  };

  const pick = (role: Role) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void go(role, event.detail ? { x: event.clientX, y: event.clientY } : undefined);
  };

  const leaveBlank = (event: React.FocusEvent) => {
    if (!event.currentTarget.closest(`.${styles.blank}`)?.contains(event.relatedTarget as Node)) hide(0);
  };

  const role = ROLES[roll.index];
  const width = widths?.[roll.index];

  return (
    <main
      data-world="identity"
      className={`${styles.root} ${identityFonts}`}
      data-open={open || undefined}
      data-leaving={leaving ?? undefined}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
        if (open && !(event.target as Element).closest(`.${styles.blank}`)) setOpen(false);
      }}
    >
      <h1 className={styles.line} aria-label={`Hi, my name is Aiden and I am a ${role}.`}>
        <span className={styles.head}>
          <span className={styles.part} style={{ "--d": 0 } as React.CSSProperties}>
            Hi,
          </span>{" "}
          <span className={styles.part} style={{ "--d": 1 } as React.CSSProperties}>
            my name is <span className={styles.name}>Aiden</span>
          </span>
        </span>{" "}
        <span className={styles.tail}>
          <span className={styles.part} style={{ "--d": 2 } as React.CSSProperties}>
            and I am a
          </span>{" "}
          <span
            className={styles.blank}
            onPointerEnter={(event) => event.pointerType === "mouse" && show()}
            onPointerLeave={(event) => event.pointerType === "mouse" && hide()}
            onWheel={onWheel}
          >
            <button
              ref={slot}
              type="button"
              className={styles.slot}
              style={width ? { width } : undefined}
              aria-label={`${role}. Use the arrow keys to change, Enter to visit.`}
              aria-expanded={open}
              aria-controls="identity-roles"
              onFocus={show}
              onBlur={leaveBlank}
              onKeyDown={onKeyDown}
              onClick={onSlotClick}
            >
              {roll.from !== null ? (
                <span
                  key={`out-${roll.turn}`}
                  className={styles.word}
                  data-role={ROLES[roll.from]}
                  data-phase="out"
                  aria-hidden="true"
                >
                  {ROLES[roll.from]}
                </span>
              ) : null}
              <span
                key={`in-${roll.turn}`}
                className={styles.word}
                data-role={role}
                data-phase={roll.turn ? "in" : "first"}
              >
                {role}
              </span>
            </button>
            <span
              id="identity-roles"
              className={styles.picker}
              style={{ "--at": roll.index } as React.CSSProperties}
              aria-hidden="true"
            >
              {ROLES.map((option, at) => (
                <span key={option} className={styles.row}>
                  <a
                    href={`/${option}`}
                    className={`${styles.word} ${styles.option}`}
                    data-role={option}
                    data-current={at === roll.index || undefined}
                    data-chosen={leaving === option || undefined}
                    tabIndex={-1}
                    onPointerEnter={() => option !== "student" && router.prefetch(`/${option}`)}
                    onFocus={show}
                    onBlur={leaveBlank}
                    onClick={pick(option)}
                  >
                    {option}
                  </a>
                </span>
              ))}
            </span>
          </span>
          <span className={styles.part} style={{ "--d": 3 } as React.CSSProperties}>
            .
          </span>
        </span>
        <span ref={measure} className={styles.measure} aria-hidden="true">
          {ROLES.map((option) => (
            <span key={option} className={styles.word} data-role={option}>
              {option}
            </span>
          ))}
        </span>
      </h1>

      <nav className={styles.hidden} aria-label="Pages">
        <ul>
          {ROLES.map((option) => (
            <li key={option}>
              <a href={`/${option}`} tabIndex={-1}>
                I am a {option}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <p className={styles.hint} data-shown={hint || undefined} aria-hidden="true">
        <span className={styles.fine}>hover the word to choose</span>
        <span className={styles.coarse}>tap the word to choose</span>
      </p>
    </main>
  );
}
