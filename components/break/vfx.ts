import type { EnemyKind } from "@/components/break/combat";

type Box = { cx: number; cy: number; width: number; height: number };
type Enemy = {
  kind: EnemyKind;
  x: number;
  y: number;
  age: number;
  side: number;
  flash: number;
  shotAt: number;
  targetX?: number;
  targetY?: number;
};
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const hash = (n: number) => {
  const k = Math.sin(n * 127.13 + 311.7) * 43758.5;
  return k - Math.floor(k);
};

export function createVfx(ctx: CanvasRenderingContext2D) {
  // Small reusable light textures avoid full-screen filters and gradient allocation per frame.
  const light = (color: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const c = canvas.getContext("2d")!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.25, `${color}88`);
    g.addColorStop(1, `${color}00`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return canvas;
  };
  const red = light("#ff4f43"),
    gold = light("#ffd18e");
  const particles = Array.from({ length: 48 }, (_, i) => ({
    a: hash(i + 1) * TAU,
    r: hash(i + 80),
    speed: 0.4 + hash(i + 110),
    size: 1 + hash(i + 160) * 2,
  }));
  function glow(
    x: number,
    y: number,
    radius: number,
    alpha: number,
    warm = false,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      warm ? gold : red,
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
    );
    ctx.restore();
  }
  function polygon(points: number[][]) {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  function star(x: number, y: number, size: number) {
    polygon([
      [x, y - size],
      [x + size * 0.18, y - size * 0.18],
      [x + size, y],
      [x + size * 0.18, y + size * 0.18],
      [x, y + size],
      [x - size * 0.18, y + size * 0.18],
      [x - size, y],
      [x - size * 0.18, y - size * 0.18],
    ]);
    ctx.fill();
  }
  function arena(
    w: number,
    h: number,
    time: number,
    b: Box,
    strength: number,
    reduced: boolean,
  ) {
    if (strength <= 0) return;
    ctx.save();
    glow(b.cx, b.cy, b.height * 1.2, 0.1 * strength);
    ctx.strokeStyle = `rgba(227,100,82,${0.2 * strength})`;
    ctx.lineWidth = 1;
    for (let ring = 0; ring < 3; ring++) {
      const radius = b.height * (0.64 + ring * 0.13),
        direction = ring % 2 ? -1 : 1;
      const rotation = reduced ? ring : time * 0.09 * direction;
      for (let part = 0; part < 4; part++) {
        const a = rotation + (part * TAU) / 4;
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, radius, a, a + 0.9);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = rotation + (i * TAU) / 8,
          x = b.cx + Math.cos(a) * radius,
          y = b.cy + Math.sin(a) * radius;
        ctx.fillStyle = i % 2 ? "#e2b79b" : "#b5524b";
        ctx.globalAlpha = strength * 0.5;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    if (!reduced)
      for (let i = 0; i < 26; i++) {
        const p = particles[i],
          x =
            (i % 2 ? w * 0.94 : w * 0.06) +
            Math.sin(time * 0.3 + p.a) * w * 0.055;
        const y = h - ((p.r * h + time * (10 + p.speed * 12)) % h);
        ctx.globalAlpha = strength * (0.1 + p.r * 0.23);
        ctx.fillStyle = "#ec8a66";
        ctx.fillRect(x, y, p.size, p.size * 2.5);
      }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function ascension(
    b: Box,
    t: number,
    w: number,
    h: number,
    reduced: boolean,
  ) {
    ctx.save();
    const swell = Math.sin(t * Math.PI),
      reveal = clamp((t - 0.2) / 0.45);
    glow(
      b.cx,
      b.cy,
      b.height * (0.9 + swell * 0.5),
      swell * (reduced ? 0.15 : 0.3),
    );
    ctx.strokeStyle = "#ed9987";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const r = b.height * (0.45 + i * 0.18 + (1 - reveal) * 0.2);
      ctx.globalAlpha = swell * 0.6;
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4 + (reduced ? 0 : t * (i % 2 ? -2 : 2));
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, r, a, a + 1.1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < (reduced ? 12 : particles.length); i++) {
      const p = particles[i],
        radius = b.height * (1.6 - reveal * 0.9 + p.r * 0.2),
        a = p.a + (reduced ? 0 : t * 0.35);
      const x = b.cx + Math.cos(a) * radius,
        y = b.cy + Math.sin(a) * radius * 0.8;
      ctx.globalAlpha = swell * (0.3 + p.r * 0.65);
      ctx.fillStyle = i % 3 ? "#ee9b80" : "#ffe4bb";
      star(x, y, p.size * (1 + swell));
      if (!reduced) {
        ctx.strokeStyle = "#ce6c5b";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + Math.cos(a) * (8 + p.r * 20),
          y + Math.sin(a) * (8 + p.r * 20),
        );
        ctx.stroke();
      }
    }
    const wave = clamp((t - 0.66) / 0.34);
    if (wave > 0 && !reduced) {
      ctx.globalAlpha = (1 - wave) * 0.55;
      ctx.strokeStyle = "#ffd2a3";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        b.cx,
        b.cy,
        b.height * 0.6 + wave * w,
        b.height * 0.45 + wave * h,
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function eyes(b: Box, strength: number) {
    if (strength <= 0) return;
    for (const side of [-1, 1]) {
      const x = b.cx + side * b.width * 0.15,
        y = b.cy + b.height * 0.085;
      glow(x, y, b.height * 0.16, strength * 0.52);
      ctx.save();
      ctx.globalAlpha = strength * 0.9;
      ctx.strokeStyle = "#ffae80";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - b.width * 0.09, y);
      ctx.lineTo(x + b.width * 0.09, y);
      ctx.stroke();
      ctx.restore();
    }
  }
  function enemy(d: Enemy, reduced: boolean) {
    const appear = clamp(d.age / 0.7),
      recoil = d.flash > 0 ? d.flash * 12 : 0;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(d.x, d.y);
    ctx.fillStyle = "#0006";
    ctx.beginPath();
    ctx.ellipse(0, 18, d.kind === "anduril" ? 28 : 34, 8, 0, 0, TAU);
    ctx.fill();
    if (d.kind === "palantir") {
      const bank = reduced ? 0 : Math.sin(d.age * 0.8) * 0.08;
      ctx.rotate(bank);
      ctx.fillStyle = "#392f3a";
      ctx.strokeStyle = "#b7a9a2";
      ctx.lineWidth = 1;
      polygon([
        [-41, 8],
        [-25, -9],
        [-10, -12],
        [0, -27],
        [10, -12],
        [25, -9],
        [41, 8],
        [17, 4],
        [8, 17],
        [-8, 17],
        [-17, 4],
      ]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#75616c";
      polygon([
        [-35, 5],
        [-21, -5],
        [-8, -4],
        [-13, 5],
      ]);
      ctx.fill();
      polygon([
        [35, 5],
        [21, -5],
        [8, -4],
        [13, 5],
      ]);
      ctx.fill();
      ctx.fillStyle = "#c1b4ab";
      ctx.fillRect(-3, -16, 6, 17);
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#1e1a22";
        ctx.fillRect(side * 21 - 4, 0, 8, 17);
        ctx.fillStyle = "#f3b87d";
        ctx.fillRect(side * 21 - 2, 12 + recoil, 4, 3);
      }
      ctx.strokeStyle = "#e7d8c6";
      ctx.beginPath();
      ctx.arc(0, 5, 4, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 13);
      ctx.lineTo(0, 10);
      ctx.lineTo(5, 13);
      ctx.stroke();
      if (d.shotAt < 0.9 || d.flash > 0) glow(0, 3, 20, 0.35, true);
    } else {
      const gait = reduced ? 0 : Math.sin(d.age * 5.6) * 5;
      ctx.strokeStyle = "#817c78";
      ctx.lineWidth = 6;
      ctx.lineCap = "square";
      for (const side of [-1, 1])
        for (const front of [-1, 1]) {
          const step = gait * side * front,
            foot = front * 23 + step;
          ctx.beginPath();
          ctx.moveTo(side * 12, front * 9);
          ctx.lineTo(side * 24, front * 15 - step * 0.4);
          ctx.lineTo(side * 29, foot);
          ctx.stroke();
          ctx.fillStyle = "#c2bbaa";
          ctx.fillRect(side * 29 - 5, foot - 3, 10, 6);
        }
      ctx.fillStyle = "#35343b";
      ctx.strokeStyle = "#a8a89a";
      ctx.lineWidth = 1;
      polygon([
        [-18, -18],
        [-9, -25],
        [9, -25],
        [18, -18],
        [20, 15],
        [11, 23],
        [-11, 23],
        [-20, 15],
      ]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#777a70";
      ctx.fillRect(-12, -13, 24, 18);
      ctx.fillStyle = "#22232a";
      ctx.fillRect(-9, -8, 18, 8);
      ctx.fillStyle = "#ed8f61";
      ctx.fillRect(-6, -6, 12, 3);
      glow(0, -5, 20, 0.25);
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#b0aaa0";
        ctx.fillRect(side * 23 - 4, 1 - recoil, 8, 24);
        ctx.fillStyle = "#22232b";
        ctx.fillRect(side * 23 - 2, 18 - recoil, 4, 8);
        if (d.flash > 0) {
          glow(side * 23, 30, 20, d.flash * 4, true);
          ctx.fillStyle = "#ffe7b5";
          star(side * 23, 30, 5 + d.flash * 20);
        }
      }
      ctx.strokeStyle = "#e9e1c9";
      ctx.beginPath();
      ctx.moveTo(-5, 12);
      ctx.lineTo(0, 5);
      ctx.lineTo(5, 12);
      ctx.moveTo(-3, 10);
      ctx.lineTo(3, 10);
      ctx.stroke();
    }
    ctx.globalAlpha = appear * 0.75;
    ctx.fillStyle = "#c9b8ad";
    ctx.font = "6px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      d.kind === "palantir" ? "PALANTIR" : "ANDURIL",
      0,
      d.kind === "palantir" ? -37 : -35,
    );
    if (appear < 1) {
      ctx.strokeStyle = "#f3b29b";
      ctx.globalAlpha = 1 - appear;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + appear * 38, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  function missile(
    s: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      age: number;
      trail?: { x: number; y: number }[];
    },
    reduced: boolean,
  ) {
    ctx.save();
    const trail = s.trail ?? [];
    if (!reduced && trail.length > 1)
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `rgba(236,112,71,${(i / trail.length) * 0.42})`;
        ctx.lineWidth = 1 + (i / trail.length) * 4;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    glow(s.x, s.y, 18, 0.28, true);
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.atan2(s.vy, s.vx) - Math.PI / 2);
    ctx.fillStyle = "#edb6a0";
    polygon([
      [0, 14],
      [-4, 6],
      [-4, -7],
      [-8, -13],
      [-3, -11],
      [0, -16],
      [3, -11],
      [8, -13],
      [4, -7],
      [4, 6],
    ]);
    ctx.fill();
    ctx.fillStyle = "#ff6553";
    ctx.fillRect(-4, -1, 8, 5);
    ctx.fillStyle = "#fff0cf";
    ctx.fillRect(-1, 4, 2, 7);
    ctx.fillStyle = "#ffa16b";
    polygon([
      [-2.5, -12],
      [0, reduced ? -21 : -21 - Math.sin(s.age * 42) * 4],
      [2.5, -12],
    ]);
    ctx.fill();
    ctx.restore();
  }
  return { arena, ascension, eyes, enemy, missile, glow };
}
