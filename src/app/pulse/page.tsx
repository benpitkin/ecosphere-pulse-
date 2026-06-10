import { getCashPosition } from "@/lib/xero";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const cash = await getCashPosition();
  return (
    <section>
      <h1 className="text-xl font-semibold">Cockpit</h1>
      <p className="mt-2 text-gray-600">
        Cash on hand: £{cash.cashBalance.toLocaleString()}
      </p>
      {/* TODO: alerts, accepted-jobs tile, "This week" banner — see docs/HANDOVER.md §5 */}
    </section>
  );
}
