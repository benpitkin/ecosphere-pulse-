import { Card } from "@/components/ui/card";
import { buildPulse } from "@/lib/pulse";
import { buildAdvice, type AdvicePriority } from "@/lib/advice";
import { getCommittedJobs } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

const PRIORITY: Record<AdvicePriority, { label: string; chip: string; bar: string }> = {
  critical: { label: "Critical", chip: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500" },
  high: { label: "High", chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500" },
  medium: { label: "Medium", chip: "bg-sky-50 text-sky-700 border-sky-200", bar: "bg-sky-500" },
  low: { label: "Low", chip: "bg-slate-100 text-slate-600 border-slate-200", bar: "bg-slate-400" },
};

export default async function AdvicePage() {
  const pulse = await buildPulse();
  const committed = await getCommittedJobs();
  const advice = buildAdvice(pulse, committed);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Business advice</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Prioritised actions from your live cash, pipeline and forecast · snapshot {pulse.xero.snapshot_date ?? "today"}
      </p>

      <div className="space-y-4">
        {advice.map((a, i) => {
          const pr = PRIORITY[a.priority];
          return (
            <Card key={i} className="relative overflow-hidden p-5">
              <span className={`absolute inset-y-0 left-0 w-1 ${pr.bar}`} />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${pr.chip}`}>{pr.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{a.category}</span>
                {a.impact ? <span className="ml-auto text-xs font-semibold text-accent">{a.impact}</span> : null}
              </div>
              <h2 className="text-base font-semibold">{a.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{a.why}</p>
              <div className="mt-3 rounded-md bg-accent/5 px-3 py-2 text-sm">
                <span className="font-semibold text-accent">Do this: </span>
                <span className="text-foreground">{a.action}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Generated from live Xero + pipeline data and your cashflow model. Guidance, not a substitute for your accountant on tax and financing decisions.
      </p>
    </div>
  );
}
