// ClockedIn, the LinkedIn-style profile at /founder: this is the file to edit. The page reads everything it says from here and from content/worlds.ts.

import { MOMENTS, PERSON, PROJECTS } from "./worlds";

/** A square logo, drawn in CSS: a monogram (or a small icon) on a colour. */
export type Org = {
  name: string;
  /** The letters on the square. */
  mark?: string;
  /** An icon instead of letters. */
  icon?: "building" | "record";
  bg: string;
  fg: string;
  /** Italic serif letters, like Cal's script. */
  serif?: boolean;
  /** Where the logo and the name link to, in Experience. */
  href?: string;
};

const ORG_LIST = {
  alai: { name: "alai", mark: "a", bg: "#ffd23f", fg: "#1e1b3a", href: "https://tryalai.app" },
  independent: { name: "Independent", icon: "building", bg: "#e9e5df", fg: "#8c8c8c" },
  openscreen: {
    name: "OpenScreen",
    icon: "record",
    bg: "#16181d",
    fg: "#ffffff",
    href: "https://github.com/getopenscreen/openscreen",
  },
  agnotify: { name: "AGNotify", mark: "AG", bg: "#f5a524", fg: "#24170a" },
  berkeley: { name: "UC Berkeley", mark: "Cal", serif: true, bg: "#003262", fg: "#fdb515" },
  yc: { name: "Y Combinator", mark: "Y", bg: "#f26522", fg: "#ffffff" },
  a16z: { name: "a16z", mark: "a16z", bg: "#121212", fg: "#ffffff" },
  spacexai: { name: "SpaceXAI", mark: "SX", bg: "#000000", fg: "#ffffff" },
} satisfies Record<string, Org>;

export type OrgId = keyof typeof ORG_LIST;
export const ORGS: Record<OrgId, Org> = ORG_LIST;

export const PROFILE = {
  name: PERSON.name,
  first: PERSON.first,
  photo: PERSON.photo,
  headline: "Building alai · 3× 1st place at hackathons · Business + Data Science @ UC Berkeley",
  location: "Berkeley, California, United States",
  email: PERSON.email,
  github: PERSON.github,
  linkedin: PERSON.linkedin,
  site: "https://aidenguan.com",
  /** What the "Public profile & URL" card shows. */
  publicUrl: "clockedin.com/in/aidenguan",
  language: "English",
  /** The logo chips to the right of the name, and the section each one jumps to. */
  chips: [
    { org: "alai", target: "experience" },
    { org: "berkeley", target: "education" },
  ] as { org: OrgId; target: string }[],
  about:
    "Business student at UC Berkeley. I learn by building software, marketplaces and games.\n\n" +
    "Right now that’s alai, a voice-first AI tutor for STEM homework: students work by hand on an iPad, and when they pause after a wrong step, alai underlines it and nudges them out loud.\n\n" +
    "On the side: Rally, table tennis with your phone as the paddle, and PigeonBox, an AI inbox that runs on your own computer.",
};

/** The open-to-work box under the buttons. */
export const BUILDING = {
  title: "Building",
  projects: ["alai", "rally", "pigeonbox"],
  cta: "See all details",
  href: "/builder",
};

export type Experience = {
  org: OrgId;
  title: string;
  /** "Self-employed", "Full-time"… */
  kind?: string;
  /** "2026-10". Leave out when it isn't known. */
  start?: string;
  /** "2027-06", for a role that has ended. */
  end?: string;
  current?: boolean;
  /** Shown instead of dates when there is no start date. */
  when?: string;
  location?: string;
  description: string;
  /** Left out: taken from the stacks of the projects in `media`. */
  skills?: string[];
  /** Project slugs, shown as attachments. */
  media?: string[];
  /** A link attachment that has no picture. */
  link?: { title: string; href: string };
};

export const EXPERIENCE: Experience[] = [
  {
    org: "alai",
    // TODO(Aiden): confirm title
    title: "Co-founder",
    start: "2026-10",
    current: true,
    location: "Berkeley, California, United States",
    description:
      "A voice-first AI tutor for STEM homework on iPad. Students work by hand; when they pause after a wrong step, alai underlines it and nudges them out loud.\nWon 1st place, Best Use of Keewano at a16z SpeedHacks.",
    media: ["alai"],
  },
  {
    org: "independent",
    title: "Product Builder",
    kind: "Self-employed",
    current: true,
    when: "Present",
    description: "Building marketplaces, software products and internet businesses from idea to launch.",
    media: ["ledgerlens", "rally", "continuity", "pigeonbox"],
  },
  {
    org: "openscreen",
    title: "Open-source contributor",
    start: "2026-10",
    current: true,
    description:
      "Contributed transcription settings and timeline fixes to OpenScreen, a free, open-source screen recorder for product demos.",
    link: { title: "getopenscreen/openscreen", href: "https://github.com/getopenscreen/openscreen" },
  },
  {
    org: "agnotify",
    title: "Founder",
    when: "Previously",
    description:
      "Started a paid sneaker-reselling cook group with $500: release alerts, consignment and a members’ group chat. Grew it to $45k in revenue, then exited.",
    skills: ["Whop", "Discord", "Community"],
    media: ["agnotify"],
  },
];

export const EDUCATION = [
  {
    org: "berkeley" as OrgId,
    school: "University of California, Berkeley",
    degree: "Business Administration (Haas) + Data Science",
    years: "2026 – 2030",
  },
];

export type Honor = {
  title: string;
  issuer: string;
  org: OrgId;
  /** "2026-10", or just "2026". */
  date: string;
  /** The project it was for. */
  project: string;
  note?: string;
};

export const HONORS: Honor[] = [
  {
    title: "1st Place, Primitive.dev track",
    issuer: "Y Combinator, Make Something Agents Want",
    org: "yc",
    date: "2026-10",
    project: "continuity",
  },
  {
    title: "1st Place, Best Use of Keewano",
    issuer: "a16z SpeedHacks",
    org: "a16z",
    date: "2026-10",
    project: "alai",
  },
  {
    title: "1st Place",
    issuer: "SpaceXAI Build Night",
    org: "spacexai",
    date: "2026",
    project: "barkoff",
    note: "Built with friends in a night.",
  },
];

const firstPlaces = HONORS.filter((honor) => honor.title.startsWith("1st Place")).length;

/** The three numbers in the "Analytics" card, each linking to where it comes from. */
export const ANALYTICS = [
  {
    icon: "trend",
    value: "$45k",
    label: "in revenue",
    caption: "Grew AGNotify from $500, then exited.",
    href: "#experience-agnotify",
  },
  {
    icon: "trophy",
    value: String(firstPlaces),
    label: "first-place finishes",
    caption: "See them in Honors & awards.",
    href: "#honors",
  },
  {
    icon: "stack",
    value: String(PROJECTS.length),
    label: "shipped projects",
    caption: "Browse every one in Projects.",
    href: "#projects",
  },
] as const;

export const COUNTS = { projects: PROJECTS.length, firstPlaces };

/** In order: the first five are the top skills. Which projects used each one comes from their stacks. */
export const SKILLS = ["TypeScript", "Next.js", "React", "Python", "Convex", "Claude", "Computer vision", "Three.js", "WebRTC"];

/** Stack entries that count toward a skill too. */
export const SKILL_ALIASES: Record<string, string[]> = {
  React: ["React Three Fiber"],
  "Three.js": ["React Three Fiber"],
};

export const ENDORSEMENTS: Record<string, string> = {
  TypeScript: "Endorsed by Claude and Codex",
};

/** The Featured carousel: which project, and which of its links to open. */
export const FEATURED: { project: string; link: "live" | "source" }[] = [
  { project: "ledgerlens", link: "live" },
  { project: "continuity", link: "source" },
  { project: "rally", link: "live" },
  { project: "alai", link: "live" },
];

export type Reaction = "like" | "celebrate" | "love";

export type Post = {
  id: string;
  /** How long ago, as the feed says it. */
  when: string;
  text: string;
  image?: { src: string; alt: string; width: number; height: number; position?: string };
  reactions: number;
  /** The reaction icons shown beside the count, most common first. */
  top: Reaction[];
};

export const POSTS: Post[] = [
  {
    id: "yc",
    when: "2w",
    text: "I’m happy to share that Continuity took 1st place on the Primitive.dev track at Y Combinator’s Make Something Agents Want 🏆\n\nAgents forget. The thread doesn’t.\n\nAgree?",
    image: { src: MOMENTS.yc.src, alt: MOMENTS.yc.alt, width: 1600, height: 1068 },
    reactions: 64,
    top: ["celebrate", "like", "love"],
  },
  {
    id: "a16z",
    when: "2w",
    text: "1st place for Best Use of Keewano at a16z SpeedHacks. alai is a voice-first tutor that catches the wrong step while you’re still writing it.",
    image: { src: MOMENTS.a16z.src, alt: MOMENTS.a16z.alt, width: 1600, height: 2133, position: "50% 36%" },
    reactions: 51,
    top: ["like", "celebrate"],
  },
  {
    id: "agnotify",
    when: "2w",
    text: "Started a sneaker cook group with $500. Grew it to $45k. Exited.\n\nHere’s what it taught me about B2B SaaS 🧵",
    reactions: 23,
    top: ["like"],
  },
];

/** The photos in the Activity "Images" tab. */
export const IMAGES = [MOMENTS.yc, MOMENTS.a16z];

/** The bell. `when` is relative, as the dropdown shows it. */
export const NOTIFICATIONS = [
  { project: "ledgerlens", lead: "LedgerLens", text: "was submitted to Cal Hacks 13.0.", when: "1w" },
  {
    project: "continuity",
    lead: "Continuity",
    text: "took 1st place on the Primitive.dev track at Y Combinator’s Make Something Agents Want.",
    when: "2w",
  },
  { project: "alai", lead: "alai", text: "took 1st place for Best Use of Keewano at a16z SpeedHacks.", when: "2w" },
];

/** "Pages you may like" in the sidebar: projects, dressed as company pages. */
export const PAGES = ["courtvision", "seyrin", "agenthub", "inroad"];

/** The sidebar ad. */
export const AD = {
  project: "pigeonbox",
  text: "Kill your Superhuman subscription. PigeonBox is free and runs on your own computer.",
  cta: "Install",
  href: "https://usepigeonbox.com",
};
