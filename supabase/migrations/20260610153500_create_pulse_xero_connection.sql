-- Applied to project vmocndzlznzfvuedginn on 2026-06-10 (via Supabase MCP apply_migration).
-- Recorded here so the schema change is in version control. NOTE: this repo does not run
-- the Supabase CLI — schema is managed directly in Supabase; this file documents the
-- applied DDL. The table is Pulse-owned; it does not touch any Dispatch table.
--
-- Pulse-owned Xero OAuth token store. Independent of Dispatch's `xero_connection`
-- so Pulse refreshing its (single-use, rotating) refresh token never invalidates
-- Dispatch's. Single-row table; service-role-only (RLS on, no policies — mirrors
-- xero_connection / pulse_config).
create table if not exists public.pulse_xero_connection (
  id boolean primary key default true,
  tenant_id text,
  tenant_name text,
  refresh_token text,
  access_token text,
  access_expires_at timestamptz,
  connected_at timestamptz,
  updated_at timestamptz default now(),
  constraint pulse_xero_connection_single_row check (id = true)
);

alter table public.pulse_xero_connection enable row level security;
-- No policies: only the service-role key (which bypasses RLS) can read/write.
