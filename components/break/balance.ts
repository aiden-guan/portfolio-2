// Combat values live together so damage, recovery and encounter length can be
// measured as a system. The benchmark script exercises these through the engine.
export const BALANCE = {
  hull: 4,
  hitRecovery: 0.95,
  dashCooldown: 2.6,
  pulseCooldown: 20,
  pulseDamage: 38,
  pulseBossDamage: 24,
  overdriveSeconds: 4.5,
  overdrivePower: 1.28,
  shipSwapCooldown: 3,
  repairEvery: 14,
  maxBossMinions: 5,
  cloneSealSeconds: 1.8,
  shipDamage: 1.15,
} as const;

export const WEAPONS = [
  {
    interval: 0.2,
    damage: 5.5,
    focusInterval: 0.22,
    focusDamage: 7.25,
    overdriveWingDamage: 0.8,
    move: 1.04,
  },
  {
    interval: 0.3,
    damage: 5.5,
    focusInterval: 0.34,
    focusDamage: 6,
    move: 0.88,
    seekerDamage: 11,
    seekerInterval: 2.8,
  },
  {
    interval: 0.48,
    damage: 25,
    focusInterval: 0.7,
    focusDamage: 42,
    move: 0.96,
    range: 275,
    jumpRange: 130,
    decay: 0.45,
  },
] as const;

export const ENEMY_HEALTH = {
  palantir: 105,
  anduril: 165,
  musk: 85,
  thiel: 140,
  cat: 90,
  clone: 150,
} as const;

export const BOSS_HEALTH = {
  guan: [800, 950, 1150],
  phoebe: 2200,
  allen: 2800,
} as const;
