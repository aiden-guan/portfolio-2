import { useSyncExternalStore } from "react";

// Paper on a mat: slides, landings, a sheet turned over, a stub torn, a
// ticket punched, a blade drawn through the mat, an envelope franked, each a
// few grains of filtered noise synthesised on the spot.
// Browsers keep audio silent until the visitor presses something, so nothing
// sounds before the first click or key.

const KEY = "aiden-sound";
const event = "aiden-sound-change";

let context: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocked = false;
let muted: boolean | null = null;

function isMuted() {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

function audio() {
  if (!unlocked || isMuted()) return null;
  if (!context) {
    const Context = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
    out = context.createGain();
    out.gain.value = 0.5;
    out.connect(context.destination);
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.06), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

export function unlockSound() {
  unlocked = true;
  audio();
}

// One grain of filtered noise: the building block of every paper sound here.
function grain(
  ctx: AudioContext,
  { at = 0, length = 0.04, freq = 2000, q = 0.9, type = "bandpass", gain = 0.1, rate = 1 }: {
    at?: number;
    length?: number;
    freq?: number;
    q?: number;
    type?: BiquadFilterType;
    gain?: number;
    rate?: number;
  },
) {
  if (!noise || !out) return;
  const now = ctx.currentTime + at;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = length > 0.055;
  source.playbackRate.value = rate;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.006, length / 4));
  level.gain.exponentialRampToValueAtTime(0.0001, now + length);
  source.connect(filter).connect(level).connect(out);
  source.start(now, Math.random() * 0.02);
  source.stop(now + length + 0.02);
}

let rustleAt = 0;

// Paper sliding over the mat; called every frame a sheet moves, `speed` in
// px/s. Faster is louder and brighter, and it thins out to nothing at rest.
export function rustle(speed: number) {
  const ctx = audio();
  if (!ctx || speed < 60) return;
  const now = ctx.currentTime;
  const gap = Math.max(0.03, 0.09 - speed / 40000);
  if (now - rustleAt < gap) return;
  rustleAt = now;
  const k = Math.min(1, speed / 2400);
  grain(ctx, { length: 0.05 + Math.random() * 0.03, freq: 1400 + k * 2600 + Math.random() * 600, q: 0.7, gain: 0.012 + 0.05 * k, rate: 0.8 + Math.random() * 0.4 });
}

// A sheet landing flat on the mat.
export function tap(strength = 0.5) {
  const ctx = audio();
  if (!ctx) return;
  const k = Math.min(1, Math.max(0.15, strength));
  grain(ctx, { length: 0.07, freq: 420 + Math.random() * 120, type: "lowpass", q: 0.6, gain: 0.08 + 0.14 * k });
  grain(ctx, { length: 0.03, freq: 2600, q: 1.2, gain: 0.02 + 0.03 * k });
}

// Turning a sheet over: a swish through the air, then it lands.
export function turnOver() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.16, freq: 1800, q: 0.5, gain: 0.04, rate: 0.7 });
  grain(ctx, { at: 0.22, length: 0.06, freq: 460, type: "lowpass", q: 0.6, gain: 0.12 });
  grain(ctx, { at: 0.22, length: 0.025, freq: 3000, q: 1.4, gain: 0.025 });
}

// Card stock giving along a perforation.
export function tear() {
  const ctx = audio();
  if (!ctx) return;
  for (let i = 0; i < 9; i++) {
    grain(ctx, { at: i * 0.018 + Math.random() * 0.01, length: 0.03, freq: 2400 + Math.random() * 2400, q: 2, gain: 0.05 + Math.random() * 0.04 });
  }
}

// A conductor's punch through a ticket.
export function punch() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.05, freq: 900, type: "lowpass", q: 1, gain: 0.16 });
  grain(ctx, { at: 0.012, length: 0.02, freq: 5200, q: 3, gain: 0.05 });
}

let scoreAt = 0;

// A blade drawn through the mat's top layer: a fine, dry scratch, called
// every time the blade moves, `speed` in px/s.
export function score(speed: number) {
  const ctx = audio();
  if (!ctx || speed < 30) return;
  const now = ctx.currentTime;
  const gap = Math.max(0.022, 0.06 - speed / 50000);
  if (now - scoreAt < gap) return;
  scoreAt = now;
  const k = Math.min(1, speed / 1600);
  grain(ctx, {
    length: 0.03 + Math.random() * 0.02,
    freq: 3600 + k * 2200 + Math.random() * 500,
    q: 2.6,
    gain: 0.008 + 0.028 * k,
    rate: 0.9 + Math.random() * 0.3,
  });
}

// The blade going into the mat.
export function nick() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.016, freq: 5600, q: 3.5, gain: 0.045 });
  grain(ctx, { length: 0.028, freq: 1100, type: "lowpass", q: 0.8, gain: 0.05 });
}

let sliceAt = 0;

// The blade through card stock rather than the mat: drier, crisper, with a
// little tick of fibre now and then; `speed` in px/s.
export function slice(speed: number) {
  const ctx = audio();
  if (!ctx || speed < 20) return;
  const now = ctx.currentTime;
  const gap = Math.max(0.018, 0.05 - speed / 60000);
  if (now - sliceAt < gap) return;
  sliceAt = now;
  const k = Math.min(1, speed / 1400);
  grain(ctx, { length: 0.024 + Math.random() * 0.016, freq: 2600 + k * 1800 + Math.random() * 900, q: 1.6, gain: 0.02 + 0.04 * k, rate: 1.1 });
  if (Math.random() < 0.3) grain(ctx, { length: 0.008, freq: 6800, q: 4, gain: 0.025 });
}

// A sheet coming apart in two as the blade leaves it.
export function snip() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.02, freq: 4200, q: 2.2, gain: 0.06 });
  grain(ctx, { at: 0.012, length: 0.05, freq: 900, type: "lowpass", q: 0.7, gain: 0.07 });
}

// ---- the torch

let hissBuffer: AudioBuffer | null = null;

// A long run of noise, for a sound that holds: a short loop would flutter.
function longNoise(ctx: AudioContext) {
  if (!hissBuffer) {
    hissBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const data = hissBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return hissBuffer;
}

export type Burner = { level(roar: number): void; stop(): void };

// The torch lit: the piezo's click, then the gas roaring through the nozzle
// for as long as it's held, louder when it's held against something. Gives
// back a handle to set how hard it roars and to put it out.
export function ignite(): Burner {
  const ctx = audio();
  if (!ctx || !out) return { level() {}, stop() {} };
  grain(ctx, { length: 0.012, freq: 5200, q: 5, gain: 0.09 });
  grain(ctx, { at: 0.004, length: 0.03, freq: 1600, q: 1.4, gain: 0.04 });
  grain(ctx, { at: 0.015, length: 0.13, freq: 190, type: "lowpass", q: 0.8, gain: 0.18 });
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = longNoise(ctx);
  source.loop = true;
  // the hiss of the jet, and the roar of it burning
  const hiss = ctx.createBiquadFilter();
  hiss.type = "bandpass";
  hiss.frequency.value = 3400;
  hiss.Q.value = 0.6;
  const roar = ctx.createBiquadFilter();
  roar.type = "lowpass";
  roar.frequency.value = 340;
  roar.Q.value = 0.9;
  const hissGain = ctx.createGain();
  const roarGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.0001, now);
  hissGain.gain.exponentialRampToValueAtTime(0.035, now + 0.09);
  roarGain.gain.setValueAtTime(0.0001, now);
  roarGain.gain.exponentialRampToValueAtTime(0.16, now + 0.14);
  source.connect(hiss).connect(hissGain).connect(out);
  source.connect(roar).connect(roarGain).connect(out);
  source.start(now + 0.01, Math.random());
  let stopped = false;
  return {
    level(k: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const heat = Math.max(0, Math.min(2, k));
      const boost = Math.max(0, heat - 1);
      roarGain.gain.setTargetAtTime(0.16 + 0.1 * heat, t, 0.08);
      roar.frequency.setTargetAtTime(340 + boost * 240, t, 0.12);
      hissGain.gain.setTargetAtTime(0.035 + boost * 0.02, t, 0.1);
      hiss.frequency.setTargetAtTime(3400 - 900 * Math.min(1, heat) + boost * 650, t, 0.1);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      hissGain.gain.cancelScheduledValues(t);
      roarGain.gain.cancelScheduledValues(t);
      hissGain.gain.setTargetAtTime(0.0001, t, 0.03);
      roarGain.gain.setTargetAtTime(0.0001, t, 0.05);
      source.stop(t + 0.3);
    },
  };
}

let crackleAt = 0;

// Paper burning: small dry cracks, more of them the more of it is alight.
export function crackle(intensity: number) {
  const ctx = audio();
  if (!ctx || intensity <= 0) return;
  const now = ctx.currentTime;
  if (now - crackleAt < 0.03) return;
  crackleAt = now;
  if (Math.random() > 0.25 + intensity * 0.6) return;
  grain(ctx, { length: 0.006 + Math.random() * 0.01, freq: 1800 + Math.random() * 4200, q: 3, gain: 0.02 + Math.random() * 0.05 * intensity });
}

// A sheet dropped near where it belongs, pulled square onto its marks.
export function seat() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.045, freq: 520, type: "lowpass", q: 0.7, gain: 0.13 });
  grain(ctx, { length: 0.014, freq: 3400, q: 2.4, gain: 0.04 });
}

// A postmark hammered onto an envelope.
export function frank() {
  const ctx = audio();
  if (!ctx) return;
  grain(ctx, { length: 0.08, freq: 260, type: "lowpass", q: 0.9, gain: 0.24 });
  grain(ctx, { length: 0.035, freq: 1500, q: 1.2, gain: 0.05 });
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(KEY, next ? "off" : "on");
  } catch {}
  if (!next) unlockSound();
  window.dispatchEvent(new Event(event));
}

function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  return () => window.removeEventListener(event, callback);
}

export function useMuted() {
  return useSyncExternalStore(subscribe, isMuted, () => false);
}
