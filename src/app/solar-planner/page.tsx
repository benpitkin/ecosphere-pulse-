"use client";
import React, { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Home, Package, TrendingUp, FileText, Check, ChevronRight,
  ChevronLeft, Search, Plus, Trash2, Zap, Battery, Sun, HelpCircle,
  Car, Thermometer, Shield, Droplets, PoundSterling,
} from "lucide-react";
import { useSolarLookup } from "@/lib/solar/useSolarLookup";
import type { CoreRoof } from "@/lib/solar/types";

// ── design tokens ──────────────────────────────────────────────────────────
const TEAL    = "#1B7A6E";
const TEAL_DK = "#13594F";
const TEAL_LT = "#E6F2F0";
const AMBER   = "#E8A33D";
const RED_LT  = "#FEE2E2";
const GREEN_LT= "#DCFCE7";
const INK     = "#1F2A28";
const MUTE    = "#6B7C79";
const LINE    = "#E2EAE8";
const BG      = "#F7FAF9";

// ── financial constants (update as rates change) ────────────────────────────
const IMPORT_RATE  = 0.245;   // £/kWh import
const EXPORT_RATE  = 0.15;    // £/kWh SEG export
const RATE_RISE    = 0.072;   // 7.2% annual tariff increase (industry consensus)
const DEGRADATION  = 0.005;   // 0.5% annual panel degradation
const SC_FRACTION  = 0.35;    // self-consumption fraction (MCS MGD-003 domestic)
const PANEL_W      = 440;     // Aiko 440W

// ── steps ───────────────────────────────────────────────────────────────────
type StepId = "PIN" | "ROOFS" | "HARDWARE" | "SAVINGS" | "ADDONS" | "SUMMARY";

const STEPS: { id: StepId; label: string; sub: string; icon: React.ElementType }[] = [
  { id: "PIN",      label: "Location",  sub: "Property address",          icon: MapPin      },
  { id: "ROOFS",    label: "Roofs",     sub: "Roof planes & panels",       icon: Home        },
  { id: "HARDWARE", label: "Hardware",  sub: "Solar package",              icon: Package     },
  { id: "SAVINGS",  label: "Savings",   sub: "Energy insight",             icon: TrendingUp  },
  { id: "ADDONS",   label: "Add-ons",   sub: "Optional extras",            icon: Zap         },
  { id: "SUMMARY",  label: "Summary",   sub: "Book your survey",           icon: FileText    },
];

// ── packages ────────────────────────────────────────────────────────────────
interface Pkg {
  id: string; name: string; panel: string; inverter: string;
  battery: string | null; batteryKwh: number; price: number;
  badge: string | null; hasBattery: boolean; desc: string;
}
const PACKAGES: Pkg[] = [
  {
    id: "ess", name: "Essential",
    panel: "Aiko 440W", inverter: "Solis 3.6kW",
    battery: null, batteryKwh: 0, hasBattery: false,
    price: 5950, badge: null,
    desc: "Panels and inverter only. Best for low electricity bills or if you plan to add storage later.",
  },
  {
    id: "plus", name: "Plus",
    panel: "Aiko 440W", inverter: "GivEnergy 5.0kW",
    battery: "GivEnergy 9.5 kWh", batteryKwh: 9.5, hasBattery: true,
    price: 9450, badge: "Popular",
    desc: "Solar + battery. Store daytime surplus and use it in the evening — cuts your import bill further.",
  },
  {
    id: "pro", name: "Pro",
    panel: "Aiko 440W", inverter: "Tesla Powerwall 3",
    battery: "Powerwall 3 — 13.5 kWh", batteryKwh: 13.5, hasBattery: true,
    price: 12900, badge: "Best saving",
    desc: "Maximum storage with the Tesla Powerwall 3. Whole-home backup capability included.",
  },
];

// ── add-ons ─────────────────────────────────────────────────────────────────
interface Addon { id: string; name: string; subtitle: string; desc: string; price: number; icon: React.ElementType; maxQty: number }
const ADDONS: Addon[] = [
  { id: "ev",       name: "EV Charger",        subtitle: "Zappi 7 kW",        desc: "Solar-smart charger — uses surplus generation to charge your car first.",          price: 879,  icon: Car,         maxQty: 2 },
  { id: "diverter", name: "Solar Diverter",     subtitle: "myenergi eddi",     desc: "Diverts surplus to your hot water immersion — essentially free hot water.",        price: 650,  icon: Droplets,    maxQty: 1 },
  { id: "nest",     name: "Smart Thermostat",   subtitle: "Google Nest",       desc: "Control your heating from anywhere and save up to £160/year.",                    price: 250,  icon: Thermometer, maxQty: 1 },
  { id: "skirt",    name: "Panel Protection",   subtitle: "SolaSkirt",         desc: "Bird and debris guard — keeps cables safe and panels clean.",                      price: 495,  icon: Shield,      maxQty: 1 },
];

// ── quote state ──────────────────────────────────────────────────────────────
type BatteryFilter = "any" | "none" | "battery";
interface Customer { name: string; email: string; phone: string }
interface Quote {
  ref: string;
  address: string;
  coords: { lat: number; lng: number } | null;
  roofs: CoreRoof[];
  packageId: string | null;
  annualBillGbp: number;
  annualUsageKwh: number;
  batteryFilter: BatteryFilter;
  addons: Record<string, number>;   // addonId → qty
  customer: Customer;
}

// ── savings model ────────────────────────────────────────────────────────────
interface SavingsResult {
  annualGen: number; selfConsumedKwh: number; exportedKwh: number;
  billReduction: number; exportIncome: number; yearOneSaving: number;
  selfPct: number; exportPct: number;
  breakEvenYear: number | null; netBenefit30: number; billWithout30: number;
  years: { yr: number; billBefore: number; billAfter: number; saving: number; cum: number }[];
}

function calcSavings(annualGen: number, annualUsageKwh: number, systemCost: number): SavingsResult {
  const sc  = Math.min(Math.round(annualGen * SC_FRACTION), annualUsageKwh);
  const exp = Math.max(0, annualGen - sc);
  const billReduction = Math.round(sc  * IMPORT_RATE);
  const exportIncome  = Math.round(exp * EXPORT_RATE);
  const selfPct  = annualGen > 0 ? Math.round((sc  / annualGen) * 100) : 0;
  const exportPct = 100 - selfPct;

  let cum = -systemCost;
  let breakEvenYear: number | null = null;
  let netBenefit30 = -systemCost;
  let billWithout30 = 0;

  const years = Array.from({ length: 30 }, (_, i) => {
    const yr  = i + 1;
    const iR  = IMPORT_RATE * Math.pow(1 + RATE_RISE, i);
    const eR  = EXPORT_RATE * Math.pow(1 + RATE_RISE, i);
    const gen = annualGen   * Math.pow(1 - DEGRADATION, i);
    const scY = Math.min(gen * SC_FRACTION, annualUsageKwh);
    const expY = Math.max(0, gen - scY);
    const saving    = Math.round(scY * iR + expY * eR);
    const billBefore = Math.round(annualUsageKwh * iR);
    const billAfter  = Math.round((annualUsageKwh - scY) * iR - expY * eR);
    cum += saving;
    netBenefit30  += saving;
    billWithout30 += billBefore;
    if (breakEvenYear === null && cum >= 0) breakEvenYear = yr;
    return { yr, billBefore, billAfter, saving, cum };
  });

  return {
    annualGen, selfConsumedKwh: sc, exportedKwh: exp,
    billReduction, exportIncome, yearOneSaving: billReduction + exportIncome,
    selfPct, exportPct, breakEvenYear,
    netBenefit30: Math.round(netBenefit30),
    billWithout30: Math.round(billWithout30),
    years,
  };
}

// ── URL-synced step ──────────────────────────────────────────────────────────
function useStep(): [StepId, (id: StepId) => void] {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("step") as StepId | null;
  const step: StepId = raw && STEPS.some(s => s.id === raw) ? raw : "PIN";
  const setStep = useCallback((id: StepId) => {
    const next = new URLSearchParams(params.toString());
    next.set("step", id);
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [router, params]);
  return [step, setStep];
}

function makeManualRoof(index: number): CoreRoof {
  return { segmentIndex: index, name: `Roof ${index + 1}`, areaM2: 22, pitchDeg: 35, azimuthDeg: 180, orientationLabel: "South", maxPanels: 8, estYearlyKwh: 2880 };
}

function addonTotal(addons: Record<string, number>) {
  return ADDONS.reduce((t, a) => t + (addons[a.id] ?? 0) * a.price, 0);
}

// ── wizard root ───────────────────────────────────────────────────────────────
function SolarPlanner() {
  const [step, setStep] = useStep();
  const [quote, setQuote] = useState<Quote>({
    ref: "ECO-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    address: "", coords: null, roofs: [],
    packageId: null,
    annualBillGbp: 1500, annualUsageKwh: 3000,
    batteryFilter: "any",
    addons: {},
    customer: { name: "", email: "", phone: "" },
  });

  const stepIndex = STEPS.findIndex(s => s.id === step);
  const patch = useCallback((p: Partial<Quote>) => setQuote(q => ({ ...q, ...p })), []);

  const pkg = PACKAGES.find(p => p.id === quote.packageId);
  const totalPrice = (pkg?.price ?? 0) + addonTotal(quote.addons);

  const reachable = useMemo((): Record<StepId, boolean> => ({
    PIN:      true,
    ROOFS:    !!quote.address,
    HARDWARE: quote.roofs.length > 0,
    SAVINGS:  !!quote.packageId,
    ADDONS:   !!quote.packageId,
    SUMMARY:  !!quote.packageId,
  }), [quote]);

  const go = (dir: 1 | -1) => {
    const next = STEPS[stepIndex + dir];
    if (next && (dir < 0 || reachable[next.id])) setStep(next.id);
  };

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: INK, background: BG, minHeight: "100vh" }}>
      <TopBar quote={quote} totalPrice={totalPrice} />
      <div style={{ display: "flex", maxWidth: 1320, margin: "0 auto" }}>
        <Stepper current={step} reachable={reachable} totalPrice={totalPrice} onJump={id => reachable[id] && setStep(id)} />
        <main style={{ flex: 1, padding: "32px 40px", minHeight: "calc(100vh - 64px)" }}>
          {step === "PIN"      && <StepPin      quote={quote} patch={patch} onNext={() => go(1)} />}
          {step === "ROOFS"    && <StepRoofs    quote={quote} patch={patch} />}
          {step === "HARDWARE" && <StepHardware quote={quote} patch={patch} />}
          {step === "SAVINGS"  && <StepSavings  quote={quote} patch={patch} />}
          {step === "ADDONS"   && <StepAddons   quote={quote} patch={patch} />}
          {step === "SUMMARY"  && <StepSummary  quote={quote} patch={patch} totalPrice={totalPrice} />}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, borderTop: `1px solid ${LINE}`, paddingTop: 20 }}>
            <button onClick={() => go(-1)} disabled={stepIndex === 0} style={btnGhost(stepIndex === 0)}>
              <ChevronLeft size={16} /> Back
            </button>
            {stepIndex < STEPS.length - 1 && (
              <button onClick={() => go(1)} disabled={!reachable[STEPS[stepIndex + 1].id]} style={btnPrimary(!reachable[STEPS[stepIndex + 1].id])}>
                Continue <ChevronRight size={16} />
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: MUTE }}>Loading…</div>}>
      <SolarPlanner />
    </Suspense>
  );
}

// ── top bar ───────────────────────────────────────────────────────────────────
function TopBar({ quote, totalPrice }: { quote: Quote; totalPrice: number }) {
  return (
    <header style={{ height: 64, background: "#fff", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", padding: "0 28px", gap: 20, position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, color: TEAL }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: TEAL, display: "grid", placeItems: "center" }}>
          <Sun size={18} color="#fff" />
        </div>
        EcoSphere Energy
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 13, color: MUTE }}>Solar quote</span>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, padding: "5px 10px", background: TEAL_LT, color: TEAL_DK, borderRadius: 6 }}>{quote.ref}</span>
        {totalPrice > 0 && (
          <span style={{ fontSize: 15, fontWeight: 800, color: TEAL_DK }}>£{totalPrice.toLocaleString()}</span>
        )}
        <button style={iconBtn}><HelpCircle size={16} /> Help</button>
      </div>
    </header>
  );
}

// ── left stepper ─────────────────────────────────────────────────────────────
function Stepper({ current, reachable, totalPrice, onJump }: { current: StepId; reachable: Record<StepId, boolean>; totalPrice: number; onJump: (id: StepId) => void }) {
  const currentIdx = STEPS.findIndex(s => s.id === current);
  return (
    <aside style={{ width: 272, background: "#fff", borderRight: `1px solid ${LINE}`, padding: "28px 16px", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: MUTE, textTransform: "uppercase", margin: "4px 8px 18px" }}>Build your quote</div>
      {STEPS.map((s, i) => {
        const active = s.id === current;
        const done   = reachable[s.id] && !active && currentIdx > i;
        const locked = !reachable[s.id];
        const Icon   = s.icon;
        return (
          <button key={s.id} onClick={() => onJump(s.id)} disabled={locked}
            style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", alignItems: "center", padding: "11px 10px", borderRadius: 10, marginBottom: 3, border: "none", cursor: locked ? "not-allowed" : "pointer", background: active ? TEAL_LT : "transparent", opacity: locked ? 0.4 : 1 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: active ? TEAL : done ? TEAL_DK : "#EEF3F2", color: active || done ? "#fff" : MUTE }}>
              {done ? <Check size={17} /> : <Icon size={17} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? TEAL_DK : INK }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub}</div>
            </div>
          </button>
        );
      })}

      {totalPrice > 0 && (
        <div style={{ marginTop: "auto", padding: "16px 12px", borderTop: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 11, color: MUTE, textTransform: "uppercase", letterSpacing: 0.8 }}>Estimated price</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: TEAL_DK, marginTop: 4 }}>£{totalPrice.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: MUTE }}>inc. installation · 0% VAT</div>
        </div>
      )}
    </aside>
  );
}

// ── STEP 1: location ──────────────────────────────────────────────────────────
function StepPin({ quote, patch, onNext }: { quote: Quote; patch: (p: Partial<Quote>) => void; onNext: () => void }) {
  const [q, setQ] = useState(quote.address || "");
  const { lookup, status, data, error } = useSolarLookup();

  useEffect(() => {
    if ((status === "ok" || status === "no_building") && data) {
      patch({ address: data.formatted, coords: { lat: data.lat, lng: data.lng }, roofs: data.roofs });
      onNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

  const confirm = () => { if (q.trim()) lookup(q.trim()); };
  const loading = status === "loading";
  const confirmed = !!quote.address && status !== "loading";

  return (
    <StepWrap title="Where is the property?" lead="We use Google Solar to pull real roof data — pitch, area, orientation and panel count.">
      {confirmed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: TEAL_LT, borderRadius: 12, marginBottom: 20, maxWidth: 560 }}>
          <Check size={20} color={TEAL} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{quote.address}</div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>Location confirmed</div>
          </div>
          <button onClick={() => { patch({ address: "", coords: null, roofs: [], packageId: null }); setQ(""); }} style={{ ...iconBtn, fontSize: 12 }}>Change</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, maxWidth: 560 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={17} color={MUTE} style={{ position: "absolute", left: 13, top: 14 }} />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && confirm()} placeholder="Enter property address or postcode" disabled={loading}
              style={{ width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <button onClick={confirm} disabled={!q.trim() || loading} style={btnPrimary(!q.trim() || loading)}>
            {loading ? "Looking up…" : "Find roof"}
          </button>
        </div>
      )}

      {status === "error" && <Msg type="error">{error ?? "Couldn't find that address — check the postcode and try again."}</Msg>}
      {status === "no_building" && <Msg type="warn">No satellite roof data for this address — you can add roof planes manually on the next step.</Msg>}

      <div style={{ marginTop: 24, height: 320, borderRadius: 14, border: `1px solid ${LINE}`, background: `repeating-linear-gradient(45deg,#EEF3F2,#EEF3F2 12px,#F4F8F7 12px,#F4F8F7 24px)`, display: "grid", placeItems: "center", color: MUTE }}>
        <div style={{ textAlign: "center" }}>
          <MapPin size={30} color={TEAL} />
          <div style={{ fontSize: 13, marginTop: 10 }}>Satellite map + panel overlay</div>
          <div style={{ fontSize: 12, marginTop: 4, color: TEAL }}>Google Maps + dataLayers — next build pass</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 24 }}>
        {[["MCS certified", "By our expert installers"], ["DNO application", "All paperwork handled"], ["10-yr workmanship", "Backed by our guarantee"]].map(([t, s]) => (
          <div key={t} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
              <Check size={14} color={TEAL} /> {t}
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>{s}</div>
          </div>
        ))}
      </div>
    </StepWrap>
  );
}

// ── STEP 2: roofs ─────────────────────────────────────────────────────────────
function StepRoofs({ quote, patch }: { quote: Quote; patch: (p: Partial<Quote>) => void }) {
  const addRoof = () => patch({ roofs: [...quote.roofs, makeManualRoof(quote.roofs.length)] });
  const remove  = (idx: number) => patch({ roofs: quote.roofs.filter((_, i) => i !== idx) });
  const totalPanels = quote.roofs.reduce((a, r) => a + r.maxPanels, 0);
  const kwp = ((totalPanels * PANEL_W) / 1000).toFixed(2);

  return (
    <StepWrap title="Roof planes" lead="Google Solar has analysed your roof. Each plane shows its orientation, area and maximum panel count.">
      {quote.roofs.length === 0 && (
        <Empty icon={Home} text="No roof data yet — add planes manually or go back and search a different address." action={<button onClick={addRoof} style={btnPrimary(false)}><Plus size={16} /> Add roof plane</button>} />
      )}
      {quote.roofs.map((r, idx) => (
        <div key={r.segmentIndex} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}{r.orientationLabel ? ` — ${r.orientationLabel}` : ""}</div>
            <button onClick={() => remove(idx)} style={iconBtn}><Trash2 size={14} /></button>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            {[["Area", `${r.areaM2} m²`], ["Pitch", `${r.pitchDeg}°`], ["Azimuth", `${r.azimuthDeg}°`], ["Max panels", r.maxPanels], ["Est. yield", `${r.estYearlyKwh.toLocaleString()} kWh/yr`]].map(([l, v]) => (
              <div key={String(l)}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.7, color: MUTE }}>{l}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {quote.roofs.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button onClick={addRoof} style={btnGhost(false)}><Plus size={15} /> Add plane</button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{totalPanels} panels · ~{kwp} kWp</div>
        </div>
      )}
    </StepWrap>
  );
}

// ── STEP 3: hardware ──────────────────────────────────────────────────────────
function StepHardware({ quote, patch }: { quote: Quote; patch: (p: Partial<Quote>) => void }) {
  const annualGen = quote.roofs.reduce((a, r) => a + r.estYearlyKwh, 0);
  const sc = calcSavings(annualGen, quote.annualUsageKwh, 0);

  const filtered = PACKAGES.filter(p => {
    if (quote.batteryFilter === "none")    return !p.hasBattery;
    if (quote.batteryFilter === "battery") return  p.hasBattery;
    return true;
  });

  return (
    <StepWrap title="Choose your hardware package" lead="All packages use Aiko 440W panels and include MCS installation, DNO application and 10-year workmanship warranty.">
      {/* battery filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: MUTE, alignSelf: "center", marginRight: 4 }}>Include battery?</div>
        {(["any", "none", "battery"] as BatteryFilter[]).map(f => (
          <button key={f} onClick={() => patch({ batteryFilter: f })}
            style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${quote.batteryFilter === f ? TEAL : LINE}`, background: quote.batteryFilter === f ? TEAL_LT : "#fff", color: quote.batteryFilter === f ? TEAL_DK : MUTE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {f === "any" ? "No preference" : f === "none" ? "Solar only" : "Solar + battery"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {filtered.map(p => {
          const sel = quote.packageId === p.id;
          const yr1 = Math.round(sc.selfConsumedKwh * IMPORT_RATE + sc.exportedKwh * EXPORT_RATE);
          return (
            <button key={p.id} onClick={() => patch({ packageId: p.id })}
              style={{ ...card, textAlign: "left", cursor: "pointer", border: `2px solid ${sel ? TEAL : LINE}`, background: sel ? TEAL_LT : "#fff", position: "relative", padding: 20 }}>
              {p.badge && <span style={{ position: "absolute", top: -11, right: 16, background: AMBER, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{p.badge}</span>}
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 14, lineHeight: 1.5 }}>{p.desc}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 8 }}><Sun size={14} color={TEAL} /> {p.panel}</div>
                <div style={{ display: "flex", gap: 8 }}><Zap size={14} color={TEAL} /> {p.inverter}</div>
                <div style={{ display: "flex", gap: 8 }}><Battery size={14} color={p.hasBattery ? TEAL : MUTE} /> {p.battery ?? "No battery"}</div>
              </div>
              {annualGen > 0 && (
                <div style={{ background: sel ? "#C8E6E2" : "#EEF3F2", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: MUTE }}>Est. first-year saving </span>
                  <span style={{ fontWeight: 700, color: TEAL_DK }}>£{yr1.toLocaleString()}</span>
                </div>
              )}
              <div style={{ fontSize: 22, fontWeight: 800, color: TEAL_DK }}>£{p.price.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: MUTE }}>inc. VAT &amp; install</div>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && <Msg type="warn">No packages match this filter — try "No preference".</Msg>}
    </StepWrap>
  );
}

// ── STEP 4: savings ───────────────────────────────────────────────────────────
function StepSavings({ quote, patch }: { quote: Quote; patch: (p: Partial<Quote>) => void }) {
  const pkg = PACKAGES.find(p => p.id === quote.packageId);
  const annualGen = quote.roofs.reduce((a, r) => a + r.estYearlyKwh, 0);
  const s = calcSavings(annualGen, quote.annualUsageKwh, pkg?.price ?? 0);
  const [view30, setView30] = useState<"bill" | "cumulative">("bill");

  const fmt = (n: number) => n < 0 ? `-£${Math.abs(n).toLocaleString()}` : `£${n.toLocaleString()}`;

  return (
    <StepWrap title="Energy insight &amp; savings" lead="Based on Google Solar modelled generation and your energy usage.">
      {/* bill inputs */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Zap size={16} color={AMBER} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Your electricity</span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Annual bill £
          <input type="number" value={quote.annualBillGbp} onChange={e => patch({ annualBillGbp: Number(e.target.value) })}
            style={{ width: 80, padding: "4px 8px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Usage kWh/yr
          <input type="number" value={quote.annualUsageKwh} onChange={e => patch({ annualUsageKwh: Number(e.target.value) })}
            style={{ width: 90, padding: "4px 8px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13 }} />
        </label>
        <span style={{ fontSize: 12, color: MUTE }}>We've estimated typical usage — edit if you know yours.</span>
      </div>

      {/* headline savings */}
      <div style={{ ...card, background: TEAL_LT, border: `1px solid #B2D8D3`, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Headline savings</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", padding: "10px 20px", background: "#fff", borderRadius: 10, minWidth: 120 }}>
            <div style={{ fontSize: 12, color: MUTE }}>Bill reduction</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: INK }}>£{s.billReduction.toLocaleString()}</div>
          </div>
          <div style={{ fontSize: 22, color: MUTE }}>+</div>
          <div style={{ textAlign: "center", padding: "10px 20px", background: "#fff", borderRadius: 10, minWidth: 120 }}>
            <div style={{ fontSize: 12, color: MUTE }}>Export income (SEG)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: INK }}>£{s.exportIncome.toLocaleString()}</div>
          </div>
          <div style={{ fontSize: 22, color: MUTE }}>=</div>
          <div style={{ textAlign: "center", padding: "12px 24px", background: TEAL, borderRadius: 10, minWidth: 140 }}>
            <div style={{ fontSize: 12, color: "#C8E6E2" }}>First year savings</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>£{s.yearOneSaving.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* energy flow */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Where does your solar go?</div>
        <div style={{ fontSize: 13, color: MUTE, marginBottom: 10 }}>Solar production: <strong>{s.annualGen.toLocaleString()} kWh</strong></div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <FlowBar label="Used in your home" pct={s.selfPct} kwh={s.selfConsumedKwh} color={TEAL} />
          <FlowBar label="Exported to grid"  pct={s.exportPct} kwh={s.exportedKwh}   color="#60A5FA" />
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: MUTE }}>Self-consumption calculated using the MCS MGD-003 method for domestic installations.</div>
      </div>

      {/* 30-yr chart */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Energy bill — 30 years</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["bill", "cumulative"] as const).map(v => (
              <button key={v} onClick={() => setView30(v)}
                style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${LINE}`, background: view30 === v ? INK : "#fff", color: view30 === v ? "#fff" : MUTE, fontSize: 12, cursor: "pointer" }}>
                {v === "bill" ? "Year by year" : "Cumulative savings"}
              </button>
            ))}
          </div>
        </div>
        <BillChart years={s.years} mode={view30} systemCost={pkg?.price ?? 0} />
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#FCA5A5" }} /> Before solar</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#4ADE80" }} /> After solar</span>
        </div>
      </div>

      {/* financial explorer */}
      <div style={{ ...card }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Financial explorer</div>
        {[
          ["System price",        pkg ? `£${pkg.price.toLocaleString()}` : "—"],
          ["First year saving",   `£${s.yearOneSaving.toLocaleString()}`],
          ["Breakeven",           s.breakEvenYear ? `Year ${s.breakEvenYear}` : "—"],
          ["30-yr net benefit",   fmt(s.netBenefit30)],
          ["Bill without solar (30yr)", `£${s.billWithout30.toLocaleString()}`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
            <span style={{ color: MUTE }}>{k}</span>
            <span style={{ fontWeight: 700, color: k.includes("benefit") ? TEAL : INK }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: MUTE, marginTop: 12, lineHeight: 1.6 }}>
          Assumes {(RATE_RISE * 100).toFixed(0)}% annual tariff increase, {(DEGRADATION * 100).toFixed(1)}% panel degradation, {(IMPORT_RATE * 100).toFixed(1)}p import rate, {(EXPORT_RATE * 100).toFixed(1)}p SEG export rate. Figures are indicative. A full MCS 025 performance estimate will be provided after survey.
        </div>
      </div>
    </StepWrap>
  );
}

// ── STEP 5: add-ons ──────────────────────────────────────────────────────────
function StepAddons({ quote, patch }: { quote: Quote; patch: (p: Partial<Quote>) => void }) {
  const setQty = (id: string, delta: number) => {
    const addon = ADDONS.find(a => a.id === id)!;
    const current = quote.addons[id] ?? 0;
    const next = Math.max(0, Math.min(addon.maxQty, current + delta));
    patch({ addons: { ...quote.addons, [id]: next } });
  };

  return (
    <StepWrap title="Optional add-ons" lead="Extras you can discuss at your survey. Prices are indicative — confirmed at site visit.">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ADDONS.map(a => {
          const qty = quote.addons[a.id] ?? 0;
          const Icon = a.icon;
          return (
            <div key={a.id} style={{ ...card, display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: TEAL_LT, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon size={26} color={TEAL} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name} <span style={{ fontWeight: 400, color: MUTE, fontSize: 13 }}>— {a.subtitle}</span></div>
                <div style={{ fontSize: 13, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>{a.desc}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>£{a.price.toLocaleString()}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setQty(a.id, -1)} disabled={qty === 0} style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${LINE}`, background: "#fff", cursor: qty === 0 ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 18 }}>−</button>
                  <span style={{ width: 24, textAlign: "center", fontWeight: 700 }}>{qty}</span>
                  <button onClick={() => setQty(a.id, 1)} disabled={qty >= a.maxQty} style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${TEAL}`, background: TEAL_LT, color: TEAL_DK, cursor: qty >= a.maxQty ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 18 }}>+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {addonTotal(quote.addons) > 0 && (
        <div style={{ marginTop: 16, textAlign: "right", fontWeight: 700, fontSize: 14 }}>
          Add-ons total: £{addonTotal(quote.addons).toLocaleString()}
        </div>
      )}
    </StepWrap>
  );
}

// ── STEP 6: summary ──────────────────────────────────────────────────────────
function StepSummary({ quote, patch, totalPrice }: { quote: Quote; patch: (p: Partial<Quote>) => void; totalPrice: number }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const pkg = PACKAGES.find(p => p.id === quote.packageId);
  const c = quote.customer;
  const set = (k: keyof Customer, v: string) => patch({ customer: { ...c, [k]: v } });
  const addonLines = ADDONS.filter(a => (quote.addons[a.id] ?? 0) > 0);
  const annualGen = quote.roofs.reduce((a, r) => a + r.estYearlyKwh, 0);
  const s = calcSavings(annualGen, quote.annualUsageKwh, pkg?.price ?? 0);

  const handleSubmit = async () => {
    if (!c.name || !c.email) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch("/api/solar/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quote),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <StepWrap title="You're booked in!" lead="We'll be in touch within one business day to arrange your free survey.">
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: TEAL_LT, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <Check size={32} color={TEAL} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Quote reference: {quote.ref}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Check your inbox at <strong>{c.email}</strong> — we'll send a copy of this estimate.</div>
        </div>
      </StepWrap>
    );
  }

  return (
    <StepWrap title="Your quote summary" lead="Review your estimate, enter your details, and we'll arrange a free site survey to confirm everything.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* pricing breakdown */}
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Pricing breakdown</div>
          <SumRow k={pkg?.name ?? "Package"} v={`£${(pkg?.price ?? 0).toLocaleString()}`} />
          {addonLines.map(a => (
            <SumRow key={a.id} k={`${a.name} ×${quote.addons[a.id]}`} v={`£${(a.price * (quote.addons[a.id] ?? 0)).toLocaleString()}`} />
          ))}
          <SumRow k="Grand total" v={`£${totalPrice.toLocaleString()}`} big />
          <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Fully inclusive of hardware, installation and certification. 0% VAT applicable.</div>
        </div>

        {/* key numbers */}
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Key figures</div>
          <SumRow k="Annual generation" v={`${s.annualGen.toLocaleString()} kWh`} />
          <SumRow k="First year saving" v={`£${s.yearOneSaving.toLocaleString()}`} />
          <SumRow k="Breakeven"         v={s.breakEvenYear ? `Year ${s.breakEvenYear}` : "—"} />
          <SumRow k="30-yr net benefit" v={`£${s.netBenefit30.toLocaleString()}`} big />
        </div>
      </div>

      {/* customer details */}
      <div style={{ ...card, maxWidth: 560 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Your details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Full name"    value={c.name}  onChange={v => set("name", v)}  />
          <Field label="Phone number" value={c.phone} onChange={v => set("phone", v)} />
          <div style={{ gridColumn: "1/-1" }}>
            <Field label="Email address" value={c.email} onChange={v => set("email", v)} />
          </div>
        </div>
      </div>

      {submitErr && <Msg type="error">{submitErr}</Msg>}

      {/* CTA */}
      <div style={{ marginTop: 20, padding: "28px 32px", background: TEAL_DK, borderRadius: 16, textAlign: "center" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Take the next step</div>
        <div style={{ color: "#C8E6E2", fontSize: 14, marginBottom: 20 }}>Book your free site survey — we'll confirm your design and finalise pricing.</div>
        <button onClick={handleSubmit} disabled={!c.name || !c.email || submitting} style={{ ...btnPrimary(!c.name || !c.email || submitting), background: AMBER, fontSize: 16, padding: "14px 32px", borderRadius: 12 }}>
          <PoundSterling size={18} /> {submitting ? "Sending…" : "Book my free survey"}
        </button>
      </div>
    </StepWrap>
  );
}

// ── chart ─────────────────────────────────────────────────────────────────────
function BillChart({ years, mode, systemCost }: { years: SavingsResult["years"]; mode: "bill" | "cumulative"; systemCost: number }) {
  const W = 580; const H = 160; const PAD = 6;
  const bw = (W - PAD * 2) / years.length;

  if (mode === "cumulative") {
    const minV = Math.min(...years.map(y => y.cum));
    const maxV = Math.max(...years.map(y => y.cum));
    const range = maxV - minV || 1;
    const zeroY = H - PAD - ((0 - minV) / range) * (H - PAD * 2);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={LINE} strokeWidth={1} />
        {years.map((y, i) => {
          const norm = (y.cum - minV) / range;
          const barH = norm * (H - PAD * 2);
          const x = PAD + i * bw + bw * 0.1;
          const fill = y.cum >= 0 ? "#4ADE80" : "#FCA5A5";
          return <rect key={i} x={x} y={y.cum >= 0 ? zeroY - barH : zeroY} width={bw * 0.8} height={Math.abs(barH)} fill={fill} rx={2} />;
        })}
        {[0, 9, 19, 29].map(i => (
          <text key={i} x={PAD + i * bw + bw / 2} y={H - 1} textAnchor="middle" fontSize={9} fill={MUTE}>{2026 + i}</text>
        ))}
      </svg>
    );
  }

  // bill mode
  const maxV = Math.max(...years.map(y => y.billBefore));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {years.map((y, i) => {
        const beforeH = ((y.billBefore / maxV) * (H - 20));
        const afterH  = Math.max(0, ((Math.max(0, y.billAfter) / maxV) * (H - 20)));
        const x = PAD + i * bw;
        return (
          <g key={i}>
            <rect x={x + bw * 0.05} y={H - 16 - beforeH} width={bw * 0.42} height={beforeH} fill="#FCA5A5" rx={1} />
            <rect x={x + bw * 0.52} y={H - 16 - afterH}  width={bw * 0.42} height={afterH}  fill="#4ADE80" rx={1} />
          </g>
        );
      })}
      {[0, 9, 19, 29].map(i => (
        <text key={i} x={PAD + i * bw + bw / 2} y={H - 2} textAnchor="middle" fontSize={9} fill={MUTE}>{2026 + i}</text>
      ))}
    </svg>
  );
}

// ── flow bar ──────────────────────────────────────────────────────────────────
function FlowBar({ label, pct, kwh, color }: { label: string; pct: number; kwh: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}% — {kwh.toLocaleString()} kWh</span>
      </div>
      <div style={{ height: 10, borderRadius: 5, background: LINE, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 5 }} />
      </div>
    </div>
  );
}

// ── small components ──────────────────────────────────────────────────────────
function StepWrap({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: -0.4 }} dangerouslySetInnerHTML={{ __html: title }} />
      <p style={{ color: MUTE, margin: "0 0 26px", fontSize: 15 }}>{lead}</p>
      {children}
    </div>
  );
}

const SumRow = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
    <span style={{ color: MUTE }}>{k}</span>
    <span style={{ fontWeight: big ? 800 : 600, fontSize: big ? 16 : 14, color: big ? TEAL_DK : INK }}>{v}</span>
  </div>
);

const Empty = ({ icon: I, text, action }: { icon: React.ElementType; text: string; action: React.ReactNode }) => (
  <div style={{ ...card, textAlign: "center", padding: "44px 20px" }}>
    <I size={30} color={MUTE} />
    <div style={{ color: MUTE, margin: "12px 0 18px", fontSize: 14 }}>{text}</div>
    {action}
  </div>
);

const Msg = ({ type, children }: { type: "error" | "warn"; children: React.ReactNode }) => (
  <div style={{ marginTop: 12, padding: "10px 14px", background: type === "error" ? "#FEF2F2" : "#FFF7ED", border: `1px solid ${type === "error" ? "#FECACA" : "#FED7AA"}`, borderRadius: 8, color: type === "error" ? "#991B1B" : "#92400E", fontSize: 13 }}>
    {children}
  </div>
);

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: MUTE, fontWeight: 600 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", marginTop: 5, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
    </label>
  );
}

// ── style helpers ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 14 };
const iconBtn: React.CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center", background: "transparent", border: `1px solid ${LINE}`, color: MUTE, padding: "7px 11px", borderRadius: 8, fontSize: 13, cursor: "pointer" };
const btnPrimary = (d: boolean): React.CSSProperties => ({ display: "inline-flex", gap: 6, alignItems: "center", background: d ? "#A9C8C3" : TEAL, color: "#fff", border: "none", padding: "11px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: d ? "not-allowed" : "pointer" });
const btnGhost   = (d: boolean): React.CSSProperties => ({ display: "inline-flex", gap: 6, alignItems: "center", background: "transparent", color: d ? "#B6C4C1" : TEAL_DK, border: `1px solid ${LINE}`, padding: "11px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: d ? "not-allowed" : "pointer" });
