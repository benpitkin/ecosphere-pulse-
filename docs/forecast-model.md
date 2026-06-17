# Cashflow forecast model — reference of record

The 12-month cash forecast in Pulse (`src/lib/forecast.ts`) is a **port of
`EcoSphere_Cashflow_Model.xlsx`**. That spreadsheet is **not** in this repo — it
lives on Ben's drive. This doc is the in-repo reference for what the code's model
assumes and produces, so the port is documented alongside it.

> ⚠️ The port has **not** been reconciled cell-for-cell against the live
> spreadsheet. The tests verify the engine is internally consistent and that its
> output hasn't drifted (golden master) — **not** that it faithfully reproduces
> the original sheet. To verify fidelity, diff this output against the .xlsx.

## Ported assumptions (authoritative source: `src/lib/forecast.ts`)
| Driver | Value |
|---|---|
| Average job value | £15,492 |
| Install capacity | 13/mo (+1/week if the installer is hired, from Sep-26) |
| COGS | 65% of customer revenue (44% materials + 21% subbie) |
| DNO + MCS | £65 / install |
| BUS grant | £9,000 on ~90% of jobs, lands ~2 months after install |
| Cost per lead / other leads | £50 · +9/mo |
| Proposal→won | 22% |
| Bank/card fees | 2.27% of inflows |
| Funding Circle loan | £2,761.78/mo, Jul-2026 → Jun-2028 |
| GC Finance / Amex | £271 (11 mo) · £139/mo |
| One-offs | MCS renewal £2,305 (month 0) · corporation tax £13,000 (Nov) · accountant £1,200 (Feb) |
| Committed jobs | 9 signed jobs baked into Jun–Oct (`DEFAULT_COMMITTED`); overridden live by Dispatch |
| Monthly drivers | `MARKETING`, `ENGAGED_PCT`, `SEASONAL` arrays (per calendar month) |

Conservative case ≈ 35% fewer wins (`scenarioFactor` 0.65).

## Reference output (golden master)
Deterministic baseline pinned by `src/lib/forecast-golden.test.ts`:
**`now = 2026-06-01`**, opening cash £45,000, receivables £20,000, overdue £5,000,
`DEFAULT_COMMITTED` jobs, no levers/overrides.

| Month | Money in | Money out | Closing cash |
|---|--:|--:|--:|
| Jun-26 | £57,747 | £52,253 | £50,494 |
| Jul-26 | £105,643 | £77,662 | £78,475 |
| Aug-26 | £128,294 | £91,760 | £115,009 |
| Sep-26 | £167,846 | £88,260 | £194,595 |
| Oct-26 | £242,107 | £145,456 | £291,246 |
| Nov-26 | £198,176 | £132,853 | £356,569 |
| Dec-26 | £195,656 | £105,013 | £447,212 |
| Jan-27 | £166,400 | £75,783 | £537,828 |
| Feb-27 | £182,795 | £98,035 | £622,588 |
| Mar-27 | £175,189 | £105,715 | £692,062 |
| Apr-27 | £211,428 | £120,116 | £783,374 |
| May-27 | £189,715 | £125,341 | £847,749 |

**Summary:** lowest cash £50,494 (Jun-26) · year-end £847,749 · net generated £802,749.

> This is the **base/stretch** case (assumes marketing scales and conversion lifts).
> Note the known modelling caveat: with live committed Dispatch jobs, the engine
> now shares capacity between committed jobs and the funnel so they aren't
> double-counted (fixed 12 Jun 2026).

## Re-capturing after an intentional model change
The golden test pins exact values. If you deliberately change a constant/formula,
re-capture by running `buildForecast(forecastInputs({cash:45000,receivables:20000,
overdue:5000}), { now: new Date(2026,5,1) })`, then update the expected arrays in
`forecast-golden.test.ts` and the table above.
