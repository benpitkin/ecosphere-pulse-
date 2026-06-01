import { NextResponse } from "next/server";
import { buildPulse } from "@/lib/pulse";

export const dynamic = "force-dynamic";

export async function GET() {
  const pulse = await buildPulse();
  return NextResponse.json(pulse);
}
