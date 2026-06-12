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
  const heatPumpJobs = data.jobs.filter((j) => /ashp|heat/i.test(j.job_type || ""));
  const busExpected = heatPumpJobs.length * 7500;
  const balanceDue = Math.round(data.total_value * 0.75);
  const depositsIn = Math.round(data.total_value * 0.25);

  const byDate = (a: ScheduledJob, b: ScheduledJob) => (a.install_date ?? "9") < (b.install_date ?? "9") ? -1 : 1;
  const confirmed = data.jobs.filter((j) => /confirm/i.test(j.status || "")).sort(byDate);
  const unassigned = data.jobs.filter((j) => /draft/i.test(j.status || "")).sort(byDate);
  const other = data.jobs.filter((j) => !/confirm|draft/i.test(j.status || "")).sort(byDate);

  // Monthly load vs crew capacity (~13 installs/mo = 3/week, from the cash model).
  // Groups dated jobs by calendar month over the next 6 months so over/under-booked
  // months are obvious at a glance — the read behind hiring/marketing timing.
  const CAPACITY = 13;
  const now = new Date();
  const horizon = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    };
  });
  const load = new Map<string, { count: number; value: number }>();
  for (const j of data.jobs) {
    if (!j.install_date) continue;
    const key = j.install_date.slice(0, 7);
    const cur = load.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += j.value ?? 0;
    load.set(key, cur);
  }
  const loadRows = horizon.map((h) => ({ ...h, ...(load.get(h.key) ?? { count: 0, value: 0 }) }));
  const anyLoad = loadRows.some((r) => r.count > 0);

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

          {anyLoad ? (
            <Card className="mb-6 p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-semibold">Install load vs capacity</h2>
                <span className="text-xs text-muted-foreground">ceiling ~{CAPACITY}/mo</span>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Booked installs per month against your ~{CAPACITY}/month crew ceiling. Red = over capacity (needs a subbie or the extra installer); full bars = well utilised; light = spare capacity to sell into.
              </p>
              <div className="space-y-2.5">
                {loadRows.map((r) => {
                  const over = r.count > CAPACITY;
                  const tone =
                    r.count === 0 ? "bg-slate-200"
                    : over ? "bg-red-500"
                    : r.count >= CAPACITY * 0.7 ? "bg-emerald-500"
                    : "bg-sky-400";
                  const pct = Math.min(r.count / CAPACITY, 1) * 100;
                  return (
                    <div key={r.key} className="flex items-center gap-3">
                      <div className="w-14 shrink-0 text-sm font-medium">{r.label}</div>
                      <div className="relative h-6 flex-1 rounded bg-[hsl(210_40%_96%)]">
                        <div className={`absolute inset-y-0 left-0 rounded ${tone}`} style={{ width: `${Math.max(pct, r.count > 0 ? 4 : 0)}%` }} />
                        {over ? <div className="absolute inset-y-0 right-1 flex items-center text-xs font-bold text-red-600">over</div> : null}
                      </div>
                      <div className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                        <span className={`font-semibold ${over ? "text-red-600" : "text-foreground"}`}>{r.count}</span>/{CAPACITY}
                        {r.value > 0 ? <span className="ml-1">· {gbp(r.value)}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <Card className="mb-6 p-5">
            <div className="text-sm font-medium text-muted-foreground">Cash still to come from these jobs</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-2xl font-bold text-accent">{gbp(balanceDue)}</span>
              <span className="text-sm text-muted-foreground">balance, lands on each install date</span>
              <span className="text-2xl font-bold text-emerald-600">{gbp(busExpected)}</span>
              <span className="text-sm text-muted-foreground">BUS grants ({heatPumpJobs.length} heat-pump jobs, ~8 weeks after install)</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Deposits (~{gbp(depositsIn)}, 25%) are already in your cash. Figures are estimates from the 25/75 split.</div>
          </Card>

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
