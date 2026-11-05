import { Archivo } from "next/font/google";

// The grotesk the mat is printed in, with its widths. It is loaded in one
// place and imported where it is used: by the mat at /student, and by the
// front page, which sets one word in it.
export const grotesk = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-grotesk", display: "swap" });
