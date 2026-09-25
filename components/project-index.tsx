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
          key={project.name}
        >
          <article tabIndex={project.images.length > 0 ? 0 : undefined}>
            <header className="project-heading">
              <span className="project-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{project.name}</h3>
              <span className="project-status">{project.status}</span>
            </header>
            <div className="project-body">
              <p className="project-summary">{project.summary}</p>
              <p className="project-detail">{project.detail}</p>
              <div className="project-meta">
                <span>{project.stack.join(" · ")}</span>
                <span className="project-links" aria-label={`${project.name} links`}>
                  {project.links.map((link) => (
                    <ExternalLink key={link.href} href={link.href}>
                      {link.label}
                    </ExternalLink>
                  ))}
                </span>
              </div>
            </div>
            <Cabinet images={project.images} label={project.name} />
          </article>
        </li>
      ))}
    </ol>
  );
}
