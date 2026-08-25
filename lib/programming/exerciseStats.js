import { programming } from "../supabase/client";
import { addDays, todayInBoise } from "../boiseDate";

// Per-exercise progression for My History's Exercises view and its PR
// entries (design_handoff_member_mobile_v5, 1j/1k). Everything here is
// derived from programming.logs — no schema change, no stored "best"
// column that could drift out of sync with the sets themselves.
//
// PR rule, locked by the handoff: an exercise needs **3 logged sessions**
// before it's PR-eligible; after that, any increase over the previous best
// counts. No margin threshold, no rate limiting — early on, everything
// would be a PR, which is exactly why the 3-session gate exists.
const PR_MIN_SESSIONS = 3;
const TREND_POINTS = 7;
const JUMP_WINDOW_DAYS = 56; // 8 weeks, same window Weekly's trend uses

// One session of one exercise, reduced to its heaviest set (ties broken by
// reps) — the number progression is actually judged on.
function topSetOf(rows) {
  const real = rows.filter((r) => r.reps != null || r.weight != null);
  if (real.length === 0) return null;
  return real.reduce((best, r) =>
    (r.weight ?? -1) > (best.weight ?? -1) || ((r.weight ?? -1) === (best.weight ?? -1) && (r.reps ?? 0) > (best.reps ?? 0)) ? r : best
  );
}

// Everything the two History views need, from one query.
//
// Returns { exercises, personalRecords }:
//   exercises — one entry per logged exercise, most-recently-logged first,
//     each with its session series (ascending), best weight, last set and
//     the trend slice the sparkline draws.
//   personalRecords — flat, date-descending, ready to merge into the
//     By Day timeline.
export async function getExerciseStats(userId, today = todayInBoise()) {
  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, date_performed, set_number, reps, weight, exercises(id, name, muscle_group, tracks_weight, rep_unit)")
    .eq("user_id", userId)
    // DESCENDING, then reversed below. The cap has to keep the most RECENT
    // rows: ordered ascending it kept the oldest 4000, so past roughly
    // eighteen months of logging "Last done", best weight, PRs and the
    // biggest-jump card all silently froze on ancient data with no error.
    .order("date_performed", { ascending: false })
    .order("set_number", { ascending: false })
    .limit(4000);
  if (error) throw error;

  // Everything below groups in chronological order.
  data.reverse();

  // exercise_id -> { exercise, byDate: Map<date, rows[]> }
  const grouped = new Map();
  for (const row of data) {
    if (!row.exercises) continue; // exercise deleted out from under the log
    if (!grouped.has(row.exercise_id)) grouped.set(row.exercise_id, { exercise: row.exercises, byDate: new Map() });
    const entry = grouped.get(row.exercise_id);
    if (!entry.byDate.has(row.date_performed)) entry.byDate.set(row.date_performed, []);
    entry.byDate.get(row.date_performed).push(row);
  }

  const exercises = [];
  const personalRecords = [];
  const jumpCutoff = addDays(today, -JUMP_WINDOW_DAYS);

  for (const [exerciseId, { exercise, byDate }] of grouped) {
    // Ascending — a date with rows but no real numbers is skipped entirely
    // rather than counting toward the 3-session gate.
    const sessions = [];
    for (const [date, rows] of byDate) {
      const topSet = topSetOf(rows);
      if (topSet) sessions.push({ date, weight: topSet.weight ?? null, reps: topSet.reps ?? null });
    }
    if (sessions.length === 0) continue;

    const prEligible = exercise.tracks_weight !== false;
    let best = null;
    sessions.forEach((session, i) => {
      const priorBest = best;
      if (session.weight != null && (best == null || session.weight > best)) best = session.weight;
      // PR only once the exercise is eligible, and only on a genuine
      // increase over everything before it. `i >= PR_MIN_SESSIONS - 1` is
      // the 3rd session onward — the session that gets the exercise to
      // three is itself eligible.
      // A PR is defined on weight, so a reps-only lift has none. The
      // weight guard below would already cover a lift that never logged
      // one, but an exercise switched to reps-only can still have older
      // rows with real weights behind it — this keeps those from surfacing
      // as a new record on a lift that no longer tracks weight at all.
      if (prEligible && i >= PR_MIN_SESSIONS - 1 && session.weight != null && priorBest != null && session.weight > priorBest) {
        personalRecords.push({
          exerciseId,
          exerciseName: exercise.name,
          date: session.date,
          weight: session.weight,
          reps: session.reps,
          delta: Math.round((session.weight - priorBest) * 10) / 10,
          previousBest: priorBest,
          // Where the previous best was actually set, for the "up 25 lb
          // since June 14" line.
          previousDate: sessions.slice(0, i).filter((s) => s.weight === priorBest).pop()?.date ?? null,
        });
      }
    });

    const windowed = sessions.filter((s) => s.date >= jumpCutoff && s.weight != null);
    const jump =
      windowed.length >= 2 ? Math.round((windowed[windowed.length - 1].weight - windowed[0].weight) * 10) / 10 : null;

    const last = sessions[sessions.length - 1];
    exercises.push({
      exercise,
      sessions,
      sessionCount: sessions.length,
      best,
      lastDate: last.date,
      lastReps: last.reps,
      lastWeight: last.weight,
      trend: sessions.slice(-TREND_POINTS).map((s) => s.weight),
      jump,
      jumpFrom: windowed[0]?.date ?? null,
      jumpTo: windowed[windowed.length - 1]?.date ?? null,
    });
  }

  exercises.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));
  personalRecords.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { exercises, personalRecords };
}

// Roster-wide "New PRs" for the coach launchpad's Today in the Gym card
// (design_handoff_coach_web_v2, 1a). Lives here rather than in
// gymToday.js specifically so it shares PR_MIN_SESSIONS and topSetOf with
// getExerciseStats above — the member app and the coach dashboard must
// never disagree about what counts as a PR.
//
// Two queries, not one per client: the pairs logged today, then every log
// belonging to those users AND those exercises. The `.in` pair is a cross
// product, so it over-fetches (a user's logs for an exercise someone else
// did today) — that's filtered back down client-side, and it's still far
// cheaper than one round trip per person who trained.
export async function countPersonalRecordsOn(date = todayInBoise()) {
  const { data: todays, error: todaysError } = await programming
    .from("logs")
    .select("user_id, exercise_id")
    .eq("date_performed", date)
    .limit(2000);
  if (todaysError) throw todaysError;
  if (todays.length === 0) return 0;

  const pairs = new Set(todays.map((r) => `${r.user_id}|${r.exercise_id}`));
  const userIds = [...new Set(todays.map((r) => r.user_id))];
  const exerciseIds = [...new Set(todays.map((r) => r.exercise_id))];

  const { data, error } = await programming
    .from("logs")
    .select("user_id, exercise_id, date_performed, reps, weight, exercises(id, tracks_weight, rep_unit)")
    .in("user_id", userIds)
    .in("exercise_id", exerciseIds)
    .lte("date_performed", date)
    .order("date_performed", { ascending: true })
    .limit(20000);
  if (error) throw error;

  // pair -> Map<date, rows[]>
  const byPair = new Map();
  for (const row of data) {
    const key = `${row.user_id}|${row.exercise_id}`;
    if (!pairs.has(key)) continue; // cross-product spillover
    if (row.exercises?.tracks_weight === false) continue; // no weight, no record
    if (!byPair.has(key)) byPair.set(key, new Map());
    const byDate = byPair.get(key);
    if (!byDate.has(row.date_performed)) byDate.set(row.date_performed, []);
    byDate.get(row.date_performed).push(row);
  }

  let prs = 0;
  for (const byDate of byPair.values()) {
    const sessions = [];
    for (const [sessionDate, rows] of byDate) {
      const top = topSetOf(rows);
      if (top) sessions.push({ date: sessionDate, weight: top.weight ?? null });
    }
    // Only today's session can be a new PR, and only if the exercise is
    // already eligible — same 3-session gate as getExerciseStats.
    const last = sessions[sessions.length - 1];
    if (!last || last.date !== date || last.weight == null) continue;
    if (sessions.length < PR_MIN_SESSIONS) continue;
    const priorBest = sessions.slice(0, -1).reduce((best, s) => (s.weight != null && (best == null || s.weight > best) ? s.weight : best), null);
    if (priorBest != null && last.weight > priorBest) prs += 1;
  }
  return prs;
}

// A session's own PR check, scoped to just the exercises it contains — backs
// the finalize plate's "ink" face (design_handoff_member_finalize_v1), which
// needs to know whether *this specific session* held a best the instant it's
// finalized. Reuses topSetOf/PR_MIN_SESSIONS so the plate can never disagree
// with My History's own PR list about what counts as a personal record.
// Returns results in the same order `exerciseIds` was passed in (a session's
// own lift order), so a caller picking "the" best for one plate can just take
// the first entry rather than inventing a cross-exercise tie-break.
export async function getSessionBests(userId, exerciseIds, date) {
  const ids = [...new Set(exerciseIds.filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await programming
    .from("logs")
    .select("exercise_id, date_performed, set_number, reps, weight, exercises(id, name, tracks_weight, rep_unit)")
    .eq("user_id", userId)
    .in("exercise_id", ids)
    .lte("date_performed", date)
    .order("date_performed", { ascending: true })
    .order("set_number", { ascending: true });
  if (error) throw error;

  const byExercise = new Map();
  for (const row of data) {
    if (!row.exercises) continue;
    if (row.exercises.tracks_weight === false) continue; // no weight, no record
    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, { exercise: row.exercises, byDate: new Map() });
    const entry = byExercise.get(row.exercise_id);
    if (!entry.byDate.has(row.date_performed)) entry.byDate.set(row.date_performed, []);
    entry.byDate.get(row.date_performed).push(row);
  }

  const bests = [];
  for (const exerciseId of ids) {
    const entry = byExercise.get(exerciseId);
    if (!entry) continue;

    const sessions = [];
    for (const [sessionDate, rows] of entry.byDate) {
      const topSet = topSetOf(rows);
      if (topSet) sessions.push({ date: sessionDate, weight: topSet.weight ?? null, reps: topSet.reps ?? null });
    }
    if (sessions.length < PR_MIN_SESSIONS) continue;

    const last = sessions[sessions.length - 1];
    if (last.date !== date || last.weight == null) continue;

    const priorBest = sessions
      .slice(0, -1)
      .reduce((best, s) => (s.weight != null && (best == null || s.weight > best) ? s.weight : best), null);
    if (priorBest != null && last.weight > priorBest) {
      bests.push({
        exerciseId,
        exerciseName: entry.exercise.name,
        weight: last.weight,
        reps: last.reps,
        delta: Math.round((last.weight - priorBest) * 10) / 10,
      });
    }
  }
  return bests;
}

// The single biggest gain in the trailing window — the "BIGGEST JUMP THIS
// BLOCK" card. Null when nobody has two comparable sessions yet.
export function biggestJump(exercises) {
  const candidates = exercises.filter((e) => e.jump != null && e.jump > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) => (e.jump > best.jump ? e : best));
}
