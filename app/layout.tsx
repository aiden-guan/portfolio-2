import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./scenery.css";
import "./card-file.css";

const siteUrl = getSiteUrl();

export async function generateMetadata(): Promise<Metadata> {
  const { profile, seo } = await getPortfolioContent();
  const title = seo.title || `${profile.name || "Personal"} | Portfolio`;
  const description = seo.description || [
    `Work, experience and projects from ${profile.name || "the portfolio author"}.`,
    profile.introduction,
  ].filter(Boolean).join(" ");
  const socialDescription = seo.socialDescription || description;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s — ${profile.name}`,
    },
    description,
    authors: [{ name: profile.name }],
    creator: profile.name,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      url: "/",
      title,
      description: socialDescription,
      siteName: profile.name,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: socialDescription,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" },
  ],
};

const themeScript = `
  (() => {
    try {
      const stored = localStorage.getItem('aiden-theme');
      const theme = stored === 'light' || stored === 'dark'
        ? stored
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      const scene = localStorage.getItem('aiden-scene');
      if (location.pathname === '/' && ['chongqing', 'rockies', 'reef', 'golden-gate'].includes(scene)) {
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
