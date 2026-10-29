import { pulseWaveRadius, type EnemyKind } from "@/components/break/combat";

type Box = { cx: number; cy: number; width: number; height: number };
type Enemy = {
  kind: EnemyKind;
  x: number;
  y: number;
  age: number;
  side: number;
  flash: number;
  stunned?: number;
  shotAt: number;
  targetX?: number;
  targetY?: number;
};
// Symbol geometry from Anduril’s official lockup; the wordmark is omitted.
const ANDURIL_MARK =
  "M26.5562 15.9425C26.1982 15.7629 25.8625 15.5832 25.5492 15.3811C24.4304 14.73 23.4011 13.9441 22.4613 13.0684C22.148 12.7764 21.8123 12.4621 21.5214 12.1253C18.8139 9.16131 17.2028 5.36656 16.9566 1.34725L16.9119 0.291905V0.202087C16.9119 0.0898155 16.8447 0 16.7329 0H9.84087C9.72899 0 9.66186 0.0898155 9.66186 0.202087V0.291905L9.61711 1.34725C9.37097 5.29919 7.80461 9.0715 5.14179 12.013C4.8509 12.3498 4.51525 12.6642 4.20198 12.9785C3.26216 13.8767 2.23284 14.6626 1.11401 15.3362C0.778361 15.5383 0.442712 15.7179 0.107063 15.8976C0.0175572 15.9425 -0.0271963 16.0548 0.0175568 16.1446C0.174193 16.5038 0.330829 16.8407 0.487465 17.155C1.09163 18.3226 1.85244 19.4004 2.7475 20.366C3.01602 20.6579 3.30691 20.9273 3.57543 21.1968C9.08007 26.249 17.516 26.2714 23.0431 21.2417C23.3339 20.9722 23.6248 20.6803 23.871 20.4109C24.766 19.4453 25.5269 18.3675 26.1534 17.1999C26.3324 16.8631 26.489 16.5263 26.6233 16.1895C26.6904 16.0772 26.6457 15.9649 26.5562 15.9425ZM5.79071 20.6354C5.79071 20.7926 5.63408 20.8824 5.49982 20.7926C5.27605 20.6354 5.07466 20.4558 4.87327 20.2762C4.56 20.0067 4.29148 19.7373 4.04534 19.4903C3.23978 18.6595 2.54611 17.7164 1.9867 16.6835C1.94194 16.5937 1.96432 16.5038 2.05382 16.4365C3.03839 15.8302 3.97821 15.1341 4.8509 14.3482C5.16417 14.0788 5.47744 13.7644 5.76834 13.4725C8.11788 11.0699 9.77374 8.08351 10.5569 4.82765C10.5569 4.58066 10.9149 4.58066 10.9149 4.82765C11.2506 6.51172 11.7429 8.17334 12.4366 9.74513C12.4589 9.79004 12.4589 9.8574 12.4366 9.9023C11.273 12.3498 9.68424 14.5728 7.7151 16.4589C7.4242 16.7284 7.13331 16.9978 6.88717 17.2897C6.35013 17.9185 5.9921 18.6819 5.83547 19.5127C5.79071 19.7822 5.76834 20.0516 5.76834 20.3211L5.79071 20.6354ZM17.4489 17.155C17.5384 17.2448 17.516 17.3796 17.4042 17.4469C16.1958 18.1655 14.7861 18.5472 13.3764 18.5696H13.3316C11.8771 18.5696 10.445 18.1655 9.19195 17.402C9.10245 17.3347 9.08007 17.1999 9.1472 17.1326C9.50522 16.7733 9.86325 16.3916 10.1989 16.0099C11.3177 14.73 12.3023 13.3378 13.1302 11.8334C13.1974 11.7211 13.3764 11.7211 13.4435 11.8334C14.5176 13.7644 15.8602 15.5608 17.4489 17.155ZM7.8046 18.5247C7.84936 18.4349 7.98362 18.4125 8.05075 18.4798C9.61711 19.5352 11.452 20.0965 13.3316 20.0965L13.7568 20.0741C14.1372 20.0516 14.5176 20.0067 14.8756 19.9618C16.2182 19.7373 17.4937 19.2208 18.6349 18.4798C18.702 18.4349 18.7915 18.4349 18.8586 18.5023C19.6418 19.1759 20.4921 19.8046 21.3648 20.366C21.4767 20.4333 21.4767 20.5905 21.3648 20.6579C19.1048 22.4542 16.3301 23.4422 13.4659 23.4646H13.354C12.7722 23.4646 12.168 23.4197 11.5862 23.3524C10.3108 23.1727 9.08007 22.8135 7.91649 22.2746C7.89411 22.2521 7.87174 22.2297 7.84936 22.2072C7.06618 21.107 7.0438 19.625 7.8046 18.5247ZM19.7537 17.3122L18.881 16.5263C16.8671 14.5952 15.2113 12.3049 14.0253 9.76758C13.8015 9.29604 13.6001 8.8245 13.4211 8.35297C12.6156 6.24227 12.1233 3.99685 11.989 1.75143C11.9666 1.63916 12.0562 1.54934 12.168 1.54934H15.2784C15.3679 1.54934 15.4574 1.6167 15.4798 1.72897L15.5693 2.73941C16.1063 6.84853 17.9636 10.6657 20.8725 13.6073C21.1634 13.8992 21.4767 14.1911 21.79 14.483C22.6626 15.2689 23.6025 15.9425 24.587 16.5488C24.6765 16.5937 24.6989 16.7059 24.6542 16.7957C24.1395 17.7164 23.513 18.5921 22.7969 19.378C22.7298 19.4453 22.6403 19.4678 22.5731 19.4229C21.5886 18.7493 20.6488 18.0756 19.7537 17.3122Z";
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
  // Bake the bevels, panel seams and emblems once at 2x resolution. Only joints,
  // optics, recoil and engine light animate; no per-frame gradient allocation.
  function hull(kind: "palantir" | "anduril") {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.scale(2, 2);
    c.translate(80, 64);
    const path = (pts: number[][]) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
    };
    const plate = (pts: number[][], light: string, dark: string, depth = 4) => {
      path(pts.map(([x, y]) => [x + 1.5, y + depth]));
      c.fillStyle = "#101822";
      c.fill();
      const g = c.createLinearGradient(-40, -36, 32, 44);
      g.addColorStop(0, light);
      g.addColorStop(0.48, dark);
      g.addColorStop(1, "#222c36");
      path(pts);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "#dbe5e65c";
      c.lineWidth = 0.7;
      c.stroke();
      c.strokeStyle = "#f1f3e67a";
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      c.lineTo(pts[1][0], pts[1][1]);
      c.stroke();
    };
    const bolt = (x: number, y: number) => {
      c.fillStyle = "#0c151c";
      c.fillRect(x - 1, y - 1, 2, 2);
      c.fillStyle = "#dde5df88";
      c.fillRect(x - 1, y - 1, 1, 1);
    };
    if (kind === "palantir") {
      for (const side of [-1, 1]) {
        c.save();
        c.scale(side, 1);
        plate(
          [
            [11, -22],
            [39, -15],
            [71, 21],
            [64, 26],
            [25, 17],
            [8, 26],
          ],
          "#c0c9c7",
          "#475460",
          6,
        );
        plate(
          [
            [20, -16],
            [37, -10],
            [60, 16],
            [30, 9],
          ],
          "#8d9b9e",
          "#343f4c",
          2,
        );
        plate(
          [
            [36, -9],
            [48, 0],
            [66, 20],
            [56, 18],
          ],
          "#d4dbd7",
          "#6c797e",
          2,
        );
        c.strokeStyle = "#111f2b";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(22, -12);
        c.lineTo(39, 13);
        c.lineTo(60, 19);
        c.stroke();
        // Recessed missile rails, vents and bright leading-edge strips.
        plate(
          [
            [27, 8],
            [36, 10],
            [36, 29],
            [29, 26],
          ],
          "#6d7b85",
          "#202b36",
          3,
        );
        c.fillStyle = "#0d1822";
        c.fillRect(29, 13, 4, 11);
        c.fillStyle = "#e0e4cf";
        c.fillRect(29, 23, 4, 3);
        c.fillStyle = "#14222c";
        for (let i = 0; i < 5; i++)
          c.fillRect(14 + i * 3, -7 + i * 1.5, 1.5, 9);
        c.fillStyle = "#edf0df";
        c.fillRect(47, 11, 9, 1.5);
        bolt(39, 4);
        bolt(20, 11);
        bolt(61, 20);
        c.restore();
      }
      plate(
        [
          [-13, -27],
          [0, -43],
          [13, -27],
          [18, 22],
          [0, 36],
          [-18, 22],
        ],
        "#a1aeb0",
        "#303d48",
        7,
      );
      plate(
        [
          [-8, -26],
          [0, -37],
          [8, -26],
          [7, -10],
          [-7, -10],
        ],
        "#e0e5dc",
        "#89969a",
        2,
      );
      c.fillStyle = "#101e28";
      c.beginPath();
      c.ellipse(0, 8, 16, 21, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "#839393";
      c.lineWidth = 1;
      c.stroke();
      // The ring over a chevron is large enough to read as part of the hull.
      c.strokeStyle = "#f5f4e8";
      c.lineWidth = 3.5;
      c.beginPath();
      c.arc(0, 3, 9, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-11, 24);
      c.lineTo(0, 17);
      c.lineTo(11, 24);
      c.stroke();
      c.fillStyle = "#131d25";
      c.fillRect(-6, -25, 12, 5);
      c.fillStyle = "#d8e6e5";
      c.fillRect(-4, -24, 8, 1);
      bolt(-11, -13);
      bolt(11, -13);
      bolt(0, 30);
    } else {
      // A raised, forward-looking sensor mast and layered ceramic carapace.
      plate(
        [
          [-20, -27],
          [-12, -34],
          [12, -34],
          [20, -27],
          [23, 22],
          [13, 34],
          [-13, 34],
          [-23, 22],
        ],
        "#f0eee0",
        "#858f92",
        7,
      );
      for (const side of [-1, 1]) {
        c.save();
        c.scale(side, 1);
        plate(
          [
            [18, -18],
            [29, -24],
            [38, -16],
            [37, 19],
            [25, 24],
            [18, 17],
          ],
          "#eff1e7",
          "#8a9698",
          6,
        );
        c.fillStyle = "#14232c";
        c.fillRect(25, -13, 10, 8);
        c.fillStyle = "#d5ca5e";
        c.fillRect(25, -12, 2, 6);
        c.fillStyle = "#25333b";
        for (let i = 0; i < 4; i++) c.fillRect(24, 0 + i * 3, 10, 1);
        plate(
          [
            [26, 17],
            [34, 17],
            [35, 34],
            [28, 34],
          ],
          "#b5c0bd",
          "#33444e",
          3,
        );
        c.fillStyle = "#0c1923";
        c.fillRect(28, 27, 5, 11);
        c.fillStyle = "#798b90";
        c.fillRect(29, 30, 1, 6);
        bolt(28, -18);
        bolt(34, 14);
        bolt(18, 24);
        c.restore();
      }
      plate(
        [
          [-14, -17],
          [14, -17],
          [14, 25],
          [7, 30],
          [-9, 30],
          [-14, 23],
        ],
        "#e7e9dc",
        "#b0b8af",
        2,
      );
      c.save();
      c.translate(-11, -1);
      c.scale(0.83, 0.83);
      c.fillStyle = "#1a2b34";
      c.fill(new Path2D(ANDURIL_MARK));
      c.restore();
      plate(
        [
          [-13, -33],
          [-8, -40],
          [10, -40],
          [16, -32],
          [12, -17],
          [-11, -17],
        ],
        "#e9eee8",
        "#a0acac",
        5,
      );
      c.fillStyle = "#10202a";
      c.fillRect(-10, -32, 23, 10);
      c.fillStyle = "#8b9b9b";
      c.fillRect(-10, -32, 23, 1);
      c.fillStyle = "#d8c95d";
      c.fillRect(-8, 22, 16, 3);
      c.strokeStyle = "#b8c5bf";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-14, -29);
      c.lineTo(-22, -48);
      c.stroke();
      c.fillStyle = "#d3d6bc";
      c.fillRect(-23, -50, 3, 4);
      bolt(-17, -24);
      bolt(17, -24);
      bolt(0, 27);
    }
    return canvas;
  }
  const palantirHull = hull("palantir"),
    andurilHull = hull("anduril");
  function enemy(d: Enemy, reduced: boolean, scale = 1) {
    const appear = clamp(d.age / 0.7),
      recoil = d.flash * 18;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(d.x, d.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#030a1280";
    ctx.beginPath();
    ctx.ellipse(2, 30, d.kind === "anduril" ? 49 : 63, 12, 0, 0, TAU);
    ctx.fill();
    if (d.kind === "palantir") {
      ctx.rotate(reduced ? 0 : Math.sin(d.age * 0.8) * 0.09);
      for (const side of [-1, 1]) {
        glow(side * 20, -15, 26, 0.24, true);
        ctx.fillStyle = "#a9dce9";
        ctx.beginPath();
        ctx.ellipse(side * 20, -17, 4, 7, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#fff4d5";
        ctx.fillRect(side * 20 - 1, -21, 2, 6);
      }
      ctx.drawImage(palantirHull, -80, -64, 160, 128);
      // The optic sweeps independently from the aircraft bank.
      const sweep = reduced ? 0 : Math.sin(d.age * 1.4) * 4;
      glow(sweep, -22, 16, 0.22, true);
      ctx.fillStyle = "#f7d29a";
      ctx.fillRect(sweep - 1.5, -24, 3, 3);
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#ef624f";
        ctx.fillRect(side * 64 - 1, 20, 3, 2);
        if (d.flash > 0) {
          glow(side * 32, 31, 30, d.flash * 3.2, true);
          ctx.fillStyle = "#fff3d5";
          star(side * 32, 32, 5 + recoil);
        }
      }
      if (!reduced && d.shotAt < 1.05) {
        ctx.strokeStyle = "#e9caa170";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(0, 3, 13 + d.shotAt * 8, 0, TAU);
        ctx.stroke();
      }
    } else {
      const gait = reduced ? 0 : Math.sin(d.age * 5.6) * 7;
      for (const front of [-1, 1])
        for (const side of [-1, 1]) {
          const step = gait * side * front,
            hipX = side * 23,
            hipY = front * 18;
          const kneeX = side * 43,
            kneeY = front * 25 - step * 0.35;
          const footX = side * (49 + step * 0.22),
            footY = front * 38 + step;
          ctx.lineCap = "round";
          // A dark chassis, polished piston, then an armored thigh and planted foot.
          ctx.strokeStyle = "#111e29";
          ctx.lineWidth = 11;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.stroke();
          ctx.strokeStyle = "#9dadaf";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.stroke();
          ctx.strokeStyle = "#eef0dd";
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY - 2);
          ctx.lineTo(kneeX - side * 4, kneeY - 2);
          ctx.stroke();
          ctx.fillStyle = "#283b47";
          ctx.beginPath();
          ctx.arc(kneeX, kneeY, 5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#cbd6cc";
          ctx.beginPath();
          ctx.arc(kneeX - 1, kneeY - 1, 2, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#152731";
          ctx.fillRect(footX - 7, footY - 2, 14, 7);
          ctx.fillStyle = "#bdc9bd";
          ctx.fillRect(footX - 6, footY - 3, 11, 3);
        }
      ctx.save();
      ctx.translate(0, reduced ? 0 : Math.sin(d.age * 11.2) * 0.7);
      ctx.drawImage(andurilHull, -80, -64, 160, 128);
      const optic = reduced ? 0 : Math.sin(d.age * 1.1) * 5;
      glow(optic, -27, 20, 0.25, true);
      ctx.fillStyle = "#ffb865";
      ctx.fillRect(optic - 3, -29, 6, 4);
      ctx.fillStyle = "#fff2d0";
      ctx.fillRect(optic - 1, -29, 2, 2);
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#c5d0cb";
        ctx.fillRect(side * 31 - 3, 29 - recoil, 6, 7);
        ctx.fillStyle = "#13212b";
        ctx.fillRect(side * 31 - 2, 33 - recoil, 4, 5);
        if (d.flash > 0) {
          glow(side * 31, 42 - recoil, 36, d.flash * 3.5, true);
          ctx.fillStyle = "#fff0b9";
          star(side * 31, 42 - recoil, 5 + recoil);
        }
      }
      ctx.restore();
    }
    if ((d.stunned ?? 0) > 0) {
      ctx.strokeStyle = "#b8e4ed";
      ctx.lineWidth = 1;
      ctx.globalAlpha = appear * Math.min(1, (d.stunned ?? 0) * 3);
      const phase = reduced ? 0 : Math.floor(d.age * 9);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + phase * 0.2,
          r = d.kind === "palantir" ? 49 : 43;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a + 0.09) * (r + 7), Math.sin(a + 0.09) * (r + 7));
        ctx.lineTo(Math.cos(a + 0.2) * (r - 3), Math.sin(a + 0.2) * (r - 3));
        ctx.stroke();
      }
      ctx.globalAlpha = appear;
    }
    if (appear < 1) {
      ctx.strokeStyle = "#eab499";
      ctx.globalAlpha = 1 - appear;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + appear * 48, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  function pulse(
    x: number,
    y: number,
    age: number,
    radius: number,
    reduced: boolean,
  ) {
    const r = pulseWaveRadius(age, radius),
      alpha = 1 - clamp(age / 0.58);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#acdbe914";
    ctx.strokeStyle = "#c1edf5";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "#7cb6ce";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, TAU);
    ctx.stroke();
    if (!reduced)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU,
          length = 5 + hash(i + 7) * 13;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - length), Math.sin(a) * (r - length));
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
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
        ctx.lineWidth = 2 + (i / trail.length) * 5;
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
    ctx.fillStyle = "#778d9b";
    polygon([
      [-4, -7],
      [0, -13],
      [0, 13],
      [-4, 6],
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
  return { arena, ascension, eyes, enemy, missile, glow, pulse };
}
