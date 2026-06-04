// ---------------------------------------------------------------------------
// Business context for the Pulse assistant. Assembles the live snapshot —
// cash, pipeline, forecast scenarios, scheduled installs and advice — into a
// compact text block the LLM reasons over. Read-only.
// ---------------------------------------------------------------------------

import { buildPulse } from "@/lib/pulse";
import { buildForecast, forecastInputs } from "@/lib/forecast";
import { getCommittedJobs, fetchScheduledInstalls } from "@/lib/dispatch-jobs";
import { buildAdvice } from "@/lib/advice";

function gbp(n: number | null | undefined): string {
  if (n == null) return "unknown";
  return "£" + Math.round(n).toLocaleString("en-GB");
}

export async function buildBusinessContext(): Promise<string> {
  const pulse = await buildPulse();
  const committed = await getCommittedJobs();
  const installs = await fetchScheduledInstalls();
  const m = pulse.metrics;
  const p = pulse.pipeline;

  const inputs = forecastInputs({ cash: pulse.xero.cash, receivables: m.receivables, overdue: m.overdue });
  const base2k = buildForecast(inputs, { committed });
  const cons2k = buildForecast(inputs, { conservative: true, committed });
  const base4k = buildForecast(forecastInputs({ cash: pulse.xero.cash, receivables: m.receivables, overdue: m.overdue, ownerDrawings: 4000 }), { committed });
  const cons4k = buildForecast(forecastInputs({ cash: pulse.xero.cash, receivables: m.receivables, overdue: m.overdue, ownerDrawings: 4000 }), { conservative: true, committed });
  const advice = buildAdvice(pulse, committed);

  const lines: string[] = [];
  lines.push("BUSINESS: EcoSphere Energy — heat-pump (ASHP) and solar installer in Devon, UK. Owner: Ben. Grant scheme: Boiler Upgrade Scheme (BUS), ~£7.5k per heat-pump job, funded to March 2030.");
  lines.push(`SNAPSHOT DATE: ${pulse.xero.snapshot_date ?? "today"}.`);

  lines.push("\nCASH & POSITION (live from Xero):");
  lines.push(`- Cash on hand: ${gbp(m.cash)}. Available liquidity: ${gbp(m.available_liquidity)}.`);
  lines.push(`- Runway: ${m.runway_months ?? "unknown"} months at ${gbp(m.overheads_used)}/mo overheads (this includes Ben's current ~£2,000/mo take-home).`);
  lines.push(`- Overdue receivables: ${gbp(m.overdue)} of ${gbp(m.receivables)} total. Working capital: ${gbp(m.working_capital)}. Net equity: ${gbp(m.net_equity)}.`);

  lines.push("\nPIPELINE (live from GoHighLevel):");
  lines.push(`- ${p.open_count} active opportunities, ${gbp(p.open_value)} raw / ${gbp(p.weighted_value)} weighted.`);
  const activeStages = p.stages.filter((s) => s.weight > 0 && s.count > 0).sort((a, b) => b.value - a.value);
  if (activeStages.length) {
    lines.push("- Active stages: " + activeStages.map((s) => `${s.stage_name.replace(/[^\x20-\x7E]/g, "").trim()} — ${s.count} deals, ${gbp(s.value)} (weight ${Math.round(s.weight * 100)}%)`).join("; ") + ".");
  }
  const proposal = p.stages.find((s) => /proposal|quote sent/i.test(s.stage_name));
  if (proposal) lines.push(`- Biggest lever: Proposal Sent has ${proposal.count} deals worth ${gbp(proposal.value)} (~22% close = ${gbp(proposal.value * 0.22)} likely revenue).`);

  lines.push("\nBOOKINGS & INSTALLS (live from Dispatch):");
  const confirmedJobs = installs.jobs.filter((j) => /confirm/i.test(j.status || ""));
  const unassignedJobs = installs.jobs.filter((j) => /draft/i.test(j.status || ""));
  lines.push(`- ${installs.jobs.length} accepted jobs worth ${gbp(installs.total_value)} total; next install ${installs.next_date ?? "n/a"}.`);
  lines.push(`- ${confirmedJobs.length} CONFIRMED (subcontractor assigned, date agreed): ${confirmedJobs.map((j) => `${j.client_name} ${j.install_date} ${gbp(j.value)}`).join("; ") || "none"}.`);
  lines.push(`- ${unassignedJobs.length} UNASSIGNED bookings (date held for the customer, awaiting a subcontractor): ${unassignedJobs.map((j) => `${j.client_name} ${j.install_date} ${gbp(j.value)}`).join("; ") || "none"}.`);
  lines.push("- Note: deposits on these are already in the cash figure; the balance and BUS grant land on each install date.");

  lines.push("\n12-MONTH CASH FORECAST (ported from Ben's model, driven by the booked jobs above):");
  lines.push(`- At current £2k/mo take-home: closing ${gbp(base2k.summary.closing)}, lowest ${gbp(base2k.summary.minCash)} in ${base2k.summary.minCashMonth} (cautious case lowest ${gbp(cons2k.summary.minCash)}).`);
  lines.push(`- At £4k/mo take-home: closing ${gbp(base4k.summary.closing)}, lowest ${gbp(base4k.summary.minCash)} (cautious lowest ${gbp(cons4k.summary.minCash)}).`);
  lines.push("- Month-by-month closing cash (base case, current £2k draw): " + base2k.months.map((mo) => `${mo.label} ${gbp(mo.closing)}`).join(", ") + ".");
  lines.push("- Forecast levers Ben can toggle on the Forecast page: take-home draw (£2k–£6k), marketing spend, clear Capital on Tap (£20k Aug + £15k Nov → debt-free ~Nov-26), hire an installer from Sep-26 (+£2.6k/mo, only pays off above ~13 installs/mo).");

  lines.push("\nDEBT: Capital on Tap balance ~£51,644 at ~44.8% APR (the most expensive money in the business). Refinancing saves ~£15–18k over 24 months.");

  lines.push("\nCURRENT PRIORITISED ADVICE:");
  for (const a of advice) lines.push(`- [${a.priority}] ${a.title} — ${a.action}`);

  return lines.join("\n");
}
