# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-09-24

### Summary
Comprehensive repository overhaul bringing canonical domain configuration (`aidenguan.com`), live schema parity with Vercel Blob persistence, hardware-accelerated cabinet stills showcase, and complete open-source documentation.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Domain Resolution** | Added centralized canonical origin resolver (`lib/site-url.ts`) | Ensures `aidenguan.com` is consistently rendered across OpenGraph tags, sitemaps, and robots directives. |
| **Content Parity** | Updated typed fallback schemas in `content/portfolio.ts` | Eliminates stale default copy so local dev and offline runs reflect the live portfolio. |
| **Media Streamer** | Added local development upstream proxy in `app/api/media/[name]` | Allows local developer inspection of cabinet stills without requiring production cloud tokens. |
| **Hygiene & Presentation** | Generated high-resolution retina visual assets and technical README | Elevates repository to world-class showcase status with architecture diagrams and PAWT engineering blocks. |

### Detailed Changes

#### Added
- **Visual Assets**: Added 2x retina captures for index layout, interactive cabinet fan drawer, private admin portal, and OpenGraph social card (`assets/readme/`).
- **Domain Utility**: Introduced `lib/site-url.ts` to coordinate canonical domain precedence across SSR and metadata routes.
- **License**: Added official MIT License file.
- **Environment Documentation**: Added `NEXT_PUBLIC_SITE_URL` documentation to `.env.example` and unignored it in `.gitignore`.

#### Changed / Refactored
- **Content Fallbacks**: Synchronized `content/portfolio.ts` with live production database (AGNotify, AntiAgent, PigeonBox, HarmonyLabs, BarkOff).
- **Metadata Routes**: Updated `app/layout.tsx`, `app/sitemap.ts`, and `app/robots.ts` to use `getSiteUrl()`.
- **Media Handler**: Added upstream proxy fallback in `app/api/media/[name]/route.ts` when running in local development mode without Blob credentials.
- **Image Config**: Added `aidenguan.com` to `next.config.ts` remote patterns for image optimization compatibility.

#### Documentation & Presentation
- **README Overhaul**: Replaced 35-line template with comprehensive engineering case study, 2-column visual capability grid, Mermaid system architecture flowchart, and 3 PAWT engineering deep-dives.
- **GitHub Surfaces**: Updated GitHub repository metadata with live homepage URL (`https://aidenguan.com`), refined description, and discovery topics.

### Verification Proof
- `npm run lint` passed with zero errors.
- `npm run typecheck` passed with zero type diagnostics.
- `npm run build` executed full production Turbopack compilation across 11 routes.
- `validate_readme.py --strict` passed with zero errors and zero warnings.

---

## [1.0.0] — 2026-09-24

### Summary
Initial release of the restrained, text-first index portfolio with hover drawer for project stills and private `/admin` CMS editor backed by Vercel Blob.
