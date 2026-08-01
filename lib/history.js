import { programming } from "./supabase/client";
import { listLogs } from "./nutrition/dailyLog";
import { deriveCalories } from "./nutrition/targets";
import { dateInBoise } from "./boiseDate";

// My History's "By Day" timeline — merges finalized sessions (group/SPC/
// one-off, via session_completions) with finalized nutrition days into one
// date-descending list. Net-new: nothing before this combined this data
// across programming and nutrition. Session set/exercise counts are summed
// per calendar date rather than per specific session (which would need
// matching completions to logs.source, ambiguous for group entries where
// source varies by program name) — two sessions finalized the same day
// would share one combined count, a rare enough edge case that isn't worth
// the extra join complexity for a history display.
export async function listDayTimeline(userId) {
  const [completionsResult, logsResult, nutritionLogs] = await Promise.all([
    programming
      .from("session_completions")
      .select(
        `id, completed_at,
         group_workouts ( session_number, title, group_blocks ( group_programs ( name ) ) ),
         spc_workouts ( session_number, title ),
         one_off_workouts ( title )`
      )
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
    programming.from("logs").select("exercise_id, date_performed").eq("user_id", userId),
    listLogs(userId, { limit: 200 }),
  ]);
  if (completionsResult.error) throw completionsResult.error;
  if (logsResult.error) throw logsResult.error;

  const dateCounts = new Map(); // date -> { exerciseIds: Set, setCount }
  for (const row of logsResult.data) {
    if (!dateCounts.has(row.date_performed)) dateCounts.set(row.date_performed, { exerciseIds: new Set(), setCount: 0 });
    const entry = dateCounts.get(row.date_performed);
    entry.exerciseIds.add(row.exercise_id);
    entry.setCount += 1;
  }

  const sessionEntries = completionsResult.data.map((c) => {
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
    const counts = dateCounts.get(date);
    return {
      type: "session",
      id: c.id,
      date,
      label,
      subtitle: counts
        ? `${counts.exerciseIds.size} exercise${counts.exerciseIds.size === 1 ? "" : "s"} · ${counts.setCount} set${counts.setCount === 1 ? "" : "s"} logged`
        : "Logged",
    };
  });

  const nutritionEntries = nutritionLogs
    .filter((log) => log.finalized_at)
    .map((log) => {
      const calories = Math.round(deriveCalories(log));
      const parts = [];
      if (calories > 0) parts.push(`${calories.toLocaleString()} cal`);
      if (log.weight) parts.push(`${log.weight} lb`);
      return {
        type: "nutrition",
        id: log.id,
        date: log.log_date,
        label: "Nutrition logged",
        subtitle: parts.length > 0 ? parts.join(" · ") : "Finalized",
      };
    });

  return [...sessionEntries, ...nutritionEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
