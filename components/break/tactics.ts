import { clamp, unitVector } from "@/components/break/physics";

export type BossStage = 1 | 2 | 3;
export const BOSS_STAGES = [
  ["HUMAN / CROSS EXAMINATION", "CATBOY / HEARTBREAK", "EVIL / KILL SWITCH"],
  ["FETCH", "PACK INSTINCT", "ZOOMIES"],
  ["SHADOW CLONE TECHNIQUE", "MIRROR MAZE", "ONE REAL FOUNDER"],
] as const;
export type ShotKind =
  "ion" | "plasma" | "seeker" | "rail" | "orb" | "bone" | "prism";
export type EnemyKind =
  "palantir" | "anduril" | "musk" | "thiel" | "cat" | "clone";
export type PlannedShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: ShotKind;
  motion?: "curve" | "return";
  turn?: number;
  returnAt?: number;
};
export type BeamSpec = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  warning: number;
  duration: number;
  width: number;
  sweep?: number;
};
export type ZoneSpec = {
  x: number;
  y: number;
  radius: number;
  warning: number;
  duration: number;
  paw: boolean;
  heart?: boolean;
};
export type WaveSpec = {
  x: number;
  y: number;
  gap: number;
  gapWidth: number;
  warning: number;
  speed: number;
};
export type LungeSpec = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  warning: number;
  duration: number;
};
export type TacticEvent =
  | { at: number; type: "volley"; shots: PlannedShot[] }
  | { at: number; type: "beam"; beam: BeamSpec }
  | { at: number; type: "zone"; zone: ZoneSpec }
  | { at: number; type: "wave"; wave: WaveSpec }
  | { at: number; type: "lunge"; lunge: LungeSpec }
  | { at: number; type: "summon"; kinds: EnemyKind[] }
  | { at: number; type: "seal" };
export type BossPlan = {
  kind: string;
  label: string;
  duration: number;
  events: TacticEvent[];
};
export type BossContext = {
  sector: number;
  stage: BossStage;
  turn: number;
  x: number;
  y: number;
  radius: number;
  playerX: number;
  playerY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
};

function aimFan(
  c: BossContext,
  x: number,
  y: number,
  count: number,
  spread: number,
  speed: number,
  kind: ShotKind,
  offset = 0,
): PlannedShot[] {
  const a = Math.atan2(Math.max(90, c.playerY - y), c.playerX - x) + offset;
  return Array.from({ length: count }, (_, i) => ({
    x,
    y,
    vx: Math.cos(a + (i - (count - 1) / 2) * spread) * speed,
    vy: Math.sin(a + (i - (count - 1) / 2) * spread) * speed,
    kind,
  }));
}
function lanes(c: BossContext, shift: number, speed: number): PlannedShot[] {
  const count = c.width < 600 ? 7 : 12,
    spacing = c.width / (count + 1);
  // Two adjacent clear lanes, committed before launch. The corridor shifts once
  // between salvos, rather than tracking the player after the warning.
  const safe = clamp(Math.round(c.playerX / spacing) + shift, 2, count - 1);
  return Array.from({ length: count }, (_, i) => i + 1)
    .filter((i) => Math.abs(i - safe) > 1)
    .map((i) => ({ x: spacing * i, y: 82, vx: 0, vy: speed, kind: "prism" }));
}
function heart(c: BossContext, reverse: boolean): PlannedShot[] {
  const count = c.width < 600 ? 16 : 22;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return {
      x: c.x,
      y: c.y + c.radius * 0.55,
      vx: Math.sin(a) ** 3 * 155,
      vy:
        -(
          13 * Math.cos(a) -
          5 * Math.cos(2 * a) -
          2 * Math.cos(3 * a) -
          Math.cos(4 * a)
        ) *
          9 +
        48,
      kind: "orb",
      motion: "curve",
      turn: reverse ? -0.3 : 0.3,
    };
  });
}
export function createBossPlan(c: BossContext): BossPlan {
  const events: TacticEvent[] = [];
  const mobile = c.width < 600;
  const py = clamp(c.playerY + c.vy * 0.2, c.height * 0.48, c.height - 94);
  const px = clamp(c.playerX + c.vx * 0.22, 36, c.width - 36);
  const count = mobile ? 3 : 5;
  const volley = (at: number, shots: PlannedShot[]) =>
    events.push({ at, type: "volley", shots });
  const summon = (kinds: EnemyKind[]) =>
    events.push({ at: 0.15, type: "summon", kinds });
  const zone = (
    at: number,
    x: number,
    y: number,
    paw = false,
    warning = 1.05,
  ) =>
    events.push({
      at,
      type: "zone",
      zone: {
        x: clamp(x, 35, c.width - 35),
        y: clamp(y, 115, c.height - 85),
        radius: Math.min(mobile ? 39 : 53, c.width * 0.1),
        warning,
        duration: 0.65,
        paw,
        heart: c.sector === 1 && c.stage === 2,
      },
    });
  const returning = (shots: PlannedShot[]) =>
    shots.map((s) => ({
      ...s,
      motion: "return" as const,
      returnAt: clamp(
        Math.hypot(c.playerX - s.x, c.playerY - s.y) / Math.hypot(s.vx, s.vy) +
          0.3,
        1.35,
        2.7,
      ),
    }));
  let label: string, duration: number;
  const alternate = c.turn % 2 === 1;

  if (c.sector === 1 && c.stage === 1) {
    label = alternate ? "DEAD LETTER" : "CROSS EXAMINATION";
    duration = 4.7;
    if (!alternate) {
      for (let i = 0; i < 4; i++)
        volley(
          0.95 + i * 0.47,
          aimFan(
            c,
            c.x + (i % 2 ? 1 : -1) * c.radius * 0.75,
            c.y + c.radius * 0.3,
            count,
            0.14,
            195,
            "orb",
          ),
        );
      if (c.turn % 4 === 0) summon(["palantir", "musk"]);
    } else {
      volley(1.05, lanes(c, c.turn % 4 === 1 ? 1 : -1, 190));
      zone(0.6, px, py);
      volley(2.1, lanes(c, c.turn % 4 === 1 ? -1 : 1, 190));
      volley(2.7, aimFan(c, c.x, c.y + c.radius * 0.5, 3, 0.2, 210, "orb"));
    }
  } else if (c.sector === 1 && c.stage === 2) {
    label = alternate ? "SPLIT AFFECTION" : "HEARTBREAK";
    duration = 5;
    volley(0.9, heart(c, alternate));
    volley(1.9, heart(c, !alternate));
    zone(0.6, px, py, false, 1.15);
    zone(
      2,
      px + (alternate ? -1 : 1) * Math.min(75, c.width * 0.17),
      py,
      false,
      1.15,
    );
    for (const side of [-1, 1])
      volley(
        2.8 + (side + 1) * 0.16,
        aimFan(c, c.x + side * c.radius, c.y, 3, 0.13, 205, "orb", side * 0.15),
      );
    if (c.turn % 3 === 0) summon(["anduril", "palantir"]);
  } else if (c.sector === 1) {
    label = alternate ? "ZERO SIGNAL" : "KILL SWITCH";
    duration = 5.5;
    if (!alternate) {
      for (const side of [-1, 1])
        events.push({
          at: side < 0 ? 0.05 : 1.8,
          type: "beam",
          beam: {
            x: c.x + side * c.radius * 0.55,
            y: c.y,
            tx: px + side * Math.min(100, c.width * 0.16),
            ty: py,
            warning: 1.2,
            duration: 1.35,
            width: 5,
            sweep: -side * 0.5,
          },
        });
      zone(1.1, c.playerX < c.width / 2 ? 45 : c.width - 45, py);
    } else {
      for (let i = 0; i < 3; i++)
        volley(0.9 + i * 0.65, lanes(c, i % 2 ? 1 : -1, 210));
      volley(2.8, aimFan(c, c.x, c.y + c.radius * 0.4, 5, 0.17, 190, "orb"));
    }
    if (c.turn % 3 === 0) summon(["anduril", "thiel"]);
  } else if (c.sector === 2 && c.stage === 1) {
    label = alternate ? "PAW PRINT PURSUIT" : "FETCH / RETURN TO SENDER";
    duration = 5.2;
    if (!alternate) {
      const bones = returning(
        aimFan(c, c.x, c.y + c.radius * 0.5, 3, 0.32, 190, "bone"),
      );
      volley(1, bones);
      volley(2, aimFan(c, c.x, c.y, 3, 0.19, 175, "bone", 0.16));
    } else {
      for (let i = 0; i < 3; i++)
        zone(
          i * 0.45,
          px + (i - 1) * Math.min(70, c.width * 0.16),
          py + i * 12,
          true,
        );
      volley(
        2.4,
        aimFan(c, c.x, c.y + c.radius * 0.5, count, 0.17, 190, "bone"),
      );
    }
    if (c.turn % 2 === 0) summon(["cat", "cat"]);
  } else if (c.sector === 2 && c.stage === 2) {
    label = alternate ? "TREAT TRAP" : "PACK INSTINCT";
    duration = 5.8;
    if (c.turn % 2 === 0) summon(["cat", "cat", "cat"]);
    for (let i = 0; i < 3; i++)
      zone(
        0.25 + i * 0.6,
        px + (i % 2 ? 1 : -1) * Math.min(80, c.width * 0.18),
        py,
        true,
        1.15,
      );
    events.push({
      at: 1.3,
      type: "wave",
      wave: {
        x: c.x,
        y: c.y,
        gap: Math.atan2(py - c.y, px - c.x) + (alternate ? -0.38 : 0.38),
        gapWidth: 1.15,
        warning: 0.85,
        speed: 165,
      },
    });
    volley(2.6, returning(aimFan(c, c.x, c.y, 3, 0.24, 185, "bone")));
  } else if (c.sector === 2) {
    label = alternate ? "HOWL / KEEP MOVING" : "ZOOMIES";
    duration = 6.2;
    if (c.turn % 2 === 0) summon(["cat", "cat", "cat"]);
    if (!alternate) {
      const tx = clamp(px, c.radius * 0.7, c.width - c.radius * 0.7),
        ty = Math.min(c.height * 0.72, py - 35);
      events.push({
        at: 0.15,
        type: "lunge",
        lunge: { x: c.x, y: c.y, tx, ty, warning: 1.1, duration: 0.38 },
      });
      zone(1.65, px, py, true);
      volley(2.8, aimFan(c, tx, ty, 5, 0.19, 200, "bone"));
    } else {
      for (let i = 0; i < 2; i++)
        events.push({
          at: 0.2 + i * 1.6,
          type: "wave",
          wave: {
            x: c.x,
            y: c.y,
            gap: Math.atan2(py - c.y, px - c.x) + (i ? -0.4 : 0.4),
            gapWidth: 1.05,
            warning: 1,
            speed: 180,
          },
        });
      for (let i = 0; i < 3; i++)
        zone(
          0.4 + i * 0.65,
          px + (i - 1) * Math.min(75, c.width * 0.18),
          py,
          true,
          1.15,
        );
    }
  } else {
    label = BOSS_STAGES[2][c.stage - 1];
    duration = c.stage === 3 ? 6.5 : 6;
    // A committed hand-seal animation precedes every clone batch. Clones then
    // generate their own interruptible attacks, rather than decorative copies.
    if (c.turn % 2 === 0) events.push({ at: 0.05, type: "seal" });
    if (c.stage === 1) {
      for (let i = 0; i < 3; i++)
        volley(
          2 + i * 0.5,
          aimFan(
            c,
            c.x,
            c.y + c.radius * 0.4,
            count,
            0.17,
            190,
            "prism",
            (i - 1) * 0.13,
          ),
        );
    } else if (c.stage === 2) {
      for (const side of [-1, 1])
        events.push({
          at: (alternate ? 0.2 : 1.9) + (side + 1) * 0.3,
          type: "beam",
          beam: {
            x: c.x + side * c.radius * 0.6,
            y: c.y,
            tx: px + side * 45,
            ty: py,
            warning: 1.25,
            duration: 1.1,
            width: 4,
            sweep: side * 0.18,
          },
        });
      volley(2.4, lanes(c, alternate ? 1 : -1, 190));
      zone(2.2, px, py, false, 1.2);
    } else {
      for (let i = 0; i < 2; i++) {
        volley(2.1 + i * 0.65, lanes(c, i ? 1 : -1, 200));
        zone(
          0.3 + i * 0.8,
          px + (i ? 1 : -1) * Math.min(70, c.width * 0.17),
          py,
          false,
          1.2,
        );
      }
      events.push({
        at: 3,
        type: "wave",
        wave: {
          x: c.x,
          y: c.y,
          gap: Math.atan2(py - c.y, px - c.x),
          gapWidth: 1.2,
          warning: 0.9,
          speed: 165,
        },
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return {
    kind: `${c.sector}:${c.stage}:${alternate ? 1 : 0}`,
    label,
    duration,
    events,
  };
}

// Renderer and collision code call the same function, including the sweep.
export function beamEnd(beam: BeamSpec & { age: number }, length: number) {
  const base = Math.atan2(beam.ty - beam.y, beam.tx - beam.x);
  const progress = clamp((beam.age - beam.warning) / beam.duration, 0, 1);
  const angle = base + (beam.sweep ?? 0) * progress;
  return {
    x: beam.x + Math.cos(angle) * length,
    y: beam.y + Math.sin(angle) * length,
  };
}
export function waveGap(wave: WaveSpec & { age: number }) {
  return wave.gap + Math.max(0, wave.age - wave.warning) * 0.08;
}
export function handSealFrame(age: number) {
  return age < 0.45 ? 0 : age < 0.95 ? 1 : 2;
}
export function turnVelocity(
  vx: number,
  vy: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
  dt: number,
) {
  const heading = Math.atan2(vy, vx),
    target = unitVector(tx - x, ty - y);
  const desired = Math.atan2(target.y, target.x);
  const delta = Math.atan2(
    Math.sin(desired - heading),
    Math.cos(desired - heading),
  );
  const a = heading + clamp(delta, -dt * 2.7, dt * 2.7),
    speed = Math.hypot(vx, vy);
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}
