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
    .not("intended_start_date", "is", null)
    .order("intended_start_date", { ascending: true });

  if (error) return { ...EMPTY, configured: true, error: error.message };

  const rows = (data ?? []) as JobRow[];
  // Dispatch jobs don't store the deal value — pull it from the linked GHL
  // opportunity where available.
  const valueMap = await fetchOpportunityValueMap();
  const jobs: ScheduledJob[] = rows.map((r) => ({
    id: r.id,
    client_name: r.client_name,
    postcode: r.postcode,
    job_type: r.job_type,
    status: r.status,
    bus_status: r.bus_status,
    install_date: r.intended_start_date,
    start_time: r.start_time,
    value: jobValue(r) ?? (r.ghl_opportunity_id ? valueMap.get(r.ghl_opportunity_id) ?? null : null),
    ghl_opportunity_id: r.ghl_opportunity_id,
  }));

  const total_value = jobs.reduce((a, j) => a + (j.value ?? 0), 0);
  const next_date = jobs.length ? jobs[0].install_date : null;

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
