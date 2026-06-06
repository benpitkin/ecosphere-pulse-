import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { getOverdueContacts } from "@/lib/xero";
import { getProposals } from "@/lib/ghl-pipeline";
import { fetchScheduledInstalls } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

function fmtShort(d: string | null): string {
  if (!d) return "TBC";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function FocusPage() {
  const [overdue, proposalsRes, installs] = await Promise.all([
    getOverdueContacts(),
    getProposals(),
    fetchScheduledInstalls(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const overdueTotal = overdue.contacts.reduce((a, c) => a + c.overdue, 0);
  const proposals = proposalsRes.proposals;
  const proposalTotal = proposals.reduce((a, p) => a + p.value, 0);
  const unassigned = installs.jobs.filter((j) => /draft/i.test(j.status || "")).sort((a, b) => (a.install_date ?? "9") < (b.install_date ?? "9") ? -1 : 1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">This week</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">The handful of things that move cash and protect delivery — worked top to bottom.</p>

      {/* Chase overdue */}
      <Card className="mb-6 p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Chase {gbp(overdueTotal)} of overdue invoices</h2>
          <span className="text-xs text-muted-foreground">{overdue.contacts.length} {overdue.contacts.length === 1 ? "customer" : "customers"}</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Cash you&apos;ve already earned. Call (don&apos;t email) the biggest first.</p>
        {overdue.error ? <p className="text-sm text-amber-700">Xero: {overdue.error}</p>
          : overdue.contacts.length === 0 ? <p className="text-sm text-emerald-700">Nothing overdue — nice.</p>
          : (
            <div className="space-y-1">
              {overdue.contacts.slice(0, 12).map((c, i) => (
                <div key={i} className="flex items-baseline justify-between border-t border-border py-1.5 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="font-semibold text-amber-700">{gbp(c.overdue)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Follow up proposals */}
      <Card className="mb-6 p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Follow up {proposals.length} open proposals</h2>
          <span className="text-xs text-muted-foreground">{gbp(proposalTotal)} · ~{gbp(proposalTotal * 0.22)} likely</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Your single biggest revenue lever. Stalest first — lead with the BUS grant and finance, not a price drop.</p>
        {proposalsRes.error ? <p className="text-sm text-amber-700">GHL: {proposalsRes.error}</p>
          : proposals.length === 0 ? <p className="text-sm text-muted-foreground">No open proposals found.</p>
          : (
            <div className="space-y-1">
              {proposals.slice(0, 12).map((p, i) => (
                <div key={i} className="flex items-baseline justify-between border-t border-border py-1.5 text-sm">
                  <span className="font-medium">{p.name}{p.ageDays != null ? <span className="ml-2 text-xs text-muted-foreground">{p.ageDays}d since update</span> : null}</span>
                  <span className="font-semibold">{gbp(p.value)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Assign subs */}
      <Card className="p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Assign a subcontractor to {unassigned.length} bookings</h2>
          <span className="text-xs text-muted-foreground">dates held, no sub yet</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">These have a customer date but no subcontractor — a delivery risk until assigned in Dispatch.</p>
        {unassigned.length === 0 ? <p className="text-sm text-emerald-700">All bookings have a sub assigned.</p>
          : (
            <div className="space-y-1">
              {unassigned.map((j) => {
                const soon = (j.install_date ?? "9") <= new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
                return (
                  <div key={j.id} className="flex items-baseline justify-between border-t border-border py-1.5 text-sm">
                    <span className="font-medium">{fmtShort(j.install_date)} — {j.client_name}{soon && (j.install_date ?? "") >= today ? <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs text-amber-700">soon</span> : null}</span>
                    <span className="text-muted-foreground">{j.postcode}</span>
                  </div>
                );
              })}
            </div>
          )}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">Live from Xero (overdue), GoHighLevel (proposals) and Dispatch (bookings).</p>
    </div>
  );
}
