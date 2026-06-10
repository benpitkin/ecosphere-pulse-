import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizeUrl, isConfigured } from "@/lib/xero";

export const dynamic = "force-dynamic";

// Starts Pulse's own Xero OAuth consent. Visit /api/xero/connect to authorize.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Xero not configured — set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI." },
      { status: 500 },
    );
  }
  const state = crypto.randomUUID();
  cookies().set("xero_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(getAuthorizeUrl(state));
}
