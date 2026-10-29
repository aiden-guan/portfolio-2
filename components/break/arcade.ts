import {
  clamp,
  unitVector,
  segmentHitsCircle,
  createFlightState,
  stepFlight,
  dashFlight,
  DASH_COOLDOWN,
} from "@/components/break/physics";

import {
  ENCOUNTER,
  CAT_INKS,
  createCatEars,
  createBlush,
} from "@/components/break/encounter";
import {
  planVolley,
  createRunStats,
  runRank,
  formatTime,
  OVERDRIVE_SECONDS,
  WARNING_SECONDS,
  type Volley,
} from "@/components/break/combat";

export type ArcadePhase =
  | "loading"
  | "ready"
  | "intro"
  | "fight"
  | "transform"
  | "dying"
  | "win"
  | "lose"
  | "error";
export type ArcadeHandle = {
  stop: () => void;
  start: () => void;
  reset: () => void;
  togglePause: () => void;
  dash: () => boolean;
  pulse: () => boolean;
  continueStage: () => boolean;
  toggleFocus: () => void;
};
type Pixel = {
  ear?: boolean;
  blush?: number;
  reveal?: number;
  repair?: number;
  col: number;
  row: number;
  ink: number;
  alive: boolean;
  loose: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
};
type Shot = {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  friendly: boolean;
  kind: "bolt" | "orb" | "missile";
  grazed: boolean;
  damage: number;
};
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  ink: string;
  size: number;
};
type Drone = {
  targetX?: number;
  targetY?: number;
  x: number;
  y: number;
  origin: number;
  age: number;
  hp: number;
  shotAt: number;
  side: number;
  seed: number;
};
type Pickup = {
  x: number;
  y: number;
  age: number;
  kind: "spread" | "shield" | "pulse";
  alive: boolean;
};
type Ring = {
  x: number;
  y: number;
  age: number;
  life: number;
  speed: number;
  ink: string;
};
type Beam = { x: number; y: number; target: number; age: number };
type Trail = { x: number; y: number; age: number; bank: number };
const BEST_KEY = "guan-arcade-best";
const PALETTE = [
  "#243c2c",
  "#385440",
  "#688363",
  "#a1bb8a",
  "#d8e4bb",
  "#f0efce",
];
const MAX_HP = ENCOUNTER.hp;
const ALL_INKS = [...PALETTE, ...CAT_INKS];
const smooth = (n: number) => {
  const x = clamp(n, 0, 1);
  return x * x * (3 - 2 * x);
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function portrait(image: HTMLImageElement) {
  const cols = 62,
    rows = 70;
  const sample = document.createElement("canvas");
  sample.width = cols;
  sample.height = rows;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Portrait canvas unavailable");
  ctx.drawImage(
    image,
    image.width * 0.105,
    image.height * 0.105,
    image.width * 0.72,
    image.height * 0.82,
    0,
    0,
    cols,
    rows,
  );
  const rgba = ctx.getImageData(0, 0, cols, rows).data;
  const pixels: Pixel[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = rgba[i],
        g = rgba[i + 1],
        b = rgba[i + 2];
      const u = col / cols,
        v = row / rows;
      const luminance = r * 0.299 + g * 0.587 + b * 0.114;
      const hair = luminance < 81;
      const skin = r - g > 13 && r - b > 23;
      // Background removal stays local, sampled from the supplied portrait.
      const half =
        v < 0.18 ? 0.3 + v * 0.95 : v < 0.51 ? 0.47 : 0.47 - (v - 0.51) * 0.43;
      if ((!hair && !skin) || Math.abs(u - 0.51) > half || v > 0.98) continue;
      if (v > 0.78 && ((u - 0.51) / 0.3) ** 2 + ((v - 0.78) / 0.24) ** 2 > 1)
        continue;
      const dither = (BAYER[(row % 4) * 4 + (col % 4)] / 16 - 0.5) * 26;
      const ink = clamp(
        Math.floor((luminance + dither - 18) / 34),
        0,
        PALETTE.length - 1,
      );
      pixels.push({
        col,
        row,
        ink,
        alive: true,
        loose: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  // Keep the connected portrait and discard stray background islands.
  const byPosition = new Map(pixels.map((p) => [p.row * cols + p.col, p]));
  const visited = new Set<number>();
  let largest: Pixel[] = [];
  for (const pixel of pixels) {
    const key = pixel.row * cols + pixel.col;
    if (visited.has(key)) continue;
    const component: Pixel[] = [],
      pending = [key];
    visited.add(key);
    while (pending.length) {
      const next = pending.pop()!,
        p = byPosition.get(next)!;
      component.push(p);
      for (const neighbor of [
        next - cols,
        next + cols,
        ...(p.col > 0 ? [next - 1] : []),
        ...(p.col < cols - 1 ? [next + 1] : []),
      ]) {
        if (byPosition.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (pixels.length < 100) throw new Error("Portrait could not be sampled");
  return { cols, rows, pixels: largest };
}

export function mountArcade(
  host: HTMLElement,
  onPhase: (phase: ArcadePhase) => void,
  onPause: (paused: boolean) => void,
  reduced: boolean,
): ArcadeHandle {
  const canvas = host.querySelector("canvas")!,
    ctx = canvas.getContext("2d")!;
  const health = host.querySelector<HTMLElement>("[data-signal]");
  const shots: Shot[] = [],
    sparks: Spark[] = [],
    drones: Drone[] = [],
    pickups: Pickup[] = [],
    rings: Ring[] = [],
    beams: Beam[] = [],
    trails: Trail[] = [];
  const keys = new Set<string>();
  const pixelMap = new Map<number, Pixel>();
  const stats = createRunStats();
  const hudNodes = new Map<string, HTMLElement>();
  let pointerScaleX = 1,
    pointerScaleY = 1;
  let cols = 62,
    rows = 70,
    pixels: Pixel[] = [];
  let phase: ArcadePhase = "loading",
    paused = false,
    running = true;
  let w = 1,
    h = 1,
    dpr = 1,
    raf = 0,
    last = 0,
    time = 0,
    backgroundDrift = 0,
    accumulator = 0,
    intro = 0,
    endTime = 0;
  let form: 1 | 2 = 1,
    formTime = 0,
    transformTime = 0,
    meowed = false;
  let transformFrom = { x: 0, y: 0, height: 0 };
  let hp: number = MAX_HP,
    stage = 1,
    score = 0,
    best = 0,
    combo = 1,
    comboTime = 0,
    grazeCount = 0;
  let shotTimer = 0,
    missileTimer = 1,
    attackTimer = 2,
    droneTimer = 7,
    laserTimer = 7,
    droneCount = 0,
    firstPickup = false;
  let volley: Volley | null = null,
    volleyTurn = 0,
    focusTimer = 0,
    slowTime = 0,
    hurtFlash = 0;
  let echoHp: number = MAX_HP,
    upgradeFlash = 0;
  const focusRay = { active: false, x: 0, y: 0 };
  let kick = 0,
    impact = 0,
    impactX = 0,
    impactY = 0,
    hitStop = 0,
    phaseShift = 0,
    dashTrailAt = 0;
  type Drag = {
    id: number;
    clientX: number;
    clientY: number;
    originX: number;
    originY: number;
    shipX: number;
    shipY: number;
    targetX: number;
    targetY: number;
  };
  let pointer: Drag | null = null;
  let focusLatch = false;
  const previousPosition = { x: 0, y: 0 };
  const lastRendered = { x: 0, y: 0 };
  const player = {
    ...createFlightState(),
    lives: 3,
    invincible: 0,
    energy: 1,
    spread: 0,
    weapon: 1,
    charge: 0,
    overdrive: 0,
  };
  function flightInput() {
    return {
      x:
        Number(keys.has("arrowright") || keys.has("d")) -
        Number(keys.has("arrowleft") || keys.has("a")),
      y:
        Number(keys.has("arrowdown") || keys.has("s")) -
        Number(keys.has("arrowup") || keys.has("w")),
      focused: keys.has("shift") || focusLatch,
      target: pointer ? { x: pointer.targetX, y: pointer.targetY } : undefined,
    };
  }
  function rebasePointer() {
    if (!pointer) return;
    pointer.originX = pointer.clientX;
    pointer.originY = pointer.clientY;
    pointer.shipX = pointer.targetX = player.x;
    pointer.shipY = pointer.targetY = player.y;
  }
  const sound = createSound();
  try {
    best = Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
  } catch {}

  function text(selector: string, value: string) {
    let el = hudNodes.get(selector);
    if (!el) {
      el = host.querySelector<HTMLElement>(selector) ?? undefined;
      if (el) hudNodes.set(selector, el);
    }
    if (el && el.textContent !== value) el.textContent = value;
  }
  function phaseTo(next: ArcadePhase) {
    if (phase === next) return;
    phase = next;
    hudNodes.clear();
    if (next === "win" || next === "lose") {
      best = Math.max(best, score);
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch {}
    }
    onPhase(next);
  }
  function hud() {
    if (health) health.style.transform = `scaleX(${clamp(hp / MAX_HP, 0, 1)})`;
    text("[data-health]", `${Math.ceil((hp / MAX_HP) * 100)}%`);
    text("[data-score]", String(score).padStart(6, "0"));
    text("[data-result-score]", String(score).padStart(6, "0"));
    text("[data-best]", String(best).padStart(6, "0"));
    text("[data-stage]", form === 1 ? "I" : "II");
    text("[data-time]", formatTime(stats.seconds));
    text("[data-run-time]", formatTime(stats.seconds));
    text("[data-run-grazes]", String(stats.grazes + stats.parries));
    text("[data-run-rank]", runRank(stats, phase === "win"));
    text(
      "[data-weapon]",
      player.overdrive > 0
        ? "OVERDRIVE"
        : `MK.${["I", "II", "III"][player.weapon - 1]}`,
    );
    host.dataset.form = form === 1 ? "human" : "cat";
    host.dataset.overdrive = player.overdrive > 0 ? "on" : "off";
    host.dataset.weapon = String(player.weapon);
    const echo = host.querySelector<HTMLElement>("[data-signal-echo]");
    if (echo) echo.style.transform = `scaleX(${clamp(echoHp / MAX_HP, 0, 1)})`;
    const charge = host.querySelector<HTMLElement>("[data-overdrive]");
    if (charge)
      charge.style.transform = `scaleX(${player.overdrive > 0 ? player.overdrive / OVERDRIVE_SECONDS : player.charge / 100})`;
    text("[data-combo]", combo > 1 ? `×${combo}` : "");
    const hull = host.querySelector<HTMLElement>("[data-hull]");
    if (hull) {
      const value = Array.from({ length: 3 }, (_, i) =>
        i < player.lives ? "◆" : "◇",
      ).join(" ");
      if (hull.textContent !== value) {
        hull.textContent = value;
        hull.setAttribute("aria-label", `${player.lives} shields remaining`);
      }
    }
    const dashMeter = host.querySelector<HTMLElement>("[data-dash]");
    if (dashMeter)
      dashMeter.style.transform = `scaleX(${1 - clamp(player.dashCooldown / DASH_COOLDOWN, 0, 1)})`;
    const energyMeter = host.querySelector<HTMLElement>("[data-energy]");
    if (energyMeter) energyMeter.style.transform = `scaleX(${player.energy})`;
    const dashButton =
      host.querySelector<HTMLButtonElement>("[data-dash-button]");
    if (dashButton) dashButton.disabled = player.dashCooldown > 0;
    const pulseButton = host.querySelector<HTMLButtonElement>(
      "[data-pulse-button]",
    );
    if (pulseButton)
      pulseButton.disabled = phase !== "fight" || player.energy < 0.999;
    host
      .querySelector<HTMLElement>("[data-focus-button]")
      ?.setAttribute("aria-pressed", String(focusLatch));
  }
  function resize() {
    const rect = host.getBoundingClientRect(),
      oldW = w,
      oldH = h;
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const canvasBox = canvas.getBoundingClientRect();
    pointerScaleX = w / Math.max(1, canvasBox.width || w);
    pointerScaleY = h / Math.max(1, canvasBox.height || h);
    player.x = oldW > 1 ? clamp((player.x / oldW) * w, 24, w - 24) : w / 2;
    player.y = oldH > 1 ? clamp((player.y / oldH) * h, 76, h - 82) : h * 0.8;
    previousPosition.x = lastRendered.x = player.x;
    previousPosition.y = lastRendered.y = player.y;
    rebasePointer();
  }
  function box() {
    const idle = phase === "ready" || phase === "loading" || phase === "error";
    const landing =
      phase === "intro" ? 1 - clamp(intro / 1.2, 0, 1) : idle ? 1 : 0;
    const fightH = Math.min(h * (form === 2 ? 0.36 : 0.39), w * 0.54, 330),
      idleH = Math.min(h * 0.55, w * 0.72, 490);
    let height = fightH + (idleH - fightH) * landing;
    let cx =
      w / 2 +
      (idle
        ? reduced
          ? 0
          : Math.sin(time * 0.4) * 4
        : Math.sin(formTime * 0.34) * Math.min(w * 0.13, 90) * (1 - landing));
    let cy =
      h * ((form === 2 ? 0.32 : 0.27) + landing * (form === 2 ? 0.12 : 0.17)) +
      (idle || reduced ? 0 : Math.sin(formTime * 0.6) * 6);
    if (phase === "transform") {
      const t = smooth(transformTime / ENCOUNTER.transformSeconds);
      cx = transformFrom.x + (w / 2 - transformFrom.x) * t;
      cy = transformFrom.y + (h * 0.32 - transformFrom.y) * t;
      height = transformFrom.height + (fightH - transformFrom.height) * t;
    }
    const width = (height * cols) / rows;
    return {
      x: cx - width / 2,
      y: cy - height / 2,
      cx,
      cy,
      width,
      height,
      cell: width / cols,
    };
  }
  function place() {
    const b = box();
    for (const p of pixels)
      if (p.alive && !p.loose) {
        p.x = b.x + (p.col + 0.5) * b.cell;
        p.y = b.y + (p.row + 0.5) * b.cell;
      }
    return b;
  }
  function indexPixels() {
    pixelMap.clear();
    for (const p of pixels) pixelMap.set(p.row * cols + p.col, p);
  }
  function chain(count = 1) {
    grazeCount += count;
    combo = Math.min(4, 1 + Math.floor(grazeCount / 3));
    comboTime = 6;
  }
  function charge(amount: number) {
    if (phase !== "fight" || player.overdrive > 0) return;
    player.charge = Math.min(100, player.charge + amount);
    if (player.charge < 100) return;
    player.charge = 0;
    player.overdrive = OVERDRIVE_SECONDS;
    player.invincible = Math.max(player.invincible, 0.9);
    stats.overdrives++;
    upgradeFlash = 1.1;
    ring(player.x, player.y, "#f3d99d", 350, 0.65);
    sound.note(440, 0.18, 0.024);
    sound.note(660, 0.2, 0.02, 0.12);
    sound.note(880, 0.3, 0.018, 0.24);
  }
  function spark(x: number, y: number, ink: string, count: number, force = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = (30 + Math.random() * 170) * force;
      const s = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.45,
        max: 0.75,
        ink,
        size: 1 + Math.floor(Math.random() * 3),
      };
      const old = sparks.find((p) => p.life <= 0);
      if (old) Object.assign(old, s);
      else if (sparks.length < 600) sparks.push(s);
    }
  }
  function ring(x: number, y: number, ink: string, speed = 260, life = 0.6) {
    if (rings.length < 18) rings.push({ x, y, age: 0, ink, speed, life });
  }
  function points(amount: number) {
    score += Math.round(amount) * combo;
  }
  function fire(
    x: number,
    y: number,
    vx: number,
    vy: number,
    friendly: boolean,
    kind: Shot["kind"] = friendly ? "bolt" : "orb",
    power = 1,
  ) {
    const data: Shot = {
      x,
      y,
      px: x,
      py: y,
      vx,
      vy,
      life: kind === "missile" ? 5 : friendly ? 3 : 9,
      age: 0,
      friendly,
      kind,
      grazed: false,
      damage: !friendly
        ? 1
        : kind === "missile"
          ? ENCOUNTER.missileDamage
          : ENCOUNTER.boltDamage,
    };
    if (friendly) data.damage *= power * (player.overdrive > 0 ? 1.3 : 1);
    const old = shots.find((s) => s.life <= 0);
    if (old) Object.assign(old, data);
    else if (shots.length < 360) shots.push(data);
  }
  function clearBullets(reward = false) {
    for (const shot of shots)
      if (shot.life > 0 && !shot.friendly) {
        shot.life = 0;
        spark(shot.x, shot.y, "#b9e2ce", 2, 0.5);
        if (reward) points(10);
      }
    beams.length = 0;
  }
  function drop(x: number, y: number, kind: Pickup["kind"]) {
    if (pickups.length < 9) pickups.push({ x, y, kind, age: 0, alive: true });
  }
  function destroyDrone(drone: Drone) {
    drone.hp = 0;
    points(100);
    stats.drones++;
    chain(2);
    charge(9);
    spark(drone.x, drone.y, "#e7ab87", 20);
    ring(drone.x, drone.y, "#e9aa85", 110, 0.4);
    drop(
      drone.x,
      drone.y,
      droneCount++ % 2 === 0 ? "spread" : player.lives < 3 ? "shield" : "pulse",
    );
    sound.note(145, 0.1, 0.025);
  }
  function beginSecondForm() {
    const b = box();
    transformFrom = { x: b.cx, y: b.cy, height: b.height };
    form = 2;
    formTime = 0;
    transformTime = 0;
    meowed = false;
    phaseTo("transform");
    points(300);
    hp = 0;
    stage = 1;
    phaseShift = 0;
    volley = null;
    volleyTurn = 0;
    focusRay.active = false;
    slowTime = 0;
    clearBullets();
    shots.length = drones.length = pickups.length = beams.length = 0;
    player.lives = 3;
    player.energy = 1;
    player.invincible = 2;
    const blush = new Map(
      createBlush(cols, rows).map((p) => [p.row * cols + p.col, p.ink]),
    );
    for (const p of pixels) {
      p.blush = blush.get(p.row * cols + p.col);
      p.reveal = hash(p.col, p.row);
      p.alive = true;
      p.loose = false;
      p.vx = p.vy = 0;
      p.repair = undefined;
    }
    for (const p of createCatEars(cols, rows))
      pixels.push({
        ...p,
        ear: true,
        reveal: hash(p.col, p.row),
        alive: true,
        loose: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    indexPixels();
    ring(b.cx, b.cy, "#efb0d2", 180, 1.2);
    sound.note(1108, 0.22, 0.012);
    sound.note(1397, 0.3, 0.01, 0.16);
    sound.note(1661, 0.4, 0.008, 0.32);
  }
  function damageBoss(amount: number, x: number, y: number) {
    if (phase !== "fight") return;
    hp = Math.max(0, hp - amount);
    points(amount * 20);
    player.energy = Math.min(1, player.energy + amount * 0.012);
    charge(amount * 0.2);
    impact = reduced ? 0 : 0.16;
    impactX = x;
    impactY = y;
    spark(x, y, form === 2 ? "#efbad8" : "#cbdcb2", 3, 0.5);
    sound.note(170 + Math.random() * 80, 0.035, 0.009);
    if (hp > 0) return;
    if (form === 1) {
      beginSecondForm();
      return;
    }
    points(1000);
    phaseTo("dying");
    endTime = 0;
    clearBullets();
    drones.length = 0;
    hitStop = reduced ? 0 : 0.08;
    const b = box();
    for (const p of pixels) {
      p.loose = true;
      p.repair = undefined;
      const direction = unitVector(p.x - b.cx, p.y - b.cy);
      p.vx = direction.x * (70 + Math.random() * 270);
      p.vy = direction.y * (80 + Math.random() * 180);
    }
    ring(b.cx, b.cy, "#dbe9bb", 700, 1.1);
    ring(b.cx, b.cy, "#91c8ba", 430, 1.4);
    sound.note(440, 0.15, 0.04);
    sound.note(660, 0.2, 0.03, 0.12);
    sound.note(880, 0.4, 0.03, 0.26);
  }
  function hurt() {
    if (phase !== "fight" || player.invincible > 0 || player.dashTime > 0)
      return;
    player.lives--;
    stats.hits++;
    player.invincible = 2.1;
    hurtFlash = 0.55;
    player.weapon = Math.max(1, player.weapon - 1);
    combo = 1;
    comboTime = 0;
    grazeCount = 0;
    kick = reduced ? 0 : 2;
    spark(player.x, player.y, "#edab8c", 28);
    ring(player.x, player.y, "#eeaa8c", 190, 0.5);
    sound.note(74, 0.18, 0.05);
    // Clear a small recovery pocket so consecutive hits cannot chain immediately.
    for (const shot of shots)
      if (
        !shot.friendly &&
        Math.hypot(shot.x - player.x, shot.y - player.y) < 80
      )
        shot.life = 0;
    if (!player.lives) {
      endTime = 0;
      phaseTo("lose");
    }
  }
  function dash() {
    if (
      (phase !== "fight" && phase !== "intro" && phase !== "transform") ||
      paused ||
      !dashFlight(player, flightInput(), { width: w, height: h })
    )
      return false;
    player.invincible = Math.max(player.invincible, 0.25);
    dashTrailAt = 0;
    ring(player.x, player.y, "#a3d5c5", 180, 0.22);
    sound.note(310, 0.13, 0.024);
    canvas.focus({ preventScroll: true });
    return true;
  }
  function pulse() {
    if (phase !== "fight" || paused || player.energy < 0.999) return false;
    player.energy = 0;
    player.invincible = Math.max(player.invincible, 0.65);
    clearBullets(true);
    volley = null;
    attackTimer = Math.max(attackTimer, 1.25);
    ring(player.x, player.y, "#b7f0d9", 980, 0.85);
    ring(player.x, player.y, "#e9edc9", 650, 0.6);
    kick = reduced ? 0 : 3;
    for (const drone of drones) if (drone.hp > 0) destroyDrone(drone);
    const b = place();
    damageBoss(ENCOUNTER.pulseDamage, b.cx, b.cy);
    sound.note(54, 0.45, 0.05);
    sound.note(220, 0.3, 0.02);
    canvas.focus({ preventScroll: true });
    hud();
    return true;
  }
  function start() {
    if (phase !== "ready") return;
    sound.unlock();
    sound.resetMusic();
    sound.note(330, 0.08, 0.025);
    sound.note(660, 0.14, 0.02, 0.1);
    intro = 0;
    phaseTo("intro");
    canvas.focus({ preventScroll: true });
  }
  function reset() {
    hp = MAX_HP;
    echoHp = MAX_HP;
    Object.assign(stats, createRunStats());
    volley = null;
    volleyTurn = focusTimer = slowTime = hurtFlash = upgradeFlash = 0;
    focusRay.active = false;
    focusLatch = false;
    form = 1;
    formTime = transformTime = 0;
    meowed = false;
    pixels = pixels.filter((p) => !p.ear);
    stage = 1;
    score = 0;
    combo = 1;
    comboTime = grazeCount = 0;
    intro = impact = kick = endTime = phaseShift = hitStop = 0;
    Object.assign(player, {
      x: w / 2,
      y: h * 0.8,
      vx: 0,
      vy: 0,
      lives: 3,
      invincible: 0,
      bank: 0,
      focused: false,
      dashSpeed: 0,
      dashTime: 0,
      dashCooldown: 0,
      aimX: 0,
      aimY: -1,
      energy: 1,
      spread: 0,
      weapon: 1,
      charge: 0,
      overdrive: 0,
    });
    shots.length =
      sparks.length =
      drones.length =
      pickups.length =
      rings.length =
      beams.length =
      trails.length =
        0;
    shotTimer = 0;
    missileTimer = 1;
    attackTimer = 2;
    droneTimer = 7;
    laserTimer = 7;
    droneCount = 0;
    firstPickup = false;
    keys.clear();
    pointer = null;
    accumulator = 0;
    previousPosition.x = lastRendered.x = player.x;
    previousPosition.y = lastRendered.y = player.y;
    for (const p of pixels) {
      p.blush = undefined;
      p.alive = true;
      p.loose = false;
      p.vx = p.vy = 0;
      p.repair = undefined;
    }
    indexPixels();
    if (paused) {
      paused = false;
      onPause(false);
    }
    phaseTo("ready");
    hud();
    start();
  }
  function continueStage() {
    if (phase !== "lose" || form !== 2) return false;
    stats.continues++;
    score = Math.floor(score * 0.6);
    hp = echoHp = MAX_HP;
    stage = 1;
    formTime = intro = endTime = focusTimer = slowTime = hurtFlash = 0;
    attackTimer = 2;
    droneTimer = 8;
    laserTimer = 7;
    volleyTurn = 0;
    shotTimer = 0;
    missileTimer = 1;
    droneCount = 0;
    upgradeFlash = 0;
    sound.resetMusic();
    volley = null;
    firstPickup = false;
    focusRay.active = false;
    shots.length =
      sparks.length =
      drones.length =
      pickups.length =
      beams.length =
      trails.length =
      rings.length =
        0;
    Object.assign(player, {
      x: w / 2,
      y: h * 0.8,
      vx: 0,
      vy: 0,
      lives: 3,
      energy: 1,
      charge: 0,
      overdrive: 0,
      weapon: 2,
      spread: 0,
      invincible: 3,
      dashTime: 0,
      dashCooldown: 0,
      bank: 0,
      focused: false,
    });
    for (const p of pixels) {
      p.alive = true;
      p.loose = false;
      p.repair = undefined;
      p.vx = p.vy = 0;
    }
    keys.clear();
    focusLatch = false;
    pointer = null;
    accumulator = 0;
    previousPosition.x = lastRendered.x = player.x;
    previousPosition.y = lastRendered.y = player.y;
    combo = 1;
    comboTime = grazeCount = 0;
    phaseTo("intro");
    canvas.focus({ preventScroll: true });
    return true;
  }
  function toggleFocus() {
    if (
      paused ||
      (phase !== "fight" && phase !== "intro" && phase !== "transform")
    )
      return;
    focusLatch = !focusLatch;
    canvas.focus({ preventScroll: true });
  }
  function togglePause() {
    if (phase !== "fight" && phase !== "intro" && phase !== "transform") return;
    paused = !paused;
    if (paused) {
      player.x = lastRendered.x;
      player.y = lastRendered.y;
    }
    keys.clear();
    pointer = null;
    player.vx = player.vy = 0;
    accumulator = 0;
    previousPosition.x = player.x;
    previousPosition.y = player.y;
    onPause(paused);
    if (!paused) canvas.focus({ preventScroll: true });
  }
  function suspend() {
    keys.clear();
    pointer = null;
    if (
      !paused &&
      (phase === "fight" || phase === "intro" || phase === "transform")
    )
      togglePause();
  }

  function advanceBoss(dt: number, b: ReturnType<typeof box>) {
    const next = hp > (MAX_HP * 2) / 3 ? 1 : hp > MAX_HP / 3 ? 2 : 3;
    if (next !== stage) {
      stage = next;
      clearBullets();
      volley = null;
      attackTimer = 1.7;
      laserTimer = 4;
      ring(b.cx, b.cy, form === 2 ? "#e6add2" : "#9fc6c7", 150, 0.8);
      drop(
        b.cx,
        Math.min(h * 0.6, b.cy + b.height * 0.65),
        player.lives < 3 ? "shield" : "pulse",
      );
    }
    attackTimer -= dt;
    droneTimer -= dt;
    if (!volley && attackTimer <= WARNING_SECONDS) {
      const speed = clamp(
        h * 0.16,
        ENCOUNTER.enemyMinSpeed,
        ENCOUNTER.enemyMaxSpeed,
      );
      volley = planVolley(
        form,
        volleyTurn,
        b.cx,
        b.cy + b.height * 0.23,
        player.x,
        player.y,
        w,
        speed,
      );
      sound.note(form === 2 ? 523 : 196, 0.1, 0.007);
    }
    if (attackTimer <= 0 && volley) {
      for (const shot of volley.shots)
        fire(shot.x, shot.y, shot.vx, shot.vy, false);
      volley = null;
      volleyTurn++;
      attackTimer = form === 2 ? 2.85 : 2.45;
    }
    if (form === 2 && stage === 3) {
      laserTimer -= dt;
      if (laserTimer <= 0) {
        laserTimer = 8;
        beams.push({
          x: b.cx,
          y: b.cy,
          target: clamp(player.x, 35, w - 35),
          age: 0,
        });
        sound.note(130, 0.25, 0.015);
      }
    }
    if (droneTimer <= 0 && drones.filter((d) => d.hp > 0).length < 2) {
      droneTimer = form === 2 ? 12 : 13;
      for (const side of [-1, 1])
        drones.push({
          x: side < 0 ? w * 0.1 : w * 0.9,
          y: -30,
          origin: side < 0 ? w * 0.12 : w * 0.88,
          age: 0,
          hp: 1.8,
          shotAt: 3,
          side,
          seed: Math.random() * 10,
        });
    }
    if (!firstPickup && formTime > 4) {
      firstPickup = true;
      drop(w / 2, h * 0.56, "spread");
    }
  }
  function focusTarget(b: ReturnType<typeof box>) {
    const drone = drones.find(
      (d) => d.hp > 0 && d.y < player.y - 35 && Math.abs(d.x - player.x) < 21,
    );
    if (drone) return { y: drone.y, drone, pixel: undefined };
    const center = Math.floor((player.x - b.x) / b.cell);
    for (let row = rows - 1; row >= -Math.ceil(rows * 0.25); row--) {
      for (
        let col = Math.max(0, center - 1);
        col <= Math.min(cols - 1, center + 1);
        col++
      ) {
        const pixel = pixelMap.get(row * cols + col);
        if (pixel?.alive && !pixel.loose && pixel.y < player.y - 30)
          return { y: pixel.y, pixel, drone: undefined };
      }
    }
    return { y: -15, drone: undefined, pixel: undefined };
  }
  function portraitHit(shot: Shot, b: ReturnType<typeof box>) {
    const radius = b.cell * (shot.kind === "missile" ? 1.9 : 0.85);
    const left = Math.max(
      0,
      Math.floor((Math.min(shot.px, shot.x) - radius - b.x) / b.cell),
    );
    const right = Math.min(
      cols - 1,
      Math.ceil((Math.max(shot.px, shot.x) + radius - b.x) / b.cell),
    );
    const top = Math.max(
      -Math.ceil(rows * 0.25),
      Math.floor((Math.min(shot.py, shot.y) - radius - b.y) / b.cell),
    );
    const bottom = Math.min(
      rows - 1,
      Math.ceil((Math.max(shot.py, shot.y) + radius - b.y) / b.cell),
    );
    for (let row = bottom; row >= top; row--)
      for (let col = left; col <= right; col++) {
        const p = pixelMap.get(row * cols + col);
        if (
          p?.alive &&
          !p.loose &&
          segmentHitsCircle(shot.px, shot.py, shot.x, shot.y, p.x, p.y, radius)
        )
          return p;
      }
  }
  function update(dt: number) {
    if (paused) return;
    time += dt;
    backgroundDrift +=
      dt *
      (phase === "ready" || phase === "loading"
        ? 4
        : player.dashTime > 0
          ? 70
          : 28);
    if (hitStop > 0) {
      hitStop = Math.max(0, hitStop - dt);
      return;
    }
    const active =
      phase === "fight" || phase === "intro" || phase === "transform";
    if (active) {
      stats.seconds += dt;
      if (phase !== "transform") sound.music(dt, form, player.overdrive > 0);
    }
    echoHp += (hp - echoHp) * (1 - Math.exp(-dt * (hp > echoHp ? 12 : 3)));
    slowTime = Math.max(0, slowTime - dt);
    hurtFlash = Math.max(0, hurtFlash - dt);
    upgradeFlash = Math.max(0, upgradeFlash - dt);
    const enemyDt = dt * (slowTime > 0 ? 0.38 : 1);
    if (phase === "fight") formTime += dt;
    if (phase === "transform") {
      transformTime += dt;
      hp = MAX_HP * smooth((transformTime - 0.4) / 2.2);
      if (!meowed && transformTime > 1.15) {
        meowed = true;
        sound.meow();
      }
      if (transformTime >= ENCOUNTER.transformSeconds) {
        hp = MAX_HP;
        formTime = 0;
        stage = 1;
        attackTimer = 2;
        droneTimer = 8;
        laserTimer = 7;
        firstPickup = false;
        player.lives = 3;
        player.energy = 1;
        player.invincible = 1.5;
        phaseTo("fight");
      }
    }
    if (phase === "intro") {
      intro += dt;
      if (intro >= 1.2) phaseTo("fight");
    }
    if (phase === "dying" || phase === "lose" || phase === "win") endTime += dt;
    if (phase === "dying" && endTime > 1.45) phaseTo("win");
    impact = Math.max(0, impact - dt);
    kick = Math.max(0, kick - dt * 24);
    phaseShift = Math.max(0, phaseShift - dt);
    player.invincible = Math.max(0, player.invincible - dt);
    if (phase !== "transform") player.spread = Math.max(0, player.spread - dt);
    if (phase === "fight")
      player.overdrive = Math.max(0, player.overdrive - dt);
    comboTime = Math.max(0, comboTime - dt);
    if (comboTime === 0) {
      combo = 1;
      grazeCount = 0;
    }
    if (active) {
      const motion = stepFlight(player, flightInput(), dt, {
        width: w,
        height: h,
      });
      if (motion.dashed) {
        dashTrailAt -= dt;
        if (dashTrailAt <= 0 && !reduced) {
          dashTrailAt = 0.018;
          trails.push({ x: player.x, y: player.y, bank: player.bank, age: 0 });
        }
      }
      if (motion.dashEnded) rebasePointer();
      if (phase === "fight") {
        player.energy = Math.min(1, player.energy + dt * 0.04);
        shotTimer -= dt;
        missileTimer -= dt;
        if (shotTimer <= 0) {
          shotTimer =
            player.spread > 0
              ? ENCOUNTER.spreadInterval
              : ENCOUNTER.boltInterval;
          const target = drones.find(
            (d) => d.hp > 0 && d.y < player.y - 80,
          ) ?? { x: box().cx, y: box().cy };
          const aim =
            Math.abs(target.x - player.x) < 170
              ? clamp(
                  (target.x - player.x) / Math.max(120, player.y - target.y),
                  -0.12,
                  0.12,
                ) * ENCOUNTER.boltSpeed
              : 0;
          for (const side of [-1, 1])
            fire(
              player.x + side * 9,
              player.y - 18,
              aim,
              -ENCOUNTER.boltSpeed,
              true,
            );
          if (player.spread > 0 || player.weapon >= 2 || player.overdrive > 0)
            for (const side of [-1, 1])
              fire(
                player.x + side * 13,
                player.y - 10,
                side * 90,
                -560,
                true,
                "bolt",
                0.55,
              );
          if (player.weapon >= 3 || player.overdrive > 0)
            for (const side of [-1, 1])
              fire(
                player.x + side * 35,
                player.y + 2,
                aim * 0.6,
                -ENCOUNTER.boltSpeed,
                true,
                "bolt",
                0.5,
              );
          sound.note(910, 0.022, 0.006);
        }
        if (missileTimer <= 0) {
          missileTimer = player.spread > 0 ? 3.6 : ENCOUNTER.missileInterval;
          for (const side of [-1, 1])
            fire(
              player.x + side * 20,
              player.y,
              side * 100,
              -160,
              true,
              "missile",
            );
        }
      }
      if (!reduced && Math.random() < dt * 50)
        spark(player.x, player.y + 21, "#b1dac0", 1, 0.16);
    } else if (phase === "dying") {
      player.y = Math.max(-50, player.y - dt * 130);
      player.x += (w / 2 - player.x) * dt * 2;
    }
    const b = place();
    if (phase === "fight") advanceBoss(enemyDt, b);
    focusRay.active =
      phase === "fight" && player.focused && player.dashTime <= 0;
    if (focusRay.active) {
      const target = focusTarget(b);
      focusRay.x = player.x;
      focusRay.y = target.y;
      focusTimer -= dt;
      if (focusTimer <= 0) {
        focusTimer = 0.12;
        const damage = player.overdrive > 0 ? 0.22 : 0.14;
        if (target.drone) {
          target.drone.hp -= damage;
          spark(player.x, target.y, "#c3f1df", 1, 0.25);
          if (target.drone.hp <= 0) destroyDrone(target.drone);
        } else if (target.pixel) damageBoss(damage, player.x, target.y);
      }
    } else focusTimer = 0;
    for (const drone of drones) {
      if (drone.hp <= 0) continue;
      drone.age += enemyDt;
      drone.x = clamp(
        drone.origin -
          drone.side * Math.sin(drone.age * 0.65) * w * 0.22 +
          Math.sin(drone.age * 1.8 + drone.seed) * 22,
        20,
        w - 20,
      );
      drone.y = -30 + drone.age * 34;
      if (drone.y > h + 30) {
        drone.hp = 0;
        continue;
      }
      if (phase === "fight") {
        drone.shotAt -= enemyDt;
        if (drone.shotAt < 0.75 && drone.targetX === undefined) {
          drone.targetX = player.x;
          drone.targetY = player.y;
        }
        if (drone.shotAt <= 0) {
          drone.shotAt = 3.8;
          const aim = Math.atan2(
            (drone.targetY ?? player.y) - drone.y,
            (drone.targetX ?? player.x) - drone.x,
          );
          for (let i = -1; i <= 1; i++)
            fire(
              drone.x,
              drone.y,
              Math.cos(aim + i * 0.24) * 95,
              Math.sin(aim + i * 0.24) * 95,
              false,
            );
          drone.targetX = drone.targetY = undefined;
        }
        if (Math.hypot(player.x - drone.x, player.y - drone.y) < 24) hurt();
      }
    }
    if (
      phase === "fight" &&
      Math.hypot(
        (player.x - b.cx) / (b.width * 0.34),
        (player.y - b.cy) / (b.height * 0.4),
      ) < 1
    )
      hurt();
    for (const beam of beams) {
      beam.age += enemyDt;
      if (
        phase === "fight" &&
        beam.age > ENCOUNTER.beamWarning &&
        beam.age < ENCOUNTER.beamEnd &&
        segmentHitsCircle(
          beam.x,
          beam.y,
          beam.target,
          h - 45,
          player.x,
          player.y,
          10,
        )
      )
        hurt();
    }
    for (const shot of shots) {
      if (shot.life <= 0) continue;
      shot.px = shot.x;
      shot.py = shot.y;
      shot.age += dt;
      if (shot.kind === "missile" && shot.age > 0.13) {
        const target = drones.find((d) => d.hp > 0 && d.y > 30) ?? {
          x: b.cx,
          y: b.cy,
        };
        const aim = unitVector(target.x - shot.x, target.y - shot.y),
          response = Math.min(1, dt * 5.5);
        shot.vx += (aim.x * 330 - shot.vx) * response;
        shot.vy += (aim.y * 330 - shot.vy) * response;
        if (!reduced && Math.random() < dt * 35)
          spark(shot.x, shot.y, "#a7bea1", 1, 0.15);
      }
      const shotDt = shot.friendly ? dt : enemyDt;
      shot.x += shot.vx * shotDt;
      shot.y += shot.vy * shotDt;
      shot.life -= dt;
      if (shot.x < -30 || shot.x > w + 30 || shot.y < -30 || shot.y > h + 30) {
        shot.life = 0;
        continue;
      }
      if (phase !== "fight") continue;
      if (!shot.friendly) {
        const near = Math.hypot(shot.x - player.x, shot.y - player.y);
        if (
          player.dashTime > 0 &&
          segmentHitsCircle(
            shot.px,
            shot.py,
            shot.x,
            shot.y,
            player.x,
            player.y,
            34,
          )
        ) {
          shot.life = 0;
          stats.parries++;
          chain();
          points(30);
          charge(8);
          player.energy = Math.min(1, player.energy + 0.1);
          slowTime = 0.45;
          ring(shot.x, shot.y, "#f2dfa9", 120, 0.28);
          spark(shot.x, shot.y, "#f3dfa7", 7, 0.4);
          sound.note(990, 0.09, 0.014);
          continue;
        }
        if (
          segmentHitsCircle(
            shot.px,
            shot.py,
            shot.x,
            shot.y,
            player.x,
            player.y,
            8,
          )
        ) {
          if (player.invincible <= 0 && player.dashTime <= 0) {
            shot.life = 0;
            hurt();
          }
        } else if (near < 31 && !shot.grazed && player.invincible <= 0) {
          shot.grazed = true;
          stats.grazes++;
          chain();
          charge(3.5);
          points(15);
          player.energy = Math.min(1, player.energy + 0.045);
          spark(player.x, player.y, "#b6e2d0", 3, 0.3);
        }
      } else {
        const drone = drones.find(
          (d) =>
            d.hp > 0 &&
            segmentHitsCircle(shot.px, shot.py, shot.x, shot.y, d.x, d.y, 17),
        );
        if (drone) {
          drone.hp -= shot.damage;
          shot.life = 0;
          spark(drone.x, drone.y, "#e7ac8a", 5);
          if (drone.hp <= 0) destroyDrone(drone);
          continue;
        }
        if (
          shot.x < b.x - 10 ||
          shot.x > b.x + b.width + 10 ||
          shot.y > b.y + b.height + 22 ||
          shot.py < b.y - (form === 2 ? b.height * 0.26 : 10)
        )
          continue;
        const hit = portraitHit(shot, b);
        if (hit) {
          shot.life = 0;
          hit.loose = true;
          hit.repair = 0.5 + Math.random() * 0.4;
          hit.vx = (Math.random() - 0.5) * 130;
          hit.vy = 80;
          damageBoss(shot.damage, hit.x, hit.y);
        }
      }
    }
    for (const pickup of pickups) {
      if (!pickup.alive) continue;
      pickup.age += dt;
      const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
      if (distance < 110 && phase === "fight") {
        const direction = unitVector(player.x - pickup.x, player.y - pickup.y);
        pickup.x += direction.x * dt * 220;
        pickup.y += direction.y * dt * 220;
      } else pickup.y += dt * 52;
      if (distance < 26 && phase === "fight") {
        pickup.alive = false;
        points(50);
        if (pickup.kind === "spread") {
          player.spread = 9;
          player.weapon = Math.min(3, player.weapon + 1);
          upgradeFlash = 1;
        } else if (pickup.kind === "shield")
          player.lives = Math.min(3, player.lives + 1);
        else player.energy = Math.min(1, player.energy + 0.65);
        charge(12);
        chain();
        ring(player.x, player.y, "#c8e5b0", 130, 0.4);
        sound.note(660, 0.08, 0.018);
        sound.note(990, 0.1, 0.018, 0.07);
      }
      if (pickup.age > 13 || pickup.y > h + 20) pickup.alive = false;
    }
    for (const p of pixels) {
      if (p.repair !== undefined && phase === "fight") {
        p.repair -= dt;
        if (p.repair <= 0) {
          p.repair = undefined;
          p.loose = false;
          p.alive = true;
          p.vx = p.vy = 0;
        }
      }
      if (p.loose && p.alive) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 100 * dt;
        if (p.y > h + 30 || p.x < -40 || p.x > w + 40) p.alive = false;
      }
    }
    for (const s of sparks)
      if (s.life > 0) {
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - dt * 1.7;
        s.vy *= 1 - dt * 1.7;
      }
    for (const r of rings) r.age += dt;
    for (const t of trails) t.age += dt;
    for (let i = rings.length - 1; i >= 0; i--)
      if (rings[i].age > rings[i].life) rings.splice(i, 1);
    for (let i = trails.length - 1; i >= 0; i--)
      if (trails[i].age > 0.3) trails.splice(i, 1);
    for (let i = beams.length - 1; i >= 0; i--)
      if (beams[i].age > ENCOUNTER.beamLife) beams.splice(i, 1);
    for (let i = pickups.length - 1; i >= 0; i--)
      if (!pickups[i].alive) pickups.splice(i, 1);
    for (let i = drones.length - 1; i >= 0; i--)
      if (drones[i].hp <= 0) drones.splice(i, 1);
  }

  function drawJet(x: number, y: number, bank: number, ghost = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.fillStyle = ghost ? "#94e3cd" : "#7e9c8a";
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, -5);
    ctx.lineTo(24, 12);
    ctx.lineTo(24, 17);
    ctx.lineTo(6, 10);
    ctx.lineTo(7, 22);
    ctx.lineTo(0, 18);
    ctx.lineTo(-7, 22);
    ctx.lineTo(-6, 10);
    ctx.lineTo(-24, 17);
    ctx.lineTo(-24, 12);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    if (!ghost) {
      ctx.fillStyle = "#e9edc9";
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(3, -10);
      ctx.lineTo(3, 18);
      ctx.lineTo(-3, 18);
      ctx.lineTo(-3, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#bdcfae";
      ctx.fillRect(-20, 12, 11, 2);
      ctx.fillRect(9, 12, 11, 2);
      ctx.fillStyle = "#edb08e";
      ctx.fillRect(-11, 8, 5, 2);
      ctx.fillRect(6, 8, 5, 2);
      ctx.fillStyle = "#203f37";
      ctx.fillRect(-1.7, -10, 3.4, 10);
      ctx.fillStyle = player.dashTime > 0 ? "#b6f0db" : "#e9ac83";
      ctx.fillRect(
        -2,
        20,
        4,
        player.dashTime > 0 ? 27 : reduced ? 8 : 9 + Math.sin(time * 40) * 3,
      );
      ctx.fillStyle = "#f1eecb";
      ctx.fillRect(-1, 20, 2, 7);
      if (player.spread > 0) {
        ctx.fillStyle = "#a8e0c9";
        ctx.fillRect(-30, 2, 4, 10);
        ctx.fillRect(26, 2, 4, 10);
      }
      if (player.weapon >= 3 || player.overdrive > 0) {
        for (const side of [-1, 1]) {
          ctx.fillStyle = player.overdrive > 0 ? "#f3dba1" : "#a4dac8";
          ctx.fillRect(side * 35 - 3, -5, 6, 15);
          ctx.fillStyle = "#eaf1cf";
          ctx.fillRect(side * 35 - 1, -8, 2, 10);
        }
      }
      ctx.strokeStyle = "#b8ecd4aa";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, player.focused ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawCombat(b: ReturnType<typeof box>) {
    if (volley && phase === "fight") {
      const progress = clamp(1 - attackTimer / WARNING_SECONDS, 0, 1);
      ctx.strokeStyle = form === 2 ? "#f4a7d5" : "#ebba90";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15 + progress * 0.5;
      for (const shot of volley.shots) {
        const v = unitVector(shot.vx, shot.vy);
        ctx.beginPath();
        ctx.moveTo(shot.x + v.x * 13, shot.y + v.y * 13);
        ctx.lineTo(
          shot.x + v.x * (35 + progress * 40),
          shot.y + v.y * (35 + progress * 40),
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 13 - progress * 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (focusRay.active) {
      const gold = player.overdrive > 0;
      ctx.strokeStyle = gold ? "#f8dca21c" : "#aff1d91c";
      ctx.lineWidth = gold ? 18 : 12;
      ctx.beginPath();
      ctx.moveTo(focusRay.x, player.y - 25);
      ctx.lineTo(focusRay.x, focusRay.y);
      ctx.stroke();
      ctx.strokeStyle = gold ? "#f2dba3" : "#aee6cf";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = "#f3f5d9";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      if (focusRay.y > 0)
        sparkle(
          focusRay.x,
          focusRay.y,
          reduced ? 4 : 4 + Math.sin(time * 22) * 2,
          0.8,
        );
    }
    if (phase === "fight" && (player.charge > 0 || player.overdrive > 0)) {
      const amount =
        player.overdrive > 0
          ? player.overdrive / OVERDRIVE_SECONDS
          : player.charge / 100;
      ctx.strokeStyle = player.overdrive > 0 ? "#f4dca3" : "#a4d8c87d";
      ctx.lineWidth = player.overdrive > 0 ? 2 : 1;
      ctx.beginPath();
      ctx.arc(
        player.x,
        player.y,
        39,
        -Math.PI / 2,
        -Math.PI / 2 + amount * Math.PI * 2,
      );
      ctx.stroke();
      if (player.overdrive > 0) {
        for (let i = 0; i < 4; i++) {
          const a = time * (reduced ? 0 : 0.6) + (i * Math.PI) / 2;
          sparkle(
            player.x + Math.cos(a) * 43,
            player.y + Math.sin(a) * 43,
            3,
            0.65,
          );
        }
      }
    }
    if (upgradeFlash > 0 && phase === "fight") {
      ctx.globalAlpha = Math.min(1, upgradeFlash * 2);
      ctx.fillStyle = player.overdrive > 0 ? "#f3dba3" : "#bbe9d3";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        player.overdrive > 0
          ? "OVERDRIVE"
          : `MK.${["I", "II", "III"][player.weapon - 1]}`,
        player.x,
        player.y + 62 - (1 - Math.min(1, upgradeFlash)) * 9,
      );
      ctx.globalAlpha = 1;
    }
    if (hurtFlash > 0 && !reduced) {
      ctx.strokeStyle = `rgba(237,171,140,${hurtFlash * 0.4})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
    if (slowTime > 0 && !reduced) {
      ctx.strokeStyle = `rgba(243,220,164,${slowTime * 0.22})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 42 + (0.45 - slowTime) * 140, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Tiny health thirds indicate changes of pattern without attack-name banners.
    if (phase === "fight") {
      ctx.strokeStyle = form === 2 ? "#e5b5d252" : "#adc6a938";
      ctx.lineWidth = 1;
      for (const fraction of [1 / 3, 2 / 3]) {
        const angle = -Math.PI / 2 + fraction * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(
          b.cx + Math.cos(angle) * b.height * 0.67,
          b.cy + Math.sin(angle) * b.height * 0.67,
        );
        ctx.lineTo(
          b.cx + Math.cos(angle) * b.height * 0.7,
          b.cy + Math.sin(angle) * b.height * 0.7,
        );
        ctx.stroke();
      }
    }
  }
  function sparkle(x: number, y: number, size: number, opacity: number) {
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#ffd4eb";
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.22, y - size * 0.22);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.22, y + size * 0.22);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.22, y + size * 0.22);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size * 0.22, y - size * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawTransformation(b: ReturnType<typeof box>) {
    const t = clamp(transformTime / ENCOUNTER.transformSeconds, 0, 1),
      envelope = Math.sin(t * Math.PI);
    const r = b.height * 0.95;
    const glow = ctx.createRadialGradient(
      b.cx,
      b.cy,
      b.height * 0.08,
      b.cx,
      b.cy,
      r,
    );
    glow.addColorStop(0, "#efa5ce33");
    glow.addColorStop(0.45, "#df8fb52a");
    glow.addColorStop(1, "#d68aad00");
    ctx.fillStyle = glow;
    ctx.globalAlpha = envelope * (reduced ? 0.4 : 1);
    ctx.fillRect(b.cx - r, b.cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    if (!reduced) {
      ctx.strokeStyle = "#efb8d7";
      ctx.lineWidth = 1;
      ctx.globalAlpha = envelope * 0.42;
      for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const a = (i / 100) * Math.PI * 2 + t * 2.1 + offset;
          const radius = b.height * (0.5 + Math.sin(a * 2 + t * 3) * 0.12);
          const x = b.cx + Math.cos(a) * radius,
            y = b.cy + Math.sin(a) * radius * 0.67;
          if (!i) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < (reduced ? 16 : 76); i++) {
      const a =
        hash(i, 7) * Math.PI * 2 + (reduced ? 0 : t * (i % 2 ? 1.4 : -1.1));
      const radius = b.height * (0.34 + hash(i, 9) * 0.57) * (1 - t * 0.12);
      const shimmer = 0.35 + Math.sin(t * 5 + i * 2.4) ** 2 * 0.65;
      sparkle(
        b.cx + Math.cos(a) * radius,
        b.cy + Math.sin(a) * radius * 0.83,
        (2.5 + hash(i, 12) * 7) * Math.max(0.25, envelope),
        envelope * shimmer,
      );
    }
  }
  function render(alpha = 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#091b18";
    ctx.fillRect(0, 0, w, h);
    const idle = phase === "ready" || phase === "loading" || phase === "error";
    ctx.save();
    if (kick > 0)
      ctx.translate(Math.sin(time * 90) * kick, Math.cos(time * 80) * kick);
    // Contour lines share the cutting mat's measured geometry, with parallax beneath flight.
    const drift = reduced ? 0 : backgroundDrift;
    ctx.strokeStyle = "#9ab79712";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let line = -3; line < 12; line++) {
      const y0 = ((line * 91 + drift) % (h + 270)) - 135;
      for (let x = -20; x < w + 40; x += 16) {
        const y =
          y0 +
          Math.sin(x * 0.007 + line * 0.9) * 34 +
          Math.sin(x * 0.014 - line) * 9;
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
      const y =
          (hash(i, 2) * h + (reduced ? 0 : time * (7 + hash(i, 3) * 24))) % h,
        x = hash(i, 1) * w;
      ctx.fillStyle = i % 7 ? "#8eb99b20" : "#d2e7bc45";
      ctx.fillRect(
        x,
        y,
        i % 7 ? 1 : 2,
        player.dashTime > 0 ? 12 : i % 7 ? 2 : 4,
      );
    }
    const b = place();
    const halo = b.height * 0.6;
    ctx.strokeStyle = form === 2 ? "#e9a9ce55" : "#94c3ab2e";
    ctx.lineWidth = 1;
    for (const scale of [1, 1.13]) {
      ctx.beginPath();
      ctx.arc(
        b.cx,
        b.cy,
        halo * scale,
        reduced ? 0 : time * 0.14,
        Math.PI * 1.52 + (reduced ? 0 : time * 0.14),
      );
      ctx.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + (reduced ? 0 : time * 0.04),
        inner = halo * 1.13;
      ctx.beginPath();
      ctx.moveTo(b.cx + Math.cos(a) * inner, b.cy + Math.sin(a) * inner);
      ctx.lineTo(
        b.cx + Math.cos(a) * (inner + (i % 3 ? 3 : 9)),
        b.cy + Math.sin(a) * (inner + (i % 3 ? 3 : 9)),
      );
      ctx.stroke();
    }
    const tear = !reduced && phaseShift > 0;
    const revealAmount = smooth((transformTime - 0.65) / 1.2);
    for (let ink = 0; ink < ALL_INKS.length; ink++) {
      ctx.fillStyle = ALL_INKS[ink];
      ctx.beginPath();
      for (const p of pixels) {
        const revealed =
          phase !== "transform" || (p.reveal ?? 0) < revealAmount;
        const pixelInk =
          form === 2 && p.blush !== undefined && revealed ? p.blush : p.ink;
        if (p.alive && pixelInk === ink && (!p.ear || revealed)) {
          const size = b.cell * (p.loose ? 0.65 : 0.88),
            shift =
              tear && p.row % 13 < 3 ? Math.sin(p.row * 4 + time * 5) * 13 : 0;
          ctx.rect(
            Math.round(p.x - size / 2 + shift),
            Math.round(p.y - size / 2),
            Math.ceil(size),
            Math.ceil(size),
          );
        }
      }
      ctx.fill();
    }
    if (phase === "transform") drawTransformation(b);
    else if (form === 2 && phase === "fight") {
      for (let i = 0; i < 5; i++) {
        const angle = time * (reduced ? 0 : 0.18) + i * 2.4;
        sparkle(
          b.cx + Math.cos(angle) * b.width * 0.55,
          b.y + Math.sin(angle) * b.height * 0.09,
          2.5,
          0.25 + Math.sin(time + i) ** 2 * 0.3,
        );
      }
    }
    if (tear) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#b4d7dc";
      ctx.fillRect(b.x - 8, b.y + b.height * 0.39, b.width + 16, 1);
      ctx.globalAlpha = 1;
    }
    drawCombat(b);
    for (const drone of drones)
      if (drone.hp > 0) {
        const x = drone.x,
          y = drone.y;
        ctx.fillStyle = "#d49378";
        ctx.fillRect(x - 5, y - 13, 10, 19);
        ctx.fillRect(x - 18, y - 3, 8, 5);
        ctx.fillRect(x + 10, y - 3, 8, 5);
        ctx.fillRect(x - 13, y - 10, 4, 14);
        ctx.fillRect(x + 9, y - 10, 4, 14);
        ctx.fillStyle = "#f3d1a2";
        ctx.fillRect(x - 2, y - 5, 4, 7);
        ctx.fillStyle = "#f3ad8540";
        ctx.fillRect(x - 8, y - 17, 16, 3);
        if (drone.targetX !== undefined && phase === "fight") {
          const aim = unitVector(
            drone.targetX - x,
            (drone.targetY ?? player.y) - y,
          );
          ctx.strokeStyle = "#edbb8b88";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + aim.x * 19, y + aim.y * 19);
          ctx.lineTo(x + aim.x * 53, y + aim.y * 53);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 21, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    for (const beam of beams) {
      const firing =
        beam.age > ENCOUNTER.beamWarning && beam.age < ENCOUNTER.beamEnd;
      ctx.strokeStyle = firing ? "#edb18a44" : "#e4a58366";
      ctx.lineWidth = firing ? 15 : 1;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.target, h - 45);
      ctx.stroke();
      if (firing) {
        ctx.strokeStyle = "#f4dfb7";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#c6dfb6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          beam.target,
          h - 70,
          12 + Math.sin(beam.age * 8) * 3,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    for (const shot of shots)
      if (shot.life > 0) {
        const direction = unitVector(shot.vx, shot.vy);
        if (shot.friendly) {
          const missile = shot.kind === "missile";
          ctx.strokeStyle = missile ? "#ffe0a833" : "#bcebd525";
          ctx.lineWidth = missile ? 10 : 8;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(shot.x + direction.x * 7, shot.y + direction.y * 7);
          ctx.lineTo(shot.x - direction.x * 9, shot.y - direction.y * 9);
          ctx.stroke();
          ctx.strokeStyle = missile ? "#ffe3b3" : "#c7f3de";
          ctx.lineWidth = missile ? 5 : 3.5;
          ctx.stroke();
          if (missile) {
            ctx.fillStyle = "#e7ac7b";
            ctx.fillRect(
              shot.x - direction.x * 13 - 2,
              shot.y - direction.y * 13 - 2,
              4,
              4,
            );
          }
        } else {
          const radius = ENCOUNTER.enemyRadius;
          ctx.strokeStyle = form === 2 ? "#f7a2d44d" : "#f3b5854d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(shot.x, shot.y);
          ctx.lineTo(shot.x - direction.x * 12, shot.y - direction.y * 12);
          ctx.stroke();
          ctx.fillStyle = form === 2 ? "#f29bcd20" : "#ffb37820";
          ctx.beginPath();
          ctx.arc(shot.x, shot.y, radius + 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = form === 2 ? "#ffaddb" : "#ffc28e";
          ctx.strokeStyle = form === 2 ? "#ffe6f3" : "#ffe6b6";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(shot.x, shot.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff1dc";
          ctx.beginPath();
          ctx.arc(shot.x, shot.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    for (const pickup of pickups)
      if (pickup.alive) {
        const x = pickup.x,
          y = pickup.y + Math.sin(pickup.age * 4) * 3;
        ctx.strokeStyle = pickup.kind === "shield" ? "#edc79b" : "#b4e0cb";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 12, y - 12, 24, 24);
        ctx.fillStyle = "#142f27";
        ctx.fillRect(x - 10, y - 10, 20, 20);
        ctx.fillStyle = pickup.kind === "shield" ? "#edc79b" : "#c6ebcb";
        if (pickup.kind === "shield") {
          ctx.fillRect(x - 2, y - 7, 4, 14);
          ctx.fillRect(x - 7, y - 2, 14, 4);
        } else if (pickup.kind === "spread")
          for (const dx of [-5, 0, 5])
            ctx.fillRect(x + dx - 1, y - 6 + Math.abs(dx) * 0.5, 2, 10);
        else {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(x, y, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    for (const r of rings) {
      ctx.globalAlpha = (1 - r.age / r.life) * 0.8;
      ctx.strokeStyle = r.ink;
      ctx.lineWidth = r.speed > 600 ? 3 : 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.age * r.speed, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (impact > 0 && !reduced) {
      ctx.globalAlpha = impact / 0.16;
      ctx.strokeStyle = "#e4edc8";
      ctx.lineWidth = 1;
      const r = 4 + (0.16 - impact) * 75;
      ctx.strokeRect(impactX - r, impactY - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    for (const s of sparks)
      if (s.life > 0) {
        ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
        ctx.fillStyle = s.ink;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    ctx.globalAlpha = 1;
    for (const t of trails) {
      ctx.globalAlpha = Math.max(0, 1 - t.age / 0.3) * 0.35;
      drawJet(t.x, t.y, t.bank, true);
    }
    ctx.globalAlpha = 1;
    if (!idle && phase !== "lose" && phase !== "win") {
      ctx.globalAlpha =
        player.invincible > 0 && player.dashTime <= 0 ? 0.65 : 1;
      const x = previousPosition.x + (player.x - previousPosition.x) * alpha;
      const y = previousPosition.y + (player.y - previousPosition.y) * alpha;
      lastRendered.x = x;
      lastRendered.y = y;
      drawJet(x, y, player.bank);
      ctx.globalAlpha = 1;
      if (player.invincible > 0) {
        ctx.strokeStyle = "#b5e7cf88";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (phase === "intro") {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#d9e7ba";
      ctx.font = "32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        String(Math.max(1, 3 - Math.floor(intro / 0.4))),
        w / 2,
        h * 0.64,
      );
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  const SIMULATION_STEP = 1 / 120;
  function frame(now: number) {
    if (!running) return;
    const elapsed = Math.min(0.08, Math.max(0, (now - last) / 1000));
    last = now;
    if (document.hidden || paused) {
      accumulator = 0;
      if (!document.hidden) {
        hud();
        render();
      }
    } else {
      accumulator += elapsed;
      while (accumulator + 1e-10 >= SIMULATION_STEP) {
        previousPosition.x = player.x;
        previousPosition.y = player.y;
        update(SIMULATION_STEP);
        accumulator = Math.max(0, accumulator - SIMULATION_STEP);
      }
      hud();
      render(accumulator / SIMULATION_STEP);
    }
    raf = requestAnimationFrame(frame);
  }
  function controlKey(event: KeyboardEvent) {
    const physical: Record<string, string> = {
      KeyW: "w",
      KeyA: "a",
      KeyS: "s",
      KeyD: "d",
      KeyX: "x",
      KeyP: "p",
      Space: " ",
      ShiftLeft: "shift",
      ShiftRight: "shift",
    };
    return physical[event.code] ?? event.key.toLowerCase();
  }
  function down(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = controlKey(event);
    if (key === "p" && !event.repeat) {
      event.preventDefault();
      togglePause();
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a, input, textarea, select")
    )
      return;
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "shift",
      ].includes(key)
    ) {
      event.preventDefault();
      keys.add(key);
      if (key !== "shift") pointer = null;
    }
    if (key === " " && !event.repeat) {
      event.preventDefault();
      dash();
    }
    if (key === "x" && !event.repeat) {
      event.preventDefault();
      pulse();
    }
  }
  function up(event: KeyboardEvent) {
    keys.delete(controlKey(event));
  }
  function pointDown(event: PointerEvent) {
    if (phase !== "fight" && phase !== "intro" && phase !== "transform") return;
    if (event.button === 2) {
      event.preventDefault();
      pulse();
      return;
    }
    if (pointer || (event.button !== 0 && event.button !== undefined)) return;
    if (player.dashTime > 0) {
      player.dashTime = 0;
      player.x = previousPosition.x = lastRendered.x;
      player.y = previousPosition.y = lastRendered.y;
    }
    pointer = {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      shipX: player.x,
      shipY: player.y,
      targetX: player.x,
      targetY: player.y,
    };
    for (const key of keys) if (key !== "shift") keys.delete(key);
    player.vx = player.vy = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  }
  function pointMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    // Anchor at the press, keeping the ship under control without jumping to a finger.
    pointer.targetX = clamp(
      pointer.shipX + (event.clientX - pointer.originX) * pointerScaleX,
      24,
      w - 24,
    );
    pointer.targetY = clamp(
      pointer.shipY + (event.clientY - pointer.originY) * pointerScaleY,
      76,
      h - 82,
    );
  }
  function pointUp(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    if (player.dashTime <= 0) {
      player.x = previousPosition.x = lastRendered.x;
      player.y = previousPosition.y = lastRendered.y;
      player.vx = player.vy = 0;
    }
  }
  function contextMenu(event: Event) {
    event.preventDefault();
  }
  const sizes = new ResizeObserver(resize);
  sizes.observe(host);
  resize();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", suspend);
  document.addEventListener("visibilitychange", suspend);
  canvas.addEventListener("pointerdown", pointDown);
  canvas.addEventListener("pointermove", pointMove);
  canvas.addEventListener("pointerup", pointUp);
  canvas.addEventListener("pointercancel", pointUp);
  canvas.addEventListener("lostpointercapture", pointUp);
  canvas.addEventListener("contextmenu", contextMenu);
  const image = new Image();
  image.onload = () => {
    if (!running) return;
    try {
      const face = portrait(image);
      cols = face.cols;
      rows = face.rows;
      pixels = face.pixels;
      indexPixels();
      phaseTo("ready");
    } catch {
      phaseTo("error");
    }
  };
  image.onerror = () => {
    if (running) phaseTo("error");
  };
  image.src = "/aiden-face.jpg";
  last = performance.now();
  raf = requestAnimationFrame(frame);
  hud();
  return {
    start,
    reset,
    togglePause,
    dash,
    pulse,
    continueStage,
    toggleFocus,
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      sizes.disconnect();
      sound.stop();
      image.onload = image.onerror = null;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", suspend);
      canvas.removeEventListener("pointerdown", pointDown);
      canvas.removeEventListener("pointermove", pointMove);
      canvas.removeEventListener("pointerup", pointUp);
      canvas.removeEventListener("pointercancel", pointUp);
      canvas.removeEventListener("lostpointercapture", pointUp);
      canvas.removeEventListener("contextmenu", contextMenu);
    },
  };
}

export function createSound() {
  let ctx: AudioContext | null = null,
    output: GainNode | null = null;
  let muted = false,
    unlocked = false;
  function ensure() {
    if (!unlocked || muted) return;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        output = ctx.createGain();
        output.connect(ctx.destination);
      } catch {
        return;
      }
    }
    ctx.resume().catch(() => {});
  }
  function sync() {
    try {
      muted = localStorage.getItem("aiden-sound") === "off";
    } catch {
      muted = true;
    }
    ensure();
    if (ctx && output)
      output.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.01);
  }
  let beatTime = 0,
    beat = 0;
  function tone(
    hz: number,
    duration: number,
    volume: number,
    delay = 0,
    stable = false,
  ) {
    if (!ctx || !output || muted || ctx.state !== "running") return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      now = ctx.currentTime + delay;
    osc.type = stable && hz < 160 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(hz, now);
    if (!stable)
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, hz * 0.5),
        now + duration,
      );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      now + Math.min(0.006, duration * 0.2),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(output);
    osc.start(now);
    osc.stop(now + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  sync();
  window.addEventListener("aiden-sound-change", sync);
  return {
    unlock() {
      unlocked = true;
      ensure();
    },
    note: tone,
    music(dt: number, form: 1 | 2, overdrive: boolean) {
      if (!ctx || muted) return;
      beatTime -= dt;
      if (beatTime > 0) return;
      beatTime += 1 / 3;
      const step = beat++ % 32;
      const human = [329.63, 0, 392, 0, 293.66, 0, 246.94, 293.66];
      const cat = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
      if (step % 2 === 0)
        tone(
          (form === 1 ? [82.41, 98, 73.42, 82.41] : [130.81, 110, 87.31, 98])[
            Math.floor(step / 8)
          ],
          0.27,
          0.014,
          0,
          true,
        );
      const pitch = (form === 1 ? human : cat)[step % 8];
      if (pitch) tone(pitch, 0.19, overdrive ? 0.009 : 0.005, 0, true);
      if (overdrive && step % 2)
        tone(pitch * 2 || 880, 0.08, 0.004, 0.15, true);
    },
    resetMusic() {
      beat = beatTime = 0;
    },
    meow() {
      if (!ctx || !output || muted || ctx.state !== "running") return;
      const now = ctx.currentTime,
        voice = ctx.createOscillator(),
        envelope = ctx.createGain();
      voice.type = "sawtooth";
      voice.frequency.setValueAtTime(510, now);
      voice.frequency.linearRampToValueAtTime(740, now + 0.12);
      voice.frequency.exponentialRampToValueAtTime(860, now + 0.22);
      voice.frequency.exponentialRampToValueAtTime(430, now + 0.48);
      voice.frequency.exponentialRampToValueAtTime(250, now + 0.8);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.075, now + 0.08);
      envelope.gain.setValueAtTime(0.065, now + 0.31);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.84);
      const nodes: AudioNode[] = [voice, envelope];
      // Sliding vowel formants turn a voiced oscillator into a short "mee-ow".
      for (const [from, to, q, level] of [
        [720, 420, 4, 0.6],
        [2100, 950, 6, 0.28],
        [3200, 1900, 7, 0.12],
      ]) {
        const vowel = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        vowel.type = "bandpass";
        vowel.frequency.setValueAtTime(from, now);
        vowel.frequency.setValueAtTime(from, now + 0.19);
        vowel.frequency.exponentialRampToValueAtTime(to, now + 0.72);
        vowel.Q.value = q;
        gain.gain.value = level;
        voice.connect(vowel).connect(gain).connect(envelope);
        nodes.push(vowel, gain);
      }
      envelope.connect(output);
      const vibrato = ctx.createOscillator(),
        depth = ctx.createGain();
      vibrato.frequency.value = 8.5;
      depth.gain.value = 11;
      vibrato.connect(depth).connect(voice.frequency);
      nodes.push(vibrato, depth);
      voice.start(now);
      vibrato.start(now);
      voice.stop(now + 0.86);
      vibrato.stop(now + 0.86);
      voice.onended = () => nodes.forEach((node) => node.disconnect());
    },
    stop() {
      window.removeEventListener("aiden-sound-change", sync);
      ctx?.close().catch(() => {});
    },
  };
}
