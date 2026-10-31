"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { CheckIcon, LinkIcon, PlusIcon } from "./icons";
import { useFounder } from "./provider";
import styles from "./founder.module.css";

/** "+ Follow" that turns into "✓ Following". It opens nothing. */
export function FollowButton({ name }: { name: string }) {
  const [following, setFollowing] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.muted} ${styles.follow}`}
      aria-pressed={following}
      aria-label={following ? `Following ${name}` : `Follow ${name}`}
      onClick={() => setFollowing((value) => !value)}
    >
      {following ? <CheckIcon /> : <PlusIcon />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

export function CopyLinkButton() {
  const { copyProfileLink } = useFounder();
  return (
    <button type="button" className={styles.iconButton} aria-label="Copy profile link" onClick={copyProfileLink}>
      <LinkIcon size={20} strokeWidth={1.4} />
    </button>
  );
}

/** A link to a project in the Projects section, opening the list if it's folded away. */
export function ProjectLink({ slug, className, children }: { slug: string; className?: string; children: ReactNode }) {
  const { revealProject } = useFounder();
  return (
    <a
      className={className}
      href={`#project-${slug}`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        revealProject(slug);
      }}
    >
      {children}
    </a>
  );
}
