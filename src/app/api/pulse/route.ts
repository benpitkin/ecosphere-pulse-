import { NextResponse } from "next/server";
import { buildPulse } from "@/lib/pulse";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const pulse = await buildPulse();

  // --- temporary diagnostic (booleans/messages only, no secret values) ---
  const _debug: Record<string, unknown> = {
    has_client_id: !!process.env.XERO_CLIENT_ID,
    has_client_secret: !!process.env.XERO_CLIENT_SECRET,
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    service_key_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
  };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("xero_connection")
      .select("tenant_id, refresh_token, access_expires_at")
      .eq("id", true)
      .maybeSingle();
    _debug.row_found = !!data;
    _debug.row_has_refresh = !!(data && (data as { refresh_token?: string }).refresh_token);
    _debug.row_has_tenant = !!(data && (data as { tenant_id?: string }).tenant_id);
    _debug.read_error = error?.message ?? null;

    // Replicate getAuth's EXACT 5-column read to see if specific columns break it.
    const r2 = await admin
      .from("xero_connection")
      .select("tenant_id, tenant_name, refresh_token, access_token, access_expires_at")
      .eq("id", true)
      .maybeSingle();
    _debug.full5_found = !!r2.data;
    _debug.full5_has_refresh = !!(r2.data && (r2.data as { refresh_token?: string }).refresh_token);
    _debug.full5_has_tenant = !!(r2.data && (r2.data as { tenant_id?: string }).tenant_id);
    _debug.full5_error = r2.error?.message ?? null;
  } catch (e) {
    _debug.read_exception = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ...pulse, _debug });
}
