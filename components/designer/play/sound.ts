// Everything the cinematic and the game sound like, synthesised on the spot:
// the room's hum, the mouse, the store's chime, the game's sting, its title
// tune and the music under each place in it. It follows the site's own Sound
// setting (aiden-sound), and nothing plays before the PLAY press that
// unlocks it.
//
// It's mixed the way a game is: every voice goes to a bus (the music, the
// effects, the room's hum) and some of it to one shared room, and all of it
// through gentle glue compression, a limiter and a soft ceiling, so nothing
// pokes out and nothing clips. The music steps back under dialogue and
// stings. Every envelope ramps (no clicks), and a voice lets go of its nodes
// once it has rung out.

const KEY = "aiden-sound";
const EVENT = "aiden-sound-change";

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** C major's pentatonic (C D E G A), and the same again an octave up and more. */
const PENTA = [0, 2, 4, 7, 9];
const CLIMB = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** Where a voice goes: straight on, and its share of the room. */
type Bus = { dry: AudioNode; wet: AudioNode };

/** What every instrument draws on: the context, its noises and its waves. */
type Kit = {
  c: AudioContext;
  white: AudioBuffer;
  pink: AudioBuffer;
  crackle: AudioBuffer;
  waves: { warm: PeriodicWave; reed: PeriodicWave; voice: PeriodicWave; square: PeriodicWave };
};

type Voice = {
  /** What the voice's parts connect to. */
  input: GainNode;
  /** A node to let go of when the voice is done. */
  keep: <T extends AudioNode>(node: T) => T;
  /** A source: once the last one has ended, every node is disconnected. */
  own: <T extends AudioScheduledSourceNode>(node: T) => T;
};

// —— the building blocks

/** One sounding thing: a level, a place left to right, a send to the room. */
function voice(k: Kit, bus: Bus, gain: number, pan = 0, send = 0): Voice {
  const { c } = k;
  const nodes: AudioNode[] = [];
  const input = c.createGain();
  input.gain.value = gain;
  nodes.push(input);
  let tail: AudioNode = input;
  if (pan) {
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    input.connect(p);
    nodes.push(p);
    tail = p;
  }
  tail.connect(bus.dry);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    tail.connect(s).connect(bus.wet);
    nodes.push(s);
  }
  let sounding = 0;
  const ended = () => {
    sounding -= 1;
    if (sounding <= 0) for (const node of nodes) node.disconnect();
  };
  return {
    input,
    keep: (node) => {
      nodes.push(node);
      return node;
    },
    own: (node) => {
      nodes.push(node);
      sounding += 1;
      node.onended = ended;
      return node;
    },
  };
}

/**
 * Struck: up to `peak` in `attack`, then dying away at a rate that would
 * reach -80 dB by `decay`. It stops at -60, three quarters of the way: the
 * rest can't be heard, and a voice that has finished costs nothing.
 * Gives back when it's done.
 */
function strike(p: AudioParam, at: number, peak: number, attack: number, decay: number) {
  const top = at + attack;
  const end = top + decay * 0.75;
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, top);
  p.exponentialRampToValueAtTime(peak * 1e-3, end);
  p.linearRampToValueAtTime(0, end + 0.005);
  return end + 0.01;
}

/** Held: up in `attack`, easing to `sustain` of the peak by `length`, then let go over `release`. */
function held(p: AudioParam, at: number, peak: number, attack: number, length: number, release: number, sustain = 1) {
  const top = at + attack;
  const off = Math.max(top + 0.005, at + length);
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, top);
  if (sustain < 1) p.exponentialRampToValueAtTime(peak * sustain, off);
  else p.setValueAtTime(peak, off);
  p.exponentialRampToValueAtTime(peak * sustain * 1e-3, off + release);
  p.linearRampToValueAtTime(0, off + release + 0.005);
  return off + release + 0.01;
}

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7, gain = 0) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(freq, c.sampleRate * 0.45);
  f.Q.value = q;
  if (gain) f.gain.value = gain;
  return f;
}

/** A sine partial with its own struck envelope. */
function ring(k: Kit, v: Voice, freq: number, at: number, peak: number, attack: number, decay: number, detune = 0, to: AudioNode = v.input) {
  if (freq >= k.c.sampleRate * 0.45) return;
  const o = v.own(k.c.createOscillator());
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  const g = v.keep(k.c.createGain());
  const end = strike(g.gain, at, peak, attack, decay);
  o.connect(g).connect(to);
  o.start(at);
  o.stop(end);
}

/** A burst of filtered noise with a struck envelope. Gives back its filter. */
function hiss(k: Kit, v: Voice, at: number, peak: number, attack: number, decay: number, type: BiquadFilterType, freq: number, q = 0.7, buffer = k.white, to: AudioNode = v.input) {
  const s = v.own(k.c.createBufferSource());
  s.buffer = buffer;
  s.loop = true;
  const f = v.keep(filter(k.c, type, freq, q));
  const g = v.keep(k.c.createGain());
  const end = strike(g.gain, at, peak, attack, decay);
  s.connect(f).connect(g).connect(to);
  s.start(at, Math.random() * (buffer.duration - 0.25));
  s.stop(end);
  return f;
}

/** A noise that runs until it's let go of: room air, a fan. Gives back its filter. */
function drone(k: Kit, buffer: AudioBuffer, type: BiquadFilterType, freq: number, level: number, to: AudioNode, kept: AudioNode[], q = 0.6) {
  const s = k.c.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  const f = filter(k.c, type, freq, q);
  const g = k.c.createGain();
  g.gain.value = level;
  s.connect(f).connect(g).connect(to);
  s.start(k.c.currentTime, Math.random() * buffer.duration);
  kept.push(s, f, g);
  return f;
}

/** Stops whatever of `kept` is still running, and disconnects all of it once it has. */
function letGo(c: AudioContext, kept: AudioNode[], at: number) {
  for (const node of kept) {
    if (!("stop" in node)) continue;
    try {
      (node as AudioScheduledSourceNode).stop(at);
    } catch {}
  }
  window.setTimeout(() => kept.forEach((node) => node.disconnect()), Math.max(0, at - c.currentTime) * 1000 + 400);
}

// —— the instruments

/** A music box's steel tooth: the note, its twin a hair sharp, a little octave, and the bright flick of the pin. */
function tine(k: Kit, bus: Bus, at: number, midi: number, vel: number, full = true) {
  const f = NOTE(midi);
  const v = voice(k, bus, vel, clamp((midi - 74) / 28, -0.45, 0.45), 0.34);
  // the soft broken chords under the tune ring out sooner than the tune
  const decay = clamp(3.6 - (midi - 60) * 0.07, 1.1, 3.6) * (full ? 1 : 0.6);
  ring(k, v, f, at, 0.2, 0.0015, decay);
  ring(k, v, f * 2, at, 0.035, 0.001, decay * 0.3);
  if (!full) return;
  ring(k, v, f, at, 0.06, 0.0015, decay * 0.85, 4);
  ring(k, v, f * 6.27, at, 0.016, 0.0006, 0.14);
  hiss(k, v, at, 0.03, 0.0005, 0.012, "bandpass", Math.min(f * 4, 9000), 1.2);
}

/** A small glass bell (a celesta's, roughly): chimes, sparkles, hearts. */
function glass(k: Kit, bus: Bus, at: number, midi: number, vel: number, pan = 0) {
  const f = NOTE(midi);
  const v = voice(k, bus, vel, pan, 0.4);
  ring(k, v, f, at, 0.09, 0.0008, clamp(2 - (midi - 84) * 0.06, 0.4, 2));
  ring(k, v, f * 2.005, at, 0.02, 0.0006, 0.35);
  ring(k, v, f * 4.07, at, 0.01, 0.0004, 0.1);
}

/** A soft pad: each note twice, a few cents apart, one each side, so the pairs slowly beat; under a lowpass. */
function pad(k: Kit, bus: Bus, at: number, notes: readonly number[], length: number, vel: number, attack = 0.9, release = 1.6, bright = 1) {
  for (const side of [-1, 1]) {
    const v = voice(k, bus, vel, side * 0.45, 0.5);
    const lp = v.keep(filter(k.c, "lowpass", 1100 * bright, 0.4));
    const g = v.keep(k.c.createGain());
    const end = held(g.gain, at, 0.05, attack, length, release);
    lp.connect(g).connect(v.input);
    for (const m of notes) {
      const o = v.own(k.c.createOscillator());
      o.setPeriodicWave(k.waves.warm);
      o.frequency.value = NOTE(m);
      o.detune.value = side * 6 + rand(-2, 2);
      o.connect(lp);
      o.start(at);
      o.stop(end);
    }
  }
}

/** A breathy wooden flute: a soft reed tone, a chiff of breath, vibrato that arrives late. */
function flute(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, -0.22, 0.42);
  const o = v.own(c.createOscillator());
  o.setPeriodicWave(k.waves.reed);
  o.frequency.value = f;
  const lfo = v.own(c.createOscillator());
  lfo.frequency.value = rand(4.8, 5.4);
  const depth = v.keep(c.createGain());
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(0, at + 0.2);
  depth.gain.linearRampToValueAtTime(8, at + 0.7);
  lfo.connect(depth).connect(o.detune);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.08, 0.07, length, 0.25, 0.8);
  o.connect(g).connect(v.input);
  o.start(at);
  o.stop(end);
  lfo.start(at);
  lfo.stop(end);
  const breath = v.own(c.createBufferSource());
  breath.buffer = k.white;
  breath.loop = true;
  const bp = v.keep(filter(c, "bandpass", f * 2, 1.2));
  const bg = v.keep(c.createGain());
  const off = at + Math.max(0.1, length);
  bg.gain.setValueAtTime(0, at);
  bg.gain.linearRampToValueAtTime(0.03, at + 0.02);
  bg.gain.exponentialRampToValueAtTime(0.006, at + 0.16);
  bg.gain.setValueAtTime(0.006, off);
  bg.gain.linearRampToValueAtTime(0, off + 0.2);
  breath.connect(bp).connect(bg).connect(v.input);
  breath.start(at, Math.random());
  breath.stop(off + 0.22);
}

/** A felt bass under the title: round, a little woody. */
function bass(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, 0, 0.06);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.16, 0.02, length, 0.3, 0.45);
  g.connect(v.input);
  const o = v.own(c.createOscillator());
  o.frequency.value = f;
  o.connect(g);
  const o2 = v.own(c.createOscillator());
  o2.type = "triangle";
  o2.frequency.value = f * 2;
  const g2 = v.keep(c.createGain());
  g2.gain.value = 0.12;
  o2.connect(g2).connect(g);
  for (const s of [o, o2]) {
    s.start(at);
    s.stop(end);
  }
}

/** A round bass with enough overtones to be heard on small speakers. */
function roundBass(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, 0, 0.04);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.17, 0.008, length, 0.12, 0.6);
  g.connect(v.input);
  [1, 0.32, 0.12].forEach((level, i) => {
    const o = v.own(c.createOscillator());
    o.frequency.value = f * (i + 1);
    const lv = v.keep(c.createGain());
    lv.gain.value = level;
    o.connect(lv).connect(g);
    o.start(at);
    o.stop(end);
  });
}

/** An electric piano: a tine's bell through FM, bright as it's struck and mellow as it rings. */
function epiano(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number, pan = 0) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, pan, 0.22);
  const car = v.own(c.createOscillator());
  car.frequency.value = f;
  const mod = v.own(c.createOscillator());
  mod.frequency.value = f;
  const index = v.keep(c.createGain());
  index.gain.setValueAtTime(0, at);
  index.gain.linearRampToValueAtTime(f * 1.5, at + 0.003);
  index.gain.exponentialRampToValueAtTime(f * 0.16, at + 0.55);
  mod.connect(index).connect(car.frequency);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.07, 0.003, length, 0.35, 0.35);
  car.connect(g).connect(v.input);
  ring(k, v, f * 4, at, 0.006, 0.001, 0.07);
  for (const s of [car, mod]) {
    s.start(at);
    s.stop(end);
  }
}

/** A marimba bar: the note, its overtone tuned two octaves up, and the mallet. */
function marimba(k: Kit, bus: Bus, at: number, midi: number, vel: number, room = 0.25) {
  const f = NOTE(midi);
  const v = voice(k, bus, vel, clamp((midi - 70) / 26, -0.5, 0.5), room);
  ring(k, v, f, at, 0.16, 0.001, clamp(1.5 - (midi - 60) * 0.035, 0.35, 1.5));
  ring(k, v, f * 4, at, 0.03, 0.0008, 0.07);
  ring(k, v, f * 9.9, at, 0.008, 0.0005, 0.025);
  hiss(k, v, at, 0.04, 0.0005, 0.006, "lowpass", 2400);
}

/** A plucked double bass: round and short. */
function pizz(k: Kit, bus: Bus, at: number, midi: number, vel: number) {
  const f = NOTE(midi);
  const v = voice(k, bus, vel, -0.05, 0.12);
  ring(k, v, f, at, 0.2, 0.004, 0.55);
  ring(k, v, f * 2, at, 0.06, 0.003, 0.22);
  ring(k, v, f * 3, at, 0.02, 0.002, 0.1);
}

/** A glockenspiel bar: bright, with a free bar's stretched overtones. */
function glock(k: Kit, bus: Bus, at: number, midi: number, vel: number) {
  const f = NOTE(midi);
  const v = voice(k, bus, vel, 0.25, 0.4);
  ring(k, v, f, at, 0.08, 0.0006, 1.2);
  ring(k, v, f * 2.76, at, 0.025, 0.0005, 0.25);
  ring(k, v, f * 5.4, at, 0.008, 0.0004, 0.08);
}

/** A brass player: two sawtooths, a lowpass that opens on the attack (the blat), vibrato on a long note. */
function brass(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number, pan = 0) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, pan, 0.35);
  const lp = v.keep(filter(c, "lowpass", f * 1.3, 1.4));
  lp.frequency.setValueAtTime(f * 1.3, at);
  lp.frequency.linearRampToValueAtTime(Math.min(f * 6, 8000), at + 0.05);
  lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3.2, 6000), at + 0.25);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.05, 0.035, length, 0.09, 0.8);
  lp.connect(g).connect(v.input);
  let wobble: GainNode | null = null;
  if (length > 0.35) {
    const lfo = v.own(c.createOscillator());
    lfo.frequency.value = 5.4;
    wobble = v.keep(c.createGain());
    wobble.gain.setValueAtTime(0, at);
    wobble.gain.linearRampToValueAtTime(0, at + 0.22);
    wobble.gain.linearRampToValueAtTime(11, at + 0.5);
    lfo.connect(wobble);
    lfo.start(at);
    lfo.stop(end);
  }
  for (const d of [-6, 6]) {
    const o = v.own(c.createOscillator());
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = d;
    wobble?.connect(o.detune);
    o.connect(lp);
    o.start(at);
    o.stop(end);
  }
}

/** The tuba: one dark sawtooth with a round sine under it. */
function tuba(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, -0.15, 0.25);
  const lp = v.keep(filter(c, "lowpass", f * 2.6, 0.8));
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.09, 0.03, length, 0.07, 0.85);
  lp.connect(g).connect(v.input);
  const o = v.own(c.createOscillator());
  o.type = "sawtooth";
  o.frequency.value = f;
  o.connect(lp);
  const sub = v.own(c.createOscillator());
  sub.frequency.value = f;
  sub.connect(lp);
  for (const s of [o, sub]) {
    s.start(at);
    s.stop(end);
  }
}

/** A marching snare: tight and crisp, with its wires; a flam is a grace note just before. */
function snareDrum(k: Kit, bus: Bus, at: number, vel: number, flam = false) {
  const v = voice(k, bus, vel, 0.12, 0.3);
  const hit = flam ? at + 0.022 : at;
  if (flam) hiss(k, v, at, 0.05, 0.0005, 0.03, "bandpass", 3600, 0.7);
  hiss(k, v, hit, 0.16, 0.0005, 0.09, "bandpass", 3800, 0.6);
  hiss(k, v, hit, 0.06, 0.001, 0.14, "highpass", 6000, 0.7);
  ring(k, v, 330, hit, 0.08, 0.001, 0.05);
}

/** A marching bass drum: a big soft boom and the felt of the beater. */
function bassDrum(k: Kit, bus: Bus, at: number, vel: number) {
  const { c } = k;
  const v = voice(k, bus, vel, -0.05, 0.25);
  const o = v.own(c.createOscillator());
  o.frequency.setValueAtTime(92, at);
  o.frequency.exponentialRampToValueAtTime(56, at + 0.12);
  const g = v.keep(c.createGain());
  const end = strike(g.gain, at, 0.32, 0.002, 0.55);
  o.connect(g).connect(v.input);
  o.start(at);
  o.stop(end);
  hiss(k, v, at, 0.08, 0.0008, 0.05, "lowpass", 380);
}

/** A pair of crash cymbals. */
function cymbal(k: Kit, bus: Bus, at: number, vel: number) {
  const v = voice(k, bus, vel, 0.2, 0.45);
  hiss(k, v, at, 0.06, 0.001, 1.6, "highpass", 4800, 0.5);
  hiss(k, v, at, 0.035, 0.001, 0.7, "bandpass", 7600, 0.9);
}

/** A kick drum: a sine that drops, and the beater's click. */
function kick(k: Kit, bus: Bus, at: number, vel: number, low = 48) {
  const { c } = k;
  const v = voice(k, bus, vel, 0, 0.03);
  const o = v.own(c.createOscillator());
  o.frequency.setValueAtTime(low * 3.2, at);
  o.frequency.exponentialRampToValueAtTime(low, at + 0.09);
  const g = v.keep(c.createGain());
  const end = strike(g.gain, at, 0.5, 0.002, 0.38);
  o.connect(g).connect(v.input);
  o.start(at);
  o.stop(end);
  hiss(k, v, at, 0.06, 0.0005, 0.01, "highpass", 3000);
}

/** A snare, soft enough for a lo-fi record: noise and a little tone. */
function snare(k: Kit, bus: Bus, at: number, vel: number) {
  const v = voice(k, bus, vel, 0.08, 0.25);
  hiss(k, v, at, 0.22, 0.001, 0.16, "bandpass", 1800, 0.7);
  ring(k, v, 190, at, 0.1, 0.001, 0.07);
}

function hat(k: Kit, bus: Bus, at: number, vel: number, open = false) {
  const v = voice(k, bus, vel, 0.3, 0.1);
  hiss(k, v, at, 0.09, 0.0005, open ? 0.24 : 0.035, "highpass", 7500, 0.8);
}

function clap(k: Kit, bus: Bus, at: number, vel: number) {
  const v = voice(k, bus, vel, -0.1, 0.3);
  for (const dt of [0, 0.011, 0.022]) hiss(k, v, at + dt, 0.12, 0.0005, 0.012, "bandpass", 1300, 1.1);
  hiss(k, v, at + 0.03, 0.1, 0.002, 0.16, "bandpass", 1200, 0.9);
}

/**
 * A felt piano: soft hammers, and each overtone dying faster than the one
 * below it, so the note darkens as it rings, as a string's does. The damper
 * comes down at `length`.
 */
function piano(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, clamp((midi - 62) / 30, -0.5, 0.5), 0.38);
  // lower strings ring longer; a harder strike has more overtones in it
  const tau = clamp(1.7 - (midi - 48) * 0.022, 0.45, 1.7);
  const off = at + Math.max(0.05, length);
  const bright = 0.35 + 0.65 * vel;
  [1, 0.42 * bright, 0.16 * bright].forEach((level, i) => {
    const n = i + 1;
    const o = v.own(c.createOscillator());
    // a string's stiffness stretches its overtones a little sharp
    o.frequency.value = f * n * Math.sqrt(1 + 0.00035 * n * n);
    const g = v.keep(c.createGain());
    const t = tau / n;
    // down 60 dB, or the damper, whichever comes first
    const fade = Math.min(off, at + t * 6.9);
    const peak = 0.11 * level;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.005);
    g.gain.exponentialRampToValueAtTime(peak * Math.exp(-(fade - at) / t), fade);
    g.gain.linearRampToValueAtTime(0, fade + 0.3);
    o.connect(g).connect(v.input);
    o.start(at);
    o.stop(fade + 0.31);
  });
  hiss(k, v, at, 0.03, 0.001, 0.025, "lowpass", 1100);
}

/** A synth pluck for an arpeggio: a resonant lowpass snapping shut. */
function pluck(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number, pan: number, open = 1) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, pan, 0.22);
  const lp = v.keep(filter(c, "lowpass", f * 7 * open, 6));
  lp.frequency.setValueAtTime(Math.min(f * 7 * open, 9000), at);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 200), at + 0.16);
  const g = v.keep(c.createGain());
  const end = strike(g.gain, at, 0.05, 0.002, Math.max(0.12, length));
  lp.connect(g).connect(v.input);
  const o = v.own(c.createOscillator());
  o.type = "sawtooth";
  o.frequency.value = f;
  o.connect(lp);
  const o2 = v.own(c.createOscillator());
  o2.type = "square";
  o2.frequency.value = f;
  o2.detune.value = 7;
  const g2 = v.keep(c.createGain());
  g2.gain.value = 0.4;
  o2.connect(g2).connect(lp);
  for (const s of [o, o2]) {
    s.start(at);
    s.stop(end);
  }
}

function synthBass(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, 0, 0.04);
  const lp = v.keep(filter(c, "lowpass", 900, 2));
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(300, at + 0.12);
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.1, 0.005, length, 0.06, 0.7);
  lp.connect(g).connect(v.input);
  const o = v.own(c.createOscillator());
  o.type = "sawtooth";
  o.frequency.value = f;
  o.connect(lp);
  const sub = v.own(c.createOscillator());
  sub.frequency.value = f;
  const sg = v.keep(c.createGain());
  sg.gain.value = 0.6;
  sub.connect(sg).connect(g);
  for (const s of [o, sub]) {
    s.start(at);
    s.stop(end);
  }
}

/** A soft square lead, for the theme over the hackathon loop. */
function lead(k: Kit, bus: Bus, at: number, midi: number, length: number, vel: number) {
  const { c } = k;
  const f = NOTE(midi);
  const v = voice(k, bus, vel, 0.12, 0.35);
  const o = v.own(c.createOscillator());
  o.setPeriodicWave(k.waves.square);
  o.frequency.value = f;
  const lfo = v.own(c.createOscillator());
  lfo.frequency.value = 5.6;
  const depth = v.keep(c.createGain());
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(0, at + 0.18);
  depth.gain.linearRampToValueAtTime(9, at + 0.45);
  lfo.connect(depth).connect(o.detune);
  const lp = v.keep(filter(c, "lowpass", 2600, 0.5));
  const g = v.keep(c.createGain());
  const end = held(g.gain, at, 0.05, 0.012, length, 0.18, 0.85);
  o.connect(lp).connect(g).connect(v.input);
  for (const s of [o, lfo]) {
    s.start(at);
    s.stop(end);
  }
}

// A big bronze bell's partials, against the note it strikes: the hum an
// octave under, the prime, the minor-third tierce that makes a bell sound
// like a bell, the quint, the nominal, and a few above. [ratio, level,
// seconds to ring out]
const BELL: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.05, 10],
  [1, 0.06, 8],
  [1.188, 0.05, 6],
  [1.5, 0.022, 4],
  [2, 0.05, 5],
  [2.5, 0.016, 3],
  [2.66, 0.012, 2.2],
  [3.01, 0.012, 2],
  [4.07, 0.006, 1.2],
];

/** The Campanile's hour bell, from across campus. */
function bell(k: Kit, bus: Bus, at: number, vel: number) {
  const f = NOTE(48);
  const v = voice(k, bus, vel, -0.25, 0.65);
  const far = v.keep(filter(k.c, "lowpass", 2400, 0.5));
  far.connect(v.input);
  BELL.forEach(([ratio, level, decay], i) => {
    ring(k, v, f * ratio, at, level, 0.002, decay, 0, far);
    // the hum beats slowly against a twin, the way a big bell wavers as it dies
    if (i === 0) ring(k, v, f * ratio + rand(0.4, 0.8), at, level * 0.6, 0.002, decay * 0.9, 0, far);
  });
  hiss(k, v, at, 0.03, 0.0008, 0.05, "bandpass", 2200, 3, k.white, far);
  hiss(k, v, at, 0.04, 0.001, 0.09, "lowpass", 600, 0.7, k.white, far);
}

// —— the music: what plays where

/** A piece of music, played a sixteenth at a time. */
type Score = {
  bpm: (bar: number) => number;
  /** How late the off sixteenths fall, as a share of one. */
  swing: number;
  /** How much tape wow it wants: 1 is the title's. */
  wow: number;
  /** Bars it plays once, before bar 0. */
  intro: number;
  /** Its fader's level, so every place sits about as loud as the title. */
  level: number;
  play: (at: number, bar: number, step: number, sixteenth: number) => void;
  /** Lets go of whatever it kept running (a hum, the crackle). */
  stop: (at: number) => void;
};

// The title theme, in eighths: [where in the bar, note, how long]. Four bars
// on C–Am–F–G, the same four reaching up to the high C, a bridge that climbs
// (Dm7, C/E, Fmaj7, G7), and home again.
type Line = ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
const THEME: Line = [
  [[0, 76, 3], [3, 74, 1], [4, 76, 2], [6, 79, 2]],
  [[0, 81, 3], [3, 79, 1], [4, 76, 2], [6, 72, 2]],
  [[0, 77, 3], [3, 76, 1], [4, 77, 2], [6, 81, 2]],
  [[0, 79, 6], [6, 74, 2]],
  [[0, 76, 3], [3, 74, 1], [4, 76, 2], [6, 79, 2]],
  [[0, 84, 3], [3, 83, 1], [4, 81, 2], [6, 76, 2]],
  [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]],
  [[0, 83, 2], [2, 84, 1], [3, 83, 1], [4, 79, 4]],
  [[0, 77, 4], [4, 76, 2], [6, 74, 2]],
  [[0, 79, 4], [4, 77, 2], [6, 76, 2]],
  [[0, 81, 4], [4, 79, 2], [6, 77, 2]],
  [[0, 83, 3], [3, 81, 1], [4, 79, 2], [6, 74, 2]],
  [[0, 76, 3], [3, 74, 1], [4, 76, 2], [6, 79, 2]],
  [[0, 84, 3], [3, 83, 1], [4, 81, 2], [6, 76, 2]],
  [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]],
  [[0, 83, 2], [2, 81, 2], [4, 79, 2], [6, 74, 2]],
];
// The flute under it from the second time through: in the bridge it climbs
// in tenths over the bass (F, G, A, B over D, E, F, G).
const COUNTER: Line = [
  [], [], [], [],
  [[0, 67, 4], [4, 69, 2], [6, 71, 2]],
  [[0, 69, 4], [4, 72, 2], [6, 71, 2]],
  [[0, 69, 4], [4, 67, 2], [6, 65, 2]],
  [[0, 67, 6], [6, 71, 2]],
  [[0, 65, 8]],
  [[0, 67, 8]],
  [[0, 69, 8]],
  [[0, 71, 4], [4, 74, 4]],
  [[0, 72, 4], [4, 71, 2], [6, 67, 2]],
  [[0, 69, 4], [4, 72, 2], [6, 71, 2]],
  [[0, 69, 4], [4, 67, 2], [6, 65, 2]],
  [[0, 67, 4], [4, 65, 2], [6, 62, 2]],
];
const TITLE = ["C", "Am", "F", "G", "C", "Am", "F", "G", "Dm", "CE", "Fmaj", "G7", "C", "Am", "F", "G7"];
const FOUR = ["C", "Am", "F", "G"];
const MINOR = ["Am", "F", "C", "G"];
// close voicings that move as little as they can from chord to chord
const PAD: Record<string, readonly number[]> = {
  C: [55, 60, 62, 64],
  Am: [55, 57, 60, 64],
  F: [57, 60, 64, 67],
  G: [55, 59, 62, 64],
  Dm: [53, 57, 60, 62],
  CE: [55, 60, 64, 67],
  Fmaj: [53, 57, 60, 64],
  G7: [53, 55, 59, 62],
};
const ROOT: Record<string, number> = { C: 48, Am: 45, F: 41, G: 43, Dm: 50, CE: 52, Fmaj: 53, G7: 55 };
// the music box's own broken chords, under the tune
const BROKEN: Record<string, readonly number[]> = {
  C: [60, 67, 72, 76],
  Am: [57, 64, 69, 72],
  F: [53, 60, 65, 69],
  G: [55, 62, 67, 71],
  Dm: [50, 57, 62, 65],
  CE: [52, 60, 64, 67],
  Fmaj: [53, 60, 64, 69],
  G7: [55, 62, 65, 71],
};
const ARP = [0, 1, 2, 1, 3, 1, 2, 1];

/** The title theme: a music box over a soft pad, C–Am–F–G at 84. The morning version is slower and barer. */
function titleScore(k: Kit, bus: Bus, morning: boolean): Score {
  const length = morning ? 8 : 16;
  return {
    bpm: () => (morning ? 76 : 84),
    swing: 0,
    wow: 1,
    intro: 2,
    level: morning ? 1.12 : 1,
    play(at, bar, step, s) {
      const i = bar < 0 ? -1 : bar % length;
      const name = i < 0 ? (bar === -2 ? "C" : "G7") : TITLE[i];
      const part = i < 0 ? -1 : i >> 2;
      if (step === 0) {
        pad(k, bus, at, PAD[name], 16 * s, morning ? 0.28 : 0.4);
        const root = ROOT[name];
        if (part === 1 || part === 3) {
          bass(k, bus, at, root, 8 * s, 0.4);
          bass(k, bus, at + 8 * s, root - 5, 8 * s, 0.3);
        } else bass(k, bus, at, root, 16 * s, part < 0 ? 0.32 : 0.4);
      }
      // the box's own broken chords: quarters at first, eighths once it's going
      if (step % (morning || part === 0 ? 4 : 2) === 0) {
        tine(k, bus, at + rand(-0.004, 0.008), BROKEN[name][ARP[step >> 1]], (step === 0 ? 0.5 : 0.36) * (morning ? 0.8 : 1), false);
      }
      if (i < 0) return;
      for (const [pos, note] of THEME[i]) {
        if (pos * 2 === step) tine(k, bus, at + rand(-0.005, 0.01), note, (pos === 0 ? 1 : 0.84) * rand(0.9, 1.04) * (morning ? 0.8 : 1));
      }
      if (morning) return;
      for (const [pos, note, len] of COUNTER[i]) {
        if (pos * 2 === step) flute(k, bus, at + rand(0, 0.015), note, len * 2 * s, 1);
      }
    },
    stop: () => {},
  };
}

// chapter one's chords: the same four, voiced the way a lo-fi record does
const LOFI: Record<string, readonly number[]> = {
  C: [52, 55, 59, 62],
  Am: [55, 59, 60, 64],
  F: [52, 55, 57, 60],
  G: [53, 57, 59, 64],
};

/** Lo-fi beats, swung and dusty, with the theme on electric piano every other time round; through a laptop's speaker in the bedroom. */
function lofiScore(k: Kit, bus: Bus, speaker: boolean): Score {
  const { c } = k;
  const kept: AudioNode[] = [];
  let out = bus;
  if (speaker) {
    // a laptop's speaker: no bottom, a honk in the middle, no top
    const hp = filter(c, "highpass", 240, 0.7);
    const mid = filter(c, "peaking", 1700, 0.9, 5);
    const lp = filter(c, "lowpass", 6200, 0.6);
    hp.connect(mid).connect(lp).connect(bus.dry);
    kept.push(hp, mid, lp);
    out = { dry: hp, wet: bus.wet };
  }
  const dust = c.createBufferSource();
  dust.buffer = k.crackle;
  dust.loop = true;
  const dustLevel = c.createGain();
  dustLevel.gain.value = 0.8;
  dust.connect(dustLevel).connect(out.dry);
  dust.start(c.currentTime + 0.05, Math.random() * 3);
  kept.push(dust, dustLevel);
  return {
    bpm: () => 80,
    swing: 0.17,
    wow: 1.6,
    intro: 0,
    level: speaker ? 0.92 : 0.7,
    play(at, bar, step, s) {
      const name = FOUR[bar & 3];
      const i = bar % 8;
      if (step === 0 || step === 10 || (step === 7 && !(bar & 1)) || (step === 14 && (bar & 3) === 3)) kick(k, out, at, step === 0 ? 1 : 0.7);
      // the snare a touch behind the beat, the way it's played lazy
      if (step === 4 || step === 12) snare(k, out, at + rand(0.004, 0.014), 0.8);
      if (step % 2 === 0) hat(k, out, at, step % 4 === 0 ? 0.55 : 0.4);
      else if (step === 3 || step === 11 || (step === 15 && i === 7)) hat(k, out, at, 0.22);
      // the chord on one, pushed again on the and-of-two, strummed
      if (step === 0 || step === 7) {
        LOFI[name].forEach((m, j) => epiano(k, out, at + j * 0.016 + rand(0, 0.006), m, (step === 0 ? 7 : 9) * s, step === 0 ? 0.6 : 0.45, -0.15 + j * 0.1));
      }
      if (step === 0) roundBass(k, out, at, ROOT[name], 5 * s, 1);
      if (step === 7) roundBass(k, out, at, ROOT[name], 2 * s, 0.7);
      if (step === 10) roundBass(k, out, at, ROOT[name] + 7, 4 * s, 0.8);
      if (i >= 4) {
        for (const [pos, note, len] of THEME[i - 4]) if (pos * 2 === step) epiano(k, out, at + rand(0, 0.012), note, len * 2 * s, 1.1, 0.2);
      }
    },
    stop: (at) => letGo(c, kept, at),
  };
}

/** A school: the lights humming in the hallway (air, in the big hall), and a marimba bouncing on the four chords. */
function schoolScore(k: Kit, bus: Bus, big: boolean): Score {
  const { c } = k;
  const kept: AudioNode[] = [];
  drone(k, k.pink, "lowpass", big ? 240 : 520, big ? 0.05 : 0.03, bus.dry, kept);
  if (!big) {
    // fluorescent tubes: a thin buzz at twice the mains, flickering a little
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 120;
    const bp = filter(c, "bandpass", 360, 2.2);
    const g = c.createGain();
    g.gain.value = 0.0045;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.31;
    const lg = c.createGain();
    lg.gain.value = 0.0012;
    lfo.connect(lg).connect(g.gain);
    o.connect(bp).connect(g).connect(bus.dry);
    o.start();
    lfo.start();
    kept.push(o, bp, g, lfo, lg);
  }
  const room = big ? 0.42 : 0.25;
  const bounce = [0, 3, 6, 8, 11, 14];
  return {
    bpm: () => 100,
    swing: 0,
    wow: 0.45,
    intro: 0,
    level: big ? 1.36 : 1.62,
    play(at, bar, step) {
      const name = FOUR[bar & 3];
      const slot = bounce.indexOf(step);
      const t = at + rand(-0.003, 0.006);
      if (slot >= 0) marimba(k, bus, t, BROKEN[name][[0, 1, 2, 0, 1, 3][slot]], slot === 0 ? 0.6 : 0.42, room);
      if (step === 0 || step === 8) pizz(k, bus, at, step === 0 ? ROOT[name] : ROOT[name] - 5, 0.8);
      if (bar % 8 >= 4) {
        for (const [pos, note] of THEME[bar & 3]) if (pos * 2 === step) marimba(k, bus, t, note, 1, room);
      }
    },
    stop: (at) => letGo(c, kept, at),
  };
}

const HORNS: Record<string, readonly number[]> = { C: [60, 64, 67], Am: [57, 60, 64], F: [57, 60, 65], G: [55, 59, 62] };

/** A marching band at graduation, across the field: the theme on trumpets, oom-pah under it, the drumline, an echo off the stands. */
function bandScore(k: Kit, bus: Bus): Score {
  const { c } = k;
  const kept: AudioNode[] = [];
  // the top end lost across the grass, and the stands throwing it back
  const lp = filter(c, "lowpass", 2600, 0.5);
  const wet = filter(c, "lowpass", 2000, 0.5);
  const echo = c.createDelay(1);
  echo.delayTime.value = 0.21;
  const back = filter(c, "lowpass", 1500, 0.5);
  const feedback = c.createGain();
  feedback.gain.value = 0.22;
  const ret = c.createGain();
  ret.gain.value = 0.3;
  lp.connect(bus.dry);
  lp.connect(echo);
  echo.connect(back);
  back.connect(feedback).connect(echo);
  back.connect(ret).connect(bus.dry);
  wet.connect(bus.wet);
  kept.push(lp, wet, echo, back, feedback, ret);
  drone(k, k.pink, "bandpass", 600, 0.03, bus.dry, kept, 0.5);
  const out: Bus = { dry: lp, wet };
  return {
    bpm: () => 116,
    swing: 0,
    wow: 0.2,
    intro: 1,
    level: 1,
    play(at, bar, step, s) {
      if (bar < 0) {
        // the drumline counts it in, and rolls into it
        if (step % 4 === 0) bassDrum(k, out, at, 0.9);
        if (step < 12 && step % 2 === 0) snareDrum(k, out, at, step % 4 === 0 ? 0.9 : 0.6, step % 4 === 0);
        if (step >= 12) {
          snareDrum(k, out, at, 0.5 + (step - 12) * 0.1);
          snareDrum(k, out, at + s / 2, 0.55 + (step - 12) * 0.1);
        }
        return;
      }
      const i = bar % 8;
      const name = FOUR[bar & 3];
      if (step === 0 || step === 8) bassDrum(k, out, at, step === 0 ? 1 : 0.8);
      if (step === 0 && i === 0) cymbal(k, out, at, 0.8);
      if (step % 4 === 2) snareDrum(k, out, at, 0.55);
      if (step === 4 || step === 12) snareDrum(k, out, at, 0.9, true);
      if (i === 7 && step >= 12) snareDrum(k, out, at + s / 2, 0.7);
      if (step === 0) tuba(k, out, at, ROOT[name], 3 * s, 1);
      if (step === 8) tuba(k, out, at, ROOT[name] - 5, 3 * s, 0.8);
      if (step === 4 || step === 12) for (const m of HORNS[name]) brass(k, out, at, m, 1.6 * s, 0.4, 0.15);
      // the tune on trumpets, and the bells over it on the way round again
      for (const [pos, note, len] of THEME[i]) {
        if (pos * 2 !== step) continue;
        brass(k, out, at + rand(0, 0.008), note - 12, len * 2 * s * 0.92, 1, -0.1);
        if (bar % 16 >= 8) glock(k, out, at, note + 12, 0.6);
      }
    },
    stop: (at) => letGo(c, kept, at),
  };
}

// a felt piano's left hand, broken chords up and back down
const HAND: Record<string, readonly number[]> = {
  C: [48, 55, 60, 64, 67, 64, 60, 55],
  Am: [45, 52, 57, 60, 64, 60, 57, 52],
  F: [41, 48, 53, 57, 60, 57, 53, 48],
  G: [43, 50, 55, 59, 62, 59, 55, 50],
};

/** Berkeley: a felt piano. By night the same four chords start on A minor; in the city it's brighter and quicker. */
function campusScore(k: Kit, bus: Bus, mode: "day" | "night" | "city"): Score {
  const { c } = k;
  const kept: AudioNode[] = [];
  const chords = mode === "night" ? MINOR : FOUR;
  if (mode === "night") drone(k, k.pink, "lowpass", 420, 0.02, bus.dry, kept);
  return {
    bpm: () => (mode === "night" ? 64 : mode === "city" ? 76 : 70),
    swing: 0,
    wow: 0.7,
    intro: 0,
    level: mode === "city" ? 0.86 : 1,
    play(at, bar, step, s) {
      const name = chords[bar & 3];
      if (step % 2 === 0) {
        const j = step >> 1;
        piano(k, bus, at + rand(-0.004, 0.012), HAND[name][j], (16 - step) * s + 0.25, j === 0 ? 0.48 : 0.3);
      }
      if (step === 0 && mode !== "night") pad(k, bus, at, PAD[name], 16 * s, mode === "city" ? 0.45 : 0.32, 1.4, 2.2, 0.8);
      // the tune every other time round; otherwise one high note, now and then
      if ((bar >> 2) % 2 === 1) {
        for (const [pos, note, len] of THEME[bar & 3]) {
          if (pos * 2 === step) piano(k, bus, at + rand(0, 0.015), note - (mode === "night" ? 12 : 0), len * 2 * s + 0.2, 0.85);
        }
      } else if (step === 8 && bar & 1) piano(k, bus, at + rand(0, 0.02), PAD[name][3] + 12, 8 * s, 0.3);
    },
    stop: (at) => letGo(c, kept, at),
  };
}

const HACK_ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];
const HACK_SET: Record<string, readonly number[]> = { Am: [57, 64, 69, 72], F: [53, 60, 65, 69], C: [60, 64, 67, 72], G: [55, 62, 67, 71] };

/** A hackathon: a driving arpeggio on the four chords from A minor, a kick that pumps everything, the theme on top, and it gets faster as the night goes on. */
function hackScore(k: Kit, bus: Bus): Score {
  const { c } = k;
  // what pumps under the kick: the pad, the bass, the arpeggio
  const pump = c.createGain();
  pump.connect(bus.dry);
  const pumped: Bus = { dry: pump, wet: bus.wet };
  return {
    bpm: (bar) => Math.min(128, 112 + Math.max(0, (bar - 8) >> 2) * 2),
    swing: 0,
    wow: 0.15,
    intro: 0,
    level: 0.74,
    play(at, bar, step, s) {
      // four bars build in once; after that it goes round twelve
      const k12 = bar < 16 ? bar : 4 + ((bar - 4) % 12);
      const name = MINOR[bar & 3];
      if (step === 0) pad(k, pumped, at, PAD[name], 16 * s, 0.5, 0.3, 0.6, 1.2);
      pluck(k, pumped, at, HACK_SET[name][HACK_ARP[step]], s * 1.6, step % 4 === 0 ? 0.9 : 0.62, step & 1 ? 0.3 : -0.3, 1 + k12 * 0.08);
      if (k12 >= 4) {
        if (step % 4 === 0) {
          kick(k, bus, at, 1);
          pump.gain.setTargetAtTime(0.55, at, 0.004);
          pump.gain.setTargetAtTime(1, at + 0.03, 0.08);
        }
        if (step % 2 === 0) synthBass(k, pumped, at, ROOT[name] + (step % 4 === 2 ? 12 : 0), s * 1.6, 0.9);
      }
      if (k12 >= 8) {
        if (step === 4 || step === 12) clap(k, bus, at, 0.8);
        if (step % 4 === 2) hat(k, bus, at, 0.5, true);
        else if (step & 1) hat(k, bus, at, 0.28);
      }
      if (k12 >= 12) {
        for (const [pos, note, len] of THEME[bar & 3]) if (pos * 2 === step) lead(k, bus, at, note, len * 2 * s, 1.1);
      }
    },
    stop: (at) => window.setTimeout(() => pump.disconnect(), Math.max(0, at - c.currentTime) * 1000 + 400),
  };
}

type Bed = "title" | "morning" | "laptop" | "lofi" | "hallway" | "auditorium" | "band" | "campus" | "night" | "city" | "hack";

function scoreOf(id: Bed, k: Kit, bus: Bus): Score {
  switch (id) {
    case "morning":
      return titleScore(k, bus, true);
    case "laptop":
      return lofiScore(k, bus, true);
    case "lofi":
      return lofiScore(k, bus, false);
    case "hallway":
      return schoolScore(k, bus, false);
    case "auditorium":
      return schoolScore(k, bus, true);
    case "band":
      return bandScore(k, bus);
    case "campus":
      return campusScore(k, bus, "day");
    case "night":
      return campusScore(k, bus, "night");
    case "city":
      return campusScore(k, bus, "city");
    case "hack":
      return hackScore(k, bus);
    default:
      return titleScore(k, bus, false);
  }
}

/** What plays where: the title theme on the title screen, then each chapter's own (docs/aiden-the-game.md, Sound). */
function bedOf(chapter: string | null, place = "", night = false): Bed {
  if (chapter === "prologue") return "morning";
  if (chapter === "ch1") return place === "street" ? "lofi" : "laptop";
  if (chapter === "ch2") return place === "field" ? "band" : place === "auditorium" ? "auditorium" : "hallway";
  if (chapter === "ch3" || chapter === "ch4") {
    if (place === "hackathon" || (chapter === "ch4" && place === "dorm")) return "hack";
    if (place === "office") return "city";
    return night ? "night" : "campus";
  }
  return "title";
}

type Surface = "soft" | "hard" | "street" | "grass";
const SURFACE: Record<string, Surface> = {
  bedroom: "soft",
  dorm: "soft",
  street: "street",
  hallway: "hard",
  auditorium: "hard",
  hall: "hard",
  office: "hard",
  hackathon: "hard",
  field: "grass",
  glade: "grass",
};

// —— generated buffers and the master chain

function noise(c: BaseAudioContext, seconds: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Pink noise (equal energy per octave, softer than white), its end crossfaded into its start so it loops without a seam. */
function pinkNoise(c: BaseAudioContext, seconds: number) {
  const n = Math.floor(c.sampleRate * seconds);
  const fade = Math.floor(c.sampleRate * 0.05);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i += 1) d[i] = i < fade ? raw[i] * (i / fade) + raw[n + i] * (1 - i / fade) : raw[i];
  return b;
}

/** A record's surface: a soft hiss and the odd speck of dust. */
function crackle(c: BaseAudioContext) {
  const n = c.sampleRate * 4;
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i += 1) {
    lp += 0.25 * (Math.random() * 2 - 1 - lp);
    d[i] = lp * 0.02;
  }
  for (let j = 0; j < 36; j += 1) {
    const at = Math.floor(Math.random() * (n - 40));
    const amp = Math.random() ** 3 * 0.5 + 0.03;
    const sign = Math.random() < 0.5 ? -1 : 1;
    for (let t = 0; t < 24; t += 1) d[at + t] += sign * amp * Math.exp(-t / 3) * (t % 2 ? -0.6 : 1);
  }
  return b;
}

/** A room, made up: a short pre-delay, a few early reflections, then a tail that darkens as it dies. Unit energy, so a send of 0.3 is about 0.3 of the level. */
function impulse(c: BaseAudioContext, seconds = 2.4, rt60 = 1.9) {
  const rate = c.sampleRate;
  const n = Math.floor(rate * seconds);
  const ir = c.createBuffer(2, n, rate);
  const pre = Math.floor(rate * 0.011);
  const hp = Math.exp((-2 * Math.PI * 140) / rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = ir.getChannelData(ch);
    // the tail's level and its darkening, each a running multiplier rather
    // than an exp a sample
    const fall = Math.exp(-6.91 / rt60 / rate);
    const darken = Math.exp(-2.4 / rate);
    let lp = 0, x1 = 0, y = 0, level = 1, bright = 1;
    for (let i = pre; i < n; i += 1) {
      lp += (0.08 + 0.84 * bright) * (Math.random() * 2 - 1 - lp);
      const x = lp * level;
      y = hp * (y + x - x1);
      x1 = x;
      d[i] = y;
      level *= fall;
      bright *= darken;
    }
    for (let r = 0; r < 7; r += 1) {
      const at = pre + Math.floor(rate * (0.004 + r * 0.0065 + Math.random() * 0.004 + ch * 0.0017));
      d[at] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-r * 0.35);
    }
    const fade = Math.floor(rate * 0.05);
    for (let i = 0; i < fade; i += 1) d[n - 1 - i] *= i / fade;
    let energy = 0;
    for (let i = 0; i < n; i += 1) energy += d[i] * d[i];
    const scale = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < n; i += 1) d[i] *= scale;
  }
  return ir;
}

/** Runs `fn` when the main thread has a moment (or soon, where there's no requestIdleCallback). */
function idle(fn: () => void) {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 1200 });
  else window.setTimeout(fn, 120);
}

function wave(c: AudioContext, harmonics: readonly number[]) {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  harmonics.forEach((h, i) => (imag[i + 1] = h));
  return c.createPeriodicWave(real, imag);
}

function compressor(c: AudioContext, threshold: number, ratio: number, attack: number, release: number) {
  const d = c.createDynamicsCompressor();
  d.threshold.value = threshold;
  d.knee.value = 0;
  d.ratio.value = ratio;
  d.attack.value = attack;
  d.release.value = release;
  return d;
}

/** The make-up gain a DynamicsCompressorNode adds on its own (the spec's: the inverse of its full-range gain, to the 0.6). */
const makeup = (threshold: number, ratio: number) => 10 ** ((0.6 * -threshold * (1 - 1 / ratio)) / 20);

/** A soft ceiling: straight through up to -3 dBFS, then rounding off so nothing ever passes about -1.2. */
function ceiling() {
  const n = 2049;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.18 * Math.tanh((a - 0.7) / 0.18));
  }
  return curve;
}

// how loud the music sits under everything else
const MUSIC = 0.62;
const ROOM = 0.075;

type Running = { id: Bed; score: Score; dry: GainNode; wet: GainNode; n: number; next: number };

export function createSound() {
  let ctx: AudioContext | null = null;
  let kit: Kit | null = null;
  let out: GainNode | null = null;
  let sfx: Bus | null = null;
  let roomBus: GainNode | null = null;
  let ducker: GainNode | null = null;
  let musicDry: GainNode | null = null;
  let musicWet: GainNode | null = null;
  let tapeDry: DelayNode | null = null;
  let tapeWet: DelayNode | null = null;
  let wow: GainNode | null = null;
  let muted = read();
  let disposed = false;
  let wantMusic = false;
  let wantRoom = false;
  let musicOn = false;
  let want: Bed = "title";
  let running: Running | null = null;
  let timer = 0;
  let muteTimer = 0;
  let roomKept: AudioNode[] | null = null;
  let duckLow = 1;
  let duckEnd = 0;
  let surface: Surface = "soft";
  let bells = false;
  let minute = -1;
  let foot = 1;
  let lastStep = 3;
  let ticks = 0;
  let tickAt = -1;
  let ready = 0;

  function read() {
    try {
      return localStorage.getItem(KEY) === "off";
    } catch {
      return false;
    }
  }

  function build(c: AudioContext) {
    out = c.createGain();
    out.connect(c.destination);
    const top = c.createWaveShaper();
    top.curve = ceiling();
    top.connect(out);
    // the limiter, and the glue before it; each trim takes back the
    // compressor's automatic make-up gain, so quiet things pass unchanged
    const limiter = compressor(c, -4, 20, 0.002, 0.1);
    const limTrim = c.createGain();
    limTrim.gain.value = 1 / makeup(-4, 20);
    limiter.connect(limTrim).connect(top);
    const glue = compressor(c, -16, 2.2, 0.012, 0.25);
    const glueTrim = c.createGain();
    glueTrim.gain.value = 1 / makeup(-16, 2.2);
    glue.connect(glueTrim).connect(limiter);
    // a new compressor starts out holding its gain right down and lets go
    // at its release speed: let go fast at first, so the first sound (the
    // PLAY press, a moment after this) isn't swallowed
    ready = c.currentTime + 0.06;
    for (const [d, release] of [[glue, 0.25], [limiter, 0.1]] as const) {
      d.release.value = 0.02;
      d.release.setValueAtTime(release, c.currentTime + 0.3);
    }
    const master = c.createGain();
    master.connect(glue);
    // the one room everything shares
    const verb = c.createConvolver();
    verb.normalize = false;
    verb.connect(master);
    const effects = c.createGain();
    effects.connect(master);
    sfx = { dry: effects, wet: verb };
    // the music: through a tape machine's wow, a fader, and the duck
    ducker = c.createGain();
    ducker.connect(master);
    musicDry = c.createGain();
    musicDry.gain.value = 0;
    musicDry.connect(ducker);
    musicWet = c.createGain();
    musicWet.gain.value = 0;
    musicWet.connect(verb);
    tapeDry = c.createDelay(0.05);
    tapeDry.delayTime.value = 0.014;
    tapeDry.connect(musicDry);
    tapeWet = c.createDelay(0.05);
    tapeWet.delayTime.value = 0.014;
    tapeWet.connect(musicWet);
    // two slow wobbles and a faint flutter, on the tape's delay: its pitch drifts a few cents
    wow = c.createGain();
    wow.gain.value = 0;
    wow.connect(tapeDry.delayTime);
    wow.connect(tapeWet.delayTime);
    for (const [hz, depth] of [[0.53, 0.0011], [0.19, 0.0016], [6.3, 0.00004]]) {
      const lfo = c.createOscillator();
      lfo.frequency.value = hz;
      const g = c.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(wow);
      lfo.start();
    }
    roomBus = c.createGain();
    roomBus.gain.value = 0;
    roomBus.connect(master);
    // only what the first sound (the PLAY press) needs is made now: the
    // rest waits for its first use, or for a free moment on the main thread
    let pink: AudioBuffer | null = null;
    let dust: AudioBuffer | null = null;
    let waves: Kit["waves"] | null = null;
    kit = {
      c,
      white: noise(c, 2),
      get pink() {
        return (pink ??= pinkNoise(c, 3));
      },
      get crackle() {
        return (dust ??= crackle(c));
      },
      get waves() {
        return (waves ??= {
          warm: wave(c, Array.from({ length: 12 }, (_, i) => 1 / (i + 1) ** 1.7)),
          reed: wave(c, [1, 0.24, 0.1, 0.05, 0.025]),
          voice: wave(c, [1, 0.6, 0.42, 0.3, 0.2, 0.14, 0.09, 0.06]),
          square: wave(c, Array.from({ length: 11 }, (_, i) => (i % 2 ? 0 : 1 / (i + 1) ** 1.25))),
        });
      },
    };
    // the room, made and handed to the reverb in two free moments (handing
    // it over does its own sums), then the pink noise the first whoosh wants
    let room: AudioBuffer | null = null;
    const later = [
      () => {
        room = impulse(c);
      },
      () => {
        if (room) verb.buffer = room;
      },
      () => void kit?.pink,
    ];
    const next = () => {
      if (ctx !== c) return;
      later.shift()?.();
      if (later.length) idle(next);
    };
    idle(next);
  }

  function context() {
    if (muted || disposed) return null;
    if (!ctx) {
      const Context = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return null;
      ctx = new Context();
      build(ctx);
    }
    if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
    return ctx;
  }

  // a browser that kept the context waiting (Safari can) gets it going on the next press
  const wake = () => {
    if (ctx && !muted && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);

  const onChange = () => {
    const next = read();
    if (next === muted) return;
    muted = next;
    if (muted) {
      // off at once: a 15 ms fade (no click), then the whole context rests
      if (!ctx || !out) return;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.015);
      const c = ctx;
      muteTimer = window.setTimeout(() => {
        if (muted && c.state === "running") c.suspend().catch(() => {});
      }, 80);
      return;
    }
    window.clearTimeout(muteTimer);
    const c = context();
    if (!c || !out) return;
    const t = c.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(1, t + 0.06);
    if (wantRoom) startRoom(c);
    if (wantMusic) startMusic(c);
  };
  window.addEventListener(EVENT, onChange);

  /** The music steps back for a moment: `depth` of its level, for `hold` seconds, then eases back. */
  function duck(depth: number, hold: number) {
    if (!ctx || !ducker) return;
    const now = ctx.currentTime;
    let low = 1 - depth;
    let end = now + hold;
    if (now < duckEnd) {
      low = Math.min(low, duckLow);
      end = Math.max(end, duckEnd);
      if (low === duckLow && end - duckEnd < 0.02) return;
    }
    duckLow = low;
    duckEnd = end;
    ducker.gain.cancelScheduledValues(now);
    ducker.gain.setTargetAtTime(low, now, 0.02);
    ducker.gain.setTargetAtTime(1, end, 0.25);
  }

  // —— the music's clock: a sixteenth at a time, scheduled a little ahead

  function pump() {
    const c = ctx;
    const run = running;
    if (!c || !run || !musicOn) return;
    // a hidden tab's timers slow to once a second, so look further ahead then
    const until = c.currentTime + (document.hidden ? 1.4 : 0.3);
    let guard = 0;
    while (run.next < until && guard < 64) {
      guard += 1;
      const bar = Math.floor(run.n / 16);
      const step = ((run.n % 16) + 16) % 16;
      const s = 60 / run.score.bpm(bar) / 4;
      if (run.next < c.currentTime) {
        // fell behind (a long stall): skip what's gone rather than play it all at once
        run.n += 1;
        run.next += s;
        continue;
      }
      try {
        run.score.play(run.next + (step % 2 ? run.score.swing * s : 0), bar, step, s);
      } catch (error) {
        console.error(error);
      }
      run.n += 1;
      run.next += s;
    }
  }

  function switchTo(c: AudioContext, id: Bed) {
    if (!kit || !tapeDry || !tapeWet || !wow) return;
    const t = c.currentTime;
    const first = !running;
    if (running) {
      const old = running;
      for (const g of [old.dry, old.wet]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0, t, 0.7);
      }
      old.score.stop(t + 4);
      window.setTimeout(() => {
        old.dry.disconnect();
        old.wet.disconnect();
      }, 5000);
    }
    const dry = c.createGain();
    const wet = c.createGain();
    dry.gain.value = 0;
    wet.gain.value = 0;
    dry.connect(tapeDry);
    wet.connect(tapeWet);
    const score = scoreOf(id, kit, { dry, wet });
    for (const g of [dry, wet]) g.gain.setTargetAtTime(score.level, t, first ? 0.15 : 0.9);
    wow.gain.setTargetAtTime(score.wow, t, 1.5);
    running = { id, score, dry, wet, n: -16 * score.intro, next: t + (first ? 0.1 : 0.6) };
  }

  function fadeMusic(c: AudioContext, on: boolean) {
    if (!musicDry || !musicWet) return;
    const t = c.currentTime;
    for (const g of [musicDry, musicWet]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(on ? MUSIC : 0, t, on ? 0.35 : 0.12);
    }
  }

  function startMusic(c: AudioContext) {
    musicOn = true;
    fadeMusic(c, true);
    if (!running || running.id !== want) switchTo(c, want);
    else if (running.next < c.currentTime + 0.05) {
      // back from a pause: pick up on the next downbeat, chord and all
      running.n = Math.ceil(running.n / 16) * 16;
      running.next = c.currentTime + 0.05;
    }
    if (!timer) timer = window.setInterval(pump, 50);
    pump();
  }

  function stopMusic(c: AudioContext) {
    musicOn = false;
    fadeMusic(c, false);
    if (timer) window.clearInterval(timer);
    timer = 0;
  }

  function startRoom(c: AudioContext) {
    if (roomKept || !kit || !roomBus) return;
    const kept: AudioNode[] = [];
    // the computer under the desk and the building's air, breathing slowly
    const fan = drone(kit, kit.pink, "lowpass", 360, 1, roomBus, kept, 0.5);
    const drift = c.createOscillator();
    drift.frequency.value = 0.07;
    const dg = c.createGain();
    dg.gain.value = 60;
    drift.connect(dg).connect(fan.frequency);
    drift.start();
    kept.push(drift, dg);
    // and the mains, felt more than heard
    for (const [hz, level] of [[60, 0.05], [120, 0.02]]) {
      const o = c.createOscillator();
      o.frequency.value = hz;
      const g = c.createGain();
      g.gain.value = level;
      o.connect(g).connect(roomBus);
      o.start();
      kept.push(o, g);
    }
    roomBus.gain.cancelScheduledValues(c.currentTime);
    roomBus.gain.setTargetAtTime(ROOM, c.currentTime, 0.8);
    roomKept = kept;
  }

  /** An effect is starting: where, and when (a hair ahead, so it's never late). */
  function fx() {
    const c = context();
    if (!c || !kit || !sfx) return null;
    return { k: kit, bus: sfx, at: Math.max(c.currentTime + 0.004, ready) };
  }

  return {
    /** The PLAY press: the one gesture that lets sound start. */
    unlock: () => {
      context();
    },
    press: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const v = voice(k, bus, 0.8, 0, 0.06);
      // the switch, the key bottoming out, and a little ring of plastic
      hiss(k, v, at, 0.12, 0.0005, 0.01, "bandpass", 3400, 1.1);
      const o = v.own(k.c.createOscillator());
      o.frequency.setValueAtTime(230, at);
      o.frequency.exponentialRampToValueAtTime(120, at + 0.05);
      const g = v.keep(k.c.createGain());
      const end = strike(g.gain, at, 0.2, 0.002, 0.09);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      hiss(k, v, at + 0.002, 0.04, 0.001, 0.05, "bandpass", 1150, 7);
    },
    click: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // a mouse button: the switch going down, then coming back up
      const v = voice(k, bus, 1, rand(-0.05, 0.05), 0.04);
      const up = at + 0.08 + rand(-0.008, 0.012);
      hiss(k, v, at, 0.14, 0.0004, 0.006, "highpass", 3600 * rand(0.94, 1.06));
      hiss(k, v, at, 0.06, 0.0006, 0.016, "bandpass", 1800 * rand(0.9, 1.1), 3);
      hiss(k, v, up, 0.08, 0.0004, 0.005, "highpass", 4300 * rand(0.94, 1.06));
      hiss(k, v, up, 0.03, 0.0006, 0.012, "bandpass", 2100, 3);
    },
    whoosh: (length = 1.6, rising = false, gain = 0.2) => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      const v = voice(k, bus, 1, 0, 0.14);
      const p = v.keep(c.createStereoPanner());
      p.pan.setValueAtTime(rising ? -0.35 : 0.35, at);
      p.pan.linearRampToValueAtTime(rising ? 0.35 : -0.35, at + length);
      p.connect(v.input);
      const end = at + length + 0.02;
      // the air moving: a band of noise sweeping, and a softer body under it
      const layers: Array<{ buffer: AudioBuffer; type: BiquadFilterType; from: number; to: number; q: number; level: number }> = [
        { buffer: k.white, type: "bandpass", from: rising ? 280 : 2400, to: rising ? 2600 : 240, q: 0.8, level: 0.75 },
        { buffer: k.pink, type: "lowpass", from: rising ? 420 : 1900, to: rising ? 2100 : 380, q: 0.5, level: 0.5 },
      ];
      for (const layer of layers) {
        const s = v.own(c.createBufferSource());
        s.buffer = layer.buffer;
        s.loop = true;
        const f = v.keep(filter(c, layer.type, layer.from, layer.q));
        f.frequency.setValueAtTime(layer.from, at);
        f.frequency.exponentialRampToValueAtTime(layer.to, at + length);
        const g = v.keep(c.createGain());
        const peak = gain * layer.level;
        g.gain.setValueAtTime(0, at);
        if (rising) {
          g.gain.linearRampToValueAtTime(peak * 0.3, at + length * 0.45);
          g.gain.linearRampToValueAtTime(peak, at + length * 0.78);
        } else g.gain.linearRampToValueAtTime(peak, at + length * 0.22);
        g.gain.exponentialRampToValueAtTime(peak * 1e-3, at + length);
        g.gain.linearRampToValueAtTime(0, end);
        s.connect(f).connect(g).connect(p);
        s.start(at, Math.random() * (layer.buffer.duration - 0.25));
        s.stop(end + 0.01);
      }
    },
    room: (on: boolean) => {
      wantRoom = on;
      if (on) {
        const c = context();
        if (c) startRoom(c);
        return;
      }
      if (!ctx || !roomBus || !roomKept) return;
      const t = ctx.currentTime;
      roomBus.gain.cancelScheduledValues(t);
      roomBus.gain.setTargetAtTime(0, t, 0.3);
      letGo(ctx, roomKept, t + 1.6);
      roomKept = null;
    },
    chime: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.3, 0.6);
      // three glass notes up a C major chord: thank you
      [88, 91, 96].forEach((m, i) => glass(k, bus, at + i * 0.075, m, i === 2 ? 1 : 0.8, -0.2 + i * 0.2));
    },
    tick: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // each tick of a run a step up the scale, so the install climbs
      if (at - tickAt > 0.45) ticks = 0;
      tickAt = at;
      const m = 84 + CLIMB[Math.min(ticks, CLIMB.length - 1)];
      ticks += 1;
      const v = voice(k, bus, 1, rand(-0.1, 0.1), 0.08);
      ring(k, v, NOTE(m), at, 0.042, 0.0008, 0.05);
      hiss(k, v, at, 0.035, 0.0003, 0.004, "highpass", 6000);
    },
    // the monitor going over to the game: a thump and a breath of static
    launch: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.5, 0.5);
      const v = voice(k, bus, 1, 0, 0.1);
      const o = v.own(k.c.createOscillator());
      o.frequency.setValueAtTime(90, at);
      o.frequency.exponentialRampToValueAtTime(36, at + 0.32);
      const g = v.keep(k.c.createGain());
      const end = strike(g.gain, at, 0.55, 0.003, 0.5);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      // the relay's clack, the static, and the flyback's whine if you can hear that high
      hiss(k, v, at, 0.1, 0.0005, 0.05, "bandpass", 1000, 1.2);
      hiss(k, v, at + 0.01, 0.05, 0.012, 0.6, "highpass", 2600, 0.5);
      ring(k, v, 15600, at + 0.04, 0.004, 0.02, 0.8);
    },
    // the game's sting, under its splash: the theme's first four notes,
    // quick and bright, landing on a C that blooms under them
    sting: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.6, 1.3);
      [88, 86, 88, 91].forEach((m, i) => tine(k, bus, at + i * 0.085 + rand(0, 0.006), m, i === 3 ? 1.3 : 0.95));
      pad(k, bus, at + 0.24, [48, 55, 62, 64, 67], 0.5, 1.4, 0.12, 1.5, 1.4);
      const v = voice(k, bus, 1, 0, 0.2);
      ring(k, v, NOTE(36), at + 0.25, 0.19, 0.01, 1.6);
      glass(k, bus, at + 0.27, 96, 0.35, 0.3);
      glass(k, bus, at + 0.31, 100, 0.25, -0.3);
    },
    sparkle: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // a handful of high notes off the pentatonic, never quite the same handful
      const from = Math.floor(rand(0, 3));
      let t = at;
      for (let i = 0; i < 5; i += 1) {
        glass(k, bus, t, 96 + CLIMB[from + i], 0.5 - i * 0.05, -0.4 + i * 0.2);
        t += rand(0.035, 0.05);
      }
      const v = voice(k, bus, 1, 0, 0.4);
      hiss(k, v, at, 0.012, 0.03, 0.35, "highpass", 9000, 0.7);
    },
    blip: (pitch = 0) => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.3, 0.12);
      // a voice, roughly: a buzzy tone through a vowel that changes every
      // syllable, its pitch moving about the way speech does
      const f = NOTE(70 + pitch + pick([0, 0, 0, 2, -2, 3, 5]));
      const v = voice(k, bus, 1, rand(-0.06, 0.06), 0.03);
      const o = v.own(c.createOscillator());
      o.setPeriodicWave(k.waves.voice);
      o.frequency.setValueAtTime(f * 1.01, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.97, at + 0.06);
      const vowel = v.keep(filter(c, "peaking", pick([700, 1100, 1500, 1900, 2400]) * rand(0.95, 1.05), 3.5, 9));
      const lp = v.keep(filter(c, "lowpass", 3200, 0.6));
      const g = v.keep(c.createGain());
      const end = strike(g.gain, at, 0.12, 0.004, 0.065);
      o.connect(vowel).connect(lp).connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
    },
    coin: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.15, 0.25);
      // B to E, the coin's fourth, in a soft metal
      const v = voice(k, bus, 1, rand(-0.12, 0.12), 0.2);
      const second = at + 0.062;
      for (const [t, m, decay] of [[at, 83, 0.09], [second, 88, 0.5]]) {
        const f = NOTE(m);
        ring(k, v, f, t, 0.15, 0.001, decay);
        ring(k, v, f * 2, t, 0.05, 0.001, decay * 0.5);
        ring(k, v, f * 3, t, 0.024, 0.0008, decay * 0.25);
      }
      hiss(k, v, second, 0.05, 0.0004, 0.01, "bandpass", 7500, 3);
    },
    step: () => {
      const e = fx();
      if (!e) return;
      const { k, bus } = e;
      // left foot, right foot, a little late or early, never the same step twice running
      foot = -foot;
      let n = Math.floor(Math.random() * 3);
      if (n >= lastStep) n += 1;
      lastStep = n;
      const tone = [0.92, 1, 1.07, 0.97][n];
      const at = e.at + rand(0, 0.008);
      const v = voice(k, bus, [1.6, 1.36, 1.52, 1.25][n] * (foot > 0 ? 1 : 0.88), foot * 0.12, surface === "hard" ? 0.08 : 0.03);
      if (surface === "grass") {
        hiss(k, v, at, 0.06, 0.014, 0.09, "bandpass", 3600 * tone, 0.7);
        hiss(k, v, at, 0.12, 0.004, 0.05, "lowpass", 260 * tone, 0.7);
      } else if (surface === "soft") {
        hiss(k, v, at, 0.3, 0.004, 0.075, "lowpass", 300 * tone, 0.8);
        hiss(k, v, at + 0.028, 0.025, 0.003, 0.03, "bandpass", 1300 * tone, 0.8);
      } else {
        hiss(k, v, at, 0.09, 0.0006, 0.018, "bandpass", 2600 * tone, 1.6);
        hiss(k, v, at, 0.16, 0.002, 0.045, "lowpass", 520 * tone, 0.7);
        hiss(k, v, at + 0.05, 0.04, 0.0006, 0.014, "bandpass", 2300 * tone, 1.4);
        if (surface === "street") hiss(k, v, at, 0.03, 0.002, 0.035, "highpass", 4200, 0.7);
      }
    },
    select: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // a small round pop
      const v = voice(k, bus, 1, 0, 0.05);
      const o = v.own(k.c.createOscillator());
      o.frequency.setValueAtTime(NOTE(91) * 1.04, at);
      o.frequency.exponentialRampToValueAtTime(NOTE(91), at + 0.03);
      const g = v.keep(k.c.createGain());
      const end = strike(g.gain, at, 0.08, 0.002, 0.07);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      ring(k, v, NOTE(91) * 2.01, at, 0.013, 0.001, 0.025);
    },
    confirm: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.12, 0.2);
      // up a fifth, C to G, on soft mallets, with a little weight under the first
      marimba(k, bus, at, 84, 0.7, 0.15);
      marimba(k, bus, at + 0.07, 91, 0.75, 0.2);
      const v = voice(k, bus, 1);
      ring(k, v, NOTE(60), at, 0.06, 0.002, 0.07);
    },
    /** A rubbery bounce, higher for a bigger one. */
    boing: (pitch = 0) => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      // a spring: the note sweeping up, wobbling as it settles, and the bump that set it off
      const v = voice(k, bus, 1, 0, 0.06);
      const o = v.own(c.createOscillator());
      o.type = "triangle";
      o.frequency.setValueAtTime(NOTE(55 + pitch), at);
      o.frequency.exponentialRampToValueAtTime(NOTE(67 + pitch), at + 0.12);
      o.frequency.exponentialRampToValueAtTime(NOTE(64 + pitch), at + 0.3);
      const lfo = v.own(c.createOscillator());
      lfo.frequency.value = 23;
      const depth = v.keep(c.createGain());
      depth.gain.setValueAtTime(90, at);
      depth.gain.exponentialRampToValueAtTime(4, at + 0.32);
      lfo.connect(depth).connect(o.detune);
      const g = v.keep(c.createGain());
      const end = strike(g.gain, at, 0.16, 0.003, 0.32);
      o.connect(g).connect(v.input);
      for (const s of [o, lfo]) {
        s.start(at);
        s.stop(end);
      }
      const bump = v.own(c.createOscillator());
      bump.frequency.setValueAtTime(110, at);
      bump.frequency.exponentialRampToValueAtTime(55, at + 0.07);
      const bg = v.keep(c.createGain());
      const bumpEnd = strike(bg.gain, at, 0.18, 0.002, 0.1);
      bump.connect(bg).connect(v.input);
      bump.start(at);
      bump.stop(bumpEnd);
    },
    /** Hearts: a little arpeggio that climbs with the combo. */
    rizz: (combo = 0) => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // four notes up the pentatonic, starting higher the bigger the combo, so it always sits in key
      const from = 4 + clamp(Math.floor(combo), 0, 8);
      for (let i = 0; i < 4; i += 1) {
        const d = from + i;
        glass(k, bus, at + i * 0.045, 72 + 12 * Math.floor(d / 5) + PENTA[d % 5], i === 3 ? 0.9 : 0.7, -0.3 + i * 0.2);
      }
    },
    thud: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.2, 0.2);
      const v = voice(k, bus, 0.8, rand(-0.08, 0.08), 0.06);
      const o = v.own(k.c.createOscillator());
      o.frequency.setValueAtTime(125, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
      const g = v.keep(k.c.createGain());
      const end = strike(g.gain, at, 0.45, 0.002, 0.28);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      // and the sand it lands in
      hiss(k, v, at, 0.2, 0.001, 0.14, "lowpass", 750, 0.7);
      hiss(k, v, at + 0.004, 0.05, 0.001, 0.05, "bandpass", 2300, 1);
    },
    dive: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      // a slide whistle on the way down, and the air going past
      const v = voice(k, bus, 1.25, 0, 0.12);
      const o = v.own(c.createOscillator());
      o.frequency.setValueAtTime(1700, at);
      o.frequency.exponentialRampToValueAtTime(380, at + 0.34);
      const lfo = v.own(c.createOscillator());
      lfo.frequency.value = 9;
      const depth = v.keep(c.createGain());
      depth.gain.value = 22;
      lfo.connect(depth).connect(o.detune);
      const g = v.keep(c.createGain());
      const end = strike(g.gain, at, 0.07, 0.02, 0.36);
      o.connect(g).connect(v.input);
      for (const s of [o, lfo]) {
        s.start(at);
        s.stop(end);
      }
      const air = hiss(k, v, at, 0.04, 0.03, 0.32, "bandpass", 2600, 2);
      air.frequency.setValueAtTime(2600, at);
      air.frequency.exponentialRampToValueAtTime(700, at + 0.34);
    },
    nope: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.15, 0.4);
      // down a tritone, muted: no
      const v = voice(k, bus, 0.56, 0, 0.08);
      const lp = v.keep(filter(c, "lowpass", 1700, 0.7));
      lp.connect(v.input);
      for (const [t, m, len] of [[at, 63, 0.1], [at + 0.13, 57, 0.24]]) {
        const g = v.keep(c.createGain());
        const end = held(g.gain, t, 0.05, 0.006, len, 0.07, 0.8);
        g.connect(lp);
        for (const d of [-8, 8]) {
          const o = v.own(c.createOscillator());
          o.setPeriodicWave(k.waves.square);
          o.frequency.setValueAtTime(NOTE(m), t);
          if (m === 57) o.frequency.linearRampToValueAtTime(NOTE(m) * 0.985, t + len + 0.07);
          o.detune.value = d;
          o.connect(g);
          o.start(t);
          o.stop(end);
        }
      }
    },
    cough: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.15, 0.4);
      // two coughs, the second smaller: breath bursting through the throat's
      // two loudest resonances, with a little voice in it
      for (const [dt, size] of [[0, 1], [rand(0.19, 0.23), 0.62]]) {
        const t = at + dt;
        const v = voice(k, bus, size * 2.5, rand(-0.05, 0.05), 0.12);
        const shift = rand(0.92, 1.08);
        hiss(k, v, t, 0.3, 0.004, 0.16, "bandpass", 620 * shift, 1.3);
        hiss(k, v, t, 0.16, 0.003, 0.12, "bandpass", 1650 * shift, 2.2);
        hiss(k, v, t, 0.05, 0.002, 0.05, "highpass", 3200, 0.7);
        const o = v.own(c.createOscillator());
        o.type = "sawtooth";
        o.frequency.setValueAtTime(165 * shift, t);
        o.frequency.exponentialRampToValueAtTime(120 * shift, t + 0.1);
        const lp = v.keep(filter(c, "lowpass", 900, 0.7));
        const g = v.keep(c.createGain());
        const end = strike(g.gain, t, 0.03, 0.006, 0.08);
        o.connect(lp).connect(g).connect(v.input);
        o.start(t);
        o.stop(end);
      }
    },
    bark: (pitch = 0) => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      // a bark: a rough tone jumping up and falling away through a mouth's
      // two resonances; low ones are a howl, high ones a yip
      const s = 2 ** (pitch / 12);
      const howl = pitch <= -4;
      const yip = pitch >= 8;
      const len = howl ? 0.4 : yip ? 0.07 : 0.13;
      const f0 = (howl ? 330 : 400) * s;
      const v = voice(k, bus, 1, rand(-0.1, 0.1), 0.14);
      const o = v.own(c.createOscillator());
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * 0.82, at);
      o.frequency.exponentialRampToValueAtTime(f0, at + Math.min(0.03, len * 0.3));
      if (howl) o.frequency.exponentialRampToValueAtTime(f0 * 1.12, at + len * 0.5);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.68, at + len);
      const mouth = v.keep(c.createGain());
      const g = v.keep(c.createGain());
      const end = held(g.gain, at, 0.22, 0.008, len, howl ? 0.12 : 0.05, 0.6);
      const formants = howl ? [[560, 2.5, 1], [1050, 3, 0.6]] : [[950, 2.2, 1], [1900, 3, 0.5]];
      for (const [freq, q, level] of formants) {
        const bp = v.keep(filter(c, "bandpass", freq * Math.sqrt(s), q));
        const lv = v.keep(c.createGain());
        lv.gain.value = level;
        o.connect(bp).connect(lv).connect(mouth);
      }
      mouth.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      hiss(k, v, at, 0.05, 0.004, len + 0.03, "bandpass", 1400 * s, 1);
    },
    alarm: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.3, 0.7);
      // a phone's alarm, beep-beep, beep-beep, out of its small speaker
      const v = voice(k, bus, 1, 0.1, 0.06);
      const hp = v.keep(filter(c, "highpass", 750, 0.7));
      const lp = v.keep(filter(c, "lowpass", 4800, 0.7));
      hp.connect(lp).connect(v.input);
      for (const t of [0, 0.13, 0.33, 0.46]) {
        const o = v.own(c.createOscillator());
        o.setPeriodicWave(k.waves.square);
        o.frequency.value = NOTE(93);
        const g = v.keep(c.createGain());
        const end = held(g.gain, at + t, 0.06, 0.004, 0.08, 0.012);
        o.connect(g).connect(hp);
        o.start(at + t);
        o.stop(end);
      }
    },
    notify: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.2, 0.4);
      glass(k, bus, at, 88, 0.7, 0.1);
      glass(k, bus, at + 0.085, 93, 0.8, 0.15);
    },
    keys: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      // a key: the switch's click, then the cap bottoming out; now and then the space bar
      const space = Math.random() < 0.12;
      const v = voice(k, bus, rand(1.35, 1.8), rand(-0.25, 0.25), 0.03);
      hiss(k, v, at, 0.07, 0.0003, 0.005, "bandpass", rand(3600, 5400), 1.4);
      hiss(k, v, at + 0.004, space ? 0.11 : 0.08, 0.0008, space ? 0.04 : 0.02, "bandpass", space ? 480 : rand(800, 1150), 1.6);
    },
    /** A rubber stamp coming down on a results card, harder for an S. */
    stamp: (rank = "B") => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.3, 0.35);
      const weight = rank === "S" ? 1.15 : rank === "A" ? 1 : rank === "B" ? 0.9 : 0.8;
      const v = voice(k, bus, weight, 0, 0.06);
      // the handle, and the desk under the paper
      const low = 95 + (1.15 - weight) * 120;
      const o = v.own(c.createOscillator());
      o.frequency.setValueAtTime(low * 1.7, at);
      o.frequency.exponentialRampToValueAtTime(low, at + 0.04);
      const g = v.keep(c.createGain());
      const end = strike(g.gain, at, 0.32, 0.002, 0.16);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      // the rubber meeting the paper, the paper's slap, and the handle rattling as it lifts
      hiss(k, v, at, 0.2, 0.001, 0.07, "lowpass", 650, 0.8);
      hiss(k, v, at, 0.14, 0.0006, 0.05, "bandpass", 1700 * rand(0.94, 1.06), 0.9);
      hiss(k, v, at + 0.05, 0.025, 0.002, 0.03, "bandpass", 2600, 2);
    },
    /** A bug squashed on the glass: a crack, a wet squelch, and a small bright note, so a run of them sings. */
    splat: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      const { c } = k;
      duck(0.1, 0.15);
      const tone = rand(0.9, 1.1);
      const v = voice(k, bus, 1, rand(-0.15, 0.15), 0.05);
      hiss(k, v, at, 0.07, 0.0004, 0.008, "highpass", 5200);
      const squelch = hiss(k, v, at + 0.004, 0.2, 0.002, 0.11, "bandpass", 1400 * tone, 3);
      squelch.frequency.setValueAtTime(1400 * tone, at + 0.004);
      squelch.frequency.exponentialRampToValueAtTime(380 * tone, at + 0.1);
      const o = v.own(c.createOscillator());
      o.frequency.setValueAtTime(210 * tone, at);
      o.frequency.exponentialRampToValueAtTime(120 * tone, at + 0.05);
      const g = v.keep(c.createGain());
      const end = strike(g.gain, at, 0.12, 0.002, 0.07);
      o.connect(g).connect(v.input);
      o.start(at);
      o.stop(end);
      ring(k, v, NOTE(84 + pick(PENTA)), at + 0.015, 0.03, 0.001, 0.25);
    },
    /** A moment found: its card slides in on a breath of air, then three glass notes up a C chord over a warm bloom. */
    moment: () => {
      const e = fx();
      if (!e) return;
      const { k, bus, at } = e;
      duck(0.45, 1.1);
      const v = voice(k, bus, 1, 0, 0.1);
      const air = hiss(k, v, at, 0.035, 0.12, 0.2, "bandpass", 700, 0.9, k.pink);
      air.frequency.setValueAtTime(700, at);
      air.frequency.exponentialRampToValueAtTime(2400, at + 0.25);
      [91, 96, 100].forEach((m, i) => glass(k, bus, at + 0.2 + i * 0.07, m, i === 2 ? 0.75 : 0.6, -0.25 + i * 0.25));
      pad(k, bus, at + 0.22, [60, 64, 67, 74], 0.35, 0.7, 0.08, 1.1, 1.3);
    },
    music: (on: boolean) => {
      wantMusic = on;
      if (!on) {
        if (ctx) stopMusic(ctx);
        return;
      }
      const c = context();
      if (c) startMusic(c);
    },
    /**
     * What's on screen, so the music can follow it: a chapter and the place
     * in it, or null for the title screen, which always has its theme (so
     * this brings the music back even straight from a paused game).
     */
    scene: (chapter: string | null, place?: string, night?: boolean) => {
      surface = SURFACE[place ?? ""] ?? "soft";
      bells = (chapter === "ch3" || chapter === "ch4") && (place === "dorm" || place === "hall" || place === "glade");
      minute = -1;
      const id = bedOf(chapter, place, night);
      if (id !== want) {
        want = id;
        if (ctx && musicOn && !muted) switchTo(ctx, id);
      }
      if (chapter) return;
      wantMusic = true;
      const c = musicOn ? null : context();
      if (c) startMusic(c);
    },
    /** The HUD's clock, in minutes since midnight: at Berkeley, the Campanile strikes each hour it reaches. */
    clock: (minutes: number) => {
      const was = minute;
      minute = minutes;
      if (was < 0 || minutes === was || minutes % 60 !== 0 || !bells) return;
      const c = context();
      if (!c || !kit || !running || !musicOn) return;
      const hours = Math.floor(minutes / 60) % 12 || 12;
      const tower: Bus = { dry: running.dry, wet: running.wet };
      for (let i = 0; i < hours; i += 1) bell(kit, tower, c.currentTime + 0.3 + i * 2.4, i ? rand(0.85, 0.95) : 1);
    },
    dispose: () => {
      disposed = true;
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
      window.clearInterval(timer);
      window.clearTimeout(muteTimer);
      timer = 0;
      const c = ctx;
      ctx = null;
      if (!c) return;
      if (out) {
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.setTargetAtTime(0, c.currentTime, 0.04);
      }
      window.setTimeout(() => c.close().catch(() => {}), 400);
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
