import Link from "next/link";
import {
  Banknote, TrendingUp, AlertTriangle, Wallet, Gauge, ArrowRight, CircleDot,
  Lightbulb, CheckCircle2, AlertCircle, Info, CalendarClock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { buildPulse } from "@/lib/pulse";
import { buildForecast, forecastInputs } from "@/lib/forecast";
import { getCommittedJobs, fetchScheduledInstalls } from "@/lib/dispatch-jobs";
import { buildInsights, type InsightTone } from "@/lib/insights";
import { getSnapshots, summarizeChange, cashStaleDays, type MetricSnapshot } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

const TONE: Record<InsightTone, { ring: string; chip: string; icon: React.ReactNode }> = {
  action: { ring: "border-l-4 border-accent", chip: "bg-accent/10 text-accent", icon: <Lightbulb size={16} /> },
  watch: { ring: "border-l-4 border-amber-400", chip: "bg-amber-50 text-amber-700", icon: <AlertCircle size={16} /> },
  positive: { ring: "border-l-4 border-emerald-400", chip: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 size={16} /> },
  info: { ring: "border-l-4 border-slate-300", chip: "bg-slate-100 text-slate-600", icon: <Info size={16} /> },
};

function Spark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const pts = series
    .map((v, i) => `${((i / (series.length - 1)) * 88).toFixed(1)},${(25 - ((v - lo) / span) * 23).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 88 26" width="72" height="26" className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function Tile({ label, value, sub, icon, tone = "default", series, deltaText, deltaTone, sparkColor, note }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  series?: number[]; deltaText?: string; deltaTone?: "good" | "bad" | "neutral"; sparkColor?: string;
  note?: string; // amber freshness/caveat line (e.g. cash unchanged for N days)
}) {
  const accent =
    tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-400" : "bg-transparent";
  const valueColor =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-600" : "text-foreground";
  const deltaColor =
    deltaTone === "good" ? "text-emerald-600" : deltaTone === "bad" ? "text-red-600" : "text-muted-foreground";
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</div>
        {series && sparkColor ? <Spark series={series} color={sparkColor} /> : null}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      {deltaText ? <div className={`mt-1 text-xs font-medium ${deltaColor}`}>{deltaText}</div> : null}
      {note ? <div className="mt-1 text-xs font-medium text-amber-600">{note}</div> : null}
    </Card>
  );
}

const SPARK_COLOR = { good: "#1D9E75", bad: "#E24B4A", neutral: "#888780" } as const;

// Build a tile's trend (sparkline series + delta) from the snapshot history.
// Returns {} until there are at least 2 days of history, so tiles render cleanly
// from day one and light up as data accumulates.
function trendFor(
  history: MetricSnapshot[],
  key: keyof MetricSnapshot,
  goodWhen: "up" | "down",
  fmt: (n: number) => string,
): { series?: number[]; deltaText?: string; deltaTone?: "good" | "bad" | "neutral"; sparkColor?: string } {
  const series = history.map((s) => s[key]).filter((v): v is number => typeof v === "number");
  if (series.length < 2) return {};
  const delta = series[series.length - 1] - series[0];
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone: "good" | "bad" | "neutral" = dir === "flat" ? "neutral" : dir === goodWhen ? "good" : "bad";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
  return {
    series,
    deltaText: `${arrow} ${fmt(Math.abs(delta))} since ${history[0].date.slice(5)}`,
    deltaTone: tone,
    sparkColor: SPARK_COLOR[tone],
  };
}

export default async function PulsePage() {
  const pulse = await buildPulse();
  const committed = await getCommittedJobs();
  const installs = await fetchScheduledInstalls();
  const unassignedCount = installs.jobs.filter((j) => /draft/i.test(j.status || "")).length;
  const nextInstall = installs.next_date
    ? new Date(installs.next_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const m = pulse.metrics;
  const xeroLive = pulse.xero.configured;
  const forecast = buildForecast(
    forecastInputs({
      cash: pulse.xero.cash,
      receivables: m.receivables,
      overdue: m.overdue,
    }),
    { committed },
  );
  const insights = buildInsights(pulse, forecast);
  const history = await getSnapshots();
  const change = summarizeChange(history);
  const fmtSince = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  // Cash from Xero only moves on bank reconciliation; a long flat run means the
  // headline figure is the last-reconciled balance, not today's. Flag at 4+ days.
  const cashStale = m.cash != null ? cashStaleDays(history) : null;
  const cashNote = cashStale != null && cashStale >= 4
    ? `⏳ unchanged ${cashStale}d — last reconciled Xero balance`
    : undefined;

  // One-line health verdict from the ranked actions (works without history).
  const concerns = pulse.actions.filter((a) => a.severity !== "info");
  const verdictTone: "good" | "warn" | "bad" =
    concerns.some((a) => a.severity === "critical") ? "bad" : concerns.length ? "warn" : "good";
  const verdictWord = verdictTone === "bad" ? "At risk" : verdictTone === "warn" ? "Watch" : "Healthy";
  const verdictLine = concerns.length
    ? concerns.slice(0, 2).map((a) => a.title).join(" · ")
    : "No thresholds tripped — cash, runway and pipeline are within target.";
  const verdictClr =
    verdictTone === "bad" ? "bg-red-50 text-red-900" : verdictTone === "warn" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900";

  const runwayTone =
    m.runway_months == null ? "default"
    : m.runway_months < pulse.config.low_runway_months / 2 ? "bad"
    : m.runway_months < pulse.config.low_runway_months ? "warn"
    : "good";

  // Active pipeline stages (weight > 0, value > 0) for the funnel.
  const funnel = pulse.pipeline.stages
    .filter((s) => s.weight > 0 && s.value > 0)
    .sort((a, b) => b.value - a.value);
  const maxStage = funnel.reduce((mx, s) => Math.max(mx, s.value), 0) || 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cockpit</h1>
          <p className="text-sm text-muted-foreground">
            {xeroLive
              ? `Live from Xero · ${pulse.xero.tenant_name ?? "EcoSphere energy"} · snapshot ${pulse.xero.snapshot_date ?? "today"}`
              : "Connect Xero to go live"}
            {pulse.pipeline.configured ? ` · pipeline: ${pulse.pipeline.pipeline_name}` : ""}
          </p>
        </div>
        {!xeroLive ? (
          <Link href="/api/auth/xero/connect"
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            Connect Xero <ArrowRight size={15} />
          </Link>
        ) : null}
      </div>

      {/* Business-health verdict */}
      <div className={`mb-6 flex items-start gap-3 rounded-lg px-4 py-3 ${verdictClr}`}>
        {verdictTone === "good"
          ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
        <div>
          <div className="text-sm font-semibold">{verdictWord}</div>
          <div className="text-sm">{verdictLine}.</div>
        </div>
      </div>

      {/* What changed — week-over-week movement from the snapshot history */}
      {change ? (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-white px-4 py-3">
          <span className="text-sm font-semibold">What changed</span>
          <span className="text-xs text-muted-foreground">since {fmtSince(change.sinceDate)} · {change.days}d</span>
          {change.lines.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {change.lines.map((l) => (
                <span
                  key={l.label}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                    l.tone === "good" ? "bg-emerald-50 text-emerald-700" : l.tone === "bad" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {l.label} {l.deltaText}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Steady — no material moves.</span>
          )}
        </div>
      ) : null}

      {/* This week — top actions */}
      {(m.overdue && m.overdue > 0) || unassignedCount > 0 ? (
        <Link href="/pulse/focus" className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 hover:bg-accent/10">
          <span className="text-sm">
            <span className="font-semibold text-accent">This week:</span>{" "}
            {m.overdue && m.overdue > 0 ? `chase ${gbp(m.overdue)} overdue` : ""}
            {m.overdue && m.overdue > 0 && unassignedCount > 0 ? " · " : ""}
            {unassignedCount > 0 ? `assign a sub to ${unassignedCount} booking${unassignedCount === 1 ? "" : "s"}` : ""}
          </span>
          <ArrowRight size={16} className="shrink-0 text-accent" />
        </Link>
      ) : null}

      {/* Insights / advisor */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb size={18} className="text-accent" />
          <h2 className="text-base font-semibold">What this means &amp; what to do</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.map((ins, i) => (
            <div key={i} className={`rounded-md bg-[hsl(210_40%_98%)] p-3 ${TONE[ins.tone].ring}`} style={{ borderRadius: 0 }}>
              <div className="flex items-center gap-2">
                <span className={`flex h-5 w-5 items-center justify-center rounded ${TONE[ins.tone].chip}`}>{TONE[ins.tone].icon}</span>
                <span className="text-sm font-semibold">{ins.title}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{ins.body}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Cash on hand" value={gbp(m.cash)}
          sub={m.available_liquidity != null ? `${gbp(m.available_liquidity)} incl. facility headroom` : undefined}
          icon={<Banknote size={18} />} note={cashNote} {...trendFor(history, "cash", "up", gbp)} />
        <Tile label="Runway" value={m.runway_months != null ? `${m.runway_months} mo` : "—"}
          sub={`at ${gbp(m.overheads_used)}/mo overheads${m.runway_is_estimate ? " · est." : ""}`}
          icon={<Gauge size={18} />} tone={runwayTone}
          {...trendFor(history, "runway_months", "up", (n) => `${n.toFixed(1)} mo`)} />
        <Tile label="Overdue to chase" value={gbp(m.overdue)}
          sub={m.receivables != null ? `of ${gbp(m.receivables)} owed to you` : undefined}
          icon={<AlertTriangle size={18} />} tone={m.overdue && m.overdue > 0 ? "warn" : "good"}
          {...trendFor(history, "overdue", "down", gbp)} />
        <Tile label="Working capital" value={gbp(m.working_capital)}
          sub="current assets − current liabilities"
          icon={<Wallet size={18} />} tone={m.working_capital != null && m.working_capital < 0 ? "bad" : "default"}
          {...trendFor(history, "working_capital", "up", gbp)} />
        <Tile label="Weighted pipeline"
          value={pulse.pipeline.configured ? gbp(pulse.pipeline.weighted_value) : "—"}
          sub={pulse.pipeline.configured ? `${pulse.pipeline.open_count} active · ${gbp(pulse.pipeline.open_value)} raw` : "connect a sales pipeline"}
          icon={<TrendingUp size={18} />} tone="good"
          {...trendFor(history, "weighted_pipeline", "up", gbp)} />
        <Tile label="Net equity" value={gbp(m.net_equity)}
          sub="total assets − total liabilities" icon={<CircleDot size={18} />}
          {...trendFor(history, "net_equity", "up", gbp)} />
        <Tile label="Accepted jobs"
          value={installs.jobs.length ? gbp(installs.total_value) : "—"}
          sub={installs.jobs.length ? `${installs.jobs.length} accepted · next ${nextInstall ?? "TBC"}` : "none in Dispatch yet"}
          icon={<CalendarClock size={18} />} tone={installs.jobs.length ? "good" : "default"}
          {...trendFor(history, "booked_value", "up", gbp)} />
      </div>

      {/* Sales funnel */}
      {funnel.length > 0 ? (
        <Card className="mt-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Sales funnel · active pipeline</h2>
            <span className="text-sm text-muted-foreground">Weighted {gbp(pulse.pipeline.weighted_value)}</span>
          </div>
          <div className="space-y-2.5">
            {funnel.map((s) => (
              <div key={s.stage_id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 truncate text-sm" title={s.stage_name}>{s.stage_name}</div>
                <div className="relative h-7 flex-1 rounded bg-[hsl(210_40%_96%)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-accent/80"
                    style={{ width: `${Math.max((s.value / maxStage) * 100, 2)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-medium">
                    <span>{s.count} deals</span>
                    <span>{gbp(s.value)} · {Math.round(s.weight * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Generated {new Date(pulse.generated_at).toLocaleString("en-GB")}. Read-only — Pulse never moves money.
      </p>
    </div>
  );
}
