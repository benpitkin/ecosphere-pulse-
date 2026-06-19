// ---------------------------------------------------------------------------
// GHL pipeline summary — the forward-revenue side of Pulse.
//
// ghl-opps.ts already fetches *Won* opportunities for the install queue. Pulse
// needs the *open* pipeline instead: every live opportunity, grouped by stage,
// with a weighted forecast. Same auth + fetch conventions as ghl-opps.ts
// (Bearer key, Version header, configured flag).
//
// Weighting: GHL doesn't expose a per-stage probability by default, so we apply
// a simple, transparent ladder by stage position (earlier stages discounted
// harder). Override per-stage by setting GHL_STAGE_WEIGHTS as JSON
// {"<stageId>": 0.4, ...} in env once you've tuned them.
// ---------------------------------------------------------------------------

const GHL_BASE = "https://services.leadconnectorhq.com";

export interface StageSummary {
  stage_id: string;
  stage_name: string;
  count: number;
  value: number;          // raw monetary value in the stage
  weight: number;         // 0..1 probability applied
  weighted_value: number; // value * weight
}

export interface PipelineSummary {
  configured: boolean;
  pipeline_name: string | null;
  open_count: number;
  open_value: number;        // sum of raw monetary value across open opps
  weighted_value: number;    // sum of weighted values
  stages: StageSummary[];
  error?: string;
}

const EMPTY: PipelineSummary = {
  configured: false,
  pipeline_name: null,
  open_count: 0,
  open_value: 0,
  weighted_value: 0,
  stages: [],
};

interface PipelineStage {
  id: string;
  name: string;
  position?: number;
}

/** Win-probability weight by stage NAME. Terminal/dead/won stages -> 0 (not
 *  open future revenue); active funnel stages ramp up toward the proposal.
 *  Override any stage precisely via GHL_STAGE_WEIGHTS env. */
function stageWeight(name: string): number {
  const n = (name || "").toLowerCase();
  // Dead / lost / unqualified — excluded from the forecast.
  if (/lost|dead|unqualified|not proceeding|gone cold|cancel|closed/.test(n)) return 0;
  // Post-sale / won-and-delivered — not open pipeline.
  if (/ongoing|aftercare|service plan|install complete|installation complete|handover|nurture/.test(n)) return 0;
  // Accepted / deposit / install booked — effectively won.
  if (/accepted|install pending|deposit|installation booked|quote accepted|won/.test(n)) return 0.9;
  if (/proposal|quote sent/.test(n)) return 0.5;
  if (/survey completed/.test(n)) return 0.45;
  if (/survey booked/.test(n)) return 0.35;
  if (/survey|awaiting quote/.test(n)) return 0.25;
  if (/engaged|contacted|callback/.test(n)) return 0.15;
  if (/contact attempt|follow up|follow-up|no contact|contact attempted/.test(n)) return 0.1;
  if (/new enquiry|new lead|uncontacted/.test(n)) return 0.05;
  return 0.15; // unknown active stage
}

async function ghlFetch(path: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.GHL_API_KEY;
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL ${res.status} on ${path}: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchPipelineSummary(): Promise<PipelineSummary> {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  // Which pipeline to summarise. Falls back to the install pipeline id already
  // used by ghl-opps.ts so there's a sensible default.
  const pipelineId = process.env.GHL_SALES_PIPELINE_ID || process.env.GHL_INSTALL_PIPELINE_ID;
  if (!apiKey || !locationId || !pipelineId) return EMPTY;

  let stages: PipelineStage[] = [];
  let pipelineName: string | null = null;
  try {
    // Pipeline metadata -> stage list (id, name, order).
    const pipes = await ghlFetch(`/opportunities/pipelines?locationId=${locationId}`);
    const list = (pipes.pipelines as Array<{ id: string; name: string; stages?: PipelineStage[] }>) ?? [];
    const target = list.find((p) => p.id === pipelineId) ?? list[0] ?? null;
    if (target) {
      pipelineName = target.name ?? null;
      stages = (target.stages ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
  } catch (e) {
    return { ...EMPTY, configured: true, error: e instanceof Error ? e.message : String(e) };
  }

  // Optional per-stage weight overrides.
  let overrides: Record<string, number> = {};
  try {
    overrides = process.env.GHL_STAGE_WEIGHTS ? JSON.parse(process.env.GHL_STAGE_WEIGHTS) : {};
  } catch {
    overrides = {};
  }

  // Fetch open opportunities (status=open) across the pipeline, paginated.
  const byStage = new Map<string, { count: number; value: number }>();
  let openCount = 0;
  let openValue = 0;
  try {
    let page = 1;
    // GHL caps at 100/page; sub-100 open opps is the norm, cap at 5 pages.
    for (; page <= 5; page++) {
      const body = await ghlFetch(
        `/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=open&limit=100&page=${page}`,
      );
      const opps = (body.opportunities as Array<Record<string, unknown>>) ?? [];
      if (!opps.length) break;
      for (const o of opps) {
        const sid = (o.pipelineStageId as string) ?? (o.stageId as string) ?? "unknown";
        const val = typeof o.monetaryValue === "number" ? (o.monetaryValue as number) : 0;
        const cur = byStage.get(sid) ?? { count: 0, value: 0 };
        cur.count += 1;
        cur.value += val;
        byStage.set(sid, cur);
        openCount += 1;
        openValue += val;
      }
      if (opps.length < 100) break;
    }
  } catch (e) {
    return { ...EMPTY, configured: true, pipeline_name: pipelineName, error: e instanceof Error ? e.message : String(e) };
  }

  // Build per-stage summary, applying name-based weights. Headline open
  // count/value reflect ACTIVE stages only (weight > 0) so dead/lost/won
  // stages don't inflate the pipeline; all stages still appear in the table.
  const stageSummaries: StageSummary[] = [];
  let weightedTotal = 0;
  let activeCount = 0;
  let activeValue = 0;
  stages.forEach((s) => {
    const agg = byStage.get(s.id) ?? { count: 0, value: 0 };
    const weight = overrides[s.id] ?? stageWeight(s.name);
    const weighted = Math.round(agg.value * weight * 100) / 100;
    weightedTotal += weighted;
    if (weight > 0) {
      activeCount += agg.count;
      activeValue += agg.value;
    }
    stageSummaries.push({
      stage_id: s.id,
      stage_name: s.name,
      count: agg.count,
      value: agg.value,
      weight,
      weighted_value: weighted,
    });
  });

  return {
    configured: true,
    pipeline_name: pipelineName,
    open_count: activeCount,
    open_value: Math.round(activeValue * 100) / 100,
    weighted_value: Math.round(weightedTotal * 100) / 100,
    stages: stageSummaries,
  };
}

/** Map of GHL opportunity id -> monetaryValue, across open + won opportunities
 *  for the location. Used to value Dispatch jobs (which carry ghl_opportunity_id
 *  but not the deal value). Best-effort: returns an empty map if GHL is unset. */
export async function fetchOpportunityValueMap(): Promise<Map<string, number>> {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const map = new Map<string, number>();
  if (!apiKey || !locationId) return map;
  for (const status of ["open", "won"]) {
    try {
      for (let page = 1; page <= 5; page++) {
        const body = await ghlFetch(
          `/opportunities/search?location_id=${locationId}&status=${status}&limit=100&page=${page}`,
        );
        const opps = (body.opportunities as Array<Record<string, unknown>>) ?? [];
        if (!opps.length) break;
        for (const o of opps) {
          const id = o.id as string;
          const val = typeof o.monetaryValue === "number" ? (o.monetaryValue as number) : 0;
          if (id && val > 0) map.set(id, val);
        }
        if (opps.length < 100) break;
      }
    } catch {
      /* best-effort */
    }
  }
  return map;
}

export interface ProposalOpp { name: string; value: number; ageDays: number | null; }

/** Open opportunities in the Proposal Sent stage(s), stalest first — the follow-up list. */
export async function getProposals(): Promise<{ proposals: ProposalOpp[]; error?: string }> {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const pipelineId = process.env.GHL_SALES_PIPELINE_ID || process.env.GHL_INSTALL_PIPELINE_ID;
  if (!apiKey || !locationId || !pipelineId) return { proposals: [] };

  const proposalStageIds = new Set<string>();
  try {
    const pipes = await ghlFetch(`/opportunities/pipelines?locationId=${locationId}`);
    const list = (pipes.pipelines as Array<{ id: string; stages?: PipelineStage[] }>) ?? [];
    const target = list.find((p) => p.id === pipelineId) ?? list[0];
    for (const s of target?.stages ?? []) if (/proposal|quote sent/i.test(s.name)) proposalStageIds.add(s.id);
  } catch (e) {
    return { proposals: [], error: e instanceof Error ? e.message : String(e) };
  }
  if (!proposalStageIds.size) return { proposals: [] };

  const out: ProposalOpp[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const body = await ghlFetch(
        `/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=open&limit=100&page=${page}`,
      );
      const opps = (body.opportunities as Array<Record<string, unknown>>) ?? [];
      if (!opps.length) break;
      for (const o of opps) {
        const sid = (o.pipelineStageId as string) ?? (o.stageId as string) ?? "";
        if (!proposalStageIds.has(sid)) continue;
        const value = typeof o.monetaryValue === "number" ? (o.monetaryValue as number) : 0;
        const name = String(o.name ?? o.contactName ?? "Unnamed deal");
        const dateStr = (o.updatedAt as string) ?? (o.lastStatusChangeAt as string) ?? (o.createdAt as string) ?? "";
        let ageDays: number | null = null;
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) ageDays = Math.floor((Date.now() - d.getTime()) / 86400000);
        }
        out.push({ name, value, ageDays });
      }
      if (opps.length < 100) break;
    }
    // Chase score: value weighted by staleness, so big aging deals top and £0 ones sink.
    const chaseScore = (p: ProposalOpp) => (p.value || 0) * (1 + Math.min(p.ageDays ?? 0, 90) / 30);
    out.sort((a, b) => chaseScore(b) - chaseScore(a));
    return { proposals: out };
  } catch (e) {
    return { proposals: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// --- lead quality / pipeline reality -----------------------------------------
// Separates the genuinely-engaged pipeline from never-engaged inbound and
// dead-but-still-open leads — the ones that warp "are we actually growing?".

export type StageClass = "inbound" | "engaged" | "won" | "postsale" | "dead" | "nurture";

/** Classify a stage by lifecycle position from its name. Order matters:
 *  dead / won / post-sale are checked before the broad "engaged" net. */
export function classifyStage(name: string): StageClass {
  const n = (name || "").toLowerCase();
  if (/nurtur/.test(n)) return "nurture";
  if (/lost|dead|unqualified|not proceeding|gone cold|cancel|closed|abandon/.test(n)) return "dead";
  if (/aftercare|service plan|ongoing|install complete|installation complete|handover/.test(n)) return "postsale";
  if (/accepted|install pending|deposit|installation booked|materials ordered|installation in progress|quote accepted|\bwon\b/.test(n)) return "won";
  if (/engaged|survey|proposal|quote sent|quote follow|awaiting quote|callback|\bcontacted/.test(n)) return "engaged";
  if (/new enquiry|uncontacted|new lead|contact attempt|contact attempted|no contact|follow up sent|^contact$/.test(n)) return "inbound";
  return "inbound"; // unknown early stage → treat as inbound (conservative)
}

/** Tidy a GHL opportunity `source` string for display + grouping (collapse
 *  whitespace; empty → "Unknown"). Group on the lowercased result so casing
 *  variants like "Direct approach"/"Direct Approach" don't split. */
export function normalizeSource(raw: unknown): string {
  const s = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  if (!s) return "Unknown";
  // Raw tracking URLs (e.g. portal.reonic.de/resolve?...) collapse to their host
  // so every unique query string doesn't become its own one-off row.
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).hostname.replace(/^www\./, "");
    } catch {
      /* not a parseable URL — fall through */
    }
  }
  return s;
}

export interface SourceStat {
  source: string;   // display label
  total: number;
  engaged: number;  // engaged + won-in-progress
  inbound: number;  // never engaged
  dead: number;     // dead but still open
}

type ClassTally = Record<StageClass, { count: number; value: number }>;
const emptyTally = (): ClassTally => ({
  inbound: { count: 0, value: 0 }, engaged: { count: 0, value: 0 }, won: { count: 0, value: 0 },
  postsale: { count: 0, value: 0 }, dead: { count: 0, value: 0 }, nurture: { count: 0, value: 0 },
});

export interface LeadQuality {
  configured: boolean;
  pipeline_name: string | null;
  open: ClassTally;            // current open pipeline split by lifecycle class
  open_total: number;
  truncated_open: boolean;     // true if open opps exceeded the page cap (count is a floor)
  won: { count: number; value: number };       // all-time decided outcomes
  lost: { count: number; value: number };
  abandoned: { count: number; value: number };
  engaged_count: number;       // genuinely live deals (engaged + accepted/won-in-progress)
  unengaged_count: number;     // inbound, never engaged
  dead_open_count: number;     // dead but still sitting open — the cleanup target
  engaged_share: number | null; // engaged / (engaged + inbound) of the live pipeline
  win_rate: number | null;      // won / (won + lost + abandoned), all-time
  avg_won_value: number | null;
  by_source: SourceStat[];      // open pipeline split by lead source (Meta etc.), busiest first
  error?: string;
}

const oppVal = (o: Record<string, unknown>) => (typeof o.monetaryValue === "number" ? (o.monetaryValue as number) : 0);

async function countStatus(locationId: string, pipelineId: string, status: string): Promise<{ count: number; value: number }> {
  let count = 0, value = 0;
  for (let page = 1; page <= 10; page++) {
    const body = await ghlFetch(`/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=${status}&limit=100&page=${page}`);
    const opps = (body.opportunities as Array<Record<string, unknown>>) ?? [];
    if (!opps.length) break;
    for (const o of opps) { count += 1; value += oppVal(o); }
    if (opps.length < 100) break;
  }
  return { count, value: Math.round(value) };
}

/** Pipeline reality: how much of the "open" pipeline is genuinely engaged vs
 *  never-engaged inbound vs dead-but-open, plus the all-time win rate. Auto-picks
 *  the sales pipeline (GHL_SALES_PIPELINE_ID, else a name match, else the largest). */
export async function fetchLeadQuality(): Promise<LeadQuality> {
  const base: LeadQuality = {
    configured: false, pipeline_name: null, open: emptyTally(), open_total: 0, truncated_open: false,
    won: { count: 0, value: 0 }, lost: { count: 0, value: 0 }, abandoned: { count: 0, value: 0 },
    engaged_count: 0, unengaged_count: 0, dead_open_count: 0,
    engaged_share: null, win_rate: null, avg_won_value: null, by_source: [],
  };
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return base;

  let pipelineId = process.env.GHL_SALES_PIPELINE_ID || process.env.GHL_INSTALL_PIPELINE_ID || "";
  let stageName = new Map<string, string>();
  let pipelineName: string | null = null;
  try {
    const pipes = await ghlFetch(`/opportunities/pipelines?locationId=${locationId}`);
    const list = (pipes.pipelines as Array<{ id: string; name: string; stages?: PipelineStage[] }>) ?? [];
    const target =
      list.find((p) => p.id === pipelineId) ??
      list.find((p) => /sales/i.test(p.name)) ??
      list.slice().sort((a, b) => (b.stages?.length ?? 0) - (a.stages?.length ?? 0))[0] ?? null;
    if (!target) return { ...base, configured: true, error: "no GHL pipeline found" };
    pipelineId = target.id;
    pipelineName = target.name ?? null;
    stageName = new Map((target.stages ?? []).map((s) => [s.id, s.name]));
  } catch (e) {
    return { ...base, configured: true, error: e instanceof Error ? e.message : String(e) };
  }

  const open = emptyTally();
  const sourceMap = new Map<string, SourceStat>();
  let openTotal = 0;
  let truncatedOpen = false;
  try {
    for (let page = 1; page <= 10; page++) {
      const body = await ghlFetch(`/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=open&limit=100&page=${page}`);
      const opps = (body.opportunities as Array<Record<string, unknown>>) ?? [];
      if (!opps.length) break;
      for (const o of opps) {
        const sid = (o.pipelineStageId as string) ?? (o.stageId as string) ?? "";
        const cls = classifyStage(stageName.get(sid) ?? "");
        open[cls].count += 1;
        open[cls].value += oppVal(o);
        openTotal += 1;
        // Per-source breakdown (Meta etc.), grouped case-insensitively.
        const disp = normalizeSource(o.source);
        const skey = disp.toLowerCase();
        let st = sourceMap.get(skey);
        if (!st) { st = { source: disp, total: 0, engaged: 0, inbound: 0, dead: 0 }; sourceMap.set(skey, st); }
        st.total += 1;
        if (cls === "engaged" || cls === "won") st.engaged += 1;
        else if (cls === "inbound") st.inbound += 1;
        else if (cls === "dead") st.dead += 1;
      }
      if (opps.length < 100) break;
      if (page === 10) truncatedOpen = true; // hit the page cap with a full page — more exist
    }

    // Outcome counts are secondary; don't let one failing GHL call discard the open
    // composition (the primary value). If any fails, keep the rest and null win_rate
    // (an incomplete denominator would overstate it) rather than show a wrong number.
    const [wonR, lostR, abdR] = await Promise.allSettled([
      countStatus(locationId, pipelineId, "won"),
      countStatus(locationId, pipelineId, "lost"),
      countStatus(locationId, pipelineId, "abandoned"),
    ]);
    const zero = { count: 0, value: 0 };
    const won = wonR.status === "fulfilled" ? wonR.value : zero;
    const lost = lostR.status === "fulfilled" ? lostR.value : zero;
    const abandoned = abdR.status === "fulfilled" ? abdR.value : zero;
    const outcomesComplete =
      wonR.status === "fulfilled" && lostR.status === "fulfilled" && abdR.status === "fulfilled";

    for (const k of Object.keys(open) as StageClass[]) open[k].value = Math.round(open[k].value);
    const engaged_count = open.engaged.count + open.won.count;
    const unengaged_count = open.inbound.count;
    const dead_open_count = open.dead.count;
    const decided = won.count + lost.count + abandoned.count;
    return {
      configured: true, pipeline_name: pipelineName, open, open_total: openTotal, truncated_open: truncatedOpen,
      won, lost, abandoned,
      engaged_count, unengaged_count, dead_open_count,
      engaged_share: engaged_count + unengaged_count > 0 ? engaged_count / (engaged_count + unengaged_count) : null,
      win_rate: outcomesComplete && decided > 0 ? won.count / decided : null,
      avg_won_value: won.count > 0 ? Math.round(won.value / won.count) : null,
      by_source: [...sourceMap.values()].sort((a, b) => b.total - a.total),
    };
  } catch (e) {
    return { ...base, configured: true, pipeline_name: pipelineName, error: e instanceof Error ? e.message : String(e) };
  }
}
