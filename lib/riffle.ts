import { useSyncExternalStore } from "react";

// Paper on a mat: slides, landings, a sheet turned over, a stub torn, a
// ticket punched, each a few grains of filtered noise synthesised on the spot.
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
