# Arcade combat tuning

The original CRT, pixel portraits and Guan's three visual forms remain. This pass changes encounter behavior and the power economy.

## Ship budgets

`npm run balance:arcade` measures real weapon hits after four seconds of travel/warmup, over a ten-second window against an aligned, unarmored target. It writes [arcade-balance.json](arcade-balance.json). Overdrive is held active only to measure its active damage rate; this does not represent sustainable uptime.

| Hull | Normal damage/sec | Focused damage/sec | Focused overdrive damage/sec | Tradeoff |
| --- | ---: | ---: | ---: | --- |
| Kestrel | 68.8 | 83.4 | 115.8 | Fastest handling, precise forward coverage; Focus slows movement |
| Helix | 80.4 | 78.5 | 100.5 | Spread and seekers, 12% slower handling; all-pellet measurements assume alignment |
| Wraith | 65.6 | 73.5 | 94.1 | Arcs require a target within 275px, jumps within 130px, and lose 55% damage per jump; rail pierces at reduced damage |

Every ship weapon now deals 25% more damage than the base rebalance, including focused fire, seekers, chained hits, and overdrive wing shots. The multiplier increased from 1.15 to 1.25, an additional 8.7%. Enemy health, attack speed, warnings, summon pressure, recovery windows, and player defensive cooldowns retain the preceding tuning.

For comparison, the previous nominal focused rates were about 169, 168, and 112 damage/sec. Those older formulas assumed all shots hit and did not account for accuracy or target movement.

Enemy base health is now 85–165 HP rather than 26–62 HP. Sector/stage bonuses increase it further. The shared values are in `components/break/balance.ts`.

- Four hull points; 0.95 seconds of recovery after a hit.
- Dash recovery: 2.6 seconds. A dash can damage a given enemy once, eliminating the old per-tick melee damage exploit.
- Local EMP recovery: 20 seconds; its damage is reduced, and it cannot erase boss beams or arena hazards.
- Overdrive: 4.5 seconds at 1.28× power. Boss damage no longer charges the next overdrive.
- Repairs: one eligible regular kill in fourteen, plus one hull between levels. Boss summons never produce repairs. Phase changes provide no hull healing.
- A death during a boss phase checkpoints that phase. Continues skip its preceding waves, cost 40% score, and cap the clear rank at B. Difficulty comes from the fight rather than a long replay before another attempt.
- Hull swapping has a three-second cooldown and cannot shorten a weapon's current firing delay.
- High scores use a new balance-version storage key. Earlier records remain in the previous key.

## Nine boss stages

| Boss | Stage | Mechanic and counterplay |
| --- | --- | --- |
| Guan | Human | Alternating flank crossfire, marked positions, shifting two-lane corridors, Palantir/Musk guards. Move after attacks lock rather than remaining under the boss. |
| Guan | Catboy | Counter-curving hearts, marked heart traps, split side volleys, Anduril/Palantir guards. Preserve a route out of the next marked area. |
| Guan | Evil | Counter-sweeping beams and alternating lane grids, backed by Anduril/Thiel support. Interrupt support fire and cross beams with a timed dash. |
| Phoebe | Fetch | Returning bones and sequential paw marks; summons two cat-ear Guan echoes. Bones turn back only after reaching the original target distance. |
| Phoebe | Pack Instinct | Three cat echoes, paw traps, and expanding howls with a visible opening. Clear flank pressure and move into the opening. |
| Phoebe | Zoomies | A committed pounce corridor alternates with paired howls and paw traps. Avoid the marked lunge, then use the repositioning/recovery window. |
| Allen | Shadow Clone Technique | Three hand-sign frames precede a smoke burst and two copies. Copies are destructible combatants, not visual decoys. |
| Allen | Mirror Maze | Three copies, interruptible clone lasers, core beams and marked seals. Clearing copies removes their beams and exposes the real boss. |
| Allen | One Real Founder | Four copies on desktop, three on phone; staggered rows on narrow screens, prism corridors, marked seals and a gap-based pulse. The real portrait remains inside the arena. |

Phoebe and Allen have health gates at 66% and 33%. Overflow damage cannot skip a stage. Guan retains his original human/catboy/evil transformations. Every stage has an explicit compound-attack duration and recovery interval.

Allen receives 55% damage while copies survive. Clearing the last copy opens a four-second damage window. A batch is not replenished while an earlier copy survives, so this cannot become an endless refill fight. The [hand-seal source and generation prompt](arcade-hand-seal.md) document the new transparent asset; it is sampled into the established palette at runtime.

## Validation scope

The report runs 162 isolated phase trials: all three hulls, nine phases, two widths, and three movement policies. Normal damage, cooldowns and movement remain enabled. The aware policy makes four decisions/sec using visible threats and weapon-specific positioning; it uses Focus for Wraith when outside arc range. Its success rate is a regression signal, not a fair human ranking of the hulls or a human win-rate estimate. Each phase starts independently, so these trials do not measure cumulative campaign attrition.

The unit/integration suite separately checks phase gates, minion caps, hand-sign timing, clone interruption and vulnerability, damage budgets, cooldown exploits, warning/collision agreement, swept projectile hits, bounds, cleanup, and complete campaign state progression. The progression test uses damage immunity only to isolate state transitions. Visual rehearsal uses the real simulation and renderer with player damage disabled; live browser control checks use the actual game.
