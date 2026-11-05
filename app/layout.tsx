import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PERSON } from "@/content/worlds";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();

// Only what every page shares loads here. The mat's styles and type load
// with the mat (app/student/layout.tsx); the front page and the 404 bring the
// grotesk for the one word they set in it.

export async function generateMetadata(): Promise<Metadata> {
  const { profile, seo } = await getPortfolioContent();
  const name = profile.name || PERSON.name;
  const title = seo.title || `${name} | Portfolio`;
  const description = seo.description || [
    `Work, experience and projects from ${name}.`,
    profile.introduction,
  ].filter(Boolean).join(" ");

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s — ${name}`,
    },
    description,
    applicationName: name,
    authors: [{ name, url: siteUrl }],
    creator: name,
    // Only what is true of every page. Each page names its own address, and a
    // link's card takes its title and description from the page it points
    // at, so nothing shared from /founder says it is the home page. Each
    // world's picture is the opengraph-image beside it, and X reads that one.
    openGraph: {
      type: "website",
      siteName: name,
      locale: "en_US",
    },
    twitter: { card: "summary_large_image" },
    // totals, times and places on the mat are print, not links to dial or map
    formatDetection: { telephone: false, address: false },
  };
}

// The paper, for any page that doesn't bring its own ground; every world sets
// its own colour.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" },
  ],
};

// Before the first paint: the theme someone picked, or the system's. A page
// that follows the theme gives the browser's bar a colour for light and one
// for dark, chosen by the system setting; once a theme has been picked, both
// take the picked one (the toggle does the same), so the bar matches the page.
const themeScript = `
  (() => {
    try {
      const stored = localStorage.getItem('aiden-theme');
      const chosen = stored === 'light' || stored === 'dark';
      const theme = chosen
        ? stored
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      const bars = document.querySelectorAll('meta[name="theme-color"][media]');
      bars.forEach((bar) => { bar.dataset.color = bar.content; });
      const picked = chosen && Array.prototype.find.call(bars, (bar) => bar.media.indexOf(': ' + stored + ')') > -1);
      if (picked) bars.forEach((bar) => { bar.content = picked.dataset.color; });
      const scene = localStorage.getItem('aiden-scene');
      if (location.pathname === '/student' && ['chongqing', 'rockies', 'reef', 'golden-gate'].includes(scene)) {
        document.documentElement.dataset.scene = scene;
      }
    } catch (_) {}
  })();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
