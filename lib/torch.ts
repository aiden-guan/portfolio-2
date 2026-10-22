import { crackle, type Burner, ignite, unlockSound } from "@/lib/riffle";
import { ASH_EVENT, type Surface } from "@/lib/wear";

// The torch. With it in hand (the masthead's Torch, or T), pressing anywhere
// on the mat lights it: a jet of blue flame from the nozzle that lands where
// the pointer is and spreads out from there. On paper it browns, chars and
// burns through whatever's uppermost (the table, components/mat/table, does
// that to it), and the paper flares orange and smokes; through a hole it
// reaches what's beneath. On the bare mat it scorches the surface, which
// glows, smokes and darkens, and over a while heals like a cut does. Burnt
// edges smoulder on after the flame has moved, and a sheet burnt almost all
// away falls to ash. On a touch screen the mat is held for a moment before
// the torch lights, so a finger can still scroll it.
//
// The flame, smoke, sparks and ash are drawn over everything on the mat in a
// canvas fixed to the window; the scorches into one under everything that
// scrolls with the mat, the way the cuts' does.

type Lit = {
  id: number;
  touch: boolean;
  // the pointer, in client coordinates
  cx: number;
  cy: number;
  burner: Burner;
  // how far the torch leans into a sweep, and the sweep's speed (px/s)
  lean: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  at: number;
  // what the flame was last on, and where it landed last frame (mat px)
  on: "paper" | "mat";
  char: number;
  last: { x: number; y: number } | null;
};

type Pending = { id: number; x: number; y: number; timer: number };

// a scorch on the mat: where, how big, how much heat it took, how hot it
// still is, and when it was last heated
type Scorch = { x: number; y: number; r: number; dose: number; hot: number; at: number };

const Kind = { Lick: 0, Smoke: 1, Spark: 2, Ash: 3 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

type Particle = {
  kind: Kind;
  // in mat coordinates, and px/s
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  // which ramp of colours it burns through, and a little randomness of its own
  ramp: number;
  seed: number;
  spin: number;
};

// the torch's angle in the hand, and how far the nozzle stands off the
// flame's landing point (mm)
const ANGLE = (36 * Math.PI) / 180;
const LEAN = (8 * Math.PI) / 180;
const STANDOFF = 17;
const HOLD_TO_LIGHT = 260;
const MAX_PARTICLES = 900;
const MAX_SCORCHES = 240;
// a scorch starts to heal a while after the flame's left it, and is gone in
// about this long (s)
const SCORCH_REST = 3.5;
const SCORCH_HEAL = 22;

// colour ramps, hottest first: paper burning, the jet's blue, and the
// mat's plastic catching
const RAMPS = [
  ["#fff6dc", "#ffd47e", "#ffa444", "#ff6c1f", "#d63f17", "#7c200c"],
  ["#eef4ff", "#a8c6ff", "#6690ff", "#4258e6", "#3330b0", "#201a6a"],
  ["#9db4ff", "#6f8cff", "#6a62e0", "#a050c0", "#e8682e", "#7a240e"],
];
const SMOKE_DARK = "#2a2521";
const SMOKE_LIGHT = "#b9b4ac";

// A soft round dab of one colour, drawn once and stamped as often as needed.
function sprite(color: string, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + "c0");
  g.addColorStop(0.7, color + "38");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function mountTorch(mat: HTMLElement, surface: Surface) {
  const html = document.documentElement;
  const torch = mat.querySelector<HTMLElement>(".torch");
  const fire = mat.querySelector<HTMLCanvasElement>(".mat-fire");
  const scorchCanvas = mat.querySelector<HTMLCanvasElement>(".mat-scorch");
  const fx = fire?.getContext("2d");
  const sx = scorchCanvas?.getContext("2d");
  if (!torch || !fire || !scorchCanvas || !fx || !sx) return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sprites = RAMPS.map((ramp) => ramp.map((color) => sprite(color)));
  const smokeDark = sprite(SMOKE_DARK);
  const smokeLight = sprite(SMOKE_LIGHT);

  let lit: Lit | null = null;
  let pending: Pending | null = null;
  let raf = 0;
  let last = 0;
  let mm = 4;
  const particles: Particle[] = [];
  const scorches: Scorch[] = [];

  // the fire canvas covers the window
  let fireW = 0;
  let fireH = 0;
  let fireRatio = 1;
  let fireLive = false;

  // the scorch canvas covers the stretch of mat in the window, like the cuts'
  let scorchW = 0;
  let scorchH = 0;
  let scorchRatio = 1;
  let scorchTop = 0;
  let scorchLive = false;

  function measure() {
    // the torch is drawn 166 mm wide, which says how big a millimetre is
    mm = torch!.offsetWidth / 166 || 4;
  }

  function sizeFire() {
    const r = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (fireLive && w === fireW && h === fireH && r === fireRatio) return;
    fireW = w;
    fireH = h;
    fireRatio = r;
    fire!.width = Math.round(w * r);
    fire!.height = Math.round(h * r);
    fire!.dataset.live = "";
    fireLive = true;
  }

  function placeScorch(box: DOMRect) {
    const view = -box.top;
    const tall = window.innerHeight;
    const w = mat.clientWidth;
    const h = Math.ceil(tall * 1.6);
    const r = Math.min(2, window.devicePixelRatio || 1);
    const resized = !scorchLive || w !== scorchW || h !== scorchH || r !== scorchRatio;
    const away = view < scorchTop + 8 || view + tall > scorchTop + scorchH - 8;
    if (!resized && !away) return;
    if (resized) {
      scorchW = w;
      scorchH = h;
      scorchRatio = r;
      scorchCanvas!.width = Math.round(w * r);
      scorchCanvas!.height = Math.round(h * r);
      scorchCanvas!.style.width = `${w}px`;
      scorchCanvas!.style.height = `${h}px`;
      scorchCanvas!.dataset.live = "";
      scorchLive = true;
    }
    scorchTop = Math.round(view - tall * 0.3);
    scorchCanvas!.style.transform = `translate3d(0, ${scorchTop}px, 0)`;
  }

  function letGo() {
    if (fireLive) {
      fire!.width = 0;
      fire!.height = 0;
      delete fire!.dataset.live;
      fireLive = false;
    }
    if (scorchLive && !scorches.length) {
      scorchCanvas!.width = 0;
      scorchCanvas!.height = 0;
      delete scorchCanvas!.dataset.live;
      scorchLive = false;
    }
  }

  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function emit(p: Omit<Particle, "age" | "seed" | "spin"> & { spin?: number }) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ ...p, age: 0, seed: Math.random() * 100, spin: p.spin ?? 0 });
  }

  // ---- the flame

  function aim(l: Lit, box: DOMRect) {
    const target = { x: l.cx - box.left, y: l.cy - box.top };
    const angle = ANGLE + l.lean;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const nozzle = { x: target.x + ux * STANDOFF * mm, y: target.y + uy * STANDOFF * mm };
    return { target, nozzle, ux, uy, angle };
  }

  function burn(l: Lit, dt: number, box: DOMRect, now: number) {
    // the torch sways into a sweep, the way a hand leads with the wrist
    const speedX = (l.cx - l.px) / Math.max(dt, 1e-3);
    const speedY = (l.cy - l.py) / Math.max(dt, 1e-3);
    l.px = l.cx;
    l.py = l.cy;
    l.vx += (speedX - l.vx) * Math.min(1, dt * 10);
    l.vy += (speedY - l.vy) * Math.min(1, dt * 10);
    const pull = Math.cos(ANGLE) * l.vy - Math.sin(ANGLE) * l.vx;
    const want = still ? 0 : Math.max(-LEAN, Math.min(LEAN, pull * 0.00008));
    l.lean += (want - l.lean) * Math.min(1, dt * 10);
    const { target, ux, uy, angle } = aim(l, box);
    torch!.style.transform = `translate3d(${target.x.toFixed(2)}px, ${target.y.toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;

    // the heat, on whatever's under it
    const sweep = Math.hypot(l.vx, l.vy);
    // a flame moved quickly over something has less time to burn it
    const power = 4.2 / (1 + sweep / 1100);
    // the heat, laid all along the way the flame went since the last frame,
    // so a quick sweep leaves a line rather than a row of dots
    const from = l.last ?? target;
    const steps = Math.max(1, Math.min(16, Math.ceil(Math.hypot(target.x - from.x, target.y - from.y) / (mm * 1.5))));
    let hit = { on: "mat" as "paper" | "mat", char: 0, kind: "" };
    for (let k = 1; k <= steps; k++) {
      const x = from.x + ((target.x - from.x) * k) / steps;
      const y = from.y + ((target.y - from.y) * k) / steps;
      hit = surface.heat(x, y, mm * 6.5, power, dt / steps);
      if (hit.on === "mat") scorch(x, y, dt / steps, now);
    }
    l.last = target;
    l.on = hit.on;
    l.char = hit.char;
    l.burner.level(hit.on === "paper" ? Math.min(1, hit.char) : 0.25);
    if (hit.on === "paper" && !still) crackle(Math.min(1, hit.char * 1.2));

    if (still) return;
    // where the jet lands it fans out across the surface, onward
    const paper = hit.on === "paper";
    const ramp = paper && hit.char > 0.25 ? 0 : paper ? 1 : 2;
    const count = Math.round(dt * (paper ? 420 : 480) + Math.random());
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * Math.PI * 1.5;
      const a = Math.atan2(-uy, -ux) + spread;
      const speed = mm * (12 + Math.random() * 26) * (1 - Math.abs(spread) / 3.2);
      emit({
        kind: Kind.Lick,
        x: target.x + (Math.random() - 0.5) * mm,
        y: target.y + (Math.random() - 0.5) * mm,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - mm * 4,
        life: 0.12 + Math.random() * (paper ? 0.28 : 0.18),
        size: mm * (1.4 + Math.random() * 1.6),
        grow: mm * (paper ? 5 : 3.5),
        ramp,
      });
    }
    // paper alight: flames lick up off it, and it smokes
    if (paper && hit.char > 0.45) {
      const n = Math.round(dt * 90 * Math.min(1, hit.char));
      for (let i = 0; i < n; i++) {
        const r = mm * 5 * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        emit({
          kind: Kind.Lick,
          x: target.x + Math.cos(a) * r,
          y: target.y + Math.sin(a) * r,
          vx: (Math.random() - 0.5) * mm * 6,
          vy: -mm * (10 + Math.random() * 14),
          life: 0.25 + Math.random() * 0.35,
          size: mm * (1.6 + Math.random() * 2.2),
          grow: mm * 2,
          ramp: 0,
        });
      }
    }
    const smoke = dt * (paper ? 26 * Math.min(1, hit.char + 0.2) : 9);
    for (let i = 0; i < smoke + Math.random() - 0.5; i++) puff(target.x, target.y, paper ? 1 : 0.6);
    // burnt through: sparks fly out of the hole
    if (paper && hit.char >= 1 && Math.random() < dt * 14) sparks(target.x, target.y, 1 + Math.floor(Math.random() * 3));
  }

  function puff(x: number, y: number, k: number) {
    emit({
      kind: Kind.Smoke,
      x: x + (Math.random() - 0.5) * mm * 3,
      y: y + (Math.random() - 0.5) * mm * 3,
      vx: (Math.random() - 0.3) * mm * 5,
      vy: -mm * (7 + Math.random() * 8),
      life: 1.5 + Math.random() * 1.4,
      size: mm * (2.5 + Math.random() * 2) * k,
      grow: mm * (7 + Math.random() * 5) * k,
      ramp: 0,
    });
  }

  function sparks(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = mm * (35 + Math.random() * 70);
      emit({
        kind: Kind.Spark,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - mm * 10,
        life: 0.25 + Math.random() * 0.45,
        size: mm * 0.35,
        grow: 0,
        ramp: 0,
      });
    }
  }

  // The bare mat under the flame: it scorches, a little more the longer it's
  // held there.
  function scorch(x: number, y: number, dt: number, now: number) {
    let near: Scorch | null = null;
    let nearD = Infinity;
    for (const s of scorches) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < nearD) {
        nearD = d;
        near = s;
      }
    }
    if (near && nearD < near.r * 0.42) {
      near.dose = Math.min(1.6, near.dose + dt * 2.4);
      near.r = Math.min(mm * 8, near.r + mm * dt * 1.5);
      near.hot = 1;
      near.at = now;
      return;
    }
    if (scorches.length >= MAX_SCORCHES) {
      let weakest = 0;
      scorches.forEach((s, i) => {
        if (s.dose < scorches[weakest]!.dose) weakest = i;
      });
      scorches.splice(weakest, 1);
    }
    scorches.push({ x, y, r: mm * (3.8 + Math.random() * 1.6), dose: 0.22 + dt * 2.4, hot: 1, at: now });
  }

  // ---- drawing

  function drawFlame(l: Lit, box: DOMRect, now: number) {
    const { target, nozzle } = aim(l, box);
    // into window coordinates
    const tx = target.x + box.left;
    const ty = target.y + box.top;
    const nx = nozzle.x + box.left;
    const ny = nozzle.y + box.top;
    const dx = tx - nx;
    const dy = ty - ny;
    const length = Math.hypot(dx, dy) || 1;
    const ax = dx / length;
    const ay = dy / length;
    const px = -ay;
    const py = ax;
    const flicker = 0.93 + Math.sin(now * 0.047) * 0.03 + Math.random() * 0.05;
    const paper = l.on === "paper";

    // light thrown round where it lands
    const glowR = mm * (paper ? 30 : 22) * flicker;
    const glow = fx!.createRadialGradient(tx, ty, 0, tx, ty, glowR);
    if (paper) {
      glow.addColorStop(0, `rgb(255 150 60 / ${0.34 * flicker})`);
      glow.addColorStop(0.4, "rgb(255 110 40 / 0.1)");
    } else {
      glow.addColorStop(0, `rgb(140 160 255 / ${0.2 * flicker})`);
      glow.addColorStop(0.35, "rgb(255 120 60 / 0.06)");
    }
    glow.addColorStop(1, "rgb(255 120 40 / 0)");
    fx!.fillStyle = glow;
    fx!.fillRect(tx - glowR, ty - glowR, glowR * 2, glowR * 2);

    // the jet: a pale envelope and the bright cone inside it, each drawn a
    // few times wider and fainter so its edges are soft
    const cone = (reach: number, base: number, end: number, color: CanvasGradient, alpha: number) => {
      const ex = nx + ax * length * reach;
      const ey = ny + ay * length * reach;
      for (let k = 0; k < 3; k++) {
        const wide = 1 + k * 0.6;
        fx!.globalAlpha = (alpha / (1 + k * 1.4)) * flicker;
        fx!.fillStyle = color;
        fx!.beginPath();
        fx!.moveTo(nx + px * base * wide, ny + py * base * wide);
        fx!.quadraticCurveTo(
          nx + ax * length * reach * 0.55 + px * end * wide * 1.25,
          ny + ay * length * reach * 0.55 + py * end * wide * 1.25,
          ex + ax * end * 0.6,
          ey + ay * end * 0.6,
        );
        fx!.quadraticCurveTo(
          nx + ax * length * reach * 0.55 - px * end * wide * 1.25,
          ny + ay * length * reach * 0.55 - py * end * wide * 1.25,
          nx - px * base * wide,
          ny - py * base * wide,
        );
        fx!.closePath();
        fx!.fill();
      }
    };
    const env = fx!.createLinearGradient(nx, ny, tx, ty);
    env.addColorStop(0, "rgb(90 120 255 / 0.2)");
    env.addColorStop(0.25, "rgb(110 130 255 / 0.9)");
    env.addColorStop(0.85, paper ? "rgb(255 160 90 / 0.75)" : "rgb(150 110 255 / 0.7)");
    env.addColorStop(1, paper ? "rgb(255 190 110 / 0.9)" : "rgb(190 150 255 / 0.6)");
    cone(1.06 * flicker, mm * 1.1, mm * 2.6, env, 0.55);
    const core = fx!.createLinearGradient(nx, ny, nx + ax * length * 0.5, ny + ay * length * 0.5);
    core.addColorStop(0, "rgb(200 230 255 / 0.4)");
    core.addColorStop(0.2, "rgb(170 220 255 / 1)");
    core.addColorStop(1, "rgb(60 110 255 / 0.4)");
    cone(0.48 * flicker, mm * 0.75, mm * 1.05, core, 0.95);
    // and the white-hot point where it lands
    const spotR = mm * 2.4;
    const spot = fx!.createRadialGradient(tx, ty, 0, tx, ty, spotR);
    spot.addColorStop(0, paper ? "rgb(255 236 190 / 0.8)" : "rgb(170 190 255 / 0.5)");
    spot.addColorStop(0.45, paper ? "rgb(255 150 50 / 0.4)" : "rgb(110 120 255 / 0.3)");
    spot.addColorStop(1, "rgb(255 120 40 / 0)");
    fx!.globalAlpha = flicker;
    fx!.fillStyle = spot;
    fx!.fillRect(tx - spotR, ty - spotR, spotR * 2, spotR * 2);
    fx!.globalAlpha = 1;
  }

  function drawParticles(box: DOMRect) {
    const dark = html.dataset.theme === "dark";
    const smoke = dark ? smokeLight : smokeDark;
    const ox = box.left;
    const oy = box.top;
    // smoke under the fire
    fx!.globalCompositeOperation = "source-over";
    for (const p of particles) {
      if (p.kind !== Kind.Smoke && p.kind !== Kind.Ash) continue;
      const t = p.age / p.life;
      if (p.kind === Kind.Smoke) {
        const size = p.size + p.grow * t;
        fx!.globalAlpha = (dark ? 0.1 : 0.16) * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.4;
        fx!.drawImage(smoke, p.x + ox - size, p.y + oy - size, size * 2, size * 2);
      } else {
        // a flake of ash, turning as it lifts, its edge still glowing at first
        const size = p.size;
        fx!.save();
        fx!.translate(p.x + ox, p.y + oy);
        fx!.rotate(p.spin * p.age + p.seed);
        fx!.scale(1, 0.45 + 0.4 * Math.abs(Math.sin(p.age * 3 + p.seed)));
        fx!.globalAlpha = 0.85 * (1 - t);
        fx!.fillStyle = dark ? "#58534d" : "#2b2724";
        fx!.fillRect(-size / 2, -size / 2, size, size * 0.7);
        if (t < 0.35) {
          fx!.globalAlpha = (1 - t / 0.35) * 0.8;
          fx!.fillStyle = "#ff7a2a";
          fx!.fillRect(-size / 2, size * 0.1, size, size * 0.12);
        }
        fx!.restore();
      }
    }
    // flame laid over what it's on, so it reads over pale paper as well as
    // the dark mat, then added on as light
    for (const p of particles) {
      if (p.kind !== Kind.Lick || p.ramp !== 0) continue;
      const t = p.age / p.life;
      const ramp = sprites[0]!;
      const step = Math.min(ramp.length - 1, 1 + Math.floor(t * (ramp.length - 1)));
      const size = (p.size + p.grow * t) * 0.8;
      fx!.globalAlpha = 0.2 * (1 - t) ** 1.5;
      fx!.drawImage(ramp[step]!, p.x + ox - size, p.y + oy - size, size * 2, size * 2);
    }
    fx!.globalCompositeOperation = "lighter";
    for (const p of particles) {
      const t = p.age / p.life;
      if (p.kind === Kind.Lick) {
        const ramp = sprites[p.ramp]!;
        const step = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
        const size = p.size + p.grow * t;
        fx!.globalAlpha = (p.ramp === 0 ? 0.45 : 0.26) * (1 - t) ** 1.3;
        fx!.drawImage(ramp[step]!, p.x + ox - size, p.y + oy - size, size * 2, size * 2);
      } else if (p.kind === Kind.Spark) {
        fx!.globalAlpha = 1 - t;
        fx!.strokeStyle = t < 0.4 ? "#fff1c4" : "#ffab4a";
        fx!.lineWidth = Math.max(0.8, p.size);
        fx!.beginPath();
        fx!.moveTo(p.x + ox - p.vx * 0.025, p.y + oy - p.vy * 0.025);
        fx!.lineTo(p.x + ox, p.y + oy);
        fx!.stroke();
      }
    }
    fx!.globalCompositeOperation = "source-over";
    fx!.globalAlpha = 1;
  }

  function drawScorches(box: DOMRect, now: number, dt: number) {
    placeScorch(box);
    sx!.setTransform(1, 0, 0, 1, 0, 0);
    sx!.clearRect(0, 0, scorchCanvas!.width, scorchCanvas!.height);
    sx!.setTransform(scorchRatio, 0, 0, scorchRatio, 0, -scorchTop * scorchRatio);
    const dark = html.dataset.theme === "dark";
    for (let i = scorches.length - 1; i >= 0; i--) {
      const s = scorches[i]!;
      s.hot = Math.max(0, s.hot - dt / 0.9);
      // the mat heals: a scorch fades a while after the flame's left it
      if ((now - s.at) / 1000 > SCORCH_REST) s.dose -= (dt / SCORCH_HEAL) * 1.6;
      if (s.dose <= 0.005) {
        scorches.splice(i, 1);
        continue;
      }
      if (s.y + s.r < scorchTop || s.y - s.r > scorchTop + scorchH) continue;
      const a = Math.min(1, s.dose);
      const g = sx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgb(12 7 4 / ${(dark ? 0.8 : 0.66) * a})`);
      g.addColorStop(0.5, `rgb(26 14 6 / ${(dark ? 0.6 : 0.46) * a})`);
      g.addColorStop(0.78, `rgb(52 30 12 / ${0.14 * a})`);
      g.addColorStop(1, "rgb(60 34 14 / 0)");
      sx!.fillStyle = g;
      sx!.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    // the plastic still glowing where it's hot
    sx!.globalCompositeOperation = "lighter";
    for (const s of scorches) {
      if (s.hot <= 0.01) continue;
      const r = s.r * 0.55;
      const g = sx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgb(255 120 40 / ${0.42 * s.hot * Math.min(1, s.dose * 1.5)})`);
      g.addColorStop(1, "rgb(255 80 20 / 0)");
      sx!.fillStyle = g;
      sx!.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    sx!.globalCompositeOperation = "source-over";
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const box = mat.getBoundingClientRect();
    if (lit) burn(lit, dt, box, now);

    // paper smouldering on after the flame's gone: smoke, the odd flame, sparks
    const embers = surface.embers();
    if (!still) {
      for (const e of embers) {
        if (Math.random() < dt * 10 * e.hot) puff(e.x + (Math.random() - 0.5) * e.r * 2, e.y + (Math.random() - 0.5) * e.r * 2, 0.7);
        if (e.hot > 0.4 && Math.random() < dt * 22 * e.hot) {
          const a = Math.random() * Math.PI * 2;
          emit({
            kind: Kind.Lick,
            x: e.x + Math.cos(a) * e.r,
            y: e.y + Math.sin(a) * e.r,
            vx: (Math.random() - 0.5) * mm * 5,
            vy: -mm * (8 + Math.random() * 10),
            life: 0.2 + Math.random() * 0.3,
            size: mm * (1 + Math.random() * 1.6) * e.hot,
            grow: mm * 1.5,
            ramp: 0,
          });
        }
      }
    }

    // move everything on
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      if (p.kind === Kind.Smoke || p.kind === Kind.Ash) {
        // rising, and curling as it goes
        p.vx += Math.sin(p.age * 2.4 + p.seed) * mm * 6 * dt;
        p.vy -= mm * 3 * dt;
        const drag = Math.exp(-dt * 0.8);
        p.vx *= drag;
        p.vy *= drag;
      } else if (p.kind === Kind.Spark) {
        const drag = Math.exp(-dt * 3.2);
        p.vx *= drag;
        p.vy = p.vy * drag + mm * 30 * dt;
      } else {
        const drag = Math.exp(-dt * 4.5);
        p.vx *= drag;
        p.vy = p.vy * drag - mm * 9 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    const showing = lit || particles.length;
    if (showing) {
      sizeFire();
      fx!.setTransform(fireRatio, 0, 0, fireRatio, 0, 0);
      fx!.clearRect(0, 0, fireW, fireH);
      if (lit) drawFlame(lit, box, now);
      drawParticles(box);
    } else if (fireLive) {
      letGo();
    }
    if (scorches.length) drawScorches(box, now, dt);
    else if (scorchLive) letGo();
    if (lit || particles.length || scorches.length || embers.length) raf = requestAnimationFrame(frame);
    else letGo();
  }

  // ---- lighting it and putting it out

  function light(id: number, cx: number, cy: number, touch: boolean) {
    measure();
    unlockSound();
    lit = {
      id,
      touch,
      cx,
      cy,
      burner: ignite(),
      lean: 0,
      vx: 0,
      vy: 0,
      px: cx,
      py: cy,
      at: performance.now(),
      on: "mat",
      char: 0,
      last: null,
    };
    const box = mat.getBoundingClientRect();
    const { target, angle } = aim(lit, box);
    torch!.style.transform = `translate3d(${target.x.toFixed(2)}px, ${target.y.toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;
    torch!.dataset.down = "";
    html.dataset.torching = "";
    wake();
  }

  function out() {
    const l = lit;
    if (!l) return;
    lit = null;
    l.burner.stop();
    delete torch!.dataset.down;
    delete html.dataset.torching;
    wake();
  }

  // ---- input

  const usable = (event: PointerEvent) =>
    html.dataset.tool === "torch" &&
    !html.dataset.scene &&
    event.button <= 0 &&
    event.isPrimary &&
    event.target instanceof Element &&
    mat.contains(event.target) &&
    !event.target.closest("input, textarea, select, [data-no-drag]");

  const onPointerDown = (event: PointerEvent) => {
    if (lit || pending || !usable(event)) return;
    if (event.pointerType === "touch") {
      const id = event.pointerId;
      const x = event.clientX;
      const y = event.clientY;
      pending = {
        id,
        x,
        y,
        timer: window.setTimeout(() => {
          if (!pending || pending.id !== id) return;
          pending = null;
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
          light(id, x, y, true);
        }, HOLD_TO_LIGHT),
      };
      return;
    }
    event.preventDefault();
    try {
      mat.setPointerCapture(event.pointerId);
    } catch {}
    light(event.pointerId, event.clientX, event.clientY, false);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pending && pending.id === event.pointerId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) {
        window.clearTimeout(pending.timer);
        pending = null;
      }
      return;
    }
    if (!lit || lit.id !== event.pointerId) return;
    lit.cx = event.clientX;
    lit.cy = event.clientY;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pending && pending.id === event.pointerId) {
      window.clearTimeout(pending.timer);
      pending = null;
      return;
    }
    if (lit && lit.id === event.pointerId) out();
  };

  // Once it's lit, a finger moving moves the flame rather than the page.
  const onTouchMove = (event: TouchEvent) => {
    if (lit?.touch) event.preventDefault();
  };

  const onContextMenu = (event: Event) => {
    if (lit || pending) event.preventDefault();
  };

  // A sheet burnt away: a cloud of ash and smoke where it was.
  const onAsh = (event: Event) => {
    const { x, y, w, h } = (event as CustomEvent<{ x: number; y: number; w: number; h: number }>).detail;
    if (still) return;
    measure();
    const n = Math.min(70, Math.round((w * h) / (mm * mm * 30)));
    for (let i = 0; i < n; i++) {
      emit({
        kind: Kind.Ash,
        x: x + Math.random() * w,
        y: y + Math.random() * h,
        vx: (Math.random() - 0.5) * mm * 14,
        vy: -mm * (4 + Math.random() * 14),
        life: 1.4 + Math.random() * 1.6,
        size: mm * (0.8 + Math.random() * 1.8),
        grow: 0,
        ramp: 0,
        spin: (Math.random() - 0.5) * 6,
      });
    }
    for (let i = 0; i < n / 3; i++) puff(x + Math.random() * w, y + Math.random() * h, 1.2);
    wake();
  };

  // Something's alight: keep drawing while it smoulders.
  const onWear = () => wake();

  const onBlur = () => out();

  measure();
  mat.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener(ASH_EVENT, onAsh);
  window.addEventListener("resize", onWear);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  mat.addEventListener("contextmenu", onContextMenu);

  return () => {
    cancelAnimationFrame(raf);
    out();
    if (pending) window.clearTimeout(pending.timer);
    scorches.length = 0;
    particles.length = 0;
    letGo();
    mat.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener(ASH_EVENT, onAsh);
    window.removeEventListener("resize", onWear);
    document.removeEventListener("touchmove", onTouchMove);
    mat.removeEventListener("contextmenu", onContextMenu);
  };
}
