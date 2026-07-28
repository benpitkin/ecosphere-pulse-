import SosExplorer from "./sos-explorer";
import { SosTabs } from "./sos-tabs";

export const dynamic = "force-dynamic";

// Phase 2 — scenario modeller (D.1). Pure client-side what-if over the break-even
// engine; no live data yet. The live tracker (D.2/D.4/D.5) lands in a later phase.
export default function SosPage() {
  return (
    <>
      <SosTabs />
      <SosExplorer />
    </>
  );
}
