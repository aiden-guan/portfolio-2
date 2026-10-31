import Image from "next/image";
import {
  AD,
  ANALYTICS,
  BUILDING,
  COUNTS,
  EDUCATION,
  ENDORSEMENTS,
  EXPERIENCE,
  FEATURED,
  HONORS,
  IMAGES,
  NOTIFICATIONS,
  ORGS,
  PAGES,
  POSTS,
  PROFILE,
  SKILLS,
  type Experience,
} from "@/content/founder";
import { PROJECTS, ROLES, projectImage } from "@/content/worlds";
import { Activity } from "./activity";
import { CopyLinkButton, FollowButton, ProjectLink } from "./buttons";
import { Carousel } from "./carousel";
import {
  domainOf,
  durationLabel,
  joinNames,
  monthLabel,
  project,
  projectLink,
  projectsUsing,
  skillSummary,
  stackOf,
  thisMonth,
} from "./format";
import {
  ArrowRightIcon,
  CodeIcon,
  DiamondIcon,
  EllipsisIcon,
  EyeIcon,
  LayersIcon,
  ShieldIcon,
  TrendIcon,
  TrophyIcon,
} from "./icons";
import { OrgLogo, ProjectLogo, Wordmark } from "./logos";
import { MediaRow } from "./media-row";
import { MessagingDock } from "./messaging-dock";
import { ContactInfo, ProfileActions } from "./profile-actions";
import { Projects, Skills } from "./projects";
import { FounderProvider } from "./provider";
import { SeeMore } from "./see-more";
import { TopNav } from "./top-nav";
import styles from "./founder.module.css";

export const PAGE_TITLE = "Aiden Guan | ClockedIn";

/** ClockedIn: Aiden's experience, laid out as a LinkedIn profile. */
export function FounderProfile() {
  const now = thisMonth();

  return (
    <div className={styles.root} data-world="founder">
      <FounderProvider>
        <a className={styles.skip} href="#main">
          Skip to main content
        </a>
        <TopNav
          name={PROFILE.name}
          headline={PROFILE.headline}
          photo={PROFILE.photo}
          projects={PROJECTS.map(({ slug, name, line, event, stack }) => ({ slug, name, line, event, stack }))}
          notifications={NOTIFICATIONS}
          roles={ROLES}
          current="founder"
          title={PAGE_TITLE}
        />
        <div className={styles.page}>
          <main id="main" className={styles.main} tabIndex={-1}>
            <TopCard />
            <AnalyticsCard />
            <AboutCard />
            <FeaturedCard />
            <section className={styles.card} id="activity" aria-labelledby="activity-title">
              <div className={styles.sectionHead}>
                <h2 id="activity-title" className={styles.sectionTitle}>
                  Activity
                </h2>
              </div>
              <Activity
                posts={POSTS}
                images={IMAGES}
                author={{ name: PROFILE.name, first: PROFILE.first, headline: PROFILE.headline, photo: PROFILE.photo }}
              />
            </section>
            <ExperienceCard now={now} />
            <EducationCard />
            <section className={styles.card} id="projects" aria-labelledby="projects-title">
              <div className={styles.sectionHead}>
                <h2 id="projects-title" className={styles.sectionTitle}>
                  Projects
                </h2>
              </div>
              <Projects projects={PROJECTS} />
            </section>
            <HonorsCard />
            <section className={styles.card} id="skills" aria-labelledby="skills-title">
              <div className={styles.sectionHead}>
                <h2 id="skills-title" className={styles.sectionTitle}>
                  Skills
                </h2>
              </div>
              <Skills
                skills={SKILLS.map((name) => ({
                  name,
                  projects: projectsUsing(name).map(({ slug, name: projectName }) => ({ slug, name: projectName })),
                  endorsement: ENDORSEMENTS[name],
                }))}
              />
            </section>
          </main>
          <Aside year={now.year} />
        </div>
        <MessagingDock name={PROFILE.name} photo={PROFILE.photo} email={PROFILE.email} subject="Hello from ClockedIn" />
      </FounderProvider>
    </div>
  );
}

/* The top card */

function BuildingRing() {
  return (
    <svg className={styles.ring} viewBox="0 0 152 152" aria-hidden="true" focusable="false">
      <defs>
        <path id="founder-building-arc" d="M10.69 52.23A69.5 69.5 0 0 0 99.77 141.31" />
      </defs>
      <path
        fill="#4a9a4f"
        fillRule="evenodd"
        d="M0 76a76 76 0 1 0 152 0A76 76 0 1 0 0 76zm18.78-7.78a65 65 0 1 0 130 0 65 65 0 1 0-130 0z"
      />
      <text className={styles.ringText}>
        <textPath href="#founder-building-arc" startOffset="50%" textAnchor="middle">
          #BUILDING
        </textPath>
      </text>
    </svg>
  );
}

function TopCard() {
  const building = BUILDING.projects.map((slug) => project(slug).name);
  return (
    <section className={`${styles.card} ${styles.topCard}`} id="top" aria-label={`${PROFILE.name}’s profile`}>
      <div className={styles.banner} />
      <div className={styles.topBody}>
        <div className={styles.photoFrame}>
          <Image
            className={styles.photo}
            src={PROFILE.photo}
            alt={PROFILE.name}
            width={152}
            height={152}
            loading="eager"
            fetchPriority="high"
          />
          <BuildingRing />
        </div>
        <div className={styles.intro}>
          <div className={styles.introMain}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{PROFILE.name}</h1>
              <span className={styles.verified} role="img" aria-label="Verified">
                <ShieldIcon size={20} />
              </span>
            </div>
            <p className={styles.headline}>{PROFILE.headline}</p>
            <div className={styles.location}>
              {PROFILE.location}
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <ContactInfo
                name={PROFILE.name}
                first={PROFILE.first}
                email={PROFILE.email}
                github={PROFILE.github}
                linkedin={PROFILE.linkedin}
                site={PROFILE.site}
              />
            </div>
            <p className={styles.counts}>
              <a className={styles.countLink} href="#projects">
                <strong>{COUNTS.projects}</strong> projects
              </a>
              <span aria-hidden="true"> · </span>
              <a className={styles.countLink} href="#honors">
                <strong>{COUNTS.firstPlaces}</strong> first places
              </a>
            </p>
          </div>
          <ul className={styles.chips} aria-label="Current company and education">
            {PROFILE.chips.map((chip) => (
              <li key={chip.org}>
                <a className={styles.chip} href={`#${chip.target}`}>
                  <OrgLogo org={ORGS[chip.org]} size={32} />
                  <span>{ORGS[chip.org].name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <ProfileActions linkedin={PROFILE.linkedin} github={PROFILE.github} />
        <div className={styles.openTo}>
          <p className={styles.openToTitle}>{BUILDING.title}</p>
          <p className={styles.openToText}>{joinNames(building)}</p>
          <a className={styles.link} href={BUILDING.href}>
            {BUILDING.cta}
          </a>
        </div>
      </div>
    </section>
  );
}

/* Analytics, About, Featured */

const STAT_ICONS = { trend: TrendIcon, trophy: TrophyIcon, stack: LayersIcon };

function AnalyticsCard() {
  return (
    <section className={styles.card} id="analytics" aria-labelledby="analytics-title">
      <div className={styles.sectionHead}>
        <h2 id="analytics-title" className={styles.sectionTitle}>
          Analytics
        </h2>
        <p className={styles.privateNote}>
          <EyeIcon />
          Private to you
        </p>
      </div>
      <ul className={styles.stats}>
        {ANALYTICS.map((stat) => {
          const Icon = STAT_ICONS[stat.icon];
          return (
            <li key={stat.label} className={styles.stat}>
              <Icon className={styles.statIcon} />
              <div>
                <a className={styles.statValue} href={stat.href}>
                  {stat.value} {stat.label}
                </a>
                <p className={styles.statCaption}>{stat.caption}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AboutCard() {
  return (
    <section className={styles.card} id="about" aria-labelledby="about-title">
      <div className={styles.sectionHead}>
        <h2 id="about-title" className={styles.sectionTitle}>
          About
        </h2>
      </div>
      <div className={styles.sectionBody}>
        <SeeMore className={styles.aboutText} text={PROFILE.about} lines={4} />
        <a className={styles.topSkills} href="#skills">
          <DiamondIcon size={24} className={styles.topSkillsIcon} />
          <span className={styles.topSkillsText}>
            <span className={styles.topSkillsTitle}>Top skills</span>
            <span>{SKILLS.slice(0, 5).join(" • ")}</span>
          </span>
          <ArrowRightIcon size={24} strokeWidth={1.3} className={styles.topSkillsArrow} />
        </a>
      </div>
    </section>
  );
}

function FeaturedCard() {
  return (
    <section className={styles.card} id="featured" aria-labelledby="featured-title">
      <div className={styles.sectionHead}>
        <h2 id="featured-title" className={styles.sectionTitle}>
          Featured
        </h2>
      </div>
      <div className={styles.sectionBody}>
        <Carousel label="Featured">
          {FEATURED.map((item) => {
            const featured = project(item.project);
            const href = (item.link === "live" ? featured.live : featured.source) ?? projectLink(featured) ?? "#projects";
            return (
              <li key={item.project} className={styles.featuredItem}>
                <a className={styles.featured} href={href} target="_blank" rel="noopener noreferrer">
                  <span className={styles.featuredKind}>Link</span>
                  <span className={styles.featuredMedia}>
                    <Image
                      className={styles.featuredImg}
                      src={projectImage(featured.slug, "sm")}
                      alt=""
                      width={592}
                      height={310}
                      sizes="(max-width: 767px) 78vw, 296px"
                    />
                  </span>
                  <span className={styles.featuredBody}>
                    <span className={styles.featuredTitle}>{featured.name}</span>
                    <span className={styles.featuredLine}>{featured.line}</span>
                    <span className={styles.featuredDomain}>{domainOf(href)}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </Carousel>
      </div>
    </section>
  );
}

/* Experience, Education, Honors */

function experienceDates(entry: Experience, now: { year: number; month: number }) {
  if (!entry.start) return entry.when ?? "";
  const until = !entry.current && entry.end ? entry.end : null;
  const [year, month] = (until ?? "").split("-").map(Number);
  const to = until ? { year, month: month || 12 } : now;
  return `${monthLabel(entry.start)} – ${until ? monthLabel(until) : "Present"} · ${durationLabel(entry.start, to)}`;
}

function ExperienceCard({ now }: { now: { year: number; month: number } }) {
  return (
    <section className={styles.card} id="experience" aria-labelledby="experience-title">
      <div className={styles.sectionHead}>
        <h2 id="experience-title" className={styles.sectionTitle}>
          Experience
        </h2>
      </div>
      <ul className={styles.list}>
        {EXPERIENCE.map((entry) => {
          const org = ORGS[entry.org];
          const skills = entry.skills ?? stackOf(entry.media ?? []);
          return (
            <li key={entry.org} id={`experience-${entry.org}`} className={styles.entry}>
              {org.href ? (
                <a className={styles.entryLogo} href={org.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
                  <OrgLogo org={org} />
                </a>
              ) : (
                <OrgLogo org={org} className={styles.entryLogo} />
              )}
              <div className={styles.entryBody}>
                <h3 className={styles.entryTitle}>{entry.title}</h3>
                <p className={styles.entryLine}>
                  {org.href ? (
                    <a className={styles.quietLink} href={org.href} target="_blank" rel="noopener noreferrer">
                      {org.name}
                    </a>
                  ) : (
                    org.name
                  )}
                  {entry.kind ? ` · ${entry.kind}` : null}
                </p>
                <p className={styles.entryMeta}>{experienceDates(entry, now)}</p>
                {entry.location ? <p className={styles.entryMeta}>{entry.location}</p> : null}
                <SeeMore className={styles.entryText} text={entry.description} lines={3} />
                {skills.length ? (
                  <p className={styles.skillsLine}>
                    <DiamondIcon />
                    <strong>{skillSummary(skills)}</strong>
                  </p>
                ) : null}
                {entry.media?.length || entry.link ? (
                  <div className={styles.mediaGrid}>
                    {entry.media?.map((slug) => {
                      const item = project(slug);
                      return <MediaRow key={slug} project={item} title={item.name} subtitle={item.line} href={projectLink(item)} />;
                    })}
                    {entry.link ? (
                      <a className={styles.mediaRow} href={entry.link.href} target="_blank" rel="noopener noreferrer">
                        <span className={styles.linkThumb}>
                          <CodeIcon />
                        </span>
                        <span className={styles.mediaText}>
                          <span className={styles.mediaTitle}>{entry.link.title}</span>
                          <span className={styles.mediaSub}>{domainOf(entry.link.href).split("/")[0]}</span>
                        </span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EducationCard() {
  return (
    <section className={styles.card} id="education" aria-labelledby="education-title">
      <div className={styles.sectionHead}>
        <h2 id="education-title" className={styles.sectionTitle}>
          Education
        </h2>
      </div>
      <ul className={styles.list}>
        {EDUCATION.map((school) => (
          <li key={school.school} className={styles.entry}>
            <OrgLogo org={ORGS[school.org]} className={styles.entryLogo} />
            <div className={styles.entryBody}>
              <h3 className={styles.entryTitle}>{school.school}</h3>
              <p className={styles.entryLine}>{school.degree}</p>
              <p className={styles.entryMeta}>{school.years}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HonorsCard() {
  return (
    <section className={styles.card} id="honors" aria-labelledby="honors-title">
      <div className={styles.sectionHead}>
        <h2 id="honors-title" className={styles.sectionTitle}>
          Honors &amp; awards
        </h2>
      </div>
      <ul className={styles.list}>
        {HONORS.map((honor) => {
          const item = project(honor.project);
          return (
            <li key={honor.issuer} className={styles.entry}>
              <OrgLogo org={ORGS[honor.org]} className={styles.entryLogo} />
              <div className={styles.entryBody}>
                <h3 className={styles.entryTitle}>{honor.title}</h3>
                <p className={styles.entryMeta}>
                  Issued by {honor.issuer} · {monthLabel(honor.date)}
                </p>
                <p className={styles.associated}>
                  <ProjectLogo project={item} size={16} />
                  <span>
                    Associated with{" "}
                    <ProjectLink slug={item.slug} className={styles.quietLink}>
                      {item.name}
                    </ProjectLink>
                  </span>
                </p>
                <p className={styles.entryText}>
                  {item.line}
                  {honor.note ? ` ${honor.note}` : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* The right rail */

function Aside({ year }: { year: number }) {
  const advertised = project(AD.project);
  return (
    <aside className={styles.aside} aria-label="More from this profile">
      <section className={`${styles.card} ${styles.asideCard}`} aria-label="Profile settings">
        <div className={styles.prefRow}>
          <div>
            <h2 className={styles.asideTitle}>Profile language</h2>
            <p className={styles.asideMeta}>{PROFILE.language}</p>
          </div>
        </div>
        <div className={styles.prefRow}>
          <div>
            <h2 className={styles.asideTitle}>Public profile &amp; URL</h2>
            <p className={styles.asideMeta}>{PROFILE.publicUrl}</p>
          </div>
          <CopyLinkButton />
        </div>
      </section>

      <div className={styles.asideSticky}>
        <section className={`${styles.card} ${styles.ad}`} aria-label="Promoted">
          <p className={styles.adHead}>
            Ad <EllipsisIcon size={16} />
          </p>
          <div className={styles.adFaces}>
            <Image className={styles.adAvatar} src={PROFILE.photo} alt="" width={56} height={56} />
            <ProjectLogo project={advertised} size={56} className={styles.adLogo} />
          </div>
          <p className={styles.adText}>{AD.text}</p>
          <a className={`${styles.btn} ${styles.secondary}`} href={AD.href} target="_blank" rel="noopener noreferrer">
            {AD.cta}
          </a>
        </section>

        <section className={`${styles.card} ${styles.pagesCard}`} id="pages" aria-labelledby="pages-title">
          <h2 id="pages-title" className={styles.asideHeading}>
            Pages you may like
          </h2>
          <p className={styles.asideSub}>Built by {PROFILE.first}</p>
          <ul className={styles.pageList}>
            {PAGES.map((slug) => {
              const page = project(slug);
              return (
                <li key={slug} className={styles.pageItem}>
                  <ProjectLogo project={page} size={48} />
                  <div className={styles.pageBody}>
                    <h3 className={styles.pageName}>
                      <ProjectLink slug={slug} className={styles.quietLink}>
                        {page.name}
                      </ProjectLink>
                    </h3>
                    <p className={styles.pageLine}>{page.line}</p>
                    <FollowButton name={page.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className={styles.footerNote}>
          <ul className={styles.footerLinks}>
            <li>
              <a href={PROFILE.github} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
            <li>
              <a href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </li>
            <li>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, on purpose */}
              <a href="/">Start over</a>
            </li>
          </ul>
          <p className={styles.copyright}>
            <Wordmark className={styles.footerMark} />
            <span>ClockedIn Corporation © {year}</span>
          </p>
          <p className={styles.parody}>A parody. Not affiliated with LinkedIn.</p>
        </footer>
      </div>
    </aside>
  );
}
