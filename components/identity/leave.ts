import type { Role } from "@/content/worlds";

// The ground each page is printed on, so the way out of the black page ends
// on exactly the colour the next page starts with.
export const GROUND: Record<Exclude<Role, "student">, string> = {
  founder: "#f4f2ee",
  builder: "#f7f7f5",
  designer: "#f2efe8",
};

// and the ink each one is printed in, for the word that is carried across
const INK: Record<Exclude<Role, "student">, string> = {
  founder: "rgb(0 0 0 / 0.9)",
  builder: "#111111",
  designer: "#1b1d22",
};

function studentDark() {
  try {
    const stored = localStorage.getItem("aiden-theme");
    return stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    return false;
  }
}

export function groundFor(role: Role) {
  if (role !== "student") return GROUND[role];
  return studentDark() ? "#161816" : "#2e5946";
}

function inkFor(role: Role) {
  if (role !== "student") return INK[role];
  return studentDark() ? "#c3c9c2" : "#d6e8dc";
}

const COVER_Z = "2147483000";

type Box = { left: number; top: number; width: number; height: number };

type Sheet = { sheet: HTMLElement; finished: Promise<void> };

// 8×8 ordered-dither thresholds, 0..1.
function bayer(x: number, y: number) {
  let value = 0;
  for (let bit = 0; bit < 3; bit += 1) {
    const xb = (x >> bit) & 1;
    const yb = (y >> bit) & 1;
    value |= ((xb ^ yb) << (5 - bit * 2)) | (yb << (4 - bit * 2));
  }
  return value / 64;
}

function sheetStyle(node: HTMLElement) {
  Object.assign(node.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: COVER_Z,
    pointerEvents: "none",
    contain: "strict",
  });
}

// The designer page is pixel art, so the way in is a dither dissolve: big
// square pixels fill outward from the word in ordered-dither order.
function dissolve(color: string, box: Box, duration: number): Sheet {
  const cell = Math.max(7, Math.round(Math.min(innerWidth, innerHeight) / 90));
  const cols = Math.ceil(innerWidth / cell);
  const rows = Math.ceil(innerHeight / cell);
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  sheetStyle(canvas);
  Object.assign(canvas.style, { width: `${cols * cell}px`, height: `${rows * cell}px`, imageRendering: "pixelated" });
  const context = canvas.getContext("2d");
  if (!context) return wipe(color, box, duration);
  context.fillStyle = color;

  // distance from the word's box, so the pixels inside it go first
  const x0 = box.left / cell;
  const y0 = box.top / cell;
  const x1 = (box.left + box.width) / cell;
  const y1 = (box.top + box.height) / cell;
  const away = (cx: number, cy: number) => Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(y0 - cy, 0, cy - y1));
  const far = Math.max(away(0, 0), away(cols, 0), away(0, rows), away(cols, rows)) || 1;
  const count = cols * rows;
  const order = new Uint32Array(count);
  const threshold = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const cx = i % cols;
    const cy = (i / cols) | 0;
    threshold[i] = 0.74 * (away(cx + 0.5, cy + 0.5) / far) + 0.26 * bayer(cx & 7, cy & 7);
    order[i] = i;
  }
  order.sort((a, b) => threshold[a] - threshold[b]);

  document.body.append(canvas);
  const finished = new Promise<void>((resolve) => {
    let drawn = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // quick to start, so the word is answered at once, then even
      const eased = 1 - (1 - t) ** 2.2;
      const target = t >= 1 ? count : Math.floor(eased * count);
      for (; drawn < target; drawn += 1) {
        const i = order[drawn];
        context.fillRect(i % cols, (i / cols) | 0, 1, 1);
      }
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  return { sheet: canvas, finished };
}

// A sheet of the next page's ground that opens out of the word's box: it
// takes the word first, like a selection, then fills the screen. `round`
// is its corners at the start, if not a highlight's.
function wipe(color: string, box: Box, duration: number, round?: number): Sheet {
  const cover = document.createElement("div");
  sheetStyle(cover);
  Object.assign(cover.style, { inset: "0", background: color });
  document.body.append(cover);

  const vw = innerWidth;
  const vh = innerHeight;
  const pad = Math.max(2, box.height * 0.06);
  const inset = (grow: number, round: number) => {
    const left = Math.max(0, box.left - pad - grow);
    const top = Math.max(0, box.top - pad - grow);
    const right = Math.max(0, vw - (box.left + box.width) - pad - grow);
    const bottom = Math.max(0, vh - (box.top + box.height) - pad - grow);
    return `inset(${top}px ${right}px ${bottom}px ${left}px round ${round}px)`;
  };
  const radius = round ?? Math.max(2, box.height * 0.16);
  const swell = Math.max(3, box.height * 0.1);
  const finished = cover
    .animate(
      [
        { clipPath: inset(0, radius), easing: "cubic-bezier(0.2, 0, 0, 1)" },
        { clipPath: inset(swell, radius * 1.3), offset: 0.16, easing: "cubic-bezier(0.62, 0, 0.18, 1)" },
        { clipPath: "inset(0px 0px 0px 0px round 0px)" },
      ],
      { duration, fill: "forwards" },
    )
    .finished.then(() => undefined);
  return { sheet: cover, finished };
}

function fade(color: string, duration: number): Sheet {
  const cover = document.createElement("div");
  sheetStyle(cover);
  Object.assign(cover.style, { inset: "0", background: color });
  document.body.append(cover);
  const finished = cover
    .animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-out", fill: "forwards" })
    .finished.then(() => undefined);
  return { sheet: cover, finished };
}

// The chosen word goes across with the ground: a copy set exactly over it,
// in the next page's ink, so the white word turns over as the sheet takes it.
function carry(sheet: HTMLElement, word: HTMLElement, box: Box, ink: string, reduced: boolean) {
  const style = getComputedStyle(word);
  const copy = document.createElement("span");
  copy.textContent = word.textContent;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    height: `${box.height}px`,
    margin: "0",
    padding: "0",
    whiteSpace: "nowrap",
    color: ink,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStretch: style.fontStretch,
    fontStyle: style.fontStyle,
    fontVariationSettings: style.fontVariationSettings,
    fontFeatureSettings: style.fontFeatureSettings,
    fontKerning: style.fontKerning,
    letterSpacing: style.letterSpacing,
    lineHeight: `${box.height}px`,
    zIndex: COVER_Z,
    pointerEvents: "none",
  });
  copy.style.setProperty("font-size-adjust", style.getPropertyValue("font-size-adjust"));
  copy.style.setProperty("-webkit-font-smoothing", "antialiased");
  // a canvas cannot hold it, so it rides on a sheet of its own above
  const holder = sheet instanceof HTMLCanvasElement ? document.body : sheet;
  holder.append(copy);
  if (holder === document.body) live.add(copy);
  if (reduced) copy.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out", fill: "backwards" });
  return copy;
}

// covers still on the page; a full load out never lifts its own
const live = new Set<HTMLElement>();
// the word each one carries
const carried = new WeakMap<HTMLElement, HTMLElement>();

// `quick` for a hop from one page to another, where there is no word to
// carry and the next page is a full load behind it
function spread(role: Role | "black", box: Box, reduced: boolean, quick = false) {
  const color = role === "black" ? "#000" : groundFor(role);
  if (reduced) return fade(color, 180);
  if (role === "designer") return dissolve(color, box, quick ? 520 : 620);
  // home opens out of the round button it was asked from
  if (role === "black") return wipe(color, box, 420, box.height / 2);
  return wipe(color, box, quick ? 460 : 560);
}

async function settle(finished: Promise<void>) {
  // resolves early in a tab the browser has stopped animating, so leaving
  // never hangs on it
  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 1200))]);
}

// Covers the page in the next page's ground, opening out of `box` (the
// chosen word's box on screen). With `word`, that word is carried across
// in the next page's ink. The cover lives outside React, so it survives a
// client-side navigation; `uncoverWhenReady` lifts it once the next page is
// on screen.
export async function wash(
  role: Role,
  { box, word, reduced, quick = false }: { box: Box; word?: HTMLElement; reduced: boolean; quick?: boolean },
) {
  const { sheet, finished } = spread(role, box, reduced, quick);
  live.add(sheet);
  if (word) carried.set(sheet, carry(sheet, word, box, inkFor(role), reduced));
  await settle(finished);
  return sheet;
}

// The same, growing from a point: for ways in that have no word to start from.
export async function cover(role: Role, x: number, y: number, reduced: boolean) {
  return wash(role, { box: { left: x, top: y, width: 0, height: 0 }, reduced });
}

// The way home: the page goes black out of `box` (the link that was
// pressed), then the black page loads.
export async function coverBlack(box: Box, reduced: boolean) {
  const { sheet, finished } = spread("black", box, reduced);
  live.add(sheet);
  await settle(finished);
  return sheet;
}

// Takes every cover off at once, for when the browser's back arrow hands a
// page back exactly as it was left: covered over in the next page's ground.
export function liftCovers() {
  for (const sheet of live) sheet.remove();
  live.clear();
}

function lift(sheet: HTMLElement, duration: number) {
  const copy = carried.get(sheet);
  const parts = copy && copy.parentElement === document.body ? [sheet, copy] : [sheet];
  for (const part of parts) {
    const done = () => {
      part.remove();
      live.delete(part);
    };
    part
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: "cubic-bezier(0.33, 0, 0.2, 1)", fill: "forwards" })
      .finished.then(done, done);
  }
}

export function uncoverWhenReady(sheet: HTMLElement, role: Role) {
  const started = performance.now();
  const check = () => {
    const ready = document.querySelector(`[data-world="${role}"]`);
    if (!ready && performance.now() - started < 6000) {
      requestAnimationFrame(check);
      return;
    }
    // two frames, so the next page has painted under the cover
    requestAnimationFrame(() => requestAnimationFrame(() => lift(sheet, 300)));
  };
  requestAnimationFrame(check);
}
