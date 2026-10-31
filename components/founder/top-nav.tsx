"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { projectImage, type Role } from "@/content/worlds";
import {
  BellIcon,
  CaretDownIcon,
  CheckIcon,
  HomeIcon,
  JobsIcon,
  MessagingIcon,
  NetworkIcon,
  SearchIcon,
} from "./icons";
import { Wordmark } from "./logos";
import { prefersReducedMotion, scrollToId, useFounder } from "./provider";
import ui from "./founder.module.css";
import styles from "./nav.module.css";

export type NavProject = { slug: string; name: string; line: string; event?: string; stack: string[] };
export type NavNotification = { project: string; lead: string; text: string; when: string };

type Menu = "notifications" | "me";

const ROLE_LABEL: Record<Role, string> = {
  founder: "Founder",
  student: "Student",
  builder: "Builder",
  designer: "Designer",
};

function jumpTo(id: string) {
  return (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToId(id);
  };
}

export function TopNav({
  name,
  headline,
  photo,
  projects,
  notifications,
  roles,
  current,
  title,
}: {
  name: string;
  headline: string;
  photo: string;
  projects: NavProject[];
  notifications: NavNotification[];
  roles: Role[];
  current: Role;
  /** The document title once the notifications are read. */
  title: string;
}) {
  const { openMessaging, revealProject } = useFounder();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [seen, setSeen] = useState(false);
  const notificationsHost = useRef<HTMLLIElement>(null);
  const meHost = useRef<HTMLLIElement>(null);
  const notificationsButton = useRef<HTMLButtonElement>(null);
  const meButton = useRef<HTMLButtonElement>(null);
  const notificationsId = useId();
  const meId = useId();

  useEffect(() => {
    if (!menu) return;
    const host = menu === "notifications" ? notificationsHost.current : meHost.current;
    const trigger = menu === "notifications" ? notificationsButton.current : meButton.current;
    const onPointer = (event: PointerEvent) => {
      if (!host?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(null);
      trigger?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggle = (next: Menu) => {
    setMenu((open) => (open === next ? null : next));
    if (next === "notifications" && !seen) {
      setSeen(true);
      document.title = title;
    }
  };

  const unread = seen ? 0 : notifications.length;

  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, on purpose */}
        <a className={styles.brand} href="/" aria-label="ClockedIn home">
          <Wordmark className={styles.wordmarkFull} />
        </a>
        <NavSearch projects={projects} onChoose={revealProject} />
        <nav className={styles.primary} aria-label="Primary">
          <ul className={styles.items}>
            <li className={styles.wide}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, on purpose */}
              <a className={styles.item} href="/">
                <HomeIcon className={styles.icon} />
                <span className={styles.label}>Home</span>
              </a>
            </li>
            <li className={styles.wide}>
              <a className={styles.item} href="#pages" onClick={jumpTo("pages")}>
                <NetworkIcon className={styles.icon} />
                <span className={styles.label}>My Network</span>
              </a>
            </li>
            <li className={styles.wide}>
              <a className={styles.item} href="#experience" onClick={jumpTo("experience")}>
                <JobsIcon className={styles.icon} />
                <span className={styles.label}>Jobs</span>
              </a>
            </li>
            <li>
              <button type="button" className={styles.item} onClick={openMessaging} aria-label="Messaging">
                <MessagingIcon className={styles.icon} />
                <span className={styles.label} aria-hidden="true">
                  Messaging
                </span>
              </button>
            </li>
            <li ref={notificationsHost} className={styles.host}>
              <button
                ref={notificationsButton}
                type="button"
                className={styles.item}
                aria-expanded={menu === "notifications"}
                aria-controls={notificationsId}
                aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
                data-active={menu === "notifications" || undefined}
                onClick={() => toggle("notifications")}
              >
                <span className={styles.iconWrap}>
                  <BellIcon className={styles.icon} />
                  {unread ? (
                    <span className={styles.badge} aria-hidden="true">
                      {unread}
                    </span>
                  ) : null}
                </span>
                <span className={styles.label} aria-hidden="true">
                  Notifications
                </span>
              </button>
              <div id={notificationsId} className={`${styles.dropdown} ${styles.notifications}`} hidden={menu !== "notifications"}>
                <h2 className={styles.dropTitle}>Notifications</h2>
                <ul className={styles.notificationList}>
                  {notifications.map((item) => (
                    <li key={item.project}>
                      <button
                        type="button"
                        className={styles.notification}
                        onClick={() => {
                          setMenu(null);
                          revealProject(item.project);
                        }}
                      >
                        <span className={styles.unreadDot} aria-hidden="true" />
                        <Image
                          className={styles.notificationThumb}
                          src={projectImage(item.project, "sm")}
                          alt=""
                          width={48}
                          height={48}
                        />
                        <span className={styles.notificationText}>
                          <strong>{item.lead}</strong> {item.text}
                        </span>
                        <span className={styles.notificationWhen}>{item.when}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
            <li ref={meHost} className={styles.host}>
              <button
                ref={meButton}
                type="button"
                className={styles.item}
                aria-expanded={menu === "me"}
                aria-controls={meId}
                aria-label="Me"
                data-active={menu === "me" || undefined}
                onClick={() => toggle("me")}
              >
                <Image className={styles.meAvatar} src={photo} alt="" width={24} height={24} />
                <span className={styles.label} aria-hidden="true">
                  Me <CaretDownIcon className={styles.caret} />
                </span>
              </button>
              <div id={meId} className={styles.dropdown} hidden={menu !== "me"}>
                <div className={styles.meCard}>
                  <div className={styles.meHead}>
                    <Image className={styles.meHeadAvatar} src={photo} alt="" width={56} height={56} />
                    <div>
                      <p className={styles.meName}>{name}</p>
                      <p className={styles.meHeadline}>{headline}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.secondary} ${ui.small} ${styles.meView}`}
                    onClick={() => {
                      setMenu(null);
                      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                    }}
                  >
                    View profile
                  </button>
                </div>
                <div className={styles.meSection}>
                  <h2 className={styles.meTitle}>I am a…</h2>
                  <ul>
                    {roles.map((role) => (
                      <li key={role}>
                        <a className={styles.meLink} href={`/${role}`} aria-current={role === current ? "page" : undefined}>
                          {ROLE_LABEL[role]}
                          {role === current ? <CheckIcon className={styles.meCheck} /> : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.meSection}>
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, on purpose */}
                  <a className={styles.meLink} href="/">
                    Sign out
                  </a>
                </div>
              </div>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function rank(project: NavProject, query: string) {
  const name = project.name.toLowerCase();
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  return 2;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b>{text.slice(at, at + query.length)}</b>
      {text.slice(at + query.length)}
    </>
  );
}

function NavSearch({ projects, onChoose }: { projects: NavProject[]; onChoose: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!needle) return [];
    return projects
      .filter((item) =>
        [item.name, item.line, item.event ?? "", ...item.stack].some((field) => field.toLowerCase().includes(needle)),
      )
      .sort((a, b) => rank(a, needle) - rank(b, needle));
  }, [projects, needle]);

  const showing = open && needle.length > 0;
  const activeIndex = Math.min(active, results.length - 1);
  const optionId = (slug: string) => `${listId}-${slug}`;

  useEffect(() => {
    if (!showing) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [showing]);

  const choose = (slug: string) => {
    const chosen = projects.find((item) => item.slug === slug);
    setQuery(chosen?.name ?? "");
    setOpen(false);
    input.current?.blur();
    onChoose(slug);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive(Math.min(activeIndex + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      const chosen = results[activeIndex];
      if (showing && chosen) {
        event.preventDefault();
        choose(chosen.slug);
      }
    } else if (event.key === "Escape") {
      if (showing) {
        setOpen(false);
      } else {
        setQuery("");
        input.current?.blur();
      }
    }
  };

  return (
    <div ref={root} className={styles.search} data-open={showing || undefined}>
      <SearchIcon className={styles.searchIcon} />
      <input
        ref={input}
        className={styles.searchInput}
        type="text"
        role="combobox"
        aria-label="Search projects"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && results[activeIndex] ? optionId(results[activeIndex].slug) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.results} hidden={!showing}>
        {results.length ? <p className={styles.resultsTitle}>Projects</p> : null}
        <ul id={listId} role="listbox" aria-label="Projects" className={styles.resultList}>
          {results.map((item, index) => (
            <li
              key={item.slug}
              id={optionId(item.slug)}
              role="option"
              aria-selected={index === activeIndex}
              className={styles.result}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (index !== activeIndex) setActive(index);
              }}
              onClick={() => choose(item.slug)}
            >
              <Image className={styles.resultThumb} src={projectImage(item.slug, "sm")} alt="" width={32} height={32} />
              <span className={styles.resultText}>
                <span className={styles.resultName}>
                  <Highlight text={item.name} query={needle} />
                </span>
                <span className={styles.resultLine}>{item.line}</span>
              </span>
            </li>
          ))}
        </ul>
        {results.length === 0 ? <p className={styles.noResults}>No projects match “{query.trim()}”.</p> : null}
      </div>
    </div>
  );
}
