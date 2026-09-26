// Edit this file to update the fallback content used by the portfolio and editor.

export type ProfileLink = {
  label: string;
  href: string;
};

export type ProjectLink = {
  label: "live" | "source";
  href: string;
};

export type ImageFit = "contain" | "cover";

// Rows hold images and short videos. `kind` is omitted for images so older
// content keeps parsing unchanged.
export type PortfolioImage = {
  src: string;
  alt: string;
  kind?: "video";
  fit?: ImageFit;
  focusX?: number;
  focusY?: number;
};

export function imageFrame(image: Pick<PortfolioImage, "fit" | "focusX" | "focusY">) {
  const fit: ImageFit = image.fit === "cover" ? "cover" : "contain";
  const focusX = clampFocus(image.focusX);
  const focusY = clampFocus(image.focusY);
  return {
    fit,
    position: `${focusX}% ${focusY}%`,
  };
}

export function isVideo(media: Pick<PortfolioImage, "kind">) {
  return media.kind === "video";
}

function clampFocus(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export const MAX_PROJECT_IMAGES = 6;

export type Project = {
  name: string;
  status: string;
  summary: string;
  detail: string;
  stack: string[];
  links: ProjectLink[];
  images: PortfolioImage[];
};

export type TimelineEntry = {
  organization: string;
  role: string;
  period: string;
  summary: string;
  images: PortfolioImage[];
};

export type SectionId = "work" | "experience" | "about";

export type NavigationItem = {
  id: SectionId;
  label: string;
};

export type SectionContent = {
  label: string;
  title: string;
};

export type PortfolioContent = {
  profile: {
    name: string;
    mark: string;
    descriptor: string;
    introduction: string;
    email: string;
    location: string;
    locationLabel: string;
    links: ProfileLink[];
  };
  seo: {
    title: string;
    description: string;
    socialDescription: string;
  };
  navigation: NavigationItem[];
  sections: Record<SectionId, SectionContent>;
  projects: Project[];
  timeline: TimelineEntry[];
  about: {
    paragraphs: string[];
  };
  interests: string[];
};

export const defaultPortfolio: PortfolioContent = {
  profile: {
    name: "Aiden Guan",
    mark: "AG—26",
    descriptor: "Student",
    introduction: "Business Admin + Data Science @ Berkeley",
    email: "aidenguan@berkeley.edu",
    location: "Berkeley, California",
    locationLabel: "Berkeley",
    links: [
      { label: "GitHub", href: "https://github.com/aiden-guan" },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/aidenguan" },
      { label: "Email", href: "mailto:aidenguan@berkeley.edu" },
    ],
  },
  seo: {
    title: "Aiden Guan — product builder",
    description: "Aiden Guan is a product builder studying business at UC Berkeley.",
    socialDescription:
      "Selected work and experience from Aiden Guan, a product builder at UC Berkeley.",
  },
  navigation: [
    { id: "work", label: "Work" },
    { id: "experience", label: "Experience" },
    { id: "about", label: "About" },
  ],
  sections: {
    work: { label: "01 / Work", title: "Built to be used." },
    experience: { label: "02 / Experience", title: "Work and study." },
    about: { label: "03 / About", title: "What I’m exploring." },
  },
  projects: [
    {
      name: "AGNotify",
      status: "Retired",
      summary: "Sneaker Reselling Cookgroup",
      detail:
        "Release alerts, consignment, and group chat. Started with $500, reached $45k ARR, then exited.",
      stack: ["Whop", "Discord"],
      links: [],
      images: [
        {
          src: "/api/media/92b066b9-1584-4eff-8cb4-527340d9515b.png",
          alt: "AGNotify",
        },
        {
          src: "/api/media/808c7e08-9078-4bdd-92fb-28c5bd0f5c9f.png",
          alt: "AGNotify 2",
        },
        {
          src: "/api/media/d134caff-e344-44c6-973d-e4831948b368.png",
          alt: "AGNotify 3",
        },
      ],
    },
    {
      name: "AntiAgent",
      status: "Actively Maintaining",
      summary:
        "Intelligent 'Approved for Me' safety supervisor and gatekeeper for Google Antigravity",
      detail:
        "AntiAgent brings OpenAI's/ChatGPT's \"Approved for Me\" safety paradigm to Google Antigravity. It operates as an autonomous supervisor subagent embedded directly into Antigravity's lifecycle hooks (PreToolUse).\n\nAlso allows for users to have Auto-PR & CI Monitoring (similar to Claude Code)",
      stack: ["Python", "HTML"],
      links: [
        {
          label: "live",
          href: "https://github.com/aiden-guan/AntiAgent",
        },
      ],
      images: [
        {
          src: "/api/media/dd90ad3a-8240-424c-a5cf-f6bdf52acd42.png",
          alt: "AntiAgent",
        },
      ],
    },
    {
      name: "PigeonBox",
      status: "In progress",
      summary: "AI Powered Inbox - Open Tracking, Autodraft, all local.",
      detail: "Made to kill Superhuman + Mailsuite",
      stack: ["TypeScript", "JavaScript", "Convex"],
      links: [
        {
          label: "live",
          href: "https://github.com/aiden-guan/gmail-intelligence",
        },
      ],
      images: [],
    },
    {
      name: "HarmonyLabs",
      status: "In progress",
      summary: "Facial Harmony Vision Model",
      detail:
        "Research backed web-app that measures facial geometry that compares those measurements with research-backed attractiveness, aesthetic-harmony, and proportional references. Stronger evidence receives greater influence.",
      stack: ["Convex", "MediaPipe", "TypeScript"],
      links: [
        {
          label: "live",
          href: "https://useharmonylabs.vercel.app/",
        },
        {
          label: "source",
          href: "https://github.com/aiden-guan/HarmonyLabs",
        },
      ],
      images: [],
    },
    {
      name: "BarkOff",
      status: "1st place",
      summary: "A live one-on-one bark battle.",
      detail: "Who can bark the best? Made for SpaceXAI Build Night w friends",
      stack: ["React", "Web Audio", "Computer vision"],
      links: [
        {
          label: "source",
          href: "https://github.com/dylann4500/corgi",
        },
      ],
      images: [],
    },
  ],
  timeline: [
    {
      organization: "Independent",
      role: "Product builder",
      period: "Now",
      summary:
        "Building marketplaces, software products, and internet businesses from idea to launch.",
      images: [],
    },
    {
      organization: "AGNotify",
      role: "Founder",
      period: "Earlier",
      summary:
        "Started and ran a paid sneaker-reselling community before merging it.",
      images: [],
    },
    {
      organization: "UC Berkeley, Haas",
      role: "Business Administration",
      period: "2026—30",
      summary: "Studying business while building in software, technology, and AI.",
      images: [],
    },
  ],
  about: {
    paragraphs: [
      "I’m a business student at UC Berkeley. I learn by building software, marketplaces, and games.",
    ],
  },
  interests: [
    "AI as product material",
    "Marketplaces with real supply",
    "Software that feels like a place",
    "Tools for small businesses",
  ],
};

export const {
  profile,
  seo,
  navigation,
  sections,
  projects,
  timeline,
  about,
  interests,
} = defaultPortfolio;
