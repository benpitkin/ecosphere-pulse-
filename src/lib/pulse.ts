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
    overheads_used: number;             // monthly overheads actually used (config or model default)
    runway_is_estimate: boolean;        // true when opening cash is the model placeholder
    pipeline_gap: number | null;         // weighted pipeline - target
  };
  actions: PulseAction[];
}

// Defaults sourced from EcoSphere_Cashflow_Model.xlsx so overheads/runway work
// without manual entry. Replaced by live Xero P&L once the reports permission lands.
const MODEL_OVERHEADS = 8850;     // fixed running overheads (payroll + bills), excl. drawings + marketing
const MODEL_OPENING_CASH = 45000;  // placeholder bank balance until live cash is available

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
  // Run sequentially, not in Promise.all: concurrent Supabase reads at request
  // start were intermittently coming back empty on this serverless setup,
  // making a live Xero connection look unconfigured.
  const xero = await getXeroSnapshot();
  const config = await loadConfig();
  const pipeline = await fetchPipelineSummary();

  const cash = xero.cash;
  // Overheads default from the model when not set; cash falls back to the model
  // opening balance until live cash is available (reports permission).
  const overheadsUsed = config.monthly_overheads > 0 ? config.monthly_overheads : MODEL_OVERHEADS;
  const cashForRunway = cash != null ? cash : MODEL_OPENING_CASH;
  const runwayIsEstimate = cash == null;
  const availableLiquidity =
    Math.round((cashForRunway + (config.capital_on_tap_gbp || 0)) * 100) / 100;
  const runwayMonths = Math.round((availableLiquidity / overheadsUsed) * 10) / 10;
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
  if (runwayMonths < config.low_runway_months) {
    actions.push({
      severity: runwayMonths < config.low_runway_months / 2 ? "critical" : "warning",
      title: `Runway is ${runwayMonths} months`,
      detail:
        `Available liquidity of ${gbp(availableLiquidity)} against ${gbp(overheadsUsed)}/mo overheads is below the ${config.low_runway_months}-month floor.` +
        (runwayIsEstimate
          ? " Estimate — opening cash uses the model figure until live Xero cash is available."
          : " Review committed spend or accelerate collections."),
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
      overheads_used: overheadsUsed,
      runway_is_estimate: runwayIsEstimate,
      pipeline_gap: pipelineGap,
    },
    actions,
  };
}

function gbp(n: number | null | undefined): string {
  return "£" + (Number(n) || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
}
