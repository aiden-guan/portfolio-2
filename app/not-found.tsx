import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="identity-mark">404 / Off index</p>
      <h1>This page isn’t here.</h1>
      <p>The useful way back is short.</p>
      <Link href="/">← Return to the index</Link>
    </main>
  );
}
