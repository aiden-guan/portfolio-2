"use client";

import { useEffect, useRef } from "react";
import { startStriker } from "./striker/engine";

// The play under the sentence: a striker in blue runs at the defence and
// flicks the ball over one tackle, and from there the play opens out to fill
// the screen while puzzle pieces rain down through it. He rainbow-flicks it
// over the next man's head and puts it in the top corner, trailing pieces
// whenever he is in the flow, then leaps, slides on his knees and roars as
// the pitch and the men he beat break up like a jigsaw behind him. Drawn in
// a few flat inks, with impact frames on the big hits. It waits until
// `playing`, plays once through and calls `onEnd`.
export function Striker({ className, playing, onEnd }: { className?: string; playing: boolean; onEnd: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wide = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof startStriker> | null>(null);
  const ended = useRef(onEnd);

  useEffect(() => {
    ended.current = onEnd;
  });

  useEffect(() => {
    if (!holder.current || !canvas.current || !wide.current) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = startStriker(canvas.current, wide.current, holder.current, reduced);
    engine.current = run;
    return () => {
      run.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (playing) engine.current?.play(() => ended.current());
  }, [playing]);

  return (
    <div
      ref={holder}
      className={className}
      data-playing={playing || undefined}
      aria-hidden={!playing}
      role="img"
      aria-label="A striker in a blue number 11 bib flicks the ball over a sliding tackle, and the play opens out to fill the screen as puzzle pieces rain down. He rainbow-flicks it over the next defender and scores in the top corner, leaps and punches the air, slides on his knees and roars as the pitch and the beaten defenders shatter like a jigsaw, then stands in a beam of light with his fist raised."
    >
      <canvas ref={canvas} />
      {/* the play once it has opened out over the whole page, behind the
          sentence; it inherits the strip's fading */}
      <canvas
        ref={wide}
        aria-hidden="true"
        style={{ position: "fixed", left: 0, top: 0, display: "none", transform: "none", pointerEvents: "none", imageRendering: "pixelated" }}
      />
    </div>
  );
}
