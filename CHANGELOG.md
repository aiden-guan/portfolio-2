# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Recents on a clothesline**: a band right under the card, with the latest photos pegged on a cord strung between two screw eyes in the mat, each a print with a line about it and a date written on its border; a click opens it large. The cord and photos are weighed and swing (`lib/clothesline.ts`): a hand passing over the line brushes it, and a photo can be tugged, or pulled right off its pegs. The knife cuts the cord wherever it's drawn across it, and the torch burns through it: the cut ends drop and hang off their screw eyes, the pegs slide down and off the frayed ends, and the photos flutter down onto the mat. Tidy strings the line again and pegs everything back up. The line is only worked on while something on it moves and while it's on screen.
- **Recents in the editor**: a Recents tab in `/admin` to add photos (newest go to the front of the line), crop them, and write what each one is and when. Up to 12.

## [1.6.0] — 2026-10-21

### Summary
The knife cuts everything now, and there's a torch. A cut looks carved into the mat, and drawn across paper it cuts the paper too: right across a sheet, the sheet comes apart in two along the line the blade took, and each piece can be picked up, thrown and turned over on its own. The torch browns, chars and burns through paper and scorches the mat, with flame, smoke, sparks and ash. Tidy puts every piece back and mends it.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Wear** | New `lib/wear.ts`: a sheet's outline, the holes burnt in it, a millimetre grid of how charred it is, and its slits, kept in the sheet's own frame; the outline less the holes clips each face (the back mirrored), and two canvases on each face carry the scorch and the slits and embers | Paper is cut and burnt in place, on its own print, and both faces agree. |
| **Pieces** | `components/mat/table.tsx` parts a sheet by laying a copy of it over itself, each clipped to one side of the cut, with each piece turning about its own middle; Tidy brings them home, takes the copies away and fades the damage | The page stays the same HTML underneath; a reload or Tidy leaves it whole. |
| **Torch** | New `lib/torch.ts` and `components/mat/torch.tsx`: a pocket butane torch drawn to scale, a jet drawn as layered cones with particles for flame, smoke, sparks and ash in a canvas over the mat, and scorches in one under it that scrolls with the mat | Burning stays smooth while scrolling, and the canvases are released at rest. |
| **Cuts** | `lib/cuts.ts` lights each cut by which way it faces, wedges it open behind the blade, presses the mat in round the tip, and reports the blade's path to the table | The cut reads as a slit in a material, and paper in its way is cut. |
| **Sound** | `lib/riffle.ts` adds the blade through card, a sheet coming apart, the torch's click and roar, and paper crackling | Still synthesised on the spot, nothing loaded. |

### Detailed Changes

#### Added
- **Cutting paper**: the knife cuts whatever it's drawn across, every layer of a stack. A cut that stops inside a sheet leaves a slit in it; one that goes right across parts it in two along the exact line, the halves easing a hair apart. Pieces can be cut again, moved, thrown and turned over (a piece turned over shows the other side of itself, mirrored, as paper does).
- **The torch**: Knife and Torch in the masthead (or K and T; Escape puts the torch down). With the torch, pressing anywhere on the mat, things included, lights it with a click: a blue jet lands where the pointer is and fans out. Paper under it browns, chars and burns through, the hole's edge glowing and creeping on a little after the flame moves; held there, the hole keeps widening, and the flame reaches through it to whatever is beneath. Paper alight flares orange and smokes; a sheet burnt almost all away falls to ash. On the bare mat it scorches the surface, which glows while it's hot and heals slowly, as the cuts do. On touch screens the mat is held for a moment before the torch lights.
- **Mending**: Tidy brings every piece home, and once all of a sheet is home the pieces join, the holes close and the scorch fades.

#### Changed
- Cuts in the mat are wider and stay open longer; the far wall catches the light more the more squarely the cut faces it, the blade wedges the cut open just behind it, the mat dips round the point, and the point itself is out of sight below the surface.
- The opening hint reads "Cut anything".
- The print viewer opens the whole print when a piece of one is clicked.

### Verification Proof
- `npm run lint` passed with 0 errors (the three existing `<img>` warnings remain).
- `npm run typecheck` passed with 0 errors.
- `npm run build` completed a full production build across all routes.
- Driven with synthetic mouse events in headless Chromium at 1440 px, in the light and dark themes: cuts across and into the business card, a cut through the stack of three prints (all three parted), cutting a turned-over card and turning a piece back, dragging pieces, burning the card and a receipt through, burning through to the mat, scorching the mat, and Tidy mending everything (no pieces, no wear and Tidy hidden afterwards). The masthead's Knife and Torch switch was checked at an iPhone 13 size; touch hold-to-light was not driven.

## [1.5.0] — 2026-10-20

### Summary
The cutting mat is now a self-healing one you can cut: a craft knife, drawn to scale, opens a hairline in the bare mat that closes up behind the blade and fades. Around it, the small things a designer's mat and tools do: crop marks where every thing belongs, things that seat onto them, numbered rulers that follow the pointer, angle guides in the corner, and a postmark on the envelope.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Cuts** | New `lib/cuts.ts`: cuts recorded in mat coordinates with a time to heal per point, drawn into a canvas inside the mat that scrolls with it and is released once everything has healed | The cut stays locked to the mat while scrolling, passes under the paper and over the mat's print, and costs nothing at rest. |
| **Knife** | New `components/mat/knife.tsx`: an X-Acto-style knife with a No. 11 blade as flat-shaded SVG in millimetres, its shadow sheared along its length | It is to scale beside the business card on every screen. |
| **Table** | `components/mat/table.tsx` prints crop marks at each thing's home, seats things dropped near them, numbers the ruler, drives the ruler guides and franks the envelope | Moving things around stays legible and reversible without Tidy. |
| **Sound** | `lib/riffle.ts` adds the blade, a stab, a seat and a postmark | Same few-grains-of-noise foley, nothing loaded. |
| **Styles** | `app/mat.css` adds the cut inks per theme, the blade cursor, the knife, the readout, crop marks, ruler guides and numerals, the angle guides and the postmark | One stylesheet still holds the mat. |

### Detailed Changes

#### Added
- **Cutting the mat**: over the bare mat the pointer is a blade; drag and the knife comes down to scale, leaning into the stroke, and opens a cut with a lit lower lip. It stays open a moment, then heals behind the blade from where it began, like a zip, leaving a faint line that fades. A click is a stab. A readout beside the blade gives the cut's length in millimetres; Shift lays a straight edge at 0°, 45° or 90° and reads off the angle too. Pens cut wider the harder they press. On touch screens the mat is held for a moment before it cuts, so a finger still scrolls it.
- **The knife shows how**: once a visit, after the card has landed, the knife underlines the hint "Cut the mat" (on phones, the foot of the opening), lifts, and the cut heals. Skipped with reduced motion, in a background tab until it is looked at, or once anything has been pressed.
- **Crop marks**: wherever a thing has been taken from, crop marks are printed at its corners until it's back; a ticket's include its stub.
- **Seating**: a thing that comes to rest within a few millimetres of its marks, close to square, is pulled onto them with a soft click.
- **Ruler guides**: the masthead's ruler and the mat's side ruler mark the pointer, and the extent of whatever is held, like a drawing program's.
- **Numbered ruler**: the side ruler is numbered every centimetre down the mat (on windows wide enough to have the margin for it).
- **Angle guides**: 30°, 45° and 60° lines and a quarter arc printed in the mat's bottom corner.
- **Postmark**: the envelope is franked before it opens an email, with the sender's town (from their clock's time zone), the hour and the date; its address link does the same.
- **Tab icon**: the mat itself, "AG" cut from the wordmark's own condensed black face on the green mat and its grid (the black mat in dark mode), in place of the old paper "A"; the web manifest's colours follow.

#### Changed
- The opening hint reads "Cut the mat" (on touch, "Hold the mat to cut it") after the existing two.
- The 404 page is the mat with nothing on it: 404 printed into it like the name, and the place a page would lie marked out with crop marks, empty. Its old paper styles and the unused `.identity-mark` are gone from `app/globals.css`.

### Verification Proof
- `npm run lint` passed with 0 errors (the three existing `<img>` warnings remain).
- `npm run typecheck` passed with 0 errors.
- `npm run build` completed a full production build across all routes.
- Driven with synthetic pointer events at 1440, 800 and 375 px wide, in the light and dark themes: cutting, stabs, Shift straight edges (a wobbly drag ran dead straight at 45° and read it off), the heal (frozen mid-heal and inspected at 6×), the readout, the demo, touch hold-to-cut and the hand-off from scrolling, crop marks, seating, ruler guides and spans, the postmark, and the page's height unchanged while cutting at the very bottom of the mat.

---

## [1.4.0] — 2026-10-20

### Summary
Rebuilt the homepage as a designer's cutting mat with the work laid out on it as printed things, each the object its project's own idea suggests, all of which can be picked up, thrown, turned over, torn, punched and squared back up.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Things** | `components/mat/things.tsx` prints each project as a receipt, approval form, postcard, measured drawing or ticket (picked by `lib/mat.ts` or chosen in the editor), with prints, time cards, an index card and an envelope | Every project reads as its own object, from the same CMS content, still plain HTML in reading order. |
| **Table** | `components/mat/table.tsx` adds paper physics on top of the CSS layout: a held sheet swings about the held point, slides when thrown, turns over, and Tidy springs it home | The page is a document and a toy at once; only transforms change per frame, and things get compositor layers only while moving. |
| **Places** | `components/mat/places.tsx` renders each scenery version live in a postcard with the dot-field engine; clicking one travels there | The scenes are on the mat, not only behind the page curl. |
| **Editor** | A "Printed as" field per project in `/admin`; `artifact` is optional in the content schema | Older content parses unchanged and gets an automatic choice. |
| **Sharing image** | `lib/portfolio-social-image.tsx` draws the top of the mat with static font instances from `assets/fonts/` | Shared links show the new look. |
| **Styles** | New `app/mat.css`; `app/card-file.css`, `components/card-file.tsx` and `components/cards.tsx` removed | One stylesheet for the mat, its stocks and inks. |

### Detailed Changes

#### Added
- **The mat**: a self-healing cutting mat, a centimetre grid heavier every five, rulers down its edge and along the masthead, the name printed into it a word to a line as large as the window allows. Green in the light theme, black in the dark.
- **The business card**: lying across the name and dimensioned on the mat (89 × 51 mm); it turns over to a red back with the initials pressed in blind.
- **Projects as things**: a till receipt in a dot-matrix face with a real Code 128 barcode and a TOTAL line taken from the notes; a carbon approval form, typed in and stamped (the stamp's word follows the status); a postcard with a postmark and a riso two-ink picture side; a measured face-proportion drawing with a title block; an admission ticket with a perforated stub. Photos lie beside each as prints and short films as instant film, playing while in view.
- **Hands**: anything can be picked up by any point and swings about it like paper; thrown, it slides to a stop with paper sounds; a click turns it over. The ticket punches where you click and its stub tears off along the perforation; a time card clocks in at the current Berkeley time; the envelope opens a new email; Tidy appears once anything is out of square and knolls it all back (punch holes stay). Keyboard: every thing is focusable, Enter acts, arrow keys nudge.
- **Experience as time cards**: one per role, the period punched in by the clock.
- **Postcards of places**: the four scenery versions as living postcards in About; picking one up and clicking it turns the mat into that place, franked "Here".
- **Type**: Archivo (variable width), Martian Mono, Doto and Libre Barcode 128 through `next/font`.

#### Changed
- The scenery versions now lay the same paper things over the scene; the printed name is redrawn in the scene's dots.
- The print viewer opens from any print and steps through that project's prints.
- The sharing image is the top of the mat.

#### Removed
- The index-card file (`components/card-file.tsx`, `components/cards.tsx`, `app/card-file.css`) and its scrubber.

### Verification Proof
- `npm run lint` passed with 0 errors (the three existing `<img>` warnings remain).
- `npm run typecheck` passed with 0 errors.
- `npm run build` completed a full production build across all routes.
- Driven in headless Chrome at 1440, 1280, 768 and 390 px wide, in light and dark themes, in three scenery versions and with reduced motion: dragging, throwing, turning over, punching, tearing, clocking in, Tidy, postcard travel, the print viewer and keyboard access, with no console errors.

---

## [1.3.0] — 2026-10-19

### Summary
Rebuilt the homepage as a physical object: the portfolio is now an index-card file you flip through, pull cards from and thumb along, standing in a lit room, with four animated scenery versions behind a peelable page corner.

### Architectural & Functional Highlights
| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Cards** | `components/cards.tsx` builds every card as server-rendered HTML from the live content | Content stays readable, linkable and in reading order for keyboards, screen readers and search; the 3D is presentation only. |
| **Card File** | `components/card-file.tsx` drives a `preserve-3d` stack from the page's own scroll, with one scroll-snap stop per card and springs per card | Native scrolling, keyboard and touch all work; motion is continuous and interruptible, and the front card stays pixel-sharp. |
| **Print Viewer** | Extracted to `components/print-viewer.tsx` from the old frame | Any photo on a pulled card opens full size, with the zoom from and back onto the card. |
| **Scenery** | `components/scenery.tsx` veils the scene only behind the masthead and scrubber, and anchors the scene's subject in the margin beside the cards | The scenes show around solid card stock instead of behind a reading column. |
| **Styles** | New `app/card-file.css`; `app/globals.css` and `app/scenery.css` stripped of the two-column layout | About 1,000 lines of dead layout CSS removed. |

### Detailed Changes

#### Added
- **Scenery versions**: a curled-up page corner at the top left, peeled back by dragging it, turns the portfolio through four extra versions (Chongqing in the rain, the Rockies at dusk, the Great Barrier Reef, San Francisco), each drawn as animated dot "ascii" with the same content restyled to match. The choice is remembered per browser.
- **Page-turn transition**: the old page peels away under the pointer, revealing the live new version beneath; let go past the middle and it turns, otherwise it falls back. Enter or Space turns it in one go (View Transitions; an instant switch where unsupported or with reduced motion).
- **The card file**: the portfolio is now an index-card file. A title card, a manila divider with a tab for each section, and a ruled card for every project, role and note stand one behind another on a brass rod. Scrolling runs a thumb through them: each card tips forward as it passes, settling on one card at a time (scroll snap), and the next card's header shows above the one in front.
  - **Motion**: the thumb follows the scroll on a critically damped spring and every card has springs of its own, so a flick riffles, a card set back upright rocks once before it settles, and the cards drop into the file one by one when the page opens.
  - **Grab to flip**: the front card can be taken by the top and pulled down to flip it; a flick carries on through a card or two.
  - **Depth and light**: the file stands on a lit sweep with a floor shadow and film grain; cards cast shadows up onto the card behind, fade into the room the deeper they sit, and catch a sheen that follows the pointer. The eye drifts with the pointer so the file shows its depth, while the card in front, which sits in the picture plane, stays pin-sharp.
  - **Photos and stamps**: a project's photos are taped to its card, the first on top; roles are date-stamped in worn red ink.
  - **Pull a card**: clicking the front card lifts it out of the file and fans its photos beside it (videos play); a photo then opens in the viewer. Escape, a click elsewhere or a scroll puts it back. On a phone the photos stay tucked behind the card until it is pulled.
  - **Thumb through**: resting the pointer on the file raises a card far enough to read its header; clicking it flips straight there. Arrow keys, links and the section names along the top flip too.
  - **Scrubber**: a rule of ticks along the foot of the window, one per card, with a marker that slides with the thumb, to hover, click or drag through the file, and a card count.
  - **Status marks**: live projects pulse, work in progress turns, wins shine and retired work is hollow.
  - **Sound**: a soft paper flick as each card goes past, synthesised in the browser, with a switch to turn it off.
  - In the scenery versions the cards stay card stock, typed in mono, catch the scene's coloured light on their edges, and the name on the title card is printed in the scene's own dots.

#### Removed
- The two-column index (name column, reading column, image cabinet and spotlight) and its components (`portfolio-frame`, `cabinet`, `project-index`, `experience-index`, `index-navigation`), replaced by the card file.

### Verification Proof
- `npm run lint` passed with 0 errors.
- `npm run typecheck` passed with 0 errors.
- `npm run build` completed a full production build across all routes.
- Driven in headless Chrome at desktop and phone sizes, in light and dark themes, in two scenery versions and with reduced motion: flipping, pulling, thumbing, the photo viewer and the intro; a fast riffle held a 16.7 ms median frame.

---

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
