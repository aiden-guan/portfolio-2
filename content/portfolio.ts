// Edit this file to update the fallback content used by the portfolio and editor.

export type ProfileLink = {
  label: string;
  href: string;
};

export type ProjectLink = {
  label: "live" | "source";
  href: string;
};

export type PortfolioImage = {
  src: string;
  alt: string;
};

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
    mark: "A/G—26",
    descriptor: "Product builder.",
    introduction:
      "I study business at UC Berkeley and build software, businesses, and games.",
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
      name: "SideSpace",
      status: "Building",
      summary: "A marketplace for local attention.",
      detail: "Book storefronts, creators, routes, and other local places.",
      stack: ["Next.js", "PostgreSQL", "Stripe", "Supabase"],
      links: [
        { label: "live", href: "https://www.sidespace.ad" },
        {
          label: "source",
          href: "https://github.com/kv1514/sidespace-marketplace",
        },
      ],
      images: [],
    },
    {
      name: "Million Dollar Leaderboard",
      status: "Live",
      summary: "A million-pixel canvas you can own.",
      detail: "Buy a square, add a name and link, then explore the public board.",
      stack: ["Next.js", "Stripe", "PostgreSQL"],
      links: [{ label: "live", href: "https://milliondollarboard.lol" }],
      images: [],
    },
    {
      name: "Corgi / BarkOff",
      status: "1st place",
      summary: "A live one-on-one bark battle.",
      detail:
        "Webcams, audio controls, and two dogs in a pixel ring. Built with Dylan for Grok Student Build Night.",
      stack: ["React", "Web Audio", "Computer vision"],
      links: [{ label: "source", href: "https://github.com/dylann4500/corgi" }],
      images: [],
    },
    {
      name: "RewardRelay",
      status: "Open source",
      summary: "A referral board for students.",
      detail:
        "Student offers across rides, food, money, travel, shopping, and tools.",
      stack: ["React", "TypeScript", "PostgreSQL"],
      links: [{ label: "source", href: "https://github.com/aiden-guan/riderelay" }],
      images: [],
    },
    {
      name: "AGNotify",
      status: "Merged",
      summary: "A private community for sneaker resellers.",
      detail:
        "Release alerts, consignment, and group chat. Started with $500, reached $45k ARR, then merged.",
      stack: ["Community", "Operations", "Commerce"],
      links: [{ label: "live", href: "https://whop.com/agnotify" }],
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
