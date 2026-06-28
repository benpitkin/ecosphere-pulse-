-- Solar planner quotes — persisted when a customer submits the wizard.
-- Each row is one quote submission; roofs and addons stored as JSON blobs.
create table if not exists solar_quotes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- quote identity
  ref               text not null,        -- e.g. "ECO-AB1C2D"
  address           text,
  lat               numeric(10,7),
  lng               numeric(10,7),

  -- system design
  roofs_json        jsonb,                -- CoreRoof[]
  package_id        text,                 -- "ess" | "plus" | "pro"
  annual_bill_gbp   integer,
  annual_usage_kwh  integer,
  addons_json       jsonb,                -- Record<addonId, qty>

  -- lead
  customer_name     text,
  customer_email    text,
  customer_phone    text,

  -- CRM sync
  ghl_contact_id    text,                 -- populated by background sync
  synced_at         timestamptz
);

-- RLS: permissive (internal tool, trusted staff only — see rls-single-tenant-decision memory)
alter table solar_quotes enable row level security;
create policy "allow_all" on solar_quotes using (true) with check (true);
