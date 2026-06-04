// TEMPORARY diagnostic. Remove after use.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("jobs").select("*");
    if (error) return NextResponse.json({ error: error.message });
    const rows = (data ?? []) as Record<string, unknown>[];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    // Full records for the confirmed jobs, but drop always-null columns to keep it readable.
    const confirmed = rows.filter((r) => r.status === "confirmed").map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (v !== null && v !== "" && v !== false) o[k] = v;
      return o;
    });
    return NextResponse.json({ columns, confirmed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
