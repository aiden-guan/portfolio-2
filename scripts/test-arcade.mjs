import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadModule,
  benchmarkWeapon,
  makeBossArena,
  runBossPilot,
  tactics,
} from "./arcade-harness.mjs";
import { createContext } from "node:vm";
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

// The canvas renderer is observed at its boundary; lifecycle/input tests run the real
// campaign and real audio against a deterministic browser clock. Rendering is checked
// in the local browser so a fake canvas cannot bless broken graphics.
const model = loadModule("campaign", createContext({}));
const idleInput = { x: 0, y: 0, focused: false };
const bounds = { width: 900, height: 650 };
function pilot() {
  return { ...createFlightState(), x: 350, y: 430 };
}
function advance(s, seconds, input = idleInput) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    model.stepWorld(s, input, 1 / 120);
}
function engine({
  failPortrait = false,
  width = 900,
  height = 650,
  audible = false,
} = {}) {
  let clock = 0,
    nextFrame = null,
    focus = null,
    disconnected = false,
    observedResize,
    world;
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
  const context = {};
  const canvas = {
    ...events,
    getContext: () => context,
    focus() {
      focus = canvas;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
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
  const host = {
    dataset: {},
    style: { setProperty() {} },
    get clientWidth() {
      return width;
    },
    get clientHeight() {
      return height;
    },
    getBoundingClientRect: () => ({ width, height }),
    querySelector(selector) {
      if (selector === "canvas") return canvas;
      if (!labels.has(selector))
        labels.set(selector, { style: {}, textContent: "", setAttribute() {} });
      return labels.get(selector);
    },
  };
  const phases = [],
    pauses = [];
  const sandbox = createContext({
    window: events,
    document: { ...events, hidden: false },
    renderer: {
      createCampaignVfx: () => ({
        render: (s) => {
          world = s;
        },
      }),
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
      constructor(fn) {
        observedResize = fn;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
    Image: class {
      set src(value) {
        this.naturalWidth = 1000;
        this.naturalHeight = 1000;
        this.complete = true;
        if (failPortrait) this.onerror();
        else this.onload();
      }
    },
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
  });
  const arcadeModule = loadModule("arcade", sandbox);
  const game = arcadeModule.mountArcade(
    host,
    (p) => phases.push(p),
    (p) => pauses.push(p),
    false,
  );
  const e = {
    game,
    host,
    phases,
    pauses,
    labels,
    stored,
    audio,
    createSound: () => arcadeModule.createSound(),
    get position() {
      return {
        x: world?.player.x ?? width / 2,
        y: world?.player.y ?? height * 0.8,
      };
    },
    get world() {
      return world;
    },
    get focused() {
      return focus;
    },
    get cleaned() {
      return (
        disconnected &&
        [...listeners.values()].every((set) => !set.size) &&
        nextFrame === null
      );
    },
    setSound(on) {
      stored.set("aiden-sound", on ? "on" : "off");
      for (const fn of keyFor("aiden-sound-change")) fn();
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
    resize(w, h) {
      width = w;
      height = h;
      observedResize();
    },
  };
  e.tick(1 / 60);
  return e;
}

test("launch, pause, focus, input bounds, and cleanup use the real campaign", () => {
  const e = engine();
  assert.equal(e.phases.at(-1), "ready");
  e.tick(2);
  assert.equal(e.phases.at(-1), "ready");
  e.game.start();
  e.tick(2.6);
  assert.equal(e.phases.at(-1), "waves");
  const start = e.position;
  e.event("keydown", { key: "d" });
  e.tick(0.5);
  e.event("keyup", { key: "d" });
  assert.ok(e.position.x > start.x + 50);
  e.game.toggleFocus();
  e.tick(0.1);
  assert.equal(e.world.player.focused, true);
  e.game.togglePause();
  const pos = e.position,
    seconds = e.world.stats.seconds;
  e.tick(5);
  assert.deepEqual(e.position, pos);
  assert.equal(e.world.stats.seconds, seconds);
  assert.equal(e.game.dash(), false);
  assert.equal(e.game.pulse(), false);
  e.game.togglePause();
  e.event("keydown", { key: "d" });
  e.tick(4);
  assert.ok(e.position.x <= 876);
  e.event("blur");
  assert.equal(e.pauses.at(-1), true);
  e.game.stop();
  assert.equal(e.cleaned, true);
});
test("asset failure is recoverable and cannot start a campaign", () => {
  const e = engine({ failPortrait: true });
  assert.equal(e.phases.at(-1), "error");
  e.game.start();
  e.tick(3);
  assert.equal(e.phases.at(-1), "error");
  e.game.stop();
  assert.equal(e.cleaned, true);
});
test("each ship fires a distinct weapon and focused Wraith rails pierce a target", () => {
  const kinds = [];
  for (const ship of [0, 1, 2]) {
    const s = model.createWorld(900, 650, ship);
    s.phase = "waves";
    s.waveAt = 99;
    advance(s, 0.3);
    kinds.push(s.bullets[0]?.kind);
  }
  assert.deepEqual(kinds, ["ion", "plasma", "rail"]);
  const s = model.createWorld(900, 650, 2);
  s.phase = "fight";
  s.player.x = 450;
  s.boss.x = 450;
  s.boss.y = 160;
  advance(s, 0.7, { ...idleInput, focused: true });
  assert.ok(s.telemetry.bossDamage > 0);
  assert.ok(s.arcs.length > 0 || s.bullets.some((b) => b.kind === "rail"));
});
test("chain lightning jumps between enemies and kills interrupt eye lasers", () => {
  const s = model.createWorld(900, 650, 2);
  s.phase = "waves";
  s.waveAt = 99;
  s.player.y = 400;
  for (let i = 0; i < 3; i++)
    s.enemies.push({
      id: i + 1,
      kind: "thiel",
      x: 450 + i * 20,
      y: 200,
      origin: 0.5,
      age: 3,
      hp: 20,
      maxHp: 20,
      fire: 10,
      flash: 0,
      targetX: 0,
      targetY: 0,
      state: 0,
    });
  s.lasers.push({
    x: 450,
    y: 200,
    tx: 450,
    ty: 500,
    age: 0.2,
    warning: 1,
    duration: 0.5,
    owner: 1,
    width: 4,
  });
  advance(s, 0.01);
  assert.equal(s.stats.drones, 1);
  assert.equal(s.lasers.length, 0);
  assert.equal(s.arcs.length, 3);
  assert.ok(
    s.enemies.find((e) => e.id === 2).hp < s.enemies.find((e) => e.id === 3).hp,
  );
});
test("waves require kills, include all four enemy kinds, and clear the arena before the boss", () => {
  const s = model.createWorld(900, 650);
  model.launch(s);
  advance(s, 2.5);
  s.player.invincible = 100;
  s.fireAt = 1000;
  advance(s, 18);
  assert.equal(s.phase, "waves");
  assert.equal(s.wave, 1);
  assert.ok(s.enemies.length > 0);
  const seen = new Set();
  for (let i = 0; i < 10 * 120 && s.phase !== "boss-intro"; i++) {
    for (const e of s.enemies) {
      seen.add(e.kind);
      e.hp = 0;
    }
    model.stepWorld(s, idleInput, 1 / 120);
  }
  assert.equal(s.phase, "boss-intro");
  assert.equal(s.wave, 3);
  assert.equal(s.enemies.length, 0);
  assert.deepEqual([...seen].sort(), ["anduril", "musk", "palantir", "thiel"]);
  assert.equal(s.bullets.length, 0);
  const hp = s.player.hull;
  advance(s, 2.9);
  assert.equal(s.player.hull, hp);
});
test("Thiel eye lasers lock their warning path before firing and give recovery between hits", () => {
  const s = model.createWorld(900, 650);
  s.phase = "waves";
  s.waveAt = 99;
  s.fireAt = 99;
  s.enemies.push({
    id: 1,
    kind: "thiel",
    x: 450,
    y: 200,
    origin: 0.5,
    age: 3,
    hp: 100,
    maxHp: 100,
    fire: 0,
    flash: 0,
    targetX: 0,
    targetY: 0,
    state: 0,
  });
  advance(s, 0.1);
  assert.equal(s.lasers.length, 2);
  const tx = s.lasers[0].tx;
  const hull = s.player.hull;
  advance(s, s.lasers[0].warning - 0.2);
  assert.equal(s.player.hull, hull);
  assert.equal(s.lasers[0].tx, tx);
  advance(s, 0.22);
  assert.equal(s.player.hull, hull - 1);
  advance(s, 0.22);
  assert.equal(s.player.hull, hull - 1);
});
test("pulse clears a local pocket, respects its cooldown, and stops while paused", () => {
  const e = engine();
  e.game.start();
  e.tick(2.6);
  assert.equal(e.game.pulse(), true);
  assert.equal(e.game.pulse(), false);
  assert.equal(e.labels.get("[data-pulse-key]").textContent, "20s");
  e.game.togglePause();
  const remaining = e.world.pulseAt;
  e.tick(5);
  assert.equal(e.world.pulseAt, remaining);
  e.game.reset();
  e.tick(2.6);
  assert.equal(e.game.pulse(), true);
  e.game.stop();
  const s = model.createWorld(900, 650);
  s.phase = "waves";
  s.waveAt = 99;
  s.fireAt = 99;
  const bullet = (x, y, id) => ({
    id,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    life: 5,
    age: 0,
    friendly: false,
    kind: "orb",
    damage: 1,
    radius: 5,
    grazed: false,
    hit: [],
  });
  s.bullets.push(bullet(460, 510, 1), bullet(50, 100, 2));
  model.pulse(s);
  advance(s, 0.5);
  assert.ok(!s.bullets.some((b) => b.id === 1));
  assert.ok(s.bullets.some((b) => b.id === 2));
});
test("all three complete sectors have waves, safe boss titles, cleared ordnance, and a final win", () => {
  const s = model.createWorld(1200, 720, 1);
  model.launch(s);
  const visited = new Set();
  let safeIntro = true;
  // Damage immunity isolates campaign progression from the separate dodge/collision tests.
  for (let i = 0; i < 480 * 120 && s.phase !== "win"; i++) {
    visited.add(`${s.sector}:${s.phase}`);
    s.player.invincible = 2;
    const target =
      s.phase === "fight"
        ? s.boss
        : s.enemies
            .filter((e) => e.hp > 0)
            .sort(
              (a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x),
            )[0];
    if (target) {
      s.player.x = target.x;
      s.player.y = s.height * 0.72;
    }
    const hull = s.player.hull;
    model.stepWorld(s, idleInput, 1 / 120);
    if (s.phase === "boss-intro")
      safeIntro &&= s.player.hull === hull && s.bullets.length === 0;
  }
  assert.equal(s.phase, "win");
  assert.equal(safeIntro, true);
  for (const sector of [1, 2, 3])
    for (const phase of ["waves", "boss-intro", "fight", "dying"])
      assert.ok(visited.has(`${sector}:${phase}`), `${sector}:${phase}`);
  assert.equal(s.bullets.length, 0);
  assert.equal(s.lasers.length, 0);
  assert.equal(model.campaignRank(s), "S");
  s.phase = "lose";
  const score = s.score;
  assert.equal(model.retrySector(s), true);
  assert.equal(s.sector, 3);
  assert.equal(s.phase, "intro");
  assert.equal(s.score, Math.floor(score * 0.6));
  assert.equal(s.player.hull, 4);
  assert.equal(s.stats.continues, 1);
  model.resetWorld(s);
  assert.equal(s.sector, 1);
  assert.equal(s.wave, 0);
  assert.equal(s.score, 0);
  assert.equal(s.overdrive, 0);
  assert.equal(s.stats.continues, 0);
  assert.equal(s.ship, 1);
});
test("boss attacks commit before firing; resizing cancels stale warnings and scales combat positions", () => {
  const s = model.createWorld(900, 650);
  s.phase = "fight";
  s.fireAt = 99;
  s.boss.attackAt = 0;
  advance(s, 0.2);
  assert.ok(s.attack);
  assert.equal(s.bullets.length, 0);
  const plan = s.attack.shots.map((b) => ({ ...b }));
  s.player.x = 50;
  advance(s, 0.8);
  assert.ok(s.attack);
  assert.ok(s.bullets.length > 0);
  assert.equal(s.bullets[0].vx, plan[0].vx);
  const beforeX = s.bullets[0].x;
  model.resizeWorld(s, 450, 650);
  assert.equal(s.bullets[0].x, beforeX / 2);
  assert.equal(s.attack, null);
  assert.equal(s.lasers.length, 0);
});
test("stationary play remains losable and stage retry restores every combat ability", () => {
  const s = model.createWorld(900, 650);
  model.launch(s);
  advance(s, 100);
  assert.equal(s.phase, "lose");
  s.pulseAt = 10;
  s.player.dashCooldown = 1;
  s.overdrive = 4;
  s.charge = 70;
  assert.equal(model.retrySector(s), true);
  assert.equal(s.pulseAt, 0);
  assert.equal(s.player.dashCooldown, 0);
  assert.equal(s.overdrive, 0);
  assert.equal(s.charge, 0);
});
test("mobile volleys preserve gaps and movement is deterministic across render rates", () => {
  const narrow = model.createWorld(360, 650);
  narrow.phase = "fight";
  narrow.fireAt = 99;
  narrow.boss.attackAt = 0;
  advance(narrow, 0.1);
  assert.ok(narrow.attack.shots.length <= 8);
  const shots = [];
  for (const width of [360, 1200]) {
    const s = model.createWorld(width, 650);
    s.phase = "fight";
    s.fireAt = 99;
    s.boss.attackAt = 0;
    advance(s, 0.1);
    shots.push(s.attack.shots.length);
  }
  assert.ok(shots[0] < shots[1]);
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

test("cat ears share the portrait grid, have pink interiors, and mirror without a seam", () => {
  const ears = encounter.createCatEars(62, 70);
  assert.ok(ears.length > 250);
  const positions = new Map(ears.map((p) => [`${p.col},${p.row}`, p.ink]));
  assert.equal(positions.size, ears.length);
  const top = Math.min(...ears.map((p) => p.row));
  const bottom = Math.max(...ears.map((p) => p.row));
  assert.ok(top >= -7 && top < 0, "Ears stay close to the hairline");
  assert.ok(bottom - top < 20, "The silhouette stays short and wide");
  assert.ok(
    ears.filter((p) => p.row === top && p.col < 31).length >= 5,
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

test("Guan retains all three original forms before either added boss is reached", () => {
  const s = model.createWorld(900, 650, 1);
  s.phase = "fight";
  const forms = new Set();
  const transformations = new Set();
  for (let i = 0; i < 100 * 120 && s.sector === 1; i++) {
    s.player.invincible = 2;
    s.player.x = s.boss.x;
    if (s.phase === "fight") forms.add(s.boss.form);
    if (s.phase === "transform") {
      transformations.add(s.boss.form);
      assert.equal(s.bullets.length, 0);
      assert.equal(s.lasers.length, 0);
      assert.ok(s.boss.hp > 0);
    }
    model.stepWorld(s, idleInput, 1 / 120);
  }
  assert.deepEqual([...forms], [1, 2, 3]);
  assert.deepEqual([...transformations], [2, 3]);
  assert.equal(s.sector, 2);
  assert.equal(s.boss.form, 1);
});

test("measured single-target damage and overdrive stay inside the rebalance budget", () => {
  for (const ship of [0, 1, 2]) {
    const normal = benchmarkWeapon(ship),
      focus = benchmarkWeapon(ship, true),
      peak = benchmarkWeapon(ship, true, true);
    assert.ok(normal >= 58 && normal <= 78, `ship ${ship} normal ${normal}`);
    assert.ok(focus >= 64 && focus <= 80, `ship ${ship} focus ${focus}`);
    assert.ok(peak < 110, `ship ${ship} overdrive ${peak}`);
  }
});
test("ship swapping cannot reset weapon cooldowns into a burst-fire exploit", () => {
  const s = model.createWorld(900, 650);
  s.phase = "waves";
  s.waveAt = 999;
  model.selectShip(s, 1);
  assert.equal(s.ship, 1);
  assert.ok(s.fireAt >= 0.4);
  model.selectShip(s, 2);
  assert.equal(s.ship, 1);
  advance(s, 2.9);
  model.selectShip(s, 2);
  assert.equal(s.ship, 1);
  advance(s, 0.2);
  model.selectShip(s, 2);
  assert.equal(s.ship, 2);
});
test("one dash damages a melee enemy once instead of once per simulation tick", () => {
  const s = model.createWorld(900, 650);
  s.phase = "waves";
  s.waveAt = s.fireAt = 999;
  s.player.x = 450;
  s.player.y = 500;
  s.enemies.push({
    id: 1,
    kind: "musk",
    x: 450,
    y: 450,
    origin: 0.5,
    age: 3,
    hp: 85,
    maxHp: 85,
    fire: 100,
    flash: 0,
    targetX: 450,
    targetY: 450,
    state: 3,
  });
  model.dash(s, { x: 0, y: -1, focused: false });
  advance(s, 0.2);
  assert.equal(s.enemies[0].hp, 15);
  assert.equal(s.telemetry.enemyDamage, 70);
  assert.ok(s.player.dashCooldown > 2);
});
test("boss damage cannot generate overdrive or restore hull at a phase transition", () => {
  const s = makeBossArena({ sector: 2 });
  s.player.hull = 2;
  model.damageBoss(s, 300);
  assert.equal(s.charge, 0);
  model.damageBoss(s, 1e6);
  assert.equal(s.boss.stage, 2);
  assert.equal(s.player.hull, 2);
});
test("all nine stages use distinct compound plans with bounded, committed warnings", () => {
  const signatures = new Set();
  for (const width of [360, 1200])
    for (const sector of [1, 2, 3])
      for (const stage of [1, 2, 3]) {
        const plans = [0, 1].map((turn) =>
          tactics.createBossPlan({
            sector,
            stage,
            turn,
            x: width / 2,
            y: 180,
            radius: 90,
            playerX: width / 2,
            playerY: 530,
            vx: 70,
            vy: 0,
            width,
            height: 720,
          }),
        );
        if (width === 1200) signatures.add(plans[0].kind);
        for (const plan of plans) {
          assert.ok(plan.events.length >= 2);
          assert.ok(plan.duration >= 4.5);
          for (const event of plan.events) {
            assert.ok(event.at >= 0 && event.at < plan.duration);
            if (event.type === "volley")
              for (const b of event.shots) {
                assert.ok(event.at >= 0.85);
                assert.ok(Number.isFinite(b.vx + b.vy + b.x + b.y));
                assert.ok(Math.hypot(b.vx, b.vy) < 300);
              }
            if (event.type === "beam") assert.ok(event.beam.warning >= 1);
            if (event.type === "zone")
              assert.ok(
                event.zone.warning >= 1 &&
                  event.zone.x >= 30 &&
                  event.zone.x <= width - 30,
              );
            if (event.type === "wave")
              assert.ok(event.wave.gapWidth >= 1 && event.wave.warning >= 0.85);
            if (event.type === "lunge") assert.ok(event.lunge.warning >= 1.1);
          }
        }
      }
  assert.equal(signatures.size, 9);
});
test("Phoebe and Allen cannot skip their second or third stage under burst damage", () => {
  for (const sector of [2, 3]) {
    const s = makeBossArena({ sector });
    s.fireAt = 999;
    s.player.hull = 2;
    model.damageBoss(s, 1e6);
    assert.equal(s.boss.stage, 2);
    assert.equal(s.phase, "transform");
    assert.ok(Math.abs(s.boss.hp / model.bossMaxHp(s) - 0.66) < 1e-9);
    model.damageBoss(s, 1e6);
    assert.equal(s.boss.stage, 2);
    advance(s, 1.9);
    model.damageBoss(s, 1e6);
    assert.equal(s.boss.stage, 3);
    assert.equal(s.phase, "transform");
    assert.ok(Math.abs(s.boss.hp / model.bossMaxHp(s) - 0.33) < 1e-9);
    advance(s, 1.9);
    model.damageBoss(s, 1e6);
    assert.equal(s.phase, "dying");
    assert.equal(s.player.hull, 2);
  }
});
test("Guan deploys guards and Phoebe summons the player's cat-ear echoes during combat", () => {
  const guan = makeBossArena();
  guan.boss.attackAt = 0;
  guan.fireAt = 999;
  advance(guan, 0.3);
  assert.deepEqual(Array.from(guan.enemies, (e) => e.kind).sort(), [
    "musk",
    "palantir",
  ]);
  const phoebe = makeBossArena({ sector: 2, stage: 2 });
  phoebe.boss.attackAt = 0;
  phoebe.fireAt = 999;
  advance(phoebe, 0.3);
  assert.equal(phoebe.enemies.length, 3);
  assert.ok(
    phoebe.enemies.every((e) => e.kind === "cat" && e.summoned && e.hp > 100),
  );
});
test("Allen completes three hand-sign frames before spawning destructible clones", () => {
  const s = makeBossArena({ sector: 3, stage: 2 });
  s.boss.attackAt = 0;
  s.fireAt = 999;
  s.player.invincible = 100;
  advance(s, 0.4);
  assert.equal(tactics.handSealFrame(s.seal.age), 0);
  assert.equal(s.enemies.length, 0);
  advance(s, 0.4);
  assert.equal(tactics.handSealFrame(s.seal.age), 1);
  assert.equal(s.enemies.length, 0);
  advance(s, 0.4);
  assert.equal(tactics.handSealFrame(s.seal.age), 2);
  assert.equal(s.enemies.length, 0);
  advance(s, 0.8);
  assert.equal(s.enemies.filter((e) => e.kind === "clone").length, 3);
  assert.equal(s.telemetry.clones, 3);
  assert.ok(s.enemies.every((e) => e.summoned && e.hp > 150));
  assert.equal(model.bossGuard(s), 0.55);
});
test("destroying clones interrupts their beams, opens the core, and never farms repairs", () => {
  const s = makeBossArena({ sector: 3, stage: 2 });
  s.boss.attackAt = 0;
  s.fireAt = 999;
  s.player.invincible = 100;
  advance(s, 3.6);
  const clones = s.enemies.filter((e) => e.kind === "clone");
  assert.equal(clones.length, 3);
  const hp = s.boss.hp;
  model.damageBoss(s, 10);
  assert.ok(Math.abs(hp - s.boss.hp - 5.5) < 1e-7);
  s.stats.drones = 13;
  s.regularKills = 13;
  for (const e of clones) model.damageEnemy(s, e, 1e5);
  advance(s, 0.02);
  assert.equal(s.lasers.filter((b) => b.owner > 0).length, 0);
  assert.equal(model.bossGuard(s), 1);
  assert.ok(s.boss.breakWindow > 3.8);
  assert.ok(!s.drops.some((d) => d.kind === "repair"));
  assert.equal(s.regularKills, 13);
  const exposed = s.boss.hp;
  model.damageBoss(s, 10);
  assert.ok(Math.abs(exposed - s.boss.hp - 10) < 1e-7);
});
test("summons cannot change the regular-kill repair schedule", () => {
  const s = model.createWorld(900, 650);
  s.phase = "waves";
  s.player.hull = 2;
  for (let wave = 0; wave < 3; wave++) {
    model.spawnWave(s);
    for (const e of s.enemies) {
      if (s.regularKills === 13) {
        model.damageEnemy(s, { ...e, id: ++s.serial, summoned: true }, 1e5);
        assert.equal(s.regularKills, 13);
        assert.ok(!s.drops.some((d) => d.kind === "repair"));
      }
      model.damageEnemy(s, e, 1e5);
    }
  }
  assert.equal(s.regularKills, 15);
  assert.equal(s.drops.filter((d) => d.kind === "repair").length, 1);
});
test("paw marks and the opening in a howl match the actual danger windows", () => {
  const setup = () => {
    const s = makeBossArena({ sector: 2 });
    s.fireAt = s.boss.attackAt = 999;
    return s;
  };
  const z = setup();
  z.zones.push({
    x: z.player.x,
    y: z.player.y,
    radius: 40,
    warning: 1.1,
    duration: 0.5,
    paw: true,
    age: 0,
    triggered: false,
  });
  advance(z, 1);
  assert.equal(z.player.hull, 4);
  advance(z, 0.2);
  assert.equal(z.player.hull, 3);
  for (const safe of [true, false]) {
    const s = setup();
    s.player.x = safe ? 450 : 700;
    s.player.y = 450;
    s.shockwaves.push({
      x: 450,
      y: 150,
      gap: Math.PI / 2,
      gapWidth: 1,
      warning: 1,
      speed: 180,
      age: 0,
      radius: 0,
      previousRadius: 0,
    });
    advance(s, 0.8);
    assert.equal(s.player.hull, 4);
    advance(s, 3);
    assert.equal(s.player.hull, safe ? 4 : 3);
  }
});
test("Phoebe's pounce and rotating lasers cannot damage before their telegraph", () => {
  const s = makeBossArena({ sector: 2, stage: 3 });
  s.fireAt = s.boss.attackAt = 999;
  s.player.x = 450;
  s.player.y = 450;
  s.lunge = {
    x: 450,
    y: 150,
    tx: 450,
    ty: 450,
    warning: 1.1,
    duration: 0.38,
    age: 0,
    returning: false,
  };
  advance(s, 1);
  assert.equal(s.player.hull, 4);
  advance(s, 0.6);
  assert.equal(s.player.hull, 3);
  const b = makeBossArena();
  b.fireAt = b.boss.attackAt = 999;
  b.player.x = 330;
  b.player.y = 450;
  b.lasers.push({
    x: 450,
    y: 150,
    tx: 450,
    ty: 600,
    age: 0,
    warning: 1,
    duration: 1.2,
    width: 5,
    sweep: 0.6,
    owner: -1,
  });
  advance(b, 0.9);
  assert.equal(b.player.hull, 4);
  advance(b, 1.3);
  assert.equal(b.player.hull, 3);
  const end = tactics.beamEnd(
    { x: 0, y: 0, tx: 0, ty: 100, age: 2, warning: 1, duration: 1, sweep: 0.6 },
    100,
  );
  assert.ok(end.x < 0 && end.y > 0);
});
test("all nine boss stages can defeat a stationary ship with normal collision rules", () => {
  for (const width of [390, 1200])
    for (const sector of [1, 2, 3])
      for (const stage of [1, 2, 3]) {
        const result = runBossPilot({
          width,
          sector,
          stage,
          ship: 1,
          policy: "stationary",
          seconds: 60,
        });
        assert.equal(
          result.result,
          "defeated",
          `${width}px boss ${sector} phase ${stage}`,
        );
      }
});
test("late-stage summons and compound fire remain bounded on phone and desktop", () => {
  for (const width of [360, 1200])
    for (const sector of [1, 2, 3]) {
      const s = makeBossArena({ width, sector, stage: 3 });
      s.player.invincible = 1000;
      s.fireAt = 999;
      advance(s, 80);
      assert.ok(s.enemies.length <= 5);
      assert.ok(
        s.bullets.filter((b) => !b.friendly).length <=
          (width < 600 ? 155 : 230),
      );
      assert.ok(s.zones.length <= 6);
      assert.ok(s.shockwaves.length <= 3);
      for (const b of s.bullets)
        assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy));
    }
});
test("resizing cancels committed area hazards and hand seals without changing boss health", () => {
  const s = makeBossArena({ sector: 3, stage: 2 });
  s.boss.attackAt = 0;
  s.fireAt = 999;
  advance(s, 0.5);
  const hp = s.boss.hp;
  assert.ok(s.seal);
  model.resizeWorld(s, 390, 720);
  assert.equal(s.seal, null);
  assert.equal(s.attack, null);
  assert.equal(s.lasers.length, 0);
  assert.equal(s.zones.length, 0);
  assert.equal(s.shockwaves.length, 0);
  assert.equal(s.lunge, null);
  assert.equal(s.boss.hp, hp);
});

test("clone formations keep the real portrait on screen and separate phone rows", () => {
  for (const width of [360, 750, 1200]) {
    const s = makeBossArena({ width, sector: 3, stage: 3 });
    s.boss.attackAt = 0;
    s.fireAt = 999;
    s.player.invincible = 999;
    advance(s, 2.5);
    const half = (model.bossRadius(s) * 62) / 70;
    assert.ok(s.boss.x - half >= 0 && s.boss.x + half <= width);
    if (width < 600)
      assert.ok(s.enemies.some((e) => e.kind === "clone" && e.lane > 0.35));
    model.resizeWorld(s, 390, 720);
    assert.ok(s.boss.x - (model.bossRadius(s) * 62) / 70 >= 0);
    assert.ok(s.boss.x + (model.bossRadius(s) * 62) / 70 <= 390);
  }
});

test("losing to a later boss stage retries that stage without replaying the waves", () => {
  const s = makeBossArena({ sector: 3, stage: 2 });
  s.fireAt = s.boss.attackAt = 999;
  s.player.hull = 1;
  s.zones.push({
    x: s.player.x,
    y: s.player.y,
    radius: 40,
    warning: 0.2,
    duration: 0.5,
    paw: false,
    age: 0,
    triggered: false,
  });
  advance(s, 0.3);
  assert.equal(s.phase, "lose");
  assert.equal(s.checkpoint.boss, true);
  assert.equal(s.checkpoint.stage, 2);
  model.retrySector(s);
  assert.equal(s.phase, "boss-intro");
  assert.equal(model.bossStage(s), 2);
  assert.equal(s.wave, 3);
  assert.equal(s.player.hull, 4);
  assert.equal(s.stats.continues, 1);
  assert.ok(Math.abs(s.boss.hp / model.bossMaxHp(s) - 0.66) < 1e-9);
});
