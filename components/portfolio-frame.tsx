"use client";

import { type MouseEvent, type PointerEvent, type ReactNode, useEffect, useRef } from "react";

export function PortfolioFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const glideTimer = useRef(0);

  useEffect(() => {
    return () => window.clearTimeout(glideTimer.current);
  }, []);

  function armGlide(event: PointerEvent<HTMLDivElement>) {
    const node = frame.current;
    const target = event.target;
    if (!node || !(target instanceof Element) || node.dataset.gliding === "true") return;
    if (!target.closest("[data-cabinet-id]")) return;
    if (node.dataset.armed === "true") return;

    node.dataset.armed = "true";
    window.clearTimeout(glideTimer.current);
    glideTimer.current = window.setTimeout(() => {
      node.dataset.gliding = "true";
    }, 560);
  }

  function clearGlide() {
    const node = frame.current;
    window.clearTimeout(glideTimer.current);
    if (!node) return;
    delete node.dataset.armed;
    delete node.dataset.gliding;
  }

  function toggleOnCoarsePointer(event: MouseEvent<HTMLDivElement>) {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const node = frame.current;
    const target = event.target;
    if (!node || !(target instanceof Element)) return;
    if (target.closest("a, button, input, textarea, select")) return;

    const row = target.closest<HTMLElement>("[data-cabinet-id]");
    node.querySelectorAll<HTMLElement>("[data-cabinet-id].is-open").forEach((item) => {
      if (item !== row) item.classList.remove("is-open");
    });
    if (!row) return;

    const willClose = row.classList.contains("is-open");
    row.classList.toggle("is-open");
    if (
      willClose &&
      document.activeElement instanceof HTMLElement &&
      row.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }

  return (
    <div
      className="site-frame"
      ref={frame}
      onPointerOver={armGlide}
      onPointerLeave={clearGlide}
      onClick={toggleOnCoarsePointer}
    >
      {children}
    </div>
  );
}
