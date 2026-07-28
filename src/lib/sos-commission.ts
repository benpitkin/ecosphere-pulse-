// ---------------------------------------------------------------------------
// Solar on Steroids — commission engine (the contractual money maths, SOW §3).
//
// Pure and deterministic so it can be unit-reasoned about and reused by the
// ledger page, the alerts, and the audit self-check. NOTHING here is netted off
// Total Deal Value except VAT (§3.1), commission triggers only on a Closed
// Transaction (§3.2 = binding agreement AND first payment), and it's only owed
// inside the 180-day window from the MOST RECENT capture event (§3.5).
// ---------------------------------------------------------------------------

export interface SosConfigRow {
  commission_pct: number;         // 0.02
  vat_rate: number;               // 0.20
  attribution_window_days: number; // 180
  tdv_includes_bus: boolean;      // §B.1 — pending SoS
  retainer_gbp?: number;
  ad_spend_gbp?: number;
}

export interface SosDealRow {
  id: string;
  customer_name: string | null;
  ghl_opportunity_id: string | null;
  tdv_solar: number | null;
  tdv_battery: number | null;
  tdv_ancillary: number | null;
  tdv_upgrades: number | null;
  tdv_additional: number | null;
  bus_grant_gbp: number | null;
  binding_agreement_date: string | null;   // YYYY-MM-DD
  first_payment_date: string | null;        // YYYY-MM-DD — commission trigger
  most_recent_capture_at: string | null;    // YYYY-MM-DD — window anchor
  attribution_source: string | null;
  disputed: boolean | null;
  would_have_won_anyway: boolean | null;
  invoice_status: string | null;            // owed / invoiced / paid
  created_at?: string | null;
}

// Why commission is / isn't owed, for the ledger UI.
export type CommissionStatus =
  | "owed"           // closed + within the 180-day window
  | "outside_window" // closed but the deal closed too long after the last capture
  | "pending_close"  // no binding agreement and/or no first payment yet
  | "needs_data";    // closed but the capture date is missing — window can't be verified

export interface DealComputed extends SosDealRow {
  tdv_ex_vat: number;
  commission_ex_vat: number;
  commission_vat: number;
  commission_total: number;
  closed: boolean;
  days_to_close: number | null;
  within_window: boolean | null;
  status: CommissionStatus;
  commissionable: boolean;         // status === "owed"
  invoice_due_date: string | null; // first_payment_date + 7 days (§3.7)
}

// Coerce with Number(): Postgres/PostgREST returns numeric columns as strings
// ("12000.00"), so a strict typeof check would silently zero every TDV component.
const num = (n: number | string | null | undefined) => {
  const v = Number(n);
  return isFinite(v) ? v : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole days from date `a` to date `b` (both YYYY-MM-DD, UTC midnight). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
/** Add `n` days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Compute the contractual figures + owed-status for one deal. Pure. */
export function computeDeal(deal: SosDealRow, config: SosConfigRow): DealComputed {
  const components =
    num(deal.tdv_solar) + num(deal.tdv_battery) + num(deal.tdv_ancillary) +
    num(deal.tdv_upgrades) + num(deal.tdv_additional);
  // TDV is gross before all deductions; VAT is the only thing excluded. BUS is
  // added only when the (SoS-pending) toggle says the grant portion counts.
  const tdv_ex_vat = round2(components + (config.tdv_includes_bus ? num(deal.bus_grant_gbp) : 0));

  const commission_ex_vat = round2(config.commission_pct * tdv_ex_vat);
  const commission_vat = round2(commission_ex_vat * config.vat_rate);
  const commission_total = round2(commission_ex_vat + commission_vat);

  const closed = !!(deal.binding_agreement_date && deal.first_payment_date);

  let days_to_close: number | null = null;
  let within_window: boolean | null = null;
  if (deal.first_payment_date && deal.most_recent_capture_at) {
    days_to_close = daysBetween(deal.most_recent_capture_at, deal.first_payment_date);
    within_window = days_to_close >= 0 && days_to_close <= config.attribution_window_days;
  }

  let status: CommissionStatus;
  if (!closed) status = "pending_close";
  else if (within_window === null) status = "needs_data"; // closed but no capture date
  else status = within_window ? "owed" : "outside_window";

  const invoice_due_date = deal.first_payment_date ? addDays(deal.first_payment_date, 7) : null;

  return {
    ...deal,
    tdv_ex_vat,
    commission_ex_vat,
    commission_vat,
    commission_total,
    closed,
    days_to_close,
    within_window,
    status,
    commissionable: status === "owed",
    invoice_due_date,
  };
}

export interface MonthTotal {
  month: string; // YYYY-MM
  count: number;
  ex_vat: number;
  vat: number;
  total: number;
}

export interface LedgerSummary {
  deals: DealComputed[];
  months: MonthTotal[];              // owed commission grouped by first-payment month (§3.6)
  totalOwedExVat: number;            // sum of commissionable commission (ex-VAT)
  totalOwedInclVat: number;
  outstandingInclVat: number;        // owed and not yet marked paid
  ownedCount: number;
  needsDataCount: number;            // closed but missing capture date
  disputedCount: number;
  outsideWindowCount: number;
}

/** Roll up a set of deals into ledger totals + monthly grouping. Pure. */
export function summariseLedger(deals: SosDealRow[], config: SosConfigRow): LedgerSummary {
  const computed = deals.map((d) => computeDeal(d, config));
  const monthMap = new Map<string, MonthTotal>();
  let totalOwedExVat = 0, totalOwedInclVat = 0, outstandingInclVat = 0;
  let ownedCount = 0, needsDataCount = 0, disputedCount = 0, outsideWindowCount = 0;

  for (const d of computed) {
    if (d.disputed) disputedCount++;
    if (d.status === "needs_data") needsDataCount++;
    if (d.status === "outside_window") outsideWindowCount++;
    if (d.status !== "owed") continue;
    ownedCount++;
    totalOwedExVat += d.commission_ex_vat;
    totalOwedInclVat += d.commission_total;
    if (d.invoice_status !== "paid") outstandingInclVat += d.commission_total;
    const month = (d.first_payment_date ?? "").slice(0, 7);
    if (month) {
      const cur = monthMap.get(month) ?? { month, count: 0, ex_vat: 0, vat: 0, total: 0 };
      cur.count++; cur.ex_vat = round2(cur.ex_vat + d.commission_ex_vat);
      cur.vat = round2(cur.vat + d.commission_vat); cur.total = round2(cur.total + d.commission_total);
      monthMap.set(month, cur);
    }
  }

  return {
    deals: computed,
    months: [...monthMap.values()].sort((a, b) => (a.month < b.month ? 1 : -1)),
    totalOwedExVat: round2(totalOwedExVat),
    totalOwedInclVat: round2(totalOwedInclVat),
    outstandingInclVat: round2(outstandingInclVat),
    ownedCount, needsDataCount, disputedCount, outsideWindowCount,
  };
}

/** Audit guard (§3.8): compare a reported commission figure against a fresh
 *  recompute; flag when it drifts >5% (the threshold that triggers a shortfall
 *  charge). `reportedExVat` is what we told SoS we owed. */
export function auditSelfCheck(
  reportedExVat: number,
  deals: SosDealRow[],
  config: SosConfigRow,
): { recomputedExVat: number; driftPct: number; over5pct: boolean } {
  const recomputedExVat = summariseLedger(deals, config).totalOwedExVat;
  const driftPct = recomputedExVat > 0 ? Math.abs(reportedExVat - recomputedExVat) / recomputedExVat : 0;
  return { recomputedExVat, driftPct, over5pct: driftPct > 0.05 };
}
