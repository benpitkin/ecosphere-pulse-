import type { Liability } from "./types";
import { getLiabilityLines } from "./xero";

// Known debts that aren't recorded in this Xero org (from the loan agreement / accountant).
const FUNDING_CIRCLE = 55588; // Funding Circle loan, £2,761.78/mo, ends 04 Jun 2028
const CORPORATION_TAX = 13000; // accountant estimate, provisional; due 28 Nov 2026

// "What you owe": the off-Xero known loans plus genuine credit-balance debts from the
// Xero balance sheet. Negative (debit-balance) lines — Directors' Loan, PAYE/VAT in
// credit, contra/clearing accounts — are excluded; they aren't money the business owes.
export async function getLiabilities(): Promise<Liability[]> {
  const items: Liability[] = [
    { name: "Funding Circle loan", amount: FUNDING_CIRCLE },
    { name: "Corporation tax (due 28 Nov 2026)", amount: CORPORATION_TAX },
  ];
  const { lines } = await getLiabilityLines();
  for (const [label, amount] of Object.entries(lines)) {
    if (/^total\b/i.test(label)) continue; // skip section subtotals
    if (amount > 0) items.push({ name: label, amount }); // credit balance = genuinely owed
  }
  return items.sort((a, b) => b.amount - a.amount);
}
