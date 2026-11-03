import { bones, DEFENDER, drawPlayer, DX, headOf, KEEPER, type Look, type Pose, px, py, STRIKER, type View } from "./body";
import { crumble, grid, type Grid, jigsaw, outline, piece, ring, tile } from "./fx";
import { BLACK, BLUE, BLUEPRINT, CYAN, DEEP, DIM, FAINT, INK, type Ink, MINT, NEGATIVE, type Paint, ROYAL, SILHOUETTE, type Split, tone } from "./ink";
import { lerp, ramp } from "./moves";
import { type Ball, BALL_R, clock, createPlay, GOAL_H, GOAL_X, GOAL_Z, NET_DEPTH } from "./play";

// One frame of the strip: the pitch, the players, the ball and the ink laid
// over them. Effects are keyed to the real clock where they should keep
// moving through a freeze (shake, the flames, the lines boiling, the rings
// of air), and to story time where they belong to the action, as the puzzle
// pieces that come off him in the flow do: a freeze holds them in the air.

const FADE_IN = 0.45;
const FADE_OUT = 0.9;
const REST = 0.35;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// a wrapping lattice of random values, so the flames' noise is lookups
// rather than a pile of sines for every pixel
const LATTICE = new Float32Array(256 * 256);
for (let i = 0; i < LATTICE.length; i += 1) LATTICE[i] = hash(i * 0.731 + 0.17);

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = xi & 255;
  const x1 = (xi + 1) & 255;
  const y0 = (yi & 255) << 8;
  const y1 = ((yi + 1) & 255) << 8;
  const u = xf * xf * (3 - 2 * xf);
  const w = yf * yf * (3 - 2 * yf);
  const a = LATTICE[y0 + x0];
  const b = LATTICE[y0 + x1];
  const c = LATTICE[y1 + x0];
  const d = LATTICE[y1 + x1];
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

// the twelve corners of an icosahedron: a ball's black patches sit on them
const PHI = (1 + Math.sqrt(5)) / 2;
const PATCHES = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
].map(([a, b, c]) => {
  const l = Math.hypot(a, b, c);
  return [a / l, b / l, c / l];
});

export type Scene = ReturnType<typeof createScene>;

export function createScene() {
  const play = createPlay();
  const time = clock(play);
  const loop = time.duration + FADE_OUT + REST;
  const { backswing, strike, net, roar } = time.holds;
  // the fists coming down land without a freeze
  const pump = time.moment(play.pumpAt);
  // as he slows at the end of the slide he gathers himself, and roars
  const gatherFrom = play.roarAt - 0.5;
  const lockAt = play.roarAt + 0.2;
  let dist = new Float32Array(0);
  // the jigsaw each picture breaks into, and room for what the pieces carry
  const jigsaws = new WeakMap<Ink, { grid: Grid; art: Uint8Array }>();
  const prepare = (ink: Ink) => {
    let cut = jigsaws.get(ink);
    if (!cut) {
      cut = { grid: grid(ink, Math.max(16, Math.round(ink.h / 6))), art: new Uint8Array(ink.w * ink.h) };
      jigsaws.set(ink, cut);
    }
    return cut;
  };

  // —— how far the play has opened out of the strip to fill the screen: from
  // when he lands past the first defender, quickly and then easing, and open
  // to the end of the loop
  const openFrom = time.realAt(play.passedAt + 0.02);
  const openAt = (real: number) => 1 - (1 - Math.min(1, Math.max(0, (real - openFrom) / 0.6))) ** 3;
  // once it has the whole screen, the play has the stage: the sentence steps
  // back until it's over
  const stageAt = (t: number) => ramp(t, play.passedAt + 0.1, play.passedAt + 0.45) * (1 - ramp(t, play.end - 0.6, play.end - 0.3));
  // three loud beats and no more: the strike, the net, the roar
  const punches: [typeof strike, number][] = [[strike, 0.07], [net, 0.05], [roar, 0.16]];

  // —— the shots. It's cut the way a sports anime cuts its big play: one
  // long take for the dribble; the flick seen close, the ball rolled up the
  // back of his calf; low under the ball as it goes over the man; a held
  // breath for the backswing; the boot on the ball, huge, on impact; a whip
  // after the ball to the goal; the net close; then back out wide as he
  // wheels away, low on the grass for the slide and the roar, and level and
  // wide for the fist in the air. Every cut is on a hit or a landing.
  const R = (story: number) => time.realAt(story);
  const cuts = {
    insert: R(play.flickAt + 0.1),
    rainbow: R(play.tLaunch + 0.02),
    set: R(play.tCollect + 0.28),
    contact: strike ? strike.from : R(play.contact),
    flight: strike ? strike.to + 0.07 : R(play.contact + 0.08),
    net: net ? net.from : R(play.netHit),
    away: net ? net.to + 0.55 : R(play.netHit + 0.5),
    slide: R(play.kneel - 0.03),
    glory: R(play.riseAt + 0.2),
  };
  /** which shot a moment of real time is in */
  const shotAt = (real: number) =>
    real < cuts.insert ? "run" : real < cuts.rainbow ? "insert" : real < cuts.set ? "rainbow" : real < cuts.contact ? "set" : real < cuts.flight ? "contact" : real < cuts.net ? "flight" : real < cuts.away ? "net" : real < cuts.slide ? "away" : real < cuts.glory ? "slide" : "glory";
  type Win = { x: number; y: number; w: number; h: number };
  /** a view with world point (X, Y) at (sx, sy) on the screen, `zoom` pixels to a unit */
  const aim = (win: Win, X: number, Y: number, sx: number, sy: number, zoom: number, extra: { dy?: number; tilt?: number } = {}): View => {
    const ox = win.x + win.w / 2;
    return { cx: X - (sx - ox) / zoom, cy: Y, zoom, w: win.w, h: win.h, base: sy, ox, ...extra };
  };
  /** how tall he stands, in world units, for sizing him against the frame */
  const TALL = 50;
  const strikeBall = play.ballAt(play.contact);
  const restAt = play.heroAt(play.stopAt + 0.2);
  const camera = (t: number, real: number, hero: Pose, ball: Ball, win: Win, open: number): View => {
    const { w, h } = win;
    const shot = shotAt(real);
    // where he'll be a beat from now, so a following camera trails him a
    // little and leads into his run
    const lagged = (by: number) => play.heroAt(t - by).x;
    let v: View;
    switch (shot) {
      case "run": {
        // in the strip: big in it, a third of the way across. As it opens,
        // the same framing but for the whole screen, bigger, and leaning in
        // as he reads the flick, rolling a few degrees
        const stripZoom = Math.min(h / 76, w / 150);
        const fullZoom = Math.min((0.5 * h) / TALL, w / 120);
        const read = ramp(t, play.flickAt - 0.65, play.flickAt - 0.05);
        const zoom = lerp(stripZoom, fullZoom * (1 + 0.14 * read), open);
        const at = lerp(0.34, 0.36, open);
        v = aim(win, lagged(0.06), 0, win.x + w * at, win.y + h * lerp(0.87, 0.86, open), zoom, { tilt: 0.07 * read * open });
        break;
      }
      case "insert": {
        // down at his feet: the ball rolling up the back of the planted leg
        // on the other boot's laces, the heel about to snap it up
        const zoom = (0.72 * h) / 24;
        const near = play.heroAt(play.flickAt + 0.12).near;
        v = aim(win, near.x - 2, 9, win.x + w * 0.52, win.y + h * 0.66, zoom);
        break;
      }
      case "rainbow": {
        // low, under it: the camera rides with the ball and looks up after
        // it, so it rises out of the top of the frame and comes down again
        const zoom = (0.44 * h) / TALL;
        const lift = Math.max(0, ball.y - 0.62 * (h / zoom));
        v = aim(win, lerp(hero.x + 18, ball.x, 0.55), lift, win.x + w * 0.46, win.y + h * 0.88, zoom, { dy: 0.07 });
        break;
      }
      case "set": {
        // the held breath: in close, still, the ball and the room ahead
        // of him for the strike
        const zoom = (0.5 * h) / TALL;
        const settle = ramp(t, play.tCollect + 0.2, play.contact - 0.35);
        const x = lerp(hero.x + 12, strikeBall.x - 6, settle);
        v = aim(win, x, 0, win.x + w * 0.42, win.y + h * 0.86, zoom, { tilt: 0.05 * settle });
        break;
      }
      case "contact": {
        // the boot on the ball, filling the frame
        const zoom = (0.58 * h) / 15;
        v = aim(win, strikeBall.x - 2.6, strikeBall.y + 0.8, win.x + w * 0.5, win.y + h * 0.57, zoom);
        break;
      }
      case "flight": {
        // whipped round after it, lagging, then the goal and the keeper
        const zoom = (0.3 * h) / TALL;
        const u = ramp(real, cuts.flight, cuts.flight + 0.22);
        const x = lerp(strikeBall.x + 30, Math.min(ball.x - 20, GOAL_X - 12), u);
        v = aim(win, x, 0, win.x + w * 0.5, win.y + h * 0.86, zoom);
        break;
      }
      case "net": {
        // the top corner, close: the net bellying out
        const zoom = (0.62 * h) / 38;
        v = aim(win, GOAL_X + NET_DEPTH * 0.45, GOAL_H - 13, win.x + w * 0.46, win.y + h * 0.5, zoom);
        break;
      }
      case "away": {
        // out wide: the keeper on the grass, and him wheeling away, the
        // camera trailing him
        const zoom = (0.44 * h) / TALL;
        v = aim(win, lagged(0.18) + 8, 0, win.x + w * 0.4, win.y + h * 0.86, zoom);
        break;
      }
      case "slide": {
        // low on the grass, riding the slide and easing to a stop with
        // him; in on him as he gathers himself, the world rolling on the roar
        const gather = ramp(t, gatherFrom, lockAt);
        const zoom = ((0.56 + 0.1 * gather) * h) / TALL;
        const roll = roar && real >= roar.from ? 0.087 + 0.05 * Math.exp(-(real - roar.from) / 0.35) : 0.03 * gather;
        const x = lerp(lagged(0.12) + 10, restAt.x + 4, ramp(t, play.kneel + 0.1, play.stopAt + 0.1));
        v = aim(win, x, 0, win.x + w * 0.44, win.y + h * 0.9, zoom, { dy: 0.05, tilt: roll });
        break;
      }
      default: {
        // up, fist to the sky: level again, wide, pulling slowly back
        const back = ramp(real, cuts.glory, cuts.glory + 2.4);
        const zoom = ((0.5 - 0.08 * back) * h) / TALL;
        v = aim(win, hero.x + 2, 0, win.x + w * 0.5, win.y + h * 0.88, zoom, { tilt: 0.087 * (1 - ramp(real, cuts.glory, cuts.glory + 0.5)) });
      }
    }
    // a punch in on each of the three big hits, and a kick of shake that
    // dies away, the biggest on the roar
    let k = 1;
    for (const [hold, amount] of punches) if (hold && real >= hold.from) k *= 1 + amount * Math.exp(-(real - hold.from) / 0.13);
    let shake = 0;
    if (strike && real >= strike.from) shake += 1.6 * Math.exp(-(real - strike.from) / 0.1);
    if (net && real >= net.from) shake += 2.6 * Math.exp(-(real - net.from) / 0.14);
    if (t >= gatherFrom && t < lockAt) shake += 0.9 * ramp(t, gatherFrom, lockAt);
    if (roar && real >= roar.from) shake += 3.4 * Math.exp(-(real - roar.from) / 0.2);
    const jx = shake ? (hash(Math.floor(real * 60)) - 0.5) * 2 * shake : 0;
    const jy = shake ? (hash(Math.floor(real * 60) + 0.5) - 0.5) * 2 * shake : 0;
    const zoom = v.zoom * k;
    // zoomed about the middle of the window, so the punch lands on what's there
    const mx = v.ox;
    const my = win.y + h / 2;
    const cx = v.cx + (mx - v.ox) / v.zoom - (mx - v.ox) / zoom;
    const cy = v.cy + (v.base - my) / v.zoom - (v.base - my) / zoom;
    return { ...v, cx: cx - jx / zoom, cy: cy + jy / zoom, zoom };
  };

  // —— the pitch: a faint print of its lines, and grass as sparse dots
  const pitch = (ink: Ink, v: View) => {
    const line = tone(FAINT, 10);
    const seg = (x0: number, z0: number, x1: number, z1: number) =>
      ink.line(px(v, x0, z0), py(v, 0, z0), px(v, x1, z1), py(v, 0, z1), line);
    seg(GOAL_X, -900, GOAL_X, 900);
    seg(-154, -256, -154, 256);
    seg(-154, -256, 0, -256);
    seg(-154, 256, 0, 256);
    seg(-462, -564, -462, 564);
    seg(-462, -564, 0, -564);
    seg(-462, 564, 0, 564);
    ink.oval(px(v, -308, 0), py(v, 0, 0), 1.2 * v.zoom, 0.5 * v.zoom, 0, line);
    // the arc of the D, outside the box
    let prev: number[] | null = null;
    for (let i = 0; i <= 40; i += 1) {
      const a = -0.92 + (1.84 * i) / 40;
      const x = -308 - Math.cos(a) * 256;
      const z = Math.sin(a) * 256;
      const point = [px(v, x, z), py(v, 0, z)];
      if (prev && x < -460) ink.line(prev[0], prev[1], point[0], point[1], line);
      prev = point;
    }
    // grass: a dot here and there, in bands where it was mown
    const step = 9;
    const half = v.w / 2 / v.zoom;
    const zLow = (v.base - v.h + v.cy * v.zoom) / (0.16 * v.zoom) - step;
    const zHigh = (v.base + v.cy * v.zoom) / (0.16 * v.zoom) + step;
    for (let j = Math.floor(zLow / step); j <= Math.ceil(zHigh / step); j += 1) {
      const z = j * step;
      const x0 = v.cx - half - z * DX - step;
      const x1 = v.cx + half - z * DX + step;
      for (let i = Math.floor(x0 / step); i <= Math.ceil(x1 / step); i += 1) {
        const x = i * step;
        const band = Math.floor((x + 2000) / 140) % 2 === 0 ? 0.1 : 0.05;
        if (hash(i * 13.1 + j * 7.7) > band) continue;
        const gx = x + hash(i * 3.7 + j) * step;
        const gz = z + hash(i + j * 5.3) * step;
        ink.put(Math.floor(px(v, gx, gz)), Math.floor(py(v, 0, gz)), tone(FAINT));
      }
    }
  };

  // —— lines that stream past while he runs
  const speedLines = (ink: Ink, amount: number, real: number) => {
    if (amount <= 0.01) return;
    for (let i = 0; i < 18; i += 1) {
      if (hash(i * 3.1) > amount * 0.9) continue;
      const y = Math.floor((0.08 + hash(i * 7.7) * 0.8) * ink.h);
      const len = (0.03 + hash(i * 1.3) * 0.09) * ink.w;
      const speed = (0.9 + hash(i * 9.1) * 1.3) * ink.w;
      const span = ink.w + len + 40;
      const x = ink.w - ((real * speed + hash(i * 5.3) * span) % span);
      ink.line(x, y, x + len, y, hash(i * 2.9) < 0.35 ? tone(DIM, 10) : tone(FAINT));
    }
  };

  // —— the goal: frame, and a net that bulges where the ball hits it
  const netPoint = (x: number, y: number, z: number, push: { amount: number; y: number; z: number }) => {
    const d2 = (y - push.y) ** 2 + (z - push.z) ** 2;
    return x + push.amount * Math.exp(-d2 / 190) * (x > 1 ? 1 : 0.3);
  };
  const goal = (ink: Ink, v: View, push: { amount: number; y: number; z: number }, front: boolean) => {
    const mesh = tone(DIM, 7);
    const back = GOAL_H * 0.78;
    const line = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: number) =>
      ink.line(px(v, x0, z0), py(v, y0, z0), px(v, x1, z1), py(v, y1, z1), paint);
    const post = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      ink.cap(px(v, x0, z0), py(v, y0, z0), Math.max(1, 0.75 * v.zoom), px(v, x1, z1), py(v, y1, z1), Math.max(1, 0.75 * v.zoom), tone(INK));
    if (!front) {
      // the back of the net, then the far side
      const nx = GOAL_X + NET_DEPTH;
      for (let z = -GOAL_Z; z <= GOAL_Z; z += 7) {
        let prev: number[] | null = null;
        for (let y = 0; y <= back; y += 5) {
          const x = netPoint(nx, y, z, push);
          const p = [x, y];
          if (prev) line(prev[0], prev[1], z, p[0], p[1], z, mesh);
          prev = p;
        }
      }
      for (let y = 0; y <= back; y += 7) {
        let prev: number[] | null = null;
        for (let z = -GOAL_Z; z <= GOAL_Z; z += 5) {
          const x = netPoint(nx, y, z, push);
          if (prev) line(prev[0], y, prev[1], x, y, z, mesh);
          prev = [x, z];
        }
      }
      for (let x = GOAL_X; x <= nx; x += 7) line(x, 0, GOAL_Z, x, lerp(GOAL_H, back, (x - GOAL_X) / NET_DEPTH), GOAL_Z, mesh);
      for (let y = 0; y <= GOAL_H; y += 7) line(GOAL_X, y, GOAL_Z, nx, Math.min(y, back), GOAL_Z, mesh);
      // the roof
      for (let z = -GOAL_Z; z <= GOAL_Z; z += 7) line(GOAL_X, GOAL_H, z, nx, back, z, mesh);
      post(GOAL_X, 0, GOAL_Z, GOAL_X, GOAL_H, GOAL_Z);
      line(nx, 0, GOAL_Z, nx, back, GOAL_Z, tone(DIM));
      return;
    }
    // the near side net, and the posts and bar in front
    for (let x = GOAL_X; x <= GOAL_X + NET_DEPTH; x += 7) line(x, 0, -GOAL_Z, x, lerp(GOAL_H, back, (x - GOAL_X) / NET_DEPTH), -GOAL_Z, tone(DIM, 6));
    for (let y = 0; y <= GOAL_H; y += 7) line(GOAL_X, y, -GOAL_Z, GOAL_X + NET_DEPTH, Math.min(y, back), -GOAL_Z, tone(DIM, 6));
    line(GOAL_X + NET_DEPTH, 0, -GOAL_Z, GOAL_X + NET_DEPTH, back, -GOAL_Z, tone(DIM));
    line(GOAL_X, GOAL_H, -GOAL_Z, GOAL_X + NET_DEPTH, back, -GOAL_Z, tone(DIM));
    post(GOAL_X, GOAL_H, -GOAL_Z, GOAL_X, GOAL_H, GOAL_Z);
    post(GOAL_X, 0, -GOAL_Z, GOAL_X, GOAL_H, -GOAL_Z);
  };

  // —— the ball, with its patches turning as it rolls
  const drawBall = (ink: Ink, v: View, b: Ball) => {
    const cx = px(v, b.x, b.z);
    const cy = py(v, b.y, b.z);
    const r = Math.max(2.2, BALL_R * v.zoom);
    const sx = r * (1 + 0.32 * b.squash);
    const sy = r * (1 - 0.26 * b.squash);
    ink.oval(cx, cy, sx + 1, sy + 1, 0, tone(BLACK));
    const ca = Math.cos(b.spin);
    const sa = Math.sin(b.spin);
    const x0 = Math.floor(cx - sx);
    const x1 = Math.ceil(cx + sx);
    const y0 = Math.floor(cy - sy);
    const y1 = Math.ceil(cy + sy);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const u = (x + 0.5 - cx) / sx;
        const w = (y + 0.5 - cy) / sy;
        const rr = u * u + w * w;
        if (rr > 1) continue;
        const nz = Math.sqrt(1 - rr);
        // roll about the depth axis, with a fixed tilt so it never looks posed
        const rx = u * ca + w * sa;
        const ry = -u * sa + w * ca;
        const ty = ry * 0.88 - nz * 0.47;
        const tz = ry * 0.47 + nz * 0.88;
        let best = -1;
        for (const [a, c, d] of PATCHES) best = Math.max(best, a * rx + c * ty + d * tz);
        const patch = best > 0.955;
        // the ball is lit from up and to the right
        const shadow = u * -0.55 + w * 0.7 > 0.42;
        ink.put(x, y, patch ? tone(BLACK) : shadow ? tone(DIM) : tone(INK));
      }
    }
  };

  // —— the flow: flames that grow off his outline and lick upward, white at
  // the edge of him, then cyan, going blue-green and blue at the tips
  const aura = (ink: Ink, level: number, real: number, zoom: number, near: { x0: number; y0: number; x1: number; y1: number }) => {
    if (level <= 0.02) return;
    const { w, h, owner, color } = ink;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    // he is somewhere in `near`, which his bones give
    for (let y = Math.max(0, near.y0); y <= Math.min(h - 1, near.y1); y += 1) {
      for (let x = Math.max(0, near.x0); x <= Math.min(w - 1, near.x1); x += 1) {
        if (owner[y * w + x] !== 1) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return;
    const R = (2.5 + 5.5 * level) * Math.max(1, zoom * 0.55);
    const x0 = Math.max(0, Math.floor(minX - R));
    const x1 = Math.min(w - 1, Math.ceil(maxX + R));
    const y0 = Math.max(0, Math.floor(minY - R * 2.2));
    const y1 = Math.min(h - 1, Math.ceil(maxY + R));
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (dist.length < bw * bh) dist = new Float32Array(bw * bh);
    // chamfer distance to his nearest pixel, two passes
    for (let y = 0; y < bh; y += 1) {
      for (let x = 0; x < bw; x += 1) {
        const i = y * bw + x;
        let d = owner[(y + y0) * w + x + x0] === 1 ? 0 : 1e9;
        if (x > 0) d = Math.min(d, dist[i - 1] + 1);
        if (y > 0) {
          d = Math.min(d, dist[i - bw] + 1);
          if (x > 0) d = Math.min(d, dist[i - bw - 1] + 1.41);
          if (x < bw - 1) d = Math.min(d, dist[i - bw + 1] + 1.41);
        }
        dist[i] = d;
      }
    }
    for (let y = bh - 1; y >= 0; y -= 1) {
      for (let x = bw - 1; x >= 0; x -= 1) {
        const i = y * bw + x;
        let d = dist[i];
        if (x < bw - 1) d = Math.min(d, dist[i + 1] + 1);
        if (y < bh - 1) {
          d = Math.min(d, dist[i + bw] + 1);
          if (x < bw - 1) d = Math.min(d, dist[i + bw + 1] + 1.41);
          if (x > 0) d = Math.min(d, dist[i + bw - 1] + 1.41);
        }
        dist[i] = d;
      }
    }
    const middle = (minY + maxY) / 2;
    const scale = 1 / Math.max(1, zoom * 0.5);
    for (let y = 0; y < bh; y += 1) {
      const sy = y + y0;
      const lift = Math.max(-1, Math.min(1, (middle - sy) / Math.max(1, (maxY - minY) * 0.5)));
      const reach = R * (0.55 + 0.75 * Math.max(0, lift) + 0.25 * Math.min(0, lift));
      for (let x = 0; x < bw; x += 1) {
        const d = dist[y * bw + x];
        if (d === 0 || d > reach * 1.6) continue;
        const sx = x + x0;
        const at = sy * w + sx;
        if (color[at] !== BLACK) continue;
        const n = noise(sx * 0.16 * scale, sy * 0.11 * scale + real * 3.4) * 0.65 + noise(sx * 0.37 * scale, sy * 0.3 * scale + real * 6.1) * 0.35;
        const heat = 1 - d / reach + (n - 0.5) * 1.25;
        if (heat > 0.5) ink.put(sx, sy, heat > 0.9 && d < 2.2 ? tone(INK) : heat > 0.72 ? tone(CYAN) : heat > 0.6 ? tone(MINT, 10) : tone(DEEP, 12));
      }
    }
  };

  // —— the lines a panel uses to stare at something
  const focusLines = (ink: Ink, cx: number, cy: number, level: number, real: number, rx: number, ry: number) => {
    if (level <= 0.01) return;
    const beat = Math.floor(real * 15);
    const far = Math.hypot(ink.w, ink.h);
    for (let i = 0; i < 56; i += 1) {
      if (hash(i * 1.7 + 0.3) > level * 0.8) continue;
      const a = (i / 56) * Math.PI * 2 + (hash(i * 3.3 + beat) - 0.5) * 0.07;
      const ex = Math.cos(a);
      const ey = Math.sin(a);
      // they stop short of him, further off sideways than up and down
      const inner = 1 + 0.56 * hash(i * 5.1 + beat * 0.37);
      ink.wedge(cx + ex * far, cy + ey * far, cx + ex * inner * rx, cy + ey * inner * ry, 1 + hash(i * 7.9 + beat) * 2.2, tone(INK, hash(i * 2.3) < 0.5 ? 16 : 9));
    }
  };

  // —— bursts of turf and ink, each a handful of seeded specks under gravity
  type Burst = { t: number; x: number; y: number; z: number; n: number; dir: number; spread: number; speed: number; life: number; paint: number[]; seed: number; size: number };
  const bursts: Burst[] = [];
  const slideFoot = (t: number) => play.d1At(t).near;
  for (let i = 0; i < 10; i += 1) {
    const t = play.slideStart + 0.1 + i * 0.05;
    const foot = slideFoot(t);
    bursts.push({ t, x: foot.x - 6, y: 1, z: 6, n: 5, dir: Math.PI * 0.62, spread: 0.6, speed: 80, life: 0.45, paint: [tone(DIM), tone(FAINT)], seed: i * 11, size: 0.5 });
  }
  const landing = play.heroAt(play.jumpAt + 0.37).near;
  bursts.push({ t: play.jumpAt + 0.37, x: landing.x, y: 1, z: 0, n: 7, dir: Math.PI * 0.5, spread: 1.1, speed: 50, life: 0.35, paint: [tone(DIM)], seed: 3, size: 0.5 });
  const plant = play.heroAt(play.contact - 0.19).far;
  bursts.push({ t: play.contact - 0.19, x: plant.x + 2, y: 1, z: 2, n: 9, dir: Math.PI * 0.45, spread: 0.9, speed: 70, life: 0.5, paint: [tone(DIM), tone(INK, 8)], seed: 5, size: 0.55 });
  const contactBall = play.ballAt(play.contact);
  bursts.push({ t: play.contact, x: contactBall.x, y: contactBall.y, z: 0, n: 22, dir: 0.15, spread: 1.5, speed: 190, life: 0.42, paint: [tone(CYAN), tone(INK), tone(BLUE)], seed: 7, size: 0.75 });
  const netBall = play.ballAt(play.netHit);
  bursts.push({ t: play.netHit, x: netBall.x, y: netBall.y, z: netBall.z, n: 30, dir: Math.PI, spread: 3.1, speed: 150, life: 0.6, paint: [tone(CYAN), tone(INK), tone(MINT)], seed: 9, size: 0.8 });
  // sweat thrown off him as his head snaps round
  const sweat: [number, number, number][] = [[play.tLaunch, 0.78, 6], [play.contact, 0.66, 8], [play.kneel, 0.72, 6], [play.roarAt + 0.18, 0.5, 9], [play.pumpAt, 0.28, 7]];
  for (const [t, dir, n] of sweat) {
    const p = play.heroAt(t);
    const head = headOf(p);
    bursts.push({ t, x: head.x, y: head.y + 1, z: p.z - 3, n, dir: Math.PI * dir, spread: 1.7, speed: 64, life: 0.55, paint: [tone(INK), tone(CYAN)], seed: 80 + n * 7, size: 0.3 });
  }
  for (let i = 0; i < 9; i += 1) {
    const t = play.slideAt + 0.18 + i * 0.05;
    const hero = play.heroAt(t);
    bursts.push({ t, x: hero.x + 2, y: 1, z: hero.z, n: 5, dir: Math.PI * 0.35, spread: 0.7, speed: 95 - i * 8, life: 0.5, paint: [tone(DIM), tone(INK, 6)], seed: 40 + i, size: 0.5 });
  }
  // turf off every push-off while he runs, thrown back behind him: found by
  // watching each foot settle on the grass and leave it again
  for (const [from, to] of [[0, play.flickAt - 0.05], [play.flickAt + 0.5, play.shotFrom], [play.contact + 0.5, play.slideAt]]) {
    const step = 1 / 240;
    const down = [0, 0];
    let prev = play.heroAt(from);
    for (let t = from + step; t < to; t += step) {
      const p = play.heroAt(t);
      const feet = [[p.near, prev.near, p.z - 2.2], [p.far, prev.far, p.z + 2.2]] as const;
      feet.forEach(([foot, was, z], i) => {
        const speed = (foot.x - was.x) / step;
        if (Math.abs(speed) < 8 && foot.y < 4) {
          down[i] += step;
          return;
        }
        if (down[i] > 0.03 && speed > 40) {
          bursts.push({ t, x: foot.x + Math.cos(foot.a) * 3.6, y: 0.6, z, n: 6, dir: Math.PI * 0.8, spread: 0.8, speed: 70, life: 0.38, paint: [tone(DIM), tone(INK, 7), tone(DIM, 10)], seed: t * 131 + i, size: 0.7 });
        }
        down[i] = 0;
      });
      prev = p;
    }
  }
  const specks = (ink: Ink, v: View, t: number) => {
    for (const b of bursts) {
      const dt = t - b.t;
      if (dt < 0 || dt > b.life) continue;
      for (let i = 0; i < b.n; i += 1) {
        const a = b.dir + (hash(b.seed + i * 1.37) - 0.5) * b.spread;
        const s = b.speed * (0.4 + 0.8 * hash(b.seed + i * 2.11));
        const life = b.life * (0.55 + 0.45 * hash(b.seed + i * 3.7));
        if (dt > life) continue;
        const x = b.x + Math.cos(a) * s * dt;
        const y = b.y + Math.sin(a) * s * dt - 160 * dt * dt;
        if (y < -1) continue;
        const z = b.z + (hash(b.seed + i * 4.3) - 0.5) * 8;
        const r = Math.max(0.5, b.size * v.zoom * (1 - (dt / life) * 0.6));
        ink.disc(px(v, x, z), py(v, y, z), r, b.paint[i % b.paint.length]);
      }
    }
  };

  // —— the ball's tail on the way in, and the sweep of the kicking boot
  const trail = (ink: Ink, v: View, t: number) => {
    if (t < play.contact || t > play.netHit + 0.06) return;
    let prev: number[] | null = null;
    const n = 10;
    for (let k = n; k >= 0; k -= 1) {
      const s = Math.max(play.contact, t - k * 0.011);
      const b = play.ballAt(Math.min(s, play.netHit));
      const point = [px(v, b.x, b.z), py(v, b.y, b.z)];
      if (prev) {
        const r = Math.max(0.5, BALL_R * v.zoom * (1 - k / n) * 0.62);
        ink.cap(prev[0], prev[1], r * 0.8, point[0], point[1], r, tone(BLUE));
        ink.cap(prev[0], prev[1], r * 0.45, point[0], point[1], r * 0.6, tone(CYAN));
        ink.cap(prev[0], prev[1], r * 0.15, point[0], point[1], r * 0.26, tone(INK));
      }
      prev = point;
    }
  };
  // —— the swing as a smear: for the last frames before contact the kicking
  // boot is drawn as the whole band it sweeps through, solid and
  // straight-edged, the way a key animator would bridge the two poses
  const smear = (ink: Ink, v: View, t: number) => {
    if (t < play.contact - 0.026 || t >= play.contact) return;
    const n = 6;
    const front: number[] = [];
    const back: number[] = [];
    for (let k = 0; k <= n; k += 1) {
      const p = play.heroAt(t - (n - k) * 0.007);
      const ca = Math.cos(p.near.a);
      const sa = Math.sin(p.near.a);
      front.push(px(v, p.near.x + ca * 5.3, p.z - 2.2), py(v, p.near.y + sa * 5.3, p.z - 2.2));
      back.push(px(v, p.near.x - sa * 1.6, p.z - 2.2), py(v, p.near.y + ca * 1.6, p.z - 2.2));
    }
    const band = [...front];
    for (let k = n; k >= 0; k -= 1) band.push(back[k * 2], back[k * 2 + 1]);
    ink.who = 1;
    ink.poly(band, tone(ROYAL));
    // its leading edge, straight and bright
    ink.cap(front[0], front[1], 0.5, front[n * 2], front[n * 2 + 1], Math.max(1, 0.5 * v.zoom), tone(CYAN));
    ink.who = 0;
  };

  // —— a rim of light down his back and over his shoulders, from the
  // floodlights behind him: a grey edge until he finds the flow, and then,
  // all at once, electric
  const rim = (ink: Ink, box: { x0: number; y0: number; x1: number; y1: number }, flow: boolean) => {
    const { w, h, owner, color } = ink;
    const lit: number[] = [];
    for (let y = Math.max(1, box.y0); y <= Math.min(h - 2, box.y1); y += 1) {
      for (let x = Math.max(1, box.x0); x <= Math.min(w - 2, box.x1); x += 1) {
        const i = y * w + x;
        if (owner[i] !== 1) continue;
        const open = (j: number) => owner[j] !== 1 && color[j] === BLACK;
        if (open(i - w) || open(i - 1)) lit.push(i);
      }
    }
    const paint = flow ? CYAN : DIM;
    for (const i of lit) color[i] = paint;
  };

  // —— on contact: rings of air pushed out along the line of the shot, which
  // keep going while everything else holds, and a star of lines off the ball
  const impact = (ink: Ink, v: View, real: number) => {
    if (!strike || real < strike.from || real >= strike.to + 0.4) return;
    const b = play.ballAt(play.contact);
    const cx = px(v, b.x, b.z);
    const cy = py(v, b.y, b.z);
    const since = real - strike.from;
    const rings: [number, number][] = [[0, tone(INK)], [0.06, tone(CYAN, 12)], [0.13, tone(MINT, 7)]];
    for (const [delay, paint] of rings) {
      const s = since - delay;
      if (s < 0 || s > 0.4) continue;
      const r = BALL_R * v.zoom * (0.9 + s * 9);
      ring(ink, cx + s * 1.2 * v.h, cy - s * 0.2 * v.h, r, Math.max(1, 2.6 * (1 - s / 0.4)), paint, 2.6);
    }
    if (real >= strike.to) return;
    const beat = Math.floor(real * 30);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2 + hash(i + beat * 0.1) * 0.3;
      const near = BALL_R * v.zoom * 1.6;
      const far = near + (0.25 + 0.45 * hash(i * 2.7 + beat)) * v.h;
      ink.wedge(cx + Math.cos(a) * far, cy + Math.sin(a) * far, cx + Math.cos(a) * near, cy + Math.sin(a) * near, 2 + hash(i * 4.1) * 4, tone(INK));
    }
  };

  // —— the flow, as puzzle pieces. Each is born at a moment in story time and
  // a point in the world and flies off with a speed that dies away, drifting
  // up (or falling), turning, cooling from white through cyan to blue and
  // breaking up. The ones that come off him hang where he left them, so the
  // trail they make is the way he went.
  type Shard = {
    t: number;
    life: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    /** how long its speed takes to die away, in seconds */
    drag: number;
    /** a steady pull up, or down when it is negative */
    lift: number;
    turn: number;
    spin: number;
    size: number;
    sides: number[];
    /** the ink it is cut from, or -1 for the flow's, white-hot cooling to blue */
    hue: number;
    seed: number;
    /** where it is drawn in to, for one that comes in to him from outside */
    tx?: number;
    ty?: number;
    /** already full size when it is born, as a piece broken off something */
    whole?: boolean;
  };
  const shards: Shard[] = [];
  const sidesOf = (seed: number) =>
    [0, 1, 2, 3].map((i) => {
      const r = hash(seed + i * 1.618);
      return r < 0.1 ? 0 : r < 0.55 ? 1 : -1;
    });

  // off him the whole time he is in the flow, more the deeper he is, from
  // just off his bones: the trunk and head most, then the legs, then the arms
  const RATE = 30;
  const WEIGHTS = [3, 2.2, 1.1, 0.8, 1, 0.7, 0.9, 0.7, 0.7, 0.5];
  const WEIGHT = WEIGHTS.reduce((a, b) => a + b, 0);
  for (let k = 0; k < play.end * RATE; k += 1) {
    const t = k / RATE;
    const r = (j: number) => hash(k * 1.913 + j * 0.377);
    if (r(0) >= play.auraAt(t) - 0.25) continue;
    const p = play.heroAt(t);
    const run = (play.heroAt(t + 0.02).x - p.x) / 0.02;
    const list = bones(p);
    let pick = r(1) * WEIGHT;
    let i = 0;
    while (i < list.length - 1 && pick > WEIGHTS[i]) {
      pick -= WEIGHTS[i];
      i += 1;
    }
    const [x0, y0, x1, y1, z, flesh] = list[i];
    const along = r(2);
    const a = r(3) * Math.PI * 2;
    // as he gathers himself it all comes in to him instead
    if (t >= gatherFrom && t < lockAt) {
      const tx = x0 + (x1 - x0) * along;
      const ty = y0 + (y1 - y0) * along;
      const far = 14 + 12 * r(4);
      shards.push({
        t,
        life: 0.28 + 0.22 * r(6),
        x: tx + Math.cos(a) * far,
        y: ty + Math.sin(a) * far * 0.8,
        z: z + (r(7) - 0.5) * 5,
        vx: 0,
        vy: 0,
        drag: 1,
        lift: 0,
        turn: r(11) * Math.PI * 2,
        spin: (r(12) - 0.5) * 7,
        size: r(13) < 0.25 ? 1.7 + 0.6 * r(14) : 2.9 + 1.5 * r(14),
        sides: sidesOf(k * 4.1),
        hue: -1,
        seed: k,
        tx,
        ty,
      });
      continue;
    }
    const off = flesh + 0.4 + 2.8 * r(4);
    const out = 10 + 22 * r(5);
    shards.push({
      t,
      life: 0.4 + 0.45 * r(6),
      x: x0 + (x1 - x0) * along + Math.cos(a) * off,
      y: y0 + (y1 - y0) * along + Math.sin(a) * off,
      z: z + (r(7) - 0.5) * 5,
      vx: run * (0.15 + 0.2 * r(8)) + Math.cos(a) * out - 8,
      vy: Math.sin(a) * out + 12 + 20 * r(9),
      drag: 0.3,
      lift: 25 + 55 * r(10),
      turn: r(11) * Math.PI * 2,
      spin: (r(12) - 0.5) * 7,
      size: r(13) < 0.25 ? 1.7 + 0.6 * r(14) : 2.9 + 1.5 * r(14),
      sides: sidesOf(k * 4.1),
      hue: -1,
      seed: k,
    });
  }

  // and in bursts, where the flow catches or lets go
  const scatter = (o: { t: number; x: number; y: number; z: number; n: number; dir: number; spread: number; speed: number; life: number; size: number; lift: number; drag?: number; reach?: number; hue?: number; seed: number }) => {
    for (let i = 0; i < o.n; i += 1) {
      const r = (j: number) => hash(o.seed * 7.31 + i * 3.17 + j * 0.531);
      const a = o.dir + (r(1) - 0.5) * o.spread;
      const s = o.speed * (0.45 + 0.75 * r(2));
      const off = (o.reach ?? 0) * (0.3 + 0.7 * r(3));
      shards.push({
        t: o.t + r(4) * 0.02,
        life: o.life * (0.6 + 0.6 * r(5)),
        x: o.x + Math.cos(a) * off,
        y: o.y + Math.sin(a) * off,
        z: o.z + (r(6) - 0.5) * 6,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        drag: o.drag ?? 0.25,
        lift: o.lift,
        turn: r(7) * Math.PI * 2,
        spin: (r(8) - 0.5) * 10,
        size: o.size * (0.6 + 0.7 * r(9)),
        sides: sidesOf(o.seed * 13.7 + i),
        hue: o.hue ?? -1,
        seed: o.seed * 31 + i,
      });
    }
  };

  // —— the read: before the flick its pieces come together by his head and
  // click, and he is in the flow
  const readFrom = play.flickAt - 0.62;
  const readAt = play.flickAt - 0.1;
  const flight = { from: play.tLaunch, to: play.tCollect };
  const reader = play.heroAt(readAt);
  const readHead = headOf(reader);
  scatter({ t: readAt + 0.04, x: readHead.x + 13, y: readHead.y + 10, z: reader.z, n: 14, dir: 0, spread: Math.PI * 2, speed: 95, life: 0.55, size: 2.6, lift: 30, drag: 0.2, reach: 3, seed: 1 });
  const figuring = (ink: Ink, v: View, t: number) => {
    if (t < readFrom || t > readAt + 0.04) return;
    const p = play.heroAt(t);
    const head = headOf(p);
    const u = ramp(t, readFrom, readAt);
    const sides = jigsaw(3, 2, 21);
    const size = 4;
    for (let j = 0; j < 2; j += 1) {
      for (let i = 0; i < 3; i += 1) {
        const k = j * 3 + i;
        const a = hash(k * 4.7) * Math.PI * 2;
        const r = 17 * (1 - u) * (0.7 + 0.5 * hash(k * 1.9));
        const x = head.x + 13 + (i - 1) * size + Math.cos(a) * r;
        const y = head.y + 10 + (0.5 - j) * size + Math.sin(a) * r * 0.6;
        const turn = (1 - u) * (hash(k * 2.3) - 0.5) * 3.4;
        const pts = piece(px(v, x, p.z), py(v, y, p.z), size * v.zoom, turn, sides(i, j));
        if (t >= readAt) tile(ink, pts, tone(INK), tone(CYAN), tone(INK));
        else tile(ink, pts, tone(DEEP, Math.round(4 + 12 * u)), tone(CYAN, Math.round(6 + 10 * u)), tone(INK, Math.round(6 + 10 * u)));
      }
    }
  };
  // —— the flick: the heel whips up behind him and throws the ball over
  // both their heads, spinning, and he goes round the man while it is up.
  // Turf comes off the plant, and off the touch that takes it down again.
  const whip = (ink: Ink, v: View, t: number) => {
    const at = play.tLaunch;
    if (t < at - 0.04 || t > at + 0.1) return;
    const fade = 1 - ramp(t, at + 0.03, at + 0.1);
    let prev: number[] | null = null;
    const n = 14;
    for (let k = n; k >= 0; k -= 1) {
      const p = play.heroAt(Math.min(t, at + 0.05) - k * 0.01);
      const heel = [p.near.x - Math.cos(p.near.a) * 1.9, p.near.y - Math.sin(p.near.a) * 1.9];
      const point = [px(v, heel[0], p.z - 2.2), py(v, heel[1], p.z - 2.2)];
      if (prev) {
        const r = Math.max(0.5, 0.75 * v.zoom * (1 - k / n) * fade);
        ink.cap(prev[0], prev[1], r * 0.75, point[0], point[1], r, tone(BLUE, 10));
        ink.cap(prev[0], prev[1], r * 0.3, point[0], point[1], r * 0.45, tone(INK));
      }
      prev = point;
    }
  };
  const launch = play.ballAt(flight.from);
  const caught = play.ballAt(flight.to);
  scatter({ t: flight.from, x: launch.x, y: launch.y, z: launch.z, n: 6, dir: Math.PI * 0.7, spread: 1.6, speed: 80, life: 0.45, size: 1.6, lift: -70, drag: 0.35, seed: 2 });
  bursts.push({ t: flight.from, x: launch.x - 2, y: 1, z: 0, n: 7, dir: Math.PI * 0.6, spread: 1, speed: 60, life: 0.4, paint: [tone(DIM), tone(FAINT)], seed: 61, size: 0.5 });
  bursts.push({ t: flight.to, x: caught.x, y: 1, z: caught.z, n: 8, dir: Math.PI * 0.5, spread: 2.2, speed: 45, life: 0.4, paint: [tone(DIM), tone(FAINT)], seed: 62, size: 0.5 });
  // and a short streak behind the ball on its way through the air
  const streak = (ink: Ink, v: View, t: number) => {
    if (t <= flight.from || t >= flight.to) return;
    let prev: number[] | null = null;
    const n = 9;
    ink.who = 3;
    ink.clip = behind(ink);
    for (let k = n; k >= 0; k -= 1) {
      const b = play.ballAt(Math.max(flight.from, t - k * 0.014));
      const point = [px(v, b.x, b.z), py(v, b.y, b.z)];
      if (prev) {
        const r = BALL_R * v.zoom * (1 - k / n);
        ink.cap(prev[0], prev[1], r * 0.75, point[0], point[1], r * 0.95, tone(BLUE, 6));
        ink.cap(prev[0], prev[1], r * 0.35, point[0], point[1], r * 0.55, tone(CYAN, 10));
        ink.cap(prev[0], prev[1], r * 0.1, point[0], point[1], r * 0.2, tone(INK, 12));
      }
      prev = point;
    }
    ink.clip = null;
    ink.who = 0;
  };

  // all of it let go into the shot
  const striking = play.heroAt(play.contact);
  scatter({ t: play.contact + 0.001, x: striking.x, y: striking.y + 9, z: striking.z, n: 28, dir: 0, spread: Math.PI * 2, speed: 210, life: 0.7, size: 3, lift: 10, drag: 0.18, reach: 6, seed: 4 });
  // the net
  scatter({ t: play.netHit, x: netBall.x, y: netBall.y, z: netBall.z, n: 18, dir: Math.PI, spread: 3, speed: 150, life: 0.65, size: 2.4, lift: -110, drag: 0.4, seed: 5 });
  // and the roar, up out of him, then along the grass as the fists come down
  const roaring = play.heroAt(play.roarAt + 0.2);
  const [chest] = bones(roaring);
  scatter({ t: play.roarAt + 0.2, x: (chest[0] + chest[2]) / 2, y: (chest[1] + chest[3]) / 2 + 4, z: roaring.z, n: 44, dir: Math.PI / 2, spread: Math.PI * 1.15, speed: 120, life: 1, size: 3.2, lift: -30, drag: 0.32, reach: 7, seed: 6 });
  const pumping = play.heroAt(play.pumpAt);
  scatter({ t: play.pumpAt, x: pumping.x - 4, y: 2, z: pumping.z, n: 9, dir: Math.PI, spread: 0.6, speed: 170, life: 0.5, size: 2.2, lift: 25, drag: 0.3, seed: 7 });
  scatter({ t: play.pumpAt, x: pumping.x + 4, y: 2, z: pumping.z, n: 9, dir: 0, spread: 0.6, speed: 170, life: 0.5, size: 2.2, lift: 25, drag: 0.3, seed: 8 });

  // everything that comes off him goes behind him and the ball
  const behind = (ink: Ink) => (x: number, y: number) => {
    const o = ink.owner[y * ink.w + x];
    return o !== 1 && o !== 2;
  };
  const pieces = (ink: Ink, v: View, t: number, real: number) => {
    ink.who = 3;
    ink.clip = behind(ink);
    for (const s of shards) {
      if (s.t > t) break;
      const a = t - s.t;
      if (a >= s.life) continue;
      const u = a / s.life;
      const inward = s.tx !== undefined && s.ty !== undefined;
      let x: number;
      let y: number;
      if (s.tx !== undefined && s.ty !== undefined) {
        // drawn in to him, faster as it comes, swirling
        const out = 1 - u * u;
        const swirl = (1 - u) * s.spin * 0.2;
        const ox = (s.x - s.tx) * out;
        const oy = (s.y - s.ty) * out;
        x = s.tx + ox * Math.cos(swirl) - oy * Math.sin(swirl);
        y = s.ty + ox * Math.sin(swirl) + oy * Math.cos(swirl);
      } else {
        const k = s.drag * (1 - Math.exp(-a / s.drag));
        x = s.x + s.vx * k;
        y = s.y + s.vy * k + 0.5 * s.lift * a * a;
        if (y < -1) continue;
      }
      // it pops out, unless it was whole already, and shrinks as it goes
      const size = s.size * v.zoom * (s.whole ? 1 : Math.min(1, 0.35 + a * 12)) * (1 - 0.35 * u * u);
      if (size < 2.5) continue;
      const pts = piece(px(v, x, s.z), py(v, y, s.z), size, s.turn + s.spin * a + 0.12 * Math.sin(real * 5 + s.seed), s.sides);
      // and breaks up over the last third of its life, or, coming in, comes
      // out of nothing and heats up on the way
      const fade = Math.min(16, Math.round((16 * (inward ? u : 1 - u)) / 0.35));
      if (fade < 1) continue;
      if (s.hue >= 0) {
        tile(ink, pts, tone(s.hue, fade), tone(s.hue, fade), tone(INK, fade));
        continue;
      }
      const heat = inward ? u : 1 - u;
      if (heat > 0.92) tile(ink, pts, tone(INK), tone(INK), tone(INK));
      else if (heat > 0.66) tile(ink, pts, tone(CYAN), tone(MINT), tone(INK));
      else if (heat > 0.4) tile(ink, pts, tone(BLUE), tone(DEEP), tone(CYAN));
      else tile(ink, pts, tone(DEEP, fade), tone(BLUE, fade), tone(MINT, fade));
    }
    ink.clip = null;
    ink.who = 0;
  };

  // —— the celebration. He wheels away with afterimages behind him and the
  // flow streaming off him, drops onto his knees and slides, cutting two
  // lines of light into the grass; as he slows he gathers himself and it
  // all comes in to him, and on the roar the picture behind him breaks up
  // like a jigsaw while pieces lock into a ring at his back. When his fists
  // come down the ring blows apart and the ground splits round him in light.
  const middleOf = (p: Pose) => {
    const [b] = bones(p);
    return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, z: p.z };
  };
  const kneesOf = (p: Pose) => {
    const list = bones(p);
    return [list[2], list[4]].map(([, , x, y, z]) => ({ x, y, z }));
  };

  // afterimages as he goes round the defender, and as he wheels away and
  // drops into the slide
  const ghost = (level: number): Look => {
    const fill = tone(BLUE, level);
    const line = tone(CYAN, level);
    return {
      ...STRIKER,
      skin: fill, farSkin: fill, line, farLine: line, trim: line, farTrim: line, shade: 0,
      shirt: fill, shirtShade: 0, sleeve: fill, farSleeve: fill, stripes: undefined, collar: fill, top: fill, edging: undefined,
      shorts: fill, socks: fill, band: undefined, boots: fill, farBoots: fill,
      hair: fill, hairLine: line, strands: undefined, shine: 0, mark: fill, iris: fill, lit: fill,
    };
  };
  const GHOSTS: [number, Look][] = [[0.045, ghost(10)], [0.09, ghost(6)], [0.135, ghost(3)]];
  const afterimages = (ink: Ink, v: View, t: number) => {
    // faint ones as he goes round the defender with the ball up
    const round = ramp(t, play.tLaunch + 0.05, play.tLaunch + 0.2) * (1 - ramp(t, play.tCollect - 0.15, play.tCollect + 0.1));
    const away = ramp(t, play.netHit + 0.15, play.netHit + 0.45) * (1 - ramp(t, play.kneel + 0.15, play.kneel + 0.5));
    if (round < 0.3 && away < 0.05) return;
    ink.who = 3;
    const shown = round >= 0.3 ? GHOSTS.slice(2) : GHOSTS.slice(0, Math.ceil(away * GHOSTS.length));
    for (let i = shown.length - 1; i >= 0; i -= 1) drawPlayer(ink, v, play.heroAt(t - shown[i][0]), shown[i][1]);
    ink.who = 0;
  };

  // the knees landing, and sparks off them all the way along the slide
  const landed = kneesOf(play.heroAt(play.kneel));
  landed.forEach((knee, i) => scatter({ t: play.kneel, x: knee.x + 2, y: 1, z: knee.z, n: 8, dir: Math.PI * 0.28, spread: 1.2, speed: 140, life: 0.5, size: 1.9, lift: -180, drag: 0.5, seed: 10 + i }));
  for (let s = play.kneel; s < play.stopAt - 0.15; s += 0.07) {
    kneesOf(play.heroAt(s)).forEach((knee, i) => {
      bursts.push({ t: s, x: knee.x, y: 0.6, z: knee.z, n: 3, dir: Math.PI * 0.88, spread: 0.6, speed: 75, life: 0.32, paint: [tone(INK), tone(CYAN)], seed: s * 97 + i, size: 0.4 });
    });
  }
  const groove = (ink: Ink, v: View, t: number) => {
    if (t < play.kneel || t > play.stopAt + 1) return;
    const now = Math.min(t, play.stopAt);
    const fade = 1 - ramp(t, play.stopAt + 0.2, play.stopAt + 1);
    const steps = 24;
    const trails = [[], []] as number[][][];
    for (let i = 0; i <= steps; i += 1) {
      const s = play.kneel + ((now - play.kneel) * i) / steps;
      kneesOf(play.heroAt(s)).forEach((knee, j) => trails[j].push([px(v, knee.x, knee.z), py(v, 0, knee.z), t - s]));
    }
    const r = Math.max(0.5, 0.5 * v.zoom);
    ink.who = 3;
    ink.clip = behind(ink);
    for (const trail of trails) {
      for (let i = 1; i < trail.length; i += 1) {
        const [ax, ay] = trail[i - 1];
        const [bx, by, age] = trail[i];
        const level = Math.round(16 * fade * (1 - ramp(age, 0.3, 1.4)));
        if (level < 1) continue;
        ink.cap(ax, ay, r * 1.8, bx, by, r * 1.8, tone(age < 0.5 ? CYAN : BLUE, level));
        ink.cap(ax, ay, r * 0.6, bx, by, r * 0.6, tone(age < 0.25 ? INK : CYAN, level));
      }
    }
    ink.clip = null;
    ink.who = 0;
  };

  // a ring of air knocked out across the grass by the roar, which keeps
  // going through the freeze
  const RINGS: [number, Paint][] = [[0, tone(INK)], [0.08, tone(CYAN, 12)], [0.16, tone(MINT, 7)]];
  const shockwaves = [{ hold: roar, x: roaring.x, y: 0, z: roaring.z, reach: 130, squash: 0.22 }];
  const groundRings = (ink: Ink, v: View, real: number) => {
    ink.clip = behind(ink);
    for (const s of shockwaves) {
      if (!s.hold) continue;
      for (const [delay, paint] of RINGS.slice(0, 2)) {
        const a = real - s.hold.from - delay;
        if (a < 0 || a > 0.5) continue;
        ring(ink, px(v, s.x, s.z), py(v, s.y, s.z), v.zoom * (5 + a * s.reach * 2), Math.max(1, 3 * (1 - a / 0.5)), paint, s.squash);
      }
    }
    ink.clip = null;
  };

  // the ring: as he gathers himself its pieces come in round him, and on the
  // roar they lock together at his back and turn; when his fists come down
  // it blows apart
  const [trunk] = bones(roaring);
  const crownAt = { x: trunk[2] - 0.5, y: trunk[3] - 2, z: roaring.z + 2 };
  const CROWN = 12;
  const CROWN_R = 12;
  const crownPiece = (2 * Math.PI * CROWN_R) / CROWN;
  const crownSides = (k: number) => (k % 2 ? [-1, -1, 0, -1] : [1, 1, 0, 1]);
  const crownTurn = (t: number) => 0.32 * Math.max(0, t - lockAt);
  const crown = (ink: Ink, v: View, t: number, real: number) => {
    if (t < gatherFrom || t >= play.pumpAt) return;
    const cx = px(v, crownAt.x, crownAt.z);
    const cy = py(v, crownAt.y, crownAt.z);
    const flash = roar && real >= roar.from && real < roar.from + 0.14;
    ink.who = 3;
    ink.clip = behind(ink);
    for (let k = 0; k < CROWN; k += 1) {
      const u = ramp(t, gatherFrom + (k / CROWN) * 0.22, lockAt - 0.03);
      const r1 = hash(k * 3.7 + 1);
      const r2 = hash(k * 5.3 + 2);
      const a = (k / CROWN) * Math.PI * 2 + crownTurn(t) - (1 - u) * (1.4 + 1.8 * r1);
      const r = CROWN_R * v.zoom * (1 + (1 - u) * (1.4 + 1.6 * r2));
      const pts = piece(cx + Math.cos(a) * r, cy + Math.sin(a) * r, crownPiece * v.zoom * (0.5 + 0.5 * u), a + Math.PI / 2 + (1 - u) * (r2 - 0.5) * 7, crownSides(k));
      if (u < 1) {
        const level = Math.round(3 + 13 * u);
        tile(ink, pts, tone(DEEP, level), tone(CYAN, level), tone(INK, level));
      } else if (flash) {
        tile(ink, pts, tone(INK), tone(INK), tone(INK));
      } else {
        // a glint runs round it
        const glint = real * 1.3 - k / CROWN;
        tile(ink, pts, glint - Math.floor(glint) < 0.1 ? tone(INK) : tone(k % 2 ? BLUE : CYAN), tone(DEEP), tone(INK));
      }
    }
    ink.clip = null;
    ink.who = 0;
  };
  for (let k = 0; k < CROWN; k += 1) {
    const a = (k / CROWN) * Math.PI * 2 + crownTurn(play.pumpAt);
    const r = (j: number) => hash(k * 2.9 + j * 0.37 + 70);
    const speed = 80 + 70 * r(1);
    shards.push({
      t: play.pumpAt,
      life: 0.8 + 0.4 * r(2),
      x: crownAt.x + Math.cos(a) * CROWN_R,
      y: crownAt.y - Math.sin(a) * CROWN_R,
      z: crownAt.z,
      vx: Math.cos(a) * speed,
      vy: -Math.sin(a) * speed + 20,
      drag: 0.4,
      lift: -60,
      turn: a + Math.PI / 2,
      spin: (r(3) - 0.5) * 6,
      size: crownPiece,
      sides: crownSides(k),
      hue: -1,
      seed: 900 + k,
      whole: true,
    });
  }
  shards.sort((a, b) => a.t - b.t);

  // the ground splitting in lines of light from where his fists come down
  const cracks: number[][][] = [];
  for (let c = 0; c < 9; c += 1) {
    let a = (c / 9) * Math.PI * 2 + (hash(c * 1.7) - 0.5) * 0.5;
    let x = pumping.x + 3;
    let z = pumping.z;
    const line = [[x, z]];
    for (let s = 0; s < 6; s += 1) {
      a += (hash(c * 9.1 + s * 2.3) - 0.5) * 0.9;
      const step = 4 + 5 * hash(c * 3.3 + s);
      x += Math.cos(a) * step;
      // depth reads short from up here, so the splits run further in it
      z += Math.sin(a) * step * 1.6;
      line.push([x, z]);
    }
    cracks.push(line);
  }
  const fissures = (ink: Ink, v: View, t: number, real: number) => {
    if (!pump || real < pump.from || t > play.pumpAt + 1.2) return;
    const reach = ramp(real, pump.from, pump.from + 0.14);
    const level = Math.max(1, Math.round(16 * (1 - ramp(t, play.pumpAt + 0.35, play.pumpAt + 1.2))));
    ink.who = 3;
    ink.clip = behind(ink);
    for (const line of cracks) {
      const n = line.length - 1;
      const end = reach * n;
      for (let s = 0; s < n && s < end; s += 1) {
        const f = Math.min(1, end - s);
        const [x0, z0] = line[s];
        const x1 = x0 + (line[s + 1][0] - x0) * f;
        const z1 = z0 + (line[s + 1][1] - z0) * f;
        const r = Math.max(0.5, v.zoom * 0.8 * (1 - s / n));
        ink.cap(px(v, x0, z0), py(v, 0, z0), r, px(v, x1, z1), py(v, 0, z1), r * 0.75, tone(CYAN, level));
        ink.cap(px(v, x0, z0), py(v, 0, z0), r * 0.4, px(v, x1, z1), py(v, 0, z1), r * 0.3, tone(INK, level));
      }
    }
    ink.clip = null;
    ink.who = 0;
  };

  // —— the impact frames: on each big hit, for a frame or two, the strip
  // prints another way while strokes burst out of the hit, and some cut it
  // in two along a slash through the hit, printed one way either side
  const hits: { hold: typeof strike; x: number; y: number; z: number; size: number; slash: number; seed: number; frames: [number, number, number][] }[] = [
    { hold: strike, ...contactBall, size: 0.8, slash: 0.45, seed: 1, frames: [[0.042, SILHOUETTE, 0], [0.042, NEGATIVE, 0], [0.042, BLUEPRINT, SILHOUETTE]] },
    { hold: roar, ...middleOf(roaring), size: 1.1, slash: 1.1, seed: 4, frames: [[0.05, NEGATIVE, 0], [0.06, SILHOUETTE, 0]] },
  ];
  const printing = (real: number) => {
    for (const hit of hits) {
      if (!hit.hold) continue;
      let at = hit.hold.from;
      for (const [length, mode, other] of hit.frames) {
        if (real >= at && real < at + length) return { hit, mode, other };
        at += length;
      }
    }
    return null;
  };
  // thick strokes bursting out of the hit, starting clear of him
  const spikes = (ink: Ink, cx: number, cy: number, real: number, seed: number, size: number) => {
    const beat = Math.floor(real * 30);
    const n = Math.round(16 + 12 * size);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + (hash(seed * 3.1 + i * 1.7 + beat * 0.29) - 0.5) * 0.3;
      const near = (0.2 + 0.14 * hash(seed + i * 5.7 + beat)) * ink.h * size;
      const far = near + (0.3 + 0.8 * hash(seed * 1.3 + i * 2.3 + beat * 0.7)) * ink.h * size;
      ink.wedge(cx + Math.cos(a) * near, cy + Math.sin(a) * near, cx + Math.cos(a) * far, cy + Math.sin(a) * far, (3 + 8 * hash(seed + i * 4.1)) * size, tone(INK));
    }
  };

  // —— with the whole screen. Everything here goes only into the dark, so it
  // sits behind whatever is already drawn.
  type Window = { x: number; y: number; w: number; h: number };
  const dark = (ink: Ink) => (x: number, y: number) => ink.color[y * ink.w + x] === BLACK;

  // the crowd: from the goal on, cameras going off all round the ground,
  // points of white that flash and are gone, more of them as he roars
  const netReal = net ? net.from : 0;
  const flashes = (ink: Ink, win: Window, t: number, real: number) => {
    const on = ramp(t, play.netHit - 0.05, play.netHit + 0.4);
    if (on <= 0) return;
    const now = real - netReal;
    const busy = 0.35 + 0.65 * Math.max(ramp(t, gatherFrom, lockAt), 1 - ramp(t, play.netHit + 0.4, play.netHit + 1.6));
    ink.clip = dark(ink);
    for (let k = Math.max(0, Math.floor((now - 0.16) * 90)); k <= now * 90; k += 1) {
      const r = (j: number) => hash(k * 1.37 + j * 0.53 + 77);
      if (r(0) > busy * on) continue;
      const age = now - k / 90;
      if (age < 0 || age > 0.16) continue;
      const x = Math.floor(win.x + r(1) * win.w);
      const y = Math.floor(win.y + r(2) ** 1.6 * win.h * 0.55);
      const arm = Math.round((1 + 2.5 * r(3)) * (1 - age / 0.16));
      ink.put(x, y, tone(INK));
      for (let a = 1; a <= arm; a += 1) {
        const paint = tone(a === 1 ? INK : CYAN, a === 1 ? 16 : 10);
        ink.put(x + a, y, paint);
        ink.put(x - a, y, paint);
        ink.put(x, y + a, paint);
        ink.put(x, y - a, paint);
      }
    }
    ink.clip = null;
  };

  // glory: as he gets up a light comes down onto him from above, and stays
  const clickAt = time.realAt(readAt);
  const seams = (ink: Ink, win: Window, t: number, real: number, v: View) => {
    const since = real - clickAt;
    if (since < 0 || t > play.roarAt - 0.5) return;
    const cut = prepare(ink);
    const head = headOf(play.heroAt(t));
    const hx = px(v, head.x, 0);
    const hy = py(v, head.y, 0);
    const front = since * 1400;
    const fade = 1 - ramp(t, play.roarAt - 1.2, play.roarAt - 0.5);
    ink.clip = dark(ink);
    for (const c of cut.grid.cells) {
      if (c.x < win.x - cut.grid.s || c.x > win.x + win.w + cut.grid.s) continue;
      const d = Math.hypot(c.x - hx, c.y - hy);
      if (d > front) continue;
      // bright as the front passes, then settling to a faint print
      const passed = (front - d) / 1400;
      const level = Math.round((1.2 + 6 * Math.exp(-passed / 0.05) + 1.5 * Math.exp(-since / 0.5)) * fade);
      if (level < 1) continue;
      outline(ink, piece(c.x, c.y, cut.grid.s, 0, c.sides), tone(passed < 0.1 ? CYAN : BLUE, Math.min(16, level)));
    }
    ink.clip = null;
  };

  const beam = (ink: Ink, v: View, win: Window, t: number) => {
    const on = ramp(t, play.riseAt + 0.1, play.riseAt + 0.6);
    if (on <= 0) return;
    const p = play.heroAt(t);
    const cx = px(v, p.x + 2, p.z);
    const ground = py(v, 0, p.z);
    const top = win.y;
    const narrow = win.w * 0.03;
    const wide = win.w * 0.11;
    ink.clip = dark(ink);
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(ink.h, ground + 2); y += 1) {
      const u = (y - top) / Math.max(1, ground - top);
      const half = lerp(narrow, wide, u);
      const core = half * 0.18;
      for (let x = Math.max(0, Math.ceil(cx - half)); x <= Math.min(ink.w - 1, Math.floor(cx + half)); x += 1) {
        const d = Math.abs(x + 0.5 - cx);
        ink.put(x, y, d < core ? tone(INK, Math.round(on * 9)) : d > half - 1 ? tone(CYAN, Math.round(on * 12)) : tone(CYAN, Math.round(on * 4)));
      }
    }
    ring(ink, cx, ground, wide * 0.8, 1.5, tone(CYAN, Math.round(on * 12)), 0.2);
    ink.clip = null;
  };

  const frame = (ink: Ink, real: number, win: Window = { x: 0, y: 0, w: ink.w, h: ink.h }, open = 0) => {
    const t = time.story(real);
    const m = play.at(t);
    const v = camera(t, real, m.hero, m.ball, win, open);
    ink.clear();
    ink.who = 0;
    // the world, until the roar breaks it up and blows it away
    const since = roar ? real - roar.from : -9;
    const world = since < 1.5;
    const shot = shotAt(real);
    const whipping = shot === "flight" ? 1 - ramp(real, cuts.flight + 0.12, cuts.flight + 0.3) : 0;
    if (world) {
      pitch(ink, v);
      speedLines(ink, Math.max(m.speed * (open > 0 ? 0.5 : 1), whipping), real);
      goal(ink, v, m.net, false);
      afterimages(ink, v, t);
    }

    const near = Math.abs(m.ball.x - m.hero.x) < 36 && m.ball.y < 26 && t < play.contact + 0.05;
    const actors: { z: number; draw: () => void }[] = [
      {
        z: m.hero.z - 0.01,
        draw: () => {
          ink.who = 1;
          drawPlayer(ink, v, m.hero, STRIKER, near ? () => {
            ink.who = 2;
            drawBall(ink, v, m.ball);
            ink.who = 1;
          } : undefined);
          ink.who = 0;
        },
      },
    ];
    if (world) {
      actors.push(
        { z: m.d1.z, draw: () => drawPlayer(ink, v, m.d1, DEFENDER) },
        { z: m.d2.z, draw: () => drawPlayer(ink, v, m.d2, DEFENDER) },
        { z: m.keeper.z, draw: () => drawPlayer(ink, v, m.keeper, KEEPER) },
      );
      if (!near) {
        actors.push({
          z: m.ball.z,
          draw: () => {
            ink.who = 2;
            drawBall(ink, v, m.ball);
            ink.who = 0;
          },
        });
      }
    }
    actors.sort((a, b) => b.z - a.z);
    smear(ink, v, t);
    for (const actor of actors) actor.draw();
    if (world) goal(ink, v, m.net, true);
    if (world && since > -0.5) {
      const cut = prepare(ink);
      ink.clip = behind(ink);
      crumble(ink, cut.grid, cut.art, px(v, crownAt.x, crownAt.z), py(v, crownAt.y, crownAt.z), since, tone(INK));
      ink.clip = null;
    }
    if (open > 0) {
      flashes(ink, win, t, real);
      seams(ink, win, t, real, v);
      beam(ink, v, win, t);
    }
    groove(ink, v, t);
    groundRings(ink, v, real);
    fissures(ink, v, t, real);
    streak(ink, v, t);
    whip(ink, v, t);
    impact(ink, v, real);
    trail(ink, v, t);
    specks(ink, v, t);
    crown(ink, v, t, real);
    // where he is, near enough, from his bones, for the flames to look in
    const around = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [ax, ay, bx, by, z, flesh] of bones(m.hero)) {
      const r = (flesh + 6) * v.zoom;
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        around.x0 = Math.min(around.x0, Math.floor(px(v, x, z) - r));
        around.x1 = Math.max(around.x1, Math.ceil(px(v, x, z) + r));
        around.y0 = Math.min(around.y0, Math.floor(py(v, y, z) - r));
        around.y1 = Math.max(around.y1, Math.ceil(py(v, y, z) + r));
      }
    }
    rim(ink, around, m.aura > 0.3 || (t > play.flickAt - 0.1 && t < play.contact + 0.3));
    aura(ink, m.aura, real, v.zoom, around);
    pieces(ink, v, t, real);
    figuring(ink, v, t);
    const head = headOf(m.hero);
    // the lines that stare at him stop short of him: well clear in the strip,
    // closer in once he fills the screen
    const stare = lerp(1.2, 0.5, open);
    focusLines(ink, px(v, head.x, m.hero.z), py(v, head.y, m.hero.z), m.focus, real, stare * v.h, stare * 0.48 * v.h);

    let mode = 0;
    let split: Split | null = null;
    const now = printing(real);
    if (now) {
      const cx = px(v, now.hit.x, now.hit.z);
      const cy = py(v, now.hit.y, now.hit.z);
      spikes(ink, cx, cy, real, now.hit.seed, now.hit.size);
      mode = now.mode;
      if (now.other) split = { x: cx, y: cy, dx: Math.cos(now.hit.slash), dy: Math.sin(now.hit.slash), mode: now.other };
    }
    const shown = Math.min(ramp(real, 0, FADE_IN), 1 - ramp(real, time.duration, time.duration + FADE_OUT));
    return { mode, shown, split, tilt: v.tilt ?? 0 };
  };

  // with reduced motion, one still: him at the top of the backswing, the
  // flow coming off him
  const still = backswing.from + 0.05;

  return { play, time, loop, frame, still, openAt, stageAt: (real: number) => stageAt(time.story(real)) * openAt(real), prepare };
}
