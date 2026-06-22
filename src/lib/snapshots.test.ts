import { describe, it, expect } from "vitest";
import { summarizeChange, cashStaleDays, type MetricSnapshot } from "@/lib/snapshots";

const snap = (date: string, o: Partial<MetricSnapshot> = {}): MetricSnapshot => ({
  date,
  cash: null, receivables: null, overdue: null, working_capital: null,
  net_equity: null, runway_months: null, weighted_pipeline: null,
  open_pipeline: null, booked_value: null, committed_count: null,
  ...o,
});

const line = (c: ReturnType<typeof summarizeChange>, label: string) =>
  c?.lines.find((l) => l.label === label);

describe("summarizeChange", () => {
  it("returns null with fewer than two snapshots", () => {
    expect(summarizeChange([])).toBeNull();
    expect(summarizeChange([snap("2026-06-11", { cash: 1000 })])).toBeNull();
  });

  it("includes an on-threshold runway move (float dust must not drop it)", () => {
    const c = summarizeChange([
      snap("2026-06-04", { runway_months: 4.0 }),
      snap("2026-06-11", { runway_months: 4.1 }),
    ]);
    const r = line(c, "Runway");
    expect(r).toBeDefined();
    expect(r!.tone).toBe("good");
    expect(r!.deltaText).toBe("+0.1 mo");
  });

  it("tones overdue falling as good and rising as bad", () => {
    const down = line(
      summarizeChange([snap("2026-06-04", { overdue: 6000 }), snap("2026-06-11", { overdue: 4000 })]),
      "Overdue",
    );
    expect(down!.tone).toBe("good");
    expect(down!.deltaText).toBe("−£2,000");

    const up = line(
      summarizeChange([snap("2026-06-04", { overdue: 4000 }), snap("2026-06-11", { overdue: 6000 })]),
      "Overdue",
    );
    expect(up!.tone).toBe("bad");
    expect(up!.deltaText).toBe("+£2,000");
  });

  it("skips a metric that is null in either snapshot", () => {
    const c = summarizeChange([
      snap("2026-06-04", { overdue: 5000 }),
      snap("2026-06-11", { overdue: 3000, cash: 10000 }),
    ]);
    expect(line(c, "Cash")).toBeUndefined(); // cash null in baseline
    expect(line(c, "Overdue")).toBeDefined();
  });

  it("ignores sub-threshold noise", () => {
    const c = summarizeChange([
      snap("2026-06-04", { overdue: 5000 }),
      snap("2026-06-11", { overdue: 5050 }), // £50 < £100 min
    ]);
    expect(c!.lines).toHaveLength(0);
  });

  it("picks the baseline ~window days before the latest", () => {
    const c = summarizeChange([
      snap("2026-05-28", { overdue: 9000 }),
      snap("2026-06-04", { overdue: 7000 }),
      snap("2026-06-11", { overdue: 5000 }),
    ]);
    expect(c!.sinceDate).toBe("2026-06-04");
    expect(c!.days).toBe(7);
    // delta is vs the 7-day baseline (7000), not the oldest (9000)
    expect(line(c, "Overdue")!.deltaText).toBe("−£2,000");
  });

  it("returns an empty line list when nothing moved materially", () => {
    const c = summarizeChange([
      snap("2026-06-04", { overdue: 5000, cash: 20000 }),
      snap("2026-06-11", { overdue: 5000, cash: 20000 }),
    ]);
    expect(c).not.toBeNull();
    expect(c!.lines).toHaveLength(0);
  });
});

describe("cashStaleDays", () => {
  it("returns null with no history or null latest cash", () => {
    expect(cashStaleDays([])).toBeNull();
    expect(cashStaleDays([snap("2026-06-20", { cash: null })])).toBeNull();
  });

  it("counts the days the latest cash value has been unchanged", () => {
    const days = cashStaleDays([
      snap("2026-06-13", { cash: 49668.76 }),
      snap("2026-06-16", { cash: 49668.76 }),
      snap("2026-06-20", { cash: 49668.76 }),
    ]);
    expect(days).toBe(7); // 13th → 20th
  });

  it("returns 0 when cash just changed", () => {
    expect(cashStaleDays([
      snap("2026-06-18", { cash: 40000 }),
      snap("2026-06-19", { cash: 40000 }),
      snap("2026-06-20", { cash: 45000 }), // moved on the latest day
    ])).toBe(0);
  });

  it("stops the run at a different value (only counts the unbroken tail)", () => {
    expect(cashStaleDays([
      snap("2026-06-10", { cash: 50000 }),
      snap("2026-06-18", { cash: 40000 }),
      snap("2026-06-20", { cash: 40000 }),
    ])).toBe(2); // 18th → 20th, not back to the 10th
  });

  it("breaks the run on a null cash entry", () => {
    expect(cashStaleDays([
      snap("2026-06-18", { cash: 40000 }),
      snap("2026-06-19", { cash: null }),
      snap("2026-06-20", { cash: 40000 }),
    ])).toBe(0); // only the latest day counts (prior is null)
  });
});
