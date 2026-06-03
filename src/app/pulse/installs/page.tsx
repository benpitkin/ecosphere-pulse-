import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { fetchScheduledInstalls } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

function statusChip(s: string | null): string {
  const n = (s || "").toLowerCase();
  if (/complete|done|installed/.test(n)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/progress|active|scheduled|booked|accepted/.test(n)) return "bg-sky-50 text-sky-700 border-sky-200";
  if (/cancel|lost|hold/.test(n)) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function pretty(s: string | null): string {
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function InstallsPage() {
  const data = await fetchScheduledInstalls();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.jobs.filter((j) => (j.install_date ?? "") >= today);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Scheduled installs</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Accepted jobs with install dates scheduled in Dispatch · live from the shared database
      </p>

      {data.error ? (
        <Card className="p-5 text-sm text-amber-700">Couldn&apos;t load jobs: {data.error}</Card>
      ) : data.jobs.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          No jobs have an install date set in Dispatch yet. Once a job is scheduled there, it appears here automatically.
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Scheduled jobs</div>
              <div className="mt-2 text-3xl font-bold">{data.jobs.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">{upcoming.length} still upcoming</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Total scheduled value</div>
              <div className="mt-2 text-3xl font-bold text-accent">{gbp(data.total_value)}</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Next install</div>
              <div className="mt-2 text-3xl font-bold">{fmtDate(data.next_date)}</div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Install date</th>
                    <th className="py-1 pr-3 font-medium">Customer</th>
                    <th className="py-1 pr-3 font-medium">Postcode</th>
                    <th className="py-1 pr-3 font-medium">Type</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 pr-3 font-medium">BUS</th>
                    <th className="py-1 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((j) => {
                    const past = (j.install_date ?? "") < today;
                    const time = fmtTime(j.start_time);
                    return (
                      <tr key={j.id} className={`border-t border-border ${past ? "text-muted-foreground" : ""}`}>
                        <td className="py-1.5 pr-3 whitespace-nowrap font-medium">
                          {fmtDate(j.install_date)}{time ? <span className="ml-1 font-normal text-muted-foreground">{time}</span> : null}
                        </td>
                        <td className="py-1.5 pr-3">{j.client_name ?? "—"}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{j.postcode ?? "—"}</td>
                        <td className="py-1.5 pr-3">{pretty(j.job_type)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(j.status)}`}>{pretty(j.status)}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-muted-foreground">{j.bus_status ? pretty(j.bus_status) : "—"}</td>
                        <td className="py-1.5 text-right font-semibold">{j.value != null ? gbp(j.value) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Pulled live from Dispatch&apos;s jobs in the shared Supabase. Install dates and values reflect what&apos;s scheduled in Dispatch right now.
      </p>
    </div>
  );
}
