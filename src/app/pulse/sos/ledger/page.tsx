import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { summariseLedger, type SosConfigRow, type SosDealRow } from "@/lib/sos-commission";
import { SosTabs } from "../sos-tabs";
import LedgerClient from "./ledger-client";

export const dynamic = "force-dynamic";

const DEAL_COLS =
  "id, customer_name, ghl_opportunity_id, tdv_solar, tdv_battery, tdv_ancillary, tdv_upgrades, tdv_additional, bus_grant_gbp, binding_agreement_date, first_payment_date, most_recent_capture_at, attribution_source, disputed, would_have_won_anyway, invoice_status, created_at";

async function loadConfig(): Promise<SosConfigRow> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pulse_sos_config")
    .select("commission_pct, vat_rate, attribution_window_days, tdv_includes_bus, retainer_gbp, ad_spend_gbp")
    .eq("id", true)
    .maybeSingle();
  return {
    commission_pct: Number(data?.commission_pct ?? 0.02),
    vat_rate: Number(data?.vat_rate ?? 0.2),
    attribution_window_days: Number(data?.attribution_window_days ?? 180),
    tdv_includes_bus: Boolean(data?.tdv_includes_bus ?? false),
    retainer_gbp: Number(data?.retainer_gbp ?? 2000),
    ad_spend_gbp: Number(data?.ad_spend_gbp ?? 2500),
  };
}

async function loadDeals(): Promise<SosDealRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("pulse_sos_deals").select(DEAL_COLS).order("created_at", { ascending: false });
  return (data as SosDealRow[] | null) ?? [];
}

// --- server actions --------------------------------------------------------

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
};
const dateOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const textOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

async function saveDeal(formData: FormData) {
  "use server";
  const admin = createAdminClient();
  const id = textOrNull(formData.get("id"));
  const evidenceNote = textOrNull(formData.get("attribution_evidence"));
  const row = {
    customer_name: textOrNull(formData.get("customer_name")),
    ghl_opportunity_id: textOrNull(formData.get("ghl_opportunity_id")),
    tdv_solar: numOrNull(formData.get("tdv_solar")),
    tdv_battery: numOrNull(formData.get("tdv_battery")),
    tdv_ancillary: numOrNull(formData.get("tdv_ancillary")),
    tdv_upgrades: numOrNull(formData.get("tdv_upgrades")),
    tdv_additional: numOrNull(formData.get("tdv_additional")),
    bus_grant_gbp: numOrNull(formData.get("bus_grant_gbp")),
    binding_agreement_date: dateOrNull(formData.get("binding_agreement_date")),
    first_payment_date: dateOrNull(formData.get("first_payment_date")),
    most_recent_capture_at: dateOrNull(formData.get("most_recent_capture_at")),
    attribution_source: textOrNull(formData.get("attribution_source")),
    attribution_evidence: evidenceNote ? { note: evidenceNote } : null,
    disputed: formData.get("disputed") === "on",
    dispute_evidence: textOrNull(formData.get("dispute_evidence")),
    would_have_won_anyway: formData.get("would_have_won_anyway") === "on",
    invoice_status: textOrNull(formData.get("invoice_status")) ?? "owed",
    updated_at: new Date().toISOString(),
  };
  if (id) await admin.from("pulse_sos_deals").update(row).eq("id", id);
  else await admin.from("pulse_sos_deals").insert(row);
  revalidatePath("/pulse/sos/ledger");
}

async function deleteDeal(formData: FormData) {
  "use server";
  const id = textOrNull(formData.get("id"));
  if (id) {
    const admin = createAdminClient();
    await admin.from("pulse_sos_deals").delete().eq("id", id);
  }
  revalidatePath("/pulse/sos/ledger");
}

export default async function LedgerPage() {
  const [config, deals] = await Promise.all([loadConfig(), loadDeals()]);
  const summary = summariseLedger(deals, config);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <>
      <SosTabs />
      <LedgerClient
        summary={summary}
        config={config}
        currentMonth={currentMonth}
        saveDeal={saveDeal}
        deleteDeal={deleteDeal}
      />
    </>
  );
}
