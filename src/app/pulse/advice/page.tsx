import { getAdvice } from "@/lib/advice";

export const dynamic = "force-dynamic";

export default async function AdvicePage() {
  const items = await getAdvice();

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Advice</h1>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.title} className="rounded border p-3">
            <div className="font-medium">{a.title}</div>
            <div className="text-sm text-gray-600">{a.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
