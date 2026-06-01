// ---------------------------------------------------------------------------
// Xero client — the cash side of Pulse.
//
// Mirrors the GHL pattern in ghl-opps.ts: a single server-side fetch helper
// that returns a `configured` flag instead of throwing, so the cockpit and the
// alert cron both degrade gracefully when Xero isn't connected yet.
//
// Auth model (OAuth2, server-side only):
//   * Tokens live in the single-row `xero_connection` table (service-role).
//   * The refresh token is ROTATED by Xero on every refresh — we always persist
//     the new one or the connection dies.
//   * Access tokens last ~30 min; we cache and reuse until they near expiry.
//
// Data pulled (Accounting API):
//   * Reports/BalanceSheet  -> cash, current assets/liabilities, net equity
//   * Invoices (ACCREC)     -> receivables + overdue (DueDate < today)
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase";

const TOKEN_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com/api.xro/2.0";

export interface XeroSnapshot {
  configured: boolean;          // false when no connection / env — UI shows "connect Xero"
  cash: number | null;          // total bank balance
  receivables: number | null;   // outstanding ACCREC AmountDue
  overdue: number | null;       // subset of receivables past DueDate
  working_capital: number | null; // current assets - current liabilities
  net_equity: number | null;    // total equity / net assets
  snapshot_date: string | null; // ISO date the figures represent
  tenant_name: string | null;
  error?: string;
}

type ConnRow = {
  tenant_id: string | null;
  tenant_name: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_expires_at: string | null;
};

const EMPTY: XeroSnapshot = {
  configured: false,
  cash: null,
  receivables: null,
  overdue: null,
  working_capital: null,
  net_equity: null,
  snapshot_date: null,
  tenant_name: null,
};

// --- token handling --------------------------------------------------------

/** Get a valid access token + tenant id, refreshing (and persisting) if stale. */
async function getAuth(): Promise<
  { ok: true; accessToken: string; tenantId: string; tenantName: string | null } | { ok: false; error?: string }
> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false };

  const admin = createAdminClient();
  // Read with a short retry: at cold start the first Supabase call in a
  // concurrent batch can come back empty, which would wrongly look like
  // "not connected".
  let conn: ConnRow | null = null;
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from("xero_connection")
      .select("tenant_id, tenant_name, refresh_token, access_token, access_expires_at")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      conn = data as ConnRow;
      break;
    }
    lastErr = error?.message ?? null;
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!conn?.refresh_token || !conn.tenant_id) {
    return { ok: false, error: lastErr ?? "no Xero connection stored" };
  }

  // Reuse a still-fresh access token (60s safety margin).
  if (
    conn.access_token &&
    conn.access_expires_at &&
    new Date(conn.access_expires_at).getTime() - Date.now() > 60_000
  ) {
    return { ok: true, accessToken: conn.access_token, tenantId: conn.tenant_id, tenantName: conn.tenant_name };
  }

  // Refresh — Xero rotates the refresh token, so persist whatever comes back.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let body: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
      }),
      cache: "no-store",
    });
    body = await res.json();
    if (!res.ok || !body.access_token) {
      return { ok: false, error: `Xero token refresh failed: ${body.error ?? res.status}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const expiresAt = new Date(Date.now() + (body.expires_in ?? 1800) * 1000).toISOString();
  await admin
    .from("xero_connection")
    .update({
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? conn.refresh_token,
      access_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  return { ok: true, accessToken: body.access_token, tenantId: conn.tenant_id, tenantName: conn.tenant_name };
}

async function xeroGet(path: string, accessToken: string, tenantId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero ${res.status} on ${path}: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// --- report parsing --------------------------------------------------------
// Balance Sheet comes back as nested Sections -> Rows -> Cells. We walk every
// row and index it by the (lowercased) title in its first cell, taking the
// last numeric cell as the value (the "current period" column).

type Cell = { Value?: unknown };
type ReportRow = { RowType?: string; Title?: string; Cells?: Cell[]; Rows?: ReportRow[] };

function indexRows(rows: ReportRow[] | undefined, out: Map<string, number>) {
  for (const r of rows ?? []) {
    if (r.Cells && r.Cells.length) {
      const title = String(r.Cells[0]?.Value ?? r.Title ?? "").trim().toLowerCase();
      if (title) {
        for (let i = r.Cells.length - 1; i >= 1; i--) {
          const v = Number(r.Cells[i]?.Value);
          if (!Number.isNaN(v) && r.Cells[i]?.Value !== "" && r.Cells[i]?.Value != null) {
            out.set(title, v);
            break;
          }
        }
      }
    }
    if (r.Rows) indexRows(r.Rows, out);
  }
}

/** First matching value for any of the candidate row titles (case-insensitive, substring). */
function pick(idx: Map<string, number>, candidates: string[]): number | null {
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (idx.has(key)) return idx.get(key)!;
  }
  for (const c of candidates) {
    const needle = c.toLowerCase();
    for (const [k, v] of Array.from(idx.entries())) if (k.includes(needle)) return v;
  }
  return null;
}

// --- public entry point ----------------------------------------------------

export async function getXeroSnapshot(): Promise<XeroSnapshot> {
  const auth = await getAuth();
  if (!auth.ok) return { ...EMPTY, error: auth.error };

  const today = new Date().toISOString().slice(0, 10);
  try {
    // Receivables + overdue come from each contact's AR balance. This works
    // with the accounting.contacts.read scope. Cash, working capital and net
    // equity need the Balance Sheet report (accounting.reports.read), which
    // this Xero app is not yet entitled to — left null until that's granted.
    let receivables = 0;
    let overdue = 0;
    for (let page = 1; page <= 20; page++) {
      const body = await xeroGet(`/Contacts?page=${page}`, auth.accessToken, auth.tenantId);
      const contacts = (body.Contacts as Array<Record<string, unknown>> | undefined) ?? [];
      if (!contacts.length) break;
      for (const c of contacts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ar = (c as any)?.Balances?.AccountsReceivable;
        if (ar) {
          receivables += Number(ar.Outstanding) || 0;
          overdue += Number(ar.Overdue) || 0;
        }
      }
      if (contacts.length < 100) break;
    }

    return {
      configured: true,
      cash: null,
      receivables: Math.round(receivables * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      working_capital: null,
      net_equity: null,
      snapshot_date: today,
      tenant_name: auth.tenantName,
    };
  } catch (e) {
    return {
      ...EMPTY,
      configured: true,
      tenant_name: auth.tenantName,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Xero dates arrive as ISO ("2026-05-31T00:00:00") or "/Date(1717113600000+0000)/". */
function parseXeroDate(v: string | undefined): string | null {
  if (!v) return null;
  const m = /\/Date\((\d+)/.exec(v);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
