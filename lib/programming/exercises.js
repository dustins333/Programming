import { core, programming } from "../supabase/client";

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

// One exercise by id — for screens that need the name/tracks_weight before
// (or without) any logs rows to read it off. Null if archived-and-invisible
// to the caller or missing.
export async function getExercise(id) {
  const { data, error } = await programming.from("exercises").select("id, name, tracks_weight, rep_unit, type").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Muscle group / movement pattern aren't applicable to a warm-up (no
// balance tally, no body-part filter) — null them out regardless of what
// the form happened to hold, rather than trusting the caller to have
// cleared them when switching type. parentId is also lift-only — grouping
// variations under a parent movement doesn't apply to warm-ups.
// defaultSets/defaultReps apply to BOTH types: they seed the prescription
// when the exercise is inserted into a session (or warm-up), and the coach
// can still edit it per session afterwards. They used to be warm-up-only,
// which meant a lift with a near-always-the-same prescription had to be
// retyped every time it was programmed.
export async function createExercise({ name, type = "lift", muscleGroups, movementPatterns, parentId, defaultSets, defaultReps, repUnit, tracksWeight, cues, videoUrl, createdBy, approved = false }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .insert({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroups,
      movement_pattern: isWarmup || !movementPatterns?.length ? null : movementPatterns,
      parent_id: isWarmup ? null : parentId || null,
      default_sets: defaultSets || null,
      default_reps: defaultReps || null,
      // Only lifts are logged with a weight, so a warm-up is always left
      // on the default rather than carrying a meaningless false. Same for
      // the count's unit — a warm-up is never part of the volume total.
      tracks_weight: isWarmup ? true : tracksWeight !== false,
      rep_unit: isWarmup ? "reps" : repUnit || "reps",
      cues: cues || null,
      video_url: videoUrl || null,
      created_by: createdBy,
      // A reviewer's own entry doesn't go into the reviewer's own queue —
      // pass isLibraryReviewer(profile) here. RLS refuses this for anyone
      // else (0094's insert policy), so it can't be spoofed from a caller.
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? createdBy : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExercise(id, { name, type = "lift", muscleGroups, movementPatterns, parentId, defaultSets, defaultReps, repUnit, tracksWeight, cues, videoUrl }) {
  const isWarmup = type === "warmup";
  const { data, error } = await programming
    .from("exercises")
    .update({
      name,
      type,
      muscle_group: isWarmup ? null : muscleGroups,
      movement_pattern: isWarmup || !movementPatterns?.length ? null : movementPatterns,
      parent_id: isWarmup ? null : parentId || null,
      default_sets: defaultSets || null,
      default_reps: defaultReps || null,
      // Only lifts are logged with a weight, so a warm-up is always left
      // on the default rather than carrying a meaningless false. Same for
      // the count's unit — a warm-up is never part of the volume total.
      tracks_weight: isWarmup ? true : tracksWeight !== false,
      rep_unit: isWarmup ? "reps" : repUnit || "reps",
      cues: cues || null,
      video_url: videoUrl || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Turns the flat exercise list plus the parent records into what the
// builder sidebar actually renders: one entry per parent that has members,
// plus one entry per exercise that belongs to no parent, sorted together by
// name so "Squat" sits where a coach expects to find it whether it's a
// parent or a plain lift.
//
// Each entry carries resolved tags, because bucketing a parent needs an
// answer for it and not just for its members. A parent's own tags win; a
// parent left untagged falls back to the union of what's inside it, so it
// can never silently drop out of every bucket — the same "nothing vanishes
// from the sidebar" rule the ungrouped bucket already exists for.
export function groupLibraryByParent(exercises, parents = []) {
  const membersByParent = new Map();
  for (const ex of exercises) {
    if (!ex.parent_id) continue;
    if (!membersByParent.has(ex.parent_id)) membersByParent.set(ex.parent_id, []);
    membersByParent.get(ex.parent_id).push(ex);
  }

  const union = (members, field) => [...new Set(members.flatMap((m) => m[field] ?? []))];

  const entries = [];
  for (const parent of parents) {
    const members = membersByParent.get(parent.id) ?? [];
    // An empty parent is a management concern, not a browsing one — it
    // would render as a header that expands to nothing.
    if (!members.length) continue;
    entries.push({
      kind: "parent",
      id: parent.id,
      name: parent.name,
      parent,
      members,
      muscle_group: parent.muscle_group?.length ? parent.muscle_group : union(members, "muscle_group"),
      movement_pattern: parent.movement_pattern?.length ? parent.movement_pattern : union(members, "movement_pattern"),
    });
  }

  const known = new Set(parents.map((p) => p.id));
  for (const ex of exercises) {
    // An exercise pointing at a parent the caller didn't load renders at
    // the top level rather than disappearing into a group that isn't there.
    if (ex.parent_id && known.has(ex.parent_id)) continue;
    entries.push({
      kind: "exercise",
      id: ex.id,
      name: ex.name,
      exercise: ex,
      muscle_group: ex.muscle_group,
      movement_pattern: ex.movement_pattern,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, membersByParent };
}

// A flat one-line summary for wherever the full per-set breakdown doesn't
// fit (native read-only builders, block-grid tiles) — collapses to the
// single value when every set targets the same reps, otherwise lists them.
export function summarizeRepScheme(repScheme) {
  if (!repScheme?.length) return "";
  const unique = [...new Set(repScheme)];
  return unique.length === 1 ? unique[0] : repScheme.join(", ");
}

/* ------------------------------------------------- library review queue */

// Who reviews the library. The can_view_exercise_library flag (0015) used
// to mean "may add or edit exercises at all"; since 0094 every coach can
// do that, and the flag means "reviews what everyone else added" instead.
// One definition, shared by the nav gate, the queue screen and the
// auto-approve on a reviewer's own create — mirrors core.can_access_exercise_library()
// on the SQL side, which is what actually enforces it.
export function isLibraryReviewer(profile) {
  return profile?.role === "admin" || Boolean(profile?.can_view_exercise_library);
}

// Everything waiting for a reviewer, oldest first — a queue, so the entry
// that has been sitting longest is the one at the top.
//
// Archived entries are excluded: archiving a pending entry IS the reject
// path, and a rejected entry that stayed in the queue could never be
// cleared out of it.
//
// Creator names are fetched separately and merged client-side rather than
// embedded — created_by points into core.users, and this codebase does not
// rely on PostgREST embeds across schemas (see CLAUDE.md). Name resolution
// is best-effort: a failed lookup costs the "added by" line, not the queue.
export async function listPendingExercises() {
  const { data, error } = await programming
    .from("exercises")
    .select("*")
    .is("approved_at", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data.length) return [];

  const ids = [...new Set(data.map((e) => e.created_by).filter(Boolean))];
  let nameById = new Map();
  if (ids.length) {
    const { data: users } = await core.from("users").select("id, name").in("id", ids);
    nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  }
  return data.map((e) => ({ ...e, created_by_name: nameById.get(e.created_by) ?? null }));
}

// Head-only count behind the nav badge. Cheap enough to run on every
// CoachShell mount (it remounts on each web navigation) — no row data
// comes back, and the partial index from 0094 covers exactly this filter.
export async function countPendingExercises() {
  const { count, error } = await programming
    .from("exercises")
    .select("id", { count: "exact", head: true })
    .is("approved_at", null)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

// Clears one entry out of the queue. Separate from updateExercise on
// purpose: a reviewer editing a pending entry should NOT silently approve
// it — tidying and signing off are two decisions, and the queue screen
// offers them as two actions.
export async function approveExercise(id, approvedBy) {
  const { error } = await programming
    .from("exercises")
    .update({ approved_at: new Date().toISOString(), approved_by: approvedBy ?? null })
    .eq("id", id);
  if (error) throw error;
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
    // Never seed a coach's next prescription from a ramp-up (0116). This is
    // what fills in default sets/reps when a lift is added to an SPC session,
    // so a ramp-up winning here would quietly propose the 25s she picked up
    // to warm into it as the working weight.
    .neq("set_type", "ramp_up")
    .order("date_performed", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
