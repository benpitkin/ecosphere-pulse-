# EcoSphere Pulse

Live cash + pipeline + operations cockpit for **EcoSphere Energy** (ASHP heat-pump & solar
installer, Devon UK). Every page is live on load — it re-fetches Xero, GoHighLevel, and Supabase on
each request.

- **Production:** https://ecosphere-pulse.vercel.app (password-gated)
- **Full context:** see [`docs/HANDOVER.md`](docs/HANDOVER.md). Claude Code context lives in
  [`CLAUDE.md`](CLAUDE.md).

## Stack

Next.js 14 (App Router, React Server Components) · TypeScript · Tailwind CSS · Supabase (Postgres) ·
Vercel · Anthropic API.

## Running locally

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#    then fill .env.local with values from Vercel → Settings → Environment Variables

# 3. Start the dev server
npm run dev
#    open http://localhost:3000 (you'll hit the /login gate — use the Pulse access password)
```

## Building & deploying

```bash
# ALWAYS run a full build before pushing — it typechecks the whole app.
npm run build

# Deploy: commit and push to main; Vercel auto-deploys from the main branch.
git add -A
git commit -m "your message"
git push origin main
```

> ⚠️ **Always `npm run build` before pushing.** TypeScript-only errors do not surface in a syntax
> check and will fail the Vercel build. A clean local build is the contract for pushing to `main`.

## Project layout

```
src/
  lib/        data + domain logic (xero, ghl-pipeline, dispatch-jobs, crew,
              forecast, liabilities, advice, assistant-context)
  app/
    pulse/    UI pages: cockpit, focus (This week), installs, liabilities,
              crew, forecast, settings  (layout.tsx = nav)
    api/      pulse (JSON snapshot) + assistant (Anthropic) route handlers
```

## Notes for contributors

- Server components are `export const dynamic = "force-dynamic"` so data stays live — keep it that way.
- **Supabase (`vmocndzlznzfvuedginn`) is shared with the Dispatch app.** Coordinate any schema change.
- The `sub_directory` view is service-role-only; reads return nothing with the anon key.
- Never commit secrets. `.env.local` is gitignored; `.env.example` lists names only.
