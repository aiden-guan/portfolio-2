"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ROLES, type Role } from "@/content/worlds";
import { Egoists } from "./egoists";
import { grotesk } from "@/app/fonts";
import { identityFonts } from "./fonts";
import { liftCovers, uncoverWhenReady, wash } from "./leave";
import { easing, Reel, ROLL } from "./reel";
import { Striker } from "./striker";
import styles from "./identity.module.css";

// the first answer stays a little longer, while the sentence arrives
const FIRST = 3000;
const HOLD = 2600;
const HINT_AFTER = 4200;
const COUNT = ROLES.length;
const LABEL = "Hi, my name is Aiden and I am a founder, student, builder and designer.";

// the reel's spring, so the words around the blank move exactly with it
const SPRING = { "--spring": easing(ROLL), "--spring-ms": `${Math.round(ROLL.duration)}ms` } as CSSProperties;

const wrap = (n: number) => ((n % COUNT) + COUNT) % COUNT;

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The black page: one sentence with a blank in it. The blank rolls through
// the four answers on its own; hover or tap it to see them all and pick one.
export function Identity() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<Role | null>(null);
  const [hint, setHint] = useState(false);
  const [touched, setTouched] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settled, setSettled] = useState(false);
  const [said, setSaid] = useState("");
  const line = useRef<HTMLHeadingElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLSpanElement>(null);
  const reelNode = useRef<HTMLSpanElement>(null);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  const reel = useRef<Reel | null>(null);
  const indexRef = useRef(0);
  const openRef = useRef(false);
  const leavingRef = useRef(false);
  const firstRoll = useRef(true);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const lastWheel = useRef(0);
  const pointerType = useRef("mouse");
  const wasOpen = useRef(false);

  // the reel, once its rows are on the page
  useLayoutEffect(() => {
    const node = line.current;
    const nodes = rows.current.filter((row): row is HTMLAnchorElement => row !== null);
    if (!node || !reelNode.current || nodes.length !== COUNT) return;
    const instance = new Reel({ line: node, reel: reelNode.current, rows: nodes, roles: ROLES }, indexRef.current, reducedMotion());
    reel.current = instance;
    const wrapped = () => {
      if (head.current && tail.current) node.toggleAttribute("data-wrapped", Math.abs(head.current.offsetTop - tail.current.offsetTop) > 2);
    };
    wrapped();
    instance.measure();
    // the faces arrive after the first paint; measure them again when they do
    const fonts = document.fonts;
    const remeasure = () => instance.measure();
    fonts?.ready.then(remeasure);
    fonts?.addEventListener("loadingdone", remeasure);
    const observer = new ResizeObserver(() => {
      wrapped();
      instance.measure();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", remeasure);
      instance.dispose();
      reel.current = null;
    };
  }, []);

  // the parts' masks are only needed while they come up
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  const step = useCallback((to: number, direction: 1 | -1, announce = false) => {
    const instance = reel.current;
    const next = wrap(to);
    if (!instance || next === indexRef.current) return;
    if (openRef.current) instance.slide(next);
    else instance.roll(next, direction);
    indexRef.current = next;
    setIndex(next);
    if (announce) setSaid(ROLES[next]);
  }, []);

  // the blank rolls on by itself while nobody is choosing and the tab is in view
  useEffect(() => {
    if (open || leaving) return;
    const reduced = reducedMotion();
    let timer = 0;
    const schedule = (wait: number) => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        step(indexRef.current + 1, 1);
        schedule(reduced ? HOLD * 1.5 : HOLD);
      }, wait);
    };
    schedule(firstRoll.current ? FIRST : HOLD);
    firstRoll.current = false;
    const onVisibility = () => schedule(HOLD);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, leaving, step]);

  useEffect(() => {
    if (touched || playing) return;
    const timer = window.setTimeout(() => setHint(true), HINT_AFTER);
    return () => window.clearTimeout(timer);
  }, [touched, playing]);

  // the way into /student is a full load, so the back arrow can bring this
  // page back from the browser's cache just as it was left: covered, the
  // sentence gone quiet. Start it again instead.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      liftCovers();
      leavingRef.current = false;
      openRef.current = false;
      reel.current?.reset(indexRef.current);
      setLeaving(null);
      setOpen(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 600));
    idle(() => {
      for (const role of ROLES) if (role !== "student") router.prefetch(`/${role}`);
    });
  }, [router]);

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const show = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setTouched(true);
    setHint(false);
    if (openRef.current || leavingRef.current) return;
    openRef.current = true;
    setOpen(true);
    reel.current?.open();
  }, []);

  const hide = useCallback((delay = 260) => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!openRef.current || leavingRef.current) return;
      openRef.current = false;
      setOpen(false);
      reel.current?.close();
    }, delay);
  }, []);

  const go = useCallback(
    async (role: Role) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      const word = rows.current[ROLES.indexOf(role)];
      // a word still rolling is put where it was going; an open column stays put
      reel.current?.hold(openRef.current);
      setLeaving(role);
      const reduced = reducedMotion();
      const box = word?.getBoundingClientRect() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const sheet = await wash(role, { box, word: word ?? undefined, reduced });
      if (role === "student") {
        // a full load, so the mat's global styles start fresh
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/student");
        return;
      }
      router.push(`/${role}`);
      uncoverWhenReady(sheet, role);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const at = indexRef.current;
    let to: number | null = null;
    let direction: 1 | -1 = 1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = at + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") [to, direction] = [at - 1, -1];
    else if (event.key === "Home") [to, direction] = [0, -1];
    else if (event.key === "End") to = COUNT - 1;
    else if (event.key === "Escape") {
      if (openRef.current) {
        event.preventDefault();
        hide(0);
      }
      return;
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // the first letter of an answer goes straight to it
      const found = ROLES.findIndex((role) => role.startsWith(event.key.toLowerCase()));
      if (found >= 0) [to, direction] = [found, found > at ? 1 : -1];
    }
    if (to === null) return;
    event.preventDefault();
    show();
    step(to, direction, true);
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!openRef.current || Math.abs(event.deltaY) < 4) return;
    const now = performance.now();
    if (now - lastWheel.current < 220) return;
    lastWheel.current = now;
    step(indexRef.current + Math.sign(event.deltaY), event.deltaY > 0 ? 1 : -1);
  };

  const onSlotClick = (event: React.MouseEvent) => {
    // a first tap on a touch screen opens the reel; a click, or Enter, goes
    if (event.detail && pointerType.current !== "mouse" && !wasOpen.current) {
      show();
      return;
    }
    void go(ROLES[indexRef.current]);
  };

  const pick = (role: Role) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void go(role);
  };

  const leaveBlank = (event: React.FocusEvent) => {
    if (!event.currentTarget.closest(`.${styles.blank}`)?.contains(event.relatedTarget as Node)) hide(0);
  };

  const role = ROLES[index];

  return (
    <main
      data-world="identity"
      // the grotesk is here, not in the root layout, so only this page and the mat preload it
      className={`${styles.root} ${identityFonts} ${grotesk.variable}`}
      style={SPRING}
      data-open={open || undefined}
      data-leaving={leaving ?? undefined}
      data-settled={settled || undefined}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
        if (openRef.current && !(event.target as Element).closest(`.${styles.blank}`)) hide(0);
      }}
    >
      <h1 ref={line} className={styles.line} aria-label={LABEL}>
        <span ref={head} className={styles.head}>
          <span className={styles.part}>
            <span className={styles.rise} style={{ "--d": 0 } as CSSProperties}>
              Hi,
            </span>
          </span>{" "}
          <span className={styles.part}>
            <span className={styles.rise} style={{ "--d": 1 } as CSSProperties}>
              my name is <span className={styles.name}>Aiden</span>
            </span>
          </span>
        </span>{" "}
        <span ref={tail} className={styles.tail}>
          <span className={styles.part}>
            <span className={styles.rise} style={{ "--d": 2 } as CSSProperties}>
              and I am a
            </span>
          </span>{" "}
          <span
            className={styles.blank}
            onPointerLeave={(event) => event.pointerType === "mouse" && hide()}
            onWheel={onWheel}
          >
            <span ref={reelNode} className={styles.reel} aria-hidden="true">
              {ROLES.map((option, at) => (
                <a
                  key={option}
                  ref={(node) => {
                    rows.current[at] = node;
                  }}
                  href={`/${option}`}
                  className={styles.row}
                  data-role={option}
                  // the first answer is in the page from the start and comes
                  // up into the blank with the sentence; the reel takes over
                  data-current={at === 0 || undefined}
                  data-enter={at === 0 || undefined}
                  data-chosen={leaving === option || undefined}
                  tabIndex={-1}
                  draggable={false}
                  onPointerEnter={() => option !== "student" && router.prefetch(`/${option}`)}
                  onClick={pick(option)}
                >
                  {option}
                </a>
              ))}
            </span>
            <button
              type="button"
              className={styles.slot}
              aria-label={`I am a ${role}`}
              aria-describedby="identity-keys"
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                window.clearTimeout(closeTimer.current);
                window.clearTimeout(openTimer.current);
                openTimer.current = window.setTimeout(show, 60);
              }}
              onPointerDown={(event) => {
                pointerType.current = event.pointerType;
                wasOpen.current = openRef.current;
              }}
              onFocus={(event) => event.currentTarget.matches(":focus-visible") && show()}
              onBlur={leaveBlank}
              onKeyDown={onKeyDown}
              onClick={onSlotClick}
            />
            <span className={styles.rule} aria-hidden="true" />
          </span>
          <span className={styles.stop}>
            <span className={styles.part}>
              <span className={styles.rise} style={{ "--d": 6 } as CSSProperties}>
                .
              </span>
            </span>
          </span>
        </span>
      </h1>
      <span id="identity-keys" hidden>
        Arrow keys choose another answer, Enter goes to its page.
      </span>
      <span className={styles.hidden} aria-live="polite">
        {said}
      </span>

      <Striker className={styles.pitch} playing={playing} onEnd={() => setPlaying(false)} />

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

      {/* squeeze the plushie and the striker plays */}
      <div className={styles.egoist}>
        <button
          type="button"
          className={styles.plushie}
          data-playing={playing || undefined}
          aria-label="Play the striker"
          onClick={() => setPlaying(true)}
        >
          <Image src="/identity/plushie.webp" alt="" width={158} height={240} draggable={false} />
        </button>
        <Egoists className={styles.count} />
      </div>

      <p className={styles.hint} data-shown={(hint && !open && !leaving && !playing) || undefined} aria-hidden="true">
        <span className={styles.fine}>hover the word to choose</span>
        <span className={styles.coarse}>tap the word to choose</span>
      </p>
    </main>
  );
}
