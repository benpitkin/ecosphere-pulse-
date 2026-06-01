import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(/xero_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || state !== cookieState) {
    return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, "");
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Xero env vars not set." }, { status: 500 });
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let tok: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      cache: "no-store",
    });
    tok = await res.json();
    if (!res.ok || !tok.access_token) {
      return NextResponse.json({ error: `Token exchange failed: ${tok.error ?? res.status}` }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  let tenantId = "";
  let tenantName: string | null = null;
  try {
    const res = await fetch(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const conns = (await res.json()) as Array<{ tenantId: string; tenantName: string }>;
    tenantId = conns[0]?.tenantId ?? "";
    tenantName = conns[0]?.tenantName ?? null;
  } catch {
    /* handled below */
  }
  if (!tenantId) return NextResponse.json({ error: "No Xero tenant returned." }, { status: 502 });

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 1800) * 1000).toISOString();
  const { error: upsertErr } = await admin
    .from("xero_connection")
    .upsert(
      {
        id: true,
        tenant_id: tenantId,
        tenant_name: tenantName,
        refresh_token: tok.refresh_token,
        access_token: tok.access_token,
        access_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (upsertErr) {
    return NextResponse.redirect(
      `${siteUrl}/pulse?xero=error&detail=${encodeURIComponent(upsertErr.message)}`,
    );
  }
  if (!tok.refresh_token) {
    return NextResponse.redirect(`${siteUrl}/pulse?xero=error&detail=no_refresh_token`);
  }

  const res = NextResponse.redirect(`${siteUrl}/pulse?xero=connected`);
  res.cookies.set("xero_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
