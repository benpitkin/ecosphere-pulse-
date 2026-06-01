import Link from "next/link";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { getXeroSnapshot } from "@/lib/xero";
import { buildForecast } from "@/lib/forecast";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Model-derived defaults (from EcoSphere_Cashflow_Model.xlsx) used until the
// matching live source / config value is available.
const MODEL = {
  openingCash: 45000, // set to today's bank balance; auto from Xero once reports permission lands
  monthlyOverheadsBase: 8852, // fixed opex/mo excl. drawings, marketing, COGS, finance
  ownerDrawings: 4191, // owner-pay lever (£4k take-home grossed up)
  capitalOnTap: 51644,
};

async function configValue<T>(): Promise<{ overheadsBase: number; cot: number }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("pulse_config")
      .select("monthly_overheads, capital_on_tap_gbp")
      .eq("id", true)
      .maybeSingle();
    return {
      overheadsBase: Number(data?.monthly_overheads) || MODEL.monthlyOverheadsBase,
      cot: Number(data?.capital_on_tap_gbp) || MODEL.capitalOnTap,
    };
  } catch {
    return { overheadsBase: MODEL.monthlyOverheadsBase, cot: MODEL.capitalOnTap };
  }
}

export default async function ForecastPage() {
  const xero = await getXeroSnapshot();
  const cfg = await configValue();

  const f = buildForecast({
    openingCash: xero.cash ?? MODEL.openingCash,
    existingReceivables: xero.receivables ?? 0,
    overdueReceivables: xero.overdue ?? 0,
    monthlyOverheadsBase: cfg.overheadsBase,
    ownerDrawings: MODEL.ownerDrawings,
    capitalOnTapOpening: cfg.cot,
  });

  const liveCash = xero.cash != null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">12-month cash forecast</h1>
          <p className="text-sm text-muted-foreground">
            Live port of your cashflow model · opening cash{" "}
            {liveCash ? "live from Xero" : `set to ${gbp(MODEL.openingCash)} (edit when reports permission lands)`} · receivables live
          </p>
        </div>
        <Link href="/pulse" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          ← Back to Pulse
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Closing cash (12mo)</div>
          <div className="mt-2 text-3xl font-bold">{gbp(f.summary.closing)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Lowest cash point</div>
          <div className={`mt-2 text-3xl font-bold ${f.summary.minCash < 0 ? "text-red-600" : f.summary.minCash < 10000 ? "text-amber-600" : "text-foreground"}`}>
            {gbp(f.summary.minCash)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">in {f.summary.minCashMonth}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-medium text-muted-foreground">Net cash generated (12mo)</div>
          <div className={`mt-2 text-3xl font-bold ${f.summary.netGeneration < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {gbp(f.summary.netGeneration)}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Monthly projection</h2>
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
              {f.months.map((m, i) => (
                <tr key={m.label} className="border-t border-border">
                  <td className="py-1.5 pr-3">{m.label}</td>
                  <td className="py-1.5 pr-3">{f.installs[i]}</td>
                  <td className="py-1.5 pr-3 text-right">{gbp(m.inflows)}</td>
                  <td className="py-1.5 pr-3 text-right">{gbp(m.outflows)}</td>
                  <td className={`py-1.5 pr-3 text-right ${m.net < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {m.net < 0 ? "−" : "+"}{gbp(Math.abs(m.net))}
                  </td>
                  <td className={`py-1.5 text-right font-semibold ${m.closing < 0 ? "text-red-600" : m.closing < 10000 ? "text-amber-600" : ""}`}>
                    {gbp(m.closing)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Ported from EcoSphere_Cashflow_Model.xlsx (lead funnel, committed jobs, COGS 44%+21%, BUS grants, VAT, CoT schedule). Receivables are live from Xero. Assumptions are tunable — this is a faithful starting port. Forecast, not a guarantee.
      </p>
    </div>
  );
}
