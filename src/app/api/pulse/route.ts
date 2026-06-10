import { NextResponse } from "next/server";
import { getCashPosition } from "@/lib/xero";
import { getPulseConfig } from "@/lib/config";
import { buildForecast } from "@/lib/forecast";
import { getCommittedJobs } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

// Aggregated live snapshot. TODO: add pipeline, proposals, liabilities, crew.
export async function GET() {
  const [cash, config, committed] = await Promise.all([
    getCashPosition(),
    getPulseConfig(),
    getCommittedJobs(),
  ]);
  const forecast = buildForecast({ openingCash: cash.cashBalance, committed, config });
  return NextResponse.json({ cash, config, committed, forecast });
}
