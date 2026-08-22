import { programming } from "../supabase/client";

// Per-client, per-LIFT coaching note history ("killed this, go up in weight")
// — programming.exercise_coaching_notes (migration 0071). Keyed on the RAW
// exercise_id, not the week-specific spc_workout_exercises join-row id, so a
// note written in week 3 still surfaces in week 4, the next block, or any
// session containing the same lift. exercise_id null = a general note about
// the client's session, not tied to a lift.
//
// Kept in its own file (not lib/programming/hub.js) on purpose: the member's
// My Fitness screen imports listLatestCoachingNotes and must not drag hub
// code into the member bundle.

// authorName is a SNAPSHOT of who wrote it, not a join — the wall display
// has no read policy on core.users at all (0071), so a name it can render
// has to be stored on the row. Null renders unattributed rather than guessed.
export async function addCoachingNote({
  userId,
  exerciseId = null,
  authorId = null,
  authorName = null,
  body,
  spcWorkoutId = null,
  weekNumber = null,
}) {
  const { data, error } = await programming
    .from("exercise_coaching_notes")
    .insert({
      user_id: userId,
      exercise_id: exerciseId,
      author_id: authorId,
      author_name: authorName,
      body,
      spc_workout_id: spcWorkoutId,
      week_number: weekNumber,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Latest note per exercise for one client, batched — Map<exerciseId, note row>.
// Rows come back newest-first; the first row seen per exercise wins.
export async function listLatestCoachingNotes(userId, exerciseIds) {
  if (!exerciseIds || exerciseIds.length === 0) return new Map();
  const { data, error } = await programming
    .from("exercise_coaching_notes")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const latest = new Map();
  for (const row of data ?? []) {
    if (!latest.has(row.exercise_id)) latest.set(row.exercise_id, row);
  }
  return latest;
}

// Full history for one client + lift, newest first (the entry pad's
// "history" expander).
export async function listCoachingNoteHistory(userId, exerciseId) {
  const { data, error } = await programming
    .from("exercise_coaching_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
