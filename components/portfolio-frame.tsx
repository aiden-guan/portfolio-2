"use client";

import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ZOOM_IN_MS = 820;
const ZOOM_OUT_MS = 560;

export function PortfolioFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const glideTimer = useRef(0);
  const zoomedRow = useRef<HTMLElement | null>(null);
  const zoomedPrint = useRef<HTMLElement | null>(null);
  const settled = useRef(false);
  const closing = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const stageBox = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const zoomTimer = useRef(0);
  const gapTimer = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const closeZoom = useRef<() => void>(() => {});
  const leaveZoom = useRef<(x: number, y: number) => void>(() => {});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeZoom.current();
    };
    const onMove = (event: globalThis.PointerEvent) => {
      leaveZoom.current(event.clientX, event.clientY);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.clearTimeout(glideTimer.current);
      window.clearTimeout(zoomTimer.current);
      window.clearTimeout(gapTimer.current);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
    };
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

  function hideZoom() {
    viewer.current?.classList.remove("is-active", "is-closing");
    viewer.current?.setAttribute("aria-hidden", "true");
    zoomedPrint.current?.classList.remove("is-source");
    const row = zoomedRow.current;
    if (row && !row.matches(":hover")) row.classList.remove("is-open");
    zoomedRow.current = null;
    zoomedPrint.current = null;
    closing.current = false;
    settled.current = false;
    clearGap();
    const node = stage.current;
    if (!node) return;
    node.style.transition = "none";
  }

  function placeStage(print: HTMLElement, animate: boolean) {
    const node = stage.current;
    const shell = viewer.current;
    const image = print.querySelector("img");
    if (!node || !shell || !(image instanceof HTMLImageElement)) return;

    const picture = node.querySelector("img");
    if (picture instanceof HTMLImageElement) {
      picture.src = image.currentSrc || image.src;
      picture.alt = image.alt;
      copyFrame(picture, image);
    }

    const from = print.getBoundingClientRect();
    const maxW = window.innerWidth * 0.8;
    const maxH = window.innerHeight * 0.78;
    const natural =
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : from.width / Math.max(from.height, 1);
    const aspect =
      image.style.objectFit === "cover" ? from.width / Math.max(from.height, 1) : natural;
    let width = maxW;
    let height = width / aspect;
    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    stageBox.current = { left, top, width, height };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sx = from.width / width;
    const dx = from.left - left;
    const dy = from.top - top;

    node.style.transition = "none";
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.transformOrigin = "top left";
    node.style.transform = reduced ? "none" : `translate(${dx}px, ${dy}px) scale(${sx})`;
    shell.classList.remove("is-closing");
    shell.classList.add("is-active");
    shell.setAttribute("aria-hidden", "false");

    if (reduced || !animate) {
      node.style.transform = "none";
      settled.current = true;
      return;
    }

    settled.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.transition = `transform ${ZOOM_IN_MS}ms ${ZOOM_EASE}`;
        node.style.transform = "translate(0px, 0px) scale(1)";
        zoomTimer.current = window.setTimeout(() => {
          if (!closing.current) settled.current = true;
        }, ZOOM_IN_MS + 40);
      });
    });
  }

  function clearGap() {
    window.clearTimeout(gapTimer.current);
    gapTimer.current = 0;
  }

  function showPrint(print: HTMLElement, x: number, y: number) {
    clearGap();
    window.clearTimeout(zoomTimer.current);
    closing.current = false;
    origin.current = { x, y };
    if (stage.current) stage.current.style.pointerEvents = "";
    viewer.current?.classList.remove("is-closing");

    zoomedPrint.current?.classList.remove("is-source");
    const row = print.closest<HTMLElement>("[data-cabinet-id]");
    if (zoomedRow.current && zoomedRow.current !== row) {
      zoomedRow.current.classList.remove("is-open");
    }
    zoomedRow.current = row;
    zoomedPrint.current = print;
    row?.classList.add("is-open");
    print.classList.add("is-source");

    const shell = viewer.current;
    const node = stage.current;
    const image = print.querySelector("img");
    const picture = visiblePicture();
    const alreadyOpen = Boolean(shell?.classList.contains("is-active"));
    if (image instanceof HTMLImageElement && picture) {
      const nextSrc = image.currentSrc || image.src;
      const fade = alreadyOpen && picture.getAttribute("src") && picture.src !== nextSrc;
      if (fade) crossfade(image);
      else {
        picture.src = nextSrc;
        picture.alt = image.alt;
        copyFrame(picture, image);
      }
    }

    if (node && alreadyOpen) {
      node.style.transition = "none";
      node.style.transform = "translate(0px, 0px) scale(1)";
      settled.current = true;
    }
  }

  function visiblePicture() {
    const images = stage.current?.querySelectorAll("img");
    if (!images?.length) return null;
    return [...images].find((img) => !img.classList.contains("is-hidden")) ?? images[0];
  }

  function crossfade(source: HTMLImageElement) {
    const images = [...(stage.current?.querySelectorAll("img") ?? [])];
    const front = images.find((img) => !img.classList.contains("is-hidden")) ?? images[0];
    const back = images.find((img) => img !== front);
    if (!front || !back) return;
    const src = source.currentSrc || source.src;
    const reveal = () => {
      copyFrame(back, source);
      copyFrame(front, source);
      back.classList.remove("is-hidden");
      front.classList.add("is-hidden");
    };
    if (back.src === src && back.complete && back.naturalWidth > 0) {
      back.alt = source.alt;
      reveal();
      return;
    }
    back.alt = source.alt;
    back.addEventListener("load", reveal, { once: true });
    back.src = src;
  }

  function copyFrame(target: HTMLImageElement, source: HTMLImageElement) {
    target.style.objectFit = source.style.objectFit || "contain";
    target.style.objectPosition = source.style.objectPosition || "50% 50%";
  }

  function openZoom(print: HTMLElement, x: number, y: number) {
    const shell = viewer.current;
    const showing = shell?.classList.contains("is-active") && zoomedPrint.current;
    if (showing && zoomedPrint.current === print && !closing.current) return;

    if (showing && zoomedPrint.current !== print) {
      showPrint(print, x, y);
      settled.current = true;
      return;
    }

    showPrint(print, x, y);
    placeStage(print, true);
  }

  function pointerInsideStage(x: number, y: number) {
    const node = stage.current;
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function elementUnder(x: number, y: number) {
    const node = stage.current;
    const previous = node?.style.pointerEvents ?? "";
    if (node) node.style.pointerEvents = "none";
    const hit = document.elementFromPoint(x, y);
    if (node && !closing.current) node.style.pointerEvents = previous;
    return hit instanceof Element ? hit : null;
  }

  function nearestPrint(x: number, y: number) {
    const row = zoomedRow.current;
    if (!row) return null;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const print of row.querySelectorAll<HTMLElement>(".cabinet-print")) {
      const rect = print.getBoundingClientRect();
      if (rect.width < 2) continue;
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      if (dx > 96 || dy > 28) continue;
      const dist = dx + dy * 3;
      if (dist < bestDist) {
        bestDist = dist;
        best = print;
      }
    }
    return best;
  }

  function leaveZoomAt(x: number, y: number) {
    pointer.current = { x, y };
    const shell = viewer.current;
    if (!shell?.classList.contains("is-active") || closing.current) return;
    const moved = Math.hypot(x - origin.current.x, y - origin.current.y);
    if (!settled.current && moved < 8) return;
    if (pointerInsideStage(x, y)) {
      clearGap();
      return;
    }

    const hit = elementUnder(x, y);
    const direct = hit?.closest<HTMLElement>(".cabinet-print") ?? null;
    const print = direct ?? nearestPrint(x, y);
    if (print && print !== zoomedPrint.current) {
      openZoom(print, x, y);
      return;
    }
    if (hit?.closest(".cabinet") || print) {
      clearGap();
      return;
    }

    if (gapTimer.current) return;
    gapTimer.current = window.setTimeout(() => {
      gapTimer.current = 0;
      if (!viewer.current?.classList.contains("is-active") || closing.current) return;
      const latest = pointer.current;
      if (pointerInsideStage(latest.x, latest.y)) return;
      const again = elementUnder(latest.x, latest.y);
      const next =
        again?.closest<HTMLElement>(".cabinet-print") ?? nearestPrint(latest.x, latest.y);
      if (next && next !== zoomedPrint.current) {
        openZoom(next, latest.x, latest.y);
        return;
      }
      if (again?.closest(".cabinet") || next) return;
      dismissZoom();
    }, 90);
  }

  leaveZoom.current = leaveZoomAt;

  function dismissZoom() {
    const node = stage.current;
    const shell = viewer.current;
    const print = zoomedPrint.current;
    if (!node || !shell || !shell.classList.contains("is-active") || closing.current) return;

    window.clearTimeout(zoomTimer.current);
    closing.current = true;
    settled.current = false;
    shell.classList.add("is-closing");
    node.style.pointerEvents = "none";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = print?.getBoundingClientRect();
    const box = stageBox.current;
    if (reduced || !from || from.width < 2) {
      hideZoom();
      return;
    }

    const sx = from.width / box.width;
    const dx = from.left - box.left;
    const dy = from.top - box.top;
    node.style.transition = `transform ${ZOOM_OUT_MS}ms ${ZOOM_EASE}`;
    node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx})`;
    zoomTimer.current = window.setTimeout(() => {
      if (closing.current) hideZoom();
    }, ZOOM_OUT_MS + 40);
  }

  closeZoom.current = dismissZoom;

  function onPointerOver(event: PointerEvent<HTMLDivElement>) {
    armGlide(event);
    if (!window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 881px)").matches) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (viewer.current?.contains(target)) return;
    const print = target.closest<HTMLElement>(".cabinet-print");
    if (!print) return;
    openZoom(print, event.clientX, event.clientY);
  }

  function toggleOnCoarsePointer(event: MouseEvent<HTMLDivElement>) {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const node = frame.current;
    const target = event.target;
    if (!node || !(target instanceof Element)) return;
    if (viewer.current?.contains(target)) return;
    if (target.closest("a, button, input, textarea, select")) return;

    const print = target.closest<HTMLElement>(".cabinet-print");
    const row = target.closest<HTMLElement>("[data-cabinet-id]");
    if (print && row?.classList.contains("is-open")) {
      openZoom(print, event.clientX, event.clientY);
      return;
    }

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
      onPointerOver={onPointerOver}
      onPointerLeave={clearGlide}
      onClick={toggleOnCoarsePointer}
    >
      {children}
      <div className="print-viewer" ref={viewer} aria-hidden="true">
        <button
          type="button"
          className="print-viewer-scrim"
          aria-label="Close image"
          tabIndex={-1}
          onClick={() => closeZoom.current()}
        />
        <div className="print-viewer-stage" ref={stage}>
          <div className="print-viewer-lens">
            <div className="print-viewer-mat">
              <img alt="" draggable={false} />
              <img alt="" className="is-hidden" draggable={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
