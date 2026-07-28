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
| BUS grant | £9,000 on ~90% of jobs, lands within ~1–2 weeks of commissioning (booked in the install month) |
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
| Jun-26 | £80,247 | £52,764 | £72,483 |
| Jul-26 | £157,904 | £78,848 | £151,539 |
| Aug-26 | £167,761 | £92,656 | £226,644 |
| Sep-26 | £167,683 | £88,256 | £306,070 |
| Oct-26 | £258,709 | £145,833 | £418,946 |
| Nov-26 | £222,876 | £133,414 | £508,408 |
| Dec-26 | £182,069 | £104,705 | £585,772 |
| Jan-27 | £130,955 | £74,979 | £641,748 |
| Feb-27 | £175,693 | £97,874 | £719,567 |
| Mar-27 | £198,952 | £106,254 | £812,265 |
| Apr-27 | £229,516 | £120,527 | £921,254 |
| May-27 | £207,803 | £125,751 | £1,003,305 |

**Summary:** lowest cash £72,483 (Jun-26) · year-end £1,003,305 · net generated £958,305.

> Re-captured Aug 2026 after the **BUS-timing correction** — the grant now lands in the
> install month (was ~2 months later), pulling grant cash forward and lifting every
> closing balance.

> This is the **base/stretch** case (assumes marketing scales and conversion lifts).
> Note the known modelling caveat: with live committed Dispatch jobs, the engine
> now shares capacity between committed jobs and the funnel so they aren't
> double-counted (fixed 12 Jun 2026).

## Re-capturing after an intentional model change
The golden test pins exact values. If you deliberately change a constant/formula,
re-capture by running `buildForecast(forecastInputs({cash:45000,receivables:20000,
overdue:5000}), { now: new Date(2026,5,1) })`, then update the expected arrays in
`forecast-golden.test.ts` and the table above.
