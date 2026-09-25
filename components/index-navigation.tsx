"use client";

import { useEffect, useState } from "react";
import type { NavigationItem } from "@/content/portfolio";

export function IndexNavigation({ navigation }: { navigation: NavigationItem[] }) {
  const [active, setActive] = useState<string>(navigation[0]?.id ?? "");

  useEffect(() => {
    const sections = navigation
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-18% 0px -58%", threshold: [0, 0.25, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [navigation]);

  return (
    <nav className="index-nav" aria-label="Page sections">
      {navigation.map((item, index) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={active === item.id ? "location" : undefined}
          onClick={() => setActive(item.id)}
        >
          <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
