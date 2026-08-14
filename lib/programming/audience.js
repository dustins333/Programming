import { programming, supabase } from "../supabase/client";
import { getSpcClient, isSpcActive } from "./spcClients";

// Shared audience resolution for anything broadcast to a filtered slice of
// the gym — announcements (0024) and events (0061) both use the same
// target_type / target_group_program_id pair.
//
// Extracted out of lib/programming/announcements.js when events needed the
// identical logic. A third hand-maintained copy is exactly how these drift,
// and the drift is invisible until someone is silently included in or
// excluded from a broadcast.
//
// Mirrors the server-side resolver in
// supabase/functions/_shared/announcementAudience.ts — kept in sync by hand,
// since one runs in Deno against every member and this one only ever
// resolves the CALLING member's own membership, which is a handful of narrow
// lookups rather than a full roster scan.

// `rows` is any array of records carrying a target_type — only the lookups
// actually needed by that set are performed.
export async function resolveMemberAudienceFlags(userId, rows) {
  const flags = { groupProgramIds: null, spcActive: null, nutritionActive: null };

  if (rows.some((r) => r.target_type === "group_program")) {
    const { data, error } = await programming
      .from("client_program_assignments")
      .select("group_program_id")
      .eq("user_id", userId);
    if (error) throw error;
    flags.groupProgramIds = (data ?? []).map((r) => r.group_program_id);
  }

  if (rows.some((r) => r.target_type === "spc")) {
    const spcClient = await getSpcClient(userId);
    flags.spcActive = isSpcActive(spcClient);
  }

  if (rows.some((r) => r.target_type === "nutrition")) {
    // Cross-schema on purpose: nutrition lives in the standalone app's
    // public.* tables, so this is the plain client with no .schema() call.
    const { data, error } = await supabase.from("clients").select("status").eq("id", userId).maybeSingle();
    if (error) throw error;
    flags.nutritionActive = data?.status === "active";
  }

  return flags;
}

export function matchesAudience(row, flags) {
  switch (row.target_type) {
    case "group_program":
      return flags.groupProgramIds?.includes(row.target_group_program_id) ?? false;
    case "spc":
      return Boolean(flags.spcActive);
    case "nutrition":
      return Boolean(flags.nutritionActive);
    default:
      return true;
  }
}

// Convenience wrapper for the common "filter this list to what the member
// is actually in" case.
export async function filterToAudience(userId, rows) {
  if (rows.length === 0) return [];
  const flags = await resolveMemberAudienceFlags(userId, rows);
  return rows.filter((r) => matchesAudience(r, flags));
}
