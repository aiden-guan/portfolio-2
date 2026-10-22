import { nick, score, slice, unlockSound } from "@/lib/riffle";
import type { Surface } from "@/lib/wear";

// The mat heals. A knife drawn across the bare mat parts its top layer in a
// hairline, which stays open a moment, then closes up behind the blade from
// where the cut began, like a zip, and leaves a faint line that fades. A
// click is a stab: a short slit that does the same. Shift keeps the blade on
// a straight edge, square or at 45°. On a touch screen the mat is held for a
// moment before it cuts, so a finger can still scroll it. Once a visit, the
// knife shows how by underlining the hint that says to cut the mat.
//
// The cut is drawn as the light finds it: a dark slit, its far wall catching
// the light (more so the more squarely the cut faces it), wedged wider just
// behind the blade and springing back once it's passed, and the mat pressed
// down a little round the tip. Whatever lies on the mat in the blade's way
// is cut too (the table, components/mat/table, does that to them).
//
// Cuts are kept in mat coordinates and drawn into a canvas a little taller
// than the window that scrolls with the mat, so a cut never swims while the
// page moves. The canvas is moved along as the window nears its edges and
// let go of altogether once everything has healed.

type Point = {
  x: number;
  y: number;
  // when the blade passed here, and when the cut here starts to close (ms)
  t: number;
  heal: number;
  // how far along the cut this is, and how wide the blade opened it (px)
  s: number;
  w: number;
  // across the cut, pointing away from the light: the way its lit wall faces
  nx: number;
  ny: number;
  // how squarely that wall faces the light (0..1)
  lit: number;
};

type Cut = { points: Point[]; done: boolean; length: number; id: number };

type Hand = {
  id: number;
  cut: Cut;
  touch: boolean;
  // the knife showing how, rather than a hand holding it
  demo: boolean;
  // the pointer, in client coordinates
  cx: number;
  cy: number;
  pressure: number;
  // where a straight edge was laid down (Shift), in mat coordinates
  edge: { x: number; y: number } | null;
  // the blade's speed, and how far the knife leans into it
  vx: number;
  vy: number;
  lean: number;
  at: number;
};

type Pending = { id: number; x: number; y: number; timer: number };

// timings, in milliseconds
const OPEN = 90;
const HOLD = 950;
const CLOSE = 820;
const SCAR = 2600;
// the healing runs along a cut at least this fast (px per ms)
const ZIP = 0.7;
// a cut tapers in and out over this much of its length (px)
const TAPER = 7;
// how far past the window the canvas reaches, above and below, in windows
const REACH = 0.3;
// the knife's angle in the hand, and how far it leans into a stroke
const ANGLE = (38 * Math.PI) / 180;
const LEAN = (7 * Math.PI) / 180;
// how long a finger holds the mat before it cuts
const HOLD_TO_CUT = 380;
// once a visit, after the card has landed, the knife shows what it does
const DEMO_KEY = "aiden-mat-shown";
const DEMO_AT = 2100;
const DEMO = -1;

// where the light comes from, as a direction towards it
const LIGHT_X = -0.55;
const LIGHT_Y = -0.835;

const ease = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const unit = (t: number) => Math.min(1, Math.max(0, t));

export function mountCuts(mat: HTMLElement, surface?: Surface) {
  const html = document.documentElement;
  const canvas = mat.querySelector<HTMLCanvasElement>(".mat-cuts");
  const knife = mat.querySelector<HTMLElement>(".knife");
  const readout = mat.querySelector<HTMLElement>(".cut-readout");
  const value = readout?.querySelector<HTMLElement>(".cut-readout-value");
  const angle = readout?.querySelector<HTMLElement>(".cut-readout-angle");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !knife || !readout || !value || !angle || !ctx) return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cuts: Cut[] = [];
  let hand: Hand | null = null;
  let pending: Pending | null = null;
  let raf = 0;
  let last = 0;
  let demoTimer = 0;
  let demoRaf = 0;
  let strokes = 0;
  // whether the blade's in paper just now
  let inPaper = false;

  // the canvas: its size in CSS pixels, its resolution, and the stretch of
  // the mat it covers (from `top` down)
  let width = 0;
  let height = 0;
  let ratio = 1;
  let top = 0;
  let live = false;
  let drawn: { x0: number; y0: number; x1: number; y1: number } | null = null;

  // the mat's inks, read when a cut begins (the theme can change)
  let groove = "#10261b";
  let lip = "rgb(214 236 222 / 0.55)";
  let scar = "rgb(214 236 222 / 0.2)";
  let blade = 1.6;
  let mm = 4;

  function inks() {
    const style = getComputedStyle(mat);
    groove = style.getPropertyValue("--cut").trim() || groove;
    lip = style.getPropertyValue("--cut-lip").trim() || lip;
    scar = style.getPropertyValue("--cut-scar").trim() || scar;
    // the knife is drawn 132 mm wide, which says how big a millimetre is
    mm = knife!.offsetWidth / 132 || 4;
    blade = Math.max(1.4, mm * 0.42);
  }

  function toMat(clientX: number, clientY: number) {
    const box = mat.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  }

  // Keeps the canvas over the stretch of mat in the window.
  function place() {
    const box = mat.getBoundingClientRect();
    const view = -box.top;
    const tall = window.innerHeight;
    const w = mat.clientWidth;
    const h = Math.ceil(tall * (1 + REACH * 2));
    const r = Math.min(2, window.devicePixelRatio || 1);
    const resized = !live || w !== width || h !== height || r !== ratio;
    const away = view < top + 8 || view + tall > top + height - 8;
    if (!resized && !away) return;
    if (resized) {
      width = w;
      height = h;
      ratio = r;
      canvas!.width = Math.round(w * r);
      canvas!.height = Math.round(h * r);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      canvas!.dataset.live = "";
      live = true;
    }
    top = Math.round(view - tall * REACH);
    canvas!.style.transform = `translate3d(0, ${top}px, 0)`;
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    drawn = null;
  }

  // Everything has healed: give the canvas's memory back.
  function letGo() {
    if (!live) return;
    canvas!.width = 0;
    canvas!.height = 0;
    delete canvas!.dataset.live;
    live = false;
    width = 0;
    height = 0;
    drawn = null;
  }

  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // ---- the cut

  // the blade's edge doesn't run quite true: it bites a little deeper here
  // and shallower there along the way
  const chatter = (s: number, phase: number) => 0.9 + 0.1 * Math.sin(s * 0.19 + phase) + 0.06 * Math.sin(s * 0.53 + phase * 2.3);

  function add(cut: Cut, x: number, y: number, t: number, w: number, real = false) {
    const points = cut.points;
    const prev = points[points.length - 1];
    if (!prev) {
      points.push({ x, y, t, heal: t + HOLD, s: 0, w, nx: 0, ny: 1, lit: 0 });
      if (real && surface) inPaper = surface.blade(cut.id, x, y);
      return;
    }
    const d = Math.hypot(x - prev.x, y - prev.y);
    if (d < 1.2) return;
    // across the cut, turned away from the light
    let nx = -(y - prev.y) / d;
    let ny = (x - prev.x) / d;
    const facing = nx * LIGHT_X + ny * LIGHT_Y;
    if (facing > 0) {
      nx = -nx;
      ny = -ny;
    }
    const lit = Math.abs(facing);
    if (points.length === 1) {
      prev.nx = nx;
      prev.ny = ny;
      prev.lit = lit;
    }
    // a long jump is filled in, so the healing has a line to run along
    const steps = Math.ceil(d / 3);
    let from = prev;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const at = prev.t + (t - prev.t) * f;
      const step = d / steps;
      const point = {
        x: prev.x + (x - prev.x) * f,
        y: prev.y + (y - prev.y) * f,
        t: at,
        heal: Math.max(at + HOLD, from.heal + step / ZIP),
        s: from.s + step,
        w: (prev.w + (w - prev.w) * f) * chatter(from.s + step, cut.id),
        nx,
        ny,
        lit,
      };
      points.push(point);
      from = point;
      // whatever's in the way is cut too
      if (real && surface) inPaper = surface.blade(cut.id, point.x, point.y);
    }
    cut.length = from.s;
  }

  // How open the cut is at a point, and how much of its healed line shows.
  function opening(cut: Cut, p: Point, now: number) {
    const open = ease(unit((now - p.t) / OPEN));
    const shut = easeInOut(unit((now - p.heal) / CLOSE));
    const taper = Math.min(1, 0.2 + p.s / TAPER, cut.done ? 0.2 + (cut.length - p.s) / TAPER : 1);
    // the blade wedges the mat apart just behind it; it springs back after
    const wedge = cut.done ? 1 : 1 + 0.75 * Math.exp(-(cut.length - p.s) / (mm * 2.2));
    return p.w * open * (1 - shut) * taper * wedge;
  }

  function trace(p: Point, now: number) {
    const closing = (now - p.heal) / CLOSE;
    if (closing <= 0) return 0;
    return Math.min(1, closing * 1.6) * (1 - unit((now - p.heal - CLOSE * 0.6) / SCAR));
  }

  const keys = { groove: [] as number[], scar: [] as number[] };

  // Strokes the stretches of a cut that look the same in one go: key[i]
  // describes the piece from point i - 1 to point i (0: nothing to draw).
  // `style` sets the stroke up and says how far across the cut (towards its
  // lit wall) the line runs.
  function stroke(points: Point[], key: number[], color: string, style: (k: number) => number) {
    ctx!.strokeStyle = color;
    let current = 0;
    let off = 0;
    for (let i = 1; i <= points.length; i++) {
      const k = i < points.length ? key[i]! : 0;
      if (k !== current) {
        if (current) ctx!.stroke();
        current = k;
        if (k) {
          off = style(k);
          const from = points[i - 1]!;
          ctx!.beginPath();
          ctx!.moveTo(from.x + from.nx * off, from.y + from.ny * off);
        }
      }
      if (k) {
        const to = points[i]!;
        ctx!.lineTo(to.x + to.nx * off, to.y + to.ny * off);
      }
    }
  }

  // Draws a cut as it is now; says whether there's anything left of it.
  function draw(cut: Cut, now: number) {
    const points = cut.points;
    const end = points[points.length - 1];
    if (!end) return !cut.done;
    if (cut.done && now > end.heal + CLOSE * 0.6 + SCAR) return false;
    if (points.length < 2) return true;
    const grooves = keys.groove;
    const scars = keys.scar;
    grooves.length = points.length;
    scars.length = points.length;
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      // how open it is, and how squarely its wall faces the light (4 steps)
      const open = Math.round(opening(cut, p, now) * 20);
      grooves[i] = open ? open * 4 + Math.min(3, Math.floor(p.lit * 4)) : 0;
      scars[i] = Math.round(trace(p, now) * 32);
      const box = drawn ?? (drawn = { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      if (p.x < box.x0) box.x0 = p.x;
      if (p.x > box.x1) box.x1 = p.x;
      if (p.y < box.y0) box.y0 = p.y;
      if (p.y > box.y1) box.y1 = p.y;
    }
    // the healed line, faint and lighter than the mat
    ctx!.lineWidth = 1;
    stroke(points, scars, scar, (k) => {
      ctx!.globalAlpha = k / 32;
      return 0.3;
    });
    // the mat pressed down either side of an open cut, a shade darker
    stroke(points, grooves, "rgb(0 0 0)", (k) => {
      const w = (k >> 2) / 20;
      ctx!.globalAlpha = Math.min(0.11, (w / blade) * 0.07);
      ctx!.lineWidth = w * 2.8 + 1.2;
      return -w * 0.25;
    });
    // the far wall catching the light, the more squarely it faces it
    stroke(points, grooves, lip, (k) => {
      const w = (k >> 2) / 20;
      const lit = ((k & 3) + 0.5) / 4;
      ctx!.globalAlpha = Math.min(1, w / blade) * (0.3 + 0.7 * lit);
      ctx!.lineWidth = Math.max(0.55, w * 0.62);
      return w * 0.55 + 0.4;
    });
    // the slit itself, and the dark of its depth down the middle
    ctx!.globalAlpha = 1;
    stroke(points, grooves, groove, (k) => {
      ctx!.lineWidth = (k >> 2) / 20;
      return 0;
    });
    stroke(points, grooves, "rgb(0 0 0)", (k) => {
      const w = (k >> 2) / 20;
      ctx!.globalAlpha = Math.min(0.55, (w / blade) * 0.4);
      ctx!.lineWidth = w * 0.42;
      return -w * 0.08;
    });
    ctx!.globalAlpha = 1;
    return true;
  }

  // The mat giving under the blade's point while it's pressed in.
  function dimple(h: Hand) {
    const tip = h.cut.points[h.cut.points.length - 1];
    if (!tip || inPaper) return;
    const r = mm * 1.9 * Math.min(1.3, h.pressure);
    const g = ctx!.createRadialGradient(tip.x - r * 0.12, tip.y - r * 0.18, 0, tip.x, tip.y, r);
    g.addColorStop(0, "rgb(0 0 0 / 0.2)");
    g.addColorStop(0.55, "rgb(0 0 0 / 0.07)");
    g.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx!.fillStyle = g;
    ctx!.fillRect(tip.x - r, tip.y - r, r * 2, r * 2);
    const box = drawn ?? (drawn = { x0: tip.x, y0: tip.y, x1: tip.x, y1: tip.y });
    box.x0 = Math.min(box.x0, tip.x - r);
    box.y0 = Math.min(box.y0, tip.y - r);
    box.x1 = Math.max(box.x1, tip.x + r);
    box.y1 = Math.max(box.y1, tip.y + r);
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (hand) hold(hand, dt);
    if (!cuts.length && !hand) {
      letGo();
      return;
    }
    place();
    ctx!.setTransform(ratio, 0, 0, ratio, 0, -top * ratio);
    if (drawn) {
      const pad = Math.max(blade * 5 + 4, mm * 2.6);
      ctx!.clearRect(drawn.x0 - pad, drawn.y0 - pad, drawn.x1 - drawn.x0 + pad * 2, drawn.y1 - drawn.y0 + pad * 2);
    }
    drawn = null;
    ctx!.lineCap = "round";
    ctx!.lineJoin = "round";
    for (let i = cuts.length - 1; i >= 0; i--) {
      if (!draw(cuts[i]!, now)) cuts.splice(i, 1);
    }
    ctx!.globalAlpha = 1;
    if (hand) dimple(hand);
    raf = requestAnimationFrame(frame);
  }

  // ---- the knife in the hand

  // The knife sits with its tip on the blade's point and leans a little
  // into the stroke, the way a handle leads the blade it pulls.
  function hold(h: Hand, dt: number) {
    const fade = Math.exp(-dt * 7);
    h.vx *= fade;
    h.vy *= fade;
    const pull = Math.cos(ANGLE) * h.vy - Math.sin(ANGLE) * h.vx;
    const target = still ? 0 : Math.max(-LEAN, Math.min(LEAN, pull * 0.00007));
    h.lean += (target - h.lean) * Math.min(1, dt * 14);
    const tip = h.cut.points[h.cut.points.length - 1];
    if (!tip) return;
    knife!.style.transform = `translate3d(${tip.x.toFixed(2)}px, ${tip.y.toFixed(2)}px, 0) rotate(${(ANGLE + h.lean).toFixed(4)}rad)`;
  }

  // The cut's length as it goes and, along a straight edge, its angle.
  function reading(h: Hand) {
    const tip = h.cut.points[h.cut.points.length - 1];
    if (!tip) return;
    const length = h.cut.length / mm;
    value!.textContent = length < 10 ? length.toFixed(1) : String(Math.round(length));
    let degrees = "";
    const start = h.edge;
    if (start && Math.hypot(tip.x - start.x, tip.y - start.y) > 2) {
      const a = (-Math.atan2(tip.y - start.y, tip.x - start.x) * 180) / Math.PI;
      degrees = `${Math.round(((a % 180) + 180) % 180)}°`;
    }
    if (angle!.textContent !== degrees) angle!.textContent = degrees;
    readout!.style.transform = `translate3d(${tip.x.toFixed(1)}px, ${tip.y.toFixed(1)}px, 0)`;
  }

  // The knife goes down at a point on the mat.
  function begin(id: number, point: { x: number; y: number }, touch: boolean, pressure: number, demo = false) {
    inks();
    const now = performance.now();
    const cut: Cut = { points: [], done: false, length: 0, id: ++strokes };
    inPaper = false;
    add(cut, point.x, point.y, now, blade * pressure, !demo);
    cuts.push(cut);
    while (cuts.length > 24) cuts.shift();
    hand = { id, cut, touch, demo, cx: 0, cy: 0, pressure, edge: null, vx: 0, vy: 0, lean: 0, at: now };
    readout!.toggleAttribute("data-touch", touch);
    // the knife goes down square in the hand, its tip on the point
    knife!.style.transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0) rotate(${ANGLE}rad)`;
    knife!.dataset.down = "";
    reading(hand);
    if (!demo) {
      // the knife is the pointer now
      html.dataset.cutting = "";
      unlockSound();
      nick();
    }
    wake();
  }

  // The blade follows the hand; with Shift it runs along a straight edge.
  function follow(h: Hand, point: { x: number; y: number }, shift: boolean, pressure: number) {
    const now = performance.now();
    const cut = h.cut;
    const tip = cut.points[cut.points.length - 1]!;
    let { x, y } = point;
    if (shift) {
      const edge = h.edge ?? (h.edge = { x: tip.x, y: tip.y });
      const dx = x - edge.x;
      const dy = y - edge.y;
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      x = edge.x + Math.cos(angle) * along;
      y = edge.y + Math.sin(angle) * along;
    } else {
      h.edge = null;
    }
    const d = Math.hypot(x - tip.x, y - tip.y);
    if (d < 1.2) return;
    const dt = Math.max(4, now - h.at);
    h.vx = h.vx * 0.5 + ((x - tip.x) / dt) * 1000 * 0.5;
    h.vy = h.vy * 0.5 + ((y - tip.y) / dt) * 1000 * 0.5;
    h.at = now;
    h.pressure = pressure;
    add(cut, x, y, now, blade * pressure, !h.demo);
    reading(h);
    readout!.dataset.shown = "";
    if (!still && !h.demo) {
      const speed = Math.hypot(h.vx, h.vy);
      if (inPaper) slice(speed);
      else score(speed);
    }
  }

  function end() {
    const h = hand;
    if (!h) return;
    hand = null;
    inPaper = false;
    if (!h.demo) surface?.lift();
    delete html.dataset.cutting;
    delete knife!.dataset.down;
    delete readout!.dataset.shown;
    const cut = h.cut;
    const tip = cut.points[0];
    if (tip && cut.length < 3) {
      // a stab: the blade leaves a short slit along itself
      const now = performance.now();
      const along = { x: Math.cos(ANGLE + h.lean), y: Math.sin(ANGLE + h.lean) };
      const back = mm * 0.9;
      const on = mm * 1.5;
      cut.points.length = 0;
      cut.length = 0;
      add(cut, tip.x - along.x * back, tip.y - along.y * back, now, blade);
      add(cut, tip.x + along.x * on, tip.y + along.y * on, now, blade);
    }
    cut.done = true;
    wake();
  }

  // Once a visit, the knife shows what the mat is for: it comes down,
  // underlines the hint that says to cut it (or, where there's no hint,
  // cuts along the foot of the opening), lifts away, and the cut heals.
  function demo() {
    demoTimer = 0;
    if (still || hand || pending || html.dataset.scene || html.dataset.holding || html.dataset.tool) return;
    // a tab in the background shows it once it's looked at
    if (document.hidden) {
      document.addEventListener("visibilitychange", onShown);
      return;
    }
    const box = mat.getBoundingClientRect();
    const hint = mat.querySelector<HTMLElement>(".mat-hint > span:last-child")?.getBoundingClientRect();
    const hero = mat.querySelector<HTMLElement>(".mat-hero")?.getBoundingClientRect();
    let from: { x: number; y: number };
    let to: { x: number; y: number };
    if (hint && hint.width > 0) {
      from = { x: hint.left - box.left - 2, y: hint.bottom - box.top + 7 };
      to = { x: hint.right - box.left + 6, y: from.y };
    } else if (hero && hero.height > 0) {
      from = { x: hero.left - box.left + hero.width * 0.12, y: hero.bottom - box.top - mm * 6 };
      to = { x: hero.left - box.left + hero.width * 0.62, y: from.y };
    } else return;
    // only where it can be seen
    const y = from.y + box.top;
    if (y < 0 || y > window.innerHeight - 8) return;
    try {
      if (sessionStorage.getItem(DEMO_KEY)) return;
      sessionStorage.setItem(DEMO_KEY, "1");
    } catch {}
    begin(DEMO, from, false, 1, true);
    // timed from the first frame it's drawn in, after a beat for the knife to land
    let start = 0;
    const length = 620;
    const step = (now: number) => {
      demoRaf = 0;
      const h = hand;
      if (!h || !h.demo) return;
      if (!start) start = now + 160;
      const t = Math.min(1, Math.max(0, (now - start) / length));
      if (t > 0) {
        const f = easeInOut(t);
        follow(h, { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, false, 1);
      }
      if (now < start + length + 110) demoRaf = requestAnimationFrame(step);
      else end();
    };
    demoRaf = requestAnimationFrame(step);
  }

  function onShown() {
    if (document.hidden) return;
    document.removeEventListener("visibilitychange", onShown);
    if (!demoTimer) demoTimer = window.setTimeout(demo, 900);
  }

  function stopDemo() {
    document.removeEventListener("visibilitychange", onShown);
    window.clearTimeout(demoTimer);
    demoTimer = 0;
    cancelAnimationFrame(demoRaf);
    demoRaf = 0;
    if (hand?.demo) end();
  }

  // ---- input

  function bare(target: EventTarget | null) {
    const el = target instanceof Element ? target : null;
    if (!el || !mat.contains(el)) return false;
    return !el.closest(".thing, a, button, input, textarea, select, [data-no-drag]");
  }

  const onPointerDown = (event: PointerEvent) => {
    // a hand on the mat needs no showing
    stopDemo();
    if (hand || pending || event.button > 0 || !event.isPrimary) return;
    if (html.dataset.scene || html.dataset.holding || html.dataset.tool || !bare(event.target)) return;
    if (event.pointerType === "touch") {
      const id = event.pointerId;
      const x = event.clientX;
      const y = event.clientY;
      pending = {
        id,
        x,
        y,
        timer: window.setTimeout(() => {
          if (!pending || pending.id !== id) return;
          pending = null;
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(5);
          begin(id, toMat(x, y), true, 1);
          if (hand) {
            hand.cx = x;
            hand.cy = y;
          }
        }, HOLD_TO_CUT),
      };
      return;
    }
    // no text gets selected as the blade goes through the mat's print
    event.preventDefault();
    try {
      mat.setPointerCapture(event.pointerId);
    } catch {}
    const pressure = event.pointerType === "pen" ? 0.55 + event.pressure * 0.9 : 1;
    begin(event.pointerId, toMat(event.clientX, event.clientY), false, pressure);
    hand!.cx = event.clientX;
    hand!.cy = event.clientY;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pending && pending.id === event.pointerId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) {
        window.clearTimeout(pending.timer);
        pending = null;
      }
      return;
    }
    if (!hand || hand.id !== event.pointerId) return;
    const h = hand;
    const pen = event.pointerType === "pen";
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event]) {
      follow(h, toMat(sample.clientX, sample.clientY), event.shiftKey, pen ? 0.55 + sample.pressure * 0.9 : h.pressure);
    }
    h.cx = event.clientX;
    h.cy = event.clientY;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pending && pending.id === event.pointerId) {
      window.clearTimeout(pending.timer);
      pending = null;
      return;
    }
    if (hand && hand.id === event.pointerId) end();
  };

  // A wheel turned mid-cut moves the mat under the blade, which keeps cutting.
  const onScroll = () => {
    if (hand && !hand.demo) follow(hand, toMat(hand.cx, hand.cy), hand.edge !== null, hand.pressure);
  };

  // Once the blade is in, a finger moving cuts rather than scrolls.
  const onTouchMove = (event: TouchEvent) => {
    if (hand?.touch) event.preventDefault();
  };

  const onContextMenu = (event: Event) => {
    if (hand || pending) event.preventDefault();
  };

  const onBlur = () => end();

  // Pressing anything at all before the knife has shown how: no need.
  const onAnyPress = () => {
    if (demoTimer) {
      window.clearTimeout(demoTimer);
      demoTimer = 0;
    }
  };

  mat.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("blur", onBlur);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  mat.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("pointerdown", onAnyPress, { capture: true });
  if (!still) demoTimer = window.setTimeout(demo, DEMO_AT);

  return () => {
    cancelAnimationFrame(raf);
    stopDemo();
    if (pending) window.clearTimeout(pending.timer);
    delete html.dataset.cutting;
    letGo();
    mat.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("touchmove", onTouchMove);
    mat.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("pointerdown", onAnyPress, { capture: true });
  };
}
