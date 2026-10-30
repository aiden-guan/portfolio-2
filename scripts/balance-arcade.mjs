import { mkdirSync, writeFileSync } from "node:fs";
import { benchmarkWeapon, runBossPilot, balance } from "./arcade-harness.mjs";
const ships = ["Kestrel", "Helix", "Wraith"];
const weapons = ships.map((ship, i) => ({
  ship,
  normalDps: benchmarkWeapon(i),
  focusedDps: benchmarkWeapon(i, true),
  overdriveFocusedDps: benchmarkWeapon(i, true, true),
}));
console.log("Measured damage/sec:", weapons);
const encounters = [];
for (const width of [390, 1200])
  for (const sector of [1, 2, 3])
    for (const stage of [1, 2, 3])
      for (const policy of ["stationary", "strafe", "aware"])
        for (const ship of [0, 1, 2]) {
          encounters.push(
            runBossPilot({ width, sector, stage, ship, policy, seconds: 60 }),
          );
        }
const report = {
  method: {
    stepHz: 120,
    damageWindowSeconds: 10,
    damageWarmupSeconds: 4,
    damageTarget:
      "Aligned, unarmored target; Wraith arcs at 240px, other weapons at 360px; incoming attacks disabled only for weapon measurement.",
    pilot:
      "All three hulls, normal collision/damage/movement, no health or damage overrides. Aware policy makes four decisions/sec from visible threat state. Each boss phase starts independently; one deterministic seed, 162 trials. This is a regression benchmark, not a claim of human difficulty or studio playtesting. The overdrive damage column measures active power, not its sustainable uptime.",
  },
  tuning: balance.BALANCE,
  weapons,
  encounters,
};
mkdirSync(new URL("../docs", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../docs/arcade-balance.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
for (const policy of ["stationary", "strafe", "aware"]) {
  const rows = encounters.filter((e) => e.policy === policy);
  console.log(policy, {
    cleared: rows.filter((r) => r.result === "phase-cleared").length,
    defeated: rows.filter((r) => r.result === "defeated").length,
    timeLimit: rows.filter((r) => r.result === "time-limit").length,
    total: rows.length,
    hits: rows.reduce((n, r) => n + r.hits, 0),
  });
}
for (const ship of [0, 1, 2]) {
  const rows = encounters.filter(
    (e) => e.ship === ship && e.policy === "aware",
  );
  console.log(ships[ship], {
    awareClears: rows.filter((e) => e.result === "phase-cleared").length,
    total: rows.length,
  });
}
