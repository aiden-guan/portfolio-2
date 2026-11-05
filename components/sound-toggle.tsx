"use client";

import { setMuted, useMuted } from "@/lib/riffle";

// Named by what it says, "Sound"; whether it's on is the pressed state, so a
// screen reader hears "Sound, toggle button, pressed" rather than an action
// and a state that contradict each other.
export function SoundToggle() {
  const muted = useMuted();
  return (
    <button type="button" className="sound-toggle" aria-pressed={!muted} onClick={() => setMuted(!muted)}>
      <span aria-hidden="true">{muted ? "○" : "●"}</span>
      Sound
    </button>
  );
}
