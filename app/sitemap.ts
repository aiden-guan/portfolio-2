import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

// The identity page first, then the four ways in. No dates: the mat changes
// whenever the editor publishes, which a build can't know, and a date that is
// always "now" tells a crawler nothing.
const PATHS = ["", "/founder", "/student", "/builder", "/designer"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: `${siteUrl}${path}`,
    priority: path ? 0.8 : 1,
  }));
}
