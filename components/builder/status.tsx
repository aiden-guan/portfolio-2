import type { CSSProperties } from "react";
import type { Build } from "./types";
import styles from "./status.module.css";

// Where a build stands, as one small mark: green and breathing when it's
// live, half full while it's being built, a ring until it's out, grey once
// it's given away or sold. `phase` (s) keeps neighbouring pulses apart.
export function StatusMark({ status, phase = 0, className }: { status: Build["status"]; phase?: number; className?: string }) {
  return (
    <span
      className={[styles.mark, className].filter(Boolean).join(" ")}
      data-status={status}
      style={{ "--phase": `${-phase}s` } as CSSProperties}
      aria-hidden="true"
    />
  );
}
