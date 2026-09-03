import { programming } from "../supabase/client";
import { calendarWeekNumber } from "./schedule";

// "Has she started this session?" — one definition, because three surfaces
// ask it (the client page's week rows, the block calendar, Coach Home's
// activity feed) and three copies would eventually disagree about the same
// session. Same reasoning as the five copies of daysBetween that ended up
// with three different rounding rules.
//
// Why this exists at all: a session_completions row is written only when the
// member taps Finalize, so a session she trained and forgot to finalize was
// indistinguishable from one she never showed up for. Her SETS were never
// missing — migration 0063 stamps spc_workout_id and week_number onto every
// log row from the first keystroke, precisely because autosave runs long
// before anyone taps Finalize. Nothing read them back as evidence.

// Two logged sets, not one. One set is what a mis-tap looks like, or her
// opening the app on the couch and poking at it. Two anywhere in the session
// — deliberately not two on one lift, which would miss someone who did a
// single set each on three lifts and stopped, which is plainly a started
// session.
export const STARTED_SET_FLOOR = 2;

// A logged set is one carrying a real number. logResult updates an existing
// row even to null (clearing a field you already filled in is a real edit
// that has to persist), so typing a number and deleting it leaves a husk row
// behind. Husks must not count toward the floor.
export function isLoggedSet(row) {
  return row?.reps != null || row?.weight != null;
}

// The three states a session slot can be in, given what we know about it.
// Ordered by how much has happened, so a caller can compare them.
export function sessionActivityState({ completedAt = null, loggedSets = 0 } = {}) {
  if (completedAt) return "finalized";
  if (loggedSets >= STARTED_SET_FLOOR) return "started";
  return "untouched";
}

// The key every SPC session-scoped map in this codebase uses. It has to match
// spcBlockDetail's sessionKey and listSpcCompletionDetailsForWorkouts exactly,
// or a week's sets and its completion end up in different buckets and the
// session reads as untouched with a completion sitting next to it.
export function activityKey(workoutId, week) {
  return `${workoutId}:${week}`;
}

// Which week a log row files under, resolved the same way spcCompletionWeek
// resolves it (0102):
//   - 'sessions' format: one spc_workouts row spans the whole run, so the
//     week comes from the calendar week of the day the set was logged.
//   - 'weekly' (legacy, and any block with no start date): the workout row
//     is already unique to its week, so its authored week_number is the week.
//
// Known and accepted: a set typed on Monday for last week's session lands in
// this week's bucket. There is nothing on the row that says otherwise.
function weekResolver(block, workouts) {
  const expandedByWeek = block?.format === "sessions" && Boolean(block?.block_start_date);
  if (!expandedByWeek) {
    const weekByWorkout = new Map((workouts ?? []).map((w) => [w.id, w.week_number]));
    return (row) => weekByWorkout.get(row.spc_workout_id) ?? null;
  }
  return (row) => calendarWeekNumber(block.block_start_date, row.date_performed);
}

// Map<`${workoutId}:${week}`, { loggedSets, lastLoggedDate }> for one client's
// logs against one block's sessions.
//
// Rows written before 0063 carry no spc_workout_id and are skipped rather than
// guessed at: attributing them by date alone is what produced the old bug
// where three sessions finalized in one evening each showed all of the others'
// lifts. An old session's sets still reach the read-out through
// getSpcBlockDetail's by-date fallback; they just don't light up a pill.
export async function listSpcSessionActivity({ userId, block, workouts }) {
  const ids = (workouts ?? []).map((w) => w.id);
  if (!userId || !ids.length) return new Map();

  const { data, error } = await programming
    .from("logs")
    .select("spc_workout_id, date_performed, reps, weight")
    .eq("user_id", userId)
    .in("spc_workout_id", ids);
  if (error) throw error;

  const weekOf = weekResolver(block, workouts);
  const activity = new Map();
  for (const row of data ?? []) {
    if (!isLoggedSet(row)) continue;
    const week = weekOf(row);
    if (week == null) continue;
    const key = activityKey(row.spc_workout_id, week);
    const entry = activity.get(key) ?? { loggedSets: 0, lastLoggedDate: null };
    entry.loggedSets += 1;
    if (!entry.lastLoggedDate || row.date_performed > entry.lastLoggedDate) {
      entry.lastLoggedDate = row.date_performed;
    }
    activity.set(key, entry);
  }
  return activity;
}
