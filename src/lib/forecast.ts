import type { CommittedJob, ForecastMonth, PulseConfig } from "./types";
import { DEFAULT_CONFIG } from "./config";

// ---- Business constants (see docs/HANDOVER.md §7) ----
export const FC_LOAN_PAYMENT = 2761.78; // Funding Circle, Jun-2026 -> Jun-2028
export const OWNER_DRAW = 4192;         // Owner Pay lever (£4k take-home target)
export const COGS_RATE = 0.44 + 0.21;   // 44% materials + 21% subbie labour
export const BUS_LAG_MONTHS = 2;        // BUS grant lands ~8 weeks post-install

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(year: number, month1: number): string {
  return `${MONTHS[month1 - 1]}-${String(year).slice(2)}`;
}

export function parseMonthLabel(label: string): { year: number; month: number } | null {
  const [mon, yy] = label.split("-");
  const m = MONTHS.indexOf(mon) + 1;
  if (m === 0 || !yy) return null;
  return { year: 2000 + Number(yy), month: m };
}

function addMonths(year: number, month1: number, delta: number): { year: number; month: number } {
  const zero = (year * 12 + (month1 - 1)) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

// Monthly finance outflow: Funding Circle + GC Finance (£271, 11 months) + Amex interest (£139).
export function financeLine(i: number, year: number, mo: number): number {
  const fcLoanOn = (year === 2026 && mo >= 6) || year === 2027 || (year === 2028 && mo <= 5);
  return (fcLoanOn ? FC_LOAN_PAYMENT : 0) + (i < 11 ? 271 : 0) + 139;
}

// BUS grant rule: heat-pump jobs only.
export function busGrant(jobType: string): number {
  return /ashp|heat|hp\b/i.test(jobType) ? 7500 : 0;
}

export interface ForecastParams {
  openingCash?: number;
  committed?: CommittedJob[];
  config?: PulseConfig;
  start?: { year: number; month: number };
}

// 12-month cash forecast. Inflows = committed customer cash (install month) + BUS (lagged).
// Outflows = overheads + owner draw + finance + COGS on installed revenue.
// NOTE: forecast new-win revenue is intentionally left as a future extension (see HANDOVER §11).
export function buildForecast(params: ForecastParams = {}): ForecastMonth[] {
  const now = new Date();
  const start = params.start ?? { year: now.getFullYear(), month: now.getMonth() + 1 };
  const committed = params.committed ?? [];
  const config = params.config ?? DEFAULT_CONFIG;
  let opening = params.openingCash ?? 0;

  const out: ForecastMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const { year, month } = addMonths(start.year, start.month, i);
    let cashIn = 0;
    let installedRevenue = 0;

    for (const job of committed) {
      const p = parseMonthLabel(job.installMonth);
      if (!p) continue;
      if (p.year === year && p.month === month) {
        cashIn += job.value;
        installedRevenue += job.value;
      }
      const bus = addMonths(p.year, p.month, BUS_LAG_MONTHS);
      if (bus.year === year && bus.month === month) cashIn += job.bus;
    }

    const cogs = installedRevenue * COGS_RATE;
    const finance = financeLine(i, year, month);
    const outflows = config.monthlyOverheads + OWNER_DRAW + finance + cogs;
    const inflows = cashIn;
    const net = inflows - outflows;
    const closing = opening + net;

    out.push({ label: monthLabel(year, month), year, month, inflows, outflows, net, closing });
    opening = closing;
  }
  return out;
}
