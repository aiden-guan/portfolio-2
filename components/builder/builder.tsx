"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { WorldSwitch } from "@/components/identity/world-switch";
import { PERSON } from "@/content/worlds";
import { CursorPill, type PillHandle } from "./cursor";
import { Filter } from "./filter";
import { Grid, type GridHandle } from "./grid";
import { ArrowUpRight } from "./icons";
import { Sheet } from "./sheet";
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

const TITLE = "Builds";

// /builder: everything Aiden is building, as a grid of screenshots. A card
// opens into a sheet with the rest of the facts.
export function Builder({ builds, fonts }: { builds: Build[]; fonts: string }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [open, setOpen] = useState<{ slug: string; from: "card" | "link"; at: number } | null>(null);
  const grid = useRef<GridHandle>(null);
  const pill = useRef<PillHandle>(null);
  const returnTo = useRef<string | null>(null);

  const shown = useMemo(() => builds.filter(testFor(filter)), [builds, filter]);
  const shownSlugs = useMemo(() => new Set(shown.map((build) => build.slug)), [shown]);
  const options = useMemo(
    () => FILTERS.map(({ id, label, test }) => ({ id, label, count: builds.filter(test).length })),
    [builds],
  );

  // A shared link (?p=slug) opens on that build.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("p");
    if (!slug || !builds.some((build) => build.slug === slug)) return;
    const frame = requestAnimationFrame(() => setOpen({ slug, from: "link", at: Date.now() }));
    return () => cancelAnimationFrame(frame);
  }, [builds]);

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
    setOpen({ slug, from: "card", at: Date.now() });
  }

  const closed = useCallback((slug: string) => {
    returnTo.current = slug;
    setOpen(null);
  }, []);

  return (
    <div data-world="builder" className={`${fonts} ${styles.root}`}>
      <header className={styles.top} inert={open !== null}>
        {/* a full page load on purpose, like the switch's own links */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={styles.home}>
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
          <h1 className={styles.title} aria-label={`${TITLE}, ${builds.length}`}>
            <span className={styles.word} aria-hidden="true">
              {[...TITLE].map((letter, i) => (
                <span key={i} style={{ "--i": i } as CSSProperties}>
                  {letter}
                </span>
              ))}
            </span>
            <sup className={styles.total} aria-hidden="true">
              {builds.length}
            </sup>
          </h1>
          <Filter label="Filter builds" options={options} value={filter} onChange={changeFilter} className={styles.filter} />
        </div>
        <Grid ref={grid} builds={builds} shown={shownSlugs} onOpen={openBuild} pill={pill} />
      </main>

      {open ? (
        <Sheet key={open.at} builds={shown} initial={open.slug} from={open.from} now={open.at} grid={grid} onClosed={closed} />
      ) : null}
      <CursorPill ref={pill} />
    </div>
  );
}
