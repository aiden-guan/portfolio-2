"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { CuttingLayer } from "@/components/mat/knife";
import { TorchLayer } from "@/components/mat/torch";
import { visitScene } from "@/components/scenery";
import { mountCuts } from "@/lib/cuts";
import { isSceneId } from "@/lib/scenery/catalog";
import { frank, punch, rustle, seat, snip, tap, tear, turnOver, unlockSound } from "@/lib/riffle";
import { mountTorch } from "@/lib/torch";
import { ASH_EVENT, type Pt, type Surface, Wear } from "@/lib/wear";

// The mat as a table top. Every thing on it (components/mat/things) can be
// picked up and moved: the point the hand holds stays under the pointer,
// and the sheet swings about it as the mat drags at its middle, so pulling
// a card by its corner turns it the way paper turns. Let go while moving and
// it slides to a stop. A click turns a sheet over (or punches a ticket, or
// opens a print or the envelope, or clocks in on a time card), a ticket's
// stub tears off along its perforation, and Tidy squares everything back up.
// Wherever a thing has been taken from, crop marks stay printed on the mat,
// and a thing set down close to its marks is pulled square onto them.
//
// Things can be cut and burnt (lib/wear). The knife cuts whatever it's drawn
// across, every layer of it, and drawn right across a sheet parts it in two:
// the piece that comes away is a copy of the sheet laid exactly over it,
// each clipped to its own side of the cut, and from then on each moves on
// its own. A flame burns the topmost sheet under it, and through a hole, the
// next. Tidy puts the pieces back where they belong and mends them.
//
// Everything is laid out by CSS where it belongs; the table only adds an
// offset and a turn to each thing, as transforms. The bare mat is for
// cutting (lib/cuts), and its rulers follow the pointer, or the extent of
// whatever is held, the way a drawing program's do.

export const MESS_EVENT = "aiden-mat-mess";
export const TIDY_EVENT = "aiden-mat-tidy";

type Body = {
  el: HTMLElement;
  turn: HTMLElement;
  action: string;
  // offset from home and turn (px, radians), and how fast each is changing
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  // home: the centre CSS put it at, in mat coordinates, and its size
  hx: number;
  hy: number;
  w: number;
  h: number;
  // how far it is lifted off the mat (0..1)
  lift: number;
  vlift: number;
  z: number;
  moving: boolean;
  homing: boolean;
  homeAt: number;
  joint?: string;
  stubOf?: string;
  // a stub still joined to its ticket goes wherever the ticket goes
  joinedTo: Body | null;
  written: string;
  writtenTurn: string;
  // the crop marks where it belongs, whether they show, and whether it is
  // being pulled onto them
  mark: HTMLElement | null;
  marked: boolean;
  seating: boolean;
  // the point it turns about, in its own pixels: its middle, or once it's
  // been cut, the middle of what's left of it
  ox: number;
  oy: number;
  // what's been done to it, the thing it was cut from (itself, if it's
  // whole), whether it's burnt away, and whether Tidy is mending it
  wear: Wear | null;
  root: Body;
  gone: boolean;
  mend: boolean;
};

type Grab = {
  body: Body;
  id: number;
  // the held point, in the sheet's own frame, from its centre
  lx: number;
  ly: number;
  // the pointer in client coordinates, and the held point's velocity
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  lastX: number;
  lastY: number;
  // how far a stub has been pulled from its ticket
  strain: number;
  startX: number;
  startY: number;
};

type Pending = {
  body: Body;
  id: number;
  x: number;
  y: number;
  touch: boolean;
  timer: number;
};

// sliding friction (1/s): a flick travels about v / FRICTION pixels
const FRICTION = 5.2;
const SPIN_FRICTION = 6.5;
// how hard the mat drags at a held sheet's middle, and the swing's damping
const DRAG = 9;
const SWING_DAMP = 3.2;
const MAX_SPEED = 2600;
// how far a stub has to be pulled before it gives
const TEAR_AT = 46;
// how close to its marks (in mm, and radians off square) a thing has to come
// to rest to be pulled onto them
const SEAT_MM = 4.5;
const SEAT_TURN = 0.1;
// how many pieces things can be cut into, all told
const MAX_PIECES = 40;

const clockTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function Table({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mat = root.current;
    if (!mat) return;
    const html = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = [...mat.querySelectorAll<HTMLElement>(".thing")];
    const bodies: Body[] = els.map((el) => {
      const body: Body = {
      el,
      turn: el.querySelector<HTMLElement>(".thing-turn") ?? el,
      action: el.dataset.action ?? "none",
      x: 0,
      y: 0,
      a: 0,
      vx: 0,
      vy: 0,
      va: 0,
      hx: 0,
      hy: 0,
      w: 0,
      h: 0,
      lift: 0,
      vlift: 0,
      z: 0,
      moving: false,
      homing: false,
      homeAt: 0,
      joint: el.dataset.joint,
      stubOf: el.dataset.stub,
      joinedTo: null,
      written: "",
      writtenTurn: "",
      mark: null,
      marked: false,
      seating: false,
      ox: 0,
      oy: 0,
      wear: null,
      root: null as unknown as Body,
      gone: false,
      mend: false,
      };
      body.root = body;
      return body;
    });
    const byEl = new Map(bodies.map((body) => [body.el, body]));
    for (const body of bodies) {
      if (body.stubOf) body.joinedTo = bodies.find((other) => other.joint === body.stubOf) ?? null;
    }
    const stubsOf = (body: Body) => bodies.filter((other) => other.joinedTo === body);

    // Crop marks where each thing belongs, printed under everything and only
    // shown while it's away. The card's place is dimensioned on the mat
    // already, and a stub's place is part of its ticket's until it's torn.
    const cuts = mat.querySelector(".mat-cuts");
    for (const body of bodies) {
      if (body.el.closest(".mat-hero-card")) continue;
      const mark = document.createElement("span");
      mark.className = "home-mark";
      mark.setAttribute("aria-hidden", "true");
      if (cuts) cuts.before(mark);
      else mat.append(mark);
      body.mark = mark;
    }

    // The ruler printed down the mat's edge, numbered every centimetre.
    const scale = document.createElement("div");
    scale.className = "mat-scale";
    scale.setAttribute("aria-hidden", "true");
    mat.prepend(scale);
    let scaleKey = "";

    const guideX = document.querySelector<HTMLElement>(".ruler-guide-x");
    const guideY = mat.querySelector<HTMLElement>(".ruler-guide-y");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let pointerX = -1;
    let pointerY = -1;
    let guideRaf = 0;

    let matW = 0;
    let matH = 0;
    let mm = 4;
    let topZ = 10;
    let raf = 0;
    let last = 0;
    let grab: Grab | null = null;
    let pending: Pending | null = null;
    let swallowClick = false;
    let messy = false;

    function measure() {
      matW = mat!.offsetWidth;
      matH = mat!.offsetHeight;
      // .mat-scale is 100 mm wide, which says how big a millimetre is here
      mm = scale.getBoundingClientRect().width / 100 || 4;
      // a piece lies exactly where the thing it was cut from does
      for (const body of bodies) {
        if (body.root === body) continue;
        body.el.style.left = `${body.root.el.offsetLeft}px`;
        body.el.style.top = `${body.root.el.offsetTop}px`;
      }
      for (const body of bodies) {
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = body.el;
        while (node && node !== mat) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        body.w = body.el.offsetWidth;
        body.h = body.el.offsetHeight;
        if (body.wear) {
          body.wear.resize(body.w, body.h);
          pivotAt(body, body.wear.pivot());
        } else {
          body.ox = body.w / 2;
          body.oy = body.h / 2;
        }
        body.hx = x + body.ox;
        body.hy = y + body.oy;
        body.written = "";
      }
      for (const body of bodies) {
        if (!body.mark) continue;
        let x0 = body.hx - body.ox;
        let y0 = body.hy - body.oy;
        let x1 = x0 + body.w;
        let y1 = y0 + body.h;
        // a ticket's place takes in its stub's
        for (const stub of bodies) {
          if (!body.joint || stub.stubOf !== body.joint) continue;
          x0 = Math.min(x0, stub.hx - stub.w / 2);
          y0 = Math.min(y0, stub.hy - stub.h / 2);
          x1 = Math.max(x1, stub.hx + stub.w / 2);
          y1 = Math.max(y1, stub.hy + stub.h / 2);
        }
        const style = body.mark.style;
        style.left = `${x0}px`;
        style.top = `${y0}px`;
        style.width = `${x1 - x0}px`;
        style.height = `${y1 - y0}px`;
      }
      number();
    }

    // A number beside every centimetre of the ruler, counted from the top.
    function number() {
      const band = parseFloat(getComputedStyle(html).getPropertyValue("--band")) * 16 || 50;
      const step = mm * 10;
      const count = Math.max(0, Math.floor((matH - band) / step));
      const key = `${count}:${step.toFixed(3)}:${band}`;
      if (key === scaleKey) return;
      scaleKey = key;
      const numbers = document.createDocumentFragment();
      for (let n = 1; n <= count; n++) {
        const label = document.createElement("span");
        label.textContent = String(n);
        label.style.top = `${(band + n * step).toFixed(2)}px`;
        numbers.append(label);
      }
      scale.replaceChildren(numbers);
    }

    function toMat(clientX: number, clientY: number) {
      const box = mat!.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    }

    // A joined stub sits where the ticket's turn and offset carry it.
    function follow(stub: Body, ticket: Body) {
      const dx = stub.hx - ticket.hx;
      const dy = stub.hy - ticket.hy;
      const cos = Math.cos(ticket.a);
      const sin = Math.sin(ticket.a);
      stub.x = ticket.hx + ticket.x + dx * cos - dy * sin - stub.hx;
      stub.y = ticket.hy + ticket.y + dx * sin + dy * cos - stub.hy;
      stub.a = ticket.a;
      stub.lift = ticket.lift;
    }

    // Things on the move get layers of their own; at rest they give them back.
    function liven(body: Body, on: boolean) {
      if (body.el.classList.contains("is-live") !== on) body.el.classList.toggle("is-live", on);
    }

    function write(body: Body) {
      const css = `translate3d(${body.x.toFixed(2)}px, ${body.y.toFixed(2)}px, 0)`;
      if (css !== body.written) {
        body.written = css;
        body.el.style.transform = css;
      }
      const turn = `rotate(${body.a.toFixed(4)}rad) scale(${(1 + 0.028 * body.lift).toFixed(4)})`;
      if (turn !== body.writtenTurn) {
        body.writtenTurn = turn;
        body.turn.style.transform = turn;
      }
    }

    function raise(body: Body) {
      body.z = ++topZ;
      body.el.style.zIndex = String(body.z);
      for (const stub of stubsOf(body)) {
        stub.z = ++topZ;
        stub.el.style.zIndex = String(stub.z);
      }
    }

    function checkMess() {
      const now = bodies.some(
        (body) =>
          Math.abs(body.x) > 0.5 ||
          Math.abs(body.y) > 0.5 ||
          Math.abs(body.a) > 0.002 ||
          body.el.classList.contains("is-turned") ||
          (body.stubOf !== undefined && body.joinedTo === null) ||
          body.wear !== null ||
          body.gone,
      );
      if (now === messy) return;
      messy = now;
      window.dispatchEvent(new CustomEvent(MESS_EVENT, { detail: messy }));
    }

    function wake() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      let busy = false;

      if (grab) {
        busy = true;
        stepHeld(grab, dt);
      }

      for (const body of bodies) {
        if (grab?.body === body) continue;
        if (body.joinedTo) continue;
        if (body.homing) {
          if (now < body.homeAt) {
            busy = true;
            continue;
          }
          busy = stepHome(body, dt) || busy;
        } else if (body.moving) {
          busy = stepSlide(body, dt) || busy;
        }
        // set down: the lift settles back onto the mat
        if (body.lift > 0.0005 || Math.abs(body.vlift) > 0.001) {
          body.vlift += (-body.lift * 260 - body.vlift * 26) * dt;
          body.lift += body.vlift * dt;
          if (body.lift < 0.0005 && Math.abs(body.vlift) < 0.001) {
            body.lift = 0;
            body.vlift = 0;
          } else busy = true;
        }
      }

      for (const body of bodies) {
        if (body.joinedTo) follow(body, body.joinedTo);
        write(body);
        const joined = body.joinedTo;
        liven(
          body,
          grab?.body === body ||
            body.moving ||
            body.homing ||
            body.lift > 0 ||
            (joined !== null && (grab?.body === joined || joined.moving || joined.homing)),
        );
        markHome(body);
      }

      if (grab) guides();
      if (busy) wake();
      else checkMess();
    }

    // Its crop marks show while a thing is away from them.
    function markHome(body: Body) {
      if (!body.mark) return;
      const away = Math.abs(body.x) > 1 || Math.abs(body.y) > 1 || Math.abs(body.a) > 0.01;
      const show = away && !(body.stubOf !== undefined && body.joinedTo !== null);
      if (show === body.marked) return;
      body.marked = show;
      body.mark.toggleAttribute("data-shown", show);
    }

    // The rulers mark where the pointer is, or the extent of what's held.
    function guides() {
      guideRaf = 0;
      if (!guideX || !guideY) return;
      const held = grab?.body;
      const shown = pointerX >= 0 && fine.matches;
      guideX.toggleAttribute("data-shown", shown);
      guideY.toggleAttribute("data-shown", shown);
      if (!shown) return;
      let x = pointerX;
      let y = pointerY;
      let across = 1;
      let down = 1;
      if (held) {
        const box = mat!.getBoundingClientRect();
        const lift = 1 + 0.028 * held.lift;
        const cos = Math.abs(Math.cos(held.a));
        const sin = Math.abs(Math.sin(held.a));
        across = (cos * held.w + sin * held.h) * lift;
        down = (sin * held.w + cos * held.h) * lift;
        x = box.left + held.hx + held.x - across / 2;
        y = box.top + held.hy + held.y - down / 2;
      }
      guideX.toggleAttribute("data-span", Boolean(held));
      guideY.toggleAttribute("data-span", Boolean(held));
      guideX.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      guideX.style.width = `${Math.max(1, across).toFixed(1)}px`;
      guideY.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      guideY.style.height = `${Math.max(1, down).toFixed(1)}px`;
    }

    // Carrying something to the top or bottom of the window scrolls the mat
    // under it, so it can be taken from one section to another.
    function carry(held: Grab, dt: number) {
      const top = parseFloat(getComputedStyle(html).getPropertyValue("--band")) * 16 || 50;
      const zone = 64;
      const low = window.innerHeight - zone;
      let speed = 0;
      if (held.cy < top + zone) speed = -Math.min(1, (top + zone - held.cy) / zone);
      else if (held.cy > low) speed = Math.min(1, (held.cy - low) / zone);
      // instant: the page's smooth scrolling would lag a frame behind the hand
      if (speed) window.scrollBy({ top: speed * 900 * dt, behavior: "instant" });
    }

    // The held point stays under the pointer; the sheet swings about it.
    function stepHeld(held: Grab, dt: number) {
      const body = held.body;
      carry(held, dt);
      const point = toMat(held.cx, held.cy);
      // the held point's velocity, smoothed over a few frames
      const gvx = (point.x - held.lastX) / dt;
      const gvy = (point.y - held.lastY) / dt;
      held.vx += (gvx - held.vx) * Math.min(1, dt * 18);
      held.vy += (gvy - held.vy) * Math.min(1, dt * 18);
      held.lastX = point.x;
      held.lastY = point.y;

      if (body.joinedTo) {
        // a stub still on its ticket gives a little, then tears
        const pull = Math.hypot(held.cx - held.startX, held.cy - held.startY);
        held.strain = pull;
        if (pull > TEAR_AT) {
          body.joinedTo = null;
          raise(body);
          if (!still) tear();
          // the tear lets go of it a little way along the pull
          body.vx = 0;
          body.vy = 0;
        } else {
          return;
        }
      }

      const cos = Math.cos(body.a);
      const sin = Math.sin(body.a);
      // the held point, from the centre, in the mat's frame
      const rx = cos * held.lx - sin * held.ly;
      const ry = sin * held.lx + cos * held.ly;
      if (!still) {
        // the middle's velocity, and the mat's drag on it
        const vcx = held.vx + body.va * ry;
        const vcy = held.vy - body.va * rx;
        const fx = -DRAG * vcx;
        const fy = -DRAG * vcy;
        const torque = -rx * fy + ry * fx;
        const inertia = (body.w * body.w + body.h * body.h) / 12 + rx * rx + ry * ry;
        body.va += (torque / inertia) * dt;
        body.va *= Math.exp(-SWING_DAMP * dt);
        body.va = Math.max(-9, Math.min(9, body.va));
        body.a += body.va * dt;
      }
      const cos2 = Math.cos(body.a);
      const sin2 = Math.sin(body.a);
      const nx = point.x - (cos2 * held.lx - sin2 * held.ly);
      const ny = point.y - (sin2 * held.lx + cos2 * held.ly);
      body.vx = (nx - (body.hx + body.x)) / dt;
      body.vy = (ny - (body.hy + body.y)) / dt;
      body.x = nx - body.hx;
      body.y = ny - body.hy;
      // lifted while held
      body.vlift += ((1 - body.lift) * 300 - body.vlift * 30) * dt;
      body.lift += body.vlift * dt;
      if (!still) rustle(Math.hypot(held.vx, held.vy));
    }

    // Sliding to a stop after being let go.
    function stepSlide(body: Body, dt: number) {
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.a += body.va * dt;
      const k = Math.exp(-FRICTION * dt);
      body.vx *= k;
      body.vy *= k;
      body.va *= Math.exp(-SPIN_FRICTION * dt);
      keepOnMat(body);
      const speed = Math.hypot(body.vx, body.vy);
      if (!still) rustle(speed * 0.8);
      if (speed < 6 && Math.abs(body.va) < 0.03) {
        body.vx = 0;
        body.vy = 0;
        body.va = 0;
        body.moving = false;
        // come to rest by its marks: pulled square onto them
        if (nearHome(body)) {
          if (still) {
            body.x = 0;
            body.y = 0;
            body.a = 0;
            arrive(body);
            seat();
            return false;
          }
          body.homing = true;
          body.homeAt = performance.now();
          body.seating = true;
          return true;
        }
        return false;
      }
      return true;
    }

    function nearHome(body: Body) {
      // a piece only goes back with the rest of its sheet, when it's tidied
      if (cut(body)) return false;
      const turn = body.a - Math.round(body.a / (Math.PI * 2)) * Math.PI * 2;
      return Math.hypot(body.x, body.y) < mm * SEAT_MM && Math.abs(turn) < SEAT_TURN;
    }

    // Squaring up: a critically damped spring back to where CSS put it.
    function stepHome(body: Body, dt: number) {
      const k = 150;
      const c = 2 * Math.sqrt(k);
      body.vx += (-body.x * k - body.vx * c) * dt;
      body.vy += (-body.y * k - body.vy * c) * dt;
      // turn the short way round
      const turns = Math.round(body.a / (Math.PI * 2));
      const target = turns * Math.PI * 2;
      body.va += (-(body.a - target) * k - body.va * c) * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.a += body.va * dt;
      if (Math.abs(body.x) + Math.abs(body.y) < 0.3 && Math.abs(body.a - target) < 0.002 && Math.hypot(body.vx, body.vy) < 2) {
        body.x = 0;
        body.y = 0;
        body.a = 0;
        arrive(body);
        if (body.seating) {
          body.seating = false;
          seat();
        }
        return false;
      }
      return true;
    }

    // Home and square: at rest, and joined back up with its stub.
    function arrive(body: Body) {
      body.vx = 0;
      body.vy = 0;
      body.va = 0;
      body.homing = false;
      body.moving = false;
      // a stub that was torn off goes back on once both are home
      if (body.stubOf && !body.joinedTo) {
        const ticket = bodies.find((other) => other.joint === body.stubOf);
        if (ticket && !ticket.homing && ticket.x === 0 && ticket.y === 0) body.joinedTo = ticket;
      }
      if (body.joint) {
        for (const stub of bodies) {
          if (stub.stubOf === body.joint && !stub.joinedTo && !stub.homing && stub.x === 0 && stub.y === 0) {
            stub.joinedTo = body;
          }
        }
      }
      if (body.root.mend) mendSheet(body.root);
    }

    function keepOnMat(body: Body) {
      const margin = Math.min(body.w, body.h) * 0.35;
      const cx = body.hx + body.x;
      const cy = body.hy + body.y;
      if (cx < margin) {
        body.x += margin - cx;
        body.vx = Math.abs(body.vx) * 0.3;
      } else if (cx > matW - margin) {
        body.x -= cx - (matW - margin);
        body.vx = -Math.abs(body.vx) * 0.3;
      }
      if (cy < margin) {
        body.y += margin - cy;
        body.vy = Math.abs(body.vy) * 0.3;
      } else if (cy > matH - margin) {
        body.y -= cy - (matH - margin);
        body.vy = -Math.abs(body.vy) * 0.3;
      }
    }

    function begin(body: Body, id: number, clientX: number, clientY: number) {
      const point = toMat(clientX, clientY);
      const cx = body.hx + body.x;
      const cy = body.hy + body.y;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const cos = Math.cos(-body.a);
      const sin = Math.sin(-body.a);
      body.homing = false;
      body.moving = false;
      body.seating = false;
      body.vx = 0;
      body.vy = 0;
      grab = {
        body,
        id,
        lx: dx * cos - dy * sin,
        ly: dx * sin + dy * cos,
        cx: clientX,
        cy: clientY,
        vx: 0,
        vy: 0,
        lastX: point.x,
        lastY: point.y,
        strain: 0,
        startX: clientX,
        startY: clientY,
      };
      raise(body);
      body.el.classList.add("is-held");
      html.dataset.holding = "true";
      unlockSound();
      wake();
    }

    function release() {
      if (!grab) return;
      const body = grab.body;
      grab = null;
      delete html.dataset.holding;
      body.el.classList.remove("is-held");
      // the rulers go back to the pointer
      if (!guideRaf) guideRaf = requestAnimationFrame(guides);
      if (body.joinedTo) {
        // never came off: back flat on its ticket
        wake();
        return;
      }
      const speed = Math.hypot(body.vx, body.vy);
      if (still || speed < 40) {
        body.vx = 0;
        body.vy = 0;
        body.va = still ? 0 : body.va * 0.4;
      } else if (speed > MAX_SPEED) {
        body.vx *= MAX_SPEED / speed;
        body.vy *= MAX_SPEED / speed;
      }
      body.moving = true;
      tap(Math.min(1, 0.3 + speed / 3000));
      wake();
    }

    // What a click on a thing does: turn it over, punch it, open it.
    function act(body: Body, clientX?: number, clientY?: number) {
      if (body.action === "flip") {
        const turned = !body.el.classList.contains("is-turned");
        body.el.classList.toggle("is-turned", turned);
        if (!still) {
          body.el.classList.remove("is-turning");
          // restart the lift that goes with the turn
          void body.el.offsetWidth;
          body.el.classList.add("is-turning");
          window.setTimeout(() => {
            body.el.classList.remove("is-turning");
            body.wear?.refresh();
          }, 760);
        }
        raise(body);
        unlockSound();
        turnOver();
        if (body.wear) {
          body.wear.refresh();
          wakeWear();
        }
        window.setTimeout(checkMess, 50);
      } else if (body.action === "punch") {
        punchHole(body, clientX, clientY);
      } else if (body.action === "clock") {
        clockIn(body);
      } else if (body.action === "travel") {
        const place = body.el.dataset.scene;
        if (isSceneId(place)) {
          unlockSound();
          turnOver();
          visitScene(place);
        }
      } else if (body.action === "mail") {
        const href = body.el.dataset.href;
        if (!href) return;
        // franked where and when it was posted, then off it goes
        postmark(body);
        window.setTimeout(() => (window.location.href = href), still ? 0 : 420);
      }
    }

    // The postmark comes down on the envelope's stamp with the sender's town
    // (as far as their clock says) and the hour it was posted.
    function postmark(body: Body) {
      const mark = body.el.querySelector(".ev-postmark");
      if (!mark) return;
      const now = new Date();
      let town = "";
      try {
        town = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ") ?? "";
      } catch {}
      const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
      const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(now);
      const ring = mark.querySelector("textPath");
      if (ring) ring.textContent = `${town || "Par avion"} · ${time} ·`.toUpperCase();
      const dayText = mark.querySelector(".ev-postmark-day");
      if (dayText) dayText.textContent = day.toUpperCase();
      const year = mark.querySelector(".ev-postmark-year");
      if (year) year.textContent = String(now.getFullYear());
      body.el.classList.remove("is-franked");
      void body.el.offsetWidth;
      body.el.classList.add("is-franked");
      unlockSound();
      frank();
    }

    function punchHole(body: Body, clientX?: number, clientY?: number) {
      const holes = body.el.querySelector<HTMLElement>(".holes");
      if (!holes) return;
      let u = 0.5;
      let v = 0.5;
      if (clientX !== undefined && clientY !== undefined) {
        const point = toMat(clientX, clientY);
        const dx = point.x - (body.hx + body.x);
        const dy = point.y - (body.hy + body.y);
        const cos = Math.cos(-body.a);
        const sin = Math.sin(-body.a);
        u = 0.5 + (dx * cos - dy * sin) / body.w;
        v = 0.5 + (dx * sin + dy * cos) / body.h;
      } else {
        u = 0.25 + Math.random() * 0.5;
        v = 0.3 + Math.random() * 0.4;
      }
      const hole = document.createElement("span");
      hole.className = "hole";
      hole.style.left = `${(Math.min(0.97, Math.max(0.03, u)) * 100).toFixed(2)}%`;
      hole.style.top = `${(Math.min(0.94, Math.max(0.06, v)) * 100).toFixed(2)}%`;
      holes.append(hole);
      while (holes.children.length > 8) holes.firstElementChild?.remove();
      unlockSound();
      punch();
    }

    // The time clock prints the hour into the next empty row of the card.
    function clockIn(body: Body) {
      const cell = body.el.querySelector<HTMLElement>(".tc-empty");
      unlockSound();
      punch();
      if (!cell) return;
      const time = clockTime.format(new Date()).replace(/\s?([AP])M$/i, "$1");
      cell.classList.replace("tc-empty", "tc-punch");
      cell.classList.add("is-new");
      const text = document.createElement("span");
      text.textContent = time;
      cell.append(text);
      cell.removeAttribute("aria-hidden");
    }

    function tidy() {
      const now = performance.now();
      let order = 0;
      // what was burnt away comes back, to be mended with the rest
      for (const body of bodies) {
        if (!body.gone) continue;
        body.gone = false;
        body.el.classList.remove("is-ash");
      }
      // whatever is out of place, the furthest out first
      const out = bodies
        .filter(
          (body) =>
            Math.abs(body.x) > 0.5 ||
            Math.abs(body.y) > 0.5 ||
            Math.abs(body.a) > 0.002 ||
            (body.stubOf !== undefined && !body.joinedTo),
        )
        .sort((p, q) => Math.hypot(q.x, q.y) - Math.hypot(p.x, p.y));
      for (const body of bodies) {
        if (body.el.classList.contains("is-turned")) {
          body.el.classList.remove("is-turned");
        }
      }
      for (const body of out) {
        if (body.joinedTo) continue;
        if (still) {
          body.x = 0;
          body.y = 0;
          body.a = 0;
          body.vx = body.vy = body.va = 0;
          continue;
        }
        body.homing = true;
        body.moving = false;
        body.homeAt = now + order * 45;
        order += 1;
      }
      if (still) {
        for (const body of bodies) if (body.stubOf) body.joinedTo = bodies.find((other) => other.joint === body.stubOf) ?? null;
      }
      // everything cut or burnt is mended once all of it is home
      for (const body of bodies) {
        if (!body.wear) continue;
        body.root.mend = true;
      }
      for (const body of bodies.slice()) if (body.root === body && body.mend) mendSheet(body);
      if (order) tap(0.4);
      wake();
    }

    // ---- cutting and burning

    // A point on the mat in a thing's own frame: its pixels from the top
    // left of its front, wherever it lies and whichever way up.
    function local(body: Body, x: number, y: number): Pt {
      const s = 1 + 0.028 * body.lift;
      const dx = x - (body.hx + body.x);
      const dy = y - (body.hy + body.y);
      const cos = Math.cos(body.a);
      const sin = Math.sin(body.a);
      let lx = (dx * cos + dy * sin) / s;
      const ly = (dy * cos - dx * sin) / s;
      if (body.el.classList.contains("is-turned")) lx = -lx;
      return { x: body.ox + lx, y: body.oy + ly };
    }

    // ...and back to the mat.
    function onMat(body: Body, p: Pt): Pt {
      const s = 1 + 0.028 * body.lift;
      let lx = p.x - body.ox;
      const ly = p.y - body.oy;
      if (body.el.classList.contains("is-turned")) lx = -lx;
      const cos = Math.cos(body.a);
      const sin = Math.sin(body.a);
      return { x: body.hx + body.x + s * (lx * cos - ly * sin), y: body.hy + body.y + s * (lx * sin + ly * cos) };
    }

    function covers(body: Body, p: Pt) {
      if (body.wear) return body.wear.contains(p);
      return p.x >= 0 && p.y >= 0 && p.x <= body.w && p.y <= body.h;
    }

    // Whether a thing has been cut into pieces.
    function cut(body: Body) {
      return body.root !== body || bodies.some((other) => other !== body && other.root === body);
    }

    const wearing = new Set<Body>();
    let wearRaf = 0;
    let wearLast = 0;

    function worn(body: Body) {
      if (!body.wear) body.wear = new Wear(body.el, body.w, body.h, mm);
      wearing.add(body);
      return body.wear;
    }

    function wakeWear() {
      if (wearRaf) return;
      wearLast = performance.now();
      wearRaf = requestAnimationFrame(wearFrame);
    }

    function wearFrame(now: number) {
      wearRaf = 0;
      const dt = Math.min(1 / 20, Math.max(1 / 240, (now - wearLast) / 1000));
      wearLast = now;
      let busy = false;
      for (const body of wearing) {
        const wear = body.wear;
        if (!wear) {
          wearing.delete(body);
          continue;
        }
        busy = wear.tick(dt, now) || busy;
        if (wear.mended) {
          // whole again, and nothing left to show of it
          wear.dispose();
          body.wear = null;
          wearing.delete(body);
          body.el.style.removeProperty("--ox");
          body.el.style.removeProperty("--oy");
          window.setTimeout(checkMess, 0);
        }
      }
      if (busy) wearRaf = requestAnimationFrame(wearFrame);
    }

    // Moves the point a thing turns about without moving the thing.
    function pivotAt(body: Body, o: Pt) {
      const dx = o.x - body.ox;
      const dy = o.y - body.oy;
      if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) {
        const s = 1 + 0.028 * body.lift;
        const fx = body.el.classList.contains("is-turned") ? -dx : dx;
        const cos = Math.cos(body.a);
        const sin = Math.sin(body.a);
        body.x += -dx + s * (fx * cos - dy * sin);
        body.y += -dy + s * (fx * sin + dy * cos);
        body.hx += dx;
        body.hy += dy;
        body.ox = o.x;
        body.oy = o.y;
      }
      body.el.style.setProperty("--ox", `${o.x.toFixed(2)}px`);
      body.el.style.setProperty("--oy", `${o.y.toFixed(2)}px`);
      body.written = "";
      body.writtenTurn = "";
    }

    // The blade's way through each thing it's crossing, this stroke.
    type Pass = { inside: boolean; from: { edge: number; t: number } | null; path: Pt[]; prev: Pt };
    let stroke = -1;
    const passes = new Map<Body, Pass>();

    function blade(id: number, x: number, y: number) {
      if (id !== stroke) {
        lift();
        stroke = id;
      }
      let paper = false;
      let marked = false;
      for (const body of bodies.slice()) {
        if (body.gone || grab?.body === body) continue;
        const p = local(body, x, y);
        const pass = passes.get(body);
        const now = covers(body, p);
        if (now) paper = true;
        if (!pass) {
          // the blade came down on it (through a hole in what's above)
          passes.set(body, { inside: now, from: null, path: now ? [p] : [], prev: p });
          if (now) {
            worn(body).slitTo(p, true);
            marked = true;
          }
          continue;
        }
        if (now) {
          const wear = worn(body);
          if (!pass.inside) {
            // in across its edge
            const edge = wear.edgeOf(p, pass.prev);
            const start = edge?.point ?? p;
            pass.from = edge ? { edge: edge.edge, t: edge.t } : null;
            pass.path = [start, p];
            wear.slitTo(start, true);
          } else {
            pass.path.push(p);
          }
          wear.slitTo(p, false);
          pass.inside = true;
          marked = true;
        } else if (pass.inside) {
          // out across its edge: right through, so it parts
          const wear = worn(body);
          const edge = wear.edgeOf(pass.prev, p);
          if (edge) {
            pass.path.push(edge.point);
            wear.slitTo(edge.point, false);
          }
          pass.inside = false;
          marked = true;
          if (edge && pass.from && partSheet(body, pass.path, pass.from, edge)) {
            const piece = bodies[bodies.indexOf(body) + 1];
            if (piece) passes.set(piece, { inside: false, from: null, path: [], prev: local(piece, x, y) });
          } else {
            wear.endSlit();
          }
          pass.path = [];
          pass.from = null;
        }
        pass.prev = p;
      }
      if (marked) {
        wakeWear();
        if (!messy) checkMess();
      }
      return paper;
    }

    function lift() {
      for (const [body, pass] of passes) if (pass.inside) body.wear?.endSlit();
      passes.clear();
      stroke = -1;
    }

    // Parts a sheet along the way the blade took through it: the sheet keeps
    // one side, and a copy of it laid over it takes the other.
    function partSheet(body: Body, path: Pt[], from: { edge: number; t: number }, to: { edge: number; t: number }) {
      const wear = body.wear;
      if (!wear || bodies.length - els.length >= MAX_PIECES) return false;
      const other = wear.part(path, from.edge, from.t, to.edge, to.t);
      if (!other) return false;
      const root = body.root;
      const el = body.el.cloneNode(true) as HTMLElement;
      el.removeAttribute("id");
      el.dataset.piece = "";
      delete el.dataset.joint;
      delete el.dataset.stub;
      el.classList.remove("is-held", "is-turning", "is-live");
      // the sheet is read once, whole: its pieces are just paper
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.querySelectorAll("a, button, video, [tabindex]").forEach((node) => node.setAttribute("tabindex", "-1"));
      el.style.position = "absolute";
      el.style.margin = "0";
      el.style.left = `${root.el.offsetLeft}px`;
      el.style.top = `${root.el.offsetTop}px`;
      body.el.after(el);
      const piece: Body = {
        ...body,
        el,
        turn: el.querySelector<HTMLElement>(".thing-turn") ?? el,
        joint: undefined,
        stubOf: undefined,
        joinedTo: null,
        written: "",
        writtenTurn: "",
        mark: null,
        marked: false,
        homing: false,
        seating: false,
        wear: null,
        mend: false,
      };
      piece.wear = new Wear(el, body.w, body.h, mm, wear);
      piece.wear.outline(other);
      bodies.splice(bodies.indexOf(body) + 1, 0, piece);
      byEl.set(el, piece);
      wearing.add(piece);
      // cut through, a stub comes away from its ticket, and a ticket its stub
      body.joinedTo = null;
      for (const stub of stubsOf(body)) stub.joinedTo = null;
      // a film keeps playing in both halves
      el.querySelectorAll<HTMLVideoElement>("video").forEach((film, i) => {
        const source = body.el.querySelectorAll<HTMLVideoElement>("video")[i];
        film.muted = true;
        if (source) film.currentTime = source.currentTime;
        if (source && !source.paused) film.play().catch(() => {});
      });

      // each side settles about its own middle, and they come apart a hair
      const a = path[0]!;
      const b = path[path.length - 1]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      for (const side of [body, piece]) {
        pivotAt(side, side.wear!.pivot());
        if (still) continue;
        const sign = Math.sign((side.ox - (a.x + b.x) / 2) * nx + (side.oy - (a.y + b.y) / 2) * ny) || 1;
        const speed = 9 + Math.random() * 5;
        const vx = nx * sign * speed * (side.el.classList.contains("is-turned") ? -1 : 1);
        const vy = ny * sign * speed;
        side.vx += vx * Math.cos(side.a) - vy * Math.sin(side.a);
        side.vy += vx * Math.sin(side.a) + vy * Math.cos(side.a);
        side.va += (Math.random() - 0.5) * 0.06;
        side.moving = true;
        side.homing = false;
        write(side);
      }
      snip();
      wake();
      return true;
    }

    // The flame's heat on whatever's uppermost under it.
    function heat(x: number, y: number, radius: number, power: number, dt: number) {
      const stack = bodies
        .map((body, index) => ({ body, index }))
        .filter(({ body }) => !body.gone)
        .sort((p, q) => q.body.z - p.body.z || q.index - p.index);
      for (const { body } of stack) {
        const p = local(body, x, y);
        if (!covers(body, p)) continue;
        const wear = worn(body);
        // over a hole, the flame eats at its edge and goes on through
        const through = wear.inHole(p);
        const char = wear.burn(p, radius, power, dt);
        wakeWear();
        if (wear.left < 0.16) crumble(body);
        if (!messy) checkMess();
        if (through) continue;
        return { on: "paper" as const, char, kind: body.el.dataset.thing ?? "" };
      }
      return { on: "mat" as const, char: 0, kind: "" };
    }

    // Burnt almost all away: what's left of it falls to ash.
    function crumble(body: Body) {
      if (body.gone) return;
      body.gone = true;
      body.el.classList.add("is-ash");
      const box = body.el.getBoundingClientRect();
      const at = mat!.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent(ASH_EVENT, { detail: { x: box.left - at.left, y: box.top - at.top, w: box.width, h: box.height } }),
      );
    }

    function embers() {
      const out: { x: number; y: number; r: number; hot: number }[] = [];
      for (const body of wearing) {
        if (body.gone || !body.wear?.burning) continue;
        for (const ember of body.wear.embers()) out.push({ ...onMat(body, ember), r: ember.r, hot: ember.hot });
      }
      return out;
    }

    // All of a sheet is home and square: its pieces go back into it, and
    // what was done to it fades away.
    function mendSheet(root: Body) {
      const group = bodies.filter((body) => body.root === root);
      if (
        group.some(
          (body) =>
            body.homing ||
            body.moving ||
            grab?.body === body ||
            body.x !== 0 ||
            body.y !== 0 ||
            body.a !== 0 ||
            body.el.classList.contains("is-turned"),
        )
      ) {
        return;
      }
      root.mend = false;
      if (!group.some((body) => body.wear)) return;
      const wear = worn(root);
      for (const piece of group) {
        if (piece === root) continue;
        if (piece.wear) {
          wear.absorb(piece.wear);
          piece.wear.dispose();
        }
        wearing.delete(piece);
        byEl.delete(piece.el);
        bodies.splice(bodies.indexOf(piece), 1);
        piece.el.remove();
      }
      wear.mend();
      pivotAt(root, wear.pivot());
      write(root);
      wakeWear();
    }

    const surface: Surface = { blade, lift, heat, embers };

    // ---- input

    const onPointerDown = (event: PointerEvent) => {
      // with the torch in hand, things are for burning
      if (grab || event.button > 0 || html.dataset.tool === "torch") return;
      const target = event.target instanceof Element ? event.target : null;
      const el = target?.closest<HTMLElement>(".thing");
      const body = el ? byEl.get(el) : undefined;
      if (!body) return;
      // a video's own controls, a form field: leave them be
      if (target?.closest("input, textarea, select, [data-no-drag]")) return;
      const touch = event.pointerType === "touch";
      pending = {
        body,
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        touch,
        timer: touch
          ? window.setTimeout(() => {
              if (!pending) return;
              const held = pending;
              pending = null;
              begin(held.body, held.id, held.x, held.y);
              // a tick under the finger, once the page is allowed to give one
              if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(6);
            }, 360)
          : 0,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pending && pending.id === event.pointerId) {
        const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
        if (pending.touch) {
          if (moved > 10) {
            window.clearTimeout(pending.timer);
            pending = null;
          }
          return;
        }
        if (moved > 4) {
          const held = pending;
          pending = null;
          begin(held.body, held.id, held.x, held.y);
        } else return;
      }
      if (grab && grab.id === event.pointerId) {
        grab.cx = event.clientX;
        grab.cy = event.clientY;
        wake();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pending && pending.id === event.pointerId) {
        window.clearTimeout(pending.timer);
        pending = null;
        return;
      }
      if (grab && grab.id === event.pointerId) {
        swallowClick = true;
        window.setTimeout(() => (swallowClick = false), 0);
        release();
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (pending && pending.id === event.pointerId) {
        window.clearTimeout(pending.timer);
        pending = null;
      }
      if (grab && grab.id === event.pointerId) release();
    };

    // A drag ends in a click on whatever is under it; that click isn't one.
    const onClickCapture = (event: MouseEvent) => {
      if (html.dataset.tool === "torch" && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const el = target?.closest<HTMLElement>(".thing");
      const body = el ? byEl.get(el) : undefined;
      // the address on the envelope posts it too, postmark and all
      if (body?.action === "mail" && target?.closest('a[href^="mailto:"]')) {
        event.preventDefault();
        act(body);
        return;
      }
      if (!body || target?.closest("a, button")) return;
      if (body.action === "open") return;
      act(body, event.detail === 0 ? undefined : event.clientX, event.detail === 0 ? undefined : event.clientY);
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const body = target ? byEl.get(target) : undefined;
      if (!body || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (body.action === "open") {
          body.el.click();
          return;
        }
        act(body);
        return;
      }
      const step = event.shiftKey ? 48 : 12;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = nudge[event.key];
      if (move) {
        event.preventDefault();
        if (body.joinedTo) body.joinedTo = null;
        body.homing = false;
        body.moving = false;
        body.x += move[0];
        body.y += move[1];
        keepOnMat(body);
        raise(body);
        tap(0.25);
        wake();
      }
    };

    // Touch: once a sheet is held, the page mustn't scroll under the finger.
    const onTouchMove = (event: TouchEvent) => {
      if (grab) event.preventDefault();
    };

    const onTidy = () => tidy();
    const onResize = () => {
      measure();
      for (const body of bodies) write(body);
    };

    const onGuide = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!guideRaf) guideRaf = requestAnimationFrame(guides);
    };

    const onLeave = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      pointerX = -1;
      pointerY = -1;
      if (!guideRaf) guideRaf = requestAnimationFrame(guides);
    };

    // Films play while they're in view, and stop when they're not.
    const films = [...mat.querySelectorAll<HTMLVideoElement>("video[data-print-media]")];
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const watcher =
      still || saveData
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const film = entry.target as HTMLVideoElement;
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) film.play().catch(() => {});
                else film.pause();
              }
            },
            { threshold: [0, 0.5, 1] },
          );
    for (const film of films) watcher?.observe(film);

    measure();
    const sizes = new ResizeObserver(onResize);
    sizes.observe(mat);
    document.fonts?.ready.then(onResize).catch(() => {});
    html.dataset.mat = "true";

    mat.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    mat.addEventListener("click", onClickCapture, { capture: true });
    mat.addEventListener("click", onClick);
    mat.addEventListener("keydown", onKey);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener(TIDY_EVENT, onTidy);
    window.addEventListener("pointermove", onGuide, { passive: true });
    document.addEventListener("mouseout", onLeave);
    const unmountCuts = mountCuts(mat, surface);
    const unmountTorch = mountTorch(mat, surface);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(guideRaf);
      unmountCuts();
      unmountTorch();
      cancelAnimationFrame(wearRaf);
      for (const body of bodies) {
        body.wear?.dispose();
        if (body.root !== body) body.el.remove();
      }
      scale.remove();
      for (const body of bodies) body.mark?.remove();
      if (pending) window.clearTimeout(pending.timer);
      sizes.disconnect();
      watcher?.disconnect();
      delete html.dataset.mat;
      delete html.dataset.holding;
      mat.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      mat.removeEventListener("click", onClickCapture, { capture: true });
      mat.removeEventListener("click", onClick);
      mat.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener(TIDY_EVENT, onTidy);
      window.removeEventListener("pointermove", onGuide);
      document.removeEventListener("mouseout", onLeave);
    };
  }, []);

  return (
    <div className="mat" ref={root}>
      {children}
      <CuttingLayer />
      <TorchLayer />
      <span className="ruler-guide ruler-guide-y" aria-hidden="true" />
    </div>
  );
}

// Shows once anything on the mat is out of place, and squares it all up.
export function TidyButton() {
  const [messy, setMessy] = useState(false);

  useEffect(() => {
    const onMess = (event: Event) => setMessy((event as CustomEvent<boolean>).detail);
    window.addEventListener(MESS_EVENT, onMess);
    return () => window.removeEventListener(MESS_EVENT, onMess);
  }, []);

  return (
    <button
      type="button"
      className="tidy-button"
      data-shown={messy ? "" : undefined}
      aria-hidden={messy ? undefined : true}
      tabIndex={messy ? 0 : -1}
      onClick={() => window.dispatchEvent(new Event(TIDY_EVENT))}
    >
      <span aria-hidden="true">⌗</span>
      Tidy
    </button>
  );
}
