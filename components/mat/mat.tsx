import type { CSSProperties, ReactNode } from "react";
import { Places } from "@/components/mat/places";
import { Wordmark } from "@/components/mat/wordmark";
import {
  ApprovalForm,
  BusinessCard,
  Drawing,
  Envelope,
  NotesCard,
  Postcard,
  Print,
  Receipt,
  Ticket,
  TimeCard,
} from "@/components/mat/things";
import type { PortfolioContent, Project } from "@/content/portfolio";
import { projectKind } from "@/lib/mat";

// The portfolio laid out on a cutting mat: the name printed across the top,
// a business card on it, then a band of the mat for every project, the
// time cards, a note and an envelope. Everything is knolled square to the
// grid until someone picks it up.

const MAIN = {
  receipt: Receipt,
  form: ApprovalForm,
  postcard: Postcard,
  drawing: Drawing,
  ticket: Ticket,
};

// How wide the main thing of each kind is, in millimetres of mat, so the
// prints beside it can take what's left of the row.
const MAIN_WIDTH = { receipt: 74, form: 124, postcard: 148, drawing: 170, ticket: 152 };
const ROW = 262;

function SectionHead({ id, label, title, count }: { id: string; label: string; title: string; count?: number }) {
  return (
    <header className="mat-head">
      <h2 className="mat-head-title" id={`${id}-title`}>
        <span className="mat-head-label">{label}</span>
        <span className="mat-head-words">{title}</span>
      </h2>
      {count !== undefined ? (
        <span className="mat-head-count" aria-hidden="true">
          {String(count).padStart(2, "0")}
        </span>
      ) : null}
    </header>
  );
}

function ProjectRow({ project, index, owner }: { project: Project; index: number; owner: string }) {
  const kind = projectKind(project, index);
  const Main = MAIN[kind];
  const images = project.images.slice(0, 6);
  const layered = Math.min(images.length, 3) - 1;
  // what's left of the row for the prints, after the main thing and a gap;
  // a stack of prints steps down and across, so it needs a little more
  const room = ROW - MAIN_WIDTH[kind] - 16 - Math.max(0, layered) * 10;
  const printWidth = Math.round(Math.min(116, Math.max(88, room)));
  return (
    <div
      className="mat-row"
      data-kind={kind}
      data-side={index % 2 ? "right" : "left"}
      data-prints={images.length ? String(images.length) : undefined}
    >
      <div className="mat-main">
        <Main project={project} index={index} owner={owner} />
      </div>
      {images.length ? (
        <div className="mat-prints" style={{ "--n": images.length, "--pw": printWidth } as CSSProperties}>
          {images.map((image, imageIndex) => (
            <div className="mat-print" key={`${image.src}-${imageIndex}`} style={{ "--i": imageIndex } as CSSProperties}>
              <Print image={image} label={project.name} gallery={`work-${index}`} index={imageIndex} w={printWidth} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The angles printed in the mat's corner for cutting by, the way every
// cutting mat has them, kept clear of the corner itself. In millimetres.
function Angles() {
  const from = 30;
  const to = 110;
  return (
    <svg className="mat-angles" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      {[30, 45, 60].map((degrees) => {
        const a = (degrees * Math.PI) / 180;
        const x = (r: number) => (r * Math.cos(a)).toFixed(2);
        const y = (r: number) => (120 - r * Math.sin(a)).toFixed(2);
        return (
          <g key={degrees}>
            <path d={`M${x(from)} ${y(from)}L${x(to)} ${y(to)}`} />
            <text x={x(to + 3)} y={y(to + 3)} transform={`rotate(${-degrees} ${x(to + 3)} ${y(to + 3)})`}>
              {degrees}°
            </text>
          </g>
        );
      })}
      <path d={`M${to} 120A${to} ${to} 0 0 0 0 ${120 - to}`} />
    </svg>
  );
}

function Band({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mat-band${className ? ` ${className}` : ""}`} id={id} aria-labelledby={`${id}-title`}>
      {children}
    </section>
  );
}

export function Mat({ content }: { content: PortfolioContent }) {
  const { about, interests, profile, projects, sections, timeline } = content;
  const paragraphs = about.paragraphs.filter((paragraph) => paragraph.length > 0);
  const notes = interests.filter((interest) => interest.length > 0);
  const year = new Date().getFullYear();

  return (
    <>
      <section className="mat-hero" id="index" aria-label={profile.name}>
        <Wordmark text={profile.name} />
        <div className="mat-hero-card">
          {/* the card's size, dimensioned on the mat where it belongs */}
          <span className="dim dim-across" aria-hidden="true">
            <span>89</span>
          </span>
          <span className="dim dim-down" aria-hidden="true">
            <span>51</span>
          </span>
          <BusinessCard profile={profile} />
        </div>
        <p className="mat-hint" aria-hidden="true">
          <span>
            <span className="hint-pointer">Drag anything</span>
            <span className="hint-touch">Hold anything to move it</span>
          </span>
          <span>
            <span className="hint-pointer">Click to turn over</span>
            <span className="hint-touch">Tap to turn over</span>
          </span>
          <span>
            <span className="hint-pointer">Cut anything</span>
            <span className="hint-touch">Hold the mat to cut it</span>
          </span>
        </p>
      </section>

      <Band id="work">
        <SectionHead id="work" label={sections.work.label} title={sections.work.title} count={projects.length} />
        {projects.map((project, index) => (
          <ProjectRow project={project} index={index} owner={profile.name} key={`${project.name}-${index}`} />
        ))}
      </Band>

      <Band id="experience">
        <SectionHead
          id="experience"
          label={sections.experience.label}
          title={sections.experience.title}
          count={timeline.length}
        />
        <div className="mat-timecards" style={{ "--n": timeline.length } as CSSProperties}>
          {timeline.map((entry, index) => (
            <TimeCard entry={entry} index={index} owner={profile.name} key={`${entry.organization}-${index}`} />
          ))}
        </div>
      </Band>

      <Band id="about" className="mat-band-about">
        <SectionHead id="about" label={sections.about.label} title={sections.about.title} />
        <div className="mat-about">
          {paragraphs.length || notes.length ? (
            <NotesCard paragraphs={paragraphs} interests={notes} title="Notes" />
          ) : null}
          <Places />
        </div>
      </Band>

      <section className="mat-end" aria-label="Write to me">
        <Envelope profile={profile} />
      </section>

      <footer className="mat-foot">
        <Angles />
        <span>Self-healing cutting mat</span>
        <span>{profile.mark}</span>
        <span>
          © {year} {profile.name}
        </span>
      </footer>
    </>
  );
}
