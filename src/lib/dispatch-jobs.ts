// ---------------------------------------------------------------------------
// Dispatch jobs — accepted / scheduled installs.
//
// Pulse and Dispatch share one Supabase project, so Pulse's service-role client
// can read Dispatch's `jobs` table directly. This surfaces the jobs that have
// been scheduled in Dispatch (intended_start_date set) with their install date,
// value and BUS status, for the "Scheduled installs" view.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase";
import { fetchOpportunityValueMap } from "@/lib/ghl-pipeline";
import { toCommittedJobs, type CommittedJob } from "@/lib/forecast";

export interface ScheduledJob {
  id: string;
  client_name: string | null;
  postcode: string | null;
  job_type: string | null;
  status: string | null;
  bus_status: string | null;
  install_date: string | null;   // intended_start_date (YYYY-MM-DD)
  start_time: string | null;
  value: number | null;          // computed £ value, best-effort
  ghl_opportunity_id: string | null;
}

export interface ScheduledInstalls {
  configured: boolean;
  jobs: ScheduledJob[];
  total_value: number;
  next_date: string | null;
  error?: string;
}

const EMPTY: ScheduledInstalls = { configured: false, jobs: [], total_value: 0, next_date: null };

type JobRow = {
  id: string;
  client_name: string | null;
  postcode: string | null;
  job_type: string | null;
  status: string | null;
  bus_status: string | null;
  intended_start_date: string | null;
  start_time: string | null;
  pricing_mode: string | null;
  fixed_price_pence: number | null;
  estimated_days: number | null;
  day_rate: number | null;
  ghl_opportunity_id: string | null;
};

/** Best-effort £ value: fixed price when set, otherwise estimated days × day rate. */
function jobValue(r: JobRow): number | null {
  let v: number | null = null;
  if (r.fixed_price_pence != null && r.fixed_price_pence > 0) {
    v = Math.round(r.fixed_price_pence) / 100;
  } else if (r.estimated_days != null && r.day_rate != null) {
    const d = Math.round(Number(r.estimated_days) * Number(r.day_rate));
    if (d > 0) v = d;
  }
  return v && v > 0 ? v : null;
}

/** Jobs scheduled in Dispatch (an install date is set), soonest first. */
export async function fetchScheduledInstalls(): Promise<ScheduledInstalls> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ...EMPTY, error: "Supabase not configured." };
  }

  const { data, error } = await admin
    .from("jobs")
    .select(
      "id, client_name, postcode, job_type, status, bus_status, intended_start_date, start_time, pricing_mode, fixed_price_pence, estimated_days, day_rate, ghl_opportunity_id",
    )
    .order("created_at", { ascending: true });

  if (error) return { ...EMPTY, configured: true, error: error.message };

  // Show every live/accepted job — both scheduled (has an install date) and
  // confirmed-but-not-yet-dated. Exclude only terminal statuses.
  // The job_status enum's terminal values are declined / expired / completed; the
  // others here stay as defensive matches for any legacy free-text status.
  const TERMINAL = /cancel|lost|dead|complete|done|archiv|reject|declin|expir/i;
  const rows = ((data ?? []) as JobRow[]).filter((r) => !TERMINAL.test(r.status || ""));

  // Confirmed jobs hold their install date in an accepted job_offer (chosen_date),
  // not on the job row. Pull those so confirmed jobs show their real date and feed
  // the forecast. chosen_date (the agreed date) wins over a proposed date.
  const offerMap = new Map<string, string>();
  try {
    const { data: offers } = await admin
      .from("job_offers")
      .select("job_id, chosen_date, proposed_dates, withdrawn_at")
      .is("withdrawn_at", null);
    for (const o of (offers ?? []) as Array<{ job_id: string; chosen_date: string | null; proposed_dates: string[] | null }>) {
      if (o.job_id && o.chosen_date) offerMap.set(o.job_id, o.chosen_date);
      else if (o.job_id && !offerMap.has(o.job_id) && o.proposed_dates && o.proposed_dates[0]) offerMap.set(o.job_id, o.proposed_dates[0]);
    }
  } catch {
    /* job_offers optional */
  }

  // The customer deal value lives in GHL (Dispatch's day_rate is operational),
  // so prefer the linked GHL opportunity value, falling back to Dispatch pricing.
  const valueMap = await fetchOpportunityValueMap();
  const jobs: ScheduledJob[] = rows.map((r) => ({
    id: r.id,
    client_name: r.client_name,
    postcode: r.postcode,
    job_type: r.job_type,
    status: r.status,
    bus_status: r.bus_status,
    install_date: r.intended_start_date ?? offerMap.get(r.id) ?? null,
    start_time: r.start_time,
    value: (r.ghl_opportunity_id ? valueMap.get(r.ghl_opportunity_id) ?? null : null) ?? jobValue(r),
    ghl_opportunity_id: r.ghl_opportunity_id,
  }));

  // Sort: scheduled jobs first by install date, then undated (date TBC).
  jobs.sort((a, b) => {
    if (a.install_date && b.install_date) return a.install_date < b.install_date ? -1 : 1;
    if (a.install_date) return -1;
    if (b.install_date) return 1;
    return (a.client_name || "").localeCompare(b.client_name || "");
  });

  const total_value = jobs.reduce((a, j) => a + (j.value ?? 0), 0);
  const dated = jobs.filter((j) => j.install_date);
  const next_date = dated.length ? dated[0].install_date : null;

  return { configured: true, jobs, total_value, next_date };
}

/** Scheduled installs converted into the forecast's committed-job shape, so the
 *  cashflow forecast tracks what's actually booked in Dispatch. */
export async function getCommittedJobs(): Promise<CommittedJob[]> {
  const { jobs } = await fetchScheduledInstalls();
  return toCommittedJobs(
    jobs.map((j) => ({ value: j.value, install_date: j.install_date, job_type: j.job_type })),
  );
}
