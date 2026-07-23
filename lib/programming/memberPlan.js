import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

export async function getMyAssignment(userId) {
  const { data, error } = await programming
    .from("client_program_assignments")
    .select("*, group_programs(id, name, block_length_weeks, sessions_per_week)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// RLS already scopes this to blocks the member is assigned to — no extra
// filter needed beyond the date range. Blocks for one program shouldn't
// normally overlap, but a coach creating one early/late could produce two
// date ranges that both cover "today". Picking the most recently *started*
// block as a blind tiebreak is wrong when that one is a still-empty new
// block and an older-but-still-active block is the one with actual
// published content — so when there's more than one candidate, prefer
// whichever has published sessions, falling back to newest-started if
// neither does (e.g. both genuinely still drafts).
export async function getCurrentBlock(groupProgramId, today = todayInBoise()) {
  const { data: candidates, error } = await programming
    .from("group_blocks")
    .select("*")
    .eq("group_program_id", groupProgramId)
    .lte("block_start_date", today)
    .gte("block_end_date", today)
    .order("block_start_date", { ascending: false });
  if (error) throw error;
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const { data: publishedRows, error: pubError } = await programming
    .from("group_workouts")
    .select("block_id")
    .in("block_id", candidates.map((b) => b.id))
    .eq("status", "published");
  if (pubError) throw pubError;
  const publishedBlockIds = new Set((publishedRows ?? []).map((r) => r.block_id));
  return candidates.find((b) => publishedBlockIds.has(b.id)) ?? candidates[0];
}

export async function getWorkout(blockId, weekNumber, sessionNumber) {
  // RLS's member-read policy already requires status = 'published', so a
  // draft week/session simply won't come back — no separate check needed.
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber)
    .eq("session_number", sessionNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Look-ahead: every published workout in the block, grouped by week —
// "whole block, all weeks" per the build plan's decision.
export async function listPublishedWorkoutsForBlock(blockId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;
  return data;
}

// Upsert-by-hand (select existing row for this exact set, then update or
// insert) rather than a DB unique constraint + .upsert() — autosave calls
// this on every debounced edit, and a plain insert would pile up a fresh
// row per keystroke-pause instead of overwriting today's value for that
// set. Not backed by a real unique constraint since older pre-per-set data
// could already contain same-day/same-set duplicates this environment has
// no way to audit across every member; select-then-write sidesteps that
// entirely. .limit(1) guards the same "2+ rows" .maybeSingle() gotcha
// documented elsewhere in this codebase.
export async function logResult({ userId, exerciseId, datePerformed, setNumber, reps, weight, notes, source }) {
  const setNum = setNumber ?? 1;
  const { data: existing, error: findError } = await programming
    .from("logs")
    .select("id")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("date_performed", datePerformed)
    .eq("set_number", setNum)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  const fields = {
    reps: reps ?? null,
    weight: weight ?? null,
    notes: notes ?? null,
    source,
  };

  if (existing) {
    const { error } = await programming.from("logs").update(fields).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await programming.from("logs").insert({
      user_id: userId,
      exercise_id: exerciseId,
      date_performed: datePerformed,
      set_number: setNum,
      ...fields,
    });
    if (error) throw error;
  }
}

// Whatever's already been logged for this exercise today — used to
// pre-fill an exercise card's rows/notes when it's expanded, so autosaved
// progress survives a collapse/re-expand or a reload mid-session.
export async function getLoggedSetsForDate(userId, exerciseId, date) {
  const { data, error } = await programming
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("date_performed", date)
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data;
}

// Most recent past session's full set of rows for one exercise — the "last
// time you did this lift" reference panel. Fetches a small window ordered
// newest-first/set-ascending and takes whichever rows share the first
// (i.e. most recent) date_performed encountered, rather than a second
// round-trip to find that date first.
export async function getLastLoggedSession(userId, exerciseId, today) {
  const { data, error } = await programming
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .lt("date_performed", today)
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: true })
    .limit(20);
  if (error) throw error;
  if (!data.length) return null;
  const mostRecentDate = data[0].date_performed;
  return { date: mostRecentDate, sets: data.filter((r) => r.date_performed === mostRecentDate) };
}

// Distinct exercises this member has ever logged, most-recently-logged
// first — same-schema embed (logs -> exercises) is safe here, unlike the
// cross-schema core.users lookups elsewhere in this module.
export async function listLoggedExercises(userId) {
  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, date_performed, exercises(id, name, muscle_group)")
    .eq("user_id", userId)
    .order("date_performed", { ascending: false });
  if (error) throw error;

  const seen = new Map();
  for (const row of data) {
    if (!seen.has(row.exercise_id)) {
      seen.set(row.exercise_id, { exercise: row.exercises, lastDate: row.date_performed });
    }
  }
  return [...seen.values()];
}

export async function listLogsForExercise(userId, exerciseId) {
  const { data, error } = await programming
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data;
}
