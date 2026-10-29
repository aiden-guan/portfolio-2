import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import * as physics from "../components/break/physics.ts";
import * as encounter from "../components/break/encounter.ts";
const {
  segmentHitsCircle,
  unitVector,
  createFlightState,
  stepFlight,
  dashFlight,
} = physics;
import { presentProjects, defaultPortfolio } from "../content/portfolio.ts";

test("fast projectiles hit between frames, including tangent and stationary cases", () => {
  assert.equal(segmentHitsCircle(0, 100, 0, 0, 0, 50, 3), true);
  assert.equal(segmentHitsCircle(0, 100, 0, 0, 4, 50, 3), false);
  assert.equal(segmentHitsCircle(0, 100, 0, 0, 3, 50, 3), true);
  assert.equal(segmentHitsCircle(0, 0, 0, 0, 0, 0, 3), true);
  assert.equal(segmentHitsCircle(0, 0, 0, 0, 4, 0, 3), false);
  assert.equal(segmentHitsCircle(0, 100, 0, 80, 0, 50, 3), false);
});

test("diagonal flight is the same speed as horizontal flight and idle stays finite", () => {
  assert.equal(Math.hypot(...Object.values(unitVector(1, 0))), 1);
  assert.ok(
    Math.abs(Math.hypot(...Object.values(unitVector(1, 1))) - 1) < 1e-10,
  );
  assert.deepEqual(unitVector(0, 0), { x: 0, y: 0 });
});

test("stored projects keep their edits and are ordered after BarkOff without mutating source", () => {
  const bark = defaultPortfolio.projects.find((p) => p.name === "BarkOff");
  const custom = {
    ...defaultPortfolio.projects.find((p) => p.name === "Continuity"),
    summary: "Saved edit",
  };
  const input = [custom, { ...bark, name: "Harmony Labs" }, bark];
  const result = presentProjects(input);
  assert.deepEqual(
    result.map((p) => p.name),
    ["BarkOff", "Continuity", "CourtVision"],
  );
  assert.equal(result[1].summary, "Saved edit");
  assert.equal(input.length, 3);
  assert.equal(
    presentProjects(result).filter((p) => p.name === "Continuity").length,
    1,
  );
  assert.equal(presentProjects([]).length, 2);
});

// Run the actual engine against an in-memory canvas and deterministic clock.
// No browser, service, or network is needed for lifecycle and input regressions.
function engine({
  failPortrait = false,
  width = 900,
  height = 650,
  audible = false,
} = {}) {
  let clock = 0,
    nextFrame = null,
    focus = null,
    disconnected = false;
  const listeners = new Map();
  const keyFor = (type) => listeners.get(type) ?? new Set();
  const events = {
    addEventListener(type, fn) {
      const set = keyFor(type);
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      keyFor(type).delete(fn);
    },
  };
  let jetX = 0,
    jetY = 0,
    lastTranslate = [0, 0],
    sumX = 0,
    sumY = 0,
    pixelCount = 0;
  let enemyShots = [];
  const context = new Proxy(
    {
      getImageData() {
        const data = new Uint8ClampedArray(62 * 70 * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 160;
          data[i + 1] = 100;
          data[i + 2] = 65;
          data[i + 3] = 255;
        }
        return { data };
      },
      setTransform() {
        sumX = sumY = pixelCount = 0;
        enemyShots = [];
      },
      arc(x, y, radius) {
        if (radius === encounter.ENCOUNTER.enemyRadius)
          enemyShots.push({ x, y, radius, ink: this.fillStyle });
      },
      rect(x, y) {
        sumX += x;
        sumY += y;
        pixelCount++;
      },
      translate(x, y) {
        lastTranslate = [x, y];
      },
      rotate() {
        [jetX, jetY] = lastTranslate;
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    {
      get(target, key) {
        return key in target ? target[key] : () => {};
      },
    },
  );
  const canvas = {
    ...events,
    getContext: () => context,
    focus() {
      focus = canvas;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
  };
  const stored = new Map([["aiden-sound", audible ? "on" : "off"]]);
  const audio = { contexts: 0, closed: 0, nodes: [] };
  const audioParam = () => ({
    value: 0,
    events: [],
    setValueAtTime(value, at) {
      this.events.push(["set", value, at]);
    },
    linearRampToValueAtTime(value, at) {
      this.events.push(["linear", value, at]);
    },
    exponentialRampToValueAtTime(value, at) {
      this.events.push(["exponential", value, at]);
    },
    setTargetAtTime(value, at, constant) {
      this.events.push(["target", value, at, constant]);
    },
  });
  const audioNode = (kind) => {
    const node = {
      kind,
      frequency: audioParam(),
      gain: audioParam(),
      Q: audioParam(),
      targets: [],
      disconnected: false,
      connect(target) {
        this.targets.push(target);
        return target;
      },
      disconnect() {
        this.disconnected = true;
      },
      start(at) {
        this.started = at;
      },
      stop(at) {
        this.stopped = at;
      },
    };
    audio.nodes.push(node);
    return node;
  };
  const labels = new Map();
  const label = (name) => {
    if (!labels.has(name))
      labels.set(name, { style: {}, textContent: "", setAttribute() {} });
    return labels.get(name);
  };
  const host = {
    dataset: {},
    getBoundingClientRect: () => ({ width, height }),
    querySelector: (selector) =>
      selector === "canvas" ? canvas : label(selector),
  };
  const phases = [],
    pauses = [];
  const sandbox = createContext({
    exports: {},
    require(id) {
      return id.endsWith("/encounter") ? encounter : physics;
    },
    Math: Object.assign(Object.create(Math), {
      random: (() => {
        let seed = 12345;
        return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      })(),
    }),
    window: events,
    AudioContext: class {
      constructor() {
        audio.contexts++;
      }
      destination = {};
      currentTime = 0;
      state = "running";
      createGain() {
        return audioNode("gain");
      }
      createOscillator() {
        return audioNode("oscillator");
      }
      createBiquadFilter() {
        return audioNode("filter");
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        audio.closed++;
        return Promise.resolve();
      }
    },
    document: {
      ...events,
      hidden: false,
      createElement: () => ({ getContext: () => context }),
    },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
    devicePixelRatio: 1,
    performance: { now: () => clock },
    requestAnimationFrame: (fn) => {
      nextFrame = fn;
      return 1;
    },
    cancelAnimationFrame: () => {
      nextFrame = null;
    },
    HTMLElement: class {},
    ResizeObserver: class {
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
    Image: class {
      set src(_value) {
        if (failPortrait) this.onerror();
        else {
          this.width = 989;
          this.height = 1024;
          this.onload();
        }
      }
    },
  });
  const source = readFileSync(
    new URL("../components/break/arcade.ts", import.meta.url),
    "utf8",
  );
  runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    sandbox,
  );
  const game = sandbox.exports.mountArcade(
    host,
    (p) => phases.push(p),
    (p) => pauses.push(p),
    false,
  );
  return {
    game,
    phases,
    pauses,
    labels,
    stored,
    audio,
    createSound: () => sandbox.exports.createSound(),
    setSound(on) {
      stored.set("aiden-sound", on ? "on" : "off");
      for (const fn of keyFor("aiden-sound-change")) fn();
    },
    host,
    get elapsed() {
      return clock / 1000;
    },
    get enemyShots() {
      return enemyShots;
    },
    get position() {
      return { x: jetX, y: jetY };
    },
    get focused() {
      return focus;
    },
    get subject() {
      return { x: sumX / pixelCount, y: sumY / pixelCount };
    },
    get cleaned() {
      return (
        disconnected &&
        [...listeners.values()].every((set) => !set.size) &&
        nextFrame === null
      );
    },
    tick(seconds, fps = 60) {
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        clock += 1000 / fps;
        const frame = nextFrame;
        nextFrame = null;
        frame?.(clock);
      }
    },
    event(type, data = {}) {
      for (const fn of keyFor(type))
        fn({ key: "", preventDefault() {}, ...data });
    },
  };
}

test("flight waits for launch, bounds movement, pauses, resumes and releases every listener", () => {
  const e = engine();
  assert.equal(e.phases.at(-1), "ready");
  e.tick(3);
  assert.equal(e.phases.at(-1), "ready");
  e.game.start();
  e.tick(1.6);
  assert.equal(e.phases.at(-1), "fight");
  const start = e.position;
  e.event("keydown", { key: "d" });
  e.tick(0.5);
  e.event("keyup", { key: "d" });
  assert.ok(e.position.x > start.x + 50);
  e.event("keydown", { key: "d" });
  e.tick(3);
  e.event("keyup", { key: "d" });
  assert.ok(e.position.x <= 900 - 24);
  e.game.togglePause();
  const before = e.position;
  e.event("keydown", { key: "a" });
  e.tick(0.5);
  assert.deepEqual(e.position, before);
  e.game.togglePause();
  e.event("keydown", { key: "a" });
  e.tick(0.2);
  assert.ok(e.position.x < before.x);
  e.event("blur");
  assert.equal(e.pauses.at(-1), true);
  e.game.reset();
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  e.tick(1.6);
  assert.equal(e.phases.at(-1), "fight");
  e.game.stop();
  assert.equal(e.cleaned, true);
});

test("a failed portrait has a recoverable error state and never starts an unwinnable fight", () => {
  const e = engine({ failPortrait: true });
  assert.equal(e.phases.at(-1), "error");
  e.game.start();
  e.tick(4);
  assert.equal(e.phases.at(-1), "error");
  e.game.stop();
  assert.equal(e.cleaned, true);
});

test("boss contact depletes shields once per recovery window and replay restores the encounter", () => {
  const e = engine();
  e.game.start();
  e.tick(1.6);
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  for (let i = 0; i < 600 && !e.phases.includes("lose"); i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: e.subject.y,
      pointerType: "mouse",
    });
    e.tick(1 / 60);
  }
  assert.equal(e.phases.at(-1), "lose");
  assert.equal(e.labels.get("[data-hull]").textContent, "◇ ◇ ◇");
  e.game.reset();
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(e.labels.get("[data-hull]").textContent, "◆ ◆ ◆");
  e.tick(1.6);
  assert.equal(e.phases.at(-1), "fight");
  e.game.stop();
});

test("both boss forms take sustained fire, with a safe, pausable transformation and clean replay", (t) => {
  const e = engine({ width: 1200, height: 650, audible: true });
  e.game.start();
  e.tick(1.6);
  // Track the visible portrait from below, the way a pilot lines up a shot.
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  const track = () => {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: 590,
      pointerType: "mouse",
    });
    e.tick(1 / 60);
  };
  for (let i = 0; i < 3600 && e.phases.at(-1) === "fight"; i++) track();
  assert.equal(e.phases.at(-1), "transform");
  const firstDuration = e.elapsed - 1.2;
  assert.ok(e.elapsed > 20, `First form ended at ${e.elapsed}s`);
  assert.equal(e.host.dataset.form, "cat");
  assert.equal(e.labels.get("[data-stage]").textContent, "II");
  assert.equal(e.labels.get("[data-hull]").textContent, "◆ ◆ ◆");
  assert.equal(e.labels.get("[data-energy]").style.transform, "scaleX(1)");
  assert.equal(e.enemyShots.length, 0, "The transition clears the arena");
  assert.equal(e.audio.nodes.filter((n) => n.kind === "filter").length, 0);
  e.game.togglePause();
  e.tick(5);
  assert.equal(e.phases.at(-1), "transform");
  e.game.togglePause();
  e.tick(encounter.ENCOUNTER.transformSeconds + 0.1);
  assert.equal(e.phases.at(-1), "fight");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(
    e.audio.nodes.filter((n) => n.kind === "filter").length,
    3,
    "One meow uses three formants",
  );
  // Pausing releases a drag, so take control again from the current ship position.
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  const secondStart = e.elapsed;
  for (let i = 0; i < 4200 && e.phases.at(-1) === "fight"; i++) {
    track();
    if (i % 180 === 0) e.game.pulse();
  }
  assert.equal(
    e.phases.at(-1),
    "dying",
    `Ended at ${e.elapsed}s, health ${e.labels.get("[data-health]").textContent}`,
  );
  assert.ok(e.elapsed - secondStart > 20);
  t.diagnostic(
    `Round one: ${firstDuration.toFixed(1)}s; round two: ${(e.elapsed - secondStart).toFixed(1)}s`,
  );
  e.tick(1.7);
  assert.equal(e.phases.at(-1), "win");
  assert.equal(e.labels.get("[data-stage]").textContent, "II");
  assert.ok(Number(e.labels.get("[data-score]").textContent) >= 4600);
  assert.ok(Number(e.stored.get("guan-arcade-best")) > 0);
  assert.equal(e.labels.get("[data-health]").textContent, "0%");
  e.game.reset();
  assert.equal(e.host.dataset.form, "human");
  assert.equal(e.labels.get("[data-stage]").textContent, "I");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(e.phases.filter((p) => p === "transform").length, 1);
  assert.equal(
    e.audio.nodes.filter((n) => n.kind === "filter").length,
    3,
    "The meow cannot repeat during a round",
  );
  e.game.stop();
});

test("enemy volleys stay widely spaced, visibly large, and slow enough to follow", () => {
  const e = engine();
  e.game.start();
  e.tick(3.5);
  const first = e.enemyShots.map((s) => ({ ...s }));
  assert.equal(first.length, 7);
  assert.ok(first.every((s) => s.radius >= 6 && s.ink === "#ffc28e"));
  e.tick(0.3);
  assert.equal(e.enemyShots.length, 7);
  for (let i = 0; i < first.length; i++) {
    const next = e.enemyShots[i];
    const speed = Math.hypot(next.x - first[i].x, next.y - first[i].y) / 0.3;
    assert.ok(speed > 100 && speed < 110, `Volley moved at ${speed}px/s`);
  }
  e.game.stop();
});

test("meow unlocks from a muted start, mutes immediately, and releases its audio nodes", () => {
  const e = engine();
  e.game.stop();
  const sound = e.createSound();
  sound.unlock();
  sound.meow();
  assert.equal(e.audio.contexts, 0);
  e.setSound(true);
  assert.equal(e.audio.contexts, 1);
  const before = e.audio.nodes.length;
  sound.meow();
  const voiceNodes = e.audio.nodes.slice(before);
  const voice = voiceNodes.find((n) => n.type === "sawtooth");
  assert.equal(voice.started, 0);
  assert.equal(voice.stopped, 0.86);
  assert.equal(voiceNodes.filter((n) => n.kind === "filter").length, 3);
  assert.ok(
    voice.frequency.events.some(
      ([type, hz]) => type === "exponential" && hz === 250,
    ),
  );
  e.setSound(false);
  assert.deepEqual(e.audio.nodes[0].gain.events.at(-1), ["target", 0, 0, 0.01]);
  const mutedCount = e.audio.nodes.length;
  sound.meow();
  assert.equal(e.audio.nodes.length, mutedCount);
  voice.onended();
  assert.ok(voiceNodes.every((n) => n.disconnected));
  sound.stop();
  assert.equal(e.audio.closed, 1);
  assert.equal(e.cleaned, true);
});

test("cat ears share the portrait grid, have pink interiors, and mirror without a seam", () => {
  const ears = encounter.createCatEars(62, 70);
  assert.ok(ears.length > 250);
  const positions = new Map(ears.map((p) => [`${p.col},${p.row}`, p.ink]));
  assert.equal(positions.size, ears.length);
  assert.ok(ears.some((p) => p.row < -10));
  const top = Math.min(...ears.map((p) => p.row));
  assert.ok(
    ears.filter((p) => p.row === top && p.col < 31).length >= 3,
    "Tips have a rounded cap",
  );
  assert.ok(ears.some((p) => p.ink >= 6));
  for (const pixel of ears) {
    assert.equal(positions.get(`${61 - pixel.col},${pixel.row}`), pixel.ink);
    assert.ok(pixel.col >= 0 && pixel.col < 62);
    assert.ok(pixel.ink >= 0 && pixel.ink < 9);
  }
});

test("blush adds three mirrored pink strokes within the cheeks", () => {
  const blush = encounter.createBlush(62, 70);
  assert.equal(blush.length, 60);
  const positions = new Map(blush.map((p) => [`${p.col},${p.row}`, p.ink]));
  assert.equal(positions.size, blush.length);
  for (const pixel of blush) {
    assert.equal(positions.get(`${61 - pixel.col},${pixel.row}`), pixel.ink);
    assert.ok(pixel.row >= 45 && pixel.row <= 49);
    assert.ok(pixel.ink === 6 || pixel.ink === 7);
  }
});

test("dash adds a controllable burst of speed and respects cooldown and pause", () => {
  const e = engine();
  e.game.start();
  e.tick(1.3);
  e.event("keydown", { key: "d" });
  e.tick(0.1);
  const before = e.position.x;
  assert.equal(e.game.dash(), true);
  assert.equal(e.game.dash(), false);
  e.tick(0.18);
  assert.ok(e.position.x - before > 90 && e.position.x - before < 155);
  e.event("keyup", { key: "d" });
  e.tick(1.3);
  e.game.togglePause();
  assert.equal(e.game.dash(), false);
  e.game.togglePause();
  assert.equal(e.game.dash(), true);
  e.game.stop();
  assert.equal(e.cleaned, true);
});

test("pulse damages the boss, spends charge and resets cleanly for replay", () => {
  const e = engine();
  assert.equal(e.game.pulse(), false);
  e.game.start();
  e.tick(1.3);
  const before = Number.parseInt(e.labels.get("[data-health]").textContent);
  assert.equal(e.game.pulse(), true);
  assert.equal(e.game.pulse(), false);
  e.tick(0.1);
  assert.ok(
    Number.parseInt(e.labels.get("[data-health]").textContent) < before,
  );
  assert.ok(Number(e.labels.get("[data-score]").textContent) > 0);
  e.game.reset();
  e.tick(1.3);
  assert.equal(e.game.pulse(), true);
  e.game.stop();
});

const bounds = { width: 900, height: 650 };
const idleInput = { x: 0, y: 0, focused: false };
function pilot() {
  return { ...createFlightState(), x: 350, y: 430 };
}

test("keyboard release stops immediately instead of coasting", () => {
  const body = pilot();
  for (let i = 0; i < 30; i++)
    stepFlight(body, { ...idleInput, x: 1 }, 1 / 120, bounds);
  const x = body.x;
  for (let i = 0; i < 90; i++) stepFlight(body, idleInput, 1 / 120, bounds);
  assert.equal(body.x, x);
  assert.equal(body.vx, 0);
});

test("focus movement is precise without changing direction or adding drift", () => {
  const normal = pilot(),
    focused = pilot();
  for (let i = 0; i < 60; i++) {
    stepFlight(normal, { ...idleInput, x: 1 }, 1 / 120, bounds);
    stepFlight(focused, { ...idleInput, x: 1, focused: true }, 1 / 120, bounds);
  }
  const ratio = (focused.x - 350) / (normal.x - 350);
  assert.ok(ratio > 0.43 && ratio < 0.45);
  const x = focused.x;
  stepFlight(focused, { ...idleInput, focused: true }, 1 / 120, bounds);
  assert.equal(focused.x, x);
});

test("pointer following converges without overshooting or oscillating", () => {
  const body = pilot(),
    target = { x: 371, y: 441 };
  let previous = body.x;
  for (let i = 0; i < 120; i++) {
    stepFlight(body, { ...idleInput, target }, 1 / 120, bounds);
    assert.ok(body.x >= previous && body.x <= target.x && body.y <= target.y);
    previous = body.x;
  }
  assert.equal(body.x, target.x);
  assert.equal(body.y, target.y);
});

test("dash covers a bounded distance and ends without leftover momentum", () => {
  const body = pilot();
  assert.equal(dashFlight(body, { ...idleInput, x: 1 }, bounds), true);
  for (let i = 0; i < 100; i++) stepFlight(body, idleInput, 1 / 120, bounds);
  assert.ok(Math.abs(body.x - 350 - 128) < 0.001);
  assert.equal(body.dashTime, 0);
  assert.equal(body.vx, 0);
});

test("a wall ends the dash and allows immediate steering away", () => {
  const body = { ...pilot(), x: 870 };
  dashFlight(body, { ...idleInput, x: 1 }, bounds);
  stepFlight(body, idleInput, 1 / 120, bounds);
  assert.equal(body.x, 876);
  assert.equal(body.dashTime, 0);
  stepFlight(body, { ...idleInput, x: -1 }, 1 / 120, bounds);
  assert.ok(body.x < 876);
});

test("pressing away from the ship does not pull it toward the pointer", () => {
  const e = engine();
  e.game.start();
  e.tick(1.5);
  const start = e.position;
  e.event("pointerdown", {
    pointerId: 1,
    clientX: 20,
    clientY: 20,
    pointerType: "touch",
  });
  e.tick(0.2);
  assert.deepEqual(e.position, start);
  e.event("pointermove", { pointerId: 1, clientX: 60, clientY: 40 });
  e.tick(0.3);
  assert.ok(Math.abs(e.position.x - start.x - 40) < 0.2);
  assert.ok(Math.abs(e.position.y - start.y - 20) < 0.2);
  e.event("pointerup", { pointerId: 1 });
  const released = e.position;
  e.tick(0.5);
  assert.deepEqual(e.position, released);
  e.game.stop();
});

test("a second touch cannot take over a drag", () => {
  const e = engine();
  e.game.start();
  e.tick(1.5);
  const start = e.position;
  e.event("pointerdown", {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    pointerType: "touch",
  });
  e.event("pointerdown", {
    pointerId: 2,
    clientX: 500,
    clientY: 500,
    pointerType: "touch",
  });
  e.event("pointermove", { pointerId: 2, clientX: 700, clientY: 600 });
  e.tick(0.2);
  assert.deepEqual(e.position, start);
  e.event("pointerup", { pointerId: 2 });
  e.event("pointermove", { pointerId: 1, clientX: 130, clientY: 100 });
  e.tick(0.3);
  assert.ok(Math.abs(e.position.x - start.x - 30) < 0.2);
  e.game.stop();
});

test("movement is consistent at 20, 30, 60 and 144 frames per second", () => {
  const positions = [];
  for (const fps of [20, 30, 60, 144]) {
    const e = engine();
    e.game.start();
    e.tick(1.5, fps);
    e.event("keydown", { key: "d", code: "KeyD" });
    e.tick(0.5, fps);
    positions.push(e.position.x);
    e.game.stop();
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.25);
});

test("a dash during a held drag does not pull the ship back afterward", () => {
  const e = engine();
  e.game.start();
  e.tick(1.5);
  e.event("pointerdown", {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    pointerType: "touch",
  });
  e.event("pointermove", { pointerId: 1, clientX: 140, clientY: 100 });
  e.tick(0.3);
  assert.equal(e.game.dash(), true);
  e.tick(0.3);
  const after = e.position;
  e.tick(0.5);
  assert.deepEqual(e.position, after);
  e.game.stop();
});

test("a new drag takes control immediately even during a dash", () => {
  const e = engine();
  e.game.start();
  e.tick(1.5);
  e.event("keydown", { key: "d" });
  e.tick(0.1);
  e.event("keyup", { key: "d" });
  e.game.dash();
  e.tick(0.05);
  const before = e.position;
  e.event("pointerdown", {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    pointerType: "touch",
  });
  e.tick(0.2);
  assert.deepEqual(e.position, before);
  e.game.stop();
});
