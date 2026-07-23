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

// Which of this block's spc_workout_ids are already completed for a given
// week — SPC has no day-of-week routing, so "next" session just means
// lowest session_number not yet done this week.
async function getCompletedSpcWorkoutIdsForWeek(userId, spcWorkoutIds, weekNumber) {
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
