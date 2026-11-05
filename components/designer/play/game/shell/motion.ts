import { useEffect, useState, useSyncExternalStore } from "react";

// The shell's motion helpers: whether the player asked for less of it, and
// a way for a panel to stay on screen long enough to animate out.

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (change: () => void) => {
  const media = matchMedia(QUERY);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
};

/** Read once, outside React (a shake, a count). */
export const prefersReduced = () => typeof matchMedia === "function" && matchMedia(QUERY).matches;

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReduced, () => false);
}

/** Keeps something mounted for `ms` after `open` goes false, so it can
 * leave the way it came; `leaving` is true for that while. */
export function usePresence(open: boolean, ms: number) {
  const [state, setState] = useState({ open, mounted: open });
  if (state.open !== open) setState({ open, mounted: open || state.mounted });
  useEffect(() => {
    if (open || !state.mounted) return;
    const id = window.setTimeout(() => setState((s) => (s.open ? s : { open: false, mounted: false })), ms);
    return () => window.clearTimeout(id);
  }, [open, state.mounted, ms]);
  return { mounted: open || state.mounted, leaving: !open && state.mounted };
}

/** Like usePresence, for a value: the last one stays while it leaves. */
export function useLingering<T>(value: T | null, ms: number) {
  const [state, setState] = useState<{ value: T | null; kept: T | null }>({ value, kept: value });
  if (state.value !== value) setState({ value, kept: value ?? state.kept });
  useEffect(() => {
    if (value !== null || state.kept === null) return;
    const id = window.setTimeout(() => setState((s) => (s.value === null ? { value: null, kept: null } : s)), ms);
    return () => window.clearTimeout(id);
  }, [value, state.kept, ms]);
  return { shown: value ?? state.kept, leaving: value === null && state.kept !== null };
}
