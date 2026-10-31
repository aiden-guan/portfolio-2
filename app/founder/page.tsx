import type { Metadata, Viewport } from "next";
import { NOTIFICATIONS } from "@/content/founder";
import { FounderProfile, PAGE_TITLE } from "@/components/founder/profile";

// Durations like "Oct 2026 – Present · 1 mo" are worked out when the page is
// rendered, so it renders again once a day.
export const revalidate = 86400;

export const metadata: Metadata = {
  // The count is the bell's: it goes when the notifications are opened.
  title: { absolute: `(${NOTIFICATIONS.length}) ${PAGE_TITLE}` },
  description:
    "Aiden Guan on ClockedIn, a LinkedIn parody: building alai, three first-place hackathon finishes, 13 projects, and Business + Data Science at UC Berkeley.",
  alternates: { canonical: "/founder" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function FounderPage() {
  return <FounderProfile />;
}
