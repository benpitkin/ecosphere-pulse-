import type { PulseConfig } from "./types";
import { supabaseService } from "./supabase";

// Matches the single-row `pulse_config` table (10 Jun 2026 values).
export const DEFAULT_CONFIG: PulseConfig = {
  monthlyOverheads: 10850,
  lowRunwayMonths: 3,
  overdueAlertGbp: 10000,
  pipelineTargetGbp: 0,
  capitalOnTapGbp: 0, // Capital on Tap cleared (refinanced to Funding Circle)
};

export async function getPulseConfig(): Promise<PulseConfig> {
  try {
    const supabase = supabaseService();
    const { data } = await supabase.from("pulse_config").select("*").single();
    if (!data) return DEFAULT_CONFIG;
    const row = data as Record<string, unknown>;
    const num = (v: unknown, d: number) => (v == null ? d : Number(v));
    return {
      monthlyOverheads: num(row.monthly_overheads, DEFAULT_CONFIG.monthlyOverheads),
      lowRunwayMonths: num(row.low_runway_months, DEFAULT_CONFIG.lowRunwayMonths),
      overdueAlertGbp: num(row.overdue_alert_gbp, DEFAULT_CONFIG.overdueAlertGbp),
      pipelineTargetGbp: num(row.pipeline_target_gbp, DEFAULT_CONFIG.pipelineTargetGbp),
      capitalOnTapGbp: num(row.capital_on_tap_gbp, DEFAULT_CONFIG.capitalOnTapGbp),
    };
  } catch {
    return DEFAULT_CONFIG; // no creds / offline -> sane defaults so the app still renders
  }
}
