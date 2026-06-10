import { getCrew } from "@/lib/crew";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const crew = await getCrew();

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Crew</h1>
      {crew.length === 0 ? (
        <p className="text-gray-600">No crew found.</p>
      ) : (
        <ul className="divide-y rounded border">
          {crew.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex items-center justify-between p-3">
              <span className="font-medium">{c.name}</span>
              <span className="text-sm text-gray-500">{c.role}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
