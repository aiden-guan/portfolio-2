import { createSound } from "@/components/break/audio";
import { createCampaignVfx } from "@/components/break/campaign-vfx";
import {
  activePhase,
  bossMaxHp,
  bossTheme,
  bossStage,
  bossGuard,
  stageTitle,
  themeColor,
  campaignRank,
  createWorld,
  dash as dashWorld,
  flightPhase,
  launch,
  PULSE_SECONDS,
  pulse as pulseWorld,
  resetWorld,
  resizeWorld,
  retrySector,
  SECTORS,
  selectShip as selectWorldShip,
  SHIPS,
  stepWorld,
  type CampaignPhase,
  type Sector,
  type ShipId,
} from "@/components/break/campaign";
import { BALANCE } from "@/components/break/balance";
import { clamp, type FlightInput } from "@/components/break/physics";
import { formatTime } from "@/components/break/combat";

export { createSound } from "@/components/break/audio";
export type ArcadePhase = CampaignPhase;
export type ArcadeHandle = {
  stop: () => void;
  start: () => void;
  reset: () => void;
  togglePause: () => void;
  dash: () => boolean;
  pulse: () => boolean;
  continueStage: () => boolean;
  toggleFocus: () => void;
  selectShip: (ship: ShipId) => void;
};
const BEST_KEY = "guan-arcade-best-v2";
export function mountArcade(
  host: HTMLElement,
  onPhase: (phase: ArcadePhase) => void,
  onPause: (paused: boolean) => void,
  reduced: boolean,
  onSector: (sector: Sector) => void = () => {},
  onShip: (ship: ShipId) => void = () => {},
): ArcadeHandle {
  const canvas = host.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const s = createWorld(
    Math.max(1, host.clientWidth),
    Math.max(1, host.clientHeight),
  );
  s.phase = "loading";
  const sound = createSound();
  const keys = new Set<string>();
  const assetUrls = [
    ...SECTORS.map((sector) => sector.image),
    "/arcade/hand-seals.webp",
  ];
  const images = assetUrls.map(() => new Image());
  const vfx = createCampaignVfx(ctx, images, reduced);
  let running = true,
    paused = false,
    focusLatch = false,
    raf = 0,
    last = performance.now(),
    accumulator = 0;
  let notifiedPhase: ArcadePhase | null = null,
    notifiedSector = 0,
    notifiedShip = -1,
    savedBest = 0;
  let pointer: {
    id: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    originX: number;
    originY: number;
    target: { x: number; y: number };
  } | null = null;
  const nodes = new Map<string, HTMLElement>();
  try {
    s.best = Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
    savedBest = s.best;
  } catch {}
  function node(selector: string) {
    if (!nodes.has(selector) || nodes.get(selector)?.isConnected === false) {
      const el = host.querySelector<HTMLElement>(selector);
      if (el) nodes.set(selector, el);
    }
    return nodes.get(selector);
  }
  function text(selector: string, value: string) {
    const el = node(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }
  function meter(selector: string, value: number) {
    const el = node(selector);
    if (el) el.style.transform = `scaleX(${clamp(value, 0, 1)})`;
  }
  function hud() {
    if (s.sector !== notifiedSector) {
      notifiedSector = s.sector;
      onSector(s.sector);
    }
    if (s.ship !== notifiedShip) {
      notifiedShip = s.ship;
      onShip(s.ship);
    }
    if (s.phase !== notifiedPhase) {
      notifiedPhase = s.phase;
      nodes.clear();
      onPhase(s.phase);
      if (s.phase === "transform" && s.boss.form === 2) sound.meow();
      if (s.phase === "transform" && s.sector > 1) {
        const notes =
          s.sector === 2 ? [261.63, 329.63, 392] : [196, 146.83, 98];
        notes.forEach((hz, i) => sound.note(hz, 0.28, 0.018, i * 0.1));
      }
      if (s.phase === "boss-intro") {
        sound.note(80, 0.6, 0.06);
        sound.note(120, 0.5, 0.03, 0.3);
      }
      if (s.phase === "sector-clear" || s.phase === "win") {
        sound.note(440, 0.3, 0.025);
        sound.note(660, 0.3, 0.025, 0.15);
        sound.note(880, 0.5, 0.025, 0.3);
      }
      if (s.phase === "win" || s.phase === "lose") {
        s.best = Math.max(s.best, s.score);
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
          savedBest = s.best;
        } catch {}
      }
    }
    const sector = SECTORS[s.sector - 1],
      hull = SHIPS[s.ship];
    host.dataset.sector = String(s.sector);
    host.dataset.form = ["human", "cat", "evil"][bossTheme(s) - 1];
    host.dataset.ship = String(s.ship);
    host.dataset.combat = activePhase(s.phase) ? "active" : "idle";
    host.dataset.overdrive = s.overdrive > 0 ? "on" : "off";
    host.dataset.bossStage = String(bossStage(s));
    host.dataset.ward = bossGuard(s) < 1 ? "on" : "off";
    host.style.setProperty("--sector-color", themeColor(s));
    host.style.setProperty("--ship-color", hull.color);
    text("[data-stage]", `0${s.sector} / 03`);
    text(
      "[data-boss-name]",
      s.phase === "waves" ? `WAVE ${Math.max(1, s.wave)} / 3` : sector.boss,
    );
    text(
      "[data-objective]",
      s.phase === "fight"
        ? bossGuard(s) < 1
          ? "SHIELDED"
          : s.boss.breakWindow > 0
            ? "EXPOSED"
            : ""
        : "",
    );
    text(
      "[data-encounter-status]",
      s.phase === "waves"
        ? `Defense grid, wave ${s.wave}`
        : `${sector.boss}, phase ${bossStage(s)}: ${stageTitle(s)}`,
    );
    text("[data-score]", String(s.score).padStart(7, "0"));
    text("[data-result-score]", String(s.score).padStart(7, "0"));
    text("[data-best]", String(s.best).padStart(7, "0"));
    text("[data-run-time]", formatTime(s.stats.seconds));
    text("[data-run-rank]", campaignRank(s));
    text(
      "[data-retry-label]",
      s.checkpoint.boss
        ? `Retry phase ${["I", "II", "III"][s.checkpoint.stage - 1]}`
        : `Retry sector 0${s.sector}`,
    );
    text("[data-ship-name]", hull.name);
    const hullNode = node("[data-hull]");
    if (hullNode) {
      hullNode.textContent = Array.from({ length: BALANCE.hull }, (_, i) =>
        i < s.player.hull ? "▰" : "▱",
      ).join(" ");
      hullNode.setAttribute(
        "aria-label",
        `${s.player.hull} hull points remaining`,
      );
    }
    const healthRatio =
      s.phase === "waves"
        ? s.waveHealthMax > 0
          ? s.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0) /
            s.waveHealthMax
          : 1
        : s.boss.hp / bossMaxHp(s);
    meter("[data-signal]", healthRatio);
    meter("[data-signal-echo]", healthRatio);
    meter(
      "[data-overdrive]",
      s.overdrive > 0 ? s.overdrive / BALANCE.overdriveSeconds : s.charge / 100,
    );
    meter("[data-dash]", 1 - s.player.dashCooldown / BALANCE.dashCooldown);
    meter("[data-energy]", 1 - s.pulseAt / PULSE_SECONDS);
    text("[data-pulse-key]", s.pulseAt > 0 ? `${Math.ceil(s.pulseAt)}s` : "X");
    const db = node("[data-dash-button]") as HTMLButtonElement | undefined,
      pb = node("[data-pulse-button]") as HTMLButtonElement | undefined;
    if (db) db.disabled = !flightPhase(s.phase) || s.player.dashCooldown > 0;
    if (pb) pb.disabled = !activePhase(s.phase) || s.pulseAt > 0;
    const swap = node("[data-ship-name]") as HTMLButtonElement | undefined;
    if (swap) {
      swap.disabled = activePhase(s.phase) && s.shipSwapAt > 0;
      swap.title =
        s.shipSwapAt > 0
          ? `Swap ready in ${Math.ceil(s.shipSwapAt)}s`
          : "Change ship · 1 / 2 / 3";
    }
    node("[data-focus-button]")?.setAttribute(
      "aria-pressed",
      String(focusLatch),
    );
  }
  function input(): FlightInput {
    return {
      x:
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft")),
      y:
        Number(keys.has("s") || keys.has("arrowdown")) -
        Number(keys.has("w") || keys.has("arrowup")),
      focused: keys.has("shift") || focusLatch,
      target: pointer?.target,
    };
  }
  function rebasePointer() {
    if (pointer) {
      pointer.x = s.player.x;
      pointer.y = s.player.y;
      pointer.originX = pointer.clientX;
      pointer.originY = pointer.clientY;
      pointer.target = { x: s.player.x, y: s.player.y };
    }
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    resizeWorld(s, Math.max(1, rect.width), Math.max(1, rect.height));
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(s.width * dpr);
    canvas.height = Math.round(s.height * dpr);
    rebasePointer();
  }
  function clearInput() {
    keys.clear();
    pointer = null;
    focusLatch = false;
    s.player.vx = s.player.vy = 0;
  }
  function setPaused(value: boolean) {
    if (paused === value) return;
    paused = value;
    clearInput();
    accumulator = 0;
    last = performance.now();
    onPause(value);
  }
  function togglePause() {
    if (flightPhase(s.phase) || s.phase === "dying") setPaused(!paused);
  }
  function suspend() {
    if (flightPhase(s.phase) || s.phase === "dying") setPaused(true);
  }
  function start() {
    sound.unlock();
    if (launch(s)) {
      clearInput();
      hud();
    }
  }
  function reset() {
    sound.unlock();
    sound.resetMusic();
    setPaused(false);
    clearInput();
    resetWorld(s);
    hud();
  }
  function continueStage() {
    sound.unlock();
    setPaused(false);
    clearInput();
    const ok = retrySector(s);
    hud();
    return ok;
  }
  function dash() {
    if (paused) return false;
    const ok = dashWorld(s, input());
    if (ok) {
      sound.note(240, 0.14, 0.025);
      rebasePointer();
    }
    return ok;
  }
  function pulse() {
    if (paused) return false;
    const ok = pulseWorld(s);
    if (ok) sound.note(65, 0.5, 0.055);
    hud();
    return ok;
  }
  function toggleFocus() {
    if (paused || !flightPhase(s.phase)) return;
    focusLatch = !focusLatch;
    hud();
  }
  function selectShip(ship: ShipId) {
    if (paused) return;
    selectWorldShip(s, ship);
    hud();
  }
  function controlKey(event: KeyboardEvent) {
    const map: Record<string, string> = {
      KeyW: "w",
      KeyA: "a",
      KeyS: "s",
      KeyD: "d",
      KeyX: "x",
      KeyP: "p",
      Space: " ",
      ShiftLeft: "shift",
      ShiftRight: "shift",
      Digit1: "1",
      Digit2: "2",
      Digit3: "3",
    };
    return map[event.code] ?? event.key.toLowerCase();
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
      event.target.closest("button,a,input,textarea,select")
    )
      return;
    if (paused) return;
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
    if (event.repeat) return;
    if (key === " ") {
      event.preventDefault();
      dash();
    }
    if (key === "x") {
      event.preventDefault();
      pulse();
    }
    if (["1", "2", "3"].includes(key)) {
      event.preventDefault();
      selectShip((Number(key) - 1) as ShipId);
    }
  }
  function up(event: KeyboardEvent) {
    keys.delete(controlKey(event));
  }
  function pointDown(event: PointerEvent) {
    if (paused || !flightPhase(s.phase)) return;
    if (event.button === 2) {
      event.preventDefault();
      pulse();
      return;
    }
    if (pointer || (event.button !== 0 && event.button !== undefined)) return;
    s.player.dashTime = 0;
    pointer = {
      id: event.pointerId,
      x: s.player.x,
      y: s.player.y,
      clientX: event.clientX,
      clientY: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      target: { x: s.player.x, y: s.player.y },
    };
    keys.clear();
    s.player.vx = s.player.vy = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  }
  function pointMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    const box = canvas.getBoundingClientRect();
    pointer.target.x = clamp(
      pointer.x +
        ((event.clientX - pointer.originX) * s.width) / Math.max(1, box.width),
      24,
      s.width - 24,
    );
    pointer.target.y = clamp(
      pointer.y +
        ((event.clientY - pointer.originY) * s.height) /
          Math.max(1, box.height),
      76,
      s.height - 82,
    );
  }
  function pointUp(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    if (s.player.dashTime <= 0) s.player.vx = s.player.vy = 0;
  }
  function contextMenu(event: Event) {
    event.preventDefault();
  }
  const STEP = 1 / 120;
  function frame(now: number) {
    if (!running) return;
    const elapsed = Math.min(0.08, Math.max(0, (now - last) / 1000));
    last = now;
    if (paused || document.hidden) accumulator = 0;
    else {
      accumulator += elapsed;
      while (accumulator + 1e-10 >= STEP) {
        const lastSector = s.sector,
          priorHull = s.player.hull,
          priorDrones = s.stats.drones,
          priorShots = s.serial,
          priorCasts = s.telemetry.casts,
          priorClones = s.telemetry.clones,
          wasDashing = s.player.dashTime > 0;
        stepWorld(s, input(), STEP);
        if (wasDashing && s.player.dashTime === 0) rebasePointer();
        if (lastSector !== s.sector) {
          clearInput();
          sound.resetMusic();
        }
        if (priorHull > s.player.hull) sound.note(90, 0.23, 0.04);
        if (s.stats.drones > priorDrones) sound.note(120, 0.15, 0.022);
        if (s.telemetry.casts > priorCasts) {
          sound.note(196, 0.16, 0.02);
          sound.note(147, 0.18, 0.02, 0.45);
          sound.note(98, 0.32, 0.03, 0.95);
        }
        if (s.telemetry.clones > priorClones) sound.note(65, 0.3, 0.035);
        if (
          s.serial > priorShots &&
          activePhase(s.phase) &&
          Math.floor(s.time * 7) !== Math.floor((s.time - STEP) * 7)
        )
          sound.note(s.ship === 2 ? 170 : 680, 0.045, 0.004);
        if (activePhase(s.phase))
          sound.music(STEP, bossTheme(s), s.overdrive > 0);
        accumulator = Math.max(0, accumulator - STEP);
      }
    }
    hud();
    if (!document.hidden) vfx.render(s);
    raf = requestAnimationFrame(frame);
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
  let loaded = 0;
  images.forEach((image, i) => {
    image.onload = () => {
      if (running && ++loaded === images.length) {
        s.phase = "ready";
        hud();
      }
    };
    image.onerror = () => {
      if (running) {
        s.phase = "error";
        hud();
      }
    };
    image.src = assetUrls[i];
  });
  hud();
  raf = requestAnimationFrame(frame);
  return {
    start,
    reset,
    togglePause,
    dash,
    pulse,
    continueStage,
    toggleFocus,
    selectShip,
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      sizes.disconnect();
      sound.stop();
      if (s.best > savedBest)
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      images.forEach((image) => {
        image.onload = image.onerror = null;
      });
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
