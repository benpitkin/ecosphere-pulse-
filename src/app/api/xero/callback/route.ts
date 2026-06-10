import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken } from "@/lib/xero";

export const dynamic = "force-dynamic";

// Xero redirects here after consent. Verifies state (CSRF), exchanges the code for
// tokens, and persists them to pulse_xero_connection.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = cookies().get("xero_oauth_state")?.value;

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/pulse/settings?xero=error", req.url));
  }

  try {
    await exchangeCodeForToken(code);
  } catch {
    return NextResponse.redirect(new URL("/pulse/settings?xero=failed", req.url));
  }

  cookies().delete("xero_oauth_state");
  return NextResponse.redirect(new URL("/pulse/settings?xero=connected", req.url));
}
