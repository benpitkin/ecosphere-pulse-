// app/api/solar/insights/route.ts
// Server-only. Your GOOGLE_SOLAR_API_KEY never reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import type { BuildingInsights } from "@/lib/solar/types";
import { toCoreRoofs } from "@/lib/solar/types";

const BASE = "https://solar.googleapis.com/v1/buildingInsights:findClosest";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const key = process.env.GOOGLE_SOLAR_API_KEY;

  if (!key) {
    return NextResponse.json({ error: "Solar API key not configured" }, { status: 500 });
  }
  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const url =
    `${BASE}?location.latitude=${lat}&location.longitude=${lng}` +
    // MEDIUM lets more rural Devon/Somerset addresses resolve; HIGH-only would 404 on the edges
    `&requiredQuality=MEDIUM&key=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } }); // cache 30d per TOS
    if (res.status === 404) {
      // Google has no building model here — fall back to manual roof entry in the UI
      return NextResponse.json({ error: "NO_BUILDING", roofs: [] }, { status: 404 });
    }
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: "SOLAR_API_ERROR", detail: body }, { status: 502 });
    }

    const data = (await res.json()) as BuildingInsights;
    const sp = data.solarPotential;

    return NextResponse.json({
      imageryQuality: data.imageryQuality,
      imageryDate: data.imageryDate,
      panelCapacityWatts: sp.panelCapacityWatts,
      maxPanels: sp.maxArrayPanelsCount,
      roofs: toCoreRoofs(data),
      // keep raw for later (panel placement overlay etc.)
      _raw: process.env.NODE_ENV === "development" ? data : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e) }, { status: 500 });
  }
}
