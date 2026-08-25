import { programming } from "../supabase/client";
import { todayInBoise, addDays, dateInBoise, daysBetween } from "../boiseDate";
import { setVolume } from "./volume";

// One SPC block, session by session (design_handoff_coach_web_v2, screens
// 15 and 16). Both screens read from here so the grid's "14 of 18 sets" and
// the session read-out's own count can't disagree.
//
// A known join gap, worth understanding before trusting the set counts:
// programming.logs has no workout id. A log row records (user, exercise,
// date, set) and nothing about which session it belonged to, so a logged
// session's sets are matched by the date it was finalized on. That's the
// same simplification lib/history.js's day timeline already documents. It's
// safe here in a way it isn't everywhere: SPC clients train 1–4× a week and
// two SPC sessions finalized on one calendar day is rare. If that ever
// stops being true, logs would need a real session reference — not a
// smarter query.

// Week N of a block runs from start + (N-1)*7 for seven days.
export function weekWindow(block, weekNumber) {
  const start = addDays(block.block_start_date, (weekNumber - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export async function getSpcBlockDetail(userId, blockId, today = todayInBoise()) {
  const { data: block, error: blockError } = await programming.from("spc_blocks").select("*").eq("id", blockId).single();
  if (blockError) throw blockError;

  const { data: workouts, error: workoutsError } = await programming
    .from("spc_workouts")
    .select("id, week_number, session_number, title, status")
    .eq("spc_block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (workoutsError) throw workoutsError;

  const workoutIds = workouts.map((w) => w.id);
  const [prescriptions, completions] = await Promise.all([
    listPrescriptions(workoutIds),
    listCompletions(userId, workoutIds),
  ]);

  // Logs across the whole block window, bucketed by date — one query rather
  // than one per session.
  const blockEnd = block.block_end_date;
  const { data: logRows, error: logsError } = await programming
    .from("logs")
    .select("exercise_id, date_performed, set_number, reps, weight, notes, spc_workout_id, exercises(id, name)")
    .eq("user_id", userId)
    .gte("date_performed", block.block_start_date)
    .lte("date_performed", blockEnd)
    .order("date_performed")
    .order("set_number");
  if (logsError) throw logsError;

  const logsByDate = new Map();
  // Bucketed by workout as well as by date since 0063. Two SPC sessions
  // finalized on one day used to hand each other's sets to both read-outs;
  // where a row carries a real spc_workout_id it's now attributed exactly.
  const logsByWorkout = new Map();
  for (const row of logRows) {
    if (!logsByDate.has(row.date_performed)) logsByDate.set(row.date_performed, []);
    logsByDate.get(row.date_performed).push(row);
    if (row.spc_workout_id) {
      if (!logsByWorkout.has(row.spc_workout_id)) logsByWorkout.set(row.spc_workout_id, []);
      logsByWorkout.get(row.spc_workout_id).push(row);
    }
  }

  const sessions = workouts.map((w) => {
    const lifts = prescriptions.get(w.id) ?? [];
    const programmedSets = lifts.reduce((n, l) => n + prescribedSetCount(l), 0);
    const completedAt = completions.get(w.id) ?? null;
    const loggedDate = completedAt ? dateInBoise(new Date(completedAt)) : null;
    // Session-stamped rows win; the by-date bucket is the fallback for logs
    // written before 0063.
    const logs = logsByWorkout.get(w.id) ?? (loggedDate ? (logsByDate.get(loggedDate) ?? []) : []);
    const loggedSets = logs.filter((r) => r.reps != null || r.weight != null).length;

    return {
      ...w,
      lifts,
      programmedSets,
      completedAt,
      loggedDate,
      // Carried so buildSessionReadout doesn't have to re-derive it from the
      // date and lose the session attribution resolved just above.
      logs,
      loggedSets,
      state: sessionState({ workout: w, block, completedAt, liftCount: lifts.length, today }),
    };
  });

  return {
    block,
    sessions,
    logsByDate,
    summary: summarize(sessions, block, today),
  };
}

// A session's rep_scheme is the truth about how many sets were prescribed;
// `sets` is only the fallback for rows written before rep_scheme existed.
function prescribedSetCount(lift) {
  return lift.rep_scheme?.length ? lift.rep_scheme.length : (lift.sets ?? 0);
}

function prescribedReps(lift) {
  const scheme = lift.rep_scheme?.length ? lift.rep_scheme : Array(lift.sets ?? 0).fill(lift.reps);
  return scheme.map((r) => parseReps(r));
}

// "10", "10-12", "8 / side" — the first number is the one a rep count is
// judged against. A range counts as met at its lower bound.
function parseReps(value) {
  if (value == null) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

// Five states, and the distinction that matters is between "she hasn't done
// it yet" and "she isn't going to" — a published session whose week has
// fully passed without a completion is skipped, not pending.
function sessionState({ workout, block, completedAt, liftCount, today }) {
  if (completedAt) return "logged";
  if (liftCount === 0) return "empty";
  if (workout.status !== "published") return "draft";
  const { start, end } = weekWindow(block, workout.week_number);
  if (end < today) return "skipped";
  if (start > today) return "upcoming";
  return "due";
}

function summarize(sessions, block, today) {
  const logged = sessions.filter((s) => s.state === "logged");
  const skipped = sessions.filter((s) => s.state === "skipped");
  const pending = sessions.filter((s) => s.state === "due" || s.state === "upcoming");

  // Adherence is measured against what has actually come due, not against
  // the whole block — a block in week 2 of 6 isn't 33% adherent, it's on
  // track or it isn't.
  const due = logged.length + skipped.length;
  const setsSkipped = skipped.reduce((n, s) => n + s.programmedSets, 0);

  return {
    total: sessions.length,
    logged: logged.length,
    skipped: skipped.length,
    pending: pending.length,
    draft: sessions.filter((s) => s.state === "draft").length,
    empty: sessions.filter((s) => s.state === "empty").length,
    adherence: due > 0 ? Math.round((logged.length / due) * 100) : null,
    setsSkipped,
    daysLeft: daysBetween(block.block_end_date, today),
  };
}

async function listPrescriptions(workoutIds) {
  if (!workoutIds.length) return new Map();
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("*, exercises(id, name, tracks_weight)")
    .in("spc_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = new Map();
  for (const row of data) {
    if (!byWorkout.has(row.spc_workout_id)) byWorkout.set(row.spc_workout_id, []);
    byWorkout.get(row.spc_workout_id).push(row);
  }
  return byWorkout;
}

async function listCompletions(userId, workoutIds) {
  if (!workoutIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("spc_workout_id, completed_at")
    .eq("user_id", userId)
    .in("spc_workout_id", workoutIds);
  if (error) throw error;
  return new Map(data.map((r) => [r.spc_workout_id, r.completed_at]));
}

/* ------------------------------------------- session read-out (screen 16) */

// Programmed against logged, per set.
//
// Reps are compared against reps and nothing else. Weight is never
// programmed in this app, so there is no "went heavier" verdict to give —
// heavier than what? Loads are shown because they're interesting, not
// because they were prescribed.
export function buildSessionReadout({ session, logsByDate, personalRecords = [] }) {
  // session.logs is already attributed by session where 0063 could do it;
  // logsByDate stays as the fallback for a caller that builds a session
  // object by hand.
  const logs = session.logs ?? (session.loggedDate ? (logsByDate?.get(session.loggedDate) ?? []) : []);
  const byExercise = new Map();
  for (const row of logs) {
    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, []);
    byExercise.get(row.exercise_id).push(row);
  }

  const prByExercise = new Map();
  for (const pr of personalRecords) {
    if (pr.date === session.loggedDate) prByExercise.set(pr.exerciseId, pr);
  }

  let setsCompleted = 0;
  let setsHittingTarget = 0;
  let volume = 0;

  const rows = session.lifts.map((lift) => {
    const targets = prescribedReps(lift);
    const sets = (byExercise.get(lift.exercise_id) ?? []).sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
    const done = sets.filter((s) => s.reps != null || s.weight != null);
    setsCompleted += done.length;

    let shortfall = 0;
    const setRows = targets.map((target, i) => {
      const actual = sets[i] ?? null;
      const reps = actual?.reps ?? null;
      const weight = actual?.weight ?? null;
      volume += setVolume(reps, weight, lift.exercises?.tracks_weight);
      const met = target == null || (reps != null && reps >= target);
      if (reps != null && met) setsHittingTarget += 1;
      if (reps != null && target != null && reps < target) shortfall += target - reps;
      return { setNumber: i + 1, target, reps, weight, met, logged: reps != null || weight != null };
    });

    const pr = prByExercise.get(lift.exercise_id) ?? null;
    return {
      lift,
      name: lift.exercises?.name ?? "Unknown exercise",
      programmed: describePrescription(lift),
      supersetGroupId: lift.superset_group_id ?? null,
      sets: setRows,
      shortfall,
      pr,
      // Member's own note for this lift — logResult writes the same note
      // onto every set row of that exercise, so the first non-empty one is
      // the note, not one of several.
      note: sets.find((s) => s.notes)?.notes ?? null,
      result: pr ? "pr" : shortfall > 0 ? "short" : done.length > 0 ? "as_written" : "not_logged",
    };
  });

  const totalSets = rows.reduce((n, r) => n + r.sets.length, 0);
  return {
    rows,
    setsCompleted,
    totalSets,
    setsHittingTarget,
    volume: Math.round(volume),
  };
}

function describePrescription(lift) {
  const scheme = lift.rep_scheme?.length ? lift.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? unique[0] || "—" : scheme.join(", ")}`;
  }
  return `${lift.sets ?? 0} × ${lift.reps || "—"}`;
}

// Superset pairs share a letter, in document order — same convention the
// builder's collapsed rows use.
export function supersetLettersFor(rows) {
  const letters = {};
  let next = 0;
  for (const r of rows) {
    if (!r.supersetGroupId) continue;
    if (!(r.supersetGroupId in letters)) {
      letters[r.supersetGroupId] = String.fromCharCode(65 + next);
      next += 1;
    }
  }
  return letters;
}
