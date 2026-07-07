# EcoSphere Pulse — Technical Brief

*A standalone reference for a developer or AI picking up this repository with no prior context.*

---

## 1. What it is

**EcoSphere Pulse** is a small, single-tenant web app that acts as a **live "cockpit" for the cash and sales position of one business** — EcoSphere Energy, a heat-pump (ASHP = air-source heat pump) and solar installer based in Devon, UK. It pulls the money side from **Xero** (the accounting system: cash, receivables, equity), the forward-sales side from **GoHighLevel** ("GHL", a CRM/pipeline tool), and the delivery side (booked installs, subcontractors) from a **sibling app's database**. From those it computes headline metrics (cash on hand, runway, overdue invoices, weighted pipeline), a 12-month cash-flow forecast, a ranked "what to do" action list, and a plain-English advisor. It also posts a daily digest to **Slack**. It is **strictly read-only — it never moves money or writes to Xero/GHL**; the only things it writes are its own configuration, daily metric snapshots, and assistant chat history in its own database. The sole user is the business owner ("Ben"), who logs in with one shared password.

**Where it sits in the wider system.** The task framing refers to a "Core / Pulse / Dispatch" family of apps. Based *only* on what this repository's code actually references:

- **Pulse** (this repo) is the read-only cash-and-pipeline dashboard.
- **Dispatch** is a separate app — a job/install scheduling system with subcontractor management. Pulse does **not** call Dispatch over an API; instead **the two share one Supabase (Postgres) database**, and Pulse's server code reads Dispatch's tables (`jobs`, `job_offers`, `sub_directory`) directly with a service-role key. See `src/lib/dispatch-jobs.ts` and `src/lib/crew.ts`.
- **"Core"** is named in the task description but **is not referenced anywhere in this codebase**. I cannot describe it from the code, and I'm flagging that rather than guessing.

There are also comments in the code that reference sibling source files — `ghl-opps.ts` and `email.ts` (e.g. at the top of `src/lib/xero.ts`, `src/lib/ghl-pipeline.ts`, `src/lib/slack.ts`). **Those files do not exist in this repo.** They appear to be references to the Dispatch app's code, which Pulse's modules were patterned after. Treat them as historical/aspirational notes, not real dependencies.

---

## 2. Stack & infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript 5.6**, `strict: true` | Path alias `@/*` → `src/*` (see `tsconfig.json`). |
| Framework | **Next.js 14.2** (App Router) | Server Components by default; a few `"use client"` components. |
| UI runtime | **React 18.3** | |
| Styling | **Tailwind CSS 3.4** + `autoprefixer`/`postcss` | Custom theme tokens in `tailwind.config.ts` (e.g. `accent` = teal `hsl(180 70% 35%)`). Utility `cn()` merges classes via `clsx` + `tailwind-merge`. |
| Icons | **lucide-react 0.453** | |
| Database client | **@supabase/supabase-js 2.45** | Server-only, service-role. |
| Database | **Supabase (Postgres)** | **Shared with the Dispatch app.** Pulse owns a handful of tables; the rest belong to Dispatch. |
| Hosting | **Vercel** | `vercel.json` sets framework, build command, and a daily cron. `next.config.mjs` disables ESLint during builds. |
| Tests | **Vitest 4** | Node environment; only the money-critical pure functions are unit-tested. `npm test` runs them. |
| LLM | **Anthropic Messages API** (direct `fetch`) | Used only by the assistant route. Model defaults to `claude-sonnet-4-6`, overridable via `ANTHROPIC_MODEL`. |

**Scripts:** `dev` / `build` / `start` / `lint` / `test` / `test:watch` (standard Next + Vitest).

**Runtime model:** Almost every page and route is `export const dynamic = "force-dynamic"` — nothing is statically cached; each load fetches live from Xero/GHL/Supabase. This is deliberate (the point is a live cockpit) but means every page view triggers several external API calls.

---

## 3. Architecture

### Directory map

```
src/
├── middleware.ts              Auth gate for every route except the open ones
├── app/
│   ├── layout.tsx             Root HTML shell
│   ├── page.tsx               "/" → redirects to /pulse
│   ├── globals.css            Tailwind + a few base styles
│   ├── login/page.tsx         Password form
│   ├── pulse/
│   │   ├── layout.tsx         Nav header shared by all /pulse/* pages
│   │   ├── page.tsx           COCKPIT — headline tiles, insights, funnel, trends
│   │   ├── focus/page.tsx     "This week" — overdue, proposals, unassigned bookings
│   │   ├── forecast/          12-month cash forecast (interactive what-if)
│   │   │   ├── page.tsx           Server: loads live inputs, renders the explorer
│   │   │   ├── forecast-explorer.tsx   Client: sliders, presets, scenario pinning
│   │   │   └── cash-waterfall.tsx      Client: per-month inflow/outflow chart
│   │   ├── installs/page.tsx  Booked jobs from Dispatch, load-vs-capacity
│   │   ├── leads/page.tsx     Pipeline quality: engaged vs noise, by source
│   │   ├── crew/page.tsx      Subcontractors and their assigned jobs
│   │   ├── liabilities/page.tsx  "What you owe" (Owed) — debts from Xero + off-book
│   │   ├── advice/page.tsx    Prioritised recommendations
│   │   ├── assistant/page.tsx Chat UI over live business data
│   │   └── settings/page.tsx  Editable tunables (overheads, thresholds, draw…)
│   └── api/
│       ├── login / logout           Set/clear the session cookie
│       ├── auth/xero/connect         Start Xero OAuth
│       ├── auth/xero/callback        Finish Xero OAuth, store tokens
│       ├── pulse/route.ts            JSON of the full Pulse (buildPulse)
│       ├── ghl/pipelines/route.ts    List GHL pipelines + stage IDs (config helper)
│       ├── assistant/route.ts        LLM chat (GET history / POST message)
│       └── cron/pulse-alert/route.ts Daily Slack digest + snapshot capture
├── components/
│   ├── nav-link.tsx           Active-aware nav link (client)
│   └── ui/card.tsx            The one shared card primitive
└── lib/                       ALL the business logic (see below)
```

### The `lib/` layer — where the real logic lives

The pages are thin; they call into `lib/`. Data-source modules each return a **`configured` flag instead of throwing**, so a missing/unconnected integration degrades gracefully rather than crashing a page.

| Module | Responsibility |
|---|---|
| `supabase.ts` | `createAdminClient()` — the service-role Supabase client. Server-only. Every DB read/write goes through this. |
| `auth.ts` | Single shared-password auth. HMAC-signed session token via Web Crypto (runs in both Edge middleware and Node routes). |
| `xero.ts` | Xero OAuth token handling + the cash side. `getXeroSnapshot()` (cash, receivables, overdue, working capital, net equity), `getBalanceSheetIndex()`, `getOverdueContacts()`. |
| `ghl-pipeline.ts` | The GHL/forward-sales side. `fetchPipelineSummary()` (weighted pipeline), `getProposals()`, `fetchOpportunityValueMap()`, `fetchLeadQuality()`, plus pure helpers `classifyStage()` / `normalizeSource()` / `stageWeight()`. |
| `dispatch-jobs.ts` | Reads Dispatch's `jobs`/`job_offers` tables → `fetchScheduledInstalls()`, and `getCommittedJobs()` for the forecast. |
| `crew.ts` | Reads Dispatch's `sub_directory` + `job_offers` → subcontractors and their bookings. |
| `pulse.ts` | **The action engine.** `buildPulse()` fetches cash + pipeline + config and computes headline metrics + the ranked action list. |
| `forecast.ts` | **The cash-flow model** — a port of a spreadsheet. `buildForecast()` produces a 12-month monthly waterfall; `forecastInputs()`, `toCommittedJobs()`, and the `*_DEFAULTS` constants. |
| `advice.ts` | `buildAdvice()` — turns Pulse + forecast scenarios into prioritised recommendations (used by the Advice page and the assistant). |
| `insights.ts` | `buildInsights()` — a shorter "what this means / what to do" briefing for the cockpit. |
| `liabilities.ts` | `buildLiabilities()` (pure) + `getLiabilities()` — debts from the Xero balance sheet plus hard-coded off-Xero items. |
| `snapshots.ts` | The history layer: `recordSnapshot()` (one row/day), `getSnapshots()`, and the pure `summarizeChange()` / `cashStaleDays()` used for trend lines and deltas. |
| `assistant-context.ts` | `buildBusinessContext()` — assembles every live source into one big text block for the LLM. |
| `slack.ts` | `postSlack()` — fire-and-forget webhook poster. Never throws. |
| `utils.ts` | `cn()` (class merge) and `gbp()` (£ formatter). Note: `pulse.ts`, `advice.ts`, `insights.ts` each define their **own** local `gbp()` too — see gotchas. |

### Data-flow map

```
                 ┌─────────── Xero API (OAuth) ───────────┐
                 │  cash, receivables, balance sheet       │
                 ▼                                         │
   ┌──────────────────────┐                                │
   │  lib/xero.ts          │  tokens ⇄ xero_connection      │
   └──────────┬───────────┘         (Supabase)             │
              │                                             │
GHL API ─► lib/ghl-pipeline.ts ─┐                           │
              │                 │                           │
Supabase ─► lib/dispatch-jobs.ts┤                           │
(Dispatch    lib/crew.ts        │                           │
 tables)     lib/snapshots.ts   │                           │
                                ▼                           │
                        ┌───────────────┐   pulse_config    │
                        │  lib/pulse.ts │◄──(Supabase)       │
                        │  buildPulse() │                    │
                        └───────┬───────┘                    │
                    metrics+actions │                        │
            ┌───────────────────────┼───────────────────┐   │
            ▼                       ▼                    ▼   │
   lib/forecast.ts          lib/insights.ts       lib/advice.ts
   (12-mo model)            (cockpit briefing)     (recommendations)
            │                       │                    │
            └───────────┬───────────┴─────────┬──────────┘
                        ▼                      ▼
              Pages (Server Components)   api/assistant  ──► Anthropic API
              render tiles/charts         (context block)
                        │
                        ▼
             api/cron/pulse-alert ──► Slack  &  writes pulse_snapshots
```

Reads generally run **sequentially, not in `Promise.all`**, inside `buildPulse()` — a deliberate workaround (comment in `pulse.ts`) for concurrent Supabase reads intermittently returning empty on this serverless setup and making a live Xero connection look unconfigured.

---

## 4. Data model

Pulse **owns** four tables (all RLS-enabled with **no policies**, so only the service-role key — which bypasses RLS — can touch them). It also **reads** tables owned by Dispatch in the same database.

### Pulse-owned tables (see `supabase/migrations/`)

**`xero_connection`** — single-row OAuth token store (`0001_pulse.sql`).
| Field | Meaning |
|---|---|
| `id boolean PK default true` | Singleton guard (`check (id)`) — only one row ever. |
| `tenant_id`, `tenant_name` | The connected Xero organisation. |
| `refresh_token` | **Rotated by Xero on every refresh** — must always be persisted or the connection dies. |
| `access_token`, `access_expires_at` | Short-lived (~30 min) cached access token. |
| `connected_at`, `updated_at` | Timestamps. |

**`pulse_config`** — single-row tunables driving the action engine and forecast (`0001` + `0002`).
| Field | Drives |
|---|---|
| `monthly_overheads` | Runway = available cash ÷ this. |
| `low_runway_months` (default 3) | Alert threshold for runway. |
| `overdue_alert_gbp` | Alert threshold for overdue receivables. |
| `pipeline_target_gbp` | Weighted-pipeline target → gap action. |
| `capital_on_tap_gbp` | Confirmed facility headroom, added to cash for liquidity/runway. |
| `opening_cash_gbp` *(0002)* | Forecast opening-cash override (0 = use live Xero cash). |
| `owner_drawings_gbp` *(0002)* | Owner's monthly take-home; seeds the forecast draw slider. |

Seeded with one row (`insert … on conflict do nothing`) so the settings UI always has something to edit.

**`pulse_snapshots`** — daily metric history (`20260611_create_pulse_snapshots.sql`). PK = `date`, so `recordSnapshot()` upserts one row per day. Columns: `cash, receivables, overdue, working_capital, net_equity, runway_months, weighted_pipeline, open_pipeline, booked_value, committed_count` + `captured_at`. Powers the cockpit sparklines, "what changed" deltas, and the stale-cash flag.

**`pulse_assistant_messages`** — chat history for the assistant (`role`, `content`, `created_at`). **No migration exists for this table** — the assistant route creates rows only if it already exists and silently no-ops otherwise (`src/app/api/assistant/route.ts`). If you want persisted chat, you must create this table yourself.

### Dispatch-owned tables Pulse reads (shape inferred from the `select`s — no migrations here)

- **`jobs`** — install jobs. Fields used: `id, client_name, postcode, job_type, status, bus_status, intended_start_date, start_time, pricing_mode, fixed_price_pence, estimated_days, day_rate, ghl_opportunity_id, created_at`. `job_type` is an enum whose ASHP value is `ashp_install` (matters for BUS-grant eligibility). `status` is an enum with terminal values `declined / expired / completed`.
- **`job_offers`** — subcontractor offers per job. Fields used: `job_id, subcontractor_id, chosen_date, proposed_dates[], withdrawn_at`. An accepted offer has a `chosen_date`; withdrawn offers have `withdrawn_at` set.
- **`sub_directory`** — a secured **view** of subcontractors. Fields used: `id, name, status, trades` (trades may arrive as a Postgres array or a `{a,b}` string — `crew.ts` normalises both).

### How entities relate (and to shared data)

- A **`jobs` row** links to a **GHL opportunity** via `ghl_opportunity_id`. Because the customer's deal value lives in GHL (Dispatch's `day_rate` is operational), `dispatch-jobs.ts` prefers `fetchOpportunityValueMap()` (GHL) for a job's £ value, falling back to Dispatch pricing.
- A **`jobs` row** gets its confirmed install date from an accepted **`job_offers.chosen_date`** when `intended_start_date` isn't set on the job itself.
- A **subcontractor** (`sub_directory`) links to jobs through accepted `job_offers`.
- Scheduled jobs → forecast: `toCommittedJobs()` converts each dated job into a "committed job" (75% customer cash on the install month; a BUS grant ~2 months later for `ashp_install`).
- `xero_connection` ↔ `xero.ts` is the only stateful integration coupling; everything else in `pulse_config`/`pulse_snapshots` is Pulse-internal.

---

## 5. Integrations

All external credentials are **environment variables** (see `.env.example`); there is no secrets manager. Set them in Vercel.

| Service | Used for | Auth / keys | Where |
|---|---|---|---|
| **Supabase (Postgres)** | Pulse's own tables **and** reading Dispatch's tables. | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role — **server-only, bypasses RLS**). | `lib/supabase.ts` |
| **Xero** (Accounting API) | Cash, receivables/overdue, balance sheet (working capital, net equity, liabilities). | OAuth2. `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` / `XERO_REDIRECT_URI`. Tokens stored in `xero_connection`; refresh token rotates every refresh. Scopes requested include `accounting.contacts.read`, `accounting.reports.balancesheet.read`, `accounting.reports.profitandloss.read`. | `lib/xero.ts`, `api/auth/xero/*` |
| **GoHighLevel** (LeadConnector API, `services.leadconnectorhq.com`, `Version: 2021-07-28`) | Open pipeline, weighted forecast, proposals, lead-quality, deal values. | Bearer token `GHL_API_KEY` + `GHL_LOCATION_ID`. Optional: `GHL_SALES_PIPELINE_ID`, `GHL_SURVEY_PIPELINE_ID`, `GHL_STAGE_WEIGHTS` (JSON stage-id→weight overrides). Falls back to `GHL_INSTALL_PIPELINE_ID` (a var this repo never sets). | `lib/ghl-pipeline.ts`, `api/ghl/pipelines` |
| **Slack** | Daily digest of flagged actions. | Incoming-webhook URL `SLACK_WEBHOOK_URL`. No-op if unset. | `lib/slack.ts`, `api/cron/pulse-alert` |
| **Anthropic** | The advisor chat. | `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`). If unset, the assistant returns a friendly "not switched on" message. | `api/assistant` |
| **Vercel Cron** | Fires `GET /api/cron/pulse-alert` daily at 06:00 UTC (`vercel.json`). | Endpoint self-guards with `Authorization: Bearer $CRON_SECRET`. | `vercel.json`, `api/cron/pulse-alert` |

Other env: `PULSE_PASSWORD` (login), `PULSE_SESSION_SECRET` (cookie signing — falls back to the password, then `"dev-secret"`), `NEXT_PUBLIC_SITE_URL`.

---

## 6. Key workflows

### A. Login & auth gate
1. Middleware (`src/middleware.ts`) runs on every request. Open paths: `/login`, `/api/login`, `/api/cron/*`, `/_next`, `favicon`. Everything else requires a valid session.
2. `/login` posts the password to `/api/login`. `checkPassword()` compares (constant-time) against `PULSE_PASSWORD`.
3. On success, `makeToken()` mints `"{issuedMs}.{HMAC-SHA256(issuedMs)}"` and sets it as an httpOnly cookie (`pulse_session`, 30-day max age). `verifyToken()` re-derives the HMAC and checks age.
4. `/api/logout` clears the cookie. **Note:** `/api/cron/*` is intentionally outside the auth gate (it's protected by `CRON_SECRET` instead), and Xero OAuth callback is *not* in the open list — but the OAuth flow starts from an authenticated session so the cookie is present.

### B. Connecting Xero (OAuth) and reading cash
1. Cockpit shows a "Connect Xero" button when `xero.configured` is false → `GET /api/auth/xero/connect`.
2. That builds the Xero authorize URL (scopes joined with spaces, hand-encoded so they become `%20` — Xero rejects the `+` that `URLSearchParams` would emit), sets a `xero_oauth_state` cookie, and redirects to Xero.
3. Xero redirects back to `/api/auth/xero/callback`. It checks `state` against the cookie, exchanges the code for tokens, calls `https://api.xero.com/connections` for the tenant id, and **upserts** the single `xero_connection` row. Redirects to `/pulse?xero=connected` (or `…=error&detail=…`).
4. Thereafter `getAuth()` in `xero.ts` reuses the cached access token until ~2 min before expiry, then refreshes. Concurrent refreshes are collapsed via an in-process `refreshInFlight` single-flight (because the refresh token is single-use and rotates). The rotated tokens are persisted every time.
5. `getXeroSnapshot()` pulls **receivables/overdue** by paging `/Contacts` (each contact's `Balances.AccountsReceivable`), and **cash / working capital / net equity** from `/Reports/BalanceSheet` (walked recursively and indexed by lowercased row title, taking the last numeric cell). If the balance-sheet report isn't permitted, those three stay `null` and the UI shows a "pending Xero permission" note. *(See the caveat in code: reports may not be entitled for the app.)*

### C. Building the Pulse (metrics + actions)
1. `buildPulse()` calls `getXeroSnapshot()`, `loadConfig()` (from `pulse_config`), `fetchPipelineSummary()` — **sequentially**.
2. It computes: overheads used (config or the model default £8,850), cash-for-runway (live cash or the £45,000 model placeholder — flagged as an estimate), available liquidity (cash + `capital_on_tap_gbp`), runway months, and the pipeline gap vs target.
3. It builds a **ranked action list**: connection gaps (Xero/pipeline not connected), low runway (critical if below half the floor), overdue receivables, negative working capital, pipeline below target. Actions carry `severity` (`critical`/`warning`/`info`) and are sorted by it. If nothing trips, an "All clear" info action is added.
4. Pages render this directly; `insights.ts` and `advice.ts` layer richer narrative on top of the same `Pulse` object.

### D. The 12-month cash forecast
1. `forecast/page.tsx` (server) loads live Xero cash/receivables/overdue, the config overrides, and **live committed jobs** from Dispatch (`getCommittedJobs()`), then hands them to the client `ForecastExplorer`.
2. `buildForecast()` (`lib/forecast.ts`) is a **deterministic port of `EcoSphere_Cashflow_Model.xlsx`** (the spreadsheet is *not* in the repo — see `docs/forecast-model.md`). It walks 12 months from "now", chaining `opening → + inflows − outflows → closing`. Drivers (marketing, seasonality, engaged %) are indexed by calendar month; costs include COGS (65%), DNO/MCS per install, bank fees (2.27%), the Funding Circle loan (£2,761.78/mo), owner drawings, one-offs (MCS renewal, corporation tax, accountant), etc.
3. **Committed Dispatch jobs share capacity with the marketing funnel** so a booked install isn't counted twice (once committed, once as a funnel "new win") — a bug fixed 12 Jun 2026 and pinned by the golden-master test.
4. The explorer lets the user toggle **owner draw, marketing scale, hire-an-installer, and edit model figures** as session-only "what-if" overrides, and pin scenarios to compare. `CashWaterfall` renders the per-month inflow/outflow breakdown.
5. Output is pinned by `forecast-golden.test.ts` (exact values for `now=2026-06-01`) so any accidental drift fails CI. `forecast.test.ts` checks internal consistency (breakdown sums = totals, BUS timing, etc.).

### E. Daily Slack digest (cron)
1. Vercel cron hits `GET /api/cron/pulse-alert` at 06:00 UTC with the `CRON_SECRET` bearer token (the handler rejects anything else).
2. It runs `buildPulse()`, then **best-effort** records today's `pulse_snapshots` row (with booked-install totals from Dispatch).
3. It filters actions to warning/critical; if none, it posts nothing. Otherwise it formats a headline (cash · runway · overdue · weighted pipeline) plus one line per flagged action and posts to Slack.

### F. The assistant (LLM advisor)
1. Client chat page (`assistant/page.tsx`) loads saved history from `GET /api/assistant`, then POSTs the running message list.
2. The route builds a large live-data context via `buildBusinessContext()` (cash, pipeline, overdue list, proposals, scheduled installs, forecast scenarios, crew, debt summary, current advice) and prepends a strict system preamble ("read-only advisor, ground every claim in the data, not an accountant").
3. It calls the Anthropic Messages API, returns the reply, and best-effort persists the exchange. Markdown is rendered with a small **escape-first** formatter (injection-safe) on the client.

---

## 7. Conventions & gotchas

- **`configured` flag, never throw.** Every data-source function returns `{ configured, …, error? }` and swallows failures so one dead integration can't take down a page. Follow this pattern for any new source.
- **Everything is `dynamic = "force-dynamic"`.** No caching; each page load hits the live APIs. Adding a heavy page multiplies external calls — be mindful.
- **Sequential Supabase reads on purpose.** `buildPulse()` deliberately avoids `Promise.all` for its Supabase reads (parallel reads were coming back empty on this serverless setup). Don't "optimise" it back to parallel without re-testing.
- **Xero refresh-token rotation is fragile.** The refresh token is single-use; the in-process single-flight only dedupes within one serverless instance. Cross-instance concurrent refreshes remain possible (comment acknowledges this). If Xero auth mysteriously dies, suspect a rotation race.
- **Balance-sheet parsing is heuristic.** `xero.ts` matches rows by lowercased **substring** of the title (`"total bank"`, `"total equity"`, etc.) and `liabilities.ts` matches exact keys like `"british airways american expre"` (note the truncation) and `"hire purchase - gl18nld"`. These are brittle to Xero renaming accounts.
- **Stage classification is name-based, not ID-based.** `stageWeight()` and `classifyStage()` (`ghl-pipeline.ts`) infer pipeline meaning from **stage-name regex** against real EcoSphere stage names (emoji and all). Renaming a GHL stage can silently change weights. Per-stage overrides go in `GHL_STAGE_WEIGHTS`.
- **Duplicated `gbp()`.** There's a shared `gbp()` in `lib/utils.ts` **and** near-identical private copies in `pulse.ts`, `advice.ts`, `insights.ts`, `assistant-context.ts` (the utils one returns `"—"` for null; the private ones return `"£0"` or `"unknown"`). Check which you're using.
- **Hard-coded business facts.** Many figures are baked into code, not config: model constants in `forecast.ts` (avg job £15,492, capacity 13/mo, BUS £9,000…), off-Xero liabilities in `liabilities.ts` (Funding Circle £55,588, corporation tax £13,000), the £8,850 / £45,000 model fallbacks in `pulse.ts`. Dates like the Funding Circle loan window (Jul-2026→Jun-2028) are literal. These will age and need manual updates.
- **`pulse_assistant_messages` has no migration.** Persistence silently no-ops until you create the table (see §4).
- **Dangling references in comments.** `ghl-opps.ts` and `email.ts` are referenced but don't exist here (they live in Dispatch). Don't go looking for them in this repo.
- **`GHL_INSTALL_PIPELINE_ID` fallback** is read in three places but is not in `.env.example` — a leftover from the Dispatch lineage.
- **Two GBP/formatting + date conventions.** Dates from Dispatch are `YYYY-MM-DD` strings; code appends `"T00:00:00"` before `new Date()` to avoid timezone drift. Follow that.
- **Auth secret fallback.** `PULSE_SESSION_SECRET` falls back to `PULSE_PASSWORD` then `"dev-secret"` — fine for a single-user tool, but don't treat this as hardened multi-user auth.
- **The nurture-pipeline work is done in GHL's UI, not code.** `docs/ghl-nurture-pipeline.md` documents an operational cleanup (auto-ejecting dead leads to a Nurture pipeline) that keeps Pulse's numbers honest with **zero code change** — Pulse just reads the cleaner pipeline.

---

## 8. Current state & open work

**Built and stable:**
- Auth gate, Xero OAuth connect/refresh, and the read of receivables/overdue.
- `buildPulse()` metrics + action engine; the cockpit with tiles, sparklines, "what changed" deltas, stale-cash flag, sales funnel, and insights.
- The forecast engine — well-tested (golden master + invariant tests) and wired to live committed Dispatch jobs.
- Pages: This week, Forecast, Installs, Leads (pipeline quality + by-source), Crew, Owed (liabilities), Advice, Assistant, Settings.
- Daily Slack digest + daily snapshot capture via cron.
- Unit tests cover the money-critical pure functions: `forecast` (12 + 6 golden), `ghl-pipeline` classification, `insights`, `liabilities`, `snapshots`. (No tests for `pulse.ts`, `xero.ts` parsing, or any UI.)

**Known-incomplete / caveats (all stated in the code or docs):**
- **Cash, working capital, net equity may be `null`** — they need the Xero balance-sheet *reports* permission, which the comments say the app "is not yet entitled to." Until granted, runway uses the £45,000 model placeholder and is flagged as an estimate. This is the single biggest open item; several UI notes point at it.
- **The forecast port has not been reconciled cell-for-cell** against the source spreadsheet (`docs/forecast-model.md` warns this explicitly) — tests prove internal consistency and no-drift, not fidelity to the original sheet.
- **Assistant chat persistence** requires manually creating `pulse_assistant_messages`.
- **Lead-quality counts are a floor** when the open pipeline exceeds the page cap (`truncated_open` surfaces a warning in the UI).

**Planned / suggested (from docs & comments):**
- The GHL nurture/auto-eject automation (built in GHL's UI, per `docs/ghl-nurture-pipeline.md`), plus a follow-up "Nurture pool: N leads" read in Pulse so cold leads stay visible without padding the funnel.
- Comments repeatedly note that the deterministic `advice`/`insights` engines are designed so an **LLM advisor can later layer on top of the same inputs** (partly realised by the assistant).
- Auth is explicitly described as "swappable for Supabase Auth later."

---

*Everything above is drawn from the code in this repository as of the current branch. Where the code was silent (notably the "Core" app, the Dispatch schema's full definition, and the source spreadsheet) that has been called out rather than guessed.*
