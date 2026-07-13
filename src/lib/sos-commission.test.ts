import { describe, it, expect } from "vitest";
import {
  computeDeal, summariseLedger, auditSelfCheck, daysBetween, addDays,
  type SosDealRow, type SosConfigRow,
} from "@/lib/sos-commission";

const CONFIG: SosConfigRow = {
  commission_pct: 0.02, vat_rate: 0.20, attribution_window_days: 180, tdv_includes_bus: false,
};

const deal = (o: Partial<SosDealRow> = {}): SosDealRow => ({
  id: "d1", customer_name: "Test", ghl_opportunity_id: null,
  tdv_solar: 0, tdv_battery: 0, tdv_ancillary: 0, tdv_upgrades: 0, tdv_additional: 0,
  bus_grant_gbp: 0, binding_agreement_date: null, first_payment_date: null,
  most_recent_capture_at: null, attribution_source: null, disputed: false,
  would_have_won_anyway: false, invoice_status: "owed", ...o,
});

describe("date helpers", () => {
  it("counts whole days between dates and adds days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(addDays("2026-07-10", 7)).toBe("2026-07-17");
  });
});

describe("computeDeal — TDV & commission", () => {
  it("sums all TDV components, strips only VAT, and adds VAT to the commission", () => {
    const d = computeDeal(deal({ tdv_solar: 10000, tdv_battery: 4000, tdv_ancillary: 500, tdv_upgrades: 800, tdv_additional: 200 }), CONFIG);
    expect(d.tdv_ex_vat).toBe(15500);
    expect(d.commission_ex_vat).toBe(310);       // 2% × 15,500
    expect(d.commission_vat).toBe(62);           // 20% × 310
    expect(d.commission_total).toBe(372);
  });

  it("coerces numeric strings from Postgres (numerics arrive as strings, not numbers)", () => {
    // Simulate a row as PostgREST returns it: numeric columns are strings.
    const dbRow = deal({
      tdv_solar: "12000.00" as unknown as number,
      tdv_battery: "4000.00" as unknown as number,
      bus_grant_gbp: "7500.00" as unknown as number,
    });
    const d = computeDeal(dbRow, CONFIG);
    expect(d.tdv_ex_vat).toBe(16000);       // not 0 — the bug this guards against
    expect(d.commission_ex_vat).toBe(320);  // 2% × 16,000
  });

  it("excludes the BUS grant by default, includes it only when the toggle is on", () => {
    const base = deal({ tdv_solar: 12000, bus_grant_gbp: 7500 });
    expect(computeDeal(base, CONFIG).tdv_ex_vat).toBe(12000);
    expect(computeDeal(base, { ...CONFIG, tdv_includes_bus: true }).tdv_ex_vat).toBe(19500);
    expect(computeDeal(base, { ...CONFIG, tdv_includes_bus: true }).commission_ex_vat).toBe(390); // 2% × 19,500
  });
});

describe("computeDeal — Closed Transaction + attribution window", () => {
  it("is pending until BOTH a binding agreement and a first payment exist", () => {
    expect(computeDeal(deal({ tdv_solar: 10000, binding_agreement_date: "2026-07-01" }), CONFIG).status).toBe("pending_close");
    expect(computeDeal(deal({ tdv_solar: 10000, first_payment_date: "2026-07-01" }), CONFIG).status).toBe("pending_close");
  });

  it("is owed when closed within 180 days of the most-recent capture", () => {
    const d = computeDeal(deal({
      tdv_solar: 12000, binding_agreement_date: "2026-06-01",
      first_payment_date: "2026-07-01", most_recent_capture_at: "2026-05-01",
    }), CONFIG);
    expect(d.closed).toBe(true);
    expect(d.days_to_close).toBe(61);
    expect(d.status).toBe("owed");
    expect(d.commissionable).toBe(true);
    expect(d.invoice_due_date).toBe("2026-07-08"); // first payment + 7
  });

  it("is outside_window when the deal closes >180 days after the last capture", () => {
    const d = computeDeal(deal({
      tdv_solar: 12000, binding_agreement_date: "2026-01-01",
      first_payment_date: "2026-07-01", most_recent_capture_at: "2025-01-01",
    }), CONFIG);
    expect(d.status).toBe("outside_window");
    expect(d.commissionable).toBe(false);
  });

  it("flags needs_data when closed but the capture date is missing", () => {
    const d = computeDeal(deal({ tdv_solar: 12000, binding_agreement_date: "2026-06-01", first_payment_date: "2026-07-01" }), CONFIG);
    expect(d.status).toBe("needs_data");
    expect(d.commissionable).toBe(false);
  });
});

describe("summariseLedger + audit self-check", () => {
  const deals: SosDealRow[] = [
    deal({ id: "a", tdv_solar: 15000, binding_agreement_date: "2026-06-01", first_payment_date: "2026-07-01", most_recent_capture_at: "2026-05-15", invoice_status: "owed" }),
    deal({ id: "b", tdv_solar: 10000, binding_agreement_date: "2026-07-10", first_payment_date: "2026-07-20", most_recent_capture_at: "2026-06-01", invoice_status: "paid" }),
    deal({ id: "c", tdv_solar: 9000, first_payment_date: "2026-07-05" }), // pending (no binding agreement)
    deal({ id: "d", tdv_solar: 8000, binding_agreement_date: "2026-01-01", first_payment_date: "2026-07-01", most_recent_capture_at: "2024-01-01" }), // outside window
  ];
  const s = summariseLedger(deals, CONFIG);

  it("totals only the owed deals, and tracks outstanding (unpaid) separately", () => {
    // owed: a (2%×15000=300) + b (2%×10000=200) = 500 ex-VAT
    expect(s.totalOwedExVat).toBe(500);
    expect(s.ownedCount).toBe(2);
    // b is paid → outstanding excludes it: only a's £360 incl VAT
    expect(s.outstandingInclVat).toBe(360);
    expect(s.outsideWindowCount).toBe(1);
  });

  it("groups owed commission by first-payment month", () => {
    const july = s.months.find((m) => m.month === "2026-07");
    expect(july?.count).toBe(2);
    expect(july?.ex_vat).toBe(500);
  });

  it("audit guard flags a >5% under-report", () => {
    expect(auditSelfCheck(500, deals, CONFIG).over5pct).toBe(false);
    const under = auditSelfCheck(400, deals, CONFIG); // reported 400 vs 500 recomputed = 20% drift
    expect(under.over5pct).toBe(true);
    expect(under.recomputedExVat).toBe(500);
  });
});
