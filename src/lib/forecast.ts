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

// Session-only "what-if" overrides for the model's headline figures. Any omitted
// field falls back to the built-in model default.
export interface ForecastOverrides {
  openingCash?: number;
  monthlyOverheads?: number;
  avgJob?: number;
  cogsPct?: number;       // 0..1
  busGrant?: number;      // new-win BUS grant per heat-pump job
  capacity?: number;      // installs per month
  natashaUplift?: number; // extra fixed cost from month 3
  oneOffs?: { mcsRenewal?: number; corporationTax?: number; accountant?: number };
}

export interface ForecastOpts {
  conservative?: boolean;
  marketingScale?: number;
  hire?: boolean;       // hire an installer from Sep-26 (+£2.6k/mo, +1 install/wk)
  committed?: CommittedJob[]; // override the committed-job list (e.g. live Dispatch installs)
  overrides?: ForecastOverrides;
}

// Per-month line-item breakdown behind the inflows/outflows totals (for the waterfall view).
export interface MonthBreakdown {
  // money in
  committedCash: number;
  committedBus: number;
  receivables: number;
  newWinsCash: number;
  busFromWins: number;
  vat: number;
  // fixed costs
  overheads: number;
  ownerDrawings: number;
  marketing: number;
  natashaUplift: number;
  hire: number;
  // variable costs
  cogs: number;
  dnoMcs: number;
  bankFees: number;
  // finance
  fundingCircle: number;
  gcFinance: number;
  amex: number;
  // one-offs
  mcsRenewal: number;
  corporationTax: number;
  accountant: number;
}

export interface ForecastMonth {
  label: string;
  inflows: number;
  outflows: number;
  net: number;
  closing: number;
  breakdown: MonthBreakdown;
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
const HIRE_COST = 2600;      // net + employer uplift, model Scenario 1
const HIRE_CAPACITY = 4.33;  // +1 install/week
// Funding Circle loan that refinanced the Capital on Tap card (Jun-2026):
// £2,761.78/mo, 24 payments from 04-Jul-2026 to 04-Jun-2028.
const FC_LOAN_PAYMENT = 2761.78;

// Drivers indexed by calendar month (0=Jan … 11=Dec), from the Lead Funnel tab.
const MARKETING = [5000, 5000, 5000, 5000, 1936, 1936, 3000, 3000, 4000, 4000, 4000, 4000];
const ENGAGED_PCT = [0.4, 0.4, 0.4, 0.4, 0.29, 0.29, 0.32, 0.35, 0.38, 0.4, 0.4, 0.4];
const SEASONAL = [0.8, 0.9, 1.05, 1.15, 1.0, 1.1, 1.2, 1.3, 1.4, 1.3, 1.1, 0.7];
const WON_PCT = 0.22;

// Committed jobs: advance+balance (75%) land in cash month; BUS in grant month.
export type CommittedJob = { value: number; bus: number; cashY: number; cashM: number; busY: number | null; busM: number | null };
const DEFAULT_COMMITTED: CommittedJob[] = [
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

// Hire / clearance trigger from Sep-26 (calendar year 2026, month index 8 = Sep).
const onFromSep26 = (year: number, mo: number) => year > 2026 || (year === 2026 && mo >= 8);

export function buildForecast(a: ForecastAssumptions, opts: ForecastOpts = {}): Forecast {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const horizon = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return { mo: d.getMonth(), year: d.getFullYear(), label: `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(2)}` };
  });

  const committed = opts.committed ?? DEFAULT_COMMITTED;
  const mktScale = opts.marketingScale ?? 1;
  const mkt = (mo: number) => MARKETING[mo] * mktScale;

  // Editable overrides (session-only what-if); each falls back to the model default.
  const ov = opts.overrides ?? {};
  const avgJob = ov.avgJob ?? AVG_JOB;
  const cogsPct = ov.cogsPct ?? COGS_PCT;
  const busGrant = ov.busGrant ?? BUS_GRANT;
  const capacity = ov.capacity ?? CAPACITY;
  const natashaUpliftAmt = ov.natashaUplift ?? 1244;
  const overheadsBase = ov.monthlyOverheads ?? a.monthlyOverheadsBase;
  const mcsAmt = ov.oneOffs?.mcsRenewal ?? 2305;
  const corpTaxAmt = ov.oneOffs?.corporationTax ?? 13000;
  const accountantAmt = ov.oneOffs?.accountant ?? 1200;
  const opening = ov.openingCash ?? a.openingCash;

  // Funnel: leads → won → installs (1-month lag, capacity-capped) → revenue.
  const scenarioFactor = opts.conservative ? 0.65 : 1;
  const won = horizon.map(({ mo }) => {
    const leads = (mkt(mo) / CPL + OTHER_LEADS) * SEASONAL[mo];
    return leads * ENGAGED_PCT[mo] * 0.97 * 0.96 * WON_PCT * scenarioFactor;
  });
  const capAt = (i: number) => capacity + (opts.hire && onFromSep26(horizon[i].year, horizon[i].mo) ? HIRE_CAPACITY : 0);
  const installs = horizon.map((_, i) => (i === 0 ? 0 : Math.min(won[i - 1], capAt(i))));
  const revenue = installs.map((x) => x * avgJob);

  const months: ForecastMonth[] = [];
  let cash = opening;

  horizon.forEach(({ mo, year, label }, i) => {
    // INFLOWS
    let committedCash = 0;
    let committedBus = 0;
    for (const j of committed) {
      if (j.cashY === year && j.cashM === mo) committedCash += j.value * 0.75;
      if (j.busY === year && j.busM === mo) committedBus += j.bus;
    }
    const depositNext = i + 1 < 12 ? installs[i + 1] * avgJob * 0.25 : 0;
    const balanceNow = installs[i] * avgJob * 0.75;
    const newWinsCash = depositNext + balanceNow;
    const busFromWins = i >= 2 ? installs[i - 2] * HP_SHARE * busGrant : 0;
    let receivables = 0;
    if (i === 0) receivables = a.overdueReceivables;
    else if (i === 1) receivables = Math.max(a.existingReceivables - a.overdueReceivables, 0);
    const vat = (i === 1 ? 2877 : 0) + (i >= 3 ? revenue[i] * 0.033 : 0);

    const inflows = committedCash + committedBus + newWinsCash + busFromWins + receivables + vat;

    // OUTFLOWS — fixed
    const hireOn = opts.hire && onFromSep26(year, mo);
    const natashaUplift = i >= 2 ? natashaUpliftAmt : 0;
    const marketing = mkt(mo);
    const hireCost = hireOn ? HIRE_COST : 0;
    const fixed = overheadsBase + a.ownerDrawings + marketing + natashaUplift + hireCost;

    // OUTFLOWS — variable: COGS on installed revenue + DNO/MCS per install + card/bank fees.
    const installedRevenue = revenue[i] + (committedCash > 0 ? committedCash / 0.75 : 0);
    const cogs = installedRevenue * cogsPct;
    const dnoMcs = installs[i] * DNO_MCS;
    const bankFees = inflows * BANK_FEE_PCT;
    const variable = cogs + dnoMcs + bankFees;

    // Finance: Funding Circle loan (refinanced Capital on Tap) £2,761.78/mo from
    // Jul-2026 to Jun-2028, plus GC Finance (£271, ends Mar-27) and Amex (£139).
    const fcLoanOn = (year === 2026 && mo >= 6) || year === 2027 || (year === 2028 && mo <= 5);
    const fundingCircle = fcLoanOn ? FC_LOAN_PAYMENT : 0;
    const gcFinance = i < 11 ? 271 : 0;
    const amex = 139;
    const finance = fundingCircle + gcFinance + amex;

    // One-offs
    const mcsRenewal = i === 0 ? mcsAmt : 0;
    const corporationTax = mo === 10 ? corpTaxAmt : 0; // Nov
    const accountant = mo === 1 ? accountantAmt : 0; // Feb
    const oneOffs = mcsRenewal + corporationTax + accountant;

    const outflows = fixed + variable + finance + oneOffs;
    const net = inflows - outflows;
    cash += net;
    months.push({
      label,
      inflows: r(inflows),
      outflows: r(outflows),
      net: r(net),
      closing: r(cash),
      breakdown: {
        committedCash: r(committedCash),
        committedBus: r(committedBus),
        receivables: r(receivables),
        newWinsCash: r(newWinsCash),
        busFromWins: r(busFromWins),
        vat: r(vat),
        overheads: r(overheadsBase),
        ownerDrawings: r(a.ownerDrawings),
        marketing: r(marketing),
        natashaUplift: r(natashaUplift),
        hire: r(hireCost),
        cogs: r(cogs),
        dnoMcs: r(dnoMcs),
        bankFees: r(bankFees),
        fundingCircle: r(fundingCircle),
        gcFinance: r(gcFinance),
        amex: r(amex),
        mcsRenewal: r(mcsRenewal),
        corporationTax: r(corporationTax),
        accountant: r(accountant),
      },
    });
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
      netGeneration: Math.round(closings[closings.length - 1] - opening),
    },
    installs: installs.map((x) => Math.round(x * 10) / 10),
    revenue: revenue.map((x) => Math.round(x)),
  };
}

function r(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// Shared model defaults + input builder so the cockpit and forecast page agree.
export const FORECAST_DEFAULTS = {
  openingCash: 45000,
  monthlyOverheadsBase: 8850,
  ownerDrawings: 2000,
  capitalOnTap: 51644,
};

// Default values for the editable "what-if" figures panel — mirror the model constants
// so the UI can seed inputs and offer "reset to defaults" without hardcoding them twice.
export const MODEL_DEFAULTS = {
  monthlyOverheads: FORECAST_DEFAULTS.monthlyOverheadsBase,
  avgJob: AVG_JOB,
  cogsPct: COGS_PCT,
  busGrant: BUS_GRANT,
  capacity: CAPACITY,
  natashaUplift: 1244,
  oneOffs: { mcsRenewal: 2305, corporationTax: 13000, accountant: 1200 },
};

export function forecastInputs(args: {
  cash: number | null;
  receivables: number | null;
  overdue: number | null;
  openingCashOverride?: number | null;
  ownerDrawings?: number | null;
  capitalOnTap?: number | null;
}): ForecastAssumptions {
  return {
    openingCash: args.openingCashOverride ?? args.cash ?? FORECAST_DEFAULTS.openingCash,
    existingReceivables: args.receivables ?? 0,
    overdueReceivables: args.overdue ?? 0,
    monthlyOverheadsBase: FORECAST_DEFAULTS.monthlyOverheadsBase,
    ownerDrawings: args.ownerDrawings ?? FORECAST_DEFAULTS.ownerDrawings,
    capitalOnTapOpening: args.capitalOnTap ?? FORECAST_DEFAULTS.capitalOnTap,
  };
}

// Convert live Dispatch scheduled installs into the forecast's committed-job
// shape: customer cash (75%) lands in the install month; a BUS grant follows
// ~2 months later for heat-pump jobs.
export function toCommittedJobs(
  jobs: { value: number | null; install_date: string | null; job_type: string | null }[],
): CommittedJob[] {
  const out: CommittedJob[] = [];
  for (const j of jobs) {
    if (!j.install_date || !j.value || j.value <= 0) continue;
    const d = new Date(j.install_date + "T00:00:00");
    if (isNaN(d.getTime())) continue;
    const cashY = d.getFullYear();
    const cashM = d.getMonth();
    // BUS grant is heat-pump installs only — match the exact Dispatch job_type enum
    // value so a heat_loss_survey (which contains "heat") doesn't wrongly qualify.
    const bus = j.job_type === "ashp_install" ? 7500 : 0;
    const bd = new Date(cashY, cashM + 2, 1); // ~8-week grant lag
    out.push({
      value: j.value,
      bus,
      cashY,
      cashM,
      busY: bus > 0 ? bd.getFullYear() : null,
      busM: bus > 0 ? bd.getMonth() : null,
    });
  }
  return out;
}
