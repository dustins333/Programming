import { programming } from "../supabase/client";

// The one shared card (migration 0078). A coach writes it; the client reads
// it on the session they're logging; the wall display shows it next to their
// name. Everything else about a client that a coach writes down —
// client_notes, client_limitations (0057), spc_clients.notes_goals_feedback
// — is staff-only. This one is not, which is the whole point of it being a
// separate field rather than a second use of an existing one.
//
// One row per client, overwritten in place. Clearing deletes the row, so
// "no goal" is always `null` at every call site and never an empty string.

export async function getClientGoal(userId) {
  const { data, error } = await programming
    .from("client_goals")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Batched for the live hub, which resolves up to 4 clients per poll, and for
// any future roster surface. Returns Map<userId, goalRow>.
export async function listClientGoals(userIds) {
  const ids = (userIds ?? []).filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data, error } = await programming.from("client_goals").select("*").in("user_id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.user_id, row]));
}

// An empty/whitespace-only goal deletes rather than storing '' — see the
// migration header. Returns the stored row, or null once cleared.
export async function setClientGoal(userId, goal, updatedBy) {
  const trimmed = (goal ?? "").trim();
  if (!trimmed) {
    const { error } = await programming.from("client_goals").delete().eq("user_id", userId);
    if (error) throw error;
    return null;
  }
  const { data, error } = await programming
    .from("client_goals")
    .upsert(
      { user_id: userId, goal: trimmed, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
