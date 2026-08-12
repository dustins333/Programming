import { programming } from "../supabase/client";

// The eight top-level groups. These stay real, taggable values — an
// exercise tagged plain "chest" from before sub-groups existed is still
// valid, and a coach who doesn't care to be more specific can leave it
// there. Ordered as the coach reads them, not as they were originally
// listed.
export const MUSCLE_GROUPS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "full_body"];

// Each section's finer options. A section with none (glutes, full body) is
// only ever tagged at the top level. Sub-groups are stored on their own —
// tagging "lats" does NOT also store "back"; anything that needs the
// coarse group derives it via parentMuscleGroup() below, so there's one
// source of truth per tag instead of two that can drift.
export const MUSCLE_SUB_GROUPS = {
  chest: ["upper_chest", "lower_chest"],
  back: ["lats", "upper_back", "lower_back"],
  shoulders: ["front_delt", "side_delt", "rear_delt"],
  arms: ["biceps", "triceps", "forearms"],
  legs: ["quads", "hamstrings", "calves"],
  glutes: [],
  core: ["abs", "obliques"],
  full_body: [],
};

// Every value the muscle_group column accepts — mirrors the CHECK
// constraint in migration 0048. Keep the two in step.
export const ALL_MUSCLE_VALUES = [
  ...MUSCLE_GROUPS,
  ...MUSCLE_GROUPS.flatMap((g) => MUSCLE_SUB_GROUPS[g]),
];

const PARENT_BY_SUB = Object.fromEntries(
  MUSCLE_GROUPS.flatMap((g) => MUSCLE_SUB_GROUPS[g].map((sub) => [sub, g]))
);

// Which of the eight sections a stored tag belongs to — "lats" -> "back",
// "back" -> "back". Anything unrecognised returns null rather than
// silently bucketing somewhere wrong.
export function parentMuscleGroup(value) {
  if (MUSCLE_GROUPS.includes(value)) return value;
  return PARENT_BY_SUB[value] ?? null;
}

const MUSCLE_LABEL_OVERRIDES = {
  full_body: "Full body",
  front_delt: "Front delt",
  side_delt: "Side delt",
  rear_delt: "Rear delt",
};

// Display form for one stored tag. Sentence case, underscores dropped.
export function muscleGroupLabel(value) {
  if (MUSCLE_LABEL_OVERRIDES[value]) return MUSCLE_LABEL_OVERRIDES[value];
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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

// Every table that can reference an exercise, as a lift or as a warmup —
// archiving today just flips is_active, and member RLS on every one of
// these embeds is `is_active` (0004:135 and its SPC/one-off equivalents),
// so an in-use exercise going inactive silently blanks its name out of a
// live session and that member's own history the instant it happens. This
// is what a coach needs to see before archiving, not after a client
// reports a broken workout.
const USAGE_TABLES = [
  "group_workout_exercises",
  "group_workout_warmups",
  "spc_workout_exercises",
  "spc_workout_warmups",
  "template_exercises",
  "template_warmups",
  "one_off_exercises",
  "one_off_warmups",
];

// Head-only counts (no row data fetched) — cheap enough to run on demand
// right before an archive attempt rather than for every row in the list.
export async function getExerciseUsageCount(exerciseId) {
  const results = await Promise.all(
    USAGE_TABLES.map((table) =>
      programming.from(table).select("id", { count: "exact", head: true }).eq("exercise_id", exerciseId)
    )
  );
  let total = 0;
  for (const { count, error } of results) {
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

// Usage for the WHOLE library in one pass — the Exercise Library table's
// "USED" column and the merge page's "112 uses vs 8 uses" both need a
// number per row, and getExerciseUsageCount above would be 8 queries per
// exercise (nearly two thousand round trips on a 240-entry library).
//
// Only the id column is fetched from each table, so the payload is small
// even when a table has thousands of rows.
export async function listExerciseUsageCounts() {
  const results = await Promise.all(
    USAGE_TABLES.map(async (table) => {
      const { data, error } = await programming.from(table).select("exercise_id").limit(20000);
      if (error) throw error;
      return data;
    })
  );
  const counts = {};
  for (const rows of results) {
    for (const row of rows) {
      if (row.exercise_id) counts[row.exercise_id] = (counts[row.exercise_id] ?? 0) + 1;
    }
  }
  return counts;
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
