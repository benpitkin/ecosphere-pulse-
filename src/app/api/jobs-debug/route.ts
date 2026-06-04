// TEMPORARY diagnostic — list all tables via PostgREST OpenAPI. Remove after use.
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "no supabase env" });
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    const spec = await res.json();
    const tables = Object.keys(spec.definitions || spec.paths || {}).map((t) => t.replace(/^\//, "")).filter(Boolean);
    // Highlight likely assignment/booking/schedule tables
    const interesting = tables.filter((t) => /sub|assign|book|sched|visit|install|crew|date|job/i.test(t));
    return NextResponse.json({ tableCount: tables.length, interesting, allTables: tables });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
