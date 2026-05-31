// ---------------------------------------------------------------------------
// Minimal single-user auth: one shared password (PULSE_PASSWORD) exchanged for
// an HMAC-signed session cookie. Uses the Web Crypto API so the same code runs
// in Edge middleware and Node route handlers. Swappable for Supabase Auth later.
// ---------------------------------------------------------------------------

const COOKIE = "pulse_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.PULSE_SESSION_SECRET || process.env.PULSE_PASSWORD || "dev-secret";
}

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(): Promise<string> {
  const issued = Date.now().toString();
  return `${issued}.${await hmacHex(issued)}`;
}

export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [issued, sig] = token.split(".");
  if (!issued || !sig) return false;
  const expected = await hmacHex(issued);
  if (!constantTimeEqual(sig, expected)) return false;
  return Date.now() - Number(issued) < MAX_AGE_MS;
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.PULSE_PASSWORD || "";
  if (!expected) return false;
  return constantTimeEqual(pw, expected);
}

export const SESSION_COOKIE = COOKIE;
