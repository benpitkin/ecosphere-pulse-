-- =============================================================================
-- Migration 0003 — Pulse: Solar on Steroids (SoS) ROI & commission module
-- =============================================================================
-- Adds the storage for the SoS performance-marketing module:
--   * pulse_sos_config  — single-row deal parameters + engine switches
--   * pulse_sos_deals   — the commission ledger: one row per Closed Transaction
--   * pulse_sos_leads   — attribution audit trail (source/UTM/capture/evidence)
--
-- Same trust model as the other Pulse tables: RLS ON, no policies, so only the
-- service-role client in server code can read/write. Nothing here touches any
-- Dispatch table.
--
-- Money rules encoded downstream (see docs/pulse-sos-module-plan.md §5):
--   * commission_ex_vat = commission_pct * tdv_ex_vat  (nothing netted but VAT)
--   * Closed Transaction = binding agreement AND first payment received
--   * 180-day attribution window from the MOST RECENT capture event
--   * tdv_includes_bus toggle is UNCONFIRMED pending SoS (defaults to excluding BUS)
-- =============================================================================

-- --- deal parameters + engine switches (single row) --------------------------
create table if not exists public.pulse_sos_config (
  id                       boolean primary key default true,          -- singleton guard
  retainer_gbp             numeric(12,2) default 2000,   -- £/mo ex-VAT (SOW §2.1)
  ad_spend_gbp             numeric(12,2) default 2500,   -- monthly Meta spend (min)
  commission_pct           numeric(6,4)  default 0.02,   -- 2% of TDV (SOW §3.3)
  vat_rate                 numeric(6,4)  default 0.20,   -- shown as a cashflow line
  attribution_window_days  integer       default 180,    -- SOW §3.5
  tdv_includes_bus         boolean       default false,  -- §B.1 — UNCONFIRMED pending SoS
  commencement_date        date,                          -- retainer start
  termination_date         date,                          -- drives §3.6 survival window
  updated_at               timestamptz default now(),
  constraint pulse_sos_config_singleton check (id)
);

-- Seed the singleton so the UI always has something to edit.
insert into public.pulse_sos_config (id) values (true) on conflict (id) do nothing;

-- --- commission ledger: one row per attributed Closed Transaction -------------
create table if not exists public.pulse_sos_deals (
  id                     uuid primary key default gen_random_uuid(),
  ghl_opportunity_id     text,                          -- link back to GHL
  dispatch_job_id        uuid,                          -- link back to a Dispatch job
  customer_name          text,

  -- Total Deal Value components (SOW §3.1) — gross, before ALL deductions, ex-VAT.
  tdv_solar              numeric(12,2) default 0,
  tdv_battery            numeric(12,2) default 0,
  tdv_ancillary          numeric(12,2) default 0,
  tdv_upgrades           numeric(12,2) default 0,
  tdv_additional         numeric(12,2) default 0,
  bus_grant_gbp          numeric(12,2) default 0,       -- held separately for the tdv_includes_bus toggle

  -- Closed Transaction trigger (SOW §3.2): binding agreement AND first payment.
  binding_agreement_date date,
  first_payment_date     date,                          -- the commission trigger (manual today)
  most_recent_capture_at date,                          -- §3.5 window anchor (most recent, not first)

  -- Attribution (SOW §3.4) + evidence for the §3.4 dispute case.
  attribution_source     text,                          -- platform / UTM / CRM / SoS
  attribution_evidence   jsonb,
  disputed               boolean default false,
  dispute_evidence       text,

  would_have_won_anyway  boolean default false,         -- §C incrementality (still owed either way)

  invoice_status         text default 'owed',           -- owed / invoiced / paid
  notes                  text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- --- attribution audit trail: per attributed lead ----------------------------
create table if not exists public.pulse_sos_leads (
  id                     uuid primary key default gen_random_uuid(),
  ghl_contact_id         text,
  ghl_opportunity_id     text,
  deal_id                uuid references public.pulse_sos_deals(id) on delete set null,
  source                 text,
  campaign               text,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  utm_content            text,
  utm_term               text,
  first_capture_at       timestamptz,
  most_recent_capture_at timestamptz,                   -- §3.5 anchor
  sos_attributed         boolean default false,
  evidence               jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists pulse_sos_deals_first_payment_idx on public.pulse_sos_deals (first_payment_date);
create index if not exists pulse_sos_leads_deal_idx on public.pulse_sos_leads (deal_id);

-- Lock everything to the service-role key (RLS on, no policies) — same as pulse_config.
alter table public.pulse_sos_config enable row level security;
alter table public.pulse_sos_deals  enable row level security;
alter table public.pulse_sos_leads  enable row level security;
