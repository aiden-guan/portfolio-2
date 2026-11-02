import { ANKLE, HIP, type Pose } from "./body";
import { DRIBBLE, type Gait, JOG, type Key, lerp, mix, mixGait, move, ramp, run, SPRINT, toeAt } from "./moves";

// The play, start to finish, as a pure function of story time: a run from
// deep with the ball, a flick over a sliding tackle, a rainbow flick over the
// next man, a strike from the edge of the box into the top corner, and a knee
// slide that ends in a roar. Story time runs slower than the clock through
// the flick and the strike; `clock` maps one to the other.

export const BALL_R = 2.8;
export const GOAL_X = 0;
/** half the goal's width, in depth, and its height */
export const GOAL_Z = 92;
export const GOAL_H = 60;
export const NET_DEPTH = 26;
/** 9.8 m/s² at 28 units to the metre */
export const GRAVITY = 274;

const DT = 1 / 240;
const TOUCH = 0.88; // the point in a cycle where the near toe reaches the ball
const JUMP_TIME = 0.36;
const JUMP_HEIGHT = 15;
// The rainbow flick, in stride cycles. It starts as the near foot plants just
// past the ball and ends as the far foot lands after it with the near heel up
// behind him, which is where a running stride would have him anyway.
const FLICK_FROM = 6;
const FLICK_TO = 6.58;
const FLICK_TIME = 0.45;
/** how far his hips travel through it */
const FLICK_RUN = 25;
/** the ball leaves the back of his heel this far into it */
const LAUNCH = 0.32;
/** the cycle whose touch takes the ball down again */
const COLLECT = 8;
/** the shot takes over as the near foot leaves the ground on the last stride */
const SHOT = 9.27;
/** a phase for the jog away after the shot */
const RECOVER = 11.04;
/** grass on studs and knees: about half a g of braking */
const SLIDE_DRAG = 150;

// short quick steps round the defender while the ball is up
const AROUND: Gait = { cycle: 48, stance: 0.3, plant: 0.32, lift: 0.66, lean: 0.32, arms: 0.85, bob: 0.5, height: HIP - 0.8 };

export type Ball = { x: number; y: number; z: number; spin: number; squash: number };

export type Moment = {
  hero: Pose;
  d1: Pose;
  d2: Pose;
  keeper: Pose;
  ball: Ball;
  /** how hard the net is pushed out, and where */
  net: { amount: number; y: number; z: number };
  speed: number;
  aura: number;
  focus: number;
};

export type Play = ReturnType<typeof createPlay>;

export function createPlay() {
  const gaitAt = (phase: number) => (phase < FLICK_TO - 0.01 ? DRIBBLE : mixGait(AROUND, DRIBBLE, ramp(phase, COLLECT + 0.7, SHOT)));

  // —— the run: integrate position and stride together, from a little before
  // the start so the ball is already rolling when the loop opens
  const start = -0.5;
  const steps = Math.ceil(9 / DT);
  const xs = new Float64Array(steps);
  const phases = new Float64Array(steps);
  const timeAt = (i: number) => start + i * DT;

  const speedAt = (phase: number) => {
    // a quick start and a breath into the flick; out of it he keeps pace
    // under the ball so it crosses over him near the top, eases off to let
    // it drop in front of him, then goes again
    if (phase < FLICK_FROM) return 196 - 54 * ramp(phase, 4.6, 5.9);
    return 112 - 34 * ramp(phase, 7.15, COLLECT + 0.6) + 60 * ramp(phase, COLLECT + 0.85, SHOT);
  };

  let x = 0;
  let phase = -1.25;
  let jumpAt = Infinity;
  let flickAt = Infinity;
  const takeoff = 2.77;
  for (let i = 0; i < steps; i += 1) {
    const t = timeAt(i);
    xs[i] = x;
    phases[i] = phase;
    if (t >= jumpAt && t < jumpAt + JUMP_TIME) {
      x += 186 * DT;
      phase += ((3 - takeoff) / JUMP_TIME) * DT;
    } else if (t >= flickAt && t < flickAt + FLICK_TIME) {
      x += (FLICK_RUN / FLICK_TIME) * DT;
      phase += ((FLICK_TO - FLICK_FROM) / FLICK_TIME) * DT;
    } else {
      const v = speedAt(phase);
      x += v * DT;
      phase += (v / gaitAt(phase).cycle) * DT;
      if (jumpAt === Infinity && phase >= takeoff) jumpAt = t + DT;
      if (flickAt === Infinity && phase >= FLICK_FROM) flickAt = t + DT;
    }
  }
  // eased into and out of the hop and the flick, so his stride never changes
  // pace from one moment to the next
  for (const values of [xs, phases]) {
    for (let pass = 0; pass < 2; pass += 1) {
      const copy = values.slice();
      const r = Math.round(0.03 / DT);
      for (let i = r; i < steps - r; i += 1) {
        let sum = 0;
        for (let j = -r; j <= r; j += 1) sum += copy[i + j];
        values[i] = sum / (2 * r + 1);
      }
    }
  }
  const whenPhase = (target: number) => {
    for (let i = 1; i < steps; i += 1) {
      if (phases[i] >= target) {
        const k = (target - phases[i - 1]) / (phases[i] - phases[i - 1] || 1);
        return timeAt(i - 1) + k * DT;
      }
    }
    return timeAt(steps - 1);
  };
  const sample = (values: Float64Array, t: number) => {
    const f = (t - start) / DT;
    const i = Math.max(0, Math.min(steps - 2, Math.floor(f)));
    return lerp(values[i], values[i + 1], Math.max(0, Math.min(1, f - i)));
  };
  const runX = (t: number) => sample(xs, t);
  const runPhase = (t: number) => sample(phases, t);

  const shotFrom = whenPhase(SHOT);
  const contact = shotFrom + 0.3;
  const shiftX = -440 - (runX(shotFrom) + 21);
  const X = (t: number) => runX(t) + shiftX;
  const B = runX(shotFrom) + 21 + shiftX; // where the ball is struck

  const touchTime = (cycle: number) => whenPhase(cycle + TOUCH);
  const toeX = (t: number, far = false) => {
    const ph = runPhase(t);
    return X(t) + toeAt(ph + (far ? 0.5 : 0), gaitAt(ph)).x;
  };
  const touchX = (t: number, far = false) => toeX(t, far) + BALL_R + 0.6;
  const jumpApex = jumpAt + JUMP_TIME / 2;
  const tChip = whenPhase(2.38);
  const tCushion = touchTime(3);
  const tSet = touchTime(4);
  // a nudge with the outside of the far foot, so the ball runs on slowly
  const tNudge = whenPhase(5 + TOUCH - 0.5);
  const tCollect = touchTime(COLLECT);

  // —— the rainbow flick, posed relative to his hips as it starts. The near
  // foot plants past the ball and the ball rolls into its heel; the far foot
  // comes through behind, gets its laces under the ball and rolls it up the
  // back of the near leg; then he hops and the near heel kicks up, throwing
  // the ball over both their heads.
  const F = flickAt;
  const fx0 = X(F);
  const p0 = run(0, runPhase(F), DRIBBLE);
  const pEnd = run(X(F + FLICK_TIME) - fx0, runPhase(F + FLICK_TIME), gaitAt(runPhase(F + FLICK_TIME) + 0.01));
  const plantX = p0.near.x;
  const EDGE = 0.01;
  const runRelative = (t: number, ox: number): Key => {
    const ph = runPhase(t);
    return { t, p: fromPose(run(X(t) - ox, ph, gaitAt(ph))) };
  };
  /** where the ball sits, against the back of the planted heel */
  const heelX = plantX - 1.95 - BALL_R - 0.2;
  const flick = move(
    [
      { t: F, p: fromPose(p0) },
      // his weight comes onto the near foot; the far foot swings through low
      { t: F + 0.09, p: { x: 9, y: HIP - 2.6, lean: 0.2, head: 0.32, nx: plantX, ny: ANKLE, na: 0, fx: heelX - 7.5, fy: 5, fa: -0.6, ns: -0.25, ne: 0.9, fs: 0.3, fe: 1, face: 1, hair: 0.7 } },
      // laces under the ball, behind the heel
      { t: F + 0.17, p: { x: 11.5, y: HIP - 3.2, lean: 0.2, head: 0.36, fx: heelX - 4.1, fy: ANKLE + 0.2, fa: -0.58, ns: -0.1, ne: 0.7, fs: 0.15, fe: 0.8, hair: 0.5 } },
      // rolling it up the back of the ankle as he sinks onto the near leg
      { t: F + 0.26, p: { x: 12.5, y: HIP - 3.8, lean: 0.24, head: 0.26, ny: ANKLE + 0.5, na: -0.2, ns: 0.2, ne: 0.6, fs: -0.2, fe: 0.7 } },
      // the flick: off the ground, and the near heel snaps up behind him
      { t: F + LAUNCH, p: { x: 14, y: HIP - 2.4, lean: 0.24, head: 0.05, nx: plantX - 1, ny: 7, na: -0.85, ns: 0.6, ne: 0.8, fs: -0.55, fe: 0.9, face: 2, hair: 0.6 } },
      { t: F + 0.39, p: { x: 19, y: HIP - 1.9, lean: 0.14, head: -0.25, nx: 13, ny: 12.5, na: -1, fx: 22.5, fy: 3.5, fa: 0.1, ns: 0.35, ne: 1, fs: -0.3, fe: 1.1, face: 1, hair: 0.7 } },
      { t: F + FLICK_TIME, p: fromPose(pEnd) },
    ] satisfies Key[],
    1,
    runRelative(F - EDGE, fx0),
    runRelative(F + FLICK_TIME + EDGE, fx0),
  );
  const flickPose = (t: number) => flick.at(t, fx0);

  // the ball on its way up the back of the leg: off the grass behind the
  // heel, up the back of the ankle, and onto the heel as it lifts
  const rollFrom = F + 0.16;
  const rollTo = F + LAUNCH;
  const rollUp = (t: number) => {
    const u = ramp(t, rollFrom, rollTo);
    const p = flickPose(t);
    return { x: p.near.x - 4.95 + 2.75 * u, y: p.near.y + 1.2 + 3.2 * u, z: -1 };
  };

  // the flight: launched off the heel, under gravity alone, timed to drop
  // onto his near foot as it reaches forward for the touch
  const tLaunch = F + LAUNCH;
  const L = rollUp(tLaunch);
  const landX = touchX(tCollect);
  const landY = BALL_R + 1;
  const T = tCollect - tLaunch;
  const vx = (landX - L.x) / T;
  const vy = (landY - L.y + 0.5 * GRAVITY * T * T) / T;
  const flight = (t: number) => {
    const s = t - tLaunch;
    return { x: L.x + vx * s, y: L.y + vy * s - 0.5 * GRAVITY * s * s, z: -1 };
  };
  const apexAt = tLaunch + vy / GRAVITY;

  // round the defender, toward the camera and back onto the line of the ball
  const passAt = apexAt + 0.08;
  const swerve = (t: number) => -28 * ramp(t, F + FLICK_TIME, passAt - 0.1) * (1 - ramp(t, passAt + 0.12, tCollect - 0.05));

  // —— the strike, posed relative to where the ball sits, and the run away
  // after it, which it hands on to
  const lead = run(0, SHOT, gaitAt(SHOT));
  const kick = (dt: number) => contact + dt;
  const plant = -5;
  const recover = run(0, RECOVER, JOG);
  // away to the corner
  const awayFrom = kick(0.45);
  const awayX = B + 18;
  const slideAt = awayFrom + 1.05;
  const awaySpeed = (t: number) => lerp(100, 210, ramp(t, awayFrom, awayFrom + 0.6));
  const awayGait = (t: number) => mixGait(JOG, SPRINT, ramp(t, awayFrom, awayFrom + 0.6));
  const awaySteps = Math.ceil(2 / DT);
  const awayXs = new Float64Array(awaySteps);
  const awayPhases = new Float64Array(awaySteps);
  {
    let x = awayX;
    let phase = RECOVER;
    for (let i = 0; i < awaySteps; i += 1) {
      const t = awayFrom + i * DT;
      awayXs[i] = x;
      awayPhases[i] = phase;
      x += awaySpeed(t) * DT;
      phase += (awaySpeed(t) / awayGait(t).cycle) * DT;
    }
  }
  const sampleAway = (values: Float64Array, t: number) => {
    const f = Math.max(0, (t - awayFrom) / DT);
    const i = Math.min(awaySteps - 2, Math.floor(f));
    return lerp(values[i], values[i + 1], Math.min(1, f - i));
  };
  const away = (t: number) => sampleAway(awayXs, t);
  const awayPhase = (t: number) => sampleAway(awayPhases, t);
  const awayZ = (t: number) => -26 * ramp(t, awayFrom + 0.1, slideAt + 0.6);
  // the strike itself
  const shot = move(
    [
      { t: shotFrom, p: { ...fromPose(lead), x: lead.x - 21, nx: lead.near.x - 21, fx: lead.far.x - 21, z: 0, face: 1, hair: 1.2 } },
      // a long last stride, off the ground, the far foot reaching for the plant
      { t: kick(-0.22), p: { x: -16, y: HIP - 1.9, lean: 0.15, head: 0.22, nx: -31, ny: 8, na: -0.9, fx: plant - 1.5, fy: 4.2, fa: 0.25, ns: -0.6, ne: 1, fs: 0.8, fe: 0.8, face: 1, hair: 1.1 } },
      // the plant beside the ball, heel first; the kicking leg folds up behind
      { t: kick(-0.14), p: { x: -13, y: HIP - 2.9, lean: 0.05, head: 0.24, nx: -30, ny: 13, na: -1.15, fx: plant, fy: ANKLE, fa: 0.05, ns: -0.85, ne: 0.75, fs: 1.4, fe: 0.5, hair: 1 } },
      // the top of the backswing, held a beat: hip open, heel near the seat,
      // the far arm up and out for balance
      { t: kick(-0.08), p: { x: -11, y: HIP - 3.4, lean: -0.06, head: 0.26, nx: -27, ny: 16.5, na: -1.3, fs: 1.9, fe: 0.35, ns: -1.05, ne: 0.6, hair: 0.9 } },
      // the thigh goes first and the shin lags, then whips through
      { t: kick(-0.04), p: { x: -9.5, y: HIP - 3.2, lean: -0.05, nx: -20, ny: 12.5, na: -1.25, ns: -0.86, ne: 0.72, fs: 1.64, fe: 0.42 } },
      { t: kick(-0.015), p: { x: -8.3, y: HIP - 3, nx: -9.5, ny: 6.5, na: -1.15, ns: -0.64, ne: 0.86, fs: 1.36, fe: 0.5 } },
      // through the ball: laces, ankle locked, toes down
      { t: kick(0), p: { x: -7.5, y: HIP - 2.9, lean: -0.05, head: 0.32, nx: -3.6, ny: 3.7, na: -1.12, ns: -0.5, ne: 0.95, fs: 1.2, fe: 0.55, face: 2 } },
      // and on, high and across, so the plant foot comes off the ground
      { t: kick(0.06), p: { x: -3.5, y: HIP - 1.4, lean: -0.2, head: 0.12, nx: 9, ny: 15.5, na: -0.6, fx: plant + 0.5, fy: 2.6, fa: -0.45, ns: 0.1, ne: 1.15, fs: 0.75, fe: 0.7, hair: 0.5 } },
      { t: kick(0.14), p: { x: 0.5, y: HIP + 0.2, lean: -0.28, head: 0, nx: 14, ny: 21.5, na: -0.3, fx: plant + 2, fy: 5.5, fa: -0.6, ns: 0.4, ne: 1.3, fs: 0.3, fe: 0.9, hair: 0.2 } },
      // lands on the kicking foot and runs on
      { t: kick(0.3), p: { x: 8, y: HIP - 2.4, lean: 0.08, head: 0.05, nx: 12, ny: ANKLE, na: 0, fx: plant + 6, fy: 9, fa: -0.7, ns: -0.2, ne: 1.4, fs: 0.1, fe: 1.2, face: 1, hair: 0.7 } },
      { t: kick(0.45), p: { ...fromPose(recover), x: recover.x + 18, nx: recover.near.x + 18, fx: recover.far.x + 18, z: 0, face: 1 } },
    ] satisfies Key[],
    1,
    runRelative(shotFrom - EDGE, B),
    (() => {
      const t = awayFrom + EDGE;
      const q = run(away(t), awayPhase(t), awayGait(t), 1, awayZ(t), 0.6);
      return { t, p: { ...fromPose(q), x: q.x - B, nx: q.near.x - B, fx: q.far.x - B, face: 1 } };
    })(),
  );

  // —— the slide: he takes off at full pace and punches both fists at the
  // sky in the air, and comes down onto both knees, shins flat and the tops
  // of his boots on the grass, and the turf brakes him to a stop. He leans
  // back into it with his arms out; when it stops he roars with his fists
  // closed and drives them down, then gets up and stands with one fist held
  // up to the sky.
  const slideFrom = run(away(slideAt), awayPhase(slideAt), awayGait(slideAt), 1, awayZ(slideAt), 1);
  const airAt = slideAt + 0.26;
  const kneel = slideAt + 0.52;
  const slideV = awaySpeed(slideAt) * 0.85;
  const stopAt = kneel + slideV / SLIDE_DRAG;
  const kneelX = away(slideAt) + slideV * (kneel - slideAt);
  const slideX = (t: number) => {
    if (t < kneel) return away(slideAt) + slideV * (t - slideAt);
    const s = Math.min(t, stopAt) - kneel;
    return kneelX + slideV * s - 0.5 * SLIDE_DRAG * s * s;
  };
  const roarAt = stopAt - 0.1;
  const pumpAt = roarAt + 0.95;
  const riseAt = pumpAt + 0.55;
  const end = pumpAt + 2.5;
  const knees = { y: 13.6, nx: -9.5, ny: 2.2, na: 3, fx: -7.5, fy: 2.2, fa: 3 };
  const slide = move(
    [
      { t: slideAt, p: { ...fromPose(slideFrom), x: 0, nx: slideFrom.near.x - slideFrom.x, fx: slideFrom.far.x - slideFrom.x } },
      // off one foot, the other knee driving up and the arms swinging up
      { t: slideAt + 0.09, p: { x: 0, y: HIP + 1.5, lean: 0.04, head: -0.12, nx: 8, ny: 12, na: -0.3, fx: -12, fy: 4, fa: -0.9, ns: 1.6, ne: 1.1, fs: 1.3, fe: 1, ng: 0.6, fg: 0.6, face: 2, hair: 1.3 } },
      // up in the air, back arched, both fists punched at the sky and the
      // knees folded under him
      { t: airAt, p: { y: HIP + 11, lean: -0.3, head: -0.5, nx: -7, ny: 27, na: 2.6, fx: -5, fy: 28.5, fa: 2.6, ns: 2.95, ne: 0.1, fs: 2.75, fe: 0.18, ng: 1, fg: 1, hair: 0.9 } },
      // and down, knees first
      { t: slideAt + 0.42, p: { y: 19.5, lean: -0.12, head: -0.3, nx: -8.5, ny: 5.5, na: 2.8, fx: -6.5, fy: 6, fa: 2.8, ns: 2.5, ne: 0.4, fs: 2.25, fe: 0.45 } },
      { t: kneel, p: { ...knees, lean: -0.18, head: -0.22, ns: 2.3, ne: 0.45, fs: 2, fe: 0.5, ng: 0.5, fg: 0.5, hair: 1.5 } },
      // arms up and wide, leaning back into it
      { t: kneel + 0.5, p: { ...knees, lean: -0.34, head: -0.42, ns: 2.75, ne: 0.25, fs: 2.5, fe: 0.3, ng: 0, fg: 0, hair: 1 } },
      { t: roarAt, p: { ...knees, y: 13.4, lean: -0.4, head: -0.48, ns: 2.85, ne: 0.2, fs: 2.6, fe: 0.25, ng: 0.4, fg: 0.4, hair: 0.45 } },
      // the roar: chest up, head back, fists closed and elbows pulled down
      { t: roarAt + 0.22, p: { ...knees, y: 14.2, lean: -0.36, head: -0.62, ns: -0.55, ne: 2.15, fs: -0.45, fe: 2.05, ng: 1, fg: 1, face: 2, hair: 0.35 } },
      { t: pumpAt - 0.12, p: { ...knees, y: 14.3, lean: -0.38, head: -0.66, ns: -0.6, ne: 2.2, fs: -0.5, fe: 2.1 } },
      // and the fists driven down to the hips as he folds forward over them
      { t: pumpAt, p: { ...knees, y: 13.2, lean: 0.34, head: 0.22, ns: -0.75, ne: 1.25, fs: -0.65, fe: 1.3, hair: 0.6 } },
      { t: pumpAt + 0.4, p: { ...knees, y: 13.4, lean: 0.24, head: 0.05, ns: -0.6, ne: 1.4, fs: -0.5, fe: 1.45, ng: 0.85, fg: 0.85, face: 2, hair: 0.35 } },
      // up: the near foot comes through and plants
      { t: riseAt, p: { y: 15.5, lean: 0.28, head: 0.12, nx: 2, ny: 6, na: 0.4, ns: 0.4, ne: 1.5, fs: -0.3, fe: 1.4 } },
      { t: riseAt + 0.18, p: { y: 17, lean: 0.3, head: 0.05, nx: 7.5, ny: ANKLE, na: 0 } },
      // stood, the near fist going up
      { t: riseAt + 0.5, p: { y: HIP - 1, lean: -0.02, head: -0.2, nx: 4, ny: ANKLE, na: 0, fx: -3.5, fy: ANKLE, fa: 0, ns: 2.3, ne: 0.6, fs: -0.15, fe: 0.4, ng: 1, fg: 0.6 } },
      // and held high, chest out, face to the sky
      { t: riseAt + 0.75, p: { y: HIP - 0.5, lean: -0.12, head: -0.45, ns: 3.02, ne: 0.04, fs: -0.1, fe: 0.3, face: 2, hair: 0.4 } },
      { t: end + 1, p: { y: HIP - 0.6, lean: -0.1, head: -0.4, hair: 0.3 } },
    ] satisfies Key[],
    1,
    {
      t: slideAt - EDGE,
      p: (() => {
        const t = slideAt - EDGE;
        const q = run(away(t), awayPhase(t), awayGait(t), 1, awayZ(t), 1);
        const ox = away(slideAt) - slideV * EDGE;
        return { ...fromPose(q), x: q.x - ox, nx: q.near.x - ox, fx: q.far.x - ox, z: 0 };
      })(),
    },
  );

  // —— the ball
  type Leg = { from: number; to: number; at: (u: number, t: number) => { x: number; y: number; z: number } };
  const legs: Leg[] = [];
  const rollLeg = (from: number, to: number, x0: number, x1: number, z = -1, keep = 0.75) =>
    legs.push({ from, to, at: (u) => ({ x: x0 + (x1 - x0) * (u + keep * u * (1 - u)), y: BALL_R, z }) });
  const t0 = touchTime(-1);
  const t1 = touchTime(0);
  rollLeg(t0, t1, touchX(t0), touchX(t1));
  const chipX0 = X(tChip) + toeAt(2.88, DRIBBLE).x + BALL_R + 0.6;
  rollLeg(t1, tChip, touchX(t1), chipX0);
  // the flick over the tackle: up over the sliding leg, landing just after he does
  const chipLand = jumpAt + JUMP_TIME + 0.12;
  const chipX1 = X(chipLand) + 30;
  legs.push({
    from: tChip,
    to: chipLand,
    at: (u) => ({ x: lerp(chipX0, chipX1, u), y: BALL_R + 4 * 27 * u * (1 - u), z: -1 }),
  });
  legs.push({
    from: chipLand,
    to: tCushion,
    at: (u) => ({ x: lerp(chipX1, touchX(tCushion), u), y: BALL_R + 4 * 3 * u * (1 - u), z: -1 }),
  });
  rollLeg(tCushion, tSet, touchX(tCushion), touchX(tSet));
  rollLeg(tSet, tNudge, touchX(tSet), touchX(tNudge, true), -1, 0.4);
  // into the heel of the planted foot, and still
  const heelAt = F + 0.06;
  rollLeg(tNudge, heelAt, touchX(tNudge, true), fx0 + heelX, -1, 0.7);
  legs.push({ from: heelAt, to: rollFrom, at: () => ({ x: fx0 + heelX, y: BALL_R, z: -1 }) });
  legs.push({ from: rollFrom, to: tLaunch, at: (_, t) => rollUp(t) });
  legs.push({ from: tLaunch, to: tCollect, at: (_, t) => flight(t) });
  // taken down on the half-volley, and pushed on to where he strikes it
  const collectX = landX;
  legs.push({
    from: tCollect,
    to: contact,
    at: (u) => ({ x: collectX + (B - collectX) * (u + u * (1 - u)), y: BALL_R + 2.2 * 4 * u * (1 - u) * (1 - u), z: -1 }),
  });
  // the strike: rising, a touch of swerve, into the top corner
  const netAt = 0.46;
  const goalIn = { x: GOAL_X + NET_DEPTH - 3, y: GOAL_H - 9, z: GOAL_Z - 30 };
  legs.push({
    from: contact,
    to: contact + netAt,
    at: (u) => ({
      x: lerp(B + 1, goalIn.x, u),
      y: BALL_R + (goalIn.y - BALL_R) * (u * 0.82 + 0.18 * u * u),
      z: lerp(-1, goalIn.z, u * u * 0.6 + u * 0.4),
    }),
  });
  // held in the net, then dropping out of it
  const netHit = contact + netAt;
  legs.push({
    from: netHit,
    to: netHit + 0.22,
    at: (u) => ({ x: goalIn.x + 3 * Math.sin(u * Math.PI * 0.5), y: goalIn.y - 2 * u, z: goalIn.z }),
  });
  legs.push({
    from: netHit + 0.22,
    to: netHit + 0.62,
    at: (u) => ({ x: goalIn.x + 3 - 4 * u, y: BALL_R + (goalIn.y - 2 - BALL_R) * (1 - u * u), z: goalIn.z }),
  });
  legs.push({
    from: netHit + 0.62,
    to: netHit + 1.1,
    at: (u) => ({ x: goalIn.x - 1 - 4 * u, y: BALL_R + 9 * 4 * u * (1 - u) * (1 - u), z: goalIn.z }),
  });
  legs.push({ from: netHit + 1.1, to: 99, at: () => ({ x: goalIn.x - 5, y: BALL_R, z: goalIn.z }) });

  const ballAt = (t: number) => {
    const leg = legs.find((l) => t < l.to) ?? legs[legs.length - 1];
    const u = Math.max(0, Math.min(1, (t - leg.from) / (leg.to - leg.from)));
    return leg.at(u, t);
  };
  // spin from distance travelled, sampled once
  const spinSteps = Math.ceil((end + 1 - start) / DT);
  const spins = new Float64Array(spinSteps);
  {
    let angle = 0;
    let prev = ballAt(start);
    for (let i = 0; i < spinSteps; i += 1) {
      const b = ballAt(start + i * DT);
      angle += (b.x - prev.x) / BALL_R;
      spins[i] = angle;
      prev = b;
    }
  }

  // —— the first defender comes across and slides in
  const apexX = X(jumpApex);
  const slideStart = jumpApex - 0.31;
  const S = apexX + 58;
  const d1Speed = 72;
  const d1From = S + d1Speed * (slideStart - start);
  const d1Run = (t: number) => run(d1From - d1Speed * (t - start), (d1Speed * (t - start)) / JOG.cycle + 0.3, JOG, -1, 6, 0.4);
  const tackle = move(
    [
      { t: slideStart, p: fromPose(d1Run(slideStart)) },
      { t: slideStart + 0.12, p: { x: S - 14, y: 11, lean: -0.55, head: 0.25, nx: S - 34, ny: 3, na: 0.4, fx: S - 9, fy: 3, fa: -0.3, ns: -1.1, ne: 0.3, fs: 1.2, fe: 0.5, face: 1, hair: 0.9 } },
      { t: slideStart + 0.36, p: { x: S - 50, y: 6.5, lean: -0.9, head: 0.3, nx: S - 74, ny: 2.6, na: 0.5, fx: S - 48, fy: 2.4, fa: 0, ns: -1.45, ne: 0.1, fs: 1, fe: 0.6 } },
      { t: slideStart + 0.72, p: { x: S - 68, y: 5.5, lean: -1.05, head: 0.3, nx: S - 92, ny: 2.4, na: 0.5, fx: S - 64, fy: 2.3, fa: 0, ns: -1.5, ne: 0.1, fs: 0.8, fe: 0.8, hair: 0.3 } },
      { t: slideStart + 2, p: { head: 0.05 } },
    ] satisfies Key[],
    -1,
    { t: slideStart - 0.01, p: fromPose(d1Run(slideStart - 0.01)) },
  );

  // —— the second defender, jockeying, stepping in as the man on the ball
  // slows, then caught looking up as it goes over him
  const D2 = L.x + vx * (apexAt - tLaunch) - 2;
  const d2Stance = (t: number): Pose => {
    const inward = 12 * (1 - ramp(t, F - 0.6, tLaunch));
    const bounce = Math.sin(t * 2 * Math.PI * 2.6);
    const x = D2 + inward;
    return {
      x, y: HIP - 5.4 + bounce * 0.5, z: 0, f: -1, lean: 0.3, head: 0.05,
      near: { x: x - 8, y: ANKLE, a: 0.08 }, far: { x: x + 9, y: ANKLE + Math.max(0, bounce) * 0.6, a: -0.05 },
      armNear: { s: 0.62, e: 0.9 }, armFar: { s: 0.32, e: 1.05 }, face: 1, hair: 0.3,
    };
  };
  const d2Look = tLaunch + 0.14;
  const over = apexAt;
  const beaten = move(
    [
      { t: d2Look, p: fromPose(d2Stance(d2Look)) },
      // up out of his crouch, eyes going up after it
      { t: d2Look + 0.2, p: { y: HIP - 2.8, lean: 0.05, head: -0.45, nx: D2 - 6, fx: D2 + 7, ns: 0.1, ne: 0.9, fs: -0.1, fe: 0.9 } },
      // a hop with his head back, too late and too short, arms kept down
      { t: over - 0.04, p: { y: HIP + 4.5, lean: -0.12, head: -0.95, nx: D2 - 3, ny: 6, na: -0.5, fx: D2 + 3, fy: 5, fa: -0.6, ns: -0.35, ne: 1.1, fs: -0.5, fe: 1.2 } },
      { t: over + 0.22, p: { y: HIP - 3.6, lean: -0.02, head: -0.6, nx: D2 - 2, ny: ANKLE, na: 0, fx: D2 + 4, fy: ANKLE, fa: 0, ns: 0.5, ne: 0.8, fs: -0.3, fe: 0.6 } },
      { t: over + 0.42, p: { y: HIP - 2, lean: -0.05, head: -0.1, ns: 0.2, ne: 0.6, fs: -0.2, fe: 0.6 } },
    ] satisfies Key[],
    -1,
  );
  const chaseFrom = over + 0.5;
  // eases from standing to 140 a second over half a second and chases him
  // all the way to the corner, edging in behind, too late: he pulls up as
  // the striker roars and drops to his knees with his hands on his head
  const giveUp = roarAt - 0.45;
  const CHASE = mixGait(JOG, SPRINT, 0.5);
  const chaseDist = (t: number) => {
    const dt = Math.max(0, Math.min(t, giveUp) - chaseFrom);
    const ease = Math.min(dt, 0.5);
    const after = Math.max(0, Math.min(t - giveUp, 0.35));
    return 140 * ease * ease + 140 * Math.max(0, dt - 0.5) + 140 * (after - (after * after) / 0.7);
  };
  const chaseZ = (t: number) => 16 * ramp(t, netHit, giveUp);
  const d2Chase = (t: number) => {
    const dist = chaseDist(t);
    return run(D2 + 3 + dist, dist / CHASE.cycle + 0.25, CHASE, 1, chaseZ(t), 0.5);
  };
  const sinkFrom = giveUp + 0.3;
  const sinkX = D2 + 3 + chaseDist(sinkFrom);
  const fromSink = (p: Pose) => ({ ...fromPose(p), x: p.x - sinkX, nx: p.near.x - sinkX, fx: p.far.x - sinkX });
  const sink = move(
    [
      { t: sinkFrom, p: fromSink(d2Chase(sinkFrom)) },
      { t: sinkFrom + 0.28, p: { y: HIP - 4, lean: 0.35, head: 0.45, ns: 1.3, ne: 1.9, fs: 1.1, fe: 1.9, face: 0, hair: 0.3 } },
      { t: sinkFrom + 0.55, p: { y: 13.6, lean: 0.45, head: 0.75, nx: -9.5, ny: 2.2, na: 3, fx: -7.5, fy: 2.2, fa: 3, ns: 2.5, ne: 2.5, fs: 2.4, fe: 2.4 } },
      { t: end + 1, p: { head: 0.85 } },
    ] satisfies Key[],
    1,
    { t: sinkFrom - 0.01, p: fromSink(d2Chase(sinkFrom - 0.01)) },
  );

  // —— the keeper, set, then at full stretch
  const KX = GOAL_X - 15;
  const keeperSet = (t: number): Pose => {
    const shuffle = Math.sin(t * 2 * Math.PI * 1.6);
    return {
      x: KX + shuffle * 1.2, y: HIP - 6.4 + Math.abs(shuffle) * 0.4, z: 2, f: -1, lean: 0.34, head: -0.05,
      near: { x: KX - 2 + shuffle * 1.2, y: ANKLE, a: 0.05 }, far: { x: KX + 3.5 + shuffle * 0.8, y: ANKLE, a: 0 },
      armNear: { s: 0.78, e: 0.7 }, armFar: { s: 0.62, e: 0.85 }, face: 1, hair: 0.2,
    };
  };
  const diveFrom = contact + 0.05;
  const dive = move(
    [
      { t: diveFrom, p: fromPose(keeperSet(diveFrom)) },
      { t: contact + 0.13, p: { x: KX, y: HIP - 9.5, lean: 0.2, head: -0.2, nx: KX - 2, ny: ANKLE, fx: KX + 3.5, fy: ANKLE, ns: 0.4, ne: 0.6, fs: 0.2, fe: 0.7 } },
      { t: contact + 0.32, p: { x: KX + 6, y: 31, z: 9, lean: -0.95, head: -0.55, nx: KX + 4, ny: 12, na: -0.6, fx: KX - 1, fy: 16, fa: -0.8, ns: 2.75, ne: 0.08, fs: 2.35, fe: 0.25 } },
      { t: contact + 0.46, p: { x: KX + 10, y: 31.5, z: 12, lean: -1.15, head: -0.6, nx: KX + 7, ny: 15, fx: KX + 2, fy: 19, ns: 3.02, ne: 0.02, fs: 2.6, fe: 0.15 } },
      { t: contact + 0.74, p: { x: KX + 17, y: 9, z: 14, lean: -1.42, head: -0.3, nx: KX + 6, ny: 13, fx: KX + 2, fy: 15, ns: 2.7, fs: 2.4 } },
      { t: contact + 0.98, p: { x: KX + 19, y: 4.6, z: 14, lean: -1.56, head: -0.1, nx: KX + 2, ny: 3.2, na: 0.3, fx: KX + 4, fy: 6, fa: 0.3, ns: 2.5, ne: 0.2, fs: 2.1, fe: 0.4, face: 0 } },
      // he lies there, then sits up and gets onto his knees, and stays
      // there, bowed over, his gloves on the grass
      { t: contact + 1.6, p: { x: KX + 18, y: 6.5, lean: -0.6, head: 0.2, nx: KX + 9, ny: ANKLE, na: 0.6, fx: KX + 11, fy: ANKLE, fa: 0.5, ns: 0.35, ne: 0.4, fs: 0.25, fe: 0.5 } },
      { t: contact + 2.1, p: { x: KX + 16, y: 13.6, lean: 0.75, head: 0.75, nx: KX + 25.5, ny: 2.2, na: 3, fx: KX + 23.5, fy: 2.2, fa: 3, ns: 0.25, ne: 0.15, fs: 0.15, fe: 0.2 } },
      { t: contact + 6, p: { head: 0.85 } },
    ] satisfies Key[],
    -1,
  );

  // —— everything at one moment
  const heroAt = (t: number): Pose => {
    if (t < shotFrom) {
      const phase = runPhase(t);
      const z = swerve(t);
      let p: Pose;
      if (t >= F && t < F + FLICK_TIME) {
        p = flickPose(t);
        // the far foot carries the ball up the calf on its laces
        const w = ramp(t, F + 0.12, F + 0.17) * (1 - ramp(t, F + 0.3, F + 0.36));
        if (w > 0) {
          const b = t < rollFrom ? { x: fx0 + heelX, y: BALL_R } : rollUp(t);
          const u = ramp(t, rollFrom, rollTo);
          p.far = {
            x: lerp(p.far.x, b.x - 4.1 + 0.6 * u, w),
            y: lerp(p.far.y, Math.max(ANKLE + 0.2, b.y - 1.4 - 0.8 * u), w),
            a: lerp(p.far.a, -0.6 + 0.35 * u, w),
          };
        }
      } else {
        p = run(X(t), phase, gaitAt(phase), 1, z, 1);
      }
      // over the tackle: the hips rise and the feet tuck
      if (t >= jumpAt && t < jumpAt + JUMP_TIME) {
        const u = (t - jumpAt) / JUMP_TIME;
        const bump = (4 * u * (1 - u)) ** 1.5;
        const arc = JUMP_HEIGHT * bump;
        const tuck = 7 * bump;
        p.y += arc;
        p.near = { ...p.near, y: p.near.y + arc + tuck };
        p.far = { ...p.far, y: p.far.y + arc + tuck * 0.6 };
        const w = ramp(u, 0, 0.25) * (1 - ramp(u, 0.75, 1));
        p.armNear = { ...p.armNear, s: lerp(p.armNear.s, 0.9 - 0.5 * u, w), e: lerp(p.armNear.e, 0.8, w) };
        p.armFar = { ...p.armFar, s: lerp(p.armFar.s, -0.4 + 0.6 * u, w), e: lerp(p.armFar.e, 0.7, w) };
        p.lean += 0.08 * Math.sin(u * Math.PI);
      }
      // eyes down for each touch, up again to look at what is coming, and
      // up after the ball while it is over him
      if (t < F || t >= F + FLICK_TIME) for (const touch of [t1, tChip, tCushion, tSet, tNudge, tCollect]) p.head += 0.24 * Math.exp(-(((t - touch) / 0.11) ** 2));
      // and the arms flare for balance as he takes each touch: the arm
      // across from the foot on the ball comes through and out, the other
      // goes back, both elbows open and the hands spread. Each flare is over
      // within a fifth of a second, before anything posed by hand takes over
      if (t < F || t >= F + FLICK_TIME) {
        for (const [touch, farFoot] of [[t1, false], [tChip, true], [tCushion, false], [tSet, false], [tNudge, true], [tCollect, false]] as const) {
          const u = (t - touch - 0.03) / 0.2;
          if (u <= -1 || u >= 1) continue;
          const w = (1 - u * u) ** 2;
          const flare = (a: Pose["armNear"], s: number, e: number) => ({ ...a, s: a.s + s * w, e: a.e - e * w, g: (a.g ?? 0) * (1 - 0.6 * w) });
          if (farFoot) {
            p.armNear = flare(p.armNear, 0.32, 0.4);
            p.armFar = flare(p.armFar, -0.18, 0.25);
          } else {
            p.armFar = flare(p.armFar, 0.32, 0.4);
            p.armNear = flare(p.armNear, -0.18, 0.25);
          }
        }
      }
      p.head -= 0.42 * ramp(t, F + FLICK_TIME - 0.05, apexAt - 0.1) * (1 - ramp(t, apexAt + 0.15, tCollect - 0.15));
      if (t > F - 0.5) p.face = Math.max(p.face, 1);
      return p;
    }
    if (t < awayFrom) return shot.at(t, B);
    if (t < slideAt) {
      const k = ramp(t, awayFrom, awayFrom + 0.6);
      const p = run(away(t), awayPhase(t), awayGait(t), 1, awayZ(t), 0.6 + 0.4 * k);
      p.face = 2;
      return p;
    }
    return slide.at(t, slideX(t), awayZ(t) - awayZ(slideAt));
  };
  const d1At = (t: number): Pose => (t < slideStart ? d1Run(t) : tackle.at(t, 0));
  const d2At = (t: number): Pose => {
    if (t < d2Look) return d2Stance(t);
    if (t < chaseFrom) return beaten.at(t, 0);
    if (t >= sinkFrom) return sink.at(t, sinkX);
    return mix(beaten.at(t, 0), d2Chase(t), ramp(t, chaseFrom, chaseFrom + 0.12));
  };
  const keeperAt = (t: number): Pose => (t < diveFrom ? keeperSet(t) : dive.at(t, 0));

  // how deep in the flow he is: he finds it as he reads the flick, it
  // carries him over the defender and into the shot, and it comes back
  // with the goal
  const auraAt = (t: number) =>
    Math.max(
      0.58 * ramp(t, F - 0.14, F + 0.08) * (1 - ramp(t, contact - 0.3, contact)),
      ramp(t, contact - 0.62, contact - 0.2) * (1 - 0.45 * ramp(t, contact + 0.05, contact + 0.5)),
      0.9 * ramp(t, netHit, netHit + 0.15),
      // and burns hotter than ever as he roars
      ramp(t, roarAt, roarAt + 0.2) * (1 + 0.3 * (1 - ramp(t, roarAt + 0.4, pumpAt + 0.3))),
    ) * (1 - ramp(t, end - 0.5, end + 0.2));
  const focusAt = (t: number) =>
    Math.max(
      ramp(t, contact - 0.48, contact - 0.3) * (1 - ramp(t, contact + 0.02, contact + 0.1)),
      ramp(t, roarAt - 0.45, roarAt + 0.1) * (1 - ramp(t, end - 0.4, end)),
    );

  const at = (t: number): Moment => {
    const b = ballAt(t);
    const i = Math.max(0, Math.min(spinSteps - 1, Math.round((t - start) / DT)));
    const squash = Math.exp(-(((t - contact) / 0.025) ** 2));
    const pushed = t < netHit ? 0 : Math.exp(-(t - netHit) * 3.2) * Math.cos((t - netHit) * 15);
    return {
      hero: heroAt(t),
      d1: d1At(t),
      d2: d2At(t),
      keeper: keeperAt(t),
      ball: { ...b, spin: spins[i], squash },
      net: { amount: t < netHit ? 0 : 12 * Math.max(0, pushed) + 2 * ramp(t, netHit, netHit + 0.1) * (1 - ramp(t, netHit + 0.2, netHit + 0.7)), y: goalIn.y, z: goalIn.z },
      speed: ramp(t, -0.2, 0.3) * (1 - 0.6 * ramp(t, F - 0.3, F) * (1 - ramp(t, F + FLICK_TIME, passAt))) * (1 - ramp(t, awayFrom + 0.3, slideAt + 0.4)),
      aura: auraAt(t),
      focus: focusAt(t),
    };
  };

  return {
    start: 0,
    end,
    contact,
    netHit,
    shotFrom,
    B,
    jumpAt,
    /** down again, past the first defender */
    passedAt: jumpAt + JUMP_TIME,
    flickAt: F,
    tLaunch,
    apexAt,
    passAt,
    tCollect,
    slideAt,
    airAt,
    kneel,
    stopAt,
    roarAt,
    pumpAt,
    riseAt,
    slideStart,
    chipLand,
    at,
    auraAt,
    ballAt,
    heroAt,
    d1At,
    d2At,
  };
}

function fromPose(p: Pose) {
  return {
    x: p.x, y: p.y, z: p.z, lean: p.lean, head: p.head,
    nx: p.near.x, ny: p.near.y, na: p.near.a, fx: p.far.x, fy: p.far.y, fa: p.far.a,
    ns: p.armNear.s, ne: p.armNear.e, fs: p.armFar.s, fe: p.armFar.e, face: p.face, hair: p.hair,
    ng: p.armNear.g ?? 0, fg: p.armFar.g ?? 0, nw: p.armNear.w ?? 0, fw: p.armFar.w ?? 0,
  };
}

/** Story time runs slower than the clock in places: a breath as he reads
 * the flick, a beat held as his heel snaps the ball up, the ball going over
 * the defender's head, slowest at the top, then into the strike, where
 * it eases into slow motion as he sets himself, holds at the top of the
 * backswing, holds again on contact (the hit-stop) and once more as the
 * ball hits the net. In the celebration it holds on his fists up in the air
 * and as his knees hit the grass, goes slow as he gathers himself at the end
 * of the slide, and holds on the roar and as his fists come down. */
export function clock(play: Play) {
  const { contact, netHit, end, flickAt, tLaunch, apexAt, airAt, kneel, roarAt, pumpAt } = play;
  // [story time, rate until the next one] and holds, in real seconds
  const marks: { story: number; rate: number; hold?: number }[] = [
    { story: 0, rate: 1 },
    { story: flickAt - 0.6, rate: 0.62 },
    { story: flickAt - 0.08, rate: 1 },
    { story: tLaunch, rate: 0, hold: 0.06 },
    { story: tLaunch, rate: 0.8 },
    { story: tLaunch + 0.12, rate: 0.5 },
    { story: apexAt - 0.18, rate: 0.32 },
    { story: apexAt + 0.12, rate: 0.5 },
    { story: apexAt + 0.3, rate: 1 },
    { story: contact - 0.62, rate: 0.62 },
    { story: contact - 0.5, rate: 0.26 },
    { story: contact - 0.08, rate: 0, hold: 0.18 },
    { story: contact - 0.08, rate: 0.5 },
    { story: contact, rate: 0, hold: 0.22 },
    { story: contact, rate: 0.7 },
    { story: contact + 0.08, rate: 1 },
    { story: netHit, rate: 0, hold: 0.12 },
    { story: netHit, rate: 1 },
    { story: airAt, rate: 0, hold: 0.12 },
    { story: airAt, rate: 1 },
    { story: kneel, rate: 0, hold: 0.09 },
    { story: kneel, rate: 1 },
    { story: roarAt - 0.5, rate: 0.55 },
    { story: roarAt + 0.2, rate: 0, hold: 0.24 },
    { story: roarAt + 0.2, rate: 0.75 },
    { story: roarAt + 0.45, rate: 1 },
    { story: pumpAt, rate: 0, hold: 0.11 },
    { story: pumpAt, rate: 1 },
    { story: end, rate: 1 },
  ];
  const real: number[] = [0];
  for (let i = 1; i < marks.length; i += 1) {
    const prev = marks[i - 1];
    const span = prev.hold ?? (marks[i].story - prev.story) / prev.rate;
    real.push(real[i - 1] + span);
  }
  const duration = real[real.length - 1];
  const story = (t: number) => {
    if (t <= 0) return t;
    for (let i = 1; i < marks.length; i += 1) {
      if (t < real[i]) {
        const prev = marks[i - 1];
        if (prev.hold) return prev.story;
        return prev.story + (t - real[i - 1]) * prev.rate;
      }
    }
    return end + (t - duration);
  };
  /** real time at a story time, for timing effects to the clock */
  const realAt = (s: number) => {
    for (let i = 1; i < marks.length; i += 1) {
      const prev = marks[i - 1];
      if (prev.hold) continue;
      if (s <= marks[i].story) return real[i - 1] + (s - prev.story) / prev.rate;
    }
    return duration + (s - end);
  };
  /** the freezes, in real time: the snap of the heel, the top of the
   * backswing, contact, the net, the fists up in the air, his knees landing,
   * the roar and the fists coming down */
  const holds = marks.flatMap((mark, i) => (mark.hold ? [{ story: mark.story, from: real[i], to: real[i + 1] }] : []));
  return { duration, story, realAt, holds };
}
