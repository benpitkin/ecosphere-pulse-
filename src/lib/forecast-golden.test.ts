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

  it("closing cash series", () => {
    expect(fc.months.map((m) => m.closing)).toEqual([
      50493.9, 78475.35, 115008.96, 194595.33, 291246.29, 356568.71,
      447211.55, 537827.71, 622587.74, 692062.01, 783374.17, 847748.53,
    ]);
  });

  it("money-in series", () => {
    expect(fc.months.map((m) => m.inflows)).toEqual([
      57747.01, 105643.21, 128293.57, 167846.31, 242107.08, 198175.91,
      195656.18, 166399.5, 182795.06, 175189.12, 211428.34, 189715.13,
    ]);
  });

  it("money-out series", () => {
    expect(fc.months.map((m) => m.outflows)).toEqual([
      52253.11, 77661.76, 91759.96, 88259.94, 145456.11, 132853.49,
      105013.35, 75783.34, 98035.03, 105714.85, 120116.19, 125340.77,
    ]);
  });

  it("installs + revenue series", () => {
    expect(fc.installs).toEqual([3, 6.1, 7.4, 6.4, 10.7, 9.5, 8, 5.1, 7.1, 8, 9.4, 10.3]);
    expect(fc.revenue).toEqual([
      54225, 88991, 107845, 99640, 184614, 146881, 124284, 79090, 110701, 124538, 145294, 159132,
    ]);
  });

  it("summary", () => {
    expect(fc.summary).toEqual({
      minCash: 50494, minCashMonth: "Jun-26", closing: 847749, netGeneration: 802749,
    });
  });
});
