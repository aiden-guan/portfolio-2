import type { Role } from "@/content/worlds";

// The blank's reel. The four answers stand in one place, the current one
// showing through a window with soft top and bottom edges. A roll turns the
// reel one notch: the word in the blank goes up out of the window as the next
// comes up into it, a line apart, like faces on a drum, on a spring that
// settles with the smallest overshoot. Opening it lays the four out in a
// column around the blank, the nearest first; closing folds them back in.
//
// The sentence never reflows. The blank is always as wide as the widest
// answer, and what fits a shorter one is done with transforms: the sentence
// is moved by half the difference so it stays centred on the word it says,
// and the full stop is drawn back to sit after the word.

const ROW = 1.2; // em: one line of the sentence, the reel's pitch

export type Spring = { duration: number; at: (t: number) => number; speed: (t: number) => number };

// A damped spring from 0 to 1, in seconds; `speed` is its velocity, per second.
export function spring(stiffness: number, damping: number): Spring {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  let at: (t: number) => number;
  let speed: (t: number) => number;
  if (zeta < 1) {
    const a = zeta * w0;
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    at = (t) => 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t));
    speed = (t) => Math.exp(-a * t) * ((w0 * w0) / wd) * Math.sin(wd * t);
  } else {
    at = (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    speed = (t) => w0 * w0 * t * Math.exp(-w0 * t);
  }
  let end = 0.05;
  while (end < 3 && (Math.abs(1 - at(end)) > 0.0008 || Math.abs(speed(end)) > 0.02)) end += 0.002;
  return { duration: end * 1000, at, speed };
}

// The same spring as a CSS easing, for the transitions that move with it.
export function easing(motion: Spring, samples = 48) {
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const value = i === samples ? 1 : motion.at((i / samples) * (motion.duration / 1000));
    points.push(String(Math.round(value * 10000) / 10000));
  }
  return `linear(${points.join(", ")})`;
}

// a notch: quick off the mark, settled in about two thirds of a second
export const ROLL = spring(210, 23);
// the column opening: a touch softer
const UNFOLD = spring(260, 30);
const FOLD = spring(520, 46);

// How each face sits in the blank, in em of the sentence. `lead` moves the
// word along so the gap after "a" looks the same whatever the face (a mono
// and a pixel face carry wide side bearings); `tail` places the full stop
// the same distance from every last letter; `ink` is where the letters
// really start and end, from the word's box, for the rule under them.
const FIT: Record<Role, { lead: number; tail: number; inkStart: number; inkEnd: number }> = {
  founder: { lead: 0, tail: 0.03, inkStart: 0.013, inkEnd: 0.023 },
  student: { lead: 0, tail: 0, inkStart: 0.02, inkEnd: -0.01 },
  builder: { lead: -0.04, tail: 0, inkStart: 0.09, inkEnd: 0.015 },
  designer: { lead: -0.025, tail: -0.055, inkStart: 0.07, inkEnd: -0.06 },
};

type Parts = {
  line: HTMLElement;
  reel: HTMLElement;
  rows: HTMLElement[];
  roles: Role[];
};

// `fade` runs the row's opacity from one value to another between two points
// of the way, so a word shows only once it is clear of the one in front
type Motion = {
  from: number;
  to: number;
  spring: Spring;
  delay?: number;
  blur?: boolean;
  fade?: [from: number, to: number, start: number, end: number];
};

// how far nearer the word in the sentence the others start from as the reel
// opens, in rows, and how much of them shows once it has (as in
// identity.module.css)
const TUCK = 0.5;
const QUIET = 0.38;

export class Reel {
  private current: number;
  private opened = false;
  private folding = 0;
  private widths: number[] | null = null;
  private width = 0;
  private reduced: boolean;
  private parts: Parts;
  private where: number[];
  // open, the lines stand further apart for a finger than for a pointer
  private spread = 1;
  // on two lines the first is right above the blank, so the others are laid
  // out below it, in turn from the one in the sentence
  private below = false;

  constructor(parts: Parts, index: number, reduced: boolean) {
    this.parts = parts;
    this.current = index;
    this.reduced = reduced;
    this.where = parts.rows.map(() => 0);
    parts.rows.forEach((row, i) => {
      row.style.translate = "0 0em";
      row.style.marginLeft = `${FIT[parts.roles[i]].lead}em`;
      row.toggleAttribute("data-current", i === index);
    });
  }

  get index() {
    return this.current;
  }

  // the words' widths, once their faces are in; returns false if unchanged
  measure() {
    const { line, rows, reel } = this.parts;
    const size = parseFloat(getComputedStyle(line).fontSize) || 1;
    const widths = rows.map((row) => row.getBoundingClientRect().width / size);
    if (this.widths && widths.every((w, i) => Math.abs(w - (this.widths as number[])[i]) < 0.002)) return false;
    this.widths = widths;
    const floor = parseFloat(getComputedStyle(reel).width) / size || 0;
    const widest = Math.max(...widths.map((w, i) => w + FIT[this.parts.roles[i]].lead));
    this.width = Math.max(floor, widest);
    if (widest > floor + 0.001) line.style.setProperty("--reel-w", `${widest.toFixed(4)}em`);
    this.place(this.current, true);
    return true;
  }

  // centre the sentence on the word at `index`, and fit the rule and the
  // hit area to it
  place(index: number, instant = false) {
    const widths = this.widths;
    if (!widths) return;
    const { line, roles } = this.parts;
    const fit = FIT[roles[index]];
    const w = widths[index];
    const said = fit.lead + w + fit.tail;
    const dx = (this.width - said) / 2;
    const start = fit.lead + fit.inkStart;
    const end = fit.lead + w + fit.inkEnd;
    if (instant) line.setAttribute("data-instant", "");
    line.style.setProperty("--dx", `${dx.toFixed(4)}em`);
    line.style.setProperty("--rule-x", `${start.toFixed(4)}em`);
    line.style.setProperty("--rule-k", (Math.max(0, end - start) / this.width).toFixed(5));
    line.style.setProperty("--hit-x", `${(start - 0.12).toFixed(4)}em`);
    line.style.setProperty("--hit-k", ((end - start + 0.24) / this.width).toFixed(5));
    if (instant) {
      // the next frame, once the jump has been drawn
      requestAnimationFrame(() => requestAnimationFrame(() => line.removeAttribute("data-instant")));
    }
  }

  // One notch on, closed: `direction` 1 brings the next word up from below.
  roll(to: number, direction: 1 | -1) {
    const from = this.current;
    if (to === from) return;
    this.current = to;
    const { rows } = this.parts;
    this.place(to);
    if (this.reduced) {
      rows[from].removeAttribute("data-current");
      rows[to].setAttribute("data-current", "");
      rows[from].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-in" });
      rows[to].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 120, easing: "ease-out", fill: "backwards" });
      return;
    }
    rows.forEach((row, i) => {
      if (i === from || i === to) return;
      // anything still on its way out goes now
      if (row.hasAttribute("data-live")) {
        row.getAnimations().forEach((animation) => animation.cancel());
        row.removeAttribute("data-live");
        this.set(i, 0);
      }
    });
    const out = rows[from];
    const incoming = rows[to];
    out.removeAttribute("data-current");
    out.setAttribute("data-live", "");
    // a word still in sight carries on from where it is
    const back = incoming.hasAttribute("data-live") ? this.now(to) : direction;
    incoming.removeAttribute("data-live");
    incoming.setAttribute("data-current", "");
    this.move(from, { from: this.now(from), to: -direction, spring: ROLL, blur: true }).then((done) => {
      if (!done || this.current === from) return;
      out.removeAttribute("data-live");
      this.set(from, 0);
    });
    this.move(to, { from: back, to: 0, spring: ROLL, blur: true });
  }

  // Lay all four out around the blank: each settles into its line from half
  // a line nearer the word in the sentence, the nearest first, so none
  // crosses another, and shows once it is clear of the word.
  open() {
    if (this.opened) return;
    this.opened = true;
    window.clearTimeout(this.folding);
    const { reel, rows } = this.parts;
    reel.removeAttribute("data-folding");
    reel.setAttribute("data-unmasked", "");
    this.spread = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 1.45 : 1;
    this.below = this.parts.line.hasAttribute("data-wrapped");
    rows.forEach((row, i) => {
      const offset = this.rank(i, this.current);
      const distance = Math.abs(offset / this.spread);
      if (this.reduced) {
        row.removeAttribute("data-live");
        this.set(i, offset);
        return;
      }
      if (offset === 0) {
        this.move(i, { from: this.now(i), to: 0, spring: UNFOLD });
        return;
      }
      // a word still on its way somewhere goes on from where it is
      const moving = row.getAnimations().length > 0 || row.hasAttribute("data-live");
      const shown = moving ? this.shown(i) : 0;
      row.removeAttribute("data-live");
      this.move(i, {
        from: moving ? this.now(i) : offset - Math.sign(offset) * TUCK,
        to: offset,
        spring: UNFOLD,
        delay: moving ? 0 : (distance - 1) * 40,
        fade: [shown, QUIET, 0.16, 0.62],
      });
    });
  }

  // Fold the column back in towards the word.
  close() {
    if (!this.opened) return;
    this.opened = false;
    const { reel, rows } = this.parts;
    reel.setAttribute("data-folding", "");
    if (!this.reduced) {
      rows.forEach((_, i) => {
        if (i === this.current) {
          this.move(i, { from: this.now(i), to: 0, spring: FOLD });
          return;
        }
        const at = this.now(i);
        const shown = this.shown(i);
        const toward = at - Math.sign(at || i - this.current) * TUCK;
        this.move(i, { from: at, to: toward, spring: FOLD, fade: [shown, 0, 0, 0.42] });
      });
    }
    window.clearTimeout(this.folding);
    this.folding = window.setTimeout(
      () => {
        if (this.opened) return;
        reel.removeAttribute("data-unmasked");
        reel.removeAttribute("data-folding");
        rows.forEach((_, i) => this.set(i, 0));
      },
      this.reduced ? 180 : Math.min(FOLD.duration, 320),
    );
  }

  // While open: slide the column so the word at `to` sits in the sentence.
  // Laid out below, the one that goes round from one end to the other leaves
  // the way the rest are going and comes back in at the other end.
  slide(to: number) {
    if (to === this.current) return;
    this.current = to;
    const { rows } = this.parts;
    this.place(to);
    rows.forEach((row, i) => {
      row.toggleAttribute("data-current", i === to);
      const offset = this.rank(i, to);
      if (this.reduced) {
        this.set(i, offset);
        return;
      }
      const from = this.now(i);
      if (this.below && Math.abs(offset - from) > 1.5 * this.spread) this.round(i, from, offset, i === to ? 1 : QUIET);
      else this.move(i, { from, to: offset, spring: ROLL });
    });
  }

  // the line row `i` takes, open, with the word at `current` in the sentence
  private rank(i: number, current: number) {
    const count = this.parts.rows.length;
    return (this.below ? (i - current + count) % count : i - current) * this.spread;
  }

  // out of sight one way, back in at the other end
  private round(i: number, from: number, to: number, shown: number) {
    const row = this.parts.rows[i];
    const way = -Math.sign(to - from) * TUCK * this.spread;
    const was = this.shown(i);
    row.getAnimations().forEach((animation) => animation.cancel());
    this.set(i, to);
    const at = (rows: number) => `0 ${(rows * ROW).toFixed(4)}em`;
    row.animate(
      [
        { translate: at(from), opacity: was, easing: "cubic-bezier(0.4, 0, 1, 1)" },
        { translate: at(from + way), opacity: 0, offset: 0.4 },
        { translate: at(to - way), opacity: 0, offset: 0.4, easing: "cubic-bezier(0, 0, 0.2, 1)" },
        { translate: at(to), opacity: shown },
      ],
      { duration: 420, fill: "backwards" },
    );
  }

  // Leaving: an open column stays exactly where it is, under the pointer
  // that chose from it; a word still rolling is put where it was going.
  hold(open: boolean) {
    window.clearTimeout(this.folding);
    this.parts.rows.forEach((row) => {
      for (const animation of row.getAnimations()) {
        if (open) animation.pause();
        else animation.finish();
      }
      if (!open) row.removeAttribute("data-live");
    });
  }

  // Back to rest at `index`, at once: for a page handed back by the browser.
  reset(index: number) {
    this.opened = false;
    window.clearTimeout(this.folding);
    this.current = index;
    const { reel, rows } = this.parts;
    reel.removeAttribute("data-unmasked");
    reel.removeAttribute("data-folding");
    rows.forEach((row, i) => {
      row.getAnimations().forEach((animation) => animation.cancel());
      row.removeAttribute("data-live");
      row.toggleAttribute("data-current", i === index);
      this.set(i, 0);
    });
    this.place(index, true);
  }

  dispose() {
    window.clearTimeout(this.folding);
    this.parts.rows.forEach((row) => row.getAnimations().forEach((animation) => animation.cancel()));
  }

  // where row `i` is right now, in rows, mid-flight or not
  private now(i: number) {
    const row = this.parts.rows[i];
    if (!row.getAnimations().length) return this.where[i];
    const size = parseFloat(getComputedStyle(this.parts.line).fontSize) || 1;
    const y = parseFloat(getComputedStyle(row).translate.split(" ")[1] ?? "0");
    return Number.isFinite(y) ? y / size / ROW : this.where[i];
  }

  // how much of row `i` shows right now
  private shown(i: number) {
    const value = parseFloat(getComputedStyle(this.parts.rows[i]).opacity);
    return Number.isFinite(value) ? value : 0;
  }

  private set(i: number, rows: number) {
    this.where[i] = rows;
    this.parts.rows[i].style.translate = `0 ${(rows * ROW).toFixed(4)}em`;
  }

  // Runs row `i` from one place to another on a spring, sampled into
  // keyframes. Fast words get a little vertical smear, as a camera would.
  private move(i: number, { from, to, spring: motion, delay = 0, blur = false, fade }: Motion) {
    const row = this.parts.rows[i];
    row.getAnimations().forEach((animation) => animation.cancel());
    this.set(i, to);
    if (Math.abs(to - from) < 0.001) return Promise.resolve(true);
    const size = parseFloat(getComputedStyle(this.parts.line).fontSize) || 16;
    const seconds = motion.duration / 1000;
    const steps = Math.max(8, Math.round(seconds * 60));
    const frames: Keyframe[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = (s / steps) * seconds;
      const p = s === steps ? 1 : motion.at(t);
      const frame: Keyframe = { translate: `0 ${((from + (to - from) * p) * ROW).toFixed(4)}em` };
      if (blur) {
        const pace = Math.abs(motion.speed(t) * (to - from) * ROW * size);
        frame.filter = s === steps ? "blur(0px)" : `blur(${Math.min(1.4, pace * 0.0018).toFixed(2)}px)`;
      }
      if (fade) {
        const [shown, ends, start, end] = fade;
        const k = Math.min(1, Math.max(0, (p - start) / (end - start)));
        frame.opacity = (shown + (ends - shown) * k * k * (3 - 2 * k)).toFixed(3);
      }
      frames.push(frame);
    }
    const animation = row.animate(frames, { duration: motion.duration, delay, fill: "backwards", easing: "linear" });
    return animation.finished.then(
      () => true,
      () => false,
    );
  }
}
