import { programming } from "../supabase/client";
import { getMostRecentLog } from "./exercises";

export async function getSpcWorkout(workoutId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("*, spc_blocks(id, spc_client_id, block_length_weeks)")
    .eq("id", workoutId)
    .single();
  if (error) throw error;
  return data;
}

export async function listSpcWarmups(workoutId) {
  const { data, error } = await programming
    .from("spc_workout_warmups")
    .select("*, exercises(id, name)")
    .eq("spc_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addSpcWarmup({ workoutId, exerciseId, position, label, sets, reps }) {
  const { data, error } = await programming
    .from("spc_workout_warmups")
    .insert({
      spc_workout_id: workoutId,
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

export async function updateSpcWarmup(id, fields) {
  const { error } = await programming.from("spc_workout_warmups").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeSpcWarmup(id) {
  const { error } = await programming.from("spc_workout_warmups").delete().eq("id", id);
  if (error) throw error;
}

export async function listSpcWorkoutExercises(workoutId) {
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight)")
    .eq("spc_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data;
}

// Prefills from the client's most recent log for this exact exercise when
// one exists (spec: "pre-filled with the client's most recent log if one
// exists"), otherwise the 3x10 default. Flat insert now — each week's
// exercise row is independent, so there's no per-week fan-out to generate
// the way the old recurring-session model needed.
export async function addSpcWorkoutExercise({ workoutId, exerciseId, position, userId, notes, defaultSets, defaultReps }) {
  const recentLog = userId ? await getMostRecentLog(userId, exerciseId) : null;
  // What this client actually did last beats the library's generic default,
  // which in turn beats the hardcoded 3x10 — most specific wins.
  const sets = recentLog?.sets ?? (defaultSets != null ? Number(defaultSets) : 3);
  // recentLog can be a real row with a null reps value (e.g. a set where
  // only weight got logged) — String(null) would silently insert the
  // literal text "null" instead of falling back to the default.
  const reps = recentLog?.reps != null ? String(recentLog.reps) : defaultReps || "10";

  const { data, error } = await programming
    .from("spc_workout_exercises")
    .insert({
      spc_workout_id: workoutId,
      exercise_id: exerciseId,
      position,
      sets,
      reps,
      rep_scheme: Array(sets).fill(reps),
      notes: notes ?? null,
    })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSpcWorkoutExercise(id, fields) {
  const { error } = await programming.from("spc_workout_exercises").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeSpcWorkoutExercise(id) {
  const { error } = await programming.from("spc_workout_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderSpcWorkoutExercises(items) {
  const results = await Promise.all(
    items.map((item) => programming.from("spc_workout_exercises").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}

// Batches exercise names for a whole set of spc_workouts (a client's block
// grid) into one query, mirroring workouts.js's listWorkoutExercisesForWorkouts.
export async function listSpcWorkoutExercisesForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("spc_workout_exercises")
    .select("spc_workout_id, position, exercises(name)")
    .in("spc_workout_id", workoutIds)
    .order("position");
  if (error) throw error;
  const byWorkout = {};
  for (const row of data) {
    (byWorkout[row.spc_workout_id] ??= []).push(row.exercises?.name ?? "Unknown exercise");
  }
  return byWorkout;
}

// Scoped to the whole week (all sessions that week), not the whole block —
// same as workouts.js's getSiblingLifts, now that SPC has a real
// week_number per row like group does. Returns [{ name, patterns }], same
// shape as the group side, so the tally can name each bubble's lifts on
// hover rather than only counting them.
export async function getSpcSiblingLifts(spcBlockId, weekNumber, excludeWorkoutId) {
  const { data: workouts, error } = await programming
    .from("spc_workouts")
    .select("id")
    .eq("spc_block_id", spcBlockId)
    .eq("week_number", weekNumber)
    .neq("id", excludeWorkoutId);
  if (error) throw error;

  const ids = workouts.map((w) => w.id);
  if (!ids.length) return [];

  const { data: rows, error: exError } = await programming
    .from("spc_workout_exercises")
    .select("exercises(name, movement_pattern)")
    .in("spc_workout_id", ids);
  if (exError) throw exError;

  return rows.map((r) => ({ name: r.exercises?.name ?? "Unknown exercise", patterns: r.exercises?.movement_pattern ?? [] }));
}

// The same session, one week earlier — the SPC counterpart of workouts.js's
// getSameSessionLastWeek. Only meaningful since 0016 gave SPC a real
// week_number per row; under the old recurring-session model there was only
// ever one row per session_number for the whole block.
export async function getSpcSameSessionLastWeek(spcBlockId, weekNumber, sessionNumber) {
  if (!weekNumber || weekNumber <= 1) return null;
  const { data: workout, error } = await programming
    .from("spc_workouts")
    .select("id, week_number, session_number, title")
    .eq("spc_block_id", spcBlockId)
    .eq("week_number", weekNumber - 1)
    .eq("session_number", sessionNumber)
    .maybeSingle();
  if (error) throw error;
  if (!workout) return null;

  const { data: lifts, error: liftsError } = await programming
    .from("spc_workout_exercises")
    .select("id, sets, reps, rep_scheme, position, exercises(name)")
    .eq("spc_workout_id", workout.id)
    .order("position");
  if (liftsError) throw liftsError;

  return { workout, lifts };
}

export async function setSpcWorkoutStatus(workoutId, status) {
  const { error } = await programming
    .from("spc_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// Bulk counterpart, mirroring workouts.js's setWorkoutStatusBulk — see the
// note there about member visibility.
export async function setSpcWorkoutStatusBulk(workoutIds, status) {
  if (!workoutIds.length) return;
  const { error } = await programming
    .from("spc_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", workoutIds);
  if (error) throw error;
}

export async function setSpcWorkoutTitle(workoutId, title) {
  const { error } = await programming
    .from("spc_workouts")
    .update({ title: title || null, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// Plain content copy between two specific spc_workout rows — the SPC
// equivalent of Group Programs' copyWorkoutContent, used by both the
// calendar grid's ⧉ copy-mode flow and copyLastBlockContent below. No live
// link afterward; overwrites whatever the target already had.
export async function copySpcWorkoutContent(fromWorkoutId, toWorkoutId) {
  const [warmups, exercises, { data: source, error: sourceError }] = await Promise.all([
    listSpcWarmups(fromWorkoutId),
    listSpcWorkoutExercises(fromWorkoutId),
    programming.from("spc_workouts").select("title").eq("id", fromWorkoutId).single(),
  ]);
  if (sourceError) throw sourceError;

  const [delWarmups, delExercises, titleUpdate] = await Promise.all([
    programming.from("spc_workout_warmups").delete().eq("spc_workout_id", toWorkoutId),
    programming.from("spc_workout_exercises").delete().eq("spc_workout_id", toWorkoutId),
    programming.from("spc_workouts").update({ title: source.title }).eq("id", toWorkoutId),
  ]);
  if (delWarmups.error) throw delWarmups.error;
  if (delExercises.error) throw delExercises.error;
  if (titleUpdate.error) throw titleUpdate.error;

  if (warmups.length > 0) {
    const { error } = await programming.from("spc_workout_warmups").insert(
      warmups.map((w) => ({
        spc_workout_id: toWorkoutId,
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
    const { error } = await programming.from("spc_workout_exercises").insert(
      exercises.map((e) => ({
        spc_workout_id: toWorkoutId,
        exercise_id: e.exercise_id,
        position: e.position,
        sets: e.sets,
        reps: e.reps,
        rep_scheme: e.rep_scheme,
        superset_group_id: e.superset_group_id,
        rest: e.rest,
        tempo: e.tempo,
        notes: e.notes,
      }))
    );
    if (error) throw error;
  }
}

// "Copy Last Block" — copies each (week, session) cell's content into the
// matching (week, session) cell of the new block. If the new block is a
// different length than the old one, only the weeks that exist in both get
// copied; anything past that is left blank rather than guessed at.
export async function copyLastBlockContent(fromBlockId, toBlockId) {
  const [{ data: fromWorkouts, error: fromError }, { data: toWorkouts, error: toError }] = await Promise.all([
    programming.from("spc_workouts").select("id, week_number, session_number").eq("spc_block_id", fromBlockId),
    programming.from("spc_workouts").select("id, week_number, session_number").eq("spc_block_id", toBlockId),
  ]);
  if (fromError) throw fromError;
  if (toError) throw toError;

  for (const toWorkout of toWorkouts) {
    const fromWorkout = fromWorkouts.find(
      (w) => w.week_number === toWorkout.week_number && w.session_number === toWorkout.session_number
    );
    if (!fromWorkout) continue;
    await copySpcWorkoutContent(fromWorkout.id, toWorkout.id);
  }
}
