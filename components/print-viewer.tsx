"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

// The photos clipped to a card open here, large: the print grows out of the
// card into the middle of the window, and shrinks back onto it when closed.

const ZOOM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ZOOM_IN_MS = 620;
const ZOOM_OUT_MS = 460;

type GalleryImage = {
  src: string;
  alt: string;
  fit: string;
  position: string;
  kind: MediaKind;
  // a line of its own, under it, instead of the gallery's title
  caption?: string;
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
  return (media.dataset.full || media.currentSrc || media.src).split("#")[0] ?? "";
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

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PrintViewer() {
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const zoomTimer = useRef(0);
  const prints = useRef<HTMLElement[]>([]);
  const activeIndex = useRef(0);
  const stageBox = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = useRef(false);
  const closing = useRef(false);
  const actions = useRef<{
    open: (print: HTMLElement, fromKeyboard: boolean) => void;
    close: () => void;
    step: (direction: -1 | 1) => void;
  }>({ open: () => {}, close: () => {}, step: () => {} });
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [title, setTitle] = useState("");
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Any print on the page opens the viewer, by pointer or by keyboard.
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || viewer.current?.contains(target)) return;
      const print = target.closest<HTMLElement>('.thing[data-action="open"], .line-photo');
      if (!print) return;
      event.preventDefault();
      actions.current.open(print, event.detail === 0);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!open.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        actions.current.close();
      }
      // Arrow keys seek a focused video instead of changing items.
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        actions.current.step(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        actions.current.step(1);
      }
    };
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.clearTimeout(zoomTimer.current);
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);

  function surface(print: HTMLElement) {
    return print.querySelector<HTMLElement>(".print-window") ?? print;
  }

  function slots() {
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

  function unloadVideos() {
    for (const slot of slots()) {
      const video = slotVideo(slot);
      if (!video?.hasAttribute("src")) continue;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  // Transform that maps the centred stage back onto a print on its card.
  function sourceTransform(print: HTMLElement) {
    const from = surface(print).getBoundingClientRect();
    const box = stageBox.current;
    if (from.width < 2) return null;
    const scale = from.width / box.width;
    return `translate(${from.left - box.left}px, ${from.top - box.top}px) scale(${scale})`;
  }

  function placeStage(print: HTMLElement) {
    const node = stage.current;
    const media = printMedia(print);
    if (!node || !media) return;

    const [front, back] = slots();
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
      slotVideo(back)?.pause();
    }

    const from = surface(print).getBoundingClientRect();
    const natural = mediaAspect(media) ?? from.width / Math.max(from.height, 1);
    const aspect = media.style.objectFit === "cover" ? from.width / Math.max(from.height, 1) : natural;
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
    const all = slots();
    const front = all.find((slot) => !slot.classList.contains("is-hidden")) ?? all[0];
    const back = all.find((slot) => slot !== front);
    if (!front || !back) return;
    const kind = mediaKind(source);
    const src = mediaSrc(source);
    slotVideo(back)?.pause();
    const target = fillSlot(back, source);
    if (!target) return;
    const reveal = () => {
      // A later selection may have repointed this slot while it loaded.
      if (back.dataset.kind !== kind || target.getAttribute("src") !== src) return;
      back.classList.remove("is-hidden");
      front.classList.add("is-hidden");
      slotVideo(front)?.pause();
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

  function setSource(next: number) {
    prints.current[activeIndex.current]?.classList.remove("is-source");
    activeIndex.current = next;
    setIndex(next);
    prints.current[next]?.classList.add("is-source");
  }

  function openViewer(print: HTMLElement, fromKeyboard: boolean) {
    const name = print.dataset.gallery;
    if (!name || open.current) return;
    // every print of the same piece of work, in order
    // (a print that's been cut in two shows as itself, whole)
    const all = [...document.querySelectorAll<HTMLElement>(`:is(.thing, .line-photo)[data-gallery="${CSS.escape(name)}"]:not([data-piece])`)].sort(
      (a, b) => Number(a.dataset.print ?? 0) - Number(b.dataset.print ?? 0),
    );
    const gallery = all.flatMap((item): GalleryImage[] => {
      const media = printMedia(item);
      if (!media) return [];
      return [
        {
          src: mediaSrc(media),
          alt: mediaAlt(media),
          fit: media.style.objectFit || "cover",
          position: media.style.objectPosition || "50% 50%",
          kind: mediaKind(media),
          caption: item.dataset.caption,
        },
      ];
    });
    if (gallery.length === 0) return;

    window.clearTimeout(zoomTimer.current);
    open.current = true;
    closing.current = false;
    // Only hand focus back for keyboard users; a mouse user's focus stays put.
    returnFocus.current =
      fromKeyboard && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    prints.current = all;
    document.documentElement.dataset.viewing = "true";
    setImages(gallery);
    setTitle(print.dataset.title || "Portfolio images");
    setSource(Math.max(0, all.findIndex((item) => item === print || item.dataset.print === print.dataset.print)));
    placeStage(print);
    setIsClosing(false);
    setIsActive(true);
    requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
  }

  function finishClose() {
    window.clearTimeout(zoomTimer.current);
    prints.current[activeIndex.current]?.classList.remove("is-source");
    prints.current = [];
    activeIndex.current = 0;
    open.current = false;
    closing.current = false;
    delete document.documentElement.dataset.viewing;
    setIsActive(false);
    setIsClosing(false);
    setImages([]);
    setTitle("");
    setIndex(0);
    if (stage.current) stage.current.style.transition = "none";
    unloadVideos();
    const focusTarget = returnFocus.current;
    returnFocus.current = null;
    if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function dismiss() {
    const node = stage.current;
    if (!node || !open.current || closing.current) return;
    closing.current = true;
    setIsClosing(true);
    const print = prints.current[activeIndex.current];
    const target = print && !reducedMotion() ? sourceTransform(print) : null;
    if (!target) {
      finishClose();
      return;
    }
    node.style.transition = `transform ${ZOOM_OUT_MS}ms ${ZOOM_EASE}`;
    node.style.transform = target;
    zoomTimer.current = window.setTimeout(finishClose, ZOOM_OUT_MS + 20);
  }

  function select(next: number) {
    const media = printMedia(prints.current[next]);
    if (!open.current || closing.current || !media || next === activeIndex.current) return;
    setSource(next);
    crossfade(media);
  }

  function move(direction: -1 | 1) {
    const count = prints.current.length;
    if (count < 2) return;
    select((activeIndex.current + direction + count) % count);
  }

  useEffect(() => {
    actions.current = { open: openViewer, close: dismiss, step: move };
  });

  return (
    <div
      className={`print-viewer${isActive ? " is-active" : ""}${isClosing ? " is-closing" : ""}`}
      ref={viewer}
      aria-hidden={!isActive}
      inert={!isActive}
      role="dialog"
      aria-modal={isActive}
      aria-label={`${title || "Portfolio"} image viewer`}
    >
      <button
        type="button"
        className="print-viewer-scrim"
        aria-label="Close image"
        tabIndex={-1}
        onClick={() => dismiss()}
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
        onClick={() => dismiss()}
      >
        <span aria-hidden="true">×</span>
      </button>
      <div className="print-viewer-controls">
        <button
          type="button"
          className="print-viewer-arrow"
          aria-label="Previous image"
          disabled={images.length < 2}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="print-viewer-selection">
          <div className="print-viewer-caption" aria-live="polite">
            <span>{images[index]?.caption || title}</span>
            <span className="print-viewer-count">{images.length ? `${index + 1} / ${images.length}` : ""}</span>
          </div>
          <div className="print-viewer-thumbnails" role="group" aria-label="Choose image">
            {images.map((image, i) => (
              <button
                type="button"
                className="print-viewer-thumbnail"
                key={`${image.src}-${i}`}
                aria-label={`View ${image.kind} ${i + 1}${image.alt ? `: ${image.alt}` : ""}`}
                aria-pressed={index === i}
                onClick={() => select(i)}
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
          disabled={images.length < 2}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">→</span>
        </button>
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
