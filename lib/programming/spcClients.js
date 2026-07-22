import { programming } from "../supabase/client";

export async function listSpcClients() {
  const { data, error } = await programming.from("spc_clients").select("*");
  if (error) throw error;
  return data;
}

export async function getSpcClient(userId) {
  const { data, error } = await programming.from("spc_clients").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
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
