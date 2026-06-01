import Link from "next/link";
import {
  Banknote, TrendingUp, AlertTriangle, Wallet, Gauge, ArrowRight, CircleDot,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { buildPulse, type PulseAction } from "@/lib/pulse";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<PulseAction["severity"], string> = {
  critical: "border-l-4 border-red-500 bg-red-50",
  warning: "border-l-4 border-amber-500 bg-amber-50",
  info: "border-l-4 border-slate-300 bg-slate-50",
};

function Tile({ label, value, sub, icon, tone = "default" }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "bad" ? "text-red-600"
    : "text-foreground";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

export default async function PulsePage() {
  const pulse = await buildPulse();
  const m = pulse.metrics;
  const xeroLive = pulse.xero.configured;
  const runwayTone =
    m.runway_months == null ? "default"
    : m.runway_months < pulse.config.low_runway_months / 2 ? "bad"
    : m.runway_months < pulse.config.low_runway_months ? "warn"
    : "good";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">EcoSphere Pulse</h1>
          <p className="text-sm text-muted-foreground">
            {xeroLive
              ? `Live from Xero · ${pulse.xero.tenant_name ?? "EcoSphere energy"} · snapshot ${pulse.xero.snapshot_date ?? "today"}`
              : "Connect Xero to go live"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!xeroLive ? (
            <Link href="/api/auth/xero/connect"
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
              Connect Xero <ArrowRight size={15} />
            </Link>
          ) : null}
          <Link href="/pulse/forecast"
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            Forecast
          </Link>
          <Link href="/pulse/settings"
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Cash on hand" value={gbp(m.cash)}
          sub={m.available_liquidity != null ? `${gbp(m.available_liquidity)} incl. facility headroom` : undefined}
          icon={<Banknote size={18} />} />
        <Tile label="Runway" value={m.runway_months != null ? `${m.runway_months} mo` : "—"}
          sub={pulse.config.monthly_overheads > 0 ? `at ${gbp(pulse.config.monthly_overheads)}/mo overheads` : "set overheads in Settings"}
          icon={<Gauge size={18} />} tone={runwayTone} />
        <Tile label="Overdue to chase" value={gbp(m.overdue)}
          sub={m.receivables != null ? `of ${gbp(m.receivables)} owed to you` : undefined}
          icon={<AlertTriangle size={18} />} tone={m.overdue && m.overdue > 0 ? "warn" : "good"} />
        <Tile label="Working capital" value={gbp(m.working_capital)}
          sub="current assets − current liabilities"
          icon={<Wallet size={18} />} tone={m.working_capital != null && m.working_capital < 0 ? "bad" : "default"} />
        <Tile label="Weighted pipeline"
          value={pulse.pipeline.configured ? gbp(pulse.pipeline.weighted_value) : "—"}
          sub={pulse.pipeline.configured ? `${pulse.pipeline.open_count} open · ${gbp(pulse.pipeline.open_value)} raw` : "connect a sales pipeline"}
          icon={<TrendingUp size={18} />} />
        <Tile label="Net equity" value={gbp(m.net_equity)}
          sub="total assets − total liabilities" icon={<CircleDot size={18} />} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-base font-semibold">What needs attention</h2>
        <ul className="space-y-2">
          {pulse.actions.map((a, i) => (
            <li key={i} className={`rounded-md p-3 ${SEVERITY_STYLE[a.severity]}`}>
              <div className="text-sm font-semibold">{a.title}</div>
              <div className="text-sm text-muted-foreground">{a.detail}</div>
            </li>
          ))}
        </ul>
      </Card>

      {pulse.pipeline.configured && pulse.pipeline.stages.length > 0 ? (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 text-base font-semibold">
            Pipeline by stage {pulse.pipeline.pipeline_name ? `· ${pulse.pipeline.pipeline_name}` : ""}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Stage</th>
                  <th className="py-1 pr-4 font-medium">Deals</th>
                  <th className="py-1 pr-4 font-medium">Value</th>
                  <th className="py-1 pr-4 font-medium">Weight</th>
                  <th className="py-1 font-medium">Weighted</th>
                </tr>
              </thead>
              <tbody>
                {pulse.pipeline.stages.map((s) => (
                  <tr key={s.stage_id} className="border-t border-border">
                    <td className="py-1.5 pr-4">{s.stage_name}</td>
                    <td className="py-1.5 pr-4">{s.count}</td>
                    <td className="py-1.5 pr-4">{gbp(s.value)}</td>
                    <td className="py-1.5 pr-4">{Math.round(s.weight * 100)}%</td>
                    <td className="py-1.5">{gbp(s.weighted_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Generated {new Date(pulse.generated_at).toLocaleString("en-GB")}. Read-only — Pulse never moves money.
      </p>
    </div>
  );
}
