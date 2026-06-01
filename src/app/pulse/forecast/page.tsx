import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { getXeroSnapshot } from "@/lib/xero";
import { buildForecast, forecastInputs } from "@/lib/forecast";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function readConfig(): Promise<{ cot: number | null; opening: number | null }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("pulse_config")
      .select("capital_on_tap_gbp")
      .eq("id", true)
      .maybeSingle();
    // opening_cash_gbp read separately so a missing column never breaks this.
    let opening: number | null = null;
    try {
      const r = await admin.from("pulse_config").select("opening_cash_gbp").eq("id", true).maybeSingle();
      const v = (r.data as { opening_cash_gbp?: number } | null)?.opening_cash_gbp;
      opening = v != null ? Number(v) : null;
    } catch { /* column not added yet */ }
    return {
      cot: data?.capital_on_tap_gbp != null ? Number(data.capital_on_tap_gbp) : null,
      opening,
    };
  } catch {
    return { cot: null, opening: null };
  }
}

export default async function ForecastPage() {
  let xero: { cash: number | null; receivables: number | null; overdue: number | null } = {
    cash: null, receivables: null, overdue: null,
  };
  try {
    const snap = await getXeroSnapshot();
    xero = { cash: snap.cash, receivables: snap.receivables, overdue: snap.overdue };
  } catch { /* defaults */ }
  const cfg = await readConfig();

  const inputs = forecastInputs({
    cash: xero.cash, receivables: xero.receivables, overdue: xero.overdue,
    openingCashOverride: cfg.opening, capitalOnTap: cfg.cot,
  });
  const base = buildForecast(inputs);
  const cons = buildForecast(inputs, { conservative: true });

  const liveCash = xero.cash != null || cfg.opening != null;

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
        Live port of your model · opening cash {liveCash ? (cfg.opening != null ? `set to ${gbp(cfg.opening)}` : "live from Xero") : `placeholder ${gbp(inputs.openingCash)}`} · receivables live · two scenarios
      </p>

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

      <p className="mt-4 text-xs text-muted-foreground">
        Ported from EcoSphere_Cashflow_Model.xlsx. Base = your model assumptions; Conservative ≈ 35% fewer wins. Receivables live from Xero. Forecast, not a guarantee.
      </p>
    </div>
  );
}
