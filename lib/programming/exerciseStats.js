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
    .select("exercise_id, date_performed, set_number, reps, weight, exercises(id, name, muscle_group)")
    .eq("user_id", userId)
    .order("date_performed", { ascending: true })
    .order("set_number", { ascending: true })
    .limit(4000);
  if (error) throw error;

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

    let best = null;
    sessions.forEach((session, i) => {
      const priorBest = best;
      if (session.weight != null && (best == null || session.weight > best)) best = session.weight;
      // PR only once the exercise is eligible, and only on a genuine
      // increase over everything before it. `i >= PR_MIN_SESSIONS - 1` is
      // the 3rd session onward — the session that gets the exercise to
      // three is itself eligible.
      if (i >= PR_MIN_SESSIONS - 1 && session.weight != null && priorBest != null && session.weight > priorBest) {
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

// The single biggest gain in the trailing window — the "BIGGEST JUMP THIS
// BLOCK" card. Null when nobody has two comparable sessions yet.
export function biggestJump(exercises) {
  const candidates = exercises.filter((e) => e.jump != null && e.jump > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) => (e.jump > best.jump ? e : best));
}
