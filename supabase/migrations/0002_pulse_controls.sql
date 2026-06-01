-- Migration 0002 — extra Pulse controls
alter table public.pulse_config
  add column if not exists opening_cash_gbp   numeric(12,2),
  add column if not exists owner_drawings_gbp numeric(12,2);
