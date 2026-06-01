// ---------------------------------------------------------------------------
// /api/ghl/pipelines — lists GHL pipelines + stage IDs so the right "sales"
// pipeline id can be identified and set as GHL_SALES_PIPELINE_ID.
// Gated by the app's auth (middleware). Read-only.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GHL_BASE = "https://services.leadconnectorhq.com";

export async function GET() {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    return NextResponse.json(
      { error: "GHL_API_KEY and GHL_LOCATION_ID must be set in env." },
      { status: 500 },
    );
  }
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${locationId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `GHL ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    const body = (await res.json()) as { pipelines?: Array<Record<string, unknown>> };
    const pipelines = (body.pipelines ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      stages: ((p.stages as Array<Record<string, unknown>>) ?? []).map((s) => ({ id: s.id, name: s.name })),
    }));
    return NextResponse.json({ pipelines });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
