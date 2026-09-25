import { Cabinet } from "@/components/cabinet";
import type { TimelineEntry } from "@/content/portfolio";

export function ExperienceIndex({ timeline }: { timeline: TimelineEntry[] }) {
  return (
    <ol className="timeline">
      {timeline.map((item, index) => (
        <li
          className="timeline-row"
          data-cabinet-id={`experience-${index}`}
          key={`${item.organization}-${item.role}`}
        >
          <article tabIndex={item.images.length > 0 ? 0 : undefined}>
            <div className="timeline-layout">
              <div className="timeline-organization">{item.organization}</div>
              <div className="timeline-body">
                <h3>{item.role}</h3>
                <p>{item.summary}</p>
              </div>
              <time>{item.period}</time>
            </div>
            <Cabinet images={item.images} label={item.organization} />
          </article>
        </li>
      ))}
    </ol>
  );
}
