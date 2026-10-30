import { readFileSync } from "node:fs";
import { runInContext, createContext } from "node:vm";
import ts from "typescript";

export function loadModule(name, sandbox, cache = new Map()) {
  if (cache.has(name)) return cache.get(name);
  const exports = {};
  cache.set(name, exports);
  const source = readFileSync(
    new URL(`../components/break/${name}.ts`, import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInContext(`(function(require,exports){${compiled}\n})`, sandbox)((id) => {
    const next = id.split("/").at(-1);
    if (next === "campaign-vfx" && sandbox.renderer) return sandbox.renderer;
    return loadModule(next, sandbox, cache);
  }, exports);
  return exports;
}

export const model = loadModule("campaign", createContext({}));
export const tactics = loadModule("tactics", createContext({}));
export const balance = loadModule("balance", createContext({}));

export function makeBossArena({
  width = 1200,
  height = 720,
  ship = 0,
  sector = 1,
  stage = 1,
} = {}) {
  const s = model.createWorld(width, height, ship);
  s.sector = sector;
  s.phase = "fight";
  s.boss.stage = stage;
  s.boss.form = sector === 1 ? stage : 1;
  s.boss.hp =
    model.bossMaxHp(s) *
    (sector === 1 || stage === 1 ? 1 : stage === 2 ? 0.66 : 0.33);
  s.boss.x = width / 2;
  s.boss.y = height * 0.26;
  s.boss.attackAt = 0.5;
  s.player.x = width / 2;
  s.player.y = height * 0.76;
  return s;
}
export function benchmarkWeapon(ship, focused = false, boosted = false) {
  const s = makeBossArena({ ship });
  s.boss.hp = 1e7;
  s.boss.attackAt = 1e6;
  if (boosted) s.overdrive = 100;
  const distance = ship === 2 && !focused ? 240 : 360;
  let startDamage = 0;
  for (let i = 0; i < 14 * 120; i++) {
    s.player.x = s.boss.x;
    s.player.y = s.boss.y + distance;
    model.stepWorld(s, { x: 0, y: 0, focused }, 1 / 120);
    if (i === 4 * 120 - 1) startDamage = s.telemetry.bossDamage;
  }
  return Math.round(((s.telemetry.bossDamage - startDamage) / 10) * 10) / 10;
}
export function runBossPilot({
  width = 1200,
  ship = 0,
  sector = 1,
  stage = 1,
  policy = "aware",
  seconds = 60,
  seed = 4812,
} = {}) {
  const s = makeBossArena({ width, ship, sector, stage });
  s.seed = seed;
  let input = {
    x: 0,
    y: 0,
    focused: false,
    target: { x: s.player.x, y: s.player.y },
  };
  let maxBullets = 0,
    maxEnemies = 0,
    seenHazards = new Set(),
    decisionAt = 0;
  for (
    let tick = 0;
    tick < seconds * 120 && s.phase === "fight" && model.bossStage(s) === stage;
    tick++
  ) {
    maxBullets = Math.max(
      maxBullets,
      s.bullets.filter((b) => !b.friendly).length,
    );
    maxEnemies = Math.max(maxEnemies, s.enemies.length);
    if (s.zones.length) seenHazards.add("zones");
    if (s.shockwaves.length) seenHazards.add("shockwaves");
    if (s.lunge) seenHazards.add("lunge");
    if (s.seal) seenHazards.add("hand-seal");
    if (s.lasers.length) seenHazards.add("lasers");
    if (policy === "stationary") input = { x: 0, y: 0, focused: false };
    else if (policy === "strafe")
      input = {
        x: 0,
        y: 0,
        focused: false,
        target: {
          x: width * (0.5 + Math.sin((tick / 120) * 0.85) * 0.37),
          y: 720 * 0.76,
        },
      };
    else if (tick >= decisionAt) {
      decisionAt = tick + 30; // 4 decisions/sec, with no damage or movement overrides.
      const p = s.player,
        foes = s.enemies.filter((e) => e.hp > 0 && e.age > 0.4);
      const priority =
        foes.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] ??
        s.boss;
      const idealY = ship === 2 ? s.boss.y + 245 : 540;
      let best = Infinity,
        target = { x: priority.x, y: idealY };
      for (const dx of [-110, -75, -40, 0, 40, 75, 110])
        for (const dy of [-80, -40, 0, 40, 80]) {
          const x = Math.max(26, Math.min(width - 26, p.x + dx)),
            y = Math.max(340, Math.min(625, idealY + dy));
          let cost =
            Math.abs(x - priority.x) * 0.18 +
            Math.abs(y - idealY) * 0.08 +
            Math.hypot(x - p.x, y - p.y) * 0.02;
          for (const b of s.bullets)
            if (!b.friendly)
              for (const t of [0.2, 0.45, 0.7]) {
                const reach = Math.min(
                    1,
                    (t * 280) / Math.max(1, Math.hypot(x - p.x, y - p.y)),
                  ),
                  px = p.x + (x - p.x) * reach,
                  py = p.y + (y - p.y) * reach;
                const d = Math.hypot(b.x + b.vx * t - px, b.y + b.vy * t - py);
                cost += Math.exp((-d * d) / 650) * 180;
              }
          for (const z of s.zones)
            if (z.age + 0.45 > z.warning && z.age < z.warning + z.duration) {
              const d = Math.hypot(x - z.x, y - z.y);
              cost += Math.exp((-d * d) / (2 * (z.radius + 16) ** 2)) * 600;
            }
          for (const laser of s.lasers) {
            const end = tactics.beamEnd(
                { ...laser, age: laser.age + 0.4 },
                720 * 2.5,
              ),
              vx = end.x - laser.x,
              vy = end.y - laser.y;
            const t = Math.max(
              0,
              Math.min(
                1,
                ((x - laser.x) * vx + (y - laser.y) * vy) / (vx * vx + vy * vy),
              ),
            );
            const d = Math.hypot(laser.x + vx * t - x, laser.y + vy * t - y);
            cost += Math.exp((-d * d) / 650) * 250;
          }
          for (const wave of s.shockwaves) {
            const d = Math.hypot(x - wave.x, y - wave.y),
              angle = Math.atan2(y - wave.y, x - wave.x),
              gap = tactics.waveGap({ ...wave, age: wave.age + 0.5 });
            const delta = Math.abs(
              Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap)),
            );
            if (delta > wave.gapWidth / 2 - 0.05) {
              const future =
                Math.max(0, wave.age + 0.5 - wave.warning) * wave.speed;
              cost += Math.exp((-1 * (d - future) ** 2) / 1600) * 450;
            }
          }
          for (const enemy of foes)
            if (enemy.kind === "musk")
              cost +=
                Math.exp(
                  (-1 * Math.hypot(x - enemy.x, y - enemy.y) ** 2) / 1600,
                ) * 220;
          if (s.lunge && !s.lunge.returning) {
            const l = s.lunge;
            const d = Math.hypot(x - l.tx, y - l.ty);
            cost +=
              Math.exp((-d * d) / (2 * (model.bossRadius(s) * 0.8) ** 2)) * 500;
          }
          if (cost < best) {
            best = cost;
            target = { x, y };
          }
        }
      input = {
        x: 0,
        y: 0,
        focused:
          ship === 2 && Math.hypot(priority.x - p.x, priority.y - p.y) > 270,
        target,
      };
      const near = s.bullets.filter(
        (b) => !b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 65,
      );
      if (near.length >= 3) model.pulse(s);
      if (near.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 28))
        model.dash(s, input);
    }
    model.stepWorld(s, input, 1 / 120);
  }
  return {
    sector,
    stage,
    ship,
    width,
    policy,
    seconds: Math.round(s.stats.seconds * 10) / 10,
    result:
      s.phase === "lose"
        ? "defeated"
        : s.phase !== "fight" || model.bossStage(s) !== stage
          ? "phase-cleared"
          : "time-limit",
    hits: s.stats.hits,
    hull: s.player.hull,
    bossDamage: Math.round(s.telemetry.bossDamage),
    casts: s.telemetry.casts,
    clones: s.telemetry.clones,
    maxBullets,
    maxEnemies,
    hazards: [...seenHazards],
  };
}
