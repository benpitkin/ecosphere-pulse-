import { getOverdueContacts } from "@/lib/xero";
import { getProposals } from "@/lib/ghl-pipeline";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function FocusPage() {
  const [overdue, proposals] = await Promise.all([getOverdueContacts(), getProposals()]);

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">This week</h1>

      <div className="space-y-2">
        <h2 className="font-medium">Overdue to chase ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing overdue. 🎉</p>
        ) : (
          <ul className="divide-y rounded border">
            {overdue.map((c) => (
              <li key={c.name} className="flex justify-between p-3 text-sm">
                <span>{c.name}</span>
                <span className="font-medium">{gbp(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Proposals to follow up ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-gray-600">No open proposals.</p>
        ) : (
          <ul className="divide-y rounded border">
            {proposals.slice(0, 10).map((p) => (
              <li key={p.id} className="flex justify-between p-3 text-sm">
                <span>
                  {p.name} <span className="text-gray-400">· {p.ageDays}d</span>
                </span>
                <span className="font-medium">{gbp(p.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
