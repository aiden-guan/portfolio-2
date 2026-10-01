import { ExperienceIndex } from "@/components/experience-index";
import { ExternalLink } from "@/components/external-link";
import { IndexNavigation } from "@/components/index-navigation";
import { LocalTime } from "@/components/local-time";
import { PortfolioFrame } from "@/components/portfolio-frame";
import { ProjectIndex } from "@/components/project-index";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPortfolioContent } from "@/lib/portfolio-content";

export const revalidate = 3600;

export default async function Home() {
  const { about, interests, navigation, profile, projects, sections, timeline } =
    await getPortfolioContent();
  const paragraphs = about.paragraphs.filter((paragraph) => paragraph.length > 0);
  const visibleInterests = interests.filter((interest) => interest.length > 0);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <PortfolioFrame>
        <aside className="identity" aria-labelledby="site-title">
          <div className="identity-inner">
            <header>
              {profile.mark ? (
                <p className="identity-mark" aria-hidden="true">{profile.mark}</p>
              ) : null}
              <h1 id="site-title" aria-label={profile.name || "Portfolio"}>
                {profile.name}
              </h1>
              {profile.descriptor ? <p className="descriptor">{profile.descriptor}</p> : null}
              {profile.introduction ? (
                <p className="introduction">{profile.introduction}</p>
              ) : null}
            </header>

            <IndexNavigation navigation={navigation} />

            <div className="identity-footer">
              <nav className="social-links" aria-label="Contact and profiles">
                {profile.links
                  .filter((link) => link.label && link.href)
                  .map((link) => (
                    <ExternalLink key={link.href} href={link.href}>
                      {link.label}
                    </ExternalLink>
                  ))}
              </nav>
              <div className="utility-row">
                <LocalTime name={profile.name} location={profile.locationLabel} />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </aside>

        <main id="main-content" className="content" tabIndex={-1}>
          <section id="work" className="page-section" aria-labelledby="work-title">
            <div className="section-heading">
              <p>{sections.work.label}</p>
              <h2 id="work-title" aria-label={sections.work.title || "Work"}>
                {sections.work.title}
              </h2>
            </div>
            <ProjectIndex projects={projects} />
          </section>

          <section
            id="experience"
            className="page-section"
            aria-labelledby="experience-title"
          >
            <div className="section-heading">
              <p>{sections.experience.label}</p>
              <h2 id="experience-title" aria-label={sections.experience.title || "Experience"}>
                {sections.experience.title}
              </h2>
            </div>
            <ExperienceIndex timeline={timeline} />
          </section>

          <section id="about" className="page-section" aria-labelledby="about-title">
            <div className="section-heading">
              <p>{sections.about.label}</p>
              <h2 id="about-title" aria-label={sections.about.title || "About"}>
                {sections.about.title}
              </h2>
            </div>
            <div className="about-grid">
              <div className="about-copy">
                {paragraphs.map((paragraph, index) => (
                  <p key={`${paragraph}-${index}`}>{paragraph}</p>
                ))}
              </div>
              {visibleInterests.length > 0 ? (
                <ul className="interest-list" aria-label="Current interests">
                  {visibleInterests.map((interest, index) => (
                    <li key={`${interest}-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {interest}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <footer className="site-footer">
            <p className="copyright">
              © {new Date().getFullYear()} {profile.name}
            </p>
          </footer>
        </main>
      </PortfolioFrame>
    </>
  );
}
