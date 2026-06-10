import type { CashPosition } from "./types";

// Xero OAuth2 reads. TODO: port real implementation (token refresh, report parsing).
// See docs/HANDOVER.md §3/§5.
export async function getCashPosition(): Promise<CashPosition> {
  return { cashBalance: 0, receivables: 0, overdue: 0, workingCapital: 0, netEquity: 0 };
}

export async function getBalanceSheetIndex(): Promise<{
  lines: Record<string, number>;
  error?: string;
}> {
  return { lines: {} };
}

export async function getOverdueContacts(): Promise<Array<{ name: string; amount: number }>> {
  return [];
}
