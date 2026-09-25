# Aiden Guan — index portfolio

A restrained, text-first portfolio for Aiden Guan.

## Edit the portfolio

Update `content/portfolio.ts` for the profile, section headings, links, projects,
experience, about copy, and interests. The page layout lives in `app/page.tsx`.

## Browser editor

The deployed site includes a private editor at `/admin`. Add an
`ADMIN_PASSWORD` environment variable to the Vercel project before opening it.
The editor saves content to the connected private Vercel Blob store; changes
appear on the public page without another code deploy.

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm run lint
npm run typecheck
npm run build
```

Set `NEXT_PUBLIC_SITE_URL` to the production origin for canonical metadata and
the generated sitemap. Vercel deployments automatically use
`VERCEL_PROJECT_PRODUCTION_URL` when it is available.
