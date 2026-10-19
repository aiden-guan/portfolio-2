import { useSyncExternalStore } from "react";

// The sound of a card going past a thumb: a few milliseconds of filtered
// noise, synthesised on the spot. Browsers keep audio silent until the
// visitor presses something, so the first riffles are quiet whatever happens.

const KEY = "aiden-sound";
const event = "aiden-sound-change";

let context: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocked = false;
let muted: boolean | null = null;
let lastAt = 0;

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

// One card flicking past; `strength` 0..1 is how hard.
export function flick(strength = 0.5) {
  const ctx = audio();
  if (!ctx || !noise || !out) return;
  const now = ctx.currentTime;
  // a fast riffle is a buzz, not a hundred separate clicks
  if (now - lastAt < 0.028) return;
  lastAt = now;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.85 + Math.random() * 0.3;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200 + Math.random() * 900;
  band.Q.value = 0.9;
  const level = ctx.createGain();
  const peak = 0.06 + 0.22 * Math.min(1, strength);
  level.gain.setValueAtTime(peak, now);
  level.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
  source.connect(band).connect(level).connect(out);
  source.start(now, Math.random() * 0.02, 0.04);
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
