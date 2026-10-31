"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import { reducedMotion } from "./motion";
import styles from "./cursor.module.css";

export type PillHandle = {
  show: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
};

// spring on the pill's position: stiff enough to keep up, damped just under
// critical so it lags and settles without wobbling
const STIFFNESS = 240;
const DAMPING = 25;

// How far above something the pointer must be for the pill (drawn 16px
// below and 26px tall, cursor.module.css) to clear it by a few pixels.
export const PILL_CLEARANCE = 48;

// "Open", trailing the mouse over a card.
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
      if (pill.current) pill.current.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
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

    return {
      show(x, y) {
        if (!pill.current || reducedMotion()) return;
        goal.x = x;
        goal.y = y;
        // fresh from outside the grid it starts at the pointer; from a
        // neighbouring card it flies over
        if (!shown && performance.now() - hiddenAt > 350) {
          at.x = x;
          at.y = y;
          speed.x = 0;
          speed.y = 0;
          draw();
        }
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
        if (pill.current) delete pill.current.dataset.on;
      },
    };
  }, []);

  return (
    <div ref={pill} className={styles.pill} aria-hidden="true">
      <span>Open</span>
    </div>
  );
}
