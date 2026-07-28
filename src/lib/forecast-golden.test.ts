import { describe, it, expect } from "vitest";
import { buildForecast, forecastInputs } from "@/lib/forecast";

// Golden master: pins the engine's EXACT output for a fixed date + inputs, so any
// change that moves the numbers is caught (the invariant tests only check internal
// consistency, not specific values). Deterministic via opts.now + the built-in
// DEFAULT_COMMITTED list. If you intentionally change the model, re-capture and
// update the expected values below.
describe("buildForecast — golden master (now=2026-06-01, default committed jobs)", () => {
  const a = forecastInputs({ cash: 45000, receivables: 20000, overdue: 5000 });
  const fc = buildForecast(a, { now: new Date(2026, 5, 1) });

  it("12-month horizon labels start at June 2026", () => {
    expect(fc.months.map((m) => m.label)).toEqual([
      "Jun-26", "Jul-26", "Aug-26", "Sep-26", "Oct-26", "Nov-26",
      "Dec-26", "Jan-27", "Feb-27", "Mar-27", "Apr-27", "May-27",
    ]);
  });

  // Re-captured Aug 2026 after the BUS-timing correction (grant now lands in the install
  // month, not ~2 months later) — this pulls grant cash forward, lifting closing cash.
  it("closing cash series", () => {
    expect(fc.months.map((m) => m.closing)).toEqual([
      72483.15, 151538.78, 226643.89, 306070.3, 418946.18, 508408.06,
      585772.17, 641748.17, 719567.2, 812264.65, 921253.66, 1003304.87,
    ]);
  });

  it("money-in series", () => {
    expect(fc.months.map((m) => m.inflows)).toEqual([
      80247.01, 157903.7, 167760.99, 167682.63, 258708.85, 222876.05,
      182069.03, 130954.75, 175692.83, 198951.71, 229515.78, 207802.58,
    ]);
  });

  it("money-out series", () => {
    expect(fc.months.map((m) => m.outflows)).toEqual([
      52763.86, 78848.07, 92655.87, 88256.22, 145832.97, 133414.18,
      104704.92, 74978.74, 97873.8, 106254.26, 120526.77, 125751.36,
    ]);
  });

  it("installs + revenue series", () => {
    // Unchanged by the BUS-timing fix — grant timing moves cash, not job counts.
    expect(fc.installs).toEqual([3, 6.1, 7.4, 6.4, 10.7, 9.5, 8, 5.1, 7.1, 8, 9.4, 10.3]);
    expect(fc.revenue).toEqual([
      54225, 88991, 107845, 99640, 184614, 146881, 124284, 79090, 110701, 124538, 145294, 159132,
    ]);
  });

  it("summary", () => {
    expect(fc.summary).toEqual({
      minCash: 72483, minCashMonth: "Jun-26", closing: 1003305, netGeneration: 958305,
    });
  });
});
