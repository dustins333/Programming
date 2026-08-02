import { programming } from "../supabase/client";
import { getMostRecentLog } from "./exercises";
import { todayInBoise } from "../boiseDate";

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
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url), spc_exercise_weeks(*)")
    .eq("spc_workout_id", workoutId)
    .order("position");
  if (error) throw error;
  return data.map((row) => ({
    ...row,
    spc_exercise_weeks: [...row.spc_exercise_weeks].sort((a, b) => a.week_number - b.week_number),
  }));
}

// Inserts the base exercise row, then batch-inserts week 1..blockLengthWeeks
// rows. Week 1 is pre-filled from the client's most recent log for this
// exact exercise when one exists (spec: "pre-filled with the client's most
// recent log if one exists"), otherwise the 3x10 default — same fallback
// getMostRecentLog was written for in Phase 2 but never had a caller until
// now, since SPC blocks (unlike group blocks) have one determinate member.
export async function addSpcWorkoutExercise({ workoutId, exerciseId, position, blockLengthWeeks, userId, notes }) {
  const { data: exerciseRow, error: exerciseError } = await programming
    .from("spc_workout_exercises")
    .insert({ spc_workout_id: workoutId, exercise_id: exerciseId, position, notes: notes ?? null })
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url)")
    .single();
  if (exerciseError) throw exerciseError;

  const recentLog = userId ? await getMostRecentLog(userId, exerciseId) : null;
  const week1Sets = recentLog?.sets ?? 3;
  const week1Reps = recentLog ? String(recentLog.reps) : "10";

  const weekRows = [];
  for (let week = 1; week <= blockLengthWeeks; week += 1) {
    weekRows.push({
      spc_workout_exercise_id: exerciseRow.id,
      week_number: week,
      sets: week === 1 ? week1Sets : null,
      reps: week === 1 ? week1Reps : null,
      rest: null,
    });
  }
  const { data: weeks, error: weeksError } = await programming
    .from("spc_exercise_weeks")
    .insert(weekRows)
    .select("*");
  if (weeksError) throw weeksError;

  return { ...exerciseRow, spc_exercise_weeks: weeks.sort((a, b) => a.week_number - b.week_number) };
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
  await Promise.all(
    items.map((item) => programming.from("spc_workout_exercises").update({ position: item.position }).eq("id", item.id))
  );
}

// Batches exercise names for a whole set of spc_workouts (a client's block-
// creation grid) into one query, mirroring workouts.js's
// listWorkoutExercisesForWorkouts — the same exercises apply to every week
// row a workout appears in (SPC has no per-week workout rows, just
// per-week columns), so this doesn't need a week argument at all.
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

function initialsFor(name) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// Stamps coach_initials/touched_date alongside whatever sets/reps/rest field
// changed — this is what "tracking when it was last touched" means for the
// print template, not a manual-entry field.
export async function updateSpcExerciseWeek(id, fields, editorName) {
  const { error } = await programming
    .from("spc_exercise_weeks")
    .update({ ...fields, coach_initials: initialsFor(editorName), touched_date: todayInBoise() })
    .eq("id", id);
  if (error) throw error;
}

// SPC's equivalent of workouts.js's getSiblingPatterns — but scoped to the
// whole spc_block (all of this client's sessions), not a shared week, since
// SPC has no separate week_number per workout: one session recurs across
// every week of the block, with progression living in spc_exercise_weeks
// columns instead of separate rows. "This week's balance" for a group block
// is "this block's balance" here.
export async function getSpcSiblingPatterns(spcBlockId, excludeWorkoutId) {
  const { data: workouts, error } = await programming
    .from("spc_workouts")
    .select("id")
    .eq("spc_block_id", spcBlockId)
    .neq("id", excludeWorkoutId);
  if (error) throw error;

  const ids = workouts.map((w) => w.id);
  if (!ids.length) return [];

  const { data: rows, error: exError } = await programming
    .from("spc_workout_exercises")
    .select("exercises(movement_pattern)")
    .in("spc_workout_id", ids);
  if (exError) throw exError;

  return rows.map((r) => r.exercises?.movement_pattern).filter(Boolean);
}

export async function setSpcWorkoutStatus(workoutId, status) {
  const { error } = await programming
    .from("spc_workouts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

// Default title for this session slot, applying to every week of the
// block unless a specific week has its own override row (see below).
export async function setSpcWorkoutTitle(workoutId, title) {
  const { error } = await programming
    .from("spc_workouts")
    .update({ title: title || null, updated_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw error;
}

export async function getSpcWorkoutWeekTitles(workoutId) {
  const { data, error } = await programming
    .from("spc_workout_week_titles")
    .select("*")
    .eq("spc_workout_id", workoutId)
    .order("week_number");
  if (error) throw error;
  return data;
}

// Batches week-title overrides for a whole block's worth of workouts in
// one query, mirroring listSpcWorkoutExercisesForWorkouts — keyed by
// workout id then week number so callers can resolve
// override ?? defaultTitle ?? "Session N" per (workout, week) pair.
export async function listSpcWorkoutWeekTitlesForWorkouts(workoutIds) {
  if (!workoutIds.length) return {};
  const { data, error } = await programming
    .from("spc_workout_week_titles")
    .select("spc_workout_id, week_number, title")
    .in("spc_workout_id", workoutIds);
  if (error) throw error;
  const byWorkout = {};
  for (const row of data) {
    (byWorkout[row.spc_workout_id] ??= {})[row.week_number] = row.title;
  }
  return byWorkout;
}

// A blank title clears the override (falls back to the block-wide
// default) rather than storing an empty string row — an upsert, unlike
// the hand-rolled selects used for session_completions/logs, is safe here
// since spc_workout_week_titles has a real (non-partial) unique
// constraint that Postgres' ON CONFLICT can target directly.
export async function setSpcWorkoutWeekTitle(workoutId, weekNumber, title) {
  if (!title) {
    const { error } = await programming
      .from("spc_workout_week_titles")
      .delete()
      .eq("spc_workout_id", workoutId)
      .eq("week_number", weekNumber);
    if (error) throw error;
    return;
  }
  const { error } = await programming
    .from("spc_workout_week_titles")
    .upsert({ spc_workout_id: workoutId, week_number: weekNumber, title }, { onConflict: "spc_workout_id,week_number" });
  if (error) throw error;
}

// Shared by both copy paths below — inserts one exercise row on the target
// workout, then its spc_exercise_weeks rows copied verbatim (sets/reps/rest
// values included, not just week numbers). `sourceExercise` must already
// carry a `spc_exercise_weeks` array (see listSpcWorkoutExercises's shape).
async function copyExerciseWithWeeks(sourceExercise, toWorkoutId) {
  const { data: newExercise, error } = await programming
    .from("spc_workout_exercises")
    .insert({ spc_workout_id: toWorkoutId, exercise_id: sourceExercise.exercise_id, position: sourceExercise.position, notes: sourceExercise.notes })
    .select()
    .single();
  if (error) throw error;

  const weeks = sourceExercise.spc_exercise_weeks ?? [];
  if (weeks.length > 0) {
    const { error: weeksError } = await programming.from("spc_exercise_weeks").insert(
      weeks.map((w) => ({
        spc_workout_exercise_id: newExercise.id,
        week_number: w.week_number,
        sets: w.sets,
        reps: w.reps,
        rest: w.rest,
      }))
    );
    if (weeksError) throw weeksError;
  }
}

// "Copy Last Block" — copies warm-ups and exercises (position/notes) per
// matching session_number from the prior block into the new one, including
// each exercise's actual per-week sets/reps/rest — a full duplicate of the
// prior block's content, same as Group Programs' plain tile-to-tile copy.
// blockLengthWeeks is accepted for backward compatibility with existing
// callers but no longer drives week generation: whatever weeks the source
// exercise actually has are copied as-is, rather than regenerating a blank
// 1..N range.
export async function copyLastBlockContent(fromBlockId, toBlockId) {
  const [{ data: fromWorkouts, error: fromError }, { data: toWorkouts, error: toError }] = await Promise.all([
    programming.from("spc_workouts").select("id, session_number").eq("spc_block_id", fromBlockId),
    programming.from("spc_workouts").select("id, session_number").eq("spc_block_id", toBlockId),
  ]);
  if (fromError) throw fromError;
  if (toError) throw toError;

  for (const toWorkout of toWorkouts) {
    const fromWorkout = fromWorkouts.find((w) => w.session_number === toWorkout.session_number);
    if (!fromWorkout) continue;
    await copySpcWorkoutContent(fromWorkout.id, toWorkout.id);
  }
}

// Plain content copy between two specific spc_workout rows — the SPC
// equivalent of Group Programs' copyWorkoutContent, used by the calendar
// grid's ⧉ copy-mode flow (copying one populated tile into others). No live
// link afterward; overwrites whatever the target already had, same
// overwrite-confirm-first contract as the group version.
export async function copySpcWorkoutContent(fromWorkoutId, toWorkoutId) {
  const [warmups, exercises] = await Promise.all([listSpcWarmups(fromWorkoutId), listSpcWorkoutExercises(fromWorkoutId)]);

  const [delWarmups, delExercises] = await Promise.all([
    programming.from("spc_workout_warmups").delete().eq("spc_workout_id", toWorkoutId),
    programming.from("spc_workout_exercises").delete().eq("spc_workout_id", toWorkoutId),
  ]);
  if (delWarmups.error) throw delWarmups.error;
  if (delExercises.error) throw delExercises.error;

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

  for (const ex of exercises) {
    await copyExerciseWithWeeks(ex, toWorkoutId);
  }
}
