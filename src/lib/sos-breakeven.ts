// ---------------------------------------------------------------------------
// Solar on Steroids — break-even / ROI engine.
//
// A faithful port of the funnel maths in the reference `breakeven.html` (spec §C):
// ad spend → leads → jobs → revenue → net profit, and the break-even job count.
// Pure and deterministic so it can be unit-reasoned about and reused by the
// scenario modeller (D.1) and the live tracker (D.2).
//
// NOTE on commission: here commission is folded into `profitPerJob` as a per-job
// cost (AOV × commissionPct), which is correct for THIS view because every job in
// the funnel is an SoS-attributed job. The contractual commission LEDGER (per
// Closed Transaction, 2% of TDV) is a separate engine built in Phase 3.
//
// Referral / overspill: SoS's headline stacks referral + "overspill" uplift onto
// the RETURN only, and their 2% is charged on the base funnel only. So we model
// the uplift as extra, NON-commissionable gross profit — never folded into
// commissionable revenue.
// ---------------------------------------------------------------------------

import { MODEL_DEFAULTS } from "@/lib/forecast";

export interface SosBreakevenInputs {
  avgJobValue: number;      // AOV = Total Deal Value per job (£)
  grossMargin: number;      // 0..1, profit on a job before marketing cost
  retainer: number;         // £/mo ex-VAT (SOW §2.1)
  adSpend: number;          // £/mo paid direct to Meta
  commissionPct: number;    // 0..1 (2% = 0.02)
  costPerLead: number;      // £
  closeRate: number;        // 0..1 overall lead→job (used when LQ/QS not both given)
  leadToQuote?: number;     // 0..1 (SoS: 40%) — enables quotes_per_mo + overrides closeRate
  quoteToSale?: number;     // 0..1 (SoS: 25%)
  referralUpliftPct?: number;  // 0..1 non-commissionable uplift on the return
  overspillUpliftPct?: number; // 0..1 non-commissionable uplift on the return
}

export interface SosBreakevenResult {
  closeRate: number;             // effective overall close used (LQ×QS or closeRate)
  leadsPerMo: number;
  quotesPerMo: number | null;    // null unless leadToQuote provided
  jobsPerMo: number;
  revenuePerMo: number;          // commissionable job revenue
  commissionPerMo: number;
  grossProfitMo: number;
  fixedCostMo: number;           // retainer + ad spend (ex-VAT; VAT reclaimable)
  profitPerJob: number;          // contribution net of commission
  breakEvenJobs: number;         // Infinity when a job doesn't cover its own commission
  netProfitMo: number;
  gpReturn: number;              // gross profit ÷ (fixed + commission)
  upliftPerMo: number;           // extra non-commissionable gross profit (referral + overspill)
  netProfitWithUpliftMo: number;
}

/** Compute the full break-even / ROI picture for one set of inputs. Pure. */
export function computeSosBreakeven(i: SosBreakevenInputs): SosBreakevenResult {
  const cr =
    i.leadToQuote != null && i.quoteToSale != null
      ? i.leadToQuote * i.quoteToSale
      : i.closeRate;

  const leadsPerMo = i.costPerLead > 0 ? i.adSpend / i.costPerLead : 0;
  const quotesPerMo = i.leadToQuote != null ? leadsPerMo * i.leadToQuote : null;
  const jobsPerMo = leadsPerMo * cr;

  const revenuePerMo = jobsPerMo * i.avgJobValue;
  const commissionPerMo = revenuePerMo * i.commissionPct;
  const grossProfitMo = revenuePerMo * i.grossMargin;
  const fixedCostMo = i.retainer + i.adSpend;

  // Contribution per job, net of the per-job commission.
  const profitPerJob = i.avgJobValue * i.grossMargin - i.avgJobValue * i.commissionPct;
  const breakEvenJobs = profitPerJob > 0 ? fixedCostMo / profitPerJob : Infinity;
  const netProfitMo = jobsPerMo * profitPerJob - fixedCostMo;
  const gpReturn = fixedCostMo + commissionPerMo > 0 ? grossProfitMo / (fixedCostMo + commissionPerMo) : 0;

  // Referral + overspill: extra return that is NOT commissionable.
  const upliftPct = (i.referralUpliftPct ?? 0) + (i.overspillUpliftPct ?? 0);
  const upliftPerMo = grossProfitMo * upliftPct;
  const netProfitWithUpliftMo = netProfitMo + upliftPerMo;

  return {
    closeRate: cr,
    leadsPerMo,
    quotesPerMo,
    jobsPerMo,
    revenuePerMo,
    commissionPerMo,
    grossProfitMo,
    fixedCostMo,
    profitPerJob,
    breakEvenJobs,
    netProfitMo,
    gpReturn,
    upliftPerMo,
    netProfitWithUpliftMo,
  };
}

// --- Presets (scenario modeller D.1) ---------------------------------------
// SoS benchmark uses their own quoted numbers; "real Pulse" is anchored to the
// live cash model's defaults so the two engines can't drift apart.

export const SOS_BENCHMARK: SosBreakevenInputs = {
  avgJobValue: 12100,
  grossMargin: 0.30,
  retainer: 2000,
  adSpend: 2500,
  commissionPct: 0.02,
  costPerLead: 35,
  closeRate: 0.10,
  leadToQuote: 0.40,
  quoteToSale: 0.25,
};

// Real EcoSphere economics, derived from the cash model (AOV £15,492; GM = 1 − COGS 65%).
// closeRate is a placeholder until the live GHL Meta-lead close rate replaces it.
export const REAL_PULSE: SosBreakevenInputs = {
  avgJobValue: MODEL_DEFAULTS.avgJob,
  grossMargin: 1 - MODEL_DEFAULTS.cogsPct,
  retainer: 2000,
  adSpend: 2500,
  commissionPct: 0.02,
  costPerLead: 35,
  closeRate: 0.10,
};

export const CONSERVATIVE: SosBreakevenInputs = {
  avgJobValue: 12100,
  grossMargin: 0.30,
  retainer: 2000,
  adSpend: 2500,
  commissionPct: 0.02,
  costPerLead: 60,
  closeRate: 0.08,
};

export const SOS_PRESETS = {
  real: { label: "Our real Pulse figures", inputs: REAL_PULSE },
  benchmark: { label: "SoS benchmark", inputs: SOS_BENCHMARK },
  conservative: { label: "Conservative", inputs: CONSERVATIVE },
} as const;
