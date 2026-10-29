export type VolleyShot = { x: number; y: number; vx: number; vy: number };
export type Volley = {
  kind: "fan" | "aim" | "lanes" | "heart" | "petals";
  shots: VolleyShot[];
};
export const OVERDRIVE_SECONDS = 6.5;
export const WARNING_SECONDS = 0.85;

// Preview and live fire share these exact paths; attacks commit before they fire.
export function planVolley(
  form: 1 | 2,
  turn: number,
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  width: number,
  speed: number,
): Volley {
  const sequence: Volley["kind"][] =
    form === 1
      ? ["fan", "aim", "lanes", "fan"]
      : ["heart", "petals", "lanes", "heart", "aim"];
  const kind = sequence[turn % sequence.length];
  const shots: VolleyShot[] = [];
  const radial = (angle: number, sx = x, sy = y) =>
    shots.push({
      x: sx,
      y: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  if (kind === "fan") {
    for (let i = 0; i < 7; i++)
      radial(
        Math.PI * 0.2 + (i / 6) * Math.PI * 0.6 + Math.sin(turn * 1.7) * 0.09,
      );
  } else if (kind === "aim") {
    const aim = Math.atan2(Math.max(80, targetY - y), targetX - x);
    for (let i = -2; i <= 2; i++) radial(aim + i * 0.27);
  } else if (kind === "lanes") {
    const columns = Math.max(6, Math.min(11, Math.floor(width / 100)));
    const gap = Math.max(62, (width / columns) * 0.7);
    for (let i = 0; i <= columns; i++) {
      const sx = width * (0.08 + (i / columns) * 0.84);
      if (Math.abs(sx - targetX) > gap)
        shots.push({ x: sx, y: y - 25, vx: 0, vy: speed * 0.88 });
    }
  } else if (kind === "heart") {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      shots.push({
        x,
        y,
        vx: ((16 * Math.sin(a) ** 3) / 20) * speed,
        vy:
          (-(
            13 * Math.cos(a) -
            5 * Math.cos(2 * a) -
            2 * Math.cos(3 * a) -
            Math.cos(4 * a)
          ) /
            20) *
            speed +
          12,
      });
    }
  } else {
    const gap = Math.atan2(targetY - y, targetX - x);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const distance = Math.abs(
        Math.atan2(Math.sin(a - gap), Math.cos(a - gap)),
      );
      if (distance > 0.36) radial(a);
    }
  }
  return { kind, shots };
}

export function createRunStats() {
  return {
    seconds: 0,
    hits: 0,
    grazes: 0,
    parries: 0,
    drones: 0,
    continues: 0,
    overdrives: 0,
  };
}
export type RunStats = ReturnType<typeof createRunStats>;
export function runRank(stats: RunStats, cleared: boolean) {
  if (!cleared) return "";
  if (stats.continues) return "B";
  if (stats.hits <= 1) return "S";
  return stats.hits <= 3 ? "A" : stats.hits <= 6 ? "B" : "C";
}
export function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
