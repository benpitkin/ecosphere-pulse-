import type { CommittedJob, ForecastMonth } from "./types";

// Funding Circle loan (refinanced Capital on Tap, Jun-2026 -> Jun-2028).
export const FC_LOAN_PAYMENT = 2761.78;

// Monthly finance outflow: Funding Circle + GC Finance (£271, 11 months) + Amex interest (£139).
export function financeLine(i: number, year: number, mo: number): number {
  const fcLoanOn = (year === 2026 && mo >= 6) || year === 2027 || (year === 2028 && mo <= 5);
  return (fcLoanOn ? FC_LOAN_PAYMENT : 0) + (i < 11 ? 271 : 0) + 139;
}

// BUS grant rule: heat-pump jobs only.
export function busGrant(jobType: string): number {
  const isHeatPump = /ashp|heat|hp\b/i.test(jobType);
  return isHeatPump ? 7500 : 0;
}

// TODO: port the full 12-month engine (inflows from committed + new wins, outflows, opening cash).
// See docs/HANDOVER.md §5.
export function buildForecast(_committed: CommittedJob[] = []): ForecastMonth[] {
  return [];
}
