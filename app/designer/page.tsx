import type { Metadata, Viewport } from "next";
import { Designer } from "@/components/designer/designer";

export const metadata: Metadata = {
  title: "Designer",
  description: "A pixel island of Aiden Guan's projects: LedgerLens's tree and koi pond, Continuity's bridge, Rally's table and the rest.",
  alternates: { canonical: "/designer" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f2efe8",
};

export default function DesignerPage() {
  return <Designer />;
}
