import { programming } from "../supabase/client";

// THE note on a lift — programming.exercise_coaching_notes (0071, extended to
// every program type by 0087). One store, one box, wherever it's shown: the
// wall display, the coach's live session page, and the member's own lift card
// all read and write these same rows. Whoever types in it, everyone sees it.
//
// Keyed on the RAW exercise_id, not the week-specific join-row id, so a note
// written in week 3 still surfaces in week 4, in the next block, or in any
// other session containing that lift — which is what makes "it comes through
// next time it's programmed" work at all. exercise_id null = a general note
// about the client's session rather than a lift.
//
// APPEND-ONLY. Neither the display account nor the member has an UPDATE
// policy (RLS can't scope an update to a single column), so "one note per
// lift per session" is read as "the newest row for that session" and a later
// note simply supersedes. Callers must therefore only write when the text has
// actually changed, or a blur-to-save box would pile up identical rows.
//
// Kept in its own file (not lib/programming/hub.js) on purpose: the member's
// My Fitness screen imports from here and must not drag hub code into the
// member bundle.

// Which session a note was written in, as the same shape logResult already
// takes: {groupWorkoutId} | {spcWorkoutId, weekNumber} | {oneOffWorkoutId}.
function sessionColumns(session) {
  return {
    group_workout_id: session?.groupWorkoutId ?? null,
    spc_workout_id: session?.spcWorkoutId ?? null,
    week_number: session?.spcWorkoutId ? (session?.weekNumber ?? null) : null,
    one_off_workout_id: session?.oneOffWorkoutId ?? null,
  };
}

// A GROUP workout row is one (block, week, session), so its id alone
// identifies the session. An SPC one no longer does: since the 0105 sessions
// cutover a single spc_workouts row spans the whole run, so the week has to be
// compared too — otherwise week 1's note is served back in week 2 as though it
// were this week's, and the real "here's what was said last time" line never
// appears. (This comment used to assert the opposite, on the strength of 0016.)
function isSameSession(note, session) {
  if (session?.groupWorkoutId) return note.group_workout_id === session.groupWorkoutId;
  if (session?.spcWorkoutId) {
    if (note.spc_workout_id !== session.spcWorkoutId) return false;
    // Only when the caller knows the week — an older caller that omits it
    // keeps the previous, week-blind behaviour rather than losing its note.
    return session.weekNumber == null || (note.week_number ?? null) === session.weekNumber;
  }
  if (session?.oneOffWorkoutId) return note.one_off_workout_id === session.oneOffWorkoutId;
  return false;
}

// authorName is a SNAPSHOT of who wrote it, not a join — the wall display has
// no read policy on core.users at all (0071), so a name it can render has to
// be stored on the row. Null renders unattributed rather than guessed.
export async function addCoachingNote({
  userId,
  exerciseId = null,
  authorId = null,
  authorName = null,
  body,
  session = null,
}) {
  const { data, error } = await programming
    .from("exercise_coaching_notes")
    .insert({
      user_id: userId,
      exercise_id: exerciseId,
      author_id: authorId,
      author_name: authorName,
      body,
      ...sessionColumns(session),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Every lift in one session at once — Map<exerciseId, { current, previous }>.
//
//   current  — the note written in THIS session. Seeds the editable box.
//   previous — the newest note from any OTHER session, i.e. what was said last
//              time this lift came up. Shown above the box rather than
//              pre-filled into it, so an untouched note is never silently
//              re-saved as though it had been said again today.
//
// Rows come back newest-first, so the first row seen wins each bucket.
export async function listSessionExerciseNotes({ userId, exerciseIds, session = null }) {
  if (!userId || !exerciseIds || exerciseIds.length === 0) return new Map();
  const { data, error } = await programming
    .from("exercise_coaching_notes")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const byExercise = new Map();
  for (const note of data ?? []) {
    let entry = byExercise.get(note.exercise_id);
    if (!entry) {
      entry = { current: null, previous: null };
      byExercise.set(note.exercise_id, entry);
    }
    if (isSameSession(note, session)) {
      if (!entry.current) entry.current = note;
    } else if (!entry.previous) {
      entry.previous = note;
    }
  }
  return byExercise;
}

// Full history for one client + lift, newest first.
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
