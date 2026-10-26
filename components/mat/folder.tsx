"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { GITHUB_USER, type GitProject } from "@/lib/github-projects";
import { tap, turnOver, unlockSound } from "@/lib/riffle";

// A manila file folder pushed in from the right edge of the window, most of
// it off the mat, its tab and the edges of the papers in it showing. A click
// brings it into the middle and opens it: the cover swings back on its
// spine, and inside is a typed index of the latest projects off GitHub
// (lib/github-projects). Shut, it lies flat; it's only posed in 3D while it
// moves and while it's open.

// how long it takes to come in and open, or shut and go back (ms)
const MOVE_MS = 1150;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "26 Oct", or with the year when it isn't this year's
function stamp(iso: string, now: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return date.getUTCFullYear() === new Date(now).getUTCFullYear() ? day : `${day} ${date.getUTCFullYear()}`;
}

function host(href: string) {
  try {
    return new URL(href).host.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function Entry({ project, index, now }: { project: GitProject; index: number; now: number }) {
  return (
    <li className="pf-entry">
      <span className="pf-entry-no" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="pf-entry-text">
        <h3 className="pf-entry-name">
          <a href={project.homepage || project.url} target="_blank" rel="noreferrer">
            {project.name}
          </a>
        </h3>
        {project.summary ? <p className="pf-entry-summary">{project.summary}</p> : null}
        {project.detail ? <p className="pf-entry-detail">{project.detail}</p> : null}
        <p className="pf-entry-meta">
          {project.language ? <span data-lang={project.language}>{project.language}</span> : null}
          <time dateTime={project.pushedAt}>{stamp(project.pushedAt, now)}</time>
          <a href={project.url} target="_blank" rel="noreferrer" aria-label={`${project.name} source on GitHub`}>
            Code ↗
          </a>
          {project.homepage ? (
            <a href={project.homepage} target="_blank" rel="noreferrer" aria-label={`${project.name}, live at ${host(project.homepage)}`}>
              Live ↗
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function ProjectsFolder({ projects, live, checkedAt }: { projects: GitProject[]; live: boolean; checkedAt: number }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const handle = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);

  function toggle(next: boolean) {
    if (next === open) return;
    unlockSound();
    window.clearTimeout(timer.current);
    setMoving(true);
    setOpen(next);
    // the cover swings over a beat after it arrives, and before it leaves
    window.setTimeout(turnOver, next ? 320 : 0);
    if (!next) window.setTimeout(() => tap(0.4), 760);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = window.setTimeout(() => setMoving(false), still ? 0 : MOVE_MS);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    close.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setMoving(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setMoving(false), MOVE_MS);
        turnOver();
      }
    };
    window.addEventListener("keydown", onKey);
    const opener = handle.current;
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  const count = String(projects.length).padStart(2, "0");
  const latest = projects[0]?.pushedAt;
  const language = mostCommon(projects.map((project) => project.language).filter(Boolean));

  return (
    <>
      <div className="pf-scrim" data-open={open || undefined} onClick={() => toggle(false)} aria-hidden="true" />
      <div
        className="pf"
        data-open={open || undefined}
        data-moving={moving || undefined}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Recent projects" : undefined}
        style={{ "--n": projects.length } as CSSProperties}
      >
        <div className="pf-back">
          <span className="pf-tab" aria-hidden="true">
            <span className="pf-tab-label">Projects</span>
          </span>
          {/* the sheets under the index, their top edges showing */}
          <span className="pf-leaf pf-leaf-2" aria-hidden="true" />
          <span className="pf-leaf pf-leaf-1" aria-hidden="true" />
          <div className="pf-sheet" inert={!open}>
            <header className="pf-sheet-head">
              <span>Index</span>
              <span>Newest first</span>
              <span>{count}</span>
            </header>
            <ol className="pf-entries">
              {projects.map((project, index) => (
                <Entry project={project} index={index} now={checkedAt} key={project.repo} />
              ))}
            </ol>
            <footer className="pf-sheet-foot">
              <a href={`https://github.com/${GITHUB_USER}?tab=repositories`} target="_blank" rel="noreferrer">
                Everything else on GitHub ↗
              </a>
            </footer>
          </div>
        </div>

        <div className="pf-cover">
          <div className="pf-face pf-outside">
            <span className="pf-crease" aria-hidden="true" />
            <span className="pf-label" aria-hidden="true">
              <span className="pf-label-mark">AG—26</span>
              <span className="pf-label-title">Recent projects</span>
              <span className="pf-label-count">{count}</span>
            </span>
            <span className="pf-stamp" aria-hidden="true">
              From GitHub
            </span>
            <button
              ref={handle}
              type="button"
              className="pf-handle"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`Open the folder of recent projects (${projects.length})`}
              tabIndex={open ? -1 : 0}
              onClick={() => toggle(true)}
            />
          </div>
          <div className="pf-face pf-inside" aria-hidden={!open} inert={!open}>
            <span className="pf-crease" aria-hidden="true" />
            <p className="pf-inside-label">04 / Projects</p>
            <h2 className="pf-inside-title">Recent projects.</h2>
            <p className="pf-inside-note">{live ? "Pulled from GitHub every hour." : "From GitHub."} Newest first.</p>
            <dl className="pf-tally">
              <div>
                <dt>Projects</dt>
                <dd>{count}</dd>
              </div>
              <div>
                <dt>Live</dt>
                <dd>{String(projects.filter((project) => project.homepage).length).padStart(2, "0")}</dd>
              </div>
              {latest ? (
                <div>
                  <dt>Last push</dt>
                  <dd>{stamp(latest, checkedAt)}</dd>
                </div>
              ) : null}
              {language ? (
                <div>
                  <dt>Mostly</dt>
                  <dd>{language}</dd>
                </div>
              ) : null}
            </dl>
            <a className="pf-inside-link" href={`https://github.com/${GITHUB_USER}`} target="_blank" rel="noreferrer">
              github.com/{GITHUB_USER} ↗
            </a>
            <span className="pf-pocket" aria-hidden="true" />
          </div>
        </div>

        <button ref={close} type="button" className="pf-close" onClick={() => toggle(false)} tabIndex={open ? 0 : -1} aria-label="Close the folder">
          ×
        </button>
      </div>
    </>
  );
}
