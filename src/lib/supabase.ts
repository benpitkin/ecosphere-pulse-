import { createClient } from "@supabase/supabase-js";

// Service-role client (server only) — required for the secured `sub_directory` view.
// Supabase project ref: vmocndzlznzfvuedginn (SHARED with the Dispatch app).
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing (see .env.example)");
  return createClient(url, key, { auth: { persistSession: false } });
}
