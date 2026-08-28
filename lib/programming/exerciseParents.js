import { programming } from "../supabase/client";

// Parents (0095) — the grouping a variation hangs under in the builder
// sidebar. "Squat" holds Goblet Squat, Lateral Squat, the plain Squat
// lift, and so on.
//
// A parent is NOT an exercise, and that is the whole point. It has no row
// in programming.exercises, so it can never be inserted into a session,
// logged against, picked in a builder, or counted in a PR — none of which
// is enforced by a filter that a future query could forget. Before 0095 a
// parent was just an exercise that happened to have something pointing at
// it, which made the "Variation of" picker 135 entries long and made the
// sidebar's parent row a click-to-insert target you had to aim around.

export async function listExerciseParents() {
  const { data, error } = await programming.from("exercise_parents").select("*").order("name");
  if (error) throw error;
  return data;
}

// Names are unique case- and whitespace-insensitively (a unique index on
// lower(btrim(name)) in 0095, which is what folded the live library's two
// "Glute Bridge" parents together). The collision is caught here as well
// so it reads as a sentence rather than a Postgres 23505 — this runs from
// a "+ New parent" field mid-way through adding an exercise, and a raw
// constraint error there is the worst possible moment for one.
export async function createExerciseParent({ name, muscleGroups, movementPatterns, createdBy }) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("Give the parent a name.");
  const { data, error } = await programming
    .from("exercise_parents")
    .insert({
      name: trimmed,
      muscle_group: muscleGroups?.length ? muscleGroups : null,
      movement_pattern: movementPatterns?.length ? movementPatterns : null,
      created_by: createdBy ?? null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`There's already a parent called "${trimmed}".`);
    throw error;
  }
  return data;
}

export async function renameExerciseParent(id, name) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("Give the parent a name.");
  const { error } = await programming.from("exercise_parents").update({ name: trimmed }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error(`There's already a parent called "${trimmed}".`);
    throw error;
  }
}

export async function updateExerciseParentTags(id, { muscleGroups, movementPatterns }) {
  const { error } = await programming
    .from("exercise_parents")
    .update({
      muscle_group: muscleGroups?.length ? muscleGroups : null,
      movement_pattern: movementPatterns?.length ? movementPatterns : null,
    })
    .eq("id", id);
  if (error) throw error;
}

// Deleting a parent is deliberately non-destructive: exercises.parent_id is
// ON DELETE SET NULL, so its members go back to sitting at the top level of
// the sidebar with every log, session and PR untouched. That's why this
// needs no usage check the way archiving an exercise does — there is no
// state in which removing a parent can cost anyone data.
export async function deleteExerciseParent(id) {
  const { error } = await programming.from("exercise_parents").delete().eq("id", id);
  if (error) throw error;
}

// Move one exercise into a parent, or out of every parent (null). The
// manage screen's only write onto programming.exercises — everything else
// about an exercise is edited on the exercise form.
export async function setExerciseParent(exerciseId, parentId) {
  const { error } = await programming.from("exercises").update({ parent_id: parentId || null }).eq("id", exerciseId);
  if (error) throw error;
}

// How many exercises sit in each parent, active and archived counted
// separately — the manage screen needs to say "3 exercises" without
// implying an archived one is still in play, and an empty parent is the
// main thing a reviewer is there to clear out.
export function countMembersByParent(exercises) {
  const counts = new Map();
  for (const ex of exercises) {
    if (!ex.parent_id) continue;
    const row = counts.get(ex.parent_id) ?? { active: 0, archived: 0 };
    if (ex.is_active === false) row.archived += 1;
    else row.active += 1;
    counts.set(ex.parent_id, row);
  }
  return counts;
}
