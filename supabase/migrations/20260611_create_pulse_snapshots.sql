-- Applied to project vmocndzlznzfvuedginn on 2026-06-11 (via Supabase MCP, with Ben's go-ahead).
-- Pulse-owned daily metric snapshots, so the cockpit can show trends/deltas.
-- One row per day (date is the PK -> upsert on conflict). Service-role only:
-- RLS on, no policies (mirrors pulse_config / pulse_xero_connection). Does NOT
-- touch any Dispatch table.
create table if not exists public.pulse_snapshots (
  date date primary key,
  captured_at timestamptz not null default now(),
  cash numeric,
  receivables numeric,
  overdue numeric,
  working_capital numeric,
  net_equity numeric,
  runway_months numeric,
  weighted_pipeline numeric,
  open_pipeline numeric,
  booked_value numeric,
  committed_count integer
);

alter table public.pulse_snapshots enable row level security;
-- No policies: only the service-role key (which bypasses RLS) can read/write.
