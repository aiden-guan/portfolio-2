// The timing /builder moves on, and the few tricks it repeats.

// settles hard and late: entrances, hovers, the filter's glide
export const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
// the sheet: quick off the mark, a long soft landing
export const EASE_SHEET = "cubic-bezier(0.32, 0.72, 0, 1)";

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The transform that draws a box laid out at `box` over `target`, for an
// element with transform-origin 0 0.
export function rectTransform(box: DOMRect, target: DOMRect) {
  const x = target.left - box.left;
  const y = target.top - box.top;
  return `translate(${x}px, ${y}px) scale(${target.width / box.width}, ${target.height / box.height})`;
}

// Stops whatever an element is animating where it stands, so the next
// animation starts from what's on screen.
export function freeze(element: Element) {
  for (const animation of element.getAnimations()) {
    try {
      animation.commitStyles();
    } catch {
      // not rendered: nothing to keep
    }
    animation.cancel();
  }
}

// What an element looks like right now (after `freeze`), as keyframe values;
// then its inline overrides are dropped so its layout box can be measured.
export function release(element: HTMLElement) {
  const style = getComputedStyle(element);
  const now = { transform: style.transform, borderRadius: style.borderRadius, opacity: style.opacity };
  element.style.transform = "";
  element.style.borderRadius = "";
  element.style.opacity = "";
  return now;
}

// Corners for a box scaled from `box` to `target`, so that on screen they
// keep the radius `round`.
export function corners(round: number, box: DOMRect, target: DOMRect) {
  return `${(round * box.width) / target.width}px / ${(round * box.height) / target.height}px`;
}

// A lifeless copy of `element`, laid over it inside `layer`, for the old
// state to leave in while React has already drawn the new one.
export function ghost(element: HTMLElement, layer: HTMLElement) {
  const box = element.getBoundingClientRect();
  const origin = layer.getBoundingClientRect();
  const copy = element.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  for (const node of copy.querySelectorAll("[id]")) node.removeAttribute("id");
  copy.inert = true;
  Object.assign(copy.style, {
    position: "absolute",
    left: `${box.left - origin.left}px`,
    top: `${box.top - origin.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    transform: "none",
  });
  layer.append(copy);
  return copy;
}

export function fadeAway(copy: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const remove = () => copy.remove();
  copy.animate(keyframes, { fill: "forwards", ...options }).finished.then(remove, remove);
}

// Resolves once a picture can be painted, or after `wait` ms, whichever is
// first, so a morph never starts on an empty frame.
export function painted(image: HTMLImageElement | null | undefined, wait: number) {
  if (!image) return Promise.resolve();
  return Promise.race([image.decode().catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, wait))]);
}

// "2026-10-26T10:59:31Z" → "4d ago"
export function ago(iso: string, now: number) {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}
