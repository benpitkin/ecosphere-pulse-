import { NextResponse } from "next/server";
import { getCashPosition } from "@/lib/xero";
import { buildForecast } from "@/lib/forecast";
import { getCommittedJobs } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

// Aggregated live snapshot. TODO: add pipeline, proposals, liabilities, crew.
// See docs/HANDOVER.md §5 (app/api/pulse).
export async function GET() {
  const [cash, committed] = await Promise.all([
    getCashPosition(),
    getCommittedJobs(),
  ]);
  const forecast = buildForecast(committed);
  return NextResponse.json({ cash, committed, forecast });
}
