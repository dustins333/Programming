import { programming } from "../supabase/client";
import { todayInBoise, addDays, dateInBoise, daysBetween } from "../boiseDate";
import { setVolume } from "./volume";
import { repUnit } from "./repUnit";
import { calendarWeekNumber } from "./schedule";

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

// A sessions-format run (0105) has ONE spc_workouts row per session for the
// whole block, with every row authored week 1 — the week a completion, note or
// log belongs to lives on that row instead. So for those blocks this file
// EXPANDS each workout into one entry per calendar week, which is the shape
// both screens were built for (a weeks x sessions grid) and the shape a weekly
// block still arrives in naturally. Without it the grid drew a single "Week 1"
// row for a whole block, one arbitrary week's date stood for all of them, and
// every week's sets were added together.
//
// Everything week-specific is therefore keyed on (workout, week), never on the
// workout alone.
const sessionKey = (workoutId, week) => `${workoutId}:${week ?? "x"}`;

// How many calendar weeks a run covers. A dated block is bounded by its end;
// an ONGOING one (0103) has none, so it runs to the week it is in now —
// drawing empty future weeks would invent a length nobody set.
function weekCountFor(block, today) {
  if (!block?.block_start_date) return 1;
  const last = calendarWeekNumber(block.block_start_date, block.block_end_date ?? today);
  return Math.max(last, 1);
}

// Week N of a block runs from start + (N-1)*7 for seven days.
export function weekWindow(block, weekNumber) {
  // A draft block (0089) has no start date until it's sent, so its weeks have
  // no calendar position yet. Nulls rather than a guessed date: every caller
  // renders "Week 3" without a range instead of a made-up one.
  if (!block?.block_start_date) return { start: null, end: null };
  const start = addDays(block.block_start_date, (weekNumber - 1) * 7);
  return { start, end: addDays(start, 6) };
}

// supabase-js turns .in(col, []) into a filter that matches nothing useful;
// this sentinel keeps an empty block's query explicit rather than relying on
// that behaviour.
const NO_ROWS_UUID = "00000000-0000-0000-0000-000000000000";

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
  const weekByWorkout = new Map(workouts.map((w) => [w.id, w.week_number]));
  const [prescriptions, completions] = await Promise.all([
    listPrescriptions(workoutIds),
    listCompletions(userId, workoutIds, weekByWorkout),
  ]);

  // Logs across the whole block window, bucketed by date — one query rather
  // than one per session. A draft has no window and, having never been
  // visible to the client, can have nothing logged against it — so the query
  // is skipped outright rather than run with a null bound.
  const logRows = block.block_start_date
    ? await listBlockLogs(userId, block.block_start_date, block.block_end_date)
    : [];

  // The one note per lift (0087) — the same rows the wall display, the coach's
  // live session page and the member's own card all read and write. Fetched
  // for the whole block in one query and preferred over logs.notes below,
  // which is now only where notes written BEFORE 0087 live.
  const { data: noteRows, error: notesError } = await programming
    .from("exercise_coaching_notes")
    .select("exercise_id, spc_workout_id, week_number, body, author_name, created_at")
    .eq("user_id", userId)
    .in("spc_workout_id", workoutIds.length ? workoutIds : [NO_ROWS_UUID])
    .order("created_at", { ascending: false });
  if (notesError) throw notesError;

  // Newest per (workout, week, lift) wins — the table is append-only, so a
  // later note supersedes rather than replacing in place. The week matters:
  // without it a note written in week 1 is handed to every week's read-out.
  const notesByKey = new Map();
  for (const row of noteRows ?? []) {
    const key = sessionKey(row.spc_workout_id, row.week_number ?? weekByWorkout.get(row.spc_workout_id));
    if (!notesByKey.has(key)) notesByKey.set(key, new Map());
    const forSession = notesByKey.get(key);
    if (!forSession.has(row.exercise_id)) forSession.set(row.exercise_id, row);
  }

  const logsByDate = new Map();
  // Bucketed by workout as well as by date since 0063. Two SPC sessions
  // finalized on one day used to hand each other's sets to both read-outs;
  // where a row carries a real spc_workout_id it's now attributed exactly.
  const logsByWorkout = new Map();
  // And by (workout, week), for a run whose one workout row spans every week.
  // The week comes from the day the set was logged, resolved exactly the way
  // spcCompletionWeek() resolves it, so a week's sets and its completion can
  // never disagree about which week they belong to.
  const logsByWorkoutWeek = new Map();
  for (const row of logRows) {
    if (!logsByDate.has(row.date_performed)) logsByDate.set(row.date_performed, []);
    logsByDate.get(row.date_performed).push(row);
    if (row.spc_workout_id) {
      if (!logsByWorkout.has(row.spc_workout_id)) logsByWorkout.set(row.spc_workout_id, []);
      logsByWorkout.get(row.spc_workout_id).push(row);
      if (block.block_start_date) {
        const key = sessionKey(row.spc_workout_id, calendarWeekNumber(block.block_start_date, row.date_performed));
        if (!logsByWorkoutWeek.has(key)) logsByWorkoutWeek.set(key, []);
        logsByWorkoutWeek.get(key).push(row);
      }
    }
  }

  // A started sessions-format run is expanded into one entry per calendar
  // week (see the note at the top of this file). A weekly block, and a draft
  // that has no dates yet, already has one row per week and is left alone —
  // which also keeps the send-a-draft preview a plain list of sessions.
  const expandedByWeek = block.format === "sessions" && Boolean(block.block_start_date);
  const allWeeks = expandedByWeek
    ? Array.from({ length: weekCountFor(block, today) }, (_, i) => i + 1)
    : null;

  const buildSession = (w, week) => {
    const lifts = prescriptions.get(w.id) ?? [];
    const programmedSets = lifts.reduce((n, l) => n + prescribedSetCount(l), 0);
    const key = sessionKey(w.id, week);
    const completedAt = completions.get(key) ?? null;
    const loggedDate = completedAt ? dateInBoise(new Date(completedAt)) : null;
    // Session-stamped rows win; the by-date bucket is the fallback for logs
    // written before 0063.
    const attributed = expandedByWeek ? logsByWorkoutWeek.get(key) : logsByWorkout.get(w.id);
    const logs = attributed ?? (loggedDate ? (logsByDate.get(loggedDate) ?? []) : []);
    const loggedSets = logs.filter((r) => r.reps != null || r.weight != null).length;
    // The authored row says week 1 for every week of a run; the entry has to
    // carry the week it actually stands for, or sessionState reads week 1's
    // dates and calls the whole rest of the block skipped.
    const workout = week === w.week_number ? w : { ...w, week_number: week };

    return {
      ...workout,
      // Identity for anything that has to tell two entries apart — several can
      // share a workout id now, so `id` no longer does. `id` is still the row
      // to open in the builder: one prescription serves every week.
      key,
      lifts,
      programmedSets,
      completedAt,
      loggedDate,
      // Carried so buildSessionReadout doesn't have to re-derive it from the
      // date and lose the session attribution resolved just above.
      logs,
      loggedSets,
      // Map<exerciseId, note row> for this session, read by buildSessionReadout.
      notesByExerciseId: notesByKey.get(key) ?? new Map(),
      state: sessionState({ workout, block, completedAt, liftCount: lifts.length, today }),
    };
  };

  const sessions = workouts.flatMap((w) => (allWeeks ?? [w.week_number]).map((week) => buildSession(w, week)));

  return {
    block,
    sessions,
    // True when `sessions` holds one entry per (session, week) rather than one
    // per workout row — so the grid knows several cells share a workout id,
    // and copy-between-tiles has nothing to do.
    expandedByWeek,
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
  // Nothing in a draft block is visible to the client whatever its own
  // publish flag says, so "published or not" is not the question worth
  // answering about it — "does it have work in it" is.
  if (block.status === "draft") return "ready";
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
    ready: sessions.filter((s) => s.state === "ready").length,
    daysLeft: block.block_end_date ? daysBetween(block.block_end_date, today) : null,
  };
}

// An ONGOING program (0103) has no end date, so there is no upper bound to
// apply. `.lte(col, null)` is not a no-op — supabase-js serializes it as
// `date_performed=lte.null` and Postgres rejects it (22007, "invalid input
// syntax for type date"), which threw on every screen that reads a block for
// a client whose program has no end.
async function listBlockLogs(userId, start, end) {
  let query = programming
    .from("logs")
    .select("exercise_id, date_performed, set_number, reps, weight, notes, spc_workout_id, exercises(id, name)")
    .eq("user_id", userId)
    .gte("date_performed", start);
  if (end) query = query.lte("date_performed", end);

  const { data, error } = await query.order("date_performed").order("set_number");
  if (error) throw error;
  return data;
}

async function listPrescriptions(workoutIds) {
  if (!workoutIds.length) return new Map();
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("*, exercises(id, name, tracks_weight, rep_unit)")
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

// Keyed by (workout, week). Keying on the workout alone collapsed every week
// of a sessions-format run into one entry and let whichever row came back last
// decide the date — so a session done in week 1 read as done in every week,
// and its sets were counted against all of them. A weekly block is unaffected:
// its completions carry exactly their workout's own week (checked live —
// 13 rows, none null, none differing).
//
// Ordered by instance so a make-up (a second completion of the same week)
// supersedes the first, matching what getSpcCompletion puts on screen.
async function listCompletions(userId, workoutIds, weekByWorkout) {
  if (!workoutIds.length) return new Map();
  const { data, error } = await programming
    .from("session_completions")
    .select("spc_workout_id, week_number, instance, completed_at")
    .eq("user_id", userId)
    .in("spc_workout_id", workoutIds)
    .order("instance");
  if (error) throw error;
  const byKey = new Map();
  for (const r of data) {
    // Falling back to the workout's own week means a row that somehow has no
    // week is still shown, rather than silently reading as never logged.
    byKey.set(sessionKey(r.spc_workout_id, r.week_number ?? weekByWorkout?.get(r.spc_workout_id)), r.completed_at);
  }
  return byKey;
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
      volume += setVolume(reps, weight, lift.exercises);
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
      // THE note on this lift (0087) — whoever wrote it, coach or client.
      // Falls back to logs.notes, which is where notes written before the
      // stores were merged still live (logResult copied the same text onto
      // every set row, so the first non-empty one is the note).
      note:
        session.notesByExerciseId?.get(lift.exercise_id)?.body ??
        sets.find((s) => s.notes)?.notes ??
        null,
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
  const u = repUnit(lift.exercises).suffix;
  const tag = (v) => (v === "" || v == null ? "—" : `${v}${u}`);
  const scheme = lift.rep_scheme?.length ? lift.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? tag(unique[0]) : scheme.map(tag).join(", ")}`;
  }
  return `${lift.sets ?? 0} × ${tag(lift.reps)}`;
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
