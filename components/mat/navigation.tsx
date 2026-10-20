"use client";

import { useEffect, useState } from "react";
import type { NavigationItem } from "@/content/portfolio";

const pad = (n: number) => String(n).padStart(2, "0");

// The sections along the top, lit for whichever part of the mat is in view.
export function MatNavigation({ navigation }: { navigation: NavigationItem[] }) {
  const [section, setSection] = useState("");

  useEffect(() => {
    const bands = navigation
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);
    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        let best = "";
        let most = 0;
        for (const [id, ratio] of seen) {
          if (ratio > most) {
            most = ratio;
            best = id;
          }
        }
        setSection(most > 0 ? best : "");
      },
      // the band crossing the middle of the window is the one being read
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.01, 0.5, 1] },
    );
    for (const band of bands) observer.observe(band);
    return () => observer.disconnect();
  }, [navigation]);

  return (
    <nav className="file-nav" aria-label="Sections">
      {navigation.map((item, index) => (
        <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? "location" : undefined}>
          <span className="file-nav-index">{pad(index + 1)}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
