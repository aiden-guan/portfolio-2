"use client";

import { setMuted, useMuted } from "@/lib/riffle";

export function SoundToggle() {
  const muted = useMuted();
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      onClick={() => setMuted(!muted)}
    >
      <span aria-hidden="true">{muted ? "○" : "●"}</span>
      Sound
    </button>
  );
}
