import { Cabinet } from "@/components/cabinet";
import { ExternalLink } from "@/components/external-link";
import type { Project } from "@/content/portfolio";

export function ProjectIndex({ projects }: { projects: Project[] }) {
  return (
    <ol className="project-index">
      {projects.map((project, index) => (
        <li
          className="project-row"
          data-cabinet-id={`work-${index}`}
          key={`${project.name}-${index}`}
        >
          <article tabIndex={project.images.length > 0 ? 0 : undefined}>
            <header className="project-heading">
              <span className="project-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{project.name}</h3>
              {project.status ? <span className="project-status">{project.status}</span> : null}
            </header>
            {project.summary ||
            project.detail ||
            project.stack.some((item) => item.length > 0) ||
            project.links.some((link) => link.href.length > 0) ? (
              <div className="project-body">
                {project.summary || project.detail ? (
                  <>
                    <p className="project-summary">{project.summary}</p>
                    <p className="project-detail">{project.detail}</p>
                  </>
                ) : null}
                {project.stack.some((item) => item.length > 0) ||
                project.links.some((link) => link.href.length > 0) ? (
                  <div className="project-meta">
                    {project.stack.some((item) => item.length > 0) ? (
                      <span>{project.stack.filter((item) => item.length > 0).join(" · ")}</span>
                    ) : null}
                    {project.links.some((link) => link.href.length > 0) ? (
                      <span
                        className="project-links"
                        aria-label={project.name ? `${project.name} links` : "Project links"}
                      >
                        {project.links
                          .filter((link) => link.href.length > 0)
                          .map((link) => (
                            <ExternalLink key={link.href} href={link.href}>
                              {link.label}
                            </ExternalLink>
                          ))}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Cabinet images={project.images} label={project.name} />
          </article>
        </li>
      ))}
    </ol>
  );
}
