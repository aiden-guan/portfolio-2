import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import { NotFoundSentence } from "./not-found-sentence";
import styles from "./not-found.module.css";

// The black page's faces, for this page alone. The 404 sits in every page's
// tree, so fonts preloaded here would be preloaded on every page: these load
// only when the 404 is shown (by then the words are still rising in).
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap", preload: false });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });
const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixel", display: "swap", preload: false });
const grotesk = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-grotesk", display: "swap", preload: false });

// Next marks a 404 noindex itself, and a page that isn't here has no address
// of its own to give.
export const metadata: Metadata = {
  title: "Page not found",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

// Off the four pages, back on the black one: the same sentence, finished
// differently.
export default function NotFound() {
  return (
    <main className={`${styles.root} ${sans.variable} ${mono.variable} ${pixel.variable} ${grotesk.variable}`}>
      <NotFoundSentence />
    </main>
  );
}
