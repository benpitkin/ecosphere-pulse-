// ---------------------------------------------------------------------------
// Live cashflow forecast — a port of EcoSphere_Cashflow_Model.xlsx.
//
// Replicates the model's 12-month monthly cash waterfall:
//   opening cash → + inflows → − outflows → closing cash (chained month-to-month)
//
// Anchored to LIVE data where available:
//   * opening cash       — config (set to today's bank balance; auto from Xero
//                          once the reports permission is granted)
//   * existing receivables — live from Xero (collected over the first 2 months)
// Everything else is carried across from the model as tunable assumptions.
// ---------------------------------------------------------------------------

export interface ForecastAssumptions {
  openingCash: number;
  existingReceivables: number; // live from Xero
  overdueReceivables: number;  // live from Xero (collected first)
  monthlyOverheadsBase: number; // fixed opex/mo excl. drawings, marketing, COGS, finance
  ownerDrawings: number;        // owner pay lever output (£/mo cash out)
  capitalOnTapOpening: number;  // CoT balance for the 10% DD schedule
}

export interface ForecastMonth {
  label: string;
  inflows: number;
  outflows: number;
  net: number;
  closing: number;
  // headline components for the table
  committedCash: number;
  busGrants: number;
  newWinsCash: number;
  receivables: number;
  vat: number;
  fixed: number;
  variable: number;
  finance: number;
  oneOffs: number;
}

export interface Forecast {
  months: ForecastMonth[];
  summary: { minCash: number; minCashMonth: string; closing: number; netGeneration: number };
  installs: number[];
  revenue: number[];
}

// 12 forecast months starting at the current month.
function monthLabels(start = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).replace(" ", "-");
  for (let i = 0; i < 12; i++) {
    out.push(fmt(new Date(d.getFullYear(), d.getMonth() + i, 1)));
  }
  return out;
}

// --- model assumptions (from the Assumptions / Lead Funnel tabs) ------------
const AVG_JOB = 15492;
const CPL = 50;
const OTHER_LEADS = 9;
const CAPACITY = 13;
const MATERIALS_PCT = 0.44;
const SUBBIE_PCT = 0.21;
const COGS_PCT = MATERIALS_PCT + SUBBIE_PCT; // 0.65
const BANK_FEE_PCT = 0.0227;
const BUS_GRANT = 9000;
const HP_SHARE = 0.9;
const DNO_MCS = 65;

// Calendar-month-keyed drivers from the Lead Funnel tab.
const MARKETING: Record<string, number> = {
  May: 1936, Jun: 1936, Jul: 3000, Aug: 3000, Sep: 4000, Oct: 4000,
  Nov: 4000, Dec: 4000, Jan: 5000, Feb: 5000, Mar: 5000, Apr: 5000,
};
const ENGAGED_PCT: Record<string, number> = {
  May: 0.29, Jun: 0.29, Jul: 0.32, Aug: 0.35, Sep: 0.38, Oct: 0.4,
  Nov: 0.4, Dec: 0.4, Jan: 0.4, Feb: 0.4, Mar: 0.4, Apr: 0.4,
};
const SEASONAL: Record<string, number> = {
  May: 1.0, Jun: 1.1, Jul: 1.2, Aug: 1.3, Sep: 1.4, Oct: 1.3,
  Nov: 1.1, Dec: 0.7, Jan: 0.8, Feb: 0.9, Mar: 1.05, Apr: 1.15,
};
const WON_PCT = 0.22;

// Committed jobs (advance + balance land in customer-cash month; BUS in grant month).
type Job = { value: number; bus: number; cashMonth: string; busMonth: string | null };
const COMMITTED: Job[] = [
  { value: 11866, bus: 9000, cashMonth: "Jul-26", busMonth: "Sep-26" },
  { value: 15152, bus: 9000, cashMonth: "Jul-26", busMonth: "Sep-26" },
  { value: 18393, bus: 7500, cashMonth: "Jun-26", busMonth: "Aug-26" },
  { value: 21996, bus: 7500, cashMonth: "Jun-26", busMonth: "Aug-26" },
  { value: 11500, bus: 9000, cashMonth: "Aug-26", busMonth: "Oct-26" },
  { value: 12253, bus: 9000, cashMonth: "Aug-26", busMonth: "Oct-26" },
  { value: 13660, bus: 9000, cashMonth: "Jul-26", busMonth: "Sep-26" },
  { value: 13836, bus: 7500, cashMonth: "Jun-26", busMonth: "Aug-26" },
  { value: 34343, bus: 0, cashMonth: "Oct-26", busMonth: null },
];

const mShort = (label: string) => label.split("-")[0];

export function buildForecast(a: ForecastAssumptions): Forecast {
  const labels = monthLabels();
  const n = labels.length;

  // ---- lead funnel: leads -> won -> installs (6wk lag, capped) -> revenue ---
  const won: number[] = labels.map((l) => {
    const m = mShort(l);
    const leads = (MARKETING[m] / CPL + OTHER_LEADS) * SEASONAL[m];
    const engaged = leads * ENGAGED_PCT[m];
    const proposal = engaged * 0.97 * 0.96;
    return proposal * WON_PCT;
  });
  // installs lag won by one month, capped at capacity.
  const installs: number[] = labels.map((_, i) => {
    if (i === 0) return Math.min(won[0], CAPACITY) * 0; // first month: committed only
    return Math.min(won[i - 1], CAPACITY);
  });
  const revenue = installs.map((x) => x * AVG_JOB);

  // ---- committed jobs cash + BUS by month ----------------------------------
  const committedCashByMonth: Record<string, number> = {};
  const committedBusByMonth: Record<string, number> = {};
  for (const j of COMMITTED) {
    committedCashByMonth[j.cashMonth] = (committedCashByMonth[j.cashMonth] || 0) + j.value * 0.75; // advance+balance
    if (j.busMonth) committedBusByMonth[j.busMonth] = (committedBusByMonth[j.busMonth] || 0) + j.bus;
  }

  // ---- monthly waterfall ----------------------------------------------------
  const months: ForecastMonth[] = [];
  let cash = a.openingCash;
  let cotBalance = a.capitalOnTapOpening;

  labels.forEach((label, i) => {
    // INFLOWS
    const committedCash = committedCashByMonth[label] || 0;
    const committedBus = committedBusByMonth[label] || 0;
    // new wins: deposit (25%) the month before install, 75% at install
    const depositNext = i + 1 < n ? installs[i + 1] * AVG_JOB * 0.25 : 0;
    const balanceNow = installs[i] * AVG_JOB * 0.75;
    const newWinsCash = depositNext + balanceNow;
    // new-wins BUS ~2 months after install (90% HP × grant)
    const busFromWins = i >= 2 ? installs[i - 2] * HP_SHARE * BUS_GRANT : 0;
    const busGrants = committedBus + busFromWins;
    // existing receivables: overdue collected month 0, remainder month 1
    let receivables = 0;
    if (i === 0) receivables = a.overdueReceivables;
    else if (i === 1) receivables = Math.max(a.existingReceivables - a.overdueReceivables, 0);
    // VAT: £2,877 one-off in month 2 (Jul-ish), then ~3.3% of installed revenue
    const vat = (i === 1 ? 2877 : 0) + (i >= 3 ? revenue[i] * 0.033 : 0);

    const inflows = committedCash + committedBus + newWinsCash + busFromWins + receivables + vat;

    // OUTFLOWS
    const marketing = MARKETING[mShort(label)];
    // Natasha goes full-time from month ~2 (Jul): +£1,244
    const natashaUplift = i >= 2 ? 1244 : 0;
    const fixed = a.monthlyOverheadsBase + a.ownerDrawings + marketing + natashaUplift;
    // variable COGS on installed revenue (committed + new wins)
    const installedRevenue =
      revenue[i] + committedCash / 0.75; // gross up committed cash to revenue
    const variable =
      installedRevenue * COGS_PCT + installs[i] * DNO_MCS + inflows * BANK_FEE_PCT;
    // finance: CoT 10% min DD (declining), GC £271 (ends month 11), Amex £139
    const cotDD = Math.max(cotBalance * 0.1, 0);
    cotBalance = Math.max(cotBalance - cotDD, 0);
    const finance = cotDD + (i < 11 ? 271 : 0) + 139;
    // one-offs: MCS renewal £2,305 (month 0), corp tax £13k (~Nov), accountant £1,200 (~Feb)
    let oneOffs = 0;
    if (i === 0) oneOffs += 2305;
    if (mShort(label) === "Nov") oneOffs += 13000;
    if (mShort(label) === "Feb") oneOffs += 1200;

    const outflows = fixed + variable + finance + oneOffs;
    const net = inflows - outflows;
    cash += net;

    months.push({
      label, inflows, outflows, net, closing: cash,
      committedCash, busGrants, newWinsCash, receivables, vat,
      fixed, variable, finance, oneOffs,
    });
  });

  const closings = months.map((m) => m.closing);
  const minCash = Math.min(...closings);
  const minCashMonth = months[closings.indexOf(minCash)].label;

  return {
    months,
    summary: {
      minCash: Math.round(minCash),
      minCashMonth,
      closing: Math.round(closings[closings.length - 1]),
      netGeneration: Math.round(closings[closings.length - 1] - a.openingCash),
    },
    installs: installs.map((x) => Math.round(x * 10) / 10),
    revenue: revenue.map((x) => Math.round(x)),
  };
}
