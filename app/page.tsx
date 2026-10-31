import type { Metadata, Viewport } from "next";
import { Identity } from "@/components/identity/identity";

export const metadata: Metadata = {
  title: { absolute: "Aiden Guan" },
  description: "Hi, my name is Aiden. Founder, student, builder and designer.",
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function Home() {
  return <Identity />;
}
