import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";

// The sentence is set in Geist; each role word in the face of the page it
// leads to (founder: the system UI, student: the mat's Archivo, builder:
// Geist Mono, designer: a pixel face).
export const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
export const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixel", display: "swap" });

export const identityFonts = [geist.variable, geistMono.variable, pixel.variable].join(" ");
