// ---------------------------------------------------------------------------
// Pulse action engine.
//
// Pulls the cash side (Xero) and the forward side (GHL pipeline), reads the
// tunables from pulse_config, and produces:
//   * headline metrics (cash, overdue, working capital, runway months)
//   * a ranked, deduplicated action list ("what we might need to do")
//
// Pure-ish: all IO is the three fetches; the rule logic is deterministic so it
// can be unit-reasoned about and reused by both the page and the alert cron.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase";
import { getXeroSnapshot, type XeroSnapshot } from "@/lib/xero";
import { fetchPipelineSummary, type PipelineSummary } from "@/lib/ghl-pipeline";

export interface PulseConfig {
  monthly_overheads: number;
  low_runway_months: number;
  overdue_alert_gbp: number;
  pipeline_target_gbp: number;
  capital_on_tap_gbp: number;
}

export type ActionSeverity = "critical" | "warning" | "info";

export interface PulseAction {
  severity: ActionSeverity;
  title: string;
  detail: string;
}

export interface Pulse {
  generated_at: string;
  xero: XeroSnapshot;
  pipeline: PipelineSummary;
  config: PulseConfig;
  metrics: {
    cash: number | null;
    overdue: number | null;
    receivables: number | null;
    working_capital: number | null;
    net_equity: number | null;
    available_liquidity: number | null; // cash + confirmed facility headroom
    runway_months: number | null;       // available_liquidity / monthly_overheads
    pipeline_gap: number | null;         // weighted pipeline - target
  };
  actions: PulseAction[];
}

const DEFAULT_CONFIG: PulseConfig = {
  monthly_overheads: 0,
  low_runway_months: 3,
  overdue_alert_gbp: 0,
  pipeline_target_gbp: 0,
  capital_on_tap_gbp: 0,
};

async function loadConfig(): Promise<PulseConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pulse_config")
    .select("monthly_overheads, low_runway_months, overdue_alert_gbp, pipeline_target_gbp, capital_on_tap_gbp")
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    monthly_overheads: Number(data.monthly_overheads) || 0,
    low_runway_months: Number(data.low_runway_months) || 3,
    overdue_alert_gbp: Number(data.overdue_alert_gbp) || 0,
    pipeline_target_gbp: Number(data.pipeline_target_gbp) || 0,
    capital_on_tap_gbp: Number(data.capital_on_tap_gbp) || 0,
  };
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Build the full Pulse: fetch both sides, compute metrics, derive actions. */
export async function buildPulse(): Promise<Pulse> {
  const [xero, pipeline, config] = await Promise.all([
    getXeroSnapshot(),
    fetchPipelineSummary(),
    loadConfig(),
  ]);

  const cash = xero.cash;
  const availableLiquidity =
    cash != null ? Math.round((cash + (config.capital_on_tap_gbp || 0)) * 100) / 100 : null;
  const runwayMonths =
    availableLiquidity != null && config.monthly_overheads > 0
      ? Math.round((availableLiquidity / config.monthly_overheads) * 10) / 10
      : null;
  const pipelineGap =
    config.pipeline_target_gbp > 0 && pipeline.configured
      ? Math.round((pipeline.weighted_value - config.pipeline_target_gbp) * 100) / 100
      : null;

  const actions: PulseAction[] = [];

  // ---- connection gaps (info) ----------------------------------------------
  if (!xero.configured) {
    actions.push({
      severity: "warning",
      title: "Connect Xero",
      detail: "Cash, receivables and equity figures are unavailable until the Xero connection is authorised.",
    });
  } else if (xero.error) {
    actions.push({ severity: "warning", title: "Xero sync issue", detail: xero.error });
  } else if (xero.cash == null) {
    actions.push({
      severity: "info",
      title: "Cash & equity pending Xero permission",
      detail: "Receivables are live. Cash, working capital and net equity need the Xero reports permission for this app — once granted they'll appear automatically.",
    });
  }
  if (!pipeline.configured) {
    actions.push({
      severity: "info",
      title: "Connect the sales pipeline",
      detail: "Set GHL_SALES_PIPELINE_ID to surface weighted pipeline and forecast gap.",
    });
  } else if (pipeline.error) {
    actions.push({ severity: "info", title: "Pipeline sync issue", detail: pipeline.error });
  }

  // ---- runway --------------------------------------------------------------
  if (runwayMonths != null) {
    if (runwayMonths < config.low_runway_months) {
      actions.push({
        severity: runwayMonths < config.low_runway_months / 2 ? "critical" : "warning",
        title: `Runway is ${runwayMonths} months`,
        detail: `Available liquidity of ${gbp(availableLiquidity)} against ${gbp(config.monthly_overheads)}/mo overheads is below the ${config.low_runway_months}-month floor. Review committed spend or accelerate collections.`,
      });
    }
  } else if (xero.configured && config.monthly_overheads <= 0) {
    actions.push({
      severity: "info",
      title: "Set monthly overheads",
      detail: "Runway can't be computed until monthly_overheads is set in Pulse config.",
    });
  }

  // ---- overdue receivables -------------------------------------------------
  if (xero.overdue != null && xero.overdue > 0) {
    const overThreshold = config.overdue_alert_gbp > 0 && xero.overdue >= config.overdue_alert_gbp;
    actions.push({
      severity: overThreshold ? "warning" : "info",
      title: `Chase ${gbp(xero.overdue)} overdue`,
      detail:
        xero.receivables != null
          ? `${gbp(xero.overdue)} of ${gbp(xero.receivables)} total receivables is past its due date.`
          : `${gbp(xero.overdue)} of receivables is past its due date.`,
    });
  }

  // ---- working capital -----------------------------------------------------
  if (xero.working_capital != null && xero.working_capital < 0) {
    actions.push({
      severity: "warning",
      title: "Negative working capital",
      detail: `Current liabilities exceed current assets by ${gbp(Math.abs(xero.working_capital))}. Watch short-term obligations.`,
    });
  }

  // ---- pipeline gap --------------------------------------------------------
  if (pipelineGap != null && pipelineGap < 0) {
    actions.push({
      severity: "warning",
      title: `Pipeline ${gbp(Math.abs(pipelineGap))} below target`,
      detail: `Weighted pipeline of ${gbp(pipeline.weighted_value)} trails the ${gbp(config.pipeline_target_gbp)} target. More qualified opportunities needed to cover the period.`,
    });
  }

  if (!actions.length) {
    actions.push({ severity: "info", title: "All clear", detail: "No thresholds tripped on the latest data." });
  }

  actions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    generated_at: new Date().toISOString(),
    xero,
    pipeline,
    config,
    metrics: {
      cash,
      overdue: xero.overdue,
      receivables: xero.receivables,
      working_capital: xero.working_capital,
      net_equity: xero.net_equity,
      available_liquidity: availableLiquidity,
      runway_months: runwayMonths,
      pipeline_gap: pipelineGap,
    },
    actions,
  };
}

function gbp(n: number | null | undefined): string {
  return "£" + (Number(n) || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
}
