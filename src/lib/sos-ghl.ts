// ---------------------------------------------------------------------------
// GHL candidates for the commission ledger. Best-effort read of WON GHL
// opportunities to pre-fill a new deal (customer, value, source, GHL id) — the
// "auto" side of the GHL-sync + manual-gaps approach. Same fetch conventions as
// ghl-pipeline.ts (Bearer key + Version header, `configured` flag, never throws).
//
// NOTE: a GHL "won" opportunity is NOT the contractual Closed Transaction — that
// needs a first-payment date (§3.2), which GHL doesn't hold. So these are only
// seeds; the commission-critical fields stay manual.
// ---------------------------------------------------------------------------

const GHL_BASE = "https://services.leadconnectorhq.com";

export interface SosGhlCandidate {
  ghl_opportunity_id: string;
  customer_name: string;
  value: number;          // GHL monetaryValue — a TDV starting point, not the final TDV
  source: string | null;
  won_date: string | null; // YYYY-MM-DD, best-effort
}

const isoDay = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export async function fetchSosGhlCandidates(): Promise<{ configured: boolean; candidates: SosGhlCandidate[]; error?: string }> {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return { configured: false, candidates: [] };

  const out: SosGhlCandidate[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&status=won&limit=100&page=${page}`,
        { headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28", Accept: "application/json" }, cache: "no-store" },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { configured: true, candidates: out, error: `GHL ${res.status}: ${t.slice(0, 120)}` };
      }
      const body = (await res.json()) as { opportunities?: Array<Record<string, unknown>> };
      const opps = body.opportunities ?? [];
      if (!opps.length) break;
      for (const o of opps) {
        out.push({
          ghl_opportunity_id: String(o.id ?? ""),
          customer_name: String(o.name ?? o.contactName ?? "Unknown"),
          value: typeof o.monetaryValue === "number" ? o.monetaryValue : 0,
          source: typeof o.source === "string" ? o.source : null,
          won_date: isoDay(o.lastStatusChangeAt) ?? isoDay(o.updatedAt) ?? isoDay(o.dateUpdated),
        });
      }
      if (opps.length < 100) break;
    }
    out.sort((a, b) => (a.won_date ?? "") < (b.won_date ?? "") ? 1 : -1);
    return { configured: true, candidates: out };
  } catch (e) {
    return { configured: true, candidates: out, error: e instanceof Error ? e.message : String(e) };
  }
}
