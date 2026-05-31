# EcoSphere Pulse

Standalone live cash + pipeline cockpit (Next.js 14 + Supabase + Vercel).
Reads Xero (cash, receivables, equity) and GHL (pipeline), computes runway and a
ranked action list, posts a daily Slack digest. Read-only — never moves money.

## Setup
1. Create a Supabase project; run `supabase/migrations/0001_pulse.sql` in the SQL editor.
2. Create a Xero app (developer.xero.com), Web app, redirect URI `<site>/api/auth/xero/callback`.
3. Set env vars (see `.env.example`) in Vercel.
4. Deploy. Visit `/login`, enter `PULSE_PASSWORD`, then on `/pulse` click Connect Xero.
5. Set your numbers in `/pulse/settings`.
6. Optional: schedule `GET /api/cron/pulse-alert` daily with `Authorization: Bearer $CRON_SECRET`.
