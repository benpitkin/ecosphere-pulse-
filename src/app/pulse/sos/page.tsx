import SosExplorer from "./sos-explorer";

export const dynamic = "force-dynamic";

// Phase 2 — scenario modeller (D.1). Pure client-side what-if over the break-even
// engine; no live data yet. The live tracker + commission ledger (D.2–D.5) land
// in later phases once the manual/GHL data plumbing is built.
export default function SosPage() {
  return <SosExplorer />;
}
