<div align="center">

# Aiden Guan — Index Portfolio

**A restrained, high-density index portfolio and private headless CMS built with Next.js 16, React 19, TypeScript, and Cloudflare R2 storage.**

[Live Site](https://aidenguan.com) · [Architecture](#system-architecture) · [Admin CMS](#private-headless-cms-admin-editor) · [Engineering Deep Dives](#engineering-deep-dives) · [Quick Start](#getting-started)

<br/>

[![Deployed: aidenguan.com](https://img.shields.io/badge/Deployed-aidenguan.com-11110f.svg?style=flat-square&logo=vercel)](https://aidenguan.com)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.4-black.svg?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2.8-blue.svg?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

<br/>

![Aiden Guan Portfolio Showcase](assets/readme/hero.png)

</div>

---

## Overview

This repository powers **[aidenguan.com](https://aidenguan.com)**, the personal index of Aiden Guan (studying Business Administration and Data Science at UC Berkeley).

Rather than relying on heavy graphic templates, third-party portfolio builders, or static Markdown files requiring continuous git commits, the application couples an austere Swiss typographic layout with a private, authenticated in-browser CMS. Content edits and project media publish instantly to production via Cloudflare R2 object storage with zero build latency, zero egress fees, and zero redeployment requirements.

---

## Core Capabilities

| Cabinet Stills Drawer | Private In-Browser Headless CMS |
| :--- | :--- |
| ![Cabinet Drawer Preview](assets/readme/cabinet-preview.png) | ![Admin CMS Portal](assets/readme/admin-preview.png) |
| **Interactive Print Fan**: Hovering or focusing any work entry triggers a hardware-accelerated drawer that slides out image stills with mathematical tilt transforms (`--tilt`) while softly dimming the rest of the interface to spotlight the active project. | **Zero-Redeploy Publishing**: Dedicated `/admin` route protected by cryptographic session tokens. Allows full editing of profile copy, social links, section titles, project details, and asset uploads directly to Cloudflare R2 with pre-signed size validation and hard storage blockers. |

| Zero-Flicker Theme Engine | Edge OpenGraph & Canonical SEO |
| :--- | :--- |
| **Instant Dark / Light Adaptation**: Zero-dependency inline `<head>` script evaluates `localStorage` and OS `prefers-color-scheme` before the DOM paints, eliminating theme flash (FOIT) without layout shift. | **Edge Social Generation**: Dynamically generates high-resolution Open Graph image cards via `@vercel/og` with automatic sitemap generation and canonical metadata routing. |

---

## System Architecture

The project operates across a dual-surface architecture separating public visitor presentation from authenticated content persistence.

```mermaid
flowchart LR
    subgraph PublicClient["Public Surface (Visitor)"]
        Index["Index View (app/page.tsx)"]
        Cabinet["Cabinet Stills & Video (components/cabinet.tsx)"]
        Theme["Theme Script (inline head)"]
    end

    subgraph AdminClient["Private Surface (Maintainer)"]
        AdminUI["Admin Portal (app/admin/page.tsx)"]
        Editor["Content Form (components/admin-editor.tsx)"]
        MediaUploader["Media Pipeline (components/admin-image-editor.tsx)"]
        StorageGuard["Storage Guard (components/admin-storage-guard.tsx)"]
    end

    subgraph AppRouter["Next.js App Router (Node.js & Edge)"]
        SessionAPI["Auth Endpoint (app/api/admin/session)"]
        ContentAPI["Content Handler (app/api/admin/content)"]
        MediaRoute["Media Streamer & Range (app/api/media/[name])"]
        StatusAPI["Storage Quota API (app/api/admin/media/status)"]
        OG["OpenGraph Generator (app/opengraph-image.tsx)"]
    end

    subgraph Persistence["Cloudflare R2 & Edge CDN"]
        R2Content[("R2 Bucket: portfolio/content.json")]
        R2Media[("R2 Bucket: portfolio/media/*")]
        EdgeCDN["Cloudflare Global Edge CDN"]
    end

    Index -->|SSR & ISR Revalidation| ContentAPI
    Cabinet -->|HTTP 206 Byte-Range Video & Stills| MediaRoute
    AdminUI -->|Password Auth / SHA-256| SessionAPI
    Editor -->|Validated JSON Payload| ContentAPI
    MediaUploader -->|S3 Presigned Content-Length Put| R2Media
    StorageGuard -->|Audit Quota & Clean Orphans| StatusAPI
    StatusAPI -->|S3 List & Delete Commands| R2Media
    ContentAPI -->|Atomic Write / Read| R2Content
    MediaRoute -->|Stream Bytes or 308 Redirect| R2Media
    R2Media --> EdgeCDN
    OG --> EdgeCDN
```

### End-to-End Workflow

1. **Request Intake**: Incoming requests to `aidenguan.com` hit the Next.js App Router (`app/page.tsx`).
2. **Content Resolution**: `getPortfolioContent()` checks for configured Cloudflare R2 credentials (falling back to legacy Vercel Blob or typed schema defaults in `content/portfolio.ts`). If present, it retrieves the live private `portfolio/content.json` document with a 60-second cache-control window.
3. **Payload Sanitization**: Payloads pass through `parsePortfolioContent()`, which validates all strings, arrays, safe URI protocols (`http:`, `https:`, `mailto:`), and bounds check text lengths.
4. **DOM Painting & Theme Application**: An inline script in `<head>` applies `dataset.theme` prior to paint. The server renders the typographic grid, Berkeley timezone clock, and project index.
5. **Interactive Cabinet Expansion**: When a pointer hovers or keyboard focuses (`tabIndex={0}`) on a project row, CSS `:has()` rules dim sibling elements while evaluating CSS custom properties (`--tilt`, `--count`, `--i`) to fan the project prints and autoplay associated demo clips.
6. **Authenticated Publishing**: When the maintainer accesses `/admin`, credentials authenticate against SHA-256 session cookies. Updated JSON documents write atomically to Cloudflare R2 via `savePortfolioContent()`. Direct media uploads stream straight to R2 via S3 presigned URLs with exact `ContentLength` verification and storage quota checks, updating public visitor traffic immediately.

---

## Private Headless CMS & Admin Editor

The repository integrates a full-featured content management suite under `app/admin/`:

- **Session Security**: Session tokens are cryptographically derived via SHA-256 hashes of the admin password paired with HTTP-only, secure, `SameSite=Strict` cookies (`lib/admin-auth.ts`).
- **Input Validation**: Strict parser contracts (`lib/portfolio-content.ts`) reject malformed JSON, enforce maximum character lengths, restrict URL schemes to safe web protocols, and sanitize image pathnames.
- **Media Upload Pipeline**: Client-side byte sniffing (`lib/portfolio-media.ts`) verifies magic signatures for JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, and MOV formats. Direct uploads use S3 presigned URLs with enforced `ContentLength` headers, bypassing serverless request body limitations.
- **Storage Guard & Hard Blocker**: Real-time bucket monitoring (`lib/r2-limits.ts` & `components/admin-storage-guard.tsx`) enforces a 5 GB hard ceiling (well within Cloudflare's 10 GB free tier) and a 1,000-file quota, blocking accidental overages before bytes reach cloud storage.
- **Local Development Proxy**: When running locally without active cloud credentials, `app/api/media/[name]/route.ts` proxies remote media directly from `aidenguan.com` with HTTP 206 byte-range streaming support.

---

## Engineering Deep Dives

### 1. Zero-Egress Cloudflare R2 Storage with Hard Quota Blockers and Byte-Range Streaming

- **Problem**: Cloud object storage risks surprise billing or accidental overages from runaway video uploads and egress fees. Traditional serverless upload routes also fail against body size ceilings (e.g. 4.5 MB), and browser video playback on iOS/Safari stutters without HTTP 206 byte-range seeking.
- **Approach**: Transitioned persistence to Cloudflare R2 via `@aws-sdk/client-s3` ($0 egress fees, 10 GB free tier). Implemented a multi-tier safety architecture: pre-upload quota checks (`lib/r2-limits.ts` with 5 GB hard ceiling and 1,000 file caps), presigned S3 URLs locking exact `ContentLength` headers, HTTP 206 Range request proxying (`app/api/media/[name]/route.ts`) for video scrubbing, and an automated CLI management suite (`scripts/manage-r2.mjs`).
- **Why**: Delivers fast video playback and zero-rebuild publishing while guaranteeing that accidental bandwidth or storage spikes can never incur cloud bills.
- **Tradeoff**: Single-document persistence uses atomic put overwrites optimized for a single author. Concurrent administrative sessions rely on last-write-wins semantics.

### 2. Hardware-Accelerated Cabinet Stills with Non-Destructive Focus Navigation

- **Problem**: Presenting visual project screenshots within a dense, text-first editorial grid typically results in cluttered vertical cards or jarring modal dialogs that disrupt keyboard navigation.
- **Approach**: Implemented a drawer architecture (`components/cabinet.tsx` and `app/globals.css`) using CSS transforms (`translate3d`, `rotate`, `scale`). Each card receives dynamic custom properties `--i` and `--count` calculating rotational fanning (`--tilt`). Utilizing CSS `:has(.project-row:hover)` and `:has(:focus-visible)`, the page dims ambient text (`opacity: var(--spotlight)`) and elevates the active row.
- **Why**: Keeps the initial viewport minimalist and typographic while providing immediate visual depth on demand without layout reflow (CLS = 0).
- **Tradeoff**: Advanced fanning interactions require modern browser CSS `:has()` support. For legacy browsers, fallbacks gracefully maintain text readability without the hover spotlight.

### 3. Zero-Hydration-Flash Dark & Light Theme Architecture

- **Problem**: React App Router components hydrating asynchronously often cause a bright white flash when a visitor has selected dark mode (FOIT) if theme state is resolved within `useEffect`.
- **Approach**: Injected an inline script block directly inside `app/layout.tsx` `<head>` before any body elements render. The script synchronously evaluates `localStorage.getItem('aiden-theme')` or system `window.matchMedia('(prefers-color-scheme: dark)')` and stamps `data-theme` directly onto `document.documentElement`.
- **Why**: Completely prevents visual theme flashing during page load without adding third-party theme package weight.
- **Tradeoff**: Requires `suppressHydrationWarning` on the root `<html>` tag to prevent React hydration mismatch warnings.

---

## Technology Stack

### Client & Presentation
- **Framework**: Next.js 16.3.4 (App Router, Server Components)
- **UI Runtime**: React 19.2.8
- **Typography & Styling**: Custom CSS custom properties, responsive split-column layout, and CSS `:has()` selectors
- **Media Optimization**: Next.js Image component with responsive sizing and layout containment

### Server & Route Handlers
- **API Handlers**: Node.js route handlers (`app/api/admin/*`, `app/api/media/*`)
- **Metadata Engine**: Dynamic OpenGraph generation (`@vercel/og`), dynamic `sitemap.xml`, and `robots.txt`
- **Domain Routing**: Centralized canonical URL resolver (`lib/site-url.ts`) prioritizing `aidenguan.com`

### Persistence & Storage
- **Document Store**: Cloudflare R2 S3-compatible private bucket (`portfolio/content.json`) with legacy Vercel Blob fallback
- **Media Object Store**: Cloudflare R2 private bucket with zero egress fees (`portfolio/media/*`)
- **Video & Media Streaming**: HTTP 206 byte-range streaming with public CDN redirect support
- **Storage Safety**: In-memory quota cache, hard cap blockers (5 GB safety ceiling), and S3 signed content-length verification

### Security & Authentication
- **Session Verification**: SHA-256 cryptographic message hashing with HTTP-only cookies
- **MIME & Byte Verification**: Magic-byte signature checking for image and video uploads
- **Sanitization**: Strict length bounding and URL protocol whitelist validation

---

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- npm (v10 or higher)

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/aiden-guan/portfolio-2.git
   cd portfolio-2
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure local environment**:
   ```bash
   cp .env.example .env.local
   ```

4. **Launch development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. The site will boot with typed default content and proxy remote images from production.

---

## Configuration & Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical site origin (defaults to `https://aidenguan.com` in production and `http://localhost:3000` in dev). |
| `ADMIN_PASSWORD` | Optional | Shared password required to authenticate into the `/admin` editor portal. |
| `R2_ACCOUNT_ID` | Optional | Cloudflare account identifier for R2 bucket access. |
| `R2_ACCESS_KEY_ID` | Optional | S3-compatible access key ID for Cloudflare R2. |
| `R2_SECRET_ACCESS_KEY` | Optional | S3-compatible secret access key for Cloudflare R2. |
| `R2_BUCKET_NAME` | Optional | Name of the R2 bucket (defaults to `portfolio-media`). |
| `R2_PUBLIC_URL` | Optional | Custom domain or public R2 URL for direct CDN asset serving. |
| `R2_MAX_STORAGE_GB` | Optional | Hard safety threshold in GB before uploads are blocked (defaults to `5`). |
| `R2_MAX_FILES` | Optional | Maximum number of objects allowed before blocking uploads (defaults to `1000`). |
| `BLOB_READ_WRITE_TOKEN` | Optional | Legacy access token for Vercel Blob migration fallback. |

---

## Repository Structure

```text
portfolio-2/
├── app/
│   ├── admin/               # Private in-browser CMS editor portal (/admin)
│   ├── api/
│   │   ├── admin/           # Authenticated session, content, media, and quota API handlers
│   │   └── media/[name]/    # Secure media streaming route with HTTP 206 Range & dev proxy
│   ├── globals.css          # Core design tokens, layout grids, and cabinet animations
│   ├── layout.tsx           # Root layout, zero-flicker theme script, and canonical metadata
│   ├── opengraph-image.tsx  # Dynamic 1200x630 OpenGraph card generation via @vercel/og
│   ├── page.tsx             # Main index server component assembling work, experience & bio
│   ├── robots.ts            # Dynamic robots.txt generation
│   └── sitemap.ts           # Dynamic sitemap.xml generation
├── assets/
│   └── readme/              # High-resolution README presentation assets
├── components/
│   ├── admin-editor.tsx     # Full reactive admin editor form interface
│   ├── admin-image-editor.tsx # Direct presigned media uploader & format validator
│   ├── admin-storage-guard.tsx # Visual storage quota gauge & 1-click orphan cleaner
│   ├── cabinet.tsx          # Fanned card print drawer for project stills and videos
│   ├── index-navigation.tsx # High-contrast section anchor navigation
│   ├── local-time.tsx       # Live-updating Berkeley time calculation
│   └── project-index.tsx    # Accessible project list with focus and hover handlers
├── content/
│   └── portfolio.ts         # Schema definitions, type guards, and fallback content
├── lib/
│   ├── admin-auth.ts        # SHA-256 session token generation and cookie management
│   ├── media-limits.ts      # Media size boundaries and MIME definitions
│   ├── portfolio-content.ts # R2/Blob retrieval, payload parsing, and validation guards
│   ├── portfolio-media.ts   # Magic-byte file validation and media helpers
│   ├── r2.ts                # S3-compatible Cloudflare R2 client and presigning utilities
│   ├── r2-limits.ts         # Storage quota guard, bucket counter, and hard limit blocker
│   └── site-url.ts          # Canonical site origin resolver
├── scripts/
│   ├── manage-blobs.mjs     # Legacy Vercel Blob inspection and migration utility
│   ├── manage-r2.mjs        # Cloudflare R2 storage inspector, orphan cleaner & abort tool
│   ├── test-hard-blocker.mjs # Integration test verifying quota rejection behavior
│   └── test-r2.mjs          # End-to-end R2 upload, fetch, and range verification
├── public/                  # Static web manifests and icons
├── LICENSE                  # MIT License
└── package.json             # Scripts and dependencies
```

---

## Verification & Quality Checks

Run the automated verification suite:

```bash
# Run ESLint validation
npm run lint

# Run TypeScript typecheck
npm run typecheck

# Execute production build
npm run build
```

---

## Status & Limitations

- **Maturity**: In active production use at [aidenguan.com](https://aidenguan.com).
- **Concurrency**: Storage uses single-document atomic overwrite semantics; concurrent administrative editors are not synchronized in real-time.
- **Media Storage**: Primary persistence is powered by Cloudflare R2 with $0 egress and 10 GB free tier storage, protected by an automatic 5 GB safety blocker. In local development without credentials, media requests proxy directly from `aidenguan.com`.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
