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
import { DASH_DURATION } from "@/components/break/physics";
import { beamEnd, waveGap, handSealFrame } from "@/components/break/tactics";
import { createVfx } from "@/components/break/vfx";

const TAU = Math.PI * 2;
const hash = (n: number) => {
  const a = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return a - Math.floor(a);
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - (1 - clamp01(n)) ** 3;
const ROMAN = ["I", "II", "III"] as const;
const SIDES = [-1, 1] as const;
const HALOS = [1, 1.13] as const;
// Dash patterns are shared; setLineDash copies them, so nothing is allocated per frame.
const SOLID: number[] = [],
  DASH_LINK = [2, 8],
  DASH_CLONE = [3, 4],
  DASH_WAVE = [3, 5],
  DASH_PREVIEW = [2, 7],
  DASH_RETURN = [2, 3];
// Cat ears rise above the 70-row portrait grid; cached portraits keep room for them.
const EAR_ROWS = 18;
// Hostile shots share one dark keyline so they read over portraits, beams and glow.
const KEYLINE = "#12070b";
// Every particle lives in one fixed pool: sparks, pixel debris, embers and rings.
const SPARK = 0,
  PIXEL = 1,
  EMBER = 2,
  RING = 3;
const POOL = 640;
const HULLS = [
  [
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
  ],
  [
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
  ],
  [
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
  ],
];
const ENGINES = [
  [-9, 9],
  [-19, 19],
  [-12, 0, 12],
];
const DEBRIS: Record<string, readonly string[]> = {
  palantir: ["#dfe5e0", "#9aa7aa", "#4c5966", "#2a3640"],
  anduril: ["#f0eee0", "#b0b8af", "#858f92", "#33444e"],
  musk: ["#d2a48c", "#e8bba1", "#3a2b2c", "#0a1221", "#83a3bf"],
  thiel: ["#d2a48c", "#e8bba1", "#a4acb7", "#0a1221", "#ff406d"],
  cat: [PALETTE[2], PALETTE[3], PALETTE[4], CAT_INKS[1], CAT_INKS[2]],
  clone: [EVIL_INKS[2], EVIL_INKS[3], EVIL_INKS[4], EVIL_INKS[5], EVIL_INKS[7]],
};
type Track = {
  hp: number;
  round: number;
  fired: number;
  hit: number;
  dead: boolean;
};
type Face = {
  canvas: HTMLCanvasElement;
  white: HTMLCanvasElement | null;
  form: number;
  step: number;
  cell: number;
  dpr: number;
};

export function createCampaignVfx(
  ctx: CanvasRenderingContext2D,
  images: HTMLImageElement[],
  reduced: boolean,
) {
  // Canvas text uses the page's own loaded faces: dot-matrix display, mono labels.
  const css = getComputedStyle(document.documentElement);
  const MONO = `${css.getPropertyValue("--font-mono").trim() || "monospace"}, ui-monospace, monospace`;
  const DOTS = `${css.getPropertyValue("--font-dots").trim() || "monospace"}, monospace`;

  // Light lives in a small buffer added over the frame. Soft glows cost a fraction
  // of the fill they did at full resolution, and a short decay gives bright things
  // the afterglow of a phosphor. Draws are scaled by (1 - decay), so anything that
  // holds still settles at the same brightness at every frame rate.
  const bloom = document.createElement("canvas");
  const light = bloom.getContext("2d")!;
  let gain = 1;
  const sprites = new Map<string, HTMLCanvasElement>();
  function sprite(color: string) {
    let canvas = sprites.get(color);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const c = canvas.getContext("2d")!;
      const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, color + "ba");
      gradient.addColorStop(0.18, color + "65");
      gradient.addColorStop(0.5, color + "1c");
      gradient.addColorStop(1, color + "00");
      c.fillStyle = gradient;
      c.fillRect(0, 0, 64, 64);
      sprites.set(color, canvas);
    }
    return canvas;
  }
  function glow(
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha = 1,
  ) {
    const a = alpha * ctx.globalAlpha * gain;
    if (a < 0.004 || radius < 0.5) return;
    light.globalAlpha = Math.min(1, a);
    light.drawImage(sprite(color), x - radius, y - radius, radius * 2, radius * 2);
  }
  function glowLine(
    x: number,
    y: number,
    tx: number,
    ty: number,
    width: number,
    color: string,
    alpha: number,
  ) {
    light.globalAlpha = Math.min(1, alpha * ctx.globalAlpha * gain);
    light.strokeStyle = color;
    light.lineWidth = width;
    light.beginPath();
    light.moveTo(x, y);
    light.lineTo(tx, ty);
    light.stroke();
  }
  function glowRing(
    x: number,
    y: number,
    radius: number,
    width: number,
    color: string,
    alpha: number,
  ) {
    light.globalAlpha = Math.min(1, alpha * ctx.globalAlpha * gain);
    light.strokeStyle = color;
    light.lineWidth = width;
    light.beginPath();
    light.arc(x, y, radius, 0, TAU);
    light.stroke();
  }
  // Glows drawn inside a rotated or scaled body are placed through this frame.
  let fx = 0,
    fy = 0,
    fc = 1,
    fs = 0,
    fk = 1;
  function local(x: number, y: number, angle: number, scale: number) {
    fx = x;
    fy = y;
    fk = scale;
    fc = Math.cos(angle) * scale;
    fs = Math.sin(angle) * scale;
  }
  function glowAt(
    lx: number,
    ly: number,
    radius: number,
    color: string,
    alpha = 1,
  ) {
    glow(fx + lx * fc - ly * fs, fy + lx * fs + ly * fc, radius * fk, color, alpha);
  }
  const old = createVfx(ctx, (x, y, radius, alpha, warm) =>
    glow(x, y, radius, warm ? "#ffd18e" : "#ff4f43", alpha * 1.3),
  );

  const portraits = new Map<number, PixelPortrait>();
  const variants = new Map<string, PixelPortrait["pixels"]>();
  const faces = new Map<number, Face>();
  const miniSprites = new Map<string, HTMLCanvasElement>();
  const handFrames = new Map<number, HTMLCanvasElement>();
  let dpr = 1;
  // Reused for the drone renderer so a frame allocates nothing per unit.
  const drone = {
    kind: "palantir" as "palantir" | "anduril",
    x: 0,
    y: 0,
    age: 0,
    side: 1,
    flash: 0,
    shotAt: 0,
  };
  const hulls = HULLS.map((points) => {
    const p = new Path2D();
    points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  });
  const hullShade: CanvasGradient[] = [];

  // Particle pool, struct-of-arrays so spawning and drawing never allocate.
  const px = new Float32Array(POOL),
    py = new Float32Array(POOL),
    pvx = new Float32Array(POOL),
    pvy = new Float32Array(POOL),
    page = new Float32Array(POOL),
    plife = new Float32Array(POOL),
    psize = new Float32Array(POOL),
    pkind = new Uint8Array(POOL),
    pink = new Uint8Array(POOL);
  let cursor = 0,
    seed = 0x9e3779b9;
  const inks: string[] = [];
  const inkIds = new Map<string, number>();
  function ink(color: string) {
    let id = inkIds.get(color);
    if (id === undefined) {
      id = inks.length;
      inks.push(color);
      inkIds.set(color, id);
    }
    return id;
  }
  function rand() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  function emit(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
  ) {
    const i = cursor;
    cursor = (cursor + 1) % POOL;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx;
    pvy[i] = vy;
    page[i] = 0;
    plife[i] = life;
    psize[i] = size;
    pkind[i] = kind;
    pink[i] = ink(color);
  }
  function sparks(
    x: number,
    y: number,
    count: number,
    speed: number,
    color: string,
    life = 0.42,
  ) {
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU,
        v = speed * (0.35 + rand() * 0.65);
      emit(SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.55 + rand() * 0.45), 1, color);
    }
  }
  function pixels(
    x: number,
    y: number,
    count: number,
    spread: number,
    speed: number,
    palette: readonly string[],
    size = 4,
  ) {
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU,
        v = speed * (0.25 + rand() * 0.75);
      emit(
        PIXEL,
        x + (rand() - 0.5) * spread,
        y + (rand() - 0.5) * spread,
        Math.cos(a) * v,
        Math.sin(a) * v - speed * 0.15,
        0.55 + rand() * 0.6,
        size * (0.55 + rand() * 0.65),
        palette[i % palette.length],
      );
    }
  }
  function stepParticles(dt: number) {
    if (dt <= 0) return;
    const sparkDrag = Math.exp(-dt * 3.4),
      pixelDrag = Math.exp(-dt * 1.7);
    for (let i = 0; i < POOL; i++) {
      if (plife[i] <= 0) continue;
      page[i] += dt;
      if (page[i] >= plife[i]) {
        plife[i] = 0;
        continue;
      }
      const drag = pkind[i] === SPARK ? sparkDrag : pixelDrag;
      pvx[i] *= drag;
      pvy[i] = pvy[i] * drag + 30 * dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
    }
  }
  function drawParticles() {
    for (let id = 0; id < inks.length; id++) {
      let squares = false,
        streaks = false;
      ctx.beginPath();
      for (let i = 0; i < POOL; i++) {
        if (plife[i] <= 0 || pink[i] !== id || pkind[i] !== PIXEL) continue;
        const t = page[i] / plife[i],
          size = psize[i] * (1 - t * t);
        ctx.rect(Math.round(px[i] - size / 2), Math.round(py[i] - size / 2), size, size);
        squares = true;
      }
      if (squares) {
        ctx.fillStyle = inks[id];
        ctx.fill();
      }
      ctx.beginPath();
      for (let i = 0; i < POOL; i++) {
        if (plife[i] <= 0 || pink[i] !== id || pkind[i] !== SPARK) continue;
        const v = Math.hypot(pvx[i], pvy[i]) || 1,
          length = Math.min(15, 1.5 + v * 0.04);
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[i] - (pvx[i] / v) * length, py[i] - (pvy[i] / v) * length);
        streaks = true;
      }
      if (streaks) {
        ctx.strokeStyle = inks[id];
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
    ctx.save();
    for (let i = 0; i < POOL; i++) {
      if (plife[i] <= 0) continue;
      const t = page[i] / plife[i];
      if (pkind[i] === RING) {
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = inks[pink[i]];
        ctx.lineWidth = 0.6 + (1 - t) * 1.6;
        ctx.beginPath();
        ctx.arc(px[i], py[i], 3 + psize[i] * easeOut(t), 0, TAU);
        ctx.stroke();
      } else if (pkind[i] === EMBER) {
        ctx.globalAlpha = 1;
        glow(px[i], py[i], psize[i] * (1.3 - t), inks[pink[i]], 1 - t);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "#fff4dc";
        ctx.fillRect(px[i] - 1, py[i] - 1, 2, 2);
      }
    }
    ctx.restore();
  }
  function clearParticles() {
    plife.fill(0);
  }

  // What the renderer remembers between frames, to turn world changes into feedback.
  const tracks = new WeakMap<Enemy, Track>();
  const seenEnemies: Enemy[] = [];
  const seenShots: Bullet[] = [];
  const trailX = new Float32Array(12),
    trailY = new Float32Array(12);
  let trailCount = 0,
    dashFromX = 0,
    dashFromY = 0,
    dashEnd = -1;
  let lastTime = -1,
    lastNow = 0,
    lastHull: number = BALANCE.hull,
    lastDash = 0,
    lastOverdrive = 0,
    lastPhase = "",
    lastBossHp = 0,
    bossHit = -1,
    hurtAt = -10,
    impactAt = -1e9,
    impactLength = 0,
    kickAt = -1e9,
    kickPower = 0;
  function track(e: Enemy) {
    let t = tracks.get(e);
    if (!t) {
      t = { hp: e.hp, round: e.round ?? 0, fired: -1, hit: -1, dead: false };
      tracks.set(e, t);
    }
    return t;
  }
  function debris(e: Enemy, s: World) {
    if (reduced) {
      emit(RING, e.x, e.y, 0, 0, 0.3, 30, themeColor(s));
      return;
    }
    const drone = e.kind === "palantir" || e.kind === "anduril";
    const palette = DEBRIS[e.kind] ?? DEBRIS.palantir;
    pixels(e.x, e.y, drone ? 14 : 22, drone ? 30 : 26, drone ? 170 : 130, palette, drone ? 5 : 4);
    sparks(e.x, e.y, drone ? 14 : 8, 300, drone ? "#ffd18e" : themeColor(s));
    sparks(e.x, e.y, 5, 200, "#fff4dc", 0.3);
    if (drone)
      for (let i = 0; i < 3; i++)
        emit(EMBER, e.x, e.y, (rand() - 0.5) * 150, (rand() - 0.7) * 120, 0.6 + rand() * 0.4, 14, "#ffb865");
    emit(RING, e.x, e.y, 0, 0, 0.42, drone ? 46 : 38, e.kind === "thiel" ? "#ff748d" : themeColor(s));
  }
  function observe(s: World, now: number) {
    // A new run rewinds the clock: nothing from the old one should linger.
    if (s.time < lastTime) {
      clearParticles();
      seenEnemies.length = seenShots.length = 0;
      trailCount = 0;
      lastHull = s.player.hull;
      lastOverdrive = s.overdrive;
      hurtAt = dashEnd = -10;
    }
    for (const e of s.enemies) {
      const t = track(e);
      if ((e.round ?? 0) !== t.round) {
        t.round = e.round ?? 0;
        t.fired = s.time;
      }
      // At most three damage flashes a second on any one unit.
      if (e.hp < t.hp - 0.01 && s.time - t.hit >= 1 / 3) t.hit = s.time;
      t.hp = e.hp;
      if (e.defeated && !t.dead) {
        t.dead = true;
        debris(e, s);
      }
    }
    for (const e of seenEnemies)
      if (e.defeated) {
        const t = track(e);
        if (!t.dead) {
          t.dead = true;
          debris(e, s);
        }
      }
    seenEnemies.length = 0;
    for (const e of s.enemies) seenEnemies.push(e);

    // Shots that disappear on screen were absorbed, cleared by the pulse, or
    // wiped by a phase change: each one pops where it was.
    let pops = 0;
    const cleared = s.bullets.length === 0 && s.phase !== lastPhase;
    for (const b of seenShots) {
      if (pops > 36) break;
      if (b.life > 0 && !cleared) continue;
      if (b.x < -10 || b.x > s.width + 10 || b.y < -10 || b.y > s.height + 10) continue;
      pops++;
      const color = shotColor(s, b.kind);
      emit(RING, b.x, b.y, 0, 0, 0.24, 10, color);
      if (!reduced) sparks(b.x, b.y, 3, 140, color, 0.26);
    }
    seenShots.length = 0;
    for (const b of s.bullets) if (!b.friendly && b.life > 0) seenShots.push(b);

    const p = s.player;
    if (p.hull < lastHull) {
      hurtAt = s.time;
      if (!reduced) {
        sparks(p.x, p.y, 16, 320, "#ff797b", 0.5);
        pixels(p.x, p.y, 8, 16, 150, [SHIPS[s.ship].color, "#d8e4bb", "#284a3a"], 4);
      }
      emit(RING, p.x, p.y, 0, 0, 0.45, 54, "#ff797b");
    }
    lastHull = p.hull;
    if (p.dashTime > 0) {
      if (lastDash <= 0) {
        const elapsed = DASH_DURATION - p.dashTime;
        dashFromX = p.x - p.dashX * p.dashSpeed * elapsed;
        dashFromY = p.y - p.dashY * p.dashSpeed * elapsed;
        trailCount = 0;
        if (!reduced)
          for (let i = 0; i < 7; i++)
            emit(
              SPARK,
              dashFromX + (rand() - 0.5) * 24,
              dashFromY + (rand() - 0.5) * 24,
              -p.dashX * (260 + rand() * 260),
              -p.dashY * (260 + rand() * 260),
              0.3,
              1,
              SHIPS[s.ship].color,
            );
      }
      // Sampled by distance, so the trail spans the whole dash at any refresh rate.
      if (
        trailCount < trailX.length &&
        (trailCount === 0 ||
          Math.hypot(p.x - trailX[trailCount - 1], p.y - trailY[trailCount - 1]) >= 11)
      ) {
        trailX[trailCount] = p.x;
        trailY[trailCount] = p.y;
        trailCount++;
      }
      dashEnd = s.time;
    }
    lastDash = p.dashTime;
    if (s.overdrive > 0 && lastOverdrive <= 0) {
      emit(RING, p.x, p.y, 0, 0, 0.55, 90, "#ffe3a8");
      if (!reduced) sparks(p.x, p.y, 18, 260, "#ffe3a8", 0.5);
    }
    lastOverdrive = s.overdrive;
    if (s.phase === "fight" && s.boss.hp < lastBossHp - 0.01 && s.time - bossHit >= 1 / 3)
      bossHit = s.time;
    lastBossHp = s.boss.hp;
    if (s.phase !== lastPhase) {
      // A broken stage or a final blow gets one impact frame and a camera kick.
      if ((s.phase === "transform" && lastPhase === "fight") || s.phase === "dying") {
        const dying = s.phase === "dying";
        impactAt = now;
        impactLength = dying ? 170 : 120;
        kickAt = now;
        kickPower = dying ? 16 : 10;
        const b = portraitBox(s);
        if (!reduced)
          pixels(b.cx, b.cy, dying ? 70 : 44, b.width * 0.7, dying ? 330 : 260, facePalette(s), 6);
        emit(RING, b.cx, b.cy, 0, 0, 0.7, Math.max(s.width, s.height) * 0.55, themeColor(s));
        emit(RING, b.cx, b.cy, 0, 0, 0.5, b.height * 0.9, "#fff4dc");
      }
      lastPhase = s.phase;
    }
  }
  function facePalette(s: World): readonly string[] {
    return s.sector === 2
      ? ["#e1d8aa", "#f3e5c1", "#b8bb8d", "#8b9165"]
      : s.sector === 3 || bossTheme(s) === 3
        ? [EVIL_INKS[3], EVIL_INKS[4], EVIL_INKS[5], EVIL_INKS[7]]
        : bossTheme(s) === 2
          ? [PALETTE[3], PALETTE[4], CAT_INKS[1], CAT_INKS[2]]
          : [PALETTE[2], PALETTE[3], PALETTE[4], PALETTE[5]];
  }

  function path(points: readonly (readonly number[])[]) {
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
  function type(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    face = MONO,
    weight = 400,
    tracking = 0,
    align: CanvasTextAlign = "center",
  ) {
    ctx.font = `${weight} ${size}px ${face}`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = `${tracking}px`;
    ctx.fillStyle = color;
    // Tracking adds space after the last glyph; recentre to keep titles optical.
    ctx.fillText(text, align === "center" ? x + tracking / 2 : x, y);
    ctx.letterSpacing = "0px";
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
    const streak = s.player.dashTime > 0 || s.overdrive > 0;
    for (let i = 0; i < 42; i++) {
      const y = (hash(i + 2) * h + t * (7 + hash(i + 3) * 24)) % h,
        x = hash(i + 1) * w;
      ctx.fillStyle = i % 7 ? "#8eb99b20" : "#d2e7bc45";
      ctx.fillRect(x, y, i % 7 ? 1 : 2, streak && !reduced ? 12 : i % 7 ? 2 : 4);
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
  function inksFor(index: number, fade: number) {
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
    return normal.map((ink, i) => {
      const from = parseInt(ink.slice(1), 16),
        to = parseInt(EVIL_INKS[i].slice(1), 16);
      const channel = (n: number) =>
        Math.round(((from >> n) & 255) * (1 - fade) + ((to >> n) & 255) * fade);
      return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
    });
  }
  // A settled portrait is baked once per form, damage step and size, then copied
  // 1:1 to device pixels. Only transformations and the death scatter stay per pixel.
  function settledFace(
    index: number,
    form: number,
    damage: number,
    cell: number,
    pixels: PixelPortrait["pixels"],
  ) {
    const step = Math.floor(damage * 100);
    let face = faces.get(index);
    if (
      face &&
      face.form === form &&
      face.step === step &&
      Math.abs(face.cell - cell) < 0.001 &&
      face.dpr === dpr
    )
      return face;
    const canvas = face?.canvas ?? document.createElement("canvas");
    canvas.width = Math.ceil(62 * cell * dpr) + 2;
    canvas.height = Math.ceil((70 + EAR_ROWS) * cell * dpr) + 2;
    const c = canvas.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fade = form === 3 ? 1 : 0;
    const palette = inksFor(index, fade);
    const size = cell * 0.88;
    for (let ink = 0; ink < palette.length; ink++) {
      c.fillStyle = palette[ink];
      c.beginPath();
      for (const p of pixels) {
        const pixelInk =
          form === 3 && p.evil !== undefined
            ? p.evil
            : form === 2 && p.blush !== undefined
              ? p.blush
              : p.ink;
        if (pixelInk !== ink || (p.ear && form === 3)) continue;
        if (!p.ear && hash(p.col * 71 + p.row) < (step / 100) * 0.18) continue;
        c.rect(
          Math.round((p.col + 0.5) * cell - size / 2),
          Math.round((p.row + EAR_ROWS + 0.5) * cell - size / 2),
          Math.ceil(size),
          Math.ceil(size),
        );
      }
      c.fill();
    }
    face = { canvas, white: null, form, step, cell, dpr };
    faces.set(index, face);
    return face;
  }
  function silhouette(face: Face) {
    if (!face.white) {
      const white = document.createElement("canvas");
      white.width = face.canvas.width;
      white.height = face.canvas.height;
      const c = white.getContext("2d")!;
      c.drawImage(face.canvas, 0, 0);
      c.globalCompositeOperation = "source-in";
      c.fillStyle = "#f4f7e6";
      c.fillRect(0, 0, white.width, white.height);
      face.white = white;
    }
    return face.white;
  }
  function drawBaked(
    source: HTMLCanvasElement,
    face: Face,
    b: ReturnType<typeof portraitBox>,
  ) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      source,
      Math.round(b.cx - 31 * face.cell),
      Math.round(b.cy - (35 + EAR_ROWS) * face.cell),
      source.width / face.dpr,
      source.height / face.dpr,
    );
    ctx.imageSmoothingEnabled = true;
  }
  function face(s: World, idle = false) {
    if (
      !idle &&
      s.phase !== "boss-intro" &&
      s.phase !== "fight" &&
      s.phase !== "transform" &&
      s.phase !== "dying"
    )
      return;
    const index = idle ? 0 : s.sector - 1,
      image = images[index];
    if (!image?.complete || !image.naturalWidth) return;
    const b = portraitBox(s, idle),
      form = idle ? 1 : bossTheme(s),
      color = idle ? "#b4cba4" : themeColor(s);
    const transforming = s.phase === "transform" && !idle;
    const dying = s.phase === "dying" && !idle;
    const t = transforming ? clamp01((s.phaseTime - 0.85) / 1.35) : 1;
    const reveal = transforming ? clamp01((s.phaseTime - 0.65) / 1.2) : 1;
    const pixels = pixelsFor(index, form);
    if (!pixels) return;
    ctx.save();
    const enter =
      !idle && s.phase === "boss-intro" ? clamp01(s.phaseTime / 1.2) : 1;
    ctx.globalAlpha = enter;
    const strength = form === 3 ? 1 : 0;
    old.arena(s.width, s.height, s.time, b, strength, reduced);
    const halo = b.height * 0.6;
    ctx.strokeStyle = color + (form === 2 ? "55" : "33");
    ctx.lineWidth = 1;
    for (const scale of HALOS) {
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
    ctx.strokeStyle = color + "33";
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU + (reduced ? 0 : s.time * 0.04),
        r = halo * 1.13,
        tick = i % 3 ? 3 : 9;
      ctx.moveTo(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r);
      ctx.lineTo(b.cx + Math.cos(a) * (r + tick), b.cy + Math.sin(a) * (r + tick));
    }
    ctx.stroke();
    const damage = idle || transforming ? 0 : 1 - s.boss.hp / bossMaxHp(s);
    if (!transforming && !dying) {
      const baked = settledFace(index, form, damage, b.cell, pixels);
      drawBaked(baked.canvas, baked, b);
      // A throttled damage flash re-lights the portrait's own shape.
      const flash = idle ? 0 : 1 - (s.time - bossHit) / 0.09;
      if (flash > 0 && s.phase === "fight") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = enter * flash * 0.32;
        drawBaked(baked.canvas, baked, b);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = enter;
      }
    } else {
      const fade = form === 3 && index === 0 ? t : form === 3 ? 1 : 0;
      const palette = inksFor(index, fade);
      for (let ink = 0; ink < palette.length; ink++) {
        ctx.fillStyle = palette[ink];
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
          const death = dying && !reduced ? s.phaseTime : 0;
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
    }
    if (form === 3 && index === 0) old.eyes(b, transforming ? t : 1);
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
      ctx.fillStyle = "#ffd4eb";
      for (let i = 0; i < (reduced ? 8 : transforming ? 60 : 8); i++) {
        const a = hash(i + 7) * TAU + (reduced ? 0 : s.time * 0.3),
          r = b.height * (0.4 + hash(i + 9) * 0.5);
        const x = b.cx + Math.cos(a) * r,
          y = b.cy + Math.sin(a) * r * 0.83,
          size = (2 + hash(i + 12) * 5) * Math.max(0.3, envelope);
        ctx.globalAlpha = enter * envelope;
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
    boost = 0,
  ) {
    const color = SHIPS[id].color,
      flame = boost > 0 ? "#ffe3a8" : color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.scale(size, size);
    local(x, y, bank, size);
    const flicker = reduced ? 0 : Math.sin(t * 61) * 3;
    const reach = 1 + boost * 0.65;
    for (const ex of ENGINES[id]) {
      glowAt(ex, 24 + boost * 6, 30 + boost * 14, flame, 0.75);
      ellipse(ex, 25 + flicker + boost * 7, id === 1 ? 5 : 3, (16 + flicker) * reach, flame + "85");
      ellipse(ex, 20, 1.8, (10 + flicker) * reach, "#efffff");
    }
    if (!hullShade[id]) {
      const gradient = ctx.createLinearGradient(-26, -30, 25, 24);
      gradient.addColorStop(0, "#d8e4bb");
      gradient.addColorStop(0.35, "#4c6c5c");
      gradient.addColorStop(0.52, "#a1bb8a");
      gradient.addColorStop(0.6, "#284a3a");
      gradient.addColorStop(1, "#142e25");
      hullShade[id] = gradient;
    }
    ctx.fillStyle = hullShade[id];
    ctx.strokeStyle = "#d6e7bd80";
    ctx.lineWidth = 0.7;
    ctx.fill(hulls[id]);
    ctx.stroke(hulls[id]);
    for (const side of SIDES) {
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
    // Overdrive reinforces the hull edge in gold rather than adding more objects.
    if (boost > 0) {
      ctx.globalAlpha *= 0.4 + boost * 0.5;
      ctx.strokeStyle = "#ffe3a8";
      ctx.lineWidth = 1.3;
      ctx.stroke(hulls[id]);
      glowAt(0, 0, 46, "#ffe3a8", 0.35 * boost);
    }
    ctx.restore();
  }
  // Afterimages: the hull outline alone, lit additively along the real dash path.
  function afterimages(s: World) {
    if (reduced || !trailCount) return;
    const since = s.time - dashEnd,
      dashing = s.player.dashTime > 0;
    if (!dashing && since > 0.26) return;
    const fade = dashing ? 1 : 1 - since / 0.26,
      color = SHIPS[s.ship].color;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4 * fade;
    ctx.globalAlpha = 0.55 * fade;
    ctx.beginPath();
    ctx.moveTo(dashFromX, dashFromY);
    ctx.lineTo(s.player.x, s.player.y);
    ctx.stroke();
    glowLine(dashFromX, dashFromY, s.player.x, s.player.y, 16, color, 0.5 * fade);
    ctx.fillStyle = color;
    const size = Math.min(1, s.width / 430 + 0.1);
    for (let i = 0; i < trailCount - 1; i++) {
      ctx.globalAlpha = fade * (0.08 + (0.28 * (i + 1)) / trailCount);
      ctx.save();
      ctx.translate(trailX[i], trailY[i]);
      ctx.rotate(s.player.bank);
      ctx.scale(size, size);
      ctx.fill(hulls[s.ship]);
      ctx.restore();
    }
    ctx.restore();
  }
  // The only part of the ship that can be hit, drawn at its true 5 px radius.
  function hitbox(s: World) {
    const { x, y, focused } = s.player,
      color = SHIPS[s.ship].color;
    ctx.save();
    ctx.globalAlpha = focused ? 0.9 : 0.55;
    ellipse(x, y, 5, 5, "#04100c");
    ctx.globalAlpha = focused ? 1 : 0.75;
    ctx.strokeStyle = focused ? "#f4fff4" : color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 1, y - 1, 2, 2);
    if (focused) {
      const turn = reduced ? 0 : s.time * 1.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = turn + (i * TAU) / 4;
        ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
        ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, 23, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  function flashOf(e: Enemy, s: World) {
    const t = tracks.get(e);
    return t ? clamp01(1 - (s.time - t.hit) / 0.085) : 0;
  }
  function muzzleOf(e: Enemy, s: World) {
    const t = tracks.get(e);
    return t && t.fired >= 0 ? Math.max(0, 0.14 - (s.time - t.fired)) : 0;
  }
  function person(e: Enemy, s: World) {
    const musk = e.kind === "musk",
      time = s.time,
      scale = 1.15;
    const angle =
      musk && e.state === 2
        ? Math.sin(time * 40) * 0.1
        : Math.sin(e.age * 3) * 0.04;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    local(e.x, e.y, angle, scale);
    // A soft underglow separates the figure from the field; it sits behind the body.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= 0.22;
    ctx.drawImage(sprite(musk ? "#73ddff" : "#ff698f"), -35, -18, 70, 70);
    ctx.restore();
    // Small hand-painted caricatures: a quiff and X suit / silver hair and eye emitters.
    const gait = Math.sin(time * (musk ? 19 : 5)) * (musk ? 5 : 1);
    ctx.fillStyle = "#0a1221";
    ctx.fillRect(-11, 8, 22, 19);
    ctx.strokeStyle = musk ? "#83a3bf" : "#a0aec0";
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, 8, 22, 19);
    for (const side of SIDES) {
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
    } else
      for (const ex of [-7, 7]) {
        glowAt(ex, -5, 15, "#ff406d", 0.9);
        ellipse(ex, -5, 2, 1.5, "#fff0f6");
      }
    const hit = flashOf(e, s);
    if (hit > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = hit * 0.6;
      ellipse(0, 2, 19, 27, "#e8f7ff");
    }
    ctx.restore();
  }
  // The Musk rush commits to a marked destination; the corridor is its true contact width.
  function rushMark(e: Enemy) {
    if (e.kind !== "musk" || (e.state !== 1 && e.state !== 2)) return;
    const windup = e.state === 1 ? clamp01(1 - e.fire / 0.72) : 1;
    const dx = e.targetX - e.x,
      dy = e.targetY - e.y,
      d = Math.hypot(dx, dy) || 1,
      nx = -dy / d,
      ny = dx / d,
      half = 26;
    ctx.save();
    ctx.globalAlpha = 0.04 + 0.08 * windup;
    ctx.fillStyle = "#ffb98a";
    ctx.beginPath();
    ctx.moveTo(e.x + nx * half, e.y + ny * half);
    ctx.lineTo(e.targetX + nx * half, e.targetY + ny * half);
    ctx.lineTo(e.targetX - nx * half, e.targetY - ny * half);
    ctx.lineTo(e.x - nx * half, e.y - ny * half);
    ctx.fill();
    ctx.globalAlpha = 0.3 + 0.5 * windup;
    ctx.strokeStyle = "#ffc092";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(e.x + nx * half, e.y + ny * half);
    ctx.lineTo(e.targetX + nx * half, e.targetY + ny * half);
    ctx.moveTo(e.x - nx * half, e.y - ny * half);
    ctx.lineTo(e.targetX - nx * half, e.targetY - ny * half);
    ctx.stroke();
    // Corner brackets close on the destination as the rush winds up.
    const r = 40 - 12 * easeOut(windup),
      arm = 9;
    ctx.globalAlpha = 0.55 + 0.45 * windup;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const sx of SIDES)
      for (const sy of SIDES) {
        const cx = e.targetX + sx * r,
          cy = e.targetY + sy * r;
        ctx.moveTo(cx - sx * arm, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy - sy * arm);
      }
    ctx.moveTo(e.targetX - 4, e.targetY);
    ctx.lineTo(e.targetX + 4, e.targetY);
    ctx.moveTo(e.targetX, e.targetY - 4);
    ctx.lineTo(e.targetX, e.targetY + 4);
    ctx.stroke();
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
    glow(e.x, e.y, h * 0.8, color, 0.16);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniSprites.get(key)!, e.x - w / 2, e.y - h / 2, w, h);
    const hit = flashOf(e, s);
    if (hit > 0) {
      const base = ctx.globalAlpha;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = base * hit * 0.7;
      ctx.drawImage(miniSprites.get(key)!, e.x - w / 2, e.y - h / 2, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = base;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = color + "77";
    ctx.lineWidth = 0.7;
    ctx.setLineDash(clone ? DASH_CLONE : SOLID);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, w * 0.65, h * 0.59, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash(SOLID);
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
      for (const side of SIDES) {
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
  // Area warnings: a true-radius ring and a countdown arc that closes at detonation.
  function hazards(s: World) {
    const color = themeColor(s);
    for (const z of s.zones) {
      const live = z.age >= z.warning,
        progress = clamp01(z.age / z.warning);
      ctx.save();
      if (live) {
        const spent = clamp01((z.age - z.warning) / z.duration);
        ctx.globalAlpha = 0.55 - spent * 0.25;
        ellipse(z.x, z.y, z.radius, z.radius, "#ed927b");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#ffe0bd";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, TAU);
        ctx.stroke();
        glow(z.x, z.y, z.radius * 1.5, "#ed927b", 0.5 * (1 - spent));
      } else {
        const armed = z.warning - z.age < 0.18;
        ctx.globalAlpha = 0.07 + progress * 0.16;
        ellipse(z.x, z.y, z.radius, z.radius, color);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = armed ? "#ffe0bd" : color;
        ctx.lineWidth = armed ? 3 : 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (1 - progress * 0.75), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = live ? 1 : 0.85;
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
        ctx.strokeStyle = "#f3d2b5";
        ctx.lineWidth = 1;
        ctx.strokeRect(-9, -9, 18, 18);
        line(-6, 0, 6, 0, "#f3d2b5", 1);
      }
      ctx.restore();
    }
    for (const wave of s.shockwaves) {
      const gap = waveGap(wave),
        half = wave.gapWidth / 2,
        live = wave.age >= wave.warning,
        r = live ? wave.radius : 22 + (wave.age / wave.warning) * 25,
        reach = Math.hypot(s.width, s.height);
      ctx.save();
      // The opening is the answer: shade it before and while the howl travels.
      ctx.globalAlpha = live ? 0.06 : 0.04 + 0.06 * (wave.age / wave.warning);
      ctx.fillStyle = "#b4e3cf";
      ctx.beginPath();
      ctx.moveTo(wave.x, wave.y);
      ctx.arc(wave.x, wave.y, reach, gap - half, gap + half);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      if (live) {
        // The band's thickness is its true collision depth around the hitbox.
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, r, gap + half, gap + TAU - half);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, r + 4, gap + half, gap + TAU - half);
        ctx.stroke();
        light.globalAlpha = Math.min(1, 0.35 * gain);
        light.strokeStyle = color;
        light.lineWidth = 14;
        light.beginPath();
        light.arc(wave.x, wave.y, r, gap + half, gap + TAU - half);
        light.stroke();
      } else {
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_WAVE);
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, r, gap + half, gap + TAU - half);
        ctx.stroke();
        ctx.setLineDash(SOLID);
      }
      ctx.globalAlpha = 0.85;
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
        if (!live)
          line(wave.x, wave.y, wave.x + Math.cos(a) * reach, wave.y + Math.sin(a) * reach, "#b4e3cf2e", 1);
      }
      ctx.restore();
    }
    if (s.lunge && !s.lunge.returning) {
      const l = s.lunge,
        live = l.age >= l.warning,
        charge = clamp01(l.age / l.warning),
        half = bossRadius(s) * 0.62 - 5;
      const dx = l.tx - l.x,
        dy = l.ty - l.y,
        d = Math.hypot(dx, dy) || 1,
        nx = -dy / d,
        ny = dx / d;
      ctx.save();
      ctx.fillStyle = "#e8c597";
      ctx.globalAlpha = live ? 0.2 : 0.07;
      ctx.beginPath();
      ctx.moveTo(l.x + nx * half, l.y + ny * half);
      ctx.lineTo(l.tx + nx * half, l.ty + ny * half);
      ctx.lineTo(l.tx - nx * half, l.ty - ny * half);
      ctx.lineTo(l.x - nx * half, l.y - ny * half);
      ctx.fill();
      // The fill charges toward the target, so the pounce's timing is readable too.
      if (!live) {
        const cx = l.x + dx * charge,
          cy = l.y + dy * charge;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(l.x + nx * half, l.y + ny * half);
        ctx.lineTo(cx + nx * half, cy + ny * half);
        ctx.lineTo(cx - nx * half, cy - ny * half);
        ctx.lineTo(l.x - nx * half, l.y - ny * half);
        ctx.fill();
      }
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#f3d5a5";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l.x + nx * half, l.y + ny * half);
      ctx.lineTo(l.tx + nx * half, l.ty + ny * half);
      ctx.moveTo(l.x - nx * half, l.y - ny * half);
      ctx.lineTo(l.tx - nx * half, l.ty - ny * half);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(l.tx, l.ty, half, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
  function previews(s: World) {
    if (!s.attack) return;
    ctx.save();
    ctx.setLineDash(DASH_PREVIEW);
    ctx.strokeStyle = themeColor(s);
    ctx.lineWidth = 1;
    for (const event of s.attack.events) {
      if (
        event.type !== "volley" ||
        event.at < s.attack.age ||
        event.at - s.attack.age > 0.85
      )
        continue;
      ctx.globalAlpha = 0.25 + 0.5 * (1 - (event.at - s.attack.age) / 0.85);
      ctx.beginPath();
      for (const a of event.shots) {
        const v = Math.hypot(a.vx, a.vy) || 1;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (a.vx / v) * 75, a.y + (a.vy / v) * 75);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Enemy fire is coral everywhere except Guan's hearts; bones and prisms keep their own.
  function shotColor(s: World, kind: Bullet["kind"]) {
    if (kind === "prism") return "#cea3ff";
    if (kind === "bone") return "#ffd99a";
    return s.sector === 1 && bossStage(s) === 2 ? "#ff9fd0" : "#ff8a6e";
  }
  // Player fire stays cool and translucent so it never competes with danger.
  function friendly(b: Bullet, s: World) {
    const color = s.overdrive > 0 ? "#ffe3a8" : SHIPS[b.ship ?? s.ship].color;
    const angle = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    local(b.x, b.y, angle, 1);
    if (b.kind === "ion" || b.kind === "rail") {
      const rail = b.kind === "rail";
      glowAt(0, 6, rail ? 22 : 12, color, rail ? 0.7 : 0.5);
      ctx.globalAlpha = 0.3;
      line(0, -6, 0, rail ? 64 : 26, color, rail ? 5 : 3);
      ctx.globalAlpha = 0.95;
      line(0, -10, 0, rail ? 34 : 12, color, rail ? 2.5 : 1.6);
      line(0, -10, 0, -2, "#f7ffff", 1);
    } else if (b.kind === "plasma") {
      glowAt(0, 0, 18, "#ffbe64", 0.6);
      ctx.globalAlpha = 0.85;
      ellipse(0, 0, 4, 8, s.overdrive > 0 ? "#ffe3a8" : "#ffb867");
      ellipse(0, -2, 1.6, 4, "#fff6d9");
      ctx.globalAlpha = 0.4;
      line(0, 6, 0, 22, "#ffc96f", 2.5);
    } else {
      glowAt(0, 9, 20, "#ffb560", 0.7);
      ctx.globalAlpha = 0.6;
      line(0, 5, 0, 28, "#ffb560", 4);
      ctx.globalAlpha = 1;
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
    }
    ctx.restore();
  }
  // Enemy fire: a hot core, a saturated body at the collision radius, and a dark keyline.
  function hostile(s: World) {
    const orb = shotColor(s, "orb");
    // Orbs are batched: keylines, bodies, cores, each one path.
    ctx.fillStyle = KEYLINE;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    for (const b of s.bullets) {
      if (b.friendly || b.kind !== "orb") continue;
      ctx.moveTo(b.x + b.radius + 1.7, b.y);
      ctx.arc(b.x, b.y, b.radius + 1.7, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = orb;
    ctx.beginPath();
    for (const b of s.bullets) {
      if (b.friendly || b.kind !== "orb") continue;
      ctx.moveTo(b.x + b.radius, b.y);
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      glow(b.x, b.y, b.radius * 3.6, orb, 0.75);
    }
    ctx.fill();
    ctx.fillStyle = "#fff7f0";
    ctx.beginPath();
    for (const b of s.bullets) {
      if (b.friendly || b.kind !== "orb") continue;
      ctx.moveTo(b.x + b.radius * 0.45, b.y);
      ctx.arc(b.x, b.y, b.radius * 0.45, 0, TAU);
    }
    ctx.fill();
    // Prisms are diamonds whose half-width is their collision radius.
    for (let pass = 0; pass < 3; pass++) {
      ctx.fillStyle = pass === 0 ? KEYLINE : pass === 1 ? "#cea3ff" : "#fbefff";
      ctx.beginPath();
      for (const b of s.bullets) {
        if (b.friendly || b.kind !== "prism") continue;
        const r =
            b.radius * (pass === 0 ? 1 : pass === 1 ? 0.9 : 0.36) +
            (pass === 0 ? 1.7 : 0),
          a = b.age,
          c = Math.cos(a),
          sn = Math.sin(a),
          tall = r * 1.5;
        ctx.moveTo(b.x - sn * tall, b.y + c * tall);
        ctx.lineTo(b.x + c * r, b.y + sn * r);
        ctx.lineTo(b.x + sn * tall, b.y - c * tall);
        ctx.lineTo(b.x - c * r, b.y - sn * r);
        ctx.closePath();
        if (pass === 1) glow(b.x, b.y, 17, "#cf8fff", 0.6);
      }
      ctx.fill();
    }
    for (const b of s.bullets) {
      if (b.friendly || b.kind !== "bone") continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      glow(b.x, b.y, 18, "#ffcb7f", 0.55);
      if (b.motion === "return" && b.age > (b.returnAt ?? 1.35)) {
        ctx.strokeStyle = "#ffd99a";
        ctx.lineWidth = 1;
        ctx.setLineDash(DASH_RETURN);
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.stroke();
        ctx.setLineDash(SOLID);
      }
      ctx.rotate(b.age * 2);
      ctx.lineCap = "round";
      line(-5, 0, 5, 0, KEYLINE, 7.5);
      for (const x of [-6, 6])
        for (const y of [-2, 2]) ellipse(x, y, 4.3, 4.3, KEYLINE);
      line(-5, 0, 5, 0, "#fff1c6", 4);
      for (const x of [-6, 6])
        for (const y of [-2, 2]) ellipse(x, y, 2.8, 2.8, "#fff1c6");
      ellipse(0, 0, 1.6, 1.6, "#ffb35c");
      ctx.restore();
    }
  }
  // Beams: the lock line draws in, the true band edge appears before firing, and a
  // live beam's solid core is exactly as wide as what can hit you.
  function lasers(s: World) {
    for (const b of s.lasers) {
      const end = beamEnd(b, s.height * 2.5);
      const live = b.age >= b.warning;
      ctx.save();
      if (!live) {
        const p = clamp01(b.age / b.warning),
          reach = reduced ? 1 : easeOut(b.age / 0.16);
        const dx = end.x - b.x,
          dy = end.y - b.y,
          d = Math.hypot(dx, dy) || 1,
          nx = -dy / d,
          ny = dx / d;
        if (b.sweep) {
          const a = Math.atan2(b.ty - b.y, b.tx - b.x);
          ctx.globalAlpha = 0.05 + 0.05 * p;
          ctx.fillStyle = "#ff819b";
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.arc(b.x, b.y, s.height * 2.5, Math.min(a, a + b.sweep), Math.max(a, a + b.sweep));
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 0.35 + 0.5 * p;
        line(b.x, b.y, b.x + dx * reach, b.y + dy * reach, "#ff9ab0", 1);
        if (p > 0.6) {
          ctx.globalAlpha = (p - 0.6) / 0.4;
          const w = b.width;
          ctx.strokeStyle = "#ffc3cf";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(b.x + nx * w, b.y + ny * w);
          ctx.lineTo(end.x + nx * w, end.y + ny * w);
          ctx.moveTo(b.x - nx * w, b.y - ny * w);
          ctx.lineTo(end.x - nx * w, end.y - ny * w);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glow(b.x, b.y, 10 + p * 18, "#ff5f8e", 0.8);
        ctx.strokeStyle = "#ffc3cf";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4 + (1 - p) * 14, 0, TAU);
        ctx.stroke();
      } else {
        glowLine(b.x, b.y, end.x, end.y, b.width * 8, "#fa477b", 0.55);
        line(b.x, b.y, end.x, end.y, "#ff5c90", b.width * 2);
        line(b.x, b.y, end.x, end.y, "#ffe4f0", b.width * 0.9);
        line(b.x, b.y, end.x, end.y, "#ffffff", 1);
        glow(b.x, b.y, 40, "#ff5f8e", 0.9);
      }
      ctx.restore();
    }
  }
  function drops(s: World) {
    for (const d of s.drops) {
      const repair = d.kind === "repair",
        color = repair ? "#9effc1" : "#ffe3a8",
        bob = reduced ? 0 : Math.sin(d.age * 5) * 1.5;
      glow(d.x, d.y, 24, color, 0.7);
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#0b1a14d0";
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.restore();
      if (repair) {
        line(d.x - 4, d.y + bob, d.x + 4, d.y + bob, "#effff4", 2);
        line(d.x, d.y + bob - 4, d.x, d.y + bob + 4, "#effff4", 2);
      } else {
        ctx.fillStyle = "#fff6d8";
        path([
          [d.x + 1, d.y + bob - 6],
          [d.x - 3, d.y + bob + 1],
          [d.x, d.y + bob + 1],
          [d.x - 1, d.y + bob + 6],
          [d.x + 3, d.y + bob - 1],
          [d.x, d.y + bob - 1],
        ]);
        ctx.fill();
      }
    }
  }
  function arcs(s: World) {
    const time = reduced ? 0 : s.time,
      color = SHIPS[s.ship].color;
    for (const a of s.arcs) {
      const alpha = 1 - a.age / 0.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      const jolt = Math.floor(time * 30);
      for (let pass = 0; pass < 3; pass++) {
        ctx.strokeStyle = pass === 0 ? color + "24" : pass === 1 ? color : "#ffffff";
        ctx.lineWidth = pass === 0 ? 10 : pass === 1 ? 3 : 1;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const t = i / 11,
            jitter =
              i && i < 11
                ? (hash(i + a.seed + jolt) * 2 - 1) * (a.rail ? 3 : 18)
                : 0;
          const x = a.x + (a.tx - a.x) * t + jitter,
            y = a.y + (a.ty - a.y) * t + jitter * 0.5;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      glowLine(a.x, a.y, a.tx, a.ty, 12, color, 0.6 * alpha);
      if (a.tx !== a.x || a.ty !== a.y) glow(a.tx, a.ty, 25, color, alpha);
      ctx.restore();
    }
  }
  // The EMP: a bright leading edge, a trailing band, and ticks riding the ring.
  function pulse(s: World) {
    if (!s.pulse) return;
    const p = s.pulse,
      t = p.age / 0.65,
      r = Math.min(s.width * 0.42, 210) * Math.min(1, p.age / 0.4),
      color = SHIPS[s.ship].color,
      fade = 1 - t;
    ctx.save();
    ctx.globalAlpha = fade * 0.14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, r - 10), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = "#f2fff8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + (reduced ? 0 : p.age * 1.5),
        length = 5 + hash(i + 7) * 12;
      ctx.moveTo(p.x + Math.cos(a) * (r - length), p.y + Math.sin(a) * (r - length));
      ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    }
    ctx.stroke();
    glowRing(p.x, p.y, r, 16, color, 0.6 * fade);
    if (p.age < 0.1 && !reduced) glow(p.x, p.y, 60, "#f2fff8", 1 - p.age / 0.1);
    ctx.restore();
  }
  function bursts(s: World) {
    for (const b of s.bursts) {
      if (b.text) {
        callout(b.text, b.x, b.y, b.age, b.power, b.color);
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
      const count = reduced ? 4 : Math.ceil(b.power * 10);
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
  // World-space callouts. A strong one (overdrive) is stamped; small ones float.
  function callout(
    text: string,
    x: number,
    y: number,
    age: number,
    power: number,
    color: string,
  ) {
    ctx.save();
    if (power >= 1.5) {
      const life = 1.8,
        settle = reduced ? 1 : easeOut(age / 0.2),
        scale = reduced ? 1 : 1.45 - 0.45 * settle;
      ctx.globalAlpha = Math.min(clamp01(age * 10), clamp01((life - age) / 0.5));
      ctx.translate(x, y - 8 - age * 10);
      ctx.scale(scale, scale);
      type(text, 0, 1.5, 22, KEYLINE, DOTS, 900, 3);
      type(text, 0, 0, 22, color, DOTS, 900, 3);
      glow(x, y - 14 - age * 10, 60, "#ffe3a8", 0.4);
    } else {
      ctx.globalAlpha = clamp01((1.8 - age) / 0.6);
      type(text, x, y - age * 23, 11, color, MONO, 500, 1);
    }
    ctx.restore();
  }
  // Title cards: kicker, dot-matrix heading and one line, wiped in like a scan.
  function card(s: World) {
    const sector = SECTORS[s.sector - 1];
    let kicker = "",
      heading = "",
      sub = "",
      age = s.phaseTime,
      life = 0,
      y = s.height * 0.45,
      tone = themeColor(s);
    if (s.phase === "intro") {
      kicker = sector.place.toUpperCase();
      heading = `LEVEL 0${s.sector}`;
      sub = sector.briefing;
      life = 2.4;
    } else if (s.phase === "boss-intro") {
      kicker = "WARNING";
      heading = sector.boss;
      sub = sector.subtitle;
      life = 3;
      y = s.height * 0.6;
      tone = "#ff8a6e";
    } else if (s.phase === "sector-clear") {
      kicker = `LEVEL 0${s.sector}`;
      heading = "CLEAR";
      sub = s.player.hull < BALANCE.hull ? "Hull repaired +1" : "";
      life = 4;
    } else if (s.phase === "transform") {
      kicker = `PHASE ${ROMAN[bossStage(s) - 1]}`;
      heading = stageTitle(s);
      life = transformSeconds(s);
      if (s.sector === 1) {
        // Guan's change is its own spectacle; the card arrives once it reads.
        age -= 1;
        life -= 1;
        y = s.height * 0.66;
      }
    }
    if (!heading || age < 0) return;
    const alpha = Math.min(clamp01(age * 4), clamp01((life - age) * 3));
    if (alpha <= 0) return;
    const wipe = reduced ? 1 : easeOut(age / 0.42);
    const size = Math.min(s.width / (heading.length * 0.68), s.height * 0.08, 56);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#060f0dcc";
    ctx.fillRect(0, y - size - 34, s.width, size + (sub ? 78 : 58));
    const ruleHalf = (s.width * 0.32) * wipe;
    ctx.globalAlpha = alpha * 0.7;
    line(s.width / 2 - ruleHalf, y - size - 34, s.width / 2 + ruleHalf, y - size - 34, tone, 1);
    line(s.width / 2 - ruleHalf, y + (sub ? 44 : 24), s.width / 2 + ruleHalf, y + (sub ? 44 : 24), tone + "66", 1);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(s.width / 2 - (s.width / 2) * wipe, y - size - 40, s.width * wipe, size + 100);
    ctx.clip();
    type(kicker, s.width / 2, y - size - 12, 10, tone, MONO, 500, 3);
    type(heading, s.width / 2, y, size, "#e2ecc4", DOTS, 900, Math.round(size * 0.1));
    if (sub) type(sub, s.width / 2, y + 26, 11, "#a9c2a2", MONO, 400, 0.4);
    ctx.restore();
  }
  // Boss entrances and stage breaks frame the field like a cut scene.
  function letterbox(s: World) {
    let open = 0;
    if (s.phase === "transform") {
      const life = transformSeconds(s);
      open = Math.min(easeOut(s.phaseTime / 0.4), easeOut((life - s.phaseTime) / 0.4));
    } else if (s.phase === "boss-intro")
      open = Math.min(easeOut(s.phaseTime / 0.5), easeOut((3 - s.phaseTime) / 0.45));
    if (open <= 0) return;
    const bar = Math.min(58, s.height * 0.085);
    ctx.save();
    ctx.fillStyle = "#030706";
    if (reduced) {
      ctx.globalAlpha = open;
      ctx.fillRect(0, 0, s.width, bar);
      ctx.fillRect(0, s.height - bar, s.width, bar);
    } else {
      ctx.fillRect(0, -bar + bar * open, s.width, bar);
      ctx.fillRect(0, s.height - bar * open, s.width, bar);
    }
    ctx.restore();
  }
  // One frame of black, the broken form in white, and speed lines: then the cut back.
  function impact(s: World, now: number) {
    const t = (now - impactAt) / impactLength;
    if (reduced || t < 0 || t >= 1) return;
    const b = portraitBox(s),
      baked = faces.get(s.sector - 1);
    ctx.save();
    ctx.globalAlpha = 0.86 * (1 - t * t);
    ctx.fillStyle = "#040806";
    ctx.fillRect(0, 0, s.width, s.height);
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = "#e2ecc4";
    ctx.beginPath();
    const reach = Math.hypot(s.width, s.height);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU + hash(i) * 0.12,
        from = b.height * (0.62 + hash(i + 40) * 0.5);
      ctx.moveTo(b.cx + Math.cos(a) * from, b.cy + Math.sin(a) * from);
      ctx.lineTo(b.cx + Math.cos(a) * reach, b.cy + Math.sin(a) * reach);
    }
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (baked) drawBaked(silhouette(baked), baked, b);
    ctx.restore();
  }
  // A hit reddens the edges of the tube, leaving the middle of the field readable.
  let edge: CanvasGradient | null = null,
    edgeW = 0,
    edgeH = 0;
  function hurt(s: World) {
    const strength = clamp01(s.flash / 0.2);
    if (strength <= 0 || reduced) return;
    if (!edge || edgeW !== s.width || edgeH !== s.height) {
      const r = Math.hypot(s.width, s.height) / 2;
      edge = ctx.createRadialGradient(s.width / 2, s.height / 2, r * 0.5, s.width / 2, s.height / 2, r);
      edge.addColorStop(0, "#ff5a6a00");
      edge.addColorStop(1, "#ff5a6a");
      edgeW = s.width;
      edgeH = s.height;
    }
    ctx.save();
    ctx.globalAlpha = strength * 0.4;
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, s.width, s.height);
    ctx.restore();
  }
  function render(s: World) {
    const now = performance.now();
    const wall = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const dt = s.time >= lastTime ? Math.min(0.05, s.time - lastTime) : 0;
    observe(s, now);
    lastTime = s.time;
    stepParticles(dt);

    const width = ctx.canvas.width,
      height = ctx.canvas.height,
      sx = width / s.width,
      sy = height / s.height;
    dpr = sx;
    let ox = 0,
      oy = 0;
    if (!reduced) {
      const kick = kickPower * Math.max(0, 1 - (now - kickAt) / 380);
      const shake = s.shake + kick * kick * 0.06;
      if (shake > 0.3) {
        ox = Math.sin(s.time * 137 + now * 0.05 * (kick > 0 ? 1 : 0)) * shake;
        oy = Math.cos(s.time * 113 + now * 0.043 * (kick > 0 ? 1 : 0)) * shake * 0.65;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    const lw = Math.max(1, Math.round(s.width * Math.min(0.5, 640 / Math.max(1, s.width)))),
      lh = Math.max(1, Math.round((lw * s.height) / s.width));
    if (bloom.width !== lw || bloom.height !== lh) {
      bloom.width = lw;
      bloom.height = lh;
    }
    light.setTransform(1, 0, 0, 1, 0, 0);
    const keep = reduced ? 0 : Math.exp(-wall / 0.034);
    if (keep < 0.02) {
      light.clearRect(0, 0, lw, lh);
      gain = 1;
    } else {
      light.globalCompositeOperation = "destination-out";
      light.globalAlpha = 1 - keep;
      light.fillStyle = "#000";
      light.fillRect(0, 0, lw, lh);
      gain = 1 - keep;
    }
    light.globalCompositeOperation = "lighter";
    light.setTransform(lw / s.width, 0, 0, lh / s.height, (ox * lw) / s.width, (oy * lh) / s.height);

    const flying =
      s.phase !== "win" && s.phase !== "lose" && s.phase !== "dying";
    environment(s);
    if (s.phase === "ready" || s.phase === "loading" || s.phase === "error") {
      face(s, true);
    } else {
      previews(s);
      hazards(s);
      if (bossGuard(s) < 1) {
        ctx.save();
        ctx.setLineDash(DASH_LINK);
        ctx.globalAlpha = 0.6;
        for (const e of s.enemies)
          if (e.kind === "clone" && e.hp > 0)
            line(e.x, e.y, s.boss.x, s.boss.y, "#ed927b55", 1);
        ctx.restore();
      }
      face(s);
      for (const e of s.enemies) {
        if (e.defeated) continue;
        if (e.kind === "cat" || e.kind === "clone") miniature(e, s);
        else if (e.kind === "musk" || e.kind === "thiel") {
          rushMark(e);
          person(e, s);
        } else {
          drone.kind = e.kind;
          drone.x = e.x;
          drone.y = e.y;
          drone.age = e.age;
          drone.shotAt = e.fire;
          drone.flash = muzzleOf(e, s);
          old.enemy(drone, reduced, 0.48, flashOf(e, s));
        }
        if (e.hp < e.maxHp) {
          const top = e.kind === "clone" ? -51 : -37;
          ctx.fillStyle = "#04100ccc";
          ctx.fillRect(e.x - 19, e.y + top - 1, 38, 4);
          ctx.fillStyle = themeColor(s);
          ctx.fillRect(e.x - 18, e.y + top, (36 * e.hp) / e.maxHp, 2);
        }
      }
      handSeal(s);
      drops(s);
      for (const b of s.bullets) if (b.friendly) friendly(b, s);
      bursts(s);
      drawParticles();
      arcs(s);
      pulse(s);
      if (flying) {
        afterimages(s);
        const p = s.player;
        ctx.save();
        // Blinking is reserved for hit recovery, and kept under three a second.
        if (
          s.time - hurtAt < BALANCE.hitRecovery &&
          Math.sin((s.time - hurtAt) * TAU * 2.8) > 0.2
        )
          ctx.globalAlpha = 0.42;
        ship(
          s.ship,
          p.x,
          p.y,
          p.bank,
          s.time,
          Math.min(1, s.width / 430 + 0.1),
          s.overdrive > 0 ? Math.min(1, s.overdrive / 0.6) : 0,
        );
        ctx.restore();
        if (p.invincible > 0 || p.dashTime > 0) {
          ctx.save();
          ctx.globalAlpha = p.dashTime > 0 ? 0.9 : 0.45;
          ctx.strokeStyle = SHIPS[s.ship].color;
          ctx.lineWidth = p.dashTime > 0 ? 1.6 : 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.dashTime > 0 ? 24 : 32, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      lasers(s);
      hostile(s);
      if (flying) hitbox(s);
    }
    // The light buffer is added over the frame, smoothed on the way up.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bloom, 0, 0, width, height);
    ctx.restore();
    letterbox(s);
    card(s);
    impact(s, now);
    hurt(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { render };
}
