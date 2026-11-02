/** Where the identity page's visitor count is kept in R2: the real one, and
 * the one anywhere but production counts into. Media cleanup leaves both. */
export const EGOIST_KEYS = { production: "portfolio/egoists.json", elsewhere: "portfolio/egoists.dev.json" } as const;
