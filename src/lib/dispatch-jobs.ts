import type { CommittedJob } from "./types";
import { supabaseServiceOptional } from "./supabase";
import { busGrant, monthLabel } from "./forecast";
import { fetchOpportunityValueMap } from "./ghl-pipeline";

// Dispatch `jobs` + `job_offers` → scheduled installs and forecast committed-jobs.
// See docs/HANDOVER.md §4–§5. Schema reconciled against the live DB (10 Jun 2026):
//  - `jobs.status` is the `job_status` enum, not free text — the old free-text
//    TERMINAL regex didn't match the real values, so we use an explicit set.
//  - `jobs` has NO `value` column; job value lives in GHL (keyed by ghl_opportunity_id),
//    with a fixed-price fallback. Day-rate × days is subcontractor cost, not revenue.
//  - A confirmed install is defined by `job_offers.chosen_date` (a non-withdrawn offer),
//    which is the authoritative signal (more reliable than status alone).

// `job_status` values that mean the job will never bill — excluded from committed work.
const TERMINAL_STATUSES = new Set(["declined", "expired", "completed"]);

export interface ScheduledInstall {
  id: string;
  customer: string;
  jobType: string;
  status: string;
  installDate: string; // YYYY-MM-DD — confirmed via job_offers.chosen_date
  value: number; // GHL-first; 0 until ghl-pipeline.ts is wired (HANDOVER §5)
}

interface JobRow {
  id: string;
  client_name: string;
  job_type: string;
  status: string;
  ghl_opportunity_id: string | null;
  fixed_price_pence: number | null;
}

interface OfferRow {
  job_id: string;
  chosen_date: string | null;
  withdrawn_at: string | null;
}

// Confirmed scheduled installs from Dispatch: jobs with a non-withdrawn offer that has a
// chosen_date, excluding terminal statuses. Returns [] when Supabase env is unset.
export async function fetchScheduledInstalls(): Promise<ScheduledInstall[]> {
  const supabase = supabaseServiceOptional();
  if (!supabase) return []; // no creds -> render empty, don't crash

  const [jobsRes, offersRes, ghlValues] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, client_name, job_type, status, ghl_opportunity_id, fixed_price_pence"),
    supabase
      .from("job_offers")
      .select("job_id, chosen_date, withdrawn_at")
      .not("chosen_date", "is", null)
      .is("withdrawn_at", null),
    fetchOpportunityValueMap(),
  ]);

  // job_id -> earliest confirmed install date.
  const offerMap = new Map<string, string>();
  for (const o of (offersRes.data ?? []) as OfferRow[]) {
    if (!o.chosen_date) continue;
    const existing = offerMap.get(o.job_id);
    if (!existing || o.chosen_date < existing) offerMap.set(o.job_id, o.chosen_date);
  }

  const installs: ScheduledInstall[] = [];
  for (const j of (jobsRes.data ?? []) as JobRow[]) {
    const installDate = offerMap.get(j.id);
    if (!installDate) continue; // not confirmed -> not a scheduled install
    if (TERMINAL_STATUSES.has(j.status)) continue; // dead job
    // Value: GHL-first (job value lives in GHL), then a fixed price if set, else 0.
    const ghlValue = j.ghl_opportunity_id ? ghlValues[j.ghl_opportunity_id] : undefined;
    const value = ghlValue ?? (j.fixed_price_pence != null ? j.fixed_price_pence / 100 : 0);
    installs.push({
      id: j.id,
      customer: j.client_name,
      jobType: j.job_type,
      status: j.status,
      installDate,
      value,
    });
  }
  return installs;
}

// Forecast committed-jobs shape: real inflows from confirmed installs.
export async function getCommittedJobs(): Promise<CommittedJob[]> {
  const installs = await fetchScheduledInstalls();
  const committed: CommittedJob[] = [];
  for (const inst of installs) {
    const [year, month] = inst.installDate.split("-").map(Number);
    if (!year || !month) continue;
    committed.push({
      customer: inst.customer,
      value: inst.value,
      installMonth: monthLabel(year, month),
      // NOTE: busGrant over-grants on heat_loss_survey (matches /heat/); the enum-accurate
      // fix (ashp_install only) is deferred to the forecast module.
      bus: busGrant(inst.jobType),
    });
  }
  return committed;
}
