// app/api/solar/geocode/route.ts
// Turns a typed address/postcode into coordinates for the insights call.
// Uses Google Geocoding so it shares your Maps key + billing.
import { NextRequest, NextResponse } from "next/server";

const BASE = "https://maps.googleapis.com/maps/api/geocode/json";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("q");
  const key = process.env.GOOGLE_MAPS_API_KEY; // can be the same project key as Solar

  if (!key) return NextResponse.json({ error: "Maps key not configured" }, { status: 500 });
  if (!address) return NextResponse.json({ error: "q is required" }, { status: 400 });

  // bias to GB so postcodes resolve to the right country
  const url = `${BASE}?address=${encodeURIComponent(address)}&region=gb&components=country:GB&key=${key}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ error: "NOT_FOUND", status: data.status }, { status: 404 });
    }
    const r = data.results[0];
    return NextResponse.json({
      formatted: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      placeId: r.place_id,
    });
  } catch (e) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e) }, { status: 500 });
  }
}
