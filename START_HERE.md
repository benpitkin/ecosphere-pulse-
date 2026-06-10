# START HERE — EcoSphere Pulse session brief

You are picking up **EcoSphere Pulse**, a live cash + pipeline + operations cockpit for EcoSphere
Energy (ASHP heat-pump & solar installer, Devon UK; owner Ben). This file orients you. Read it first,
then the docs it points to, then do the analysis task at the bottom **before changing any code**.

## Read these, in order
1. **`CLAUDE.md`** (repo root) — stack, commands, critical rules, key files, business facts.
2. **`docs/HANDOVER.md`** — full architecture, file-by-file map, Supabase schema, env vars, domain
   knowledge, completed work, backlog, and a first-checkout verification checklist.
3. **`README.md`** — how to run, build, deploy.
4. **`.env.example`** — required env-var names (values come from Vercel, never committed).

## What this project is (one paragraph)
Next.js 14 (App Router, RSC) + TypeScript + Tailwind, on Vercel (auto-deploys from `main`). Every page
is **live on load** (`force-dynamic`), re-fetching from **Xero** (cash/receivables/balance sheet),
**GoHighLevel** (pipeline), and **Supabase** (Dispatch jobs, crew, config, assistant log — project
ref `vmocndzlznzfvuedginn`, **shared with the Dispatch app**). An AI assistant uses the Anthropic API.

## Critical rules (do not break)
- **Always `npm run build` before pushing** — esbuild (the old workflow) didn't typecheck and broke
  the Vercel build twice. A clean local build is the contract for pushing to `main`.
- Keep server components `force-dynamic` (removing it serves stale data).
- Supabase is **shared with Dispatch** — don't alter/drop shared tables without checking Dispatch.
- `sub_directory` view is **service-role-only**.
- Never commit secrets; pull env values from Vercel.

## Current situation (as of 10 Jun 2026)
- All 25 build-backlog items are **done** (see HANDOVER §10).
- The **Capital on Tap card is cleared (£0)** — refinanced to a **Funding Circle loan: £2,761.78/mo,
  24 months, ends 04 Jun 2028.** This is reflected across `forecast.ts`, `liabilities.ts`,
  `advice.ts`, `assistant-context.ts`, and `pulse_config`. Any doc/screenshot showing CoT as a
  ~£51,644 debt is stale.
- Live Xero snapshot (sanity-check the app against these): cash £19,477 · receivables £25,417 ·
  overdue £6,247 (4 invoices) · working capital £129,781 · CoT £0 · net equity £114,997.
- This repo was just migrated from a GitHub-web-UI workflow into local/Claude Code development. The
  handover was written from working knowledge, so some paths/symbols are marked **[VERIFY]** — the
  repo is the source of truth.

## Your first task: analyse the current situation (read-only)
Do NOT edit code yet. Produce a short written assessment covering:

1. **Repo reality vs handover.** Run the HANDOVER §14 verification checklist. List any mismatches
   between the docs and the actual code/tree (file paths, symbol names, env-var names — search
   `process.env.` to confirm the real set).
2. **Build health.** Run `npm install` then `npm run build`. Report whether it passes; if not, list
   the TypeScript/build errors (these are exactly what the move to local builds is meant to catch).
3. **Data-layer sanity.** Confirm in code that: `FC_LOAN_PAYMENT = 2761.78` and the finance-line
   month logic in `forecast.ts`; the BUS heat-pump rule; `pulse_config` is read correctly; the
   Supabase ref and service-role usage; the proposals chase-score in `ghl-pipeline.ts`.
4. **Risks & quick wins.** Flag anything fragile (type-safety gaps, shared-Supabase hazards, missing
   CI typecheck, stale CoT references anywhere in code/UI/docs) and propose a prioritised next-steps
   list — but make no changes until I confirm.

Output the assessment as a concise report, then wait for my go-ahead before touching code.
