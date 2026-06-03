import { getXeroSnapshot } from "@/lib/xero";
import { createAdminClient } from "@/lib/supabase";
import ForecastExplorer from "./forecast-explorer";
import { getCommittedJobs } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

async function readConfig(): Promise<{ opening: number | null; draw: number | null }> {
  try {
    const admin = createAdminClient();
    const r = await admin
      .from("pulse_config")
      .select("opening_cash_gbp, owner_drawings_gbp")
      .eq("id", true)
      .maybeSingle();
    const d = r.data as { opening_cash_gbp?: number; owner_drawings_gbp?: number } | null;
    const openingRaw = d?.opening_cash_gbp != null ? Number(d.opening_cash_gbp) : 0;
    const drawRaw = d?.owner_drawings_gbp != null ? Number(d.owner_drawings_gbp) : 0;
    return { opening: openingRaw > 0 ? openingRaw : null, draw: drawRaw > 0 ? drawRaw : null };
  } catch {
    return { opening: null, draw: null };
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
  const { opening, draw } = await readConfig();
  const committed = await getCommittedJobs();

  return (
    <ForecastExplorer
      cash={xero.cash}
      receivables={xero.receivables}
      overdue={xero.overdue}
      openingOverride={opening}
      initialDraw={draw}
      committed={committed}
    />
  );
}
