export type VolleyShot = { x: number; y: number; vx: number; vy: number };
export type Volley = {
  kind: "fan" | "aim" | "lanes" | "heart" | "petals";
  shots: VolleyShot[];
};
export const OVERDRIVE_SECONDS = 5.5;
export const PULSE_COOLDOWN = 22;
export const pulseRadius = (width: number, height: number) =>
  Math.max(120, Math.min(175, Math.min(width, height) * 0.31));
export const pulseWaveRadius = (age: number, radius: number) =>
  radius * (1 - (1 - Math.min(1, age / 0.42)) ** 3);
export const WARNING_SECONDS = 0.85;
export type BossForm = 1 | 2 | 3;
export type EnemyKind = "scout" | "palantir" | "anduril";
export const EVIL_INKS = [
  "#231820",
  "#432b37",
  "#76404b",
  "#ae6866",
  "#d99b8c",
  "#f2cbb5",
  "#f04843",
  "#ff916b",
  "#fff2cd",
];

// Brief steering with a fixed turn limit lets a missile be readable and dodgeable.
export function steerSeeker(
  vx: number,
  vy: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
  dt: number,
) {
  const heading = Math.atan2(vy, vx);
  const desired =
    Math.hypot(tx - x, ty - y) < 1 ? heading : Math.atan2(ty - y, tx - x);
  const delta = Math.atan2(
    Math.sin(desired - heading),
    Math.cos(desired - heading),
  );
  const angle = heading + Math.max(-dt * 1.05, Math.min(dt * 1.05, delta));
  return { vx: Math.cos(angle) * 162, vy: Math.sin(angle) * 162 };
}
export function evilDetails(cols: number, rows: number) {
  const marks: { col: number; row: number; ink: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const col = Math.round(cols * 0.28) + i;
    const row = Math.round(rows * 0.575) + Math.floor(i / 4);
    for (let dy = -1; dy <= 1; dy++) {
      const ink = dy === 0 ? (i > 1 && i < 5 ? 8 : 7) : 6;
      marks.push(
        { col, row: row + dy, ink },
        { col: cols - 1 - col, row: row + dy, ink },
      );
    }
  }
  for (let i = 0; i < 12; i++)
    marks.push({
      col: Math.round(cols * 0.63) + Math.floor(i * 0.24),
      row: Math.round(rows * 0.66) + i,
      ink: i % 3 ? 6 : 7,
    });
  return marks;
}

// Preview and live fire share these exact paths; attacks commit before they fire.
export function planVolley(
  form: BossForm,
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
      : form === 2
        ? ["heart", "petals", "lanes", "heart", "aim"]
        : ["petals", "aim", "lanes", "fan"];
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
    for (let i = 0; i < 9; i++)
      radial(
        Math.PI * 0.2 + (i / 8) * Math.PI * 0.6 + Math.sin(turn * 1.7) * 0.09,
      );
  } else if (kind === "aim") {
    const aim = Math.atan2(Math.max(80, targetY - y), targetX - x);
    for (let i = -3; i <= 3; i++) radial(aim + i * 0.19);
  } else if (kind === "lanes") {
    const columns = Math.max(6, Math.min(11, Math.floor(width / 100)));
    const gap = Math.max(40, (width / columns) * 0.52);
    const safeX = Math.max(
      width * 0.12,
      Math.min(
        width * 0.88,
        targetX + (turn % 2 ? -1 : 1) * Math.min(90, width * 0.14),
      ),
    );
    for (let i = 0; i <= columns; i++) {
      const sx = width * (0.08 + (i / columns) * 0.84);
      if (Math.abs(sx - safeX) > gap)
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
    const gap =
      Math.atan2(targetY - y, targetX - x) + (turn % 2 ? -0.42 : 0.42);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const distance = Math.abs(
        Math.atan2(Math.sin(a - gap), Math.cos(a - gap)),
      );
      if (distance > 0.29) radial(a);
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
