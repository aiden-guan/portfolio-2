import type { Role } from "@/content/worlds";

// The ground each page is printed on, so the way out of the black page ends
// on exactly the colour the next page starts with.
export const GROUND: Record<Exclude<Role, "student">, string> = {
  founder: "#f4f2ee",
  builder: "#f7f7f5",
  designer: "#f2efe8",
};

function studentGround() {
  try {
    const stored = localStorage.getItem("aiden-theme");
    const dark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? "#161816" : "#2e5946";
  } catch {
    return "#2e5946";
  }
}

export function groundFor(role: Role) {
  return role === "student" ? studentGround() : GROUND[role];
}

const COVER_Z = "2147483000";

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

// The designer page is pixel art, so the way in is a dither dissolve: big
// square pixels fill outward from the word in ordered-dither order.
function dissolve(color: string, x: number, y: number, duration: number) {
  const cell = Math.max(7, Math.round(Math.min(innerWidth, innerHeight) / 90));
  const cols = Math.ceil(innerWidth / cell);
  const rows = Math.ceil(innerHeight / cell);
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${cols * cell}px`,
    height: `${rows * cell}px`,
    zIndex: COVER_Z,
    imageRendering: "pixelated",
    pointerEvents: "none",
  });
  document.body.append(canvas);
  const context = canvas.getContext("2d")!;
  const sheet: HTMLElement = canvas;
  context.fillStyle = color;

  const ox = x / cell;
  const oy = y / cell;
  const far = Math.max(
    Math.hypot(ox, oy),
    Math.hypot(cols - ox, oy),
    Math.hypot(ox, rows - oy),
    Math.hypot(cols - ox, rows - oy),
  );
  const count = cols * rows;
  const order = new Uint32Array(count);
  const threshold = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const cx = i % cols;
    const cy = (i / cols) | 0;
    threshold[i] = 0.7 * (Math.hypot(cx + 0.5 - ox, cy + 0.5 - oy) / far) + 0.3 * bayer(cx & 7, cy & 7);
    order[i] = i;
  }
  order.sort((a, b) => threshold[a] - threshold[b]);

  const finished = new Promise<void>((resolve) => {
    let drawn = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
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
  return { sheet, finished };
}

function wipe(color: string, x: number, y: number, duration: number) {
  const cover = document.createElement("div");
  Object.assign(cover.style, {
    position: "fixed",
    inset: "0",
    zIndex: COVER_Z,
    background: color,
    pointerEvents: "none",
  });
  document.body.append(cover);
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const finished = cover
    .animate(
      [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${radius}px at ${x}px ${y}px)` }],
      { duration, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    )
    .finished.then(() => undefined);
  return { sheet: cover as HTMLElement, finished };
}

// Covers the page in the next page's ground, growing from (x, y). The cover
// lives outside React, so it survives a client-side navigation; call
// `uncoverWhenReady` to lift it once the next page is on screen. Resolves
// early in a tab the browser has stopped animating, so leaving never hangs.
export async function cover(role: Role, x: number, y: number, reduced: boolean) {
  const color = groundFor(role);
  const { sheet, finished } = reduced ? wipe(color, x, y, 1) : role === "designer" ? dissolve(color, x, y, 760) : wipe(color, x, y, 680);
  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 1400))]);
  return sheet;
}

export function uncoverWhenReady(cover: HTMLElement, role: Role) {
  const started = performance.now();
  const check = () => {
    const ready = document.querySelector(`[data-world="${role}"]`);
    if (!ready && performance.now() - started < 6000) {
      requestAnimationFrame(check);
      return;
    }
    // two frames, so the next page has painted under the cover
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cover
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "ease-out", fill: "forwards" })
          .finished.then(() => cover.remove(), () => cover.remove());
      }),
    );
  };
  requestAnimationFrame(check);
}
