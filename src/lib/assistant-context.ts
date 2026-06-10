import { buildForecast } from "./forecast";
import { getPulseConfig } from "./config";
import { getCashPosition } from "./xero";
import { getCommittedJobs } from "./dispatch-jobs";
import { getProposals } from "./ghl-pipeline";
import { getCrew } from "./crew";

// Rich context handed to the LLM: forecast, pipeline, bookings, overdue, proposals, crew.
// Debt note: Capital on Tap is FULLY CLEARED (refinanced to Funding Circle £2,761.78/mo).
export async function buildAssistantContext() {
  const [config, cash, committed, proposals, crew] = await Promise.all([
    getPulseConfig(),
    getCashPosition(),
    getCommittedJobs(),
    getProposals(),
    getCrew(),
  ]);
  return {
    forecast: buildForecast({ openingCash: cash.cashBalance, committed, config }),
    cash,
    committed,
    proposals,
    crew,
    debtNote:
      "Capital on Tap fully cleared; refinanced to a Funding Circle loan (£2,761.78/mo, ends Jun-2028).",
  };
}
