// TEMPORARY diagnostic — inspect job_offers & site_visits. Remove after use.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const admin = createAdminClient();
    const out: Record<string, unknown> = {};
    for (const t of ["job_offers", "site_visits"]) {
      const { data, error } = await admin.from(t).select("*").limit(30);
      out[t] = error ? { error: error.message } : { columns: data && data[0] ? Object.keys(data[0]) : [], count: (data ?? []).length, rows: data };
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
