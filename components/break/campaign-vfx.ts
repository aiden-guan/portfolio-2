import {
  bossRadius,
  bossMaxHp,
  bossStage,
  bossGuard,
  stageTitle,
  bossTheme,
  themeColor,
  transformSeconds,
  SECTORS,
  SHIPS,
  type Bullet,
  type Enemy,
  type ShipId,
  type World,
} from "@/components/break/campaign";
import {
  originalPortrait,
  guestPortrait,
  PALETTE,
  type PixelPortrait,
} from "@/components/break/portrait";
import {
  CAT_INKS,
  createCatEars,
  createBlush,
} from "@/components/break/encounter";
import { EVIL_INKS, evilDetails } from "@/components/break/combat";
import { BALANCE } from "@/components/break/balance";
import { beamEnd, waveGap, handSealFrame } from "@/components/break/tactics";
import { createVfx } from "@/components/break/vfx";

const TAU = Math.PI * 2;
const hash = (n: number) => {
  const a = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return a - Math.floor(a);
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function createCampaignVfx(
  ctx: CanvasRenderingContext2D,
  images: HTMLImageElement[],
  reduced: boolean,
) {
  const old = createVfx(ctx);
  const portraits = new Map<number, PixelPortrait>();
  const variants = new Map<string, PixelPortrait["pixels"]>();
  const glowCache = new Map<string, HTMLCanvasElement>();
  const miniSprites = new Map<string, HTMLCanvasElement>();
  const handFrames = new Map<number, HTMLCanvasElement>();
  const mono = "'Martian Mono', monospace";
  function path(points: number[][]) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function line(
    x: number,
    y: number,
    tx: number,
    ty: number,
    color: string,
    width = 1,
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  function glow(
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha = 1,
  ) {
    let sprite = glowCache.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 128;
      const c = sprite.getContext("2d")!;
      const gradient = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, color + "ba");
      gradient.addColorStop(0.18, color + "65");
      gradient.addColorStop(0.5, color + "1c");
      gradient.addColorStop(1, color + "00");
      c.fillStyle = gradient;
      c.fillRect(0, 0, 128, 128);
      glowCache.set(color, sprite);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= alpha;
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }
  function ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
    rotation = 0,
  ) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
    ctx.fill();
  }
  function label(text: string, x: number, y: number, color: string, size = 9) {
    ctx.font = `${size}px ${mono}`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  function environment(s: World) {
    const w = s.width,
      h = s.height,
      t = reduced ? 0 : s.time,
      evil = bossTheme(s) === 3;
    ctx.fillStyle = evil ? "#160e14" : "#091b18";
    ctx.fillRect(0, 0, w, h);
    // Keep the original cutting-mat contours, phosphor dust and measured grid.
    ctx.strokeStyle = evil ? "#c76f6021" : "#9ab79712";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let n = -3; n < 12; n++) {
      const y0 = ((n * 91 + t * 12) % (h + 270)) - 135;
      for (let x = -20; x < w + 40; x += 16) {
        const y =
          y0 + Math.sin(x * 0.007 + n * 0.9) * 34 + Math.sin(x * 0.014 - n) * 9;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "#a5c0a10a";
    ctx.beginPath();
    for (let x = (w / 2) % 64; x < w; x += 64) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    for (let i = 0; i < 42; i++) {
      const y = (hash(i + 2) * h + t * (7 + hash(i + 3) * 24)) % h,
        x = hash(i + 1) * w;
      ctx.fillStyle = i % 7 ? "#8eb99b20" : "#d2e7bc45";
      ctx.fillRect(
        x,
        y,
        i % 7 ? 1 : 2,
        s.player.dashTime > 0 ? 12 : i % 7 ? 2 : 4,
      );
    }
  }
  function portraitBox(s: World, idle = false) {
    const height = idle
      ? Math.min(s.height * 0.32, s.width * 0.66, 340)
      : bossRadius(s) * 2;
    const width = (height * 62) / 70;
    const cx = idle ? s.width / 2 : s.boss.x,
      cy = idle ? s.height * 0.38 : s.boss.y;
    return {
      cx,
      cy,
      width,
      height,
      x: cx - width / 2,
      y: cy - height / 2,
      cell: width / 62,
    };
  }
  function pixelsFor(index: number, form: number) {
    const image = images[index];
    if (!image?.complete || !image.naturalWidth) return null;
    if (!portraits.has(index))
      portraits.set(
        index,
        index === 0
          ? originalPortrait(image)
          : guestPortrait(image, index === 1),
      );
    const source = portraits.get(index)!;
    const variantKey = `${index}:${form}`;
    if (!variants.has(variantKey)) {
      const pixels = source.pixels.map((p) => ({ ...p }));
      const byPosition = new Map(pixels.map((p) => [p.row * 62 + p.col, p]));
      if (index === 0 && form >= 2) {
        for (const blush of createBlush(62, 70)) {
          const p = byPosition.get(blush.row * 62 + blush.col);
          if (p) p.blush = blush.ink;
        }
        for (const ear of createCatEars(62, 70))
          pixels.push({
            ...ear,
            ear: true,
            alive: true,
            loose: false,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
          });
      }
      if (index === 0 && form === 3)
        for (const detail of evilDetails(62, 70)) {
          const p = byPosition.get(detail.row * 62 + detail.col);
          if (p) p.evil = detail.ink;
        }
      variants.set(variantKey, pixels);
    }
    return variants.get(variantKey)!;
  }
  function face(s: World, idle = false) {
    if (
      !idle &&
      !["boss-intro", "fight", "transform", "dying"].includes(s.phase)
    )
      return;
    const index = idle ? 0 : s.sector - 1,
      image = images[index];
    if (!image?.complete || !image.naturalWidth) return;
    const b = portraitBox(s, idle),
      form = idle ? 1 : bossTheme(s),
      color = idle ? "#b4cba4" : themeColor(s);
    const transforming = s.phase === "transform" && !idle;
    const t = transforming ? clamp01((s.phaseTime - 0.85) / 1.35) : 1;
    const reveal = transforming ? clamp01((s.phaseTime - 0.65) / 1.2) : 1;
    const pixels = pixelsFor(index, form);
    if (!pixels) return;
    const normal =
      index === 1
        ? [
            "#293f2c",
            "#516545",
            "#8b9165",
            "#b8bb8d",
            "#e1d8aa",
            "#f3e5c1",
            ...CAT_INKS,
          ]
        : [...PALETTE, ...CAT_INKS];
    const fade = form === 3 && index === 0 ? t : form === 3 ? 1 : 0;
    const inks = normal.map((ink, i) => {
      const from = parseInt(ink.slice(1), 16),
        to = parseInt(EVIL_INKS[i].slice(1), 16);
      const channel = (n: number) =>
        Math.round(((from >> n) & 255) * (1 - fade) + ((to >> n) & 255) * fade);
      return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
    });
    ctx.save();
    const enter =
      !idle && s.phase === "boss-intro" ? clamp01(s.phaseTime / 1.2) : 1;
    ctx.globalAlpha = enter;
    const strength = form === 3 ? 1 : 0;
    old.arena(s.width, s.height, s.time, b, strength, reduced);
    const halo = b.height * 0.6;
    ctx.strokeStyle = color + (form === 2 ? "55" : "33");
    ctx.lineWidth = 1;
    for (const scale of [1, 1.13]) {
      ctx.beginPath();
      ctx.arc(
        b.cx,
        b.cy,
        halo * scale,
        reduced ? 0 : s.time * 0.14,
        Math.PI * 1.52 + (reduced ? 0 : s.time * 0.14),
      );
      ctx.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU + (reduced ? 0 : s.time * 0.04),
        r = halo * 1.13;
      line(
        b.cx + Math.cos(a) * r,
        b.cy + Math.sin(a) * r,
        b.cx + Math.cos(a) * (r + (i % 3 ? 3 : 9)),
        b.cy + Math.sin(a) * (r + (i % 3 ? 3 : 9)),
        color + "33",
      );
    }
    const damage = idle || transforming ? 0 : 1 - s.boss.hp / bossMaxHp(s);
    for (let ink = 0; ink < inks.length; ink++) {
      ctx.fillStyle = inks[ink];
      ctx.beginPath();
      for (const p of pixels) {
        const shown = !transforming || hash(p.col * 13 + p.row) < reveal;
        const pixelInk =
          form === 3 && p.evil !== undefined && fade > 0.5
            ? p.evil
            : (form === 2 || (form === 3 && fade < 0.4)) &&
                p.blush !== undefined &&
                shown
              ? p.blush
              : p.ink;
        if (
          pixelInk !== ink ||
          (p.ear && (!shown || (form === 3 && fade > 0.97)))
        )
          continue;
        if (!p.ear && hash(p.col * 71 + p.row) < damage * 0.18) continue;
        const death =
          s.phase === "dying" && !idle && !reduced ? s.phaseTime : 0;
        const size = b.cell * 0.88 * (p.ear && form === 3 ? 1 - fade : 1);
        const shift =
          transforming && form === 3 && !reduced
            ? Math.sin(p.row * 0.8 + s.phaseTime * 9) *
              Math.sin(fade * Math.PI) *
              13
            : 0;
        const a = hash(p.col + p.row * 62) * TAU;
        const scatter = death * (20 + hash(p.col * 2 + p.row) * 100);
        ctx.rect(
          Math.round(
            b.x +
              (p.col + 0.5) * b.cell -
              size / 2 +
              shift +
              Math.cos(a) * scatter,
          ),
          Math.round(
            b.y + (p.row + 0.5) * b.cell - size / 2 + Math.sin(a) * scatter,
          ),
          Math.ceil(size),
          Math.ceil(size),
        );
      }
      ctx.fill();
    }
    if (form === 3 && index === 0) old.eyes(b, fade);
    if (transforming && form === 3)
      old.ascension(
        b,
        clamp01(s.phaseTime / transformSeconds(s)),
        s.width,
        s.height,
        reduced,
      );
    if (index === 0 && (form === 2 || transforming)) {
      const envelope = transforming
        ? Math.sin(clamp01(s.phaseTime / transformSeconds(s)) * Math.PI)
        : 0.2;
      for (let i = 0; i < (reduced ? 8 : transforming ? 60 : 8); i++) {
        const a = hash(i + 7) * TAU + (reduced ? 0 : s.time * 0.3),
          r = b.height * (0.4 + hash(i + 9) * 0.5);
        const x = b.cx + Math.cos(a) * r,
          y = b.cy + Math.sin(a) * r * 0.83,
          size = (2 + hash(i + 12) * 5) * Math.max(0.3, envelope);
        ctx.globalAlpha = enter * envelope;
        ctx.fillStyle = "#ffd4eb";
        path([
          [x, y - size],
          [x + size * 0.22, y - size * 0.22],
          [x + size, y],
          [x + size * 0.22, y + size * 0.22],
          [x, y + size],
          [x - size * 0.22, y + size * 0.22],
          [x - size, y],
          [x - size * 0.22, y - size * 0.22],
        ]);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function ship(
    id: ShipId,
    x: number,
    y: number,
    bank: number,
    t: number,
    size = 1,
    ghost = false,
    focused = false,
  ) {
    const color = SHIPS[id].color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.scale(size, size);
    if (ghost) ctx.globalAlpha *= 0.25;
    const flicker = reduced ? 0 : Math.sin(t * 61) * 3;
    const engines = id === 0 ? [-9, 9] : id === 1 ? [-19, 19] : [-12, 0, 12];
    for (const ex of engines) {
      glow(ex, 24, 30, color, 0.7);
      ellipse(ex, 25 + flicker, id === 1 ? 5 : 3, 16 + flicker, color + "85");
      ellipse(ex, 20, 1.8, 10 + flicker, "#efffff");
    }
    const gradient = ctx.createLinearGradient(-26, -30, 25, 24);
    gradient.addColorStop(0, "#d8e4bb");
    gradient.addColorStop(0.35, "#4c6c5c");
    gradient.addColorStop(0.52, "#a1bb8a");
    gradient.addColorStop(0.6, "#284a3a");
    gradient.addColorStop(1, "#142e25");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#d6e7bd80";
    ctx.lineWidth = 0.7;
    const hull =
      id === 0
        ? [
            [0, -34],
            [7, -12],
            [25, 16],
            [23, 23],
            [7, 15],
            [0, 22],
            [-7, 15],
            [-23, 23],
            [-25, 16],
            [-7, -12],
          ]
        : id === 1
          ? [
              [0, -26],
              [9, -18],
              [15, -5],
              [29, 6],
              [31, 25],
              [12, 20],
              [6, 28],
              [-6, 28],
              [-12, 20],
              [-31, 25],
              [-29, 6],
              [-15, -5],
              [-9, -18],
            ]
          : [
              [0, -36],
              [9, -6],
              [31, -17],
              [23, 14],
              [10, 26],
              [0, 15],
              [-10, 26],
              [-23, 14],
              [-31, -17],
              [-9, -6],
            ];
    path(hull);
    ctx.fill();
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#132c23";
      path(
        id === 0
          ? [
              [side * 6, -4],
              [side * 20, 16],
              [side * 10, 11],
            ]
          : id === 1
            ? [
                [side * 10, -8],
                [side * 24, 10],
                [side * 12, 14],
              ]
            : [
                [side * 12, 1],
                [side * 25, -10],
                [side * 19, 13],
              ],
      );
      ctx.fill();
      line(
        side * 10,
        id === 2 ? 3 : 6,
        side * (id === 0 ? 19 : 23),
        15,
        color,
        1.7,
      );
      ctx.fillStyle = "#243c2c";
      ctx.fillRect(side * (id === 1 ? 23 : 14) - 2, -6, 4, 18);
      ctx.fillStyle = color;
      ctx.fillRect(side * (id === 1 ? 23 : 14) - 1, -7, 2, 6);
    }
    ctx.fillStyle = color + "bd";
    path([
      [0, -20],
      [4, -6],
      [0, 1],
      [-4, -6],
    ]);
    ctx.fill();
    ctx.strokeStyle = "#efffff";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    line(0, 4, 0, 13, "#e4f3ff88");
    if (focused) {
      ctx.strokeStyle = color + "88";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, 37, 0, TAU);
      ctx.stroke();
      ellipse(0, 0, 2, 2, "#ffffff");
    }
    ctx.restore();
  }
  function person(e: Enemy, time: number) {
    const musk = e.kind === "musk";
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(
      musk && e.state === 2
        ? Math.sin(time * 40) * 0.1
        : Math.sin(e.age * 3) * 0.04,
    );
    glow(0, 17, 35, musk ? "#73ddff" : "#ff698f", 0.3);
    // Small hand-painted caricatures: a quiff and X suit / silver hair and eye emitters.
    const gait = Math.sin(time * (musk ? 19 : 5)) * (musk ? 5 : 1);
    ctx.fillStyle = "#0a1221";
    ctx.fillRect(-11, 8, 22, 19);
    ctx.strokeStyle = musk ? "#83a3bf" : "#a0aec0";
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, 8, 22, 19);
    for (const side of [-1, 1]) {
      line(side * 8, 23, side * 10 + gait * side, 34, "#8591a5", 7);
      line(side * 12, 12, side * 18, 18 - gait * side, "#53617a", 7);
      ellipse(side * 18, 18 - gait * side, 4, 4, "#d4ab92");
    }
    ellipse(0, -6, 14, 17, "#d2a48c");
    ellipse(-4, -8, 8, 11, "#e8bba1");
    ctx.fillStyle = musk ? "#3a2b2c" : "#a4acb7";
    path(
      musk
        ? [
            [-14, -7],
            [-15, -20],
            [-7, -26],
            [4, -25],
            [14, -19],
            [14, -7],
            [6, -17],
            [-4, -13],
            [-10, -15],
          ]
        : [
            [-14, -3],
            [-16, -16],
            [-9, -23],
            [3, -24],
            [14, -17],
            [14, -3],
            [8, -17],
            [-4, -18],
            [-10, -10],
          ],
    );
    ctx.fill();
    line(-8, -5, -3, -5, "#30262c", 2);
    line(4, -5, 9, -5, "#30262c", 2);
    line(-3, 5, 5, 4, "#834f4c", 1.6);
    if (musk) {
      line(-4, 13, 4, 22, "#f0f4ff", 1.5);
      line(4, 13, -4, 22, "#f0f4ff", 1.5);
      if (e.state === 1) {
        ctx.strokeStyle = "#ffb98a";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, 33 + Math.sin(time * 18) * 3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else
      for (const ex of [-7, 7]) {
        glow(ex, -5, 15, "#ff406d", 0.9);
        ellipse(ex, -5, 2, 1.5, "#fff0f6");
      }
    if (e.flash > 0) {
      ctx.globalAlpha = e.flash * 3;
      ellipse(0, 0, 24, 27, "#e8f7ff");
    }
    ctx.restore();
  }
  function miniature(e: Enemy, s: World) {
    const clone = e.kind === "clone",
      index = clone ? 2 : 0,
      form = clone ? 3 : 2,
      key = `${index}:${form}`;
    const pixels = pixelsFor(index, form);
    if (!pixels) return;
    if (!miniSprites.has(key)) {
      const sprite = document.createElement("canvas");
      sprite.width = 62;
      sprite.height = 78;
      const c = sprite.getContext("2d")!,
        inks = clone ? EVIL_INKS : [...PALETTE, ...CAT_INKS];
      for (const p of pixels) {
        if (clone && p.ear) continue;
        c.fillStyle = inks[p.blush ?? p.ink];
        c.fillRect(p.col, p.row + 7, 1, 1);
      }
      miniSprites.set(key, sprite);
    }
    const h = clone ? (s.width < 600 ? 68 : 84) : 49,
      w = (h * 62) / 78,
      color = clone ? "#ed927b" : "#efb3d4";
    ctx.save();
    ctx.globalAlpha =
      clamp01(e.age / 0.55) *
      (clone ? 0.75 + (reduced ? 0 : Math.sin(s.time * 18 + e.id) * 0.08) : 1);
    ellipse(e.x, e.y, w * 0.67, h * 0.6, clone ? "#160e14e6" : "#10251ee6");
    glow(e.x, e.y, h * 0.8, color, 0.23);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniSprites.get(key)!, e.x - w / 2, e.y - h / 2, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = color + "77";
    ctx.lineWidth = 0.7;
    ctx.setLineDash(clone ? [3, 4] : []);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, w * 0.65, h * 0.59, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (e.state === 1) {
      glow(e.x, e.y + h * 0.25, 20, color, 0.7);
      const aim = Math.atan2(e.targetY - e.y, e.targetX - e.x);
      line(
        e.x,
        e.y + h * 0.2,
        e.x + Math.cos(aim) * 40,
        e.y + Math.sin(aim) * 40,
        color + "80",
        1,
      );
    }
    if (e.flash > 0) {
      ctx.globalAlpha = e.flash * 3;
      ellipse(e.x, e.y, w * 0.5, h * 0.5, "#fff1d5");
    }
    ctx.restore();
  }
  function handSeal(s: World) {
    if (!s.seal) return;
    const image = images[3];
    if (!image?.complete || !image.naturalWidth) return;
    const frame = handSealFrame(s.seal.age);
    if (!handFrames.has(frame)) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 80;
      const c = canvas.getContext("2d", { willReadFrequently: true })!;
      const cell = image.naturalWidth / 3;
      c.drawImage(
        image,
        cell * frame,
        0,
        cell,
        image.naturalHeight,
        0,
        0,
        80,
        80,
      );
      const data = c.getImageData(0, 0, 80, 80);
      c.clearRect(0, 0, 80, 80);
      for (let y = 0; y < 80; y++)
        for (let x = 0; x < 80; x++) {
          const at = (y * 80 + x) * 4;
          if (data.data[at + 3] < 100) continue;
          const light =
            data.data[at] * 0.299 +
            data.data[at + 1] * 0.587 +
            data.data[at + 2] * 0.114;
          c.fillStyle =
            EVIL_INKS[Math.max(0, Math.min(5, Math.floor((light - 15) / 37)))];
          c.fillRect(x, y, 1, 1);
        }
      handFrames.set(frame, canvas);
    }
    const width = Math.min(190, s.width * 0.43),
      height = width,
      x = s.boss.x,
      y = s.boss.y + bossRadius(s) * 0.8;
    const fade =
      clamp01(s.seal.age * 5) *
      clamp01((BALANCE.cloneSealSeconds + 0.45 - s.seal.age) * 5);
    ctx.save();
    ctx.globalAlpha = fade;
    glow(x, y, width * 0.65, "#ed927b", 0.45);
    ctx.imageSmoothingEnabled = false;
    if (!reduced && frame === 2)
      for (const side of [-1, 1]) {
        ctx.globalAlpha = fade * 0.15;
        ctx.drawImage(
          handFrames.get(frame)!,
          x - width / 2 + side * 7,
          y - height * 0.45,
          width,
          height,
        );
      }
    ctx.globalAlpha = fade;
    ctx.drawImage(
      handFrames.get(frame)!,
      x - width / 2,
      y - height * 0.45,
      width,
      height,
    );
    ctx.imageSmoothingEnabled = true;
    if (frame === 2) {
      glow(x, y - height * 0.12, 24, "#ffe0bd", 0.65);
      line(
        x - 28,
        y - height * 0.12,
        x + 28,
        y - height * 0.12,
        "#f6c9a275",
        0.7,
      );
    }
    ctx.restore();
  }
  function hazards(s: World) {
    const color = themeColor(s);
    for (const z of s.zones) {
      const live = z.age >= z.warning,
        progress = clamp01(z.age / z.warning);
      ctx.save();
      ctx.globalAlpha = live ? 0.42 : 0.16 + progress * 0.24;
      ellipse(z.x, z.y, z.radius, z.radius, live ? "#ed927b" : color);
      ctx.globalAlpha = live ? 0.95 : 0.8;
      ctx.strokeStyle = live ? "#ffe0bd" : color;
      ctx.lineWidth = live ? 2 : 1;
      ctx.setLineDash(live ? [] : [4, 5]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!live) {
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (1 - progress * 0.75), 0, TAU);
        ctx.stroke();
      }
      if (z.paw) {
        ellipse(z.x, z.y + 3, 9, 7, "#f0d5a7");
        for (const [x, y] of [
          [-10, -7],
          [-3, -12],
          [5, -12],
          [12, -6],
        ])
          ellipse(z.x + x, z.y + y, 3.5, 4.5, "#f0d5a7");
      } else if (z.heart) {
        ctx.fillStyle = "#efb3d4";
        path([
          [z.x, z.y + 10],
          [z.x - 12, z.y - 2],
          [z.x - 8, z.y - 9],
          [z.x, z.y - 4],
          [z.x + 8, z.y - 9],
          [z.x + 12, z.y - 2],
        ]);
        ctx.fill();
      } else {
        ctx.translate(z.x, z.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-9, -9, 18, 18);
        line(-6, 0, 6, 0, "#f3d2b5", 1);
      }
      ctx.restore();
    }
    for (const wave of s.shockwaves) {
      const gap = waveGap(wave),
        half = wave.gapWidth / 2,
        live = wave.age >= wave.warning,
        r = live ? wave.radius : 22 + (wave.age / wave.warning) * 25;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = live ? 3 : 1;
      ctx.globalAlpha = live ? 0.85 : 0.55;
      if (!live) ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, r, gap + half, gap + TAU - half);
      ctx.stroke();
      ctx.setLineDash([]);
      if (live) {
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 12;
        ctx.stroke();
      }
      for (const a of [gap - half, gap + half]) {
        const x = wave.x + Math.cos(a) * r,
          y = wave.y + Math.sin(a) * r;
        glow(x, y, 13, "#b4e3cf", 0.6);
        line(
          x - Math.cos(a) * 8,
          y - Math.sin(a) * 8,
          x + Math.cos(a) * 8,
          y + Math.sin(a) * 8,
          "#d9efc5",
          2,
        );
      }
      if (!live) {
        for (const a of [gap - half, gap + half])
          line(
            wave.x,
            wave.y,
            wave.x + Math.cos(a) * s.height,
            wave.y + Math.sin(a) * s.height,
            "#b4e3cf22",
            1,
          );
      }
      ctx.restore();
    }
    if (s.lunge && !s.lunge.returning) {
      const l = s.lunge,
        live = l.age >= l.warning;
      ctx.save();
      ctx.globalAlpha = live ? 0.2 : 0.1;
      line(l.x, l.y, l.tx, l.ty, "#e8c597", bossRadius(s) * 1.24);
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([5, 7]);
      line(l.x, l.y, l.tx, l.ty, "#e8c597", 1);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#f3d5a5";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(l.tx, l.ty, bossRadius(s) * 0.62, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
  function bullet(b: Bullet, s: World) {
    const color = b.friendly
      ? SHIPS[b.ship ?? s.ship].color
      : s.sector === 1
        ? bossStage(s) === 2
          ? "#efb3d4"
          : "#ed927b"
        : themeColor(s);
    const angle = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    if (b.kind === "ion" || b.kind === "rail") {
      glow(0, 5, b.kind === "rail" ? 27 : 17, color, 0.65);
      ctx.strokeStyle = color + "35";
      ctx.lineWidth = b.kind === "rail" ? 10 : 6;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, b.kind === "rail" ? 70 : 32);
      ctx.stroke();
      line(
        0,
        -11,
        0,
        b.kind === "rail" ? 42 : 16,
        color,
        b.kind === "rail" ? 4 : 2.5,
      );
      line(0, -10, 0, 10, "#f7ffff", 1.2);
    } else if (b.kind === "plasma") {
      glow(0, 0, 23, "#ffbe64", 0.7);
      ellipse(0, 0, 5, 9, "#ffb867");
      ellipse(0, -2, 2, 5, "#fff6d9");
      line(0, 6, 0, 24, "#ffc96f66", 3);
    } else if (b.kind === "seeker") {
      glow(0, 9, 25, "#ffb560", 0.8);
      line(0, 5, 0, 30, "#ffb56099", 5);
      ctx.fillStyle = "#dee9f4";
      path([
        [0, -10],
        [4, 4],
        [7, 8],
        [-7, 8],
        [-4, 4],
      ]);
      ctx.fill();
      line(0, -6, 0, 4, "#f5986b", 2);
    } else if (b.kind === "bone") {
      glow(0, 0, 18, "#ffcb7f", 0.5);
      if (b.motion === "return" && b.age > (b.returnAt ?? 1.35)) {
        ctx.strokeStyle = "#ed927b";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        ctx.stroke();
      }
      ctx.rotate(b.age * 2);
      line(-5, 0, 5, 0, "#fff1c6", 4);
      for (const x of [-6, 6])
        for (const y of [-2, 2]) ellipse(x, y, 2.8, 2.8, "#fff1c6");
    } else if (b.kind === "prism") {
      glow(0, 0, 18, "#cf8fff", 0.65);
      ctx.rotate(b.age);
      ctx.fillStyle = "#cea3ff";
      ctx.strokeStyle = "#fff0ff";
      path([
        [0, -9],
        [5, 0],
        [0, 9],
        [-5, 0],
      ]);
      ctx.fill();
      ctx.stroke();
    } else {
      glow(0, 0, 18, color, 0.7);
      ellipse(0, 0, 5, 5, color);
      ellipse(-1, -1, 2, 2, "#ffece8");
    }
    ctx.restore();
  }
  function laser(s: World) {
    for (const b of s.lasers) {
      const end = beamEnd(b, s.height * 2.5);
      const tx = end.x,
        ty = end.y;
      const live = b.age >= b.warning;
      if (!live) {
        ctx.globalAlpha = 0.3 + 0.5 * clamp01(b.age / b.warning);
        ctx.setLineDash([6, 9]);
        line(b.x, b.y, tx, ty, "#ff819b", 1);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        glow(b.x, b.y, 12 + b.age * 15, "#ff5f8e", 0.65);
        ctx.strokeStyle = "#ffc3cf";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.tx, b.ty, 15, 0, TAU);
        ctx.stroke();
        if (b.sweep) {
          const a = Math.atan2(b.ty - b.y, b.tx - b.x);
          ctx.strokeStyle = "#ff819b40";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(
            b.x,
            b.y,
            75,
            Math.min(a, a + b.sweep),
            Math.max(a, a + b.sweep),
          );
          ctx.stroke();
          const tip = beamEnd(
            { ...b, age: b.warning + b.duration },
            s.height * 2.5,
          );
          line(b.x, b.y, tip.x, tip.y, "#ff819b24", 1);
        }
      } else {
        line(b.x, b.y, tx, ty, "#fa477b20", b.width * 7);
        line(b.x, b.y, tx, ty, "#ff5c90a0", b.width * 3);
        line(b.x, b.y, tx, ty, "#ffe4f0", b.width);
        line(b.x, b.y, tx, ty, "#ffffff", Math.max(1, b.width * 0.35));
        glow(b.x, b.y, 40, "#ff5f8e");
      }
    }
  }
  function effects(s: World) {
    const time = reduced ? 0 : s.time;
    for (const a of s.arcs) {
      const alpha = 1 - a.age / 0.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      const color = SHIPS[s.ship].color;
      const distance = Math.hypot(a.tx - a.x, a.ty - a.y);
      const points = Array.from({ length: 12 }, (_, i) => {
        const t = i / 11;
        const jitter =
          i && i < 11
            ? (hash(i + a.seed + Math.floor(time * 30)) * 2 - 1) *
              (a.rail ? 3 : 18)
            : 0;
        return [
          a.x + (a.tx - a.x) * t + jitter,
          a.y + (a.ty - a.y) * t + jitter * 0.5,
        ];
      });
      for (const [width, ink] of [
        [10, color + "24"],
        [3, color],
        [1, "#ffffff"],
      ] as const) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = width;
        ctx.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.stroke();
      }
      if (distance > 0) glow(a.tx, a.ty, 25, color, alpha);
      ctx.restore();
    }
    if (s.pulse) {
      const p = s.pulse,
        t = p.age / 0.65,
        r = Math.min(s.width * 0.42, 210) * Math.min(1, p.age / 0.4),
        color = SHIPS[s.ship].color;
      glow(p.x, p.y, r, color, (1 - t) * 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.88, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const b of s.bursts) {
      if (b.text) {
        label(b.text, b.x, b.y - b.age * 23, b.color, b.power === 0 ? 11 : 8);
        continue;
      }
      const progress = b.age / 1.25,
        alpha = (1 - progress) ** 2;
      if (b.smoke) {
        ctx.save();
        ctx.globalAlpha = clamp01(1 - b.age / 1.1) * 0.62;
        for (let i = 0; i < (reduced ? 3 : 9); i++) {
          const a = hash(i + b.seed) * TAU,
            r = (9 + b.age * 50) * (hash(i + 7) + 0.4),
            x = b.x + Math.cos(a) * r,
            y = b.y + Math.sin(a) * r * 0.6;
          ellipse(
            x,
            y,
            (11 + b.age * 18) * (hash(i + 3) * 0.6 + 0.7),
            (9 + b.age * 14) * (hash(i + 2) * 0.6 + 0.7),
            i % 2 ? "#d8c8bb" : "#929084",
          );
        }
        ctx.restore();
        continue;
      }
      glow(
        b.x,
        b.y,
        Math.max(12, b.power * 65 * (0.4 + progress)),
        b.color,
        alpha * 0.8,
      );
      ctx.save();
      ctx.globalAlpha = alpha;
      if (b.power > 0.5) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4 + b.age * 75 * b.power, 0, TAU);
        ctx.stroke();
      }
      const count = reduced ? 4 : Math.ceil(b.power * 14);
      for (let i = 0; i < count; i++) {
        const a = hash(i + b.seed) * TAU,
          v = (20 + hash(i + b.seed + 2) * 130) * b.power;
        const x = b.x + Math.cos(a) * v * b.age,
          y = b.y + Math.sin(a) * v * b.age + b.age * b.age * 30;
        line(
          x,
          y,
          x - Math.cos(a) * (2 + v * 0.035),
          y - Math.sin(a) * (2 + v * 0.035),
          i % 3 ? b.color : "#fff4dc",
          i % 3 ? 1 : 2,
        );
      }
      ctx.restore();
    }
  }
  function title(s: World) {
    const color = themeColor(s);
    let kicker = "",
      heading = "",
      alpha = 1;
    if (s.phase === "intro") {
      heading = `LEVEL 0${s.sector}`;
      alpha = Math.min(
        clamp01(s.phaseTime * 2),
        clamp01((2.4 - s.phaseTime) * 2),
      );
    } else if (s.phase === "boss-intro") {
      heading = SECTORS[s.sector - 1].boss;
      alpha = Math.min(
        clamp01(s.phaseTime * 2),
        clamp01((3 - s.phaseTime) * 2),
      );
    } else if (s.phase === "sector-clear") {
      heading = "CLEAR";
    } else if (s.phase === "transform" && s.sector > 1) {
      kicker = `PHASE ${["I", "II", "III"][bossStage(s) - 1]}`;
      heading = stageTitle(s);
      alpha = Math.min(
        clamp01(s.phaseTime * 4),
        clamp01((transformSeconds(s) - s.phaseTime) * 4),
      );
    }
    if (!heading) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const y = s.phase === "boss-intro" ? s.height * 0.58 : s.height * 0.45;
    const g = ctx.createLinearGradient(0, y - 65, 0, y + 90);
    g.addColorStop(0, "#091b1800");
    g.addColorStop(0.3, "#091b18d9");
    g.addColorStop(0.75, "#091b18d9");
    g.addColorStop(1, "#091b1800");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 65, s.width, 165);
    line(s.width * 0.18, y - 40, s.width * 0.82, y - 40, color + "55");
    if (kicker) label(kicker, s.width / 2, y - 20, color, 8);
    const size = Math.min(
      s.width / (heading.length * 0.57),
      s.height * 0.074,
      54,
    );
    ctx.font = `900 ${size}px monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#d9e4b9";
    ctx.fillText(heading, s.width / 2, y + size * 0.7);
    ctx.restore();
  }
  function render(s: World) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.scale(ctx.canvas.width / s.width, ctx.canvas.height / s.height);
    if (!reduced && s.shake > 0.3)
      ctx.translate(
        Math.sin(s.time * 137) * s.shake,
        Math.cos(s.time * 113) * s.shake * 0.65,
      );
    environment(s);
    if (s.phase === "ready" || s.phase === "loading" || s.phase === "error") {
      face(s, true);
    } else {
      if (s.attack) {
        ctx.save();
        ctx.setLineDash([2, 9]);
        for (const event of s.attack.events) {
          if (
            event.type !== "volley" ||
            event.at < s.attack.age ||
            event.at - s.attack.age > 0.85
          )
            continue;
          ctx.globalAlpha = 0.2 + 0.45 * (1 - (event.at - s.attack.age) / 0.85);
          for (const a of event.shots) {
            const v = Math.hypot(a.vx, a.vy);
            line(
              a.x,
              a.y,
              a.x + (a.vx / v) * 75,
              a.y + (a.vy / v) * 75,
              themeColor(s),
              1,
            );
          }
        }
        ctx.restore();
      }
      hazards(s);
      if (bossGuard(s) < 1) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        for (const e of s.enemies)
          if (e.kind === "clone" && e.hp > 0)
            line(e.x, e.y, s.boss.x, s.boss.y, "#ed927b55", 1);
        ctx.restore();
      }
      face(s);
      for (const e of s.enemies) {
        if (e.kind === "cat" || e.kind === "clone") miniature(e, s);
        else if (e.kind === "musk" || e.kind === "thiel") {
          if (e.kind === "musk" && e.state === 1) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.setLineDash([3, 6]);
            line(e.x, e.y, e.targetX, e.targetY, "#ffc092", 1);
            ctx.restore();
          }
          person(e, s.time);
        } else
          old.enemy(
            { ...e, kind: e.kind, side: 1, shotAt: e.fire },
            reduced,
            0.48,
          );
        if (e.hp < e.maxHp) {
          const top = e.kind === "clone" ? -51 : -37;
          ctx.fillStyle = "#ffffff25";
          ctx.fillRect(e.x - 18, e.y + top, 36, 2);
          ctx.fillStyle = themeColor(s);
          ctx.fillRect(e.x - 18, e.y + top, (36 * e.hp) / e.maxHp, 2);
        }
      }
      handSeal(s);
      for (const b of s.bullets) bullet(b, s);
      laser(s);
      for (const d of s.drops) {
        glow(d.x, d.y, 22, "#9effc1", 0.65);
        ctx.strokeStyle = "#b7ffd0";
        ctx.lineWidth = 1;
        ctx.strokeRect(d.x - 8, d.y - 8, 16, 16);
        line(d.x - 4, d.y, d.x + 4, d.y, "#deffe9", 2);
        if (d.kind === "repair") line(d.x, d.y - 4, d.x, d.y + 4, "#deffe9", 2);
      }
      if (!["win", "lose", "dying"].includes(s.phase)) {
        if (s.player.dashTime > 0 && !reduced)
          for (let i = 1; i <= 5; i++)
            ship(
              s.ship,
              s.player.x - s.player.dashX * i * 14,
              s.player.y - s.player.dashY * i * 14,
              s.player.bank,
              s.time,
              1,
              true,
            );
        ctx.save();
        if (s.player.invincible > 0 && Math.sin(s.time * 32) > 0)
          ctx.globalAlpha = 0.5;
        ship(
          s.ship,
          s.player.x,
          s.player.y,
          s.player.bank,
          s.time,
          Math.min(1, s.width / 430 + 0.1),
          false,
          s.player.focused,
        );
        if (s.player.invincible > 0) {
          ctx.strokeStyle = SHIPS[s.ship].color + "90";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.player.x, s.player.y, 32, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    effects(s);
    title(s);
    if (s.flash > 0 && !reduced) {
      ctx.fillStyle = "#fb6f8224";
      ctx.fillRect(0, 0, s.width, s.height);
    }
    ctx.restore();
  }
  return { render };
}
