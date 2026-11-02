"use client";

import { useEffect, useState } from "react";

const SEEN = "egoist-counted";

// How many have been here. Each browser is counted once, the first time it
// comes; after that it only asks. If it cannot remember, it only asks, so a
// visit is never counted twice. Shows nothing until it has a number.
export function Egoists({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN) === "1";
      if (!seen) localStorage.setItem(SEEN, "1");
    } catch {
      seen = true;
    }
    let cancelled = false;
    fetch("/api/egoists", { method: seen ? "GET" : "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { count?: unknown } | null) => {
        if (!cancelled && typeof data?.count === "number") setCount(data.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={className} data-shown={count !== null || undefined}>
      {count === null ? " " : `${count.toLocaleString("en-US")} ${count === 1 ? "egoist" : "egoists"} visited`}
    </p>
  );
}
