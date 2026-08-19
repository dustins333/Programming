import { programming } from "./supabase/client";
import { listLogs } from "./nutrition/dailyLog";
import { effectiveCalories } from "./nutrition/targets";
import { listCompletedMilestones } from "./nutrition/milestones";
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
        `id, completed_at, group_workout_id, spc_workout_id, one_off_workout_id,
         group_workouts ( session_number, title, group_blocks ( group_programs ( name ) ) ),
         spc_workouts ( session_number, title ),
         one_off_workouts ( title )`
      )
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
    // Ordered and bounded explicitly. Without either, PostgREST's own
    // max-rows cap (1000 by default) truncated this arbitrarily, so a
    // long-tenured member's "N exercises · M sets logged" subtitles were
    // computed from a random slice of their history.
    programming
      .from("logs")
      .select("exercise_id, date_performed, group_workout_id, spc_workout_id, one_off_workout_id")
      .eq("user_id", userId)
      // Imported TrueCoach history is per-lift only, deliberately — she
      // didn't do those sessions in Kova and the day timeline shouldn't
      // count them, even into a same-day Kova session's set total.
      .is("truecoach_import_id", null)
      .order("date_performed", { ascending: false })
      .limit(5000),
    // Isolated for the same reason the milestones fetch below is: a member
    // with no nutrition access at all shouldn't lose their whole training
    // timeline to it.
    listLogs(userId, { limit: 200 }).catch((err) => {
      console.error("My History: nutrition logs failed", err);
      return [];
    }),
  ]);
  if (completionsResult.error) throw completionsResult.error;
  if (logsResult.error) throw logsResult.error;

  // Own try/catch, isolated from the Promise.all above — a milestones
  // fetch failure (e.g. a member with no nutrition access at all) shouldn't
  // take down the session/nutrition-log history that has nothing to do
  // with it, same "one domain's failure shouldn't hide another" pattern
  // used elsewhere in this app.
  let completedMilestones = [];
  try {
    completedMilestones = await listCompletedMilestones(userId);
  } catch {
    // leave empty
  }

  // Counts are tallied twice: per session (0063) and, for rows written
  // before that column existed, per calendar date. A session that has real
  // session-stamped logs uses its own exact count; anything older falls back
  // to the date, which is what every row used to do — and which reads two
  // sessions finalized in one evening as identical.
  const sessionKeyOf = (row) =>
    row.group_workout_id ? `g:${row.group_workout_id}` : row.spc_workout_id ? `s:${row.spc_workout_id}` : row.one_off_workout_id ? `o:${row.one_off_workout_id}` : null;

  const tally = (map, key, row) => {
    if (!map.has(key)) map.set(key, { exerciseIds: new Set(), setCount: 0 });
    const entry = map.get(key);
    entry.exerciseIds.add(row.exercise_id);
    entry.setCount += 1;
  };

  const dateCounts = new Map(); // date -> { exerciseIds: Set, setCount }
  const sessionCounts = new Map(); // session key -> same
  for (const row of logsResult.data) {
    tally(dateCounts, row.date_performed, row);
    const key = sessionKeyOf(row);
    if (key) tally(sessionCounts, key, row);
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
    const counts = sessionCounts.get(sessionKeyOf(c)) ?? dateCounts.get(date);
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
      const calories = Math.round(effectiveCalories(log));
      const parts = [];
      if (calories > 0) parts.push(`${calories.toLocaleString()} cal`);
      if (log.weight) parts.push(`${log.weight} lb`);
      return {
        type: "nutrition",
        id: log.id,
        date: log.date,
        label: "Nutrition logged",
        subtitle: parts.length > 0 ? parts.join(" · ") : "Finalized",
      };
    });

  const milestoneEntries = completedMilestones.map((m) => ({
    type: "milestone",
    id: m.id,
    date: dateInBoise(new Date(m.completed_at)),
    label: m.title,
    subtitle: "Milestone completed",
    // title/details/completed_at duplicated alongside label/subtitle —
    // DayRow reads the label/subtitle pair every entry type shares,
    // MilestoneDetailModal reads the milestone-shaped title/details/
    // completed_at fields directly (same object works for both, no
    // reshaping needed at either call site).
    title: m.title,
    emoji: m.emoji,
    details: m.details,
    completed_at: m.completed_at,
  }));

  return [...sessionEntries, ...nutritionEntries, ...milestoneEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
