import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/assistant-context";

export const dynamic = "force-dynamic";

// GET = load chat history (pulse_assistant_messages); POST = ask the assistant.
// TODO: persist to/from Supabase; call Anthropic (claude-sonnet-4-6) with the context.
// See docs/HANDOVER.md §5 (app/api/assistant).
export async function GET() {
  return NextResponse.json({ messages: [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { message?: string };
  const context = await buildAssistantContext();
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return NextResponse.json({
    reply: "TODO: wire Anthropic call",
    received: body.message ?? null,
    contextKeys: Object.keys(context),
  });
}
