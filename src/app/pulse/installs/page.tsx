import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { fetchScheduledInstalls, type ScheduledJob } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null): string {
  if (!d) return "TBC";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
function statusChip(s: string | null): string {
  const n = (s || "").toLowerCase();
  if (/complete|done|installed/.test(n)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/confirm/.test(n)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (/draft/.test(n)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (/progress|active|scheduled|booked|accepted/.test(n)) return "bg-sky-50 text-sky-700 border-sky-200";
  if (/cancel|lost|hold/.test(n)) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}
function pretty(s: string | null): string {
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Row({ j, today }: { j: ScheduledJob; today: string }) {
  const past = (j.install_date ?? "9") < today;
  const time = fmtTime(j.start_time);
  return (
    <tr className={`border-t border-border ${past ? "text-muted-foreground" : ""}`}>
      <td className="py-1.5 pr-3 whitespace-nowrap font-medium">
        {fmtDate(j.install_date)}{time && j.install_date ? <span className="ml-1 font-normal text-muted-foreground">{time}</span> : null}
      </td>
      <td className="py-1.5 pr-3">{j.client_name ?? "—"}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{j.postcode ?? "—"}</td>
      <td className="py-1.5 pr-3">{pretty(j.job_type)}</td>
      <td className="py-1.5 pr-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(j.status)}`}>{pretty(j.status)}</span></td>
      <td className="py-1.5 pr-3 text-xs text-muted-foreground">{j.bus_status ? pretty(j.bus_status) : "—"}</td>
      <td className="py-1.5 text-right font-semibold">{j.value != null ? gbp(j.value) : "—"}</td>
    </tr>
  );
}

function JobTable({ jobs, today }: { jobs: ScheduledJob[]; today: string }) {
  return (
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
        <tbody>{jobs.map((j) => <Row key={j.id} j={j} today={today} />)}</tbody>
      </table>
    </div>
  );
}

export default async function InstallsPage() {
  const data = await fetchScheduledInstalls();
  const today = new Date().toISOString().slice(0, 10);

  const byDate = (a: ScheduledJob, b: ScheduledJob) => (a.install_date ?? "9") < (b.install_date ?? "9") ? -1 : 1;
  const confirmed = data.jobs.filter((j) => /confirm/i.test(j.status || "")).sort(byDate);
  const unassigned = data.jobs.filter((j) => /draft/i.test(j.status || "")).sort(byDate);
  const other = data.jobs.filter((j) => !/confirm|draft/i.test(j.status || "")).sort(byDate);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Bookings &amp; installs</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Live from Dispatch · grouped the same way as your job board
      </p>

      {data.error ? (
        <Card className="p-5 text-sm text-amber-700">Couldn&apos;t load jobs: {data.error}</Card>
      ) : data.jobs.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">No accepted jobs in Dispatch yet.</Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Accepted jobs</div>
              <div className="mt-2 text-3xl font-bold">{data.jobs.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">{confirmed.length} confirmed · {unassigned.length} unassigned</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Total value</div>
              <div className="mt-2 text-3xl font-bold text-accent">{gbp(data.total_value)}</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Next install</div>
              <div className="mt-2 text-3xl font-bold">{fmtDate(data.next_date)}</div>
            </Card>
          </div>

          {confirmed.length > 0 ? (
            <Card className="mb-6 p-5">
              <h2 className="mb-1 text-base font-semibold">Confirmed <span className="text-muted-foreground">({confirmed.length})</span></h2>
              <p className="mb-3 text-xs text-muted-foreground">Subcontractor assigned and the install date agreed.</p>
              <JobTable jobs={confirmed} today={today} />
            </Card>
          ) : null}

          {unassigned.length > 0 ? (
            <Card className="mb-6 p-5">
              <h2 className="mb-1 text-base font-semibold">Unassigned bookings <span className="text-muted-foreground">({unassigned.length})</span></h2>
              <p className="mb-3 text-xs text-muted-foreground">Dates held for the customer before a subcontractor is picked. Assign a sub on the job in Dispatch to confirm.</p>
              <JobTable jobs={unassigned} today={today} />
            </Card>
          ) : null}

          {other.length > 0 ? (
            <Card className="mb-6 p-5">
              <h2 className="mb-3 text-base font-semibold">Other</h2>
              <JobTable jobs={other} today={today} />
            </Card>
          ) : null}
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Live from Dispatch in the shared Supabase. Confirmed jobs use the agreed date from the accepted subcontractor offer; values come from the linked GoHighLevel deals. Deposits are already in your cash; balances and BUS grants feed the forecast on each job&apos;s install date.
      </p>
    </div>
  );
}
