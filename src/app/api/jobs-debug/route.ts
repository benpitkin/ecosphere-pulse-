// TEMPORARY diagnostic — Xero balance-sheet lines to find Capital on Tap. Remove after use.
import { NextResponse } from "next/server";
import { getBalanceSheetIndex } from "@/lib/xero";
export const dynamic = "force-dynamic";
export async function GET() {
  const idx = await getBalanceSheetIndex();
  if ("error" in idx) return NextResponse.json(idx);
  const keys = Object.keys(idx);
  const cot = keys.filter((k) => /capital|tap|credit|card|loan|funding/i.test(k));
  return NextResponse.json({ matched: Object.fromEntries(cot.map((k) => [k, idx[k]])), allLineCount: keys.length, allLines: idx });
}
