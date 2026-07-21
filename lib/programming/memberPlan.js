import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

export async function getMyAssignment(userId) {
  const { data, error } = await programming
    .from("client_program_assignments")
    .select("*, group_programs(id, name, block_length_weeks, sessions_per_week)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// RLS already scopes this to blocks the member is assigned to — no extra
// filter needed beyond the date range. Blocks for one program shouldn't
// normally overlap, but a coach creating one early/late could produce two
// date ranges that both cover "today" — .maybeSingle() throws outright on
// 2+ rows, which would otherwise hang the caller on an unhandled rejection.
// order+limit(1) guarantees at most one row reaches maybeSingle(), and
// picks the most recently *started* block as the sensible tiebreak.
export async function getCurrentBlock(groupProgramId, today = todayInBoise()) {
  const { data, error } = await programming
    .from("group_blocks")
    .select("*")
    .eq("group_program_id", groupProgramId)
    .lte("block_start_date", today)
    .gte("block_end_date", today)
    .order("block_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWorkout(blockId, weekNumber, sessionNumber) {
  // RLS's member-read policy already requires status = 'published', so a
  // draft week/session simply won't come back — no separate check needed.
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber)
    .eq("session_number", sessionNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Look-ahead: every published workout in the block, grouped by week —
// "whole block, all weeks" per the build plan's decision.
export async function listPublishedWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

export async function logResult({ userId, exerciseId, datePerformed, sets, reps, weight, notes, source }) {
  const { error } = await programming.from("logs").insert({
    user_id: userId,
    exercise_id: exerciseId,
    date_performed: datePerformed,
    sets: sets ?? null,
    reps: reps ?? null,
    weight: weight ?? null,
    notes: notes ?? null,
    source,
  });
  if (error) throw error;
}

// Distinct exercises this member has ever logged, most-recently-logged
// first — same-schema embed (logs -> exercises) is safe here, unlike the
// cross-schema core.users lookups elsewhere in this module.
export async function listLoggedExercises(userId) {
  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, date_performed, exercises(id, name, muscle_group)")
    .eq("user_id", userId)
    .order("date_performed", { ascending: false });
  if (error) throw error;

  const seen = new Map();
  for (const row of data) {
    if (!seen.has(row.exercise_id)) {
      seen.set(row.exercise_id, { exercise: row.exercises, lastDate: row.date_performed });
    }
  }
  return [...seen.values()];
}

export async function listLogsForExercise(userId, exerciseId) {
  const { data, error } = await programming
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("date_performed", { ascending: false });
  if (error) throw error;
  return data;
}
