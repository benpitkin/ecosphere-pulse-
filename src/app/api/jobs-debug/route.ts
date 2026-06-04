// TEMPORARY diagnostic — locate the subcontractor/booking-date table. Remove after use.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
export const dynamic = "force-dynamic";

const CANDIDATES = [
  "job_subcontractors", "job_assignments", "subcontractor_assignments", "subcontractors",
  "assignments", "bookings", "job_bookings", "crew_assignments", "job_crew", "crews",
  "installers", "job_installers", "subcontractor_bookings", "job_subcontractor_bookings",
  "job_dates", "scheduled_visits", "visits", "appointments", "job_appointments",
];

export async function GET() {
  try {
    const admin = createAdminClient();
    const found: Record<string, { columns: string[]; count: number }> = {};
    for (const t of CANDIDATES) {
      const { data, error } = await admin.from(t).select("*").limit(2);
      if (!error) found[t] = { columns: data && data[0] ? Object.keys(data[0]) : [], count: (data ?? []).length };
    }
    // Confirmed jobs' appointment ids (another possible date source)
    const { data: jobs } = await admin
      .from("jobs")
      .select("client_name, status, intended_start_date, ghl_appointment_ids")
      .eq("status", "confirmed");
    return NextResponse.json({ foundTables: found, confirmedJobs: jobs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
