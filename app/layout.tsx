import type { Metadata, Viewport } from "next";
import { Archivo, Doto, Libre_Barcode_128, Martian_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./scenery.css";
import "./mat.css";
import "./recents.css";
import "./folder.css";
import "./break.css";
import "./projects.css";

const siteUrl = getSiteUrl();

// The type the things on the mat are printed in: a grotesk with widths for
// the cards and the mat's own print, a mono for receipts and forms, a
// dot-matrix face for what a thermal head prints, and real barcodes.
const grotesk = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-grotesk", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mono", display: "swap" });
const dots = Doto({ subsets: ["latin"], variable: "--font-dots", display: "swap" });
const barcode = Libre_Barcode_128({ subsets: ["latin"], weight: "400", variable: "--font-barcode", display: "swap" });
const fonts = [grotesk.variable, mono.variable, dots.variable, barcode.variable].join(" ");

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
    { media: "(prefers-color-scheme: light)", color: "#2e5946" },
    { media: "(prefers-color-scheme: dark)", color: "#161816" },
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
      if (location.pathname === '/student' && ['chongqing', 'rockies', 'reef', 'golden-gate'].includes(scene)) {
        document.documentElement.dataset.scene = scene;
      }
    } catch (_) {}
  })();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
