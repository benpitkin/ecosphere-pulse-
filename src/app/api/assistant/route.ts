import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAssistantContext } from "@/lib/assistant-context";
import { supabaseServiceOptional } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Project-pinned model (see CLAUDE.md). Exact ID, no date suffix.
const MODEL = "claude-sonnet-4-6";

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

// Persisted chat history from pulse_assistant_messages, oldest first.
async function loadHistory(): Promise<StoredMessage[]> {
  const supabase = supabaseServiceOptional();
  if (!supabase) return [];
  const { data } = await supabase
    .from("pulse_assistant_messages")
    .select("role, content")
    .order("created_at", { ascending: true });
  return (data as StoredMessage[] | null) ?? [];
}

export async function GET() {
  return NextResponse.json({ messages: await loadHistory() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { message?: string };
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      reply: "The assistant isn't configured yet — set `ANTHROPIC_API_KEY` to enable it.",
    });
  }

  const [history, context] = await Promise.all([loadHistory(), buildAssistantContext()]);

  const system = [
    "You are the EcoSphere Pulse assistant for Ben, owner of EcoSphere Energy — an air-source",
    "heat-pump (ASHP) and solar installer in Devon, UK. Answer questions about his live business",
    "using the snapshot below. Be concise and practical, format replies in markdown, and treat all",
    "money as GBP. If the snapshot doesn't contain something, say so rather than guessing.",
    "",
    "LIVE SNAPSHOT (JSON):",
    JSON.stringify(context),
  ].join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let reply: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: message },
      ],
    });
    reply = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Assistant error: ${detail}` }, { status: 502 });
  }

  // Persist the turn (best-effort; don't fail the response if the write hiccups).
  const supabase = supabaseServiceOptional();
  if (supabase) {
    await supabase.from("pulse_assistant_messages").insert([
      { role: "user", content: message },
      { role: "assistant", content: reply },
    ]);
  }

  return NextResponse.json({ reply });
}
