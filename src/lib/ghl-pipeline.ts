import type { PipelineOpportunity, Proposal } from "./types";

// GoHighLevel v2 API (LeadConnector). Private Integration Token (pit-…) in GHL_API_KEY,
// sub-account in GHL_LOCATION_ID. See docs/HANDOVER.md §3/§5.
const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

function ghlEnv(): { token: string; locationId: string } | null {
  const token = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) return null; // not configured -> callers render empty
  return { token, locationId };
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" };
}

interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  status?: string; // open | won | lost | abandoned
  pipelineStageId?: string;
  lastStageChangeAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

// All opportunities for the location, paginated via meta.nextPageUrl (page size 100).
async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const env = ghlEnv();
  if (!env) return [];
  const out: GhlOpportunity[] = [];
  let url = `${API}/opportunities/search?location_id=${env.locationId}&limit=100`;
  for (let guard = 0; guard < 50; guard++) {
    const res = await fetch(url, { headers: headers(env.token) });
    if (!res.ok) break;
    const json = (await res.json()) as {
      opportunities?: GhlOpportunity[];
      meta?: { nextPageUrl?: string | null };
    };
    const opps = json.opportunities ?? [];
    out.push(...opps);
    const next = json.meta?.nextPageUrl;
    if (!next || opps.length < 100) break;
    url = next;
  }
  return out;
}

// { opportunityId -> monetaryValue } — lets dispatch-jobs resolve job values GHL-first.
export async function fetchOpportunityValueMap(): Promise<Record<string, number>> {
  const opps = await fetchAllOpportunities();
  const map: Record<string, number> = {};
  for (const o of opps) map[o.id] = o.monetaryValue ?? 0;
  return map;
}

interface GhlPipeline {
  id: string;
  name?: string;
  stages?: Array<{ id: string; name?: string }>;
}

// Stage names that mean "price sent, awaiting the customer's decision".
const PROPOSAL_STAGE = /proposal|quote sent/i;

// stageId -> stageName for every proposal-type stage across all pipelines.
async function proposalStages(token: string, locationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const res = await fetch(`${API}/opportunities/pipelines?locationId=${locationId}`, {
    headers: headers(token),
  });
  if (!res.ok) return map;
  const json = (await res.json()) as { pipelines?: GhlPipeline[] };
  for (const p of json.pipelines ?? [])
    for (const s of p.stages ?? [])
      if (s.name && PROPOSAL_STAGE.test(s.name)) map.set(s.id, s.name);
  return map;
}

// Open opportunities in a proposal stage, ranked by chase-score (bigger + older first).
export async function getProposals(): Promise<Proposal[]> {
  const env = ghlEnv();
  if (!env) return [];
  const [stages, opps] = await Promise.all([
    proposalStages(env.token, env.locationId),
    fetchAllOpportunities(),
  ]);
  const now = Date.now();
  const proposals: Proposal[] = [];
  for (const o of opps) {
    if (o.status !== "open") continue;
    const stage = o.pipelineStageId ? stages.get(o.pipelineStageId) : undefined;
    if (!stage) continue;
    const since = o.lastStageChangeAt ?? o.updatedAt ?? o.createdAt;
    const ageDays = since ? Math.floor((now - new Date(since).getTime()) / 86_400_000) : 0;
    const opp: PipelineOpportunity = {
      id: o.id,
      name: o.name ?? "Unknown",
      value: o.monetaryValue ?? 0,
      stage,
      ageDays,
    };
    proposals.push({
      ...opp,
      chaseScore: (opp.value || 0) * (1 + Math.min(ageDays, 90) / 30),
    });
  }
  return proposals.sort((a, b) => b.chaseScore - a.chaseScore);
}
