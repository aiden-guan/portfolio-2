import {
  clamp,
  createFlightState,
  dashFlight,
  segmentHitsCircle,
  stepFlight,
  unitVector,
  type FlightInput,
} from "@/components/break/physics";
import {
  createRunStats,
  runRank,
  type BossForm,
} from "@/components/break/combat";
import {
  BALANCE,
  BOSS_HEALTH,
  ENEMY_HEALTH,
  WEAPONS,
} from "@/components/break/balance";
import {
  BOSS_STAGES,
  beamEnd,
  createBossPlan,
  turnVelocity,
  waveGap,
  type BossPlan,
  type BossStage,
  type EnemyKind,
  type PlannedShot,
  type ShotKind,
  type BeamSpec,
  type ZoneSpec,
  type WaveSpec,
  type LungeSpec,
} from "@/components/break/tactics";

import { SHIPS, type Sector, type ShipId } from "@/components/break/catalog";
export {
  SECTORS,
  SHIPS,
  type Sector,
  type ShipId,
} from "@/components/break/catalog";
export type CampaignPhase =
  | "loading"
  | "ready"
  | "intro"
  | "waves"
  | "boss-intro"
  | "fight"
  | "transform"
  | "sector-clear"
  | "dying"
  | "win"
  | "lose"
  | "error";
export type { EnemyKind } from "@/components/break/tactics";
export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  origin: number;
  age: number;
  hp: number;
  maxHp: number;
  fire: number;
  flash: number;
  targetX: number;
  targetY: number;
  state: number;
  summoned?: boolean;
  round?: number;
  lifetime?: number;
  defeated?: boolean;
  lane?: number;
};
export type Bullet = {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  friendly: boolean;
  kind: ShotKind;
  damage: number;
  radius: number;
  grazed: boolean;
  hit: number[];
  ship?: ShipId;
  motion?: "curve" | "return";
  turn?: number;
  originX?: number;
  originY?: number;
  returnAt?: number;
};
export type Laser = BeamSpec & { age: number; owner: number };
export type DangerZone = ZoneSpec & { age: number; triggered: boolean };
export type Shockwave = WaveSpec & {
  age: number;
  radius: number;
  previousRadius: number;
};
export type Lunge = LungeSpec & { age: number; returning: boolean };
export type Burst = {
  x: number;
  y: number;
  color: string;
  power: number;
  seed: number;
  age: number;
  text?: string;
  smoke?: boolean;
};
export type Arc = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  age: number;
  seed: number;
  rail?: boolean;
};
export type Drop = {
  x: number;
  y: number;
  age: number;
  kind: "repair" | "charge";
};
export type Attack = BossPlan & {
  age: number;
  shots: PlannedShot[];
  next: number;
};
export type World = ReturnType<typeof createWorld>;
export const PULSE_SECONDS = BALANCE.pulseCooldown;
export const activePhase = (phase: CampaignPhase) =>
  phase === "waves" || phase === "fight";
export const flightPhase = (phase: CampaignPhase) =>
  activePhase(phase) ||
  phase === "intro" ||
  phase === "boss-intro" ||
  phase === "sector-clear" ||
  phase === "transform";

export function createWorld(width: number, height: number, ship: ShipId = 0) {
  return {
    width,
    height,
    ship,
    sector: 1 as Sector,
    phase: "ready" as CampaignPhase,
    time: 0,
    phaseTime: 0,
    sectorTime: 0,
    wave: 0,
    waveHealthMax: 0,
    waveAt: 0.7,
    score: 0,
    best: 0,
    combo: 1,
    comboTime: 0,
    charge: 0,
    overdrive: 0,
    stats: createRunStats(),
    regularKills: 0,
    player: {
      ...createFlightState(),
      x: width / 2,
      y: height * 0.8,
      hull: BALANCE.hull as number,
      invincible: 0,
    },
    boss: {
      form: 1 as BossForm,
      x: width / 2,
      y: height * 0.27,
      hp: BOSS_HEALTH.guan[0] as number,
      flash: 0,
      attackAt: 1.5,
      turn: 0,
      stage: 1 as BossStage,
      stageTime: 0,
      breakWindow: 0,
      anchor: 0.5,
    },
    enemies: [] as Enemy[],
    bullets: [] as Bullet[],
    lasers: [] as Laser[],
    bursts: [] as Burst[],
    arcs: [] as Arc[],
    drops: [] as Drop[],
    attack: null as Attack | null,
    fireAt: 0,
    missileAt: 0.7,
    pulseAt: 0,
    pulse: null as { x: number; y: number; age: number; hits: number[] } | null,
    shake: 0,
    flash: 0,
    serial: 0,
    seed: 4812,
    selectedAt: 0,
    shipSwapAt: 0,
    dashHits: [] as number[],
    checkpoint: { boss: false, stage: 1 as BossStage },
    seal: null as { age: number; spawned: boolean; stage: BossStage } | null,
    zones: [] as DangerZone[],
    shockwaves: [] as Shockwave[],
    lunge: null as Lunge | null,
    telemetry: {
      fired: 0,
      hits: 0,
      bossDamage: 0,
      enemyDamage: 0,
      casts: 0,
      clones: 0,
      stageSeconds: [0, 0, 0],
    },
  };
}
function random(s: World) {
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function setPhase(s: World, phase: CampaignPhase) {
  s.phase = phase;
  s.phaseTime = 0;
  s.attack = null;
}
export function bossRadius(s: World) {
  const base = Math.min(s.height * 0.39, s.width * 0.54, 330) / 2;
  return (
    base *
    (s.sector === 3 && s.enemies.some((e) => e.kind === "clone" && e.hp > 0)
      ? 0.82
      : 1)
  );
}
export function bossMaxHp(s: World) {
  return s.sector === 1
    ? BOSS_HEALTH.guan[s.boss.form - 1]
    : s.sector === 2
      ? BOSS_HEALTH.phoebe
      : BOSS_HEALTH.allen;
}
export function bossStage(s: World): BossStage {
  return s.sector === 1 ? s.boss.form : s.boss.stage;
}
export function stageTitle(s: World) {
  return BOSS_STAGES[s.sector - 1][bossStage(s) - 1];
}
export function bossGuard(s: World) {
  return s.sector === 3 &&
    s.boss.breakWindow <= 0 &&
    s.enemies.some((e) => e.kind === "clone" && e.hp > 0)
    ? 0.55
    : 1;
}
export function bossTheme(s: World) {
  return s.sector === 1 ? s.boss.form : s.sector === 3 ? 3 : 1;
}
export function themeColor(s: World) {
  return bossTheme(s) === 2
    ? "#efb3d4"
    : bossTheme(s) === 3
      ? "#ed927b"
      : s.sector === 2
        ? "#e8c597"
        : "#b4cba4";
}
export function transformSeconds(s: World) {
  return s.sector === 1 ? (s.boss.form === 3 ? 4.3 : 3.4) : 1.8;
}
export function burst(
  s: World,
  x: number,
  y: number,
  color: string,
  power = 1,
  text?: string,
) {
  if (s.bursts.length < 70)
    s.bursts.push({ x, y, color, power, seed: random(s) * 1000, age: 0, text });
}
function clearOrdnance(s: World) {
  s.bullets.length = s.lasers.length = s.arcs.length = 0;
  s.attack = null;
  s.pulse = null;
  s.zones.length = s.shockwaves.length = 0;
  s.lunge = null;
  s.seal = null;
}
export function launch(s: World) {
  if (s.phase !== "ready") return false;
  s.player.x = s.width / 2;
  s.player.y = s.height * 0.8;
  setPhase(s, "intro");
  return true;
}
export function selectShip(s: World, ship: ShipId) {
  if (
    ship === s.ship ||
    s.phase === "loading" ||
    s.phase === "error" ||
    s.phase === "dying" ||
    (activePhase(s.phase) && s.shipSwapAt > 0)
  )
    return;
  s.ship = ship;
  s.fireAt = Math.max(s.fireAt, 0.4);
  s.missileAt = Math.max(s.missileAt, 1.2);
  s.shipSwapAt = activePhase(s.phase) ? BALANCE.shipSwapCooldown : 0;
  s.selectedAt = s.time;
  if (flightPhase(s.phase))
    burst(s, s.player.x, s.player.y, SHIPS[ship].color, 0.8);
}
function prepareSector(s: World, sector: Sector) {
  s.sector = sector;
  s.sectorTime = s.wave = 0;
  s.waveHealthMax = 0;
  s.waveAt = 0.7;
  s.enemies.length = s.drops.length = 0;
  clearOrdnance(s);
  s.boss.form = 1;
  s.boss.stage = 1;
  s.boss.stageTime = s.boss.breakWindow = 0;
  s.boss.anchor = 0.5;
  s.boss.hp = bossMaxHp(s);
  s.boss.attackAt = 1.4;
  s.boss.turn = 0;
  s.boss.flash = 0;
  s.player.invincible = 2;
  s.player.dashTime = s.player.dashCooldown = 0;
  s.pulseAt = 0;
  s.shipSwapAt = 0;
  s.player.x = s.width / 2;
  s.player.y = s.height * 0.8;
  s.player.vx = s.player.vy = 0;
  s.fireAt = 0;
}
export function retrySector(s: World) {
  if (s.phase !== "lose") return false;
  s.stats.continues++;
  s.score = Math.floor(s.score * 0.6);
  s.player.hull = BALANCE.hull;
  s.charge = s.overdrive = 0;
  const checkpoint = { ...s.checkpoint };
  prepareSector(s, s.sector);
  if (checkpoint.boss) {
    s.boss.stage = checkpoint.stage;
    s.boss.form = s.sector === 1 ? checkpoint.stage : 1;
    s.boss.hp =
      bossMaxHp(s) *
      (s.sector === 1 || checkpoint.stage === 1
        ? 1
        : checkpoint.stage === 2
          ? 0.66
          : 0.33);
    s.wave = 3;
    setPhase(s, "boss-intro");
  } else setPhase(s, "intro");
  return true;
}
export function resetWorld(s: World) {
  const { width, height, ship, best } = s;
  Object.assign(s, createWorld(width, height, ship));
  s.best = best;
  launch(s);
}
export function dash(s: World, input: FlightInput) {
  if (!flightPhase(s.phase)) return false;
  const ok = dashFlight(s.player, input, { width: s.width, height: s.height });
  if (ok) {
    s.dashHits.length = 0;
    s.player.dashCooldown = BALANCE.dashCooldown;
    burst(s, s.player.x, s.player.y, SHIPS[s.ship].color, 0.45);
    s.shake = Math.max(s.shake, 2);
  }
  return ok;
}
export function pulse(s: World) {
  if (!activePhase(s.phase) || s.pulseAt > 0) return false;
  s.pulseAt = PULSE_SECONDS;
  s.pulse = { x: s.player.x, y: s.player.y, age: 0, hits: [] };
  s.player.invincible = Math.max(s.player.invincible, 0.22);
  s.shake = 5;
  burst(s, s.player.x, s.player.y, SHIPS[s.ship].color, 1.2);
  return true;
}
function addCharge(s: World, n: number) {
  if (s.overdrive > 0) return;
  s.charge = Math.min(100, s.charge + n);
  if (s.charge >= 100) {
    s.charge = 0;
    s.overdrive = BALANCE.overdriveSeconds;
    s.stats.overdrives++;
    burst(s, s.player.x, s.player.y - 40, "#fff2bb", 1.8, "OVERDRIVE");
    s.shake = 4;
  }
}
function points(s: World, n: number) {
  s.score += Math.round(n * s.combo);
  s.combo = Math.min(8, s.combo + 0.25);
  s.comboTime = 5;
}
function hurtPlayer(s: World) {
  if (!activePhase(s.phase) || s.player.invincible > 0 || s.player.dashTime > 0)
    return;
  s.player.hull--;
  s.player.invincible = BALANCE.hitRecovery;
  s.stats.hits++;
  s.combo = 1;
  s.shake = 9;
  s.flash = 0.2;
  burst(s, s.player.x, s.player.y, "#ff797b", 1.3);
  if (s.player.hull <= 0) {
    s.checkpoint = { boss: s.phase === "fight", stage: bossStage(s) };
    clearOrdnance(s);
    setPhase(s, "lose");
  }
}
function killEnemy(s: World, e: Enemy) {
  if (e.defeated) return;
  e.defeated = true;
  e.hp = 0;
  s.stats.drones++;
  if (!e.summoned) s.regularKills++;
  points(
    s,
    e.kind === "clone"
      ? 240
      : e.kind === "musk"
        ? 100
        : e.kind === "thiel"
          ? 300
          : 180,
  );
  addCharge(s, e.summoned ? 2 : 4);
  burst(s, e.x, e.y, e.kind === "thiel" ? "#ff748d" : themeColor(s), 1.2);
  s.shake = Math.max(s.shake, 2);
  if (e.kind === "clone") {
    const smoke = s.bursts.at(-1);
    if (smoke) smoke.smoke = true;
    if (
      !s.enemies.some(
        (other) => other !== e && other.kind === "clone" && other.hp > 0,
      )
    ) {
      s.boss.breakWindow = 4;
      burst(s, s.boss.x, s.boss.y, "#f2dfb3", 1);
      addCharge(s, 12);
    }
  }
  // Boss summons are never a renewable source of hull repairs.
  if (
    !e.summoned &&
    s.regularKills % BALANCE.repairEvery === 0 &&
    s.player.hull < BALANCE.hull
  )
    s.drops.push({ x: e.x, y: e.y, age: 0, kind: "repair" });
  else if (!e.summoned && s.regularKills % 5 === 0)
    s.drops.push({ x: e.x, y: e.y, age: 0, kind: "charge" });
}
export function damageEnemy(s: World, e: Enemy, damage: number) {
  if (e.hp <= 0) return;
  s.telemetry.enemyDamage += Math.min(e.hp, damage);
  e.hp -= damage;
  e.flash = 0.1;
  if (e.hp <= 0) killEnemy(s, e);
}
function changeBossStage(s: World, stage: BossStage) {
  clearOrdnance(s);
  for (const e of s.enemies) {
    burst(s, e.x, e.y, themeColor(s), 0.6);
  }
  s.enemies.length = 0;
  s.boss.stage = stage;
  if (s.sector === 1) {
    s.boss.form = stage;
    s.boss.hp = bossMaxHp(s);
  }
  s.boss.stageTime = 0;
  s.boss.attackAt = 1.1;
  s.boss.turn = 0;
  s.boss.breakWindow = 0;
  s.boss.anchor = 0.5;
  s.player.invincible = Math.max(
    s.player.invincible,
    s.sector === 1 ? transformSeconds(s) + 0.3 : 2.1,
  );
  burst(s, s.boss.x, s.boss.y, themeColor(s), 2);
  setPhase(s, "transform");
}
export function damageBoss(s: World, damage: number) {
  if (s.phase !== "fight") return;
  const stage = bossStage(s),
    before = s.boss.hp;
  const gate =
    s.sector === 1
      ? 0
      : stage === 1
        ? bossMaxHp(s) * 0.66
        : stage === 2
          ? bossMaxHp(s) * 0.33
          : 0;
  s.boss.hp = Math.max(gate, s.boss.hp - damage * bossGuard(s));
  const dealt = before - s.boss.hp;
  s.boss.flash = 0.08;
  s.score += Math.round(dealt);
  s.telemetry.bossDamage += dealt;
  // Damage no longer fuels its own overdrive feedback loop.
  if (
    s.boss.hp <= gate &&
    ((s.sector === 1 && s.boss.form < 3) || (s.sector > 1 && stage < 3))
  ) {
    changeBossStage(s, (stage + 1) as BossStage);
    return;
  }
  if (s.boss.hp <= 0) {
    clearOrdnance(s);
    s.enemies.length = 0;
    points(s, 2500 * s.sector);
    burst(s, s.boss.x, s.boss.y, themeColor(s), 4);
    s.shake = 14;
    setPhase(s, "dying");
  }
}
function fire(
  s: World,
  x: number,
  y: number,
  vx: number,
  vy: number,
  friendly: boolean,
  kind: Bullet["kind"],
  damage: number,
  radius = 5,
) {
  const cap = friendly ? 72 : s.width < 600 ? 155 : 230;
  if (
    s.bullets.filter((b) => b.friendly === friendly && b.life > 0).length >= cap
  )
    return;
  if (friendly) s.telemetry.fired++;
  s.bullets.push({
    id: ++s.serial,
    x,
    y,
    px: x,
    py: y,
    vx,
    vy,
    age: 0,
    life: 8,
    friendly,
    kind,
    damage,
    radius,
    grazed: false,
    hit: [],
    ship: friendly ? s.ship : undefined,
    originX: x,
    originY: y,
  });
}
function spawnEnemy(
  s: World,
  kind: EnemyKind,
  x: number,
  y: number,
  origin: number,
  summoned = false,
) {
  const hp =
    ENEMY_HEALTH[kind] +
    (s.sector - 1) * 12 +
    (summoned ? (bossStage(s) - 1) * 15 : 0);
  const enemy: Enemy = {
    id: ++s.serial,
    kind,
    x,
    y,
    origin,
    age: 0,
    lifetime: 0,
    hp,
    maxHp: hp,
    fire: 1.5 + origin * 0.9,
    flash: 0,
    targetX: s.player.x,
    targetY: s.player.y,
    state: 0,
    summoned,
    round: 0,
  };
  s.enemies.push(enemy);
  return enemy;
}
export function spawnWave(s: World) {
  s.waveHealthMax = 0;
  const sets: EnemyKind[][] = [
    ["palantir", "musk", "palantir", "musk"],
    ["anduril", "musk", "thiel", "musk", "anduril"],
    ["palantir", "anduril", "thiel", "musk", "musk", "palantir"],
  ];
  const kinds = [...sets[s.wave % 3]];
  if (s.sector >= 2) kinds.push(s.wave % 2 ? "thiel" : "musk");
  for (let i = 0; i < kinds.length; i++)
    s.waveHealthMax += spawnEnemy(
      s,
      kinds[i],
      s.width * (0.12 + (i / Math.max(1, kinds.length - 1)) * 0.76),
      -55 - (i % 3) * 60,
      i / Math.max(1, kinds.length - 1),
    ).maxHp;
  s.wave++;
  s.waveAt = s.sectorTime + 1.5;
}
function summonBossEnemies(s: World, kinds: EnemyKind[]) {
  const max = s.width < 600 ? 4 : BALANCE.maxBossMinions;
  for (const kind of kinds) {
    if (s.enemies.filter((e) => e.hp > 0).length >= max) break;
    const count = s.enemies.length,
      origin =
        (count % 2 ? 0.82 : 0.18) +
        (count > 1 ? (count % 2 ? -0.15 : 0.15) : 0);
    const enemy = spawnEnemy(
      s,
      kind,
      s.boss.x + (count % 2 ? 1 : -1) * bossRadius(s) * 0.8,
      s.boss.y,
      origin,
      true,
    );
    enemy.fire = 1.5 + count * 0.35;
    burst(s, enemy.x, enemy.y, themeColor(s), 0.7);
  }
}
function startSeal(s: World) {
  if (
    s.seal ||
    s.enemies.some((e) => e.kind === "clone" && e.hp > 0) ||
    s.boss.breakWindow > 0
  )
    return;
  s.seal = { age: 0, spawned: false, stage: bossStage(s) };
  s.telemetry.casts++;
}
function cloneSlots(width: number, count: number) {
  if (width < 600) {
    const lower =
      count === 2 ? [0.5] : count === 3 ? [0.2, 0.8] : [0.15, 0.5, 0.85];
    return [
      { x: 0.3, y: 0.21 },
      { x: 0.7, y: 0.21 },
      ...lower.map((x) => ({ x, y: 0.42 })),
    ];
  }
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: 0.12 + (i / count) * 0.76,
    y: 0.22 + (i % 2) * 0.09,
  }));
}
function updateSeal(s: World, dt: number) {
  if (!s.seal) return;
  s.seal.age += dt;
  if (s.seal.age >= BALANCE.cloneSealSeconds && !s.seal.spawned) {
    s.seal.spawned = true;
    const desired =
      s.width < 600
        ? Math.min(3, bossStage(s) + 1)
        : Math.min(4, bossStage(s) + 1);
    const slots = cloneSlots(s.width, desired);
    const realSlot =
      (s.boss.turn + bossStage(s)) % (s.width < 600 ? 2 : slots.length);
    s.boss.anchor = slots[realSlot].x;
    const poof = (x: number, y: number) => {
      burst(s, x, y, "#d8c8bb", 1.5);
      const b = s.bursts.at(-1);
      if (b) b.smoke = true;
    };
    poof(s.boss.x, s.boss.y);
    s.boss.x = s.width * s.boss.anchor;
    for (let i = 0; i < slots.length; i++) {
      if (i === realSlot) continue;
      const x = s.width * slots[i].x,
        y = s.height * slots[i].y;
      const e = spawnEnemy(s, "clone", x, y, slots[i].x, true);
      e.lane = slots[i].y;
      e.fire = 1.35 + i * 0.3;
      poof(x, y);
      s.telemetry.clones++;
    }
    const margin = bossRadius(s) * 0.95 + 12;
    s.boss.x = clamp(s.boss.x, margin, s.width - margin);
  }
  if (s.seal.age > BALANCE.cloneSealSeconds + 0.45) s.seal = null;
}
function targets(s: World) {
  const t = s.enemies
    .filter((e) => e.hp > 0 && e.y > 5)
    .map((e) => ({ x: e.x, y: e.y, id: e.id, enemy: e }));
  if (s.phase === "fight")
    t.push({
      x: s.boss.x,
      y: s.boss.y,
      id: -1,
      enemy: undefined as unknown as Enemy,
    });
  return t;
}
function shootPlayer(s: World) {
  const { x, y, focused } = s.player,
    boosted = s.overdrive > 0,
    power = (boosted ? BALANCE.overdrivePower : 1) * BALANCE.shipDamage;
  const aimTargets = targets(s);
  if (s.ship === 0) {
    const w = WEAPONS[0];
    for (const side of [-1, 1])
      fire(
        s,
        x + side * (focused ? 5 : 12),
        y - 20,
        focused ? 0 : side * 12,
        -740,
        true,
        "ion",
        (focused ? w.focusDamage : w.damage) * power,
        4,
      );
    if (boosted)
      for (const side of [-1, 1])
        fire(
          s,
          x + side * 22,
          y - 7,
          side * 75,
          -700,
          true,
          "ion",
          w.overdriveWingDamage * BALANCE.shipDamage,
          3,
        );
    s.fireAt += focused ? w.focusInterval : w.interval;
  } else if (s.ship === 1) {
    const w = WEAPONS[1];
    for (let i = -1; i <= 1; i++) {
      const angle = -Math.PI / 2 + i * (focused ? 0.065 : 0.2);
      fire(
        s,
        x + i * 8,
        y - 20,
        Math.cos(angle) * 570,
        Math.sin(angle) * 570,
        true,
        "plasma",
        (focused ? w.focusDamage : w.damage) * power,
        5,
      );
    }
    s.fireAt += focused ? w.focusInterval : w.interval;
    if (s.missileAt <= 0) {
      for (const side of [-1, 1])
        fire(
          s,
          x + side * 24,
          y,
          side * 110,
          -290,
          true,
          "seeker",
          w.seekerDamage * power,
          6,
        );
      s.missileAt = w.seekerInterval;
    }
  } else {
    const w = WEAPONS[2];
    if (focused) {
      fire(s, x, y - 28, 0, -1400, true, "rail", w.focusDamage * power, 6);
      s.arcs.push({
        x,
        y: y - 20,
        tx: x,
        ty: 0,
        age: 0,
        seed: random(s),
        rail: true,
      });
      s.fireAt += w.focusInterval;
    } else {
      const available = aimTargets.filter((t) => t.y < y + 25);
      const first = available
        .filter((t) => Math.hypot(t.x - x, t.y - y) < w.range)
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        )[0];
      let target = first,
        from = { x, y: y - 20 },
        damage = w.damage * power;
      const used = new Set<number>();
      for (let i = 0; target && i < (boosted ? 4 : 3); i++) {
        used.add(target.id);
        s.arcs.push({
          x: from.x,
          y: from.y,
          tx: target.x,
          ty: target.y,
          age: 0,
          seed: random(s) * 100,
        });
        if (target.id === -1) damageBoss(s, damage);
        else damageEnemy(s, target.enemy, damage);
        from = target;
        damage *= w.decay;
        target = available
          .filter(
            (t) =>
              !used.has(t.id) &&
              (!t.enemy || t.enemy.hp > 0) &&
              Math.hypot(t.x - from.x, t.y - from.y) < w.jumpRange,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - from.x, a.y - from.y) -
              Math.hypot(b.x - from.x, b.y - from.y),
          )[0];
      }
      if (!first) fire(s, x, y - 22, 0, -700, true, "rail", 9.5 * power, 4);
      s.fireAt += w.interval;
    }
  }
}
function enemyVolley(s: World, e: Enemy) {
  const aim = Math.atan2(Math.max(70, e.targetY - e.y), e.targetX - e.x);
  const round = e.round ?? 0;
  e.round = round + 1;
  if (e.kind === "thiel") {
    for (const side of [-1, 1])
      s.lasers.push({
        x: e.x + side * 7,
        y: e.y - 5,
        tx: e.targetX + side * 7,
        ty: e.targetY,
        age: 0,
        warning: 0.75,
        duration: 0.65,
        owner: e.id,
        width: 4,
      });
    e.fire = 3.6;
  } else if (e.kind === "clone") {
    if (bossStage(s) >= 2 && round % 2 === 0) {
      s.lasers.push({
        x: e.x,
        y: e.y + 8,
        tx: e.targetX,
        ty: e.targetY,
        age: 0,
        warning: 1,
        duration: 0.7,
        owner: e.id,
        width: 3.5,
        sweep: round % 4 ? -0.12 : 0.12,
      });
    } else
      for (let i = -1; i <= 1; i++)
        fire(
          s,
          e.x,
          e.y + 16,
          Math.cos(aim + i * 0.16) * 180,
          Math.sin(aim + i * 0.16) * 180,
          false,
          "prism",
          1,
          5,
        );
    e.fire = 3.1 + e.origin * 0.8;
  } else if (e.kind === "cat") {
    for (let i = -1; i <= 1; i++)
      fire(
        s,
        e.x,
        e.y + 15,
        Math.cos(aim + i * 0.15) * 175,
        Math.sin(aim + i * 0.15) * 175,
        false,
        "orb",
        1,
        4.5,
      );
    e.fire = 2.65 + e.origin * 0.45;
  } else if (e.kind === "anduril" && round % 3 === 2) {
    s.lasers.push({
      x: e.x,
      y: e.y + 20,
      tx: e.targetX,
      ty: e.targetY,
      age: 0,
      warning: 0.95,
      duration: 0.45,
      owner: e.id,
      width: 5,
    });
    e.fire = 2.8;
  } else {
    const count = e.kind === "palantir" ? 3 : 5,
      speed = e.kind === "palantir" ? 195 : 170;
    for (let i = 0; i < count; i++) {
      const a =
        aim + (i - (count - 1) / 2) * (e.kind === "anduril" ? 0.22 : 0.13);
      fire(
        s,
        e.x,
        e.y + 20,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        false,
        "orb",
        1,
        5,
      );
    }
    e.fire = e.kind === "anduril" ? 2.9 : 2.5;
  }
  e.flash = 0.14;
  e.state = 0;
}
function updateEnemies(s: World, dt: number) {
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.age += dt;
    e.lifetime = (e.lifetime ?? 0) + dt;
    e.fire -= dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.kind === "musk") {
      if (e.age < 1.2) e.y += 110 * dt;
      else if (e.state === 0) {
        e.targetX = clamp(s.player.x + s.player.vx * 0.2, 24, s.width - 24);
        e.targetY = clamp(s.player.y + s.player.vy * 0.2, 100, s.height - 85);
        e.state = 1;
        e.fire = 0.72;
      } else if (e.state === 1 && e.fire <= 0) e.state = 2;
      else if (e.state === 2) {
        const d = unitVector(e.targetX - e.x, e.targetY - e.y),
          travel = Math.min(
            Math.hypot(e.targetX - e.x, e.targetY - e.y),
            (s.width < 600 ? 285 : 335) * dt,
          );
        e.x += d.x * travel;
        e.y += d.y * travel;
        if (Math.hypot(e.targetX - e.x, e.targetY - e.y) < 4) {
          e.state = 3;
          e.fire = 0.9;
        }
      } else if (e.state === 3 && e.fire <= 0) {
        e.state = 0;
      }
    } else {
      const cat = e.kind === "cat",
        clone = e.kind === "clone";
      const targetX =
        s.width * (clone ? e.origin : 0.12 + e.origin * 0.76) +
        Math.sin(e.age * (cat ? 1.4 : 0.9) + e.origin * 8) *
          Math.min(cat ? 45 : 25, s.width * 0.055);
      const targetY =
        s.height *
        (clone
          ? (e.lane ?? 0.22 + (e.origin > 0.5 ? 0.08 : 0))
          : cat
            ? 0.28 + e.origin * 0.1
            : 0.17 + e.origin * 0.13);
      e.x += (targetX - e.x) * Math.min(1, dt * 2);
      e.y += (targetY - e.y) * Math.min(1, dt * 1.9);
      if (e.age > 0.7 && e.fire < 0.65 && e.state === 0) {
        e.targetX = clamp(s.player.x + s.player.vx * 0.18, 24, s.width - 24);
        e.targetY = Math.max(e.y + 100, s.player.y);
        e.state = 1;
      }
      if (e.fire <= 0 && e.y > 60) enemyVolley(s, e);
    }
    const radius = e.kind === "clone" ? 34 : e.kind === "cat" ? 18 : 24;
    if (Math.hypot(e.x - s.player.x, e.y - s.player.y) < radius + 7) {
      if (s.player.dashTime > 0) {
        if (!s.dashHits.includes(e.id)) {
          s.dashHits.push(e.id);
          damageEnemy(s, e, e.kind === "musk" ? 70 : 32);
          s.stats.parries++;
        }
      } else hurtPlayer(s);
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}
function bossAttack(s: World) {
  const plan = createBossPlan({
    sector: s.sector,
    stage: bossStage(s),
    turn: s.boss.turn,
    x: s.boss.x,
    y: s.boss.y,
    radius: bossRadius(s),
    playerX: s.player.x,
    playerY: s.player.y,
    vx: s.player.vx,
    vy: s.player.vy,
    width: s.width,
    height: s.height,
  });
  s.attack = {
    ...plan,
    age: 0,
    next: 0,
    shots: plan.events.find((e) => e.type === "volley")?.shots ?? [],
  };
  s.boss.turn++;
  // Explicit recovery after a compound attack gives all hulls a damage window.
  s.boss.attackAt = plan.duration + (bossStage(s) === 3 ? 1.05 : 1.5);
}
function updateTactic(s: World, dt: number) {
  const attack = s.attack;
  if (!attack) return;
  attack.age += dt;
  while (
    attack.next < attack.events.length &&
    attack.events[attack.next].at <= attack.age
  ) {
    const e = attack.events[attack.next++];
    if (e.type === "volley")
      for (const shot of e.shots) {
        const before = s.bullets.length;
        fire(
          s,
          shot.x,
          shot.y,
          shot.vx,
          shot.vy,
          false,
          shot.kind,
          1,
          shot.kind === "bone" ? 6 : 5,
        );
        if (s.bullets.length > before) {
          const b = s.bullets.at(-1)!;
          b.motion = shot.motion;
          b.turn = shot.turn;
          b.returnAt = shot.returnAt;
        }
      }
    else if (e.type === "beam") s.lasers.push({ ...e.beam, age: 0, owner: -1 });
    else if (e.type === "zone")
      s.zones.push({ ...e.zone, age: 0, triggered: false });
    else if (e.type === "wave")
      s.shockwaves.push({ ...e.wave, age: 0, radius: 0, previousRadius: 0 });
    else if (e.type === "lunge")
      s.lunge = { ...e.lunge, age: 0, returning: false };
    else if (e.type === "summon") summonBossEnemies(s, e.kinds);
    else if (e.type === "seal") startSeal(s);
  }
  if (attack.age > attack.duration) s.attack = null;
}
function updateHazards(s: World, dt: number) {
  for (const z of s.zones) {
    z.age += dt;
    if (z.age >= z.warning && z.age < z.warning + z.duration) {
      if (!z.triggered) {
        z.triggered = true;
        burst(s, z.x, z.y, themeColor(s), 1);
        s.shake = Math.max(s.shake, 3);
      }
      if (Math.hypot(s.player.x - z.x, s.player.y - z.y) < z.radius + 5)
        hurtPlayer(s);
    }
  }
  s.zones = s.zones.filter((z) => z.age < z.warning + z.duration);
  for (const wave of s.shockwaves) {
    wave.age += dt;
    wave.previousRadius = wave.radius;
    wave.radius = Math.max(0, wave.age - wave.warning) * wave.speed;
    if (wave.age < wave.warning) continue;
    const distance = Math.hypot(s.player.x - wave.x, s.player.y - wave.y);
    const angle = Math.atan2(s.player.y - wave.y, s.player.x - wave.x);
    const delta = Math.abs(
      Math.atan2(
        Math.sin(angle - waveGap(wave)),
        Math.cos(angle - waveGap(wave)),
      ),
    );
    if (
      delta > wave.gapWidth / 2 &&
      distance >= wave.previousRadius - 10 &&
      distance <= wave.radius + 10
    )
      hurtPlayer(s);
  }
  s.shockwaves = s.shockwaves.filter(
    (w) => w.radius < Math.hypot(s.width, s.height) + 40,
  );
  if (s.lunge) {
    const l = s.lunge;
    l.age += dt;
    if (l.age >= l.warning && l.age < l.warning + l.duration) {
      const oldX = s.boss.x,
        oldY = s.boss.y,
        t = clamp((l.age - l.warning) / l.duration, 0, 1);
      s.boss.x = l.x + (l.tx - l.x) * t;
      s.boss.y = l.y + (l.ty - l.y) * t;
      if (
        segmentHitsCircle(
          oldX,
          oldY,
          s.boss.x,
          s.boss.y,
          s.player.x,
          s.player.y,
          bossRadius(s) * 0.62,
        )
      )
        hurtPlayer(s);
    }
    if (l.age > l.warning + l.duration) {
      l.returning = true;
      if (l.age > l.warning + l.duration + 0.8) s.lunge = null;
    }
  }
}
export function stepWorld(s: World, input: FlightInput, dt: number) {
  s.time += dt;
  s.phaseTime += dt;
  s.shake *= Math.exp(-dt * 9);
  s.flash = Math.max(0, s.flash - dt);
  s.boss.flash = Math.max(0, s.boss.flash - dt);
  for (const b of s.bursts) b.age += dt;
  s.bursts = s.bursts.filter((b) => b.age < (b.text ? 1.8 : 1.25));
  for (const a of s.arcs) a.age += dt;
  s.arcs = s.arcs.filter((a) => a.age < 0.2);
  const cloneFormation =
    s.sector === 3 && s.enemies.some((e) => e.kind === "clone" && e.hp > 0);
  const rawX =
    s.width * (cloneFormation ? s.boss.anchor : 0.5) +
    Math.sin(s.sectorTime * (s.sector === 3 ? 0.58 : 0.43)) *
      Math.min(cloneFormation ? 18 : s.width * 0.17, 120);
  const margin = bossRadius(s) * 0.95 + 12;
  const tx = clamp(rawX, margin, s.width - margin);
  const ty =
    s.height * (cloneFormation && s.width < 600 ? 0.22 : 0.26) +
    Math.sin(s.sectorTime * 0.8) * 13;
  if (!s.lunge || s.lunge.returning) {
    s.boss.x += (tx - s.boss.x) * Math.min(1, dt * (s.lunge ? 3 : 2));
    s.boss.y += (ty - s.boss.y) * Math.min(1, dt * (s.lunge ? 3 : 2));
  }
  if (s.phase === "intro" && s.phaseTime > 2.4) setPhase(s, "waves");
  if (s.phase === "boss-intro" && s.phaseTime > 3) setPhase(s, "fight");
  if (s.phase === "transform" && s.phaseTime > transformSeconds(s))
    setPhase(s, "fight");
  if (s.phase === "dying") {
    if (s.phaseTime > 2.2) {
      if (s.sector === 3) {
        s.best = Math.max(s.best, s.score);
        setPhase(s, "win");
      } else setPhase(s, "sector-clear");
    }
    return;
  }
  if (s.phase === "sector-clear" && s.phaseTime > 4) {
    s.player.hull = Math.min(BALANCE.hull, s.player.hull + 1);
    prepareSector(s, (s.sector + 1) as Sector);
    setPhase(s, "intro");
  }
  if (!flightPhase(s.phase)) return;
  s.player.invincible = Math.max(0, s.player.invincible - dt);
  s.pulseAt = Math.max(0, s.pulseAt - dt);
  s.shipSwapAt = Math.max(0, s.shipSwapAt - dt);
  const motion = stepFlight(
    s.player,
    { ...input, speedScale: WEAPONS[s.ship].move },
    dt,
    {
      width: s.width,
      height: s.height,
    },
  );
  if (motion.dashEnded && input.target) {
    input.target.x = s.player.x;
    input.target.y = s.player.y;
  }
  if (!activePhase(s.phase)) return;
  s.stats.seconds += dt;
  if (s.phase === "fight") {
    s.boss.stageTime += dt;
    s.boss.breakWindow = Math.max(0, s.boss.breakWindow - dt);
    s.telemetry.stageSeconds[bossStage(s) - 1] += dt;
  }
  s.sectorTime += dt;
  s.overdrive = Math.max(0, s.overdrive - dt);
  s.comboTime = Math.max(0, s.comboTime - dt);
  if (!s.comboTime) s.combo = 1;
  s.fireAt -= dt;
  s.missileAt -= dt;
  if (s.fireAt <= 0) shootPlayer(s);
  if (s.phase === "waves") {
    if (s.wave < 3 && !s.enemies.length && s.sectorTime > s.waveAt)
      spawnWave(s);
    if (s.wave === 3 && !s.enemies.length) {
      clearOrdnance(s);
      setPhase(s, "boss-intro");
    }
  }
  updateEnemies(s, dt);
  if (s.phase === "fight") {
    s.boss.attackAt -= dt;
    if (s.boss.attackAt <= 0) bossAttack(s);
    if (
      Math.hypot(s.player.x - s.boss.x, s.player.y - s.boss.y) <
      bossRadius(s) * 0.82
    )
      hurtPlayer(s);
  }
  updateTactic(s, dt);
  updateSeal(s, dt);
  updateHazards(s, dt);
  for (const laser of s.lasers) {
    laser.age += dt;
    // Killing a laser unit interrupts its charge and beam immediately.
    if (
      laser.owner > 0 &&
      !s.enemies.some((e) => e.id === laser.owner && e.hp > 0)
    ) {
      laser.age = 100;
      continue;
    }
    if (
      laser.age >= laser.warning &&
      laser.age < laser.warning + laser.duration
    ) {
      const end = beamEnd(laser, s.height * 2.5);
      if (
        segmentHitsCircle(
          laser.x,
          laser.y,
          end.x,
          end.y,
          s.player.x,
          s.player.y,
          laser.width + 5,
        )
      )
        hurtPlayer(s);
    }
  }
  s.lasers = s.lasers.filter((b) => b.age < b.warning + b.duration);
  if (s.pulse) {
    const p = s.pulse;
    p.age += dt;
    const r = Math.min(s.width * 0.42, 210) * Math.min(1, p.age / 0.4);
    for (const b of s.bullets)
      if (!b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < r) {
        b.life = 0;
        s.stats.parries++;
        addCharge(s, 1);
      }
    for (const e of s.enemies)
      if (!p.hits.includes(e.id) && Math.hypot(e.x - p.x, e.y - p.y) < r + 25) {
        p.hits.push(e.id);
        damageEnemy(s, e, BALANCE.pulseDamage);
      }
    if (
      s.phase === "fight" &&
      !p.hits.includes(-1) &&
      Math.hypot(s.boss.x - p.x, s.boss.y - p.y) < r + bossRadius(s)
    ) {
      p.hits.push(-1);
      damageBoss(s, BALANCE.pulseBossDamage);
    }
    if (p.age > 0.65) s.pulse = null;
  }
  const candidates = targets(s);
  for (const b of s.bullets) {
    if (b.life <= 0) continue;
    b.px = b.x;
    b.py = b.y;
    b.age += dt;
    b.life -= dt;
    if (b.motion === "curve") {
      const angle = (b.turn ?? 0.3) * dt,
        c = Math.cos(angle),
        sn = Math.sin(angle),
        vx = b.vx;
      b.vx = vx * c - b.vy * sn;
      b.vy = vx * sn + b.vy * c;
    } else if (b.motion === "return" && b.age > (b.returnAt ?? 1.35)) {
      Object.assign(
        b,
        turnVelocity(
          b.vx,
          b.vy,
          b.x,
          b.y,
          b.originX ?? b.px,
          b.originY ?? b.py,
          dt,
        ),
      );
      if (
        b.age > 2 &&
        Math.hypot(b.x - (b.originX ?? 0), b.y - (b.originY ?? 0)) < 20
      )
        b.life = 0;
    }
    if (b.kind === "seeker" && b.age > 0.12) {
      const target = candidates
        .filter((t) => t.y < b.y + 50)
        .sort(
          (a, c) =>
            Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y),
        )[0];
      if (target) {
        const aim = unitVector(target.x - b.x, target.y - b.y);
        const t = 1 - Math.exp(-dt * 4);
        b.vx += (aim.x * 490 - b.vx) * t;
        b.vy += (aim.y * 490 - b.vy) * t;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.friendly) {
      for (const target of candidates) {
        if (b.hit.includes(target.id) || (target.enemy && target.enemy.hp <= 0))
          continue;
        if (
          !segmentHitsCircle(
            b.px,
            b.py,
            b.x,
            b.y,
            target.x,
            target.y,
            (target.id === -1
              ? bossRadius(s) * 0.8
              : target.enemy.kind === "clone"
                ? 36
                : target.enemy.kind === "cat"
                  ? 18
                  : 24) + b.radius,
          )
        )
          continue;
        b.hit.push(target.id);
        s.telemetry.hits++;
        if (target.id === -1) damageBoss(s, b.damage);
        else {
          damageEnemy(s, target.enemy, b.damage);
        }
        burst(s, b.x, b.y, SHIPS[s.ship].color, 0.25);
        if (b.kind !== "rail" || b.hit.length >= 2) {
          b.life = 0;
          break;
        }
        b.damage *= 0.72;
      }
    } else {
      const hit = segmentHitsCircle(
        b.px,
        b.py,
        b.x,
        b.y,
        s.player.x,
        s.player.y,
        b.radius + 5,
      );
      if (hit && s.player.dashTime > 0) {
        b.life = 0;
        s.stats.parries++;
        addCharge(s, 2);
        points(s, 15);
      } else if (hit) {
        hurtPlayer(s);
        b.life = 0;
      } else if (
        !b.grazed &&
        Math.hypot(b.x - s.player.x, b.y - s.player.y) < b.radius + 17
      ) {
        b.grazed = true;
        s.stats.grazes++;
        addCharge(s, 2.5);
        points(s, 10);
      }
    }
    if (b.x < -70 || b.x > s.width + 70 || b.y < -80 || b.y > s.height + 70)
      b.life = 0;
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
  for (const drop of s.drops) {
    drop.age += dt;
    drop.y += 65 * dt;
    const dist = Math.hypot(s.player.x - drop.x, s.player.y - drop.y);
    if (dist < 140) {
      const v = unitVector(s.player.x - drop.x, s.player.y - drop.y);
      drop.x += v.x * 220 * dt;
      drop.y += v.y * 220 * dt;
    }
    if (dist < 24) {
      if (drop.kind === "repair")
        s.player.hull = Math.min(BALANCE.hull, s.player.hull + 1);
      else addCharge(s, 15);
      burst(
        s,
        drop.x,
        drop.y,
        "#a4ffbd",
        0.5,
        drop.kind === "repair" ? "+1" : undefined,
      );
      drop.age = 99;
    }
  }
  s.drops = s.drops.filter((d) => d.age < 12 && d.y < s.height + 30);
  s.best = Math.max(s.best, s.score);
}
export function campaignRank(s: World) {
  return runRank(s.stats, s.phase === "win");
}
export function resizeWorld(s: World, width: number, height: number) {
  const sx = width / s.width,
    sy = height / s.height;
  for (const item of [
    s.player,
    s.boss,
    ...s.enemies,
    ...s.bullets,
    ...s.drops,
    ...s.bursts,
  ]) {
    item.x *= sx;
    item.y *= sy;
  }
  for (const b of s.bullets) {
    b.px *= sx;
    b.py *= sy;
    if (b.originX !== undefined) b.originX *= sx;
    if (b.originY !== undefined) b.originY *= sy;
  }
  for (const e of s.enemies) {
    e.targetX *= sx;
    e.targetY *= sy;
  }
  // A resize invalidates an aimed telegraph; give the pilot a fresh warning.
  s.lasers.length = s.arcs.length = 0;
  s.zones.length = s.shockwaves.length = 0;
  s.lunge = null;
  s.seal = null;
  s.attack = null;
  s.boss.attackAt = Math.max(1.3, s.boss.attackAt);
  if (s.pulse) {
    s.pulse.x *= sx;
    s.pulse.y *= sy;
  }
  s.width = width;
  s.height = height;
  const clones = s.enemies.filter((e) => e.kind === "clone" && e.hp > 0);
  if (s.sector === 3 && clones.length) {
    const slots = cloneSlots(width, clones.length),
      real = (s.boss.turn + bossStage(s)) % (width < 600 ? 2 : slots.length);
    s.boss.anchor = slots[real].x;
    s.boss.x = width * s.boss.anchor;
    s.boss.y = height * (width < 600 ? 0.22 : 0.26);
    const other = slots.filter((_, i) => i !== real);
    clones.forEach((e, i) => {
      e.origin = other[i].x;
      e.lane = other[i].y;
      e.x = width * e.origin;
      e.y = height * e.lane;
    });
    const margin = bossRadius(s) * 0.95 + 12;
    s.boss.x = clamp(s.boss.x, margin, width - margin);
  }

  s.player.x = clamp(s.player.x, 24, Math.max(24, width - 24));
  s.player.y = clamp(s.player.y, 76, Math.max(76, height - 82));
}
