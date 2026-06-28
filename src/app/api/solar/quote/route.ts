// app/api/solar/quote/route.ts
// Persists a solar planner quote to Supabase. Called on final submit.
import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceOptional } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const db = supabaseServiceOptional();
  if (!db) {
    // Supabase not configured in this env — log and return OK so the UI doesn't break
    console.warn("solar/quote: Supabase not configured, quote not persisted");
    return NextResponse.json({ ok: true, persisted: false });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ref, address, coords, roofs, packageId, annualBillGbp, annualUsageKwh, addons, customer } = body as {
    ref: string;
    address: string;
    coords: { lat: number; lng: number } | null;
    roofs: unknown[];
    packageId: string | null;
    annualBillGbp: number;
    annualUsageKwh: number;
    addons: Record<string, number>;
    customer: { name: string; email: string; phone: string };
  };

  const { error } = await db.from("solar_quotes").insert({
    ref,
    address,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    roofs_json: JSON.stringify(roofs),
    package_id: packageId,
    annual_bill_gbp: annualBillGbp,
    annual_usage_kwh: annualUsageKwh,
    addons_json: JSON.stringify(addons),
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
  });

  if (error) {
    console.error("solar/quote insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
