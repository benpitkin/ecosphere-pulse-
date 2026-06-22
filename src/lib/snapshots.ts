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

// --- "what changed" digest -------------------------------------------------
// Plain-language week-over-week movement, derived from the same snapshot series.

export interface ChangeLine {
  label: string;
  deltaText: string;
  tone: "good" | "bad" | "neutral";
}
export interface SnapshotChange {
  sinceDate: string; // ISO date of the baseline snapshot
  days: number;      // days between baseline and latest
  lines: ChangeLine[];
}

const changeGbp = (n: number) => "£" + Math.round(Math.abs(n)).toLocaleString("en-GB");

// Metrics worth narrating, with the direction that counts as "good" and the
// minimum absolute move before we bother mentioning it (filters out noise).
const CHANGE_METRICS: {
  key: keyof MetricSnapshot;
  label: string;
  goodWhen: "up" | "down";
  min: number;
  fmt: (n: number) => string;
}[] = [
  { key: "cash", label: "Cash", goodWhen: "up", min: 100, fmt: changeGbp },
  { key: "overdue", label: "Overdue", goodWhen: "down", min: 100, fmt: changeGbp },
  { key: "weighted_pipeline", label: "Weighted pipeline", goodWhen: "up", min: 100, fmt: changeGbp },
  { key: "booked_value", label: "Booked installs", goodWhen: "up", min: 100, fmt: changeGbp },
  { key: "runway_months", label: "Runway", goodWhen: "up", min: 0.1, fmt: (n) => `${Math.abs(n).toFixed(1)} mo` },
];

/**
 * Summarise how the headline metrics moved between the latest snapshot and one
 * ~`window` days earlier (falling back to the earliest row when history is
 * shorter than the window). Returns null until there are 2+ distinct days, so
 * the cockpit only shows the card once there's something to compare.
 */
export function summarizeChange(history: MetricSnapshot[], window = 7): SnapshotChange | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const latestT = new Date(latest.date).getTime();
  const targetT = latestT - window * 86_400_000;
  // Baseline = the most recent snapshot at/under the target date; if every row
  // is newer than the target (history shorter than the window), use the oldest.
  let baseline = history[0];
  for (const s of history) {
    if (new Date(s.date).getTime() <= targetT) baseline = s;
  }
  if (baseline.date === latest.date) return null;
  const days = Math.max(1, Math.round((latestT - new Date(baseline.date).getTime()) / 86_400_000));

  const lines: ChangeLine[] = [];
  for (const md of CHANGE_METRICS) {
    const a = baseline[md.key];
    const b = latest[md.key];
    if (typeof a !== "number" || typeof b !== "number") continue;
    const delta = b - a;
    // Epsilon tolerance so a genuine on-threshold move (e.g. runway 4.0→4.1,
    // which is 0.0999…964 in float) isn't dropped by binary rounding dust.
    if (Math.abs(delta) < md.min - 1e-9) continue;
    const dir: "up" | "down" = delta > 0 ? "up" : "down";
    lines.push({
      label: md.label,
      deltaText: `${delta > 0 ? "+" : "−"}${md.fmt(delta)}`,
      tone: dir === md.goodWhen ? "good" : "bad",
    });
  }
  return { sinceDate: baseline.date, days, lines };
}

/**
 * How many days the latest `cash` value has been unchanged. The Xero Balance
 * Sheet's bank figure only moves when transactions are reconciled, so a long
 * flat run usually means the bank reconciliation is behind — i.e. the headline
 * "cash" is the last-reconciled balance, not the true current one. Returns null
 * when there's no history or cash is null (nothing to assess).
 */
export function cashStaleDays(history: MetricSnapshot[]): number | null {
  if (!history.length) return null;
  const latest = history[history.length - 1];
  if (typeof latest.cash !== "number") return null;
  const v = latest.cash;
  let oldestSame = latest;
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i];
    if (typeof s.cash === "number" && s.cash === v) oldestSame = s;
    else break;
  }
  return Math.round((new Date(latest.date).getTime() - new Date(oldestSame.date).getTime()) / 86_400_000);
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
