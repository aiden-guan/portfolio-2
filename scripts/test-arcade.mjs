import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import * as physics from "../components/break/physics.ts";
import * as encounter from "../components/break/encounter.ts";
import * as combat from "../components/break/combat.ts";
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
  let enemyPositions = [],
    observedResize;
  const enemiesSeen = new Set();
  let missilesSeen = false;
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
        enemyPositions = [];
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
      fillText(value) {
        if (value === "PALANTIR" || value === "ANDURIL") {
          enemiesSeen.add(value);
          enemyPositions.push({
            kind: value,
            x: lastTranslate[0],
            y: lastTranslate[1],
          });
        }
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    {
      set(target, key, value) {
        if (key === "fillStyle" && value === "#edb6a0") missilesSeen = true;
        target[key] = value;
        return true;
      },
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
  const vfxModule = {};
  const sandbox = createContext({
    exports: {},
    require(id) {
      return id.endsWith("/encounter")
        ? encounter
        : id.endsWith("/combat")
          ? combat
          : id.endsWith("/vfx")
            ? vfxModule
            : physics;
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
      constructor(callback) {
        observedResize = callback;
      }
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
  const vfxSource = readFileSync(
    new URL("../components/break/vfx.ts", import.meta.url),
    "utf8",
  );
  runInContext(
    "(function(exports) {" +
      ts.transpileModule(vfxSource, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText +
      "})(exports)",
    sandbox,
  );
  Object.assign(vfxModule, sandbox.exports);
  sandbox.exports = {};
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
    enemiesSeen,
    get missilesSeen() {
      return missilesSeen;
    },
    get enemyPositions() {
      return enemyPositions;
    },
    resize(newWidth, newHeight) {
      width = newWidth;
      height = newHeight;
      observedResize();
    },
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

test("all three boss forms have safe transformations, a final checkpoint, and a clean campaign replay", (t) => {
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
  assert.equal(e.phases.at(-1), "transform");
  assert.equal(e.host.dataset.form, "evil");
  assert.equal(e.labels.get("[data-stage]").textContent, "III");
  assert.equal(e.labels.get("[data-hull]").textContent, "◆ ◆ ◆");
  assert.equal(e.enemyShots.length, 0);
  assert.ok(e.elapsed - secondStart > 20);
  const secondDuration = e.elapsed - secondStart;
  e.game.togglePause();
  e.tick(4);
  assert.equal(e.phases.at(-1), "transform");
  e.game.togglePause();
  e.tick(encounter.ENCOUNTER.evilTransformSeconds + 0.1);
  assert.equal(e.phases.at(-1), "fight");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  // A direct collision loses this stage; retry must preserve the evil portrait.
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  for (let i = 0; i < 600 && e.phases.at(-1) === "fight"; i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: e.subject.y,
    });
    e.tick(1 / 60);
  }
  assert.equal(e.phases.at(-1), "lose");
  assert.equal(e.game.continueStage(), true);
  e.tick(1.4);
  assert.equal(e.host.dataset.form, "evil");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(e.host.dataset.weapon, "3");
  e.tick(2.2);
  e.resize(375, 812);
  e.tick(0.1);
  const left = e.enemyPositions.filter((p) => p.x < 187.5),
    right = e.enemyPositions.filter((p) => p.x > 187.5);
  assert.ok(
    left.length && right.length,
    "Resizing keeps the squad spread across the arena",
  );
  assert.ok(e.enemyPositions.every((p) => p.x >= 40 && p.x <= 335));
  e.resize(1200, 650);
  e.tick(0.1);
  e.game.toggleFocus();
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  const thirdStart = e.elapsed;
  for (let i = 0; i < 6000 && e.phases.at(-1) === "fight"; i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x + Math.sin((i / 60) * 1.4) * 65,
      clientY: 568,
    });
    e.tick(1 / 60);
    if (i % 180 === 0) e.game.pulse();
  }
  assert.equal(
    e.phases.at(-1),
    "dying",
    `Final form ended as ${e.phases.at(-1)}, HP ${e.labels.get("[data-health]").textContent}`,
  );
  assert.ok(e.enemiesSeen.has("PALANTIR"));
  assert.ok(e.enemiesSeen.has("ANDURIL"));
  assert.equal(e.missilesSeen, true);
  t.diagnostic(
    `Round one: ${firstDuration.toFixed(1)}s; round two: ${secondDuration.toFixed(1)}s; round three: ${(e.elapsed - thirdStart).toFixed(1)}s`,
  );
  e.tick(1.7);
  assert.equal(e.phases.at(-1), "win");
  assert.equal(e.labels.get("[data-stage]").textContent, "III");
  assert.equal(e.labels.get("[data-run-rank]").textContent, "B");
  assert.ok(Number(e.labels.get("[data-score]").textContent) >= 4600);
  assert.ok(Number(e.stored.get("guan-arcade-best")) > 0);
  assert.equal(e.labels.get("[data-health]").textContent, "0%");
  e.game.reset();
  assert.equal(e.host.dataset.form, "human");
  assert.equal(e.labels.get("[data-stage]").textContent, "I");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(e.phases.filter((p) => p === "transform").length, 2);
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

test("attack plans vary by form, leave escape lanes, and commit to the warned paths", () => {
  const args = [600, 210, 615, 565, 1200, 104];
  const human = Array.from({ length: 4 }, (_, i) =>
    combat.planVolley(1, i, ...args),
  );
  const cat = Array.from({ length: 5 }, (_, i) =>
    combat.planVolley(2, i, ...args),
  );
  assert.deepEqual(
    human.map((v) => v.kind),
    ["fan", "aim", "lanes", "fan"],
  );
  assert.deepEqual(
    cat.map((v) => v.kind),
    ["heart", "petals", "lanes", "heart", "aim"],
  );
  for (const volley of [...human, ...cat]) {
    assert.ok(volley.shots.length >= 4 && volley.shots.length <= 16);
    assert.ok(
      volley.shots.every((s) => Object.values(s).every(Number.isFinite)),
    );
  }
  assert.ok(human[2].shots.every((s) => Math.abs(s.x - 615) > 62));
  const original = JSON.stringify(human[1]);
  combat.planVolley(1, 1, 600, 210, 1000, 565, 1200, 104);
  assert.equal(JSON.stringify(human[1]), original);
  assert.notEqual(
    JSON.stringify(combat.planVolley(1, 1, 600, 210, 1000, 565, 1200, 104)),
    original,
  );
  const narrow = combat.planVolley(1, 2, 160, 180, 160, 500, 320, 82);
  assert.ok(narrow.shots.every((s) => Math.abs(s.x - 160) > 62));
});

test("collecting a weapon pickup upgrades the ship and replay resets it", () => {
  const e = engine();
  e.game.start();
  e.tick(8);
  assert.equal(e.host.dataset.weapon, "2");
  assert.equal(e.labels.get("[data-weapon]").textContent, "MK.II");
  e.game.reset();
  e.tick(0.1);
  assert.equal(e.host.dataset.weapon, "1");
  assert.equal(e.host.dataset.overdrive, "off");
  e.game.stop();
});

test("focused beam adds aimed damage and can be toggled without moving the ship", () => {
  const normal = engine(),
    focused = engine();
  normal.game.start();
  focused.game.start();
  normal.tick(1.3);
  focused.tick(1.3);
  const position = focused.position;
  focused.game.toggleFocus();
  normal.tick(3);
  focused.tick(3);
  assert.deepEqual(focused.position, position);
  assert.ok(
    Number.parseInt(focused.labels.get("[data-health]").textContent) <
      Number.parseInt(normal.labels.get("[data-health]").textContent),
  );
  focused.game.toggleFocus();
  normal.game.stop();
  focused.game.stop();
});

test("a dash absorbs an incoming shot, earns charge, and protects the ship", () => {
  const e = engine();
  e.game.start();
  e.tick(3.5);
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  for (let i = 0; i < 70; i++) {
    const shot = e.enemyShots[3];
    e.event("pointermove", {
      pointerId: 1,
      clientX: shot.x,
      clientY: shot.y + 65,
    });
    e.tick(1 / 120);
    if (Math.hypot(e.position.x - shot.x, e.position.y - shot.y) < 80) break;
  }
  const hull = e.labels.get("[data-hull]").textContent;
  const before = Number(e.labels.get("[data-run-grazes]").textContent);
  assert.equal(e.game.dash(), true);
  e.tick(0.2);
  assert.ok(Number(e.labels.get("[data-run-grazes]").textContent) > before);
  assert.equal(e.labels.get("[data-hull]").textContent, hull);
  assert.ok(e.enemyShots.length < 7);
  e.game.stop();
});

test("second-stage retry restores the cat form without replaying its transformation", () => {
  const e = engine({ width: 1200 });
  assert.equal(e.game.continueStage(), false);
  e.game.start();
  e.tick(1.6);
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  for (let i = 0; i < 3600 && e.phases.at(-1) === "fight"; i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: 568,
    });
    e.tick(1 / 60);
  }
  assert.equal(e.phases.at(-1), "transform");
  e.tick(3.5);
  for (let i = 0; i < 600 && e.phases.at(-1) === "fight"; i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: e.subject.y,
    });
    e.tick(1 / 60);
  }
  assert.equal(e.phases.at(-1), "lose");
  assert.equal(e.game.continueStage(), true);
  assert.equal(e.game.continueStage(), false);
  e.tick(0.05);
  assert.equal(e.host.dataset.form, "cat");
  assert.equal(e.host.dataset.weapon, "2");
  assert.equal(e.labels.get("[data-health]").textContent, "100%");
  assert.equal(e.labels.get("[data-hull]").textContent, "◆ ◆ ◆");
  e.tick(1.3);
  assert.equal(e.phases.at(-1), "fight");
  assert.equal(e.phases.filter((p) => p === "transform").length, 1);
  e.game.reset();
  e.tick(0.1);
  assert.equal(e.host.dataset.form, "human");
  e.game.stop();
});

test("run ranks reward clean clears, cap continued runs, and format elapsed time", () => {
  const stats = combat.createRunStats();
  assert.equal(combat.runRank(stats, true), "S");
  stats.hits = 2;
  assert.equal(combat.runRank(stats, true), "A");
  stats.continues = 1;
  assert.equal(combat.runRank(stats, true), "B");
  assert.equal(combat.runRank(stats, false), "");
  assert.equal(combat.formatTime(74.8), "01:14");
  assert.equal(combat.formatTime(-1), "00:00");
  assert.equal(combat.createRunStats().hits, 0);
});

test("missile steering has a bounded turn rate and remains consistent across frame rates", () => {
  const angles = [];
  for (const fps of [20, 30, 60, 144]) {
    let velocity = { vx: 134, vy: 0 };
    for (let i = 0; i < fps; i++)
      velocity = combat.steerSeeker(
        velocity.vx,
        velocity.vy,
        0,
        0,
        0,
        1000,
        1 / fps,
      );
    assert.ok(Math.abs(Math.hypot(velocity.vx, velocity.vy) - 134) < 1e-8);
    angles.push(Math.atan2(velocity.vy, velocity.vx));
  }
  assert.ok(Math.max(...angles) - Math.min(...angles) < 1e-8);
  assert.ok(Math.abs(angles[0] - 0.78) < 1e-8);
  const idleTarget = combat.steerSeeker(0, 134, 12, 10, 12, 10, 1 / 60);
  assert.ok(Number.isFinite(idleTarget.vx) && Number.isFinite(idleTarget.vy));
});

test("the evil portrait keeps symmetrical bright eyes and a scar on its own pixel grid", () => {
  const marks = combat.evilDetails(62, 70);
  assert.ok(marks.some((p) => p.ink === 8));
  assert.ok(marks.some((p) => p.row > 50));
  for (const pixel of marks)
    assert.ok(
      pixel.col >= 0 &&
        pixel.col < 62 &&
        pixel.row >= 0 &&
        pixel.row < 70 &&
        pixel.ink >= 6 &&
        pixel.ink < combat.EVIL_INKS.length,
    );
  const eyes = marks.filter((p) => p.row < 45);
  const positions = new Map(eyes.map((p) => [`${p.col},${p.row}`, p.ink]));
  for (const pixel of eyes)
    assert.equal(positions.get(`${61 - pixel.col},${pixel.row}`), pixel.ink);
});

test("evil attacks alternate between space, aim, and escape lanes rather than speeding up", () => {
  const waves = Array.from({ length: 4 }, (_, i) =>
    combat.planVolley(3, i, 600, 210, 600, 565, 1200, 104),
  );
  assert.deepEqual(
    waves.map((v) => v.kind),
    ["petals", "aim", "lanes", "fan"],
  );
  for (const wave of waves)
    for (const shot of wave.shots)
      assert.ok(Math.hypot(shot.vx, shot.vy) <= 105);
  assert.ok(waves[2].shots.every((s) => Math.abs(s.x - 600) > 62));
});

test("earned overdrive pauses with the encounter and full retry clears it", () => {
  const e = engine({ width: 1200 });
  e.game.start();
  e.tick(1.6);
  e.event("pointerdown", {
    pointerId: 1,
    clientX: e.position.x,
    clientY: e.position.y,
    pointerType: "mouse",
  });
  for (let i = 0; i < 4200 && e.host.dataset.overdrive !== "on"; i++) {
    e.event("pointermove", {
      pointerId: 1,
      clientX: e.subject.x,
      clientY: 568,
    });
    e.tick(1 / 60);
    if (i % 180 === 0) e.game.pulse();
  }
  assert.equal(e.host.dataset.overdrive, "on");
  assert.equal(e.labels.get("[data-weapon]").textContent, "OVERDRIVE");
  e.game.togglePause();
  const meter = e.labels.get("[data-overdrive]").style.transform;
  const timer = e.labels.get("[data-time]").textContent;
  e.tick(5);
  assert.equal(e.labels.get("[data-overdrive]").style.transform, meter);
  assert.equal(e.labels.get("[data-time]").textContent, timer);
  e.game.reset();
  e.tick(0.1);
  assert.equal(e.host.dataset.overdrive, "off");
  assert.equal(e.labels.get("[data-overdrive]").style.transform, "scaleX(0)");
  e.game.stop();
});

test("the soundtrack changes with the boss form, respects mute, and resets its phrase", () => {
  const e = engine();
  e.game.stop();
  const sound = e.createSound();
  sound.unlock();
  e.setSound(true);
  sound.music(0.01, 1, false);
  const pitches = () =>
    e.audio.nodes
      .filter((n) => n.kind === "oscillator")
      .map((n) => n.frequency.events[0][1]);
  assert.deepEqual(pitches(), [82.41, 329.63]);
  e.setSound(false);
  const before = e.audio.nodes.length;
  sound.music(1, 2, true);
  assert.equal(e.audio.nodes.length, before);
  e.setSound(true);
  sound.resetMusic();
  sound.music(0.01, 2, false);
  assert.deepEqual(pitches().slice(-2), [130.81, 523.25]);
  sound.resetMusic();
  sound.music(0.01, 3, false);
  assert.deepEqual(pitches().slice(-2), [55, 164.81]);
  sound.stop();
  assert.equal(e.cleaned, true);
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
