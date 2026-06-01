import Link from "next/link";
import {
  Banknote, TrendingUp, AlertTriangle, Wallet, Gauge, ArrowRight, CircleDot,
  Lightbulb, CheckCircle2, AlertCircle, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { buildPulse } from "@/lib/pulse";
import { buildForecast, forecastInputs } from "@/lib/forecast";
import { buildInsights, type InsightTone } from "@/lib/insights";

export const dynamic = "force-dynamic";

const TONE: Record<InsightTone, { ring: string; chip: string; icon: React.ReactNode }> = {
  action: { ring: "border-l-4 border-accent", chip: "bg-accent/10 text-accent", icon: <Lightbulb size={16} /> },
  watch: { ring: "border-l-4 border-amber-400", chip: "bg-amber-50 text-amber-700", icon: <AlertCircle size={16} /> },
  positive: { ring: "border-l-4 border-emerald-400", chip: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 size={16} /> },
  info: { ring: "border-l-4 border-slate-300", chip: "bg-slate-100 text-slate-600", icon: <Info size={16} /> },
};

function Tile({ label, value, sub, icon, tone = "default" }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const accent =
    tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-400" : "bg-transparent";
  const valueColor =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${valueColor}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

export default async function PulsePage() {
  const pulse = await buildPulse();
  const m = pulse.metrics;
  const xeroLive = pulse.xero.configured;
  const forecast = buildForecast(
    forecastInputs({
      cash: pulse.xero.cash,
      receivables: m.receivables,
      overdue: m.overdue,
    }),
  );
  const insights = buildInsights(pulse, forecast);

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
          icon={<Banknote size={18} />} />
        <Tile label="Runway" value={m.runway_months != null ? `${m.runway_months} mo` : "—"}
          sub={`at ${gbp(m.overheads_used)}/mo overheads${m.runway_is_estimate ? " · est." : ""}`}
          icon={<Gauge size={18} />} tone={runwayTone} />
        <Tile label="Overdue to chase" value={gbp(m.overdue)}
          sub={m.receivables != null ? `of ${gbp(m.receivables)} owed to you` : undefined}
          icon={<AlertTriangle size={18} />} tone={m.overdue && m.overdue > 0 ? "warn" : "good"} />
        <Tile label="Working capital" value={gbp(m.working_capital)}
          sub="current assets − current liabilities"
          icon={<Wallet size={18} />} tone={m.working_capital != null && m.working_capital < 0 ? "bad" : "default"} />
        <Tile label="Weighted pipeline"
          value={pulse.pipeline.configured ? gbp(pulse.pipeline.weighted_value) : "—"}
          sub={pulse.pipeline.configured ? `${pulse.pipeline.open_count} active · ${gbp(pulse.pipeline.open_value)} raw` : "connect a sales pipeline"}
          icon={<TrendingUp size={18} />} tone="good" />
        <Tile label="Net equity" value={gbp(m.net_equity)}
          sub="total assets − total liabilities" icon={<CircleDot size={18} />} />
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
