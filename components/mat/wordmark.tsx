"use client";

import { useLayoutEffect, useRef } from "react";
import { AsciiTitle } from "@/components/scenery";
import { wordmarkWidth } from "@/lib/mat";

// The name, printed into the mat the way a maker prints theirs: as big as
// the mat allows, in the mat's own ink, a word to a line. The real heading
// is on the business card; this is print, so it is hidden from assistive tech.
//
// CSS sizes it (app/mat.css) from how wide its longest word is, which the
// page is sent with (lib/mat, on .mat-hero), so it's printed at its size
// from the first frame. Once the font is in, the word is measured, and if
// the font set it a little wider or narrower than that (a kerned pair, a
// letter the table doesn't know), or a scrollbar takes some of the window,
// the size is corrected.
export function Wordmark({ text }: { text: string }) {
  const box = useRef<HTMLParagraphElement>(null);
  const words = text.trim().split(/\s+/).filter(Boolean);

  useLayoutEffect(() => {
    const node = box.current;
    const hero = node?.closest<HTMLElement>(".mat-hero");
    if (!node || !hero) return;
    const lines = [...node.querySelectorAll<HTMLElement>(".mat-wordmark-line")];
    if (!lines.length) return;
    const estimate = wordmarkWidth(text);
    // only the real face is measured: a stand-in set while it loads is far
    // wider, and would shrink the name for good
    const family = getComputedStyle(node).fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    const fonts = document.fonts;
    let cancelled = false;
    const correct = () => {
      if (cancelled || !node.clientWidth) return;
      const bar = window.innerWidth - document.documentElement.clientWidth;
      if (bar > 0) hero.style.setProperty("--sbw", `${bar}px`);
      else hero.style.removeProperty("--sbw");
      if (fonts && family && !fonts.check(`900 100px "${family}"`)) return;
      // its width at the size it's set at says its width at 100 px (the
      // tracking is in ems, so it scales with it)
      const width = Math.max(...lines.map((line) => line.getBoundingClientRect().width));
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (!width || !size) return;
      const natural = (width * 100) / size;
      const now = parseFloat(getComputedStyle(hero).getPropertyValue("--word-natural")) || estimate;
      if (Math.abs(natural - now) / now > 0.003) hero.style.setProperty("--word-natural", natural.toFixed(1));
    };
    correct();
    fonts?.ready.then(correct).catch(() => {});
    fonts?.addEventListener("loadingdone", correct);
    return () => {
      cancelled = true;
      fonts?.removeEventListener("loadingdone", correct);
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
