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
const SHIFT_LAYOUT = "(min-width: 881px)";
const SHIFT_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const SHIFT_MS = 620;
const SHIFT_STAGGER = 110;
const SHIFT_ID = "row-shift";
// Blocks that stay in the second column; they move vertically as the row restacks.
const SHIFT_STAY = ".project-detail, .project-meta, .timeline-body, .timeline-layout time";
// Blocks that sweep across into the second column, along with the fan.
const SHIFT_SWEEP = ".project-number, .project-heading h3, .project-summary, .timeline-organization, .cabinet";

type RowSnapshot = {
  row: HTMLElement;
  on: boolean;
  box: DOMRect;
  items: { element: HTMLElement; rect: DOMRect; sweeps: boolean }[];
};

type GalleryImage = {
  src: string;
  alt: string;
  fit: string;
  position: string;
  kind: MediaKind;
};

type MediaKind = "image" | "video";
type Media = HTMLImageElement | HTMLVideoElement;

function printMedia(print: Element | undefined): Media | null {
  const media = print?.querySelector("img, video");
  return media instanceof HTMLImageElement || media instanceof HTMLVideoElement ? media : null;
}

function mediaKind(media: Media): MediaKind {
  return media instanceof HTMLVideoElement ? "video" : "image";
}

// Prints load videos with a `#t=` fragment to show a frame; the viewer plays from the start.
function mediaSrc(media: Media) {
  return (media.currentSrc || media.src).split("#")[0] ?? "";
}

function mediaAlt(media: Media) {
  return media instanceof HTMLImageElement ? media.alt : (media.getAttribute("aria-label") ?? "");
}

function mediaAspect(media: Media) {
  const [width, height] =
    media instanceof HTMLVideoElement
      ? [media.videoWidth, media.videoHeight]
      : [media.naturalWidth, media.naturalHeight];
  return width > 0 && height > 0 ? width / height : null;
}

function isReady(media: Media) {
  return media instanceof HTMLVideoElement
    ? media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    : media.complete;
}

// FLIP: record where every block is drawn (mid-flight included), switch
// layouts, then play each block from its old spot to its new one. Offsets
// are row-relative because neighbouring rows resize at the same time.
function morphRows(rows: HTMLElement[]) {
  const snapshots: RowSnapshot[] = rows.map((row) => ({
    row,
    on: !row.classList.contains("is-shifted"),
    box: row.getBoundingClientRect(),
    items: [
      ...[...row.querySelectorAll<HTMLElement>(SHIFT_STAY)].map((element) => ({
        element,
        sweeps: false,
      })),
      ...[...row.querySelectorAll<HTMLElement>(SHIFT_SWEEP)].map((element) => ({
        element,
        sweeps: true,
      })),
    ].map((item) => ({ ...item, rect: item.element.getBoundingClientRect() })),
  }));

  for (const { row, on, items } of snapshots) {
    for (const target of [row, ...items.map((item) => item.element)]) {
      for (const animation of target.getAnimations()) {
        if (animation.id === SHIFT_ID) animation.cancel();
      }
    }
    row.classList.toggle("is-shifted", on);
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const plans = snapshots.map((snapshot) => ({
    ...snapshot,
    next: snapshot.row.getBoundingClientRect(),
    lasts: snapshot.items.map((item) => item.element.getBoundingClientRect()),
  }));

  for (const { row, on, box, items, next, lasts } of plans) {
    // Opening: the second column drops first, then the title sweeps over it.
    // Closing: the title sweeps back first, then the column rises.
    const stayDelay = on ? 0 : SHIFT_STAGGER;
    const sweepDelay = on ? SHIFT_STAGGER : 0;
    const play = (target: HTMLElement, keyframes: Keyframe[], delay: number) => {
      const animation = target.animate(keyframes, {
        duration: SHIFT_MS,
        easing: SHIFT_EASE,
        delay,
        fill: "backwards",
      });
      animation.id = SHIFT_ID;
    };

    if (Math.abs(box.height - next.height) > 0.5) {
      play(row, [{ height: `${box.height}px` }, { height: `${next.height}px` }], stayDelay);
    }
    items.forEach(({ element, rect, sweeps }, index) => {
      const last = lasts[index];
      if (!last) return;
      const dx = rect.left - box.left - (last.left - next.left);
      const dy = rect.top - box.top - (last.top - next.top);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      play(
        element,
        [{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }],
        sweeps ? sweepDelay : stayDelay,
      );
    });
  }
}

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

  // Rows reflow to make room for their fan; see .is-shifted in globals.css.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    // Rows without a fan have nothing to make room for.
    const rows = [...node.querySelectorAll<HTMLElement>("[data-cabinet-id]")].filter(
      (row) => row.querySelector(".cabinet-print") !== null,
    );
    const shiftLayout = window.matchMedia(SHIFT_LAYOUT);
    const hoverLayout = window.matchMedia(HOVER_LAYOUT);

    const wantsShift = (row: HTMLElement) =>
      shiftLayout.matches &&
      (row.classList.contains("is-open") ||
        row.classList.contains("is-viewing") ||
        row.querySelector(":focus-visible") !== null ||
        (hoverLayout.matches && row.matches(":hover")));

    const sync = () => {
      const changed = rows.filter(
        (row) => wantsShift(row) !== row.classList.contains("is-shifted"),
      );
      if (changed.length > 0) morphRows(changed);
    };
    const syncNextFrame = () => requestAnimationFrame(sync);

    const observer = new MutationObserver(sync);
    for (const row of rows) observer.observe(row, { attributeFilter: ["class"] });
    node.addEventListener("pointerover", sync);
    node.addEventListener("pointerleave", sync);
    node.addEventListener("focusin", syncNextFrame);
    node.addEventListener("focusout", syncNextFrame);
    shiftLayout.addEventListener("change", sync);
    hoverLayout.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      node.removeEventListener("pointerover", sync);
      node.removeEventListener("pointerleave", sync);
      node.removeEventListener("focusin", syncNextFrame);
      node.removeEventListener("focusout", syncNextFrame);
      shiftLayout.removeEventListener("change", sync);
      hoverLayout.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!open.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer.current();
      }
      // Arrow keys seek a focused video instead of changing items.
      if (event.target instanceof HTMLVideoElement) return;
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

  function stageSlots() {
    return [...(stage.current?.querySelectorAll<HTMLElement>(".print-viewer-slot") ?? [])];
  }

  function slotVideo(slot: HTMLElement) {
    return slot.querySelector("video");
  }

  // Points a slot at the element matching the source's kind and copies its framing.
  function fillSlot(slot: HTMLElement, source: Media): Media | null {
    const kind = mediaKind(source);
    const target = kind === "video" ? slotVideo(slot) : slot.querySelector("img");
    if (!target) return null;
    slot.dataset.kind = kind;
    target.style.objectFit = source.style.objectFit || "contain";
    target.style.objectPosition = source.style.objectPosition || "50% 50%";
    if (target instanceof HTMLImageElement) target.alt = mediaAlt(source);
    else target.setAttribute("aria-label", mediaAlt(source));
    return target;
  }

  function playVideo(video: HTMLVideoElement) {
    if (reducedMotion()) return;
    video.play().catch(() => {});
  }

  function pauseSlot(slot: HTMLElement) {
    slotVideo(slot)?.pause();
  }

  function unloadVideos() {
    for (const slot of stageSlots()) {
      const video = slotVideo(slot);
      if (!video?.hasAttribute("src")) continue;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
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
    const media = printMedia(print);
    if (!node || !media) return;

    const [front, back] = stageSlots();
    if (front) {
      const target = fillSlot(front, media);
      front.classList.remove("is-hidden");
      if (target) {
        const src = mediaSrc(media);
        if (target.getAttribute("src") !== src) target.setAttribute("src", src);
        if (target instanceof HTMLVideoElement) playVideo(target);
      }
    }
    if (back) {
      back.classList.add("is-hidden");
      pauseSlot(back);
    }

    const from = imageSurface(print).getBoundingClientRect();
    const natural = mediaAspect(media) ?? from.width / Math.max(from.height, 1);
    const aspect =
      media.style.objectFit === "cover" ? from.width / Math.max(from.height, 1) : natural;
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

  function crossfade(source: Media) {
    const slots = stageSlots();
    const front = slots.find((slot) => !slot.classList.contains("is-hidden")) ?? slots[0];
    const back = slots.find((slot) => slot !== front);
    if (!front || !back) return;
    const kind = mediaKind(source);
    const src = mediaSrc(source);
    pauseSlot(back);
    const target = fillSlot(back, source);
    if (!target) return;
    const reveal = () => {
      // A later selection may have repointed this slot while it loaded.
      if (back.dataset.kind !== kind || target.getAttribute("src") !== src) return;
      back.classList.remove("is-hidden");
      front.classList.add("is-hidden");
      pauseSlot(front);
      if (target instanceof HTMLVideoElement) playVideo(target);
    };
    if (target.getAttribute("src") === src && isReady(target)) {
      reveal();
      return;
    }
    target.addEventListener(kind === "video" ? "loadeddata" : "load", reveal, { once: true });
    target.addEventListener("error", reveal, { once: true });
    target.setAttribute("src", src);
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
    const images = prints.flatMap((item): GalleryImage[] => {
      const media = printMedia(item);
      if (!media) return [];
      return [
        {
          src: mediaSrc(media),
          alt: mediaAlt(media),
          fit: media.style.objectFit || "cover",
          position: media.style.objectPosition || "50% 50%",
          kind: mediaKind(media),
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
    unloadVideos();
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
    const media = printMedia(galleryPrints.current[index]);
    if (!open.current || closing.current || !media) return;
    if (index === activeIndex.current) return;
    setSource(index);
    crossfade(media);
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
              {["", " is-hidden"].map((hidden) => (
                <div className={`print-viewer-slot${hidden}`} data-kind="image" key={hidden}>
                  <img alt="" draggable={false} />
                  <video controls loop muted playsInline preload="auto" />
                </div>
              ))}
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
                  aria-label={`View ${image.kind} ${index + 1}${image.alt ? `: ${image.alt}` : ""}`}
                  aria-pressed={galleryIndex === index}
                  onClick={() => selectGalleryImage(index)}
                >
                  {image.kind === "video" ? (
                    <video
                      aria-hidden="true"
                      muted
                      playsInline
                      preload="metadata"
                      src={`${image.src}#t=0.001`}
                      style={thumbnailStyle(image)}
                    />
                  ) : (
                    <img src={image.src} alt="" draggable={false} style={thumbnailStyle(image)} />
                  )}
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

function thumbnailStyle(image: GalleryImage): CSSProperties {
  return {
    objectFit: image.fit as CSSProperties["objectFit"],
    objectPosition: image.position,
  };
}
