"use client";

import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { buildForecast, forecastInputs, MODEL_DEFAULTS, type CommittedJob, type MonthBreakdown } from "@/lib/forecast";

interface Props {
  cash: number | null;
  receivables: number | null;
  overdue: number | null;
  openingOverride: number | null;
  initialDraw?: number | null;
  committed?: CommittedJob[];
}

const DRAW_PRESETS = [2000, 3000, 4000, 5000];
const MKT_PRESETS = [
  { label: "Lean", scale: 0.5 },
  { label: "Current", scale: 1 },
  { label: "Push", scale: 1.5 },
  { label: "Aggressive", scale: 2 },
];

// Line-item rows for the cash waterfall, grouped like the spreadsheet.
const WATERFALL_GROUPS: { title: string; rows: { label: string; key: keyof MonthBreakdown }[] }[] = [
  {
    title: "Money in",
    rows: [
      { label: "Committed jobs — customer cash", key: "committedCash" },
      { label: "Committed jobs — BUS grants", key: "committedBus" },
      { label: "Existing receivables (Xero)", key: "receivables" },
      { label: "New wins — cash + deposits", key: "newWinsCash" },
      { label: "New wins — BUS grants", key: "busFromWins" },
      { label: "VAT", key: "vat" },
    ],
  },
  {
    title: "Fixed costs",
    rows: [
      { label: "Overheads (payroll, bills)", key: "overheads" },
      { label: "Owner drawings", key: "ownerDrawings" },
      { label: "Marketing", key: "marketing" },
      { label: "Natasha uplift", key: "natashaUplift" },
      { label: "New installer (hire)", key: "hire" },
    ],
  },
  {
    title: "Variable costs",
    rows: [
      { label: "Materials + subbie (COGS)", key: "cogs" },
      { label: "DNO + MCS", key: "dnoMcs" },
      { label: "Card / bank fees", key: "bankFees" },
    ],
  },
  {
    title: "Finance & one-off",
    rows: [
      { label: "Funding Circle loan", key: "fundingCircle" },
      { label: "GC Finance", key: "gcFinance" },
      { label: "Amex", key: "amex" },
      { label: "MCS renewal", key: "mcsRenewal" },
      { label: "Corporation tax", key: "corporationTax" },
      { label: "Accountant", key: "accountant" },
    ],
  },
];

// Blank for £0 so the grid reads like the spreadsheet; £ otherwise.
const wfCell = (n: number): string => (Math.round(n) === 0 ? "—" : gbp(n));

interface Pinned {
  id: number;
  name: string;
  settings: string;
  closing: number;
  minCash: number;
  minMonth: string;
  net: number;
  danger: number;
}

// Labelled number input for the editable-figures panel.
function NumberField({
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full rounded-md border border-border px-2 py-1 text-sm"
      />
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export default function ForecastExplorer({ cash, receivables, overdue, openingOverride, initialDraw, committed }: Props) {
  const [drawings, setDrawings] = useState(initialDraw && initialDraw >= 2000 ? initialDraw : 2000);
  const [mktScale, setMktScale] = useState(1);
  const [hire, setHire] = useState(false);

  // Editable "what-if" figures (session-only). Seeded from the model defaults; opening
  // cash from live Xero / the page override.
  const seedOpening = forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride }).openingCash;
  const [openingCashEdit, setOpeningCashEdit] = useState(seedOpening);
  const [overheads, setOverheads] = useState(MODEL_DEFAULTS.monthlyOverheads);
  const [avgJob, setAvgJob] = useState(MODEL_DEFAULTS.avgJob);
  const [cogsPct, setCogsPct] = useState(MODEL_DEFAULTS.cogsPct);
  const [busGrant, setBusGrant] = useState(MODEL_DEFAULTS.busGrant);
  const [capacity, setCapacity] = useState(MODEL_DEFAULTS.capacity);
  const [natasha, setNatasha] = useState(MODEL_DEFAULTS.natashaUplift);
  const [mcs, setMcs] = useState(MODEL_DEFAULTS.oneOffs.mcsRenewal);
  const [corpTax, setCorpTax] = useState(MODEL_DEFAULTS.oneOffs.corporationTax);
  const [accountant, setAccountant] = useState(MODEL_DEFAULTS.oneOffs.accountant);

  // Pinned scenarios for side-by-side comparison (session-only).
  const [scenarios, setScenarios] = useState<Pinned[]>([]);
  const [scnName, setScnName] = useState("");

  const resetFigures = () => {
    setOpeningCashEdit(seedOpening);
    setOverheads(MODEL_DEFAULTS.monthlyOverheads);
    setAvgJob(MODEL_DEFAULTS.avgJob);
    setCogsPct(MODEL_DEFAULTS.cogsPct);
    setBusGrant(MODEL_DEFAULTS.busGrant);
    setCapacity(MODEL_DEFAULTS.capacity);
    setNatasha(MODEL_DEFAULTS.natashaUplift);
    setMcs(MODEL_DEFAULTS.oneOffs.mcsRenewal);
    setCorpTax(MODEL_DEFAULTS.oneOffs.corporationTax);
    setAccountant(MODEL_DEFAULTS.oneOffs.accountant);
  };

  const overrides = useMemo(
    () => ({
      openingCash: openingCashEdit,
      monthlyOverheads: overheads,
      avgJob,
      cogsPct,
      busGrant,
      capacity,
      natashaUplift: natasha,
      oneOffs: { mcsRenewal: mcs, corporationTax: corpTax, accountant },
    }),
    [openingCashEdit, overheads, avgJob, cogsPct, busGrant, capacity, natasha, mcs, corpTax, accountant],
  );

  // Selected scenario (base + conservative).
  const base = useMemo(
    () => buildForecast(
      forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride, ownerDrawings: drawings }),
      { marketingScale: mktScale, hire, committed, overrides },
    ),
    [cash, receivables, overdue, openingOverride, drawings, mktScale, hire, committed, overrides],
  );
  const cons = useMemo(
    () => buildForecast(
      forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride, ownerDrawings: drawings }),
      { conservative: true, marketingScale: mktScale, hire, committed, overrides },
    ),
    [cash, receivables, overdue, openingOverride, drawings, mktScale, hire, committed, overrides],
  );

  const liveCash = cash != null || openingOverride != null;
  const openingCash = forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride }).openingCash;

  // ---- affordability read ----
  const extraPerYear = (drawings - 2000) * 12;
  const min = base.summary.minCash;
  const minCons = cons.summary.minCash;
  const verdict =
    minCons < 0 ? { tone: "bad", text: "Not affordable in the cautious case — cash goes negative." }
      : minCons < 15000 ? { tone: "warn", text: "Affordable but tight — leaves a thin buffer if wins slip." }
        : { tone: "good", text: "Comfortably affordable across both scenarios." };
  const verdictClr =
    verdict.tone === "bad" ? "border-red-300 bg-red-50 text-red-800"
      : verdict.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-800";

  // ---- chart geometry ----
  const W = 860, H = 280, padL = 64, padR = 16, padT = 16, padB = 36;
  const baseC = base.months.map((m) => m.closing);
  const consC = cons.months.map((m) => m.closing);
  // Danger floor: one month of overheads. Cash below this = too thin a buffer.
  const dangerFloor = overheads;
  const all = [...baseC, ...consC, 0, dangerFloor];
  const yMin = Math.min(...all);
  const yMax = Math.max(...all);
  const span = yMax - yMin || 1;
  const x = (i: number) => padL + (i / (base.months.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / span) * (H - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const zeroY = y(0);
  const dangerY = y(dangerFloor);
  const plotBottom = H - padB;
  const dangerMonths = baseC.filter((v) => v < dangerFloor).length;
  const minIdx = baseC.indexOf(Math.min(...baseC));

  // ---- scenario comparison ----
  const settingsLabel = `${gbp(drawings)} draw · ${mktScale}× mkt${hire ? " · +hire" : ""}`;
  const pinScenario = () =>
    setScenarios((s) => [
      ...s,
      {
        id: s.length ? s[s.length - 1].id + 1 : 1,
        name: scnName.trim() || `Scenario ${s.length + 1}`,
        settings: settingsLabel,
        closing: base.summary.closing,
        minCash: base.summary.minCash,
        minMonth: base.summary.minCashMonth,
        net: base.summary.netGeneration,
        danger: dangerMonths,
      },
    ]);
  const compareRows: Pinned[] = [
    { id: 0, name: "Current", settings: settingsLabel, closing: base.summary.closing, minCash: base.summary.minCash, minMonth: base.summary.minCashMonth, net: base.summary.netGeneration, danger: dangerMonths },
    ...scenarios,
  ];
  const bestClosing = Math.max(...compareRows.map((r) => r.closing));
  const bestLowest = Math.max(...compareRows.map((r) => r.minCash));

  // Export the base-case monthly forecast as CSV (for the bank / accountant).
  const downloadCsv = () => {
    const rows = [["Month", "Money in", "Money out", "Net", "Closing cash"]];
    for (const mn of base.months) {
      rows.push([mn.label, String(Math.round(mn.inflows)), String(Math.round(mn.outflows)), String(Math.round(mn.net)), String(Math.round(mn.closing))]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ecosphere-cash-forecast.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-1 flex items-end justify-between">
        <h1 className="text-2xl font-bold tracking-tight">12-month cash forecast</h1>
        <button
          onClick={downloadCsv}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent"
        >
          Download CSV
        </button>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Live port of your model · opening cash {liveCash ? (openingOverride != null ? `set to ${gbp(openingCash)}` : "live from Xero") : `placeholder ${gbp(openingCash)}`} · receivables live · drag the levers to see what is possible
      </p>

      {/* ---- Scenario controls ---- */}
      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-base font-semibold">What can the business afford?</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Owner drawings */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Your monthly take-home</span>
              <span className="text-lg font-bold text-accent">{gbp(drawings)}/mo</span>
            </div>
            <input
              type="range" min={2000} max={6000} step={250} value={drawings}
              onChange={(e) => setDrawings(Number(e.target.value))}
              className="w-full accent-[hsl(180_70%_35%)]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {DRAW_PRESETS.map((d) => (
                <button key={d} onClick={() => setDrawings(d)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${drawings === d ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent"}`}>
                  {gbp(d)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              You currently draw £2,000. {extraPerYear > 0 ? `This pulls ${gbp(extraPerYear)} more out over 12 months.` : "Baseline."}
            </p>
          </div>

          {/* Marketing */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Marketing spend</span>
              <span className="text-lg font-bold text-accent">{mktScale}×</span>
            </div>
            <input
              type="range" min={0.5} max={2} step={0.25} value={mktScale}
              onChange={(e) => setMktScale(Number(e.target.value))}
              className="w-full accent-[hsl(180_70%_35%)]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {MKT_PRESETS.map((m) => (
                <button key={m.label} onClick={() => setMktScale(m.scale)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${mktScale === m.scale ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Scales lead spend up or down — more leads and more wins, but more cash out now.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <button onClick={() => setHire((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${hire ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent"}`}>
            {hire ? "\u2713 " : ""}Hire an installer from Sep-26 (+£2.6k/mo)
          </button>
        </div>
        {hire ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Adds installer capacity from Sep-26. It only pays for itself once demand tops your current ~13 installs/mo — try it with marketing on Push or Aggressive.
          </p>
        ) : null}

        <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${verdictClr}`}>
          <span className="font-semibold">{gbp(drawings)}/mo draw: </span>{verdict.text}{" "}
          Lowest cash {gbp(min)} (base) / {gbp(minCons)} (cautious), in {base.summary.minCashMonth}.
        </div>
      </Card>

      {/* Edit the figures — session-only what-if overrides */}
      <details className="mb-6 rounded-lg border border-border bg-white px-5 py-4">
        <summary className="cursor-pointer text-base font-semibold">
          Edit the figures{" "}
          <span className="text-xs font-normal text-muted-foreground">— change any number and the forecast updates live; resets on refresh</span>
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <NumberField label="Opening cash (£)" value={openingCashEdit} onChange={setOpeningCashEdit} step={1000} />
          <NumberField label="Monthly overheads (£)" value={overheads} onChange={setOverheads} step={100} hint="Payroll + bills, excl. draw & marketing" />
          <NumberField label="Average job value (£)" value={avgJob} onChange={setAvgJob} step={500} />
          <NumberField label="COGS (%)" value={Math.round(cogsPct * 100)} onChange={(n) => setCogsPct(n / 100)} step={1} hint="Materials + subbie labour" />
          <NumberField label="BUS grant / job (£)" value={busGrant} onChange={setBusGrant} step={500} hint="New-win heat-pump grant" />
          <NumberField label="Install capacity / mo" value={capacity} onChange={setCapacity} step={1} />
          <NumberField label="Natasha uplift (£/mo)" value={natasha} onChange={setNatasha} step={50} hint="From month 3" />
          <NumberField label="MCS renewal (£)" value={mcs} onChange={setMcs} step={100} hint="One-off, this month" />
          <NumberField label="Corporation tax (£)" value={corpTax} onChange={setCorpTax} step={500} hint="One-off, November" />
          <NumberField label="Accountant (£)" value={accountant} onChange={setAccountant} step={100} hint="One-off, February" />
        </div>
        <button
          onClick={resetFigures}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent"
        >
          Reset to model defaults
        </button>
      </details>

      {/* Summary: base vs conservative */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Closing cash (12mo)</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-accent">{gbp(base.summary.closing)}</span>
            <span className="text-sm text-amber-600">{gbp(cons.summary.closing)} cons.</span>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Lowest cash point</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${base.summary.minCash < 0 ? "text-red-600" : base.summary.minCash < 10000 ? "text-amber-600" : "text-foreground"}`}>{gbp(base.summary.minCash)}</span>
            <span className="text-sm text-amber-600">{gbp(cons.summary.minCash)} cons.</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">in {base.summary.minCashMonth}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Net generated (12mo)</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${base.summary.netGeneration < 0 ? "text-red-600" : "text-emerald-600"}`}>{gbp(base.summary.netGeneration)}</span>
            <span className="text-sm text-amber-600">{gbp(cons.summary.netGeneration)} cons.</span>
          </div>
        </Card>
      </div>

      {/* Compare scenarios */}
      <Card className="mb-6 p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Compare scenarios</h2>
          <div className="flex items-center gap-2">
            <input
              value={scnName}
              onChange={(e) => setScnName(e.target.value)}
              placeholder="Name (optional)"
              className="w-40 rounded-md border border-border px-2 py-1 text-sm"
            />
            <button onClick={pinScenario} className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">
              Pin current
            </button>
            {scenarios.length > 0 ? (
              <button onClick={() => setScenarios([])} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent">
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Set the levers and figures above, pin it, then change them and pin again to line up the big calls side by side. Session-only.
        </p>
        {scenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved scenarios yet — adjust the levers, then &ldquo;Pin current&rdquo;.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Scenario</th>
                  <th className="py-1 pr-3 text-right font-medium">Closing cash</th>
                  <th className="py-1 pr-3 text-right font-medium">Lowest cash</th>
                  <th className="py-1 pr-3 text-right font-medium">Net generated</th>
                  <th className="py-1 text-right font-medium">Months at risk</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.id} className={`border-b border-border ${r.name === "Current" ? "bg-accent/5" : ""}`}>
                    <td className="py-1.5 pr-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.settings}</div>
                    </td>
                    <td className={`py-1.5 pr-3 text-right font-semibold ${r.closing === bestClosing ? "text-emerald-600" : ""}`}>{gbp(r.closing)}</td>
                    <td className={`py-1.5 pr-3 text-right ${r.minCash < 0 ? "text-red-600" : r.minCash < 10000 ? "text-amber-600" : r.minCash === bestLowest ? "text-emerald-600" : ""}`}>
                      {gbp(r.minCash)} <span className="text-xs text-muted-foreground">({r.minMonth})</span>
                    </td>
                    <td className={`py-1.5 pr-3 text-right ${r.net < 0 ? "text-red-600" : "text-emerald-600"}`}>{gbp(r.net)}</td>
                    <td className={`py-1.5 text-right ${r.danger > 0 ? "text-red-600" : "text-emerald-600"}`}>{r.danger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Cash trajectory chart */}
      <Card className="mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Closing cash trajectory</h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-accent" /> Base</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-amber-500" /> Conservative</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Closing cash trajectory chart">
          {/* Danger zone — projected cash below one month of overheads */}
          {dangerY < plotBottom ? (
            <g>
              <rect x={padL} y={dangerY} width={W - padL - padR} height={plotBottom - dangerY} fill="hsl(0 72% 60%)" opacity="0.08" />
              <line x1={padL} x2={W - padR} y1={dangerY} y2={dangerY} stroke="hsl(0 72% 55%)" strokeWidth="1" strokeDasharray="4 3" />
              <text x={W - padR} y={dangerY - 4} textAnchor="end" fontSize="10" fill="hsl(0 72% 45%)">
                1-month buffer ({gbp(dangerFloor)})
              </text>
            </g>
          ) : null}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const v = yMin + t * span;
            return (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="hsl(214 32% 91%)" strokeWidth="1" />
                <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="hsl(215 16% 47%)">{gbp(v)}</text>
              </g>
            );
          })}
          {yMin < 0 && yMax > 0 ? <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="hsl(0 70% 60%)" strokeWidth="1" strokeDasharray="3 3" /> : null}
          <polyline points={line(consC)} fill="none" stroke="hsl(38 92% 50%)" strokeWidth="2" strokeDasharray="5 4" />
          <polyline points={line(baseC)} fill="none" stroke="hsl(180 70% 35%)" strokeWidth="2.5" />
          {baseC.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={v < dangerFloor ? 3.5 : 2.5} fill={v < dangerFloor ? "hsl(0 72% 55%)" : "hsl(180 70% 35%)"} />
          ))}
          <circle cx={x(minIdx)} cy={y(baseC[minIdx])} r="5" fill="none" stroke="hsl(38 92% 50%)" strokeWidth="2" />
          {base.months.map((mn, i) => (i % 2 === 0 ?
            <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="hsl(215 16% 47%)">{mn.label}</text> : null))}
        </svg>
        {dangerMonths > 0 ? (
          <p className="mt-2 text-xs font-medium text-red-600">
            ⚠ Projected cash drops below a one-month overheads buffer ({gbp(dangerFloor)}) in {dangerMonths} of 12 months — tightest in {base.summary.minCashMonth}.
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-emerald-600">
            ✓ Projected cash stays above a one-month overheads buffer ({gbp(dangerFloor)}) all year.
          </p>
        )}
      </Card>

      {/* Monthly table (base) */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Monthly projection · base case</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Month</th>
                <th className="py-1 pr-3 font-medium">Installs</th>
                <th className="py-1 pr-3 font-medium text-right">Money in</th>
                <th className="py-1 pr-3 font-medium text-right">Money out</th>
                <th className="py-1 pr-3 font-medium text-right">Net</th>
                <th className="py-1 font-medium text-right">Closing cash</th>
              </tr>
            </thead>
            <tbody>
              {base.months.map((mn, i) => (
                <tr key={mn.label} className="border-t border-border">
                  <td className="py-1.5 pr-3">{mn.label}</td>
                  <td className="py-1.5 pr-3">{base.installs[i]}</td>
                  <td className="py-1.5 pr-3 text-right">{gbp(mn.inflows)}</td>
                  <td className="py-1.5 pr-3 text-right">{gbp(mn.outflows)}</td>
                  <td className={`py-1.5 pr-3 text-right ${mn.net < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {mn.net < 0 ? "−" : "+"}{gbp(Math.abs(mn.net))}
                  </td>
                  <td className={`py-1.5 text-right font-semibold ${mn.closing < 0 ? "text-red-600" : mn.closing < 10000 ? "text-amber-600" : ""}`}>
                    {gbp(mn.closing)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detailed cash waterfall — line item × month */}
      <Card className="mt-6 p-5">
        <h2 className="mb-1 text-base font-semibold">Cash waterfall · base case</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Every line of money in and out, month by month — live from your model, so it moves with the levers above. Blank cells are £0.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-right text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 z-10 bg-white py-1 pr-3 text-left font-medium">Line item</th>
                {base.months.map((m) => (
                  <th key={m.label} className="px-2 py-1 font-medium">{m.label}</th>
                ))}
                <th className="px-2 py-1 font-semibold">12mo</th>
              </tr>
            </thead>
            <tbody>
              {WATERFALL_GROUPS.map((g) => (
                <Fragment key={g.title}>
                  <tr className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left font-semibold text-foreground">{g.title}</td>
                    <td colSpan={base.months.length + 1} />
                  </tr>
                  {g.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="sticky left-0 z-10 bg-white py-0.5 pr-3 text-left text-muted-foreground">{row.label}</td>
                      {base.months.map((m) => (
                        <td key={m.label} className="px-2 py-0.5">{wfCell(m.breakdown[row.key])}</td>
                      ))}
                      <td className="px-2 py-0.5 font-medium">
                        {wfCell(base.months.reduce((acc, m) => acc + m.breakdown[row.key], 0))}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Total money in</td>
                {base.months.map((m) => <td key={m.label} className="px-2 py-1">{wfCell(m.inflows)}</td>)}
                <td className="px-2 py-1">{wfCell(base.months.reduce((acc, m) => acc + m.inflows, 0))}</td>
              </tr>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Total money out</td>
                {base.months.map((m) => <td key={m.label} className="px-2 py-1">{wfCell(m.outflows)}</td>)}
                <td className="px-2 py-1">{wfCell(base.months.reduce((acc, m) => acc + m.outflows, 0))}</td>
              </tr>
              <tr className="border-t border-border font-semibold">
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Net cash flow</td>
                {base.months.map((m) => (
                  <td key={m.label} className={`px-2 py-1 ${m.net < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {Math.round(m.net) === 0 ? "—" : `${m.net < 0 ? "−" : "+"}${gbp(Math.abs(m.net))}`}
                  </td>
                ))}
                <td className="px-2 py-1">{wfCell(base.months.reduce((acc, m) => acc + m.net, 0))}</td>
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left text-muted-foreground">Opening cash</td>
                {base.months.map((m) => <td key={m.label} className="px-2 py-1 text-muted-foreground">{wfCell(m.closing - m.net)}</td>)}
                <td />
              </tr>
              <tr className="border-t border-border font-bold">
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Closing cash</td>
                {base.months.map((m) => (
                  <td key={m.label} className={`px-2 py-1 ${m.closing < 0 ? "text-red-600" : m.closing < 10000 ? "text-amber-600" : ""}`}>
                    {wfCell(m.closing)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <details className="mt-6 rounded-lg border border-border bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">What this forecast assumes</summary>
        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <li>· <span className="font-medium text-foreground">Average job value</span> £15,492 · <span className="font-medium text-foreground">install capacity</span> ~13/mo (3/week), +1/week if you add the installer</li>
          <li>· <span className="font-medium text-foreground">Funnel</span> ~£50/lead, 22% proposal-to-won · <span className="font-medium text-foreground">COGS</span> 65% of revenue (44% materials + 21% subbie labour)</li>
          <li>· <span className="font-medium text-foreground">BUS grant</span> £9,000 on ~90% of jobs, landing ~2 months after install</li>
          <li>· <span className="font-medium text-foreground">Debt</span> Capital on Tap refinanced onto a Funding Circle loan — £2,761.78/mo to Jun-2028</li>
          <li>· <span className="font-medium text-foreground">Committed jobs</span> 9 signed jobs are baked into Jun–Oct · <span className="font-medium text-foreground">one-offs</span> MCS £2,305 now, corporation tax £13k in Nov, accountant £1,200 in Feb</li>
          <li>· <span className="font-medium text-foreground">Your levers</span> opening cash live from Xero; take-home, marketing, CoT clearance and the hire are the toggles above</li>
        </ul>
      </details>

      <p className="mt-4 text-xs text-muted-foreground">
        Ported from EcoSphere_Cashflow_Model.xlsx. Base = your model assumptions; Conservative ≈ 35% fewer wins. Receivables live from Xero. Forecast, not a guarantee.
      </p>
    </div>
  );
}
