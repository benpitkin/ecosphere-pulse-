import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { gbp } from "@/lib/utils";
import type { ForecastMonth, MonthBreakdown } from "@/lib/forecast";

// Line-item rows for the cash waterfall, grouped like the spreadsheet.
const WATERFALL_GROUPS: { title: string; rows: { label: string; key: keyof MonthBreakdown }[] }[] = [
  {
    title: "Money in",
    rows: [
      { label: "Committed jobs — customer cash", key: "committedCash" },
      { label: "Committed jobs — BUS grants", key: "committedBus" },
      { label: "Existing receivables (Xero)", key: "receivables" },
      { label: "New wins — cash + deposits", key: "newWinsCash" },
      { label: "New wins — BUS grants", key: "busFromWins" },
      { label: "VAT", key: "vat" },
    ],
  },
  {
    title: "Fixed costs",
    rows: [
      { label: "Overheads (payroll, bills)", key: "overheads" },
      { label: "Owner drawings", key: "ownerDrawings" },
      { label: "Marketing", key: "marketing" },
      { label: "Natasha uplift", key: "natashaUplift" },
      { label: "New installer (hire)", key: "hire" },
    ],
  },
  {
    title: "Variable costs",
    rows: [
      { label: "Materials + subbie (COGS)", key: "cogs" },
      { label: "DNO + MCS", key: "dnoMcs" },
      { label: "Card / bank fees", key: "bankFees" },
    ],
  },
  {
    title: "Finance & one-off",
    rows: [
      { label: "Funding Circle loan", key: "fundingCircle" },
      { label: "GC Finance", key: "gcFinance" },
      { label: "Amex", key: "amex" },
      { label: "MCS renewal", key: "mcsRenewal" },
      { label: "Corporation tax", key: "corporationTax" },
      { label: "Accountant", key: "accountant" },
    ],
  },
  {
    // Only populated when the agency lever is on; rows read "—" otherwise.
    title: "Marketing agency",
    rows: [
      { label: "Agency retainer", key: "agencyRetainer" },
      { label: "Agency ad spend", key: "agencyAdSpend" },
      { label: "Agency commission", key: "agencyCommission" },
    ],
  },
];

// Blank for £0 so the grid reads like the spreadsheet; £ otherwise.
const wfCell = (n: number): string => (Math.round(n) === 0 ? "—" : gbp(n));

/**
 * Detailed line-item × month cash waterfall, driven by each forecast month's
 * `breakdown`. Presentation only — pass the (base-case) forecast months; the
 * line-item rows, totals, and opening/closing chain are derived from them.
 */
export function CashWaterfall({ months }: { months: ForecastMonth[] }) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-1 text-base font-semibold">Cash waterfall · base case</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Every line of money in and out, month by month — live from your model, so it moves with the levers above. Blank cells are £0.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-right text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 z-10 bg-white py-1 pr-3 text-left font-medium">Line item</th>
              {months.map((m) => (
                <th key={m.label} className="px-2 py-1 font-medium">{m.label}</th>
              ))}
              <th className="px-2 py-1 font-semibold">12mo</th>
            </tr>
          </thead>
          <tbody>
            {WATERFALL_GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left font-semibold text-foreground">{g.title}</td>
                  <td colSpan={months.length + 1} />
                </tr>
                {g.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="sticky left-0 z-10 bg-white py-0.5 pr-3 text-left text-muted-foreground">{row.label}</td>
                    {months.map((m) => (
                      <td key={m.label} className="px-2 py-0.5">{wfCell(m.breakdown[row.key])}</td>
                    ))}
                    <td className="px-2 py-0.5 font-medium">
                      {wfCell(months.reduce((acc, m) => acc + m.breakdown[row.key], 0))}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t-2 border-border font-semibold">
              <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Total money in</td>
              {months.map((m) => <td key={m.label} className="px-2 py-1">{wfCell(m.inflows)}</td>)}
              <td className="px-2 py-1">{wfCell(months.reduce((acc, m) => acc + m.inflows, 0))}</td>
            </tr>
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Total money out</td>
              {months.map((m) => <td key={m.label} className="px-2 py-1">{wfCell(m.outflows)}</td>)}
              <td className="px-2 py-1">{wfCell(months.reduce((acc, m) => acc + m.outflows, 0))}</td>
            </tr>
            <tr className="border-t border-border font-semibold">
              <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Net cash flow</td>
              {months.map((m) => (
                <td key={m.label} className={`px-2 py-1 ${m.net < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {Math.round(m.net) === 0 ? "—" : `${m.net < 0 ? "−" : "+"}${gbp(Math.abs(m.net))}`}
                </td>
              ))}
              <td className="px-2 py-1">{wfCell(months.reduce((acc, m) => acc + m.net, 0))}</td>
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left text-muted-foreground">Opening cash</td>
              {months.map((m) => <td key={m.label} className="px-2 py-1 text-muted-foreground">{wfCell(m.closing - m.net)}</td>)}
              <td />
            </tr>
            <tr className="border-t border-border font-bold">
              <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-left">Closing cash</td>
              {months.map((m) => (
                <td key={m.label} className={`px-2 py-1 ${m.closing < 0 ? "text-red-600" : m.closing < 10000 ? "text-amber-600" : ""}`}>
                  {wfCell(m.closing)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
