import type { PipelineOpportunity, Proposal } from "./types";

// GoHighLevel pipeline. TODO: port real API calls. See docs/HANDOVER.md §5.
export async function fetchOpportunityValueMap(): Promise<Record<string, number>> {
  return {};
}

export async function getProposals(): Promise<Proposal[]> {
  const opps: PipelineOpportunity[] = [];
  return opps
    .map((p) => ({
      ...p,
      chaseScore: (p.value || 0) * (1 + Math.min(p.ageDays ?? 0, 90) / 30),
    }))
    .sort((a, b) => b.chaseScore - a.chaseScore);
}
