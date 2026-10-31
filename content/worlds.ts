// The projects and facts the founder, builder and designer pages are made
// from. The mat at /student keeps its own content in the editor; this file is
// the one to change for everything else. Images live in public/projects, as
// <slug>.webp (1600 wide) and <slug>-sm.webp (800 wide).

export type Role = "founder" | "student" | "builder" | "designer";

export const ROLES: Role[] = ["founder", "student", "builder", "designer"];

export type WorldProject = {
  slug: string;
  name: string;
  /** One line: what it is. */
  line: string;
  /** Two or three sentences: what it does. */
  about: string;
  /** "2026-10", or null when it predates the rest. */
  date: string | null;
  status: "Live" | "In progress" | "Prototype" | "Open source" | "Exited" | "Waitlist";
  award?: string;
  event?: string;
  stack: string[];
  live?: string;
  source?: string;
  /** Brand colour, for small accents. */
  accent: string;
  /** Whether the thumbnail is mostly dark, so text over it can adapt. */
  tone: "light" | "dark";
  /** Extra images after the thumbnail, by file name in public/projects. */
  gallery?: string[];
};

export const PROJECTS: WorldProject[] = [
  {
    slug: "ledgerlens",
    name: "LedgerLens",
    line: "Finds the money leaking out of a small business.",
    about:
      "Reads a store’s bank feed, sales and supplier costs, then catches duplicate payments, price creep and slipping margins. Rules do the math in integer cents; the model only explains. Nothing moves without the owner’s approval.",
    date: "2026-10",
    status: "Live",
    event: "Cal Hacks 13.0",
    stack: ["Next.js", "Convex", "Claude", "Apify"],
    live: "https://ledgerlens-mu.vercel.app",
    source: "https://github.com/aiden-guan/ledger",
    accent: "#2f6be8",
    tone: "light",
    gallery: ["ledgerlens-hero", "ledgerlens-leak", "ledgerlens-koi"],
  },
  {
    slug: "continuity",
    name: "Continuity",
    line: "Email memory that survives an agent handoff.",
    about:
      "Turns long email threads into cited task state: current terms, replaced terms, open commitments and who has to act next. A fresh agent makes one call instead of rereading the thread.",
    date: "2026-10",
    status: "Open source",
    award: "1st place, Primitive.dev track",
    event: "YC Make Something Agents Want",
    stack: ["TypeScript", "Primitive", "MCP"],
    source: "https://github.com/aiden-guan/continuity",
    accent: "#d74718",
    tone: "light",
  },
  {
    slug: "seyrin",
    name: "Seyrin",
    line: "An inbox agent that does the work, then proves it.",
    about:
      "Writes documents, reproduces bugs and makes approved code changes straight from an email, then has Kane CLI check the result in a real browser before it drafts the reply.",
    date: "2026-10",
    status: "Prototype",
    event: "Kane CLI Hack Day SF",
    stack: ["React", "Kane CLI", "OpenAI"],
    source: "https://github.com/aiden-guan/seyrin",
    accent: "#5b4fd6",
    tone: "light",
    gallery: ["seyrin-doc"],
  },
  {
    slug: "rally",
    name: "Rally",
    line: "Table tennis with your phone as the paddle.",
    about:
      "Your phone is the paddle and your computer is the court. You choose when to swing, how hard, and whether to brush, drive or chop, against the house, a friend on the same screen, or anyone online.",
    date: "2026-10",
    status: "Live",
    stack: ["Three.js", "WebRTC", "Convex", "Motion sensors"],
    live: "https://rally-gamma-gold.vercel.app",
    accent: "#2f6fe4",
    tone: "dark",
  },
  {
    slug: "alai",
    name: "alai",
    line: "A voice-first AI tutor for STEM homework.",
    about:
      "Students work by hand on an iPad. When they pause after a wrong step, alai underlines it and nudges them out loud, without giving the answer away.",
    date: "2026-10",
    status: "Waitlist",
    award: "1st place, Best Use of Keewano",
    event: "a16z SpeedHacks",
    stack: ["Next.js", "Convex", "Claude", "Apple Pencil"],
    live: "https://tryalai.app",
    accent: "#ffd23f",
    tone: "light",
  },
  {
    slug: "courtvision",
    name: "CourtVision",
    line: "Live basketball stats from one camera.",
    about:
      "Tracks every player and the ball from a single camera, keeps the box score as the game happens, and calls the play-by-play with Claude.",
    date: "2026-10",
    status: "Live",
    stack: ["Python", "Computer vision", "Claude"],
    source: "https://github.com/aiden-guan/courtvision",
    accent: "#f08a32",
    tone: "dark",
  },
  {
    slug: "pigeonbox",
    name: "PigeonBox",
    line: "An AI inbox that runs on your own computer.",
    about:
      "Sorts Gmail, briefs every thread and prepares replies from a workspace inside your inbox. Free and open source, with no account and no hosted service.",
    date: "2026-10",
    status: "In progress",
    stack: ["TypeScript", "Chrome extension", "Convex"],
    live: "https://usepigeonbox.com",
    source: "https://github.com/aiden-guan/pigeonbox",
    accent: "#3f6f9f",
    tone: "light",
    gallery: ["pigeonbox-app"],
  },
  {
    slug: "inroad",
    name: "Inroad",
    line: "An AI head of GTM for founder-led sales.",
    about:
      "Finds who to talk to and why now, drafts every touch with sources you can check, and preps every call.",
    date: "2026-10",
    status: "In progress",
    stack: ["Next.js", "Claude", "MapLibre"],
    source: "https://github.com/aiden-guan/inroad",
    accent: "#3b82f6",
    tone: "dark",
  },
  {
    slug: "agenthub",
    name: "agenthub",
    line: "Stops parallel coding agents overwriting each other.",
    about:
      "Each agent works in its own git worktree while a shared hub tracks who is editing what and enforces file leases before every edit.",
    date: "2026-10",
    status: "Open source",
    stack: ["TypeScript", "SQLite", "Git worktrees"],
    source: "https://github.com/aiden-guan/agenthub",
    accent: "#22c55e",
    tone: "dark",
  },
  {
    slug: "antiagent",
    name: "AntiAgent",
    line: "An “Approved for Me” safety supervisor for Google Antigravity.",
    about:
      "A supervisor subagent in Antigravity’s PreToolUse hook that approves or stops each action, with auto-PRs and CI monitoring on top.",
    date: "2026-10",
    status: "Open source",
    stack: ["Python"],
    source: "https://github.com/aiden-guan/AntiAgent",
    accent: "#a3a3a3",
    tone: "dark",
  },
  {
    slug: "startupsim",
    name: "StartupSim",
    line: "A management game about building an AI company.",
    about:
      "Hire, ship products, fight a rival for customers and keep the cash from running out as the office grows.",
    date: "2026-10",
    status: "Live",
    stack: ["React Three Fiber", "Convex", "Zustand"],
    live: "https://startupsim.me",
    source: "https://github.com/aiden-guan/StartupSim",
    accent: "#e2783d",
    tone: "light",
  },
  {
    slug: "barkoff",
    name: "BarkOff",
    line: "A live one-on-one bark battle.",
    about: "Two players, two webcams, one question: who barks best? Built with friends in a night.",
    date: "2026-08",
    status: "Prototype",
    award: "1st place",
    event: "SpaceXAI Build Night",
    stack: ["React", "Web Audio", "Computer vision"],
    source: "https://github.com/dylann4500/corgi",
    accent: "#6b4de6",
    tone: "light",
  },
  {
    slug: "agnotify",
    name: "AGNotify",
    line: "A sneaker-reselling cook group.",
    about:
      "Release alerts, consignment and a members’ group chat. Started with $500, grew to $45k in revenue, then exited.",
    date: null,
    status: "Exited",
    stack: ["Whop", "Discord"],
    accent: "#f5a524",
    tone: "dark",
  },
];

export function findProject(slug: string) {
  return PROJECTS.find((project) => project.slug === slug);
}

export function projectImage(slug: string, size: "lg" | "sm" = "lg") {
  return `/projects/${slug}${size === "sm" ? "-sm" : ""}.webp`;
}

// "2026-10" → "Oct 2026"
export function formatMonth(date: string | null) {
  if (!date) return "Earlier";
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const PERSON = {
  name: "Aiden Guan",
  first: "Aiden",
  photo: "/aiden-face.jpg",
  school: "UC Berkeley",
  program: "Business Administration + Data Science",
  location: "Berkeley, California",
  email: "aidenguan@berkeley.edu",
  github: "https://github.com/aiden-guan",
  linkedin: "https://www.linkedin.com/in/aidenguan",
};

// Photos from the clothesline on the mat, for posts and features.
export const MOMENTS = {
  yc: {
    src: "/projects/moment-yc.webp",
    alt: "The team on the steps after Y Combinator’s Make Something Agents Want",
    caption: "Y Combinator Make Something Agents Want: 1st place, Primitive.dev track",
    date: "2026-10",
  },
  a16z: {
    src: "/projects/moment-a16z.webp",
    alt: "Holding the winner’s check at a16z SpeedHacks",
    caption: "a16z SpeedHacks: 1st place, Best Use of Keewano",
    date: "2026-10",
  },
};
