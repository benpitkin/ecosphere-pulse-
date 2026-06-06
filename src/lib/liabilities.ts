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
const COT_REMNANT = 6307.67;        // left on the card at ~44.8% after the £52k settlement
const CORP_TAX = 13000;             // accountant estimate, due Nov-26

export async function getLiabilities(): Promise<Liabilities> {
  const idx = await getBalanceSheetIndex();
  if ("error" in idx) return { configured: false, items: [], lenderTotal: 0, hmrcTotal: 0, error: idx.error };

  const val = (k: string) => Number(idx[k] ?? 0);
  const owed = (k: string) => Math.abs(val(k)); // liability magnitude
  const items: LiabilityItem[] = [];

  // ---- lenders ----
  items.push({ label: "Funding Circle loan", amount: FC_LOAN_BALANCE, group: "lender", note: "£2,761.78/mo to Jun-2028 — refinanced Capital on Tap" });
  items.push({ label: "Capital on Tap (remaining)", amount: COT_REMNANT, group: "lender", flag: true, note: "~44.8% APR — clear from cash" });
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

  return { configured: true, items, lenderTotal, hmrcTotal };
}
