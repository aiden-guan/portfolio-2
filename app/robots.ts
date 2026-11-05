import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

// Everything is there to be read except the editor and what only it calls.
// The front page counts a first visit by posting to /api/egoists, and a
// crawler that runs the page always arrives for the first time, so it's
// kept out of that too. Uploads (/api/media) stay open: the pages show them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/admin/", "/api/egoists"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
