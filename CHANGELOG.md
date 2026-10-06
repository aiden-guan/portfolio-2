# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] — 2026-10-05

### Summary
Fixed Cloudflare R2 browser upload failures by adding automatic server-side media fallback, real-time XHR upload progress tracking, bucket CORS active probing, and CLI CORS setup tooling.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Media Upload Client** | Automatic server fallback for media ≤ 4 MB | Bypasses browser CORS restrictions by routing smaller media through the server-side S3 pipeline, preventing upload failure. |
| **Upload Engine** | Replaced `fetch` with `uploadPresignedR2` (XHR) | Provides live upload progress (`0% → 100%`) and converts ambiguous network errors into actionable CORS guidance. |
| **CORS Prober** | Added `isR2CorsConfigured()` in `lib/r2.ts` | Probes bucket preflight headers with TTL caching to proactively inform UI components of CORS readiness. |
| **Admin Guard & CLI** | Added CORS indicator & `npm run r2 -- cors` command | Surfaces configuration status in `/admin` Settings and offers instant terminal diagnostic & dashboard setup instructions. |

### Detailed Changes

#### Fixed
- **Cloudflare R2 CORS Blocker**: Resolved upload failures where cross-origin PUT requests were rejected with `403 Forbidden: CORS not configured for this bucket` and masked as generic connection dropouts.
- **Video Server Fallback**: Configured `components/admin-image-editor.tsx` to automatically upload videos ≤ 4 MB via `/api/admin/media` when direct R2 upload fails or lacks CORS.
- **Upload Progress Accuracy**: Wired real-time upload progress percentage to `uploadPresignedR2` via `request.upload.onprogress`.

#### Added
- **CORS Active Probing**: Added `isR2CorsConfigured()` in `lib/r2.ts` and exposed `corsConfigured` in `/api/admin/media/upload` and `/api/admin/media/status`.
- **CORS CLI Command**: Added `npm run r2 -- cors` to audit bucket CORS headers, attempt automated S3/Cloudflare API setup, and print direct dashboard setup links.
- **Admin Guard Guidance**: Surfaced a proactive warning in `AdminStorageGuard` when R2 CORS is unconfigured.

### Verification Proof
- `npm run lint` passed with 0 errors.
- `npm run typecheck` passed with 0 errors.
- `npm run build` executed full production Turbopack compilation across all routes.
- `npm run r2 -- cors` verified bucket probe output and configuration guidance.

---

## [1.2.2] — 2026-10-01

### Summary
Resolved hover video preview delays on initial visitor sessions by enabling automated preloading and proactive buffer warming across cabinet drawer prints and modal thumbnails.

### Detailed Changes

#### Fixed
- **Cabinet Video Preloading**: Switched drawer `<video>` elements from `preload="none"` to `preload="auto"` in `components/cabinet.tsx`, allowing modern browsers to buffer initial media segments and decode cover frames on initial page visit.
- **Proactive Buffer Warming**: Added a mount lifecycle trigger in `components/portfolio-frame.tsx` to invoke `.load()` on cabinet videos, ensuring background media pipelines immediately initiate range requests regardless of initial card opacity.
- **Gallery Thumbnail Previews**: Updated full-screen viewer thumbnail video elements to `preload="auto"` to guarantee immediate thumbnail responsiveness during gallery modal navigation.

---

## [1.2.1] — 2026-10-01

### Summary
Synchronized repository presentation, package manifests, and GitHub metadata to reflect the Cloudflare R2 object storage architecture and byte-range video streaming capabilities.

### Detailed Changes

#### Documentation & Presentation
- **GitHub Metadata**: Updated repository description to highlight Cloudflare R2 storage and replaced `vercel-blob` topic with `cloudflare-r2`.
- **System Presentation**: Modernized `README.md` architecture diagram, end-to-end workflows, configuration references, and engineering deep dives to document zero-egress Cloudflare R2 storage, pre-upload safety blockers, and HTTP 206 byte-range media delivery.
- **Local Git & Package Metadata**: Updated `.git/description` and `package.json` with the canonical project description.

---

## [1.2.0] — 2026-09-30

### Summary
Implemented Cloudflare R2 hard limit blocker, pre-upload capacity guard, S3 signed length enforcement, real-time admin storage monitor, and CLI orphan cleaner to prevent accidental cloud overage charges.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Quota Engine** | Added `lib/r2-limits.ts` with 5.0 GB safety cap & in-memory caching | Rejects uploads exceeding safety thresholds before sending bytes to Cloudflare; protects Class A operations. |
| **Direct Uploads** | Cryptographic `ContentLength` presigning in `lib/r2.ts` | Enforces that uploaded video files match declared size and cannot bypass video size limits. |
| **Admin UI** | Added `AdminStorageGuard` in `components/admin-editor.tsx` | Real-time visual storage meter and 1-click orphan cleaner in `/admin` Settings. |
| **CLI & Tools** | Added `scripts/manage-r2.mjs` (`npm run r2`) and automated multipart abort | Terminal storage auditing, bulk orphan deletion, and automated abort of stalled multipart fragments. |

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
