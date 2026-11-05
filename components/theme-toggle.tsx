"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function resolvedTheme(): Theme {
  const stored = window.localStorage.getItem("aiden-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const themeEvent = "aiden-theme-change";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => callback();
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(themeEvent, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeEvent, onChange);
  };
}

// The browser's bar takes its colour from the page's theme-color, one for
// light and one for dark, chosen by the system setting. Picked here, the bar
// follows the pick instead (as the theme script in app/layout does on load).
function paintBar(theme: Theme) {
  const bars = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')];
  for (const bar of bars) bar.dataset.color ??= bar.content;
  const picked = bars.find((bar) => bar.media.includes(`: ${theme})`))?.dataset.color;
  if (picked) for (const bar of bars) bar.content = picked;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, resolvedTheme, () => "light");

  function toggleTheme() {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("aiden-theme", next);
    paintBar(next);
    window.dispatchEvent(new Event(themeEvent));
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <span aria-hidden="true">{theme === "dark" ? "○" : "●"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
