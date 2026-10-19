"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { CardMeta } from "@/components/cards";
import type { NavigationItem } from "@/content/portfolio";
import { flick, setMuted, unlockSound, useMuted } from "@/lib/riffle";

// The cards stand in a file, one behind another, and the page's scroll is a
// thumb running through them: each card tips forward as it goes past, and the
// next one shows its header above the one in front. Scrolling settles on a
// card (CSS scroll snap). The thumb follows the scroll on a spring, and every
// card has springs of its own, so a flick riffles, a card set back upright
// rocks once before it settles, and nothing ever jumps.
//
// The front card can be grabbed and pulled down to flip it, or clicked to lift
// it out of the file with its photos fanned beside it. The eye drifts a little
// with the pointer, so the file has depth, while the card in front, which
// sits in the picture plane, never blurs.

const cardEvent = "aiden-card";
// how many cards behind the front one are drawn
const BEHIND = 7;
// the size the taped photos are laid out at; they rest scaled down on the card
const PRINT_W = 300;
const PRINT_H = 236;

type Engine = {
  go: (index: number, smooth?: boolean) => void;
  pull: (on: boolean) => void;
};

// One card's moving parts, and what was last written to its styles.
type Body = {
  el: HTMLElement;
  divider: boolean;
  fogs: HTMLElement[];
  shades: HTMLElement[];
  angle: number;
  va: number;
  y: number;
  vy: number;
  // the drop into the file when the page opens: 1 above the window, 0 home
  drop: number;
  vdrop: number;
  dropAt: number;
  side: number;
  written: string;
};

const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CardFile({ cards, children }: { cards: CardMeta[]; children: ReactNode }) {
  const file = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [current, setCurrent] = useState(0);
  const [pulled, setPulled] = useState(false);
  const [moved, setMoved] = useState(false);
  const count = cards.length;

  useEffect(() => {
    const node = file.current;
    const room = stage.current;
    const pile = stack.current;
    if (!node || !room || !pile) return;
    const root = document.documentElement;
    const bodies: Body[] = [...pile.querySelectorAll<HTMLElement>(":scope > .index-card")].map((el) => ({
      el,
      divider: el.dataset.kind === "divider",
      fogs: [...el.querySelectorAll<HTMLElement>(".card-fog")],
      shades: [...el.querySelectorAll<HTMLElement>(".card-shade")],
      angle: 0,
      va: 0,
      y: 0,
      vy: 0,
      drop: 0,
      vdrop: 0,
      dropAt: 0,
      side: 1,
      written: "",
    }));
    const els = bodies.map((body) => body.el);
    const rod = pile.querySelector<HTMLElement>(".card-rod");
    const scrubber = node.querySelector<HTMLElement>(".scrubber");
    const still = reducedMotion();
    let step = 600;
    let gap = 22;
    let peek = 40;
    let edge = 3;
    let width = 0;
    let height = 0;
    let left = 0;
    let top = 0;
    let narrow = false;
    // where the scroll says the thumb is, where the thumb has got to, and how fast
    let target = 0;
    let p = 0;
    let vp = 0;
    let shown = -1;
    let pulledAt = -1;
    // the card out of the file, or on its way back in
    let lifted = -1;
    let pull = 0;
    let vpull = 0;
    let shift = 0;
    let lift = 0;
    let hover = -1;
    // the eye's drift with the pointer, and where the pointer is
    const eye = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let raf = 0;
    let last = 0;
    let writtenEye = "";
    let writtenRod = "";
    let writtenAt = "";

    function measure() {
      const vw = root.clientWidth;
      const vh = window.innerHeight;
      narrow = vw < 720;
      if (narrow) {
        width = vw - 32;
        height = Math.min(Math.round(width * 1.28), vh - 230);
      } else {
        width = Math.min(780, Math.round(vw * 0.6), Math.round((vh - 260) / 0.6));
        height = Math.round(width * 0.6);
      }
      width -= width % 2;
      height -= height % 2;
      left = Math.round((vw - width) / 2);
      // scroll per card: short enough that one swipe or wheel notch turns one
      step = Math.round(vh * (narrow ? 0.3 : 0.32));
      gap = narrow ? 16 : 22;
      // the header band is --head (10.5% of the card) tall
      peek = Math.round(height * 0.105) + (narrow ? -2 : 4);
      edge = narrow ? 2 : 3;
      node!.style.setProperty("--card-w", `${width}px`);
      node!.style.setProperty("--card-h", `${height}px`);
      node!.style.setProperty("--card-x", `${left}px`);
      node!.style.setProperty("--step", `${step}px`);
      // photos rest on the card a third of its width across (half, on a phone)
      node!.style.setProperty("--print-rest", ((width * (narrow ? 0.44 : 0.34)) / PRINT_W).toFixed(4));
      top = bodies[0]?.el.offsetTop ?? 0;
      read();
      p = target;
      vp = 0;
    }

    // Sets a card's type just small enough for its text to clear the foot,
    // when it would otherwise run over (long notes, or the wider type of the
    // scenes).
    function fit() {
      for (const body of bodies) {
        const text = body.el.querySelector<HTMLElement>(".card-body");
        if (!text) continue;
        text.style.removeProperty("--fit");
        if (text.scrollHeight <= text.clientHeight + 1) continue;
        let lo = 0.68;
        let hi = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          text.style.setProperty("--fit", mid.toFixed(3));
          if (text.scrollHeight <= text.clientHeight + 1) lo = mid;
          else hi = mid;
        }
        text.style.setProperty("--fit", lo.toFixed(3));
      }
    }

    function read() {
      target = Math.min(count - 1, Math.max(0, (window.scrollY - node!.offsetTop) / step));
    }

    // Where card k wants to be with the thumb at p.
    function aim(body: Body, k: number) {
      const r = k - p;
      let angle: number;
      let z: number;
      let y = 0;
      let opacity = 1;
      let fog = 0;
      let shade = 0;
      if (r >= 0) {
        // standing in the file, leaning back a touch more the further in
        // (a positive rotateX takes a card's top away from the eye)
        angle = Math.min(r, 1) * 2 + Math.max(0, r - 1) * 0.4;
        z = -r * gap;
        // the next card stands up far enough to read its header, the rest
        // show an edge each; a divider's tab already says what it is
        const rise = body.divider ? edge * 4 : peek;
        y = -(Math.min(r, 1) * rise + Math.max(0, Math.min(r, BEHIND) - 1) * edge);
        // a card the pointer rests on rises far enough to read its header
        if (k === hover && r > 0.5) y -= r > 1.5 ? peek * 0.8 : narrow ? 10 : 16;
        opacity = r > BEHIND ? Math.max(0, 1 - (r - BEHIND)) : 1;
        // further in, the cards fade into the room rather than going grey
        fog = Math.min(1, r / BEHIND) * 0.62;
      } else {
        // tipping over: slow off the vertical, then falling
        const f = -r;
        const fall = Math.min(1, f * f * 1.15);
        angle = fall * -96;
        z = f * gap * 0.6;
        // gone by the time it would lie flat across the foot of the window
        opacity = still ? 0 : 1 - smooth((f - 0.3) / 0.42);
        shade = fall * 0.34;
      }
      if (lifted >= 0 && k !== lifted) {
        // the rest of the file sinks back while a card is out
        fog = Math.min(0.9, fog + 0.5 * pull);
        y += 12 * pull;
      }
      return { angle, z, y, opacity, fog, shade };
    }

    function write(body: Body, k: number, look: ReturnType<typeof aim>) {
      const r = k - p;
      const el = body.el;
      const hidden = r < -1.4 || r > BEHIND + 1 || look.opacity <= 0.002;
      let x = 0;
      let spin = 0;
      let y = body.y;
      if (k === lifted) {
        x = -shift * pull;
        y -= lift * pull;
        // a little sway on the way up and back, none once it is there
        spin = Math.sin(Math.max(0, Math.min(1, pull)) * Math.PI) * -1.4;
      }
      y -= body.drop * (top + height + 80);
      const css = hidden
        ? "hidden"
        : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${look.z.toFixed(2)}px) rotateX(${body.angle.toFixed(3)}deg) rotateZ(${spin.toFixed(3)}deg)|${look.opacity.toFixed(3)}|${look.fog.toFixed(3)}|${look.shade.toFixed(3)}`;
      if (css === body.written) return;
      body.written = css;
      if (hidden) {
        el.style.visibility = "hidden";
        return;
      }
      const [transform, opacity, fog, shade] = css.split("|");
      el.style.visibility = "";
      el.style.transform = transform!;
      el.style.opacity = opacity!;
      for (const layer of body.fogs) layer.style.opacity = fog!;
      for (const layer of body.shades) layer.style.opacity = shade!;
      el.style.pointerEvents = r < -0.35 || look.opacity < 0.2 ? "none" : "";
    }

    function wake() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      let busy = false;

      // the thumb: a critically damped spring, so a long scroll eases in and out
      if (still) {
        p = target;
        vp = 0;
      } else {
        vp += ((target - p) * 150 - vp * 24.5) * dt;
        p += vp * dt;
        if (Math.abs(target - p) < 0.0004 && Math.abs(vp) < 0.002) {
          p = target;
          vp = 0;
        } else busy = true;
      }
      const goal = pulledAt >= 0 ? 1 : 0;
      if (still) pull = goal;
      else {
        vpull += ((goal - pull) * 210 - vpull * 23) * dt;
        pull += vpull * dt;
        if (Math.abs(goal - pull) < 0.0008 && Math.abs(vpull) < 0.004) {
          pull = goal;
          vpull = 0;
        } else busy = true;
      }
      if (pull === 0 && pulledAt < 0) lifted = -1;

      // the eye drifts after the pointer
      if (!still) {
        eye.vx += ((eye.tx - eye.x) * 70 - eye.vx * 16) * dt;
        eye.vy += ((eye.ty - eye.y) * 70 - eye.vy * 16) * dt;
        eye.x += eye.vx * dt;
        eye.y += eye.vy * dt;
        if (Math.abs(eye.tx - eye.x) + Math.abs(eye.ty - eye.y) > 0.05 || Math.abs(eye.vx) + Math.abs(eye.vy) > 0.05) busy = true;
        const origin = `calc(50% + ${eye.x.toFixed(2)}px) calc(-42% + ${eye.y.toFixed(2)}px)`;
        if (origin !== writtenEye) {
          writtenEye = origin;
          room!.style.perspectiveOrigin = origin;
        }
      }

      const front = Math.round(p);
      for (let k = 0; k < bodies.length; k++) {
        const body = bodies[k]!;
        const look = aim(body, k);
        const r = k - p;
        if (still || r < -1.4 || r > BEHIND + 1) {
          // out of sight, or no motion wanted: just be there
          body.angle = look.angle;
          body.va = 0;
          body.y = look.y;
          body.vy = 0;
        } else {
          // the angle follows on a lightly underdamped spring, so a card set
          // back upright rocks once; the height follows a stiffer one
          const da = look.angle - body.angle;
          body.va += (da * 260 - body.va * 22) * dt;
          body.angle += body.va * dt;
          body.vy += ((look.y - body.y) * 320 - body.vy * 30) * dt;
          body.y += body.vy * dt;
          if (Math.abs(da) > 0.01 || Math.abs(body.va) > 0.05 || Math.abs(look.y - body.y) > 0.05 || Math.abs(body.vy) > 0.05) busy = true;
        }
        if (body.drop > 0) {
          if (now >= body.dropAt) {
            body.vdrop += ((0 - body.drop) * 150 - body.vdrop * 17) * dt;
            body.drop += body.vdrop * dt;
            if (body.drop <= 0.0005 && Math.abs(body.vdrop) < 0.01) {
              body.drop = 0;
              body.vdrop = 0;
            }
          }
          busy = true;
        }
        // a card tipping past the thumb
        const side = body.angle < -28 ? -1 : 1;
        if (side !== body.side) {
          body.side = side;
          flick(Math.min(1, Math.abs(vp) * 0.25 + 0.3));
        }
        write(body, k, look);
      }

      if (rod) {
        // from just in front of the front card to just behind the last one drawn
        const near = 0.7 * gap;
        const far = (Math.min(count - 1 - p, BEHIND) + 0.4) * gap;
        const css = `${(near + far).toFixed(1)}|translate3d(0, 0, ${near.toFixed(1)}px) rotateX(-90deg)`;
        if (css !== writtenRod) {
          writtenRod = css;
          rod.style.height = `${(near + far).toFixed(1)}px`;
          rod.style.transform = `translate3d(0, 0, ${near.toFixed(1)}px) rotateX(-90deg)`;
        }
      }
      // the scrubber's marker slides with the thumb
      const at = (count > 1 ? p / (count - 1) : 0).toFixed(4);
      if (scrubber && at !== writtenAt) {
        writtenAt = at;
        scrubber.style.setProperty("--at", at);
      }

      if (front !== shown) {
        shown = front;
        els.forEach((el, k) => el.toggleAttribute("data-front", k === front));
        setCurrent(front);
        window.dispatchEvent(new CustomEvent(cardEvent, { detail: cards[front]?.section ?? "" }));
      }
      // only the card behind the front one is read from the file; deeper
      // headers would show as clipped tops of letters
      els.forEach((el, k) => {
        const deep = k - p > 1.5 && k !== hover;
        if (el.hasAttribute("data-deep") !== deep) el.toggleAttribute("data-deep", deep);
      });
      if (busy) wake();
    }

    function go(index: number, smoothly = true) {
      const k = Math.max(0, Math.min(count - 1, index));
      window.scrollTo({ top: node!.offsetTop + k * step, behavior: smoothly && !still ? "smooth" : "auto" });
    }

    // Lays the card's photos out beside it (or under it, on a phone), as
    // offsets from where they rest taped to it.
    function fan(el: HTMLElement) {
      const prints = [...el.querySelectorAll<HTMLElement>(".card-print")];
      const vw = root.clientWidth;
      const n = prints.length;
      if (!n) {
        shift = 0;
        lift = narrow ? 0 : Math.round(height * 0.04);
        return;
      }
      const holder = el.querySelector<HTMLElement>(".card-prints");
      const ox = holder?.offsetLeft ?? 0;
      const oy = holder?.offsetTop ?? 0;
      let size: number;
      const place: { x: number; y: number; r: number }[] = [];
      if (!narrow) {
        const room = vw - (left + width) - 32;
        size = Math.max(180, Math.min(300, room + left - 64 - (n - 1) * 14));
        shift = Math.max(0, Math.min(left - 24, size + 56 + (n - 1) * 14 - room));
        lift = Math.round(height * 0.04);
        const scale = size / PRINT_W;
        const spread = n > 1 ? Math.max(0, height - PRINT_H * scale) / (n - 1) : 0;
        for (let i = 0; i < n; i++) place.push({ x: width + 40 + i * 14, y: i * spread, r: i % 2 ? 2.5 : -2 });
      } else {
        shift = 0;
        size = Math.min(180, (width - (n - 1) * 10) / Math.min(n, 2));
        const scale = size / PRINT_W;
        lift = Math.round(Math.min(height * 0.42, PRINT_H * scale + 28));
        const across = n > 1 ? (width - size) / (n - 1) : 0;
        for (let i = 0; i < n; i++) place.push({ x: i * across, y: height + 18, r: i % 2 ? 2 : -2.5 });
      }
      const scale = size / PRINT_W;
      prints.forEach((print, i) => {
        // the photo turns about its top right corner, so aim that corner
        const restX = ox + print.offsetLeft + PRINT_W;
        const restY = oy + print.offsetTop;
        const to = place[i]!;
        print.style.setProperty("--fx", `${(to.x + size - restX).toFixed(1)}px`);
        print.style.setProperty("--fy", `${(to.y - restY).toFixed(1)}px`);
        print.style.setProperty("--fr", `${to.r}deg`);
        print.style.setProperty("--fs", scale.toFixed(3));
      });
    }

    function setPull(on: boolean) {
      const front = Math.round(target);
      if (on && (Math.abs(target - front) > 0.02 || !els[front])) return;
      const was = pulledAt >= 0 ? els[pulledAt] : null;
      if (was && (!on || was !== els[front])) {
        was.classList.remove("is-pulled");
        for (const video of was.querySelectorAll("video")) {
          video.pause();
          video.currentTime = Math.min(1.5, video.duration || 1.5);
        }
      }
      if (on) {
        const el = els[front]!;
        fan(el);
        el.classList.add("is-pulled");
        pulledAt = front;
        lifted = front;
        if (!still) for (const video of el.querySelectorAll("video")) video.play().catch(() => {});
        flick(0.9);
      } else {
        pulledAt = -1;
      }
      pile!.toggleAttribute("data-pulled", on);
      setPulled(on);
      wake();
    }

    engine.current = { go, pull: setPull };

    // ---- grabbing the front card and pulling it down to flip it
    let grab: { id: number; y: number; scroll: number; moved: boolean; trail: { y: number; t: number }[] } | null = null;
    let swallowClick = false;
    let snapBack = 0;

    function onDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0 || pulledAt >= 0) return;
      const hit = event.target instanceof Element ? event.target : null;
      const card = hit?.closest<HTMLElement>(".index-card");
      if (!card || els.indexOf(card) !== Math.round(target)) return;
      if (hit?.closest("a, button, input, [role='slider']")) return;
      grab = { id: event.pointerId, y: event.clientY, scroll: window.scrollY, moved: false, trail: [] };
    }

    function onDrag(event: PointerEvent) {
      if (!grab || grab.id !== event.pointerId) return;
      const dy = event.clientY - grab.y;
      if (!grab.moved) {
        if (Math.abs(dy) < 6) return;
        grab.moved = true;
        window.clearTimeout(snapBack);
        // free the scroll from its stops while the hand has the card
        root.style.scrollSnapType = "none";
        root.dataset.grabbing = "true";
      }
      grab.trail.push({ y: event.clientY, t: event.timeStamp });
      while (grab.trail.length > 2 && event.timeStamp - grab.trail[0]!.t > 100) grab.trail.shift();
      // pulling the card's top down towards you tips it forward, onto the next
      window.scrollTo({ top: grab.scroll + dy * (step / (height * 0.5)), behavior: "instant" });
    }

    function onRelease(event: PointerEvent) {
      if (!grab || grab.id !== event.pointerId) return;
      const was = grab;
      grab = null;
      if (!was.moved) return;
      swallowClick = true;
      delete root.dataset.grabbing;
      const first = was.trail[0];
      const lastPoint = was.trail.at(-1);
      const speed = first && lastPoint && lastPoint.t > first.t ? (lastPoint.y - first.y) / (lastPoint.t - first.t) : 0;
      // a flick carries on through a card or two
      go(Math.round(target + Math.max(-2, Math.min(2, speed * 1.4))));
      snapBack = window.setTimeout(() => root.style.removeProperty("scroll-snap-type"), 700);
    }

    const onScroll = () => {
      read();
      if (pulledAt >= 0 && Math.abs(target - pulledAt) > 0.04) setPull(false);
      setMoved(true);
      wake();
    };
    const onResize = () => {
      measure();
      fit();
      if (pulledAt >= 0) fan(els[pulledAt]!);
      for (const body of bodies) body.written = "";
      wake();
    };
    const onClick = (event: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      const hit = event.target instanceof Element ? event.target : null;
      const card = hit?.closest<HTMLElement>(".index-card");
      if (!card) {
        if (pulledAt >= 0) setPull(false);
        return;
      }
      const k = els.indexOf(card);
      // the card the scroll is on, even if the cards haven't caught up yet
      const front = Math.round(target);
      if (k !== front) {
        if (pulledAt >= 0) setPull(false);
        else go(k);
        return;
      }
      // links and buttons on the front card do their own thing; a photo on a
      // card still in the file pulls the card first
      const print = hit?.closest(".card-print");
      if (hit?.closest("a, button, input, [role='slider']") && !(print && pulledAt !== k)) return;
      if (print && pulledAt === k) return;
      setPull(pulledAt !== k);
    };
    let hoverAt = { x: 0, y: 0 };
    const onMove = (event: PointerEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".index-card") : null;
      const k = card ? els.indexOf(card) : -1;
      if (k === hover) return;
      // A raised card leaves its old place to the card in front of it; keep
      // it up until the pointer has properly moved away.
      const moved = Math.hypot(event.clientX - hoverAt.x, event.clientY - hoverAt.y);
      if (hover > k && hover > Math.round(target) + 1 && moved < peek) return;
      hover = k;
      hoverAt = { x: event.clientX, y: event.clientY };
      wake();
    };
    const onLeave = () => {
      hover = -1;
      wake();
    };
    // The eye follows the pointer, and the sheen on the front card with it.
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const vw = root.clientWidth;
      const vh = window.innerHeight;
      eye.tx = (event.clientX / vw - 0.5) * (narrow ? 0 : 70);
      eye.ty = (event.clientY / vh - 0.5) * (narrow ? 0 : 40);
      const sheen = els[Math.round(p)]?.querySelector<HTMLElement>(".card-sheen");
      if (sheen) {
        sheen.style.setProperty("--sx", `${(((event.clientX - left) / width) * 100).toFixed(1)}%`);
        sheen.style.setProperty("--sy", `${(((event.clientY - top) / height) * 100).toFixed(1)}%`);
      }
      wake();
    };
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.dataset.viewing) return;
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && pulledAt >= 0) {
        setPull(false);
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("[role='slider']")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(Math.round(target) + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(Math.round(target) - 1);
      } else if (event.key === "Enter" && (event.target === document.body || event.target === null)) {
        setPull(pulledAt < 0);
      }
    };
    // Tabbing to a link on a card behind flips to that card first.
    const onFocus = (event: FocusEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".index-card") : null;
      const k = card ? els.indexOf(card) : -1;
      if (k >= 0 && k !== Math.round(target)) go(k, false);
    };
    const onUnlock = () => unlockSound();

    measure();
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    // a page turn to a scene changes the typeface
    const onScene = () => requestAnimationFrame(fit);
    // The file fills as the page opens: the cards drop in from above, the
    // furthest first, the front one last.
    if (!still) {
      const start = performance.now() + 120;
      bodies.forEach((body, k) => {
        const r = k - p;
        if (r < -0.5 || r > BEHIND + 0.5) return;
        body.drop = 1;
        body.dropAt = start + (BEHIND - Math.round(r)) * 55;
      });
    }
    root.dataset.cardFile = "true";
    wake();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("aiden-scene-change", onScene);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onUnlock, { once: true });
    window.addEventListener("keydown", onUnlock, { once: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointermove", onDrag, { passive: true });
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    node.addEventListener("click", onClick);
    pile.addEventListener("pointerdown", onDown);
    pile.addEventListener("pointermove", onMove, { passive: true });
    pile.addEventListener("pointerleave", onLeave);
    pile.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(snapBack);
      delete root.dataset.cardFile;
      delete root.dataset.grabbing;
      root.style.removeProperty("scroll-snap-type");
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("aiden-scene-change", onScene);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onUnlock);
      window.removeEventListener("keydown", onUnlock);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      node.removeEventListener("click", onClick);
      pile.removeEventListener("pointerdown", onDown);
      pile.removeEventListener("pointermove", onMove);
      pile.removeEventListener("pointerleave", onLeave);
      pile.removeEventListener("focusin", onFocus);
    };
  }, [cards, count]);

  return (
    <section
      className="card-file"
      ref={file}
      aria-label="Portfolio, as a file of index cards"
      style={{ "--count": count } as CSSProperties}
    >
      {cards.map((card, k) => (
        <span
          className="card-snap"
          id={card.anchor}
          key={`${card.title}-${k}`}
          style={{ "--k": k } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      <div className="card-stage" ref={stage}>
        <span className="card-floor" aria-hidden="true" />
        <div className="card-stack" ref={stack}>
          <span className="card-rod" aria-hidden="true" />
          {children}
        </div>
      </div>
      <Scrubber
        cards={cards}
        current={current}
        pulled={pulled}
        hint={!moved}
        onGo={(k, smoothly) => engine.current?.go(k, smoothly)}
      />
    </section>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// A rule of ticks, one per card, along the foot of the window: hover one to
// see which card it is, click to flip there, or drag along it to riffle.
function Scrubber({
  cards,
  current,
  pulled,
  hint,
  onGo,
}: {
  cards: CardMeta[];
  current: number;
  pulled: boolean;
  hint: boolean;
  onGo: (index: number, smooth: boolean) => void;
}) {
  const ticks = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  function at(clientX: number) {
    const box = ticks.current?.getBoundingClientRect();
    if (!box) return 0;
    return Math.round(((clientX - box.left) / box.width) * (cards.length - 1));
  }

  return (
    <nav className="scrubber" aria-label="Cards in the file">
      <span className="scrubber-hint" data-hidden={hint ? undefined : "true"}>
        {pulled ? "Click anywhere to put it back" : "Scroll to flip · click a card to pull it"}
      </span>
      <div
        className="scrubber-ticks"
        ref={ticks}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = event.pointerId;
        }}
        onPointerMove={(event) => {
          if (drag.current !== event.pointerId) return;
          onGo(at(event.clientX), false);
        }}
        onPointerUp={(event) => {
          if (drag.current !== event.pointerId) return;
          drag.current = null;
          onGo(at(event.clientX), false);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <span className="scrubber-marker" aria-hidden="true" />
        {cards.map((card, k) => (
          <button
            type="button"
            className="scrubber-tick"
            key={`${card.title}-${k}`}
            data-kind={card.kind}
            data-title={card.title}
            aria-label={`Card ${k + 1}: ${card.title}`}
            aria-current={k === current ? "true" : undefined}
            onClick={(event) => {
              if (event.detail === 0) onGo(k, true);
            }}
          />
        ))}
      </div>
      <span className="scrubber-count" aria-live="polite">
        {pad(current + 1)} <span aria-hidden="true">/</span> {pad(cards.length)}
      </span>
    </nav>
  );
}

// The sections along the top of the page, lit for whichever the file is in.
export function FileNavigation({ navigation }: { navigation: NavigationItem[] }) {
  const [section, setSection] = useState("index");

  useEffect(() => {
    const onCard = (event: Event) => setSection((event as CustomEvent<string>).detail);
    window.addEventListener(cardEvent, onCard);
    return () => window.removeEventListener(cardEvent, onCard);
  }, []);

  return (
    <nav className="file-nav" aria-label="Sections">
      {navigation.map((item, index) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={section === item.id ? "location" : undefined}
        >
          <span className="file-nav-index">{pad(index + 1)}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function SoundToggle() {
  const muted = useMuted();
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      onClick={() => setMuted(!muted)}
    >
      <span aria-hidden="true">{muted ? "○" : "●"}</span>
      Sound
    </button>
  );
}
