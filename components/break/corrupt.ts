import { breakSignal } from "@/components/break/signal";

const INKS = ["#d4dfbd", "#9fbea0", "#4e7d72", "#86adb8", "#db9f87"];
const hash = (x: number, y: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy),
    c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function field(x: number, y: number) {
  return (
    noise(x, y) * 0.55 +
    noise(x * 2.1, y * 2.1) * 0.27 +
    noise(x * 4.3, y * 4.3) * 0.13 +
    noise(x * 8.7, y * 8.7) * 0.05
  );
}
type Cell = {
  x: number;
  y: number;
  reveal: number;
  ink: number;
  size: number;
  flowX: number;
  flowY: number;
  grain: number;
};

// Domain-warped erosion, sampled once. The animated front moves through a
// stable dither pattern, so it reads as a material changing rather than TV noise.
export function mountCorruption(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx || breakSignal.reduced) return () => {};
  let raf = 0,
    last = 0,
    width = 0,
    height = 0,
    dpr = 1;
  let cells: Cell[] = [];
  const pointer = { x: -1000, y: -1000, sx: -1000, sy: -1000 };
  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const short = Math.min(width, height),
      size = width < 600 ? 3 : 3.5;
    cells = [];
    for (let y = 0; y < height; y += size)
      for (let x = 0; x < width; x += size) {
        const edge = Math.min(x, y, width - x, height - y) / short;
        if (edge > 0.46) continue;
        const u = (x / short) * 4.8,
          v = (y / short) * 4.8;
        const flowX = field(u + 12, v + 6),
          flowY = field(u - 6, v + 19);
        const terrain = field(u + flowX * 2.8, v + flowY * 2.8);
        const ridge = Math.abs(terrain - 0.51) * 2.6;
        const grain = hash(x / size, y / size);
        const reach = Math.pow(edge, 0.66) * 1.8;
        const reveal = Math.max(
          0.045 + edge * 1.15,
          reach + (terrain - 0.5) * 0.86 + grain * 0.14 - 0.11,
        );
        const ink =
          grain > 0.985
            ? 4
            : ridge < 0.075
              ? 3
              : grain < 0.3
                ? 0
                : grain < 0.76
                  ? 1
                  : 2;
        cells.push({
          x,
          y,
          reveal,
          ink,
          size: size * (grain < 0.08 ? 0.42 : 0.83),
          flowX: flowX - 0.5,
          flowY: flowY - 0.5,
          grain,
        });
      }
    wake();
  }
  function draw(now: number) {
    raf = 0;
    if (document.hidden) return;
    if (now - last < 30) {
      raf = requestAnimationFrame(draw);
      return;
    }
    last = now;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    const spread = breakSignal.live ? 0 : breakSignal.spread;
    if (spread < 0.025) return;
    const fracture = breakSignal.fracture;
    const growth = Math.min(
      1.04,
      (spread < 0.72 ? spread * 0.39 : 0.28 + (spread - 0.72) * 2.6) +
        fracture * 0.08,
    );
    const waveX = Math.sin(now * 0.00032) * 0.065,
      waveY = Math.cos(now * 0.00027) * 0.065;
    pointer.sx += (pointer.x - pointer.sx) * 0.17;
    pointer.sy += (pointer.y - pointer.sy) * 0.17;
    const paths = INKS.map(() => new Path2D()),
      front = new Path2D(),
      chips = new Path2D();
    for (const p of cells) {
      const reveal = p.reveal + p.flowX * waveX + p.flowY * waveY;
      if (reveal > growth) continue;
      let x = p.x,
        y = p.y;
      const dx = x - pointer.sx,
        dy = y - pointer.sy,
        distance =
          Math.abs(dx) < 85 && Math.abs(dy) < 85 ? Math.hypot(dx, dy) : 1000;
      if (distance < 85 && distance > 1) {
        const force = (1 - distance / 85) ** 2 * 16;
        x += (dx / distance) * force;
        y += (dy / distance) * force;
      }
      // The bright, sparse coastline is the moving fault; dense etched pixels trail it.
      if (growth - reveal < 0.025 && p.grain > 0.15)
        front.rect(x, y, p.size, p.size);
      else paths[p.ink].rect(x, y, p.size, p.size);
      if (fracture > 0.2 && p.grain > 0.997)
        chips.rect(
          x + Math.sin(now * 0.001 + p.y) * fracture * 12,
          y,
          p.size * 3,
          p.size * 0.55,
        );
    }
    ctx!.globalAlpha =
      0.47 + fracture * 0.18 + Math.max(0, spread - 0.75) * 0.6;
    INKS.forEach((ink, i) => {
      ctx!.fillStyle = ink;
      ctx!.fill(paths[i]);
    });
    ctx!.globalAlpha = 0.86;
    ctx!.fillStyle = "#e4ebcb";
    ctx!.fill(front);
    ctx!.globalAlpha = 0.7;
    ctx!.fillStyle = "#a9d0ce";
    ctx!.fill(chips);
    if (fracture > 0.1) {
      const beat = Math.floor(now / 140);
      for (let i = 0; i < 6; i++) {
        const y = hash(i, 17) * height,
          band = 1 + hash(i, beat) * 14;
        const shift = (hash(beat, i) - 0.5) * fracture * 50;
        ctx!.globalAlpha = 0.7;
        ctx!.drawImage(
          canvas,
          0,
          y * dpr,
          width * dpr,
          band * dpr,
          shift,
          y,
          width,
          band,
        );
        ctx!.fillStyle = i % 2 ? "#dfa184" : "#a0c8ce";
        ctx!.globalAlpha = fracture * 0.35;
        ctx!.fillRect(i % 2 ? 0 : width * 0.85, y, width * 0.15, 1);
      }
    }
    ctx!.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  function wake() {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function move(event: PointerEvent) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }
  function leave() {
    pointer.x = pointer.y = -1000;
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", wake);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", wake);
    window.removeEventListener("pointermove", move);
    document.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", wake);
  };
}
