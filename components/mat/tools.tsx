"use client";

import { useEffect, useState } from "react";

// What's in hand over the mat: the knife (the mat cuts, and things are
// picked up and moved), or the torch (anything pressed on is burnt). K and T
// pick them up; Escape puts the torch down.

type Tool = "knife" | "torch";

function choose(tool: Tool) {
  const html = document.documentElement;
  if (tool === "torch") html.dataset.tool = "torch";
  else delete html.dataset.tool;
}

export function ToolSwitch() {
  const [tool, setTool] = useState<Tool>("knife");

  useEffect(() => {
    choose(tool);
  }, [tool]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (key === "k") setTool("knife");
      else if (key === "t") setTool("torch");
      else if (event.key === "Escape" && document.documentElement.dataset.tool) setTool("knife");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      choose("knife");
    };
  }, []);

  return (
    <div className="tool-switch" role="group" aria-label="What's in hand">
      <button
        type="button"
        aria-pressed={tool === "knife"}
        aria-keyshortcuts="K"
        title="Knife (K): cut the mat and anything on it"
        onClick={() => setTool("knife")}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2.2 13.8 7.4 8.6l1.6.4-.7 1.5z" fill="currentColor" />
          <path d="m8.2 8.1 1.4-1.4 4.6-4.6 1 1-4.6 4.6-1.4 1.4z" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
        <span>Knife</span>
      </button>
      <button
        type="button"
        aria-pressed={tool === "torch"}
        aria-keyshortcuts="T"
        title="Torch (T): burn the mat and anything on it"
        onClick={() => setTool("torch")}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M8 1.6c.4 2.2 3.6 3.8 3.6 7.2A3.6 3.6 0 0 1 8 12.4a3.6 3.6 0 0 1-3.6-3.6c0-1.8 1-2.8 1.7-3.6.2 1.2.8 1.9 1.5 2.1C7.2 5.6 7.4 3.4 8 1.6Z"
            fill="currentColor"
          />
          <path d="M5.2 14.4h5.6" stroke="currentColor" strokeWidth="1.1" />
        </svg>
        <span>Torch</span>
      </button>
    </div>
  );
}
