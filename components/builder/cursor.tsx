"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import { reducedMotion } from "./motion";
import styles from "./cursor.module.css";

export type PillHandle = {
  show: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
};

// A critically damped spring on the pill's position: it keeps up with the
// hand, trails it by a hair and settles in about a sixth of a second,
// without wobbling.
const STIFFNESS = 900;
const DAMPING = 60;

// "Open", beside the pointer while it's over a card's picture. The system
// cursor is never hidden; the pill only rides along with it, and touch,
// keyboard and reduced motion never see it.
export function CursorPill({ ref }: { ref?: Ref<PillHandle> }) {
  const pill = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => {
    const at = { x: 0, y: 0 };
    const speed = { x: 0, y: 0 };
    const goal = { x: 0, y: 0 };
    let shown = false;
    let frame = 0;
    let last = 0;
    let hiddenAt = 0;

    const draw = () => {
      if (pill.current) pill.current.style.transform = `translate3d(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px, 0)`;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      for (const axis of ["x", "y"] as const) {
        speed[axis] += (STIFFNESS * (goal[axis] - at[axis]) - DAMPING * speed[axis]) * dt;
        at[axis] += speed[axis] * dt;
      }
      draw();
      const still = Math.abs(goal.x - at.x) + Math.abs(goal.y - at.y) < 0.1 && Math.abs(speed.x) + Math.abs(speed.y) < 0.1;
      frame = still ? 0 : requestAnimationFrame(tick);
    };

    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const api: PillHandle = {
      show(x, y) {
        if (!pill.current || reducedMotion()) return;
        goal.x = x;
        goal.y = y;
        // fresh from outside the grid it starts at the pointer; from a
        // neighbouring card it glides over
        if (!shown && performance.now() - hiddenAt > 300) {
          at.x = x;
          at.y = y;
          speed.x = 0;
          speed.y = 0;
          draw();
        }
        if (!shown) window.addEventListener("scroll", scrolled, { passive: true });
        shown = true;
        pill.current.dataset.on = "";
        run();
      },
      move(x, y) {
        goal.x = x;
        goal.y = y;
        if (shown) run();
      },
      hide() {
        if (!shown) return;
        shown = false;
        hiddenAt = performance.now();
        window.removeEventListener("scroll", scrolled);
        if (pill.current) delete pill.current.dataset.on;
      },
    };
    // scrolling carries the card out from under a still pointer
    const scrolled = () => api.hide();
    return api;
  }, []);

  return (
    <div ref={pill} className={styles.pill} aria-hidden="true">
      <span>Open</span>
    </div>
  );
}
