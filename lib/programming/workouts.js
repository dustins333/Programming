import { programming } from "../supabase/client";

export async function getWorkout(workoutId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*, group_blocks(id, group_program_id, group_programs(name))")
    .eq("id", workoutId)
    .single();
  if (error) throw error;
  return data;
}

export async function listWarmups(workoutId) {
  const { data, error } = await programming
    .from("group_workout_warmups")
    .select("*, exercises(id, name)")
    .eq("group_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addWarmup({ workoutId, exerciseId, position, label }) {
  const { data, error } = await programming
    .from("group_workout_warmups")
    .insert({ group_workout_id: workoutId, exercise_id: exerciseId ?? null, position, label: label ?? null })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateWarmup(id, fields) {
  const { error } = await programming.from("group_workout_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeWarmup(id) {
  const { error } = await programming.from("group_workout_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function listWorkoutExercises(workoutId) {
  const { data, error } = await programming
    .from("group_workout_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .eq("group_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addWorkoutExercise({ workoutId, exerciseId, position, sets = 3, reps = "10" }) {
  const { data, error } = await programming
    .from("group_workout_exercises")
    .insert({ group_workout_id: workoutId, exercise_id: exerciseId, position, sets, reps })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkoutExercise(id, fields) {
  const { error } = await programming.from("group_workout_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeWorkoutExercise(id) {
  const { error } = await programming.from("group_workout_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderWorkoutExercises(items) {
  await Promise.all(
    items.map((item) => programming.from("group_workout_exercises").update({ position: item.position }).eq("id", item.id))
  );
}

// Spec scopes the live pattern tally to the whole week (all 3 sessions),
// not just the session being edited — sibling sessions' exercises aren't
// part of this screen's editable state, so their patterns are fetched
// once and combined with the current session's live local state by the
// caller (PatternTally), rather than refetched on every edit.
export async function getSiblingPatterns(blockId, weekNumber, excludeWorkoutId) {
  const { data: workouts, error } = await programming
    .from("group_workouts")
    .select("id")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber)
    .neq("id", excludeWorkoutId);
  if (error) throw error;

  const ids = workouts.map((w) => w.id);
  if (!ids.length) return [];

  const { data: rows, error: exError } = await programming
    .from("group_workout_exercises")
    .select("exercises(movement_pattern)")
    .in("group_workout_id", ids);
  if (exError) throw exError;

  return rows.map((r) => r.exercises?.movement_pattern).filter(Boolean);
}

export async function setWorkoutStatus(workoutId, status) {
  const { error } = await programming
    .from("group_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}
