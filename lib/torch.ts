import { crackle, type Burner, ignite, unlockSound } from "@/lib/riffle";
import { ASH_EVENT, SCORCH_EVENT, type Surface, TIDY_EVENT } from "@/lib/wear";

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
  boost: number;
  overdrive: boolean;
  // what the flame was last on, and where it landed last frame (mat px)
  on: "paper" | "mat";
  char: number;
  last: { x: number; y: number } | null;
};

type Pending = { id: number; x: number; y: number; timer: number };

// a scorch on the mat: where, how big, how much heat it took, how hot it
// still is, when it was last heated, and when Tidy began wiping it away
type Scorch = { x: number; y: number; r: number; dose: number; hot: number; at: number; clear: number };

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
const STANDOFF = 25;
const HOLD_TO_LIGHT = 260;
const MAX_PARTICLES = 900;
const MAX_SCORCHES = 240;
// a scorch starts to heal a while after the flame's left it, and is gone in
// about this long (s)
const SCORCH_REST = 3.5;
const SCORCH_HEAL = 22;
// once they've cooled they change slowly, and are drawn again this often (ms)
const SCORCH_IDLE = 200;
// how long Tidy takes to wipe them away (ms)
const SCORCH_CLEAR = 700;

const smooth = (t: number) => t * t * (3 - 2 * t);

// colour ramps, hottest first: paper burning, the jet's blue, and the
// mat's plastic catching
const RAMPS = [
  ["#fff6dc", "#ffd47e", "#ffa444", "#ff6c1f", "#d63f17", "#7c200c"],
  ["#f0ffff", "#9df2ff", "#38c6ff", "#2870ff", "#5142d6", "#292079"],
  ["#d5faff", "#79dfff", "#6179ff", "#a866df", "#ff963f", "#9a310d"],
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
  const blueBloom = sprite("#209eff", 128);
  const warmBloom = sprite("#ff8c30", 128);
  const sparkBloom = sprite("#ffc36a", 32);

  let lit: Lit | null = null;
  let pending: Pending | null = null;
  let raf = 0;
  // while only cooled scorches are left, the frames come on a timer instead
  let timer = 0;
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
  // when the scorches were last drawn, whether they must be again, and
  // whether there are any (that Tidy isn't already wiping away)
  let scorchAt = 0;
  let scorchDirty = true;
  let scorched = false;

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

  // Says whether it had to move (and so needs drawing again).
  function placeScorch(box: DOMRect) {
    const view = -box.top;
    const tall = window.innerHeight;
    const w = mat.clientWidth;
    const h = Math.ceil(tall * 1.6);
    const r = Math.min(2, window.devicePixelRatio || 1);
    const resized = !scorchLive || w !== scorchW || h !== scorchH || r !== scorchRatio;
    const away = view < scorchTop + 8 || view + tall > scorchTop + scorchH - 8;
    if (!resized && !away) return false;
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
    return true;
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
    if (raf) return;
    // (on the scorches' timer, the time since the last frame still counts)
    if (timer) window.clearTimeout(timer);
    else last = performance.now();
    timer = 0;
    raf = requestAnimationFrame(frame);
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
    l.boost += ((l.overdrive ? 1 : 0) - l.boost) * Math.min(1, dt * 9);
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
    const power = (4.2 + l.boost * 5.8) / (1 + sweep / 1100);
    // the heat, laid all along the way the flame went since the last frame,
    // so a quick sweep leaves a line rather than a row of dots
    const from = l.last ?? target;
    const steps = Math.max(1, Math.min(16, Math.ceil(Math.hypot(target.x - from.x, target.y - from.y) / (mm * 1.5))));
    let hit = { on: "mat" as "paper" | "mat", char: 0, kind: "" };
    for (let k = 1; k <= steps; k++) {
      const x = from.x + ((target.x - from.x) * k) / steps;
      const y = from.y + ((target.y - from.y) * k) / steps;
      hit = surface.heat(x, y, mm * (6.5 + l.boost * 3), power, dt / steps);
      if (hit.on === "mat") scorch(x, y, (dt / steps) * (1 + l.boost), now);
    }
    l.last = target;
    l.on = hit.on;
    l.char = hit.char;
    l.burner.level((hit.on === "paper" ? Math.min(1, hit.char) : 0.25) + l.boost);
    if (hit.on === "paper" && !still) crackle(Math.min(1, hit.char * 1.2));

    if (still) return;
    // where the jet lands it fans out across the surface, onward
    const paper = hit.on === "paper";
    const ramp = paper && hit.char > 0.25 ? 0 : paper ? 1 : 2;
    const count = Math.round(dt * (paper ? 420 : 480) * (1 + l.boost * 0.45) + Math.random());
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * Math.PI * 1.5;
      const a = Math.atan2(-uy, -ux) + spread;
      const speed = mm * (16 + Math.random() * 34) * (1 + l.boost * 0.8) * (1 - Math.abs(spread) / 3.2);
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
    // Hot fragments spray in the jet's direction, then arc down under gravity.
    if (Math.random() < dt * (paper ? 24 : 14) * (1 + l.boost * 2)) {
      sparks(target.x, target.y, 2 + Math.floor(Math.random() * (3 + l.boost * 4)), Math.atan2(-uy, -ux));
    }
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

  function sparks(x: number, y: number, n: number, direction?: number) {
    for (let i = 0; i < n; i++) {
      const a = direction === undefined ? Math.random() * Math.PI * 2 : direction + (Math.random() - 0.5) * 2.6;
      const speed = mm * (40 + Math.random() * 95);
      emit({
        kind: Kind.Spark,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - mm * 10,
        life: 0.3 + Math.random() * 0.55,
        size: mm * (0.15 + Math.random() * 0.2),
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
    scorches.push({ x, y, r: mm * (3.8 + Math.random() * 1.6), dose: 0.22 + dt * 2.4, hot: 1, at: now, clear: 0 });
  }

  // ---- drawing

  function drawFlame(l: Lit, box: DOMRect, now: number) {
    const { target, nozzle, angle } = aim(l, box);
    const tx = target.x + box.left;
    const ty = target.y + box.top;
    const nx = nozzle.x + box.left;
    const ny = nozzle.y + box.top;
    const paper = l.on === "paper";
    const boost = l.boost;
    const time = still ? 0 : now * 0.001;
    const flicker = still ? 1 : 0.97 + Math.sin(time * 53) * 0.02 + Math.sin(time * 97) * 0.015;
    const ignition = still ? 0 : Math.max(0, 1 - (now - l.at) / 260);
    const length = STANDOFF * mm;
    const strength = 1 + boost * 0.55 + ignition * 0.3;

    // Cached blooms keep the large pools of light cheap. A cool light at
    // the barrel mixes with the warm light of paper actually catching fire.
    fx!.globalAlpha = (0.22 + boost * 0.12) * flicker;
    const halo = mm * (23 + boost * 9);
    fx!.drawImage(blueBloom, nx - halo, ny - halo, halo * 2, halo * 2);
    const spill = mm * (paper ? 34 : 25) * strength;
    fx!.globalAlpha = (paper ? 0.4 : 0.24) * flicker;
    fx!.drawImage(paper ? warmBloom : blueBloom, tx - spill, ty - spill, spill * 2, spill * 2);

    // Draw in nozzle space. Each ribbon has a different travelling wave;
    // their silhouettes stay coherent instead of flickering randomly.
    fx!.save();
    fx!.translate(nx, ny);
    fx!.rotate(angle + Math.PI);
    const ribbon = (reach: number, base: number, width: number, phase: number) => {
      fx!.beginPath();
      for (const side of [1, -1]) {
        for (let i = 0; i <= 24; i++) {
          const t = side === 1 ? i / 24 : 1 - i / 24;
          const wave = still ? 0 : (Math.sin(t * 19 - time * 38 + phase) + Math.sin(t * 31 - time * 57 + phase) * 0.4);
          const taper = Math.sin(t * Math.PI) ** 0.8;
          const radius = (base * (1 - t) + width * taper) * (1 + wave * 0.1 * t);
          const bend = still ? 0 : Math.sin(t * 8 - time * 22 + phase) * mm * 0.45 * t * t;
          const x = length * reach * t;
          const y = side * radius + bend;
          if (side === 1 && i === 0) fx!.moveTo(x, y);
          else fx!.lineTo(x, y);
        }
      }
      fx!.closePath();
      fx!.fill();
    };
    const envelope = fx!.createLinearGradient(0, 0, length * 1.2, 0);
    envelope.addColorStop(0, "#82edff00");
    envelope.addColorStop(0.12, "#67dfff");
    envelope.addColorStop(0.45, "#177bff");
    envelope.addColorStop(0.78, "#6556f0b0");
    envelope.addColorStop(1, paper ? "#ffad4530" : "#9a66ff00");
    fx!.fillStyle = envelope;
    fx!.globalAlpha = 0.16;
    ribbon(1.22, mm * 1.5, mm * 6.5 * strength, 1);
    fx!.globalAlpha = 0.55 * flicker;
    ribbon(1.1, mm * 1.2, mm * 3.1 * strength, 3);

    const jet = fx!.createLinearGradient(0, 0, length, 0);
    jet.addColorStop(0, "#eeffff");
    jet.addColorStop(0.17, "#a5f6ff");
    jet.addColorStop(0.5, "#3ccaff");
    jet.addColorStop(0.85, "#3977ffb0");
    jet.addColorStop(1, "#8d8dff00");
    fx!.fillStyle = jet;
    fx!.globalAlpha = 0.9;
    ribbon(0.97, mm * 0.95, mm * 1.2 * strength, 5);

    // The small bright shock diamonds make it read as a pressurised jet.
    // Source-over preserves the cyan silhouette against light paper.
    fx!.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const x = mm * (3.2 + i * 3.7);
      const rx = mm * (1.6 - i * 0.16) * flicker;
      const ry = mm * (0.72 - i * 0.09) * strength;
      fx!.globalAlpha = (0.8 - i * 0.12) * flicker;
      fx!.fillStyle = i < 2 ? "#ddffff" : "#74e5ff";
      fx!.beginPath();
      fx!.moveTo(x - rx, 0);
      fx!.quadraticCurveTo(x, -ry * 1.6, x + rx, 0);
      fx!.quadraticCurveTo(x, ry * 1.6, x - rx, 0);
      fx!.fill();
    }
    // Narrow white-hot inner cone, strongest during the ignition kick.
    fx!.fillStyle = "#e8ffff";
    fx!.globalAlpha = 0.8;
    ribbon(0.36 + boost * 0.12, mm * 0.65, mm * 0.2, 0);
    fx!.restore();

    // A grounded ellipse of heat at contact; never a detached cursor halo.
    const spotR = mm * (5 + boost * 2) * flicker;
    fx!.save();
    fx!.translate(tx, ty);
    fx!.scale(1, 0.6);
    const spot = fx!.createRadialGradient(0, 0, 0, 0, 0, spotR);
    spot.addColorStop(0, paper ? "#fff1d9" : "#e2fbff");
    spot.addColorStop(0.2, paper ? "#ffc36ac0" : "#88eaffc0");
    spot.addColorStop(0.6, paper ? "#ff782b40" : "#469dff50");
    spot.addColorStop(1, "#427aff00");
    fx!.globalAlpha = 0.85;
    fx!.fillStyle = spot;
    fx!.fillRect(-spotR, -spotR, spotR * 2, spotR * 2);
    fx!.restore();
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
        const radius = mm * 1.6 * (1 - t);
        fx!.globalAlpha = 0.5 * (1 - t);
        fx!.drawImage(sparkBloom, p.x + ox - radius, p.y + oy - radius, radius * 2, radius * 2);
        fx!.globalAlpha = 1 - t;
        fx!.strokeStyle = t < 0.4 ? "#fff1c4" : "#ffab4a";
        fx!.lineWidth = Math.max(0.8, p.size);
        fx!.beginPath();
        fx!.moveTo(p.x + ox - p.vx * 0.045, p.y + oy - p.vy * 0.045);
        fx!.lineTo(p.x + ox, p.y + oy);
        fx!.stroke();
      }
    }
    fx!.globalCompositeOperation = "source-over";
    fx!.globalAlpha = 1;
  }

  // The scorches heal, and are drawn again whenever they've changed enough to
  // see: every frame while one's hot or being wiped away, and a few times a
  // second while they slowly fade.
  function drawScorches(box: DOMRect, now: number, elapsed: number) {
    let changed = placeScorch(box) || scorchDirty;
    for (let i = scorches.length - 1; i >= 0; i--) {
      const s = scorches[i]!;
      if (s.hot > 0) {
        s.hot = Math.max(0, s.hot - elapsed / 0.9);
        changed = true;
      }
      // the mat heals: a scorch fades a while after the flame's left it
      if ((now - s.at) / 1000 > SCORCH_REST) s.dose -= (elapsed / SCORCH_HEAL) * 1.6;
      if (s.clear) changed = true;
      if (s.dose <= 0.005 || (s.clear && now - s.clear >= SCORCH_CLEAR)) {
        scorches.splice(i, 1);
        changed = true;
      }
    }
    if (!changed && now - scorchAt < SCORCH_IDLE) return;
    scorchDirty = false;
    scorchAt = now;
    sx!.setTransform(1, 0, 0, 1, 0, 0);
    sx!.clearRect(0, 0, scorchCanvas!.width, scorchCanvas!.height);
    sx!.setTransform(scorchRatio, 0, 0, scorchRatio, 0, -scorchTop * scorchRatio);
    const dark = html.dataset.theme === "dark";
    const fade = (s: Scorch) => (s.clear ? 1 - smooth(Math.min(1, (now - s.clear) / SCORCH_CLEAR)) : 1);
    for (const s of scorches) {
      if (s.y + s.r < scorchTop || s.y - s.r > scorchTop + scorchH) continue;
      const a = Math.min(1, s.dose) * fade(s);
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
      g.addColorStop(0, `rgb(255 120 40 / ${0.42 * s.hot * Math.min(1, s.dose * 1.5) * fade(s)})`);
      g.addColorStop(1, "rgb(255 80 20 / 0)");
      sx!.fillStyle = g;
      sx!.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    sx!.globalCompositeOperation = "source-over";
  }

  // Whether the mat's scorched anywhere: a mess, like anything out of place.
  function signal() {
    const now = scorches.some((s) => !s.clear);
    if (now === scorched) return;
    scorched = now;
    window.dispatchEvent(new CustomEvent(SCORCH_EVENT, { detail: now }));
  }

  function frame(now: number) {
    raf = 0;
    timer = 0;
    // the scorches heal by the clock; everything that moves, a frame at a time
    const elapsed = Math.min(1, Math.max(0.001, (now - last) / 1000));
    const dt = Math.min(0.05, elapsed);
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
    if (scorches.length) drawScorches(box, now, elapsed);
    else if (scorchLive) letGo();
    signal();
    if (lit || particles.length || embers.length || scorches.some((s) => s.hot > 0 || s.clear)) raf = requestAnimationFrame(frame);
    else if (scorches.length) timer = window.setTimeout(() => frame(performance.now()), SCORCH_IDLE);
    else letGo();
  }

  // ---- lighting it and putting it out

  function light(id: number, cx: number, cy: number, touch: boolean, overdrive = false) {
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
      boost: 0,
      overdrive,
      on: "mat",
      char: 0,
      last: null,
    };
    const box = mat.getBoundingClientRect();
    const { target, angle } = aim(lit, box);
    torch!.style.transform = `translate3d(${target.x.toFixed(2)}px, ${target.y.toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;
    torch!.dataset.down = "";
    html.dataset.torching = "";
    html.toggleAttribute("data-torch-boost", overdrive);
    if (!still) {
      sparks(target.x, target.y, 18, angle + Math.PI);
      puff(target.x, target.y, 0.5);
    }
    wake();
  }

  function out() {
    const l = lit;
    if (!l) return;
    lit = null;
    l.burner.stop();
    delete torch!.dataset.down;
    delete html.dataset.torching;
    delete html.dataset.torchBoost;
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
    light(event.pointerId, event.clientX, event.clientY, false, event.shiftKey);
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
    setOverdrive(event.shiftKey);
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

  // Scrolled while the scorches are only looked in on now and then: keep
  // their canvas over the window.
  const onScroll = () => {
    if (scorches.length) wake();
  };

  // Tidy wipes the mat clean.
  const onTidy = () => {
    if (!scorches.length) return;
    const now = performance.now();
    if (still) scorches.length = 0;
    for (const s of scorches) if (!s.clear) s.clear = now;
    scorchDirty = true;
    wake();
  };

  function setOverdrive(active: boolean) {
    if (!lit || lit.overdrive === active) return;
    lit.overdrive = active;
    html.toggleAttribute("data-torch-boost", active);
    if (active && !still) {
      const { target, angle } = aim(lit, mat.getBoundingClientRect());
      sparks(target.x, target.y, 14, angle + Math.PI);
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Shift" && !event.repeat) setOverdrive(true);
    if (event.key === "Escape" || event.key.toLowerCase() === "k") onBlur();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Shift") setOverdrive(false);
  };
  const onBlur = () => {
    if (pending) window.clearTimeout(pending.timer);
    pending = null;
    out();
  };
  const onVisibility = () => { if (document.hidden) onBlur(); };

  measure();
  mat.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener(ASH_EVENT, onAsh);
  window.addEventListener("resize", onWear);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(TIDY_EVENT, onTidy);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  mat.addEventListener("contextmenu", onContextMenu);

  return () => {
    // Stop before cancelling: out() wakes the loop to fade remaining embers.
    onBlur();
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    scorches.length = 0;
    particles.length = 0;
    letGo();
    mat.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener(ASH_EVENT, onAsh);
    window.removeEventListener("resize", onWear);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(TIDY_EVENT, onTidy);
    document.removeEventListener("touchmove", onTouchMove);
    mat.removeEventListener("contextmenu", onContextMenu);
  };
}
