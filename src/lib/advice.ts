import { getCashPosition } from "./xero";
import { getPulseConfig } from "./config";
import { getCommittedJobs } from "./dispatch-jobs";
import { getProposals } from "./ghl-pipeline";
import { buildForecast } from "./forecast";

// Business-advice items shown on the Advice page.
// NOTE: the old Capital-on-Tap advice item was removed after refinancing.
export interface AdviceItem {
  title: string;
  detail: string;
}

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

// Proactive alerts derived from the live data: runway, overdue, forecast dip, stale proposals.
export async function getAdvice(): Promise<AdviceItem[]> {
  const [cash, config, committed, proposals] = await Promise.all([
    getCashPosition(),
    getPulseConfig(),
    getCommittedJobs(),
    getProposals(),
  ]);
  const forecast = buildForecast({ openingCash: cash.cashBalance, committed, config });
  const items: AdviceItem[] = [];

  const runway = config.monthlyOverheads > 0 ? cash.cashBalance / config.monthlyOverheads : 0;
  if (runway < config.lowRunwayMonths) {
    items.push({
      title: "Low runway",
      detail: `Cash covers ~${runway.toFixed(1)} months of overheads (alert below ${config.lowRunwayMonths}). Prioritise collections and converting the pipeline.`,
    });
  }

  if (cash.overdue >= config.overdueAlertGbp) {
    items.push({
      title: "Overdue invoices high",
      detail: `${gbp(cash.overdue)} overdue — above the ${gbp(config.overdueAlertGbp)} alert. Work the overdue chase list on This week.`,
    });
  }

  const dip = forecast.find((m) => m.closing < 0);
  if (dip) {
    items.push({
      title: "Forecast cash dip",
      detail: `Projected cash turns negative in ${dip.label} (closing ${gbp(dip.closing)}). Pull inflows forward or defer outflows.`,
    });
  }

  const stale = proposals.filter((p) => (p.ageDays ?? 0) > 30);
  if (stale.length > 0) {
    const worth = stale.reduce((sum, p) => sum + p.value, 0);
    items.push({
      title: `${stale.length} stale proposal${stale.length === 1 ? "" : "s"}`,
      detail: `Proposals older than 30 days worth ${gbp(worth)} — follow up before they go cold.`,
    });
  }

  if (items.length === 0) {
    items.push({
      title: "All clear",
      detail: "No alerts: runway healthy, overdue within limits, and the forecast stays positive.",
    });
  }
  return items;
}
