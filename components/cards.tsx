import type { CSSProperties, ReactNode } from "react";
import { ExternalLink } from "@/components/external-link";
import { LocalTime } from "@/components/local-time";
import { AsciiTitle } from "@/components/scenery";
import { SocialIcon } from "@/components/social-icon";
import {
  type PortfolioContent,
  type PortfolioImage,
  imageFrame,
  isVideo,
} from "@/content/portfolio";

// The portfolio as an index-card file: a title card, a manila divider with a
// tab for each section, and a card for every project, role and note. Each
// card is plain HTML; the file (components/card-file) only stands them up.

type Kind = "title" | "divider" | "project" | "role" | "about" | "end";

export type CardMeta = { title: string; section: string; kind: Kind; anchor?: string };

type CardProps = {
  kind: Kind;
  tab?: { label: string; at: number };
  prints?: { images: PortfolioImage[]; label: string };
  labelledBy?: string;
  children: ReactNode;
};

// The light on a card, laid over its face: haze for distance into the file,
// shade as it tips away from the lamp, and a sheen that follows the pointer.
function Light() {
  return (
    <>
      <span className="card-fog" aria-hidden="true" />
      <span className="card-shade" aria-hidden="true" />
    </>
  );
}

function Card({ kind, tab, prints, labelledBy, children }: CardProps) {
  const photos = prints && prints.images.length > 0 ? prints : null;
  return (
    <article
      className="index-card"
      data-kind={kind}
      data-card=""
      data-prints={photos ? "" : undefined}
      aria-labelledby={labelledBy}
      style={tab ? ({ "--tab-at": `${tab.at}%` } as CSSProperties) : undefined}
    >
      {tab ? (
        <span className="card-tab" aria-hidden="true">
          <span>{tab.label}</span>
          <Light />
        </span>
      ) : null}
      <div className="card-face">
        {children}
        <Light />
        <span className="card-sheen" aria-hidden="true" />
      </div>
      {photos ? <Prints images={photos.images} label={photos.label} /> : null}
    </article>
  );
}

// Photos taped onto the card, the first on top; they fan out beside it when
// the card is pulled from the file.
function Prints({ images, label }: { images: PortfolioImage[]; label: string }) {
  const shown = images.slice(0, 6);
  return (
    <div className="card-prints" style={{ "--count": shown.length } as CSSProperties}>
      <ul className="card-print-fan" aria-label={`${label || "Project"} images`}>
        {shown.map((image, index) => {
          const frame = imageFrame(image);
          const style: CSSProperties = { objectFit: frame.fit, objectPosition: frame.position };
          const alt = image.alt || `${label}, ${isVideo(image) ? "video" : "image"} ${index + 1}`;
          return (
            <li className="card-print" key={`${image.src}-${index}`} style={{ "--i": index } as CSSProperties}>
              <button type="button" className="card-print-photo" aria-label={`Open ${alt}`} tabIndex={-1}>
                {isVideo(image) ? (
                  // rests on a frame a little way in; a video's first is often black
                  <video aria-label={alt} loop muted playsInline preload="metadata" src={`${image.src}#t=1.5`} style={style} />
                ) : (
                  <img alt={alt} draggable={false} src={image.src} style={style} />
                )}
                {index === 0 ? <span className="card-tape" aria-hidden="true" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <span className="card-print-count" data-more={shown.length > 1 ? "" : undefined} aria-hidden="true">
        {shown.length} {shown.length === 1 ? "photo" : "photos"}
      </span>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// What a status says about a project, shown as a small mark beside it: live
// work pulses, work in progress turns, a win shines, retired work is hollow.
function statusMark(status: string) {
  const s = status.toLowerCase();
  if (/maintain|active|live|shipping/.test(s)) return "live";
  if (/progress|building|beta|wip/.test(s)) return "building";
  if (/place|winner|won|award|finalist/.test(s)) return "award";
  if (/retired|archived|sunset|exited|sold|acquired/.test(s)) return "ended";
  return null;
}

export function buildCards(content: PortfolioContent) {
  const { about, interests, profile, projects, sections, timeline } = content;
  const links = profile.links.filter((link) => link.label && link.href);
  const email = links.find((link) => link.href.startsWith("mailto:"));
  const paragraphs = about.paragraphs.filter((paragraph) => paragraph.length > 0);
  const notes = interests.filter((interest) => interest.length > 0);
  const meta: CardMeta[] = [];
  const cards: ReactNode[] = [];

  const add = (entry: CardMeta, card: ReactNode) => {
    meta.push(entry);
    cards.push(card);
  };

  add(
    { title: profile.name || "Index", section: "index", kind: "title", anchor: "index" },
    <Card kind="title" key="title" labelledBy="site-title">
      <header className="card-head">
        <span className="card-number">{profile.mark}</span>
        <span className="card-meta">{profile.location}</span>
      </header>
      <div className="card-body">
        <h1 id="site-title" className="card-name" aria-label={profile.name || "Portfolio"}>
          <span className="card-name-text">{profile.name}</span>
          <AsciiTitle text={profile.name} />
        </h1>
        {profile.descriptor ? <p className="card-summary">{profile.descriptor}</p> : null}
        {profile.introduction ? <p className="card-detail">{profile.introduction}</p> : null}
        <ol className="card-contents" aria-label="In this file">
          {content.navigation.map((item, index) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>
                <span className="card-contents-index">{pad(index + 1)}</span>
                <span className="card-contents-label">{sections[item.id].title || item.label}</span>
                <span className="card-contents-leader" aria-hidden="true" />
                <span className="card-contents-count">
                  {item.id === "work" ? projects.length : item.id === "experience" ? timeline.length : 1}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      <footer className="card-foot">
        <nav className="card-socials" aria-label="Contact and profiles">
          {links.map((link) => (
            <ExternalLink key={link.href} href={link.href} aria-label={link.label} title={link.label}>
              <SocialIcon label={link.label} href={link.href} />
            </ExternalLink>
          ))}
        </nav>
        <LocalTime name={profile.name} location={profile.locationLabel} />
      </footer>
    </Card>,
  );

  const divider = (id: "work" | "experience" | "about", at: number, count: number) => {
    const section = sections[id];
    add(
      { title: section.label || id, section: id, kind: "divider", anchor: id },
      <Card kind="divider" tab={{ label: section.label || id, at }} key={`divider-${id}`} labelledBy={`${id}-title`}>
        <div className="card-body">
          <p className="card-meta">{section.label}</p>
          <h2 id={`${id}-title`} className="card-divider-title">
            {section.title}
          </h2>
        </div>
        <footer className="card-foot">
          <span className="card-meta">
            {count} {count === 1 ? "card" : "cards"} behind this tab
          </span>
        </footer>
      </Card>,
    );
  };

  divider("work", 4, projects.length);
  projects.forEach((project, index) => {
    const mark = project.status ? statusMark(project.status) : null;
    const stack = project.stack.filter((item) => item.length > 0);
    const projectLinks = project.links.filter((link) => link.href.length > 0);
    add(
      { title: project.name, section: "work", kind: "project" },
      <Card
        kind="project"
        prints={{ images: project.images, label: project.name }}
        key={`project-${index}`}
        labelledBy={`project-${index}`}
      >
        <header className="card-head">
          <span className="card-number">W·{pad(index + 1)}</span>
          <h3 id={`project-${index}`} className="card-title">
            {project.name}
          </h3>
          {project.status ? (
            <span className="card-status">
              {mark ? <span className="status-mark" data-mark={mark} aria-hidden="true" /> : null}
              {project.status}
            </span>
          ) : null}
        </header>
        <div className="card-body">
          {project.summary ? <p className="card-summary">{project.summary}</p> : null}
          {project.detail ? <p className="card-detail">{project.detail}</p> : null}
        </div>
        {stack.length || projectLinks.length ? (
          <footer className="card-foot">
            {stack.length ? <span className="card-meta">{stack.join(" · ")}</span> : <span />}
            {projectLinks.length ? (
              <span className="card-links" aria-label={`${project.name} links`}>
                {projectLinks.map((link) => (
                  <ExternalLink key={link.href} href={link.href}>
                    {link.label}
                  </ExternalLink>
                ))}
              </span>
            ) : null}
          </footer>
        ) : null}
      </Card>,
    );
  });

  divider("experience", 38, timeline.length);
  timeline.forEach((item, index) => {
    add(
      { title: item.organization || item.role, section: "experience", kind: "role" },
      <Card
        kind="role"
        prints={{ images: item.images, label: item.organization }}
        key={`role-${index}`}
        labelledBy={`role-${index}`}
      >
        <header className="card-head">
          <span className="card-number">E·{pad(index + 1)}</span>
          <h3 id={`role-${index}`} className="card-title">
            {item.organization}
          </h3>
        </header>
        <div className="card-body">
          {item.role ? <p className="card-summary">{item.role}</p> : null}
          {item.summary ? <p className="card-detail">{item.summary}</p> : null}
        </div>
        {/* the period, date-stamped in red ink the way a library card is */}
        {item.period ? <time className="card-stamp">{item.period}</time> : null}
      </Card>,
    );
  });

  divider("about", 72, 1);
  add(
    { title: sections.about.title || "About", section: "about", kind: "about" },
    <Card kind="about" key="about" labelledBy="about-card">
      <header className="card-head">
        <span className="card-number">A·01</span>
        <h3 id="about-card" className="card-title">
          Notes
        </h3>
      </header>
      <div className="card-body card-columns">
        <div>
          {paragraphs.map((paragraph, index) => (
            <p className={index === 0 ? "card-summary" : "card-detail"} key={`${paragraph}-${index}`}>
              {paragraph}
            </p>
          ))}
        </div>
        {notes.length ? (
          <ol className="card-list" aria-label="Current interests">
            {notes.map((note, index) => (
              <li key={`${note}-${index}`}>
                <span>{pad(index + 1)}</span>
                {note}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Card>,
  );

  add(
    { title: "End", section: "end", kind: "end" },
    <Card kind="end" key="end" labelledBy="end-card">
      <header className="card-head">
        <span className="card-number">FIN</span>
        <h3 id="end-card" className="card-title">
          End of the file
        </h3>
      </header>
      <div className="card-body">
        <p className="card-summary">Thanks for flipping through.</p>
        {email ? (
          <p className="card-detail">
            Building something? Write to{" "}
            <a className="card-inline-link" href={email.href}>
              {email.href.replace(/^mailto:/, "")}
            </a>
            .
          </p>
        ) : null}
      </div>
      <footer className="card-foot">
        <span className="card-meta">
          © {new Date().getFullYear()} {profile.name}
        </span>
        <a className="card-inline-link" href="#index">
          Back to the front ↑
        </a>
      </footer>
      <span className="card-stamp" aria-hidden="true">
        Filed {new Date().getFullYear()}
      </span>
    </Card>,
  );

  return { meta, cards };
}
