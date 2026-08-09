import { programming } from "../supabase/client";

export async function getSpcClient(userId) {
  const { data, error } = await programming.from("spc_clients").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// A spc_clients row existing is NOT the same as "enrolled" — toggling SPC
// off on the client detail page (handleSpcToggle) sets status='paused'
// rather than deleting the row, so it can be re-enabled without losing
// history. Every member-facing screen must check this, not just row
// presence, or a paused client keeps seeing SPC content after being
// unenrolled. Mirrors the coach-side client detail page's own
// `spcActive = Boolean(spcClient && spcClient.status !== "paused")` check.
export function isSpcActive(spcClient) {
  return Boolean(spcClient && spcClient.status !== "paused");
}

export async function assignSpcClient(userId, coachId, sessionsPerWeek = 2) {
  const { error } = await programming
    .from("spc_clients")
    .upsert(
      { user_id: userId, assigned_coach_id: coachId, sessions_per_week: sessionsPerWeek, status: "needs_printed" },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

export async function setSpcStatus(userId, status) {
  const { error } = await programming.from("spc_clients").update({ status }).eq("user_id", userId);
  if (error) throw error;
}

// Free-form patch for notes/goals/feedback, coach reassignment, sessions/week
// — whatever subset of fields the caller passes.
export async function updateSpcClient(userId, fields) {
  const { error } = await programming.from("spc_clients").update(fields).eq("user_id", userId);
  if (error) throw error;
}
