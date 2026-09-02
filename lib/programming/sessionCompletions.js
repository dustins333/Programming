import { programming } from "../supabase/client";
import { dateInBoise, todayInBoise } from "../boiseDate";
import { calendarWeekNumber } from "./schedule";

export async function getGroupCompletion(userId, groupWorkoutId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("group_workout_id", groupWorkoutId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Which week an SPC completion files under. Two models (migration 0102's
// spc_blocks.format), and every function below resolves this itself rather
// than taking a week as a parameter — a caller passing the *displayed* week
// would write a completion nothing else could ever find:
//  - 'weekly' (legacy): the workout row's AUTHORED week_number, never the
//    displayed week, which since 0101 can differ via scheduled_week.
//  - 'sessions' (the simplification): the run's calendar week containing the
//    completion date, uncapped — a lapsed run keeps running, so a completion
//    logged past the end date still gets a real week number.
async function spcCompletionWeek(spcWorkoutId, completedAtIso = null) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("week_number, spc_blocks(format, block_start_date)")
    .eq("id", spcWorkoutId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That session no longer exists.");
  const block = data.spc_blocks;
  if (block?.format === "sessions" && block.block_start_date) {
    // Accepts a full timestamp OR a bare YYYY-MM-DD. A bare date is already a
    // Boise-local date and must NOT go through new Date() — that parses as
    // UTC midnight and dateInBoise would hand back the previous evening's
    // date (the exact .slice(0,10) bug class boiseDate.js exists to prevent).
    const date = !completedAtIso
      ? todayInBoise()
      : /^\d{4}-\d{2}-\d{2}$/.test(completedAtIso)
        ? completedAtIso
        : dateInBoise(new Date(completedAtIso));
    return calendarWeekNumber(block.block_start_date, date);
  }
  return data.week_number;
}

// The completion currently shown for this session — for a weekly block that's
// its authored week's row; for a sessions-format run it's this calendar
// week's, and if the week holds several instances (a make-up plus the regular
// one), the latest instance is the one on screen.
export async function getSpcCompletion(userId, spcWorkoutId) {
  const weekNumber = await spcCompletionWeek(spcWorkoutId);
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber)
    .order("instance", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Every instance of this session in the week containing `date` (default
// today) — what the make-up popup reads to say "you already logged Session 1
// this week: update it, or start a new one?"
export async function listSpcCompletionInstances(userId, spcWorkoutId, date = null) {
  const weekNumber = await spcCompletionWeek(spcWorkoutId, date);
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber)
    .order("instance");
  if (error) throw error;
  return data;
}

// Which of a set of group_workout_ids this member has already finalized —
// batches the Today overview's "3 checkboxes for the week" lookup into one
// query instead of 3 separate getGroupCompletion calls.
export async function listGroupCompletionsForWorkouts(userId, groupWorkoutIds) {
  if (!groupWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("group_workout_id")
    .eq("user_id", userId)
    .in("group_workout_id", groupWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => r.group_workout_id));
}

// Same shape as listGroupCompletionsForWorkouts but keeps completed_at —
// the full-block plan view needs the actual date to show under a completed
// session's bubble without a per-row round trip, not just a yes/no set.
export async function listGroupCompletionDetailsForWorkouts(userId, groupWorkoutIds) {
  if (!groupWorkoutIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("group_workout_id, completed_at")
    .eq("user_id", userId)
    .in("group_workout_id", groupWorkoutIds);
  if (error) throw error;
  return new Map(data.map((r) => [r.group_workout_id, r.completed_at]));
}

// SPC equivalent — keyed by `${spc_workout_id}:${week_number}` since one
// spc_workouts row recurs across every week of a block, so a single
// workout id alone doesn't identify which week's completion this is.
// Every workout id passed in belongs to one specific block, so this
// naturally scopes to that block's weeks with no extra week filter needed.
export async function listSpcCompletionDetailsForWorkouts(userId, spcWorkoutIds) {
  if (!spcWorkoutIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("spc_workout_id, week_number, completed_at")
    .eq("user_id", userId)
    .in("spc_workout_id", spcWorkoutIds);
  if (error) throw error;
  return new Map(data.map((r) => [`${r.spc_workout_id}:${r.week_number}`, r.completed_at]));
}

// Which of this block's spc_workout_ids are already completed for a given
// week — SPC has no day-of-week routing, so the Today overview uses this
// per-week completed set to render checkboxes for every session.
export async function getCompletedSpcWorkoutIdsForWeek(userId, spcWorkoutIds, weekNumber) {
  if (!spcWorkoutIds.length) return new Set();
  const { data, error } = await programming
    .from("session_completions")
    .select("spc_workout_id")
    .eq("user_id", userId)
    .eq("week_number", weekNumber)
    .in("spc_workout_id", spcWorkoutIds);
  if (error) throw error;
  return new Set(data.map((r) => r.spc_workout_id));
}

// Hand-rolled upsert rather than .upsert(): the group/spc uniqueness rules
// are partial indexes (only one of group_workout_id/spc_workout_id is ever
// set per row — see 0007_session_logging.sql), and Postgres requires an ON
// CONFLICT clause's predicate to match a partial index's WHERE exactly,
// which supabase-js's onConflict option can't express. Select-then-
// insert-or-update is simple and safe here since this is a single user
// finalizing their own single row, not a high-concurrency path.
// completedAt defaults to now (logging today's session as it happens), but
// a caller catching up on a missed past session can backdate it — the Plan
// views' "log a missed session" flow needs the bubble/history to reflect
// when it actually happened, not when the member got around to typing it in.
export async function finalizeGroupSession(userId, groupWorkoutId, completedAt = new Date().toISOString()) {
  const existing = await getGroupCompletion(userId, groupWorkoutId);
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, group_workout_id: groupWorkoutId, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// See finalizeGroupSession's note on completedAt — same backdating support.
// Left unset, `instance` targets the week's LATEST instance (else 1) — which
// is uniformly right: a first finalize finds nothing and creates instance 1
// (every pre-0102 caller's behavior unchanged), a re-finalize updates the
// instance on screen, and a finalize after "start a new one" lands on the
// make-up rather than silently re-stamping the original. The week is derived
// from completedAt for sessions-format runs, so a backdated missed-session
// log files under the week it actually happened.
export async function finalizeSpcSession(userId, spcWorkoutId, completedAt = new Date().toISOString(), { instance = null } = {}) {
  const weekNumber = await spcCompletionWeek(spcWorkoutId, completedAt);
  let query = programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber);
  if (instance != null) query = query.eq("instance", instance);
  const { data: existing, error: findError } = await query
    .order("instance", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, spc_workout_id: spcWorkoutId, week_number: weekNumber, instance: instance ?? 1, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// A make-up: a SECOND real completion of a session already logged this week
// ("You already logged Session 1 this week — start a new one?"). Takes the
// next free instance number for the completion's week and finalizes it.
// Its logged sets share the day's log rows keyed by date, same as any
// session — see 0102's header for why logs carry no instance column.
export async function startNewSpcSessionInstance(userId, spcWorkoutId, completedAt = new Date().toISOString()) {
  const weekNumber = await spcCompletionWeek(spcWorkoutId, completedAt);
  const { data: existing, error: findError } = await programming
    .from("session_completions")
    .select("instance")
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber)
    .order("instance", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  const instance = (existing?.instance ?? 0) + 1;
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, spc_workout_id: spcWorkoutId, week_number: weekNumber, instance, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Undo a finalize. Members kept tapping Finalize by accident and had no way
// back, which then threw My Week's "done for the week" count off — the count
// is derived from these rows, so a stray one genuinely misreports the week.
// Deleting rather than flagging: every reader of this table treats "a row
// exists" as the completion (see listGroupCompletionsForWorkouts and friends),
// so a soft-delete column would have to be threaded through all of them.
// Deletion is permitted by the member's own "for all" policy (0007) — no
// migration needed. Logged sets are untouched: they live in programming.logs
// and are what the member typed, not a claim about having finished.
export async function unfinalizeGroupSession(userId, groupWorkoutId) {
  const { error } = await programming
    .from("session_completions")
    .delete()
    .eq("user_id", userId)
    .eq("group_workout_id", groupWorkoutId);
  if (error) throw error;
}

// Deletes the latest instance for the relevant week (the one the member is
// looking at) unless a specific instance is named — for a weekly block or a
// week with no make-up, that's the same single row it always deleted.
export async function unfinalizeSpcSession(userId, spcWorkoutId, { instance = null } = {}) {
  const weekNumber = await spcCompletionWeek(spcWorkoutId);
  let target = instance;
  if (target == null) {
    const { data: latest, error: findError } = await programming
      .from("session_completions")
      .select("instance")
      .eq("user_id", userId)
      .eq("spc_workout_id", spcWorkoutId)
      .eq("week_number", weekNumber)
      .order("instance", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (!latest) return;
    target = latest.instance;
  }
  const { error } = await programming
    .from("session_completions")
    .delete()
    .eq("user_id", userId)
    .eq("spc_workout_id", spcWorkoutId)
    .eq("week_number", weekNumber)
    .eq("instance", target);
  if (error) throw error;
}

// Set of completed one_off_workout_ids for a user — used by the coach's
// client detail page to show a "✓ Completed" indicator per assignment,
// mirroring the same completed-lookup listActiveOneOffWorkoutsForUser does
// for the member side (there it's used to filter, here it's used to label).
export async function listCompletedOneOffWorkoutIds(userId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("one_off_workout_id")
    .eq("user_id", userId)
    .not("one_off_workout_id", "is", null);
  if (error) throw error;
  return new Set(data.map((r) => r.one_off_workout_id));
}

export async function getOneOffCompletion(userId, oneOffWorkoutId) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("one_off_workout_id", oneOffWorkoutId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// One-offs have no recurrence (unlike SPC's weekly-repeating workout row),
// so finalizing one is permanent — there's no "next week" to re-log against.
export async function finalizeOneOffSession(userId, oneOffWorkoutId) {
  const existing = await getOneOffCompletion(userId, oneOffWorkoutId);
  const completedAt = new Date().toISOString();
  if (existing) {
    const { error } = await programming.from("session_completions").update({ completed_at: completedAt }).eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: completedAt };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({ user_id: userId, one_off_workout_id: oneOffWorkoutId, completed_at: completedAt })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Alternate programming (0110)
// ---------------------------------------------------------------------
// Keyed by (session, week) like SPC, not by the session alone like a
// one-off: one alternate_sessions row is repeated for every week of the
// run, so without the week a member finishing week 1 would look finished
// for the whole trip.

export async function getAlternateCompletion(userId, alternateSessionId, weekNumber) {
  const { data, error } = await programming
    .from("session_completions")
    .select("*")
    .eq("user_id", userId)
    .eq("alternate_session_id", alternateSessionId)
    .eq("week_number", weekNumber)
    .order("instance", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Which of this week's alternate sessions are already done. One query for
// the whole run rather than one per session, since My Week draws every
// session's tick at once.
export async function listAlternateCompletionsForWeek(userId, alternateSessionIds, weekNumber) {
  if (!alternateSessionIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("alternate_session_id, completed_at")
    .eq("user_id", userId)
    .eq("week_number", weekNumber)
    .in("alternate_session_id", alternateSessionIds);
  if (error) throw error;
  return new Map(data.map((r) => [r.alternate_session_id, r.completed_at]));
}

export async function finalizeAlternateSession(userId, alternateSessionId, weekNumber, completedAt) {
  const existing = await getAlternateCompletion(userId, alternateSessionId, weekNumber);
  const stamp = completedAt ?? new Date().toISOString();
  if (existing) {
    const { error } = await programming
      .from("session_completions")
      .update({ completed_at: stamp })
      .eq("id", existing.id);
    if (error) throw error;
    return { ...existing, completed_at: stamp };
  }
  const { data, error } = await programming
    .from("session_completions")
    .insert({
      user_id: userId,
      alternate_session_id: alternateSessionId,
      week_number: weekNumber,
      completed_at: stamp,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Finalize is a two-way toggle everywhere else in the member app, so it is
// here too — an accidental tap has to be undoable.
export async function unfinalizeAlternateSession(userId, alternateSessionId, weekNumber) {
  const { error } = await programming
    .from("session_completions")
    .delete()
    .eq("user_id", userId)
    .eq("alternate_session_id", alternateSessionId)
    .eq("week_number", weekNumber);
  if (error) throw error;
}
