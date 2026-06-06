import { Card } from "@/components/ui/card";
import { getCrew, type CrewMember } from "@/lib/crew";

export const dynamic = "force-dynamic";

function fmtShort(d: string | null): string {
  if (!d) return "TBC";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function pretty(s: string | null): string {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusChip(s: string | null): string {
  const n = (s || "").toLowerCase();
  if (/active/.test(n)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/invite/.test(n)) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function Member({ m }: { m: CrewMember }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = m.jobs.filter((j) => (j.date ?? "9") >= today);
  const free = /active/i.test(m.status || "") && upcoming.length === 0;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{m.name}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(m.status)}`}>{pretty(m.status)}</span>
        {free ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">available</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">{m.trades.map(pretty).join(" · ")}</span>
      </div>
      {m.jobs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{/active/i.test(m.status || "") ? "No jobs assigned — free to take work." : "Not yet active."}</p>
      ) : (
        <div className="mt-2 space-y-1">
          {m.jobs.map((j, i) => (
            <div key={i} className="flex items-baseline justify-between border-t border-border py-1.5 text-sm">
              <span><span className="font-medium">{fmtShort(j.date)}</span> — {j.client}</span>
              <span className="text-xs text-muted-foreground">{pretty(j.jobType)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function CrewPage() {
  const data = await getCrew();
  const withJobs = data.members.filter((m) => m.jobs.length > 0);
  const free = data.members.filter((m) => m.jobs.length === 0 && /active/i.test(m.status || ""));
  const other = data.members.filter((m) => m.jobs.length === 0 && !/active/i.test(m.status || ""));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Crew</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Subcontractors and who&apos;s assigned to what · live from Dispatch</p>

      {data.error ? (
        <Card className="p-5 text-sm text-amber-700">Couldn&apos;t load crew: {data.error}</Card>
      ) : data.members.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">No subcontractors set up yet.</Card>
      ) : (
        <div className="space-y-4">
          {withJobs.map((m) => <Member key={m.id} m={m} />)}
          {free.length > 0 ? <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Available</h2> : null}
          {free.map((m) => <Member key={m.id} m={m} />)}
          {other.length > 0 ? <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Invited / inactive</h2> : null}
          {other.map((m) => <Member key={m.id} m={m} />)}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        From Dispatch&apos;s subcontractors and accepted job offers. Bookings without a sub are on the <a href="/pulse/focus" className="underline">This week</a> list.
      </p>
    </div>
  );
}
