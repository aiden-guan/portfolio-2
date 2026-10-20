"use client";

import { useLayoutEffect, useRef } from "react";
import { AsciiTitle } from "@/components/scenery";

// The name, printed into the mat the way a maker prints theirs: as big as
// the mat allows, in the mat's own ink, a word to a line. The real heading
// is on the business card; this is print, so it is hidden from assistive tech.
export function Wordmark({ text }: { text: string }) {
  const box = useRef<HTMLParagraphElement>(null);
  const words = text.trim().split(/\s+/).filter(Boolean);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const lines = [...node.querySelectorAll<HTMLElement>(".mat-wordmark-line")];
    if (!lines.length) return;
    let width = 0;
    const fit = () => {
      const room = node.clientWidth;
      if (!room) return;
      width = room;
      // measured at a known size, then scaled so the longest word spans the mat
      node.style.setProperty("--word-size", "100px");
      const natural = Math.max(...lines.map((line) => line.scrollWidth)) || 1;
      const height = window.innerHeight;
      // and no taller than the window leaves room for
      const size = Math.min((room / natural) * 100, (height * 0.42) / 0.78);
      node.style.setProperty("--word-size", `${size.toFixed(2)}px`);
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) fit();
    });
    observer.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [text]);

  return (
    <p className="mat-wordmark" ref={box} aria-hidden="true">
      <span className="mat-wordmark-text">
        {words.map((word, index) => (
          <span className="mat-wordmark-line" key={`${word}-${index}`}>
            {word}
          </span>
        ))}
      </span>
      <AsciiTitle text={text} max={400} />
    </p>
  );
}
