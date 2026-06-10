// Shared domain types for EcoSphere Pulse. See docs/HANDOVER.md §7 for business meaning.

export interface CashPosition {
  cashBalance: number;
  receivables: number;
  overdue: number;
  workingCapital: number;
  netEquity: number;
}

export interface ForecastMonth {
  label: string; // e.g. "Jun-26"
  year: number;
  month: number; // 1-12
  inflows: number;
  outflows: number;
  net: number;
  closing: number;
}

export interface CommittedJob {
  customer: string;
  value: number;
  installMonth: string; // e.g. "Jun-26"
  bus: number; // BUS grant (heat pumps only)
}

export interface Liability {
  name: string;
  amount: number;
}

export interface PipelineOpportunity {
  id: string;
  name: string;
  value: number;
  stage: string;
  ageDays?: number;
}

export interface Proposal extends PipelineOpportunity {
  chaseScore: number;
}

export interface CrewMember {
  name: string;
  role: string;
}

export interface PulseConfig {
  monthlyOverheads: number;
  lowRunwayMonths: number;
  overdueAlertGbp: number;
  pipelineTargetGbp: number;
  capitalOnTapGbp: number;
}
