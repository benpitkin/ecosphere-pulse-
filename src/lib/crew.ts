import type { CrewMember } from "./types";
import { supabaseService } from "./supabase";

// Reads the secured `sub_directory` view (service-role only) + job_offers.
// TODO: port real query. See docs/HANDOVER.md §5.
export async function getCrew(): Promise<CrewMember[]> {
  const supabase = supabaseService();
  const { data } = await supabase.from("sub_directory").select("*");
  return (data as unknown as CrewMember[]) ?? [];
}
