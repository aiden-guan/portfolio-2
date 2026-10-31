import Image from "next/image";
import { projectImage, type WorldProject } from "@/content/worlds";
import styles from "./founder.module.css";

/** A LinkedIn attachment: thumbnail, a title, a line under it. */
export function MediaRow({
  project,
  title,
  subtitle,
  href,
}: {
  project: WorldProject;
  title: string;
  subtitle: string;
  href?: string;
}) {
  const inner = (
    <>
      <Image className={styles.mediaThumb} src={projectImage(project.slug, "sm")} alt="" width={128} height={72} />
      <span className={styles.mediaText}>
        <span className={styles.mediaTitle}>{title}</span>
        <span className={styles.mediaSub}>{subtitle}</span>
      </span>
    </>
  );
  return href ? (
    <a className={styles.mediaRow} href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className={styles.mediaRow}>{inner}</div>
  );
}
