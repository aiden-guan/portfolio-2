import type { CSSProperties } from "react";
import type { Org } from "@/content/founder";
import type { WorldProject } from "@/content/worlds";
import { inkOn } from "./format";
import { BuildingGlyph, RecordGlyph } from "./icons";
import styles from "./logos.module.css";

type LogoStyle = CSSProperties & Record<`--${string}`, string>;

function markScale(mark: string) {
  if (mark.length <= 1) return "0.56";
  if (mark.length === 2) return "0.4";
  if (mark.length === 3) return "0.36";
  return "0.28";
}

/** A company or school logo: a monogram square. */
export function OrgLogo({ org, size = 48, className }: { org: Org; size?: number; className?: string }) {
  const style: LogoStyle = {
    "--logo-size": `${size}px`,
    "--logo-bg": org.bg,
    "--logo-fg": org.fg,
    "--logo-scale": markScale(org.mark ?? ""),
  };
  return (
    <span className={[styles.logo, className].filter(Boolean).join(" ")} style={style} data-serif={org.serif || undefined} aria-hidden="true">
      {org.icon === "building" ? (
        <BuildingGlyph className={styles.glyph} />
      ) : org.icon === "record" ? (
        <RecordGlyph className={styles.glyph} />
      ) : (
        <span className={styles.mark}>{org.mark}</span>
      )}
    </span>
  );
}

/** A project dressed as a company page: its initial on its colour. */
export function ProjectLogo({ project, size = 48, className }: { project: WorldProject; size?: number; className?: string }) {
  const style: LogoStyle = {
    "--logo-size": `${size}px`,
    "--logo-bg": project.accent,
    "--logo-fg": inkOn(project.accent),
    "--logo-scale": "0.5",
  };
  return (
    <span className={[styles.logo, styles.project, className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
      <span className={styles.mark}>{project.name.charAt(0).toUpperCase()}</span>
    </span>
  );
}

/** "Clocked" and the blue square: the site's own wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={[styles.wordmark, className].filter(Boolean).join(" ")}>
      <span>Clocked</span>
      <span className={styles.box}>
        <span>in</span>
      </span>
    </span>
  );
}
