import type { NextConfig } from "next";

// Sent with every response. There is no script policy: Next inlines its own
// scripts, the theme is set by an inline script before the first paint, and
// the island and the arcade draw with WebGL and blob URLs, so a policy
// strict enough to matter would need a nonce on every page. What is here
// can't break any of that: only this site may frame it, forms and <base> stay
// on it, and nothing loads as a plugin. Vercel adds HSTS itself.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // nothing here asks for these; share, the clipboard and vibration stay on
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    // the defaults, and 1440 (a print on a wide retina screen, lib/media-image)
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "aidenguan.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.aidenguan.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
