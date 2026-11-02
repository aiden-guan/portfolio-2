import styles from "./play.module.css";

// The game's wordmark: AIDEN in chunky pixels on an ink outline, with the
// rest of the title on a cobalt ribbon and a glint where the light catches.
export function Logo({ size = "lg", className }: { size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  return (
    <div className={[styles.logo, className].filter(Boolean).join(" ")} data-size={size} role="img" aria-label="Aiden: Life of a Handsome Entrepreneur">
      <span className={styles.logoWord} data-text="AIDEN" aria-hidden="true">
        AIDEN
        <span className={styles.logoGlint} />
      </span>
      <span className={styles.logoRibbon} aria-hidden="true">
        Life of a Handsome Entrepreneur
      </span>
    </div>
  );
}
