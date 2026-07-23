import { core, programming } from "../supabase/client";

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

export async function getAssignment(userId) {
  const { data, error } = await programming
    .from("client_program_assignments")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function assignProgram(userId, groupProgramId) {
  const { error } = await programming
    .from("client_program_assignments")
    .upsert({ user_id: userId, group_program_id: groupProgramId }, { onConflict: "user_id" });
  if (error) throw error;
}
