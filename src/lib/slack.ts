// ---------------------------------------------------------------------------
// Minimal Slack webhook poster. Like email.ts: never throws — a failed post
// must not break the cron run. No-op when SLACK_WEBHOOK_URL is unset.
// ---------------------------------------------------------------------------

export async function postSlack(text: string, blocks?: unknown[]): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
