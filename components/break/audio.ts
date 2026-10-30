import type { BossForm } from "@/components/break/combat";

export function createSound() {
  let ctx: AudioContext | null = null,
    output: GainNode | null = null;
  let muted = false,
    unlocked = false;
  function ensure() {
    if (!unlocked || muted) return;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        output = ctx.createGain();
        output.connect(ctx.destination);
      } catch {
        return;
      }
    }
    ctx.resume().catch(() => {});
  }
  function sync() {
    try {
      muted = localStorage.getItem("aiden-sound") === "off";
    } catch {
      muted = true;
    }
    ensure();
    if (ctx && output)
      output.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.01);
  }
  let beatTime = 0,
    beat = 0;
  function tone(
    hz: number,
    duration: number,
    volume: number,
    delay = 0,
    stable = false,
  ) {
    if (!ctx || !output || muted || ctx.state !== "running") return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      now = ctx.currentTime + delay;
    osc.type = stable && hz < 160 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(hz, now);
    if (!stable)
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, hz * 0.5),
        now + duration,
      );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      now + Math.min(0.006, duration * 0.2),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(output);
    osc.start(now);
    osc.stop(now + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  sync();
  window.addEventListener("aiden-sound-change", sync);
  return {
    unlock() {
      unlocked = true;
      ensure();
    },
    note: tone,
    music(dt: number, form: BossForm, overdrive: boolean) {
      if (!ctx || muted) return;
      beatTime -= dt;
      if (beatTime > 0) return;
      beatTime += 1 / 3;
      const step = beat++ % 32;
      const human = [329.63, 0, 392, 0, 293.66, 0, 246.94, 293.66];
      const cat = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
      const evil = [164.81, 0, 174.61, 0, 220, 164.81, 146.83, 0];
      if (step % 2 === 0)
        tone(
          (form === 1
            ? [82.41, 98, 73.42, 82.41]
            : form === 2
              ? [130.81, 110, 87.31, 98]
              : [55, 58.27, 65.41, 49])[Math.floor(step / 8)],
          0.27,
          0.014,
          0,
          true,
        );
      const pitch = (form === 1 ? human : form === 2 ? cat : evil)[step % 8];
      if (pitch) tone(pitch, 0.19, overdrive ? 0.009 : 0.005, 0, true);
      if (overdrive && step % 2)
        tone(pitch * 2 || 880, 0.08, 0.004, 0.15, true);
    },
    resetMusic() {
      beat = beatTime = 0;
    },
    meow() {
      if (!ctx || !output || muted || ctx.state !== "running") return;
      const now = ctx.currentTime,
        voice = ctx.createOscillator(),
        envelope = ctx.createGain();
      voice.type = "sawtooth";
      voice.frequency.setValueAtTime(510, now);
      voice.frequency.linearRampToValueAtTime(740, now + 0.12);
      voice.frequency.exponentialRampToValueAtTime(860, now + 0.22);
      voice.frequency.exponentialRampToValueAtTime(430, now + 0.48);
      voice.frequency.exponentialRampToValueAtTime(250, now + 0.8);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.075, now + 0.08);
      envelope.gain.setValueAtTime(0.065, now + 0.31);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.84);
      const nodes: AudioNode[] = [voice, envelope];
      // Sliding vowel formants turn a voiced oscillator into a short "mee-ow".
      for (const [from, to, q, level] of [
        [720, 420, 4, 0.6],
        [2100, 950, 6, 0.28],
        [3200, 1900, 7, 0.12],
      ]) {
        const vowel = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        vowel.type = "bandpass";
        vowel.frequency.setValueAtTime(from, now);
        vowel.frequency.setValueAtTime(from, now + 0.19);
        vowel.frequency.exponentialRampToValueAtTime(to, now + 0.72);
        vowel.Q.value = q;
        gain.gain.value = level;
        voice.connect(vowel).connect(gain).connect(envelope);
        nodes.push(vowel, gain);
      }
      envelope.connect(output);
      const vibrato = ctx.createOscillator(),
        depth = ctx.createGain();
      vibrato.frequency.value = 8.5;
      depth.gain.value = 11;
      vibrato.connect(depth).connect(voice.frequency);
      nodes.push(vibrato, depth);
      voice.start(now);
      vibrato.start(now);
      voice.stop(now + 0.86);
      vibrato.stop(now + 0.86);
      voice.onended = () => nodes.forEach((node) => node.disconnect());
    },
    stop() {
      window.removeEventListener("aiden-sound-change", sync);
      ctx?.close().catch(() => {});
    },
  };
}
