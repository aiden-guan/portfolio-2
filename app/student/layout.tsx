import type { Viewport } from "next";
import { Doto, Libre_Barcode_128, Martian_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { grotesk } from "../fonts";
import "../print-viewer.css";
import "../scenery.css";
import "../mat.css";
import "../recents.css";
import "../folder.css";
import "../break.css";
import "../projects.css";

// Everything the mat is made of, loaded only where there is a mat: its
// styles, and the type its things are printed in (a mono for receipts and
// forms, a dot-matrix face for what a thermal head prints, real barcodes).
// The other worlds bring their own and never wait on these.
const mono = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mono", display: "swap" });
const dots = Doto({ subsets: ["latin"], variable: "--font-dots", display: "swap" });
const barcode = Libre_Barcode_128({ subsets: ["latin"], weight: "400", variable: "--font-barcode", display: "swap" });

// On the root rather than a wrapper, so what the mat hands straight to the
// body (the arcade, the viewer) is printed in them too.
const faces = `:root{--font-grotesk:${grotesk.style.fontFamily};--font-mono:${mono.style.fontFamily};--font-dots:${dots.style.fontFamily};--font-barcode:${barcode.style.fontFamily}}`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2e5946" },
    { media: "(prefers-color-scheme: dark)", color: "#161816" },
  ],
};

export default function MatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style href="mat-faces" precedence="default">
        {faces}
      </style>
      {children}
    </>
  );
}
