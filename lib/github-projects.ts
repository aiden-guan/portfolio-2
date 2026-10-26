// The projects in the folder at the edge of the mat (components/mat/folder):
// Aiden's public GitHub repositories, most recently pushed first, fetched
// when the page is built and again at most once an hour. A repo can be given
// a short line of its own below; one that isn't gets GitHub's description,
// so a new repo turns up in the folder without anyone touching this file.
// Private repos never come back from the public API, so they never show.

export const GITHUB_USER = "aiden-guan";

const MAX_PROJECTS = 14;
const REVALIDATE_SECONDS = 3600;

export type GitProject = {
  repo: string;
  name: string;
  summary: string;
  detail: string;
  language: string;
  pushedAt: string;
  url: string;
  homepage: string;
  stars: number;
};

type Note = { name?: string; summary: string; detail?: string; homepage?: string };

// Lines written for the folder, by repo name (case doesn't matter).
const NOTES: Record<string, Note> = {
  courtvision: {
    name: "CourtVision",
    summary: "Live basketball stats from one camera.",
    detail: "Tracks players and the ball, keeps the box score, calls the game with Claude.",
  },
  ledger: {
    name: "LedgerLens",
    summary: "Finds the money leaking out of a small business.",
    detail: "Duplicate payments, eroding margins. Drafts the fix, owner approves.",
    homepage: "https://ledgerlens-mu.vercel.app",
  },
  seyrin: {
    name: "Seyrin",
    summary: "Inbox agent that does the work, then proves it.",
    detail: "Docs, bug fixes, code changes, checked in a browser. Kane CLI Hack Day SF.",
  },
  pigeonbox: {
    name: "PigeonBox",
    summary: "AI Powered Inbox - Open Tracking, Autodraft, all local.",
    detail: "Made to kill Superhuman + Mailsuite",
    homepage: "https://usepigeonbox.com",
  },
  agenthub: {
    name: "agenthub",
    summary: "Stops parallel AI coding agents overwriting each other.",
    detail: "File leases, enforced before every edit.",
  },
  continuity: {
    name: "Continuity",
    summary: "Long email threads, turned into state any agent can pick up.",
    detail: "Who owes what, what changed, with a source for each.",
  },
  startupsim: {
    name: "StartupSim",
    summary: "Management game: build an AI company.",
    detail: "Hire, ship, fight a rival for customers, don't run out of cash.",
    homepage: "https://startupsim.me",
  },
  notechneck: {
    name: "NoTechNeck",
    summary: "Webcam posture monitor. Runs locally.",
    detail: "Learns how you sit, flags it when you slouch.",
  },
  "github-repo-presenter": {
    name: "Repo Presenter",
    summary: "Turns rough repos into portfolio-ready ones.",
    detail: "Agent playbook plus audit scripts.",
  },
  riderelay: {
    name: "RewardRelay",
    summary: "Campus referral board.",
    detail: "Invite friends, earn points, boost your link.",
  },
  harmonylabs: {
    name: "HarmonyLabs",
    summary: "Facial Harmony Vision Model",
    homepage: "https://useharmonylabs.vercel.app/",
  },
  antiagent: {
    name: "AntiAgent",
    summary: "'Approved for Me' safety supervisor for Google Antigravity.",
  },
};

// Repos that aren't projects of their own: this site, and PigeonBox's
// marketing site.
const HIDDEN = new Set(["portfolio-2", "pigeonboxsite", GITHUB_USER]);

// What the folder holds if GitHub can't be reached: the public repos as they
// were on 26 October 2026.
const SNAPSHOT: Array<Pick<GitProject, "repo" | "language" | "pushedAt">> = [
  { repo: "courtvision", language: "Python", pushedAt: "2026-10-26T10:59:31Z" },
  { repo: "ledger", language: "TypeScript", pushedAt: "2026-10-25T11:29:25Z" },
  { repo: "seyrin", language: "TypeScript", pushedAt: "2026-10-24T23:34:26Z" },
  { repo: "pigeonbox", language: "TypeScript", pushedAt: "2026-10-24T23:34:24Z" },
  { repo: "agenthub", language: "TypeScript", pushedAt: "2026-10-23T01:22:50Z" },
  { repo: "continuity", language: "TypeScript", pushedAt: "2026-10-18T15:37:13Z" },
  { repo: "AntiAgent", language: "Python", pushedAt: "2026-10-07T23:46:32Z" },
  { repo: "StartupSim", language: "TypeScript", pushedAt: "2026-10-07T23:20:52Z" },
  { repo: "HarmonyLabs", language: "TypeScript", pushedAt: "2026-09-24T22:46:14Z" },
  { repo: "NoTechNeck", language: "TypeScript", pushedAt: "2026-09-24T05:57:28Z" },
  { repo: "github-repo-presenter", language: "Python", pushedAt: "2026-09-22T10:03:41Z" },
  { repo: "riderelay", language: "TypeScript", pushedAt: "2026-09-17T01:45:39Z" },
];

type Repo = {
  name: string;
  description: string | null;
  language: string | null;
  pushed_at: string;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  private: boolean;
};

function isRepo(value: unknown): value is Repo {
  if (typeof value !== "object" || value === null) return false;
  const repo = value as Record<string, unknown>;
  return typeof repo.name === "string" && typeof repo.pushed_at === "string" && typeof repo.html_url === "string";
}

// "my-cool-repo" → "My cool repo", for a repo nobody has written a line for.
function title(repo: string) {
  const words = repo.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function safeLink(href: string | null | undefined) {
  if (!href) return "";
  try {
    const url = new URL(href.includes("://") ? href : `https://${href}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function project(repo: string, fields: { description?: string | null; language?: string | null; pushedAt: string; homepage?: string | null; stars?: number }): GitProject {
  const note = NOTES[repo.toLowerCase()];
  const description = (fields.description ?? "").trim();
  return {
    repo,
    name: note?.name ?? title(repo),
    summary: note?.summary ?? (description.length > 90 ? `${description.slice(0, 88).trimEnd()}…` : description),
    detail: note?.detail ?? "",
    language: fields.language ?? "",
    pushedAt: fields.pushedAt,
    url: `https://github.com/${GITHUB_USER}/${repo}`,
    homepage: safeLink(fields.homepage) || safeLink(note?.homepage),
    stars: fields.stars ?? 0,
  };
}

function snapshot() {
  return SNAPSHOT.map((repo) => project(repo.repo, repo));
}

export async function getGitHubProjects(): Promise<{ projects: GitProject[]; live: boolean; checkedAt: number }> {
  const checkedAt = Date.now();
  // Optional, but worth setting: without a token GitHub allows 60 requests
  // an hour per address, and a server's address is shared with others. A
  // fine-grained token with no permissions at all is enough to read public
  // repos.
  const token = process.env.GITHUB_TOKEN;
  const ask = (auth: boolean) =>
    fetch(`https://api.github.com/users/${GITHUB_USER}/repos?type=owner&sort=pushed&per_page=100`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });

  try {
    let response = await ask(true);
    // a token that has expired or been revoked: ask again without it
    if (response.status === 401 && token) response = await ask(false);
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("GitHub sent something that isn't a list");

    const projects = body
      .filter(isRepo)
      .filter((repo) => !repo.fork && !repo.archived && !repo.private && !HIDDEN.has(repo.name.toLowerCase()))
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
      .slice(0, MAX_PROJECTS)
      .map((repo) =>
        project(repo.name, {
          description: repo.description,
          language: repo.language,
          pushedAt: repo.pushed_at,
          homepage: repo.homepage,
          stars: repo.stargazers_count,
        }),
      );
    return projects.length ? { projects, live: true, checkedAt } : { projects: snapshot(), live: false, checkedAt };
  } catch (error) {
    console.warn("Projects folder: showing the snapshot,", error instanceof Error ? error.message : error);
    return { projects: snapshot(), live: false, checkedAt };
  }
}
