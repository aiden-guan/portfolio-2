import type { WorldProject } from "@/content/worlds";

// A project as /builder shows it: the facts from content/worlds, and when its
// GitHub repo was last pushed to, when it's one of Aiden's and GitHub answered.
export type Build = WorldProject & { pushedAt: string | null };
