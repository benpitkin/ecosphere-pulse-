// assistant route — chat over live business data, with optional persistence
import { NextResponse } from "next/server";
import { buildBusinessContext } from "@/lib/assistant-context";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };

const TABLE = "pulse_assistant_messages";

const SYSTEM_PREAMBLE = `You are the EcoSphere Pulse assistant — a sharp, plain-speaking finance and operations advisor for Ben, who runs EcoSphere Energy, a heat-pump and solar installer in Devon, UK.

You have his live business data below. Use it to answer concretely and practically, in UK English, with £ figures. Be direct and concise — a few short paragraphs at most, and only use a short list when it genuinely helps.

Rules:
- Ground every claim in the data provided. If a number isn't here, say you don't have it rather than guessing.
- You can reason about cash, runway, the forecast scenarios (owner draw, marketing, clearing Capital on Tap, hiring), pipeline, scheduled installs, overdue invoices and debt.
- You are an advisor, not an accountant or regulated financial adviser — for tax, financing and legal specifics, remind Ben to confirm with his accountant.
- Never invent jobs, customers or figures. Don't claim to take actions (you can't move money or change records) — you discuss and advise only.

=== LIVE BUSINESS DATA ===
`;

/** Persist messages. No-ops silently if the table doesn't exist yet. */
async function save(rows: Msg[]) {
  try {
    const admin = createAdminClient();
    await admin.from(TABLE).insert(rows.map((r) => ({ role: r.role, content: r.content })));
  } catch {
    /* table not created yet — persistence is optional */
  }
}

/** GET: return saved chat history (most recent 60), oldest first. */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return NextResponse.json({ messages: [] });
    const messages = (data ?? [])
      .reverse()
      .map((r: { role: string; content: string }) => ({ role: r.role, content: r.content }));
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "The assistant isn't switched on yet. Add an ANTHROPIC_API_KEY environment variable to this Pulse project in Vercel (the same kind of key Dispatch's assistant uses), redeploy, and I'll be able to talk through your numbers here.",
      configured: false,
    });
  }

  let messages: Msg[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ reply: "Couldn't read your message.", configured: true }, { status: 400 });
  }

  const cleaned = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (!cleaned.length) return NextResponse.json({ reply: "Ask me something about the business.", configured: true });

  let context = "";
  try {
    context = await buildBusinessContext();
  } catch (e) {
    context = "(Live data couldn't be loaded right now: " + (e instanceof Error ? e.message : String(e)) + ")";
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PREAMBLE + context,
        messages: cleaned.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return NextResponse.json({ reply: `Assistant error: ${msg}`, configured: true }, { status: 200 });
    }
    const reply =
      Array.isArray(data?.content) && data.content[0]?.text ? data.content[0].text : "(No reply produced.)";

    // Persist the new exchange (last user message + this reply).
    const lastUser = cleaned[cleaned.length - 1];
    if (lastUser?.role === "user") await save([lastUser, { role: "assistant", content: reply }]);

    return NextResponse.json({ reply, configured: true });
  } catch (e) {
    return NextResponse.json(
      { reply: "Couldn't reach the assistant service: " + (e instanceof Error ? e.message : String(e)), configured: true },
      { status: 200 },
    );
  }
}
