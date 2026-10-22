"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { TIDY_EVENT } from "@/components/mat/table";
import { imageFrame, type Recent } from "@/content/portfolio";
import { mountLine } from "@/lib/clothesline";

// The latest photos, pegged on a clothesline strung across the mat under the
// card (lib/clothesline hangs them, and lets the knife cut them down). Each
// is a print with a line about it written on its border; a click opens it
// large.

function Peg({ u }: { u: number }) {
  return (
    <span className="line-peg" style={{ "--u": u } as CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 10 34" focusable="false">
        {/* a little wooden peg, seen side on: its two legs, the steel spring
            that closes them, and the notch the line sits in */}
        <path className="line-peg-wood" d="M2 0.6Q5 0 8 0.6L8.6 14L8.2 33Q5 34 1.8 33L1.4 14Z" />
        <path className="line-peg-seam" d="M5 0.4V33.6" />
        <path className="line-peg-grain" d="M3 3V12M3.2 19V31M7 2.5V11.5M6.8 19.5V31.5" />
        <rect className="line-peg-spring" x="0.4" y="12.6" width="9.2" height="4.4" rx="1.6" />
        <path className="line-peg-coil" d="M1.9 12.8V16.8M3.4 12.8V16.8M4.9 12.8V16.8M6.4 12.8V16.8M7.9 12.8V16.8" />
        <path className="line-peg-notch" d="M1.4 26.4Q2.8 27.6 1.6 28.8M8.6 26.4Q7.2 27.6 8.4 28.8" />
      </svg>
    </span>
  );
}

function Photo({ recent, index }: { recent: Recent; index: number }) {
  const { image, caption, date } = recent;
  const frame = imageFrame(image);
  const alt = caption || image.alt || `Recent photo ${index + 1}`;
  return (
    <button
      type="button"
      className="line-photo"
      data-gallery="recents"
      data-print={String(index)}
      data-title="Recents"
      data-caption={caption || undefined}
      data-no-drag=""
      aria-label={caption ? `${caption}. Open the photo` : `Open ${alt}`}
      style={{ "--tilt": `${((index * 53) % 7) - 3}deg` } as CSSProperties}
    >
      <Peg u={0.17} />
      <Peg u={0.83} />
      <span className="line-photo-paper">
        <span className="print-window line-photo-window">
          <img
            alt={alt}
            draggable={false}
            loading="lazy"
            decoding="async"
            src={image.src}
            data-full={image.src}
            style={{ objectFit: "cover", objectPosition: frame.position }}
          />
        </span>
        <span className="line-photo-words">
          {caption ? <span className="line-photo-caption">{caption}</span> : null}
          {date ? <span className="line-photo-date">{date}</span> : null}
        </span>
      </span>
    </button>
  );
}

export function Recents({ recents }: { recents: Recent[] }) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const line = mountLine(el);
    const onTidy = () => line.tidy();
    window.addEventListener(TIDY_EVENT, onTidy);
    return () => {
      window.removeEventListener(TIDY_EVENT, onTidy);
      line.unmount();
    };
  }, [recents.length]);

  return (
    <div className="line" ref={stage} data-empty={recents.length ? undefined : ""}>
      <svg className="line-cord" aria-hidden="true" focusable="false">
        <path className="line-cord-shadow" />
        <path className="line-cord-rope" />
        <path className="line-cord-twist" />
        <path className="line-cord-fray" />
        <path className="line-cord-loose" />
      </svg>
      <span className="line-mm" aria-hidden="true" />
      <span className="line-eyes" aria-hidden="true" />
      {recents.length ? (
        <ul className="line-photos">
          {recents.map((recent, index) => (
            <li className="line-slot" key={`${recent.image.src}-${index}`}>
              <Photo recent={recent} index={index} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="line-empty">Nothing pegged up yet.</p>
      )}
    </div>
  );
}
