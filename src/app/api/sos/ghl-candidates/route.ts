import { NextResponse } from "next/server";
import { fetchSosGhlCandidates } from "@/lib/sos-ghl";

export const dynamic = "force-dynamic";

// Won GHL opportunities to pre-fill a new commission-ledger deal. Gated by the
// app's auth middleware. Read-only.
export async function GET() {
  const res = await fetchSosGhlCandidates();
  return NextResponse.json(res);
}
