import { programming } from "../supabase/client";

// Per-exercise "mark complete" checkbox on My Fitness's focus logging
// screen — separate from programming.logs (the actual reps/weight) and
// programming.session_completions (the whole session's finalize state).
// Row existence = complete; un-marking deletes the row. Same three-branch
// duplication as sessionCompletions.js (deliberately not consolidated,
// matching that file's own precedent) since group/SPC/one-off each key
// differently (SPC alone needs week_number, since spc_workout_exercises
// rows recur across every week of the block).

export async function listGroupExerciseCompletionsForItems(userId, groupWorkoutExerciseIds) {
  if (!groupWorkoutExerciseIds.length) return new Set();
  const { data, error } = await programming
    .from("exercise_completions")
    .select("group_workout_exercise_id")
    .eq("user_id", userId)
    .in("group_workout_exercise_id", groupWorkoutExerciseIds);
  if (error) throw error;
  return new Set(data.map((r) => r.group_workout_exercise_id));
}

export async function listSpcExerciseCompletionsForItems(userId, spcWorkoutExerciseIds, weekNumber) {
  if (!spcWorkoutExerciseIds.length) return new Set();
  const { data, error } = await programming
    .from("exercise_completions")
    .select("spc_workout_exercise_id")
    .eq("user_id", userId)
    .eq("week_number", weekNumber)
    .in("spc_workout_exercise_id", spcWorkoutExerciseIds);
  if (error) throw error;
  return new Set(data.map((r) => r.spc_workout_exercise_id));
}

export async function listOneOffExerciseCompletionsForItems(userId, oneOffExerciseIds) {
  if (!oneOffExerciseIds.length) return new Set();
  const { data, error } = await programming
    .from("exercise_completions")
    .select("one_off_exercise_id")
    .eq("user_id", userId)
    .in("one_off_exercise_id", oneOffExerciseIds);
  if (error) throw error;
  return new Set(data.map((r) => r.one_off_exercise_id));
}

// Select-then-insert-if-absent rather than .upsert() — same reasoning as
// sessionCompletions.js's finalize functions: the uniqueness rule is a
// partial index, and Postgres requires an ON CONFLICT predicate to match a
// partial index's WHERE exactly, which supabase-js's onConflict option
// can't express. A duplicate mark (already complete, tapped again) is a
// harmless no-op rather than an error.
export async function markGroupExerciseComplete(userId, groupWorkoutExerciseId) {
  const { data: existing, error: selectError } = await programming
    .from("exercise_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("group_workout_exercise_id", groupWorkoutExerciseId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await programming
    .from("exercise_completions")
    .insert({ user_id: userId, group_workout_exercise_id: groupWorkoutExerciseId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// `instance` is which completion of that session the tick belongs to — 1 for
// every ordinary session, higher for a make-up the coach started from the
// board (0117/0118). Defaulted, so every caller that has no instance concept
// (the member's own logging screen) keeps writing and reading instance 1
// exactly as before. Without it a make-up would show the earlier session's
// ticks already checked off.
export async function markSpcExerciseComplete(userId, spcWorkoutExerciseId, weekNumber, instance = 1) {
  const { data: existing, error: selectError } = await programming
    .from("exercise_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("spc_workout_exercise_id", spcWorkoutExerciseId)
    .eq("week_number", weekNumber)
    .eq("instance", instance)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await programming
    .from("exercise_completions")
    .insert({ user_id: userId, spc_workout_exercise_id: spcWorkoutExerciseId, week_number: weekNumber, instance })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markOneOffExerciseComplete(userId, oneOffExerciseId) {
  const { data: existing, error: selectError } = await programming
    .from("exercise_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("one_off_exercise_id", oneOffExerciseId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await programming
    .from("exercise_completions")
    .insert({ user_id: userId, one_off_exercise_id: oneOffExerciseId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// A delete of a row that doesn't exist is a harmless no-op — no need to
// select first the way marking does.
export async function unmarkGroupExerciseComplete(userId, groupWorkoutExerciseId) {
  const { error } = await programming
    .from("exercise_completions")
    .delete()
    .eq("user_id", userId)
    .eq("group_workout_exercise_id", groupWorkoutExerciseId);
  if (error) throw error;
}

export async function unmarkSpcExerciseComplete(userId, spcWorkoutExerciseId, weekNumber, instance = 1) {
  const { error } = await programming
    .from("exercise_completions")
    .delete()
    .eq("user_id", userId)
    .eq("spc_workout_exercise_id", spcWorkoutExerciseId)
    .eq("week_number", weekNumber)
    .eq("instance", instance);
  if (error) throw error;
}

export async function unmarkOneOffExerciseComplete(userId, oneOffExerciseId) {
  const { error } = await programming
    .from("exercise_completions")
    .delete()
    .eq("user_id", userId)
    .eq("one_off_exercise_id", oneOffExerciseId);
  if (error) throw error;
}

// Alternate programming (0110). Keyed like SPC rather than like a one-off:
// one alternate_exercises row recurs across every week of the run, so
// week_number is what tells week 1's tick from week 2's.
export async function listAlternateExerciseCompletionsForItems(userId, alternateExerciseIds, weekNumber) {
  if (!alternateExerciseIds.length) return new Set();
  const { data, error } = await programming
    .from("exercise_completions")
    .select("alternate_exercise_id")
    .eq("user_id", userId)
    .eq("week_number", weekNumber)
    .in("alternate_exercise_id", alternateExerciseIds);
  if (error) throw error;
  return new Set(data.map((r) => r.alternate_exercise_id));
}

export async function markAlternateExerciseComplete(userId, alternateExerciseId, weekNumber) {
  const { data: existing, error: selectError } = await programming
    .from("exercise_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("alternate_exercise_id", alternateExerciseId)
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await programming
    .from("exercise_completions")
    .insert({ user_id: userId, alternate_exercise_id: alternateExerciseId, week_number: weekNumber })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unmarkAlternateExerciseComplete(userId, alternateExerciseId, weekNumber) {
  const { error } = await programming
    .from("exercise_completions")
    .delete()
    .eq("user_id", userId)
    .eq("alternate_exercise_id", alternateExerciseId)
    .eq("week_number", weekNumber);
  if (error) throw error;
}
