"use client";

import { useEffect, useRef } from "react";
import { startStriker } from "./striker/engine";

// The play under the sentence: a striker in blue runs at the defence and
// flicks the ball over one tackle, and from there the play opens out to fill
// the screen and is cut like a sports anime's big moment. The flow clicks in
// and the screen shows its jigsaw seams; the rainbow flick is seen close, the
// ball rolled up the back of his calf, then from under it as it goes over the
// next man; a held breath at the top of the backswing; the boot on the ball,
// huge, printed white then black on impact; the keeper at full stretch; the
// net. Then he leaps, slides on his knees and roars as the pitch and the men
// he beat break up along those seams behind him. Drawn in a few flat inks.
// It waits until `playing`, plays once through and calls `onEnd`.
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
      aria-label="A striker in a blue number 11 bib flicks the ball over a sliding tackle, and the play opens out to fill the screen. Seen up close, he rolls the ball up the back of his calf and rainbow-flicks it over the next defender, then volleys it into the top corner past the diving keeper. He leaps and punches the air, slides on his knees and roars as the pitch and the beaten defenders shatter like a jigsaw, then stands in a beam of light with his fist raised."
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
