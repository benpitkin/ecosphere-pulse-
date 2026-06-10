import type { CommittedJob } from "./types";
import { supabaseService } from "./supabase";

const TERMINAL = /cancel|lost|dead|complete|done|archiv|reject/i;

// Scheduled installs from Dispatch `jobs`, confirmed dates from `job_offers.chosen_date`.
// TODO: port real query (offerMap, GHL-first value resolution). See docs/HANDOVER.md §5.
export async function fetchScheduledInstalls(): Promise<unknown[]> {
  const supabase = supabaseService();
  const { data } = await supabase.from("jobs").select("*");
  return (data ?? []).filter((j: { status?: string }) => !TERMINAL.test(j.status ?? ""));
}

export async function getCommittedJobs(): Promise<CommittedJob[]> {
  return [];
}
