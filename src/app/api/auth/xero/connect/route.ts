import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.contacts.read",
  "accounting.settings.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.profitandloss.read",
].join(" ");

export async function GET() {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Xero env vars not set (XERO_CLIENT_ID, XERO_REDIRECT_URI)." },
      { status: 500 },
    );
  }
  const state = crypto.randomUUID();
  // Build the query manually so scope spaces encode as %20 (Xero rejects the
  // "+" that URLSearchParams would produce as an invalid_scope).
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  const authUrl = `${AUTHORIZE_URL}?${params.toString()}&scope=${encodeURIComponent(SCOPES)}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
