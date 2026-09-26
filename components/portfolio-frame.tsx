"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ZOOM_IN_MS = 620;
const ZOOM_OUT_MS = 460;
const HOVER_LAYOUT = "(hover: hover) and (pointer: fine) and (min-width: 881px)";

type GalleryImage = {
  src: string;
  alt: string;
  fit: string;
  position: string;
};

export function PortfolioFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const glideTimer = useRef(0);
  const zoomTimer = useRef(0);
  const galleryRow = useRef<HTMLElement | null>(null);
  const galleryPrints = useRef<HTMLElement[]>([]);
  const activeIndex = useRef(0);
  const stageBox = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = useRef(false);
  const closing = useRef(false);
  const closeViewer = useRef<() => void>(() => {});
  const stepGallery = useRef<(direction: -1 | 1) => void>(() => {});
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!open.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer.current();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepGallery.current(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepGallery.current(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(glideTimer.current);
      window.clearTimeout(zoomTimer.current);
      window.removeEventListener("keydown", onKey);
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

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function imageSurface(print: HTMLElement) {
    return print.querySelector<HTMLElement>(".cabinet-photo") ?? print;
  }

  function stageImages() {
    return [...(stage.current?.querySelectorAll("img") ?? [])];
  }

  function copyFrame(target: HTMLImageElement, source: HTMLImageElement) {
    target.style.objectFit = source.style.objectFit || "contain";
    target.style.objectPosition = source.style.objectPosition || "50% 50%";
  }

  // Transform that maps the centred stage back onto a print's thumbnail.
  function sourceTransform(print: HTMLElement) {
    const from = imageSurface(print).getBoundingClientRect();
    const box = stageBox.current;
    if (from.width < 2) return null;
    const scale = from.width / box.width;
    return `translate(${from.left - box.left}px, ${from.top - box.top}px) scale(${scale})`;
  }

  function placeStage(print: HTMLElement) {
    const node = stage.current;
    const image = print.querySelector("img");
    if (!node || !(image instanceof HTMLImageElement)) return;

    const [front, back] = stageImages();
    if (front) {
      front.src = image.currentSrc || image.src;
      front.alt = image.alt;
      front.classList.remove("is-hidden");
      copyFrame(front, image);
    }
    back?.classList.add("is-hidden");

    const from = imageSurface(print).getBoundingClientRect();
    const natural =
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : from.width / Math.max(from.height, 1);
    const aspect =
      image.style.objectFit === "cover" ? from.width / Math.max(from.height, 1) : natural;
    const maxW = window.innerWidth * 0.8;
    const maxH = window.innerHeight * 0.68;
    let width = maxW;
    let height = width / aspect;
    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    stageBox.current = { left, top, width, height };

    node.style.transition = "none";
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.transformOrigin = "top left";

    const start = reducedMotion() ? null : sourceTransform(print);
    node.style.transform = start ?? "none";
    if (!start) return;

    // Commit the start position before animating to the centre.
    void node.offsetWidth;
    node.style.transition = `transform ${ZOOM_IN_MS}ms ${ZOOM_EASE}`;
    node.style.transform = "none";
  }

  function crossfade(source: HTMLImageElement) {
    const images = stageImages();
    const front = images.find((img) => !img.classList.contains("is-hidden")) ?? images[0];
    const back = images.find((img) => img !== front);
    if (!front || !back) return;
    const src = source.currentSrc || source.src;
    const reveal = () => {
      if (back.getAttribute("src") !== src) return;
      copyFrame(back, source);
      back.classList.remove("is-hidden");
      front.classList.add("is-hidden");
    };
    back.alt = source.alt;
    if (back.getAttribute("src") === src && back.complete) {
      reveal();
      return;
    }
    back.addEventListener("load", reveal, { once: true });
    back.addEventListener("error", reveal, { once: true });
    back.setAttribute("src", src);
  }

  function setSource(index: number) {
    galleryPrints.current[activeIndex.current]?.classList.remove("is-source");
    activeIndex.current = index;
    setGalleryIndex(index);
    galleryPrints.current[index]?.classList.add("is-source");
  }

  function openViewer(print: HTMLElement, fromKeyboard = false) {
    const row = print.closest<HTMLElement>("[data-cabinet-id]");
    if (!row || open.current) return;

    const prints = [...row.querySelectorAll<HTMLElement>(".cabinet-print")];
    const images = prints.flatMap((item) => {
      const image = item.querySelector("img");
      if (!(image instanceof HTMLImageElement)) return [];
      return [
        {
          src: image.currentSrc || image.src,
          alt: image.alt,
          fit: image.style.objectFit || "cover",
          position: image.style.objectPosition || "50% 50%",
        },
      ];
    });
    if (images.length === 0) return;

    window.clearTimeout(zoomTimer.current);
    open.current = true;
    closing.current = false;
    // Only hand focus back for keyboard users; restoring it after a mouse
    // click would leave the row matching :focus-visible and stuck in the spotlight.
    returnFocus.current =
      fromKeyboard && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    galleryRow.current = row;
    galleryPrints.current = prints;
    row.classList.add("is-viewing");
    setGalleryImages(images);
    setGalleryTitle(
      row.querySelector(".project-heading h3, .timeline-organization")?.textContent?.trim() ||
        "Portfolio images",
    );
    setSource(Math.max(0, prints.indexOf(print)));
    placeStage(print);
    setIsClosing(false);
    setIsActive(true);
    requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
  }

  function finishClose() {
    window.clearTimeout(zoomTimer.current);
    galleryPrints.current[activeIndex.current]?.classList.remove("is-source");
    galleryRow.current?.classList.remove("is-viewing");
    galleryRow.current = null;
    galleryPrints.current = [];
    activeIndex.current = 0;
    open.current = false;
    closing.current = false;
    setIsActive(false);
    setIsClosing(false);
    setGalleryImages([]);
    setGalleryTitle("");
    setGalleryIndex(0);
    if (stage.current) stage.current.style.transition = "none";
    const focusTarget = returnFocus.current;
    returnFocus.current = null;
    if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function dismissViewer() {
    const node = stage.current;
    if (!node || !open.current || closing.current) return;

    closing.current = true;
    setIsClosing(true);
    const print = galleryPrints.current[activeIndex.current];
    const target = print && !reducedMotion() ? sourceTransform(print) : null;
    if (!target) {
      finishClose();
      return;
    }

    node.style.transition = `transform ${ZOOM_OUT_MS}ms ${ZOOM_EASE}`;
    node.style.transform = target;
    zoomTimer.current = window.setTimeout(finishClose, ZOOM_OUT_MS + 20);
  }

  function selectGalleryImage(index: number) {
    const print = galleryPrints.current[index];
    const image = print?.querySelector("img");
    if (!open.current || closing.current || !(image instanceof HTMLImageElement)) return;
    if (index === activeIndex.current) return;
    setSource(index);
    crossfade(image);
  }

  function moveGallery(direction: -1 | 1) {
    const count = galleryPrints.current.length;
    if (count < 2) return;
    selectGalleryImage((activeIndex.current + direction + count) % count);
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const node = frame.current;
    const target = event.target;
    if (!node || !(target instanceof Element)) return;
    if (viewer.current?.contains(target)) return;

    const print = target.closest<HTMLElement>(".cabinet-print");
    const row = target.closest<HTMLElement>("[data-cabinet-id]");
    const hoverLayout = window.matchMedia(HOVER_LAYOUT).matches;

    if (print && (hoverLayout || row?.classList.contains("is-open"))) {
      openViewer(print);
      return;
    }
    if (hoverLayout) return;
    if (target.closest("a, button, input, textarea, select")) return;

    // Touch and narrow layouts: tapping a row toggles its image drawer.
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

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.tagName !== "ARTICLE") return;
    const prints = target.querySelectorAll<HTMLElement>(".cabinet-print");
    const front = prints[prints.length - 1];
    if (!front) return;
    event.preventDefault();
    openViewer(front, true);
  }

  useEffect(() => {
    closeViewer.current = dismissViewer;
    stepGallery.current = moveGallery;
  });

  return (
    <div
      className="site-frame"
      ref={frame}
      onPointerOver={armGlide}
      onPointerLeave={clearGlide}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
      <div
        className={`print-viewer${isActive ? " is-active" : ""}${
          isClosing ? " is-closing" : ""
        }`}
        ref={viewer}
        aria-hidden={!isActive}
        inert={!isActive}
        role="dialog"
        aria-modal={isActive}
        aria-label={`${galleryTitle || "Portfolio"} image viewer`}
      >
        <button
          type="button"
          className="print-viewer-scrim"
          aria-label="Close image"
          tabIndex={-1}
          onClick={() => closeViewer.current()}
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
          ref={closeButton}
          aria-label="Close image viewer"
          onClick={() => closeViewer.current()}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="print-viewer-controls">
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
