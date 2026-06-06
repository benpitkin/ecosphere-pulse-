// ---------------------------------------------------------------------------
// Crew / subcontractors — who's assigned to which jobs, and who's free. Reads
// the secured sub_directory view (names) + accepted job_offers. Read-only.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase";

export interface CrewJob { client: string | null; date: string | null; jobType: string | null; }
export interface CrewMember { id: string; name: string; status: string | null; trades: string[]; jobs: CrewJob[]; }
export interface Crew { configured: boolean; members: CrewMember[]; error?: string; }

type JobEmbed = { client_name: string | null; intended_start_date: string | null; job_type: string | null; status: string | null };
type OfferRow = { subcontractor_id: string; chosen_date: string | null; jobs: JobEmbed | JobEmbed[] | null };
type SubRow = { id: string; name: string | null; status: string | null; trades: string[] | string | null };

function toTrades(t: string[] | string | null): string[] {
  if (Array.isArray(t)) return t;
  if (typeof t === "string") return t.replace(/[{}"]/g, "").split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

export async function getCrew(): Promise<Crew> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { configured: false, members: [], error: "Supabase not configured." };
  }

  const subsRes = await admin.from("sub_directory").select("id, name, status, trades");
  if (subsRes.error) return { configured: true, members: [], error: subsRes.error.message };
  const offersRes = await admin
    .from("job_offers")
    .select("subcontractor_id, chosen_date, withdrawn_at, jobs(client_name, intended_start_date, job_type, status)")
    .is("withdrawn_at", null);
  if (offersRes.error) return { configured: true, members: [], error: offersRes.error.message };

  const jobsBySub = new Map<string, CrewJob[]>();
  for (const o of (offersRes.data ?? []) as unknown as OfferRow[]) {
    if (!o.chosen_date) continue; // accepted offers have a chosen date
    const j = Array.isArray(o.jobs) ? o.jobs[0] : o.jobs;
    const arr = jobsBySub.get(o.subcontractor_id) ?? [];
    arr.push({ client: j?.client_name ?? null, date: o.chosen_date, jobType: j?.job_type ?? null });
    jobsBySub.set(o.subcontractor_id, arr);
  }

  const members: CrewMember[] = ((subsRes.data ?? []) as unknown as SubRow[]).map((s) => {
    const jobs = (jobsBySub.get(s.id) ?? []).sort((a, b) => ((a.date ?? "9") < (b.date ?? "9") ? -1 : 1));
    return { id: s.id, name: s.name ?? "Unknown", status: s.status, trades: toTrades(s.trades), jobs };
  });
  members.sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
  return { configured: true, members };
}
