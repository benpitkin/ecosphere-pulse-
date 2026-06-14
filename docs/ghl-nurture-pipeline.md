# GoHighLevel — Nurture pipeline & auto-eject automation

**Goal:** stop never-engaged Meta form-fills and dead leads from sitting in the
active sales pipeline, where they warp progression metrics (in GHL *and* in
Pulse, which reads GHL). They get **acknowledged, not deleted** — automatically
moved into a long-term Nurture pipeline, dripped, and only ever marked Lost once
they're genuinely gone.

> Why at source, not in Pulse: fixing it in GHL cleans up GHL's own reporting and
> the team's day-to-day board too, and Pulse then needs **zero** code change —
> it just reads the now-clean sales pipeline.

## Baseline (live GHL, 12 Jun 2026)
Main pipeline **"Ecosphere – Sales & Jobs"**: 196 "open" opps / £1.42M raw — but
only ~41 are genuinely engaged live deals (~£700k). The rest:
- **80** in `Unqualified/Dead lead` (£201k) — dead, still `open`
- **58** in `Gone Cold (Pre-Quote)` (£308k) — dead, still `open`
- **~14** in `No contact / Contact attempt / New Enquiry` (£196k) — never engaged

Pulse already scores the dead/cold stages at weight 0, so its *weighted* pipeline
isn't inflated by them — but they still pad raw counts and the funnel's top, and
GHL's native view is fully warped.

## Confirmed defaults
| Setting | Value |
|---|---|
| Eject to nurture after | **14 days** with no engagement |
| "Engaged" means | a **two-way contact** — they reply, book an appointment, or connect on a call (email *opens* don't count) |
| Existing 138 dead/cold | **bulk-move into Nurture** (keeps them in the drip) |

---

## Build steps (all in the GHL UI — pipelines/workflows aren't API-creatable)

### Step 0 — Tags
Settings → Tags → create: `engaged`, `nurture`, `do-not-nurture` (manual override).

### Step 1 — "Long-term Nurture" pipeline
Opportunities → Pipelines → **Add Pipeline** → `Long-term Nurture`, stages:
`Cold – Nurturing` → `Re-engaging` → `Re-engaged (exit)` → `Dead / Unsubscribed`

### Step 2 — Workflow ① "Mark engaged"  *(build first — the others depend on it)*
- **Triggers (any):** Customer Replied · Appointment Status = Booked/Confirmed · Call Status = Connected
- **Filter:** opportunity in `Sales & Jobs` OR `Long-term Nurture`
- **Actions:** Add Tag `engaged` → Update Opportunity: if in an inbound stage, move to `Sales & Jobs / Contacted – Engaged`

### Step 3 — Workflow ② "Auto-eject stale inbound"  *(the core ask)*
- **Trigger:** Opportunity Created **and** Opportunity Stage Changed; pipeline = `Sales & Jobs`, stage ∈ {New Enquiry, Contact Attempt 1/2/3, No contact – Follow-up}. Allow re-enrolment so each stage change resets the clock.
- **Wait:** 14 days
- **If/Else:** contact has tag `engaged` OR `do-not-nurture`?
  - **Yes →** End
  - **No →** Update Opportunity → `Long-term Nurture / Cold – Nurturing`; Add Tag `nurture`  ← *auto-removal from active pipeline*

### Step 4 — Workflow ③ "Nurture re-engagement"  *(the way back in)*
- **Trigger:** Customer Replied; **filter:** opportunity in `Long-term Nurture`
- **Actions:** Update Opportunity → `Sales & Jobs / Contacted – Engaged` → Remove Tag `nurture` → Internal Notification to owner

### Step 5 — Drip + final death
Off `Cold – Nurturing`, run the monthly drip below. Backstop: after **6–12 months**
in Nurture with no engagement → set opportunity **status = Lost** (leaves "open" entirely).

### Step 6 — One-time cleanup of the existing 138
Opportunities → filter `Sales & Jobs`, stage `Unqualified/Dead lead` + `Gone Cold (Pre-Quote)`
→ select all → bulk Update → move to `Long-term Nurture / Cold – Nurturing`, add tag `nurture`.
Do this **after** the workflows are live.

### Step 7 — Pulse (handled separately, our side)
With `Sales & Jobs` engaged-only, Pulse's pipeline/funnel clean up automatically.
Follow-up: add a small "Nurture pool: N leads" read so cold leads stay visible
without padding progression.

---

## Safeguard
A lead a rep is actively working (outbound calls, no inbound reply yet) won't be
wrongly ejected at day 14: tag it `do-not-nurture`, or simply advance the stage —
either path keeps it out of the eject branch.

---

## Nurture drip copy (Step 5)

Long, low-pressure, value-first. ~Monthly. Merge field `{{contact.first_name}}`.
Every email needs an unsubscribe link; every SMS an opt-out. Tone: helpful local
expert, never salesy. Adjust the BUS figure if the rumoured Jul-26 uplift lands.

### Touch 1 — Email — Day 0 in nurture
**Subject:** Still weighing up a heat pump, {{contact.first_name}}?
> Hi {{contact.first_name}},
>
> You looked into a heat pump or solar with us a little while back and life
> probably got busy — no problem at all.
>
> No pitch here. Just a plain-English guide to what an air-source heat pump
> actually costs in a Devon home, and the running-cost difference vs oil/LPG/gas:
> **[link]**
>
> If it's useful and you'd ever like a no-obligation chat, just reply to this
> email and I'll pick it up personally.
>
> — Ben, EcoSphere Energy

### Touch 2 — SMS — Day ~20
> Hi {{contact.first_name}}, Ben at EcoSphere. The £7,500 government heat-pump
> grant is still open but won't run forever — happy to check if your home
> qualifies, no obligation. Reply YES for a quick look or STOP to opt out.

### Touch 3 — Email — Day ~45
**Subject:** £7,500 off — but the grant won't last forever
> Hi {{contact.first_name}},
>
> Quick one. The Boiler Upgrade Scheme currently knocks **£7,500** off an
> air-source heat pump install — it's government-backed and applied before you
> pay, but the scheme is reviewed periodically and won't be around indefinitely.
>
> Most of our Devon installs land the customer a system that's cheaper to run and
> far kinder on carbon. If you'd like me to check what your place would need (and
> what it'd cost after the grant), just reply.
>
> — Ben

### Touch 4 — Email — Day ~75 — social proof
**Subject:** What a heat pump did for a home down the road
> Hi {{contact.first_name}},
>
> Thought a real example might help more than any sales talk. A recent install
> near you: [short before/after — old fuel, new system, rough annual saving].
>
> Same survey-first approach we'd take with you — we only recommend a heat pump
> where it genuinely makes sense. Want me to see if yours is a good fit?
>
> — Ben

### Touch 5 — Email — Day ~105 — myth-busting
**Subject:** "Do heat pumps actually work in winter?" (and 3 other worries)
> Hi {{contact.first_name}},
>
> The four things people ask us most before going ahead:
> 1. *Do they work when it's cold?* Yes — they're standard across Scandinavia.
> 2. *Will my house be a building site?* Most installs are 2–3 days.
> 3. *Will my bills really drop?* Depends on what you're replacing — happy to model it for you.
> 4. *Is the grant hassle?* We handle the BUS paperwork end to end.
>
> Reply with the one that's on your mind and I'll answer straight.
>
> — Ben

### Touch 6 — Email — Day ~135 — the soft breakup
**Subject:** Should I close your file, {{contact.first_name}}?
> Hi {{contact.first_name}},
>
> I don't want to keep emailing if the timing isn't right. If a heat pump or
> solar isn't on your radar for now, no worries — just ignore this and I'll stop.
>
> But if you'd still like to explore it (grant included), reply and I'll get you
> a no-obligation survey booked.
>
> Either way, thanks for considering us.
>
> — Ben, EcoSphere Energy

> After Touch 6: drop cadence to a light quarterly check-in. If still no
> engagement by the 6–12 month backstop, mark the opportunity **Lost**.
