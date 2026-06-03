"use client";

import { useRef, useState, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's my cash runway right now?",
  "Can I afford to put my take-home up to £4k?",
  "Which installs are coming up and what are they worth?",
  "Should I refinance the Capital on Tap balance?",
  "What's the single best thing I can do for cash this week?",
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Lightweight, injection-safe markdown: escapes first, then formats bold,
 *  inline code, bullet/numbered lists and paragraphs. */
function renderMarkdown(text: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">$1</code>');

  const blocks = text.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const isBullet = lines.every((l) => /^\s*[-•]\s+/.test(l));
    const isNum = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isBullet && lines.length) {
      out.push('<ul class="my-1 ml-4 list-disc space-y-1">' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("") + "</ul>");
    } else if (isNum && lines.length) {
      out.push('<ol class="my-1 ml-4 list-decimal space-y-1">' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("") + "</ol>");
    } else {
      out.push("<p>" + lines.map(inline).join("<br/>") + "</p>");
    }
  }
  return out.join("");
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load any saved history once on mount (no-op if persistence isn't enabled).
  useEffect(() => {
    let active = true;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d) => {
        if (active && Array.isArray(d.messages) && d.messages.length) setMessages(d.messages);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "(no reply)" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't reach the assistant just now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-3xl flex-col px-4 py-6 sm:px-8">
      <div className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Talk through the business — cash, runway, the forecast, jobs and pipeline. It reads your live numbers.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-border bg-white/60 p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ask me anything about EcoSphere&apos;s numbers. For example:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div
                  className="assistant-md max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              </div>
            ),
          )
        )}
        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">Thinking…</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about cash, runway, jobs, the forecast…"
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Advisory only — confirm tax, financing and legal decisions with your accountant.
      </p>
    </div>
  );
}
