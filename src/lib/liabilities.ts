// ---------------------------------------------------------------------------
// "What you owe" — a consolidated liabilities view. Pulls clean debt lines from
// the Xero balance sheet and adds the items Xero doesn't yet hold: the Funding
// Circle loan (refinanced Capital on Tap) and the remaining card balance.
// Read-only. Accounting nuance noted in the UI; confirm with the accountant.
// ---------------------------------------------------------------------------

import { getBalanceSheetIndex } from "@/lib/xero";

export type LiabilityGroup = "lender" | "hmrc" | "note";

export interface LiabilityItem {
  label: string;
  amount: number;
  group: LiabilityGroup;
  note?: string;
  flag?: boolean; // highlight (e.g. toxic-rate debt to clear)
}

export interface Liabilities {
  configured: boolean;
  items: LiabilityItem[];
  lenderTotal: number;
  hmrcTotal: number;
  error?: string;
}

// Not yet reconciled into Xero — entered from the loan paperwork.
const FC_LOAN_BALANCE = 55588;      // origination; £2,761.78/mo to Jun-2028
const COT_REMNANT = 0;               // fully cleared Jun-2026 (£52k refinanced + remnant paid from cash)
const CORP_TAX = 13000;             // accountant estimate, due Nov-26

/** Pure: map balance-sheet lines (account name → value) + the off-Xero items
 *  into the grouped liability list + lender/HMRC totals. Liability values come
 *  back negative on the balance sheet, so `owed()` takes the magnitude. */
export function buildLiabilities(lines: Record<string, number>): {
  items: LiabilityItem[];
  lenderTotal: number;
  hmrcTotal: number;
} {
  const val = (k: string) => Number(lines[k] ?? 0);
  const owed = (k: string) => Math.abs(val(k)); // liability magnitude
  const items: LiabilityItem[] = [];

  // ---- lenders ----
  items.push({ label: "Funding Circle loan", amount: FC_LOAN_BALANCE, group: "lender", note: "£2,761.78/mo to Jun-2028 — refinanced Capital on Tap" });
  if (COT_REMNANT > 0) items.push({ label: "Capital on Tap (remaining)", amount: COT_REMNANT, group: "lender", flag: true, note: "~44.8% APR — clear from cash" });
  const amex = owed("british airways american expre");
  if (amex) items.push({ label: "Amex card", amount: amex, group: "lender" });
  const hp = owed("hire purchase - gl18nld");
  if (hp) items.push({ label: "Vehicle hire purchase", amount: hp, group: "lender" });

  // ---- HMRC ----
  const paye = owed("paye payable");
  if (paye) items.push({ label: "PAYE / NI owed", amount: paye, group: "hmrc" });
  const cis = owed("cis liability");
  if (cis) items.push({ label: "CIS owed", amount: cis, group: "hmrc" });
  items.push({ label: "Corporation tax", amount: CORP_TAX, group: "hmrc", note: "Estimate, due 28 Nov 2026" });

  const lenderTotal = items.filter((i) => i.group === "lender").reduce((a, i) => a + i.amount, 0);
  const hmrcTotal = items.filter((i) => i.group === "hmrc").reduce((a, i) => a + i.amount, 0);

  // ---- notes (not added to totals) ----
  const vat = val("vat");
  if (vat < 0) items.push({ label: "VAT", amount: Math.abs(vat), group: "note", note: "Reclaim due to you (not a debt)" });
  const dla = val("directors' loan account");
  if (dla) items.push({ label: "Director's loan account (Xero)", amount: Math.abs(dla), group: "note", note: "Reflects the pre-refinance Capital on Tap; reduces once your bookkeeper posts the £52k settlement" });

  return { items, lenderTotal, hmrcTotal };
}

export async function getLiabilities(): Promise<Liabilities> {
  const { lines, error } = await getBalanceSheetIndex();
  if (error) return { configured: false, items: [], lenderTotal: 0, hmrcTotal: 0, error };
  return { configured: true, ...buildLiabilities(lines) };
}
