import { getPulseConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function SettingsPage() {
  const c = await getPulseConfig();
  const rows: Array<[string, string]> = [
    ["Monthly overheads", gbp(c.monthlyOverheads)],
    ["Low-runway alert", `${c.lowRunwayMonths} months`],
    ["Overdue alert threshold", gbp(c.overdueAlertGbp)],
    ["Pipeline target", gbp(c.pipelineTargetGbp)],
    ["Capital on Tap", gbp(c.capitalOnTapGbp)],
  ];

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-sm text-gray-500">Live values from pulse_config (read-only).</p>
      <ul className="divide-y rounded border">
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between p-3 text-sm">
            <span className="text-gray-600">{k}</span>
            <span className="font-medium">{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
