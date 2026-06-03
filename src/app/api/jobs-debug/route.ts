// TEMPORARY diagnostic — read-only list of jobs to verify the Installs filter. Remove after use.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jobs")
      .select("client_name, status, intended_start_date, bus_status, job_type, pricing_mode, fixed_price_pence, estimated_days, day_rate, ghl_opportunity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message });
    const statuses: Record<string, number> = {};
    for (const r of data ?? []) statuses[(r as { status: string }).status ?? "null"] = (statuses[(r as { status: string }).status ?? "null"] || 0) + 1;
    return NextResponse.json({ count: (data ?? []).length, statusCounts: statuses, jobs: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
