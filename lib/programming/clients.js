import { core, programming, supabase } from "../supabase/client";

// The gym-floor TV signs in as a real core.users row (role "member",
// is_gym_display set — migration 0071), so without the filter it shows up on
// the Clients roster as a client called "Gym Display", counts toward the
// unassigned tally, and carries an Assign badge. It is a screen, not a person.
export async function listMembers() {
  const { data, error } = await core
    .from("users")
    .select("*")
    .eq("role", "member")
    .eq("is_gym_display", false)
    .order("name");
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
export async function updateCoachPermissions(userId, { canViewSpc, canViewNutrition, canViewExerciseLibrary, canLogOpsHours }) {
  const patch = {};
  if (canViewSpc !== undefined) patch.can_view_spc = canViewSpc;
  if (canViewNutrition !== undefined) patch.can_view_nutrition = canViewNutrition;
  if (canViewExerciseLibrary !== undefined) patch.can_view_exercise_library = canViewExerciseLibrary;
  if (canLogOpsHours !== undefined) patch.can_log_ops_hours = canLogOpsHours;
  const { error } = await core.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

// Creates (or promotes an existing account to) a coach/admin login via the
// invite-staff Edge Function — that step needs the service-role Auth Admin
// API, which the client app can't call directly.
//
// `existingUserId` (a core.users id picked from the client search) is what
// tells the function this person already has a login, so it skips the
// invite email entirely and just changes their role. `permissions` is
// always sent in full — module access is chosen per account, never left to
// the columns' own defaults.
//
// Returns { profile, invited } — `invited` is true only when an invite
// email actually went out, so callers can word their confirmation
// correctly instead of assuming.
export async function inviteStaffMember({ name, email, role, existingUserId, permissions }) {
  const { data, error } = await supabase.functions.invoke("invite-staff", {
    body: { name, email, role, existingUserId: existingUserId ?? null, permissions: permissions ?? {} },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return { profile: data.profile, invited: Boolean(data.invited) };
}

// supabase-js throws a FunctionsHttpError whose .message is always the same
// generic "non-2xx status code" string — the real reason is in the response
// body on .context. Same fix as register.js / sendPush.js.
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context?.json();
    if (body?.error) return body.error;
  } catch {
    // Not JSON, or no context at all — fall through to the generic message.
  }
  return error.message ?? "Something went wrong.";
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
    .select("*, group_programs(id, name, block_length_weeks, sessions_per_week, session_days)")
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
