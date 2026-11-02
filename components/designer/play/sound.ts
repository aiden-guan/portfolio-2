// Everything the cinematic and the game sound like, synthesised on the spot:
// the room's hum, the mouse, the store's chime, the game's sting and its
// title tune. It follows the site's own Sound setting (aiden-sound), and
// nothing plays before the PLAY press that unlocks it.

const KEY = "aiden-sound";
const EVENT = "aiden-sound-change";

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let roomBus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = read();
  let wantMusic = false;
  let wantRoom = false;
  let musicTimer = 0;
  let musicNext = 0;
  let musicStep = 0;
  let roomSource: AudioBufferSourceNode | null = null;

  function read() {
    try {
      return localStorage.getItem(KEY) === "off";
    } catch {
      return false;
    }
  }

  function context() {
    if (muted) return null;
    if (!ctx) {
      const Context = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return null;
      ctx = new Context();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      roomBus = ctx.createGain();
      roomBus.gain.value = 0;
      roomBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  const onChange = () => {
    muted = read();
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
    if (!muted) {
      context();
      if (wantMusic) startMusic();
      if (wantRoom) startRoom();
    }
  };
  window.addEventListener(EVENT, onChange);

  function burst(c: AudioContext, { at = 0, length = 0.02, freq = 3000, type = "highpass" as BiquadFilterType, q = 0.8, gain = 0.2 }) {
    const source = c.createBufferSource();
    source.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    const now = c.currentTime + at;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + length);
    source.connect(filter).connect(g).connect(master!);
    source.start(now, Math.random() * 1.5, length + 0.02);
  }

  function tone(
    c: AudioContext,
    { at = 0, freq = 440, to, length = 0.2, gain = 0.1, type = "sine" as OscillatorType, attack = 0.004, out = master! }: {
      at?: number;
      freq?: number;
      to?: number;
      length?: number;
      gain?: number;
      type?: OscillatorType;
      attack?: number;
      out?: AudioNode;
    },
  ) {
    const osc = c.createOscillator();
    osc.type = type;
    const g = c.createGain();
    const now = c.currentTime + at;
    osc.frequency.setValueAtTime(freq, now);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, now + length);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + length + 0.05);
  }

  // a struck bell: a sine and a quiet overtone, dying away
  function bell(c: AudioContext, at: number, freq: number, gain: number, length = 1.2, out = master!) {
    tone(c, { at, freq, length, gain, out });
    tone(c, { at, freq: freq * 2.01, length: length * 0.5, gain: gain * 0.28, out });
    tone(c, { at, freq: freq * 3.02, length: length * 0.25, gain: gain * 0.1, out });
  }

  function startRoom() {
    const c = context();
    if (!c || roomSource) return;
    roomSource = c.createBufferSource();
    roomSource.buffer = noise;
    roomSource.loop = true;
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 320;
    const hum = c.createOscillator();
    hum.frequency.value = 58;
    const humGain = c.createGain();
    humGain.gain.value = 0.012;
    hum.connect(humGain).connect(roomBus!);
    hum.start();
    roomSource.connect(low).connect(roomBus!);
    roomSource.start();
    roomSource.onended = () => hum.stop();
    roomBus!.gain.setTargetAtTime(0.11, c.currentTime, 0.8);
  }

  function startMusic() {
    const c = context();
    if (!c || musicTimer) return;
    musicBus!.gain.cancelScheduledValues(c.currentTime);
    musicBus!.gain.setTargetAtTime(0.5, c.currentTime, 1.2);
    musicNext = c.currentTime + 0.1;
    musicStep = 0;
    // C, A minor, F, G under a music box that walks the chords
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ];
    const melody = [76, 0, 79, 0, 81, 0, 79, 76, 77, 0, 81, 0, 79, 0, 74, 0, 76, 79, 84, 0, 83, 81, 76, 0, 77, 81, 84, 81, 79, 0, 0, 0];
    const beat = 60 / 84 / 2; // eighth notes at 84 bpm
    const schedule = () => {
      if (!ctx) return;
      while (musicNext < ctx.currentTime + 0.4) {
        const bar = Math.floor(musicStep / 8) % 4;
        const inBar = musicStep % 8;
        const chord = chords[bar];
        const at = musicNext - ctx.currentTime;
        if (inBar === 0) {
          // the pad: each chord tone, soft and slow
          for (const n of chord) {
            tone(ctx, { at, freq: NOTE(n - 12), length: beat * 8.4, gain: 0.03, type: "triangle", attack: 0.5, out: musicBus! });
          }
          tone(ctx, { at, freq: NOTE(chord[0] - 24), length: beat * 8, gain: 0.05, attack: 0.08, out: musicBus! });
        }
        const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
        bell(ctx, at, NOTE(chord[pattern[inBar]] + 12), 0.018, 0.9, musicBus!);
        const m = melody[musicStep % melody.length];
        if (m) bell(ctx, at, NOTE(m), 0.05, 1.5, musicBus!);
        musicNext += beat;
        musicStep += 1;
      }
    };
    schedule();
    musicTimer = window.setInterval(schedule, 120);
  }

  return {
    /** The PLAY press: the one gesture that lets sound start. */
    unlock: () => {
      context();
    },
    press: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: 540, to: 380, length: 0.08, gain: 0.1 });
      burst(c, { length: 0.012, freq: 1400, type: "lowpass", gain: 0.12 });
    },
    click: () => {
      const c = context();
      if (!c) return;
      burst(c, { length: 0.012, freq: 2600, gain: 0.22 });
      tone(c, { freq: 1900, to: 1300, length: 0.018, gain: 0.03 });
      burst(c, { at: 0.075, length: 0.009, freq: 3400, gain: 0.1 });
    },
    whoosh: (length = 1.6, rising = false, gain = 0.2) => {
      const c = context();
      if (!c) return;
      const source = c.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.7;
      const now = c.currentTime;
      band.frequency.setValueAtTime(rising ? 260 : 2200, now);
      band.frequency.exponentialRampToValueAtTime(rising ? 2400 : 220, now + length);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + length * (rising ? 0.8 : 0.35));
      g.gain.exponentialRampToValueAtTime(0.0001, now + length);
      source.connect(band).connect(g).connect(master!);
      source.start(now);
      source.stop(now + length + 0.05);
    },
    room: (on: boolean) => {
      wantRoom = on;
      if (on) startRoom();
      else if (ctx && roomBus) {
        roomBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        const source = roomSource;
        roomSource = null;
        window.setTimeout(() => source?.stop(), 1500);
      }
    },
    chime: () => {
      const c = context();
      if (!c) return;
      bell(c, 0, NOTE(88), 0.07, 1.1);
      bell(c, 0.09, NOTE(95), 0.06, 1.4);
    },
    tick: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: 2400, length: 0.025, gain: 0.025 });
    },
    // the monitor going over to the game: a thump and a breath of static
    launch: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: 90, to: 42, length: 0.35, gain: 0.3 });
      burst(c, { length: 0.25, freq: 900, type: "lowpass", gain: 0.06 });
      tone(c, { at: 0.05, freq: 15600, length: 0.6, gain: 0.006 });
    },
    // the game's sting, under its splash
    sting: () => {
      const c = context();
      if (!c) return;
      [72, 76, 79, 84].forEach((n, i) => bell(c, i * 0.11, NOTE(n), 0.07, 1.4));
      bell(c, 0.52, NOTE(91), 0.035, 1.8);
      bell(c, 0.6, NOTE(88), 0.03, 1.8);
      tone(c, { freq: NOTE(48), length: 1.8, gain: 0.08, attack: 0.02 });
    },
    sparkle: () => {
      const c = context();
      if (!c) return;
      [96, 100, 103, 108].forEach((n, i) => bell(c, i * 0.05, NOTE(n), 0.02, 0.5));
    },
    blip: (pitch = 0) => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(70 + pitch), length: 0.045, gain: 0.025, type: "square", attack: 0.002 });
    },
    coin: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(83), length: 0.09, gain: 0.05, type: "square" });
      tone(c, { at: 0.08, freq: NOTE(88), length: 0.32, gain: 0.05, type: "square" });
    },
    step: () => {
      const c = context();
      if (!c) return;
      burst(c, { length: 0.05, freq: 380 + Math.random() * 120, type: "lowpass", gain: 0.06 });
    },
    select: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(79), length: 0.06, gain: 0.04, type: "square" });
    },
    confirm: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(79), length: 0.07, gain: 0.04, type: "square" });
      tone(c, { at: 0.07, freq: NOTE(86), length: 0.16, gain: 0.04, type: "square" });
    },
    /** A rubbery bounce, higher for a bigger one. */
    boing: (pitch = 0) => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(55 + pitch), to: NOTE(67 + pitch), length: 0.16, gain: 0.09, type: "triangle" });
      tone(c, { at: 0.03, freq: NOTE(62 + pitch), to: NOTE(74 + pitch), length: 0.14, gain: 0.045 });
    },
    /** Hearts: a little arpeggio that climbs with the combo. */
    rizz: (combo = 0) => {
      const c = context();
      if (!c) return;
      const base = 81 + Math.min(12, combo);
      [0, 4, 7, 12].forEach((n, i) => bell(c, i * 0.045, NOTE(base + n), 0.032, 0.45));
    },
    thud: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: 120, to: 48, length: 0.2, gain: 0.18 });
      burst(c, { length: 0.14, freq: 600, type: "lowpass", gain: 0.12 });
    },
    dive: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: 1500, to: 320, length: 0.3, gain: 0.035 });
      burst(c, { length: 0.2, freq: 1800, type: "bandpass", q: 1.4, gain: 0.05 });
    },
    nope: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(50), length: 0.13, gain: 0.06, type: "square" });
      tone(c, { at: 0.15, freq: NOTE(45), length: 0.3, gain: 0.06, type: "square" });
    },
    cough: () => {
      const c = context();
      if (!c) return;
      burst(c, { length: 0.11, freq: 900, type: "bandpass", q: 1.2, gain: 0.2 });
      burst(c, { at: 0.17, length: 0.09, freq: 760, type: "bandpass", q: 1.2, gain: 0.14 });
      tone(c, { freq: 170, to: 110, length: 0.1, gain: 0.04 });
    },
    bark: (pitch = 0) => {
      const c = context();
      if (!c) return;
      const k = 2 ** (pitch / 12);
      tone(c, { freq: 540 * k, to: 250 * k, length: 0.13, gain: 0.07, type: "sawtooth" });
      burst(c, { length: 0.08, freq: 1300 * k, type: "bandpass", q: 2, gain: 0.12 });
    },
    alarm: () => {
      const c = context();
      if (!c) return;
      for (let i = 0; i < 4; i += 1) tone(c, { at: i * 0.16, freq: NOTE(88), length: 0.09, gain: 0.035, type: "square" });
    },
    notify: () => {
      const c = context();
      if (!c) return;
      tone(c, { freq: NOTE(81), length: 0.08, gain: 0.04 });
      tone(c, { at: 0.07, freq: NOTE(88), length: 0.16, gain: 0.04 });
    },
    keys: () => {
      const c = context();
      if (!c) return;
      burst(c, { length: 0.012, freq: 3000 + Math.random() * 900, gain: 0.07 });
    },
    music: (on: boolean) => {
      wantMusic = on;
      if (on) startMusic();
      else {
        if (musicTimer) window.clearInterval(musicTimer);
        musicTimer = 0;
        if (ctx && musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      }
    },
    dispose: () => {
      window.removeEventListener(EVENT, onChange);
      if (musicTimer) window.clearInterval(musicTimer);
      roomSource?.stop();
      const c = ctx;
      ctx = null;
      if (c) window.setTimeout(() => c.close().catch(() => {}), 600);
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
