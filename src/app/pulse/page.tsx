import { getCashPosition } from "@/lib/xero";
import { getPulseConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function CockpitPage() {
  const [cash, config] = await Promise.all([getCashPosition(), getPulseConfig()]);
  const runway = config.monthlyOverheads > 0 ? cash.cashBalance / config.monthlyOverheads : 0;
  const low = runway < config.lowRunwayMonths;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Cockpit</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cash on hand" value={gbp(cash.cashBalance)} />
        <Stat label="Receivables" value={gbp(cash.receivables)} />
        <Stat label="Overdue" value={gbp(cash.overdue)} />
        <Stat label="Runway" value={`${runway.toFixed(1)} mo`} />
      </div>
      {low && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          ⚠ Runway below {config.lowRunwayMonths} months — watch cash.
        </p>
      )}
      {/* TODO: accepted-jobs tile, "This week" banner — see docs/HANDOVER.md §5 */}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
