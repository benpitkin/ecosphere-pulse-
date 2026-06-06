"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { buildForecast, forecastInputs, type CommittedJob } from "@/lib/forecast";

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

export default function ForecastExplorer({ cash, receivables, overdue, openingOverride, initialDraw, committed }: Props) {
  const [drawings, setDrawings] = useState(initialDraw && initialDraw >= 2000 ? initialDraw : 2000);
  const [mktScale, setMktScale] = useState(1);
  const [hire, setHire] = useState(false);

  // Selected scenario (base + conservative).
  const base = useMemo(
    () => buildForecast(
      forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride, ownerDrawings: drawings }),
      { marketingScale: mktScale, hire, committed },
    ),
    [cash, receivables, overdue, openingOverride, drawings, mktScale, hire, committed],
  );
  const cons = useMemo(
    () => buildForecast(
      forecastInputs({ cash, receivables, overdue, openingCashOverride: openingOverride, ownerDrawings: drawings }),
      { conservative: true, marketingScale: mktScale, hire, committed },
    ),
    [cash, receivables, overdue, openingOverride, drawings, mktScale, hire, committed],
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
  const all = [...baseC, ...consC, 0];
  const yMin = Math.min(...all);
  const yMax = Math.max(...all);
  const span = yMax - yMin || 1;
  const x = (i: number) => padL + (i / (base.months.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / span) * (H - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const zeroY = y(0);
  const minIdx = baseC.indexOf(Math.min(...baseC));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-1 flex items-end justify-between">
        <h1 className="text-2xl font-bold tracking-tight">12-month cash forecast</h1>
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
          {baseC.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="hsl(180 70% 35%)" />)}
          <circle cx={x(minIdx)} cy={y(baseC[minIdx])} r="5" fill="none" stroke="hsl(38 92% 50%)" strokeWidth="2" />
          {base.months.map((mn, i) => (i % 2 === 0 ?
            <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="hsl(215 16% 47%)">{mn.label}</text> : null))}
        </svg>
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
