"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorldSwitch } from "@/components/identity/world-switch";
import { identityFonts } from "@/components/identity/fonts";
import { findProject, formatMonth, PERSON, PROJECTS, projectImage, type WorldProject } from "@/content/worlds";
import type { Engine, Marker } from "./scene/engine";
import styles from "./designer.module.css";

// What each thing on the island opens, in the order the arrows walk them.
const SPOTS: Array<{ id: string; slug: string; image?: string; caption?: string }> = [
  { id: "ledgerlens-tree", slug: "ledgerlens", image: "ledgerlens", caption: "The tree" },
  { id: "ledgerlens-pond", slug: "ledgerlens", image: "ledgerlens-koi", caption: "The koi pond" },
  { id: "continuity", slug: "continuity", caption: "The bridge" },
  { id: "seyrin", slug: "seyrin", caption: "The mailbox" },
  { id: "rally", slug: "rally", caption: "The table" },
  { id: "courtvision", slug: "courtvision", caption: "The court" },
  { id: "pigeonbox", slug: "pigeonbox", caption: "The dovecote" },
  { id: "alai", slug: "alai", caption: "The chalkboard" },
  { id: "barkoff", slug: "barkoff", caption: "The corgis" },
  { id: "aiden", slug: "about", caption: "Me" },
];

const firsts = PROJECTS.filter((project) => project.award?.startsWith("1st")).length;

function linkLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

export function Designer() {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const panel = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  const [index, setIndex] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let disposed = false;
    let instance: Engine | null = null;
    (async () => {
      try {
        const { createEngine } = await import("./scene/engine");
        if (disposed || !container.current || !canvas.current) return;
        instance = createEngine(container.current, canvas.current, {
          onHover: setHovered,
          onSelect: setSelected,
          onInteract: () => setTouched(true),
          onFrame: (list: Marker[]) => {
            for (const marker of list) {
              const node = markers.current.get(marker.id);
              if (!node) continue;
              node.style.transform = `translate3d(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px, 0)`;
              if (marker.visible) node.dataset.shown = "";
              else delete node.dataset.shown;
            }
          },
        });
        engine.current = instance;
        setReady(true);
        // it's night on the island when it's night where you are
        const hour = new Date().getHours();
        if (hour >= 20 || hour < 6) setNight(true);
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      instance?.dispose();
      engine.current = null;
    };
  }, []);

  // the open panel takes room from the right (or the bottom on phones)
  useEffect(() => {
    const node = panel.current;
    const apply = () => {
      if (!engine.current) return;
      if (!selected || !node) {
        engine.current.setInset(0, 0);
        return;
      }
      const narrow = window.innerWidth < 760;
      engine.current.setInset(narrow ? 0 : node.offsetWidth + 24, narrow ? node.offsetHeight : 0);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [selected, ready]);

  useEffect(() => {
    engine.current?.setNight(night);
  }, [night, ready]);

  const open = useCallback((id: string | null) => {
    engine.current?.select(id);
    setSelected(id);
    setIndex(false);
  }, []);

  const step = useCallback(
    (by: number) => {
      const at = SPOTS.findIndex((spot) => spot.id === selected);
      const next = SPOTS[(at + by + SPOTS.length) % SPOTS.length];
      open(next.id);
    },
    [open, selected],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      if (event.key === "Escape") {
        if (selected) open(null);
        setIndex(false);
      } else if (selected && event.key === "ArrowRight") step(1);
      else if (selected && event.key === "ArrowLeft") step(-1);
      else if (!selected && event.key.startsWith("Arrow")) {
        const d = 80;
        const dx = event.key === "ArrowLeft" ? d : event.key === "ArrowRight" ? -d : 0;
        const dy = event.key === "ArrowUp" ? d : event.key === "ArrowDown" ? -d : 0;
        engine.current?.panBy(dx, dy);
      } else if (event.key === "+" || event.key === "=") engine.current?.zoomBy(1.3);
      else if (event.key === "-" || event.key === "_") engine.current?.zoomBy(1 / 1.3);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, step]);

  const spot = SPOTS.find((s) => s.id === selected) ?? null;
  const project = spot && spot.slug !== "about" ? findProject(spot.slug) ?? null : null;
  const position = spot ? SPOTS.indexOf(spot) : -1;
  const label = useMemo(() => {
    const map = new Map<string, { name: string; line: string }>();
    for (const s of SPOTS) {
      if (s.slug === "about") map.set(s.id, { name: PERSON.name, line: `${PERSON.program}, ${PERSON.school}` });
      else {
        const p = findProject(s.slug);
        if (p) map.set(s.id, { name: p.name, line: p.line });
      }
    }
    return map;
  }, []);

  return (
    <div
      data-world="designer"
      className={`${styles.root} ${identityFonts}`}
      data-night={night || undefined}
      data-ready={ready || undefined}
      data-open={selected ? "" : undefined}
    >
      <div ref={container} className={styles.stage} onPointerDown={() => setIndex(false)}>
        <canvas ref={canvas} className={styles.canvas} aria-label="A pixel island of Aiden's projects. Drag to look around, scroll to zoom, click a place to open it." />
        <div className={styles.markers} aria-hidden={!ready}>
          {SPOTS.map((s) => {
            const text = label.get(s.id);
            return (
              <button
                key={s.id}
                type="button"
                ref={(node) => {
                  if (node) markers.current.set(s.id, node);
                  else markers.current.delete(s.id);
                }}
                className={styles.marker}
                data-active={hovered === s.id || selected === s.id || undefined}
                data-side={s.id === "pigeonbox" || s.id === "courtvision" ? "left" : "right"}
                onPointerEnter={() => engine.current?.hover(s.id)}
                onPointerLeave={() => engine.current?.hover(null)}
                onFocus={() => engine.current?.hover(s.id)}
                onBlur={() => engine.current?.hover(null)}
                onClick={() => open(s.id)}
                aria-label={`${text?.name ?? s.id}${s.caption ? `, ${s.caption.toLowerCase()}` : ""}`}
              >
                <span className={styles.pin} aria-hidden="true" />
                <span className={styles.callout} aria-hidden="true">
                  <span className={styles.leader} />
                  <span className={styles.calloutText}>
                    <strong>{text?.name}</strong>
                    <span>{text?.line}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <header className={styles.top}>
        {/* a full load back to the black page, like every way out of a world */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={styles.name}>
          Aiden Guan
        </a>
        <WorldSwitch current="designer" tone={night ? "dark" : "light"} />
      </header>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-pressed={night}
          aria-label={night ? "Daytime" : "Night-time"}
          title={night ? "Day" : "Night"}
          onClick={() => setNight((value) => !value)}
        >
          {night ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className={styles.control} aria-label="Zoom out" title="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.35)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
        </button>
        <button type="button" className={styles.control} aria-label="Zoom in" title="Zoom in" onClick={() => engine.current?.zoomBy(1.35)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" /></svg>
        </button>
        <button
          type="button"
          className={styles.control}
          aria-expanded={index}
          aria-controls="designer-index"
          aria-label="Everything on the island"
          title="Index"
          onClick={() => setIndex((value) => !value)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10" /></svg>
        </button>
        <nav id="designer-index" className={styles.index} hidden={!index} aria-label="Everything on the island">
          {SPOTS.map((s, i) => (
            <button key={s.id} type="button" className={styles.indexItem} onClick={() => open(s.id)} aria-current={selected === s.id || undefined}>
              <span className={styles.indexNumber}>{String(i + 1).padStart(2, "0")}</span>
              <span>{label.get(s.id)?.name}</span>
              <span className={styles.indexCaption}>{s.caption}</span>
            </button>
          ))}
        </nav>
      </div>

      <p className={styles.hint} data-hidden={touched || selected ? "" : undefined} aria-hidden="true">
        <span className={styles.hintFine}>drag to look around · scroll to zoom · click anything</span>
        <span className={styles.hintCoarse}>drag to look around · pinch to zoom · tap anything</span>
      </p>

      {failed ? (
        <p className={styles.failed}>
          This page draws with WebGL, which this browser has turned off. The same projects are on <a href="/builder">the builder page</a>.
        </p>
      ) : null}

      <aside
        ref={panel}
        className={styles.panel}
        data-shown={spot ? "" : undefined}
        aria-hidden={!spot}
        aria-label={spot ? label.get(spot.id)?.name : undefined}
      >
        {spot ? (
          <div className={styles.panelInner} key={spot.id}>
            <div className={styles.panelBar}>
              <span className={styles.count}>
                {String(position + 1).padStart(2, "0")} / {String(SPOTS.length).padStart(2, "0")}
                {spot.caption ? <span className={styles.caption}> · {spot.caption}</span> : null}
              </span>
              <button type="button" className={styles.close} onClick={() => open(null)} aria-label="Close">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            {project ? <ProjectBody project={project} image={spot.image ?? project.slug} /> : <AboutBody />}
            <div className={styles.walk}>
              <button type="button" onClick={() => step(-1)}>
                <span aria-hidden="true">←</span> {label.get(SPOTS[(position - 1 + SPOTS.length) % SPOTS.length].id)?.name}
              </button>
              <button type="button" onClick={() => step(1)}>
                {label.get(SPOTS[(position + 1) % SPOTS.length].id)?.name} <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ProjectBody({ project, image }: { project: WorldProject; image: string }) {
  return (
    <>
      <div className={styles.shot}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={projectImage(image, "sm")} alt={`${project.name}, as it looks`} width={800} height={500} decoding="async" />
      </div>
      <h2 className={styles.title} style={{ "--accent": project.accent } as React.CSSProperties}>
        {project.name}
      </h2>
      <p className={styles.line}>{project.line}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Status</dt>
          <dd>{project.status}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{formatMonth(project.date)}</dd>
        </div>
        {project.award || project.event ? (
          <div className={styles.factWide}>
            <dt>{project.award ? "Won" : "Made for"}</dt>
            <dd>{[project.award, project.event].filter(Boolean).join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <p className={styles.about}>{project.about}</p>
      <ul className={styles.stack} aria-label="Built with">
        {project.stack.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className={styles.links}>
        {project.live ? (
          <a className={styles.primary} href={project.live} target="_blank" rel="noreferrer">
            Visit {linkLabel(project.live)} <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        {project.source ? (
          <a className={styles.secondary} href={project.source} target="_blank" rel="noreferrer">
            Source <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </>
  );
}

function AboutBody() {
  return (
    <>
      <div className={styles.me}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PERSON.photo} alt={PERSON.name} width={88} height={88} />
        <div>
          <h2 className={styles.title}>{PERSON.name}</h2>
          <p className={styles.line}>
            {PERSON.program}, {PERSON.school}
          </p>
        </div>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Built</dt>
          <dd>{PROJECTS.length} projects</dd>
        </div>
        <div>
          <dt>Won</dt>
          <dd>{firsts} first places</dd>
        </div>
        <div className={styles.factWide}>
          <dt>Based in</dt>
          <dd>{PERSON.location}</dd>
        </div>
      </dl>
      <div className={styles.links}>
        <a className={styles.primary} href={`mailto:${PERSON.email}`}>
          Email me
        </a>
        <a className={styles.secondary} href={PERSON.github} target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
        <a className={styles.secondary} href={PERSON.linkedin} target="_blank" rel="noreferrer">
          LinkedIn <span aria-hidden="true">↗</span>
        </a>
      </div>
    </>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM3 3h2v2H3zM11 3h2v2h-2zM3 11h2v2H3zM11 11h2v2h-2zM6 5h4v6H6zM5 6h6v4H5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M6 2h4v1H6zM4 3h3v1H4zM3 4h3v2H3zM2 6h3v4H2zM3 10h3v2H3zM4 12h3v1H4zM6 13h5v1H6zM7 12h6v1H7zM9 11h4v1H9z" fill="currentColor" stroke="none" />
    </svg>
  );
}
