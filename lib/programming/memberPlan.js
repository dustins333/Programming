import { programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";

// Every group program this member currently holds a membership in — a
// client can be enrolled in more than one at once now (e.g. Flagship plus
// a specialty program like "Look Like You Lift"), so this returns an
// array rather than the old single-row .maybeSingle() shape.
export async function listMyAssignments(userId) {
  const { data, error } = await programming
    .from("client_program_assignments")
    .select("*, group_programs(id, name, block_length_weeks, sessions_per_week, session_days)")
    .eq("user_id", userId);
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

// Every group_workouts row for one specific week of a block, across all 3
// session slots — the Today overview's "here are your 3 lifts this week"
// preview, as opposed to getWorkout's single (week, session) lookup. RLS's
// published-only member policy already filters this, same as getWorkout —
// an unpublished session slot just won't come back, the caller renders
// that as "not published yet" rather than treating it as an empty week.
export async function listWorkoutsForWeek(blockId, weekNumber) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber)
    .order("session_number");
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
// `session` is {groupWorkoutId} | {spcWorkoutId, weekNumber} | {oneOffWorkoutId},
// mirroring how session_completions keys the same three cases (0063). It is
// part of the row's identity, not just a label: without it, the same lift
// programmed in two sessions logged on one calendar date collided on
// (user, exercise, date, set) and the second silently overwrote the first.
//
// week_number is written for consistency with session_completions but is NOT
// an identifier: migration 0016 gave spc_workouts its own week_number column,
// so there is one row per (block, week, session) and spc_workout_id is
// already week-specific. Verified against live data — 60 workouts, no null
// weeks, no (block, session, week) duplicates, and zero completions whose
// spc_workout_id spans more than one week. Filter on the id alone.
export function sessionColumns(session) {
  return {
    group_workout_id: session?.groupWorkoutId ?? null,
    spc_workout_id: session?.spcWorkoutId ?? null,
    week_number: session?.spcWorkoutId ? session?.weekNumber ?? null : null,
    one_off_workout_id: session?.oneOffWorkoutId ?? null,
  };
}

// supabase-js turns .eq(col, null) into `col=eq.null`, which never matches a
// real NULL — the null side has to be .is(). Both the session-scoped lookup
// and the session-less fallback below go through here.
// week_number is deliberately never filtered on — spc_workout_id is already
// week-specific (see sessionColumns above).
function withSessionFilter(query, cols) {
  let q = query;
  for (const col of ["group_workout_id", "spc_workout_id", "one_off_workout_id"]) {
    q = cols[col] === null ? q.is(col, null) : q.eq(col, cols[col]);
  }
  return q;
}

const NO_SESSION = { group_workout_id: null, spc_workout_id: null, one_off_workout_id: null };

export async function logResult({ userId, exerciseId, datePerformed, setNumber, reps, weight, notes, source, session }) {
  const setNum = setNumber ?? 1;
  const cols = sessionColumns(session);
  const hasSession = Boolean(cols.group_workout_id || cols.spc_workout_id || cols.one_off_workout_id);

  const base = () =>
    programming
      .from("logs")
      .select("id")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .eq("date_performed", datePerformed)
      .eq("set_number", setNum)
      .order("created_at", { ascending: false })
      .limit(1);

  let existing = null;
  if (hasSession) {
    const { data, error } = await withSessionFilter(base(), cols).maybeSingle();
    if (error) throw error;
    existing = data;
  }

  // Fall back to a session-less lookup and ADOPT the row by stamping it.
  // Rows written before 0063 (and the 834 the backfill couldn't resolve)
  // carry no session, so a session-scoped lookup misses them — without this,
  // re-opening an old session would insert a duplicate set instead of
  // updating the one already there.
  let adopting = false;
  if (!existing) {
    const { data, error } = await withSessionFilter(base(), NO_SESSION).maybeSingle();
    if (error) throw error;
    if (data) {
      existing = data;
      adopting = hasSession;
    }
  }

  const fields = {
    reps: reps ?? null,
    weight: weight ?? null,
    notes: notes ?? null,
    source,
  };

  if (existing) {
    // An existing row gets updated even to null — clearing a field you'd
    // already filled in is a real, intentional edit and has to persist.
    const { error } = await programming
      .from("logs")
      .update(adopting ? { ...fields, ...cols } : fields)
      .eq("id", existing.id);
    if (error) throw error;
  } else if (reps !== null || weight !== null) {
    // But there's no reason to create a brand-new row that's entirely
    // blank — autosave fires on every edit to the whole `rows` array, not
    // just the set you touched, so filling in only Set 1 would otherwise
    // insert empty Set 2/Set 3 rows too. Those blank rows used to pollute
    // getLastLoggedSession below (it just took the most recent *date* with
    // any row, not the most recent date with real data).
    const { error } = await programming.from("logs").insert({
      user_id: userId,
      exercise_id: exerciseId,
      date_performed: datePerformed,
      set_number: setNum,
      ...cols,
      ...fields,
    });
    if (error) throw error;
  }
}

// Whatever's already been logged for this exercise today — used to
// pre-fill an exercise card's rows/notes when it's expanded, so autosaved
// progress survives a collapse/re-expand or a reload mid-session.
//
// Session-scoped when `session` is given, so a lift that appears in two
// sessions on the same date prefills from the right one. Falls back to
// session-less rows exactly like logResult's adopt path does — a session
// logged before 0063 has no session stamped until the next write, and
// showing an empty card for work she'd already done would be worse than
// briefly showing an unattributed row.
export async function getLoggedSetsForDate(userId, exerciseId, date, session) {
  const cols = sessionColumns(session);
  const hasSession = Boolean(cols.group_workout_id || cols.spc_workout_id || cols.one_off_workout_id);

  const base = () =>
    programming
      .from("logs")
      .select("*")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .eq("date_performed", date)
      .order("set_number", { ascending: true });

  if (hasSession) {
    const { data, error } = await withSessionFilter(base(), cols);
    if (error) throw error;
    if (data.length) return data;
  }

  const { data, error } = await withSessionFilter(base(), NO_SESSION);
  if (error) throw error;
  return data;
}

// Most recent past session's full set of rows for one exercise — the "last
// time you did this lift" reference panel. Fetches a wider window ordered
// newest-first/set-ascending, groups by date, and returns the first (most
// recent) date that actually has a logged value — NOT just the most recent
// date with any row at all. A date can have rows with no real data (e.g.
// the member expanded the card and filled in Set 1 but abandoned Set 2/3 —
// logResult now skips creating brand-new blank rows, but older data from
// before that fix can still have them), and showing that as "last time"
// is worse than skipping past it to a date with something to show.
export async function getLastLoggedSession(userId, exerciseId, today) {
  const { data, error } = await programming
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .lt("date_performed", today)
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: true })
    .limit(60);
  if (error) throw error;
  if (!data.length) return null;

  const byDate = new Map();
  for (const row of data) {
    if (!byDate.has(row.date_performed)) byDate.set(row.date_performed, []);
    byDate.get(row.date_performed).push(row);
  }
  for (const [date, sets] of byDate) {
    if (sets.some((s) => s.reps !== null || s.weight !== null)) {
      return { date, sets };
    }
  }
  return null;
}

// Batched counterpart to getLastLoggedSession — one query covering every
// exercise in a session instead of N. My Fitness's session overview shows
// last time's top set on each exercise row, and firing a separate query per
// row would be a real N+1 on a screen that renders on every focus.
//
// Returns Map<exerciseId, { date, sets, topSet }> where `sets` is that
// session's full row list (the member's logging card annotates each of
// today's set boxes with the matching set number's ghost value) and topSet
// is its heaviest logged set (ties broken by reps). Skips any date whose
// rows are all blank — same "a date with rows but no data isn't a last time"
// rule getLastLoggedSession applies.
export async function listLastLoggedSessions(userId, exerciseIds, today) {
  const result = new Map();
  if (!exerciseIds || exerciseIds.length === 0) return result;
  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, date_performed, set_number, reps, weight")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .lt("date_performed", today)
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: true })
    // Scaled to the session rather than a flat 600. One global cap ordered
    // by date meant a lift the member hadn't touched in months could have
    // every one of its rows fall past the cutoff, silently losing its
    // "Last time …" line and all of its ghost values. The per-exercise
    // backfill below covers whatever still slips through.
    .limit(Math.max(600, exerciseIds.length * 120));
  if (error) throw error;

  const byExercise = new Map();
  for (const row of data) {
    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, new Map());
    const byDate = byExercise.get(row.exercise_id);
    if (!byDate.has(row.date_performed)) byDate.set(row.date_performed, []);
    byDate.get(row.date_performed).push(row);
  }

  for (const [exerciseId, byDate] of byExercise) {
    for (const [date, sets] of byDate) {
      const real = sets.filter((s) => s.reps !== null || s.weight !== null);
      if (real.length === 0) continue;
      const topSet = real.reduce((best, s) =>
        (s.weight ?? -1) > (best.weight ?? -1) || ((s.weight ?? -1) === (best.weight ?? -1) && (s.reps ?? 0) > (best.reps ?? 0)) ? s : best
      );
      result.set(exerciseId, { date, sets: real, topSet });
      break; // byDate is already newest-first
    }
  }

  // Anything the batch didn't reach — a lift not performed in a long time —
  // gets one targeted lookup. Bounded by how many lifts are in this session
  // and normally zero, so this isn't the N+1 the batch query exists to
  // avoid; it's the tail that batch can't cover.
  const missing = exerciseIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const found = await Promise.all(missing.map((id) => getLastLoggedSession(userId, id, today).catch(() => null)));
    missing.forEach((id, i) => {
      const hit = found[i];
      if (!hit) return;
      // getLastLoggedSession returns { date, sets } — this function's
      // callers also expect topSet, so derive it the same way as above.
      const real = hit.sets.filter((set) => set.reps !== null || set.weight !== null);
      if (real.length === 0) return;
      const topSet = real.reduce((best, set) =>
        (set.weight ?? -1) > (best.weight ?? -1) ||
        ((set.weight ?? -1) === (best.weight ?? -1) && (set.reps ?? 0) > (best.reps ?? 0))
          ? set
          : best
      );
      result.set(id, { date: hit.date, sets: real, topSet });
    });
  }

  return result;
}

export async function listLogsForDate(userId, date) {
  const { data, error } = await programming
    .from("logs")
    .select("*, exercises(id, name)")
    .eq("user_id", userId)
    .eq("date_performed", date)
    .order("exercise_id", { ascending: true })
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data;
}

// Session-scoped sibling of the above — what one specific session holds,
// rather than everything logged that calendar day. This is what lets the
// coach's Training History stop showing three same-evening sessions' lifts
// under each of the three rows (see exerciseIdsForCompletion in coachLogs.js,
// the heuristic this replaces).
//
// Returns null when the session has no stamped rows at all, which callers
// read as "fall back to the by-date view" — every log written before 0063
// is in that state until the member next edits it.
export async function listLogsForSession(userId, session) {
  const cols = sessionColumns(session);
  if (!cols.group_workout_id && !cols.spc_workout_id && !cols.one_off_workout_id) return null;

  // No week_number filter, deliberately — see sessionColumns below on why
  // spc_workout_id is already week-specific. Adding one here could only ever
  // hide rows if a caller's weekNumber disagreed with the workout's own.
  const { data, error } = await withSessionFilter(
    programming
      .from("logs")
      .select("*, exercises(id, name)")
      .eq("user_id", userId)
      .order("date_performed", { ascending: true })
      .order("exercise_id", { ascending: true })
      .order("set_number", { ascending: true }),
    cols
  );
  if (error) throw error;
  return data.length ? data : null;
}

// `before` (a YYYY-MM-DD date) excludes that day and everything after it.
// Pass it whenever this is read as history *of* a session the member is
// currently in: her own half-typed sets autosave into this same table as she
// works, so without a cutoff today's in-progress numbers come back as the
// most recent entry — and get read as what she did last time. Omit it for My
// History's own screens, where a finished session today is genuinely history.
export async function listLogsForExercise(userId, exerciseId, before = null) {
  let query = programming
    .from("logs")
    .select("*, exercises(name)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (before) query = query.lt("date_performed", before);
  const { data, error } = await query
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data;
}
