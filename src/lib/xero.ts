import type { CashPosition } from "./types";
import { supabaseServiceOptional } from "./supabase";

// Xero OAuth2 + report reads for EcoSphere Pulse. See docs/HANDOVER.md §3/§5.
//
// Pulse keeps its OWN rotating refresh token in `pulse_xero_connection` (a Pulse-owned
// single-row table, service-role only), deliberately separate from Dispatch's
// `xero_connection` so Pulse refreshing its single-use token never invalidates Dispatch's.
// Initial token is minted via the /api/xero/connect → /api/xero/callback consent flow.

const TOKEN_URL = "https://identity.xero.com/connect/token";
const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API = "https://api.xero.com/api.xro/2.0";
// Granular scopes (required for Xero apps created on/after 2 Mar 2026 — the old broad
// accounting.reports.read / accounting.transactions.read no longer exist for new apps).
const SCOPES =
  "offline_access accounting.reports.balancesheet.read accounting.invoices.read accounting.contacts.read";

interface ConnRow {
  tenant_id: string | null;
  tenant_name: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_expires_at: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ---- env helpers ----
function clientId(): string {
  return process.env.XERO_CLIENT_ID ?? "";
}
function basicAuth(): string {
  const creds = `${clientId()}:${process.env.XERO_CLIENT_SECRET ?? ""}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}
function redirectUri(): string {
  return process.env.XERO_REDIRECT_URI ?? "";
}

// ---- token store (pulse_xero_connection, single row id=true) ----
async function readConn(): Promise<ConnRow | null> {
  const supabase = supabaseServiceOptional();
  if (!supabase) return null;
  const { data } = await supabase
    .from("pulse_xero_connection")
    .select("tenant_id, tenant_name, refresh_token, access_token, access_expires_at")
    .eq("id", true)
    .maybeSingle();
  return (data as ConnRow | null) ?? null;
}

async function saveTokens(t: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  tenant_id?: string;
  tenant_name?: string;
}): Promise<void> {
  const supabase = supabaseServiceOptional();
  if (!supabase) return;
  const nowMs = Date.now();
  // 60s safety margin so we refresh slightly before Xero actually expires the token.
  const expiresAt = new Date(nowMs + (t.expires_in - 60) * 1000).toISOString();
  const row: Record<string, unknown> = {
    id: true,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    access_expires_at: expiresAt,
    updated_at: new Date(nowMs).toISOString(),
  };
  if (t.tenant_id) {
    row.tenant_id = t.tenant_id;
    row.tenant_name = t.tenant_name ?? null;
    row.connected_at = new Date(nowMs).toISOString();
  }
  await supabase.from("pulse_xero_connection").upsert(row, { onConflict: "id" });
}

// ---- OAuth consent flow (used by the connect/callback routes) ----
export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function isConfigured(): boolean {
  return Boolean(clientId() && process.env.XERO_CLIENT_SECRET && redirectUri());
}

async function discoverTenant(
  accessToken: string,
): Promise<{ tenantId: string; tenantName: string }> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const conns = (await res.json()) as Array<{ tenantId?: string; tenantName?: string }>;
  const wanted = process.env.XERO_TENANT_ID;
  const chosen = (wanted ? conns.find((c) => c.tenantId === wanted) : conns[0]) ?? conns[0];
  return { tenantId: chosen?.tenantId ?? "", tenantName: chosen?.tenantName ?? "" };
}

// Exchanges the consent `code` for tokens, discovers the tenant, and persists.
export async function exchangeCodeForToken(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Xero token exchange failed: ${res.status} ${await res.text()}`);
  const tok = (await res.json()) as TokenResponse;
  const { tenantId, tenantName } = await discoverTenant(tok.access_token);
  await saveTokens({ ...tok, tenant_id: tenantId, tenant_name: tenantName });
}

// In-memory singleflight: collapse concurrent refreshes within one server instance so a
// single page load (many Xero reads) rotates the single-use refresh token only once.
let refreshInFlight: Promise<{ token: string; tenantId: string } | null> | null = null;

async function refresh(conn: ConnRow): Promise<{ token: string; tenantId: string } | null> {
  if (!conn.refresh_token) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as TokenResponse;
  await saveTokens(tok);
  return { token: tok.access_token, tenantId: conn.tenant_id ?? "" };
}

// Returns a valid access token (refreshing if needed), or null if Pulse isn't connected.
async function getAccessToken(): Promise<{ token: string; tenantId: string } | null> {
  const conn = await readConn();
  if (!conn || !conn.refresh_token) return null;
  if (
    conn.access_token &&
    conn.access_expires_at &&
    new Date(conn.access_expires_at).getTime() > Date.now()
  ) {
    return { token: conn.access_token, tenantId: conn.tenant_id ?? "" };
  }
  if (!refreshInFlight) {
    refreshInFlight = refresh(conn).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function xeroGet<T>(path: string): Promise<T | null> {
  const auth = await getAccessToken();
  if (!auth) return null;
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Xero-tenant-id": auth.tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// ---- report reads ----
interface ReportCell {
  Value?: string;
}
interface ReportRow {
  RowType?: string;
  Cells?: ReportCell[];
  Rows?: ReportRow[];
}
interface ReportsResponse {
  Reports?: Array<{ Rows?: ReportRow[] }>;
}

// Flattens a Xero report's nested rows into a { label -> number } map (last value wins).
function flattenReport(rows: ReportRow[] | undefined, out: Record<string, number>): void {
  for (const row of rows ?? []) {
    const cells = row.Cells ?? [];
    const label = cells[0]?.Value?.trim();
    const raw = cells[1]?.Value;
    if (label && raw != null && raw !== "") {
      const num = Number(raw);
      if (!Number.isNaN(num)) out[label] = num;
    }
    if (row.Rows?.length) flattenReport(row.Rows, out);
  }
}

// Balance-sheet line index { label -> number }. Used by getCashPosition and liabilities.ts.
export async function getBalanceSheetIndex(): Promise<{
  lines: Record<string, number>;
  error?: string;
}> {
  const json = await xeroGet<ReportsResponse>("/Reports/BalanceSheet");
  if (!json) return { lines: {}, error: "Xero not connected" };
  const lines: Record<string, number> = {};
  flattenReport(json.Reports?.[0]?.Rows, lines);
  return { lines };
}

// First matching label (case/space-insensitive), else 0.
function pick(lines: Record<string, number>, ...candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const map = new Map(Object.entries(lines).map(([k, v]) => [norm(k), v]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit != null) return hit;
  }
  return 0;
}

export async function getCashPosition(): Promise<CashPosition> {
  const { lines, error } = await getBalanceSheetIndex();
  if (error) return { cashBalance: 0, receivables: 0, overdue: 0, workingCapital: 0, netEquity: 0 };

  // Cash = ledger bank total. NOTE: if a bank account is unreconciled in Xero this
  // lags the real bank-feed balance — reconcile in Xero rather than patching here.
  const cashBalance = pick(lines, "Total Bank", "Total Cash", "Cash and Cash Equivalents");
  // Receivables = trade AR + CIS Asset (CIS tax owed back by HMRC), matching §8.
  const receivables =
    pick(lines, "Accounts Receivable", "Total Accounts Receivable", "Trade Debtors") +
    pick(lines, "CIS Asset");
  const currentAssets = pick(lines, "Total Current Assets");
  // Xero reports liabilities as negative; use the magnitude so WC = assets − liabilities.
  const currentLiabilities = Math.abs(pick(lines, "Total Current Liabilities"));
  const netEquity = pick(lines, "Total Equity", "Net Assets");

  const overdueContacts = await getOverdueContacts();
  const overdue = overdueContacts.reduce((sum, c) => sum + c.amount, 0);

  return {
    cashBalance,
    receivables,
    overdue,
    workingCapital: currentAssets - currentLiabilities,
    netEquity,
  };
}

interface Invoice {
  AmountDue?: number;
  DueDate?: string; // "/Date(1700000000000+0000)/"
  Contact?: { Name?: string };
}
interface InvoicesResponse {
  Invoices?: Invoice[];
}

// Parse Xero's "/Date(ms+0000)/" wire format to epoch ms.
function parseXeroDate(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/\/Date\((\d+)/);
  return m ? Number(m[1]) : null;
}

// Per-contact overdue AR balances (authorised, past due date), largest first.
export async function getOverdueContacts(): Promise<Array<{ name: string; amount: number }>> {
  const now = Date.now();
  const byContact = new Map<string, number>();
  // Authorised ACCREC invoices; paginate defensively.
  for (let page = 1; page <= 10; page++) {
    const json = await xeroGet<InvoicesResponse>(
      `/Invoices?where=${encodeURIComponent('Type=="ACCREC" AND Status=="AUTHORISED"')}&page=${page}`,
    );
    const invoices = json?.Invoices ?? [];
    if (invoices.length === 0) break;
    for (const inv of invoices) {
      const amount = inv.AmountDue ?? 0;
      const due = parseXeroDate(inv.DueDate);
      if (amount > 0 && due != null && due < now) {
        const name = inv.Contact?.Name ?? "Unknown";
        byContact.set(name, (byContact.get(name) ?? 0) + amount);
      }
    }
    if (invoices.length < 100) break; // Xero page size is 100
  }
  return [...byContact.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}
