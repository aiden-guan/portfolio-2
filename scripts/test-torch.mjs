import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import polygonClipping from "polygon-clipping";

const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/torch.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Exercise the real input handlers and heat output with a deterministic clock.
// Canvas drawing is checked in the browser; the canvas here only accepts calls.
function setup({ reducedMotion = true, frameLag = 0 } = {}) {
  const drawCounts = new Map();
  const invalidDraws = [];
  class Element extends EventTarget {
    attributes = new Map();
    style = {};
    offsetWidth = 664;
    clientWidth = 1000;
    dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(dataName(key)) ?? undefined,
      set: (_, key, value) => { this.setAttribute(dataName(key), value); return true; },
      deleteProperty: (_, key) => { this.attributes.delete(dataName(key)); return true; },
    });
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    toggleAttribute(name, active) {
      if (active) this.setAttribute(name, "");
      else this.attributes.delete(name);
    }
    closest() { return this.hasAttribute("data-no-drag") ? this : null; }
    contains(target) { return target === this || target === control; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
    setPointerCapture() {}
    getContext() {
      return new Proxy({}, { get: (_, key) => (...args) => {
        drawCounts.set(key, (drawCounts.get(key) ?? 0) + 1);
        if (args.some((arg) => typeof arg === "number" && !Number.isFinite(arg))) invalidDraws.push(key);
        if (key === "ellipse" && (args[2] < 0 || args[3] < 0)) throw new RangeError("Negative ellipse radius");
        if (key === "arc" && args[2] < 0) throw new RangeError("Negative arc radius");
        if (key.startsWith("create")) return { addColorStop() {} };
      } });
    }
  }
  function dataName(key) { return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`; }
  const html = new Element();
  html.dataset.tool = "torch";
  const control = new Element();
  control.setAttribute("aria-pressed", "false");
  control.setAttribute("data-no-drag", "");
  const mat = new Element();
  const nodes = new Map([
    [".torch", new Element()], [".mat-fire", new Element()],
    [".mat-scorch", new Element()], [".torch-guide-key", control],
  ]);
  mat.querySelector = (selector) => nodes.get(selector);
  let now = 0;
  let id = 0;
  let stops = 0;
  const frames = new Map();
  const timers = new Map();
  const heat = [];
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: reducedMotion }),
    innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout: (key) => timers.delete(key),
  });
  const document = Object.assign(new EventTarget(), {
    documentElement: html, createElement: () => new Element(), hidden: false,
  });
  const exports = {};
  const modules = {
    "@/lib/riffle": {
      crackle() {}, unlockSound() {},
      ignite: () => ({ level() {}, stop() { stops++; } }),
    },
    "@/lib/wear": { ASH_EVENT: "ash", SCORCH_EVENT: "scorch", TIDY_EVENT: "tidy" },
  };
  runInNewContext(compiled, {
    exports, require: (name) => { assert.ok(modules[name], name); return modules[name]; },
    window, document, Element, navigator: {}, performance: { now: () => now },
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
  });
  const cleanup = exports.mountTorch(mat, {
    heat: (...args) => { heat.push(args); return { on: "paper", char: 0, kind: "" }; },
    embers: () => [],
  });
  function emit(target, type, values = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(event, key, { value });
    }
    target.dispatchEvent(event);
  }
  function pointer(type, values = {}) {
    emit(type === "pointerdown" ? mat : window, type, {
      pointerId: 1, pointerType: "mouse", button: 0, isPrimary: true,
      clientX: 200, clientY: 200, shiftKey: false, target: mat, ...values,
    });
  }
  function advance(ms = 1000) {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000 / 60) {
      now += 1000 / 60;
      for (const [key, timer] of timers) {
        if (timer.at <= now) { timers.delete(key); timer.fn(); }
      }
      const pending = [...frames.values()];
      frames.clear();
      for (const frame of pending) frame(now - frameLag);
    }
  }
  return {
    html, control, pointer, advance, cleanup, heat, drawCounts, invalidDraws,
    pendingFrames: () => frames.size,
    click: () => emit(control, "click"),
    key: (type, shiftKey = type === "keydown") => emit(window, type, { key: "Shift", shiftKey }),
    blur: () => emit(window, "blur"),
    hide: () => { document.hidden = true; emit(document, "visibilitychange"); },
    pressed: () => control.getAttribute("aria-pressed") === "true",
    boosted: () => html.hasAttribute("data-torch-boost"),
    burning: () => html.hasAttribute("data-torching"),
    stops: () => stops,
  };
}

test("the toggle boosts real heat and survives pointer movement and subsequent burns", () => {
  const t = setup();
  t.click();
  assert.equal(t.pressed(), true);
  assert.equal(t.burning(), false);
  t.pointer("pointerdown");
  t.pointer("pointermove", { clientX: 220 });
  t.advance();
  assert.equal(t.boosted(), true);
  assert.ok(t.heat.at(-1)[3] > 60, "the outer blast carries substantial heat");
  t.pointer("pointerup");
  assert.equal(t.burning(), false);
  assert.equal(t.boosted(), false);
  assert.equal(t.pressed(), true);
  t.pointer("pointerdown");
  assert.equal(t.boosted(), true);
  t.pointer("pointerup");
  t.click();
  t.pointer("pointerdown");
  t.advance();
  assert.equal(t.boosted(), false);
  assert.equal(t.heat.at(-1)[3], 4.2);
  t.cleanup();
});

test("holding Shift works before and during ignition, including both Shift keys", () => {
  const t = setup();
  t.key("keydown");
  assert.equal(t.pressed(), true);
  assert.equal(t.burning(), false);
  t.pointer("pointerdown", { shiftKey: true });
  assert.equal(t.boosted(), true);
  t.key("keyup", true);
  assert.equal(t.boosted(), true, "the other Shift key is still held");
  t.key("keyup", false);
  assert.equal(t.boosted(), false);
  t.key("keydown");
  assert.equal(t.boosted(), true);
  t.key("keyup");
  assert.equal(t.pressed(), false);
  t.cleanup();
});

test("releasing Shift does not cancel toggled overdrive", () => {
  const t = setup();
  t.click();
  t.pointer("pointerdown");
  t.key("keydown");
  t.key("keyup");
  t.pointer("pointermove");
  assert.equal(t.boosted(), true);
  t.cleanup();
});

test("touch can toggle overdrive without igniting the control and still scroll before the hold", () => {
  const t = setup();
  t.pointer("pointerdown", { target: t.control, pointerType: "touch" });
  t.click();
  t.advance(300);
  assert.equal(t.burning(), false);
  t.pointer("pointerdown", { pointerType: "touch" });
  t.pointer("pointermove", { pointerType: "touch", clientX: 240 });
  t.advance(300);
  assert.equal(t.burning(), false, "a scrolling gesture cancels ignition");
  t.pointer("pointerdown", { pointerType: "touch" });
  t.advance(200);
  assert.equal(t.burning(), false);
  t.advance(100);
  assert.equal(t.boosted(), true);
  t.pointer("pointermove", { pointerType: "touch", clientX: 220 });
  assert.equal(t.boosted(), true);
  t.pointer("pointercancel");
  assert.equal(t.burning(), false);
  t.cleanup();
});

test("blur and hiding the page extinguish the flame and clear held Shift", () => {
  for (const stop of ["blur", "hide"]) {
    const t = setup();
    t.pointer("pointerdown", { shiftKey: true });
    t[stop]();
    assert.equal(t.burning(), false);
    assert.equal(t.boosted(), false);
    assert.equal(t.pressed(), false);
    assert.equal(t.stops(), 1);
    t.cleanup();
  }
});

test("unmount removes input handlers and resets the control", () => {
  const t = setup();
  t.click();
  t.pointer("pointerdown");
  t.cleanup();
  assert.equal(t.stops(), 1);
  assert.equal(t.pressed(), false);
  assert.equal(t.burning(), false);
  assert.equal(t.boosted(), false);
  t.click();
  t.key("keydown");
  t.pointer("pointerdown");
  assert.equal(t.pressed(), false);
  assert.equal(t.burning(), false);
});

test("plasma rendering stays finite and finishes its effects after release", () => {
  const t = setup({ reducedMotion: false });
  t.click();
  t.pointer("pointerdown");
  t.advance();
  assert.ok(t.drawCounts.get("ellipse") > 100, "plasma rings and the ignition wave are drawn");
  t.pointer("pointermove", { clientX: 400, clientY: 300 });
  t.advance(300);
  assert.deepEqual(t.invalidDraws, []);
  t.pointer("pointerup");
  t.advance(4000);
  assert.equal(t.pendingFrames(), 0, "no animation loop remains after the effects fade");
  t.cleanup();
});

test("a shockwave tolerates a frame timestamp sampled before ignition", () => {
  const t = setup({ reducedMotion: false, frameLag: 40 });
  t.click();
  t.pointer("pointerdown");
  assert.doesNotThrow(() => t.advance(100));
  assert.deepEqual(t.invalidDraws, []);
  t.cleanup();
});

test("reduced motion shows a static boost and clears immediately after release", () => {
  const t = setup();
  t.click();
  t.pointer("pointerdown");
  t.advance(300);
  assert.equal(t.boosted(), true);
  t.pointer("pointerup");
  t.advance(100);
  assert.equal(t.pendingFrames(), 0);
  assert.deepEqual(t.invalidDraws, []);
  t.cleanup();
});

test("full boost heats a broad area at eighteen times normal peak power", () => {
  const normal = setup();
  normal.pointer("pointerdown");
  normal.advance();
  const normalPower = Math.max(...normal.heat.map((h) => h[3]));
  const normalReach = Math.max(...normal.heat.map((h) => Math.hypot(h[0] - 200, h[1] - 200) + h[2]));
  const boosted = setup();
  boosted.click();
  boosted.pointer("pointerdown");
  boosted.advance();
  const peakPower = Math.max(...boosted.heat.map((h) => h[3]));
  const blastReach = Math.max(...boosted.heat.map((h) => Math.hypot(h[0] - 200, h[1] - 200) + h[2]));
  assert.ok(peakPower > normalPower * 18);
  assert.ok(blastReach > normalReach * 7.5, "eight times the radius affects roughly sixty-four times the area");
  assert.ok(boosted.heat.some(([x, y]) => Math.hypot(x - 200, y - 200) > 120), "nearby sheets receive their own contact samples");
  boosted.heat.length = 0;
  boosted.pointer("pointermove", { clientX: 5000, clientY: 5000 });
  boosted.advance(16);
  assert.ok(boosted.heat.length <= 36, "a fast boosted sweep has bounded damage work");
  normal.cleanup();
  boosted.cleanup();
});

function makePaper() {
  const exports = {};
  const source = readFileSync(new URL("../lib/wear.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports, require: (name) => { assert.equal(name, "polygon-clipping"); return { default: polygonClipping }; },
    document: { createElement: () => ({}) }, window: { devicePixelRatio: 1 },
    performance: { now: () => 0 },
    ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } },
  });
  return new exports.Wear({ dataset: {}, querySelectorAll: () => [], querySelector: () => null }, 600, 500, 4);
}

test("the real paper simulation opens large holes quickly and preserves them after boost", () => {
  const normal = makePaper();
  const boosted = makePaper();
  for (let i = 0; i < 60; i++) {
    normal.burn({ x: 300, y: 250 }, 26, 4.2, 1 / 60);
    boosted.burn({ x: 300, y: 250 }, 124.8, 80, 1 / 60);
  }
  assert.ok(normal.holes.length > 0);
  assert.ok(boosted.holes[0].r > normal.holes[0].r * 4);
  assert.ok(boosted.holes[0].r > 100, "boost burns through its large heated footprint");
  const distant = Math.round(250 / boosted.cell) * boosted.cols + Math.round(370 / boosted.cell);
  assert.equal(normal.char[distant], 0);
  assert.ok(boosted.char[distant] > 1);
  const radius = boosted.holes[0].r;
  boosted.burn({ x: 300, y: 250 }, 26, 4.2, 1 / 60);
  assert.ok(boosted.holes[0].r >= radius, "releasing boost cannot shrink an existing hole");
});
