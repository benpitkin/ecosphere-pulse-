import { describe, it, expect } from "vitest";
import { buildInsights, type Insight } from "@/lib/insights";
import type { Pulse } from "@/lib/pulse";
import type { Forecast } from "@/lib/forecast";

// buildInsights only reads a small slice of Pulse/Forecast, so minimal fixtures
// (cast through unknown) keep the tests focused on the advice rules.
type Stage = { stage_id: string; stage_name: string; count: number; value: number; weight: number; weighted_value: number };
const stage = (name: string, count: number, value: number): Stage => ({
  stage_id: name, stage_name: name, count, value, weight: 0.5, weighted_value: value * 0.5,
});

const pulse = (metrics: Partial<Pulse["metrics"]> = {}, pipeline: Partial<Pulse["pipeline"]> = {}): Pulse =>
  ({
    metrics: {
      cash: 20000, overdue: 0, receivables: 0, working_capital: 0, net_equity: 0,
      available_liquidity: 20000, runway_months: 5, overheads_used: 10000,
      runway_is_estimate: false, pipeline_gap: null, ...metrics,
    },
    pipeline: { configured: false, stages: [], weighted_value: 0, open_value: 0, open_count: 0, pipeline_name: null, ...pipeline },
  }) as unknown as Pulse;

const forecast = (summary: Partial<Forecast["summary"]> = {}): Forecast =>
  ({ summary: { minCash: 50000, minCashMonth: "Jun-26", closing: 800000, netGeneration: 750000, ...summary } }) as unknown as Forecast;

const find = (ins: Insight[], re: RegExp) => ins.find((i) => re.test(i.title));

describe("buildInsights", () => {
  it("flags overdue as the fastest cash lever, with the correct % share", () => {
    const ins = buildInsights(pulse({ overdue: 6000, receivables: 24000 }), forecast());
    const o = find(ins, /Chase £6,000 of overdue/);
    expect(o?.tone).toBe("action");
    expect(o?.body).toContain("25% of"); // 6000/24000
  });

  it("omits the overdue insight when nothing is overdue", () => {
    expect(find(buildInsights(pulse({ overdue: 0 }), forecast()), /overdue/i)).toBeUndefined();
  });

  it("surfaces proposal-stage leverage with the 22% close value", () => {
    const ins = buildInsights(pulse({}, { configured: true, stages: [stage("Proposal Sent", 5, 100000)] }), forecast());
    const p = find(ins, /sitting in Proposal Sent/);
    expect(p?.tone).toBe("action");
    expect(p?.body).toContain("£22,000"); // 100000 * 0.22
  });

  it("warns about dead/cold clutter only past the 20-lead threshold", () => {
    const dead = (n: number) =>
      buildInsights(pulse({}, { configured: true, stages: [stage("Unqualified/Dead lead", n, 50000)] }), forecast());
    expect(find(dead(25), /clogging the board/)?.tone).toBe("watch");
    expect(find(dead(20), /clogging the board/)).toBeUndefined(); // not > 20
  });

  it("rates forward cover positive at >=6 months, watch below", () => {
    const cover = (weighted: number) =>
      buildInsights(pulse({ overheads_used: 10000 }, { configured: true, weighted_value: weighted, stages: [] }), forecast());
    expect(find(cover(70000), /months of overheads/)?.tone).toBe("positive"); // 7 months
    expect(find(cover(30000), /months of overheads/)?.tone).toBe("watch"); // 3 months
  });

  it("always includes the forecast headline; watch when the low point is thin", () => {
    expect(find(buildInsights(pulse(), forecast({ minCash: 50000 })), /12-month projection/)?.tone).toBe("positive");
    expect(find(buildInsights(pulse(), forecast({ minCash: 5000 })), /12-month projection/)?.tone).toBe("watch");
  });

  it("nudges to connect live cash only when cash is null", () => {
    expect(find(buildInsights(pulse({ cash: null }), forecast()), /Switch cash & equity to live/)?.tone).toBe("info");
    expect(find(buildInsights(pulse({ cash: 20000 }), forecast()), /Switch cash & equity to live/)).toBeUndefined();
  });

  it("skips pipeline-dependent insights when the pipeline isn't configured", () => {
    const ins = buildInsights(pulse({}, { configured: false }), forecast());
    expect(find(ins, /Proposal Sent|clogging the board|months of overheads/)).toBeUndefined();
  });
});
