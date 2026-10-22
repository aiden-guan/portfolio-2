import { snip, tap, unlockSound } from "@/lib/riffle";
import type { Surface } from "@/lib/wear";

// A clothesline strung across the mat, with the latest photos pegged on it.
// The line is a cord of particles (Verlet, solved as constraints) tied to a
// screw eye at each end; each photo is a stiff card of four corners, held to
// the cord by two pegs. Everything is weighed and swings as it would.
//
// The knife cuts the cord wherever it's drawn across it, and the torch burns
// through it. A cut cord drops away from where it was cut and hangs off its
// screw eye, and the pegs on it, no longer held level, slide down it and off
// the frayed end; a photo held by one peg swings round on it before it goes.
// What comes off flutters down onto the mat, the way a print falls. A photo
// can be tugged by hand, and pulled hard enough it comes off its pegs. Tidy
// strings the line again and pegs everything back up.
//
// The cord is only worked on while something on it moves and while it's in
// the window; at rest it costs nothing.

export const LINE_MESS_EVENT = "aiden-line-mess";

type LineHooks = {
  blade(id: number, x: number, y: number): void;
  lift(): void;
  heat(x: number, y: number, radius: number, power: number, dt: number): void;
};

const lines = new Set<LineHooks>();

// The surface the knife and torch work on, with the clotheslines on it too.
export function withLines(surface: Surface): Surface {
  return {
    ...surface,
    blade(id, x, y) {
      for (const line of lines) line.blade(id, x, y);
      return surface.blade(id, x, y);
    },
    lift() {
      for (const line of lines) line.lift();
      surface.lift();
    },
    heat(x, y, radius, power, dt) {
      for (const line of lines) line.heat(x, y, radius, power, dt);
      return surface.heat(x, y, radius, power, dt);
    },
  };
}

type Rope = {
  // its particles are first..first+n-1 in the pool
  first: number;
  n: number;
  // the length of each of its segments at rest
  rest: number;
  alive: Uint8Array;
  burn: Float32Array;
  // which run of whole cord each segment is in, and whether that run is
  // still tied at both ends
  run: Int16Array;
  taut: boolean[];
  // where a run came loose of both screw eyes, and when
  loose: { from: number; to: number; at: number; done: boolean }[];
};

type Peg = {
  u: number;
  rope: number;
  // the segment it's on, and how far along it
  k: number;
  f: number;
  on: boolean;
  slide: number;
};

type Mode = "hung" | "held" | "falling" | "landed" | "home";

type Photo = {
  el: HTMLElement;
  // corners in the pool: top left, top right, bottom right, bottom left
  first: number;
  pegs: Peg[];
  mode: Mode;
  // the pose, for when it's not on the line: centre, turn, and how far it is
  // off the mat
  cx: number;
  cy: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  height: number;
  land: number;
  phase: number;
  // a hand on it, in its own frame
  gx: number;
  gy: number;
  // for coming home
  from: { cx: number; cy: number; a: number; height: number } | null;
  written: string;
};

const SUBSTEP = 1 / 120;
const ITERATIONS = 20;
// px per second squared: brisker than the mat's own scale would make it
const G = 2600;
const DAMP = 0.992;
const AIR = 0.985;
const HOME_MS = 700;
const FADE_MS = 650;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function mountLine(stage: HTMLElement) {
  const mat = stage.closest<HTMLElement>(".mat");
  const svg = stage.querySelector<SVGSVGElement>(".line-cord");
  const cord = svg?.querySelector<SVGPathElement>(".line-cord-rope");
  const twist = svg?.querySelector<SVGPathElement>(".line-cord-twist");
  const shade = svg?.querySelector<SVGPathElement>(".line-cord-shadow");
  const fray = svg?.querySelector<SVGPathElement>(".line-cord-fray");
  const loosePath = svg?.querySelector<SVGPathElement>(".line-cord-loose");
  const els = [...stage.querySelectorAll<HTMLElement>(".line-photo")];
  const eyes = stage.querySelector<HTMLElement>(".line-eyes");
  if (!mat || !svg || !cord || !twist || !shade || !fray || !loosePath || !eyes) return { tidy() {}, unmount() {} };
  const html = document.documentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the pool of particles
  let X = new Float64Array(0);
  let Y = new Float64Array(0);
  let PX = new Float64Array(0);
  let PY = new Float64Array(0);
  let INV = new Float64Array(0);

  let ropes: Rope[] = [];
  let photos: Photo[] = [];
  let width = 0;
  let mm = 4;
  let pw = 0;
  let ph = 0;
  // where the stage sits on the mat
  let offX = 0;
  let offY = 0;
  let offAt = -1;

  let raf = 0;
  let last = 0;
  let acc = 0;
  let calm = 0;
  let visible = false;
  let started = false;
  let messy = false;
  let homing = 0;

  // the knife, by stroke
  let stroke = -1;
  let bladeX = 0;
  let bladeY = 0;

  let grab: { photo: Photo; id: number; x: number; y: number; moved: boolean } | null = null;
  let swallow = false;

  // ---- laying it out

  function layout() {
    width = stage.clientWidth;
    // a ruler a hundred millimetres long says how big a millimetre is
    mm = (stage.querySelector<HTMLElement>(".line-mm")?.offsetWidth ?? 400) / 100 || 4;
    const probe = els[0];
    pw = probe?.offsetWidth || mm * 46;
    ph = probe?.offsetHeight || mm * 60;
    const inset = mm * 5;
    const span = width - inset * 2;
    const perRow = Math.max(1, Math.floor(span / (pw * 1.18)));
    const rows = Math.max(1, Math.ceil(els.length / perRow));
    const each = Math.ceil(els.length / rows);
    const rowHeight = ph + mm * 30;
    const top = mm * 8;
    stage.style.setProperty("--line-height", `${rows * rowHeight + mm * 6}px`);

    // a particle every so often along each cord, and four to each photo
    const spacing = Math.max(mm * 7, 22);
    const per = Math.max(12, Math.round(span / spacing) + 1);
    const total = rows * per + els.length * 4;
    X = new Float64Array(total);
    Y = new Float64Array(total);
    PX = new Float64Array(total);
    PY = new Float64Array(total);
    INV = new Float64Array(total);

    ropes = [];
    for (let r = 0; r < rows; r++) {
      const first = r * per;
      const y = top + r * rowHeight;
      for (let i = 0; i < per; i++) {
        const p = first + i;
        X[p] = inset + (span * i) / (per - 1);
        Y[p] = y;
        INV[p] = i === 0 || i === per - 1 ? 0 : 1;
      }
      ropes.push({
        first,
        n: per,
        // a little longer than the gap, so it sags
        rest: (span * 1.012) / (per - 1),
        alive: new Uint8Array(per - 1).fill(1),
        burn: new Float32Array(per - 1),
        run: new Int16Array(per - 1),
        taut: [true],
        loose: [],
      });
    }
    // a screw eye in the mat at each end of each line
    eyes!.replaceChildren(
      ...ropes.flatMap((rope) =>
        [0, rope.n - 1].map((i) => {
          const eye = document.createElement("span");
          eye.className = "line-eye";
          eye.dataset.end = i === 0 ? "start" : "end";
          eye.style.transform = `translate3d(${X[rope.first + i]!.toFixed(1)}px, ${Y[rope.first + i]!.toFixed(1)}px, 0)`;
          return eye;
        }),
      ),
    );

    photos = els.map((el, i) => {
      const r = Math.floor(i / each);
      const slot = i - r * each;
      const inRow = Math.min(each, els.length - r * each);
      const rope = ropes[r]!;
      const gap = span / inRow;
      const cx = inset + gap * (slot + 0.5) + (((i * 37) % 9) - 4) * mm * 0.6;
      const y = Y[rope.first]!;
      const first = rows * per + i * 4;
      const corners = [
        [cx - pw / 2, y],
        [cx + pw / 2, y],
        [cx + pw / 2, y + ph],
        [cx - pw / 2, y + ph],
      ];
      corners.forEach(([x, cy], c) => {
        X[first + c] = x!;
        Y[first + c] = cy!;
        INV[first + c] = 0.6;
      });
      const pegs = [0.17, 0.83].map((u) => {
        const x = cx - pw / 2 + pw * u;
        const along = ((x - inset) / span) * (rope.n - 1);
        const k = Math.min(rope.n - 2, Math.max(0, Math.floor(along)));
        return { u, rope: r, k, f: along - k, on: true, slide: 0 };
      });
      el.dataset.peg = "2";
      delete el.dataset.mode;
      return {
        el,
        first,
        pegs,
        mode: "hung" as Mode,
        cx,
        cy: y + ph / 2,
        a: 0,
        vx: 0,
        vy: 0,
        va: 0,
        height: 1,
        land: 0,
        phase: i * 1.7,
        gx: 0,
        gy: 0,
        from: null,
        written: "",
      };
    });
    PX.set(X);
    PY.set(Y);
    for (const rope of ropes) runs(rope);
    offAt = -1;
    stage.dataset.live = "";
    if (still) for (let s = 0; s < 360; s++) step(SUBSTEP);
    setMess(false);
    draw(performance.now());
  }

  // ---- the physics

  function step(dt: number) {
    const g = G * dt * dt;
    for (let p = 0; p < X.length; p++) {
      if (INV[p] === 0) continue;
      const vx = (X[p]! - PX[p]!) * DAMP;
      const vy = (Y[p]! - PY[p]!) * DAMP;
      PX[p] = X[p]!;
      PY[p] = Y[p]!;
      X[p] = X[p]! + vx;
      Y[p] = Y[p]! + vy + g;
    }
    for (const photo of photos) {
      if (photo.mode !== "hung" && photo.mode !== "held") continue;
      // the air holds a card back more than a cord
      for (let c = 0; c < 4; c++) {
        const p = photo.first + c;
        X[p] = PX[p]! + (X[p]! - PX[p]!) * AIR;
        Y[p] = PY[p]! + (Y[p]! - PY[p]!) * AIR;
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (const rope of ropes) {
        for (let k = 0; k < rope.n - 1; k++) {
          if (rope.alive[k]) stretch(rope.first + k, rope.first + k + 1, rope.rest);
        }
      }
      for (const photo of photos) {
        if (photo.mode !== "hung" && photo.mode !== "held") continue;
        card(photo.first);
        for (const peg of photo.pegs) if (peg.on) hold(photo, peg);
        if (photo.mode === "held" && grab) pull(photo, grab.x, grab.y);
      }
    }
  }

  // a cord gives no resistance to being pushed together, only to being pulled
  function stretch(i: number, j: number, rest: number) {
    const dx = X[j]! - X[i]!;
    const dy = Y[j]! - Y[i]!;
    const d = Math.hypot(dx, dy);
    if (d <= rest || d === 0) return;
    const w = INV[i]! + INV[j]!;
    if (w === 0) return;
    const s = (d - rest) / d / w;
    X[i] = X[i]! + dx * s * INV[i]!;
    Y[i] = Y[i]! + dy * s * INV[i]!;
    X[j] = X[j]! - dx * s * INV[j]!;
    Y[j] = Y[j]! - dy * s * INV[j]!;
  }

  // A photo is a stiff card: its corners are put back into its shape, turned
  // however best fits where they've been pushed (which can't turn it inside
  // out, as four corners held by their edges alone can).
  const shapeX = [-0.5, 0.5, 0.5, -0.5];
  const shapeY = [-0.5, -0.5, 0.5, 0.5];
  function card(f: number) {
    const cx = (X[f]! + X[f + 1]! + X[f + 2]! + X[f + 3]!) / 4;
    const cy = (Y[f]! + Y[f + 1]! + Y[f + 2]! + Y[f + 3]!) / 4;
    let dot = 0;
    let cross = 0;
    for (let c = 0; c < 4; c++) {
      const rx = shapeX[c]! * pw;
      const ry = shapeY[c]! * ph;
      const qx = X[f + c]! - cx;
      const qy = Y[f + c]! - cy;
      dot += rx * qx + ry * qy;
      cross += rx * qy - ry * qx;
    }
    const a = Math.atan2(cross, dot);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let c = 0; c < 4; c++) {
      const rx = shapeX[c]! * pw;
      const ry = shapeY[c]! * ph;
      X[f + c] = cx + rx * cos - ry * sin;
      Y[f + c] = cy + rx * sin + ry * cos;
    }
  }

  // Moves a set of weighted points so the sum of them lands on (tx, ty).
  function meet(points: number[], coefs: number[], tx: number, ty: number, stiffness: number) {
    let x = 0;
    let y = 0;
    let w = 0;
    for (let i = 0; i < points.length; i++) {
      x += X[points[i]!]! * coefs[i]!;
      y += Y[points[i]!]! * coefs[i]!;
      w += coefs[i]! * coefs[i]! * INV[points[i]!]!;
    }
    if (w === 0) return;
    const lx = ((tx - x) / w) * stiffness;
    const ly = ((ty - y) / w) * stiffness;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      X[p] = X[p]! + coefs[i]! * INV[p]! * lx;
      Y[p] = Y[p]! + coefs[i]! * INV[p]! * ly;
    }
  }

  // A peg: where it pinches the card's top edge is where it pinches the cord.
  const pegPoints = [0, 0, 0, 0];
  const pegCoefs = [0, 0, 0, 0];
  function hold(photo: Photo, peg: Peg) {
    const rope = ropes[peg.rope]!;
    const a = rope.first + peg.k;
    pegPoints[0] = photo.first;
    pegPoints[1] = photo.first + 1;
    pegPoints[2] = a;
    pegPoints[3] = a + 1;
    pegCoefs[0] = 1 - peg.u;
    pegCoefs[1] = peg.u;
    pegCoefs[2] = -(1 - peg.f);
    pegCoefs[3] = -peg.f;
    meet(pegPoints, pegCoefs, 0, 0, 1);
  }

  function pegGap(photo: Photo, peg: Peg) {
    const rope = ropes[peg.rope]!;
    const a = rope.first + peg.k;
    const qx = X[photo.first]! * (1 - peg.u) + X[photo.first + 1]! * peg.u;
    const qy = Y[photo.first]! * (1 - peg.u) + Y[photo.first + 1]! * peg.u;
    const rx = X[a]! * (1 - peg.f) + X[a + 1]! * peg.f;
    const ry = Y[a]! * (1 - peg.f) + Y[a + 1]! * peg.f;
    return Math.hypot(qx - rx, qy - ry);
  }

  // The hand: the point of the card it holds is drawn after the pointer.
  const cornerPoints = [0, 0, 0, 0];
  const cornerCoefs = [0, 0, 0, 0];
  function pull(photo: Photo, tx: number, ty: number) {
    const s = photo.gx / pw;
    const t = photo.gy / ph;
    for (let c = 0; c < 4; c++) cornerPoints[c] = photo.first + c;
    cornerCoefs[0] = (1 - s) * (1 - t);
    cornerCoefs[1] = s * (1 - t);
    cornerCoefs[2] = s * t;
    cornerCoefs[3] = (1 - s) * t;
    meet(cornerPoints, cornerCoefs, tx, ty, 0.35);
  }

  // Which stretches of cord are whole, and which of them are still tied at
  // both ends. A stretch tied at neither end falls away.
  function runs(rope: Rope) {
    let id = -1;
    let open = false;
    const taut: boolean[] = [];
    const tiedStart: boolean[] = [];
    for (let k = 0; k < rope.n - 1; k++) {
      if (!rope.alive[k]) {
        rope.run[k] = -1;
        open = false;
        continue;
      }
      if (!open) {
        id++;
        open = true;
        tiedStart[id] = k === 0;
      }
      rope.run[k] = id;
      taut[id] = tiedStart[id]! && k === rope.n - 2;
    }
    rope.taut = taut;
    const now = performance.now();
    for (let r = 0; r <= id; r++) {
      let from = -1;
      let to = -1;
      for (let k = 0; k < rope.n - 1; k++) {
        if (rope.run[k] !== r) continue;
        if (from < 0) from = k;
        to = k;
      }
      const tied = from === 0 || to === rope.n - 2;
      if (tied || rope.loose.some((l) => l.from === from)) continue;
      rope.loose.push({ from, to, at: now, done: false });
    }
  }

  function looseAt(rope: Rope, k: number) {
    return rope.loose.some((l) => k >= l.from && k <= l.to);
  }

  function sever(rope: Rope, k: number) {
    if (!rope.alive[k]) return;
    rope.alive[k] = 0;
    const r = ropes.indexOf(rope);
    // the cord springs apart a little where it's cut, as cord under load does
    const a = rope.first + k;
    const dx = X[a + 1]! - X[a]!;
    const dy = Y[a + 1]! - Y[a]!;
    const d = Math.hypot(dx, dy) || 1;
    PX[a] = PX[a]! + (dx / d) * 1.5;
    PY[a] = PY[a]! + (dy / d) * 1.5;
    PX[a + 1] = PX[a + 1]! - (dx / d) * 1.5;
    PY[a + 1] = PY[a + 1]! - (dy / d) * 1.5;
    runs(rope);
    for (const photo of photos) {
      for (const peg of photo.pegs) {
        if (!peg.on || peg.rope !== r) continue;
        if (peg.k === k) {
          // a peg right where it was cut is left on whichever end it's nearer
          if (peg.f < 0.5 && k > 0 && rope.alive[k - 1]) {
            peg.k = k - 1;
            peg.f = 1;
          } else if (peg.f >= 0.5 && k < rope.n - 2 && rope.alive[k + 1]) {
            peg.k = k + 1;
            peg.f = 0;
          } else peg.on = false;
        }
        if (peg.on && looseAt(rope, peg.k)) peg.on = false;
      }
      settle(photo);
    }
    snip();
    setMess(true);
    wake();
  }

  // A photo with no peg left on the cord comes off it.
  function settle(photo: Photo) {
    const held = photo.pegs.filter((peg) => peg.on).length;
    if (photo.mode === "hung" || photo.mode === "held") photo.el.dataset.peg = String(held);
    if (held > 0 || photo.mode !== "hung") return;
    letGo(photo);
  }

  function letGo(photo: Photo) {
    const f = photo.first;
    const cx = (X[f]! + X[f + 1]! + X[f + 2]! + X[f + 3]!) / 4;
    const cy = (Y[f]! + Y[f + 1]! + Y[f + 2]! + Y[f + 3]!) / 4;
    const pcx = (PX[f]! + PX[f + 1]! + PX[f + 2]! + PX[f + 3]!) / 4;
    const pcy = (PY[f]! + PY[f + 1]! + PY[f + 2]! + PY[f + 3]!) / 4;
    const a = Math.atan2(Y[f + 1]! - Y[f]!, X[f + 1]! - X[f]!);
    const pa = Math.atan2(PY[f + 1]! - PY[f]!, PX[f + 1]! - PX[f]!);
    photo.cx = cx;
    photo.cy = cy;
    photo.a = a;
    photo.vx = (cx - pcx) / SUBSTEP;
    photo.vy = (cy - pcy) / SUBSTEP;
    photo.va = (a - pa) / SUBSTEP;
    photo.height = 1;
    // it lands on the mat a little below where it let go
    photo.land = Math.min(cy + ph * (0.35 + Math.random() * 0.4), stage.clientHeight - ph * 0.42);
    photo.mode = "falling";
    photo.el.dataset.mode = "falling";
    photo.el.dataset.peg = "0";
    for (let c = 0; c < 4; c++) {
      INV[f + c] = 0;
      PX[f + c] = X[f + c]!;
      PY[f + c] = Y[f + c]!;
    }
    setMess(true);
  }

  // Pegs on a cord that's hanging off one end slide down it, and off.
  function slip(dt: number) {
    for (const photo of photos) {
      if (photo.mode !== "hung" && photo.mode !== "held") continue;
      let changed = false;
      for (const peg of photo.pegs) {
        if (!peg.on) continue;
        // pulled too far from the cord, it lets go of the card
        if (pegGap(photo, peg) > mm * (photo.mode === "held" ? 7 : 12)) {
          peg.on = false;
          changed = true;
          tap(0.35);
          continue;
        }
        const rope = ropes[peg.rope]!;
        const run = rope.run[peg.k]!;
        if (run < 0 || rope.taut[run]) {
          peg.slide = 0;
          continue;
        }
        const a = rope.first + peg.k;
        const dx = X[a + 1]! - X[a]!;
        const dy = Y[a + 1]! - Y[a]!;
        const d = Math.hypot(dx, dy) || 1;
        const steep = Math.abs(dy) / d;
        const dir = dy > 0 ? 1 : -1;
        if (steep > 0.4) peg.slide += G * (steep - 0.35) * 0.45 * dt;
        else peg.slide *= 0.85;
        if (peg.slide < 1) continue;
        peg.f += (dir * peg.slide * dt) / Math.max(1, d);
        while (peg.on && (peg.f > 1 || peg.f < 0)) {
          const next = peg.f > 1 ? peg.k + 1 : peg.k - 1;
          if (next < 0 || next > rope.n - 2 || !rope.alive[next]) {
            // off the end
            peg.on = false;
            changed = true;
            break;
          }
          peg.f += peg.f > 1 ? -1 : 1;
          peg.k = next;
        }
      }
      if (changed) settle(photo);
    }
  }

  // Off the line: a print falling flutters, side to side and turning, and
  // lands flat on the mat with a little skid.
  function fall(photo: Photo, dt: number, now: number) {
    if (photo.mode === "falling") {
      photo.phase += dt * 5.2;
      photo.vy += G * 0.55 * dt;
      photo.vy *= 1 - Math.min(0.5, dt * 2.4);
      photo.vx += Math.sin(photo.phase) * 520 * dt;
      photo.vx *= 1 - Math.min(0.5, dt * 1.8);
      photo.va += Math.cos(photo.phase) * 5 * dt;
      photo.va *= 1 - Math.min(0.5, dt * 2.6);
      photo.cx += photo.vx * dt;
      photo.cy += photo.vy * dt;
      photo.a += photo.va * dt;
      const left = photo.land - photo.cy;
      photo.height = Math.max(0, Math.min(1, left / (ph * 0.5)));
      if (left <= 0) {
        photo.cy = photo.land;
        photo.height = 0;
        photo.vy = 0;
        photo.vx *= 0.5;
        photo.va *= 0.4;
        photo.mode = "landed";
        photo.el.dataset.mode = "landed";
        tap(0.3);
      }
    } else if (photo.mode === "landed") {
      // skids to a stop on the mat
      photo.vx *= 1 - Math.min(1, dt * 7);
      photo.va *= 1 - Math.min(1, dt * 7);
      photo.cx += photo.vx * dt;
      photo.a += photo.va * dt;
      const room = pw * 0.4;
      photo.cx = Math.min(width - room, Math.max(room, photo.cx));
    } else if (photo.mode === "home" && photo.from) {
      const t = Math.min(1, (now - homing) / HOME_MS);
      const e = easeOut(t);
      const f = photo.first;
      const tx = (X[f]! + X[f + 1]! + X[f + 2]! + X[f + 3]!) / 4;
      const ty = (Y[f]! + Y[f + 1]! + Y[f + 2]! + Y[f + 3]!) / 4;
      photo.cx = photo.from.cx + (tx - photo.from.cx) * e;
      photo.cy = photo.from.cy + (ty - photo.from.cy) * e;
      photo.a = photo.from.a * (1 - e);
      photo.height = photo.from.height + (1 - photo.from.height) * e;
    }
  }

  // ---- drawing

  function draw(now: number) {
    let main = "";
    let loose = "";
    let frays = "";
    let fade = 1;
    for (const rope of ropes) {
      let k = 0;
      while (k < rope.n - 1) {
        if (!rope.alive[k]) {
          k++;
          continue;
        }
        const from = k;
        while (k < rope.n - 1 && rope.alive[k]) k++;
        const to = k;
        const gone = rope.loose.find((l) => l.from === from);
        const path = curve(rope.first + from, rope.first + to);
        if (gone) {
          const t = (now - gone.at) / FADE_MS;
          if (t < 1) {
            loose += path;
            fade = Math.min(fade, 1 - t);
          }
        } else main += path;
        if (!gone) {
          if (from !== 0) frays += frayAt(rope.first + from, rope.first + from + 1);
          if (to !== rope.n - 1) frays += frayAt(rope.first + to, rope.first + to - 1);
        }
      }
    }
    cord!.setAttribute("d", main);
    twist!.setAttribute("d", main);
    shade!.setAttribute("d", main);
    fray!.setAttribute("d", frays);
    loosePath!.setAttribute("d", loose);
    loosePath!.style.opacity = loose ? fade.toFixed(3) : "0";

    for (const photo of photos) {
      let cx: number;
      let cy: number;
      let a: number;
      let height: number;
      if (photo.mode === "hung" || photo.mode === "held") {
        const f = photo.first;
        cx = (X[f]! + X[f + 1]! + X[f + 2]! + X[f + 3]!) / 4;
        cy = (Y[f]! + Y[f + 1]! + Y[f + 2]! + Y[f + 3]!) / 4;
        a = Math.atan2(Y[f + 1]! - Y[f]!, X[f + 1]! - X[f]!);
        height = 1;
      } else {
        cx = photo.cx;
        cy = photo.cy;
        a = photo.a;
        height = photo.height;
      }
      // further off the mat, it's a touch nearer and bigger
      const scale = 0.94 + 0.06 * height;
      const transform = `translate3d(${(cx - pw / 2).toFixed(2)}px, ${(cy - ph / 2).toFixed(2)}px, 0) rotate(${a.toFixed(4)}rad) scale(${scale.toFixed(4)})`;
      if (transform !== photo.written) {
        photo.el.style.transform = transform;
        photo.written = transform;
      }
    }
  }

  // a smooth line through the particles from i to j
  function curve(i: number, j: number) {
    let d = `M${X[i]!.toFixed(1)} ${Y[i]!.toFixed(1)}`;
    for (let p = i + 1; p < j; p++) {
      const mx = (X[p]! + X[p + 1]!) / 2;
      const my = (Y[p]! + Y[p + 1]!) / 2;
      d += `Q${X[p]!.toFixed(1)} ${Y[p]!.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    d += `L${X[j]!.toFixed(1)} ${Y[j]!.toFixed(1)}`;
    return d;
  }

  // where it's been cut the cord's strands come apart
  function frayAt(end: number, inner: number) {
    const dx = X[end]! - X[inner]!;
    const dy = Y[end]! - Y[inner]!;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const len = mm * 1.7;
    let out = "";
    for (const turn of [-0.55, -0.12, 0.38]) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const ex = X[end]! + (ux * c - uy * s) * len * (1 - Math.abs(turn) * 0.4);
      const ey = Y[end]! + (ux * s + uy * c) * len * (1 - Math.abs(turn) * 0.4);
      out += `M${X[end]!.toFixed(1)} ${Y[end]!.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }
    return out;
  }

  // ---- running

  function frame(now: number) {
    raf = 0;
    if (!visible) return;
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += elapsed;
    let before = 0;
    for (let p = 0; p < X.length; p++) before += Math.abs(X[p]! - PX[p]!) + Math.abs(Y[p]! - PY[p]!);
    const homingNow = homing > 0;
    if (!homingNow) {
      while (acc >= SUBSTEP) {
        step(SUBSTEP);
        acc -= SUBSTEP;
      }
      slip(elapsed);
    } else acc = 0;
    let busy = grab !== null;
    for (const photo of photos) {
      if (photo.mode === "falling" || photo.mode === "home") busy = true;
      if (photo.mode === "landed" && (Math.abs(photo.vx) > 1 || Math.abs(photo.va) > 0.01)) busy = true;
      fall(photo, elapsed, now);
    }
    for (const rope of ropes) {
      for (const l of rope.loose) {
        if (l.done) continue;
        if (now - l.at < FADE_MS) {
          busy = true;
          continue;
        }
        // gone: it's no longer worked on
        l.done = true;
        for (let p = rope.first + l.from; p <= rope.first + l.to + 1; p++) {
          INV[p] = 0;
          PX[p] = X[p]!;
          PY[p] = Y[p]!;
        }
      }
    }
    if (homingNow && now - homing >= HOME_MS) {
      homing = 0;
      for (const photo of photos) {
        photo.mode = "hung";
        photo.from = null;
        delete photo.el.dataset.mode;
        photo.el.dataset.peg = "2";
        for (let c = 0; c < 4; c++) INV[photo.first + c] = 0.6;
      }
      PX.set(X);
      PY.set(Y);
    }
    draw(now);
    // at rest, it stops
    if (!busy && before < 0.05 * Math.max(1, X.length / 20)) calm++;
    else calm = 0;
    if (calm < 40) raf = requestAnimationFrame(frame);
  }

  function wake() {
    calm = 0;
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function setMess(now: boolean) {
    if (now === messy) return;
    messy = now;
    window.dispatchEvent(new CustomEvent(LINE_MESS_EVENT, { detail: messy }));
  }

  // Tidy: the line strung again, and everything that came off it pegged back.
  function rehang() {
    if (!messy) return;
    const poses = photos.map((photo) => {
      if (photo.mode === "hung" || photo.mode === "held") {
        const f = photo.first;
        return {
          cx: (X[f]! + X[f + 1]! + X[f + 2]! + X[f + 3]!) / 4,
          cy: (Y[f]! + Y[f + 1]! + Y[f + 2]! + Y[f + 3]!) / 4,
          a: Math.atan2(Y[f + 1]! - Y[f]!, X[f + 1]! - X[f]!),
          height: 1,
        };
      }
      return { cx: photo.cx, cy: photo.cy, a: photo.a, height: photo.height };
    });
    grab = null;
    layout();
    if (!still) for (let s = 0; s < 200; s++) step(SUBSTEP);
    PX.set(X);
    PY.set(Y);
    photos.forEach((photo, i) => {
      photo.from = poses[i]!;
      photo.mode = "home";
      photo.el.dataset.mode = "home";
    });
    homing = performance.now();
    tap(0.4);
    wake();
  }

  // ---- input

  function local(clientX: number, clientY: number) {
    const box = stage.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  }

  // where the stage is on the mat, which only a resize changes
  function offset() {
    if (offAt === width) return;
    const a = stage.getBoundingClientRect();
    const b = mat!.getBoundingClientRect();
    offX = a.left - b.left;
    offY = a.top - b.top;
    offAt = width;
  }

  function near(x: number, y: number, margin: number) {
    return x > -margin && x < width + margin && y > -margin && y < stage.clientHeight + margin;
  }

  const hooks: LineHooks = {
    blade(id, mx, my) {
      offset();
      const x = mx - offX;
      const y = my - offY;
      if (id !== stroke) {
        stroke = id;
        bladeX = x;
        bladeY = y;
        return;
      }
      const fromX = bladeX;
      const fromY = bladeY;
      bladeX = x;
      bladeY = y;
      if (!near(x, y, 20) || homing) return;
      for (const rope of ropes) {
        for (let k = 0; k < rope.n - 1; k++) {
          if (!rope.alive[k] || looseAt(rope, k)) continue;
          const a = rope.first + k;
          if (crosses(fromX, fromY, x, y, X[a]!, Y[a]!, X[a + 1]!, Y[a + 1]!)) sever(rope, k);
        }
      }
    },
    lift() {
      stroke = -1;
    },
    heat(mx, my, radius, power, dt) {
      offset();
      const x = mx - offX;
      const y = my - offY;
      if (!near(x, y, radius) || homing) return;
      const reach = radius * 0.8;
      for (const rope of ropes) {
        for (let k = 0; k < rope.n - 1; k++) {
          if (!rope.alive[k]) continue;
          const a = rope.first + k;
          const d = toSegment(x, y, X[a]!, Y[a]!, X[a + 1]!, Y[a + 1]!);
          if (d > reach) continue;
          rope.burn[k] = rope.burn[k]! + power * dt * (1 - d / reach) * 1.6;
          if (rope.burn[k]! >= 1) sever(rope, k);
        }
      }
    },
  };

  function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + dx * t - x, ay + dy * t - y);
  }

  // whether segment p0-p1 crosses q0-q1
  function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button > 0 || event.pointerType === "touch" || html.dataset.tool || homing) return;
    const el = event.target instanceof Element ? event.target.closest<HTMLElement>(".line-photo") : null;
    const photo = photos.find((p) => p.el === el);
    if (!photo || (photo.mode !== "hung" && photo.mode !== "landed")) return;
    unlockSound();
    const p = local(event.clientX, event.clientY);
    grab = { photo, id: event.pointerId, x: p.x, y: p.y, moved: false };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (grab && grab.id === event.pointerId) {
      const p = local(event.clientX, event.clientY);
      if (!grab.moved) {
        if (Math.hypot(p.x - grab.x, p.y - grab.y) < 5) return;
        grab.moved = true;
        begin(grab.photo, grab.x, grab.y);
      }
      grab.x = p.x;
      grab.y = p.y;
      if (grab.photo.mode === "landed") {
        grab.photo.vx = (p.x - grab.photo.cx) * 12;
        grab.photo.cx = p.x;
        grab.photo.cy = Math.min(stage.clientHeight - ph * 0.42, p.y);
        grab.photo.land = grab.photo.cy;
      }
      wake();
      return;
    }
    // a hand passing over the line brushes it
    if (!visible || event.pointerType === "touch" || event.buttons || still || homing) return;
    const p = local(event.clientX, event.clientY);
    if (!near(p.x, p.y, 0)) return;
    const vx = event.movementX || 0;
    const vy = event.movementY || 0;
    if (Math.abs(vx) + Math.abs(vy) < 1) return;
    let touched = false;
    for (const rope of ropes) {
      for (let i = 1; i < rope.n - 1; i++) {
        const q = rope.first + i;
        const d = Math.hypot(X[q]! - p.x, Y[q]! - p.y);
        if (d > mm * 3.2 || INV[q] === 0) continue;
        PX[q] = PX[q]! - vx * 0.25;
        PY[q] = PY[q]! - vy * 0.25;
        touched = true;
      }
    }
    if (touched) wake();
  };

  function begin(photo: Photo, x: number, y: number) {
    if (photo.mode === "hung") {
      // where the hand took hold, in the card's own frame
      const f = photo.first;
      const ux = (X[f + 1]! - X[f]!) / pw;
      const uy = (Y[f + 1]! - Y[f]!) / pw;
      const dx = x - X[f]!;
      const dy = y - Y[f]!;
      photo.gx = Math.min(pw, Math.max(0, dx * ux + dy * uy));
      photo.gy = Math.min(ph, Math.max(0, -dx * uy + dy * ux));
      photo.mode = "held";
    }
    photo.el.dataset.held = "";
    html.dataset.holding = "true";
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!grab || grab.id !== event.pointerId) return;
    const { photo, moved } = grab;
    grab = null;
    delete photo.el.dataset.held;
    delete html.dataset.holding;
    if (!moved) return;
    swallow = true;
    window.setTimeout(() => (swallow = false), 0);
    if (photo.mode === "held") {
      photo.mode = "hung";
      // let go of with no peg on it, it falls
      if (!photo.pegs.some((peg) => peg.on)) letGo(photo);
    }
    if (photo.mode === "landed") setMess(true);
    wake();
  };

  // A tug ends in a click on the photo; that click isn't one.
  const onClick = (event: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onResize = () => {
    if (stage.clientWidth === width) return;
    layout();
    wake();
  };

  const onTidy = () => rehang();

  const seen = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (!visible) return;
      if (!started) {
        started = true;
        // just hung: the cord takes their weight
        if (!still) wake();
        return;
      }
      wake();
    },
    { rootMargin: "120px 0px" },
  );

  layout();
  lines.add(hooks);
  seen.observe(stage);
  const sizes = new ResizeObserver(onResize);
  sizes.observe(stage);
  stage.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("click", onClick, { capture: true });

  return {
    tidy: onTidy,
    unmount() {
      cancelAnimationFrame(raf);
      lines.delete(hooks);
      seen.disconnect();
      sizes.disconnect();
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      stage.removeEventListener("click", onClick, { capture: true });
      delete stage.dataset.live;
      setMess(false);
    },
  };
}
