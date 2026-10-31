import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

// The mat, with nothing on it: the place a page would lie is marked out,
// and empty.
export default function NotFound() {
  return (
    <main className="mat not-found">
      <p className="not-found-print" aria-hidden="true">
        404
      </p>
      <div className="not-found-place">
        <span className="home-mark" data-shown="" aria-hidden="true" />
        <p className="not-found-label">404 / Off the mat</p>
        <h1>This page isn’t here.</h1>
        <p>The useful way back is short.</p>
        <Link href="/student">Back to the mat</Link>
      </div>
    </main>
  );
}
