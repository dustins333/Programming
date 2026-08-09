import { programming, core } from "../supabase/client";
import { dateInBoise } from "../boiseDate";

function labelForCompletion(c) {
  if (c.group_workouts) {
    const programName = c.group_workouts.group_blocks?.group_programs?.name ?? "Group";
    return `${programName} — Session ${c.group_workouts.session_number}${c.group_workouts.title ? `, ${c.group_workouts.title}` : ""}`;
  }
  if (c.spc_workouts) {
    return `SPC — Session ${c.spc_workouts.session_number}${c.spc_workouts.title ? `, ${c.spc_workouts.title}` : ""}`;
  }
  return c.one_off_workouts?.title || "One-off workout";
}

// Roster-wide version of listRecentSessionsForUser below — every finalized
// session since a given Boise-local date, newest first, with member names
// merged client-side from core.users (cross-schema embeds are avoided by
// convention). Backs the coach dashboard's "Sessions this week" tile +
// drill-down feed; before this the only way to see who trained was opening
// each client's page one at a time. The completed_at filter over-fetches by
// a day of UTC slack and re-filters on the Boise-local date so the week
// boundary is the same one every other screen uses.
export async function listSessionsSinceAllUsers(sinceDate, limit = 500) {
  const utcFloor = new Date(`${sinceDate}T00:00:00Z`);
  utcFloor.setUTCDate(utcFloor.getUTCDate() - 1);
  const { data, error } = await programming
    .from("session_completions")
    .select(
      `id, user_id, completed_at,
       group_workouts ( session_number, title, group_blocks ( group_programs ( name ) ) ),
       spc_workouts ( session_number, title ),
       one_off_workouts ( title )`
    )
    .gte("completed_at", utcFloor.toISOString())
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data
    .map((c) => ({ id: c.id, userId: c.user_id, date: dateInBoise(new Date(c.completed_at)), completedAt: c.completed_at, label: labelForCompletion(c) }))
    .filter((r) => r.date >= sinceDate);
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const { data: users, error: usersError } = await core.from("users").select("id, name").in("id", userIds);
  if (usersError) throw usersError;
  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: nameById[r.userId] ?? "Unknown" }));
}

// Coach-facing mirror of My History's day timeline (lib/history.js's
// listDayTimeline) — same session_completions query and label logic, minus
// the nutrition/milestone merging that's irrelevant to "what did this
// client actually lift." Scoped by an arbitrary userId instead of the
// caller's own auth.uid(), which the existing "staff can read session
// completions" policy (0007) already allows — no migration needed.
// Per-set detail for a given session is a separate fetch (memberPlan.js's
// listLogsForDate, reused as-is — same RLS story as getCurrentBlock being
// reused for the coach client-detail page elsewhere in this file) so this
// list itself stays cheap for a client with a long history.
export async function listRecentSessionsForUser(userId, limit = 12) {
  const { data, error } = await programming
    .from("session_completions")
    .select(
      `id, completed_at,
       group_workouts ( session_number, title, group_blocks ( group_programs ( name ) ) ),
       spc_workouts ( session_number, title ),
       one_off_workouts ( title )`
    )
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((c) => ({ id: c.id, date: dateInBoise(new Date(c.completed_at)), completedAt: c.completed_at, label: labelForCompletion(c) }));
}
