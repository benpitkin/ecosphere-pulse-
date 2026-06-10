import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase project ref: vmocndzlznzfvuedginn (SHARED with the Dispatch app).
// Service-role key is required for the secured `sub_directory` view.
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Throws if env is missing — use when Supabase is genuinely required.
export function supabaseService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing (see .env.example)");
  return createClient(url, key, {
    auth: { persistSession: false },
    // Bypass Next.js's fetch Data Cache: Pulse is live-on-load, and a cached empty
    // result (e.g. reading a table before its row exists) would otherwise persist.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

// Returns null if env is missing — lets pages render cleanly before secrets are set.
export function supabaseServiceOptional(): SupabaseClient | null {
  return hasSupabaseEnv() ? supabaseService() : null;
}
