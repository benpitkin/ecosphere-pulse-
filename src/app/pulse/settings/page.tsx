import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Cfg = {
  monthly_overheads: number; low_runway_months: number; overdue_alert_gbp: number;
  pipeline_target_gbp: number; capital_on_tap_gbp: number;
  owner_drawings_gbp: number; opening_cash_gbp: number;
};

async function loadConfig(): Promise<Cfg> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pulse_config")
    .select("monthly_overheads, low_runway_months, overdue_alert_gbp, pipeline_target_gbp, capital_on_tap_gbp, owner_drawings_gbp, opening_cash_gbp")
    .eq("id", true)
    .maybeSingle();
  return {
    monthly_overheads: Number(data?.monthly_overheads) || 0,
    low_runway_months: Number(data?.low_runway_months) || 3,
    overdue_alert_gbp: Number(data?.overdue_alert_gbp) || 0,
    pipeline_target_gbp: Number(data?.pipeline_target_gbp) || 0,
    capital_on_tap_gbp: Number(data?.capital_on_tap_gbp) || 0,
    owner_drawings_gbp: Number(data?.owner_drawings_gbp) || 2000,
    opening_cash_gbp: Number(data?.opening_cash_gbp) || 0,
  };
}

async function saveConfig(formData: FormData) {
  "use server";
  const num = (k: string) => Number(formData.get(k)) || 0;
  const admin = createAdminClient();
  await admin.from("pulse_config").upsert({
    id: true,
    monthly_overheads: num("monthly_overheads"),
    low_runway_months: num("low_runway_months"),
    overdue_alert_gbp: num("overdue_alert_gbp"),
    pipeline_target_gbp: num("pipeline_target_gbp"),
    capital_on_tap_gbp: num("capital_on_tap_gbp"),
    owner_drawings_gbp: num("owner_drawings_gbp"),
    opening_cash_gbp: num("opening_cash_gbp"),
    updated_at: new Date().toISOString(),
  });
  redirect("/pulse?saved=1");
}

function Field({ name, label, hint, value, step = "1" }: {
  name: string; label: string; hint: string; value: number; step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input type="number" name={name} defaultValue={value} step={step}
        className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

export default async function PulseSettingsPage() {
  const cfg = await loadConfig();
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Pulse settings</h1>
        <Link href="/pulse" className="text-sm text-muted-foreground hover:underline">← Back to Pulse</Link>
      </div>
      <Card className="p-5">
        <form action={saveConfig} className="space-y-4">
          <Field name="monthly_overheads" label="Monthly overheads (£)"
            hint="Your fixed monthly burn. Drives runway = available cash ÷ this." value={cfg.monthly_overheads} />
          <Field name="low_runway_months" label="Low-runway alert (months)"
            hint="Alert when runway dips below this many months." value={cfg.low_runway_months} step="0.5" />
          <Field name="overdue_alert_gbp" label="Overdue alert threshold (£)"
            hint="Alert when overdue receivables exceed this." value={cfg.overdue_alert_gbp} />
          <Field name="pipeline_target_gbp" label="Weighted pipeline target (£)"
            hint="Your forecast target for the period; flags a gap if pipeline is below it." value={cfg.pipeline_target_gbp} />
          <Field name="capital_on_tap_gbp" label="Facility headroom — Capital on Tap (£)"
            hint="Manually-confirmed available facility. Added to cash for runway." value={cfg.capital_on_tap_gbp} />
          <Field name="owner_drawings_gbp" label="Your monthly take-home (£)"
            hint="Your current draw. Sets the starting point for the forecast's take-home slider." value={cfg.owner_drawings_gbp} />
          <Field name="opening_cash_gbp" label="Opening cash override (£)"
            hint="Leave 0 to use live Xero cash. Set a value only to override the forecast's starting cash." value={cfg.opening_cash_gbp} />
          <button type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Save
          </button>
        </form>
      </Card>
    </div>
  );
}
