import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { fetchLeadQuality } from "@/lib/ghl-pipeline";

export const dynamic = "force-dynamic";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export default async function LeadsPage() {
  const lq = await fetchLeadQuality();

  // Composition of the open pipeline by lifecycle class.
  const engaged = lq.open.engaged.count + lq.open.won.count;        // genuinely live
  const engagedVal = lq.open.engaged.value + lq.open.won.value;
  const inbound = lq.open.inbound.count;                            // never engaged
  const dead = lq.open.dead.count;                                  // dead but still open
  const other = lq.open.postsale.count + lq.open.nurture.count;
  const total = lq.open_total || 1;

  const segs = [
    { label: "Engaged (real deals)", n: engaged, cls: "bg-emerald-500" },
    { label: "Inbound — never engaged", n: inbound, cls: "bg-sky-400" },
    { label: "Dead, still open", n: dead, cls: "bg-red-400" },
    { label: "Post-sale / other", n: other, cls: "bg-slate-300" },
  ].filter((s) => s.n > 0);

  // Top lead sources + an "Other" rollup so the long tail (one-off referral
  // links etc.) doesn't bloat the table. by_source is already sorted by volume.
  const TOP_SOURCES = 8;
  const topSources = lq.by_source.slice(0, TOP_SOURCES);
  const restSources = lq.by_source.slice(TOP_SOURCES);
  const sourceRows = restSources.length
    ? [
        ...topSources,
        restSources.reduce(
          (a, s) => ({
            source: `Other (${restSources.length} sources)`,
            total: a.total + s.total,
            engaged: a.engaged + s.engaged,
            inbound: a.inbound + s.inbound,
            dead: a.dead + s.dead,
            won: a.won + s.won,
          }),
          { source: "", total: 0, engaged: 0, inbound: 0, dead: 0, won: 0 },
        ),
      ]
    : topSources;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Leads &amp; pipeline quality</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Live from GoHighLevel{lq.pipeline_name ? ` · ${lq.pipeline_name}` : ""} · how much of your pipeline is genuinely engaged vs noise
      </p>

      {!lq.configured ? (
        <Card className="p-5 text-sm text-muted-foreground">Connect GoHighLevel to see lead quality.</Card>
      ) : lq.error ? (
        <Card className="p-5 text-sm text-amber-700">Couldn&apos;t load GHL: {lq.error}</Card>
      ) : (
        <>
          {/* Headline: open vs genuinely engaged */}
          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-muted-foreground">GHL shows</span>
              <span className="text-3xl font-bold">{lq.open_total}</span>
              <span className="text-sm text-muted-foreground">open opportunities — but only</span>
              <span className="text-3xl font-bold text-emerald-600">{engaged}</span>
              <span className="text-sm text-muted-foreground">are genuinely engaged ({pct(engaged, total)}%).</span>
            </div>

            {/* Composition bar */}
            <div className="mt-4 flex h-6 w-full overflow-hidden rounded">
              {segs.map((s) => (
                <div key={s.label} className={s.cls} style={{ width: `${pct(s.n, total)}%` }} title={`${s.label}: ${s.n}`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {segs.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.cls}`} />
                  {s.label} <span className="font-semibold text-foreground">{s.n}</span> ({pct(s.n, total)}%)
                </span>
              ))}
            </div>
          </Card>

          {/* Key reads */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Engaged pipeline</div>
              <div className="mt-2 text-3xl font-bold text-emerald-600">{engaged}</div>
              <div className="mt-1 text-xs text-muted-foreground">{gbp(engagedVal)} live · the real number</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Never engaged</div>
              <div className="mt-2 text-3xl font-bold text-sky-600">{inbound}</div>
              <div className="mt-1 text-xs text-muted-foreground">filled a form, no two-way contact</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Dead, still open</div>
              <div className="mt-2 text-3xl font-bold text-red-600">{dead}</div>
              <div className="mt-1 text-xs text-muted-foreground">cleanup target — auto-clears via nurture</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Win rate (all-time)</div>
              <div className="mt-2 text-3xl font-bold">{lq.win_rate != null ? `${Math.round(lq.win_rate * 100)}%` : "—"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{lq.won.count} won · {lq.lost.count} lost · {lq.abandoned.count} abandoned</div>
            </Card>
          </div>

          {/* Engagement + outcomes */}
          <Card className="mb-6 p-5">
            <h2 className="mb-3 text-base font-semibold">What this tells you</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-semibold">{lq.engaged_share != null ? `${Math.round(lq.engaged_share * 100)}%` : "—"}</span>{" "}
                of your live (non-dead) pipeline is genuinely engaged — the rest is inbound that never replied, booked, or picked up.
                {lq.engaged_share != null && lq.engaged_share < 0.5
                  ? " That's the Meta form-fill problem in one number: most leads are technical, not real."
                  : ""}
              </li>
              <li>
                Of deals that reached a decision, you win{" "}
                <span className="font-semibold">{lq.win_rate != null ? `${Math.round(lq.win_rate * 100)}%` : "—"}</span>
                {lq.avg_won_value != null ? <> at an average of <span className="font-semibold">{gbp(lq.avg_won_value)}</span> per job</> : null}.
                Strong close rate — the leak is at the top, not the close.
              </li>
              <li>
                <span className="font-semibold text-red-600">{dead}</span> dead leads are still sitting as &ldquo;open&rdquo; in GHL, inflating the headline by{" "}
                <span className="font-semibold">{pct(dead, total)}%</span>. The nurture pipeline auto-removes these.
              </li>
            </ul>
          </Card>

          {/* By source — which channels bring genuinely-engaged leads */}
          {lq.by_source.length > 0 ? (
            <Card className="mb-6 p-5">
              <h2 className="mb-1 text-base font-semibold">Where your real pipeline comes from</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Open opportunities by lead source, and what share of each source&apos;s leads actually engaged. A high-volume / low-engaged source (e.g. paid social) is buying form-fills, not customers.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Source</th>
                      <th className="py-1 pr-3 text-right font-medium">Leads</th>
                      <th className="py-1 pr-3 text-right font-medium">Engaged</th>
                      <th className="py-1 pr-3 text-right font-medium">Never engaged</th>
                      <th className="py-1 pr-3 text-right font-medium">Dead</th>
                      <th className="py-1 pr-3 text-right font-medium">Engaged %</th>
                      <th className="py-1 text-right font-medium">Won (all-time)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((s) => {
                      const rate = pct(s.engaged, s.total);
                      const tone = rate >= 50 ? "text-emerald-600" : rate >= 25 ? "text-amber-600" : "text-red-600";
                      return (
                        <tr key={s.source} className="border-b border-border">
                          <td className="py-1.5 pr-3 font-medium">{s.source}</td>
                          <td className="py-1.5 pr-3 text-right">{s.total}</td>
                          <td className="py-1.5 pr-3 text-right text-emerald-600">{s.engaged}</td>
                          <td className="py-1.5 pr-3 text-right text-sky-600">{s.inbound}</td>
                          <td className="py-1.5 pr-3 text-right text-red-600">{s.dead}</td>
                          <td className={`py-1.5 pr-3 text-right font-semibold ${tone}`}>{rate}%</td>
                          <td className="py-1.5 text-right">{s.won > 0 ? s.won : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Engaged % = engaged ÷ all leads from that source (includes the ones that went dead) — the truest read on whether a channel sends real prospects. <span className="font-medium">Won (all-time)</span> is closed deals ever attributed to that source (a wider time window than the currently-open leads), so read it as &ldquo;has this channel ever converted&rdquo;, not a rate. Together: where your next marketing £ should go.
              </p>
            </Card>
          ) : null}

          {lq.truncated_open ? (
            <p className="mb-2 text-xs font-medium text-amber-700">
              ⚠ Showing the first 1,000 open opportunities — counts are a floor, not the full total.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Engaged = reached &ldquo;Contacted – Engaged&rdquo; or beyond (survey, proposal, accepted). Inbound = new enquiry / contact-attempt / no-contact. Win rate is all-time won vs lost+abandoned in this pipeline. Live from GHL on each load.
          </p>
        </>
      )}
    </div>
  );
}
