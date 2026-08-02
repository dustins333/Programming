import { core, programming, supabase } from "../supabase/client";

export async function listMembers() {
  const { data, error } = await core.from("users").select("*").eq("role", "member").order("name");
  if (error) throw error;
  return data;
}

export async function getUser(userId) {
  const { data, error } = await core.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCoaches() {
  const { data, error } = await core.from("users").select("*").in("role", ["admin", "coach"]).order("name");
  if (error) throw error;
  return data;
}

// Which of the SPC/Nutrition/Exercise Library modules a coach account can
// see — admin rows ignore these (core.can_access_*() always passes for an
// admin regardless of column value), so this only meaningfully applies to
// role: "coach" rows.
export async function updateCoachPermissions(userId, { canViewSpc, canViewNutrition, canViewExerciseLibrary }) {
  const patch = {};
  if (canViewSpc !== undefined) patch.can_view_spc = canViewSpc;
  if (canViewNutrition !== undefined) patch.can_view_nutrition = canViewNutrition;
  if (canViewExerciseLibrary !== undefined) patch.can_view_exercise_library = canViewExerciseLibrary;
  const { error } = await core.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

// Creates (or promotes an existing account to) a coach/admin login via the
// invite-staff Edge Function — that step needs the service-role Auth Admin
// API, which the client app can't call directly. Returns the new/updated
// core.users profile row.
export async function inviteStaffMember({ name, email, role }) {
  const { data, error } = await supabase.functions.invoke("invite-staff", {
    body: { name, email, role },
  });
  if (error) throw error;
  return data.profile;
}

// Admin RLS permits inserting any core.users row (see "admin can manage
// users" policy) — but the underlying auth.users account itself has to
// already exist, since creating one requires the service-role Auth Admin
// API (not something the client app can call). Until the invite-by-email
// Edge Function is deployed, this is the manual bridge: an admin creates
// the auth user via the Supabase dashboard, then links it here by pasting
// its UUID. Same one-off/manual pattern the Nutrition Tracker app used to
// bootstrap its first accounts.
export async function linkMemberByAuthId({ id, name, email, phone }) {
  const { data, error } = await core
    .from("users")
    .insert({ id, name, email, phone: phone || null, role: "member" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listAssignments() {
  const { data, error } = await programming.from("client_program_assignments").select("*");
  if (error) throw error;
  return data;
}

// Every group program this client currently holds a membership in — a
// client can be enrolled in more than one at once (e.g. Flagship plus a
// specialty program like "Look Like You Lift"), so this replaces the old
// single-row getAssignment/.maybeSingle() shape.
export async function listAssignmentsForUser(userId) {
  const { data, error } = await programming
    .from("client_program_assignments")
    .select("*, group_programs(id, name, block_length_weeks, sessions_per_week)")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

// Joining a program — upserts on the (user_id, group_program_id) unique
// constraint so calling this on a membership that already exists (e.g. a
// toggle that's already on) just no-ops instead of erroring on a duplicate
// row.
export async function addGroupMembership(userId, groupProgramId, sessionsPerWeek = 3) {
  const { error } = await programming
    .from("client_program_assignments")
    .upsert(
      { user_id: userId, group_program_id: groupProgramId, sessions_per_week: sessionsPerWeek },
      { onConflict: "user_id,group_program_id" }
    );
  if (error) throw error;
}

export async function removeGroupMembership(userId, groupProgramId) {
  const { error } = await programming
    .from("client_program_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("group_program_id", groupProgramId);
  if (error) throw error;
}

// How many of a program's weekly sessions this specific client is expected
// to complete (1x/2x/3x membership) — mirrors spc_clients' existing
// sessions_per_week. Scoped by (user_id, group_program_id) now that a
// client can hold more than one membership, each with its own frequency.
export async function setMembershipSessionsPerWeek(userId, groupProgramId, sessionsPerWeek) {
  const { error } = await programming
    .from("client_program_assignments")
    .update({ sessions_per_week: sessionsPerWeek })
    .eq("user_id", userId)
    .eq("group_program_id", groupProgramId);
  if (error) throw error;
}
