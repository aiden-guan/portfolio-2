import { Vector3 } from "three";
import { VIEW } from "../view";

// The camera shake, kept as trauma: every hit adds to it and it drains away,
// and the shake grows with its square, so a bump stays a nudge and the
// biggest moment in a chapter lands. The offset is a whole number of art
// pixels along the screen's own axes, so the world jumps a pixel at a time,
// the way everything else in it moves, and nothing smears.

/** The screen's right and up, in the world (the camera never turns). */
const RIGHT = new Vector3(0, 1, 0).cross(VIEW).normalize();
const UP = VIEW.clone().cross(RIGHT).normalize();

/** Art pixels at full trauma, and how much trauma drains a second. */
const REACH = 5;
const DRAIN = 1.7;

export function createShake() {
  let trauma = 0;
  let phase = 0;
  const shaken = new Vector3();
  const probe = new Vector3();
  return {
    add(strength: number) {
      if (!(strength > 0)) return;
      trauma = Math.min(1, trauma + strength);
      phase = Math.random() * 40;
    },
    clear() {
      trauma = 0;
    },
    /** The camera's target this frame: `target` itself when still, otherwise
     * a vector this shake owns. `artPerUnit` is art pixels per world unit. */
    apply(target: Vector3, dt: number, time: number, artPerUnit: () => number): Vector3 {
      if (trauma <= 0) return target;
      trauma = Math.max(0, trauma - dt * DRAIN);
      if (trauma <= 0) return target;
      const reach = Math.max(1, REACH * trauma * trauma);
      // two sines a little out of step on each axis: smooth, never a loop
      const t = time + phase;
      const nx = Math.sin(t * 71.3) * 0.62 + Math.sin(t * 117.1 + 1.3) * 0.38;
      const ny = Math.sin(t * 83.9 + 2.1) * 0.62 + Math.sin(t * 129.7 + 0.4) * 0.38;
      const ox = Math.round(reach * nx);
      const oy = Math.round(reach * ny);
      if (!ox && !oy) return target;
      const ppu = artPerUnit();
      if (!(ppu > 0)) return target;
      return shaken.copy(target).addScaledVector(RIGHT, ox / ppu).addScaledVector(UP, oy / ppu);
    },
    /** A point one world unit to the screen's right of `from`, for measuring. */
    rightOf(from: Vector3) {
      return probe.copy(from).add(RIGHT);
    },
  };
}

export type Shake = ReturnType<typeof createShake>;
