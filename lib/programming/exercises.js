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
  // Ordering by name alone (not muscle_group, which is now an array and
  // sorts meaninglessly) also happens to be what makes warm-ups list
  // alphabetically — every consumer groups/filters this list client-side
  // via .filter(), which preserves order, so one alphabetical base order
  // is enough for both the grouped lift sections and the flat warmup list.
  let query = programming.from("exercises").select("*").order("name");
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
// authored per-session, not on the exercise itself. parentExerciseId is
// also lift-only — grouping variations under a parent movement doesn't
// apply to warm-ups.
export async function createExercise({ name, type = "lift", muscleGroups, movementPatterns, parentExerciseId, defaultSets, defaultReps, cues, videoUrl, createdBy }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .insert({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroups,
      movement_pattern: isWarmup || !movementPatterns?.length ? null : movementPatterns,
      parent_exercise_id: isWarmup ? null : parentExerciseId || null,
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

export async function updateExercise(id, { name, type = "lift", muscleGroups, movementPatterns, parentExerciseId, defaultSets, defaultReps, cues, videoUrl }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .update({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroups,
      movement_pattern: isWarmup || !movementPatterns?.length ? null : movementPatterns,
      parent_exercise_id: isWarmup ? null : parentExerciseId || null,
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

// Groups a flat exercise list into top-level movements + a lookup of each
// parent's variations, for the builder sidebar's expandable tree. One
// shared implementation instead of tripling this across the three web
// builders.
export function groupExercisesByParent(exercises) {
  const childrenByParent = new Map();
  for (const ex of exercises) {
    if (!ex.parent_exercise_id) continue;
    if (!childrenByParent.has(ex.parent_exercise_id)) childrenByParent.set(ex.parent_exercise_id, []);
    childrenByParent.get(ex.parent_exercise_id).push(ex);
  }
  const topLevel = exercises.filter((ex) => !ex.parent_exercise_id);
  return { topLevel, childrenByParent };
}

// A flat one-line summary for wherever the full per-set breakdown doesn't
// fit (native read-only builders, block-grid tiles) — collapses to the
// single value when every set targets the same reps, otherwise lists them.
export function summarizeRepScheme(repScheme) {
  if (!repScheme?.length) return "";
  const unique = [...new Set(repScheme)];
  return unique.length === 1 ? unique[0] : repScheme.join(", ");
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
