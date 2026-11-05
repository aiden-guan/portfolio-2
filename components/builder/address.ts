// The open build is in the address as /builder#<slug>, so a sheet can be
// shared, and opening one is a step in the history, so the browser's back
// arrow closes it. A hash rather than a query, so changing it never asks the
// server for the page again.

type Entry = { build: string };

function ours(state: unknown): state is Entry {
  return typeof state === "object" && state !== null && typeof (state as Partial<Entry>).build === "string";
}

function address(slug: string | null) {
  const url = new URL(window.location.href);
  // links from before the hash, /builder?p=<slug>
  url.searchParams.delete("p");
  url.hash = slug ? encodeURIComponent(slug) : "";
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The build the address names, if any. */
export function named() {
  let hash = window.location.hash.slice(1);
  try {
    hash = decodeURIComponent(hash);
  } catch {
    // a mangled fragment names nothing
    hash = "";
  }
  return hash || new URLSearchParams(window.location.search).get("p");
}

/** A sheet opened from the page: a new step in the history. */
export function enter(slug: string) {
  window.history.pushState({ build: slug }, "", address(slug));
}

/** Arrived at by a link: the page underneath goes in the history first, so back closes the sheet before it leaves. */
export function arrive(slug: string) {
  window.history.replaceState(null, "", address(null));
  window.history.pushState({ build: slug }, "", address(slug));
}

/** Moving from one build to the next inside the sheet. */
export function move(slug: string) {
  window.history.replaceState({ build: slug }, "", address(slug));
}

let stepping = 0;

/** A sheet closing by itself (close, Escape, a click outside): back over its step. */
export function leave() {
  if (ours(window.history.state)) {
    stepping += 1;
    window.history.back();
  } else {
    window.history.replaceState(null, "", address(null));
  }
}

/** Whether a popstate is the one `leave` asked for, rather than the visitor's. */
export function expected() {
  if (stepping === 0) return false;
  stepping -= 1;
  return true;
}
