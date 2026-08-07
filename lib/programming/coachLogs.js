import { programming } from "../supabase/client";
import { dateInBoise } from "../boiseDate";

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

  return data.map((c) => {
    const date = dateInBoise(new Date(c.completed_at));
    let label;
    if (c.group_workouts) {
      const programName = c.group_workouts.group_blocks?.group_programs?.name ?? "Group";
      label = `${programName} — Session ${c.group_workouts.session_number}${c.group_workouts.title ? `, ${c.group_workouts.title}` : ""}`;
    } else if (c.spc_workouts) {
      label = `SPC — Session ${c.spc_workouts.session_number}${c.spc_workouts.title ? `, ${c.spc_workouts.title}` : ""}`;
    } else {
      label = c.one_off_workouts?.title || "One-off workout";
    }
    return { id: c.id, date, completedAt: c.completed_at, label };
  });
}
