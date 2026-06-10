import type { CrewMember } from "./types";
import { supabaseServiceOptional } from "./supabase";

// `sub_directory` is a service-role-only view. Columns: id, name, status, trades[].
interface SubDirRow {
  name: string | null;
  status: string | null;
  trades: string[] | null;
}

// Crew from the secured `sub_directory` view. There's no `role` column — derive it from
// the trades array (falling back to status) so CrewMember.role is meaningful.
export async function getCrew(): Promise<CrewMember[]> {
  const supabase = supabaseServiceOptional();
  if (!supabase) return []; // no creds -> render empty, don't crash
  const { data } = await supabase.from("sub_directory").select("name, status, trades");
  return ((data as SubDirRow[] | null) ?? []).map((r) => ({
    name: r.name ?? "Unknown",
    role: (r.trades ?? []).join(" · ") || r.status || "—",
  }));
}
