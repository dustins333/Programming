import { programming } from "../supabase/client";

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "glutes",
  "core",
  "arms",
  "full_body",
];

export const MOVEMENT_PATTERNS = [
  "squat",
  "lunge",
  "hinge",
  "core",
  "row",
  "horizontal_push",
  "vertical_pull",
  "vertical_push",
];

export const EXERCISE_TYPES = ["lift", "warmup"];

export async function listExercises({ includeArchived = false } = {}) {
  let query = programming.from("exercises").select("*").order("muscle_group").order("name");
  if (!includeArchived) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Muscle group / movement pattern aren't applicable to a warm-up (no
// balance tally, no body-part filter) — null them out regardless of what
// the form happened to hold, rather than trusting the caller to have
// cleared them when switching type. defaultSets/defaultReps are the
// inverse: only meaningful for a warm-up, since a lift's sets/reps are
// authored per-session, not on the exercise itself.
export async function createExercise({ name, type = "lift", muscleGroup, movementPattern, defaultSets, defaultReps, cues, videoUrl, createdBy }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .insert({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroup,
      movement_pattern: isWarmup ? null : movementPattern || null,
      default_sets: isWarmup ? defaultSets || null : null,
      default_reps: isWarmup ? defaultReps || null : null,
      cues: cues || null,
      video_url: videoUrl || null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExercise(id, { name, type = "lift", muscleGroup, movementPattern, defaultSets, defaultReps, cues, videoUrl }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .update({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroup,
      movement_pattern: isWarmup ? null : movementPattern || null,
      default_sets: isWarmup ? defaultSets || null : null,
      default_reps: isWarmup ? defaultReps || null : null,
      cues: cues || null,
      video_url: videoUrl || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setExerciseActive(id, isActive) {
  const { error } = await programming.from("exercises").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function getMostRecentLog(userId, exerciseId) {
  const { data, error } = await programming
    .from("logs")
    .select("sets, reps, weight, date_performed")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("date_performed", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
