"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ZOOM_IN_MS = 820;
const ZOOM_OUT_MS = 560;

type GalleryImage = {
  src: string;
  alt: string;
  fit: string;
  position: string;
};

type FrozenPrintStyle = {
  transform: string;
  transition: string;
};

export function PortfolioFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const glideTimer = useRef(0);
  const zoomedRow = useRef<HTMLElement | null>(null);
  const zoomedPrint = useRef<HTMLElement | null>(null);
  const galleryRow = useRef<HTMLElement | null>(null);
  const galleryPrints = useRef<HTMLElement[]>([]);
  const frozenPrintStyles = useRef(new Map<HTMLElement, FrozenPrintStyle>());
  const activeGalleryIndex = useRef(0);
  const sourceBox = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const settled = useRef(false);
  const closing = useRef(false);
  const stageBox = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const zoomTimer = useRef(0);
  const gapTimer = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const closeZoom = useRef<() => void>(() => {});
  const leaveZoom = useRef<(x: number, y: number) => void>(() => {});
  const stepGallery = useRef<(direction: -1 | 1) => void>(() => {});
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeZoom.current();
      if (event.key === "ArrowLeft" && viewer.current?.classList.contains("is-active")) {
        event.preventDefault();
        stepGallery.current(-1);
      }
      if (event.key === "ArrowRight" && viewer.current?.classList.contains("is-active")) {
        event.preventDefault();
        stepGallery.current(1);
      }
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
    setIsActive(false);
    setIsClosing(false);
    zoomedPrint.current?.classList.remove("is-source");
    const row = zoomedRow.current;
    if (
      row &&
      !pointerOnGalleryRow(row, pointer.current.x, pointer.current.y)
    ) {
      row.classList.remove("is-open");
    }
    restoreGalleryPrints();
    zoomedRow.current = null;
    zoomedPrint.current = null;
    galleryRow.current = null;
    galleryPrints.current = [];
    activeGalleryIndex.current = 0;
    setGalleryImages([]);
    setGalleryTitle("");
    setGalleryIndex(0);
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

    const from = imageSurface(print).getBoundingClientRect();
    const maxW = window.innerWidth * 0.8;
    const maxH = window.innerHeight * 0.68;
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
    setIsClosing(false);
    setIsActive(true);

    if (reduced || !animate) {
      node.style.transform = "none";
      settled.current = true;
      return;
    }

    settled.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (closing.current) return;
        node.style.transition = `transform ${ZOOM_IN_MS}ms ${ZOOM_EASE}`;
        node.style.transform = "translate(0px, 0px) scale(1)";
        zoomTimer.current = window.setTimeout(() => {
          if (!closing.current) {
            settled.current = true;
            const latest = pointer.current;
            leaveZoom.current(latest.x, latest.y);
          }
        }, ZOOM_IN_MS + 40);
      });
    });
  }

  function clearGap() {
    window.clearTimeout(gapTimer.current);
    gapTimer.current = 0;
  }

  function freezeGalleryPrints(prints: HTMLElement[]) {
    for (const print of prints) {
      if (frozenPrintStyles.current.has(print)) continue;
      const computed = getComputedStyle(print);
      frozenPrintStyles.current.set(print, {
        transform: print.style.transform,
        transition: print.style.transition,
      });
      print.style.transition = "none";
      print.style.transform = computed.transform;
    }
  }

  function restoreGalleryPrints() {
    const frozen = [...frozenPrintStyles.current];
    frozenPrintStyles.current.clear();
    for (const [print, style] of frozen) {
      print.style.transition = style.transition;
      requestAnimationFrame(() => {
        print.style.transform = style.transform;
      });
    }
  }

  function showPrint(print: HTMLElement) {
    clearGap();
    window.clearTimeout(zoomTimer.current);
    closing.current = false;
    setIsClosing(false);
    if (stage.current) stage.current.style.pointerEvents = "";

    zoomedPrint.current?.classList.remove("is-source");
    const row = print.closest<HTMLElement>("[data-cabinet-id]");
    if (zoomedRow.current && zoomedRow.current !== row) {
      zoomedRow.current.classList.remove("is-open");
    }
    zoomedRow.current = row;
    zoomedPrint.current = print;
    row?.classList.add("is-open");
    print.classList.add("is-source");

    if (row && row !== galleryRow.current) {
      restoreGalleryPrints();
      const entries = [...row.querySelectorAll<HTMLElement>(".cabinet-print")].flatMap(
        (item) => {
          const image = item.querySelector("img");
          if (!(image instanceof HTMLImageElement)) return [];
          return [
            {
              print: item,
              image: {
                src: image.currentSrc || image.src,
                alt: image.alt,
                fit: image.style.objectFit || "cover",
                position: image.style.objectPosition || "50% 50%",
              },
            },
          ];
        },
      );
      galleryRow.current = row;
      galleryPrints.current = entries.map((entry) => entry.print);
      setGalleryImages(entries.map((entry) => entry.image));
      const title = row.querySelector(
        ".project-heading h3, .timeline-organization",
      )?.textContent;
      setGalleryTitle(title?.trim() || "Portfolio images");
    }
    freezeGalleryPrints(galleryPrints.current);
    const selectedIndex = Math.max(0, galleryPrints.current.indexOf(print));
    activeGalleryIndex.current = selectedIndex;
    setGalleryIndex(selectedIndex);
    const sourceRect = imageSurface(print).getBoundingClientRect();
    sourceBox.current = {
      left: sourceRect.left,
      top: sourceRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
    };

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

  function imageSurface(print: HTMLElement) {
    return print.querySelector<HTMLElement>(".cabinet-photo") ?? print;
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

  function openZoom(print: HTMLElement) {
    const shell = viewer.current;
    const showing = shell?.classList.contains("is-active") && zoomedPrint.current;
    if (showing && zoomedPrint.current === print && !closing.current) return;

    if (showing && zoomedPrint.current !== print) {
      showPrint(print);
      settled.current = true;
      return;
    }

    showPrint(print);
    placeStage(print, true);
  }

  function pointerInsideStage(x: number, y: number) {
    const node = stage.current;
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function pointerInsideSource(x: number, y: number) {
    const box = sourceBox.current;
    return (
      x >= box.left &&
      x <= box.left + box.width &&
      y >= box.top &&
      y <= box.top + box.height
    );
  }

  function elementUnder(x: number, y: number) {
    const shell = viewer.current;
    const previous = shell?.style.visibility ?? "";
    if (shell) shell.style.visibility = "hidden";
    const hit = document.elementFromPoint(x, y);
    if (shell) shell.style.visibility = previous;
    return hit instanceof Element ? hit : null;
  }

  function pointerOnGalleryRow(row: HTMLElement | null, x: number, y: number) {
    if (!row) return false;
    const hit = elementUnder(x, y);
    if (!hit) return false;

    if (hit.closest(".cabinet")) {
      return hit.closest(".cabinet-print")?.closest("[data-cabinet-id]") === row;
    }

    return hit.closest("article")?.closest("[data-cabinet-id]") === row;
  }

  function pointerInsideControls(x: number, y: number) {
    const bounds = [
      controls.current?.getBoundingClientRect(),
      viewer.current
        ?.querySelector<HTMLButtonElement>(".print-viewer-close")
        ?.getBoundingClientRect(),
    ];
    return bounds.some(
      (rect) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    );
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
    if (!settled.current) return;
    if (
      pointerInsideStage(x, y) ||
      pointerInsideSource(x, y) ||
      pointerInsideControls(x, y)
    ) {
      clearGap();
      return;
    }

    const hit = elementUnder(x, y);
    const direct = hit?.closest<HTMLElement>(".cabinet-print") ?? null;
    const print = direct ?? nearestPrint(x, y);
    if (print && print !== zoomedPrint.current) {
      openZoom(print);
      return;
    }
    if (print || pointerOnGalleryRow(zoomedRow.current, x, y)) {
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
        openZoom(next);
        return;
      }
      if (next || pointerOnGalleryRow(zoomedRow.current, latest.x, latest.y)) return;
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
    setIsClosing(true);
    node.style.pointerEvents = "none";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = sourceBox.current;
    const box = stageBox.current;
    if (reduced || !print || from.width < 2) {
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

  function selectGalleryImage(index: number) {
    const print = galleryPrints.current[index];
    if (!print) return;
    showPrint(print);
  }

  function moveGallery(direction: -1 | 1) {
    const count = galleryPrints.current.length;
    if (count < 2) return;
    const next = (activeGalleryIndex.current + direction + count) % count;
    selectGalleryImage(next);
  }

  stepGallery.current = moveGallery;

  function onPointerOver(event: PointerEvent<HTMLDivElement>) {
    armGlide(event);
    pointer.current = { x: event.clientX, y: event.clientY };
    if (
      !window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 881px)").matches
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (viewer.current?.contains(target)) return;
    const print = target.closest<HTMLElement>(".cabinet-print");
    if (!print) return;
    openZoom(print);
  }

  function toggleGalleryOnClick(event: MouseEvent<HTMLDivElement>) {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (
      window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 881px)").matches
    ) {
      return;
    }

    const node = frame.current;
    const target = event.target;
    if (!node || !(target instanceof Element)) return;
    if (viewer.current?.contains(target)) return;
    if (target.closest("a, button, input, textarea, select")) return;

    const print = target.closest<HTMLElement>(".cabinet-print");
    const row = target.closest<HTMLElement>("[data-cabinet-id]");
    if (print && row?.classList.contains("is-open")) {
      openZoom(print);
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
      onClick={toggleGalleryOnClick}
    >
      {children}
      <div
        className={`print-viewer${isActive ? " is-active" : ""}${
          isClosing ? " is-closing" : ""
        }`}
        ref={viewer}
        aria-hidden={!isActive}
        inert={!isActive}
        role="group"
        aria-label={`${galleryTitle || "Portfolio"} image viewer`}
      >
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
        <button
          type="button"
          className="print-viewer-close"
          aria-label="Close image viewer"
          onClick={() => closeZoom.current()}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="print-viewer-controls" ref={controls}>
          <button
            type="button"
            className="print-viewer-arrow"
            aria-label="Previous image"
            disabled={galleryImages.length < 2}
            onClick={() => moveGallery(-1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="print-viewer-selection">
            <div className="print-viewer-caption" aria-live="polite">
              <span>{galleryTitle}</span>
              <span className="print-viewer-count">
                {galleryImages.length ? `${galleryIndex + 1} / ${galleryImages.length}` : ""}
              </span>
            </div>
            <div className="print-viewer-thumbnails" role="group" aria-label="Choose image">
              {galleryImages.map((image, index) => (
                <button
                  type="button"
                  className="print-viewer-thumbnail"
                  key={`${image.src}-${index}`}
                  aria-label={`View image ${index + 1}${image.alt ? `: ${image.alt}` : ""}`}
                  aria-pressed={galleryIndex === index}
                  onClick={() => selectGalleryImage(index)}
                >
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    style={{
                      objectFit: image.fit as CSSProperties["objectFit"],
                      objectPosition: image.position,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="print-viewer-arrow"
            aria-label="Next image"
            disabled={galleryImages.length < 2}
            onClick={() => moveGallery(1)}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
