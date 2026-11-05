"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { goHome, WorldSwitch } from "@/components/identity/world-switch";
import { PERSON } from "@/content/worlds";
import { arrive, enter, expected, named } from "./address";
import { CursorPill, type PillHandle } from "./cursor";
import { Filter } from "./filter";
import { Grid, type GridHandle } from "./grid";
import { ArrowUpRight } from "./icons";
import { Sheet, type SheetHandle } from "./sheet";
import type { Build } from "./types";
import styles from "./builder.module.css";

type FilterId = "all" | "live" | "won" | "source";

const FILTERS: Array<{ id: FilterId; label: string; test: (build: Build) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "live", label: "Live", test: (build) => build.status === "Live" },
  { id: "won", label: "Won", test: (build) => Boolean(build.award) },
  { id: "source", label: "Open source", test: (build) => Boolean(build.source) },
];

const testFor = (id: FilterId) => FILTERS.find((filter) => filter.id === id)?.test ?? (() => true);

type Open = { slug: string; from: "card" | "link"; at: number; view: number; placeholder: string | null };

// /builder: everything Aiden is building, as a grid of screenshots. A card
// opens into a sheet with the rest of the facts.
export function Builder({ builds, fonts }: { builds: Build[]; fonts: string }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [open, setOpen] = useState<Open | null>(null);
  const grid = useRef<GridHandle>(null);
  const sheet = useRef<SheetHandle>(null);
  const pill = useRef<PillHandle>(null);
  const returnTo = useRef<string | null>(null);

  const shown = useMemo(() => builds.filter(testFor(filter)), [builds, filter]);
  const shownSlugs = useMemo(() => new Set(shown.map((build) => build.slug)), [shown]);
  const options = useMemo(
    () => FILTERS.map(({ id, label, test }) => ({ id, label, count: builds.filter(test).length })),
    [builds],
  );

  // Opens on a build: grown out of its card when the card is on screen,
  // starting from the picture the card is showing.
  const show = useCallback((slug: string) => {
    const media = grid.current?.media(slug);
    const box = media?.getBoundingClientRect();
    const onScreen = Boolean(box && box.bottom > 0 && box.top < window.innerHeight);
    const showing = onScreen ? grid.current?.showing(slug) : undefined;
    setOpen({
      slug,
      from: onScreen ? "card" : "link",
      at: Date.now(),
      view: showing?.view ?? 0,
      placeholder: showing?.src ?? null,
    });
  }, []);

  // A shared link (#slug, or ?p=slug from before) opens on that build. After
  // a frame, so the router has taken charge of the history first.
  const arrived = useEffectEvent(() => {
    const slug = named();
    if (!slug || !builds.some((build) => build.slug === slug)) return;
    arrive(slug);
    show(slug);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => arrived());
    return () => cancelAnimationFrame(frame);
  }, []);

  // The back arrow closes the sheet; forward opens it again.
  const traversed = useEffectEvent(() => {
    if (expected()) return;
    const slug = named();
    if (open) {
      if (!slug) sheet.current?.close(true);
      return;
    }
    if (slug && builds.some((build) => build.slug === slug)) show(slug);
  });
  useEffect(() => {
    const onPop = () => traversed();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Once the sheet has gone, focus is back on the card it closed into.
  useEffect(() => {
    if (open || !returnTo.current) return;
    grid.current?.card(returnTo.current)?.focus({ preventScroll: true });
    returnTo.current = null;
  }, [open]);

  function changeFilter(next: FilterId) {
    if (next === filter) return;
    const before = grid.current?.measure(new Set(builds.filter(testFor(next)).map((build) => build.slug)));
    flushSync(() => setFilter(next));
    if (before) grid.current?.settle(before);
  }

  function openBuild(slug: string) {
    if (open) return;
    pill.current?.hide();
    enter(slug);
    show(slug);
  }

  const closed = useCallback((slug: string) => {
    returnTo.current = slug;
    setOpen(null);
  }, []);

  // a build the filter hides (reached by the forward arrow) is shown among all of them
  const among = open && !shownSlugs.has(open.slug) ? builds : shown;

  return (
    <div data-world="builder" className={`${fonts} ${styles.root}`}>
      <header className={styles.top} inert={open !== null}>
        {/* a full page load on purpose, like the switch's own links */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={styles.home} onClick={goHome}>
          {PERSON.name}
        </a>
        <div className={styles.links}>
          <a href={PERSON.github} className={styles.github} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight />
          </a>
          <WorldSwitch current="builder" tone="light" align="right" />
        </div>
      </header>

      <main className={styles.main} inert={open !== null}>
        <div className={styles.head}>
          <h1 className={styles.title}>
            Builds
            <sup className={styles.total}>
              <span className={styles.quiet}>, </span>
              {builds.length}
            </sup>
          </h1>
          <Filter label="Filter builds" options={options} value={filter} onChange={changeFilter} className={styles.filter} />
        </div>
        <Grid ref={grid} builds={builds} shown={shownSlugs} onOpen={openBuild} pill={pill} />
      </main>

      {open ? (
        <Sheet
          key={open.at}
          ref={sheet}
          builds={among}
          initial={open.slug}
          view={open.view}
          placeholder={open.placeholder}
          from={open.from}
          now={open.at}
          grid={grid}
          onClosed={closed}
        />
      ) : null}
      <CursorPill ref={pill} />
    </div>
  );
}
