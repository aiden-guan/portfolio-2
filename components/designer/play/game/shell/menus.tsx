"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CHAPTERS, COMING, ORDER } from "../chapters";
import { FEATS, type Feat } from "../chapters/feats";
import type { ChapterId } from "../chapters/types";
import type { Save, Settings, TextSpeed } from "../save";
import { usePresence } from "./motion";
import { CHECK, LOCK, MOMENT, MOMENT_DIM, MOMENT_SECRET, Pixels, POINTER } from "./pixels";
import styles from "./menus.module.css";

// The menus: the title screen's, the Chapters screen (and the moments found
// so far), Settings, and pausing. Arrow keys move through every one of them,
// a press picks, Esc goes back.

export type MenuItem = "continue" | "new" | "chapters" | "settings" | "island";

/** The focusable things in a menu, in order: arrows move between them. */
function moveFocus(root: HTMLElement, step: number) {
  const items = [...root.querySelectorAll<HTMLElement>("[data-menu-item]")].filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"));
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[i < 0 ? 0 : (i + step + items.length) % items.length].focus();
}

/** Up and down move, Tab stays inside. */
function onMenuKeys(event: ReactKeyboardEvent<HTMLElement>) {
  const root = event.currentTarget;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveFocus(root, event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    moveFocus(root, event.shiftKey ? -1 : 1);
  }
}

// —— the title screen

export function TitleMenu({
  items,
  menu,
  shown,
  leaving,
  save,
  confirmNew,
  onHover,
  onChoose,
}: {
  items: MenuItem[];
  menu: number;
  shown: boolean;
  leaving: boolean;
  save: Save | null;
  confirmNew: boolean;
  onHover: (i: number) => void;
  onChoose: (item: MenuItem) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  // the cobalt bar glides to whichever item is picked, whatever its height
  useLayoutEffect(() => {
    const host = nav.current;
    const bar = cursor.current;
    const item = host?.querySelectorAll<HTMLElement>("[data-item]")[menu];
    if (!host || !bar || !item) return;
    bar.style.transform = `translateY(${item.offsetTop}px)`;
    bar.style.height = `${item.offsetHeight}px`;
    if (!bar.dataset.ready) requestAnimationFrame(() => (bar.dataset.ready = "1"));
  }, [menu, items.length, confirmNew, shown]);

  return (
    <nav ref={nav} className={styles.menu} aria-label="Main menu" data-shown={shown || undefined}>
      <span ref={cursor} className={styles.cursor} aria-hidden="true">
        <Pixels art={POINTER} className={styles.pointer} />
      </span>
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          data-item=""
          className={styles.menuItem}
          data-on={menu === i || undefined}
          style={{ "--i": i } as CSSProperties}
          disabled={leaving}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onPointerEnter={() => onHover(i)}
          onClick={() => onChoose(item)}
        >
          {item === "continue" && save ? (
            <>
              Continue
              <small>
                {CHAPTERS[save.chapter].number} · {CHAPTERS[save.chapter].title}
              </small>
            </>
          ) : item === "new" ? (
            confirmNew ? (
              <>
                Start over?
                <small>Press again. Continue will start from the beginning</small>
              </>
            ) : (
              "New game"
            )
          ) : item === "chapters" ? (
            "Chapters"
          ) : item === "settings" ? (
            "Settings"
          ) : (
            "Back to the island"
          )}
        </button>
      ))}
    </nav>
  );
}

/** A panel over the title screen: Chapters, or Settings. */
function Panel({ open, title, tabs, narrow, onClose, children }: { open: boolean; title: string; tabs?: ReactNode; narrow?: boolean; onClose: () => void; children: ReactNode }) {
  const { mounted, leaving } = usePresence(open, 160);
  if (!mounted) return null;
  return (
    <div
      className={styles.scrim}
      data-ui=""
      data-leaving={leaving || undefined}
      onPointerDown={(event) => {
        // a click off the panel closes it
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        data-narrow={narrow || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onMenuKeys}
        ref={(node) => {
          if (!node || leaving || node.contains(document.activeElement)) return;
          const pick = "[data-menu-item]:not([tabindex='-1'])";
          (node.querySelector<HTMLElement>(`.${styles.panelBody} ${pick}`) ?? node.querySelector<HTMLElement>(pick))?.focus();
        }}
      >
        <header className={styles.panelHead} data-tabs={tabs ? "" : undefined}>
          {tabs ?? <h2>{title}</h2>}
          <button type="button" className={styles.close} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} data-menu-item="">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={styles.panelBody}>{children}</div>
      </div>
    </div>
  );
}

export function ChaptersPanel({
  open,
  done,
  found,
  onClose,
  onPlay,
}: {
  open: boolean;
  done: ChapterId[];
  found: Record<string, number>;
  onClose: () => void;
  onPlay: (id: ChapterId) => void;
}) {
  const [tab, setTab] = useState<"chapters" | "moments">("chapters");
  const { got, total } = tally(found);
  const playable = (id: ChapterId) => id === "prologue" || done.includes(id) || done.includes(ORDER[ORDER.indexOf(id) - 1]);
  const tabs = (
    <div className={styles.tabs} role="tablist" aria-label="Chapters and moments">
      {(["chapters", "moments"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={styles.tab}
          data-on={tab === id || undefined}
          data-menu-item=""
          onClick={() => setTab(id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") setTab(tab === "chapters" ? "moments" : "chapters");
          }}
        >
          {id === "chapters" ? (
            "Chapters"
          ) : (
            <>
              Moments <b>{got}/{total}</b>
            </>
          )}
        </button>
      ))}
    </div>
  );
  return (
    <Panel open={open} title="Chapters" tabs={tabs} onClose={onClose}>
      {tab === "chapters" ? (
        <ol className={styles.chapterList} key="chapters">
          {ORDER.map((id, i) => {
            const c = CHAPTERS[id];
            const can = playable(id);
            const finished = done.includes(id);
            return (
              <li key={id} data-open={can || undefined} style={{ "--i": i } as CSSProperties}>
                <span className={styles.chapterNumber}>
                  {c.number}
                  {finished ? <Pixels art={CHECK} className={styles.doneMark} label="Finished" /> : null}
                </span>
                <strong>{c.title}</strong>
                <span className={styles.chapterLine}>{c.line}</span>
                {can ? (
                  <button type="button" className={finished ? styles.replay : styles.play} onClick={() => onPlay(id)} data-menu-item="">
                    {finished ? "Replay" : "Play"}
                  </button>
                ) : (
                  <em className={styles.locked}>
                    <Pixels art={LOCK} className={styles.lock} />
                    Finish the one before
                  </em>
                )}
              </li>
            );
          })}
          {COMING.map((c, i) => (
            <li key={c.title} style={{ "--i": ORDER.length + i } as CSSProperties}>
              <span className={styles.chapterNumber}>{c.number}</span>
              <strong>{c.title}</strong>
              <span className={styles.chapterLine}>{c.line}</span>
              <em className={styles.locked}>Coming soon</em>
            </li>
          ))}
        </ol>
      ) : (
        <Moments found={found} key="moments" />
      )}
    </Panel>
  );
}

export function SettingsPanel({ open, settings, muted, onSettings, onMuted, onClose }: { open: boolean; settings: Settings; muted: boolean; onSettings: (next: Settings) => void; onMuted: (muted: boolean) => void; onClose: () => void }) {
  return (
    <Panel open={open} title="Settings" narrow onClose={onClose}>
      <div className={styles.settingsWide}>
        <SettingsRows settings={settings} muted={muted} onSettings={onSettings} onMuted={onMuted} />
      </div>
    </Panel>
  );
}

// —— moments

function tally(found: Record<string, number>) {
  const all = Object.entries(FEATS) as Array<[string, Feat]>;
  return { all, got: all.filter(([id]) => id in found).length, total: all.length };
}

/** Every moment there is: the ones found, the ones still to find, and the
 * secret ones, which read ??? until they're found. */
export function Moments({ found }: { found: Record<string, number> }) {
  const { all, got, total } = tally(found);
  return (
    <section className={styles.moments} aria-label={`Moments, ${got} of ${total} found`}>
      <header className={styles.momentsHead}>
        <h3>Moments</h3>
        <span className={styles.momentsCount}>
          <b>{got}</b> / {total}
        </span>
      </header>
      <span className={styles.momentsBar} aria-hidden="true">
        <i style={{ transform: `translateX(${total ? ((got / total - 1) * 100).toFixed(2) : -100}%)` }} />
      </span>
      <ol className={styles.momentList}>
        {all.map(([id, feat], i) => {
          const have = id in found;
          const hidden = !have && Boolean(feat.secret);
          return (
            <li key={id} data-found={have || undefined} style={{ "--i": i } as CSSProperties}>
              <Pixels art={have ? MOMENT : hidden ? MOMENT_SECRET : MOMENT_DIM} className={styles.badge} />
              <span>
                <strong>{hidden ? "???" : feat.title}</strong>
                {hidden ? null : <small>{feat.line}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// —— settings

const SPEEDS: Array<[TextSpeed, string]> = [
  ["normal", "Normal"],
  ["fast", "Fast"],
  ["instant", "Instant"],
];
const ONOFF: Array<["on" | "off", string]> = [
  ["on", "On"],
  ["off", "Off"],
];

/** A row of options, one of them on, with a cobalt thumb that slides
 * between them. Left and right change it. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  const id = useId();
  const at = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className={styles.setting}>
      <span id={id} className={styles.settingLabel}>
        {label}
      </span>
      <div
        className={styles.segmented}
        role="radiogroup"
        aria-labelledby={id}
        style={{ "--n": options.length, "--at": at } as CSSProperties}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const group = event.currentTarget;
          const next = (at + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
          onChange(options[next][0]);
          requestAnimationFrame(() => group.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus());
        }}
      >
        <i className={styles.thumb} aria-hidden="true" />
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} data-on={value === v || undefined} data-menu-item="" onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsRows({ settings, muted, onSettings, onMuted }: { settings: Settings; muted: boolean; onSettings: (next: Settings) => void; onMuted: (muted: boolean) => void }) {
  return (
    <div className={styles.settings}>
      <Segmented label="Text speed" value={settings.text} options={SPEEDS} onChange={(text) => onSettings({ ...settings, text })} />
      <Segmented label="Screen shake" value={settings.shake ? "on" : "off"} options={ONOFF} onChange={(v) => onSettings({ ...settings, shake: v === "on" })} />
      <Segmented label="Sound" value={muted ? "off" : "on"} options={ONOFF} onChange={(v) => onMuted(v === "off")} />
    </div>
  );
}

// —— paused

export function Pause({
  open,
  where,
  found,
  settings,
  muted,
  onResume,
  onTitle,
  onQuit,
  onSettings,
  onMuted,
}: {
  open: boolean;
  /** Which chapter this is, for the card's corner. */
  where: string;
  found: Record<string, number>;
  settings: Settings;
  muted: boolean;
  onResume: () => void;
  onTitle: () => void;
  onQuit: () => void;
  onSettings: (next: Settings) => void;
  onMuted: (muted: boolean) => void;
}) {
  const { mounted, leaving } = usePresence(open, 150);
  const [view, setView] = useState<"menu" | "settings">("menu");
  const [wasOpen, setWasOpen] = useState(open);
  // a fresh pause always opens on the menu
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setView("menu");
  }
  if (!mounted) return null;
  return (
    <div className={styles.paused} data-ui="" data-leaving={leaving || undefined}>
      <div
        className={styles.pauseCard}
        role="dialog"
        aria-modal="true"
        aria-label={view === "menu" ? "Paused" : "Settings"}
        onKeyDown={(event) => {
          // Esc in Settings goes back to the menu, not out of the pause
          if (event.key === "Escape" && view === "settings") {
            event.stopPropagation();
            setView("menu");
            return;
          }
          onMenuKeys(event);
        }}
      >
        <header className={styles.pauseHead}>
          <h2>{view === "menu" ? "Paused" : "Settings"}</h2>
          <span>{where}</span>
        </header>
        <div className={styles.pauseBody}>
          <div className={styles.pauseMenu} key={view}>
            {view === "menu" ? (
              <>
                <button type="button" className={styles.primary} onClick={onResume} data-menu-item="" autoFocus>
                  Resume
                </button>
                <button type="button" className={styles.secondary} onClick={() => setView("settings")} data-menu-item="">
                  Settings
                </button>
                <button type="button" className={styles.secondary} onClick={onTitle} data-menu-item="">
                  Title screen
                </button>
                <button type="button" className={styles.secondary} onClick={onQuit} data-menu-item="">
                  Back to the island
                </button>
                <p className={styles.saved}>Your place saves at the start of each part. Come back any time.</p>
              </>
            ) : (
              <>
                <SettingsRows settings={settings} muted={muted} onSettings={onSettings} onMuted={onMuted} />
                <button type="button" className={styles.secondary} onClick={() => setView("menu")} data-menu-item="" autoFocus>
                  Done
                </button>
              </>
            )}
          </div>
          <Moments found={found} />
        </div>
      </div>
    </div>
  );
}
