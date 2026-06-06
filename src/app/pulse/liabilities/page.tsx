import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import { getLiabilities, type LiabilityItem } from "@/lib/liabilities";

export const dynamic = "force-dynamic";

function Line({ i }: { i: LiabilityItem }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-t border-border py-2 ${i.flag ? "text-amber-700" : ""}`}>
      <div>
        <span className="text-sm font-medium">{i.label}</span>
        {i.note ? <span className="ml-2 text-xs text-muted-foreground">{i.note}</span> : null}
      </div>
      <span className="shrink-0 text-sm font-semibold">{gbp(i.amount)}</span>
    </div>
  );
}

export default async function LiabilitiesPage() {
  const data = await getLiabilities();
  const lenders = data.items.filter((i) => i.group === "lender");
  const hmrc = data.items.filter((i) => i.group === "hmrc");
  const notes = data.items.filter((i) => i.group === "note");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">What you owe</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Debts and obligations · live from Xero where reconciled</p>

      {data.error ? (
        <Card className="p-5 text-sm text-amber-700">Couldn&apos;t load Xero: {data.error}</Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Debt to lenders</div>
              <div className="mt-2 text-3xl font-bold text-foreground">{gbp(data.lenderTotal)}</div>
              <div className="mt-1 text-xs text-muted-foreground">loans, cards & hire purchase</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Owed to HMRC</div>
              <div className="mt-2 text-3xl font-bold text-foreground">{gbp(data.hmrcTotal)}</div>
              <div className="mt-1 text-xs text-muted-foreground">PAYE, CIS & corporation tax</div>
            </Card>
          </div>

          <Card className="mb-6 p-5">
            <h2 className="mb-1 text-base font-semibold">Lenders</h2>
            {lenders.map((i, n) => <Line key={n} i={i} />)}
          </Card>

          <Card className="mb-6 p-5">
            <h2 className="mb-1 text-base font-semibold">HMRC</h2>
            {hmrc.map((i, n) => <Line key={n} i={i} />)}
          </Card>

          {notes.length > 0 ? (
            <Card className="p-5">
              <h2 className="mb-1 text-base font-semibold">For reference</h2>
              <p className="mb-1 text-xs text-muted-foreground">Not counted in the totals above.</p>
              {notes.map((i, n) => <Line key={n} i={i} />)}
            </Card>
          ) : null}
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Pulled from the Xero balance sheet, plus the Funding Circle loan and Capital on Tap remnant (not yet reconciled in Xero). Figures are a guide — confirm with your accountant.
      </p>
    </div>
  );
}
