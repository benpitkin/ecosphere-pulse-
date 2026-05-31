import { NextResponse } from "next/server";
import { checkPassword, makeToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const pw = String(form.get("password") ?? "");
  const origin = new URL(req.url).origin;
  if (!checkPassword(pw)) {
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 303 });
  }
  const res = NextResponse.redirect(`${origin}/pulse`, { status: 303 });
  res.cookies.set(SESSION_COOKIE, await makeToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
