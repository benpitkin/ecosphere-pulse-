# Pulse module plan — Solar on Steroids ROI & Commission

**Status:** plan for approval — no code written yet.
**Source of truth:** the SoS build prompt + signed SOW clauses (§A–§G) and the reference `breakeven.html`.
**Scope decisions already taken (this session):**
- **TDV vs BUS:** *undecided pending SoS.* Engine gets a `tdv_includes_bus` toggle (default **off / customer-paid**, flagged in the UI as "unconfirmed") so it flips in one place once SoS confirm §B.1.
- **Ledger data:** GHL sync where the data exists, manual entry for the gaps.
- **Build order:** plan first (this doc), then phased implementation on approval.

---

## 1. How it fits the existing app (no rebuild)

Pulse today is read-only over Xero / GHL / Dispatch and owns three small tables (`pulse_config`, `pulse_snapshots`, and the ad-hoc `pulse_assistant_messages`), all RLS-locked to the service-role key. This module **extends that same pattern** — new Pulse-owned tables + a small write/edit surface (server actions, exactly like `/pulse/settings`). Nothing in the existing forecast/cash engine is replaced.

**Relationship to the agency lever already built:** the Forecast page now has a "Solar on Steroids" lever that shows how the agency hits the **12-month cash line**. This module is the **ROI / break-even + commission-compliance** view — a different question. They stay separate and complementary; the lever is *cash timing*, this module is *break-even + what we actually owe*.

The module lives under a new nav section **`/pulse/sos`** (label: "Agency"), with the five features below as sections/sub-pages.

---

## 2. Data model — new Pulse-owned tables

All RLS-on, no policies (service-role only), migration under `supabase/migrations/`, mirroring `pulse_config`.

### `pulse_sos_config` (single-row, like `pulse_config`)
Deal parameters + engine switches.

| Field | Purpose | Default |
|---|---|---|
| `retainer_gbp` | §A retainer | 2000 |
| `ad_spend_gbp` | monthly Meta spend | 2500 |
| `commission_pct` | §B.1 | 0.02 |
| `vat_rate` | show VAT as a cashflow line | 0.20 |
| `attribution_window_days` | §B.4 | 180 |
| **`tdv_includes_bus`** | **the pending-SoS toggle (§B.1)** | **false (unconfirmed)** |
| `commencement_date` | retainer start | — |
| `termination_date` | drives §B.5 survival window | null |
| `updated_at` | | now() |

### `pulse_sos_deals` (the commission ledger — one row per attributed Closed Transaction)
| Field | Source | Notes |
|---|---|---|
| `id` | — | uuid PK |
| `ghl_opportunity_id`, `dispatch_job_id` | GHL / Dispatch | links back to the deal |
| `customer_name` | GHL | |
| `tdv_solar`, `tdv_battery`, `tdv_ancillary`, `tdv_upgrades`, `tdv_additional` | **manual** | §B.1 components |
| `bus_grant_gbp` | manual / Dispatch | held separately so the `tdv_includes_bus` toggle can add or exclude it |
| `tdv_ex_vat` | **computed** | sum of components (± BUS per toggle), VAT excluded |
| `binding_agreement_date` | manual / GHL | §B.2(a) |
| `first_payment_date` | **manual** | §B.2(b) — the commission trigger; *not* in current Xero scope |
| `most_recent_capture_at` | GHL (confirmed manual) | §B.4 window anchor |
| `days_to_close` | computed | `first_payment_date − most_recent_capture_at` |
| `commissionable` | computed | `days_to_close ≤ 180` |
| `attribution_source` | GHL | platform / UTM / CRM / SoS |
| `attribution_evidence` | manual | jsonb/text — the §B.3 "objective evidence" case |
| `disputed`, `dispute_evidence` | manual | §B.3 dispute flag |
| `would_have_won_anyway` | manual | §C incrementality (we still owe 2% either way) |
| `commission_ex_vat`, `commission_vat`, `commission_total` | computed | `0.02 × tdv_ex_vat` + VAT |
| `invoice_due_date` | computed | `first_payment_date + 7` (§B.6) |
| `invoice_status` | manual | owed / invoiced / paid |
| `created_at`, `updated_at` | | §B.8 ≥12-month retention |

### `pulse_sos_leads` (attribution audit trail — §B.3/B.4, §D.4)
`id`, `ghl_contact_id`/`ghl_opportunity_id`, `source`, `campaign`, `utm_{source,medium,campaign,content,term}`, `first_capture_at`, `most_recent_capture_at`, `sos_attributed` (bool), `evidence`, `deal_id` (nullable link).

---

## 3. Data-source map (GHL sync + manual gaps)

| Field needed | From GHL? | Reality |
|---|---|---|
| Customer, deal, source, campaign | ✅ | `ghl-pipeline.ts` already reads opportunity `source` + value |
| UTM params | ⚠️ | only if stored on the GHL contact/opportunity custom fields — verify; else manual |
| Most-recent capture timestamp | ⚠️ | GHL exposes `createdAt`/`updatedAt`/`lastStatusChangeAt`, **not** a clean "attributable capture" event — confirm manually; **data-quality risk to the 180-day calc** |
| Won/closed status | ✅ | GHL `status=won` — but that is **not** the contractual "Closed" (§B.2 needs first payment) |
| **First-payment-received date** | ❌ | not in Pulse's current Xero scope (`transactions.read` not granted, and the Xero reconnect is currently broken) → **manual** until we add scope |
| TDV component breakdown | ❌ | **manual** — no source carries solar/battery/ancillary split |
| BUS grant amount / commissioning date | ⚠️ | Dispatch job type + install date; grant value manual |

**Net:** GHL seeds the row (customer, source, attribution candidate, deal value as a TDV starting point); a short form fills the commission-critical gaps (first-payment date, TDV breakdown, evidence). Low volume (~1–2 installs/mo) makes manual entry cheap.

---

## 4. The five features

**D.1 — Scenario modeller** (`src/lib/sos-breakeven.ts`, pure + unit-tested; client component)
Encodes §C exactly (verified against `breakeven.html`: profit/job £3,388, break-even 1.3, land 7.1 → ~£19.7k/mo). Editable inputs → funnel, break-even jobs, net profit, ROAS/GP-return, the net-profit-vs-jobs chart + table. **Three presets:** *Our real Pulse figures* (AOV £15,492 / GM 35% from the live model) · *SoS benchmark* (CPL £35, LQ 40%, QS 25%, AOV £12,100, GM 30%) · *Conservative*. Referral/overspill modelled as a **separate, toggleable, non-commissionable uplift on the return only** (never folded into commissionable revenue).

**D.2 — Live tracker** (reads `pulse_sos_deals` + live GHL/Dispatch)
Attributed leads / quotes / Closed Transactions, actual TDV, commission owed this month, cumulative (ad spend + retainer) vs cumulative gross profit, actual jobs vs the break-even line, rolling ROI.

**D.3 — Commission ledger** (`pulse_sos_deals`)
Table: per Closed Transaction — TDV ex-VAT, attribution source + evidence, most-recent capture date, days-to-close (flag >180 = not owed), 2% + VAT, invoice-due (close + 7), dispute flag. Running monthly total + **CSV export** (§B.8). Add/edit via server actions (like `/pulse/settings`).

**D.4 — Attribution audit trail** (`pulse_sos_leads`)
Per attributed deal: source (platform/UTM/CRM), capture timestamp, evidence; dispute + evidence fields to build the "objective evidence" case that can overturn SoS-managed attribution (§B.3).

**D.5 — Alerts** (extend `pulse.ts` actions + the daily Slack cron `api/cron/pulse-alert`)
(a) month projected below break-even (≤~1.3 jobs); (b) deal approaching the 180-day edge; (c) commission invoice due (close + 7); (d) **audit guard** — independently recompute commission and flag >5% drift from what's reported (§B.7).

---

## 5. Contract rules the engine encodes (§B)

- **TDV** = sum of components, before *all* deductions, **VAT excluded**; `commission_ex_vat = 0.02 × tdv_ex_vat`, then add VAT. Nothing netted off except VAT. BUS in/out via the toggle.
- **Closed Transaction** = binding agreement **and** first payment received — commission triggers on *that*, not quote/signature.
- **Attribution window** = 180 days from the **most recent** attributable capture event.
- **Survival** (§B.5) = keep computing for 180 days after `termination_date`.
- **Close-or-Coast** (§A) = suppress the 2nd retainer invoice until the first Closed Transaction (derived flag; deferred, not waived).
- **VAT** = ex-VAT for profit; VAT shown as a cashflow line; retainer/commission +VAT reclaimable; ad spend paid direct to Meta.
- **Audit self-check** (§B.7) = recompute independently, flag >5% drift.

---

## 6. Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| **1** | Migration (3 tables) + `sos-breakeven.ts` engine + unit tests | — |
| **2** | D.1 Scenario modeller page (presets, chart, referral/overspill toggle) | Phase 1 |
| **3** | D.3 Commission ledger — entry form, table, CSV, commission engine; GHL sync for the auto fields | Phase 1 |
| **4** | D.2 Live tracker + D.4 attribution audit trail | Phase 3 |
| **5** | D.5 alerts into `pulse.ts` + Slack cron + audit guard | Phase 3 |

Phase 2 is shippable on its own (no new data). Phases 3–5 are the compliance core and share the ledger tables.

---

## 7. Open dependencies & risks

1. **TDV/BUS** — pending SoS (§B.1). Toggle built; default set to *exclude* BUS and labelled "unconfirmed" until you confirm. This is the biggest single number in the whole module (audit-penalty exposure).
2. **First-payment-received date** — the commission *trigger* isn't reachable from Pulse's current Xero scope, and the Xero connection is currently broken (separate fix in flight). Manual entry until we add `accounting.transactions.read` — flagged, not assumed.
3. **"Most recent attributable capture"** — GHL may not expose this cleanly; the 180-day calc is only as good as that timestamp. Manual confirmation supported.
4. **Attribution disputes** — we store evidence to *build* the disproof case; the contract says SoS data prevails unless objectively disproven, so Pulse assists, it doesn't adjudicate.
5. **Brand colours** — this module will use your canonical **teal #1B7A6E / amber #F5B83D** (note: `breakeven.html` uses different greens/golds — I'll standardise on your stated palette unless told otherwise).

---

## 8. What I need to start Phase 1

Approval of this plan (or edits). On green light I'll build Phase 1 (migration + engine + tests) and show it before touching the UI.
