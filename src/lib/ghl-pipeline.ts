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

/** Default weight ladder by stage index across the pipeline (0 = first stage). */
function defaultWeight(index: number, total: number): number {
  if (total <= 1) return 0.5;
  // Linear 0.2 -> 0.9 across the stages; tune via GHL_STAGE_WEIGHTS.
  return Math.round((0.2 + (0.7 * index) / (total - 1)) * 100) / 100;
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

  // Build per-stage summary in pipeline order, applying weights.
  const stageSummaries: StageSummary[] = [];
  let weightedTotal = 0;
  const total = stages.length || byStage.size;
  stages.forEach((s, i) => {
    const agg = byStage.get(s.id) ?? { count: 0, value: 0 };
    const weight = overrides[s.id] ?? defaultWeight(i, total);
    const weighted = Math.round(agg.value * weight * 100) / 100;
    weightedTotal += weighted;
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
    open_count: openCount,
    open_value: Math.round(openValue * 100) / 100,
    weighted_value: Math.round(weightedTotal * 100) / 100,
    stages: stageSummaries,
  };
}
