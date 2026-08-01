import { programming } from "../supabase/client";

export async function getGroupCompletion(userId, groupWorkoutId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("group_workout_id", groupWorkoutId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSpcCompletion(userId, spcWorkoutId, weekNumber) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Which of a set of group_workout_ids this member has already finalized —
// batches the Today overview's "3 checkboxes for the week" lookup into one
// query instead of 3 separate getGroupCompletion calls.
export async function listGroupCompletionsForWorkouts(userId, groupWorkoutIds) {
  if (!groupWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("group_workout_id")
    .eq("user_id", userId)
    .in("group_workout_id", groupWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => r.group_workout_id));
}

// Which of this block's spc_workout_ids are already completed for a given
// week — SPC has no day-of-week routing, so "next" session just means
// lowest session_number not yet done this week. Exported (not just an
// internal helper for getNextIncompleteSpcWorkout) since the Today
// overview needs the same per-week completed set to render checkboxes for
// every session, not just to find the single "next" one.
export async function getCompletedSpcWorkoutIdsForWeek(userId, spcWorkoutIds, weekNumber) {
  if (!spcWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("spc_workout_id")
    .eq("user_id", userId)
    .eq("week_number", weekNumber)
    .in("spc_workout_id", spcWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => r.spc_workout_id));
}

// Given this block's published spc_workouts (session_number asc) and the
// client's sessions_per_week target, find the next one not completed for
// the given week. Returns null once every expected session this week is
// done ("no remaining sessions this week").
export async function getNextIncompleteSpcWorkout(userId, workouts, weekNumber, sessionsPerWeek) {
  const relevant = workouts.slice(0, sessionsPerWeek);
  const completedIds = await getCompletedSpcWorkoutIdsForWeek(userId, relevant.map((w) => w.id), weekNumber);
  return relevant.find((w) => !completedIds.has(w.id)) ?? null;
}

// Hand-rolled upsert rather than .upsert(): the group/spc uniqueness rules
// are partial indexes (only one of group_workout_id/spc_workout_id is ever
// set per row — see 0007_session_logging.sql), and Postgres requires an ON
// CONFLICT clause's predicate to match a partial index's WHERE exactly,
// which supabase-js's onConflict option can't express. Select-then-
// insert-or-update is simple and safe here since this is a single user
// finalizing their own single row, not a high-concurrency path.
export async function finalizeGroupSession(userId, groupWorkoutId) {
  const existing = await getGroupCompletion(userId, groupWorkoutId);
  const completedAt = new Date().toISOString();
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, group_workout_id: groupWorkoutId, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finalizeSpcSession(userId, spcWorkoutId, weekNumber) {
  const existing = await getSpcCompletion(userId, spcWorkoutId, weekNumber);
  const completedAt = new Date().toISOString();
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, spc_workout_id: spcWorkoutId, week_number: weekNumber, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Set of completed one_off_workout_ids for a user — used by the coach's
// client detail page to show a "✓ Completed" indicator per assignment,
// mirroring the same completed-lookup listActiveOneOffWorkoutsForUser does
// for the member side (there it's used to filter, here it's used to label).
export async function listCompletedOneOffWorkoutIds(userId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("one_off_workout_id")
    .eq("user_id", userId)
    .not("one_off_workout_id", "is", null);
  if (error) throw error;
  return new Set(data.map((r) => r.one_off_workout_id));
}

export async function getOneOffCompletion(userId, oneOffWorkoutId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("one_off_workout_id", oneOffWorkoutId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// One-offs have no recurrence (unlike SPC's weekly-repeating workout row),
// so finalizing one is permanent — there's no "next week" to re-log against.
export async function finalizeOneOffSession(userId, oneOffWorkoutId) {
  const existing = await getOneOffCompletion(userId, oneOffWorkoutId);
  const completedAt = new Date().toISOString();
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, one_off_workout_id: oneOffWorkoutId, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}
