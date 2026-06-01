// ---------------------------------------------------------------------------
// Insights engine — turns the live Pulse + forecast numbers into a short,
// prioritised "what this means / what to do" briefing. Deterministic and
// instant; a live-LLM advisor can layer on top later.
// ---------------------------------------------------------------------------

import type { Pulse } from "@/lib/pulse";
import type { Forecast } from "@/lib/forecast";

export type InsightTone = "action" | "watch" | "positive" | "info";
export interface Insight {
  tone: InsightTone;
  title: string;
  body: string;
}

function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return "£" + Math.round(n).toLocaleString("en-GB");
}

const PROPOSAL_CLOSE = 0.22; // model: proposal -> won

export function buildInsights(pulse: Pulse, forecast: Forecast): Insight[] {
  const out: Insight[] = [];
  const m = pulse.metrics;
  const p = pulse.pipeline;

  // 1) Overdue receivables — fastest cash lever.
  if (m.overdue && m.overdue > 0) {
    const pct = m.receivables ? Math.round((m.overdue / m.receivables) * 100) : null;
    out.push({
      tone: "action",
      title: `Chase ${gbp(m.overdue)} of overdue invoices`,
      body:
        `This is your fastest cash win — ${pct != null ? pct + "% of" : "a large share of"} everything owed to you is already past due. ` +
        `Collecting it lands cash immediately without any new sales.`,
    });
  }

  // 2) Proposal-stage leverage.
  if (p.configured) {
    const proposal = p.stages.find((s) => /proposal|quote sent/i.test(s.stage_name));
    if (proposal && proposal.value > 0) {
      out.push({
        tone: "action",
        title: `${gbp(proposal.value)} sitting in Proposal Sent`,
        body:
          `${proposal.count} live proposals are awaiting a decision. At your model's ${Math.round(PROPOSAL_CLOSE * 100)}% proposal-to-win rate that's about ${gbp(proposal.value * PROPOSAL_CLOSE)} of likely revenue — ` +
          `following these up is the single highest-leverage thing you can do this week.`,
      });
    }
  }

  // 3) Pipeline hygiene — dead/cold clutter.
  if (p.configured) {
    const dead = p.stages.filter((s) => /lost|dead|unqualified|gone cold/i.test(s.stage_name));
    const deadCount = dead.reduce((a, s) => a + s.count, 0);
    const deadValue = dead.reduce((a, s) => a + s.value, 0);
    if (deadCount > 20) {
      out.push({
        tone: "watch",
        title: `${deadCount} dead / cold leads are clogging the board`,
        body:
          `They carry ${gbp(deadValue)} of notional value but ~zero chance of closing, so they distort your pipeline view. ` +
          `Archiving or re-nurturing them keeps your numbers honest and your team focused.`,
      });
    }
  }

  // 4) Forward cover — weighted pipeline vs overheads.
  if (p.configured && m.overheads_used > 0 && p.weighted_value > 0) {
    const months = Math.round((p.weighted_value / m.overheads_used) * 10) / 10;
    out.push({
      tone: months >= 6 ? "positive" : "watch",
      title: `Weighted pipeline covers ~${months} months of overheads`,
      body:
        `Your risk-adjusted pipeline of ${gbp(p.weighted_value)} is ${months}× your ~${gbp(m.overheads_used)}/mo running costs. ` +
        (months >= 6 ? "That's healthy forward cover if conversion holds." : "Worth topping the funnel up to widen the cushion."),
    });
  }

  // 5) Forecast headline + low point.
  out.push({
    tone: forecast.summary.minCash < 10000 ? "watch" : "positive",
    title: `12-month projection: lowest cash ${gbp(forecast.summary.minCash)} in ${forecast.summary.minCashMonth}`,
    body:
      `The model closes the year at ${gbp(forecast.summary.closing)} (net ${gbp(forecast.summary.netGeneration)} generated). ` +
      `It assumes marketing scales and conversion lifts, so treat it as the stretch case and watch the ${forecast.summary.minCashMonth} dip.`,
  });

  // 6) Cash visibility gap.
  if (m.cash == null) {
    out.push({
      tone: "info",
      title: "Switch cash & equity to live",
      body:
        "Receivables and pipeline are live, but cash, working capital and net equity still use placeholders — they need the Xero 'reports' permission for this app. Granting it makes runway exact and removes the estimate flag.",
    });
  }

  return out;
}
