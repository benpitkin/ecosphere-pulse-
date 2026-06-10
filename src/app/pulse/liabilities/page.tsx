import { getLiabilities } from "@/lib/liabilities";

export const dynamic = "force-dynamic";

const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export default async function LiabilitiesPage() {
  const items = await getLiabilities();
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">What you owe</h1>
      <div className="rounded border p-3">
        <div className="text-xs text-gray-500">Total liabilities</div>
        <div className="text-2xl font-semibold">{gbp(total)}</div>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-600">No liabilities found.</p>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((i) => (
            <li key={i.name} className="flex items-center justify-between p-3 text-sm">
              <span>{i.name}</span>
              <span className="font-medium">{gbp(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
