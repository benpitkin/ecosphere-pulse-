-- =============================================================================
-- Migration 0035 — Pulse: live cash + pipeline cockpit
-- =============================================================================
-- Adds the storage Pulse needs:
--   * xero_connection  — single-row OAuth token store for the Xero connection.
--                        Xero rotates the refresh token on every refresh, so we
--                        persist the latest one here. Service-role only.
--   * pulse_config     — single-row tunables that drive the action engine
--                        (monthly overheads for runway, alert thresholds).
--
-- Both tables are locked down: RLS on with no policies, so only the
-- service-role client in server code can read/write them — same trust model
-- as the GHL secrets in env.
-- =============================================================================

create table if not exists public.xero_connection (
  id                boolean primary key default true,          -- single-row guard
  tenant_id         text,                                      -- Xero organisation (tenant) id
  tenant_name       text,
  refresh_token     text,                                      -- rotated on every refresh
  access_token      text,                                      -- short-lived cache (~30 min)
  access_expires_at timestamptz,
  connected_at      timestamptz,
  updated_at        timestamptz default now(),
  constraint xero_connection_singleton check (id)
);

create table if not exists public.pulse_config (
  id                  boolean primary key default true,
  monthly_overheads   numeric(12,2) default 0,   -- £/month fixed burn, drives runway
  low_runway_months   numeric(5,1)  default 3,   -- alert when runway dips below this
  overdue_alert_gbp   numeric(12,2) default 0,   -- alert when overdue receivables exceed this
  pipeline_target_gbp numeric(12,2) default 0,   -- weighted-pipeline target for the period
  capital_on_tap_gbp  numeric(12,2) default 0,   -- manually-confirmed facility headroom (mirrors spreadsheet B9)
  updated_at          timestamptz default now(),
  constraint pulse_config_singleton check (id)
);

-- Seed the singleton config row so the UI always has something to edit.
insert into public.pulse_config (id) values (true) on conflict (id) do nothing;

alter table public.xero_connection enable row level security;
alter table public.pulse_config    enable row level security;
