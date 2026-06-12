// ---------------------------------------------------------------------------
// Daily metric snapshots — the history layer behind the cockpit's trend lines.
// One row per day in `pulse_snapshots` (Pulse-owned, service-role only). The
// cron writes today's row; the cockpit reads the recent series for sparklines.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase";
import type { Pulse } from "@/lib/pulse";

export interface MetricSnapshot {
  date: string;
  cash: number | null;
  receivables: number | null;
  overdue: number | null;
  working_capital: number | null;
  net_equity: number | null;
  runway_months: number | null;
  weighted_pipeline: number | null;
  open_pipeline: number | null;
  booked_value: number | null;
  committed_count: number | null;
}

const COLS =
  "date, cash, receivables, overdue, working_capital, net_equity, runway_months, weighted_pipeline, open_pipeline, booked_value, committed_count";

/** Upsert today's metric snapshot (one row per day, keyed on date). Best-effort. */
export async function recordSnapshot(
  pulse: Pulse,
  booked: { value: number; count: number },
): Promise<void> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return; // Supabase not configured — skip silently.
  }
  const m = pulse.metrics;
  const p = pulse.pipeline;
  const today = new Date().toISOString().slice(0, 10);
  await admin.from("pulse_snapshots").upsert(
    {
      date: today,
      captured_at: new Date().toISOString(),
      cash: m.cash,
      receivables: m.receivables,
      overdue: m.overdue,
      working_capital: m.working_capital,
      net_equity: m.net_equity,
      runway_months: m.runway_months,
      weighted_pipeline: p.configured ? p.weighted_value : null,
      open_pipeline: p.configured ? p.open_value : null,
      booked_value: booked.value,
      committed_count: booked.count,
    },
    { onConflict: "date" },
  );
}

/** Daily snapshots over the last `days` (oldest first), for trends/sparklines. */
export async function getSnapshots(days = 35): Promise<MetricSnapshot[]> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("pulse_snapshots")
    .select(COLS)
    .gte("date", since)
    .order("date", { ascending: true });
  return (data as MetricSnapshot[] | null) ?? [];
}
