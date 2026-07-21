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

export async function listExercises({ includeArchived = false } = {}) {
  let query = programming.from("exercises").select("*").order("muscle_group").order("name");
  if (!includeArchived) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createExercise({ name, muscleGroup, movementPattern, cues, videoUrl, createdBy }) {
  const { data, error } = await programming
    .from("exercises")
    .insert({
      name,
      muscle_group: muscleGroup,
      movement_pattern: movementPattern || null,
      cues: cues || null,
      video_url: videoUrl || null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExercise(id, { name, muscleGroup, movementPattern, cues, videoUrl }) {
  const { data, error } = await programming
    .from("exercises")
    .update({
      name,
      muscle_group: muscleGroup,
      movement_pattern: movementPattern || null,
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
