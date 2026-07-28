import { describe, it, expect } from "vitest";
import {
  computeSosBreakeven,
  SOS_BENCHMARK,
  REAL_PULSE,
  CONSERVATIVE,
  type SosBreakevenInputs,
} from "@/lib/sos-breakeven";

describe("computeSosBreakeven — matches the reference breakeven.html at SoS defaults", () => {
  const r = computeSosBreakeven(SOS_BENCHMARK);

  it("profit per job = AOV × (GM − commission)", () => {
    // 12100 × (0.30 − 0.02) = 12100 × 0.28 = 3388
    expect(r.profitPerJob).toBeCloseTo(3388, 2);
  });

  it("break-even ≈ 1.3 jobs/mo", () => {
    // fixed 4500 ÷ 3388
    expect(r.breakEvenJobs).toBeCloseTo(1.328, 2);
  });

  it("lands ~7.1 jobs/mo from £2,500 spend at £35 CPL, 10% close", () => {
    expect(r.leadsPerMo).toBeCloseTo(71.43, 1);
    expect(r.jobsPerMo).toBeCloseTo(7.14, 1);
  });

  it("nets ~£19.7k/mo after all SoS costs", () => {
    expect(r.netProfitMo).toBeGreaterThan(19_500);
    expect(r.netProfitMo).toBeLessThan(19_900);
  });

  it("derives the overall close rate from LQ × QS and exposes quotes/mo", () => {
    expect(r.closeRate).toBeCloseTo(0.10, 5); // 0.40 × 0.25
    expect(r.quotesPerMo).toBeCloseTo(28.57, 1); // 71.43 × 0.40
  });
});

describe("computeSosBreakeven — structural rules", () => {
  it("returns Infinity break-even when a job can't cover its own commission", () => {
    const loss: SosBreakevenInputs = { ...SOS_BENCHMARK, grossMargin: 0.02, commissionPct: 0.02 };
    const r = computeSosBreakeven(loss);
    expect(r.profitPerJob).toBeCloseTo(0, 6);
    expect(r.breakEvenJobs).toBe(Infinity);
  });

  it("uses the overall closeRate when LQ/QS aren't both supplied (real-Pulse preset)", () => {
    const r = computeSosBreakeven(REAL_PULSE);
    expect(r.closeRate).toBeCloseTo(0.10, 5);
    expect(r.quotesPerMo).toBeNull();
    // AOV 15,492 × (0.35 − 0.02) = 15,492 × 0.33 = 5,112.36
    expect(r.profitPerJob).toBeCloseTo(5112.36, 2);
  });

  it("referral/overspill uplift is non-commissionable — lifts net profit but not commission", () => {
    const base = computeSosBreakeven(SOS_BENCHMARK);
    const withUplift = computeSosBreakeven({ ...SOS_BENCHMARK, referralUpliftPct: 0.2, overspillUpliftPct: 0.2 });
    // commission unchanged (charged on the base funnel only)
    expect(withUplift.commissionPerMo).toBeCloseTo(base.commissionPerMo, 6);
    // uplift = 40% of base gross profit, added on top of net
    expect(withUplift.upliftPerMo).toBeCloseTo(base.grossProfitMo * 0.4, 4);
    expect(withUplift.netProfitWithUpliftMo).toBeCloseTo(base.netProfitMo + base.grossProfitMo * 0.4, 4);
  });

  it("break-even is a function of job economics + fixed cost only — not CPL/close rate", () => {
    // Conservative changes only CPL and close rate, so it lands FEWER jobs and a
    // thinner margin of safety, but breaks even at the SAME job count as the benchmark.
    const cons = computeSosBreakeven(CONSERVATIVE);
    const bench = computeSosBreakeven(SOS_BENCHMARK);
    expect(cons.breakEvenJobs).toBeCloseTo(bench.breakEvenJobs, 6); // identical economics/fixed
    expect(cons.jobsPerMo).toBeLessThan(bench.jobsPerMo);           // lands fewer
    expect(cons.jobsPerMo / cons.breakEvenJobs).toBeLessThan(bench.jobsPerMo / bench.breakEvenJobs); // thinner safety
  });

  it("break-even DOES rise when job economics worsen (lower margin)", () => {
    const thin = computeSosBreakeven({ ...SOS_BENCHMARK, grossMargin: 0.20 });
    const base = computeSosBreakeven(SOS_BENCHMARK);
    expect(thin.breakEvenJobs).toBeGreaterThan(base.breakEvenJobs);
  });

  it("handles zero cost-per-lead without dividing by zero", () => {
    const r = computeSosBreakeven({ ...SOS_BENCHMARK, costPerLead: 0 });
    expect(r.leadsPerMo).toBe(0);
    expect(r.jobsPerMo).toBe(0);
  });
});
