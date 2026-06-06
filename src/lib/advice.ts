// ---------------------------------------------------------------------------
// Advice engine — turns the live Pulse snapshot + forecast scenarios into a
// prioritised, actioned set of business recommendations. Deterministic and
// instant; an LLM advisor can layer on top later using the same inputs.
// ---------------------------------------------------------------------------

import type { Pulse } from "@/lib/pulse";
import { buildForecast, forecastInputs, type CommittedJob } from "@/lib/forecast";

export type AdvicePriority = "critical" | "high" | "medium" | "low";

export interface AdviceItem {
  priority: AdvicePriority;
  category: string;
  title: string;
  why: string;
  action: string;
  impact?: string;
}

// Capital on Tap facts from EcoSphere_Cashflow_Model.xlsx (CoT Refinance tab).
const COT_DEBT = 51644;
const COT_APR = 44.8;
const COT_SAVING = "£15–18k over 24 months";
const PROPOSAL_CLOSE = 0.22;
const CURRENT_DRAW = 2000;

const RANK: Record<AdvicePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return "£" + Math.round(n).toLocaleString("en-GB");
}

export function buildAdvice(pulse: Pulse, committed?: CommittedJob[]): AdviceItem[] {
  const out: AdviceItem[] = [];
  const m = pulse.metrics;
  const p = pulse.pipeline;

  // Forecast scenarios for owner-pay affordability.
  const baseInputs = {
    cash: pulse.xero.cash,
    receivables: m.receivables,
    overdue: m.overdue,
  };
  const f2k = buildForecast(forecastInputs({ ...baseInputs, ownerDrawings: 2000 }), { committed });
  const f2kCons = buildForecast(forecastInputs({ ...baseInputs, ownerDrawings: 2000 }), { conservative: true, committed });
  const f4k = buildForecast(forecastInputs({ ...baseInputs, ownerDrawings: 4000 }), { committed });
  const f4kCons = buildForecast(forecastInputs({ ...baseInputs, ownerDrawings: 4000 }), { conservative: true, committed });

  // 1) Overdue receivables — fastest cash, no new sales needed.
  if (m.overdue && m.overdue > 0) {
    const pct = m.receivables ? Math.round((m.overdue / m.receivables) * 100) : null;
    out.push({
      priority: "high",
      category: "Cash",
      title: `Collect ${gbp(m.overdue)} of overdue invoices`,
      why: `${pct != null ? pct + "% of" : "A large share of"} everything owed to you is already past its due date. This is cash you have already earned — collecting it needs no new work.`,
      action: "Call (don't just email) each overdue account this week, oldest first. Offer a card-payment link on the call to close it on the spot.",
      impact: `${gbp(m.overdue)} into the bank`,
    });
  }

  // 2) Capital on Tap — refinanced (Jun-2026) onto a Funding Circle loan.
  out.push({
    priority: "high",
    category: "Debt",
    title: "Clear the last £6,307.67 on Capital on Tap",
    why: `£52k of the Capital on Tap balance was refinanced onto a Funding Circle loan (£2,761.78/mo to Jun-2028, saving ~${COT_SAVING} of interest) — but ~£6,308 still sits on the card at ~${COT_APR}% APR, costing about £235/mo for nothing.`,
    action: "Pay the £6,307.67 off from cash now (you have ~£49.7k) to take the card to zero, then cancel the old Capital on Tap direct debit so it stops pulling money.",
    impact: "Ends the 44.8% interest for good",
  });

  // 3) Owner pay — can the business afford the £4k draw Ben wants?
  {
    const affordable = f4kCons.summary.minCash > 15000;
    const tight = f4kCons.summary.minCash > 0 && f4kCons.summary.minCash <= 15000;
    out.push({
      priority: "medium",
      category: "Owner pay",
      title: affordable
        ? `Your £4k take-home looks affordable`
        : tight
          ? `Phase the move to a £4k take-home`
          : `Hold the £4k take-home for now`,
      why:
        `At £4k/mo the cautious case bottoms out at ${gbp(f4kCons.summary.minCash)} (vs ${gbp(f2kCons.summary.minCash)} at your current £2k), both in ${f4kCons.summary.minCashMonth}. ` +
        `Year-end cash: ${gbp(f4k.summary.closing)} at £4k vs ${gbp(f2k.summary.closing)} at £2k.`,
      action: affordable
        ? "You can step up now that the toxic Capital on Tap debt is refinanced onto a cheaper fixed loan — though stepping up gradually keeps a safety margin."
        : tight
          ? "Lift it in stages — £3k now, £4k once the Aug/Sep grant cash lands and CoT is on a cheaper rate."
          : "Keep drawing £2k until conversion and cash strengthen; revisit after Q3.",
      impact: `${gbp((4000 - CURRENT_DRAW) * 12)}/yr more to you`,
    });
  }

  // 4) Proposal follow-up — highest-leverage sales action.
  if (p.configured) {
    const proposal = p.stages.find((s) => /proposal|quote sent/i.test(s.stage_name));
    if (proposal && proposal.value > 0) {
      out.push({
        priority: "high",
        category: "Sales",
        title: `Chase the ${gbp(proposal.value)} sitting in Proposal Sent`,
        why: `${proposal.count} proposals are awaiting a decision. At your ${Math.round(PROPOSAL_CLOSE * 100)}% close rate that's about ${gbp(proposal.value * PROPOSAL_CLOSE)} of likely revenue — your single biggest lever this week.`,
        action: "Work the list oldest-first. For price-stalled ones, lead with the BUS grant and a finance option rather than dropping the price.",
        impact: `~${gbp(proposal.value * PROPOSAL_CLOSE)} of likely revenue`,
      });
    }
  }

  // 5) Pipeline hygiene — dead / cold clutter.
  if (p.configured) {
    const dead = p.stages.filter((s) => /lost|dead|unqualified|gone cold/i.test(s.stage_name));
    const deadCount = dead.reduce((a, s) => a + s.count, 0);
    const deadValue = dead.reduce((a, s) => a + s.value, 0);
    if (deadCount > 20) {
      out.push({
        priority: "low",
        category: "Pipeline",
        title: `Clear ${deadCount} dead / cold leads off the board`,
        why: `They carry ${gbp(deadValue)} of notional value but almost no chance of closing, which distorts every pipeline number you look at.`,
        action: "Bulk-archive the truly dead; drop the merely cold into a low-touch re-nurture sequence so your live pipeline reflects reality.",
      });
    }
  }

  // 6) Runway watch.
  if (m.runway_months != null && m.runway_months < pulse.config.low_runway_months) {
    out.push({
      priority: m.runway_months < pulse.config.low_runway_months / 2 ? "critical" : "high",
      category: "Cash",
      title: `Runway is ${m.runway_months} months`,
      why: `Available liquidity of ${gbp(m.available_liquidity)} against ${gbp(m.overheads_used)}/mo overheads sits below your ${pulse.config.low_runway_months}-month floor.`,
      action: "Pull the overdue cash forward, hold non-essential spend, and lean on deposit-led jobs until the committed grant cash lands.",
    });
  }

  // 7) Pipeline gap vs target.
  if (m.pipeline_gap != null && m.pipeline_gap < 0) {
    out.push({
      priority: "medium",
      category: "Sales",
      title: `Pipeline is ${gbp(Math.abs(m.pipeline_gap))} below target`,
      why: `Weighted pipeline of ${gbp(p.weighted_value)} trails your ${gbp(pulse.config.pipeline_target_gbp)} target for the period.`,
      action: "Top the funnel up — push marketing for the season and re-engage the warm proposals before chasing brand-new leads.",
    });
  }

  out.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  return out;
}
