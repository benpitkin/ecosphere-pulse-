// ---------------------------------------------------------------------------
// Live cashflow forecast — a port of EcoSphere_Cashflow_Model.xlsx.
// Monthly cash waterfall: opening → + inflows − outflows → closing (chained).
// Anchored to live Xero data (opening cash + receivables) where available.
// All drivers keyed by calendar-month index (0=Jan) to avoid locale issues.
// ---------------------------------------------------------------------------

export interface ForecastAssumptions {
  openingCash: number;
  existingReceivables: number;
  overdueReceivables: number;
  monthlyOverheadsBase: number;
  ownerDrawings: number;
  capitalOnTapOpening: number;
}

export interface ForecastMonth {
  label: string;
  inflows: number;
  outflows: number;
  net: number;
  closing: number;
}

export interface Forecast {
  months: ForecastMonth[];
  summary: { minCash: number; minCashMonth: string; closing: number; netGeneration: number };
  installs: number[];
  revenue: number[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AVG_JOB = 15492;
const CPL = 50;
const OTHER_LEADS = 9;
const CAPACITY = 13;
const COGS_PCT = 0.65; // 44% materials + 21% subbie labour
const BANK_FEE_PCT = 0.0227;
const BUS_GRANT = 9000;
const HP_SHARE = 0.9;
const DNO_MCS = 65;

// Drivers indexed by calendar month (0=Jan … 11=Dec), from the Lead Funnel tab.
const MARKETING = [5000, 5000, 5000, 5000, 1936, 1936, 3000, 3000, 4000, 4000, 4000, 4000];
const ENGAGED_PCT = [0.4, 0.4, 0.4, 0.4, 0.29, 0.29, 0.32, 0.35, 0.38, 0.4, 0.4, 0.4];
const SEASONAL = [0.8, 0.9, 1.05, 1.15, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.1, 0.7];
const WON_PCT = 0.22;

// Committed jobs: advance+balance (75%) land in cash month; BUS in grant month.
type Job = { value: number; bus: number; cashY: number; cashM: number; busY: number | null; busM: number | null };
const COMMITTED: Job[] = [
  { value: 11866, bus: 9000, cashY: 2026, cashM: 6, busY: 2026, busM: 8 }, // Jul / Sep
  { value: 15152, bus: 9000, cashY: 2026, cashM: 6, busY: 2026, busM: 8 },
  { value: 18393, bus: 7500, cashY: 2026, cashM: 5, busY: 2026, busM: 7 }, // Jun / Aug
  { value: 21996, bus: 7500, cashY: 2026, cashM: 5, busY: 2026, busM: 7 },
  { value: 11500, bus: 9000, cashY: 2026, cashM: 7, busY: 2026, busM: 9 }, // Aug / Oct
  { value: 12253, bus: 9000, cashY: 2026, cashM: 7, busY: 2026, busM: 9 },
  { value: 13660, bus: 9000, cashY: 2026, cashM: 6, busY: 2026, busM: 8 }, // Jul / Sep
  { value: 13836, bus: 7500, cashY: 2026, cashM: 5, busY: 2026, busM: 7 }, // Jun / Aug
  { value: 34343, bus: 0, cashY: 2026, cashM: 9, busY: null, busM: null }, // Oct
];

export function buildForecast(a: ForecastAssumptions): Forecast {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const horizon = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return { mo: d.getMonth(), year: d.getFullYear(), label: `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}` };
  });

  // Funnel: leads → won → installs (1-month lag, capped) → revenue.
  const won = horizon.map(({ mo }) => {
    const leads = (MARKETING[mo] / CPL + OTHER_LEADS) * SEASONAL[mo];
    return leads * ENGAGED_PCT[mo] * 0.97 * 0.96 * WON_PCT;
  });
  const installs = horizon.map((_, i) => (i === 0 ? 0 : Math.min(won[i - 1], CAPACITY)));
  const revenue = installs.map((x) => x * AVG_JOB);

  const months: ForecastMonth[] = [];
  let cash = a.openingCash;
  let cot = a.capitalOnTapOpening;

  horizon.forEach(({ mo, year, label }, i) => {
    // INFLOWS
    let committedCash = 0;
    let committedBus = 0;
    for (const j of COMMITTED) {
      if (j.cashY === year && j.cashM === mo) committedCash += j.value * 0.75;
      if (j.busY === year && j.busM === mo) committedBus += j.bus;
    }
    const depositNext = i + 1 < 12 ? installs[i + 1] * AVG_JOB * 0.25 : 0;
    const balanceNow = installs[i] * AVG_JOB * 0.75;
    const newWinsCash = depositNext + balanceNow;
    const busFromWins = i >= 2 ? installs[i - 2] * HP_SHARE * BUS_GRANT : 0;
    let receivables = 0;
    if (i === 0) receivables = a.overdueReceivables;
    else if (i === 1) receivables = Math.max(a.existingReceivables - a.overdueReceivables, 0);
    const vat = (i === 1 ? 2877 : 0) + (i >= 3 ? revenue[i] * 0.033 : 0);

    const inflows = committedCash + committedBus + newWinsCash + busFromWins + receivables + vat;

    // OUTFLOWS
    const natashaUplift = i >= 2 ? 1244 : 0;
    const fixed = a.monthlyOverheadsBase + a.ownerDrawings + MARKETING[mo] + natashaUplift;
    const installedRevenue = revenue[i] + (committedCash > 0 ? committedCash / 0.75 : 0);
    const variable = installedRevenue * COGS_PCT + installs[i] * DNO_MCS + inflows * BANK_FEE_PCT;
    const cotDD = Math.max(cot * 0.1, 0);
    cot = Math.max(cot - cotDD, 0);
    const finance = cotDD + (i < 11 ? 271 : 0) + 139;
    let oneOffs = 0;
    if (i === 0) oneOffs += 2305; // MCS renewal
    if (mo === 10) oneOffs += 13000; // corporation tax (Nov)
    if (mo === 1) oneOffs += 1200; // accountant (Feb)

    const outflows = fixed + variable + finance + oneOffs;
    const net = inflows - outflows;
    cash += net;
    months.push({ label, inflows: r(inflows), outflows: r(outflows), net: r(net), closing: r(cash) });
  });

  const closings = months.map((m) => m.closing);
  let minIdx = 0;
  for (let i = 1; i < closings.length; i++) if (closings[i] < closings[minIdx]) minIdx = i;

  return {
    months,
    summary: {
      minCash: Math.round(closings[minIdx]),
      minCashMonth: months[minIdx].label,
      closing: Math.round(closings[closings.length - 1]),
      netGeneration: Math.round(closings[closings.length - 1] - a.openingCash),
    },
    installs: installs.map((x) => Math.round(x * 10) / 10),
    revenue: revenue.map((x) => Math.round(x)),
  };
}

function r(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
