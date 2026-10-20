import type { CSSProperties, ReactNode } from "react";
import { LocalTime } from "@/components/local-time";
import { SocialIcon } from "@/components/social-icon";
import {
  type PortfolioContent,
  type PortfolioImage,
  type Project,
  type TimelineEntry,
  imageFrame,
  isVideo,
} from "@/content/portfolio";
import { Thing } from "@/components/mat/thing";
import { bare, code128, initials, lastAmount, pad, periodParts, stampWord, statusMark } from "@/lib/mat";

// The things that lie on the mat. Each is plain HTML in reading order; the
// table (components/mat/table) only lets a hand move, throw and turn them.
// Sizes are in millimetres of mat (--u is one millimetre on screen), so a
// business card is a business card's size next to a receipt.

// Seen from behind, a sheet shows its own print faintly, backwards.
function ShowThrough({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <>
      <div className="show-through">{children}</div>
      {note}
    </>
  );
}

// ---- the business card ---------------------------------------------------

export function BusinessCard({ profile }: { profile: PortfolioContent["profile"] }) {
  const links = profile.links.filter((link) => link.label && link.href);
  const email = links.find((link) => link.href.startsWith("mailto:"));
  return (
    <Thing
      kind="card"
      label={`${profile.name}, business card`}
      w={89}
      id="card"
      back={
        <div className="bc-back">
          <span className="bc-monogram">{initials(profile.name)}</span>
          {email ? <span className="bc-back-line">{bare(email.href)}</span> : null}
        </div>
      }
    >
      <div className="bc">
        <header className="bc-top">
          <span className="bc-mark">{profile.mark}</span>
          <span>{profile.location}</span>
        </header>
        <div className="bc-who">
          <h1 className="bc-name">{profile.name}</h1>
          {profile.descriptor ? <p className="bc-role">{profile.descriptor}</p> : null}
          {profile.introduction ? <p className="bc-intro">{profile.introduction}</p> : null}
        </div>
        <footer className="bc-foot">
          <nav className="bc-links" aria-label="Contact and profiles">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-label={link.label}
                title={link.label}
                target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                rel={link.href.startsWith("mailto:") ? undefined : "noreferrer"}
              >
                <SocialIcon label={link.label} href={link.href} />
              </a>
            ))}
          </nav>
          <LocalTime name={profile.name} location={profile.locationLabel} />
        </footer>
      </div>
    </Thing>
  );
}

// ---- prints ----------------------------------------------------------------

// A photograph or a short film of the work, printed with a border. Clicking
// one opens it large (components/print-viewer); the prints of one project
// share a gallery.
export function Print({
  image,
  label,
  gallery,
  index,
  w,
}: {
  image: PortfolioImage;
  label: string;
  gallery: string;
  index: number;
  w: number;
}) {
  const frame = imageFrame(image);
  // a print is cropped to its paper, around the image's focus
  const style: CSSProperties = { objectFit: "cover", objectPosition: frame.position };
  const alt = image.alt || `${label}, ${isVideo(image) ? "film" : "photo"} ${index + 1}`;
  const video = isVideo(image);
  return (
    <Thing
      kind={video ? "instant" : "print"}
      label={`${alt}, ${video ? "instant film" : "print"}`}
      w={w}
      action="open"
      data={{ gallery, print: String(index), title: label }}
    >
      <figure className={video ? "ip" : "pr"}>
        <div className="print-window">
          {video ? (
            <video
              data-print-media=""
              aria-label={alt}
              muted
              loop
              playsInline
              preload="metadata"
              src={`${image.src}#t=1.5`}
              style={style}
            />
          ) : (
            <img data-print-media="" alt={alt} draggable={false} loading="lazy" decoding="async" src={image.src} style={style} />
          )}
        </div>
        {video ? <figcaption className="ip-caption">{label}</figcaption> : null}
      </figure>
    </Thing>
  );
}

// ---- projects ----------------------------------------------------------------

type ProjectThingProps = { project: Project; index: number; owner: string };

function projectLinks(project: Project) {
  return project.links.filter((link) => link.href.length > 0);
}

function stackLine(project: Project) {
  return project.stack.filter((item) => item.length > 0);
}

function ProjectLinks({ project, className }: { project: Project; className: string }) {
  const links = projectLinks(project);
  if (!links.length) return null;
  return (
    <span className={className}>
      {links.map((link) => (
        <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
          {link.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </span>
  );
}

// A shop's till receipt.
export function Receipt({ project, index }: ProjectThingProps) {
  const total = lastAmount(project.detail);
  const stack = stackLine(project);
  const links = projectLinks(project);
  const face = (
    <div className="rc">
      <p className="rc-store">{project.name}</p>
      {project.summary ? <p className="rc-sub">{project.summary}</p> : null}
      <p className="rc-row rc-meta">
        <span>W·{pad(index + 1)}</span>
        <span>No. {pad(index + 1, 4)}</span>
      </p>
      <p className="rc-rule" aria-hidden="true" />
      {stack.length ? (
        <ul className="rc-items" aria-label="Built with">
          {stack.map((item) => (
            <li className="rc-row" key={item}>
              <span>{item}</span>
              <span>1</span>
            </li>
          ))}
        </ul>
      ) : null}
      {stack.length ? <p className="rc-rule" aria-hidden="true" /> : null}
      {project.detail ? <p className="rc-note">{project.detail}</p> : null}
      {total ? (
        <p className="rc-row rc-total">
          <span>Total</span>
          <span>{total}</span>
        </p>
      ) : null}
      <p className="rc-row rc-status">
        <span>Status</span>
        <span>{project.status}</span>
      </p>
      <p className="rc-rule rc-rule-double" aria-hidden="true" />
      {links.length ? (
        <p className="rc-visit">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
              {bare(link.href)}
            </a>
          ))}
        </p>
      ) : null}
      <p className="rc-barcode" aria-hidden="true">
        {code128(project.name.toUpperCase())}
      </p>
      <p className="rc-thanks">Thank you · come again</p>
    </div>
  );
  return (
    <Thing
      kind="receipt"
      label={`${project.name}, receipt`}
      w={74}
      back={<ShowThrough note={<p className="rc-keep">Keep this receipt</p>}>{face}</ShowThrough>}
    >
      {face}
    </Thing>
  );
}

// A carbon form, typed in and stamped.
export function ApprovalForm({ project, index, owner }: ProjectThingProps) {
  const mark = statusMark(project.status);
  const stack = stackLine(project);
  const options: { label: string; on: boolean }[] = [
    { label: "Live", on: mark === "live" },
    { label: "In progress", on: mark === "building" },
    { label: "Retired", on: mark === "ended" },
    { label: mark === null || mark === "award" ? project.status || "Other" : "Other", on: mark === null || mark === "award" },
  ];
  const face = (
    <div className="fm">
      <header className="fm-head">
        <span className="fm-code">Form W·{pad(index + 1)}</span>
        <span className="fm-title">Request for approval</span>
        <span className="fm-copy">Original</span>
      </header>
      <div className="fm-grid">
        <div className="fm-field fm-wide">
          <span className="fm-label">Project</span>
          <span className="fm-typed fm-name">{project.name}</span>
        </div>
        {project.summary ? (
          <div className="fm-field fm-wide">
            <span className="fm-label">Summary</span>
            <span className="fm-typed">{project.summary}</span>
          </div>
        ) : null}
        {project.detail ? (
          <div className="fm-field fm-wide">
            <span className="fm-label">Detail</span>
            <span className="fm-typed fm-detail">{project.detail}</span>
          </div>
        ) : null}
        {stack.length ? (
          <div className="fm-field">
            <span className="fm-label">Built with</span>
            <span className="fm-typed">{stack.join(", ")}</span>
          </div>
        ) : null}
        <div className="fm-field">
          <span className="fm-label">Reference</span>
          <ProjectLinks project={project} className="fm-typed fm-links" />
        </div>
      </div>
      <div className="fm-status" aria-label={`Status: ${project.status}`}>
        <span className="fm-label">Status</span>
        {options.map((option) => (
          <span className="fm-option" key={option.label} data-on={option.on ? "" : undefined}>
            <span className="fm-box" aria-hidden="true" />
            {option.label}
          </span>
        ))}
      </div>
      <footer className="fm-sign">
        <span className="fm-label">Requested by</span>
        <Signature />
        <span className="fm-typed">{owner}</span>
      </footer>
    </div>
  );
  return (
    <Thing
      kind="form"
      label={`${project.name}, approval form`}
      w={124}
      back={<ShowThrough note={<p className="fm-back-note">Customer copy</p>}>{face}</ShowThrough>}
    >
      {face}
      <Stamp word={stampWord(project.status)} />
    </Thing>
  );
}

// Rubber stamp in red ink that took unevenly.
export function Stamp({ word, small }: { word: string; small?: boolean }) {
  return (
    <span className={`stamp${small ? " stamp-small" : ""}`} aria-hidden="true">
      <span>{word}</span>
    </span>
  );
}

function Signature() {
  return (
    <svg className="signature" viewBox="0 0 120 34" aria-hidden="true" focusable="false">
      <path d="M3 25c6-1 9-13 13-19 2-3 4-2 3 2-1 6-6 15-4 17 2 1 5-6 7-9 1 3 0 8 3 8 3 0 4-7 7-7 2 0 1 6 4 6 3 0 5-9 8-9 2 0 0 5 2 7 3 2 8-10 11-10s-1 9 2 10c4 1 6-8 9-8 2 0 1 5 3 6 4 1 9-6 13-7 4-1 6 1 9 0 5-2 9-6 14-6" />
      <path d="M30 29c18-2 40-3 62-4" />
    </svg>
  );
}

// A postcard: the writing side up, the picture on the back.
export function Postcard({ project, index, owner }: ProjectThingProps) {
  const stack = stackLine(project);
  const links = projectLinks(project);
  const gid = `pm-${index}`;
  return (
    <Thing
      kind="postcard"
      label={`${project.name}, postcard`}
      w={148}
      back={
        <div className="pc-front">
          <span className="pc-greetings">Greetings from</span>
          <span className="pc-big">{project.name}</span>
          <span className="pc-front-foot">
            <span>W·{pad(index + 1)}</span>
            <span>{project.status}</span>
          </span>
        </div>
      }
    >
      <div className="pc">
        <p className="pc-head" aria-hidden="true">
          Post card
        </p>
        <div className="pc-message">
          <h3 className="pc-name">{project.name}</h3>
          {project.summary ? <p className="pc-summary">{project.summary}</p> : null}
          {project.detail ? <p className="pc-detail">{project.detail}</p> : null}
          <p className="pc-sign">— {owner.split(" ")[0]}</p>
        </div>
        <div className="pc-address">
          <span className="pc-stamp" aria-hidden="true">
            <span className="pc-stamp-art">
              <span className="pc-stamp-letter">{project.name.slice(0, 1)}</span>
              <span className="pc-stamp-value">1¢</span>
            </span>
          </span>
          <svg className="pc-postmark" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
            <defs>
              <path id={gid} d="M 32 50 a 22 22 0 1 1 0.1 0" />
            </defs>
            <circle cx="32" cy="28" r="24" />
            <circle cx="32" cy="28" r="15.5" />
            <text className="pc-postmark-ring">
              <textPath href={`#${gid}`} startOffset="2">
                {`${project.name} · ${project.status} ·`.toUpperCase()}
              </textPath>
            </text>
            <text className="pc-postmark-date" x="32" y="31" textAnchor="middle">
              W·{pad(index + 1)}
            </text>
            <path d="M60 16c6 -4 10 4 16 0s10 4 16 0 10 4 16 0 M60 28c6 -4 10 4 16 0s10 4 16 0 10 4 16 0 M60 40c6 -4 10 4 16 0s10 4 16 0 10 4 16 0" />
          </svg>
          <ul className="pc-lines">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {bare(link.href)}
                </a>
              </li>
            ))}
            {stack.length ? <li>{stack.join(" · ")}</li> : null}
            <li>{project.status}</li>
          </ul>
        </div>
      </div>
    </Thing>
  );
}

// A measured drawing on graph paper, with a title block.
export function Drawing({ project, index, owner }: ProjectThingProps) {
  const stack = stackLine(project);
  return (
    <Thing
      kind="drawing"
      label={`${project.name}, drawing`}
      w={170}
      back={
        <div className="dw-back">
          <Stamp word={project.name} small />
        </div>
      }
    >
      <div className="dw">
        <FaceStudy />
        <div className="dw-side">
          <div className="dw-text">
            <h3 className="dw-name">{project.name}</h3>
            {project.summary ? <p className="dw-summary">{project.summary}</p> : null}
            {project.detail ? <p className="dw-detail">{project.detail}</p> : null}
          </div>
          <dl className="dw-block">
            <div className="dw-cell dw-cell-wide">
              <dt>Project</dt>
              <dd>{project.name}</dd>
            </div>
            <div className="dw-cell">
              <dt>Sheet</dt>
              <dd>W·{pad(index + 1)}</dd>
            </div>
            <div className="dw-cell">
              <dt>Status</dt>
              <dd>{project.status}</dd>
            </div>
            {stack.length ? (
              <div className="dw-cell dw-cell-wide">
                <dt>Built with</dt>
                <dd>{stack.join(" · ")}</dd>
              </div>
            ) : null}
            <div className="dw-cell">
              <dt>Drawn</dt>
              <dd>{initials(owner)}</dd>
            </div>
            <div className="dw-cell">
              <dt>Scale</dt>
              <dd>1 : 1</dd>
            </div>
            {projectLinks(project).length ? (
              <div className="dw-cell dw-cell-wide">
                <dt>Links</dt>
                <dd>
                  <ProjectLinks project={project} className="dw-links" />
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Thing>
  );
}

// A proportion study of a face: thirds, fifths, the golden section and the
// landmarks a vision model finds.
function FaceStudy() {
  const fifths = [24, 38.4, 52.8, 67.2, 81.6, 96];
  return (
    <svg className="dw-figure" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      <g className="dw-construct">
        <path d="M60 4V146" />
        {[22, 54, 86, 118].map((y) => (
          <path key={y} d={`M10 ${y}H110`} />
        ))}
        {fifths.map((x) => (
          <path key={x} d={`M${x} 60V72`} />
        ))}
        <circle cx="60" cy="70" r="49" />
      </g>
      <g className="dw-line">
        <path d="M60 18c-21 0-35 16-35 40 0 13 2 25 6 36 6 16 16 26 29 27 13-1 23-11 29-27 4-11 6-23 6-36 0-24-14-40-35-40Z" />
        <path d="M39 66c4-4 11-4 15 0-4 3-11 3-15 0Z" />
        <path d="M66 66c4-4 11-4 15 0-4 3-11 3-15 0Z" />
        <path d="M36 57c5-3 12-3 18-1M66 56c6-2 13-2 18 1" />
        <path d="M60 68v17c-2 2-5 3-7 2M60 85c2 2 5 3 7 2" />
        <path d="M50 100c6 3 14 3 20 0" />
      </g>
      <g className="dw-dims">
        <path d="M8 22V118M5 22h6M5 54h6M5 86h6M5 118h6" />
        <text x="3" y="40">⅓</text>
        <text x="3" y="72">⅓</text>
        <text x="3" y="104">⅓</text>
        <path d="M24 136H96M24 133v6M96 133v6" />
        <text x="60" y="144" textAnchor="middle">
          W 1.000
        </text>
        <path d="M114 54V118M111 54h6M111 118h6M114 85.6" />
        <text x="117" y="90" className="dw-phi">
          φ
        </text>
      </g>
      <g className="dw-points">
        {[
          [25, 70],
          [95, 70],
          [60, 121],
          [60, 22],
          [46.5, 66],
          [73.5, 66],
          [60, 85],
          [50, 100],
          [70, 100],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
        ))}
      </g>
    </svg>
  );
}

// An admission ticket with a stub to tear off.
export function Ticket({ project, index }: ProjectThingProps) {
  const stack = stackLine(project);
  const serial = pad(index + 1, 4);
  return (
    <div className="ticket" data-ticket="">
      <Thing kind="ticket" label={`${project.name}, ticket`} w={118} action="punch" data={{ joint: `ticket-${index}` }}>
        <div className="tk">
          <p className="tk-top">
            <span>Admit one</span>
            <span>No. {serial}</span>
          </p>
          <h3 className="tk-name">{project.name}</h3>
          {project.summary ? <p className="tk-summary">{project.summary}</p> : null}
          {project.detail ? <p className="tk-detail">{project.detail}</p> : null}
          <p className="tk-foot">
            <span className="tk-status">{project.status}</span>
            {stack.length ? <span>{stack.join(" · ")}</span> : null}
            <ProjectLinks project={project} className="tk-links" />
          </p>
          <span className="holes" aria-hidden="true" />
        </div>
      </Thing>
      <Thing kind="stub" label={`${project.name}, ticket stub`} w={34} action="none" data={{ stub: `ticket-${index}` }}>
        <div className="tk-stub">
          <span className="tk-stub-status">{project.status}</span>
          <span className="tk-stub-barcode" aria-hidden="true">
            {code128(serial)}
          </span>
          <span className="tk-stub-serial">No. {serial}</span>
        </div>
      </Thing>
    </div>
  );
}

// ---- experience ----------------------------------------------------------------

// A punch-clock time card: the period is stamped in by the clock, and a
// click punches the time it is now in Berkeley into the next empty row.
export function TimeCard({ entry, index, owner }: { entry: TimelineEntry; index: number; owner: string }) {
  const { start, end } = periodParts(entry.period);
  return (
    <Thing kind="timecard" label={`${entry.organization}, time card`} w={74} action="clock">
      <div className="tc">
        <header className="tc-head">
          <span className="tc-title">Time card</span>
          <span className="tc-no">E·{pad(index + 1)}</span>
        </header>
        <dl className="tc-fields">
          <div>
            <dt>Name</dt>
            <dd>{owner}</dd>
          </div>
          <div>
            <dt>Dept.</dt>
            <dd>
              <h3 className="tc-org">{entry.organization}</h3>
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{entry.role}</dd>
          </div>
        </dl>
        <div className="tc-clock" aria-label={`Period: ${entry.period}`}>
          <span className="tc-col">In</span>
          <span className="tc-col">Out</span>
          <span className="tc-punch">
            <span>{start}</span>
          </span>
          <span className="tc-punch">
            <span>{end || "—"}</span>
          </span>
          {Array.from({ length: 6 }, (_, cell) => (
            <span className="tc-empty" key={cell} aria-hidden="true" />
          ))}
        </div>
        {entry.summary ? <p className="tc-notes">{entry.summary}</p> : null}
      </div>
    </Thing>
  );
}

// ---- about ----------------------------------------------------------------

// A ruled index card of notes.
export function NotesCard({ paragraphs, interests, title }: { paragraphs: string[]; interests: string[]; title: string }) {
  return (
    <Thing kind="index" label="Notes, index card" w={112}>
      <div className="ix">
        <header className="ix-head">
          <span className="ix-no">A·01</span>
          <h3 className="ix-title">{title}</h3>
        </header>
        <div className="ix-body">
          {paragraphs.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
          {interests.length ? (
            <ol className="ix-list" aria-label="Interests">
              {interests.map((interest, index) => (
                <li key={`${interest}-${index}`}>
                  <span>{pad(index + 1)}</span>
                  {interest}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </Thing>
  );
}

// An envelope addressed to the owner; it is franked, then opens a new email.
export function Envelope({ profile }: { profile: PortfolioContent["profile"] }) {
  const email = profile.links.find((link) => link.href.startsWith("mailto:"))?.href ?? (profile.email ? `mailto:${profile.email}` : "");
  if (!email) return null;
  return (
    <Thing kind="envelope" label={`Write to ${profile.name}`} w={126} action="mail" data={{ href: email }}>
      <div className="ev">
        <span className="ev-from">
          From
          <span className="ev-blank" aria-hidden="true" />
        </span>
        <span className="ev-stamp" aria-hidden="true">
          <span>{initials(profile.name)}</span>
        </span>
        <span className="ev-to">
          <span className="ev-label">To</span>
          <a className="ev-name" href={email}>
            {profile.name}
          </a>
          <span>{bare(email)}</span>
          <span>{profile.location}</span>
        </span>
        <span className="ev-air" aria-hidden="true">
          Par avion
        </span>
        {/* the dater beside the stamp, its bars across it; the table fills
            in the sender's town, the hour and the date */}
        <svg className="ev-postmark" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
          <defs>
            <path id="ev-postmark-ring" d="M 32 50 a 22 22 0 1 1 0.1 0" />
          </defs>
          <circle cx="32" cy="28" r="24" />
          <circle cx="32" cy="28" r="15.5" />
          <text className="ev-postmark-ring">
            <textPath href="#ev-postmark-ring" startOffset="2" />
          </text>
          <text className="ev-postmark-day" x="32" y="28" textAnchor="middle" />
          <text className="ev-postmark-year" x="32" y="35" textAnchor="middle" />
          <path d="M60 16c6 -4 10 4 16 0s10 4 16 0 10 4 16 0 M60 28c6 -4 10 4 16 0s10 4 16 0 10 4 16 0 M60 40c6 -4 10 4 16 0s10 4 16 0 10 4 16 0" />
        </svg>
      </div>
    </Thing>
  );
}
