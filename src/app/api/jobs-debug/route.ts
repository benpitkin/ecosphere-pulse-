// TEMPORARY diagnostic — full jobs snapshot to realign Installs. Remove after use.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("jobs").select("*").order("intended_start_date", { ascending: true });
    if (error) return NextResponse.json({ error: error.message });
    const rows = data ?? [];
    const statuses: Record<string, number> = {};
    for (const r of rows) statuses[(r as { status: string }).status ?? "null"] = (statuses[(r as { status: string }).status ?? "null"] || 0) + 1;
    const columns = rows.length ? Object.keys(rows[0] as object) : [];
    const summary = rows.map((r) => {
      const o = r as Record<string, unknown>;
      return { name: o.client_name, status: o.status, date: o.intended_start_date };
    });
    return NextResponse.json({ count: rows.length, statusCounts: statuses, columns, summary, sample: rows[0] ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
