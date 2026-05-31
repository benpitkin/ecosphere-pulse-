import { createClient } from "@supabase/supabase-js";

/** Service-role Supabase client. Server-only — never expose to the browser.
 *  Pulse's two tables are RLS-locked, so only this client can read/write them. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
