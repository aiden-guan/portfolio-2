"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { goHome, WorldSwitch } from "@/components/identity/world-switch";
import { identityFonts } from "@/components/identity/fonts";
import { findProject, formatMonth, imageFocus, PERSON, PROJECTS, projectImage, type WorldProject } from "@/content/worlds";
import type { Engine, Grid, Marker } from "./scene/engine";
import { digitsPath } from "./scene/glyphs";
import styles from "./designer.module.css";

// The game behind the PLAY button, fetched only when it's wanted (and early,
// when the pointer comes near the button).
const loadPlay = () => import("./play/play");
const Play = dynamic(loadPlay, { ssr: false });

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
  { id: "nomen", slug: "nomen", caption: "The Trojan horse" },
];

const firsts = PROJECTS.filter((project) => project.award?.startsWith("1st")).length;

// A place's tag, in its own pixels: a plate 11 wide and 9 tall with its
// number in the island's numerals, and a tail two more below that points
// down at the place.
const TAG = { w: 11, h: 9, tail: 2 };
const NIGHT_COLOR = "#141b2c";
const DAY_COLOR = "#f2efe8";

function linkLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

type TagState = { x: number; y: number; shown: boolean; flip: boolean };

export function Designer() {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const tags = useRef(new Map<string, HTMLButtonElement>());
  const placed = useRef(new Map<string, TagState>());
  // each name's width in ems, measured once the face has loaded, so a tag
  // opens to a whole number of pixels
  const widths = useRef(new Map<string, number>());
  const unit = useRef(0);
  // where the page's own chrome is, so no tag sits under it, and how big the
  // page is; both read on resize, not per frame
  const chrome = useRef<DOMRect[]>([]);
  const size = useRef({ w: 0, h: 0 });
  // set when the tags have to be placed again although the island hasn't moved
  const replace = useRef(true);
  const panel = useRef<HTMLElement>(null);
  const indexButton = useRef<HTMLButtonElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  // what had focus when a place was opened, to go back to on closing
  const opener = useRef<HTMLElement | null>(null);
  // the island's next frame, for whoever asked for it (the store page's screenshots)
  const capture = useRef<((canvas: HTMLCanvasElement, markers: Marker[]) => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  // PLAY waits for the island to have arrived: the store page is cut from it
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  const [index, setIndex] = useState(false);
  const [touched, setTouched] = useState(false);

  const measureChrome = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    chrome.current = [...root.querySelectorAll<HTMLElement>("[data-chrome]")].map((node) => node.getBoundingClientRect());
    size.current = { w: root.clientWidth, h: root.clientHeight };
    replace.current = true;
  }, []);

  // Every frame the island moves, each tag goes where its place is: drawn
  // in the art's own pixels and snapped to its grid, hidden off the edge and
  // under the page's chrome, and opening to the left near the right edge.
  // Styles are written only when they change.
  const placeTags = useCallback((list: Marker[], grid: Grid) => {
    const box = layer.current;
    if (!box) return;
    const u = grid.unit;
    if (u !== unit.current) {
      unit.current = u;
      box.style.setProperty("--u", `${u}px`);
      replace.current = true;
    }
    if (!grid.moved && !replace.current) return;
    replace.current = false;
    if (!size.current.w) size.current = { w: box.clientWidth, h: box.clientHeight };
    const width = size.current.w;
    const height = size.current.h;
    const w = TAG.w * u;
    const h = (TAG.h + TAG.tail) * u;
    for (const marker of list) {
      const node = tags.current.get(marker.id);
      if (!node) continue;
      const x = grid.x + Math.round((marker.x - (TAG.w / 2) * u - grid.x) / u) * u;
      const y = grid.y + Math.round((marker.y - h - grid.y) / u) * u;
      let covered = false;
      for (const rect of chrome.current) {
        if (x < rect.right + 4 && x + w > rect.left - 4 && y < rect.bottom + 4 && y + h > rect.top - 4) covered = true;
      }
      const shown = marker.visible && !covered && x > -w && x < width && y > -h && y < height;
      const opens = (widths.current.get(marker.id) ?? 6) * 4.4 * u + 5 * u;
      const flip = x + w + opens > width - 12;
      const last = placed.current.get(marker.id);
      if (!last || Math.abs(last.x - x) > 0.01 || Math.abs(last.y - y) > 0.01) {
        node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }
      if (!last || last.shown !== shown) {
        if (shown) node.dataset.shown = "";
        else delete node.dataset.shown;
      }
      if (!last || last.flip !== flip) {
        if (flip) node.dataset.flip = "";
        else delete node.dataset.flip;
      }
      if (last) {
        last.x = x;
        last.y = y;
        last.shown = shown;
        last.flip = flip;
      } else placed.current.set(marker.id, { x, y, shown, flip });
    }
  }, []);

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
          onFrame: (list: Marker[], grid: Grid) => {
            placeTags(list, grid);
            if (list[0]?.visible) setRevealed(true);
            if (capture.current && canvas.current) {
              capture.current(canvas.current, list);
              capture.current = null;
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
  }, [placeTags]);

  // the names' widths, once their face is in, and the chrome's place
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      for (const [id, node] of tags.current) {
        const label = node.querySelector<HTMLElement>("[data-label]");
        if (!label) continue;
        const size = parseFloat(getComputedStyle(label).fontSize) || 13;
        const em = label.getBoundingClientRect().width / size;
        widths.current.set(id, em);
        node.style.setProperty("--text", `${em.toFixed(3)}em`);
      }
      measureChrome();
    };
    document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    window.addEventListener("resize", measureChrome);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", measure);
      window.removeEventListener("resize", measureChrome);
    };
  }, [measureChrome]);

  // the open card takes room from the right (or the bottom on phones)
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
    // the browser's own bars follow the sky
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = night ? NIGHT_COLOR : DAY_COLOR;
  }, [night, ready]);

  useEffect(
    () => () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = DAY_COLOR;
    },
    [],
  );

  const open = useCallback((id: string | null) => {
    engine.current?.select(id);
    setSelected(id);
    setIndex(false);
  }, []);

  // opening a place moves focus into its card; closing it goes back to
  // whatever opened it, if that can still take focus
  const wasOpen = useRef<string | null>(null);
  useEffect(() => {
    const before = wasOpen.current;
    wasOpen.current = selected;
    if (selected) {
      if (!before) {
        const active = document.activeElement as HTMLElement | null;
        opener.current = active && active !== document.body && !panel.current?.contains(active) ? active : null;
      }
      if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    } else if (before) {
      const back = opener.current;
      opener.current = null;
      if (back?.isConnected) back.focus({ preventScroll: true });
      else if (panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    }
  }, [selected]);

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
      if (playing || event.defaultPrevented) return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (index) {
          setIndex(false);
          indexButton.current?.focus({ preventScroll: true });
        } else if (selected) open(null);
      } else if (selected && event.key === "ArrowRight") step(1);
      else if (selected && event.key === "ArrowLeft") step(-1);
      else if (!selected && !index && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const d = 80;
        const dx = event.key === "ArrowLeft" ? d : event.key === "ArrowRight" ? -d : 0;
        const dy = event.key === "ArrowUp" ? d : event.key === "ArrowDown" ? -d : 0;
        engine.current?.panBy(dx, dy);
      } else if (event.key === "+" || event.key === "=") engine.current?.zoomBy(1.3);
      else if (event.key === "-" || event.key === "_") engine.current?.zoomBy(1 / 1.3);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, open, selected, step, playing]);

  // the index closes on a press anywhere but itself
  useEffect(() => {
    if (!index) return;
    const onPointer = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) setIndex(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [index]);

  // —— the card as a sheet on phones: dragged down by its head, it goes
  const drag = useRef<{ id: number; from: number; at: number; dy: number; speed: number } | null>(null);
  const onSheetDown = (event: React.PointerEvent<HTMLElement>) => {
    if (window.innerWidth >= 760 || !panel.current) return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // the pointer is already gone; the drag still works while it's over the sheet
    }
    drag.current = { id: event.pointerId, from: event.clientY, at: event.timeStamp, dy: 0, speed: 0 };
    panel.current.style.transition = "none";
  };
  const onSheetMove = (event: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId || !panel.current) return;
    const raw = event.clientY - d.from;
    // up past where it rests it barely moves; down it follows the finger
    const dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    const seconds = Math.max(0.001, (event.timeStamp - d.at) / 1000);
    d.speed = d.speed * 0.6 + ((dy - d.dy) / seconds) * 0.4;
    d.dy = dy;
    d.at = event.timeStamp;
    panel.current.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
  };
  const onSheetUp = (event: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId || !panel.current) return;
    drag.current = null;
    panel.current.style.transition = "";
    const fresh = event.timeStamp - d.at < 100;
    if (d.dy > 110 || (fresh && d.speed > 700 && d.dy > 12)) open(null);
    else panel.current.style.transform = "";
  };
  // a sheet let go to close slides on down from where it was let go
  useLayoutEffect(() => {
    if (!selected && panel.current) panel.current.style.transform = "";
  }, [selected]);

  const askCapture = useCallback((fn: ((canvas: HTMLCanvasElement, markers: Marker[]) => void) | null) => {
    capture.current = fn;
  }, []);

  const play = useCallback(() => {
    if (!revealed) return;
    open(null);
    setIndex(false);
    setPlaying(true);
  }, [open, revealed]);

  // back from the game: the island takes the whole page again, where it was
  const leave = useCallback(() => {
    const node = rootRef.current;
    if (node) {
      node.style.transform = "";
      node.style.clipPath = "";
      node.style.visibility = "";
    }
    engine.current?.pause(false);
    engine.current?.look(null, 1, 5);
    setPlaying(false);
  }, []);

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
  const tagsLive = ready && revealed && !selected && !playing;

  return (
    <>
      <div
        ref={rootRef}
        data-world="designer"
        className={`${styles.root} ${identityFonts}`}
        data-night={night || undefined}
        data-ready={ready || undefined}
        data-open={selected ? "" : undefined}
        data-play={playing || undefined}
      >
        <header className={styles.top}>
          {/* a full load back to the black page, like every way out of a world */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={styles.name} data-chrome="" onClick={goHome}>
            Aiden Guan
          </a>
          <div data-chrome="">
            <WorldSwitch current="designer" tone={night ? "dark" : "light"} />
          </div>
        </header>

        <div ref={controls} className={styles.controls} data-chrome="">
          <button
            type="button"
            className={styles.play}
            onClick={play}
            onPointerEnter={() => void loadPlay()}
            onFocus={() => void loadPlay()}
            disabled={!revealed}
            aria-label="Play Aiden: Life of a Handsome Entrepreneur"
          >
            <svg viewBox="0 0 8 10" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M0 0h2v1h2v1h2v1h2v4H6v1H4v1H2v1H0z" />
            </svg>
            Play
          </button>
          <div className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              aria-pressed={night}
              aria-label="Night"
              title={night ? "Day" : "Night"}
              onClick={() => setNight((value) => !value)}
            >
              {night ? <SunIcon /> : <MoonIcon />}
            </button>
            <button type="button" className={styles.tool} data-zoom="" aria-label="Zoom out" title="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.35)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
                <path d="M3 7h10v2H3z" />
              </svg>
            </button>
            <button type="button" className={styles.tool} data-zoom="" aria-label="Zoom in" title="Zoom in" onClick={() => engine.current?.zoomBy(1.35)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
                <path d="M3 7h4V3h2v4h4v2H9v4H7V9H3z" />
              </svg>
            </button>
            <button
              ref={indexButton}
              type="button"
              className={styles.tool}
              aria-expanded={index}
              aria-controls="designer-index"
              aria-label="Everything on the island"
              title="Index"
              onClick={() => setIndex((value) => !value)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
                <path d="M2 3h2v2H2zM6 3h8v2H6zM2 7h2v2H2zM6 7h8v2H6zM2 11h2v2H2zM6 11h8v2H6z" />
              </svg>
            </button>
          </div>
          <nav id="designer-index" className={styles.index} hidden={!index} aria-label="Everything on the island">
            <ol>
              {SPOTS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.indexItem}
                    onClick={() => {
                      indexButton.current?.focus({ preventScroll: true });
                      open(s.id);
                    }}
                    aria-current={selected === s.id || undefined}
                  >
                    <TagFace n={i + 1} small />
                    <span className={styles.indexName}>{label.get(s.id)?.name}</span>
                    <span className={styles.indexCaption}>{s.caption}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div ref={container} className={styles.stage} onPointerDown={() => setIndex(false)}>
          <canvas
            ref={canvas}
            className={styles.canvas}
            aria-label="A pixel island of Aiden's projects. Drag to look around, scroll to zoom, click a place to open it."
          />
          <div ref={layer} className={styles.tags}>
            {SPOTS.map((s, i) => {
              const text = label.get(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  ref={(node) => {
                    if (node) tags.current.set(s.id, node);
                    else tags.current.delete(s.id);
                  }}
                  className={styles.tag}
                  tabIndex={tagsLive ? 0 : -1}
                  data-active={hovered === s.id || undefined}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") engine.current?.hover(s.id);
                  }}
                  onPointerLeave={() => engine.current?.hover(null)}
                  onFocus={() => {
                    engine.current?.hover(s.id);
                    // a tag reached by Tab that's out of sight is brought into it
                    if (!placed.current.get(s.id)?.shown) engine.current?.reveal(s.id);
                  }}
                  onBlur={() => engine.current?.hover(null)}
                  onClick={() => open(s.id)}
                  aria-label={`${text?.name ?? s.id}${s.caption ? `, ${s.caption.toLowerCase()}` : ""}`}
                >
                  <TagFace n={i + 1} />
                  <span className={styles.drawer} aria-hidden="true">
                    <span data-label="">{text?.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className={styles.hint} data-hidden={touched || selected ? "" : undefined} aria-hidden="true">
          <span className={styles.hintFine}>drag to look around · scroll to zoom · click anything</span>
          <span className={styles.hintCoarse}>drag to look · pinch to zoom · tap anything</span>
        </p>

        {failed ? (
          <p className={styles.failed}>
            This page draws with WebGL, which this browser has turned off. The same projects are on <a href="/builder">the builder page</a>.
          </p>
        ) : null}

        <aside
          ref={panel}
          className={styles.card}
          data-shown={spot ? "" : undefined}
          role="dialog"
          aria-labelledby={spot ? "designer-card-title" : undefined}
          aria-hidden={!spot}
          inert={!spot}
          tabIndex={-1}
        >
          <div className={styles.grab} onPointerDown={onSheetDown} onPointerMove={onSheetMove} onPointerUp={onSheetUp} onPointerCancel={onSheetUp}>
            <span className={styles.handle} aria-hidden="true" />
            {spot ? (
              <div className={styles.cardHead}>
                <TagFace n={position + 1} small />
                <span className={styles.caption}>{spot.caption}</span>
                <span className={styles.count}>
                  {position + 1} of {SPOTS.length}
                </span>
                <button type="button" className={styles.close} onClick={() => open(null)} aria-label="Close" title="Close">
                  <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
                    <path d="M3 3h2v2H3zM5 5h2v2H5zM7 7h2v2H7zM9 9h2v2H9zM11 11h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
          {spot ? (
            <div className={styles.cardBody} key={spot.id}>
              {project ? <ProjectBody project={project} image={spot.image ?? project.slug} /> : <AboutBody />}
              <nav className={styles.walk} aria-label="Other places">
                <button type="button" onClick={() => step(-1)}>
                  <span aria-hidden="true">←</span> {label.get(SPOTS[(position - 1 + SPOTS.length) % SPOTS.length].id)?.name}
                </button>
                <button type="button" onClick={() => step(1)}>
                  {label.get(SPOTS[(position + 1) % SPOTS.length].id)?.name} <span aria-hidden="true">→</span>
                </button>
              </nav>
            </div>
          ) : null}
        </aside>
      </div>
      {playing ? <Play root={rootRef} engine={engine} capture={askCapture} onExit={leave} /> : null}
    </>
  );
}

/** A place's numbered tag, drawn in its own pixels; `small` leaves off the tail. */
function TagFace({ n, small = false }: { n: number; small?: boolean }) {
  const h = small ? TAG.h : TAG.h + TAG.tail;
  return (
    <svg className={small ? styles.faceSmall : styles.face} viewBox={`0 0 ${TAG.w} ${h}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className={styles.faceEdge} d={`M0 0h${TAG.w}v${TAG.h}H0z${small ? "" : "M4 9h3v1H4zM5 10h1v1H5z"}`} />
      <path className={styles.faceFill} d={`M1 1h${TAG.w - 2}v${TAG.h - 2}H1z`} />
      <path className={styles.faceDigits} d={digitsPath(String(n).padStart(2, "0"), 2, 2)} />
    </svg>
  );
}

function ProjectBody({ project, image }: { project: WorldProject; image: string }) {
  const awardPrint = project.announcement && project.award;
  const links = project.live || project.source || project.announcement ? (
    <div className={styles.links}>
      {project.announcement ? (
        <a className={styles.primary} href={project.announcement} target="_blank" rel="noreferrer">
          Demo on LinkedIn <span aria-hidden="true">↗</span>
        </a>
      ) : null}
      {project.live ? (
        <a className={project.announcement ? styles.secondary : styles.primary} href={project.live} target="_blank" rel="noreferrer">
          Visit {linkLabel(project.live)} <span aria-hidden="true">↗</span>
        </a>
      ) : null}
      {project.source ? (
        <a className={project.live || project.announcement ? styles.secondary : styles.primary} href={project.source} target="_blank" rel="noreferrer">
          Source <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <figure className={styles.print}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={projectImage(image, "sm")}
          alt={project.slug === "nomen" ? "Nomen’s wooden Trojan horse with its doors open and ramp down" : `${project.name}, as it looks`}
          width={800}
          height={500}
          decoding="async"
          style={{ objectPosition: imageFocus(image) }}
        />
      </figure>
      <h2 id="designer-card-title" className={styles.title} style={{ "--accent": project.accent } as React.CSSProperties}>
        {project.name}
      </h2>
      <p className={styles.line}>{project.line}</p>
      {awardPrint ? (
        <div className={styles.awardPrint} style={{ "--accent": project.accent } as React.CSSProperties}>
          <strong>{project.award}</strong>
          {project.event ? <span>{project.event}</span> : null}
        </div>
      ) : null}
      {project.announcement ? links : null}
      <p className={styles.about}>{project.about}</p>
      <dl className={styles.spec}>
        <div>
          <dt>Status</dt>
          <dd>{project.status}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{formatMonth(project.date)}</dd>
        </div>
        {!awardPrint && (project.award || project.event) ? (
          <div>
            <dt>{project.award ? "Won" : "Made for"}</dt>
            <dd>{[project.award, project.event].filter(Boolean).join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Built with</dt>
          <dd>{project.stack.join(", ")}</dd>
        </div>
      </dl>
      {project.announcement ? null : links}
    </>
  );
}

function AboutBody() {
  return (
    <>
      <div className={styles.me}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PERSON.photo} alt={PERSON.name} width={96} height={96} />
        <div>
          <h2 id="designer-card-title" className={styles.title}>
            {PERSON.name}
          </h2>
          <p className={styles.line}>
            {PERSON.program}, {PERSON.school}
          </p>
        </div>
      </div>
      <dl className={styles.spec}>
        <div>
          <dt>Built</dt>
          <dd>{PROJECTS.length} projects</dd>
        </div>
        <div>
          <dt>Won</dt>
          <dd>{firsts} first places</dd>
        </div>
        <div>
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

// the sky's two lights, drawn on the same 2-pixel grid as the other icons
function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM3 3h2v2H3zM11 3h2v2h-2zM3 11h2v2H3zM11 11h2v2h-2zM6 5h4v6H6zM5 6h6v4H5z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M6 2h4v1H6zM4 3h3v1H4zM3 4h3v2H3zM2 6h3v4H2zM3 10h3v2H3zM4 12h3v1H4zM6 13h5v1H6zM7 12h6v1H7zM9 11h4v1H9z" />
    </svg>
  );
}
