import { programming } from "../supabase/client";

export async function getWorkout(workoutId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("*, group_blocks(id, group_program_id, group_programs(name))")
    .eq("id", workoutId)
    .single();
  if (error) throw error;
  return data;
}

export async function listWarmups(workoutId) {
  const { data, error } = await programming
    .from("group_workout_warmups")
    .select("*, exercises(id, name)")
    .eq("group_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addWarmup({ workoutId, exerciseId, position, label, sets, reps }) {
  const { data, error } = await programming
    .from("group_workout_warmups")
    .insert({
      group_workout_id: workoutId,
      exercise_id: exerciseId ?? null,
      position,
      label: label ?? null,
      sets: sets ?? null,
      reps: reps ?? null,
    })
    .select("*, exercises(id, name)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateWarmup(id, fields) {
  const { error } = await programming.from("group_workout_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeWarmup(id) {
  const { error } = await programming.from("group_workout_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function listWorkoutExercises(workoutId) {
  const { data, error } = await programming
    .from("group_workout_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight)")
    .eq("group_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addWorkoutExercise({ workoutId, exerciseId, position, sets = 3, reps = "10" }) {
  const { data, error } = await programming
    .from("group_workout_exercises")
    .insert({
      group_workout_id: workoutId,
      exercise_id: exerciseId,
      position,
      sets,
      reps,
      rep_scheme: Array(sets).fill(reps),
    })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkoutExercise(id, fields) {
  const { error } = await programming.from("group_workout_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeWorkoutExercise(id) {
  const { error } = await programming.from("group_workout_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderWorkoutExercises(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("group_workout_exercises").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}

// Batches exercise names for a whole set of workouts (e.g. a program panel's
// 6-week look-ahead) into one query grouped client-side, instead of one
// listWorkoutExercises() call per workout.
export async function listWorkoutExercisesForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("group_workout_exercises")
    .select("group_workout_id, position, exercises(name)")
    .in("group_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = {};
  for (const row of data) {
    (byWorkout[row.group_workout_id] ??= []).push(row.exercises?.name ?? "Unknown exercise");
  }
  return byWorkout;
}

// Everything a Group Programs grid cell says about itself in one pass:
// "7 lifts · 1 superset · warm-up set" (design_handoff_coach_web_v2, 1b),
// plus the movement patterns the finalize preflight checks balance on.
//
// Two queries for the whole grid, not per cell. listWorkoutExercisesForWorkouts
// above stays as-is — it's the lighter "just the names" version the native
// grid and the SPC grid still use.
export async function listSessionSummaries(workoutIds) {
  if (!workoutIds.length) return {};
  const [{ data: lifts, error }, { data: warmups, error: warmupError }] = await Promise.all([
    programming
      .from("group_workout_exercises")
      .select("group_workout_id, position, superset_group_id, exercises(name, movement_pattern)")
      .in("group_workout_id", workoutIds)
      .order("position"),
    programming.from("group_workout_warmups").select("group_workout_id").in("group_workout_id", workoutIds),
  ]);
  if (error) throw error;
  if (warmupError) throw warmupError;

  const byWorkout = {};
  const ensure = (id) => (byWorkout[id] ??= { names: [], patterns: [], supersetIds: new Set(), warmupCount: 0 });

  for (const row of lifts) {
    const entry = ensure(row.group_workout_id);
    entry.names.push(row.exercises?.name ?? "Unknown exercise");
    for (const pattern of row.exercises?.movement_pattern ?? []) entry.patterns.push(pattern);
    if (row.superset_group_id) entry.supersetIds.add(row.superset_group_id);
  }
  for (const row of warmups) ensure(row.group_workout_id).warmupCount += 1;

  return Object.fromEntries(
    Object.entries(byWorkout).map(([id, e]) => [
      id,
      {
        names: e.names,
        patterns: e.patterns,
        liftCount: e.names.length,
        supersetCount: e.supersetIds.size,
        warmupCount: e.warmupCount,
      },
    ])
  );
}

// Last week's version of the session being built — the right rail's
// "SAME SESSION, LAST WEEK" card (design_handoff_coach_web_v2, 1e), so a
// coach programs against what they actually wrote rather than from memory.
// Null in week 1, where there is no last week.
export async function getSameSessionLastWeek(blockId, weekNumber, sessionNumber) {
  if (!weekNumber || weekNumber <= 1) return null;
  const { data: workout, error } = await programming
    .from("group_workouts")
    .select("id, week_number, session_number, title")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber - 1)
    .eq("session_number", sessionNumber)
    .maybeSingle();
  if (error) throw error;
  if (!workout) return null;

  const { data: lifts, error: liftsError } = await programming
    .from("group_workout_exercises")
    .select("id, sets, reps, rep_scheme, position, exercises(name)")
    .eq("group_workout_id", workout.id)
    .order("position");
  if (liftsError) throw liftsError;

  return { workout, lifts };
}

// "Clear lifts" from the grid's bulk action bar. Warm-ups go with the
// lifts — the action reads as "empty these sessions", and leaving orphaned
// warm-ups behind would make an otherwise-empty cell still count as built.
export async function clearWorkoutContent(workoutIds) {
  if (!workoutIds.length) return;
  const { error } = await programming.from("group_workout_exercises").delete().in("group_workout_id", workoutIds);
  if (error) throw error;
  const { error: warmupError } = await programming
    .from("group_workout_warmups")
    .delete()
    .in("group_workout_id", workoutIds);
  if (warmupError) throw warmupError;
}

// Spec scopes the live pattern tally to the whole week (all 3 sessions),
// not just the session being edited — sibling sessions' exercises aren't
// part of this screen's editable state, so their patterns are fetched
// once and combined with the current session's live local state by the
// caller (PatternTally), rather than refetched on every edit.
// Returns [{ name, patterns }] rather than a flat pattern list — the tally
// names the lifts behind each bubble on hover, so the count alone isn't
// enough.
export async function getSiblingLifts(blockId, weekNumber, excludeWorkoutId) {
  const { data: workouts, error } = await programming
    .from("group_workouts")
    .select("id")
    .eq("block_id", blockId)
    .eq("week_number", weekNumber)
    .neq("id", excludeWorkoutId);
  if (error) throw error;

  const ids = workouts.map((w) => w.id);
  if (!ids.length) return [];

  const { data: rows, error: exError } = await programming
    .from("group_workout_exercises")
    .select("exercises(name, movement_pattern)")
    .in("group_workout_id", ids);
  if (exError) throw exError;

  return rows.map((r) => ({ name: r.exercises?.name ?? "Unknown exercise", patterns: r.exercises?.movement_pattern ?? [] }));
}

// Plain content copy for the Group Programs calendar's copy-mode flow —
// warmups + exercises only (not status), and no live link afterward: each
// target is independently editable once copied, same as if a coach had
// built it by hand. Overwrites whatever the target already had; the caller
// is responsible for confirming that with the coach first.
export async function copyWorkoutContent(sourceWorkoutId, targetWorkoutId) {
  const [warmups, exercises, { data: source, error: sourceError }] = await Promise.all([
    listWarmups(sourceWorkoutId),
    listWorkoutExercises(sourceWorkoutId),
    programming.from("group_workouts").select("title").eq("id", sourceWorkoutId).single(),
  ]);
  if (sourceError) throw sourceError;

  const [delWarmups, delExercises, titleUpdate] = await Promise.all([
    programming.from("group_workout_warmups").delete().eq("group_workout_id", targetWorkoutId),
    programming.from("group_workout_exercises").delete().eq("group_workout_id", targetWorkoutId),
    programming.from("group_workouts").update({ title: source.title }).eq("id", targetWorkoutId),
  ]);
  if (delWarmups.error) throw delWarmups.error;
  if (delExercises.error) throw delExercises.error;
  if (titleUpdate.error) throw titleUpdate.error;

  if (warmups.length > 0) {
    const { error } = await programming.from("group_workout_warmups").insert(
      warmups.map((w) => ({
        group_workout_id: targetWorkoutId,
        exercise_id: w.exercise_id,
        position: w.position,
        label: w.label,
        sets: w.sets,
        reps: w.reps,
        notes: w.notes,
      }))
    );
    if (error) throw error;
  }

  if (exercises.length > 0) {
    const { error } = await programming.from("group_workout_exercises").insert(
      exercises.map((e) => ({
        group_workout_id: targetWorkoutId,
        exercise_id: e.exercise_id,
        position: e.position,
        sets: e.sets,
        reps: e.reps,
        rep_scheme: e.rep_scheme,
        superset_group_id: e.superset_group_id,
        tempo: e.tempo,
        notes: e.notes,
      }))
    );
    if (error) throw error;
  }
}

// Block-level copy for "start the new block from the last one" — pairs
// source and target group_workouts by identical (week, session) and runs
// the existing per-session copyWorkoutContent over each pair. Group's port
// of spcWorkouts.copyLastBlockContent; works because createBlock
// pre-creates every (week, session) row. Weeks the target doesn't have
// (shorter block) are skipped; extra target weeks stay blank. Copies land
// as whatever status the target rows already are (draft for a fresh
// block) — publishing stays a deliberate separate action.
export async function copyLastGroupBlockContent(fromBlockId, toBlockId) {
  const [{ data: fromWorkouts, error: fromError }, { data: toWorkouts, error: toError }] = await Promise.all([
    programming.from("group_workouts").select("id, week_number, session_number").eq("block_id", fromBlockId),
    programming.from("group_workouts").select("id, week_number, session_number").eq("block_id", toBlockId),
  ]);
  if (fromError) throw fromError;
  if (toError) throw toError;

  const fromByKey = new Map(fromWorkouts.map((w) => [`${w.week_number}:${w.session_number}`, w]));
  for (const target of toWorkouts) {
    const source = fromByKey.get(`${target.week_number}:${target.session_number}`);
    if (source) await copyWorkoutContent(source.id, target.id);
  }
}

export async function setWorkoutStatus(workoutId, status) {
  const { error } = await programming
    .from("group_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// Bulk publish/unpublish — one query for a whole week's (or block's) drafts
// instead of a builder round-trip per session. Publishing is instantly
// member-visible (member RLS gates on status = 'published'), so callers
// confirm with a count first.
export async function setWorkoutStatusBulk(workoutIds, status) {
  if (!workoutIds.length) return;
  const { error } = await programming
    .from("group_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", workoutIds);
  if (error) throw error;
}

export async function setWorkoutTitle(workoutId, title) {
  const { error } = await programming
    .from("group_workouts")
    .update({ title: title || null, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// --- Whole-session-across-a-block reads ---------------------------------
//
// Coach education (0079) is keyed to (block, session_number), so both the
// builder's dropdown and the Coach Prep page need to look at every week of
// one session at once rather than at a single workout.

// Programmed order, not alphabetical — the education dropdown should read
// down the session the way the session itself does.
//
// Sorted by (week, position, id) and deduped on first appearance, so the
// list is the earliest week's running order with anything introduced later
// in the block appended. The id tiebreak is deliberate: positions could
// collide before nextPosition() landed (see the warm-ups fix in 600f0d3), and
// a tie left to Postgres comes back in whatever order it feels like — which
// would reshuffle this dropdown between loads.
function inProgrammedOrder(rows, weekOf, fallbackLabel) {
  const ordered = [...rows].sort(
    (a, b) =>
      (weekOf(a) ?? 0) - (weekOf(b) ?? 0) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      String(a.id ?? "").localeCompare(String(b.id ?? ""))
  );
  const seen = new Map();
  for (const row of ordered) {
    const id = row.exercises?.id ?? row.exercise_id;
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, name: row.exercises?.name ?? fallbackLabel });
  }
  return [...seen.values()];
}

// The distinct library lifts programmed anywhere in this set of workouts —
// what the education dropdown offers. Deduped by exercise: the same lift
// appearing in five weeks of the same session is one thing to write about,
// not five.
export async function listDistinctLiftsForWorkouts(workoutIds) {
  if (!workoutIds.length) return [];
  const { data, error } = await programming
    .from("group_workout_exercises")
    .select("id, exercise_id, position, group_workouts(week_number), exercises(id, name)")
    .in("group_workout_id", workoutIds);
  if (error) throw error;
  return inProgrammedOrder(data, (r) => r.group_workouts?.week_number, "Unknown exercise");
}

// Full exercise rows for a set of workouts, grouped by workout — the lighter
// listWorkoutExercisesForWorkouts above returns names only and is still what
// the grids use.
// Warm-ups get their own list rather than being folded in with the lifts:
// the education dropdown separates them, and a coach scanning for "Glute
// Bridge" shouldn't have to hunt through the main session to find it.
//
// A warm-up saved as free text with no exercise row is skipped — education
// points at programming.exercises, so there'd be nothing to reference.
export async function listDistinctWarmupsForWorkouts(workoutIds) {
  if (!workoutIds.length) return [];
  const { data, error } = await programming
    .from("group_workout_warmups")
    .select("id, exercise_id, position, group_workouts(week_number), exercises(id, name)")
    .in("group_workout_id", workoutIds);
  if (error) throw error;
  return inProgrammedOrder(data, (r) => r.group_workouts?.week_number, "Unknown warm-up");
}

export async function listWorkoutExerciseRowsForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("group_workout_exercises")
    .select("*, exercises(id, name)")
    .in("group_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = {};
  for (const row of data) (byWorkout[row.group_workout_id] ??= []).push(row);
  return byWorkout;
}

export async function listWarmupsForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("group_workout_warmups")
    .select("group_workout_id, position, label, sets, reps, exercises(id, name)")
    .in("group_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = {};
  for (const row of data) (byWorkout[row.group_workout_id] ??= []).push(row);
  return byWorkout;
}
