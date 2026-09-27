import { core } from "../supabase/client";

// Accounts the coach dashboard ignores (0136): test accounts, mostly. Hidden
// from the dashboard's counts and lists ONLY. The Clients page, the live
// board and every automation still treat them like anyone else.

// The set of hidden user ids. Never throws: if this fails the dashboard
// shows everyone, which is the right way to fail. Too much beats silently
// hiding a real client.
export async function listHiddenUserIds() {
  try {
    const { data, error } = await core.from("dashboard_hidden_users").select("user_id");
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.user_id));
  } catch (err) {
    console.error("Hidden accounts: load failed", err);
    return new Set();
  }
}

// Unlike listHiddenUserIds this throws, because the Settings tab needs to
// tell "nobody hidden" apart from "couldn't load".
export async function listHiddenAccounts() {
  const { data: rows, error } = await core
    .from("dashboard_hidden_users")
    .select("user_id, hidden_at")
    .order("hidden_at", { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];
  const { data: users, error: usersError } = await core
    .from("users")
    .select("id, name, email, role")
    .in("id", rows.map((r) => r.user_id));
  if (usersError) throw usersError;
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  return rows
    .map((r) => ({ ...byId.get(r.user_id), id: r.user_id, hiddenAt: r.hidden_at }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

// Everyone who could be hidden: members and staff (a coach who trains can
// land on the gym lists too), minus the wall display.
export async function listHideableAccounts() {
  const { data, error } = await core
    .from("users")
    .select("id, name, email, role")
    .eq("is_gym_display", false)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// Selected back, because an RLS-filtered write reports success with 0 rows.
export async function hideAccount(userId, hiddenBy) {
  const { data, error } = await core
    .from("dashboard_hidden_users")
    .upsert({ user_id: userId, hidden_by: hiddenBy ?? null }, { onConflict: "user_id" })
    .select("user_id");
  if (error) throw error;
  if (!data?.length) throw new Error("Couldn't hide that account. Only an admin can change this list.");
}

export async function unhideAccount(userId) {
  const { data, error } = await core.from("dashboard_hidden_users").delete().eq("user_id", userId).select("user_id");
  if (error) throw error;
  if (!data?.length) throw new Error("Couldn't unhide that account. Only an admin can change this list.");
}
