import { getCashPosition } from "@/lib/xero";
import { getPulseConfig } from "@/lib/config";
import { getCommittedJobs } from "@/lib/dispatch-jobs";
import { buildForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function ForecastPage() {
  const [cash, config, committed] = await Promise.all([
    getCashPosition(),
    getPulseConfig(),
    getCommittedJobs(),
  ]);
  const months = buildForecast({ openingCash: cash.cashBalance, committed, config });

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Forecast (12 months)</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="px-2 py-1 text-left">Month</th>
              <th className="px-2 py-1">Inflows</th>
              <th className="px-2 py-1">Outflows</th>
              <th className="px-2 py-1">Net</th>
              <th className="px-2 py-1">Closing</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-b">
                <td className="px-2 py-1 text-left font-medium">{m.label}</td>
                <td className="px-2 py-1">{gbp(m.inflows)}</td>
                <td className="px-2 py-1">{gbp(m.outflows)}</td>
                <td className={`px-2 py-1 ${m.net < 0 ? "text-red-600" : ""}`}>{gbp(m.net)}</td>
                <td className="px-2 py-1 font-semibold">{gbp(m.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        New-win revenue is not yet modelled here (committed jobs + finance only) — see HANDOVER §11.
      </p>
    </section>
  );
}
