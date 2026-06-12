// ---------------------------------------------------------------------------
// Cron endpoint — daily Pulse digest to Slack.
//
// Pinged daily (Vercel cron or pg_cron). Builds the Pulse, and if any action
// is warning/critical, posts a digest to Slack. Protected by CRON_SECRET.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { buildPulse } from "@/lib/pulse";
import { postSlack } from "@/lib/slack";
import { recordSnapshot } from "@/lib/snapshots";
import { fetchScheduledInstalls } from "@/lib/dispatch-jobs";

export const dynamic = "force-dynamic";

function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return "£" + Math.round(n).toLocaleString("en-GB");
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const pulse = await buildPulse();
  const m = pulse.metrics;

  // Capture today's snapshot for the cockpit trend lines (best-effort, one row/day).
  try {
    const installs = await fetchScheduledInstalls();
    await recordSnapshot(pulse, { value: installs.total_value, count: installs.jobs.length });
  } catch {
    /* snapshot is best-effort — never block the digest */
  }

  const flagged = pulse.actions.filter((a) => a.severity !== "info");

  // Only ping when something actually needs attention.
  if (!flagged.length) {
    return NextResponse.json({ posted: false, reason: "nothing flagged" });
  }

  const header = `*EcoSphere Pulse — ${new Date().toLocaleDateString("en-GB")}*`;
  const headline =
    `Cash ${gbp(m.cash)} · Runway ${m.runway_months != null ? m.runway_months + "mo" : "—"} · ` +
    `Overdue ${gbp(m.overdue)} · Weighted pipeline ${gbp(pulse.pipeline.configured ? pulse.pipeline.weighted_value : null)}`;
  const lines = flagged
    .map((a) => `${a.severity === "critical" ? "🔴" : "🟠"} *${a.title}* — ${a.detail}`)
    .join("\n");

  const text = `${header}\n${headline}\n\n${lines}`;
  const posted = await postSlack(text);
  return NextResponse.json({ posted, flagged: flagged.length });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
