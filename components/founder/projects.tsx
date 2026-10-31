"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { formatMonth, type WorldProject } from "@/content/worlds";
import { domainOf, projectLink, skillSummary } from "./format";
import { ArrowRightIcon, CheckIcon, ChevronIcon, DiamondIcon, ExternalIcon, MedalIcon, PeopleIcon, StackIcon } from "./icons";
import { MediaRow } from "./media-row";
import { prefersReducedMotion, useFounder } from "./provider";
import { SeeMore } from "./see-more";
import styles from "./founder.module.css";

/** Projects, five at a time, the way LinkedIn lists them. */
export function Projects({ projects, initial = 5 }: { projects: WorldProject[]; initial?: number }) {
  const { registerProjects } = useFounder();
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const footer = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      registerProjects((slug) => {
        const index = projects.findIndex((item) => item.slug === slug);
        if (index < 0) return;
        if (index >= initial) flushSync(() => setExpanded(true));
        const target = document.getElementById(`project-${slug}`);
        if (!target) return;
        target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        target.focus({ preventScroll: true });
        setFlash(slug);
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(null), 2000);
      }),
    [registerProjects, projects, initial],
  );

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const more = projects.length - initial;

  return (
    <>
      <ul className={styles.list}>
        {projects.map((item, index) => {
          const link = projectLink(item);
          return (
            <li
              key={item.slug}
              id={`project-${item.slug}`}
              tabIndex={-1}
              className={`${styles.entry} ${styles.plainEntry}`}
              data-flash={flash === item.slug || undefined}
              hidden={!expanded && index >= initial}
            >
              <div className={styles.entryBody}>
                <h3 className={styles.entryTitle}>{item.name}</h3>
                <p className={styles.entryMeta}>
                  {item.date ? formatMonth(item.date) : "Previously"} · {item.status}
                </p>
                {item.event ? <p className={styles.entryMeta}>Associated with {item.event}</p> : null}
                {item.award ? (
                  <p className={styles.award}>
                    <MedalIcon />
                    {item.award}
                  </p>
                ) : null}
                {link ? (
                  <div className={styles.entryButtons}>
                    <a className={`${styles.btn} ${styles.muted}`} href={link} target="_blank" rel="noopener noreferrer">
                      Show project
                      <ExternalIcon />
                    </a>
                    {item.live && item.source ? (
                      <a className={`${styles.btn} ${styles.muted}`} href={item.source} target="_blank" rel="noopener noreferrer">
                        View source
                        <ExternalIcon />
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <SeeMore className={styles.entryText} text={item.about} lines={2} />
                <p className={styles.skillsLine}>
                  <DiamondIcon />
                  <strong>{skillSummary(item.stack)}</strong>
                </p>
                <MediaRow project={item} title={item.line} subtitle={link ? domainOf(link) : item.status} href={link} />
              </div>
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <div className={styles.footer}>
          <button
            ref={footer}
            type="button"
            className={styles.footerButton}
            aria-expanded={expanded}
            onClick={() => {
              if (expanded) {
                flushSync(() => setExpanded(false));
                footer.current?.scrollIntoView({ block: "nearest" });
              } else {
                setExpanded(true);
              }
            }}
          >
            {expanded ? (
              <>
                Show fewer projects <ChevronIcon direction="up" />
              </>
            ) : (
              <>
                Show all {projects.length} projects <ArrowRightIcon />
              </>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}

export type SkillRow = {
  name: string;
  projects: { slug: string; name: string }[];
  endorsement?: string;
};

/** Skills with the projects that used them, and an Endorse button each. */
export function Skills({ skills, initial = 5 }: { skills: SkillRow[]; initial?: number }) {
  const { revealProject } = useFounder();
  const [expanded, setExpanded] = useState(false);
  const [endorsed, setEndorsed] = useState<string[]>([]);
  const footer = useRef<HTMLButtonElement>(null);

  const toggle = (name: string) =>
    setEndorsed((list) => (list.includes(name) ? list.filter((item) => item !== name) : [...list, name]));

  return (
    <>
      <ul className={styles.list}>
        {skills.map((skill, index) => {
          const mine = endorsed.includes(skill.name);
          const shown = skill.projects.length <= 3 ? skill.projects : skill.projects.slice(0, 2);
          const rest = skill.projects.length - shown.length;
          const endorsement = skill.endorsement
            ? mine
              ? skill.endorsement.replace(/^Endorsed by /, "Endorsed by you, ")
              : skill.endorsement
            : mine
              ? "Endorsed by you"
              : null;
          return (
            <li key={skill.name} className={`${styles.entry} ${styles.plainEntry}`} hidden={!expanded && index >= initial}>
              <div className={styles.entryBody}>
                <h3 className={styles.entryTitle}>{skill.name}</h3>
                {skill.projects.length ? (
                  <p className={styles.skillFact}>
                    <StackIcon className={styles.skillFactIcon} />
                    <span>
                      {shown.map((item, at) => (
                        <Fragment key={item.slug}>
                          {at === 0 ? null : at === shown.length - 1 && rest === 0 ? " and " : ", "}
                          <a
                            className={styles.quietLink}
                            href={`#project-${item.slug}`}
                            onClick={(event) => {
                              event.preventDefault();
                              revealProject(item.slug);
                            }}
                          >
                            {item.name}
                          </a>
                        </Fragment>
                      ))}
                      {rest > 0 ? ` and ${rest} more` : null}
                    </span>
                  </p>
                ) : null}
                {endorsement ? (
                  <p className={styles.skillFact}>
                    <PeopleIcon className={styles.skillFactIcon} />
                    <span>{endorsement}</span>
                  </p>
                ) : null}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.muted} ${styles.endorse}`}
                  aria-pressed={mine}
                  aria-label={mine ? `Endorsed ${skill.name}` : `Endorse ${skill.name}`}
                  onClick={() => toggle(skill.name)}
                >
                  {mine ? <CheckIcon /> : null}
                  {mine ? "Endorsed" : "Endorse"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {skills.length > initial ? (
        <div className={styles.footer}>
          <button
            ref={footer}
            type="button"
            className={styles.footerButton}
            aria-expanded={expanded}
            onClick={() => {
              if (expanded) {
                flushSync(() => setExpanded(false));
                footer.current?.scrollIntoView({ block: "nearest" });
              } else {
                setExpanded(true);
              }
            }}
          >
            {expanded ? (
              <>
                Show fewer skills <ChevronIcon direction="up" />
              </>
            ) : (
              <>
                Show all {skills.length} skills <ArrowRightIcon />
              </>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}
