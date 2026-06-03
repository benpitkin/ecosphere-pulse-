import { getXeroSnapshot } from "@/lib/xero";
import { createAdminClient } from "@/lib/supabase";
import ForecastExplorer from "./forecast-explorer";
import { getCommittedJobs } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

async function readOpening(): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const r = await admin.from("pulse_config").select("opening_cash_gbp").eq("id", true).maybeSingle();
    const v = (r.data as { opening_cash_gbp?: number } | null)?.opening_cash_gbp;
    return v != null ? Number(v) : null;
  } catch {
    return null;
  }
}

export default async function ForecastPage() {
  let xero: { cash: number | null; receivables: number | null; overdue: number | null } = {
    cash: null, receivables: null, overdue: null,
  };
  try {
    const snap = await getXeroSnapshot();
    xero = { cash: snap.cash, receivables: snap.receivables, overdue: snap.overdue };
  } catch { /* defaults */ }
  const opening = await readOpening();
  const committed = await getCommittedJobs();

  return (
    <ForecastExplorer
      cash={xero.cash}
      receivables={xero.receivables}
      overdue={xero.overdue}
      openingOverride={opening}
      committed={committed}
    />
  );
}
