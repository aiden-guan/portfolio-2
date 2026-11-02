import { Vector3 } from "three";
import { LOOKS, someone } from "../people";
import type { ActorSpec } from "../stage";
import type { Ctx } from "./types";

// The people from the dorm, shared by the Berkeley chapters: Miles, the
// roommate; Jun, from down the hall; and whoever Miles brought back.

export const MILES = (at: Vector3, extra: Partial<ActorSpec> = {}): ActorSpec => ({ id: "miles", look: LOOKS.miles, at, label: "Miles", behaviour: "watch", ...extra });
export const JUN = (at: Vector3, extra: Partial<ActorSpec> = {}): ActorSpec => ({ id: "jun", look: LOOKS.jun, at, label: "Jun", behaviour: "watch", ...extra });
/** Whoever Miles met tonight. */
export const GUESTS = (seed: number): ActorSpec[] =>
  [
    // two on Miles's bed, the rest wherever there's floor
    [3.3, -0.5, -Math.PI / 2, "sit"],
    [3.5, -1.3, -Math.PI / 2, "sit"],
    [2.3, 2.0, -Math.PI * 0.8, "stand"],
    [1.2, 2.5, Math.PI, "stand"],
    [0.3, 1.7, -Math.PI * 0.3, "stand"],
  ].map(([x, z, heading, pose], n) => ({
    id: `guest${n}`,
    look: someone(seed + n * 23, { hair: n % 2 ? "waves" : "long", style: n % 3 ? "crop" : "dress", bottom: n % 3 ? 0x1b1d22 : 0xf3cfae, shoes: 0x1b1d22, height: 160 + n * 3 }),
    at: new Vector3(x as number, 0, z as number),
    heading: heading as number,
    pose: pose as "sit" | "stand",
    seat: 0.66,
    behaviour: "idle" as const,
    solid: false,
  }));
/** Jun never knocks: the door goes, and there he is. */
export async function junBargesIn(ctx: Ctx) {
  const stage = ctx.stage();
  ctx.sound()?.click();
  ctx.sound()?.whoosh(0.4, false, 0.14);
  ctx.bubble("door", "BANG", 900);
  stage.addActor(JUN(new Vector3(-3.7, 0, 2.3), { heading: Math.PI / 2 }));
  stage.actor("jun")?.show(true);
  stage.actor("jun")?.place(new Vector3(-3.7, 0, 2.3), Math.PI / 2);
  await stage.actor("jun")?.walkTo(new Vector3(-2.6, 0, 1.9));
  stage.actor("jun")?.face(stage.position);
}
