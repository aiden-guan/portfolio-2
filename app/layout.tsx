import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();

export async function generateMetadata(): Promise<Metadata> {
  const { profile, seo } = await getPortfolioContent();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: seo.title,
      template: `%s — ${profile.name}`,
    },
    description: seo.description,
    authors: [{ name: profile.name }],
    creator: profile.name,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      url: "/",
      title: seo.title,
      description: seo.socialDescription,
      siteName: profile.name,
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.socialDescription,
      images: ["/opengraph-image"],
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
