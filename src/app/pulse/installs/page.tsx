import { fetchScheduledInstalls } from "@/lib/dispatch-jobs";
import { busGrant } from "@/lib/forecast";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function InstallsPage() {
  const installs = (await fetchScheduledInstalls()).sort((a, b) =>
    a.installDate.localeCompare(b.installDate),
  );
  const totalValue = installs.reduce((sum, i) => sum + i.value, 0);

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Installs</h1>
      <p className="text-sm text-gray-500">
        {installs.length} confirmed install{installs.length === 1 ? "" : "s"} · {gbp(totalValue)} of
        booked work
      </p>
      {installs.length === 0 ? (
        <p className="text-gray-600">No confirmed installs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Customer</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1 text-right">Value</th>
                <th className="px-2 py-1 text-right">BUS</th>
              </tr>
            </thead>
            <tbody>
              {installs.map((i) => {
                const bus = busGrant(i.jobType);
                return (
                  <tr key={i.id} className="border-b">
                    <td className="px-2 py-1">{i.installDate}</td>
                    <td className="px-2 py-1 font-medium">{i.customer}</td>
                    <td className="px-2 py-1 text-gray-500">{i.jobType}</td>
                    <td className="px-2 py-1 text-right">{gbp(i.value)}</td>
                    <td className="px-2 py-1 text-right">{bus ? gbp(bus) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
