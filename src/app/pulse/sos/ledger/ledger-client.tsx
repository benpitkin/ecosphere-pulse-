"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import type { LedgerSummary, DealComputed, SosConfigRow, CommissionStatus } from "@/lib/sos-commission";
import type { SosGhlCandidate } from "@/lib/sos-ghl";

const TEAL = "#1B7A6E";
const AMBER = "#F5B83D";

const STATUS: Record<CommissionStatus, { label: string; cls: string }> = {
  owed: { label: "Owed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending_close: { label: "Pending close", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  needs_data: { label: "Needs capture date", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  outside_window: { label: "Outside 180d", cls: "bg-red-50 text-red-700 border-red-200" },
};

interface Draft {
  id?: string; customer_name?: string; ghl_opportunity_id?: string;
  tdv_solar?: string; tdv_battery?: string; tdv_ancillary?: string; tdv_upgrades?: string; tdv_additional?: string; bus_grant_gbp?: string;
  binding_agreement_date?: string; first_payment_date?: string; most_recent_capture_at?: string;
  attribution_source?: string; attribution_evidence?: string; dispute_evidence?: string; invoice_status?: string;
  disputed?: boolean; would_have_won_anyway?: boolean;
}

const n = (s?: string) => { const v = Number(s); return isFinite(v) ? v : 0; };
const s = (v: number | null | undefined) => (v ? String(v) : "");

export default function LedgerClient({
  summary, config, currentMonth, saveDeal, deleteDeal,
}: {
  summary: LedgerSummary;
  config: SosConfigRow;
  currentMonth: string;
  saveDeal: (fd: FormData) => Promise<void>;
  deleteDeal: (fd: FormData) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({ invoice_status: "owed" });
  const [cands, setCands] = useState<SosGhlCandidate[] | null>(null);
  const [candMsg, setCandMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Live TDV + commission preview from the draft (mirrors the engine).
  const previewTdv = n(draft.tdv_solar) + n(draft.tdv_battery) + n(draft.tdv_ancillary) + n(draft.tdv_upgrades) + n(draft.tdv_additional) + (config.tdv_includes_bus ? n(draft.bus_grant_gbp) : 0);
  const previewCommEx = config.commission_pct * previewTdv;
  const previewCommTotal = previewCommEx * (1 + config.vat_rate);

  const thisMonthOwed = summary.deals
    .filter((d) => d.status === "owed" && (d.first_payment_date ?? "").startsWith(currentMonth))
    .reduce((a, d) => a + d.commission_total, 0);

  const editRow = (d: DealComputed) => {
    setDraft({
      id: d.id, customer_name: d.customer_name ?? "", ghl_opportunity_id: d.ghl_opportunity_id ?? "",
      tdv_solar: s(d.tdv_solar), tdv_battery: s(d.tdv_battery), tdv_ancillary: s(d.tdv_ancillary),
      tdv_upgrades: s(d.tdv_upgrades), tdv_additional: s(d.tdv_additional), bus_grant_gbp: s(d.bus_grant_gbp),
      binding_agreement_date: d.binding_agreement_date ?? "", first_payment_date: d.first_payment_date ?? "",
      most_recent_capture_at: d.most_recent_capture_at ?? "", attribution_source: d.attribution_source ?? "",
      invoice_status: d.invoice_status ?? "owed", disputed: !!d.disputed, would_have_won_anyway: !!d.would_have_won_anyway,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const pullGhl = async () => {
    setCandMsg("Loading…");
    try {
      const r = await fetch("/api/sos/ghl-candidates").then((x) => x.json());
      if (!r.configured) { setCandMsg("GHL isn't configured for this project."); setCands([]); return; }
      setCands(r.candidates ?? []);
      setCandMsg(r.error ? `GHL: ${r.error}` : `${(r.candidates ?? []).length} won deals in GHL — click one to pre-fill.`);
    } catch { setCandMsg("Couldn't reach GHL."); }
  };

  const prefill = (c: SosGhlCandidate) => {
    setDraft({
      customer_name: c.customer_name, ghl_opportunity_id: c.ghl_opportunity_id,
      tdv_solar: c.value ? String(c.value) : "", attribution_source: c.source ?? "", invoice_status: "owed",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const exportCsv = () => {
    const head = ["Customer", "TDV ex-VAT", "Commission ex-VAT", "Commission incl VAT", "Status", "Binding agreement", "First payment", "Most-recent capture", "Days to close", "Invoice due", "Attribution", "Disputed", "Would-have-won", "Invoice status"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = summary.deals.map((d) => [
      d.customer_name, d.tdv_ex_vat, d.commission_ex_vat, d.commission_total, STATUS[d.status].label,
      d.binding_agreement_date ?? "", d.first_payment_date ?? "", d.most_recent_capture_at ?? "",
      d.days_to_close ?? "", d.invoice_due_date ?? "", d.attribution_source ?? "",
      d.disputed ? "yes" : "no", d.would_have_won_anyway ? "yes" : "no", d.invoice_status ?? "",
    ].map(esc).join(","));
    const csv = [head.map(esc).join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sos-commission-ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async (fd: FormData) => { await saveDeal(fd); setDraft({ invoice_status: "owed" }); };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Commission ledger</h1>
        <button onClick={exportCsv} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent">Download CSV</button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        2% of Total Deal Value per Closed Transaction (binding agreement + first payment), owed only within {config.attribution_window_days} days of the most-recent lead capture. All figures ex-VAT unless stated.
      </p>

      {/* TDV/BUS basis banner */}
      <div className="mb-6 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: `${AMBER}66`, background: `${AMBER}14`, color: "#7a5e12" }}>
        <b>TDV basis:</b> {config.tdv_includes_bus ? "including the BUS grant portion" : "excluding the BUS grant (customer-paid only)"} — {config.tdv_includes_bus ? "" : "unconfirmed pending SoS. "}Flip this in Pulse settings once confirmed; every figure below recomputes.
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owed this month</div><div className="mt-1 text-2xl font-bold" style={{ color: TEAL }}>{gbp(thisMonthOwed)}</div><div className="text-xs text-muted-foreground">incl VAT · {currentMonth}</div></Card>
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</div><div className="mt-1 text-2xl font-bold">{gbp(summary.outstandingInclVat)}</div><div className="text-xs text-muted-foreground">owed &amp; not yet paid</div></Card>
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owed deals</div><div className="mt-1 text-2xl font-bold">{summary.ownedCount}</div><div className="text-xs text-muted-foreground">of {summary.deals.length} logged</div></Card>
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs attention</div><div className="mt-1 text-2xl font-bold" style={{ color: summary.needsDataCount ? AMBER : undefined }}>{summary.needsDataCount}</div><div className="text-xs text-muted-foreground">missing capture date{summary.disputedCount ? ` · ${summary.disputedCount} disputed` : ""}</div></Card>
      </div>

      {/* Ledger table */}
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-base font-semibold">Closed transactions</h2>
        {summary.deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deals logged yet. Add one below, or pull your won deals from GHL to pre-fill.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Customer</th>
                  <th className="py-1 pr-3 text-right font-medium">TDV ex-VAT</th>
                  <th className="py-1 pr-3 text-right font-medium">Commission (incl VAT)</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 pr-3 font-medium">First payment</th>
                  <th className="py-1 pr-3 font-medium">Days to close</th>
                  <th className="py-1 pr-3 font-medium">Invoice due</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {summary.deals.map((d) => (
                  <tr key={d.id} className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">{d.customer_name ?? "—"}{d.would_have_won_anyway ? <span className="ml-1 text-xs text-muted-foreground" title="Would have won anyway (non-incremental)">◦</span> : null}{d.disputed ? <span className="ml-1 text-xs text-red-600" title="Disputed">⚑</span> : null}</td>
                    <td className="py-1.5 pr-3 text-right">{gbp(d.tdv_ex_vat)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{gbp(d.commission_total)}</td>
                    <td className="py-1.5 pr-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span></td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{d.first_payment_date ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{d.days_to_close ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{d.invoice_due_date ?? "—"}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => editRow(d)} className="mr-2 text-xs text-accent hover:underline">Edit</button>
                      <form action={deleteDeal} className="inline">
                        <input type="hidden" name="id" value={d.id} />
                        <button type="submit" className="text-xs text-muted-foreground hover:text-red-600">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* GHL prefill */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Pull won deals from GHL</h2>
          <button onClick={pullGhl} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent">Pull from GHL</button>
        </div>
        {candMsg ? <p className="mt-2 text-xs text-muted-foreground">{candMsg}</p> : null}
        {cands && cands.length > 0 ? (
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {cands.map((c) => (
              <button key={c.ghl_opportunity_id} onClick={() => prefill(c)} className="flex w-full items-baseline justify-between rounded border border-border px-3 py-1.5 text-left text-sm hover:border-accent">
                <span className="font-medium">{c.customer_name}</span>
                <span className="text-xs text-muted-foreground">{gbp(c.value)}{c.source ? ` · ${c.source}` : ""}{c.won_date ? ` · ${c.won_date}` : ""}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-muted-foreground">A GHL &ldquo;won&rdquo; deal isn&apos;t a contractual Closed Transaction — you still need to enter the first-payment date and the TDV breakdown below.</p>
      </Card>

      {/* Add / edit form */}
      <div ref={formRef}>
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">{draft.id ? "Edit deal" : "Record a closed deal"}</h2>
        <form action={handleSave} className="space-y-4">
          {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
          <input type="hidden" name="ghl_opportunity_id" value={draft.ghl_opportunity_id ?? ""} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <L label="Customer"><input name="customer_name" value={draft.customer_name ?? ""} onChange={(e) => upd("customer_name", e.target.value)} className={inp} /></L>
            <L label="Solar (£)"><input name="tdv_solar" type="number" value={draft.tdv_solar ?? ""} onChange={(e) => upd("tdv_solar", e.target.value)} className={inp} /></L>
            <L label="Battery (£)"><input name="tdv_battery" type="number" value={draft.tdv_battery ?? ""} onChange={(e) => upd("tdv_battery", e.target.value)} className={inp} /></L>
            <L label="Ancillary (£)"><input name="tdv_ancillary" type="number" value={draft.tdv_ancillary ?? ""} onChange={(e) => upd("tdv_ancillary", e.target.value)} className={inp} /></L>
            <L label="Upgrades (£)"><input name="tdv_upgrades" type="number" value={draft.tdv_upgrades ?? ""} onChange={(e) => upd("tdv_upgrades", e.target.value)} className={inp} /></L>
            <L label="Additional works (£)"><input name="tdv_additional" type="number" value={draft.tdv_additional ?? ""} onChange={(e) => upd("tdv_additional", e.target.value)} className={inp} /></L>
            <L label="BUS grant (£)"><input name="bus_grant_gbp" type="number" value={draft.bus_grant_gbp ?? ""} onChange={(e) => upd("bus_grant_gbp", e.target.value)} className={inp} /></L>
            <L label="Invoice status">
              <select name="invoice_status" value={draft.invoice_status ?? "owed"} onChange={(e) => upd("invoice_status", e.target.value)} className={inp}>
                <option value="owed">owed</option><option value="invoiced">invoiced</option><option value="paid">paid</option>
              </select>
            </L>
            <L label="Binding agreement date"><input name="binding_agreement_date" type="date" value={draft.binding_agreement_date ?? ""} onChange={(e) => upd("binding_agreement_date", e.target.value)} className={inp} /></L>
            <L label="First payment date"><input name="first_payment_date" type="date" value={draft.first_payment_date ?? ""} onChange={(e) => upd("first_payment_date", e.target.value)} className={inp} /></L>
            <L label="Most-recent capture"><input name="most_recent_capture_at" type="date" value={draft.most_recent_capture_at ?? ""} onChange={(e) => upd("most_recent_capture_at", e.target.value)} className={inp} /></L>
            <L label="Attribution source"><input name="attribution_source" value={draft.attribution_source ?? ""} onChange={(e) => upd("attribution_source", e.target.value)} className={inp} placeholder="Meta / UTM / CRM" /></L>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <L label="Attribution evidence"><input name="attribution_evidence" value={draft.attribution_evidence ?? ""} onChange={(e) => upd("attribution_evidence", e.target.value)} className={inp} placeholder="UTM string, CRM note, etc." /></L>
            <L label="Dispute evidence"><input name="dispute_evidence" value={draft.dispute_evidence ?? ""} onChange={(e) => upd("dispute_evidence", e.target.value)} className={inp} placeholder="Objective evidence to disprove attribution" /></L>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="disputed" checked={!!draft.disputed} onChange={(e) => upd("disputed", e.target.checked)} /> Disputed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="would_have_won_anyway" checked={!!draft.would_have_won_anyway} onChange={(e) => upd("would_have_won_anyway", e.target.checked)} /> Would have won anyway (non-incremental)</label>
          </div>
          <div className="flex items-center gap-4 border-t border-border pt-4">
            <button type="submit" className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-white hover:opacity-90">{draft.id ? "Save changes" : "Add deal"}</button>
            {draft.id || Object.keys(draft).length > 1 ? <button type="button" onClick={() => setDraft({ invoice_status: "owed" })} className="text-sm text-muted-foreground hover:underline">Clear</button> : null}
            <span className="ml-auto text-sm text-muted-foreground">
              TDV <b className="text-foreground">{gbp(previewTdv)}</b> → commission <b style={{ color: TEAL }}>{gbp(previewCommEx)}</b> + VAT = <b>{gbp(previewCommTotal)}</b>
            </span>
          </div>
        </form>
      </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Commission triggers on the first payment received (with a binding agreement), not on quote or signature. The ledger keeps computing for {config.attribution_window_days} days after any cancellation (survival). Records are exportable for the ≥12-month retention requirement.
      </p>
    </div>
  );
}

const inp = "w-full rounded-md border border-border px-2 py-1.5 text-sm outline-none focus:border-accent";
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
