import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const SCOPES = [
  "offline_access",
  "accounting.reports.read",
  "accounting.transactions.read",
  "accounting.settings.read",
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
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
