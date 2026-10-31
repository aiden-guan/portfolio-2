import { Geist, Geist_Mono } from "next/font/google";

// /builder is set in Geist, its labels and figures in Geist Mono.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const builderFonts = `${sans.variable} ${mono.variable}`;
