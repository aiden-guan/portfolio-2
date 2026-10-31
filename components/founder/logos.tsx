import Image from "next/image";
import type { Org } from "@/content/founder";
import type { WorldProject } from "@/content/worlds";
import { BuildingGlyph } from "./icons";
import styles from "./logos.module.css";

function Square({ src, size, className }: { src: string; size: number; className?: string }) {
  return (
    <span className={[styles.logo, className].filter(Boolean).join(" ")} style={{ width: size, height: size }} aria-hidden="true">
      <Image src={src} alt="" width={size} height={size} />
    </span>
  );
}

/** A company or school logo; one without a logo gets the grey building, as on LinkedIn. */
export function OrgLogo({ org, size = 48, className }: { org: Org; size?: number; className?: string }) {
  if (org.logo) return <Square src={org.logo} size={size} className={className} />;
  return (
    <span className={[styles.logo, styles.blank, className].filter(Boolean).join(" ")} style={{ width: size, height: size }} aria-hidden="true">
      <BuildingGlyph className={styles.glyph} />
    </span>
  );
}

/** A project dressed as a company page: its own mark, from public/logos. */
export function ProjectLogo({ project, size = 48, className }: { project: WorldProject; size?: number; className?: string }) {
  return <Square src={`/logos/${project.slug}.webp`} size={size} className={className} />;
}

/** "Locked" and the blue square: the site's own wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={[styles.wordmark, className].filter(Boolean).join(" ")}>
      <span>Locked</span>
      <span className={styles.box}>
        <span>in</span>
      </span>
    </span>
  );
}
