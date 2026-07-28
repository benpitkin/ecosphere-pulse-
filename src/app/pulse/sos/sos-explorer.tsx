"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import {
  computeSosBreakeven,
  SOS_PRESETS,
  type SosBreakevenInputs,
} from "@/lib/sos-breakeven";

// Canonical EcoSphere brand palette (per the foundational context).
const TEAL = "#1B7A6E";
const AMBER = "#F5B83D";
const LOSS = "#D0503C";
const MUTED = "#5f7373";
const GRID = "#e7eceb";

const gbpk = (n: number) =>
  Math.abs(n) >= 1000 ? `${n < 0 ? "−" : ""}£${(Math.abs(n) / 1000).toFixed(1)}k` : `£${Math.round(n)}`;

// Collapse a preset's lead→quote / quote→sale into a single overall close rate so
// the modeller can drive everything from one slider (matches breakeven.html).
function toUi(p: SosBreakevenInputs): SosBreakevenInputs {
  const cr = p.leadToQuote != null && p.quoteToSale != null ? p.leadToQuote * p.quoteToSale : p.closeRate;
  return { ...p, closeRate: cr, leadToQuote: undefined, quoteToSale: undefined };
}

function Field({
  label, value, onChange, step = 1, prefix, suffix, hint,
}: {
  label: string; value: number; onChange: (n: number) => void;
  step?: number; prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 focus-within:border-accent">
        {prefix ? <span className="text-xs text-muted-foreground">{prefix}</span> : null}
        <input
          type="number" value={value} step={step}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full bg-transparent text-sm outline-none"
        />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export default function SosExplorer() {
  const [inp, setInp] = useState<SosBreakevenInputs>(toUi(SOS_PRESETS.real.inputs));
  const [activePreset, setActivePreset] = useState<keyof typeof SOS_PRESETS | null>("real");
  const [referral, setReferral] = useState(false);

  const set = <K extends keyof SosBreakevenInputs>(k: K, v: SosBreakevenInputs[K]) => {
    setInp((s) => ({ ...s, [k]: v }));
    setActivePreset(null); // manual edit clears the preset highlight
  };
  const applyPreset = (key: keyof typeof SOS_PRESETS) => {
    setInp(toUi(SOS_PRESETS[key].inputs));
    setActivePreset(key);
  };

  const effInp: SosBreakevenInputs = useMemo(
    () => ({
      ...inp,
      referralUpliftPct: referral ? 0.2 : 0,
      overspillUpliftPct: referral ? 0.2 : 0,
    }),
    [inp, referral],
  );
  const r = useMemo(() => computeSosBreakeven(effInp), [effInp]);

  const net = (n: number) => n * r.profitPerJob - r.fixedCostMo;
  const landNet = r.netProfitMo;
  const safety = r.breakEvenJobs > 0 && isFinite(r.breakEvenJobs) ? r.jobsPerMo / r.breakEvenJobs : Infinity;
  const profitable = landNet >= 0;

  // ---- chart geometry (net profit vs jobs/month) ----
  const W = 720, H = 360, m = { l: 64, r: 20, t: 20, b: 44 };
  const maxN = Math.max(10, Math.ceil(Math.max(r.jobsPerMo, 7, isFinite(r.breakEvenJobs) ? r.breakEvenJobs : 0) + 2));
  const ys: number[] = [];
  for (let n = 0; n <= maxN; n++) ys.push(net(n));
  const yMax = Math.max(...ys, 1000);
  const yMin = Math.min(...ys, -r.fixedCostMo);
  const span = yMax - yMin || 1;
  const x = (n: number) => m.l + (n / maxN) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - yMin) / span) * (H - m.t - m.b);
  const zeroY = y(0);
  const pts = ys.map((v, n) => `${x(n)},${y(v)}`).join(" ");
  const beX = isFinite(r.breakEvenJobs) ? x(Math.min(r.breakEvenJobs, maxN)) : x(maxN);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Solar on Steroids · break-even & ROI</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        How many jobs a month the engagement needs to pay for itself. Pick a scenario or edit any figure. All figures ex-VAT (reclaimable).
      </p>

      {/* Preset scenarios */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(SOS_PRESETS) as (keyof typeof SOS_PRESETS)[]).map((k) => (
          <button
            key={k}
            onClick={() => applyPreset(k)}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            style={
              activePreset === k
                ? { borderColor: TEAL, backgroundColor: `${TEAL}14`, color: TEAL }
                : { borderColor: "hsl(214 32% 91%)", color: MUTED }
            }
          >
            {SOS_PRESETS[k].label}
          </button>
        ))}
        <button
          onClick={() => setReferral((v) => !v)}
          className="rounded-md border px-3 py-1.5 text-xs font-medium"
          style={referral ? { borderColor: AMBER, backgroundColor: `${AMBER}22`, color: "#8a6d1a" } : { borderColor: "hsl(214 32% 91%)", color: MUTED }}
        >
          {referral ? "✓ " : ""}+ Referral / overspill uplift
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Inputs */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job economics</h2>
            <div className="space-y-3">
              <Field label="Average job value (TDV)" prefix="£" value={inp.avgJobValue} step={100} onChange={(n) => set("avgJobValue", n)} />
              <Field label="Gross margin" suffix="%" value={Math.round(inp.grossMargin * 100)} step={1} onChange={(n) => set("grossMargin", n / 100)} hint="Profit on a job before marketing cost" />
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solar on Steroids cost</h2>
            <div className="space-y-3">
              <Field label="Monthly retainer" prefix="£" value={inp.retainer} step={100} onChange={(n) => set("retainer", n)} />
              <Field label="Monthly ad spend (Meta)" prefix="£" value={inp.adSpend} step={100} onChange={(n) => set("adSpend", n)} />
              <Field label="Commission on job revenue" suffix="%" value={inp.commissionPct * 100} step={0.5} onChange={(n) => set("commissionPct", n / 100)} hint="2% of Total Deal Value per closed job" />
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where you&apos;d land</h2>
            <div className="space-y-3">
              <Field label="Cost per lead" prefix="£" value={inp.costPerLead} step={1} onChange={(n) => set("costPerLead", n)} hint="SoS benchmark £35 — use your real Pulse CPL" />
              <Field label="Lead → job close rate" suffix="%" value={Number((inp.closeRate * 100).toFixed(1))} step={0.5} onChange={(n) => set("closeRate", n / 100)} hint="Overall lead-to-job. SoS imply ~10%" />
            </div>
          </Card>
        </div>

        {/* Outputs */}
        <div>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Break-even</div>
              <div className="mt-1 text-3xl font-bold" style={{ color: TEAL }}>{isFinite(r.breakEvenJobs) ? r.breakEvenJobs.toFixed(1) : "—"}</div>
              <div className="text-xs text-muted-foreground">jobs / month to cover cost</div>
            </Card>
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Profit per job</div>
              <div className="mt-1 text-3xl font-bold">{gbp(r.profitPerJob)}</div>
              <div className="text-xs text-muted-foreground">gross profit minus 2% commission</div>
            </Card>
            <Card className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Where you&apos;d land</div>
              <div className="mt-1 text-3xl font-bold" style={{ color: profitable ? TEAL : LOSS }}>{r.jobsPerMo.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">jobs/mo → net {gbpk(landNet)}/mo</div>
            </Card>
          </div>

          <Card className="p-5">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Net monthly profit versus jobs per month">
              {/* gridlines + y labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                const v = yMin + t * span;
                return (
                  <g key={i}>
                    <line x1={m.l} y1={y(v)} x2={W - m.r} y2={y(v)} stroke={GRID} />
                    <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{gbpk(v)}</text>
                  </g>
                );
              })}
              {/* x labels */}
              {Array.from({ length: maxN + 1 }, (_, n) => n).filter((n) => n % Math.ceil(maxN / 10) === 0).map((n) => (
                <text key={n} x={x(n)} y={H - m.b + 18} textAnchor="middle" fontSize="11" fill={MUTED}>{n}</text>
              ))}
              <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill={MUTED}>Jobs closed per month</text>
              {/* loss / profit shading */}
              <polygon points={`${x(0)},${zeroY} ${x(0)},${y(net(0))} ${beX},${zeroY}`} fill={LOSS} opacity="0.10" />
              <polygon points={`${beX},${zeroY} ${ys.slice(Math.ceil(isFinite(r.breakEvenJobs) ? r.breakEvenJobs : maxN)).map((v, k) => `${x(Math.ceil(isFinite(r.breakEvenJobs) ? r.breakEvenJobs : maxN) + k)},${y(v)}`).join(" ")} ${x(maxN)},${zeroY}`} fill={TEAL} opacity="0.10" />
              {/* zero line + profit curve */}
              <line x1={m.l} y1={zeroY} x2={W - m.r} y2={zeroY} stroke="#1a2b2b" strokeWidth="1" />
              <polyline points={pts} fill="none" stroke={TEAL} strokeWidth="2.5" />
              {/* break-even marker */}
              {isFinite(r.breakEvenJobs) && r.breakEvenJobs <= maxN ? (
                <g>
                  <line x1={x(r.breakEvenJobs)} y1={m.t} x2={x(r.breakEvenJobs)} y2={H - m.b} stroke={TEAL} strokeDasharray="4 4" />
                  <circle cx={x(r.breakEvenJobs)} cy={zeroY} r="4" fill={TEAL} />
                  <text x={x(r.breakEvenJobs) + 6} y={m.t + 12} fontSize="11" fill={TEAL}>break-even {r.breakEvenJobs.toFixed(1)}</text>
                </g>
              ) : null}
              {/* SoS projection at 7 */}
              {7 <= maxN ? (
                <g>
                  <line x1={x(7)} y1={m.t} x2={x(7)} y2={H - m.b} stroke="#9bb0ad" strokeDasharray="2 4" />
                  <text x={x(7) + 6} y={m.t + 26} fontSize="11" fill="#7e938f">SoS says 7</text>
                </g>
              ) : null}
              {/* where you'd land */}
              {r.jobsPerMo <= maxN ? (
                <g>
                  <circle cx={x(r.jobsPerMo)} cy={y(net(r.jobsPerMo))} r="5.5" fill={AMBER} stroke="#fff" strokeWidth="1.5" />
                  <text x={x(r.jobsPerMo)} y={y(net(r.jobsPerMo)) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#8a6d1a">you: {r.jobsPerMo.toFixed(1)}</text>
                </g>
              ) : null}
            </svg>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: TEAL }} /> Net profit</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: TEAL }} /> Break-even</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AMBER }} /> Where you&apos;d land</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: "#9bb0ad" }} /> SoS projection (7)</span>
            </div>
          </Card>

          {/* Jobs table */}
          <Card className="mt-4 p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Jobs / month</th>
                    <th className="py-1 pr-3 text-right font-medium">Gross profit</th>
                    <th className="py-1 pr-3 text-right font-medium">SoS cost</th>
                    <th className="py-1 text-right font-medium">Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 7 }, (_, k) => k + 1).map((n) => {
                    const nv = net(n);
                    const firstProfit = n - 1 < r.breakEvenJobs && n >= r.breakEvenJobs;
                    return (
                      <tr key={n} className="border-t border-border" style={firstProfit ? { background: `${TEAL}10`, fontWeight: 600 } : undefined}>
                        <td className="py-1.5 pr-3">{n}</td>
                        <td className="py-1.5 pr-3 text-right">{gbp(n * r.profitPerJob)}</td>
                        <td className="py-1.5 pr-3 text-right">{gbp(r.fixedCostMo)}</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: nv >= 0 ? TEAL : LOSS }}>{nv >= 0 ? "+" : "−"}{gbp(Math.abs(nv))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Verdict */}
          <div className="mt-4 rounded-lg border px-4 py-3 text-sm" style={profitable ? { borderColor: `${TEAL}55`, background: `${TEAL}0d` } : { borderColor: `${LOSS}55`, background: `${LOSS}0d` }}>
            {profitable ? (
              <>At these inputs you&apos;d land around <b>{r.jobsPerMo.toFixed(1)} jobs/month</b> — {isFinite(safety) ? <>above the <b>{r.breakEvenJobs.toFixed(1)}</b> break-even (<b>{safety.toFixed(1)}×</b> margin of safety)</> : "profitable"}, netting about <b>{gbpk(landNet)}/month</b> after all SoS costs.</>
            ) : (
              <>At these inputs you&apos;d land around <b>{r.jobsPerMo.toFixed(1)} jobs/month</b> — <b>below</b> the {r.breakEvenJobs.toFixed(1)} break-even, a loss of about <b>{gbpk(Math.abs(landNet))}/month</b>. You&apos;d need a lower cost-per-lead or a higher close rate.</>
            )}
            {referral ? <> Referral/overspill adds <b>{gbpk(r.upliftPerMo)}/mo</b> of non-commissionable upside on top.</> : null}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Break-even counts only <i>incremental</i> jobs — work you wouldn&apos;t have won anyway. Commission (2%) is charged on the base funnel only; referral/overspill is modelled as separate, non-commissionable upside. Jobs are expected values and can be fractional.
          </p>
        </div>
      </div>
    </div>
  );
}
